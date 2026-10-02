export type EquipmentKind = 'camera' | 'binoculars' | 'weapon' | 'launcher' | 'torch' | 'multitool';
export type Overlay = 'none' | 'iron' | 'scope' | 'binoculars' | 'launcher';

/** One zoom level and the tech node that unlocks it (null = always available). */
export interface ZoomStep { zoom: number; tech: string | null; }

/** Equipment is modular and independent from the simulation core. */
export interface Equipment {
  readonly id: string;
  readonly name: string;
  readonly kind: EquipmentKind;
  readonly zoomSteps: ZoomStep[];
  readonly minZoom: number;
  readonly maxZoom: number;
  /** Hand shake amplitude (degrees, standing still). */
  swayDeg: number;
  /** Overlay drawn on the HUD at the given zoom. */
  overlayAt(zoom: number): Overlay;
}
