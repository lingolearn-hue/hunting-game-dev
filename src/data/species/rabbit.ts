import { SpeciesDef } from './SpeciesDef';

export const RABBIT: SpeciesDef = {
  id: 'rabbit', name: 'Rabbit',
  description: 'Tiny and skittish. Bolts at the first sign of trouble.',
  rarity: 1,
  walkSpeed: 0.8, foragingSpeed: 0.1, runSpeed: 9,
  viewRange: 50, closeRange: 8, detectRate: 0.3, awarenessDecay: 0.08,
  alertThreshold: 0.3, fleeDuration: [4, 7], reaction: 'flee',
  activity: [[5, 9], [17, 21]], habitat: 'forest',
  call: { kind: 'squeak', interval: [40, 90] },
  health: 20,
  bounds: { halfLength: 0.28, halfWidth: 0.1, height: 0.35 },
  look: {
    stance: 'quad',
    colors: { body: 0x9a8a78, dark: 0x6a5c4c, accent: 0xf2efe6, horn: 0xd0c0a0 },
    body: [0.16, 0.18, 0.36], legLen: 0.12, legThick: 0.05, neckLen: 0.06, head: [0.1, 0.1, 0.14],
    tail: 'tuft', feature: 'ears', earLen: 0.16,
  },
};
