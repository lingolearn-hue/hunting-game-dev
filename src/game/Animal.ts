import { SpeciesDef } from '../data/species/SpeciesDef';
import { World, WORLD_SIZE } from './World';

export type AnimalState = 'IDLE' | 'FORAGING' | 'MOVING' | 'ALERT' | 'FLEEING';
export interface Vec3 { x: number; y: number; z: number; }
export interface AnimalContext {
  world: World;
  player: { position: Vec3; speed: number; crouching: boolean };
  hour: number;
  rnd: () => number;
}

const LIMIT = WORLD_SIZE / 2 - 6;
const wrap = (a: number) => {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
};
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Simulation entity. No rendering dependencies. Heading convention: forward = (-sin h, -cos h). */
export class Animal {
  position: Vec3;
  direction: number;        // heading (yaw, rad)
  speed = 0;                // m/s
  age: number;
  sex: 'M' | 'F';
  health = 100;
  awareness = 0;            // 0..1
  state: AnimalState = 'IDLE';
  activitySchedule: Array<[number, number]>;
  habitat: string;

  private timer = 2;
  private target: { x: number; z: number } | null = null;
  private fleeHeading = 0;

  constructor(readonly id: number, readonly species: SpeciesDef, x: number, z: number, world: World, rnd: () => number) {
    this.position = { x, y: world.heightAt(x, z), z };
    this.direction = rnd() * Math.PI * 2;
    this.age = 1 + Math.floor(rnd() * 10);
    this.sex = rnd() < 0.5 ? 'M' : 'F';
    this.activitySchedule = species.activity;
    this.habitat = species.habitat;
    this.timer = 1 + rnd() * 4;
  }

  activityAt(hour: number): number {
    return this.activitySchedule.some(([a, b]) => hour >= a && hour < b) ? 1 : 0.4;
  }

  update(dt: number, ctx: AnimalContext): void {
    const p = ctx.player.position;
    const dx = p.x - this.position.x, dz = p.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    this.updateAwareness(dt, dist, ctx.player.speed, ctx.player.crouching);
    const desired = this.updateState(dt, dx, dz, ctx);
    const accel = this.state === 'FLEEING' ? 15 : 6;
    this.speed += clamp(desired - this.speed, -accel * dt, accel * dt);
    this.move(dt, ctx);
    this.position.y = ctx.world.heightAt(this.position.x, this.position.z);
  }

  /** Simple detection: distance, close range, player movement. (Visibility/wind/noise later.) */
  private updateAwareness(dt: number, dist: number, playerSpeed: number, crouching: boolean): void {
    const sp = this.species;
    let rate = 0;
    if (dist < sp.viewRange) {
      // Moving is noticed more; crouching (stationary or moving) is stealthier.
      const stealth = playerSpeed > 0.1 ? (crouching ? 1.6 : 2.5) : (crouching ? 0.6 : 1);
      rate = (1 - dist / sp.viewRange) * sp.detectRate * stealth;
    }
    if (dist < sp.closeRange) rate += 0.6;
    this.awareness = clamp(this.awareness + (rate - sp.awarenessDecay) * dt, 0, 1);
  }

  private set(state: AnimalState, timer: number): void {
    this.state = state;
    this.timer = timer;
  }

  /** Returns desired speed. */
  private updateState(dt: number, dx: number, dz: number, ctx: AnimalContext): number {
    const sp = this.species;
    const towardPlayer = Math.atan2(-dx, -dz);

    if (this.state !== 'FLEEING') {
      if (this.awareness >= 1 && sp.reaction === 'flee') {
        this.fleeHeading = Math.atan2(dx, dz) + (ctx.rnd() - 0.5) * 0.8;
        this.set('FLEEING', sp.fleeDuration[0] + ctx.rnd() * (sp.fleeDuration[1] - sp.fleeDuration[0]));
      } else if (this.awareness >= sp.alertThreshold && this.state !== 'ALERT') {
        this.set('ALERT', 0);
      } else if (this.state === 'ALERT' && this.awareness < 0.2) {
        this.set('IDLE', 2 + ctx.rnd() * 3);
      }
    }

    this.timer -= dt;
    switch (this.state) {
      case 'IDLE':
        if (this.timer <= 0) this.pickNext(ctx);
        return 0;
      case 'FORAGING':
        if (this.timer <= 0) this.set('IDLE', this.idleTime(ctx));
        return sp.foragingSpeed;
      case 'MOVING': {
        if (!this.target) { this.set('IDLE', this.idleTime(ctx)); return 0; }
        const tx = this.target.x - this.position.x, tz = this.target.z - this.position.z;
        const want = Math.atan2(-tx, -tz);
        const diff = wrap(want - this.direction);
        this.direction += clamp(diff, -2 * dt, 2 * dt);
        if (Math.hypot(tx, tz) < 1.5 || this.timer <= 0) {
          this.target = null;
          this.set('IDLE', this.idleTime(ctx));
          return 0;
        }
        return Math.abs(diff) < 0.6 ? sp.walkSpeed : sp.walkSpeed * 0.3;
      }
      case 'ALERT':
        this.direction += clamp(wrap(towardPlayer - this.direction), -4 * dt, 4 * dt);
        return 0;
      case 'FLEEING':
        this.direction += clamp(wrap(this.fleeHeading - this.direction), -6 * dt, 6 * dt);
        if (this.timer <= 0) {
          this.awareness = 0.3;
          this.set('IDLE', 3 + ctx.rnd() * 3);
          return 0;
        }
        return sp.runSpeed;
    }
  }

  private idleTime(ctx: AnimalContext): number {
    return (2 + ctx.rnd() * 5) / this.activityAt(ctx.hour);
  }

  private pickNext(ctx: AnimalContext): void {
    if (ctx.rnd() < 0.5) {
      this.set('FORAGING', 5 + ctx.rnd() * 7);
      return;
    }
    for (let i = 0; i < 8; i++) {
      const a = ctx.rnd() * Math.PI * 2, d = 10 + ctx.rnd() * 25;
      const x = this.position.x + Math.cos(a) * d, z = this.position.z + Math.sin(a) * d;
      if (Math.abs(x) > LIMIT || Math.abs(z) > LIMIT) continue;
      if (ctx.world.heightAt(x, z) < ctx.world.waterLevel + 0.3) continue;
      // Stay near the play area: never wander farther out than 90 m (or the current radius).
      if (Math.hypot(x, z) > Math.max(90, Math.hypot(this.position.x, this.position.z))) continue;
      this.target = { x, z };
      this.set('MOVING', 40);
      return;
    }
    this.set('IDLE', this.idleTime(ctx));
  }

  private move(dt: number, ctx: AnimalContext): void {
    if (this.speed < 0.001) return;
    const nx = this.position.x - Math.sin(this.direction) * this.speed * dt;
    const nz = this.position.z - Math.cos(this.direction) * this.speed * dt;
    const blocked = Math.abs(nx) > LIMIT || Math.abs(nz) > LIMIT ||
      ctx.world.heightAt(nx, nz) < ctx.world.waterLevel + 0.15;
    if (!blocked) { this.position.x = nx; this.position.z = nz; return; }
    if (this.state === 'FLEEING') {
      const turn = ctx.rnd() < 0.5 ? 1.2 : -1.2;
      this.fleeHeading += turn;
      this.direction += turn;
    } else {
      this.target = null;
      this.speed = 0;
      this.set('IDLE', 2);
    }
  }
}
