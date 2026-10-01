import { SpeciesDef } from './SpeciesDef';

export const BEAR: SpeciesDef = {
  id: 'bear', name: 'Bear',
  description: 'Powerful and solitary. Holds its ground when it notices you.',
  rarity: 4,
  walkSpeed: 1.3, foragingSpeed: 0.3, runSpeed: 8,
  viewRange: 60, closeRange: 15, detectRate: 0.18, awarenessDecay: 0.05,
  alertThreshold: 0.45, fleeDuration: [4, 6], reaction: 'stand',
  activity: [[5, 11], [16, 22]], habitat: 'forest',
  call: { kind: 'roar', interval: [60, 140] },
  health: 350,
  bounds: { halfLength: 1.0, halfWidth: 0.5, height: 1.5 },
  look: {
    stance: 'quad',
    colors: { body: 0x3f2f24, dark: 0x2a2019, accent: 0x6a5040, horn: 0xd0c0a0 },
    body: [0.9, 0.9, 1.5], legLen: 0.5, legThick: 0.26, neckLen: 0.22, head: [0.4, 0.36, 0.5],
    tail: 'tuft', feature: 'ears', earLen: 0.1,
  },
};
