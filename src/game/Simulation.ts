import { World, WORLD_SIZE } from './World';
import { Player, EYE_STAND, EYE_CROUCH, WALK_SPEED, CROUCH_SPEED } from './Player';
import { AnimalManager } from './AnimalManager';
import { RocketSystem } from './Rocket';
import { Wind } from './Wind';
import { SpeciesDef } from '../data/species/SpeciesDef';
import { yawOf } from '../util/quat';

export const STEP = 1 / 30; // fixed timestep, seconds

export class Simulation {
  /** Game time in hours [0,24). */
  timeOfDay: number;
  timeScale = 1 / 60; // game hours per real second (1 game minute per second)
  readonly animals: AnimalManager;
  readonly rockets: RocketSystem;
  readonly wind: Wind;
  /** Number of times the player was killed by a predator. */
  deaths = 0;
  /** Predator attacks since last drained (for UI and audio). */
  private attackLog: SpeciesDef[] = [];
  private simTime = 0;
  /** True while the player is pressing against the edge of the playable area. */
  atEdge = false;
  private acc = 0;

  constructor(readonly world: World, readonly player: Player, rnd: () => number) {
    this.timeOfDay = world.level.startHour;
    this.animals = new AnimalManager(world, world.level);
    this.rockets = new RocketSystem(world, this.animals, rnd);
    this.wind = new Wind(world.level.seed, world.level.windSpeed ?? 3);
  }

  update(dt: number): void {
    this.acc += dt;
    while (this.acc >= STEP) {
      this.step(STEP);
      this.acc -= STEP;
    }
  }

  private step(dt: number): void {
    this.timeOfDay = (this.timeOfDay + this.timeScale * dt) % 24;
    this.movePlayer(dt);
    this.simTime += dt;
    this.wind.update(this.simTime);
    if (this.player.invuln > 0) this.player.invuln = Math.max(0, this.player.invuln - dt);
    this.animals.update(dt, this.player, this.timeOfDay, this.wind);
    const hits = this.animals.drainAttacks();
    if (hits.length > 0) {
      this.deaths++;
      this.attackLog.push(hits[0].species);
      this.respawn();
    }
    this.rockets.update(dt);
  }

  drainAttackLog(): SpeciesDef[] { return this.attackLog.splice(0); }

  /**
   * After a predator hit: respawn at camp (the start clearing), or at the safest nearby spot if predators
   * are close to camp. Brief protection, and all predators stand down for a while.
   */
  private respawn(): void {
    const p = this.player, w = this.world;
    const predators = this.animals.list.filter((a) => a.species.predator && a.state !== 'DEAD');
    const clearance = (x: number, z: number) => predators.reduce((m, a) => Math.min(m, Math.hypot(a.position.x - x, a.position.z - z)), Infinity);
    let best = { x: 0, z: 0 }, bestC = clearance(0, 0);
    if (bestC < 130) {
      for (const r of [60, 100, 140]) {
        for (let i = 0; i < 16; i++) {
          const x = Math.cos((i * Math.PI) / 8) * r, z = Math.sin((i * Math.PI) / 8) * r;
          if (Math.abs(x) > WORLD_SIZE / 2 - 20 || Math.abs(z) > WORLD_SIZE / 2 - 20 || w.blocksWalker(x, z)) continue;
          const c = clearance(x, z);
          if (c > bestC) { best = { x, z }; bestC = c; }
        }
      }
    }
    p.position.x = best.x; p.position.z = best.z;
    p.crouching = false;
    p.eyeHeight = EYE_STAND;
    p.speed = 0;
    p.invuln = 6;
    p.position.y = w.heightAt(best.x, best.z) + p.eyeHeight;
    for (const a of predators) a.calmDown(40);
  }

  /** Walking/crouching relative to the view heading, with sliding collision. */
  private movePlayer(dt: number): void {
    const p = this.player, w = this.world;
    let mx = p.move.x, my = p.move.y;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }

    let moved = 0;
    if (len > 0.05) {
      const max = p.crouching ? CROUCH_SPEED : WALK_SPEED;
      const yaw = yawOf(p.orientation);
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
      const vx = (fx * my + rx * mx) * max, vz = (fz * my + rz * mx) * max;
      const px = p.position.x, pz = p.position.z;
      const nx = px + vx * dt, nz = pz + vz * dt;
      if (!w.blocksWalker(nx, nz)) { p.position.x = nx; p.position.z = nz; }
      else if (!w.blocksWalker(nx, pz)) p.position.x = nx;
      else if (!w.blocksWalker(px, nz)) p.position.z = nz;
      moved = Math.hypot(p.position.x - px, p.position.z - pz);
    }
    p.speed = moved / dt;
    this.atEdge = w.nearEdge(p.position.x, p.position.z, 1.5);

    const target = p.crouching ? EYE_CROUCH : EYE_STAND;
    p.eyeHeight += (target - p.eyeHeight) * Math.min(1, dt * 8);
    p.position.y = w.heightAt(p.position.x, p.position.z) + p.eyeHeight;
  }
}
