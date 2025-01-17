import { useState } from "react";
import { useToast } from "./use-toast";
import {
  getGameState,
  startGame,
  startLevel,
  waitForValidState,
} from "@/lib/api";
import {
  GameConfig,
  GameState,
  UseGameInitializationReturn,
} from "@/types/game";
import { ApiError } from "@/types/game";

export const useGameInitialization = (
  playerIdentifier: string,
  gameId: string
): UseGameInitializationReturn => {
  const { toast } = useToast();
  const [gameConfig, setGameConfig] = useState<GameConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentState, setCurrentState] = useState<string | null>(null);

  // Internal functions that return Promise<void>
  const internalInitializeNewGame = async (): Promise<void> => {
    try {
      const generatedData = await startGame(playerIdentifier, gameId);
      setCurrentState("LEVEL_STARTED");

      const config: GameConfig = {
        startTime: generatedData.startTime,
        duration: generatedData.duration,
        gridSize: generatedData.gridSize,
        bugs: generatedData.bugs,
      };
      setGameConfig(config);
    } catch (error) {
      throw error; // Let the caller handle the error
    }
  };

  const internalInitializeLevel = async (): Promise<void> => {
    try {
      const levelData = await startLevel(playerIdentifier, gameId);
      setCurrentState("LEVEL_STARTED");

      const config: GameConfig = {
        startTime: levelData.startTime,
        duration: levelData.duration,
        gridSize: levelData.gridSize,
        bugs: levelData.bugs,
      };
      setGameConfig(config);
    } catch (error) {
      throw error; // Let the caller handle the error
    }
  };

  const waitForStateAndRetry = async (
    action: () => Promise<void>,
    expectedState: string
  ): Promise<void> => {
    try {
      await waitForValidState(expectedState);
      await action();
    } catch (error) {
      if (error instanceof ApiError && error.code === "INVALID_STATE") {
        toast({
          variant: "destructive",
          title: "Invalid State",
          description: `Waiting for valid state: ${error.expectedStates?.join(
            ", "
          )}`,
        });
        // Optionally retry
        await waitForStateAndRetry(action, expectedState);
      } else {
        throw error;
      }
    }
  };

  // Public functions that handle loading state and errors
  const initializeGame = async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const existingGame = await getGameState(playerIdentifier, gameId);
      setCurrentState(existingGame.currentState);

      if (
        existingGame.startTime !== undefined &&
        existingGame.config?.gameDuration !== undefined &&
        existingGame.config?.gridSize !== undefined &&
        existingGame.config?.bugs !== undefined
      ) {
        const config: GameConfig = {
          startTime: existingGame.startTime,
          duration: existingGame.config.gameDuration,
          gridSize: existingGame.config.gridSize,
          bugs: existingGame.config.bugs,
        };
        setGameConfig(config);
        return;
      }

      await waitForStateAndRetry(internalInitializeNewGame, "CREATED");
    } catch (error) {
      handleInitializationError(error);
    } finally {
      setIsLoading(false);
    }
  };

  const initializeNewGame = async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      await internalInitializeNewGame();
    } catch (error) {
      if (error instanceof ApiError && error.code === "INVALID_STATE") {
        await waitForStateAndRetry(internalInitializeNewGame, "CREATED");
      } else {
        handleInitializationError(error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const initializeLevel = async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      await internalInitializeLevel();
    } catch (error) {
      if (error instanceof ApiError && error.code === "INVALID_STATE") {
        await waitForStateAndRetry(internalInitializeLevel, "LEVEL_ENDED");
      } else {
        handleInitializationError(error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleInitializationError = (error: any) => {
    const errorMessage =
      error instanceof ApiError ? error.message : "Failed to initialize game";
    setError(errorMessage);
    toast({
      variant: "destructive",
      title: "Error",
      description: errorMessage,
    });
  };

  return {
    gameConfig,
    error,
    initializeGame,
    initializeNewGame,
    initializeLevel,
    isLoading,
    currentState,
  };
};
