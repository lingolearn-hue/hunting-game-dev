import { Animal, AnimalContext } from './Animal';
import { World, WORLD_SIZE } from './World';
import { LevelDef } from '../data/environments/Level';
import { SPECIES } from '../data/species';
import { makeRng } from '../util/rng';

export class AnimalManager {
  readonly list: Animal[] = [];
  private rnd: () => number;

  constructor(private world: World, level: LevelDef) {
    this.rnd = makeRng(level.seed + 7);
    const half = WORLD_SIZE / 2 - 10;
    let id = 1;
    for (const spawn of level.spawns) {
      const species = SPECIES[spawn.species];
      if (!species) continue;
      for (let i = 0; i < spawn.count; i++) {
        for (let t = 0; t < 60; t++) {
          const d = spawn.minDist + this.rnd() * (spawn.maxDist - spawn.minDist);
          // 'front': within +-40 deg of forward (-Z); otherwise any direction.
          const a = spawn.front && i === 0 ? (this.rnd() - 0.5) * 1.4 : this.rnd() * Math.PI * 2;
          const x = Math.sin(a) * d, z = -Math.cos(a) * d;
          if (Math.abs(x) > half || Math.abs(z) > half) continue;
          if (world.heightAt(x, z) < world.waterLevel + 0.5) continue;
          this.list.push(new Animal(id++, species, x, z, world, this.rnd));
          break;
        }
      }
    }
  }

  update(dt: number, player: AnimalContext['player'], hour: number): void {
    const ctx: AnimalContext = { world: this.world, player, hour, rnd: this.rnd };
    for (const a of this.list) a.update(dt, ctx);
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
