import { Game } from './Game';
import { Animal } from './Animal';
import { project } from './view';
import { isBlocked } from './Visibility';

export interface ScoreBreakdown {
  size: number;        // 0-30
  framing: number;     // 0-20
  composition: number; // 0-15
  visibility: number;  // 0-15
  posture: number;     // 0-10
  awareness: number;   // 0-5
  lighting: number;    // 0-5
  quality: number;     // multiplier 0.6-1
}

export interface ShotResult {
  animalId: number | null;
  species: string | null;
  speciesName: string | null;
  distance: number;
  total: number; // 0-100
  breakdown: ScoreBreakdown | null;
}

const POSTURE: Record<Animal['state'], number> = { ALERT: 10, MOVING: 8, IDLE: 7, FORAGING: 5, FLEEING: 4 };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const MAX_DIST = 150;

function lighting(hour: number): number {
  if ((hour >= 5.5 && hour < 8.5) || (hour >= 16.5 && hour < 19.5)) return 5; // golden hours
  if (hour >= 8.5 && hour < 16.5) return 3;
  return 1;
}

function scoreAnimal(game: Game, a: Animal, aspect: number): { total: number; breakdown: ScoreBreakdown; dist: number } | null {
  const p = game.player, cam = p.position;
  const dist = Math.hypot(a.position.x - cam.x, a.position.z - cam.z);
  if (dist > MAX_DIST) return null;

  // Bounding box corners (length along heading, width, height incl. head).
  const fx = -Math.sin(a.direction), fz = -Math.cos(a.direction);
  const rx = Math.cos(a.direction), rz = -Math.sin(a.direction);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const B = a.species.bounds;
  for (const l of [-B.halfLength, B.halfLength]) for (const w of [-B.halfWidth, B.halfWidth]) for (const h of [0, B.height]) {
    const n = project(cam, p.orientation, p.zoom, aspect, [
      a.position.x + fx * l + rx * w, a.position.y + h, a.position.z + fz * l + rz * w,
    ]);
    if (!n) return null;
    minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
    minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
  }
  const area = (maxX - minX) * (maxY - minY);
  const ix = Math.max(0, Math.min(maxX, 1) - Math.max(minX, -1));
  const iy = Math.max(0, Math.min(maxY, 1) - Math.max(minY, -1));
  const inFrame = area > 0 ? (ix * iy) / area : 0;
  if (inFrame < 0.25) return null;

  // Visibility: 3 sample points, blocked by terrain/props.
  const from: [number, number, number] = [cam.x, cam.y, cam.z];
  const samples: Array<[number, number, number]> = [
    [a.position.x, a.position.y + B.height * 0.5, a.position.z],
    [a.position.x + fx * B.halfLength * 0.6, a.position.y + B.height * 0.75, a.position.z + fz * B.halfLength * 0.6],
    [a.position.x - fx * B.halfLength * 0.5, a.position.y + B.height * 0.55, a.position.z - fz * B.halfLength * 0.5],
  ];
  const visible = samples.filter((s) => !isBlocked(game.world, from, s)).length / samples.length;
  if (visible === 0) return null;

  const hs = (maxY - minY) / 2; // fraction of frame height
  const size = 30 * (hs <= 0.85 ? clamp(hs / 0.25, 0, 1) : clamp(1 - (hs - 0.85) / 0.3, 0, 1));
  // A tiny speck in the frame earns little from the other factors.
  const k = clamp(hs / 0.15, 0, 1);
  const framing = 20 * inFrame * k;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const dMin = Math.min(...[[0, 0], [-1 / 3, -1 / 3], [1 / 3, -1 / 3], [-1 / 3, 1 / 3], [1 / 3, 1 / 3]]
    .map(([x, y]) => Math.hypot(cx - x, cy - y)));
  const composition = 15 * (1 - clamp(dMin / 0.7, 0, 1)) * k;
  const visibility = 15 * visible * k;
  const posture = POSTURE[a.state] * k;
  const awareness = 5 * (1 - a.awareness) * k;
  const light = lighting(game.sim.timeOfDay) * k;
  const quality = game.camera.quality(p.zoom);

  const total = Math.round((size + framing + composition + visibility + posture + awareness + light) * quality);
  const r = (v: number) => Math.round(v * 10) / 10;
  return {
    total, dist,
    breakdown: {
      size: r(size), framing: r(framing), composition: r(composition), visibility: r(visibility),
      posture: r(posture), awareness: r(awareness), lighting: r(light), quality: r(quality),
    },
  };
}

/** Scores the current view. Picks the best-scoring animal in frame. */
export function scorePhoto(game: Game, aspect: number): ShotResult {
  let best: (ReturnType<typeof scoreAnimal> & { animal: Animal }) | null = null;
  for (const a of game.sim.animals.list) {
    const s = scoreAnimal(game, a, aspect);
    if (s && (!best || s.total > best.total)) best = { ...s, animal: a };
  }
  if (!best) return { animalId: null, species: null, speciesName: null, distance: 0, total: 0, breakdown: null };
  return {
    animalId: best.animal.id, species: best.animal.species.id, speciesName: best.animal.species.name,
    distance: Math.round(best.dist), total: best.total, breakdown: best.breakdown,
  };
}
