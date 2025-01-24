import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { Position } from "@/types/game";
import { useToast } from "@/hooks/use-toast";

const shapes = [
  "semicircle",
  "circle",
  "hexagon",
  "square",
  "triangle",
  "cross",
  "diamond",
  "star",
];

interface CellData {
  shape: string;
  offset: {
    x: number;
    y: number;
  };
}

interface GridGameProps {
  gridSize: number;
  onCellReveal: (position: Position) => Promise<void>;
  enemyPositions: Position[];
  gameId: string;
  address: string;
}

const GridGame: React.FC<GridGameProps> = ({
  gridSize,
  onCellReveal,
  enemyPositions,
  gameId,
  address,
}) => {
  const [grid, setGrid] = useState<CellData[][]>([]);
  const [cursorPosition, setCursorPosition] = useState<Position>({
    x: -1,
    y: -1,
  });
  const [revealedCells, setRevealedCells] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const createGrid = () =>
      Array(gridSize)
        .fill(null)
        .map(() =>
          Array(gridSize)
            .fill(null)
            .map(() => ({
              shape: shapes[Math.floor(Math.random() * shapes.length)],
              offset: { x: 0, y: 0 },
            }))
        );

    setGrid(createGrid());
    setRevealedCells(new Set());

    const intervalId = setInterval(() => {
      setGrid((prevGrid) =>
        prevGrid.map((row) =>
          row.map((cell) => ({
            ...cell,
            offset: {
              x: Math.sin(Date.now() / 1000 + Math.random() * 10) * 5,
              y: Math.cos(Date.now() / 1000 + Math.random() * 10) * 5,
            },
          }))
        )
      );
    }, 50);

    return () => clearInterval(intervalId);
  }, [gridSize]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = Math.floor((e.clientX - rect.left) / (rect.width / gridSize));
      const y = Math.floor((e.clientY - rect.top) / (rect.height / gridSize));
      setCursorPosition({ x, y });
    },
    [gridSize]
  );

  const handleCellClick = useCallback(
    async (x: number, y: number) => {
      if (isProcessing) return;
      const cellKey = `${x},${y}`;
      if (revealedCells.has(cellKey)) return;

      setIsProcessing(true);
      // Update UI immediately
      const newSet = new Set(revealedCells);
      newSet.add(cellKey);
      setRevealedCells(newSet);

      try {
        // Handle server communication asynchronously
        await onCellReveal({ x, y });
      } catch (error) {
        // Rollback on error
        newSet.delete(cellKey);
        setRevealedCells(newSet);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to reveal cell. Please try again.",
        });
      } finally {
        setIsProcessing(false);
      }
    },
    [onCellReveal, revealedCells, isProcessing, toast]
  );

  const isEnemyCell = (x: number, y: number) => {
    return enemyPositions.some((pos) => pos.x === x && pos.y === y);
  };

  const renderGrid = (isHidden: boolean) => (
    <div
      className={`absolute inset-0 grid`}
      style={{
        gridTemplateColumns: `repeat(${gridSize}, 1fr)`,
        gridTemplateRows: `repeat(${gridSize}, 1fr)`,
        // gap: "20px",
      }}
    >
      {grid.map((row, y) =>
        row.map((cell, x) => {
          const isRevealed =
            !isHidden ||
            (Math.abs(x - cursorPosition.x) <= 1 &&
              Math.abs(y - cursorPosition.y) <= 1);
          let imageName;
          if (isHidden) {
            imageName = isEnemyCell(x, y)
              ? `enemies/e-${cell.shape}`
              : `filled/f-${cell.shape}`;
          } else {
            imageName = `normal/${cell.shape}`;
          }
          const isCellRevealed = revealedCells.has(`${x},${y}`);
          return (
            <div
              key={`${x}-${y}`}
              className={`cursor-pointer flex justify-center items-center relative transition-all ease-out hover:bg-gray-900 border-blue-600 
                hover:border-4 hover:border-dashed hover:border-teal-300
                ${isRevealed ? "opacity-100" : "opacity-0"} ${
                isEnemyCell(x, y) ? "duration-500" : "duration-1000"
              } cell-style `}
              onClick={() => handleCellClick(x, y)}
              style={{
                transform: `translate(${cell.offset.x}px, ${cell.offset.y}px)`,
              }}
            >
              <Image
                src={`/grid-images/${imageName}.png`}
                alt={cell.shape}
                width={750 / gridSize / 2}
                height={750 / gridSize / 2}
                className={`${
                  cursorPosition.x === x && cursorPosition.y === y
                    ? "filter drop-shadow-lg scale-110"
                    : ""
                }`}
              />
              {isCellRevealed && (
                <div
                  className="absolute inset-0 rounded border border-rose-700 backdrop-brightness-100 bg-opacity-80 flex justify-center items-center text-gray-700 bad-cell"
                  style={{
                    fontSize: `${750 / gridSize / 4}px`,
                  }}
                />
              )}
            </div>
          );
        })
      )}
    </div>
  );

  return (
    <div className="w-[700px] h-[700px] relative" onMouseMove={handleMouseMove}>
      {renderGrid(false)}
      {renderGrid(true)}
    </div>
  );
};

export default GridGame;
