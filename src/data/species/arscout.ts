import { SpeciesDef } from './SpeciesDef';

/** Scout drone scaled up (about 3x) so it is visible as more than a dot in camera (AR) tests. */
export const ARSCOUT: SpeciesDef = {
  id: 'arscout', name: 'Scout Drone (AR)',
  description: 'Test drone for the camera (AR) level, scaled up for visibility. Evades when it detects you.',
  rarity: 2,
  walkSpeed: 8, foragingSpeed: 0, runSpeed: 14,
  viewRange: 120, closeRange: 15, detectRate: 0.25, awarenessDecay: 0.06,
  alertThreshold: 0.4, fleeDuration: [4, 7], reaction: 'flee',
  activity: [[0, 24]], habitat: 'sky',
  flight: { kind: 'patrol', cruiseAlt: [15, 40] },
  call: { kind: 'hum', interval: [4, 10] },
  smell: 0,
  health: 30,
  bounds: { halfLength: 1.2, halfWidth: 1.2, height: 0.75 },
  look: {
    stance: 'drone',
    colors: { body: 0x2a2c30, dark: 0x111214, accent: 0xff3030, horn: 0x888c90 },
    body: [0.9, 0.3, 0.9], legLen: 0.15, legThick: 0.06, neckLen: 0, head: [0.2, 0.2, 0.2],
    tail: 'none', feature: 'none', wingSpan: 2.1,
  },
};
