import { World } from './World';
import { Player } from './Player';
import { Simulation } from './Simulation';
import { CameraEquipment } from '../equipment/CameraEquipment';
import { Binoculars } from '../equipment/Binoculars';
import { Weapon } from '../equipment/Weapon';
import { Launcher } from '../equipment/Launcher';
import { LockOn } from './Lock';
import { Torch } from '../equipment/Torch';
import { MultiTool } from '../equipment/MultiTool';
import { Equipment, Overlay } from '../equipment/Equipment';
import { Progress, ProgressRecord } from './Progress';
import { TECH_BY_ID, techApplies } from '../data/tech';
import { LevelDef } from '../data/environments/Level';
import { makeRng } from '../util/rng';
import { Quat } from '../util/quat';

export type EquipId = 'camera' | 'binoculars' | 'rifle' | 'launcher' | 'torch' | 'multitool';
const DEG = Math.PI / 180;

export class Game {
  readonly world: World;
  readonly player = new Player();
  readonly sim: Simulation;
  readonly camera = new CameraEquipment();
  readonly binoculars = new Binoculars();
  readonly rifle = new Weapon();
  readonly launcher = new Launcher();
  readonly torch = new Torch();
  readonly multitool = new MultiTool();
  readonly progress: Progress;
  readonly lock = new LockOn();
  readonly shotRnd: () => number;
  current: Equipment = this.camera;
  /** Thermal view of the current tool (needs the matching tech). */
  thermalOn = false;
  onCalibrate?: () => void;

  private t = 0;
  private devHist: Array<{ t: number; q: Quat }> = [];

  constructor(readonly level: LevelDef, rec?: ProgressRecord, readonly naturalist = false) {
    this.progress = new Progress(level.id, rec);
    this.progress.applies = (id) => !!TECH_BY_ID[id] && techApplies(TECH_BY_ID[id], level, naturalist);
    if (level.renderer === 'xr') this.progress.unlocked.add('rifle'); // no camera image in WebXR: start with the rifle
    this.world = new World(level);
    this.shotRnd = makeRng(level.seed + 99);
    this.sim = new Simulation(this.world, this.player, this.shotRnd);
    this.player.external = level.renderer === 'xr';
    // Restore the base and the trees/rocks that were cut down earlier
    // (AR levels: the real world differs every session, so nothing is restored there)
    const persistent = !level.renderer || level.renderer === 'synthetic';
    if (persistent) {
      for (const i of this.progress.removedProps) { const pr = this.world.props[i]; if (pr) this.world.removeProp(pr); }
      this.sim.buildings.restore(this.progress.buildings);
      this.sim.buildings.onChange = () => { this.progress.buildings = this.sim.buildings.toRecords(); this.progress.changed(); };
    }
    this.applyTech();
    this.equip(level.renderer === 'xr' ? 'rifle' : 'camera');
    this.player.position.y = this.world.heightAt(0, 0) + this.player.eyeHeight;
  }

  has(tech: string | null): boolean { return this.progress.has(tech); }

  private toolOf(id: EquipId): Equipment {
    return id === 'rifle' ? this.rifle : id === 'launcher' ? this.launcher : id === 'binoculars' ? this.binoculars
      : id === 'torch' ? this.torch : id === 'multitool' ? this.multitool : this.camera;
  }

  /** Tools the player has, in HUD order: camera, binoculars, rifle, rockets, torch, multitool. */
  tools(): EquipId[] {
    const synthetic = !this.level.renderer || this.level.renderer === 'synthetic';
    const cannons = !synthetic && this.has('build.cannon'); // AR levels: the multitool only places autocannons
    if (this.level.renderer === 'xr') {
      const x: EquipId[] = this.naturalist ? [] : ['rifle', ...(this.has('launcher') && this.level.extraEquipment?.includes('launcher') ? ['launcher' as EquipId] : [])];
      return cannons ? [...x, 'multitool'] : x;
    }
    const t: EquipId[] = ['camera'];
    if (this.has('bino')) t.push('binoculars');
    if (!this.naturalist && this.has('rifle')) t.push('rifle');
    if (!this.naturalist && this.level.extraEquipment?.includes('launcher') && this.has('launcher')) t.push('launcher');
    if (synthetic && this.has('torch')) t.push('torch');
    if ((synthetic && this.has('multitool')) || cannons) t.push('multitool');
    return t;
  }

  /** Applies unlocked upgrades to the equipment. Call after buying tech. */
  applyTech(): void {
    this.rifle.magazine = 5 + (this.has('rifle.mag') ? 3 : 0);
    this.rifle.swayDeg = 0.3 * (this.has('rifle.stab') ? 0.6 : 1);
    this.launcher.magazine = 3 + (this.has('launcher.mag') ? 2 : 0);
    this.torch.tier = this.has('torch.led') ? 2 : this.has('torch.electric') ? 1 : 0;
    this.rifle.ammo = Math.min(Math.max(this.rifle.ammo, 0), this.rifle.magazine);
    this.refreshZoom();
  }

  /** Zoom levels of the current tool that are unlocked (WebXR: none, the real camera cannot zoom). */
  availableZooms(): number[] {
    if (this.player.external) return [1];
    const z = this.current.zoomSteps.filter((s) => this.has(s.tech)).map((s) => s.zoom);
    return z.length ? z : [this.current.zoomSteps[0].zoom];
  }

  private refreshZoom(): void {
    const z = this.availableZooms(), p = this.player;
    p.minZoom = z[0]; p.maxZoom = z[z.length - 1];
    p.setZoom(p.zoom);
  }

  /** Next (+1) or previous (-1) unlocked zoom level. */
  stepZoom(dir: number): void {
    const z = this.availableZooms(), p = this.player;
    let i = 0;
    for (let k = 0; k < z.length; k++) if (Math.abs(z[k] - p.zoom) < Math.abs(z[i] - p.zoom)) i = k;
    p.setZoom(z[Math.max(0, Math.min(z.length - 1, i + dir))]);
  }

  /** Overlay of the current tool at the current zoom. */
  currentOverlay(): Overlay { return this.current.overlayAt(this.player.zoom); }

  /** Thermal view tech of the current tool is unlocked (synthetic levels only). */
  thermalAvailable(): boolean {
    if (this.level.renderer && this.level.renderer !== 'synthetic') return false;
    const k = this.current.kind;
    const node = k === 'camera' ? 'cam.thermal' : k === 'binoculars' ? 'bino.thermal' : k === 'weapon' ? 'rifle.thermal' : k === 'launcher' ? 'launcher.thermal' : null;
    return node !== null && this.has(node);
  }

  equip(id: EquipId): void {
    this.current = this.toolOf(id);
    this.thermalOn = false;
    // multitool: gathering on the synthetic levels; in the AR levels it only places autocannons
    const synthetic = !this.level.renderer || this.level.renderer === 'synthetic';
    this.multitool.buildKind = synthetic ? null : this.has('build.cannon2') && !this.has('build.cannon') ? 'cannon2' : 'cannon';
    this.refreshZoom();
    this.player.setZoom(this.availableZooms()[0]); // changing tool resets zoom
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
    // Ground shakes when a big predator charges nearby.
    const th = this.sim.animals.threat(p.position.x, p.position.z);
    if (th && th.animal.state === 'CHARGING' && th.dist < 40) {
      const a = 0.009 * (1 - th.dist / 40) * Math.min(1.5, th.animal.species.bounds.halfLength / 2);
      p.swayPitch += a * Math.sin(t * 47);
      p.swayYaw += a * Math.cos(t * 41);
    }

    // Recoil decay
    const k = Math.exp(-6 * dt);
    p.kickPitch *= k; p.kickYaw *= k;

    if (p.external) { p.swayYaw = p.swayPitch = p.kickYaw = p.kickPitch = 0; } // the real hand shake is real
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
