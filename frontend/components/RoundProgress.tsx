const RoundProgress = ({
  currentRound,
  currentLevel,
  totalLevels = 5,
}: {
  currentRound: number;
  currentLevel: number;
  totalLevels: number;
}) => {
  return (
    <div className="flex flex-col items-center space-y-2 p-4 bg-gray-800 rounded-lg">
      <h2 className="text-xl font-bold text-white">Round {currentRound}</h2>
      <div className="w-full bg-gray-700 rounded-full h-4">
        <div
          className="bg-blue-500 h-4 rounded-full transition-all duration-300"
          style={{ width: `${(currentLevel - 1) * (100 / totalLevels)}%` }}
        />
      </div>
      <p className="text-sm text-gray-300">
        Level {currentLevel} of {totalLevels}
      </p>
    </div>
  );
};
export default RoundProgress;
