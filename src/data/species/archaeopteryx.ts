import { SpeciesDef } from './SpeciesDef';

export const ARCHAEOPTERYX: SpeciesDef = {
  id: 'archaeopteryx', name: 'Archaeopteryx',
  description: 'Feathered, crow-sized flyer. Hops between the ferns.',
  rarity: 3,
  walkSpeed: 6, foragingSpeed: 0.3, runSpeed: 10,
  viewRange: 60, closeRange: 10, detectRate: 0.3, awarenessDecay: 0.08,
  alertThreshold: 0.35, fleeDuration: [5, 9], reaction: 'flee',
  activity: [[5, 20]], habitat: 'valley',
  flight: { kind: 'hop', cruiseAlt: [5, 12] },
  call: { kind: 'chirp', interval: [6, 20] },
  health: 25,
  bounds: { halfLength: 0.35, halfWidth: 0.4, height: 0.35 },
  look: {
    stance: 'bird',
    colors: { body: 0x3a6a4a, dark: 0x1e3a28, accent: 0xd0a040, horn: 0xd8b030 },
    body: [0.14, 0.14, 0.36], legLen: 0.12, legThick: 0.03, neckLen: 0, head: [0.09, 0.09, 0.14],
    tail: 'long', tailLen: 0.35, feature: 'none', wingSpan: 0.8,
  },
};
