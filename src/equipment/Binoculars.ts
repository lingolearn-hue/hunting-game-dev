import { Equipment } from './Equipment';

/** Fixed-magnification binoculars for spotting. No action button. */
export class Binoculars implements Equipment {
  readonly id = 'binoculars';
  readonly name = 'Binoculars';
  readonly kind = 'binoculars' as const;
  readonly minZoom = 8;
  readonly maxZoom = 8;
  readonly overlay = 'binoculars' as const;
  swayDeg = 0.2;
}
