import { LevelStat, RoundStats } from "@/types/game";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const calculateRoundStats = (levelStats: LevelStat[]): RoundStats => {
  const totalScore = levelStats.reduce((sum, stat) => sum + stat.score, 0);
  const averageAccuracy =
    levelStats.reduce((sum, stat) => sum + stat.bugsFound / stat.totalBugs, 0) /
    levelStats.length;

  return {
    round: levelStats[0]?.level ? Math.ceil(levelStats[0].level / 5) : 1,
    levelStats,
    totalScore,
    averageAccuracy,
  };
};
