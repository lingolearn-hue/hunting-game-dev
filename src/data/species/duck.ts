import { SpeciesDef } from './SpeciesDef';

export const DUCK: SpeciesDef = {
  id: 'duck', name: 'Duck',
  description: 'Paddles on the pond. Takes off noisily when disturbed.',
  rarity: 2,
  walkSpeed: 6, foragingSpeed: 0.15, runSpeed: 9,
  viewRange: 55, closeRange: 8, detectRate: 0.25, awarenessDecay: 0.08,
  alertThreshold: 0.35, fleeDuration: [5, 9], reaction: 'flee',
  activity: [[5, 20]], habitat: 'pond',
  flight: { kind: 'hop', cruiseAlt: [5, 12] },
  call: { kind: 'quack', interval: [10, 30] },
  health: 20,
  bounds: { halfLength: 0.25, halfWidth: 0.4, height: 0.25 },
  look: {
    stance: 'bird',
    colors: { body: 0x7a6a50, dark: 0x4a3f30, accent: 0x2a6a3a, horn: 0xd8b030 },
    body: [0.2, 0.18, 0.4], legLen: 0.06, legThick: 0.03, neckLen: 0, head: [0.08, 0.09, 0.1],
    tail: 'long', tailLen: 0.1, feature: 'none', wingSpan: 0.8,
  },
};
