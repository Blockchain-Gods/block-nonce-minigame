import { getGameState } from "@/lib/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, GameState } from "@/types/game";

interface UseGameStatePollingReturn {
  gameState: GameState | null;
  isRunning: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export const useGameStatePolling = (
  playerIdentifier: string,
  gameId: string,
  pollInterval = 1000
): UseGameStatePollingReturn => {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout>();

  const fetchGameState = useCallback(async () => {
    try {
      const state = await getGameState(playerIdentifier, gameId);
      setGameState(state);

      // Check if level time has expired
      const timePassed = Date.now() - state.startTime;
      const isExpired = timePassed >= state.config?.gameDuration!;

      setIsRunning(!state.isEnded && !isExpired);
      setError(null);

      if (state.isEnded && intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    } catch (error) {
      const errorMessage =
        error instanceof ApiError ? error.message : "Error fetching game state";

      setError(errorMessage);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }
  }, [playerIdentifier, gameId]);

  useEffect(() => {
    fetchGameState();

    intervalRef.current = setInterval(fetchGameState, pollInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchGameState, pollInterval]);

  // console.log(`Game State from hook: ${JSON.stringify(gameState)}`);

  return {
    gameState,
    isRunning,
    error,
    refetch: fetchGameState,
  };
};
