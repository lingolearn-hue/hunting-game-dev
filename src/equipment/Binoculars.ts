import { Equipment, Overlay, ZoomStep } from './Equipment';

/** Binoculars for spotting: 2x, 4x, 8x. No action button. */
export class Binoculars implements Equipment {
  readonly id = 'binoculars';
  readonly name = 'Binoculars';
  readonly kind = 'binoculars' as const;
  readonly zoomSteps: ZoomStep[] = [{ zoom: 2, tech: 'bino' }, { zoom: 4, tech: 'bino.zoom4' }, { zoom: 8, tech: 'bino.zoom8' }];
  readonly minZoom = 2;
  readonly maxZoom = 8;
  swayDeg = 0.2;

  overlayAt(): Overlay { return 'binoculars'; }
}
