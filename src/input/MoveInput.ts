import { Player } from '../game/Player';

const clamp = (v: number) => Math.max(-1, Math.min(1, v));

/** Combines WASD/arrows and the virtual joystick into player.move. C toggles crouch. */
export class MoveInput {
  readonly joy = { x: 0, y: 0 };
  private keys = new Set<string>();

  constructor(private player: Player) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyC' && !e.repeat) player.crouching = !player.crouching;
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  update(): void {
    const k = this.keys;
    const x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    this.player.move.x = clamp(x + this.joy.x);
    this.player.move.y = clamp(y + this.joy.y);
  }
}
