import { Player } from '../game/Player';
import { Quat, fromEulerYXZ, fromAxisAngle, multiply, slerp, yawQuat, yawOf } from '../util/quat';

const DEG = Math.PI / 180;
const Q_X90: Quat = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2]; // camera looks out the back of the phone

/** Phone orientation -> smoothed quaternion on the player. */
export class DeviceOrientation {
  active = false;
  private target: Quat | null = null;
  private current: Quat | null = null;
  private needCalibrate = false;

  private player: Player | null = null;

  attach(player: Player): void { this.player = player; }

  /** Must be called from a user gesture (iOS). */
  async start(): Promise<boolean> {
    const DOE = (window as any).DeviceOrientationEvent;
    if (!DOE) return false;
    if (typeof DOE.requestPermission === 'function') {
      try {
        if ((await DOE.requestPermission()) !== 'granted') return false;
      } catch { return false; }
    }
    window.addEventListener('deviceorientation', this.onEvent);
    return true;
  }

  calibrate(): void {
    this.needCalibrate = true;
  }

  private onEvent = (e: DeviceOrientationEvent): void => {
    if (e.alpha === null || e.beta === null || e.gamma === null) return;
    const orient = (screen.orientation?.angle ?? (window as any).orientation ?? 0) * DEG;
    let q = fromEulerYXZ(e.beta * DEG, e.alpha * DEG, -e.gamma * DEG);
    q = multiply(q, Q_X90);
    q = multiply(q, fromAxisAngle(0, 0, 1, -orient));
    this.target = q;
    if (!this.active) { this.active = true; this.needCalibrate = true; }
  };

  update(dt: number): void {
    if (!this.target || !this.player) return;
    if (!this.current) this.current = this.target;
    // More smoothing at high zoom (jitter is amplified by magnification).
    const rate = 30 / Math.sqrt(this.player.zoom);
    this.current = slerp(this.current, this.target, 1 - Math.exp(-dt * rate));
    this.player.deviceQuat = this.current;
    if (this.needCalibrate) {
      this.player.calibration = yawQuat(-yawOf(this.current));
      this.player.lookYaw = 0;
      this.player.lookPitch = 0;
      this.needCalibrate = false;
    }
  }
}
