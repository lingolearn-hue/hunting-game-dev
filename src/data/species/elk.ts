import { SpeciesDef } from './SpeciesDef';

export const ELK: SpeciesDef = {
  id: 'elk', name: 'Elk',
  description: 'Large deer with impressive antlers. Bugles at dawn and dusk.',
  rarity: 3,
  walkSpeed: 1.4, foragingSpeed: 0.3, runSpeed: 11,
  viewRange: 80, closeRange: 15, detectRate: 0.22, awarenessDecay: 0.06,
  alertThreshold: 0.4, fleeDuration: [6, 10], reaction: 'flee',
  activity: [[4.5, 10], [15.5, 21]], habitat: 'forest',
  call: { kind: 'bugle', interval: [30, 80] },
  smell: 0.9,
  health: 200,
  bounds: { halfLength: 1.2, halfWidth: 0.35, height: 2.6 },
  look: {
    stance: 'quad',
    colors: { body: 0x7a5a3a, dark: 0x4a3826, accent: 0xe0d4b8, horn: 0xd8cbb0 },
    body: [0.6, 0.7, 1.6], legLen: 1.15, legThick: 0.12, neckLen: 0.8, head: [0.22, 0.26, 0.55],
    tail: 'tuft', feature: 'antlers', antlerLen: 0.75,
  },
};
