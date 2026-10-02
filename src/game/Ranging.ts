import { Game } from './Game';
import { rotateVec } from '../util/quat';
import { rayBox } from './Hunting';

export interface Range { dist: number; what: 'animal' | 'object' | 'ground' | 'water'; }

/** Rangefinder: distance along the view center ray to the first animal, prop, water or terrain. */
export function rangeFinder(game: Game, maxDist = 600): Range | null {
  const p = game.player, w = game.world;
  const d = rotateVec(p.orientation, [0, 0, -1]);
  const o: [number, number, number] = [p.position.x, p.position.y, p.position.z];
  let best = maxDist;
  let what: Range['what'] | null = null;

  for (const a of game.sim.animals.list) {
    const h = rayBox(o, d, a);
    if (h && h.t < best) { best = h.t; what = 'animal'; }
  }

  // Props as vertical cylinders (same model as the line-of-sight test)
  const a2 = d[0] * d[0] + d[2] * d[2];
  if (a2 > 1e-9) {
    for (const pr of w.props) {
      if (pr.removed) continue;
      const r = w.radiusOf(pr) || (pr.kind === 'bush' ? 0.8 * pr.scale : 0);
      if (r === 0) continue;
      const ex = o[0] - pr.x, ez = o[2] - pr.z;
      const b = 2 * (ex * d[0] + ez * d[2]);
      const c = ex * ex + ez * ez - r * r;
      const disc = b * b - 4 * a2 * c;
      if (disc < 0) continue;
      const t = (-b - Math.sqrt(disc)) / (2 * a2);
      if (t < 0 || t >= best) continue;
      const y = o[1] + d[1] * t, g = w.heightAt(pr.x, pr.z);
      const top = pr.kind === 'tree' ? (w.level.treeStyle === 'container' ? 2.6 : w.level.treeStyle === 'palm' ? 7 : 7) : pr.kind === 'bush' ? 0.9 : 0.5;
      if (y >= g && y <= g + top * pr.scale) { best = t; what = 'object'; }
    }
  }

  // Water surface (pond)
  if (d[1] < -1e-6) {
    const t = (w.waterLevel - o[1]) / d[1];
    if (t > 0 && t < best && Math.hypot(o[0] + d[0] * t - w.pond.x, o[2] + d[2] * t - w.pond.z) < w.pond.r * 1.9) { best = t; what = 'water'; }
  }

  // Terrain: march, then refine
  let prev = 0;
  for (let t = 2; t < best; t += 2) {
    const x = o[0] + d[0] * t, z = o[2] + d[2] * t;
    if (w.heightAt(x, z) >= o[1] + d[1] * t) {
      let lo = prev, hi = t;
      for (let i = 0; i < 6; i++) {
        const m = (lo + hi) / 2;
        if (w.heightAt(o[0] + d[0] * m, o[2] + d[2] * m) >= o[1] + d[1] * m) hi = m; else lo = m;
      }
      best = hi; what = 'ground';
      break;
    }
    prev = t;
  }
  return what ? { dist: best, what } : null;
}
