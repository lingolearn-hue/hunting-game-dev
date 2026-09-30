import { Player } from '../game/Player';

/** Right joystick: rate-controlled view direction. Slower at high zoom, finer near the center. */
export class LookInput {
  readonly joy = { x: 0, y: 0 };
  private static readonly RATE = 2.4; // rad/s at full deflection, 1x zoom

  constructor(private player: Player) {}

  update(dt: number): void {
    const m = Math.hypot(this.joy.x, this.joy.y);
    if (m === 0) return;
    const k = (LookInput.RATE / this.player.zoom) * Math.sqrt(m) * dt; // output magnitude ~ m^1.5
    this.player.addLook(-this.joy.x * k, this.joy.y * k);
  }
}
