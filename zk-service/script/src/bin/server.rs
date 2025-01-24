use actix_web::{web, App, HttpServer, Responder};
use aligned_sdk::core::types::{Network, PriceEstimate, ProvingSystemId, VerificationData};
use aligned_sdk::sdk::{deposit_to_aligned, estimate_fee, get_payment_service_address};
use aligned_sdk::sdk::{get_next_nonce, submit_and_wait_verification};
use dotenv::dotenv;
use ethers::middleware::SignerMiddleware;
use ethers::types::U256;
use ethers::utils::hex;
use ethers::{
    providers::{Http, Middleware, Provider},
    signers::{LocalWallet, Signer},
};
use serde::{Deserialize, Serialize};
use sp1_sdk::{utils, ProverClient, SP1Stdin};
use std::convert::TryFrom;
use std::env;
use std::fs;
use std::sync::Mutex;

const BATCHER_URL: &str = "wss://batcher.alignedlayer.com";
const NETWORK: Network = Network::Holesky;
// Struct to hold the game state
struct AppState {
    secret: Mutex<Option<u32>>,
}

#[derive(Serialize, Deserialize, Debug, PartialEq)]
struct SecretData {
    secret: u32,
}

#[derive(Serialize, Deserialize, Debug, PartialEq)]
struct UserGuess {
    guess: u32,
}

#[derive(Serialize, Deserialize, Debug, PartialEq)]
struct ResponseData {
    pub guess: u32,
    pub b: bool,
}

#[derive(Serialize)]
struct Response {
    success: bool,
    message: String,
    proof_verified: bool,
    on_chain_verified: bool,
}

async fn set_secret(data: web::Json<SecretData>, state: web::Data<AppState>) -> impl Responder {
    let mut secret = state.secret.lock().unwrap();
    *secret = Some(data.secret);
    web::Json(Response {
        success: true,
        message: "Secret set successfully".to_string(),
        proof_verified: false,
        on_chain_verified: false,
    })
}

// Helper function for local proof generation and verification
async fn generate_and_verify_local(
    user_guess: u32,
    secret: u32,
) -> Result<(bool, ResponseData, sp1_sdk::SP1ProofWithPublicValues), actix_web::Error> {
    utils::setup_logger();

    println!(
        "Number of bugs guessed: {:?}, Secret: {}",
        user_guess, secret
    );

    let mut stdin = SP1Stdin::new();
    stdin.write(&user_guess);
    stdin.write(&secret);

    let elf_path = format!("../program/elf/riscv32im-succinct-zkvm-elf");
    let elf = fs::read(&elf_path).map_err(|e| {
        actix_web::error::ErrorInternalServerError(format!("Failed to read ELF file: {}", e))
    })?;

    println!("Setting up Prover Client with elf path-{}", elf_path);
    let client = ProverClient::new();
    let (pk, vk) = client.setup(&elf);

    println!("Generating proof...");
    let mut proof: sp1_sdk::SP1ProofWithPublicValues = client.prove(&pk, stdin).run().unwrap();

    let r = proof.public_values.read::<ResponseData>();
    println!("r: {:?}", r);

    Ok((true, r, proof))
}

// Local verification only
async fn verify_guess_local(
    guess: web::Json<UserGuess>,
    state: web::Data<AppState>,
) -> Result<impl Responder, actix_web::Error> {
    let secret = state.secret.lock().unwrap().clone();

    println!("Verifying locally...");
    match secret {
        None => Ok(web::Json(Response {
            success: false,
            message: "No secret has been set. Please set a secret first.".to_string(),
            proof_verified: false,
            on_chain_verified: false,
        })),
        Some(secret) => {
            let (proof_success, r, __) = generate_and_verify_local(guess.guess, secret).await?;

            Ok(web::Json(Response {
                success: r.b,
                message: if r.b {
                    format!(
                        "Congratulations! Your guess of {} bugs is correct!",
                        guess.guess
                    )
                } else {
                    format!("Incorrect guess: {}", guess.guess)
                },
                proof_verified: proof_success,
                on_chain_verified: false,
            }))
        }
    }
}

// Full verification including on-chain
async fn verify_guess_full(
    guess: web::Json<UserGuess>,
    state: web::Data<AppState>,
) -> Result<impl Responder, actix_web::Error> {
    dotenv().ok();
    let secret = state.secret.lock().unwrap().clone();

    match secret {
        None => Ok(web::Json(Response {
            success: false,
            message: "No secret has been set. Please set a secret first.".to_string(),
            proof_verified: false,
            on_chain_verified: false,
        })),
        Some(secret) => {
            let (proof_success, r, proof) = generate_and_verify_local(guess.guess, secret).await?;

            // Only proceed with on-chain verification if the local proof is successful and correct
            if proof_success && r.b {
                // On-chain verification
                let rpc_url: String = env::var("RPC_URL").expect("RPC_URL not set");
                println!("RPC URL: {}", rpc_url);

                let provider =
                    Provider::<Http>::try_from(rpc_url.clone()).expect("Failed to create provider");
                let chain_id = provider
                    .get_chainid()
                    .await
                    .expect("Failed to get chain_id");

                let wallet: LocalWallet = env::var("PRIVATE_KEY")
                    .expect("PRIVATE_KEY not set")
                    .parse::<LocalWallet>()
                    .expect("Failed to parse the wallet")
                    .with_chain_id(chain_id.as_u64());

                let signer = SignerMiddleware::new(provider.clone(), wallet.clone());

                // Just call once to have sufficient balance
                // deposit_to_aligned(
                //     U256::from(4000000000000000u128), // 0.004 ETH in wei
                //     signer.clone(),
                //     NETWORK,
                // )
                // .await
                // .expect("Failed to pay for proof submission");

                println!("Wallet: {:?}", wallet);
                let elf_path = format!("../program/elf/riscv32im-succinct-zkvm-elf");
                let elf = fs::read(&elf_path)?;

                let proof = bincode::serialize(&proof).expect("Failed to serialize proof");
                let verification_data = VerificationData {
                    proving_system: ProvingSystemId::SP1,
                    proof,
                    proof_generator_addr: wallet.address(),
                    vm_program_code: Some(elf.to_vec()),
                    verification_key: None,
                    pub_input: None,
                };

                let rpc_str: &str = &rpc_url;

                let mut max_fee = estimate_fee(&rpc_str, PriceEstimate::Instant)
                    .await
                    .expect("Failed to estimate fee");
                max_fee *= 2;
                let nonce: U256 = get_next_nonce(&rpc_url, wallet.address(), NETWORK)
                    .await
                    .expect("Failed to get nonce");

                println!("Max fee: {}, Nonce: {}", max_fee, nonce);

                let aligned_verification_data = submit_and_wait_verification(
                    BATCHER_URL,
                    &rpc_url,
                    NETWORK,
                    &verification_data,
                    max_fee,
                    wallet.clone(),
                    nonce,
                )
                .await
                .unwrap();

                println!(
                    "Proof submitted and verified successfully on batch {}",
                    hex::encode(aligned_verification_data.batch_merkle_root)
                );
                Ok(web::Json(Response {
                    success: true,
                    message: format!(
                        "Congratulations! Your guess of {} bugs is correct and verified on-chain!",
                        guess.guess
                    ),
                    proof_verified: true,
                    on_chain_verified: true,
                }))
            } else {
                Ok(web::Json(Response {
                    success: false,
                    message: format!("Incorrect guess: {}", guess.guess),
                    proof_verified: proof_success,
                    on_chain_verified: false,
                }))
            }
        }
    }
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // Get port from environment variable or use default
    let port = env::var("PORT")
        .unwrap_or_else(|_| "8000".to_string())
        .parse::<u16>()
        .expect("PORT must be a number");

    // Get host from environment or use default
    let host = env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string());

    println!("Starting server at {}:{}", host, port);

    HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(AppState {
                secret: Mutex::new(None),
            }))
            .route("/set-secret", web::post().to(set_secret))
            .route("/verify-guess/local", web::post().to(verify_guess_local))
            .route("/verify-guess/full", web::post().to(verify_guess_full))
            // Add a health check endpoint
            .route("/health", web::get().to(|| async { "OK" }))
    })
    .bind(format!("{}:{}", host, port))?
    .run()
    .await
}
