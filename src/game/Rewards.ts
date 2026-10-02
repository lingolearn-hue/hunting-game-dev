import { SpeciesDef } from '../data/species/SpeciesDef';

/** Coin values. */
export const bounty = (s: SpeciesDef): number => Math.round(s.rarity * 8 + s.health / 10);
export const killReward = (s: SpeciesDef): number => (s.monster ? 12 : Math.max(2, Math.round(bounty(s) * 0.5)));
export const harvestReward = (s: SpeciesDef): number => bounty(s);
export const photoReward = (score: number, s: SpeciesDef, firstOfSpecies: boolean): number =>
  Math.round(score / 8) + (firstOfSpecies ? 10 * s.rarity : 0);
export const discoveryReward = (s: SpeciesDef): number => 15 * s.rarity;
