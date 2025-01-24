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
      GAME_DURATION: 5000, // 35 seconds
      LEVELS_PER_ROUND: 2,
      MAX_ROUNDS: 1,

      // Difficulty increases with each level
      DIFFICULTY_SCALING: {
        GRID_SIZE_INCREMENT: 2, // Grid size increases by 2 each level
        // BUG_INCREMENT: 1, // Number of bugs increases by 1 each level
        TIME_DECREMENT: 5000, // Time decreases by 5 seconds each level
      },
    };

    this.VALID_STATES = {
      CREATED: "CREATED",
      LEVEL_STARTED: "LEVEL_STARTED",
      LEVEL_ENDED: "LEVEL_ENDED",
      ROUND_COMPLETE: "ROUND_COMPLETE",
      GAME_COMPLETE: "GAME_COMPLETE",
    };

    this.API_VALIDATION_RULES = {
      startLevel: {
        validStates: ["CREATED", "LEVEL_ENDED", "ROUND_COMPLETE"],
        errorMessage: "Cannot start level in current game state",
      },
      handleClick: {
        validStates: ["LEVEL_STARTED"],
        errorMessage: "Cannot process clicks until level is started",
      },
      endLevel: {
        validStates: ["LEVEL_STARTED"],
        errorMessage: "Cannot end level that hasn't started",
      },
      endGame: {
        validStates: ["LEVEL_ENDED", "ROUND_COMPLETE", "GAME_COMPLETE"],
        errorMessage: "Cannot end game in current state",
      },
    };
  }

  getValidActions(state) {
    return Object.entries(this.API_VALIDATION_RULES)
      .filter(([_, rule]) => rule.validStates.includes(state))
      .map(([action]) => action);
  }

  validateStateTransition(currentState, nextState) {
    const validTransitions = {
      [this.VALID_STATES.CREATED]: [this.VALID_STATES.LEVEL_STARTED],
      [this.VALID_STATES.LEVEL_STARTED]: [
        this.VALID_STATES.LEVEL_ENDED,
        this.VALID_STATES.ROUND_COMPLETE,
        this.VALID_STATES.GAME_COMPLETE,
      ],
      [this.VALID_STATES.LEVEL_ENDED]: [this.VALID_STATES.LEVEL_STARTED],
      [this.VALID_STATES.ROUND_COMPLETE]: [
        this.VALID_STATES.LEVEL_STARTED,
        this.VALID_STATES.GAME_COMPLETE,
      ],
      [this.VALID_STATES.GAME_COMPLETE]: [],
    };

    return validTransitions[currentState]?.includes(nextState) ?? false;
  }

  validateApiCall(gameId, actionName) {
    const game = this.gameStateManager.getGame(gameId);
    if (!game) {
      throw new Error("Game not found");
    }

    const currentState = game.state || this.VALID_STATES.CREATED;
    console.log(
      `[validateApiCall] Game state: ${currentState}, Action: ${actionName}`
    );

    const validationRule = this.API_VALIDATION_RULES[actionName];

    if (!validationRule) {
      // If no validation rule exists for this action, allow it
      return true;
    }

    if (!validationRule.validStates.includes(currentState)) {
      throw new Error({
        message: validationRule.errorMessage,
        currentState,
        expectedStates: validationRule.validStates,
        code: "INVALID_STATE",
      });
    }

    return true;
  }

  async updateGameWithStateValidation(gameId, updates) {
    // console.log(
    //   `[updateGameWithStateValidation updates: ${JSON.stringify(updates)}`
    // );
    const game = this.gameStateManager.getGame(gameId);
    // console.log(
    //   `[updateGameWithStateValidation] game: ${JSON.stringify(game)}`
    // );
    if (!game) {
      throw new Error("Game not found");
    }

    // Validate state transition if state is being updated
    if (
      updates.state &&
      !this.validateStateTransition(game.state, updates.state)
    ) {
      throw new Error(
        `Invalid state transition from ${game.state} to ${updates.state}`
      );
    }

    console.log(
      `[updateGameWithStateValidation] updating game with update state: ${updates.state}`
    );
    const updateGame = this.gameStateManager.updateGame(gameId, updates);

    // console.log(
    //   `[updateGameWithStateValidation] updateGame: ${JSON.stringify(
    //     updateGame
    //   )}`
    // );
    return updateGame;
  }

  // Helper method to validate game access
  validateGameAccess(gameId, address) {
    const game = this.gameStateManager.getGame(gameId);
    // console.log(`[validateGameAccess] game`);

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
      state: this.VALID_STATES.CREATED,
    };

    this.gameStateManager.createGame(gameId, gameState);
    return gameId;
  }

  generateGameConfig(level) {
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
    console.log(`[startLevel]...`);
    const game = this.validateGameAccess(gameId, address);

    if (
      !this.validateStateTransition(game.state, this.VALID_STATES.LEVEL_STARTED)
    ) {
      throw new Error(
        `Invalid state transition from ${game.state} to ${this.VALID_STATES.LEVEL_STARTED}`
      );
    }

    // Initialize level and round if not defined
    if (!game.currentLevel) game.currentLevel = 1;
    if (!game.currentRound) game.currentRound = 1;

    if (game.currentLevel > this.GAME_CONFIG.LEVELS_PER_ROUND) {
      throw new Error("Round is complete");
    }

    // Initialize level configuration
    const gameConfig = this.generateGameConfig(game.currentLevel);

    if (!address?.startsWith("guest_")) {
      try {
        await this.proofVerifier.setSecret(gameConfig.bugs.length);
      } catch (error) {
        throw new Error(
          `Failed to initialize level verification: ${error.message}`
        );
      }
    }

    const startTime = Date.now();
    const updates = {
      config: gameConfig,
      startTime,
      endTime: startTime + gameConfig.gameDuration,
      clickedCells: [],
      isEnded: false,
      currentLevel: game.currentLevel,
      currentRound: game.currentRound,
      state: this.VALID_STATES.LEVEL_STARTED,
    };

    const updatedGame = await this.updateGameWithStateValidation(
      gameId,
      updates
    );
    this.setGameEndTimer(gameId, gameConfig.gameDuration);

    // Emit state change event
    this.io.to(gameId).emit("stateChanged", {
      gameId,
      newState: this.VALID_STATES.LEVEL_STARTED,
      validActions: this.getValidActions(this.VALID_STATES.LEVEL_STARTED),
    });

    console.log(`[startLevel] GS state: ${updates.state}`);
    return {
      gameId,
      gridSize: gameConfig.gridSize,
      bugs: gameConfig.bugs,
      numBugs: gameConfig.bugs.length,
      startTime: updates.startTime,
      duration: gameConfig.gameDuration / 1000,
      currentLevel: game.currentLevel,
      currentRound: game.currentRound,
      state: updatedGame.state,
    };
  }

  async endLevel(gameId, endType = "timeout") {
    console.log(
      `[endLevel] Starting level end for game ${gameId}. Type: ${endType}`
    );
    const game = this.gameStateManager.getGame(gameId);

    if (!game || game.isEnded) {
      console.log(`[endLevel] Game ${gameId} already ended or not found`);
      return null;
    }

    if (
      !this.validateStateTransition(game.state, this.VALID_STATES.LEVEL_ENDED)
    ) {
      throw new Error(
        `Invalid state transition from ${game.state} to ${this.VALID_STATES.LEVEL_ENDED}`
      );
    }

    // Calculate level statistics
    const bugsFound = game.clickedCells.filter((cell) =>
      game.config.bugs.some((bug) => bug.x === cell.x && bug.y === cell.y)
    ).length;

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

    const isRoundComplete =
      game.currentLevel >= this.GAME_CONFIG.LEVELS_PER_ROUND;
    const isGameComplete =
      isRoundComplete && game.currentRound >= this.GAME_CONFIG.MAX_ROUNDS;

    const currentRoundStats = [...(game.roundStats || [])];
    currentRoundStats.push(levelResult);
    // console.log(
    //   `Current round stats after adding level: ${JSON.stringify(
    //     currentRoundStats
    //   )}`
    // );

    // First update the game state to LEVEL_ENDED
    // await this.updateGameWithStateValidation(gameId, {
    //   isEnded: true,
    //   roundStats: [...(game.roundStats || []), levelResult],
    //   totalScore: (game.totalScore || 0) + levelScore,
    //   state: this.VALID_STATES.LEVEL_ENDED,
    // });
    // First transition to LEVEL_ENDED
    let nextState = this.VALID_STATES.LEVEL_ENDED;
    const initialUpdates = {
      isEnded: true,
      roundStats: [...(game.roundStats || []), levelResult],
      totalScore: (game.totalScore || 0) + levelScore,
      state: nextState,
    };

    console.log(`[endLevel] level result: ${JSON.stringify(levelResult)}`);

    // Handle round/game completion
    if (isGameComplete) {
      console.log(`[endLevel] isGameComplete condition met`);
      await this.completeGame(gameId, {
        ...initialUpdates,
        state: this.VALID_STATES.GAME_COMPLETE,
      });
      nextState = this.VALID_STATES.GAME_COMPLETE;
    } else if (isRoundComplete) {
      console.log(`[endLevel] isRoundComplete condition met`);
      console.log(
        `[endLevel] round stats: ${JSON.stringify(initialUpdates.roundStats)}`
      );

      const roundUpdates = {
        ...initialUpdates,
        state: this.VALID_STATES.ROUND_COMPLETE,
        currentLevel: 1,
        currentRound: game.currentRound + 1,
      };
      // console.log(`[endLevel] Pre-completeRound updates:`, roundUpdates);

      await this.completeRound(gameId, roundUpdates);
      nextState = this.VALID_STATES.ROUND_COMPLETE;
    } else {
      console.log(`[endLevel] else condition met`);

      await this.updateGameWithStateValidation(gameId, {
        ...initialUpdates,
        currentLevel: game.currentLevel + 1,
      });
    }

    const updatedGame = this.gameStateManager.getGame(gameId);
    console.log(
      `Updated game stats: ${JSON.stringify(updatedGame.roundStats)}`
    );

    // Emit events
    this.io.to(gameId).emit("stateChanged", {
      gameId,
      newState: nextState,
      validActions: this.getValidActions(nextState),
    });

    this.io.to(gameId).emit("levelEnded", {
      gameId,
      result: levelResult,
      state: nextState,
      validActions: this.getValidActions(nextState),
      isRoundComplete,
      isGameComplete,
      currentRound: game.currentRound + 1,
      endType,
    });

    return {
      ...levelResult,
      state: nextState,
      isRoundComplete,
      isGameComplete,
    };
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
      state: this.VALID_STATES.LEVEL_STARTED,
    };

    // Update game state
    await this.updateGameWithStateValidation(gameId, updates);

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
        console.log(`[setGameEndTimer] timeout for game ${gameId}`);
        const currentGame = this.gameStateManager.getGame(gameId);
        // Only attempt to end level if in correct state
        if (currentGame.state === this.VALID_STATES.LEVEL_STARTED) {
          console.log(`[setGameEndTimer] running this.endLevel`);
          await this.endLevel(gameId, "timeout");
        } else {
          console.log(
            `[setGameEndTimer] Skipping level end - invalid state: ${currentGame.state}`
          );
        }
      } catch (error) {
        console.error(`[setGameEndTimer] Error ending game ${gameId}:`, error);
      }
    }, duration);
  }

  async handleClick(gameId, x, y, address) {
    const game = this.validateGameAccess(gameId, address);

    if (game.state !== this.VALID_STATES.LEVEL_STARTED) {
      throw new Error("Can only click cells when level is in progress");
    }

    const timePassed = Date.now() - game.startTime;

    if (game.isEnded || timePassed >= game.config.gameDuration) {
      throw new Error("Level has ended");
    }

    game.clickedCells.push({ x, y });
    console.log(`[handleClick] pushed clicked cells`);
    await this.updateGameWithStateValidation(gameId, address);

    console.log(`[handleClick] updated game state`);
    return {
      success: true,
      state: game.state,
    };
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
      state: this.VALID_STATES.GAME_COMPLETE,
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

      await this.updateGameWithStateValidation(gameId, {
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

      await this.updateGameWithStateValidation(gameId, {
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

      await this.updateGameWithStateValidation(gameId, {
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

  async completeRound(gameId, updates) {
    const game = this.gameStateManager.getGame(gameId);
    console.log(`[completeRound] Updates:`, updates);

    if (
      !this.validateStateTransition(
        game.state,
        this.VALID_STATES.ROUND_COMPLETE
      )
    ) {
      throw new Error(
        `Invalid state transition from ${game.state} to ${this.VALID_STATES.ROUND_COMPLETE}`
      );
    }

    const roundUpdates = {
      ...updates,
      state: this.VALID_STATES.ROUND_COMPLETE,
    };

    // Update game state with round completion
    const updatedGame = await this.updateGameWithStateValidation(
      gameId,
      roundUpdates
    );

    // console.log(
    //   `[completeRound] After update - roundStats:`,
    //   updatedGame.roundStats
    // );

    const roundStats = {
      round: game.currentRound,
      totalScore: updates.totalScore,
      levels: updatedGame.roundStats,
    };

    this.io.to(gameId).emit("roundComplete", {
      gameId,
      roundStats,
      nextRound: updates.currentRound,
      totalScore: updates.totalScore,
      state: this.VALID_STATES.ROUND_COMPLETE,
      validActions: this.getValidActions(this.VALID_STATES.ROUND_COMPLETE),
    });
  }

  async completeGame(gameId, updates) {
    const game = this.gameStateManager.getGame(gameId);

    if (
      !this.validateStateTransition(game.state, this.VALID_STATES.GAME_COMPLETE)
    ) {
      throw new Error(
        `Invalid state transition from ${game.state} to ${this.VALID_STATES.GAME_COMPLETE}`
      );
    }

    // const gameStats = {
    //   totalRounds: game.currentRound,
    //   finalScore: updates.totalScore,
    //   roundStats: [...(game.roundStats || [])],
    //   totalPlayTime: Date.now() - game.startTime,
    // };

    const finalUpdates = {
      ...updates,
      gameComplete: true,
      // finalScore: updates.totalScore,
      state: this.VALID_STATES.GAME_COMPLETE,
    };

    // console.log(`[completeGame] finalUpdates:`, finalUpdates);

    // Update final game state
    // await this.updateGameWithStateValidation(gameId, finalUpdates);

    // // Calculate final game statistics
    // const gameStats = {
    //   totalRounds: game.currentRound,
    //   finalScore: updates.totalScore,
    //   roundStats: game.roundStats,
    //   totalPlayTime: Date.now() - game.startTime,
    // };

    // For web3 users, verify the final score
    if (!game.address.startsWith("guest_")) {
      try {
        const verificationResult = await this.proofVerifier.verifyGuessFull(
          gameStats.finalScore
        );
        gameStats.verified = verificationResult.success;
        gameStats.onChainVerified = verificationResult.on_chain_verified;
      } catch (error) {
        console.error("Final score verification failed:", error);
        gameStats.verified = false;
        gameStats.verificationError = error.message;
      }
    }

    await this.updateGameWithStateValidation(gameId, finalUpdates);

    console.log("Socket emitting gameComplete event");
    // Emit game completion event

    this.io.to(gameId).emit("gameComplete", {
      gameId,
      gameStats: finalUpdates.roundStats,
      finalScore: finalUpdates.totalScore,
      state: this.VALID_STATES.GAME_COMPLETE,
      validActions: this.getValidActions(this.VALID_STATES.GAME_COMPLETE),
    });

    // Clean up game resources
    if (game.timeoutId) {
      clearTimeout(game.timeoutId);
    }

    // Optional: Remove game from state after a delay
    setTimeout(() => {
      this.gameStateManager.removeGame(gameId);
    }, 5000);
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

  getGameState(gameId) {
    const game = this.gameStateManager.getGame(gameId);
    if (!game) throw new Error("Game not found");
    return game.state || this.VALID_STATES.CREATED;
  }
  async waitForState(gameId, targetState, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const game = this.gameStateManager.getGame(gameId);
      if (!game) reject(new Error("Game not found"));

      if (game.state === targetState) {
        resolve(true);
        return;
      }

      const timeoutId = setTimeout(() => {
        this.io.off(`stateChanged-${gameId}`, stateChangeHandler);
        reject(new Error("State wait timeout"));
      }, timeout);

      const stateChangeHandler = (data) => {
        if (data.gameId === gameId && data.newState === targetState) {
          clearTimeout(timeoutId);
          this.io.off(`stateChanged-${gameId}`, stateChangeHandler);
          resolve(true);
        }
      };

      this.io.on(`stateChanged-${gameId}`, stateChangeHandler);
    });
  }
}

module.exports = GameService;
