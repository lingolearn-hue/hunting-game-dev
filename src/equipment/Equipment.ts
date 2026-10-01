export type EquipmentKind = 'camera' | 'binoculars' | 'weapon' | 'launcher';
export type Overlay = 'none' | 'scope' | 'binoculars' | 'launcher';

/** Equipment is modular and independent from the simulation core. */
export interface Equipment {
  readonly id: string;
  readonly name: string;
  readonly kind: EquipmentKind;
  readonly minZoom: number;
  readonly maxZoom: number;
  /** Hand shake amplitude (degrees, standing still). */
  swayDeg: number;
  readonly overlay: Overlay;
}
