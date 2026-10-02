import { SpeciesDef } from './SpeciesDef';

/** Night monster: appears after dark, glowing red eyes, hunts the player relentlessly. */
export const SHADE: SpeciesDef = {
  id: 'shade', name: 'Shade',
  description: 'A creature of the night with glowing red eyes. Fears the campfire; cannot climb.',
  rarity: 1,
  monster: true,
  walkSpeed: 2.5, foragingSpeed: 0.5, runSpeed: 6.2,
  viewRange: 200, closeRange: 30, detectRate: 1, awarenessDecay: 0,
  alertThreshold: 0, fleeDuration: [3, 5], reaction: 'hunt',
  activity: [[0, 24]], habitat: 'night',
  smell: 0,
  predator: { triggerAwareness: 0, maxRange: 150, windup: 0.6, chargeRange: 0, chargeSpeed: 6.2, chargeTime: 60, attackRange: 1.8, cooldown: 6, fleeBelow: 0 },
  health: 70,
  bounds: { halfLength: 0.45, halfWidth: 0.35, height: 1.9 },
  look: {
    stance: 'biped',
    colors: { body: 0x0b0b0e, dark: 0x050507, accent: 0xff1a1a, horn: 0x000000 },
    body: [0.5, 0.9, 0.55], legLen: 0.9, legThick: 0.15, neckLen: 0.25, head: [0.3, 0.32, 0.34],
    tail: 'none', feature: 'eyes',
  },
};
