export interface GameConfig {
  gameId?: number;
  gridSize: number;
  bugs: Position[];
  numBugs?: number;
  startTime: number;
  duration: number;
  currentLevel?: number;
  currentRound?: number;
  state?: ValidState;
  validActions?: string[];
}

export interface GameConfigShort {
  gridSize: number;
  bugs: Position[];
  gameDuration: number;
}
// export interface GameState {
//   isEnded: boolean;
//   remainingTime: number;
//   clickedCells: Position[];
//   gridSize: number;
//   startTime?: number;
//   duration?: number;
//   bugs?: Position[];
// }

// export interface GameState {
//   startTime: number;
//   isEnded: boolean;
//   clickedCells: Position[];
//   currentRound: number;
//   currentLevel: number;
//   roundStats: any[]; // TODO: update
//   totalScore: number;
//   createdAt: number;
//   highestRound: number;
// }

export interface GameData {
  gameId: string;
  gridSize: number;
  bugs: Position[];
  numBugs: number;
  startTime: number;
  duration: number;
  currentLevel: number;
  currentRound: number;
  totalScore: number;
}

export interface GameState {
  address?: string;
  startTime: number;
  isEnded: boolean;
  clickedCells: Position[];
  currentRound: number;
  currentLevel: number;
  roundStats: LevelStat[];
  totalScore: number;
  createdAt: number;
  highestRound: number;
  config?: GameConfigShort;
  endTime?: number;
  updatedAt?: number;
}

export interface Position {
  x: number;
  y: number;
}

export interface PlayerStats {
  gamesPlayed: number;
  highestScore: number;
  highestRound: number;
}

export interface GameEndData {
  success: boolean;
  gameId: string;
  status: string;
  result: {
    bugsFound: number;
    totalBugs: number;
    clickedCells: number;
    duration: number;
    endType: "timeout" | "manual";
    proofVerified: boolean;
    verificationInProgress: boolean;
    onChainVerified?: boolean;
    contractTxHash?: string;
  };
  error?: string;
}

export interface LevelStat {
  level: number;
  bugsFound: number;
  totalBugs: number;
  score: number;
  duration: number; // Duration in milliseconds
  clickedCells: number; // Total number of cells clicked
}

export interface RoundStats {
  round: number;
  totalScore: number;
  levels: LevelStat[];
  averageAccuracy?: number;
}

export interface RoundSummary {
  gameId: string;
  roundStats: RoundStats;
  nextRound: number;
  totalScore: number;
  state: ValidState;
  validActions: string;
}

export interface RoundSummaryProps {
  roundStats: LevelStat[];
  onContinue: () => void;
}

export interface UseGameInitializationReturn {
  gameConfig: GameConfig | null;
  error: string | null;
  initializeGame: () => Promise<void>;
  initializeNewGame: () => Promise<void>;
  initializeLevel: () => Promise<void>;
  isLoading: boolean;
  currentState: string | null;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string,
    public currentState?: string,
    public expectedStates?: string[]
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface GameStateResponse extends GameState {
  currentState: string;
  validActions: string[];
}

export interface GameStateData {
  gameId: string;
  state: string;
  validActions: string[];
}

export interface StateValidationError extends ApiError {
  currentState: string;
  expectedStates: string[];
  validActions: string[];
}

// Game state constants
export const VALID_STATES = {
  CREATED: "CREATED",
  LEVEL_STARTED: "LEVEL_STARTED",
  LEVEL_ENDED: "LEVEL_ENDED",
  ROUND_COMPLETE: "ROUND_COMPLETE",
  GAME_COMPLETE: "GAME_COMPLETE",
} as const;

export type ValidState = (typeof VALID_STATES)[keyof typeof VALID_STATES];

export const API_VALIDATION_RULES = {
  startLevel: {
    validStates: [
      VALID_STATES.CREATED,
      VALID_STATES.LEVEL_ENDED,
      VALID_STATES.ROUND_COMPLETE,
    ],
    errorMessage: "Cannot start level in current game state",
  },
  handleClick: {
    validStates: [VALID_STATES.LEVEL_STARTED],
    errorMessage: "Cannot process clicks until level is started",
  },
  endLevel: {
    validStates: [VALID_STATES.LEVEL_STARTED],
    errorMessage: "Cannot end level that hasn't started",
  },
  endGame: {
    validStates: [
      VALID_STATES.LEVEL_ENDED,
      VALID_STATES.ROUND_COMPLETE,
      VALID_STATES.GAME_COMPLETE,
    ],
    errorMessage: "Cannot end game in current state",
  },
} as const;
