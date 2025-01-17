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
    this.stateChangeCallbacks.push(callback);
  }

  isActionValid(action: string): boolean {
    return this.validActions.includes(action);
  }
}

export const gameStateManager = GameStateManager.getInstance();
