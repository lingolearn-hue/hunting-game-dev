import { SpeciesDef } from './SpeciesDef';

export const ROVER: SpeciesDef = {
  id: 'rover', name: 'Scout Rover',
  description: 'Fast wheeled robot that sweeps the range with its sensor turret.',
  rarity: 2,
  walkSpeed: 3.5, foragingSpeed: 0.5, runSpeed: 9,
  viewRange: 80, closeRange: 10, detectRate: 0.3, awarenessDecay: 0.06,
  alertThreshold: 0.35, fleeDuration: [5, 8], reaction: 'flee',
  activity: [[0, 24]], habitat: 'range',
  call: { kind: 'motor', interval: [8, 20] },
  health: 60,
  bounds: { halfLength: 0.7, halfWidth: 0.4, height: 0.75 },
  look: {
    stance: 'vehicle',
    colors: { body: 0x9a8a5a, dark: 0x2a2a2a, accent: 0xff3030, horn: 0x666666 },
    body: [0.6, 0.3, 1.1], legLen: 0.16, legThick: 0.12, neckLen: 0, head: [0.1, 0.1, 0.1],
    tail: 'none', feature: 'turret',
  },
};
