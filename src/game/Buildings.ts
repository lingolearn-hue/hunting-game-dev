import { World } from './World';
import { AnimalManager } from './AnimalManager';
import { Animal } from './Animal';
import { BuildKind } from '../equipment/MultiTool';
import { BuildingRec } from './Progress';
import { isBlocked } from './Visibility';

type V3 = [number, number, number];

export interface BuildDef {
  name: string;
  tech: string;
  wood: number;
  stone: number;
  /** Footprint half sizes (x along the building, z across) in meters. */
  hx: number;
  hz: number;
  height: number;
  /** Blocks the player? (towers can be walked into to climb). */
  blocksPlayer: boolean;
}

export const BUILD_DEFS: Record<BuildKind, BuildDef> = {
  campfire: { name: 'Campfire', tech: 'build.campfire', wood: 5, stone: 0, hx: 0.7, hz: 0.7, height: 0.6, blocksPlayer: true },
  wall: { name: 'Wall', tech: 'build.wall', wood: 3, stone: 4, hx: 2.0, hz: 0.3, height: 2.5, blocksPlayer: true },
  tower: { name: 'Hunters tower', tech: 'build.tower', wood: 20, stone: 6, hx: 1.5, hz: 1.5, height: 5, blocksPlayer: false },
  cannon: { name: 'Autocannon', tech: 'build.cannon', wood: 10, stone: 15, hx: 0.8, hz: 0.8, height: 1.4, blocksPlayer: true },
  cannon2: { name: 'Heavy autocannon', tech: 'build.cannon2', wood: 20, stone: 40, hx: 1.0, hz: 1.0, height: 1.7, blocksPlayer: true },
};

/** Cost of a structure: wood/stone on the synthetic levels, coins in the AR levels (nothing to gather there). */
export function buildCost(level: { renderer?: string }, kind: BuildKind): { wood: number; stone: number; coins: number } {
  const d = BUILD_DEFS[kind];
  if (level.renderer === 'ar' || level.renderer === 'xr') return { wood: 0, stone: 0, coins: kind === 'cannon2' ? 100 : 40 };
  return { wood: d.wood, stone: d.stone, coins: 0 };
}

export interface Turret { range: number; rate: number; damage: number; }
export const TURRETS: Partial<Record<BuildKind, Turret>> = {
  cannon: { range: 45, rate: 4, damage: 12 },
  cannon2: { range: 70, rate: 2, damage: 45 },
};

export interface Building {
  id: number;
  kind: BuildKind;
  x: number; z: number; y: number;  // y = ground at the base
  rot: number;                       // yaw
  // turrets
  aimYaw: number;
  aimPitch: number;
  cooldown: number;
}
export interface Tracer { a: V3; b: V3; age: number; }

const RADIUS_BLOCK = 0.35; // player radius used for placement checks

/** The player's base: placement rules, collision, tower platforms, turret AI. Buildings cannot be damaged. */
export class BuildingSystem {
  list: Building[] = [];
  tracers: Tracer[] = [];
  /** Increments when buildings are added or removed (the renderer rebuilds). */
  version = 0;
  /** Monsters (or other animals) killed by turrets since last drained. */
  private kills: Animal[] = [];
  onChange?: () => void;
  private arLevel: boolean;

  constructor(private world: World, private animals: AnimalManager, private rnd: () => number) {
    this.arLevel = world.level.renderer === 'ar' || world.level.renderer === 'xr';
    world.extraBlock = (x, z, r, forPlayer) => this.blocks(x, z, r, forPlayer);
    world.floorHook = (x, z) => this.floorAt(x, z);
  }

  drainKills(): Animal[] { return this.kills.splice(0); }

  restore(recs: BuildingRec[]): void {
    for (const r of recs) {
      const kind = r.kind as BuildKind;
      if (BUILD_DEFS[kind]) this.add(kind, r.x, r.z, r.rot, r.id, false);
    }
    this.version++;
  }

  toRecords(): BuildingRec[] {
    return this.list.map((b) => ({ id: b.id, kind: b.kind, x: b.x, z: b.z, rot: b.rot }));
  }

  private add(kind: BuildKind, x: number, z: number, rot: number, id: number, notify = true): Building {
    const b: Building = { id, kind, x, z, y: this.world.heightAt(x, z), rot, aimYaw: rot, aimPitch: 0, cooldown: 0 };
    this.list.push(b);
    this.version++;
    if (notify) this.onChange?.();
    return b;
  }

  /** Is (x,z) with radius r inside the footprint of building b? Oriented box test. */
  private inside(b: Building, x: number, z: number, r: number): boolean {
    const d = BUILD_DEFS[b.kind];
    const c = Math.cos(b.rot), s = Math.sin(b.rot);
    const dx = x - b.x, dz = z - b.z;
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    return Math.abs(lx) < d.hx + r && Math.abs(lz) < d.hz + r;
  }

  blocks(x: number, z: number, r: number, forPlayer: boolean): boolean {
    for (const b of this.list) {
      if (forPlayer && !BUILD_DEFS[b.kind].blocksPlayer) continue;
      if (this.inside(b, x, z, r)) return true;
    }
    return false;
  }

  /** Platform height of a tower at (x,z), if inside its footprint. */
  floorAt(x: number, z: number): number | null {
    for (const b of this.list) {
      if (b.kind === 'tower' && this.inside(b, x, z, 0)) return b.y + BUILD_DEFS.tower.height;
    }
    return null;
  }

  nearCampfire(x: number, z: number, radius: number): boolean {
    return this.list.some((b) => b.kind === 'campfire' && Math.hypot(b.x - x, b.z - z) < radius);
  }

  /** Can this structure be placed here? Not on water, props, other buildings, the player or outside the area. */
  canPlace(kind: BuildKind, x: number, z: number, rot: number, player: { x: number; z: number }): boolean {
    const w = this.world, d = BUILD_DEFS[kind];
    if (w.nearEdge(x, z, 6)) return false;
    if (w.flatY === null && w.heightAt(x, z) < w.waterLevel + 0.3) return false;
    const ext = Math.max(d.hx, d.hz);
    for (const p of w.props) {
      if (p.removed || p.kind === 'bush') continue;
      if (Math.hypot(p.x - x, p.z - z) < w.radiusOf(p) + ext) return false;
    }
    const probe: Building = { id: -1, kind, x, z, y: 0, rot, aimYaw: 0, aimPitch: 0, cooldown: 0 };
    for (const o of this.list) {
      const od = BUILD_DEFS[o.kind];
      if (Math.hypot(o.x - x, o.z - z) < ext + Math.max(od.hx, od.hz) - 0.3) return false;
    }
    if (this.inside(probe, player.x, player.z, RADIUS_BLOCK) && d.blocksPlayer) return false;
    return true;
  }

  /** Places a structure and returns it (the caller pays the cost). */
  place(kind: BuildKind, x: number, z: number, rot: number, id: number): Building {
    return this.add(kind, x, z, rot, id);
  }

  remove(id: number): Building | null {
    const i = this.list.findIndex((b) => b.id === id);
    if (i < 0) return null;
    const [b] = this.list.splice(i, 1);
    this.version++;
    this.onChange?.();
    return b;
  }

  /** Building under the point (x,z), for removal. */
  at(x: number, z: number): Building | null {
    let best: Building | null = null, bd = Infinity;
    for (const b of this.list) {
      const d = Math.hypot(b.x - x, b.z - z);
      if (this.inside(b, x, z, 0.6) && d < bd) { best = b; bd = d; }
    }
    return best;
  }

  /** Turrets shoot night monsters (in the AR levels: the drones and machines) in range with a clear line. */
  update(dt: number): void {
    for (const t of this.tracers) t.age += dt;
    this.tracers = this.tracers.filter((t) => t.age < 0.12);
    for (const b of this.list) {
      const spec = TURRETS[b.kind];
      if (!spec) continue;
      b.cooldown = Math.max(0, b.cooldown - dt);
      const muzzle: V3 = [b.x, b.y + BUILD_DEFS[b.kind].height, b.z];
      let target: Animal | null = null, best = spec.range;
      for (const a of this.animals.list) {
        if (a.state === 'DEAD' || !(a.species.monster || this.arLevel)) continue;
        const d = Math.hypot(a.position.x - b.x, a.position.z - b.z);
        if (d >= best) continue;
        const c: V3 = [a.position.x, a.position.y + a.species.bounds.height * 0.5, a.position.z];
        if (isBlocked(this.world, muzzle, c)) continue;
        target = a; best = d;
      }
      if (!target) continue;
      const c: V3 = [target.position.x, target.position.y + target.species.bounds.height * 0.5, target.position.z];
      const yaw = Math.atan2(-(c[0] - muzzle[0]), -(c[2] - muzzle[2]));
      b.aimYaw = yaw;
      b.aimPitch = Math.atan2(c[1] - muzzle[1], best);
      if (b.cooldown > 0) continue;
      b.cooldown = 1 / spec.rate;
      this.tracers.push({ a: muzzle, b: c, age: 0 });
      if (target.hit(spec.damage, { x: b.x, z: b.z }, this.rnd)) this.kills.push(target);
    }
  }
}
