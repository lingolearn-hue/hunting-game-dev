import { Game, EquipId } from '../game/Game';

const LABEL: Record<string, string> = { camera: 'CAMERA', binoculars: 'BINOCULARS', weapon: 'RIFLE' };

/** Minimal HUD: time/equipment, zoom, crosshair or scope overlay, equipment row, feedback. */
export class HUD {
  private time = document.createElement('span');
  private info = document.createElement('span');
  private flashEl = document.createElement('div');
  private toastEl = document.createElement('div');
  private overlay = document.createElement('div');
  private cross = document.createElement('div');
  private crouchBtn = document.createElement('button');
  private triggerBtn = document.createElement('button');
  private eqBtns = new Map<EquipId, HTMLButtonElement>();
  private toastTimer = 0;
  private dbg: HTMLDivElement | null = null;
  private frames = 0;
  private acc = 0;
  private fps = 0;

  constructor(
    root: HTMLElement, private game: Game,
    actions: {
      equip: (id: EquipId) => void; menu: () => void; crouch: () => void; trigger: () => void;
      zoomIn: () => void; zoomOut: () => void;
    },
  ) {
    const top = document.createElement('div'); top.className = 'top';
    top.append(this.time, this.info);
    this.cross.className = 'cross';
    this.overlay.className = 'overlay';
    this.flashEl.className = 'flash';
    this.toastEl.className = 'toast';

    const mk = (label: string, fn: () => void) => {
      const b = document.createElement('button'); b.textContent = label; b.onclick = fn; return b;
    };
    const bottom = document.createElement('div'); bottom.className = 'bottom';
    for (const [id, label] of [['binoculars', 'BINOCULARS'], ['camera', 'CAMERA'], ['rifle', 'RIFLE']] as Array<[EquipId, string]>) {
      const b = mk(label, () => actions.equip(id));
      this.eqBtns.set(id, b);
      bottom.append(b);
    }
    bottom.append(mk('MENU', actions.menu));

    this.crouchBtn.className = 'crouch';
    this.crouchBtn.onclick = actions.crouch;
    this.triggerBtn.className = 'trigger';
    this.triggerBtn.onpointerdown = (e) => { e.preventDefault(); actions.trigger(); };
    const zoom = document.createElement('div'); zoom.className = 'zoomcol';
    zoom.append(mk('+', actions.zoomIn), mk('−', actions.zoomOut));

    root.append(this.overlay, this.flashEl, top, this.cross, this.toastEl, zoom, this.crouchBtn, this.triggerBtn, bottom);
    if (new URLSearchParams(location.search).has('debug')) {
      this.dbg = document.createElement('div');
      this.dbg.className = 'dbg';
      root.append(this.dbg);
    }
  }

  flash(strength = 0.9, ms = 350): void {
    this.flashEl.style.transition = 'none';
    this.flashEl.style.opacity = String(strength);
    requestAnimationFrame(() => {
      this.flashEl.style.transition = `opacity ${ms}ms`;
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
    const g = this.game, cur = g.current;
    const t = g.sim.timeOfDay;
    const hh = Math.floor(t), mm = Math.floor((t - hh) * 60);
    const ammo = cur.kind === 'weapon' ? ` · ${g.rifle.reloading ? 'reloading' : `${g.rifle.ammo}/${g.rifle.magazine}`}` : '';
    this.time.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} · ${LABEL[cur.kind]}${ammo}`;

    this.crouchBtn.textContent = g.player.crouching ? 'STAND' : 'CROUCH';
    this.triggerBtn.textContent = cur.kind === 'weapon' ? 'FIRE' : 'PHOTO';
    this.triggerBtn.style.display = cur.kind === 'binoculars' ? 'none' : '';
    const cls = cur.overlay === 'none' ? 'overlay' : `overlay ${cur.overlay}`;
    if (this.overlay.className !== cls) {
      this.overlay.className = cls;
      this.cross.style.display = cur.overlay === 'none' ? '' : 'none';
    }
    for (const [id, b] of this.eqBtns) {
      const on = (id === 'rifle' && cur.kind === 'weapon') || (id === 'camera' && cur.kind === 'camera') || (id === 'binoculars' && cur.kind === 'binoculars');
      b.classList.toggle('active', on);
    }

    const z = g.player.zoom;
    const digital = cur.kind === 'camera' && z > g.camera.opticalZoomMax + 0.001 ? ' digital' : '';
    this.info.textContent = `${z.toFixed(1)}x${digital} · ${sensor ? 'sensor' : 'mouse/touch'} · ${this.fps} fps`;
    if (this.dbg) {
      const n = g.sim.animals.nearest(g.player.position.x, g.player.position.z);
      this.dbg.textContent = n
        ? `${n.animal.species.id} #${n.animal.id} ${n.dist.toFixed(0)}m ${n.animal.state} aw ${n.animal.awareness.toFixed(2)} hp ${n.animal.health}`
        : 'no animals';
    }
  }
}
