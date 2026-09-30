import { SpeciesDef } from './SpeciesDef';

export const PARASAUROLOPHUS: SpeciesDef = {
  id: 'parasaurolophus', name: 'Parasaurolophus',
  walkSpeed: 1.4, foragingSpeed: 0.3, runSpeed: 8,
  viewRange: 75, closeRange: 15, detectRate: 0.25, awarenessDecay: 0.06,
  alertThreshold: 0.4, fleeDuration: [6, 10], reaction: 'flee',
  activity: [[5, 19]], habitat: 'valley',
  health: 200,
  bounds: { halfLength: 3.7, halfWidth: 0.55, height: 3.6 },
  look: {
    stance: 'quad',
    colors: { body: 0x4f7f6a, dark: 0x35564a, accent: 0xe0c060, horn: 0xe0c060 },
    body: [0.9, 1.1, 3.0], legLen: 1.5, legThick: 0.3, neckLen: 1.4, head: [0.4, 0.4, 0.9],
    tail: 'long', tailLen: 2.2, feature: 'crest',
  },
};
