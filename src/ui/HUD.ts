import { Game } from '../game/Game';

/** Minimal HUD: time, zoom, crosshair, small button row, shutter flash and result toast. */
export class HUD {
  private time = document.createElement('span');
  private info = document.createElement('span');
  private flashEl = document.createElement('div');
  private toastEl = document.createElement('div');
  private toastTimer = 0;
  private crouchBtn = document.createElement('button');
  private dbg: HTMLDivElement | null = null;
  private frames = 0;
  private acc = 0;
  private fps = 0;

  constructor(
    root: HTMLElement, private game: Game,
    actions: { calibrate: () => void; gallery: () => void; fullscreen: () => void; crouch: () => void; level: () => void },
  ) {
    const top = document.createElement('div'); top.className = 'top';
    top.append(this.time, this.info);
    const cross = document.createElement('div'); cross.className = 'cross';
    this.flashEl.className = 'flash';
    this.toastEl.className = 'toast';
    const bottom = document.createElement('div'); bottom.className = 'bottom';
    const mk = (label: string, fn: () => void) => {
      const b = document.createElement('button'); b.textContent = label; b.onclick = fn; return b;
    };
    bottom.append(mk('CALIBRATE', actions.calibrate), mk('GALLERY', actions.gallery), mk('FULLSCREEN', actions.fullscreen), mk('LEVEL', actions.level));
    this.crouchBtn.className = 'crouch';
    this.crouchBtn.onclick = actions.crouch;
    root.append(this.flashEl, top, cross, this.toastEl, this.crouchBtn, bottom);
    if (new URLSearchParams(location.search).has('debug')) {
      this.dbg = document.createElement('div');
      this.dbg.className = 'dbg';
      root.append(this.dbg);
    }
  }

  flash(): void {
    this.flashEl.style.transition = 'none';
    this.flashEl.style.opacity = '0.9';
    requestAnimationFrame(() => {
      this.flashEl.style.transition = 'opacity .35s';
      this.flashEl.style.opacity = '0';
    });
  }

  toast(text: string, sub = ''): void {
    this.toastEl.replaceChildren(document.createTextNode(text));
    if (sub) {
      const s = document.createElement('small'); s.textContent = sub;
      this.toastEl.append(s);
    }
    this.toastEl.style.opacity = '1';
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => { this.toastEl.style.opacity = '0'; }, 3500);
  }

  update(dt: number, sensor: boolean): void {
    this.frames++; this.acc += dt;
    if (this.acc >= 0.5) { this.fps = Math.round(this.frames / this.acc); this.frames = 0; this.acc = 0; }
    const t = this.game.sim.timeOfDay;
    const hh = Math.floor(t), mm = Math.floor((t - hh) * 60);
    this.time.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    this.crouchBtn.textContent = this.game.player.crouching ? 'STAND' : 'CROUCH';
    const z = this.game.player.zoom;
    const digital = z > this.game.camera.opticalZoomMax + 0.001 ? ' digital' : '';
    this.info.textContent = `${z.toFixed(1)}x${digital} · ${sensor ? 'sensor' : 'mouse/touch'} · ${this.fps} fps`;
    if (this.dbg) {
      const n = this.game.sim.animals.nearest(this.game.player.position.x, this.game.player.position.z);
      this.dbg.textContent = n
        ? `${n.animal.species.id} #${n.animal.id} ${n.dist.toFixed(0)}m ${n.animal.state} aw ${n.animal.awareness.toFixed(2)}`
        : 'no animals';
    }
  }
}
