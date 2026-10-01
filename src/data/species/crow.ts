import { SpeciesDef } from './SpeciesDef';

export const CROW: SpeciesDef = {
  id: 'crow', name: 'Crow',
  description: 'Watchful black bird. Its caw carries far through the forest.',
  rarity: 1,
  walkSpeed: 7, foragingSpeed: 0.25, runSpeed: 11,
  viewRange: 60, closeRange: 10, detectRate: 0.3, awarenessDecay: 0.08,
  alertThreshold: 0.35, fleeDuration: [5, 9], reaction: 'flee',
  activity: [[5.5, 19.5]], habitat: 'forest',
  flight: { kind: 'hop', cruiseAlt: [6, 14] },
  call: { kind: 'caw', interval: [8, 25] },
  health: 15,
  bounds: { halfLength: 0.3, halfWidth: 0.45, height: 0.3 },
  look: {
    stance: 'bird',
    colors: { body: 0x1c1c22, dark: 0x0e0e12, accent: 0x22222a, horn: 0x555555 },
    body: [0.14, 0.14, 0.34], legLen: 0.1, legThick: 0.025, neckLen: 0, head: [0.09, 0.09, 0.1],
    tail: 'long', tailLen: 0.2, feature: 'none', wingSpan: 0.9,
  },
};
