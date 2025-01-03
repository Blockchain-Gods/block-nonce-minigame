export interface GameConfig {
  startTime: number;
  duration: number;
  gridSize: number;
  bugs: Position[];
}

export interface GameState {
  isEnded: boolean;
  remainingTime: number;
  clickedCells: Position[];
  gridSize: number;
  startTime?: number;
  duration?: number;
  bugs?: Position[];
}

export interface Position {
  x: number;
  y: number;
}

export interface PlayerStats {
  gamesPlayed: number;
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
