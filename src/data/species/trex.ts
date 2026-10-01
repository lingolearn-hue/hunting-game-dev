import { SpeciesDef } from './SpeciesDef';

export const TREX: SpeciesDef = {
  id: 'trex', name: 'T-rex',
  walkSpeed: 1.6, foragingSpeed: 0.4, runSpeed: 8,
  viewRange: 100, closeRange: 20, detectRate: 0.2, awarenessDecay: 0.05,
  alertThreshold: 0.3, fleeDuration: [4, 6], reaction: 'stand',
  activity: [[5, 20]], habitat: 'valley',
  rarity: 5,
  description: 'Apex predator. Fearless and rarely seen up close.',
  call: { kind: 'roar', interval: [30, 70] },
  health: 500,
  bounds: { halfLength: 5.2, halfWidth: 0.9, height: 4.8 },
  look: {
    stance: 'biped',
    colors: { body: 0x5a5040, dark: 0x3a3228, accent: 0xc8b88a, horn: 0xc8b88a },
    body: [1.5, 1.7, 3.6], legLen: 2.3, legThick: 0.55, neckLen: 0.9, head: [1.0, 1.1, 1.8],
    tail: 'long', tailLen: 3.5, feature: 'arms',
  },
};
