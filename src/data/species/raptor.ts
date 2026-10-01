import { SpeciesDef } from './SpeciesDef';

export const RAPTOR: SpeciesDef = {
  id: 'raptor', name: 'Raptor',
  walkSpeed: 1.8, foragingSpeed: 0.5, runSpeed: 12,
  viewRange: 80, closeRange: 12, detectRate: 0.3, awarenessDecay: 0.08,
  alertThreshold: 0.35, fleeDuration: [5, 8], reaction: 'hunt',
  activity: [[5, 20]], habitat: 'valley',
  rarity: 3,
  description: 'Fast, sharp-sighted hunter. Wary of anything that moves.',
  call: { kind: 'screech', interval: [12, 35] },
  smell: 0.8,
  predator: { triggerAwareness: 0.5, maxRange: 70, windup: 1.2, stalkSpeed: 1.8, chargeRange: 22, chargeSpeed: 12, chargeTime: 5, attackRange: 2.0, cooldown: 15, fleeBelow: 0.5 },
  health: 80,
  bounds: { halfLength: 1.5, halfWidth: 0.25, height: 1.1 },
  look: {
    stance: 'biped',
    colors: { body: 0x8a5a3a, dark: 0x3a2a20, accent: 0xd0b070, horn: 0xd0b070 },
    body: [0.4, 0.5, 1.0], legLen: 0.55, legThick: 0.1, neckLen: 0.35, head: [0.16, 0.18, 0.4],
    tail: 'long', tailLen: 1.3, feature: 'arms',
  },
};
