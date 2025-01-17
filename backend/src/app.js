const express = require("express");
const cors = require("cors");
const ethers = require("ethers");
const config = require("./config/config");
const GameStateManager = require("./services/GameStateManager");
const ProofVerifier = require("./services/ProofVerifier");
const GameService = require("./services/GameService");
const setupGameRoutes = require("./routes/gameRoutes");
const { validateAddress } = require("./middlewares/auth");
const createStateValidationMiddleware = require("./middlewares/stateValidation");
const http = require("http");
const { Server } = require("socket.io");
const cookieParser = require("cookie-parser");

const app = express();
const server = http.createServer(app);

const CORS_ORIGIN =
  process.env.NODE_ENV === "production"
    ? [
        "https://vercel-block-nonce-minigame.vercel.app",
        "https://nonce-game.blockchaingods.io",
      ]
    : ["http://localhost:3000"];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps, curl requests)
      if (!origin) return callback(null, true);

      if (CORS_ORIGIN.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        console.log("Blocked origin:", origin);
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["set-cookie"],
    optionsSuccessStatus: 204,
  })
);

// Middleware
app.use(express.json());
app.use(cookieParser());

const io = new Server(server, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ["GET", "POST"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  },
});

// app.use((req, res, next) => {
//   console.log(`${req.method} ${req.path} - Origin: ${req.headers.origin}`);
//   next();
// });
// Setup services
const provider = ethers.getDefaultProvider(config.network);
const gameStateManager = new GameStateManager();
const proofVerifier = new ProofVerifier(config.rustServerUrl);
const gameService = new GameService(
  gameStateManager,
  proofVerifier,
  provider,
  io
);

const validateGameState = createStateValidationMiddleware(gameService);

// Socket.io state change handling
io.on("connection", (socket) => {
  socket.on("joinGame", (gameId) => {
    socket.join(gameId);
    // Send initial state to client
    const currentState = gameService.getGameState(gameId);
    socket.emit("gameState", {
      gameId,
      state: currentState,
      validActions: Object.entries(gameService.API_VALIDATION_RULES)
        .filter(([_, rule]) => rule.validStates.includes(currentState))
        .map(([action]) => action),
    });
  });
});

// Apply auth middleware globally
app.use(validateAddress);

// Setup routes with the new game service
app.use("/api/game", setupGameRoutes(gameService, io, validateGameState));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);

  // Handle specific error types
  if (err.name === "StateValidationError") {
    return res.status(409).json({
      error: err.message,
      currentState: err.currentState,
      expectedStates: err.expectedStates,
      validActions: Object.entries(gameService.API_VALIDATION_RULES)
        .filter(([_, rule]) => rule.validStates.includes(err.currentState))
        .map(([action]) => action),
    });
  }

  if (err.name === "ValidationError") {
    return res.status(400).json({ error: err.message });
  }

  if (err.name === "AuthorizationError") {
    return res.status(403).json({ error: err.message });
  }

  // Default error
  res.status(500).json({
    error:
      config.nodeEnv === "production" ? "Something went wrong!" : err.message,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

module.exports = { app, server, io };
