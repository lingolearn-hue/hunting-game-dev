import { Animal, AnimalContext, CallEvent } from './Animal';
import { World, WORLD_SIZE } from './World';
import { LevelDef, SpawnSpec } from '../data/environments/Level';
import { SPECIES } from '../data/species';
import { SHADE_ID } from './constants';
import { makeRng } from '../util/rng';

export interface ManagerEnv {
  /** 0 = day .. 1 = deep night (monsters spawn). */
  nightLevel: number;
  /** Yaw of the player's view (AR stream drones spawn in the viewing direction). */
  viewYaw: number;
  /** Positions of campfires: monsters do not spawn near them. */
  campfires: Array<{ x: number; z: number }>;
}

const CORPSE_SECONDS = 240;
const MONSTER_CORPSE_SECONDS = 20;

export class AnimalManager {
  readonly list: Animal[] = [];
  /** Animal calls since the last drain (consumed by audio). */
  readonly events: CallEvent[] = [];
  readonly attacks: Animal[] = [];
  readonly bleedDeaths: Animal[] = [];
  /** Blood trail drops from wounded animals (newest last). `bloodVersion` changes when the list changes. */
  readonly blood: Array<{ x: number; z: number }> = [];
  bloodVersion = 0;
  /** Increments when animals are added or removed. */
  version = 0;
  private rnd: () => number;
  private nextId = 1;
  /** Original number of animals per species: killed animals are replaced until this is reached again. */
  private quota = new Map<string, number>();
  private specsOf = new Map<string, SpawnSpec[]>();
  private respawnT = new Map<string, number>();
  private monsterT = 0;
  private streamT = 3;
  private cleanT = 0;

  constructor(private world: World, private level: LevelDef) {
    this.rnd = makeRng(level.seed + 7);
    for (const spawn of level.spawns) {
      const species = SPECIES[spawn.species];
      if (!species) continue;
      this.quota.set(spawn.species, (this.quota.get(spawn.species) ?? 0) + spawn.count);
      const arr = this.specsOf.get(spawn.species) ?? [];
      arr.push(spawn);
      this.specsOf.set(spawn.species, arr);
      for (let i = 0; i < spawn.count; i++) {
        const p = this.findSpot(spawn, spawn.front === true && i === 0, null, 0);
        if (p) this.add(new Animal(this.nextId++, species, p.x, p.z, world, this.rnd));
      }
    }
    // AR stream level: a few drones already crossing at the start
    if (level.stream) for (let i = 0; i < 2; i++) this.spawnTransit(0, 0, 0, 0.25 + i * 0.3);
  }

  private add(a: Animal): void { this.list.push(a); this.version++; }

  remove(a: Animal): void {
    const i = this.list.indexOf(a);
    if (i >= 0) { this.list.splice(i, 1); this.version++; }
  }

  /** A random free spot for a spawn entry. `avoid`: stay at least `avoidDist` away from this point. */
  private findSpot(spawn: SpawnSpec, front: boolean, avoid: { x: number; z: number } | null, avoidDist: number): { x: number; z: number } | null {
    const w = this.world, half = WORLD_SIZE / 2 - 10;
    for (let t = 0; t < 60; t++) {
      let x: number, z: number;
      if (spawn.at === 'pond') {
        const P = w.pond, a = this.rnd() * Math.PI * 2, r = P.r * 0.7 * Math.sqrt(this.rnd());
        x = P.x + Math.cos(a) * r; z = P.z + Math.sin(a) * r;
      } else {
        // Respawns keep away from the player: widen the ring if needed.
        const lo = avoid ? Math.max(spawn.minDist, avoidDist + 5) : spawn.minDist;
        const hi = avoid ? Math.max(spawn.maxDist, lo + 40) : spawn.maxDist;
        const d = lo + this.rnd() * (hi - lo);
        // 'front': within +-40 deg of forward (-Z); otherwise any direction.
        const a = front ? (this.rnd() - 0.5) * 1.4 : this.rnd() * Math.PI * 2;
        x = Math.sin(a) * d; z = -Math.cos(a) * d;
        if (w.heightAt(x, z) < w.waterLevel + 0.5) continue;
      }
      if (Math.abs(x) > half || Math.abs(z) > half) continue;
      if (avoid && Math.hypot(x - avoid.x, z - avoid.z) < avoidDist) continue;
      return { x, z };
    }
    return null;
  }

  update(dt: number, player: AnimalContext['player'], hour: number, wind: AnimalContext['wind'], env: ManagerEnv): void {
    const ctx: AnimalContext = {
      world: this.world, player, hour, rnd: this.rnd, events: this.events, wind,
      attacks: this.attacks, bleedDeaths: this.bleedDeaths, elevation: this.world.level.elevation,
      patrolRange: this.world.level.patrolRange, wander: this.world.level.wander,
      dropBlood: (x, z) => { this.blood.push({ x, z }); if (this.blood.length > 400) this.blood.shift(); this.bloodVersion++; },
    };
    for (const a of this.list) a.update(dt, ctx);

    // AR stream drones that crossed the sky are gone
    for (const a of [...this.list]) if (a.expired) this.remove(a);

    this.cleanT += dt;
    if (this.cleanT >= 1) { // once per second: housekeeping
      this.cleanT = 0;
      this.cleanCorpses();
      this.respawn(player.position, 1);
      this.monsters(player.position, env, 1);
      if (this.level.stream) this.stream(player.position, env.viewYaw, 1);
    }
  }

  /** Corpses disappear after a while (and are removed when harvested). */
  private cleanCorpses(): void {
    for (const a of [...this.list]) {
      if (a.state === 'DEAD' && a.deadFor > (a.species.monster ? MONSTER_CORPSE_SECONDS : CORPSE_SECONDS)) this.remove(a);
    }
  }

  /** Killed animals are replaced, one at a time per species, until the original number is reached again. */
  private respawn(player: { x: number; z: number }, dt: number): void {
    for (const [sp, want] of this.quota) {
      const alive = this.list.filter((a) => a.species.id === sp && a.state !== 'DEAD').length;
      if (alive >= want) { this.respawnT.delete(sp); continue; }
      const t = (this.respawnT.get(sp) ?? 30 + this.rnd() * 40) - dt;
      if (t > 0) { this.respawnT.set(sp, t); continue; }
      const specs = this.specsOf.get(sp)!;
      const spec = specs.reduce((m, s) => (s.maxDist > m.maxDist ? s : m), specs[0]);
      const spot = this.findSpot(spec, false, player, 55);
      if (spot) this.add(new Animal(this.nextId++, SPECIES[sp], spot.x, spot.z, this.world, this.rnd));
      this.respawnT.set(sp, 30 + this.rnd() * 50);
    }
  }

  /** Night monsters: appear around the player after dark, vanish at dawn. */
  private monsters(player: { x: number; z: number }, env: ManagerEnv, dt: number): void {
    const r = this.world.level.renderer;
    if (r === 'ar' || r === 'xr') return;
    const monsters = this.list.filter((a) => a.species.monster && a.state !== 'DEAD');
    const target = Math.round(env.nightLevel * 6);
    if (monsters.length > target) {
      // at dawn they dissolve (one per second)
      if (env.nightLevel < 0.05) this.remove(monsters[monsters.length - 1]);
      return;
    }
    this.monsterT -= dt;
    if (monsters.length >= target || this.monsterT > 0) return;
    this.monsterT = 6 + this.rnd() * 4;
    for (let t = 0; t < 20; t++) {
      const ang = this.rnd() * Math.PI * 2, d = 45 + this.rnd() * 35;
      const x = player.x + Math.cos(ang) * d, z = player.z + Math.sin(ang) * d;
      if (this.world.nearEdge(x, z, 8)) continue;
      if (this.world.flatY === null && this.world.heightAt(x, z) < this.world.waterLevel + 0.5) continue;
      if (this.world.blocksAnimal(x, z, 1)) continue;
      if (env.campfires.some((c) => Math.hypot(c.x - x, c.z - z) < 14)) continue;
      this.add(new Animal(this.nextId++, SPECIES[SHADE_ID], x, z, this.world, this.rnd));
      break;
    }
  }

  /** AR camera level: a continuous stream of drones crossing the sky in the viewing direction. */
  private stream(player: { x: number; z: number }, viewYaw: number, dt: number): void {
    const cfg = this.level.stream!;
    this.streamT -= dt;
    if (this.streamT > 0) return;
    this.streamT = cfg.every[0] + this.rnd() * (cfg.every[1] - cfg.every[0]);
    if (this.list.filter((a) => a.transit && a.state !== 'DEAD').length >= cfg.max) return;
    this.spawnTransit(player.x, player.z, viewYaw, 0);
  }

  /** `progress`: fraction of the path already flown (used for the initial drones). */
  private spawnTransit(px: number, pz: number, viewYaw: number, progress: number): void {
    const cfg = this.level.stream!;
    const id = cfg.species[this.rnd() < 0.8 ? 0 : cfg.species.length - 1];
    const sp = SPECIES[id];
    if (!sp) return;
    const fx = -Math.sin(viewYaw), fz = -Math.cos(viewYaw), rx = Math.cos(viewYaw), rz = -Math.sin(viewYaw);
    const lat = (this.rnd() < 0.5 ? -1 : 1) * (35 + this.rnd() * 35);         // passes to one side, near overhead
    const lat2 = -lat * 0.4 + (this.rnd() - 0.5) * 30;
    const alt = 28 + this.rnd() * 30;
    const sx = px + fx * 140 + rx * lat, sz = pz + fz * 140 + rz * lat;      // starts ahead, above the horizon
    const ex = px - fx * 150 + rx * lat2, ez = pz - fz * 150 + rz * lat2;    // leaves behind the player
    const a = new Animal(this.nextId++, sp, sx + (ex - sx) * progress, sz + (ez - sz) * progress, this.world, this.rnd);
    a.startTransit(ex, ez, alt);
    this.add(a);
  }

  drainEvents(): CallEvent[] { return this.events.splice(0); }
  drainAttacks(): Animal[] { return this.attacks.splice(0); }
  drainBleedDeaths(): Animal[] { return this.bleedDeaths.splice(0); }

  /** Nearest predator that is winding up, stalking or charging. */
  threat(x: number, z: number): { animal: Animal; dist: number } | null {
    let best: { animal: Animal; dist: number } | null = null;
    for (const a of this.list) {
      if (!a.hunting) continue;
      const d = Math.hypot(a.position.x - x, a.position.z - z);
      if (!best || d < best.dist) best = { animal: a, dist: d };
    }
    return best;
  }

  /** A loud noise (gunshot): close animals panic, distant ones become wary. */
  noise(x: number, z: number): void {
    for (const a of this.list) {
      if (a.state === 'DEAD') continue;
      const d = Math.hypot(a.position.x - x, a.position.z - z);
      if (d < 60) a.awareness = 1;
      else if (d < 150) a.awareness = Math.min(1, a.awareness + 0.5);
    }
  }

  nearest(x: number, z: number): { animal: Animal; dist: number } | null {
    let best: { animal: Animal; dist: number } | null = null;
    for (const a of this.list) {
      const d = Math.hypot(a.position.x - x, a.position.z - z);
      if (!best || d < best.dist) best = { animal: a, dist: d };
    }
    return best;
  }
}
