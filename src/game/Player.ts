import { Quat, QUAT_IDENTITY, multiply, yawQuat, pitchQuat } from '../util/quat';

export const EYE_STAND = 1.7;
export const EYE_CROUCH = 0.9;
export const WALK_SPEED = 3.5;   // m/s
export const CROUCH_SPEED = 1.8; // m/s
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 8;

export class Player {
  position = { x: 0, y: 0, z: 0 }; // meters, Y up (y = eye position)
  speed = 0;                       // actual ground speed, m/s
  crouching = false;
  eyeHeight = EYE_STAND;
  /** Movement input: x = strafe right, y = forward, each in [-1,1]. Relative to view heading. */
  move = { x: 0, y: 0 };
  zoom = 1;
  minZoom = ZOOM_MIN;
  maxZoom = ZOOM_MAX;

  /** Hand shake and recoil offsets (rad), applied on top of the view orientation. */
  swayYaw = 0; swayPitch = 0;
  kickYaw = 0; kickPitch = 0;

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
    this.lookPitch = Math.max(-1.45, Math.min(1.45, this.lookPitch + dPitch));
  }

  setZoom(z: number): void {
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, z));
  }

  updateOrientation(): void {
    const base = this.deviceQuat
      ? multiply(yawQuat(this.lookYaw), multiply(this.calibration, multiply(this.deviceQuat, pitchQuat(this.lookPitch))))
      : multiply(yawQuat(this.lookYaw), pitchQuat(this.lookPitch));
    this.orientation = multiply(yawQuat(this.swayYaw + this.kickYaw), multiply(base, pitchQuat(this.swayPitch + this.kickPitch)));
  }
}
