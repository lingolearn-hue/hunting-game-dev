import { Game } from './Game';
import { Animal } from './Animal';
import { rotateVec } from '../util/quat';
import { project } from './view';
import { isBlocked } from './Visibility';

export type LockState = 'none' | 'locking' | 'locked';

/** Target acquisition for the seeker rockets: keep a target in the lock cone with clear line of sight. */
export class LockOn {
  state: LockState = 'none';
  progress = 0;                       // 0..1
  target: Animal | null = null;
  ndc: { x: number; y: number } | null = null;
  distance = 0;

  reset(): void {
    this.state = 'none'; this.progress = 0; this.target = null; this.ndc = null; this.distance = 0;
  }

  update(game: Game, dt: number, aspect: number, active: boolean): void {
    if (!active) { if (this.state !== 'none') this.reset(); return; }
    const L = game.launcher, p = game.player;
    const fwd = rotateVec(p.orientation, [0, 0, -1]);
    const eye: [number, number, number] = [p.position.x, p.position.y, p.position.z];

    let best: Animal | null = null, bestAng = Infinity;
    for (const a of game.sim.animals.list) {
      if (a.state === 'DEAD') continue;
      const c: [number, number, number] = [a.position.x, a.position.y + a.species.bounds.height * 0.5, a.position.z];
      const v = [c[0] - eye[0], c[1] - eye[1], c[2] - eye[2]];
      const dist = Math.hypot(v[0], v[1], v[2]);
      if (dist > L.range || dist < 3) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, (fwd[0] * v[0] + fwd[1] * v[1] + fwd[2] * v[2]) / dist)));
      const cone = ((this.target === a ? 2 : 1) * L.lockConeDeg * Math.PI) / 180; // hysteresis once tracking
      if (ang > cone || ang >= bestAng) continue;
      if (isBlocked(game.world, eye, c)) continue;
      best = a; bestAng = ang;
    }

    if (best) {
      if (best !== this.target) { this.target = best; this.progress = 0; }
      this.progress = Math.min(1, this.progress + dt / L.lockTime);
    } else if (this.target) {
      this.progress -= dt / 0.5; // lock decays when the target is lost
      if (this.progress <= 0 || this.target.state === 'DEAD') { this.reset(); return; }
    }

    if (!this.target) { this.state = 'none'; this.ndc = null; return; }
    this.state = this.progress >= 1 ? 'locked' : 'locking';
    const t = this.target;
    const c: [number, number, number] = [t.position.x, t.position.y + t.species.bounds.height * 0.5, t.position.z];
    this.ndc = project(p.position, p.orientation, p.zoom, aspect, c);
    this.distance = Math.round(Math.hypot(c[0] - eye[0], c[1] - eye[1], c[2] - eye[2]));
  }
}
