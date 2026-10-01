import { World } from './World';
import { AnimalManager } from './AnimalManager';
import { Animal } from './Animal';
import { isBlocked } from './Visibility';

type V3 = [number, number, number];

export interface Rocket {
  id: number;
  pos: V3;
  dir: V3;          // unit vector
  speed: number;
  age: number;
  target: Animal | null;
  trail: V3[];
  done: boolean;
}
export interface Explosion { x: number; y: number; z: number; age: number; }
export interface BlastHit { animal: Animal; damage: number; killed: boolean; }
export interface BlastResult { x: number; y: number; z: number; hits: BlastHit[]; }

const TURN_RATE = 1.6;   // rad/s: limits how sharply a rocket can chase an evasive target
const MAX_SPEED = 60;    // m/s
const BLAST_RADIUS = 7;  // m
const BLAST_DAMAGE = 250;
const MAX_AGE = 8;       // s, self-destruct

const center = (a: Animal): V3 => [a.position.x, a.position.y + a.species.bounds.height * 0.5, a.position.z];
const norm = (v: V3): V3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

/** Seeker rockets: proportional homing with a limited turn rate, proximity fuze, splash damage. */
export class RocketSystem {
  rockets: Rocket[] = [];
  explosions: Explosion[] = [];
  private results: BlastResult[] = [];
  private nextId = 1;

  constructor(private world: World, private animals: AnimalManager, private rnd: () => number) {}

  launch(from: V3, dir: V3, target: Animal | null): void {
    this.rockets.push({ id: this.nextId++, pos: [...from], dir: norm(dir), speed: 25, age: 0, target, trail: [], done: false });
  }

  drainResults(): BlastResult[] { return this.results.splice(0); }

  update(dt: number): void {
    for (const r of this.rockets) this.step(r, dt);
    this.rockets = this.rockets.filter((r) => !r.done);
    for (const e of this.explosions) e.age += dt;
    this.explosions = this.explosions.filter((e) => e.age < 1);
  }

  private step(r: Rocket, dt: number): void {
    r.age += dt;
    r.speed = Math.min(MAX_SPEED, 25 + r.age * 60);

    // Homing: turn toward the target, at most TURN_RATE rad/s.
    if (r.target && r.target.state !== 'DEAD') {
      const c = center(r.target);
      const want = norm([c[0] - r.pos[0], c[1] - r.pos[1], c[2] - r.pos[2]]);
      const dot = Math.max(-1, Math.min(1, r.dir[0] * want[0] + r.dir[1] * want[1] + r.dir[2] * want[2]));
      const ang = Math.acos(dot), max = TURN_RATE * dt;
      const t = ang <= max ? 1 : max / ang;
      r.dir = norm([r.dir[0] * (1 - t) + want[0] * t, r.dir[1] * (1 - t) + want[1] * t, r.dir[2] * (1 - t) + want[2] * t]);
    } else {
      r.target = null;
    }

    const step = r.speed * dt;
    const p1: V3 = [r.pos[0] + r.dir[0] * step, r.pos[1] + r.dir[1] * step, r.pos[2] + r.dir[2] * step];

    // Proximity fuze: closest approach to any living animal along this step.
    for (const a of this.animals.list) {
      if (a.state === 'DEAD') continue;
      const c = center(a);
      const seg: V3 = [p1[0] - r.pos[0], p1[1] - r.pos[1], p1[2] - r.pos[2]];
      const u = Math.max(0, Math.min(1, ((c[0] - r.pos[0]) * seg[0] + (c[1] - r.pos[1]) * seg[1] + (c[2] - r.pos[2]) * seg[2]) / (step * step || 1)));
      const q: V3 = [r.pos[0] + seg[0] * u, r.pos[1] + seg[1] * u, r.pos[2] + seg[2] * u];
      if (Math.hypot(q[0] - c[0], q[1] - c[1], q[2] - c[2]) < Math.max(1.2, a.species.bounds.halfLength * 0.7 + 0.4)) {
        this.detonate(r, q);
        return;
      }
    }
    if (isBlocked(this.world, r.pos, p1)) { this.detonate(r, p1); return; }
    if (r.age > MAX_AGE) { this.detonate(r, r.pos); return; }

    r.pos = p1;
    r.trail.push([...p1]);
    if (r.trail.length > 30) r.trail.shift();
  }

  private detonate(r: Rocket, at: V3): void {
    r.done = true;
    this.explosions.push({ x: at[0], y: at[1], z: at[2], age: 0 });
    const hits: BlastHit[] = [];
    for (const a of this.animals.list) {
      if (a.state === 'DEAD') continue;
      const c = center(a);
      const d = Math.hypot(c[0] - at[0], c[1] - at[1], c[2] - at[2]);
      const eff = d - Math.max(0.5, a.species.bounds.halfLength * 0.5);
      if (eff >= BLAST_RADIUS) continue;
      const damage = Math.round(BLAST_DAMAGE * (1 - Math.max(0, eff) / BLAST_RADIUS));
      if (damage <= 0) continue;
      hits.push({ animal: a, damage, killed: a.hit(damage, { x: at[0], z: at[2] }, this.rnd) });
    }
    this.animals.noise(at[0], at[2]);
    this.results.push({ x: at[0], y: at[1], z: at[2], hits });
  }
}
