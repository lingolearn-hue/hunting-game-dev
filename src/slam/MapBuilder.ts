import { MapPoint } from './Slam';

/** ASCII PLY (x right, y up, z), with colors; detected walls and boxes are listed as comments. */
export function toPly(points: MapPoint[], comments: string[] = []): string {
  const lines = ['ply', 'format ascii 1.0', ...comments.map((c) => `comment ${c}`), `element vertex ${points.length}`, 'property float x', 'property float y', 'property float z',
    'property uchar red', 'property uchar green', 'property uchar blue', 'end_header'];
  for (const p of points) lines.push(`${p.X[0].toFixed(3)} ${p.X[1].toFixed(3)} ${p.X[2].toFixed(3)} ${p.color[0]} ${p.color[1]} ${p.color[2]}`);
  return lines.join('\n');
}
