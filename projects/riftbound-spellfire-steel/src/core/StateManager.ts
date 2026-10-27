// State manager: one active top-level game state (title, mission, cinematic …)
// plus an optional pause overlay flag. States receive enter/exit/update/render calls.

export interface GameState {
  readonly name: string;
  enter(params?: unknown): void;
  exit(): void;
  update(dt: number): void;
  render(dt: number): void;
}

export class StateManager {
  private states = new Map<string, GameState>();
  current: GameState | null = null;
  paused = false;
  onChange: ((name: string) => void) | null = null;

  register(state: GameState): void {
    this.states.set(state.name, state);
  }

  get(name: string): GameState | undefined {
    return this.states.get(name);
  }

  change(name: string, params?: unknown): void {
    const next = this.states.get(name);
    if (!next) throw new Error(`Unknown state: ${name}`);
    if (this.current) this.current.exit();
    this.paused = false;
    this.current = next;
    next.enter(params);
    if (this.onChange) this.onChange(name);
  }

  is(name: string): boolean {
    return !!this.current && this.current.name === name;
  }

  update(dt: number): void {
    if (this.current && !this.paused) this.current.update(dt);
  }

  render(dt: number): void {
    if (this.current) this.current.render(dt);
  }
}
