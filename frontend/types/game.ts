export interface GameConfig {
  startTime: number;
  duration: number;
  gridSize: number;
  bugs: Position[];
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
  levelStats: LevelStat[];
  totalScore: number;
  averageAccuracy: number;
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

export interface GameStateData {
  currentState: string;
  validActions: string[];
}

export interface GameStateResponse extends GameState {
  currentState: string;
  validActions: string[];
}

export interface StateValidationError extends ApiError {
  currentState: string;
  expectedStates: string[];
  validActions: string[];
}
