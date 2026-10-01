export interface Input { x: number; z: number; block: boolean; sprint: boolean }
export type GameEvent = { type: string; id?: number; [key: string]: unknown };
export interface Fighter {
  character: string;
  _inputX: number;
  _inputZ: number;
  hp: number;
  [key: string]: unknown;
}
export interface Match {
  phase: string;
  fighters: Fighter[];
  events: GameEvent[];
  [key: string]: unknown;
}
export interface Combat {
  createMatch(options: { multiplayer: true; seed: number; arena: string; characters: string[] }): Match;
  stepPlayers(state: Match, dt: number, inputs: Input[]): Match;
  act(state: Match, playerId: number, action: string): boolean;
  snapshot(state: Match): Record<string, unknown>;
  arenas: Record<string, unknown>;
  characters: Record<string, unknown>;
  moves: Record<string, unknown>;
}
