import { Game } from '../game/Game';

/** Minimal HUD: time, zoom, crosshair, small button row. */
export class HUD {
  private time = document.createElement('span');
  private info = document.createElement('span');
  private frames = 0;
  private acc = 0;
  private fps = 0;

  constructor(root: HTMLElement, private game: Game, actions: { calibrate: () => void; fullscreen: () => void }) {
    const top = document.createElement('div'); top.className = 'top';
    top.append(this.time, this.info);
    const cross = document.createElement('div'); cross.className = 'cross';
    const bottom = document.createElement('div'); bottom.className = 'bottom';
    const mk = (label: string, fn: () => void) => {
      const b = document.createElement('button'); b.textContent = label; b.onclick = fn; return b;
    };
    bottom.append(mk('CALIBRATE', actions.calibrate), mk('FULLSCREEN', actions.fullscreen));
    root.append(top, cross, bottom);
  }

  update(dt: number, sensor: boolean): void {
    this.frames++; this.acc += dt;
    if (this.acc >= 0.5) { this.fps = Math.round(this.frames / this.acc); this.frames = 0; this.acc = 0; }
    const t = this.game.sim.timeOfDay;
    const hh = Math.floor(t), mm = Math.floor((t - hh) * 60);
    this.time.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    this.info.textContent = `${this.game.player.zoom.toFixed(1)}x · ${sensor ? 'sensor' : 'mouse/touch'} · ${this.fps} fps`;
  }
}
