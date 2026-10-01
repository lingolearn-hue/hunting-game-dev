import { SpeciesDef } from './SpeciesDef';
import { DEER } from './deer';
import { ELK } from './elk';
import { BOAR } from './boar';
import { FOX } from './fox';
import { RABBIT } from './rabbit';
import { BEAR } from './bear';
import { HAWK } from './hawk';
import { CROW } from './crow';
import { DUCK } from './duck';
import { TRICERATOPS } from './triceratops';
import { PARASAUROLOPHUS } from './parasaurolophus';
import { RAPTOR } from './raptor';
import { TREX } from './trex';
import { PTERANODON } from './pteranodon';
import { ARCHAEOPTERYX } from './archaeopteryx';
import { SCOUTDRONE } from './scoutdrone';
import { HEAVYDRONE } from './heavydrone';
import { ROVER } from './rover';
import { UGV } from './ugv';
import { ARSCOUT } from './arscout';
import { ARHEAVY } from './arheavy';

const ALL: SpeciesDef[] = [
  DEER, ELK, BOAR, FOX, RABBIT, BEAR, HAWK, CROW, DUCK,
  PARASAUROLOPHUS, TRICERATOPS, RAPTOR, TREX, PTERANODON, ARCHAEOPTERYX,
  SCOUTDRONE, HEAVYDRONE, ROVER, UGV, ARSCOUT, ARHEAVY,
];

export const SPECIES: Record<string, SpeciesDef> = Object.fromEntries(ALL.map((s) => [s.id, s]));
export const SPECIES_LIST: SpeciesDef[] = ALL;
