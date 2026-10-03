import { MapPoint } from './Slam';

export interface MapObject { x: number; z: number; radius: number; height: number; points: number; }

/**
 * Turns the sparse point cloud into obstacles: points 0.25-3 m above the floor are binned into 0.25 m cells
 * (an occupied cell needs 2+ points), connected cells form an object (position, radius, height).
 */
export function extractObjects(points: MapPoint[], floorY: number, cell = 0.25): { objects: MapObject[]; cells: Array<[number, number]> } {
  const bins = new Map<string, { n: number; ix: number; iz: number; hs: number[]; sx: number; sz: number }>();
  for (const p of points) {
    const h = p.X[1] - floorY;
    if (h < 0.25 || h > 3) continue;
    const ix = Math.floor(p.X[0] / cell), iz = Math.floor(p.X[2] / cell), k = `${ix},${iz}`;
    const b = bins.get(k) ?? { n: 0, ix, iz, hs: [], sx: 0, sz: 0 };
    b.n++; b.hs.push(h); b.sx += p.X[0]; b.sz += p.X[2];
    bins.set(k, b);
  }
  const occ = new Map<string, typeof bins extends Map<string, infer V> ? V : never>();
  for (const [k, b] of bins) if (b.n >= 2) occ.set(k, b);
  const seen = new Set<string>(), objects: MapObject[] = [];
  for (const [k, b0] of occ) {
    if (seen.has(k)) continue;
    const stack = [b0], comp: typeof b0[] = [];
    seen.add(k);
    while (stack.length) {
      const b = stack.pop()!;
      comp.push(b);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        const kk = `${b.ix + dx},${b.iz + dz}`, nb = occ.get(kk);
        if (nb && !seen.has(kk)) { seen.add(kk); stack.push(nb); }
      }
    }
    const n = comp.reduce((a, b) => a + b.n, 0);
    if (comp.length < 2 || n < 6) continue; // noise
    const cx = comp.reduce((a, b) => a + b.sx, 0) / n, cz = comp.reduce((a, b) => a + b.sz, 0) / n;
    const hs = comp.flatMap((b) => b.hs).sort((a, b) => a - b);
    const r = Math.max(...comp.map((b) => Math.hypot(b.sx / b.n - cx, b.sz / b.n - cz))) + cell / 2;
    objects.push({ x: cx, z: cz, radius: r, height: hs[Math.floor(hs.length * 0.9)], points: n });
  }
  return { objects, cells: [...occ.values()].map((b) => [b.ix, b.iz] as [number, number]) };
}

/** ASCII PLY (x right, y up, z), with colors. */
export function toPly(points: MapPoint[]): string {
  const lines = ['ply', 'format ascii 1.0', `element vertex ${points.length}`, 'property float x', 'property float y', 'property float z',
    'property uchar red', 'property uchar green', 'property uchar blue', 'end_header'];
  for (const p of points) lines.push(`${p.X[0].toFixed(3)} ${p.X[1].toFixed(3)} ${p.X[2].toFixed(3)} ${p.color[0]} ${p.color[1]} ${p.color[2]}`);
  return lines.join('\n');
}
