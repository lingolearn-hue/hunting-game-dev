import { SpeciesDef } from './SpeciesDef';

export const TRICERATOPS: SpeciesDef = {
  id: 'triceratops', name: 'Triceratops',
  walkSpeed: 1.0, foragingSpeed: 0.25, runSpeed: 5.5,
  viewRange: 55, closeRange: 15, detectRate: 0.18, awarenessDecay: 0.06,
  alertThreshold: 0.5, fleeDuration: [5, 8], reaction: 'stand',
  activity: [[5, 19]], habitat: 'valley',
  bounds: { halfLength: 3.7, halfWidth: 1.0, height: 2.9 },
  look: {
    stance: 'quad',
    colors: { body: 0x6f7a55, dark: 0x4c5439, accent: 0xd9c9a0, horn: 0xe6dcc0 },
    body: [1.5, 1.6, 4.0], legLen: 1.0, legThick: 0.45, neckLen: 0.5, head: [0.9, 0.8, 1.2],
    tail: 'long', tailLen: 1.8, feature: 'ceratopsian',
  },
};
