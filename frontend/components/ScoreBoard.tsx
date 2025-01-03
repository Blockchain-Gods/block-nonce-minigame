const ScoreBoard = ({
  totalScore,
  roundStats,
}: {
  totalScore: number;
  roundStats: [
    {
      level: number;
      score: number;
    }
  ];
}) => {
  return (
    <div className="bg-gray-800 p-4 rounded-lg">
      <h3 className="text-xl font-bold text-white mb-4">Score: {totalScore}</h3>
      <div className="space-y-2">
        {roundStats.map((stat, index) => (
          <div
            key={index}
            className="flex justify-between text-sm text-gray-300"
          >
            <span>Level {stat.level}:</span>
            <span>{stat.score} pts</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ScoreBoard;
