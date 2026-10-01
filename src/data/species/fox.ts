import { SpeciesDef } from './SpeciesDef';

export const FOX: SpeciesDef = {
  id: 'fox', name: 'Fox',
  description: 'Cunning red hunter, most active at dusk and night.',
  rarity: 3,
  walkSpeed: 1.6, foragingSpeed: 0.4, runSpeed: 11,
  viewRange: 70, closeRange: 12, detectRate: 0.3, awarenessDecay: 0.07,
  alertThreshold: 0.35, fleeDuration: [5, 8], reaction: 'flee',
  activity: [[17, 24], [0, 7]], habitat: 'forest',
  call: { kind: 'bark', interval: [25, 70] },
  smell: 0.9,
  health: 60,
  bounds: { halfLength: 0.55, halfWidth: 0.16, height: 0.6 },
  look: {
    stance: 'quad',
    colors: { body: 0xb5592a, dark: 0x3a2a20, accent: 0xf2efe6, horn: 0xd0c0a0 },
    body: [0.2, 0.24, 0.55], legLen: 0.28, legThick: 0.06, neckLen: 0.14, head: [0.12, 0.12, 0.26],
    tail: 'long', tailLen: 0.45, feature: 'ears', earLen: 0.1,
  },
};
