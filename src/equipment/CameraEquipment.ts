import { Equipment, Overlay, ZoomStep } from './Equipment';

/** Photo camera (the tool, not the virtual view camera). Starts at 1x; zoom levels are unlocked in the tech tree. */
export class CameraEquipment implements Equipment {
  readonly id = 'camera_basic';
  readonly name = 'Basic camera';
  readonly kind = 'camera' as const;
  readonly zoomSteps: ZoomStep[] = [{ zoom: 1, tech: null }, { zoom: 2, tech: 'cam.zoom2' }, { zoom: 4, tech: 'cam.zoom4' }];
  readonly minZoom = 1;
  readonly maxZoom = 4;
  readonly shutterCooldownMs = 700;
  swayDeg = 0.12;

  overlayAt(): Overlay { return 'none'; }

  /** Optical zoom only: always full quality. */
  quality(_zoom?: number): number { return 1; }
}
