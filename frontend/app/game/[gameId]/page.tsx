"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import CountdownTimer from "@/components/CountdownTimer";
import GridGame from "@/components/GridGame";
import { useAccount } from "wagmi";
import { useParams, useRouter } from "next/navigation";
import { useGameInitialization } from "@/hooks/useGameInitialization";
import { useGameStatePolling } from "@/hooks/useGameStatePolling";
import { useRemainingTime } from "@/hooks/useRemainingTime";
import { LoadingComponent } from "@/components/LoadingComponent";
import { useEffect, useState } from "react";
import {
  ApiError,
  GameSummary,
  LevelStat,
  Position,
  RoundSummary,
} from "@/types/game";
import { useToast } from "@/hooks/use-toast";
import {
  cleanupGameListeners,
  clickCell,
  endGame,
  endGameWithFullVerification,
  endLevel,
  getPlayerStats,
  initializeSocket,
  setupGameCompleteListener,
  setupLevelEndListener,
  setupRoundCompleteListener,
  waitForValidState,
} from "@/lib/api";
import IsometricGrid from "@/components/IsometricGrid";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useGameCreation } from "@/hooks/useGameCreation";
import { SwishSpinner } from "@/components/SwishSpinner";
import Cookies from "js-cookie";
// import RoundSummaryComponent from "@/components/RoundSummaryComponent";
import { Button } from "@/components/ui/button";
import { calculateDisplayStats } from "@/lib/utils";

export default function GamePage() {
  const router = useRouter();

  const { startGuestGame, startWeb3Game, isLoading } = useGameCreation();
  const { gameId } = useParams() as { gameId: string };
  const { address } = useAccount();
  const { toast } = useToast();

  // Basic State
  const [gamesPlayed, setGamesPlayed] = useState(0);
  const [resultBugs, setResultBugs] = useState(0);
  const [verificationInProg, setVerificationInProg] = useState(false);
  const [proofIsVerified, setProofIsVerified] = useState(true);
  const [endType, setEndType] = useState("manual");
  const [isFullVerifying, setIsFullVerifying] = useState(false);
  const [fullVerificationResult, setFullVerificationResult] = useState<{
    success?: boolean;
    onChainVerified?: boolean;
    contractTxHash?: string;
  } | null>(null);
  const [playerIdentifier, setPlayerIdentifier] = useState<string>("");
  const [isEnding, setIsEnding] = useState(false);
  const [playerIsGuest, setPlayerIsGuest] = useState(false);

  // Game State Management
  const [currentGameState, setCurrentGameState] = useState<string | null>(null);
  const [validActions, setValidActions] = useState<string[]>([]);
  const [showLevelSummary, setShowLevelSummary] = useState(false);
  const [currentRound, setCurrentRound] = useState(1);
  const [currentLevel, setCurrentLevel] = useState(1);
  const [levelStats, setLevelStats] = useState<LevelStat>();
  const [roundStats, setRoundStats] = useState<{
    totalScore: number;
    accuracy: number;
  }>();
  const [roundHasEnded, setRoundHasEnded] = useState(false);
  const [showRoundSummary, setShowRoundSummary] = useState(false);
  const [gameHasEnded, setGameHasEnded] = useState(false);

  const [showGameComplete, setShowGameComplete] = useState(false);
  // Initialize playerIdentifier on mount
  useEffect(() => {
    const guestId = Cookies.get("guestId");
    if (address) {
      setPlayerIdentifier(address);
    } else if (guestId) {
      setPlayerIdentifier(guestId);
      setPlayerIsGuest(true);
    }
  }, [address]);

  // Game initialization and state polling
  const {
    gameConfig,
    error: initError,
    initializeGame,
    initializeNewGame,
    initializeLevel,
    currentState,
  } = useGameInitialization(playerIdentifier, gameId);

  const { gameState } = useGameStatePolling(playerIdentifier!, gameId);
  // console.log(`Game state from page: ${JSON.stringify(gameState)}`);
  const remainingTime = useRemainingTime(
    gameConfig?.startTime,
    gameConfig?.duration
  );

  // Initialize game on mount
  useEffect(() => {
    if (playerIdentifier) {
      initializeGame();
    }
  }, [playerIdentifier]);

  // Stats fetching
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const stats = await getPlayerStats(playerIdentifier);
        setGamesPlayed(stats.gamesPlayed);
      } catch (err) {
        console.error(err);
      }
    };

    if (playerIdentifier) {
      fetchStats();
    }
  }, [playerIdentifier, gameId]);

  // Setup socket listeners
  useEffect(() => {
    const socket = initializeSocket();

    socket.on("gameState", (data) => {
      setCurrentGameState(data.state);
      setValidActions(data.validActions);
      // console.log(`Game state updated: ${data.state}`);
      // console.log(`Valid actions: ${data.validActions.join(", ")}`);
    });

    socket.on("stateChanged", (data) => {
      setCurrentGameState(data.newState);
      setValidActions(data.validActions);

      if (data.newState === "LEVEL_ENDED") {
        setShowLevelSummary(true);
      } else if (data.newState === "ROUND_COMPLETE") {
        setRoundHasEnded(true);
        setShowRoundSummary(true);
      }
    });

    setupLevelEndListener(gameId, async (data) => {
      // console.log("Level end data received:", JSON.stringify(data));
      const { state, validActions, isRoundComplete, isGameComplete } = data;

      if (isGameComplete) {
        setShowGameComplete(true);
      } else if (isRoundComplete) {
        setShowRoundSummary(true);
      } else {
        setShowLevelSummary(true);
      }

      // Additional state handling based on the response
      if (data.result) {
        setLevelStats(data.result);
      }
    });

    setupRoundCompleteListener(gameId, (data: RoundSummary) => {
      // console.log(
      //   "[useEffect setupRoundCompleteListener] Round end data received:",
      //   JSON.stringify(data)
      // );

      setShowLevelSummary(true);
      setShowRoundSummary(true);

      const displayStats = calculateDisplayStats(
        data.totalScore,
        data.roundStats.levels
      );
      setRoundStats(displayStats);
    });

    setupGameCompleteListener(gameId, (data: GameSummary) => {
      setShowLevelSummary(true);
      setShowRoundSummary(true);

      const displayStats = calculateDisplayStats(
        data.finalScore,
        data.gameStats
      );

      setGameHasEnded(true);

      setRoundStats(displayStats);

      // setVerificationInProg(data.result.verificationInProgress);
      // setEndType(data.result.endType);
      // setProofIsVerified(data.result.proofVerified);
      // setResultBugs(data.result.bugsFound);
    });

    return () => {
      cleanupGameListeners(gameId);
      // socket.off("gameState");
      // socket.off("stateChanged");
      // socket.off("levelEnded");
    };
  }, [gameId]);

  // console.log(`gameHasEnded: ${gameHasEnded}`);
  const handleEndLevel = async () => {
    if (!playerIdentifier || !gameId) return;

    if (!validActions.includes("endLevel")) {
      toast({
        variant: "destructive",
        title: "Invalid Action",
        description: "Cannot end level in current state",
      });
      return;
    }

    try {
      setIsEnding(true);
      const result = await endLevel(gameId, playerIdentifier);
      // console.log("Level end result:", result);
    } catch (error: any) {
      if (error instanceof ApiError && error.code === "INVALID_STATE") {
        toast({
          variant: "destructive",
          title: "Invalid State",
          description: `Expected states: ${error.expectedStates?.join(", ")}`,
        });
        // Optionally wait for valid state
        // try {
        //   await waitForValidState("LEVEL_STARTED");
        //   await handleEndLevel();
        // } catch (waitError) {
        //   console.error("Error waiting for valid state:", waitError);
        // }
      } else {
        console.error("Error ending level:", error);
        toast({
          variant: "destructive",
          title: "Failed to end level",
          description: error?.response?.data?.error || "Please try again",
        });
      }
    } finally {
      setIsEnding(false);
    }
  };

  const handleContinueToNextRound = async () => {
    try {
      if (currentGameState !== "ROUND_COMPLETE") {
        await waitForValidState("ROUND_COMPLETE");
      }

      setShowRoundSummary(false);
      setRoundHasEnded(false);
      setShowLevelSummary(false);
      setRoundStats({ totalScore: 0, accuracy: 0 });
      setIsEnding(false);
      await initializeNewGame();
    } catch (error) {
      console.error("Error starting new round:", error);
      toast({
        variant: "destructive",
        title: "Failed to start new round",
        description: "Please try again",
      });
    }
  };

  const handleContinueToNextLevel = async () => {
    try {
      if (currentGameState !== "LEVEL_ENDED") {
        await waitForValidState("LEVEL_ENDED");
      }

      setShowRoundSummary(false);
      setShowLevelSummary(false);
      setIsEnding(false);
      await initializeLevel();
    } catch (error) {
      console.error("Error starting next level:", error);
      toast({
        variant: "destructive",
        title: "Failed to start next level",
        description: "Please try again",
      });
    }
  };

  const handleCellReveal = async (position: Position) => {
    if (!playerIdentifier || !gameId) return;
    if (!validActions.includes("handleClick")) {
      toast({
        variant: "destructive",
        title: "Invalid Action",
        description: "Cannot click cells in current state",
      });
      return;
    }

    try {
      await clickCell(gameId, position, playerIdentifier);
    } catch (error: any) {
      if (error instanceof ApiError && error.code === "INVALID_STATE") {
        toast({
          variant: "destructive",
          title: "Invalid State",
          description: `Expected state: LEVEL_STARTED`,
        });
      } else {
        console.error("Error revealing cell:", error);
        toast({
          variant: "destructive",
          title: "Failed to reveal cell",
          description: error?.response?.data?.error || "Please try again",
        });
      }
    }
  };

  const handleFullVerification = async () => {
    if (!address || !gameId) {
      toast({
        variant: "destructive",
        title: "Wallet Required",
        description: "On-chain verification requires a connected wallet",
      });
      return;
    }

    try {
      setIsFullVerifying(true);
      const result = await endGameWithFullVerification(gameId, address);
      setFullVerificationResult(result);
    } catch (error: any) {
      console.error("Error in full verification:", error);
      toast({
        variant: "destructive",
        title: "Full verification failed",
        description: error?.response?.data?.error || "Please try again",
      });
    } finally {
      setIsFullVerifying(false);
    }
  };

  if (!gameConfig) {
    return (
      <div className="h-[100vh] flex items-center">
        <SwishSpinner />
      </div>
    );
  }

  if (initError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <p className="text-red-500 mb-4">{initError}</p>
        <button
          onClick={() => (window.location.href = "/")}
          className="px-4 py-2 btn-primary"
        >
          Return Home
        </button>
      </div>
    );
  }

  return (
    <main className="flex flex-col items-center justify-center">
      <div className="w-full p-4 flex justify-between items-center">
        <ConnectButton showBalance={false} />
      </div>

      {/* Game Content */}
      {gameConfig && (
        <div className="relative">
          <div className="w-max flex gap-4 absolute left-[146px] top-[6px]">
            <div className="text-center text-4xl text-[#6123ff] flex flex-col">
              <p className="text-xs leading-none">Epoch:</p>
              <p className="font-bold leading-none">
                {gameState?.currentRound}
              </p>
            </div>
            <div className="border border-[#6123ff]"></div>
            <div className="text-center text-4xl text-[#6123ff] flex flex-col">
              <p className="text-xs leading-none">Block No.:</p>
              <p className="font-bold leading-none">
                {gameState?.currentLevel}
              </p>
            </div>
          </div>

          {/* <div className="w-full bottom-3 absolute justify-center text-center text-[#6123ff]">
            <div>
              <button
                onClick={handleEndLevel}
                disabled={isEnding || !gameState?.isEnded}
                className="font-bold! text-lg hover:text-white hover:drop-shadow-[0px_0px_5px_#6123ff] px-10 leading-none"
              >
                Verify my Guess &rsaquo;
              </button>
            </div>
          </div> */}

          <CountdownTimer
            remainingTime={remainingTime.remainingTime}
            onTimerEnd={() => {}}
            isRunning={gameState ? !gameState.isEnded : false}
          />

          <IsometricGrid
            gridSize={7}
            squareSize={26}
            startTime={gameConfig.startTime}
            totalTime={gameConfig.duration}
            remainingTime={remainingTime.remainingTime}
            updateInterval={1}
            className=""
          />
          <div className="bg-[url('/grid-bg.png')] bg-contain bg-center bg-no-repeat px-20 pt-32 pb-20">
            <GridGame
              gridSize={gameConfig.gridSize}
              onCellReveal={handleCellReveal}
              enemyPositions={gameConfig.bugs}
              gameId={gameId}
              address={address!}
            />
          </div>
        </div>
      )}

      {/* Level End Dialog */}
      <AlertDialog open={showLevelSummary}>
        <AlertDialogContent className="bg-[#161525] border-2 border-[#5b23d4] w-1/3">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-bold mb-4 flex justify-center">
              {endType === "manual" ? "Level ended" : "Time's up!"}
            </AlertDialogTitle>

            <AlertDialogDescription className="text-lg text-center">
              <span className=" my-2">
                You found{" "}
                <span className="text-[#5cffb1]">
                  {levelStats?.bugsFound || 0}{" "}
                  {levelStats?.bugsFound === 1 ? " bug" : " bugs"}
                </span>
              </span>
              <br />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="text-center border-t pt-5">
            {showRoundSummary && (
              <>
                <h2 className="text-2xl font-bold mb-4 ">Epoch Stats</h2>
                <div>
                  <span>
                    Total Score:{" "}
                    <span className="text-[#5cffb1] font-bold">
                      {JSON.stringify(roundStats?.totalScore)}
                    </span>
                  </span>
                  <br />
                  <span>
                    Accuracy:{" "}
                    <span className="text-[#5cffb1] font-bold">
                      {JSON.stringify(roundStats?.accuracy)}
                    </span>
                  </span>
                </div>
                {verificationInProg ? (
                  <>
                    <span>Verifying locally...</span>

                    <SwishSpinner />
                  </>
                ) : proofIsVerified ? (
                  <>
                    {/* <span className="text-[#5cffb1]">You got all the bugs!</span> */}
                    {!isFullVerifying && !fullVerificationResult && (
                      <div className="mt-4">
                        <button
                          onClick={handleFullVerification}
                          className="bg-[#5b23d4]/50 text-white/50 inset-0  transition-colors rounded-md text-sm font-medium h-10 px-4 py-2"
                          // disabled={isFullVerifying}
                          disabled
                        >
                          Verify On-Chain*
                        </button>
                        <p className="text-xs py-2">
                          *This could take over a few minutes
                        </p>
                      </div>
                    )}
                    {/* {levelStats?.bugsFound == levelStats?.totalBugs ? (
                  <span className="text-[#5cffb1]">You got all the bugs!</span>
                ) : (
                  <span className="text-[#ff006e]">
                    You didn't get all the bugs :(
                  </span>
                )} */}

                    {isFullVerifying && (
                      <>
                        <div className="mt-2">Verifying on-chain...</div>
                        <SwishSpinner />
                      </>
                    )}
                    {fullVerificationResult && (
                      <div className="mt-2">
                        {fullVerificationResult.success ? (
                          <span className="text-[#5cffb1]">
                            Verified on-chain successfully!
                          </span>
                        ) : (
                          <span className="text-[#ff006e]">
                            On-chain verification failed
                          </span>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <span className="text-[#ff006e]">
                    You didn't get all the bugs :(
                  </span>
                )}
              </>
            )}
          </div>
          {roundHasEnded ? (
            <>
              {/* <Button onClick={() => setShowRoundSummary(true)}>
                Show Epoch Stats
              </Button> */}

              <AlertDialogFooter className="m-auto">
                <AlertDialogAction
                  className="bg-[#beb8db] text-[#5b23d4] hover:bg-transparent hover:border hover:border-[#5b23d4]"
                  onClick={() => {
                    if (gameHasEnded) {
                      router.push("/");
                    } else {
                      handleContinueToNextRound();
                    }
                  }}
                  disabled={verificationInProg || isFullVerifying}
                >
                  {isLoading
                    ? "Starting..."
                    : gameHasEnded
                    ? "Back to Home"
                    : "Next Epoch ›"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : (
            <AlertDialogFooter className="m-auto">
              <AlertDialogAction
                className="bg-[#beb8db] text-[#5b23d4] hover:bg-transparent hover:border hover:border-[#5b23d4]"
                onClick={() => {
                  if (gameHasEnded) {
                    router.push("/");
                  } else {
                    handleContinueToNextLevel();
                  }
                }}
                disabled={verificationInProg || isFullVerifying}
              >
                {isLoading
                  ? "Starting..."
                  : gameHasEnded
                  ? "Back to Home"
                  : "Next Block ›"}
              </AlertDialogAction>
            </AlertDialogFooter>
          )}
        </AlertDialogContent>
      </AlertDialog>
      {/* Round Summary Dialog */}

      {/* {showRoundSummary && (
        <RoundSummaryComponent
          roundStats={roundStats}
          onContinue={handleContinueToNextRound}
        />
      )} */}
    </main>
  );
}
