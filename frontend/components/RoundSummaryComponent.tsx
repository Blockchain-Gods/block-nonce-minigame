// import { calculateRoundStats } from "@/lib/utils";
// import { RoundSummaryProps } from "@/types/game";

// const RoundSummaryComponent: React.FC<RoundSummaryProps> = ({
//   roundStats,
//   onContinue,
// }) => {
//   const { totalScore, averageAccuracy } = calculateRoundStats(roundStats);

//   return (
//     <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
//       <div className="bg-gray-800 p-6 rounded-lg max-w-md w-full">
//         <h2 className="text-2xl font-bold text-white mb-4">Round Complete!</h2>
//         <div className="space-y-4">
//           <div className="text-gray-300">
//             <p>Total Score: {totalScore}</p>
//             {/* <p>Average Accuracy: {(averageAccuracy * 100).toFixed(1)}%</p> */}
//           </div>
//           <div className="space-y-2">
//             {roundStats.map((stat, index) => (
//               <div key={index} className="bg-gray-700 p-2 rounded">
//                 <p className="text-white">Level {stat.level}</p>
//                 <p className="text-sm text-gray-400">
//                   Found {stat.bugsFound} of {stat.totalBugs} bugs
//                 </p>
//                 <p className="text-sm text-gray-400">Score: {stat.score}</p>
//               </div>
//             ))}
//           </div>
//           <button
//             onClick={onContinue}
//             className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded"
//           >
//             Continue to Next Round
//           </button>
//         </div>
//       </div>
//     </div>
//   );
// };

// export default RoundSummaryComponent;
