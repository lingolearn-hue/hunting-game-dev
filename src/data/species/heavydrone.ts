import { SpeciesDef } from './SpeciesDef';

export const HEAVYDRONE: SpeciesDef = {
  id: 'heavydrone', name: 'Heavy Drone',
  description: 'Large armored patrol drone. Slow, sturdy and does not evade.',
  rarity: 4,
  walkSpeed: 8, foragingSpeed: 0, runSpeed: 8,
  viewRange: 0, closeRange: 0, detectRate: 0, awarenessDecay: 1,
  alertThreshold: 2, fleeDuration: [1, 1], reaction: 'ignore',
  activity: [[0, 24]], habitat: 'range',
  flight: { kind: 'patrol', cruiseAlt: [15, 35] },
  call: { kind: 'hum', interval: [6, 16] },
  health: 200,
  bounds: { halfLength: 1.1, halfWidth: 1.2, height: 0.5 },
  look: {
    stance: 'drone',
    colors: { body: 0x4a5040, dark: 0x22261e, accent: 0xffa000, horn: 0x999c94 },
    body: [0.9, 0.35, 1.2], legLen: 0.1, legThick: 0.04, neckLen: 0, head: [0.2, 0.2, 0.2],
    tail: 'none', feature: 'none', wingSpan: 2.4,
  },
};
