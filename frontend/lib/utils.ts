import { GameSummary, LevelStat, RoundStats, RoundSummary } from "@/types/game";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// export const calculateRoundStats = (levelStats: LevelStat[]): RoundStats => {
//   const totalScore = levelStats.reduce((sum, stat) => sum + stat.score, 0);
//   const averageAccuracy =
//     levelStats.reduce((sum, stat) => sum + stat.bugsFound / stat.totalBugs, 0) /
//     levelStats.length;

//   return {
//     round: levelStats[0]?.level ? Math.ceil(levelStats[0].level / 5) : 1,
//     levels,
//     totalScore,
//     averageAccuracy,
//   };
// };

export const calculateDisplayStats = (
  totalScore: number,
  levelStats: LevelStat[]
) => {
  const { totalBugsFound, totalPossibleBugs } = levelStats.reduce(
    (acc, level) => ({
      totalBugsFound: acc.totalBugsFound + level.bugsFound,
      totalPossibleBugs: acc.totalPossibleBugs + level.totalBugs,
    }),
    { totalBugsFound: 0, totalPossibleBugs: 0 }
  );
  const accuracy = parseFloat(
    ((totalBugsFound / totalPossibleBugs) * 100).toFixed(2)
  );

  return { totalScore, accuracy };
};
