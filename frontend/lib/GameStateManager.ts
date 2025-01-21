class GameStateManager {
  private static instance: GameStateManager;
  private currentState: string = "CREATED";
  private validActions: string[] = [];
  private stateChangeCallbacks: ((state: string) => void)[] = [];
  private gameId: string | null = null;

  private constructor() {}

  static getInstance(): GameStateManager {
    if (!GameStateManager.instance) {
      GameStateManager.instance = new GameStateManager();
    }
    return GameStateManager.instance;
  }

  setGameId(gameId: string) {
    this.gameId = gameId;
  }

  updateState(state: string, actions: string[]) {
    console.log(`Updating state to ${state} with actions:`, actions);
    const oldState = this.currentState;
    this.currentState = state;
    this.validActions = actions;

    if (oldState !== state) {
      console.log(
        `[GameStateManager] State changed from ${oldState} to ${state}`
      );
      this.stateChangeCallbacks.forEach((callback) => callback(state));
    }
  }

  getCurrentState(): string {
    console.log(`Current State: ${this.currentState}`);
    return this.currentState;
  }

  getValidActions(): string[] {
    console.log(`Current State: ${this.validActions}`);
    return [...this.validActions];
  }

  onStateChange(callback: (state: string) => void) {
    console.log("Adding state change listener");
    this.stateChangeCallbacks.push(callback);
    // Return the callback for easy removal
    return callback;
  }

  removeStateChangeListener(callback: (state: string) => void) {
    console.log("Removing state change listener");
    const index = this.stateChangeCallbacks.indexOf(callback);
    if (index > -1) {
      this.stateChangeCallbacks.splice(index, 1);
      return true;
    }
    return false;
  }

  isActionValid(action: string): boolean {
    const isValid = this.validActions.includes(action);

    console.log(`[GameStateManager] Checking if action "${action}" is valid:`, {
      currentState: this.currentState,
      validActions: this.validActions,
      isValid,
    });
    return isValid;
  }

  // Optional: method to clear all listeners
  clearStateChangeListeners() {
    console.log("Clearing all state change listeners");
    this.stateChangeCallbacks = [];
  }

  // Optional: Debug method to check number of active listeners
  getListenerCount(): number {
    return this.stateChangeCallbacks.length;
  }

  reset() {
    console.log("[GameStateManager] Resetting state");
    this.currentState = "CREATED";
    this.validActions = [];
    this.gameId = null;
    this.clearStateChangeListeners();
  }
}

export const gameStateManager = GameStateManager.getInstance();
