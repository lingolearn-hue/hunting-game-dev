import { Game, EquipId } from '../game/Game';
import { rangeFinder } from '../game/Ranging';
import { yawOf } from '../util/quat';
import { BinocularsOverlay } from './BinocularsOverlay';

const LABEL: Record<string, string> = { camera: 'CAMERA', binoculars: 'BINOCULARS', weapon: 'RIFLE', launcher: 'ROCKETS' };
const BTN: Record<EquipId, string> = { binoculars: 'BINOCULARS', camera: 'CAMERA', rifle: 'RIFLE', launcher: 'ROCKETS' };

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
  private windArrow = document.createElement('span');
  private windText = document.createElement('span');
  private threatEl = document.createElement('div');
  private lockEl = document.createElement('div');
  private lockText = document.createElement('div');
  private eqBtns = new Map<EquipId, HTMLButtonElement>();
  private bino: BinocularsOverlay;
  private rangeT = 0;
  private rangeText = '---';
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
    opts: { equipment: EquipId[]; ar?: boolean },
  ) {
    const top = document.createElement('div'); top.className = 'top';
    const wind = document.createElement('span');
    this.windArrow.textContent = '↑'; this.windArrow.style.cssText = 'display:inline-block;transition:transform .3s';
    wind.append('WIND ', this.windArrow, this.windText);
    top.append(this.time, wind, this.info);
    this.threatEl.className = 'threat';
    this.cross.className = 'cross';
    this.overlay.className = 'overlay';
    this.flashEl.className = 'flash';
    this.toastEl.className = 'toast';

    const mk = (label: string, fn: () => void) => {
      const b = document.createElement('button'); b.textContent = label; b.onclick = fn; return b;
    };
    const bottom = document.createElement('div'); bottom.className = 'bottom';
    for (const id of opts.equipment) {
      const b = mk(BTN[id], () => actions.equip(id));
      this.eqBtns.set(id, b);
      bottom.append(b);
    }
    bottom.append(mk('MENU', actions.menu));

    this.crouchBtn.className = 'crouch';
    this.crouchBtn.onclick = actions.crouch;
    if (opts.ar) this.crouchBtn.style.display = 'none'; // the phone is the view in AR: no walking
    this.triggerBtn.className = 'trigger';
    this.triggerBtn.onpointerdown = (e) => { e.preventDefault(); actions.trigger(); };
    const zoom = document.createElement('div'); zoom.className = 'zoomcol';
    zoom.append(mk('+', actions.zoomIn), mk('−', actions.zoomOut));

    this.lockEl.className = 'lock'; this.lockText.className = 'locktext';
    this.bino = new BinocularsOverlay(root);
    root.append(this.overlay, this.flashEl, top, this.cross, this.toastEl, this.threatEl, this.lockEl, this.lockText, zoom, this.crouchBtn, this.triggerBtn, bottom);
    if (new URLSearchParams(location.search).has('debug')) {
      this.dbg = document.createElement('div');
      this.dbg.className = 'dbg';
      root.append(this.dbg);
    }
  }

  flash(strength = 0.9, ms = 350, color = '#fff'): void {
    this.flashEl.style.background = color;
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
    const ammo = cur.kind === 'weapon' ? ` · ${g.rifle.reloading ? 'reloading' : `${g.rifle.ammo}/${g.rifle.magazine}`}`
      : cur.kind === 'launcher' ? ` · ${g.launcher.reloading ? 'reloading' : `${g.launcher.ammo}/${g.launcher.magazine}`}` : '';
    this.time.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} · ${LABEL[cur.kind]}${ammo}`;

    if (this.crouchBtn.style.display !== 'none') this.crouchBtn.textContent = g.player.crouching ? 'STAND' : 'CROUCH';
    this.triggerBtn.textContent = cur.kind === 'weapon' ? 'FIRE' : cur.kind === 'launcher' ? 'LAUNCH' : 'PHOTO';
    this.triggerBtn.style.display = cur.kind === 'binoculars' ? 'none' : '';
    const isBino = cur.overlay === 'binoculars';
    this.bino.show(isBino);
    if (isBino) {
      this.rangeT -= dt;
      if (this.rangeT <= 0) {
        this.rangeT = 0.2;
        const r = rangeFinder(g);
        this.rangeText = r ? `${Math.round(r.dist)} m` : '---';
      }
      this.bino.update(g.player.zoom, this.rangeText);
    }
    const cls = cur.overlay === 'none' || isBino ? 'overlay' : `overlay ${cur.overlay}`;
    if (this.overlay.className !== cls) {
      this.overlay.className = cls;
      this.cross.style.display = cur.overlay === 'none' || cur.overlay === 'launcher' ? '' : 'none';
    }
    for (const [id, b] of this.eqBtns) {
      const on = (id === 'rifle' && cur.kind === 'weapon') || (id === 'camera' && cur.kind === 'camera') || (id === 'binoculars' && cur.kind === 'binoculars');
      b.classList.toggle('active', on);
    }

    // Wind: arrow shows where the wind blows toward, relative to the view (scent is carried that way)
    const yaw = yawOf(g.player.orientation), w = g.sim.wind;
    const fr = w.x * -Math.sin(yaw) + w.z * -Math.cos(yaw), rr = w.x * Math.cos(yaw) + w.z * -Math.sin(yaw);
    this.windArrow.style.transform = `rotate(${(Math.atan2(rr, fr) * 180 / Math.PI).toFixed(0)}deg)`;
    this.windText.textContent = ` ${w.speed.toFixed(1)} m/s`;

    // Predator warning
    const px = g.player.position.x, pz = g.player.position.z;
    const th = g.sim.animals.threat(px, pz);
    if (th) {
      const dx = th.animal.position.x - px, dz = th.animal.position.z - pz;
      const rel = Math.atan2(dx * Math.cos(yaw) + dz * -Math.sin(yaw), dx * -Math.sin(yaw) + dz * -Math.cos(yaw));
      const arrow = Math.abs(rel) > 2.4 ? '▼' : rel < -0.5 ? '◀' : rel > 0.5 ? '▶' : '▲';
      const what = th.animal.state === 'ALERT' ? 'ROARS' : th.animal.state === 'STALKING' ? 'STALKING' : 'CHARGING';
      this.threatEl.textContent = `⚠ ${th.animal.species.name.toUpperCase()} ${what} · ${Math.round(th.dist)} m ${arrow}`;
      this.threatEl.style.display = 'block';
    } else {
      this.threatEl.style.display = 'none';
    }

    // Rocket lock-on bracket
    const lk = g.lock;
    if (cur.kind === 'launcher') {
      if (lk.target && lk.ndc && Math.abs(lk.ndc.x) < 1.2 && Math.abs(lk.ndc.y) < 1.2) {
        this.lockEl.style.display = 'block';
        this.lockEl.style.left = `${50 + lk.ndc.x * 50}%`;
        this.lockEl.style.top = `${50 - lk.ndc.y * 50}%`;
        this.lockEl.className = lk.state === 'locked' ? 'lock locked' : 'lock';
      } else {
        this.lockEl.style.display = 'none';
      }
      this.lockText.style.display = 'block';
      this.lockText.textContent = lk.state === 'locked' ? `LOCKED · ${lk.target!.species.name} · ${lk.distance} m`
        : lk.state === 'locking' ? `LOCKING ${Math.round(lk.progress * 100)}%` : 'SEARCHING';
      this.lockText.style.color = lk.state === 'locked' ? '#ff5a4a' : '#fff';
    } else {
      this.lockEl.style.display = 'none';
      this.lockText.style.display = 'none';
    }

    const z = g.player.zoom;
    const digital = cur.kind === 'camera' && z > g.camera.opticalZoomMax + 0.001 ? ' digital' : '';
    const deaths = g.sim.deaths > 0 ? ` · ☠${g.sim.deaths}` : '';
    this.info.textContent = `${z.toFixed(1)}x${digital}${deaths} · ${sensor ? 'sensor' : 'mouse/touch'} · ${this.fps} fps`;
    if (this.dbg) {
      const n = g.sim.animals.nearest(g.player.position.x, g.player.position.z);
      this.dbg.textContent = n
        ? `${n.animal.species.id} #${n.animal.id} ${n.dist.toFixed(0)}m ${n.animal.state} aw ${n.animal.awareness.toFixed(2)} hp ${n.animal.health}`
        : 'no animals';
    }
  }
}
