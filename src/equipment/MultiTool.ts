import { Equipment, Overlay, ZoomStep } from './Equipment';

export type BuildKind = 'campfire' | 'wall' | 'tower' | 'cannon' | 'cannon2';

/** Collects wood and stone, harvests game and builds structures. */
export class MultiTool implements Equipment {
  readonly id = 'multitool';
  readonly name = 'Multitool';
  readonly kind = 'multitool' as const;
  readonly zoomSteps: ZoomStep[] = [{ zoom: 1, tech: null }];
  readonly minZoom = 1;
  readonly maxZoom = 1;
  readonly reach = 4.5;      // m
  readonly strikeMs = 550;
  swayDeg = 0;
  /** null = gather/harvest mode, otherwise the structure to place (null = also used for remove via 'remove'). */
  buildKind: BuildKind | 'remove' | null = null;
  nextStrikeAt = 0;

  overlayAt(): Overlay { return 'none'; }
}
