import {
  GameConfig,
  GameEndData,
  GameState,
  PlayerStats,
  Position,
} from "@/types/game";
import axios, { AxiosError } from "axios";
import { io, Socket } from "socket.io-client";
import Cookies from "js-cookie";

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

// API Error
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// API Configuration
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001";
const ROUTE_URL = API_BASE_URL + "/api/game";
const TIMEOUT = 10000; // 10 seconds

let socket: Socket | null = null;
export const initializeSocket = () => {
  if (!socket) {
    socket = io(API_BASE_URL);
    socket.on("connect", () => {
      console.log("Connected to game server");
    });

    socket.on("disconnect", () => {
      console.log("Disconnected from game server");
    });
  }
  return socket;
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
  }
};

export const setupLevelEndListener = (
  gameId: string,
  callback: (data: any) => void
) => {
  if (socket) {
    console.log("Level ended");
    socket.on(`levelEnded`, callback);
  }
};

export const startLevel = async (
  address: string,
  gameId: string
): Promise<GameConfig> => {
  try {
    const response = await apiClient.post<GameConfig>(
      `/start-level/${gameId}`,
      {
        address,
      }
    );
    return response.data;
  } catch (error) {
    return handleApiError(error as AxiosError);
  }
};

export const endLevel = async (gameId: string, address: string) => {
  try {
    console.log(`End level: ${gameId}`);
    const response = await apiClient.post<GameResponse>("/end-level", {
      gameId,
      address,
    });
    return response.data;
  } catch (error) {
    return handleApiError(error as AxiosError);
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

    joinGameRoom(gameId);
    return response.data;
  } catch (error) {
    return handleApiError(error as AxiosError);
  }
};

export const getGameState = async (
  address: string,
  gameId: string
): Promise<GameState> => {
  try {
    const { address: playerAddress } = getPlayerIdentifier(address);
    const response = await apiClient.get<GameState>(`/game-state/${gameId}`, {
      params: { address: playerAddress },
    });

    return response.data;
  } catch (error) {
    return handleApiError(error as AxiosError);
  }
};

export const updateGameState = async (
  gameId: string,
  update: Partial<GameState>
): Promise<GameState> => {
  try {
    const response = await apiClient.patch<GameState>(`/${gameId}`, update);
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
    const { address: playerAddress, isGuest } = getPlayerIdentifier(address);
    const response = await apiClient.post<GameEndData>(
      `/end-game`,
      {
        gameId,
        address: playerAddress,
        isGuest, // To let backend know if it's a guest
      },
      { timeout: 120000 }
    );
    console.log(`End game response data: ${JSON.stringify(response.data)}`);
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

export const clickCell = async (
  gameId: string,
  position: Position,
  address: string
): Promise<ClickResponse> => {
  try {
    const { address: playerAddress } = getPlayerIdentifier(address);
    const response = await apiClient.post<ClickResponse>("/click", {
      gameId,
      x: position.x,
      y: position.y,
      address: playerAddress,
    });
    return response.data;
  } catch (error) {
    return handleApiError(error as AxiosError);
  }
};
