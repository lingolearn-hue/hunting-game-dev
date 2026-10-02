import { Game, EquipId } from '../game/Game';
import { rangeFinder } from '../game/Ranging';
import { yawOf } from '../util/quat';
import { BinocularsOverlay } from './BinocularsOverlay';
import { MiniMap } from './MiniMap';
import { BUILD_DEFS, buildCost } from '../game/Buildings';
import { BuildKind } from '../equipment/MultiTool';

const LABEL: Record<string, string> = { camera: 'CAMERA', binoculars: 'BINOCULARS', weapon: 'RIFLE', launcher: 'ROCKETS', torch: 'TORCH', multitool: 'MULTITOOL' };
const BTN: Record<EquipId, string> = { camera: 'CAM', binoculars: 'BINO', rifle: 'RIFLE', launcher: 'ROCKET', torch: 'TORCH', multitool: 'TOOL' };
const KIND_OF: Record<EquipId, string> = { camera: 'camera', binoculars: 'binoculars', rifle: 'weapon', launcher: 'launcher', torch: 'torch', multitool: 'multitool' };
const BUILD_ORDER: BuildKind[] = ['campfire', 'wall', 'tower', 'cannon', 'cannon2'];

export interface HudActions {
  equip: (id: EquipId) => void; menu: () => void; crouch: () => void; trigger: () => void;
  zoomIn: () => void; zoomOut: () => void; thermal: () => void; build: (k: BuildKind | 'remove' | null) => void;
}

/** HUD: time/tool, coins, minimap, zoom, crosshair or scope overlay, tool row, build panel, feedback. */
export class HUD {
  private time = document.createElement('span');
  private info = document.createElement('span');
  private stats = document.createElement('div');
  private coinPop = document.createElement('div');
  private coinTimer = 0;
  private flashEl = document.createElement('div');
  private toastEl = document.createElement('div');
  private overlay = document.createElement('div');
  private xr = false;
  private cross = document.createElement('div');
  private crouchBtn = document.createElement('button');
  private triggerBtn = document.createElement('button');
  private thermalBtn = document.createElement('button');
  private windArrow = document.createElement('span');
  private windText = document.createElement('span');
  private threatEl = document.createElement('div');
  private lockEl = document.createElement('div');
  private lockText = document.createElement('div');
  private bottom = document.createElement('div');
  private buildPanel = document.createElement('div');
  private buildBtns = new Map<string, HTMLButtonElement>();
  private eqBtns = new Map<EquipId, HTMLButtonElement>();
  private toolKey = '';
  private buildKey = '';
  private bino: BinocularsOverlay;
  private map: MiniMap;
  private rangeT = 0;
  private rangeText = '---';
  private toastTimer = 0;
  private dbg: HTMLDivElement | null = null;
  private frames = 0;
  private acc = 0;
  private fps = 0;

  constructor(root: HTMLElement, private game: Game, private actions: HudActions, opts: { ar?: boolean; xr?: boolean }) {
    this.xr = !!opts.xr;
    const top = document.createElement('div'); top.className = 'top';
    const wind = document.createElement('span');
    this.windArrow.textContent = '↑'; this.windArrow.style.cssText = 'display:inline-block;transition:transform .3s';
    wind.append('WIND ', this.windArrow, this.windText);
    top.append(this.time, wind, this.info);
    this.stats.className = 'stats';
    this.coinPop.className = 'coinpop';
    this.threatEl.className = 'threat';
    this.cross.className = 'cross';
    this.overlay.className = 'overlay';
    this.flashEl.className = 'flash';
    this.toastEl.className = 'toast';

    const mk = (label: string, fn: () => void) => {
      const b = document.createElement('button'); b.textContent = label; b.onclick = fn; return b;
    };
    this.bottom.className = 'bottom';

    this.crouchBtn.className = 'crouch';
    this.crouchBtn.onclick = actions.crouch;
    if (opts.ar || opts.xr) this.crouchBtn.style.display = 'none'; // the phone is the view in AR: no walking
    this.triggerBtn.className = 'trigger';
    this.triggerBtn.onpointerdown = (e) => { e.preventDefault(); actions.trigger(); };
    const zoom = document.createElement('div'); zoom.className = 'zoomcol';
    zoom.append(mk('+', actions.zoomIn), mk('−', actions.zoomOut));
    if (opts.xr) zoom.style.display = 'none'; // the real camera cannot zoom in WebXR
    this.thermalBtn.className = 'thermalbtn'; this.thermalBtn.textContent = 'THERMAL';
    this.thermalBtn.onclick = actions.thermal; this.thermalBtn.style.display = 'none';
    this.buildPanel.className = 'buildpanel'; this.buildPanel.style.display = 'none';

    this.lockEl.className = 'lock'; this.lockText.className = 'locktext';
    this.bino = new BinocularsOverlay(root);
    this.map = new MiniMap(root);
    root.append(this.overlay, this.flashEl, top, this.stats, this.coinPop, this.cross, this.toastEl, this.threatEl, this.lockEl, this.lockText, zoom,
      this.thermalBtn, this.buildPanel, this.crouchBtn, this.triggerBtn, this.bottom);
    if (new URLSearchParams(location.search).has('debug')) {
      this.dbg = document.createElement('div');
      this.dbg.className = 'dbg';
      root.append(this.dbg);
    }
    this.syncTools();
  }

  /** Rebuilds the tool row when tools were unlocked. */
  private syncTools(): void {
    const tools = this.game.tools();
    const key = tools.join(',');
    if (key === this.toolKey) return;
    this.toolKey = key;
    this.bottom.replaceChildren();
    this.eqBtns.clear();
    for (const id of tools) {
      const b = document.createElement('button'); b.textContent = BTN[id]; b.onclick = () => this.actions.equip(id);
      this.eqBtns.set(id, b); this.bottom.append(b);
    }
    const menu = document.createElement('button'); menu.textContent = 'MENU'; menu.onclick = this.actions.menu;
    this.bottom.append(menu);
  }

  /** Multitool panel: gather mode and the unlocked structures. */
  private syncBuildPanel(): void {
    const g = this.game;
    const synthetic = !g.level.renderer || g.level.renderer === 'synthetic';
    const kinds = BUILD_ORDER.filter((k) => g.has(BUILD_DEFS[k].tech) && (synthetic || k.startsWith('cannon')));
    const key = kinds.join(',');
    if (key === this.buildKey) return;
    this.buildKey = key;
    this.buildPanel.replaceChildren();
    this.buildBtns.clear();
    const add = (id: string, label: string, kind: BuildKind | 'remove' | null) => {
      const b = document.createElement('button'); b.textContent = label; b.onclick = () => this.actions.build(kind);
      this.buildBtns.set(id, b); this.buildPanel.append(b);
    };
    if (synthetic) add('gather', 'GATHER', null);
    for (const k of kinds) {
      const c = buildCost(g.level, k);
      add(k, `${BUILD_DEFS[k].name.toUpperCase()}\n${c.coins ? `${c.coins} coins` : `${c.wood}w ${c.stone}s`}`, k);
    }
    if (kinds.length) add('remove', 'REMOVE', 'remove');
  }

  /** Short "+N coins" notice under the coin counter. */
  coin(n: number, why: string): void {
    this.coinPop.textContent = `+${n} coins · ${why}`;
    this.coinPop.style.opacity = '1';
    clearTimeout(this.coinTimer);
    this.coinTimer = window.setTimeout(() => { this.coinPop.style.opacity = '0'; }, 2200);
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
    this.syncTools();
    const t = g.sim.timeOfDay;
    const hh = Math.floor(t), mm = Math.floor((t - hh) * 60);
    const ammo = cur.kind === 'weapon' ? ` · ${g.rifle.reloading ? 'reloading' : `${g.rifle.ammo}/${g.rifle.magazine}`}`
      : cur.kind === 'launcher' ? ` · ${g.launcher.reloading ? 'reloading' : `${g.launcher.ammo}/${g.launcher.magazine}`}` : '';
    this.time.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} · ${LABEL[cur.kind]}${ammo}`;
    const pr = g.progress;
    this.stats.textContent = `COINS ${pr.coins}` + (g.has('multitool') && (!g.level.renderer || g.level.renderer === 'synthetic') ? ` · WOOD ${pr.wood} · STONE ${pr.stone}` : '');

    if (this.crouchBtn.style.display !== 'none') this.crouchBtn.textContent = g.player.crouching ? 'STAND' : 'CROUCH';
    this.triggerBtn.textContent = cur.kind === 'weapon' ? 'FIRE' : cur.kind === 'launcher' ? 'LAUNCH' : cur.kind === 'multitool' ? 'USE' : 'PHOTO';
    this.triggerBtn.style.display = cur.kind === 'binoculars' || cur.kind === 'torch' ? 'none' : '';

    // Overlay at the current zoom (rifle: iron sight at 1x, scoped above)
    const ov = g.currentOverlay();
    const overlayKind = this.xr && ov !== 'launcher' ? 'none' : ov; // no scope/binocular masks over the XR view
    const isBino = overlayKind === 'binoculars';
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
    const cls = overlayKind === 'none' || isBino ? 'overlay' : `overlay ${overlayKind}`;
    if (this.overlay.className !== cls) {
      this.overlay.className = cls;
      this.cross.style.display = overlayKind === 'none' || overlayKind === 'launcher' ? '' : 'none';
    }
    for (const [id, b] of this.eqBtns) b.classList.toggle('active', cur.kind === KIND_OF[id]);

    // Thermal button (tech) and multitool build panel
    const th = g.thermalAvailable();
    this.thermalBtn.style.display = th ? '' : 'none';
    this.thermalBtn.classList.toggle('active', th && g.thermalOn);
    const mt = cur.kind === 'multitool';
    this.buildPanel.style.display = mt ? 'flex' : 'none';
    if (mt) {
      this.syncBuildPanel();
      const sel = g.multitool.buildKind ?? 'gather';
      for (const [id, b] of this.buildBtns) b.classList.toggle('active', id === sel);
      const k = g.multitool.buildKind;
      this.lockText.style.display = 'block'; this.lockText.style.color = '#fff';
      this.lockText.textContent = k === null ? 'GATHER · aim at a tree, rock or carcass'
        : k === 'remove' ? 'REMOVE · aim at a structure (50% back)'
        : (() => { const c = buildCost(g.level, k); return `BUILD ${BUILD_DEFS[k].name.toUpperCase()} · ${c.coins ? `${c.coins} coins` : `${c.wood} wood, ${c.stone} stone`}`; })();
    }

    this.map.update(g, dt);

    // Wind: arrow shows where the wind blows toward, relative to the view (scent is carried that way)
    const yaw = yawOf(g.player.orientation), w = g.sim.wind;
    const fr = w.x * -Math.sin(yaw) + w.z * -Math.cos(yaw), rr = w.x * Math.cos(yaw) + w.z * -Math.sin(yaw);
    this.windArrow.style.transform = `rotate(${(Math.atan2(rr, fr) * 180 / Math.PI).toFixed(0)}deg)`;
    this.windText.textContent = ` ${w.speed.toFixed(1)} m/s`;

    // Predator warning
    const px = g.player.position.x, pz = g.player.position.z;
    const thr = g.sim.animals.threat(px, pz);
    if (thr) {
      const dx = thr.animal.position.x - px, dz = thr.animal.position.z - pz;
      const rel = Math.atan2(dx * Math.cos(yaw) + dz * -Math.sin(yaw), dx * -Math.sin(yaw) + dz * -Math.cos(yaw));
      const arrow = Math.abs(rel) > 2.4 ? '▼' : rel < -0.5 ? '◀' : rel > 0.5 ? '▶' : '▲';
      const what = thr.animal.state === 'ALERT' ? 'ROARS' : thr.animal.state === 'STALKING' ? 'STALKING' : 'CHARGING';
      this.threatEl.textContent = `⚠ ${thr.animal.species.name.toUpperCase()} ${what} · ${Math.round(thr.dist)} m ${arrow}`;
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
      if (!mt) this.lockText.style.display = 'none';
    }

    const z = g.player.zoom;
    const deaths = g.sim.deaths > 0 ? ` · ☠${g.sim.deaths}` : '';
    this.info.textContent = `${z.toFixed(0)}x${deaths} · ${sensor ? 'sensor' : 'mouse/touch'} · ${this.fps} fps`;
    if (this.dbg) {
      const n = g.sim.animals.nearest(g.player.position.x, g.player.position.z);
      this.dbg.textContent = n
        ? `${n.animal.species.id} #${n.animal.id} ${n.dist.toFixed(0)}m ${n.animal.state} aw ${n.animal.awareness.toFixed(2)} hp ${n.animal.health}`
        : 'no animals';
    }
  }
}
