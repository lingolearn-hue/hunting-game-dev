import { World } from './World';
import { Player, EYE_STAND, EYE_CROUCH, WALK_SPEED, CROUCH_SPEED } from './Player';
import { AnimalManager } from './AnimalManager';
import { RocketSystem } from './Rocket';
import { yawOf } from '../util/quat';

export const STEP = 1 / 30; // fixed timestep, seconds

export class Simulation {
  /** Game time in hours [0,24). */
  timeOfDay: number;
  timeScale = 1 / 60; // game hours per real second (1 game minute per second)
  readonly animals: AnimalManager;
  readonly rockets: RocketSystem;
  /** True while the player is pressing against the edge of the playable area. */
  atEdge = false;
  private acc = 0;

  constructor(readonly world: World, readonly player: Player, rnd: () => number) {
    this.timeOfDay = world.level.startHour;
    this.animals = new AnimalManager(world, world.level);
    this.rockets = new RocketSystem(world, this.animals, rnd);
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
    this.animals.update(dt, this.player, this.timeOfDay);
    this.rockets.update(dt);
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
