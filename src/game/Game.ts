import { World } from './World';
import { Player } from './Player';
import { Simulation } from './Simulation';
import { CameraEquipment } from '../equipment/CameraEquipment';
import { LevelDef } from '../data/environments/Level';

export class Game {
  readonly world: World;
  readonly player = new Player();
  readonly sim: Simulation;
  readonly camera = new CameraEquipment();
  onCalibrate?: () => void;

  constructor(readonly level: LevelDef) {
    this.world = new World(level);
    this.sim = new Simulation(this.world, this.player);
    this.player.maxZoom = this.camera.maxZoom;
    this.player.position.y = this.world.heightAt(0, 0) + this.player.eyeHeight;
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
