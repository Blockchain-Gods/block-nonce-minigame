const express = require("express");
const router = express.Router();

function setupGameRoutes(gameService, io, validateGameState) {
  // Socket.io connection handling
  io.on("connection", (socket) => {
    console.log("Client connected");

    socket.on("joinGame", (gameId) => {
      try {
        socket.join(gameId);
        console.log(`Client joined game room: ${gameId}`);

        const currentState = gameService.getGameState(gameId);
        const validActions = gameService.getValidActions(currentState);

        console.log(`Sending initial state to client:`, {
          state: currentState,
          validActions,
        });

        socket.emit("gameState", {
          gameId,
          state: currentState,
          validActions,
        });
      } catch (error) {
        socket.emit("error", {
          message: error.message,
        });
      }
    });

    socket.on("requestGameState", (gameId) => {
      const currentState = gameService.getGameState(gameId);
      const validActions = gameService.getValidActions(currentState);
      socket.emit("gameState", {
        gameId,
        state: currentState,
        validActions,
      });
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected");
    });
  });

  // Create a new game
  router.post("/create-game", async (req, res) => {
    const { address } = req.body;

    try {
      const gameId = await gameService.createGame(address);
      console.log(`GameId: ${gameId}`);

      // Emit initial game state
      io.to(gameId).emit("gameState", {
        gameId,
        state: gameService.VALID_STATES.CREATED,
        validActions: ["startLevel"],
      });

      res.json({ gameId });
    } catch (error) {
      if (error.message.includes("already has active game")) {
        const gameId =
          gameService.gameStateManager.activePlayerGames.get(address);
        return res.status(409).json({
          error: error.message,
          gameId,
          currentState: gameService.getGameState(gameId),
        });
      }
      res.status(400).json({ error: error.message });
    }
  });

  // Start game
  router.post(
    "/start-game/:gameId",
    validateGameState("startLevel"),
    async (req, res) => {
      const { gameId } = req.params;
      const { address } = req.body;
      console.log("Router trying to start the game");

      try {
        const game = gameService.gameStateManager.getGame(gameId);
        if (!game) {
          throw new Error("Game not found");
        }

        const gameData = await gameService.startLevel(gameId, address);

        // Game state is now LEVEL_STARTED
        io.to(gameId).emit("gameState", {
          gameId,
          state: gameService.VALID_STATES.LEVEL_STARTED,
          validActions: ["handleClick", "endLevel"],
        });

        res.json({
          ...gameData,
          currentRound: game.currentRound,
          currentLevel: game.currentLevel,
          totalScore: game.totalScore || 0,
          state: req.gameState,
        });
      } catch (error) {
        console.error(`Error starting game: ${error.message}`);
        res.status(400).json({ error: error.message });
      }
    }
  );

  router.post(
    "/start-level/:gameId",
    validateGameState("startLevel"),
    async (req, res) => {
      const { gameId } = req.params;
      const { address } = req.body;
      try {
        console.log("Starting level...");
        const gameData = await gameService.startLevel(gameId, address);

        // Emit state change
        io.to(gameId).emit("gameState", {
          gameId,
          state: gameService.VALID_STATES.LEVEL_STARTED,
          validActions: ["handleClick", "endLevel"],
        });

        console.log(`Starting level with data: \n${JSON.stringify(gameData)}`);
        res.json({ ...gameData, state: req.gameState });
      } catch (error) {
        console.error(`Error starting level: ${error.message}`);
        res.status(400).json({ error: error.message });
      }
    }
  );

  // Handle cell clicks
  router.post("/click", validateGameState("handleClick"), async (req, res) => {
    const { gameId, x, y, address } = req.body;

    try {
      const result = await gameService.handleClick(gameId, x, y, address);
      res.json({
        ...result,
        state: req.gameState,
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // End current level
  router.post("/end-level", validateGameState("endLevel"), async (req, res) => {
    const { gameId, address } = req.body;

    try {
      console.log("GRou Ending level");
      const result = await gameService.endLevel(gameId, "manual");

      // Determine next state based on game progress
      const nextState = result.roundComplete
        ? result.gameComplete
          ? gameService.VALID_STATES.GAME_COMPLETE
          : gameService.VALID_STATES.ROUND_COMPLETE
        : gameService.VALID_STATES.LEVEL_ENDED;

      console.log(`GRou ending result: ${JSON.stringify(result)}`);

      // Emit state change with appropriate next valid actions
      io.to(gameId).emit("gameState", {
        gameId,
        state: nextState,
        validActions: gameService.getValidActions(nextState),
      });

      io.to(gameId).emit("levelEnded", {
        gameId,
        result,
        roundComplete: result.currentLevel === 1,
        currentRound: result.currentRound,
        state: nextState,
        nextValidActions: gameService.getValidActions(nextState),
      });

      res.json({
        success: true,
        gameId,
        result,
        state: nextState,
      });
    } catch (error) {
      console.error(`Error ending level for game ${gameId}:`, error);
      res.status(500).json({ error: error.message });
    }
  });

  // End entire game
  router.post("/end-game", validateGameState("endGame"), async (req, res) => {
    const { gameId, address } = req.body;

    try {
      const result = await gameService.endGame(gameId, "manual");

      // Final state emission
      io.to(gameId).emit("gameState", {
        gameId,
        state: gameService.VALID_STATES.GAME_COMPLETE,
        validActions: [], // No more actions available after game completion
      });

      io.to(gameId).emit("gameEnded", {
        gameId,
        result,
        state: gameService.VALID_STATES.GAME_COMPLETE,
      });

      res.json({
        success: true,
        gameId,
        result,
        state: gameService.VALID_STATES.GAME_COMPLETE,
      });
    } catch (error) {
      console.error(`Error ending game ${gameId}:`, error);
      res.status(500).json({ error: error.message });
    }
  });

  // If the user request full verification after successful local verification
  router.post("/end-game/full", async (req, res) => {
    const { gameId, address } = req.body;
    const contractAddress = "";

    try {
      console.log("BE- trying for full verification");

      let contractInstance = null;
      if (contractAddress) {
        contractInstance = new ethers.Contract(
          contractAddress,
          VERIFIER_CONTRACT_ABI,
          provider
        );
      }

      const result = await gameService.endGameWithFullVerification(
        gameId,
        "manual"
      );
      console.log(`Result: ${JSON.stringify(result)}`);

      res.json({
        success: true,
        gameId,
        result,
      });
    } catch (error) {
      console.error(
        `Error ending game with full verification ${gameId}:`,
        error
      );
      res.status(500).json({ error: error.message });
    }
  });

  // Get game state
  router.get("/game-state/:gameId", async (req, res) => {
    const { gameId } = req.params;
    const { address } = req.query;

    try {
      const game = gameService.validateGameAccess(gameId, address);
      const currentState = gameService.getGameState(gameId);
      // console.log(`Router stats: ${JSON.stringify(game)} `);
      res.json({
        ...game,
        currentRound: game.currentRound || 1,
        currentLevel: game.currentLevel || 1,
        totalScore: game.totalScore || 0,
        roundStats: game.roundStats || [],
        currentState,
        validActions: gameService.getValidActions(currentState),
      });
    } catch (error) {
      res
        .status(error.message.includes("Not authorized") ? 403 : 404)
        .json({ error: error.message });
    }
  });

  // Get game result
  router.get("/game-result/:gameId", (req, res) => {
    const { gameId } = req.params;
    const game = gameService.gameStateManager.getGame(gameId);

    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }

    if (!game.isEnded) {
      return res.status(400).json({ error: "Game is still in progress" });
    }

    res.json(game.result);
  });

  // Check for active game
  router.get("/active-game/:address", (req, res) => {
    const { address } = req.params;

    if (!gameService.gameStateManager.hasActiveGame(address)) {
      return res.json({ hasActiveGame: false });
    }

    const gameId = gameService.gameStateManager.activePlayerGames.get(address);
    const game = gameService.gameStateManager.getGame(gameId);

    res.json({
      hasActiveGame: true,
      gameId,
      remainingTime: game.config?.gameDuration - (Date.now() - game.startTime),
    });
  });

  // Get player stats
  router.get("/stats", (req, res) => {
    try {
      const { address } = req.query;

      if (!address) {
        return res.status(400).json({ error: "Address is required" });
      }

      console.log(`Getting stats for address: ${address}`);

      const stats = gameService.gameStateManager.getPlayerStats(address);
      console.log(`Retrieved stats:`, stats);

      if (!stats) {
        return res.status(404).json({ error: "Stats not found for address" });
      }

      res.json(stats);
    } catch (error) {
      console.error("Error getting player stats:", error);
      res.status(500).json({ error: "Failed to retrieve player stats" });
    }
  });

  return router;
}

module.exports = setupGameRoutes;
