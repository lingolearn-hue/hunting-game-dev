import { Equipment } from './Equipment';

/** Photo camera parameters (the tool, not the virtual view camera). */
export class CameraEquipment implements Equipment {
  readonly id = 'camera_basic';
  readonly name = 'Basic camera';
  readonly opticalZoomMax = 4;
  readonly digitalZoomMax = 2;   // multiplier on top of optical
  readonly shutterCooldownMs = 700;

  get maxZoom(): number { return this.opticalZoomMax * this.digitalZoomMax; }

  /** 1 = full quality; digital zoom reduces it. */
  quality(zoom: number): number {
    return zoom <= this.opticalZoomMax ? 1 : 0.6 + 0.4 * (this.opticalZoomMax / zoom);
  }
}
