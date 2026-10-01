import { Game } from './Game';
import { Animal } from './Animal';
import { rotateVec } from '../util/quat';
import { isBlocked } from './Visibility';

type V3 = [number, number, number];
export type Zone = 'head' | 'vital' | 'body' | 'tail';

export interface ShotOutcome {
  hit: boolean;
  blocked: boolean;        // an obstacle stopped the bullet
  animalId: number | null;
  species: string | null;
  speciesName: string | null;
  zone: Zone | null;
  distance: number;
  damage: number;
  killed: boolean;
  /** For misses: nearest animal and how the shot passed it. */
  near: { name: string; meters: number; where: 'high' | 'low' | 'left' | 'right' } | null;
}

const HIT_TOLERANCE = 0.12; // m, forgiving hit box
const ZONE_MUL: Record<Zone, number> = { head: 1.5, vital: 1.0, body: 0.35, tail: 0.1 };

/** Ray vs the animal's oriented bounding box. Returns distance t and normalized hit position (f: front=+1, v: height 0..1). */
export function rayBox(o: V3, d: V3, a: Animal, tol = 0): { t: number; f: number; v: number } | null {
  const B = a.species.bounds;
  const c = Math.cos(a.direction), s = Math.sin(a.direction);
  const local = (x: number, z: number): [number, number] => [x * c - z * s, x * s + z * c];
  const [ox, oz] = local(o[0] - a.position.x, o[2] - a.position.z);
  const oy = o[1] - a.position.y;
  const [dx, dz] = local(d[0], d[2]);
  const dy = d[1];
  let t0 = 0, t1 = Infinity;
  const slab = (p: number, dv: number, lo: number, hi: number): boolean => {
    if (Math.abs(dv) < 1e-9) return p >= lo && p <= hi;
    let n = (lo - p) / dv, f = (hi - p) / dv;
    if (n > f) [n, f] = [f, n];
    t0 = Math.max(t0, n); t1 = Math.min(t1, f);
    return t0 <= t1;
  };
  if (!slab(ox, dx, -B.halfWidth - tol, B.halfWidth + tol) || !slab(oy, dy, -tol, B.height + tol) || !slab(oz, dz, -B.halfLength - tol, B.halfLength + tol)) return null;
  return { t: t0, f: -(oz + dz * t0) / B.halfLength, v: (oy + dy * t0) / B.height };
}

function zoneOf(a: Animal, f: number, v: number): Zone {
  if (f > 0.6 && v > 0.55) return 'head';
  if (a.species.look.tail === 'long' && f < -0.5) return 'tail';
  if (f > -0.3 && f <= 0.6 && v >= 0.25 && v <= 0.75) return 'vital';
  return 'body';
}

/** Launches a seeker rocket along the view direction. Homes in on the locked target, if any. */
export function fireRocket(game: Game): Animal | null {
  const p = game.player;
  const fwd = rotateVec(game.aimOrientation(), [0, 0, -1]);
  const from: V3 = [p.position.x + fwd[0], p.position.y - 0.25 + fwd[1], p.position.z + fwd[2]];
  const target = game.lock.state === 'locked' ? game.lock.target : null;
  game.sim.rockets.launch(from, fwd, target);
  p.kickPitch += 0.03;
  game.sim.animals.noise(p.position.x, p.position.z);
  return target;
}

/** Fires the rifle along the view center (with sway, recoil and random spread). Applies damage and noise. */
export function fireShot(game: Game): ShotOutcome {
  const p = game.player, w = game.rifle, r = game.shotRnd;
  // Aim from a moment before the trigger press: pressing the button jolts a phone held for sensor aiming.
  const q = game.aimOrientation();
  const fwd = rotateVec(q, [0, 0, -1]), right = rotateVec(q, [1, 0, 0]), up = rotateVec(q, [0, 1, 0]);
  const spread = (w.spreadDeg * Math.PI) / 180 * Math.sqrt(r());
  const ang = r() * Math.PI * 2;
  const sx = Math.cos(ang) * spread, sy = Math.sin(ang) * spread;
  const d: V3 = [fwd[0] + right[0] * sx + up[0] * sy, fwd[1] + right[1] * sx + up[1] * sy, fwd[2] + right[2] * sx + up[2] * sy];
  const n = Math.hypot(d[0], d[1], d[2]);
  d[0] /= n; d[1] /= n; d[2] /= n;
  const from: V3 = [p.position.x, p.position.y, p.position.z];

  // Recoil
  p.kickPitch += 0.02;
  p.kickYaw += (r() - 0.5) * 0.01;

  let best: { a: Animal; t: number; f: number; v: number } | null = null;
  for (const a of game.sim.animals.list) {
    if (a.state === 'DEAD') continue;
    const h = rayBox(from, d, a, HIT_TOLERANCE);
    if (h && h.t <= w.range && (!best || h.t < best.t)) best = { a, ...h };
  }

  const miss: ShotOutcome = { hit: false, blocked: false, animalId: null, species: null, speciesName: null, zone: null, distance: 0, damage: 0, killed: false, near: null };
  let out = miss;
  if (best) {
    const hp: V3 = [from[0] + d[0] * best.t, from[1] + d[1] * best.t, from[2] + d[2] * best.t];
    if (isBlocked(game.world, from, hp)) {
      out = { ...miss, blocked: true };
    } else {
      const zone = zoneOf(best.a, best.f, best.v);
      const falloff = best.t <= w.effectiveRange ? 1 : Math.max(0.3, 1 - ((best.t - w.effectiveRange) / (w.range - w.effectiveRange)) * 0.7);
      const damage = Math.round(w.damage * ZONE_MUL[zone] * falloff);
      const killed = best.a.hit(damage, p.position, r);
      out = {
        hit: true, blocked: false, animalId: best.a.id, species: best.a.species.id, speciesName: best.a.species.name,
        zone, distance: Math.round(best.t), damage, killed, near: null,
      };
    }
  }
  if (!out.hit && !out.blocked) {
    // Report how the shot passed the closest animal (feedback for aiming).
    let bestOff = 8;
    for (const a of game.sim.animals.list) {
      if (a.state === 'DEAD') continue;
      const c: V3 = [a.position.x, a.position.y + a.species.bounds.height * 0.5, a.position.z];
      const t = (c[0] - from[0]) * d[0] + (c[1] - from[1]) * d[1] + (c[2] - from[2]) * d[2];
      if (t <= 0 || t > w.range) continue;
      const off: V3 = [from[0] + d[0] * t - c[0], from[1] + d[1] * t - c[1], from[2] + d[2] * t - c[2]];
      const m = Math.hypot(off[0], off[1], off[2]);
      if (m >= bestOff) continue;
      bestOff = m;
      const dx = off[0] * right[0] + off[1] * right[1] + off[2] * right[2];
      const dy = off[0] * up[0] + off[1] * up[1] + off[2] * up[2];
      out = { ...miss, near: { name: a.species.name, meters: Math.round(m * 10) / 10, where: Math.abs(dy) >= Math.abs(dx) ? (dy > 0 ? 'high' : 'low') : (dx > 0 ? 'right' : 'left') } };
    }
  }
  game.sim.animals.noise(p.position.x, p.position.z);
  return out;
}
