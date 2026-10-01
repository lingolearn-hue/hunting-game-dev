import { SpeciesDef } from './SpeciesDef';

export const PTERANODON: SpeciesDef = {
  id: 'pteranodon', name: 'Pteranodon',
  description: 'Giant crested pterosaur gliding on thermals over the valley.',
  rarity: 4,
  walkSpeed: 10, foragingSpeed: 0, runSpeed: 10,
  viewRange: 0, closeRange: 0, detectRate: 0, awarenessDecay: 1,
  alertThreshold: 2, fleeDuration: [1, 1], reaction: 'ignore',
  activity: [[6, 19]], habitat: 'sky',
  flight: { kind: 'soar', cruiseAlt: [30, 55], radius: 40 },
  call: { kind: 'screech', interval: [20, 50] },
  health: 120,
  bounds: { halfLength: 1.0, halfWidth: 3.0, height: 0.5 },
  look: {
    stance: 'bird',
    colors: { body: 0x7a5a5a, dark: 0x4a3434, accent: 0x9a7a6a, horn: 0xd8c090 },
    body: [0.35, 0.3, 0.9], legLen: 0.2, legThick: 0.05, neckLen: 0, head: [0.16, 0.16, 1.0],
    tail: 'long', tailLen: 0.3, feature: 'crest', wingSpan: 6.0,
  },
};
