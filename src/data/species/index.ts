import { SpeciesDef } from './SpeciesDef';
import { DEER } from './deer';
import { TRICERATOPS } from './triceratops';
import { PARASAUROLOPHUS } from './parasaurolophus';
import { RAPTOR } from './raptor';
import { TREX } from './trex';

export const SPECIES: Record<string, SpeciesDef> = {
  [DEER.id]: DEER, [TRICERATOPS.id]: TRICERATOPS, [PARASAUROLOPHUS.id]: PARASAUROLOPHUS,
  [RAPTOR.id]: RAPTOR, [TREX.id]: TREX,
};
