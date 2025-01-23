import {
  GameConfig,
  GameEndData,
  GameState,
  PlayerStats,
  Position,
  GameStateResponse,
  ApiError,
  StateValidationError,
  GameStateData,
} from "@/types/game";
import axios, { AxiosError } from "axios";
import { io, Socket } from "socket.io-client";
import Cookies from "js-cookie";
import { gameStateManager } from "./GameStateManager";

// API Types
interface GameResponse {
  gameId: string;
}

// interface GameState {
//   isEnded: boolean;
//   remainingTime: number;
//   clickedCells: Position[];
//   gridSize: number;
// }

interface ClickResponse {
  success: boolean;
}

interface PlayerIdentifier {
  address: string;
  isGuest: boolean;
}

// API Configuration
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001";
const ROUTE_URL = API_BASE_URL + "/api/game";
const TIMEOUT = 10000; // 10 seconds

let socket: Socket | null = null;

let currentGameState: string | null = null;
let validActions: string[] = [];

export const initializeSocket = () => {
  if (!socket) {
    socket = io(API_BASE_URL);

    socket.on("connect", () => {
      console.log("Connected to game server");
    });

    socket.on("gameState", (data: GameStateData) => {
      // console.log("Received gameState:", data);
      if (data.state && data.validActions) {
        gameStateManager.updateState(data.state, data.validActions);
      }
    });

    socket.on(
      "stateChanged",
      (data: { newState: string; validActions: string[] }) => {
        // console.log("State changed:", data);
        if (data.newState && data.validActions) {
          gameStateManager.updateState(data.newState, data.validActions);
        }
      }
    );

    // error handling for socket
    socket.on("error", (error: any) => {
      console.error("Socket error:", error);
    });

    // debug event listner
    socket.onAny((eventName, ...args) => {
      console.log(`Received socket event "${eventName}":`, args);
    });

    socket.on("disconnect", () => {
      console.log("Disconnected from game server");
    });
  }
  return socket;
};

const validateActionState = (action: string): boolean => {
  return validActions.includes(action);
};

export const waitForValidState = (
  targetState: string,
  timeout = 30000
): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    const currentState = gameStateManager.getCurrentState();
    // console.log(
    //   `Waiting for state ${targetState}, current state: ${currentState}`
    // );

    if (currentState === targetState) {
      resolve(true);
      return;
    }

    const timeoutId = setTimeout(() => {
      gameStateManager.removeStateChangeListener(stateChangeHandler);
      reject(
        new Error(
          `State wait timeout. Current: ${gameStateManager.getCurrentState()}, Expected: ${targetState}`
        )
      );
    }, timeout);

    const stateChangeHandler = (newState: string) => {
      // console.log(
      //   `State changed to ${newState} while waiting for ${targetState}`
      // );
      if (newState === targetState) {
        clearTimeout(timeoutId);
        gameStateManager.removeStateChangeListener(stateChangeHandler);
        resolve(true);
      }
    };

    gameStateManager.onStateChange(stateChangeHandler);
  });
};

const getPlayerIdentifier = (address?: string): PlayerIdentifier => {
  if (address && !address.startsWith("guest_")) {
    return { address, isGuest: false };
  }

  // Check for existing guest ID in cookies
  let guestId = Cookies.get("guestId");

  // If no guest ID exists or a new guest session is requested, create one
  if (!guestId) {
    guestId = `guest_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    Cookies.set("guestId", guestId, {
      expires: 1, // 1 day
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
    });
  }

  return { address: guestId, isGuest: true };
};

// Axios instance with default config
const apiClient = axios.create({
  baseURL: ROUTE_URL,
  timeout: TIMEOUT,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true, // Important for cookie handling
});

// Error handler
const handleApiError = (error: AxiosError): never => {
  if (error.response) {
    // The request was made and the server responded with a status code
    // that falls out of the range of 2xx
    throw new ApiError(
      //@ts-ignore
      error.response.data.error || "An error occurred",
      error.response.status,
      error.code
    );
  } else if (error.request) {
    // The request was made but no response was received
    throw new ApiError("No response from server", 503, "SERVICE_UNAVAILABLE");
  } else {
    // Something happened in setting up the request
    throw new ApiError(error.message, 500, "REQUEST_SETUP_ERROR");
  }
};

export const joinGameRoom = (gameId: string) => {
  if (socket) {
    socket.emit("joinGame", gameId);
    console.log(`Joined game room: ${gameId}`);

    // Request current state immediately after joining
    socket.emit("requestGameState", gameId);
  }
};

export const setupLevelEndListener = (
  gameId: string,
  callback: (data: any) => void
) => {
  if (socket) {
    // Remove any existing listeners to prevent duplicates
    socket.off("levelEnded");

    console.log("Setting up level end listener");
    socket.on("levelEnded", (data) => {
      console.log("Level ended event received:", JSON.stringify(data));
      // Update game state manager with new state
      if (data.state && data.validActions) {
        gameStateManager.updateState(data.state, data.validActions);
      }
      callback(data);
    });
  }
};

export const startLevel = async (
  address: string,
  gameId: string
): Promise<GameConfig> => {
  try {
    const currentState = gameStateManager.getCurrentState();
    console.log(`Attempting to start level. Current state: ${currentState}`);

    if (!gameStateManager.isActionValid("startLevel")) {
      const error = new ApiError(
        "Cannot start level in current state",
        409,
        "INVALID_STATE",
        currentState,
        ["CREATED", "LEVEL_ENDED", "ROUND_COMPLETE"]
      );
      console.log("State validation failed:", error);
      throw error;
    }

    const response = await apiClient.post<GameConfig>(
      `/start-level/${gameId}`,
      {
        address,
      }
    );

    const data: GameConfig = response.data;
    if (data.state && data.validActions) {
      gameStateManager.updateState(data.state, data.validActions);
    }
    console.log(
      `[startLevel] GSM state updated with response data: ${JSON.stringify(
        gameStateManager.getCurrentState()
      )}`
    );
    return response.data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    return handleApiError(error as AxiosError);
  }
};

export const clickCell = async (
  gameId: string,
  position: Position,
  address: string
): Promise<ClickResponse> => {
  try {
    const currentState = gameStateManager.getCurrentState();
    const validActions = gameStateManager.getValidActions();
    console.log(`[clickCell] Attempting click with state:`, {
      currentState,
      validActions,
      position,
    });

    if (!gameStateManager.isActionValid("handleClick")) {
      const error = new ApiError(
        "Cannot click cells in current state",
        409,
        "INVALID_STATE",
        currentState,
        ["LEVEL_STARTED"]
      );
      console.error("[clickCell] State validation failed:", error);
      throw error;
    }

    const { address: playerAddress } = getPlayerIdentifier(address);
    const response = await apiClient.post<ClickResponse>("/click", {
      gameId,
      x: position.x,
      y: position.y,
      address: playerAddress,
    });
    // console.log(`Clicked cell response data: ${JSON.stringify(response.data)}`);
    return response.data;
  } catch (error) {
    console.error("[clickCell] Error:", error);

    return handleApiError(error as AxiosError);
  }
};

export const endLevel = async (gameId: string, address: string) => {
  try {
    const currentState = gameStateManager.getCurrentState();
    console.log("Attempting to end level. Current state:", currentState);

    if (!gameStateManager.isActionValid("endLevel")) {
      throw new ApiError(
        "Cannot end level in current state",
        409,
        "INVALID_STATE",
        gameStateManager.getCurrentState(),
        ["LEVEL_STARTED"]
      );
    }

    const response = await apiClient.post<GameResponse>("/end-level", {
      gameId,
      address,
    });
    return response.data;
  } catch (error) {
    return handleApiError(error as AxiosError);
  }
};

export const setupRoundCompleteListener = (
  gameId: string,
  onRoundComplete: (data: GameEndData) => void
) => {
  if (socket) {
    socket.on("roundComplete", (data: GameEndData) => {
      console.log("Game ended");
      if (data.gameId === gameId) {
        onRoundComplete(data);
      }
    });
  }
};

export const setupGameEndListener = (
  gameId: string,
  onGameEnd: (data: GameEndData) => void
) => {
  if (socket) {
    socket.on("gameEnded", (data: GameEndData) => {
      console.log("Game ended");
      if (data.gameId === gameId) {
        onGameEnd(data);
      }
    });
  }
};

export const cleanupGameListeners = (gameId: string) => {
  if (socket) {
    console.log(`[cleanupGameListeners] sockets: ${socket}`);

    socket.off("gameState");
    socket.off("stateChanged");
    socket.off("levelEnded");
    socket.off("roundComplete");
    socket.off("gameEnded");
    // Optionally leave the room
    socket.emit("leaveGame", gameId);
  }
};

export const createGame = async (
  playerAddress?: string
): Promise<GameResponse> => {
  try {
    const { address } = getPlayerIdentifier(playerAddress);
    console.log(`Creating a game FE with address: ${address}`);
    const response = await apiClient.post<GameResponse>("/create-game", {
      address,
    });
    return response.data;
  } catch (error) {
    return handleApiError(error as AxiosError);
  }
};

export const startGame = async (
  address: string,
  gameId: string
): Promise<GameConfig> => {
  try {
    const { address: playerAddress } = getPlayerIdentifier(address);
    const response = await apiClient.post<GameConfig>(`/start-game/${gameId}`, {
      address: playerAddress,
    });

    gameStateManager.setGameId(gameId);
    gameStateManager.updateState("LEVEL_STARTED", ["handleClick", "endLevel"]);

    joinGameRoom(gameId);
    return response.data;
  } catch (error) {
    return handleApiError(error as AxiosError);
  }
};

export const getGameState = async (
  address: string,
  gameId: string
): Promise<GameStateResponse> => {
  try {
    const { address: playerAddress } = getPlayerIdentifier(address);
    const response = await apiClient.get<GameStateResponse>(
      `/game-state/${gameId}`,
      {
        params: { address: playerAddress },
      }
    );

    return response.data;
  } catch (error) {
    return handleApiError(error as AxiosError);
  }
};

export const updateGameState = async (
  gameId: string,
  update: Partial<GameStateResponse>
): Promise<GameStateResponse> => {
  try {
    const response = await apiClient.patch<GameStateResponse>(
      `/${gameId}`,
      update
    );
    return response.data;
  } catch (error) {
    return handleApiError(error as AxiosError);
  }
};

export const endGame = async (
  gameId: string,
  address: string
): Promise<GameEndData> => {
  try {
    if (!gameStateManager.isActionValid("endGame")) {
      throw new ApiError(
        "Cannot end game in current state",
        409,
        "INVALID_STATE",
        gameStateManager.getCurrentState(),
        ["LEVEL_ENDED", "ROUND_COMPLETE"]
      );
    }

    const { address: playerAddress, isGuest } = getPlayerIdentifier(address);
    const response = await apiClient.post<GameEndData>(
      `/end-game`,
      {
        gameId,
        address: playerAddress,
        isGuest,
      },
      { timeout: 120000 }
    );
    return response.data;
  } catch (error) {
    return handleApiError(error as AxiosError);
  }
};

export const endGameWithFullVerification = async (
  gameId: string,
  address: string,
  contractAddress?: string
): Promise<GameEndData> => {
  try {
    const { address: playerAddress, isGuest } = getPlayerIdentifier(address);
    // Don't allow guests to do full verification
    if (isGuest) {
      throw new ApiError(
        "Full verification requires a connected wallet",
        400,
        "WALLET_REQUIRED"
      );
    }

    console.log("FE- full verification trying");
    const response = await apiClient.post<GameEndData>(
      `/end-game/full`,
      {
        gameId,
        address: playerAddress,
        contractAddress,
      },
      {
        timeout: 300000,
      }
    );
    // console.log(
    //   `End game full verification response data: ${JSON.stringify(
    //     response.data
    //   )}`
    // );
    return response.data;
  } catch (error) {
    return handleApiError(error as AxiosError);
  }
};

export const getPlayerStats = async (address: string): Promise<PlayerStats> => {
  try {
    const { address: playerAddress } = getPlayerIdentifier(address);
    const response = await apiClient.get<PlayerStats>(`/stats/`, {
      params: { address: playerAddress },
    });

    return response.data;
  } catch (error) {
    return handleApiError(error as AxiosError);
  }
};

export const retryWithStateValidation = async <T>(
  action: () => Promise<T>,
  requiredState: string,
  maxAttempts = 3,
  retryDelay = 2000
): Promise<T> => {
  let attempts = 0;

  while (attempts < maxAttempts) {
    try {
      return await action();
    } catch (error) {
      attempts++;

      if (error instanceof ApiError && error.code === "INVALID_STATE") {
        console.log(`Attempt ${attempts}: Waiting for state ${requiredState}`);
        try {
          await waitForValidState(requiredState, retryDelay);
          continue;
        } catch (waitError) {
          if (attempts === maxAttempts) throw waitError;
          continue;
        }
      }

      throw error;
    }
  }

  throw new Error("Max retry attempts reached");
};
