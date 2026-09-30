import { Quat, QUAT_IDENTITY, multiply, yawQuat, pitchQuat } from '../util/quat';

export const EYE_HEIGHT = 1.7;
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 8;

export class Player {
  position = { x: 0, y: 0, z: 0 }; // meters, Y up
  zoom = 1;

  /** Manual look (mouse / swipe fallback). */
  lookYaw = 0;
  lookPitch = 0;

  /** Phone orientation (smoothed), set by DeviceOrientation input. */
  deviceQuat: Quat | null = null;
  calibration: Quat = QUAT_IDENTITY();

  /** Resulting view orientation. */
  orientation: Quat = QUAT_IDENTITY();

  addLook(dYaw: number, dPitch: number): void {
    this.lookYaw += dYaw;
    if (!this.deviceQuat) {
      this.lookPitch = Math.max(-1.45, Math.min(1.45, this.lookPitch + dPitch));
    }
  }

  setZoom(z: number): void {
    this.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
  }

  updateOrientation(): void {
    if (this.deviceQuat) {
      this.orientation = multiply(yawQuat(this.lookYaw), multiply(this.calibration, this.deviceQuat));
    } else {
      this.orientation = multiply(yawQuat(this.lookYaw), pitchQuat(this.lookPitch));
    }
  }
}
