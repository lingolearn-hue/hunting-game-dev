import { SpeciesDef } from './SpeciesDef';

export const SCOUTDRONE: SpeciesDef = {
  id: 'scoutdrone', name: 'Scout Drone',
  description: 'Small, fast quadcopter on autonomous patrol. Evades when it detects you.',
  rarity: 2,
  walkSpeed: 12, foragingSpeed: 0, runSpeed: 22,
  viewRange: 90, closeRange: 12, detectRate: 0.3, awarenessDecay: 0.06,
  alertThreshold: 0.35, fleeDuration: [4, 7], reaction: 'flee',
  activity: [[0, 24]], habitat: 'range',
  flight: { kind: 'patrol', cruiseAlt: [10, 30] },
  call: { kind: 'hum', interval: [5, 14] },
  health: 30,
  bounds: { halfLength: 0.4, halfWidth: 0.4, height: 0.25 },
  look: {
    stance: 'drone',
    colors: { body: 0x2a2c30, dark: 0x111214, accent: 0xff3030, horn: 0x888c90 },
    body: [0.3, 0.1, 0.3], legLen: 0.05, legThick: 0.02, neckLen: 0, head: [0.08, 0.08, 0.08],
    tail: 'none', feature: 'none', wingSpan: 0.7,
  },
};
