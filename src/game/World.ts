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
  readonly waterLevel = -0.35;

  constructor(readonly level: LevelDef) {
    this.pond = level.pond;
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

  heightAt(x: number, z: number): number {
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
    for (const p of this.props) {
      const pr = this.radiusOf(p);
      if (pr === 0) continue; // passable (bushes)
      const rad = pr + r;
      const dx = p.x - x, dz = p.z - z;
      if (dx * dx + dz * dz < rad * rad) return true;
    }
    return false;
  }
}
