import { SpeciesDef } from './SpeciesDef';

export const BOAR: SpeciesDef = {
  id: 'boar', name: 'Wild boar',
  description: 'Stocky forager with sharp tusks. Nervous around people.',
  rarity: 2,
  walkSpeed: 1.2, foragingSpeed: 0.3, runSpeed: 8,
  viewRange: 40, closeRange: 10, detectRate: 0.15, awarenessDecay: 0.06,
  alertThreshold: 0.5, fleeDuration: [5, 8], reaction: 'flee',
  activity: [[4.5, 10], [16, 22]], habitat: 'forest',
  call: { kind: 'grunt', interval: [20, 55] },
  smell: 1,
  health: 150,
  bounds: { halfLength: 0.8, halfWidth: 0.3, height: 1.0 },
  look: {
    stance: 'quad',
    colors: { body: 0x4a3a30, dark: 0x2c221c, accent: 0xd8ccb0, horn: 0xe8e0c8 },
    body: [0.5, 0.55, 1.05], legLen: 0.38, legThick: 0.11, neckLen: 0.12, head: [0.28, 0.3, 0.48],
    tail: 'tuft', feature: 'tusks',
  },
};
