import { LevelDef } from './environments/Level';

export type TechGroup = 'Camera' | 'Binoculars' | 'Rifle' | 'Rockets' | 'Torch' | 'Multitool' | 'Build' | 'Map';

export interface TechNode {
  id: string;
  name: string;
  group: TechGroup;
  desc: string;
  cost: number;
  requires?: string[];
}

/** Tech tree. Progress (coins, unlocks) is stored separately for every level. The camera at 1x is free. */
export const TECH: TechNode[] = [
  { id: 'cam.zoom2', name: 'Camera 2x zoom', group: 'Camera', desc: 'Zoom the camera to 2x.', cost: 15 },
  { id: 'cam.zoom4', name: 'Camera 4x zoom', group: 'Camera', desc: 'Zoom the camera to 4x.', cost: 40, requires: ['cam.zoom2'] },
  { id: 'cam.thermal', name: 'Camera thermal view', group: 'Camera', desc: 'Warm animals glow in the camera view.', cost: 90, requires: ['cam.zoom2'] },

  { id: 'bino', name: 'Binoculars (2x)', group: 'Binoculars', desc: 'Binoculars with rangefinder and ranging rails.', cost: 25 },
  { id: 'bino.zoom4', name: 'Binoculars 4x', group: 'Binoculars', desc: 'Zoom to 4x.', cost: 40, requires: ['bino'] },
  { id: 'bino.zoom8', name: 'Binoculars 8x', group: 'Binoculars', desc: 'Zoom to 8x.', cost: 70, requires: ['bino.zoom4'] },
  { id: 'bino.thermal', name: 'Binocular thermal view', group: 'Binoculars', desc: 'See heat through the binoculars.', cost: 100, requires: ['bino'] },

  { id: 'rifle', name: 'Hunting rifle (iron sight)', group: 'Rifle', desc: 'Rifle with 1x iron sight.', cost: 60 },
  { id: 'rifle.scope4', name: 'Rifle scope 4x', group: 'Rifle', desc: 'Scoped zoom 4x.', cost: 60, requires: ['rifle'] },
  { id: 'rifle.scope8', name: 'Rifle scope 8x', group: 'Rifle', desc: 'Scoped zoom 8x.', cost: 100, requires: ['rifle.scope4'] },
  { id: 'rifle.thermal', name: 'Rifle thermal scope', group: 'Rifle', desc: 'Thermal view through the scope.', cost: 120, requires: ['rifle.scope4'] },
  { id: 'rifle.mag', name: 'Extended magazine', group: 'Rifle', desc: '+3 rounds.', cost: 50, requires: ['rifle'] },
  { id: 'rifle.stab', name: 'Stabilizer', group: 'Rifle', desc: 'Aim sway reduced by 40%.', cost: 80, requires: ['rifle'] },

  { id: 'launcher', name: 'Seeker rockets', group: 'Rockets', desc: 'Target-seeking rockets with lock-on.', cost: 150 },
  { id: 'launcher.zoom4', name: 'Rocket sight 4x', group: 'Rockets', desc: 'Zoom to 4x.', cost: 80, requires: ['launcher'] },
  { id: 'launcher.thermal', name: 'Rocket thermal sight', group: 'Rockets', desc: 'Thermal view in the sight.', cost: 100, requires: ['launcher.zoom4'] },
  { id: 'launcher.mag', name: 'Extra rockets', group: 'Rockets', desc: '+2 rockets.', cost: 120, requires: ['launcher'] },

  { id: 'torch', name: 'Fire torch', group: 'Torch', desc: 'A burning torch: warm, flickering light.', cost: 10 },
  { id: 'torch.electric', name: 'Electric torch', group: 'Torch', desc: 'A focused electric beam.', cost: 60, requires: ['torch'] },
  { id: 'torch.led', name: 'LED floodlight', group: 'Torch', desc: 'Powerful wide beam.', cost: 140, requires: ['torch.electric'] },

  { id: 'multitool', name: 'Multitool', group: 'Multitool', desc: 'Collect wood from trees and stone from rocks, harvest game.', cost: 40 },
  { id: 'build.campfire', name: 'Campfire', group: 'Build', desc: 'Light and a safe zone against night monsters.', cost: 25, requires: ['multitool'] },
  { id: 'build.wall', name: 'Wall', group: 'Build', desc: 'Blocks movement.', cost: 40, requires: ['multitool'] },
  { id: 'build.tower', name: 'Hunters tower', group: 'Build', desc: 'Climbable 5 m view tower, out of reach of monsters.', cost: 90, requires: ['build.wall'] },
  { id: 'build.cannon', name: 'Light autocannon', group: 'Build', desc: 'Automatically shoots night monsters.', cost: 160, requires: ['build.wall'] },
  { id: 'build.cannon2', name: 'Heavy autocannon', group: 'Build', desc: 'Longer range, heavy damage.', cost: 320, requires: ['build.cannon'] },

  { id: 'map.r1', name: 'Radar 100 m', group: 'Map', desc: 'Minimap range 100 m.', cost: 30 },
  { id: 'map.r2', name: 'Radar 160 m', group: 'Map', desc: 'Minimap range 160 m.', cost: 70, requires: ['map.r1'] },
];

export const TECH_BY_ID: Record<string, TechNode> = Object.fromEntries(TECH.map((n) => [n.id, n]));

/** Which nodes exist on a level (some tools make no sense in AR, or without hunting). */
export function techApplies(n: TechNode, level: LevelDef, naturalist: boolean): boolean {
  const synthetic = !level.renderer || level.renderer === 'synthetic';
  const xr = level.renderer === 'xr';
  const thermal = n.id.endsWith('.thermal');
  switch (n.group) {
    case 'Camera': case 'Binoculars': return !xr && (!thermal || synthetic);
    case 'Rifle': return !naturalist && (!thermal || synthetic);
    case 'Rockets': return !naturalist && !!level.extraEquipment?.includes('launcher') && (!thermal || synthetic);
    case 'Torch': case 'Multitool': case 'Build': return synthetic;
    case 'Map': return true;
  }
}

/** All node ids available on a level, regardless of mode (used by "unlock all"). */
export function allTechIds(level: LevelDef): string[] {
  return TECH.filter((n) => techApplies(n, level, false)).map((n) => n.id);
}
