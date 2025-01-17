// middlewares/stateValidation.js
class StateValidationError extends Error {
  constructor(message, currentState, expectedStates) {
    super(message);
    this.name = "StateValidationError";
    this.currentState = currentState;
    this.expectedStates = expectedStates;
  }
}

const createStateValidationMiddleware = (gameService) => {
  return (actionName) => async (req, res, next) => {
    const gameId = req.params.gameId || req.body.gameId;
    if (!gameId) {
      return next(); // Skip validation if no gameId (for create-game, etc.)
    }

    try {
      await gameService.validateApiCall(gameId, actionName);
      // Add current state to request object for use in routes
      req.gameState = gameService.getGameState(gameId);
      next();
    } catch (error) {
      const currentState = gameService.getGameState(gameId);
      const expectedStates =
        gameService.API_VALIDATION_RULES[actionName]?.validStates;

      console.error(
        `State validation failed for ${actionName}:`,
        error.message
      );
      res.status(409).json({
        error: error.message,
        currentState,
        expectedStates,
        validActions: gameService.getValidActions(currentState),
      });
    }
  };
};

module.exports = createStateValidationMiddleware;
