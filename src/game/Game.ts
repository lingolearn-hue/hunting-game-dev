import { World } from './World';
import { Player, EYE_HEIGHT } from './Player';
import { Simulation } from './Simulation';

export class Game {
  readonly world = new World(1);
  readonly player = new Player();
  readonly sim = new Simulation(this.world, this.player);
  onCalibrate?: () => void;

  constructor() {
    this.player.position.y = this.world.heightAt(0, 0) + EYE_HEIGHT;
  }

  update(dt: number): void {
    this.sim.update(dt);
    this.player.updateOrientation();
  }

  calibrate(): void {
    this.player.lookYaw = 0;
    this.onCalibrate?.();
  }
}
