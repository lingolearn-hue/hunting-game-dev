import { SpeciesDef } from './SpeciesDef';

export const HAWK: SpeciesDef = {
  id: 'hawk', name: 'Hawk',
  description: 'Soars in wide circles high above the trees.',
  rarity: 3,
  walkSpeed: 9, foragingSpeed: 0, runSpeed: 9,
  viewRange: 0, closeRange: 0, detectRate: 0, awarenessDecay: 1,
  alertThreshold: 2, fleeDuration: [1, 1], reaction: 'ignore',
  activity: [[6, 19]], habitat: 'sky',
  flight: { kind: 'soar', cruiseAlt: [25, 45], radius: 30 },
  call: { kind: 'screech', interval: [15, 40] },
  health: 30,
  bounds: { halfLength: 0.35, halfWidth: 0.65, height: 0.3 },
  look: {
    stance: 'bird',
    colors: { body: 0x6a4a30, dark: 0x3a2a1e, accent: 0xe8e0d0, horn: 0xd8b030 },
    body: [0.18, 0.16, 0.42], legLen: 0.1, legThick: 0.03, neckLen: 0, head: [0.1, 0.1, 0.12],
    tail: 'long', tailLen: 0.3, feature: 'none', wingSpan: 1.3,
  },
};
