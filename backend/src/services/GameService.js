class GameService {
  constructor(gameStateManager, proofVerifier, provider, io) {
    this.gameStateManager = gameStateManager;
    this.proofVerifier = proofVerifier;
    this.provider = provider;
    this.io = io;

    // Game configuration constants
    this.GAME_CONFIG = {
      MIN_BUGS: 5, //change back to 5
      MAX_BUGS: 10, //change back to 10
      MIN_GRID_SIZE: 8,
      MAX_GRID_SIZE: 16, //change back to 16
      GAME_DURATION: 35000, // 35 seconds
      LEVELS_PER_ROUND: 5,
      // Difficulty increases with each level
      DIFFICULTY_SCALING: {
        GRID_SIZE_INCREMENT: 2, // Grid size increases by 2 each level
        // BUG_INCREMENT: 1, // Number of bugs increases by 1 each level
        TIME_DECREMENT: 5000, // Time decreases by 5 seconds each level
      },
    };
  }

  // Helper method to validate game access
  validateGameAccess(gameId, address) {
    const game = this.gameStateManager.getGame(gameId);

    if (!game) {
      throw new Error("Game not found");
    }
    if (game.address !== address) {
      throw new Error("Not authorized for this game");
    }
    return game;
  }

  async createGame(address) {
    if (!address) {
      throw new Error("Player address is required");
    }

    if (this.gameStateManager.hasActiveGame(address)) {
      throw new Error(
        `Player already has active game: ${this.gameStateManager.activePlayerGames.get(
          address
        )}`
      );
    }

    const gameId = Date.now().toString();
    const gameState = {
      address,
      startTime: Date.now(),
      isEnded: false,
      clickedCells: [],
      currentRound: 1,
      currentLevel: 1,
      roundStats: [],
      totalScore: 0,
    };

    this.gameStateManager.createGame(gameId, gameState);
    return gameId;
  }

  generateGameConfig(level = 1) {
    // Add default parameter
    const {
      MIN_BUGS,
      MAX_BUGS,
      MIN_GRID_SIZE,
      MAX_GRID_SIZE,
      GAME_DURATION,
      DIFFICULTY_SCALING,
    } = this.GAME_CONFIG;

    // Calculate difficulty based on level
    const levelIndex = level - 1;
    const gridSizeIncrease =
      DIFFICULTY_SCALING.GRID_SIZE_INCREMENT * levelIndex;
    const timeDecrease = DIFFICULTY_SCALING.TIME_DECREMENT * levelIndex;

    const gridSize = Math.min(MIN_GRID_SIZE + gridSizeIncrease, MAX_GRID_SIZE);
    const numBugs =
      Math.floor(Math.random() * (MAX_BUGS - MIN_BUGS + 1)) + MIN_BUGS;
    const duration = Math.max(
      GAME_DURATION - timeDecrease,
      15000 // Minimum 15 seconds
    );

    // Generate unique bug positions
    const bugs = new Set();
    while (bugs.size < numBugs) {
      const x = Math.floor(Math.random() * gridSize);
      const y = Math.floor(Math.random() * gridSize);
      bugs.add(JSON.stringify({ x, y }));
    }

    return {
      gridSize,
      bugs: Array.from(bugs).map((bug) => JSON.parse(bug)),
      gameDuration: duration, // Use the calculated duration instead of GAME_DURATION
    };
  }

  async startLevel(gameId, address) {
    const game = this.validateGameAccess(gameId, address);

    // Initialize level and round if not defined
    if (!game.currentLevel) {
      game.currentLevel = 1;
    }
    if (!game.currentRound) {
      game.currentRound = 1;
    }

    if (game.currentLevel > this.GAME_CONFIG.LEVELS_PER_ROUND) {
      throw new Error("Round is complete");
    }

    // Initialize level configuration
    console.log(`Initializing level config for level ${game.currentLevel}`);
    const gameConfig = this.generateGameConfig(game.currentLevel);
    console.log(`Level config: ${JSON.stringify(gameConfig)}`);

    if (!address?.startsWith("guest_")) {
      try {
        await this.proofVerifier.setSecret(gameConfig.bugs.length);
      } catch (error) {
        throw new Error(
          `Failed to initialize level verification: ${error.message}`
        );
      }
    }

    const updates = {
      config: gameConfig,
      startTime: Date.now(),
      clickedCells: [],
      isEnded: false,
      currentLevel: game.currentLevel,
      currentRound: game.currentRound,
    };

    this.gameStateManager.updateGame(gameId, updates);
    this.setGameEndTimer(gameId, gameConfig.gameDuration);

    return {
      gameId,
      gridSize: gameConfig.gridSize,
      bugs: gameConfig.bugs,
      numBugs: gameConfig.bugs.length,
      startTime: updates.startTime,
      duration: gameConfig.gameDuration / 1000,
      currentLevel: game.currentLevel,
      currentRound: game.currentRound,
    };
  }

  async endLevel(gameId, endType = "timeout") {
    console.log("Ending level");
    const game = this.gameStateManager.getGame(gameId);
    if (!game || game.isEnded) return null;

    // Calculate level statistics
    const bugsFound = game.clickedCells.filter((cell) =>
      game.config.bugs.some((bug) => bug.x === cell.x && bug.y === cell.y)
    ).length;
    console.log(`Bugs found: ${bugsFound}`);
    const levelScore = this.calculateLevelScore(
      bugsFound,
      game.config.bugs.length,
      game.clickedCells.length
    );

    const levelResult = {
      level: game.currentLevel,
      bugsFound,
      totalBugs: game.config.bugs.length,
      clickedCells: game.clickedCells.length,
      duration: Date.now() - game.startTime,
      score: levelScore,
    };

    // Update game state with level results
    const updates = {
      isEnded: true,
      currentLevel: game.currentLevel + 1,
      roundStats: [...(game.roundStats || []), levelResult],
      totalScore: (game.totalScore || 0) + levelScore,
    };

    // Check if round is complete
    if (updates.currentLevel > this.GAME_CONFIG.LEVELS_PER_ROUND) {
      updates.currentLevel = 1;
      updates.currentRound = game.currentRound + 1;
    }

    this.gameStateManager.updateGame(gameId, updates);

    // Emit level completion event
    this.io.to(gameId).emit("levelEnded", {
      gameId,
      result: levelResult,
      roundComplete: updates.currentLevel === 1,
      currentRound: updates.currentRound,
      totalScore: updates.totalScore,
    });

    return levelResult;
  }

  calculateLevelScore(bugsFound, totalBugs, totalClicks) {
    const accuracy = bugsFound / totalBugs;
    const efficiency = bugsFound / (totalClicks || 1);

    // Base score calculation
    let score = Math.floor(
      accuracy * 1000 + // Up to 1000 points for finding all bugs
        efficiency * 500 // Up to 500 points for efficiency
    );

    return Math.max(0, score); // Ensure score is not negative
  }

  async startGame(gameId, address) {
    const game = this.validateGameAccess(gameId, address);

    if (game.config) {
      throw new Error("Game already started");
    }
    // Initialize game configuration
    const gameConfig = this.generateGameConfig();

    console.log(JSON.stringify(gameConfig));
    // Set the secret (number of bugs) in the proof verifier
    if (address?.startsWith("guest_")) {
      console.log("Skipping set secret");
    } else {
      try {
        const secretSetRes = await this.proofVerifier.setSecret(
          gameConfig.bugs.length
        );
        console.log(`Secret set. ${JSON.stringify(secretSetRes)}`);
      } catch (error) {
        throw new Error(
          `Failed to initialize game verification: ${error.message}`
        );
      }
    }

    const updates = {
      config: gameConfig,
      startTime: Date.now(),
      clickedCells: [],
      isEnded: false,
    };

    // Update game state
    this.gameStateManager.updateGame(gameId, updates);

    // Set automatic game end timer
    this.setGameEndTimer(gameId, gameConfig.gameDuration);

    return {
      gameId,
      gridSize: gameConfig.gridSize,
      bugs: gameConfig.bugs,
      numBugs: gameConfig.bugs.length,
      startTime: updates.startTime,
      duration: gameConfig.gameDuration / 1000,
    };
  }

  setGameEndTimer(gameId, duration) {
    const game = this.gameStateManager.getGame(gameId);
    if (game.timeoutId) {
      clearTimeout(game.timeoutId);
    }

    game.timeoutId = setTimeout(async () => {
      try {
        await this.endLevel(gameId, "timeout");
      } catch (error) {
        console.error(`Error ending game ${gameId}:`, error);
      }
    }, duration);
  }

  async handleClick(gameId, x, y, address) {
    const game = this.validateGameAccess(gameId, address);

    if (game.isEnded) {
      throw new Error("Game has already ended");
    }
    console.log(`Player clicked ${x}, ${y}`);
    game.clickedCells.push({ x, y });
    this.gameStateManager.updateGame(gameId, game);
    return { success: true };
  }

  async endGame(gameId, endType = "timeout") {
    console.log(`Ending game with endType = ${endType}`);
    const game = this.gameStateManager.getGame(gameId);
    if (!game || game.isEnded) return null;

    // Clear any existing timeout
    if (game.timeoutId) {
      clearTimeout(game.timeoutId);
    }

    const updates = {
      isEnded: true,
      endType,
      endTime: Date.now(),
      timeoutId: null,
    };

    // Calculate game statistics
    const bugsFound = game.clickedCells.filter((cell) =>
      game.config.bugs.some((bug) => bug.x === cell.x && bug.y === cell.y)
    ).length;
    console.log(`Bugs found: ${bugsFound}`);
    // Check if this is a guest user
    const isGuest = game.address.startsWith("guest_");

    const initialResult = {
      bugsFound,
      totalBugs: game.config.bugs.length,
      clickedCells: game.clickedCells.length,
      duration: Date.now() - game.startTime,
      endType,
      proofVerified: isGuest ? true : false, // Always true for guests
      verificationInProgress: isGuest ? false : true, // Never "in progress" for guests
    };

    // Emit initial result
    this.io.to(gameId).emit("gameEnded", {
      gameId,
      result: initialResult,
      endType,
      status: isGuest ? "complete" : "verifying",
    });

    // For guest users, skip verification and return immediately
    if (isGuest) {
      const finalResult = {
        ...initialResult,
        proofVerified: true,
        verificationInProgress: false,
      };

      this.gameStateManager.updateGame(gameId, {
        ...updates,
        result: finalResult,
      });

      return finalResult;
    }

    // Continue with normal verification for web3 users
    try {
      const verificationResult = await this.proofVerifier.verifyGuessLocal(
        bugsFound
      );

      const finalResult = {
        ...initialResult,
        proofVerified: verificationResult.success,
        verificationInProgress: false,
      };

      this.gameStateManager.updateGame(gameId, {
        ...updates,
        result: finalResult,
      });

      console.log(
        `Emitting final gameEnded event with verification for game ${gameId}`
      );
      this.io.to(gameId).emit("gameEnded", {
        gameId,
        result: finalResult,
        endType,
        status: "complete",
      });

      return finalResult;
    } catch (error) {
      console.error(`Error verifying proof for game ${gameId}:`, error);
      throw new Error("Failed to verify game result");
    }
  }

  async endGameWithFullVerification(
    gameId,
    endType = "manual",
    contractInstance = null
  ) {
    const game = this.gameStateManager.getGame(gameId);
    if (!game) return null;

    // Prevent guest users from using full verification
    if (game.address.startsWith("guest_")) {
      throw new Error("Full verification is not available for guest users");
    }

    if (game.timeoutId) {
      clearTimeout(game.timeoutId);
    }

    const bugsFound = game.clickedCells.filter((cell) =>
      game.config.bugs.some((bug) => bug.x === cell.x && bug.y === cell.y)
    ).length;

    // Initial result and emission
    const initialResult = {
      bugsFound,
      totalBugs: game.config.bugs.length,
      clickedCells: game.clickedCells.length,
      duration: Date.now() - game.startTime,
      endType,
      proofVerified: false,
      verificationInProgress: true,
      onChainVerified: false,
    };

    console.log(
      `Emitting initial gameEnded Full verification event for game ${gameId}`
    );
    this.io.to(gameId).emit("gameEndedFull", {
      gameId,
      result: initialResult,
      endType,
      status: "verifying",
    });

    try {
      console.log("Trying for full verification GS");
      // Full verification (local + on-chain)
      const verificationResult = await this.proofVerifier.verifyGuessFull(
        bugsFound
      );

      // If verification succeeded and there's a contract instance
      let contractResult = null;
      if (
        verificationResult.success &&
        verificationResult.on_chain_verified &&
        contractInstance
      ) {
        try {
          // Call smart contract method
          const tx = await contractInstance.verifyGameResult(
            gameId,
            bugsFound,
            verificationResult.proof_data // Assuming this comes from verification result
          );
          await tx.wait();
          contractResult = tx.hash;
        } catch (contractError) {
          console.error("Contract interaction failed:", contractError);
          // Emit contract failure but don't throw
          this.io.to(gameId).emit("gameEndedFull", {
            gameId,
            status: "contractError",
            error: contractError.message,
          });
        }
      }

      const finalResult = {
        ...initialResult,
        proofVerified: verificationResult.success,
        verificationInProgress: false,
        onChainVerified: verificationResult.on_chain_verified,
        contractTxHash: contractResult,
      };

      this.gameStateManager.updateGame(gameId, {
        isEnded: true,
        endType,
        endTime: Date.now(),
        timeoutId: null,
        result: finalResult,
      });

      console.log(
        `Emitting final gameEnded event with full verification for game ${gameId}`
      );
      this.io.to(gameId).emit("gameEndedFull", {
        gameId,
        result: finalResult,
        endType,
        status: "complete",
      });

      return finalResult;
    } catch (error) {
      // Emit error status
      this.io.to(gameId).emit("gameEndedFull", {
        gameId,
        result: initialResult,
        endType,
        status: "error",
        error: error.message,
      });

      console.error(`Error in full verification for game ${gameId}:`, error);
      throw new Error("Failed to complete full verification");
    }
  }

  async processTransaction(gameId, signedTransaction, address) {
    const game = this.validateGameAccess(gameId, address);

    if (!game.isEnded) {
      throw new Error("Game is still in progress");
    }

    try {
      const txResponse = await this.provider.sendTransaction(signedTransaction);
      await txResponse.wait();
      this.gameStateManager.removeGame(gameId);
      return txResponse.hash;
    } catch (error) {
      throw new Error(`Transaction failed: ${error.message}`);
    }
  }
}

module.exports = GameService;
