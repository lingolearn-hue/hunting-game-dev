import { Game } from './Game';
import { Animal } from './Animal';
import { Prop } from '../data/environments/Level';
import { BuildKind } from '../equipment/MultiTool';
import { BUILD_DEFS, Building } from './Buildings';
import { rayBox } from './Hunting';
import { harvestReward } from './Rewards';
import { rotateVec } from '../util/quat';

export type GatherResult =
  | { kind: 'wood' | 'stone'; amount: number; depleted: boolean }
  | { kind: 'harvest'; animal: Animal; coins: number }
  | { kind: 'none' };

/** Multitool: harvest a corpse, or chop a tree / mine a rock in front of the player. */
export function gather(game: Game): GatherResult {
  const p = game.player, w = game.world, reach = game.multitool.reach;
  const d = rotateVec(p.orientation, [0, 0, -1]);
  const o: [number, number, number] = [p.position.x, p.position.y, p.position.z];

  // Corpses first
  let corpse: Animal | null = null, ct = reach;
  for (const a of game.sim.animals.list) {
    if (a.state !== 'DEAD') continue;
    const h = rayBox(o, d, a, 0.6);
    if (h && h.t <= ct) { corpse = a; ct = h.t; }
  }
  // Trees and rocks (vertical cylinders, a little generous)
  let prop: Prop | null = null, pt = reach;
  const a2 = d[0] * d[0] + d[2] * d[2];
  if (a2 > 1e-9) {
    for (const pr of w.props) {
      if (pr.removed || pr.kind === 'bush') continue;
      const r = w.radiusOf(pr) + 0.45;
      const ex = o[0] - pr.x, ez = o[2] - pr.z;
      const b = 2 * (ex * d[0] + ez * d[2]), c = ex * ex + ez * ez - r * r;
      const disc = b * b - 4 * a2 * c;
      if (disc < 0) continue;
      let t = (-b - Math.sqrt(disc)) / (2 * a2);
      if (t < 0) {
        if (c > 0) continue; // the cylinder is behind the player
        t = 0;               // standing inside the radius
      }
      if (t > pt) continue;
      const y = o[1] + d[1] * t, g = w.heightAt(pr.x, pr.z);
      const top = pr.kind === 'rock' ? 0.8 * pr.scale + 0.5 : 5 * pr.scale; // a little generous for aiming
      if (y >= g - 0.3 && y <= g + top) { prop = pr; pt = t; }
    }
  }

  if (corpse && (!prop || ct <= pt)) {
    const coins = harvestReward(corpse.species);
    game.sim.animals.remove(corpse);
    game.progress.addCoins(coins, `harvest ${corpse.species.name}`);
    return { kind: 'harvest', animal: corpse, coins };
  }
  if (prop) {
    if (prop.hp === undefined) prop.hp = w.hitsToGather(prop);
    prop.hp--;
    const amount = prop.scale > 1.4 ? 3 : 2;
    const kind = prop.kind === 'rock' ? 'stone' : 'wood';
    if (kind === 'wood') game.progress.wood += amount; else game.progress.stone += amount;
    const depleted = prop.hp <= 0;
    if (depleted) {
      w.removeProp(prop);
      game.progress.removedProps.push(w.indexOf(prop));
    }
    game.progress.changed();
    return { kind, amount, depleted };
  }
  return { kind: 'none' };
}

/** Where a structure would be placed: ahead of the player, facing the player's heading (15 degree steps). */
export function buildTarget(game: Game, kind: BuildKind): { x: number; z: number; rot: number } {
  const p = game.player;
  const f = rotateVec(p.orientation, [0, 0, -1]);
  const h = Math.hypot(f[0], f[2]) || 1;
  const dist = kind === 'tower' ? 6 : 4.5;
  const yaw = Math.atan2(-f[0], -f[2]);
  const step = Math.PI / 12;
  return { x: p.position.x + (f[0] / h) * dist, z: p.position.z + (f[2] / h) * dist, rot: Math.round(yaw / step) * step };
}

export type BuildResult = { ok: true; building: Building } | { ok: false; reason: string };

export function tryBuild(game: Game, kind: BuildKind): BuildResult {
  const def = BUILD_DEFS[kind], pr = game.progress;
  if (!pr.has(def.tech)) return { ok: false, reason: 'not unlocked' };
  if (pr.wood < def.wood || pr.stone < def.stone) return { ok: false, reason: `needs ${def.wood} wood, ${def.stone} stone` };
  const t = buildTarget(game, kind);
  if (!game.sim.buildings.canPlace(kind, t.x, t.z, t.rot, game.player.position)) return { ok: false, reason: 'cannot build here' };
  pr.wood -= def.wood; pr.stone -= def.stone;
  const building = game.sim.buildings.place(kind, t.x, t.z, t.rot, pr.nextBuildingId++);
  return { ok: true, building };
}

/** Demolish the structure in front of the player (50% of the materials come back). */
export function removeBuilding(game: Game): Building | null {
  const t = buildTarget(game, 'wall');
  const b = game.sim.buildings.at(t.x, t.z) ?? game.sim.buildings.at(game.player.position.x + (t.x - game.player.position.x) * 0.5, game.player.position.z + (t.z - game.player.position.z) * 0.5);
  if (!b) return null;
  game.sim.buildings.remove(b.id);
  const def = BUILD_DEFS[b.kind];
  game.progress.wood += Math.floor(def.wood / 2);
  game.progress.stone += Math.floor(def.stone / 2);
  game.progress.changed();
  return b;
}
