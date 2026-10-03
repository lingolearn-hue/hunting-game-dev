import * as THREE from 'three';
import { CameraBackground } from '../rendering/CameraBackground';
import { DeviceOrientation } from '../input/DeviceOrientation';
import { Player } from '../game/Player';
import { Quat } from '../util/quat';
import { Slam } from '../slam/Slam';
import { FreeScan, BuildInfo } from './freescan';
import { Hull, Keyframe } from './carve';

const FPS = 14;
const HEIGHTS_CM = [20, 30, 40];
const LAGS = [0, 40, 80];
const AZ_BINS = 12, EL_BINS = 3, EL_EDGES = [8, 30, 52, 88];
const MAX_KF = 90;

/**
 * Object scan without markers: the visual-inertial tracker follows features around the object, a bundle adjustment
 * with loop closure refines all poses, the table is found as a plane and the object is carved out of a voxel cube
 * (see freescan.ts). The object needs a textured surface under it (newspaper, cloth, wood) and some texture of its own.
 */
export class ObjectScanFreeApp {
  private player = new Player();
  private slam: Slam | null = null;
  private fs: FreeScan | null = null;
  private w = 0; private h = 0;
  private cv = document.createElement('canvas'); private cx = this.cv.getContext('2d', { willReadFrequently: true })!;
  private big = document.createElement('canvas'); private bx = this.big.getContext('2d', { willReadFrequently: true })!;
  private small = document.createElement('canvas'); private sx = this.small.getContext('2d', { willReadFrequently: true })!;
  private ov = document.createElement('canvas'); private ovx = this.ov.getContext('2d')!;
  private dial = document.createElement('canvas'); private dialx = this.dial.getContext('2d')!;
  private text = document.createElement('div');
  private hist: Array<{ t: number; q: Quat }> = [];
  private lastProc = 0; private lastKf = 0; private ms = 0;
  private heightCm = 30; private lagIdx = 1;
  private cover = new Array(AZ_BINS * EL_BINS).fill(0);
  private centre: [number, number] | null = null;      // object centre (tracker x, z), from the first view
  private lastFwd: [number, number, number] | null = null; private lastC: [number, number, number] | null = null;
  private building = false; private note = 'Put the object on a textured surface, hold the phone ~30 cm away looking down ~40°, then walk slowly around it';
  private hull: Hull | null = null; private carveKfs: Keyframe[] = []; private info: BuildInfo | null = null;
  private userScale = 1;
  private model = false;
  private gl: THREE.WebGLRenderer | null = null; private scene = new THREE.Scene(); private cam3 = new THREE.PerspectiveCamera(50, 1, 1, 3000);
  private meshObj: THREE.Mesh | null = null; private meshVersion = -1; private meshT = 0;
  private orbit = { theta: 0.7, phi: 1.0, r: 330 };
  private btnModel!: HTMLButtonElement;

  constructor(private camBg: CameraBackground, private device: DeviceOrientation, private viewEl: HTMLElement, hud: HTMLElement) {
    device.attach(this.player);
    camBg.attach(viewEl);
    this.ov.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
    this.dial.width = this.dial.height = 110;
    this.dial.style.cssText = 'position:absolute;right:10px;top:calc(env(safe-area-inset-top,0px) + 70px);width:110px;height:110px;pointer-events:none';
    this.text.style.cssText = 'position:absolute;top:calc(env(safe-area-inset-top,0px) + 6px);left:12px;right:130px;font-size:12px;line-height:1.4;text-shadow:0 0 3px #000;white-space:pre-line;pointer-events:none';
    const bar = document.createElement('div'); bar.className = 'bottom';
    bar.style.cssText += ';flex-wrap:wrap;justify-content:center;gap:5px;bottom:6px';
    const mk = (label: string, fn: (b: HTMLButtonElement) => void): HTMLButtonElement => { const b = document.createElement('button'); b.textContent = label; b.style.fontSize = '11px'; b.onclick = () => fn(b); bar.append(b); return b; };
    mk('BUILD', () => void this.build(false));
    this.btnModel = mk('MODEL', () => this.toggleModel());
    mk(`H ${this.heightCm} cm`, (b) => { this.heightCm = HEIGHTS_CM[(HEIGHTS_CM.indexOf(this.heightCm) + 1) % HEIGHTS_CM.length]; b.textContent = `H ${this.heightCm} cm`; this.reset(); });
    mk('SCALE', () => this.askScale());
    mk(`LAG ${LAGS[this.lagIdx]}`, (b) => { this.lagIdx = (this.lagIdx + 1) % LAGS.length; b.textContent = `LAG ${LAGS[this.lagIdx]}`; });
    mk('REFINE', () => void this.build(true));
    mk('RESET', () => this.reset());
    mk('SAVE', () => this.save());
    mk('EXIT', () => location.reload());
    hud.append(this.ov, this.dial, this.text, bar);
  }

  start(): void { requestAnimationFrame(this.frame); }

  private init(vw: number, vh: number): void {
    const k = 320 / Math.max(vw, vh);
    this.w = Math.round(vw * k); this.h = Math.round(vh * k);
    this.cv.width = this.w; this.cv.height = this.h;
    this.big.width = this.w * 2; this.big.height = this.h * 2;
    this.small.width = Math.round(this.w / 2); this.small.height = Math.round(this.h / 2);
    this.makeSlam();
  }

  private makeSlam(): void {
    this.slam = new Slam({ width: this.w, height: this.h, fovLongDeg: this.camBg.fovLong, camHeight: this.heightCm / 10, maxTracks: 200 });
    this.fs = new FreeScan(this.slam);
    this.cover.fill(0); this.centre = null; this.lastFwd = null; this.lastC = null;
  }

  private reset(): void {
    if (this.w) this.makeSlam();
    this.hull = null; this.carveKfs = []; this.info = null; this.userScale = 1; this.meshVersion = -1;
    this.note = 'Reset. Put the object on a textured surface and walk slowly around it';
  }

  private qAt(t: number): Quat {
    for (let i = this.hist.length - 1; i >= 0; i--) if (this.hist[i].t <= t) return this.hist[i].q;
    return this.hist.length ? this.hist[0].q : this.player.orientation;
  }

  private frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, Math.max(0.001, (now - (this.hist.length ? this.hist[this.hist.length - 1].t : now - 16)) / 1000));
    this.device.update(dt);
    this.player.updateOrientation();
    this.hist.push({ t: now, q: this.player.orientation });
    while (this.hist.length > 90) this.hist.shift();
    const v = this.camBg.video;
    if (!this.camBg.ok || !v.videoWidth) { this.text.textContent = 'Waiting for the camera…'; return; }
    if (!this.slam || v.videoWidth / v.videoHeight - this.w / this.h > 0.02 || this.w / this.h - v.videoWidth / v.videoHeight > 0.02) this.init(v.videoWidth, v.videoHeight);
    if (!this.building && now - this.lastProc >= 1000 / FPS) { this.lastProc = now; this.track(now); }
    this.draw();
    if (this.model) this.render3d(now);
  };

  private track(now: number): void {
    const slam = this.slam!, W = this.w, H = this.h;
    this.cx.drawImage(this.camBg.video, 0, 0, W, H);
    const rgba = this.cx.getImageData(0, 0, W, H).data, gray = new Uint8Array(W * H);
    for (let i = 0, j = 0; i < gray.length; i++, j += 4) gray[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
    const t0 = performance.now();
    const info = slam.process(gray, null, this.qAt(now - LAGS[this.lagIdx]));
    this.ms = performance.now() - t0;
    this.note = info.state === 'track' ? (this.fs!.kfs.length < 8 ? 'tracking: keep walking around the object' : 'tracking: BUILD when you are around once or twice') : slam.note;
    if (info.state !== 'track') return;
    const fwd = this.forward(slam.q);
    if (!this.centre) { // object centre: where the middle of the first view hits the table
      if (fwd[1] < -0.2) { const t = (slam.floorY - slam.c[1]) / fwd[1]; this.centre = [slam.c[0] + fwd[0] * t, slam.c[2] + fwd[2] * t]; }
      return;
    }
    // keyframe: the view direction turned >= 5 degrees or the camera moved >= 2.5 cm, the image is sharp enough, not too often
    const moved = this.lastC ? Math.hypot(slam.c[0] - this.lastC[0], slam.c[1] - this.lastC[1], slam.c[2] - this.lastC[2]) : 9;
    const turned = this.lastFwd ? Math.acos(Math.max(-1, Math.min(1, fwd[0] * this.lastFwd[0] + fwd[1] * this.lastFwd[1] + fwd[2] * this.lastFwd[2]))) * 180 / Math.PI : 99;
    if (now - this.lastKf < 280 || (turned < 5 && moved < 0.25) || this.fs!.kfs.length >= MAX_KF || info.inliers < 10) return;
    let s = 0, n = 0;
    for (let y = 4; y < H - 4; y += 3) for (let x = 4; x < W - 4; x += 3) { s += Math.abs(gray[y * W + x + 2] - gray[y * W + x - 2]) + Math.abs(gray[(y + 2) * W + x] - gray[(y - 2) * W + x]); n++; }
    this.sharpRef = Math.max(this.sharpRef * 0.998, s / n);
    if (s / n < 0.6 * this.sharpRef) return;
    this.bx.drawImage(this.camBg.video, 0, 0, W * 2, H * 2);
    const big = this.bx.getImageData(0, 0, W * 2, H * 2).data, g640 = new Uint8Array(W * H * 4);
    for (let i = 0, j = 0; i < g640.length; i++, j += 4) g640[i] = (big[j] * 77 + big[j + 1] * 150 + big[j + 2] * 29) >> 8;
    this.sx.drawImage(this.camBg.video, 0, 0, this.small.width, this.small.height);
    const color = this.sx.getImageData(0, 0, this.small.width, this.small.height).data;
    this.fs!.addKeyframe(gray, g640, new Uint8ClampedArray(color), this.small.width, this.small.height);
    this.lastKf = now; this.lastC = [...slam.c] as [number, number, number]; this.lastFwd = fwd;
    const b = this.binOf(slam);
    if (b >= 0) this.cover[b]++;
  }
  private sharpRef = 0;

  private forward(q: Quat): [number, number, number] {
    const [x, y, z, w] = q;
    return [-(2 * (x * z + y * w)), -(2 * (y * z - x * w)), -(1 - 2 * (x * x + y * y))];
  }

  private binOf(slam: Slam): number {
    if (!this.centre) return -1;
    const dx = slam.c[0] - this.centre[0], dz = slam.c[2] - this.centre[1], hh = slam.c[1] - slam.floorY;
    const el = (Math.atan2(hh, Math.hypot(dx, dz)) * 180) / Math.PI, az = (Math.atan2(dz, dx) * 180) / Math.PI + 180;
    if (el < EL_EDGES[0] || el > EL_EDGES[3]) return -1;
    let e = 0; while (e < EL_BINS - 1 && el >= EL_EDGES[e + 1]) e++;
    return e * AZ_BINS + Math.min(AZ_BINS - 1, Math.floor((az / 360) * AZ_BINS));
  }

  private async build(refine: boolean): Promise<void> {
    if (this.building || !this.fs) return;
    this.building = true;
    const res = await this.fs.build({ refine }, async (m) => { this.note = m; this.draw(); await new Promise((r) => setTimeout(r, 0)); });
    this.building = false;
    if (typeof res === 'string') { this.note = res; return; }
    this.hull = res.hull; this.carveKfs = res.carveKfs; this.info = res.info; this.meshVersion = -1;
    this.userScale = 1;
    this.note = 'Model built. Measure the object height and use SCALE; MODEL shows it in 3D';
    if (!this.model) this.toggleModel();
  }

  private askScale(): void {
    if (!this.hull) { this.note = 'BUILD first'; return; }
    const st = this.hull.stats(), now = st.max[2] * this.userScale;
    const v = prompt(`Real height of the object in mm (the model is ${now.toFixed(0)} mm tall now):`, now.toFixed(0));
    const mm = v === null ? NaN : parseFloat(v);
    if (!isFinite(mm) || mm < 5) return;
    this.userScale = mm / st.max[2];
    this.meshVersion = -1;
  }

  private save(): void {
    if (!this.hull) { this.note = 'Nothing to save yet: BUILD first'; return; }
    const st = this.hull.stats(), k = this.userScale, dims = [0, 1, 2].map((a) => ((st.max[a] - st.min[a]) * k).toFixed(0));
    const ply = this.hull.toPly(this.carveKfs, [`markerless object scan, size ${dims.join(' x ')} mm, volume ${(st.volumeMm3 * k ** 3 / 1000).toFixed(0)} cm3, ${this.info?.keyframes ?? 0} views`], k);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ply], { type: 'text/plain' })); a.download = `object-free-${Date.now()}.ply`;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  // ---------------- drawing ----------------

  private draw(): void {
    const c = this.ov, sw = c.clientWidth, sh = c.clientHeight, dpr = Math.min(devicePixelRatio || 1, 2);
    if (c.width !== sw * dpr || c.height !== sh * dpr) { c.width = sw * dpr; c.height = sh * dpr; }
    const g = this.ovx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, sw, sh);
    const slam = this.slam;
    const kf = this.fs?.kfs.length ?? 0;
    let m = '';
    if (this.info && this.hull) {
      const st = this.hull.stats(), k = this.userScale;
      m = `\nmodel ${[0, 1, 2].map((a) => ((st.max[a] - st.min[a]) * k).toFixed(0)).join(' x ')} mm · ${(st.volumeMm3 * k ** 3 / 1000).toFixed(0)} cm³ · pose error after adjustment ~${this.info.rmsAfter.toFixed(1)} px`;
    }
    this.text.textContent = `${this.note}\nviews ${kf} · tracks ${slam?.tracks.length ?? 0} · map ${slam?.alivePoints().length ?? 0} · ${this.ms.toFixed(0)} ms${m}`;
    if (slam && !this.model && this.w) {
      const k = Math.max(sw / this.w, sh / this.h), ox = (sw - this.w * k) / 2, oy = (sh - this.h * k) / 2;
      for (const t of slam.tracks) { g.fillStyle = t.map >= 0 ? '#ff4a3a' : '#4aff7a'; g.beginPath(); g.arc(ox + t.x * k, oy + t.y * k, t.map >= 0 ? 3 : 2, 0, 7); g.fill(); }
      if (this.centre) { // the assumed object centre on the table
        const p = slam.project([this.centre[0], slam.floorY, this.centre[1]]);
        if (p) { g.strokeStyle = '#ffd040'; g.lineWidth = 2; g.beginPath(); g.arc(ox + p[0] * k, oy + p[1] * k, 14, 0, 7); g.moveTo(ox + p[0] * k - 20, oy + p[1] * k); g.lineTo(ox + p[0] * k + 20, oy + p[1] * k); g.moveTo(ox + p[0] * k, oy + p[1] * k - 20); g.lineTo(ox + p[0] * k, oy + p[1] * k + 20); g.stroke(); }
      }
    }
    const d = this.dialx, R0 = 52;
    d.clearRect(0, 0, 110, 110);
    d.fillStyle = 'rgba(0,0,0,.4)'; d.beginPath(); d.arc(55, 55, 54, 0, 7); d.fill();
    for (let e = 0; e < EL_BINS; e++) for (let a = 0; a < AZ_BINS; a++) {
      const r1 = R0 * (1 - e / EL_BINS), r0 = R0 * (1 - (e + 1) / EL_BINS), a0 = (a / AZ_BINS) * Math.PI * 2 - Math.PI, a1 = ((a + 1) / AZ_BINS) * Math.PI * 2 - Math.PI;
      d.beginPath(); d.arc(55, 55, r1, a0 + 0.02, a1 - 0.02); d.arc(55, 55, r0 + 1, a1 - 0.02, a0 + 0.02, true); d.closePath();
      const cnt = this.cover[e * AZ_BINS + a];
      d.fillStyle = cnt >= 2 ? 'rgba(80,220,120,.85)' : cnt === 1 ? 'rgba(220,200,60,.8)' : 'rgba(255,255,255,.18)'; d.fill();
    }
    if (slam && this.centre && slam.state === 'track') {
      const dx = slam.c[0] - this.centre[0], dz = slam.c[2] - this.centre[1], el = Math.atan2(slam.c[1] - slam.floorY, Math.hypot(dx, dz)) * 180 / Math.PI, az = Math.atan2(dz, dx);
      const rr = R0 * (1 - Math.max(0, Math.min(1, (el - EL_EDGES[0]) / (EL_EDGES[3] - EL_EDGES[0]))));
      d.fillStyle = '#fff'; d.beginPath(); d.arc(55 + rr * Math.cos(az), 55 + rr * Math.sin(az), 4, 0, 7); d.fill();
    }
  }

  // ---------------- 3D model view ----------------

  private setup3d(): void {
    const gl = new THREE.WebGLRenderer({ antialias: true });
    gl.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    gl.setClearColor(0x14181c, 1);
    gl.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:none;z-index:2;touch-action:none';
    this.viewEl.append(gl.domElement);
    this.gl = gl;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x555566, 1.1), new THREE.DirectionalLight(0xffffff, 0.8), new THREE.GridHelper(300, 30, 0x445566, 0x26313a));
    const ptr = new Map<number, { x: number; y: number }>();
    gl.domElement.addEventListener('pointerdown', (e) => ptr.set(e.pointerId, { x: e.clientX, y: e.clientY }));
    const end = (e: PointerEvent) => ptr.delete(e.pointerId);
    window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
    gl.domElement.addEventListener('pointermove', (e) => {
      const p = ptr.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      if (ptr.size === 1) { this.orbit.theta -= dx * 0.008; this.orbit.phi = Math.min(1.55, Math.max(0.1, this.orbit.phi - dy * 0.008)); }
    });
    gl.domElement.addEventListener('wheel', (e) => { e.preventDefault(); this.orbit.r = Math.min(1200, Math.max(80, this.orbit.r * (e.deltaY > 0 ? 1.1 : 0.9))); }, { passive: false });
    let pinch = 0;
    gl.domElement.addEventListener('touchmove', (e) => {
      if (e.touches.length !== 2) { pinch = 0; return; }
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      if (pinch) this.orbit.r = Math.min(1200, Math.max(80, this.orbit.r * (pinch / d)));
      pinch = d;
    }, { passive: true });
  }

  private toggleModel(): void {
    if (!this.gl) this.setup3d();
    this.model = !this.model;
    this.gl!.domElement.style.display = this.model ? 'block' : 'none';
    this.btnModel.textContent = this.model ? 'CAMERA' : 'MODEL';
    this.meshVersion = -1;
  }

  private render3d(now: number): void {
    const gl = this.gl!, w = gl.domElement.clientWidth, h = gl.domElement.clientHeight;
    if (gl.domElement.width !== Math.floor(w * gl.getPixelRatio())) { gl.setSize(w, h, false); this.cam3.aspect = w / h; this.cam3.updateProjectionMatrix(); }
    if (this.hull && (this.hull.version !== this.meshVersion) && now - this.meshT > 600) {
      this.meshVersion = this.hull.version; this.meshT = now;
      const m = this.hull.mesh(this.carveKfs), k = this.userScale;
      if (this.meshObj) { this.scene.remove(this.meshObj); this.meshObj.geometry.dispose(); }
      const geo = new THREE.BufferGeometry(), pos = new Float32Array(m.positions.length), nor = new Float32Array(m.normals.length);
      for (let i = 0; i < pos.length; i += 3) { pos[i] = m.positions[i] * k; pos[i + 1] = m.positions[i + 2] * k; pos[i + 2] = -m.positions[i + 1] * k; nor[i] = m.normals[i]; nor[i + 1] = m.normals[i + 2]; nor[i + 2] = -m.normals[i + 1]; }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('color', new THREE.BufferAttribute(m.colors, 3));
      this.meshObj = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
      this.scene.add(this.meshObj);
    }
    const o = this.orbit, ty = 40;
    this.cam3.position.set(o.r * Math.sin(o.phi) * Math.sin(o.theta), ty + o.r * Math.cos(o.phi), o.r * Math.sin(o.phi) * Math.cos(o.theta));
    this.cam3.lookAt(0, ty, 0);
    gl.render(this.scene, this.cam3);
  }
}
