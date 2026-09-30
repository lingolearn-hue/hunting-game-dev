import { Game } from '../game/Game';

/** Renderer abstraction. Synthetic now, AR later (Phase 7). */
export interface Renderer {
  init(container: HTMLElement, game: Game): void;
  resize(): void;
  render(game: Game): void;
  aspect(): number;
  /** Renders and captures the current view as a JPEG blob. */
  capture(game: Game): Promise<Blob | null>;
}
