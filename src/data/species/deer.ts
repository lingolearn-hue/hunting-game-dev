import { SpeciesDef } from './SpeciesDef';

export const DEER: SpeciesDef = {
  id: 'deer', name: 'Deer',
  walkSpeed: 1.3, foragingSpeed: 0.3, runSpeed: 10,
  viewRange: 70, closeRange: 12, detectRate: 0.25, awarenessDecay: 0.06,
  alertThreshold: 0.4, fleeDuration: [6, 10], reaction: 'flee',
  activity: [[4.5, 10], [15.5, 21]], habitat: 'forest',
  rarity: 1,
  description: 'Common woodland deer. Shy, but curious when still.',
  call: { kind: 'grunt', interval: [20, 50] },
  smell: 0.9,
  health: 100,
  bounds: { halfLength: 0.85, halfWidth: 0.25, height: 1.95 },
  look: {
    stance: 'quad',
    colors: { body: 0x8a6a45, dark: 0x5f4630, accent: 0xf2efe6, horn: 0xc9b89a },
    body: [0.5, 0.55, 1.2], legLen: 0.85, legThick: 0.09, neckLen: 0.6, head: [0.17, 0.18, 0.34],
    tail: 'tuft', feature: 'antlers',
  },
};
