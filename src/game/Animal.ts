import { SpeciesDef } from '../data/species/SpeciesDef';
import { World, WORLD_SIZE } from './World';
import { isBlocked } from './Visibility';

export type AnimalState = 'IDLE' | 'FORAGING' | 'MOVING' | 'ALERT' | 'FLEEING' | 'STALKING' | 'CHARGING' | 'DEAD';
export interface Vec3 { x: number; y: number; z: number; }
export interface CallEvent { species: SpeciesDef; x: number; y: number; z: number; }
export interface AnimalContext {
  world: World;
  player: { position: Vec3; speed: number; crouching: boolean; vulnerable: boolean };
  hour: number;
  rnd: () => number;
  events: CallEvent[];
  attacks: Animal[];                   // predators that reached the player
  bleedDeaths: Animal[];               // wounded animals that bled out
  dropBlood: (x: number, z: number) => void;
  wind: { x: number; z: number; speed: number };
  /** AR: patrol flyers stay within these elevation angles (deg) above the player's eye level. */
  elevation?: [number, number];
}

const LIMIT = WORLD_SIZE / 2 - 6;
const WANDER = WORLD_SIZE * 0.4; // animals stay within this radius of the center (unless already outside)
const wrap = (a: number) => {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
};
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Simulation entity. No rendering dependencies. Heading convention: forward = (-sin h, -cos h).
 * position.y is the underside of the animal (ground + altitude for flyers).
 */
export class Animal {
  position: Vec3;
  direction: number;        // heading (yaw, rad)
  speed = 0;                // m/s
  altitude = 0;             // m above ground (flyers)
  age: number;
  sex: 'M' | 'F';
  health: number;
  readonly maxHealth: number;
  awareness = 0;            // 0..1
  state: AnimalState = 'IDLE';
  activitySchedule: Array<[number, number]>;
  habitat: string;

  private timer = 2;
  private target: { x: number; z: number } | null = null;
  private fleeHeading = 0;
  private vy = 0;           // fall speed of dead flyers
  private patrolAlt = 0;
  private cooldown = 0;       // predators: time before hunting again
  private huntTime = 0;
  private windingUp = false;
  private bleed = 0;          // HP lost per second while wounded
  private bleedDist = 0;
  private rerouteT = 0;
  private losT = 0;
  private hasLos = true;
  private nextCall: number;
  private soar: { cx: number; cz: number; r: number; phase: number; base: number; t: number } | null = null;

  constructor(readonly id: number, readonly species: SpeciesDef, x: number, z: number, world: World, rnd: () => number) {
    this.position = { x, y: 0, z };
    this.direction = rnd() * Math.PI * 2;
    this.maxHealth = species.health;
    this.health = species.health;
    this.age = 1 + Math.floor(rnd() * 10);
    this.sex = rnd() < 0.5 ? 'M' : 'F';
    this.activitySchedule = species.activity;
    this.habitat = species.habitat;
    this.timer = 1 + rnd() * 4;
    this.nextCall = species.call ? rnd() * species.call.interval[1] : Infinity;

    const fl = species.flight;
    if (fl?.kind === 'soar') {
      this.soar = {
        cx: clamp(x, -(LIMIT - (fl.radius ?? 30)), LIMIT - (fl.radius ?? 30)),
        cz: clamp(z, -(LIMIT - (fl.radius ?? 30)), LIMIT - (fl.radius ?? 30)),
        r: fl.radius ?? 30, phase: rnd() * Math.PI * 2, t: rnd() * 10,
        base: fl.cruiseAlt[0] + rnd() * (fl.cruiseAlt[1] - fl.cruiseAlt[0]),
      };
      this.altitude = this.soar.base;
      this.placeOnOrbit();
    }
    if (fl?.kind === 'patrol') { // patrol flyers start airborne
      this.patrolAlt = fl.cruiseAlt[0] + rnd() * (fl.cruiseAlt[1] - fl.cruiseAlt[0]);
      const el = world.level.elevation;
      if (el) { // AR: keep within the elevation window (player assumed at the origin)
        const d = Math.hypot(x, z), rad = Math.PI / 180;
        this.patrolAlt = clamp(this.patrolAlt, d * Math.tan(el[0] * rad) + 1.7, d * Math.tan(el[1] * rad) + 1.7);
      }
      this.altitude = this.patrolAlt;
    }
    this.position.y = this.groundY(world) + this.altitude;
  }

  get flying(): boolean { return this.altitude > 0.3; }

  /** A predator that is winding up, stalking or charging. */
  get hunting(): boolean {
    return this.state === 'STALKING' || this.state === 'CHARGING' || (this.state === 'ALERT' && this.windingUp);
  }

  activityAt(hour: number): number {
    return this.activitySchedule.some(([a, b]) => hour >= a && hour < b) ? 1 : 0.4;
  }

  private groundY(world: World): number {
    const g = world.heightAt(this.position.x, this.position.z);
    return this.species.flight ? Math.max(g, world.waterLevel) : g;
  }

  update(dt: number, ctx: AnimalContext): void {
    if (this.state === 'DEAD') {
      if (this.altitude > 0) { // dead flyers fall
        this.vy += 9.8 * dt;
        this.altitude = Math.max(0, this.altitude - this.vy * dt);
        if (this.altitude === 0) this.vy = 0;
      }
      this.speed = 0;
      this.position.y = this.groundY(ctx.world) + this.altitude;
      return;
    }
    this.callTimer(dt, ctx);
    if (this.bleed > 0 && this.tickBleed(dt, ctx)) return;
    if (this.soar) { this.updateSoar(dt, ctx); return; }


    const p = ctx.player.position;
    const dx = p.x - this.position.x, dz = p.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    this.updateSight(dt, dist, ctx);
    this.updateAwareness(dt, dist, ctx);
    const desired = this.updateState(dt, dx, dz, ctx);
    const accel = this.state === 'FLEEING' || this.state === 'CHARGING' ? 15 : 6;
    this.speed += clamp(desired - this.speed, -accel * dt, accel * dt);
    this.move(dt, ctx);
    this.updateAltitude(dt);
    if (ctx.elevation && this.species.flight?.kind === 'patrol') {
      // AR: do not fly right over the player; pick a new waypoint when too close.
      this.rerouteT -= dt;
      if (dist < 20 && this.rerouteT <= 0 && this.state === 'MOVING') { this.pickWaypoint(ctx); this.rerouteT = 3; }
      // Never below the horizon line (or too steeply overhead) as seen from the player.
      const rad = Math.PI / 180, base = ctx.player.position.y - this.groundY(ctx.world);
      const lo = dist * Math.tan(ctx.elevation[0] * rad) + base, hi = dist * Math.tan(ctx.elevation[1] * rad) + base;
      this.altitude = clamp(this.altitude, lo, Math.max(lo + 1, hi));
    }
    this.position.x = clamp(this.position.x, -LIMIT, LIMIT);
    this.position.z = clamp(this.position.z, -LIMIT, LIMIT);
    this.position.y = this.groundY(ctx.world) + this.altitude;
  }

  /** Emits an occasional call (heard by the audio system). */
  private callTimer(dt: number, ctx: AnimalContext): void {
    const c = this.species.call;
    if (!c) return;
    this.nextCall -= dt;
    if (this.nextCall > 0) return;
    this.nextCall = c.interval[0] + ctx.rnd() * (c.interval[1] - c.interval[0]);
    // Off-hours animals are mostly quiet.
    if (this.activityAt(ctx.hour) < 1 && ctx.rnd() < 0.7) return;
    if (ctx.events.length < 60) ctx.events.push({ species: this.species, x: this.position.x, y: this.position.y, z: this.position.z });
  }

  private placeOnOrbit(): void {
    const s = this.soar!;
    this.position.x = s.cx + Math.cos(s.phase) * s.r;
    this.position.z = s.cz + Math.sin(s.phase) * s.r;
    this.direction = Math.atan2(Math.sin(s.phase), -Math.cos(s.phase)); // tangent of the orbit
  }

  /** Soaring flyers circle at altitude and ignore the player. */
  private updateSoar(dt: number, ctx: AnimalContext): void {
    const s = this.soar!, v = this.species.walkSpeed;
    s.t += dt;
    s.phase += (v / s.r) * dt;
    this.placeOnOrbit();
    this.speed = v;
    this.state = 'MOVING';
    this.altitude = s.base + 4 * Math.sin(s.t * 0.4);
    this.position.y = this.groundY(ctx.world) + this.altitude;
  }

  private updateAltitude(dt: number): void {
    const fl = this.species.flight;
    if (!fl) return;
    let target = 0;
    if (fl.kind === 'patrol') {
      target = this.state === 'FLEEING' ? fl.cruiseAlt[1] : this.patrolAlt;
    } else if (this.state === 'FLEEING') {
      target = fl.cruiseAlt[1];
    } else if (this.state === 'MOVING' && this.target) {
      const d = Math.hypot(this.target.x - this.position.x, this.target.z - this.position.z);
      const cruise = fl.cruiseAlt[0] + (fl.cruiseAlt[1] - fl.cruiseAlt[0]) * 0.5;
      target = Math.min(cruise, d / 3); // glide slope for landing
    }
    const rate = this.state === 'FLEEING' ? 9 : 5;
    this.altitude += clamp(target - this.altitude, -rate * dt, rate * dt);
  }

  /** Line of sight to the player, re-checked a few times per second. */
  private updateSight(dt: number, dist: number, ctx: AnimalContext): void {
    this.losT -= dt;
    if (this.losT > 0) return;
    this.losT = 0.25 + ctx.rnd() * 0.1;
    const sp = this.species, p = ctx.player.position;
    this.hasLos = dist <= sp.viewRange &&
      !isBlocked(ctx.world, [this.position.x, this.position.y + sp.bounds.height * 0.8, this.position.z], [p.x, p.y, p.z]);
  }

  /** Detection: sight (needs line of sight), scent (carried by the wind to animals downwind), close range. */
  private updateAwareness(dt: number, dist: number, ctx: AnimalContext): void {
    const sp = this.species, pl = ctx.player;
    // Moving is noticed more; crouching (stationary or moving) is stealthier.
    const stealth = pl.speed > 0.1 ? (pl.crouching ? 1.6 : 2.5) : (pl.crouching ? 0.6 : 1);
    let rate = 0;
    if (dist < sp.viewRange) {
      rate += (1 - dist / sp.viewRange) * sp.detectRate * stealth * (this.hasLos ? 1 : 0.12);
    }
    const smell = sp.smell ?? (sp.flight ? 0.15 : 0.6);
    if (smell > 0 && dist > 0.5) {
      const w = ctx.wind;
      // The animal is downwind of the player if the wind blows from the player toward it.
      const along = ((this.position.x - pl.position.x) * w.x + (this.position.z - pl.position.z) * w.z) / dist;
      const range = 40 + 100 * smell * Math.min(1, w.speed / 6);
      if (along > 0.3 && dist < range) rate += (1 - dist / range) * 0.25 * smell * along * (pl.speed > 0.1 ? 1.3 : 1);
    }
    if (dist < sp.closeRange) rate += 0.6;
    this.awareness = clamp(this.awareness + (rate - sp.awarenessDecay) * dt, 0, 1);
  }

  private set(state: AnimalState, timer: number): void {
    this.state = state;
    this.timer = timer;
    this.windingUp = false;
  }

  /** Returns desired speed. */
  private updateState(dt: number, dx: number, dz: number, ctx: AnimalContext): number {
    const sp = this.species;
    const towardPlayer = Math.atan2(-dx, -dz);
    const attacking = this.state === 'STALKING' || this.state === 'CHARGING';

    if (this.state !== 'FLEEING' && !attacking) {
      if (this.awareness >= 1 && sp.reaction === 'flee') {
        this.fleeHeading = Math.atan2(dx, dz) + (ctx.rnd() - 0.5) * 0.8;
        this.set('FLEEING', sp.fleeDuration[0] + ctx.rnd() * (sp.fleeDuration[1] - sp.fleeDuration[0]));
      } else if (this.awareness >= sp.alertThreshold && this.state !== 'ALERT') {
        this.set('ALERT', 0);
      } else if (this.state === 'ALERT' && this.awareness < 0.2) {
        this.set('IDLE', 2 + ctx.rnd() * 3);
      }
    }

    if (sp.predator && sp.reaction === 'hunt') {
      const r = this.huntLogic(dt, dx, dz, Math.hypot(dx, dz), ctx);
      if (r !== null) return r;
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
        // Near the area edge: turn back toward the center.
        if (Math.abs(this.position.x) > LIMIT - 14 || Math.abs(this.position.z) > LIMIT - 14) {
          this.fleeHeading = Math.atan2(this.position.x, this.position.z);
        }
        this.direction += clamp(wrap(this.fleeHeading - this.direction), -6 * dt, 6 * dt);
        if (this.timer <= 0) {
          this.awareness = 0.3;
          if (sp.flight?.kind === 'patrol') { this.pickWaypoint(ctx); return sp.walkSpeed; }
          if (sp.flight && this.pickLanding(ctx, true)) return sp.walkSpeed;
          this.set('IDLE', 3 + ctx.rnd() * 3);
          return 0;
        }
        return sp.runSpeed * (this.health < this.maxHealth * 0.6 ? 0.65 : 1); // wounded: slower
      case 'STALKING':
      case 'CHARGING':
      case 'DEAD':
        return 0;
    }
  }

  /** Applies damage. Returns true if killed. Survivors panic and flee from `from`. */
  hit(damage: number, from: { x: number; z: number }, rnd: () => number): boolean {
    this.health = Math.max(0, this.health - damage);
    if (this.health <= 0) {
      this.state = 'DEAD';
      this.speed = 0;
      this.vy = 0;
      this.bleed = 0;
      return true;
    }
    if (this.health <= this.maxHealth * 0.7) this.bleed = Math.max(this.bleed, this.maxHealth * 0.012); // wounded: bleeds out slowly
    const pr = this.species.predator;
    if (pr && this.health > this.maxHealth * pr.fleeBelow) { // enraged predator keeps attacking
      this.awareness = 1;
      if (this.state !== 'CHARGING') { this.set('CHARGING', 0); this.huntTime = 0; }
      return false;
    }
    if (pr) this.cooldown = pr.cooldown;
    this.awareness = 1;
    this.fleeHeading = Math.atan2(from.x - this.position.x, from.z - this.position.z) + (rnd() - 0.5) * 0.8;
    this.set('FLEEING', 8 + rnd() * 6);
    return false;
  }

  /** Predator behavior: warning roar, stalk or charge, attack the player. Returns desired speed, or null for normal behavior. */
  private huntLogic(dt: number, dx: number, dz: number, dist: number, ctx: AnimalContext): number | null {
    const pr = this.species.predator!;
    this.cooldown = Math.max(0, this.cooldown - dt);
    const face = Math.atan2(-dx, -dz);
    const canHunt = ctx.player.vulnerable;

    if (this.state === 'STALKING' || this.state === 'CHARGING') {
      const charging = this.state === 'CHARGING', turn = (charging ? 3 : 2) * dt;
      this.direction += clamp(wrap(face - this.direction), -turn, turn);
      this.huntTime += dt;
      if (!canHunt) { this.calmDown(pr.cooldown * 0.5); return 0; }
      if (dist <= pr.attackRange) { ctx.attacks.push(this); this.calmDown(pr.cooldown); return 0; }
      if (!charging) {
        if (dist <= pr.chargeRange || this.awareness >= 1) { this.set('CHARGING', 0); this.huntTime = 0; return pr.chargeSpeed; }
        if (this.awareness < 0.15 || dist > pr.maxRange * 1.3) { this.calmDown(pr.cooldown * 0.5); return 0; }
        return pr.stalkSpeed ?? pr.chargeSpeed * 0.3;
      }
      if (this.huntTime > pr.chargeTime || dist > pr.maxRange * 1.5) { this.calmDown(pr.cooldown); return 0; } // tires, gives up
      return pr.chargeSpeed;
    }

    if (this.state !== 'FLEEING' && this.cooldown <= 0 && canHunt && this.awareness >= pr.triggerAwareness && dist <= pr.maxRange) {
      if (!(this.state === 'ALERT' && this.windingUp)) {
        this.set('ALERT', pr.windup);
        this.windingUp = true;
        this.emitCall(ctx); // warning roar
      }
    }
    if (this.state === 'ALERT' && this.windingUp) {
      this.direction += clamp(wrap(face - this.direction), -4 * dt, 4 * dt);
      this.timer -= dt;
      if (this.timer <= 0) {
        const stalk = pr.stalkSpeed !== undefined && dist > pr.chargeRange;
        this.set(stalk ? 'STALKING' : 'CHARGING', 0);
        this.huntTime = 0;
      }
      return 0;
    }
    return null;
  }

  /** Stops hunting and rests for a while (after an attack, when tired, or when the player respawns). */
  calmDown(cooldown: number): void {
    this.set('IDLE', 3);
    this.target = null;
    this.awareness = 0.3;
    this.cooldown = Math.max(this.cooldown, cooldown);
    this.huntTime = 0;
  }

  private emitCall(ctx: AnimalContext): void {
    if (this.species.call && ctx.events.length < 60) {
      ctx.events.push({ species: this.species, x: this.position.x, y: this.position.y, z: this.position.z });
    }
  }

  /** Bleeding: loses health, leaves a blood trail while moving. Returns true if it bled out. */
  private tickBleed(dt: number, ctx: AnimalContext): boolean {
    this.health -= this.bleed * dt;
    this.bleedDist += this.speed * dt;
    if (this.speed > 0.3 && this.bleedDist >= 2.5) { this.bleedDist = 0; ctx.dropBlood(this.position.x, this.position.z); }
    if (this.health > 0) return false;
    this.health = 0; this.state = 'DEAD'; this.speed = 0; this.bleed = 0;
    ctx.bleedDeaths.push(this);
    return true;
  }

  private idleTime(ctx: AnimalContext): number {
    return (2 + ctx.rnd() * 5) / this.activityAt(ctx.hour);
  }

  private pickNext(ctx: AnimalContext): void {
    if (this.species.flight?.kind === 'patrol') { this.pickWaypoint(ctx); return; }
    if (ctx.rnd() < 0.5) {
      this.set('FORAGING', 5 + ctx.rnd() * 7);
      return;
    }
    if (this.species.flight) {
      if (!this.pickLanding(ctx, false)) this.set('IDLE', this.idleTime(ctx));
      return;
    }
    for (let i = 0; i < 8; i++) {
      const a = ctx.rnd() * Math.PI * 2, d = 10 + ctx.rnd() * 25;
      const x = this.position.x + Math.cos(a) * d, z = this.position.z + Math.sin(a) * d;
      if (Math.abs(x) > LIMIT || Math.abs(z) > LIMIT) continue;
      if (ctx.world.heightAt(x, z) < ctx.world.waterLevel + 0.3) continue;
      // Stay near the play area: never wander farther out than 90 m (or the current radius).
      if (Math.hypot(x, z) > Math.max(WANDER, Math.hypot(this.position.x, this.position.z))) continue;
      this.target = { x, z };
      this.set('MOVING', 40);
      return;
    }
    this.set('IDLE', this.idleTime(ctx));
  }

  /** Patrol flyers: fly to a new waypoint at a new altitude. */
  private pickWaypoint(ctx: AnimalContext): void {
    const fl = this.species.flight!;
    if (ctx.elevation) { // AR: waypoints around the player, at an elevation angle inside the window
      const p = ctx.player.position, rad = Math.PI / 180, el = ctx.elevation;
      // When close to the player, head outward instead of across.
      const here = Math.hypot(this.position.x - p.x, this.position.z - p.z);
      const out = Math.atan2(this.position.z - p.z, this.position.x - p.x);
      const a = here < 45 ? out + (ctx.rnd() - 0.5) * 0.8 : ctx.rnd() * Math.PI * 2, d = 40 + ctx.rnd() * 70;
      const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      const elev = (el[0] + 3 + ctx.rnd() * Math.max(1, el[1] - el[0] - 10)) * rad;
      this.patrolAlt = d * Math.tan(elev) + (p.y - ctx.world.heightAt(x, z));
      this.target = { x, z };
      this.set('MOVING', 60);
      return;
    }
    for (let i = 0; i < 10; i++) {
      const a = ctx.rnd() * Math.PI * 2, d = 30 + ctx.rnd() * 90;
      const x = this.position.x + Math.cos(a) * d, z = this.position.z + Math.sin(a) * d;
      if (Math.abs(x) > LIMIT - 10 || Math.abs(z) > LIMIT - 10) continue;
      if (Math.hypot(x, z) > Math.max(WANDER, Math.hypot(this.position.x, this.position.z))) continue;
      this.target = { x, z };
      this.patrolAlt = fl.cruiseAlt[0] + ctx.rnd() * (fl.cruiseAlt[1] - fl.cruiseAlt[0]);
      this.set('MOVING', 60);
      return;
    }
    this.set('IDLE', 1 + ctx.rnd() * 2);
  }

  /** Flyers: choose a place to land and fly there. `far`: prefer spots away from the player. */
  private pickLanding(ctx: AnimalContext, far: boolean): boolean {
    const w = ctx.world, p = ctx.player.position;
    for (let i = 0; i < 10; i++) {
      let x: number, z: number;
      const a = ctx.rnd() * Math.PI * 2;
      if (this.habitat === 'pond') {
        const r = w.pond.r * 0.8 * Math.sqrt(ctx.rnd());
        x = w.pond.x + Math.cos(a) * r; z = w.pond.z + Math.sin(a) * r;
      } else {
        const d = far ? 40 + ctx.rnd() * 40 : 12 + ctx.rnd() * 35;
        x = this.position.x + Math.cos(a) * d; z = this.position.z + Math.sin(a) * d;
        if (Math.abs(x) > LIMIT || Math.abs(z) > LIMIT) continue;
        if (w.heightAt(x, z) < w.waterLevel + 0.3) continue;
        if (Math.hypot(x, z) > Math.max(WANDER, Math.hypot(this.position.x, this.position.z))) continue;
      }
      if (far && i < 9 && Math.hypot(x - p.x, z - p.z) < 35) continue;
      this.target = { x, z };
      this.set('MOVING', 45);
      return true;
    }
    return false;
  }

  private move(dt: number, ctx: AnimalContext): void {
    if (this.speed < 0.001) return;
    const nx = this.position.x - Math.sin(this.direction) * this.speed * dt;
    const nz = this.position.z - Math.cos(this.direction) * this.speed * dt;
    const water = !this.species.flight && ctx.world.heightAt(nx, nz) < ctx.world.waterLevel + 0.15;
    const blocked = Math.abs(nx) > LIMIT || Math.abs(nz) > LIMIT || water;
    if (!blocked) { this.position.x = nx; this.position.z = nz; return; }
    if (this.state === 'FLEEING') {
      // Blocked (edge or water): head back toward the center.
      this.fleeHeading = Math.atan2(this.position.x, this.position.z) + (ctx.rnd() < 0.5 ? 0.6 : -0.6);
    } else {
      this.target = null;
      this.speed = 0;
      this.set('IDLE', 2);
    }
  }
}
