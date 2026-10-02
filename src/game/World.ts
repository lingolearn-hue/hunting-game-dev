import { makeRng } from '../util/rng';
import { LevelDef, Prop, PropKind } from '../data/environments/Level';

export type { Prop, PropKind };
export const WORLD_SIZE = 480; // playable area, meters

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Pure simulation data. No rendering dependencies. */
export class World {
  readonly props: Prop[] = [];
  readonly pond: LevelDef['pond'];
  waterLevel = -0.35;
  /** Flat ground height (AR world), or null for the generated terrain. */
  flatY: number | null = null;
  /** Increments when a prop is removed (the renderer hides it). */
  removedVersion = 0;
  /** Buildings hook: blocks movement of the player (forPlayer) or animals. */
  extraBlock: ((x: number, z: number, r: number, forPlayer: boolean) => boolean) | null = null;
  /** Height of a building floor (tower platform) at a point, or null. */
  floorHook: ((x: number, z: number) => number | null) | null = null;

  constructor(readonly level: LevelDef) {
    this.pond = level.pond;
    if (level.flatGround !== undefined) this.setGround(level.flatGround);
    const rnd = makeRng(level.seed);
    const half = WORLD_SIZE / 2 - 4;
    for (const spec of level.props) {
      let placed = 0, tries = 0;
      while (placed < spec.count && tries++ < spec.count * 20) {
        const x = (rnd() * 2 - 1) * half, z = (rnd() * 2 - 1) * half;
        if (Math.hypot(x, z) < spec.minDist) continue;
        if (Math.hypot(x - this.pond.x, z - this.pond.z) < this.pond.r + 1) continue;
        this.props.push({
          kind: spec.kind, x, z, rot: rnd() * Math.PI * 2,
          scale: spec.minScale + rnd() * (spec.maxScale - spec.minScale),
        });
        placed++;
      }
    }
  }

  get seed(): number { return this.level.seed; }

  /** Flat ground at height y (e.g. the floor found by AR hit-testing). There is no water on flat ground. */
  setGround(y: number): void {
    this.flatY = y;
    this.waterLevel = y - 10;
  }

  heightAt(x: number, z: number): number {
    if (this.flatY !== null) return this.flatY;
    const { hillAmp, hillFreq: f } = this.level.terrain;
    const hills = hillAmp * (3.2 * Math.sin(x * 0.028 * f + 1.3) * Math.cos(z * 0.024 * f) + 1.4 * Math.sin((x * 0.07 + z * 0.05) * f));
    const mask = smooth(6, 28, Math.hypot(x, z));
    const d = Math.hypot(x - this.pond.x, z - this.pond.z);
    const pond = 2.6 * (1 - smooth(this.pond.r * 0.6, this.pond.r * 1.9, d));
    // Dry ground never dips into water-level basins (only the pond holds water).
    const floor = this.waterLevel + 0.5;
    return Math.max(hills * mask, floor) - pond;
  }

  /** Collision radius of a prop (0 = passable). */
  radiusOf(p: Prop): number {
    if (p.kind === 'tree') return (this.level.treeStyle === 'container' ? 1.6 : 0.3) * p.scale;
    if (p.kind === 'rock') return 0.6 * p.scale;
    return 0;
  }

  /** Multitool: number of hits a tree or rock takes before it is gone. */
  hitsToGather(p: Prop): number { return Math.max(2, Math.ceil(3 * p.scale)); }

  removeProp(p: Prop): void {
    p.removed = true;
    this.removedVersion++;
  }

  /** Index of a prop in `props` (stable: used to save removed props). */
  indexOf(p: Prop): number { return this.props.indexOf(p); }

  /** Ground the player stands on: terrain, or a tower platform. */
  standHeight(x: number, z: number): number {
    const f = this.floorHook?.(x, z);
    const g = this.heightAt(x, z);
    return f !== null && f !== undefined ? Math.max(g, f) : g;
  }

  /** Animals cannot walk through buildings. */
  blocksAnimal(x: number, z: number, r = 0.6): boolean {
    return this.extraBlock ? this.extraBlock(x, z, r, false) : false;
  }

  /** Within `m` meters of the playable edge. */
  nearEdge(x: number, z: number, m: number): boolean {
    const lim = WORLD_SIZE / 2 - 3 - m;
    return Math.abs(x) > lim || Math.abs(z) > lim;
  }

  /** True if a walker of radius r cannot stand at (x,z): world edge, deep water, trees, rocks. */
  blocksWalker(x: number, z: number, r = 0.35): boolean {
    const lim = WORLD_SIZE / 2 - 3;
    if (Math.abs(x) > lim || Math.abs(z) > lim) return true;
    if (this.heightAt(x, z) < this.waterLevel + 0.1) return true;
    if (this.extraBlock && this.extraBlock(x, z, r, true)) return true;
    for (const p of this.props) {
      if (p.removed) continue;
      const pr = this.radiusOf(p);
      if (pr === 0) continue; // passable (bushes)
      const rad = pr + r;
      const dx = p.x - x, dz = p.z - z;
      if (dx * dx + dz * dz < rad * rad) return true;
    }
    return false;
  }
}
