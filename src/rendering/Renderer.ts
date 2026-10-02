import { Game } from '../game/Game';

/** Renderer abstraction. Synthetic now, AR later (Phase 7). */
export interface Renderer {
  init(container: HTMLElement, game: Game): void;
  resize(): void;
  render(game: Game): void;
  aspect(): number;
  /** Renderers that own the frame loop (WebXR) take over it. Returns true if the loop was started. */
  runLoop?(cb: (now: number) => void): boolean;
  /** Renders and captures the current view as a JPEG blob. */
  capture(game: Game): Promise<Blob | null>;
}
