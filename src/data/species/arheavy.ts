import { SpeciesDef } from './SpeciesDef';

/** Heavy drone scaled up (about 2.5x) for camera (AR) tests. */
export const ARHEAVY: SpeciesDef = {
  id: 'arheavy', name: 'Heavy Drone (AR)',
  description: 'Large test drone for the camera (AR) level. Slow, sturdy, does not evade.',
  rarity: 4,
  walkSpeed: 5, foragingSpeed: 0, runSpeed: 5,
  viewRange: 0, closeRange: 0, detectRate: 0, awarenessDecay: 1,
  alertThreshold: 2, fleeDuration: [1, 1], reaction: 'ignore',
  activity: [[0, 24]], habitat: 'sky',
  flight: { kind: 'patrol', cruiseAlt: [20, 50] },
  call: { kind: 'hum', interval: [5, 12] },
  smell: 0,
  health: 200,
  bounds: { halfLength: 2.8, halfWidth: 3.1, height: 1.3 },
  look: {
    stance: 'drone',
    colors: { body: 0x4a5040, dark: 0x22261e, accent: 0xffa000, horn: 0x999c94 },
    body: [2.2, 0.9, 3.0], legLen: 0.25, legThick: 0.1, neckLen: 0, head: [0.4, 0.4, 0.4],
    tail: 'none', feature: 'none', wingSpan: 6,
  },
};
