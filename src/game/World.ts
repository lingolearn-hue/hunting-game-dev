import { makeRng } from '../util/rng';

export type PropKind = 'tree' | 'bush' | 'rock';
export interface Prop { kind: PropKind; x: number; z: number; scale: number; rot: number; }

export const WORLD_SIZE = 240; // meters
const CLEARING_R = 9;
const POND = { x: 18, z: -28, r: 9 };

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Pure simulation data. No rendering dependencies. */
export class World {
  readonly props: Prop[] = [];
  readonly pond = POND;
  readonly waterLevel = -0.35;

  constructor(readonly seed = 1) {
    const rnd = makeRng(seed);
    const half = WORLD_SIZE / 2 - 4;
    const place = (kind: PropKind, n: number, minS: number, maxS: number, minDist: number) => {
      let placed = 0, tries = 0;
      while (placed < n && tries++ < n * 20) {
        const x = (rnd() * 2 - 1) * half, z = (rnd() * 2 - 1) * half;
        if (Math.hypot(x, z) < minDist) continue;
        if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 1) continue;
        this.props.push({ kind, x, z, scale: minS + rnd() * (maxS - minS), rot: rnd() * Math.PI * 2 });
        placed++;
      }
    };
    place('tree', 700, 0.8, 1.6, CLEARING_R);
    place('bush', 250, 0.6, 1.3, 4);
    place('rock', 80, 0.5, 1.6, 4);
  }

  heightAt(x: number, z: number): number {
    const hills = 3.2 * Math.sin(x * 0.028 + 1.3) * Math.cos(z * 0.024) + 1.4 * Math.sin(x * 0.07 + z * 0.05);
    const mask = smooth(6, 28, Math.hypot(x, z));
    const d = Math.hypot(x - POND.x, z - POND.z);
    const pond = 2.6 * (1 - smooth(POND.r * 0.6, POND.r * 1.9, d));
    return hills * mask - pond;
  }
}
