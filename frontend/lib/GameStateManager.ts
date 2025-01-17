class GameStateManager {
  private static instance: GameStateManager;
  private currentState: string = "CREATED";
  private validActions: string[] = [];
  private stateChangeCallbacks: ((state: string) => void)[] = [];

  private constructor() {}

  static getInstance(): GameStateManager {
    if (!GameStateManager.instance) {
      GameStateManager.instance = new GameStateManager();
    }
    return GameStateManager.instance;
  }

  updateState(state: string, actions: string[]) {
    console.log(`Updating state to ${state} with actions:`, actions);
    this.currentState = state;
    this.validActions = actions;
    this.stateChangeCallbacks.forEach((callback) => callback(state));
  }

  getCurrentState(): string {
    return this.currentState;
  }

  getValidActions(): string[] {
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
    return this.validActions.includes(action);
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
}

export const gameStateManager = GameStateManager.getInstance();
