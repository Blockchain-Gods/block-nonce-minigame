"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import CountdownTimer from "@/components/CountdownTimer";
import GridGame from "@/components/GridGame";
import { useAccount } from "wagmi";
import { useParams } from "next/navigation";
import { useGameInitialization } from "@/hooks/useGameInitialization";
import { useGameStatePolling } from "@/hooks/useGameStatePolling";
import { useRemainingTime } from "@/hooks/useRemainingTime";
import { LoadingComponent } from "@/components/LoadingComponent";
import { useEffect, useState } from "react";
import { LevelStat, Position } from "@/types/game";
import { useToast } from "@/hooks/use-toast";
import {
  cleanupGameListeners,
  clickCell,
  endGame,
  endGameWithFullVerification,
  endLevel,
  getPlayerStats,
  initializeSocket,
  setupGameEndListener,
  setupLevelEndListener,
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
import RoundSummary from "@/components/RoundSummary";
import { Button } from "@/components/ui/button";

export default function GamePage() {
  const { startGuestGame, startWeb3Game, isLoading } = useGameCreation();
  const { gameId } = useParams() as { gameId: string };
  const { address } = useAccount();
  const { toast } = useToast();

  // State
  const [gamesPlayed, setGamesPlayed] = useState(0);
  const [resultBugs, setResultBugs] = useState(0);
  // const [playerGotAllBugs, setPlayerGotAllBugs] = useState(false);
  const [verificationInProg, setVerificationInProg] = useState(false);
  const [proofIsVerified, setProofIsVerified] = useState(true); // TODO: change after actual implementation
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
  const [showLevelSummary, setShowLevelSummary] = useState(false);

  // New round-related state
  const [currentRound, setCurrentRound] = useState(1);
  const [currentLevel, setCurrentLevel] = useState(1);
  const [levelStats, setLevelStats] = useState<LevelStat>();
  const [roundStats, setRoundStats] = useState<LevelStat[]>([]);
  const [roundHasEnded, setRoundHasEnded] = useState(false);
  const [showRoundSummary, setShowRoundSummary] = useState(false);

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
    initializeLevel,
  } = useGameInitialization(playerIdentifier, gameId);

  const { gameState } = useGameStatePolling(playerIdentifier!, gameId);
  // console.log(`Game state from page: ${JSON.stringify(gameState)}`);
  const remainingTime = useRemainingTime(
    gameConfig?.startTime,
    gameConfig?.duration
  );

  // Initialize game on mount
  useEffect(() => {
    console.log(`Player identifier:: ${playerIdentifier}`);
    if (playerIdentifier) {
      initializeGame();
    } else {
      console.log("Could not initialize game");
    }
  }, [playerIdentifier]);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const stats = await getPlayerStats(playerIdentifier);
        // console.log(`Stats: ${JSON.stringify(stats)}`);
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
    initializeSocket();
    // Setup level end listener
    setupLevelEndListener(gameId, (data) => {
      if (!data || !data.result) {
        console.error("Invalid level end data received");
        return;
      }
      // console.log(`Level data: \n${JSON.stringify(data)}`);
      // console.log(`Current Round from useEffect: ${JSON.stringify(data)}`);
      const { result, roundComplete } = data;
      setLevelStats(result);
      setShowLevelSummary(true);
      setIsEnding(true);
      if (roundComplete) {
        console.log("Round complete");
        setRoundHasEnded(true);
        // TODO: Use data from server
        // setCurrentRound((prev) => prev + 1);
        // setCurrentLevel(1);
      } else {
        console.log("Level complete");
        // TODO: Use data from server
        // setCurrentLevel((prev) => prev + 1);
      }

      setRoundStats((prev) => [...prev, result]);
    });

    // Setup game end listener
    setupGameEndListener(gameId, (data) => {
      // console.log(`Game end data: ${JSON.stringify(data)}`);
      setVerificationInProg(data.result.verificationInProgress);
      setEndType(data.result.endType);
      setProofIsVerified(data.result.proofVerified);
      setResultBugs(data.result.bugsFound);
    });

    return () => {
      cleanupGameListeners(gameId);
    };
  }, [gameId]);

  // console.log(
  //   `Level Stats outside useEffect: \n ${JSON.stringify(levelStats)}`
  // );

  const handleEndLevel = async () => {
    if (!playerIdentifier || !gameId) return;

    try {
      setIsEnding(true);
      await endLevel(gameId, playerIdentifier);
      setIsEnding(false);
    } catch (error: any) {
      console.error("Error ending level:", error);
      setIsEnding(false);
      toast({
        variant: "destructive",
        title: "Failed to end level",
        description: error?.response?.data?.error || "Please try again",
      });
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

  const handleContinueToNextRound = () => {
    setShowRoundSummary(false);
    setShowLevelSummary(false);
    setRoundStats([]);
    setIsEnding(false);
    initializeGame(); // Start the first level of the new round
  };

  const handleContinueToNextLevel = () => {
    setShowRoundSummary(false);
    setShowLevelSummary(false);
    setRoundStats([]);
    setIsEnding(false);
    initializeLevel();
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

  const handleCellReveal = async (position: Position) => {
    if (!playerIdentifier || !gameId) return;
    try {
      await clickCell(gameId, position, playerIdentifier);
    } catch (error: any) {
      console.error("Error revealing cell:", error);
      toast({
        variant: "destructive",
        title: "Failed to reveal cell",
        description: error?.response?.data?.error || "Please try again",
      });
    }
  };

  return (
    <main className="flex flex-col items-center justify-center">
      <div className="w-full p-4 flex justify-between items-center">
        <div className="text-[#6123ff]">
          <span>Round {gameState?.currentRound}</span>
          <span className="mx-2">•</span>
          <span>Level {gameState?.currentLevel}</span>
        </div>
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

          <div className="w-full bottom-3 absolute justify-center text-center text-[#6123ff]">
            <div>
              <button
                onClick={handleEndLevel}
                disabled={isEnding || !gameState?.isEnded}
                className="font-bold! text-lg hover:text-white hover:drop-shadow-[0px_0px_5px_#6123ff] px-10 leading-none"
              >
                Verify my Guess &rsaquo;
              </button>
            </div>
          </div>

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
              <span className="text-[#5cffb1] my-2">
                You got {levelStats?.bugsFound || 0}{" "}
                {levelStats?.bugsFound === 1 ? " bug" : " bugs"}
              </span>
              <br />

              {verificationInProg ? (
                <>
                  <span>Verifying locally...</span>

                  <SwishSpinner />
                </>
              ) : proofIsVerified ? (
                <>
                  {levelStats?.bugsFound == levelStats?.totalBugs ? (
                    <span className="text-[#5cffb1]">
                      You got all the bugs!
                    </span>
                  ) : (
                    <span className="text-[#ff006e]">
                      You didn't get all the bugs :(
                    </span>
                  )}
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
              {showRoundSummary && <span>{JSON.stringify(roundStats)}</span>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {roundHasEnded ? (
            <>
              <Button onClick={() => setShowRoundSummary(true)}>
                Show Epoch Stats
              </Button>

              <AlertDialogFooter className="m-auto">
                <AlertDialogAction
                  className="bg-[#beb8db] text-[#5b23d4] hover:bg-transparent hover:border hover:border-[#5b23d4]"
                  onClick={
                    roundHasEnded
                      ? handleContinueToNextRound
                      : handleContinueToNextLevel
                  }
                  disabled={verificationInProg || isFullVerifying}
                >
                  {isLoading
                    ? "Starting..."
                    : roundHasEnded
                    ? "Next Epoch ›"
                    : "Next Block ›"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : (
            <AlertDialogFooter className="m-auto">
              <AlertDialogAction
                className="bg-[#beb8db] text-[#5b23d4] hover:bg-transparent hover:border hover:border-[#5b23d4]"
                onClick={
                  roundHasEnded
                    ? handleContinueToNextRound
                    : handleContinueToNextLevel
                }
                disabled={verificationInProg || isFullVerifying}
              >
                {isLoading
                  ? "Starting..."
                  : roundHasEnded
                  ? "Next Epoch ›"
                  : "Next Block ›"}
              </AlertDialogAction>
            </AlertDialogFooter>
          )}
        </AlertDialogContent>
      </AlertDialog>
      {/* Round Summary Dialog */}

      {/* {showRoundSummary && (
        <RoundSummary
          roundStats={roundStats}
          onContinue={handleContinueToNextRound}
        />
      )} */}
    </main>
  );
}
