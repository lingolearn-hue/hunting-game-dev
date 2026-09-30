import { World } from './World';
import { Player } from './Player';

export const STEP = 1 / 30; // fixed timestep, seconds

export class Simulation {
  /** Game time in hours [0,24). Frozen until day/night is implemented (Phase 4). */
  timeOfDay = 10.7;
  timeScale = 0; // game hours per real second
  private acc = 0;

  constructor(readonly world: World, readonly player: Player) {}

  update(dt: number): void {
    this.acc += dt;
    while (this.acc >= STEP) {
      this.step(STEP);
      this.acc -= STEP;
    }
  }

  private step(dt: number): void {
    this.timeOfDay = (this.timeOfDay + this.timeScale * dt) % 24;
    // Phase 2: animals update here.
  }
}
