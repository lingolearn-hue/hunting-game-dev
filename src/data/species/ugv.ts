import { SpeciesDef } from './SpeciesDef';

export const UGV: SpeciesDef = {
  id: 'ugv', name: 'Heavy UGV',
  description: 'Tracked unmanned ground vehicle. Slow, armored, and holds its position.',
  rarity: 4,
  walkSpeed: 2.2, foragingSpeed: 0.4, runSpeed: 5,
  viewRange: 100, closeRange: 15, detectRate: 0.2, awarenessDecay: 0.05,
  alertThreshold: 0.4, fleeDuration: [4, 6], reaction: 'stand',
  activity: [[0, 24]], habitat: 'range',
  call: { kind: 'motor', interval: [10, 25] },
  health: 400,
  bounds: { halfLength: 1.9, halfWidth: 1.05, height: 1.9 },
  look: {
    stance: 'vehicle',
    colors: { body: 0x4a5a3a, dark: 0x22261e, accent: 0xffa000, horn: 0x555c50 },
    body: [1.6, 0.8, 3.0], legLen: 0.4, legThick: 0.4, neckLen: 0, head: [0.2, 0.2, 0.2],
    tail: 'none', feature: 'tracks',
  },
};
