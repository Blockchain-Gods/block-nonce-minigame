class GameStateManager {
  constructor() {
    this.activeGames = new Map();
    this.activePlayerGames = new Map();
    this.playerStats = new Map();
  }
  createGame(gameId, gameState) {
    if (!gameId || !gameState) {
      throw new Error("GameId and gameState are required");
    }

    const initialGameState = {
      ...gameState,
      createdAt: Date.now(),
      currentRound: 1,
      currentLevel: 1,
      roundStats: [],
      totalScore: 0,
      highestRound: 1,
    };

    this.activeGames.set(gameId, initialGameState);

    if (gameState.address) {
      this.activePlayerGames.set(gameState.address, gameId);
      const currentStats = this.playerStats.get(gameState.address) || {
        gamesPlayed: 0,
        highestScore: 0,
        highestRound: 1,
      };

      this.playerStats.set(gameState.address, {
        ...currentStats,
        gamesPlayed: currentStats.gamesPlayed + 1,
      });
    }
  }

  // TODO: Runs at page refresh even with a new gameId. So games played remain the same.
  getGame(gameId) {
    const game = this.activeGames.get(gameId);
    if (!game) {
      return null;
    }
    return { ...game }; // Return a copy to prevent direct state mutation
  }

  updateGame(gameId, updates) {
    const game = this.activeGames.get(gameId);
    if (!game) {
      throw new Error("Game not found");
    }

    const updatedGame = {
      ...game,
      ...updates,
      updatedAt: Date.now(),
    };

    // Update player stats if round or score changes
    if (
      game.address &&
      (updates.currentRound > game.currentRound || updates.totalScore)
    ) {
      const playerStats = this.playerStats.get(game.address) || {
        gamesPlayed: 1,
        highestScore: 0,
        highestRound: 1,
      };

      const newStats = {
        ...playerStats,
        highestScore: Math.max(
          playerStats.highestScore,
          updates.totalScore || 0
        ),
        highestRound: Math.max(
          playerStats.highestRound,
          updates.currentRound || 1
        ),
      };

      this.playerStats.set(game.address, newStats);
    }

    this.activeGames.set(gameId, updatedGame);
    return { ...updatedGame };
  }

  getPlayerGame(address) {
    console.log("Creating a Player game...");
    const gameId = this.activePlayerGames.get(address);
    return gameId ? this.getGame(gameId) : null;
  }

  hasActiveGame(address) {
    const gameId = this.activePlayerGames.get(address);
    const game = gameId ? this.getGame(gameId) : null;
    return game && !game.isEnded;
  }

  endGame(gameId) {
    console.log("Ending a game...");
    const game = this.getGame(gameId);
    if (!game) {
      throw new Error("Game not found");
    }

    if (game.timeoutId) {
      clearTimeout(game.timeoutId);
    }

    const updatedGame = {
      ...game,
      isEnded: true,
      endedAt: Date.now(),
    };

    this.activeGames.set(gameId, updatedGame);
    this.activePlayerGames.delete(game.address);

    return { ...updatedGame };
  }

  removeGame(gameId) {
    const game = this.getGame(gameId);
    if (game) {
      this.activeGames.delete(gameId);
      if (game.address) {
        this.activePlayerGames.delete(game.address);
      }
    }
  }

  // Optional: Add method to clean up old games
  cleanupOldGames(maxAgeMs = 24 * 60 * 60 * 1000) {
    // Default 24 hours
    const now = Date.now();
    for (const [gameId, game] of this.activeGames.entries()) {
      if (now - game.createdAt > maxAgeMs) {
        this.removeGame(gameId);
      }
    }
  }

  getPlayerStats(address) {
    console.log(`GS address: ${address}`);
    return (
      this.playerStats.get(address) || {
        gamesPlayed: 0,
        highestScore: 0,
        highestRound: 1,
      }
    );
  }
}

module.exports = GameStateManager;
