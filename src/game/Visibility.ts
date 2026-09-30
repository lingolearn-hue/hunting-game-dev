import { World } from './World';

type V3 = [number, number, number];

/** True if the segment from -> to is blocked by terrain or props (simple cylinder model). */
export function isBlocked(world: World, from: V3, to: V3): boolean {
  const dx = to[0] - from[0], dz = to[2] - from[2];
  const len2 = dx * dx + dz * dz || 1e-6;

  // Terrain
  for (let i = 1; i < 16; i++) {
    const t = i / 16;
    const x = from[0] + dx * t, z = from[2] + dz * t;
    if (world.heightAt(x, z) > from[1] + (to[1] - from[1]) * t - 0.05) return true;
  }

  // Props as vertical cylinders: [radius, y0, y1] in units of prop scale.
  for (const p of world.props) {
    const t = Math.max(0, Math.min(1, ((p.x - from[0]) * dx + (p.z - from[2]) * dz) / len2));
    const cx = from[0] + dx * t, cz = from[2] + dz * t;
    const d = Math.hypot(p.x - cx, p.z - cz);
    const rayY = from[1] + (to[1] - from[1]) * t;
    const s = p.scale;
    const parts: Array<[number, number, number]> =
      p.kind === 'tree'
        ? (world.level.treeStyle === 'palm' ? [[0.25, 0, 6], [2.0, 5.6, 7.0]] : [[0.25, 0, 3], [0.9, 3, 7]])
      : p.kind === 'bush' ? [[0.8, 0, 0.9]]
      : [[0.6, 0, 0.5]];
    let ground: number | null = null;
    for (const [r, y0, y1] of parts) {
      if (d > r * s) continue;
      if (ground === null) ground = world.heightAt(p.x, p.z);
      if (rayY >= ground + y0 * s && rayY <= ground + y1 * s) return true;
    }
  }
  return false;
}
