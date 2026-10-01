import { World } from './World';
import { Player } from './Player';
import { Simulation } from './Simulation';
import { CameraEquipment } from '../equipment/CameraEquipment';
import { Binoculars } from '../equipment/Binoculars';
import { Weapon } from '../equipment/Weapon';
import { Launcher } from '../equipment/Launcher';
import { LockOn } from './Lock';
import { Equipment } from '../equipment/Equipment';
import { LevelDef } from '../data/environments/Level';
import { makeRng } from '../util/rng';
import { Quat } from '../util/quat';

export type EquipId = 'binoculars' | 'camera' | 'rifle' | 'launcher';
const DEG = Math.PI / 180;

export class Game {
  readonly world: World;
  readonly player = new Player();
  readonly sim: Simulation;
  readonly camera = new CameraEquipment();
  readonly binoculars = new Binoculars();
  readonly rifle = new Weapon();
  readonly launcher = new Launcher();
  readonly lock = new LockOn();
  readonly shotRnd: () => number;
  current: Equipment = this.camera;
  onCalibrate?: () => void;

  private t = 0;
  private devHist: Array<{ t: number; q: Quat }> = [];

  constructor(readonly level: LevelDef) {
    this.world = new World(level);
    this.shotRnd = makeRng(level.seed + 99);
    this.sim = new Simulation(this.world, this.player, this.shotRnd);
    this.equip('camera');
    this.player.position.y = this.world.heightAt(0, 0) + this.player.eyeHeight;
  }

  equip(id: EquipId): void {
    const e: Equipment = id === 'rifle' ? this.rifle : id === 'launcher' ? this.launcher : id === 'binoculars' ? this.binoculars : this.camera;
    const p = this.player;
    this.current = e;
    p.minZoom = e.minZoom;
    p.maxZoom = e.maxZoom;
    p.setZoom(e.minZoom); // changing tool resets zoom
  }

  update(dt: number): void {
    this.t += dt;
    this.rifle.tick(performance.now());
    this.launcher.tick(performance.now());
    this.sim.update(dt);
    const p = this.player;

    // Hand shake: crouching steadies, moving shakes.
    const t = this.t;
    const amp = this.current.swayDeg * DEG * (p.crouching ? 0.5 : 1) * (p.speed > 0.1 ? 3 : 1);
    p.swayYaw = (amp * (Math.sin(1.1 * t) + 0.5 * Math.sin(2.3 * t + 1.7))) / 1.5;
    p.swayPitch = (amp * (Math.sin(0.9 * t + 0.6) + 0.5 * Math.sin(2.9 * t + 0.3))) / 1.5;
    // Recoil decay
    const k = Math.exp(-6 * dt);
    p.kickPitch *= k; p.kickYaw *= k;

    p.updateOrientation();

    // Phone orientation history (for aim lag compensation)
    if (p.deviceQuat) {
      this.devHist.push({ t: this.t, q: p.deviceQuat });
      while (this.devHist.length > 0 && this.devHist[0].t < this.t - 1) this.devHist.shift();
    }
  }

  /** View orientation `ago` seconds ago for the phone-sensor part (look stick, sway and recoil stay current). */
  aimOrientation(ago = 0.12): Quat {
    const p = this.player;
    if (!p.deviceQuat || this.devHist.length === 0) return p.orientation;
    const want = this.t - ago;
    let s = this.devHist[0];
    for (const h of this.devHist) { if (h.t <= want) s = h; else break; }
    return p.orientationFor(s.q);
  }

  calibrate(): void {
    this.player.lookYaw = 0;
    this.onCalibrate?.();
  }
}
