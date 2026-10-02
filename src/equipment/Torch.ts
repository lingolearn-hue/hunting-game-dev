import { Equipment, Overlay, ZoomStep } from './Equipment';

export interface TorchTier { name: string; color: number; intensity: number; range: number; angle: number; flicker: number; }

/** Light source. Progression: fire torch, electric torch, LED floodlight (tech tree). */
export const TORCH_TIERS: TorchTier[] = [
  { name: 'Fire torch', color: 0xffa040, intensity: 3.0, range: 16, angle: 1.2, flicker: 0.25 },
  { name: 'Electric torch', color: 0xfff2d8, intensity: 5.0, range: 36, angle: 0.5, flicker: 0 },
  { name: 'LED floodlight', color: 0xf0f6ff, intensity: 8.0, range: 60, angle: 0.8, flicker: 0 },
];

export class Torch implements Equipment {
  readonly id = 'torch';
  readonly name = 'Torch';
  readonly kind = 'torch' as const;
  readonly zoomSteps: ZoomStep[] = [{ zoom: 1, tech: null }];
  readonly minZoom = 1;
  readonly maxZoom = 1;
  swayDeg = 0;
  tier = 0;

  overlayAt(): Overlay { return 'none'; }
  get spec(): TorchTier { return TORCH_TIERS[this.tier]; }
}
