import * as THREE from 'three';
import { CameraBackground } from '../rendering/CameraBackground';
import { ArucoDetector, Marker } from './aruco';
import { Layout, makeLayout, renderSheet, SheetBitmap, drawPrintable, Paper } from './sheet';
import { estimatePose, cameraCenter, focalFromH, FocalCalibrator, Pose, Intrinsics } from './pose';
import { backgroundMask, Hull, Keyframe } from './carve';

const LONG = 640;                      // processing size (long side) for markers and background comparison
const SIZES = [100, 150, 200];         // scan cube, mm
const AZ_BINS = 12, EL_BINS = 3;
const EL_EDGES = [10, 30, 55, 85];     // degrees above the sheet
const MAX_KF = 60;

interface Pending { markers: Marker[]; gray: Uint8Array; color: Uint8ClampedArray; sharp: number; }

/**
 * Object scan level: print the marker sheet, put the object in the middle and walk around it with the phone.
 * The markers give an exact, drift-free camera pose in millimetres; the known speckle pattern of the sheet tells which
 * pixels are NOT sheet (= object), and a voxel cube is carved accordingly (see carve.ts). No motion sensors needed.
 */
export class ObjectScanApp {
  private paper: Paper = 'A4';
  private L: Layout = makeLayout('A4');
  private B: SheetBitmap = renderSheet(makeLayout('A4'), 3);
  private det = new ArucoDetector(makeLayout('A4').markers.map((m) => m.id));
  private cal = new FocalCalibrator();
  private fAssumed = 0;
  private f = 0;                      // calibrated focal length (px), 0 until known
  private sizeIdx = 1;
  private hull = new Hull(64, SIZES[1]);
  private kfs: Keyframe[] = [];
  private pending: Pending[] = [];
  private cover = new Array(AZ_BINS * EL_BINS).fill(0);
  private trim: number | null = null;
  private w = 0; private h = 0;
  private work = document.createElement('canvas');
  private wctx = this.work.getContext('2d', { willReadFrequently: true })!;
  private col = document.createElement('canvas');
  private cctx = this.col.getContext('2d', { willReadFrequently: true })!;
  private ov = document.createElement('canvas');
  private ovx = this.ov.getContext('2d')!;
  private dial = document.createElement('canvas');
  private dialx = this.dial.getContext('2d')!;
  private text = document.createElement('div');
  private bar = document.createElement('div');
  private sheetView: HTMLElement | null = null;
  private lastProc = 0; private lastKf = 0; private msDetect = 0;
  private markers: Marker[] = []; private pose: Pose | null = null; private cam: [number, number, number] | null = null;
  private sharpRef = 0; private sharp = 0;
  private note = 'Print the sheet (SHEET), put the object in the middle, then walk around it';
  private model = false;
  private gl: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private cam3 = new THREE.PerspectiveCamera(50, 1, 1, 3000);
  private meshObj: THREE.Mesh | null = null;
  private meshVersion = -1; private meshT = 0;
  private orbit = { theta: 0.7, phi: 1.0, r: 330 };
  private btnModel!: HTMLButtonElement;

  constructor(private camBg: CameraBackground, private viewEl: HTMLElement, private hud: HTMLElement) {
    camBg.attach(viewEl);
    this.ov.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
    this.dial.width = this.dial.height = 110;
    this.dial.style.cssText = 'position:absolute;right:10px;top:calc(env(safe-area-inset-top,0px) + 70px);width:110px;height:110px;pointer-events:none';
    this.text.style.cssText = 'position:absolute;top:calc(env(safe-area-inset-top,0px) + 6px);left:12px;right:130px;font-size:12px;line-height:1.4;text-shadow:0 0 3px #000;white-space:pre-line;pointer-events:none';
    this.bar.className = 'bottom';
    this.bar.style.cssText += ';flex-wrap:wrap;justify-content:center;gap:5px;bottom:6px';
    const mk = (label: string, fn: (b: HTMLButtonElement) => void): HTMLButtonElement => { const b = document.createElement('button'); b.textContent = label; b.style.fontSize = '11px'; b.onclick = () => fn(b); this.bar.append(b); return b; };
    mk('SHEET', () => this.openSheet());
    mk('SNAP', () => this.snap(true));
    this.btnModel = mk('MODEL', () => this.toggleModel());
    mk(`CUBE ${SIZES[this.sizeIdx]}`, (b) => { this.sizeIdx = (this.sizeIdx + 1) % SIZES.length; b.textContent = `CUBE ${SIZES[this.sizeIdx]}`; this.rebuildHull(); });
    mk('TOP', () => this.askTop());
    mk('REFINE', () => this.refine());
    mk('SCALE', () => this.askScale());
    mk('RESET', () => this.reset());
    mk('SAVE', () => this.save());
    mk('EXIT', () => location.reload());
    hud.append(this.ov, this.dial, this.text, this.bar);
  }

  start(): void { requestAnimationFrame(this.frame); }

  // ---------------- capture loop ----------------

  private init(vw: number, vh: number): void {
    const k = LONG / Math.max(vw, vh);
    this.w = Math.round(vw * k); this.h = Math.round(vh * k);
    this.work.width = this.w; this.work.height = this.h;
    this.col.width = Math.round(this.w / 2); this.col.height = Math.round(this.h / 2);
    this.fAssumed = Math.max(this.w, this.h) / 2 / Math.tan((this.camBg.fovLong * Math.PI) / 360);
  }

  private frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    const v = this.camBg.video;
    if (!this.camBg.ok || !v.videoWidth) { this.text.textContent = 'Waiting for the camera…'; return; }
    if (!this.w || Math.abs(v.videoWidth / v.videoHeight - this.w / this.h) > 0.02) this.init(v.videoWidth, v.videoHeight);
    if (now - this.lastProc > 140) { this.lastProc = now; this.process(now); }
    this.draw();
    if (this.model) this.render3d(now);
  };

  private grab(): { gray: Uint8Array; color: Uint8ClampedArray } {
    const { w, h } = this;
    this.wctx.drawImage(this.camBg.video, 0, 0, w, h);
    const rgba = this.wctx.getImageData(0, 0, w, h).data, gray = new Uint8Array(w * h);
    for (let i = 0, j = 0; i < gray.length; i++, j += 4) gray[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
    this.cctx.drawImage(this.camBg.video, 0, 0, this.col.width, this.col.height);
    return { gray, color: this.cctx.getImageData(0, 0, this.col.width, this.col.height).data };
  }

  private K(): Intrinsics { return { f: this.f || this.fAssumed, cx: this.w / 2, cy: this.h / 2 }; }

  private process(now: number): void {
    const { gray, color } = this.grab();
    let t0 = performance.now();
    this.markers = this.det.detect(gray, this.w, this.h);
    this.msDetect = performance.now() - t0;
    const r = this.markers.length >= 2 ? estimatePose(this.L, this.markers, this.K()) : null;
    this.pose = r ? r.pose : null;
    this.cam = r ? cameraCenter(r.pose) : null;
    if (r && r.pose.markers >= 6 && r.pose.rms < 1.5) this.cal.add(focalFromH(r.H, this.w / 2, this.h / 2));
    if (!this.f) { const f = this.cal.value(10); if (f) { this.f = f; this.flushPending(); } }
    if (!r) { this.note = this.markers.length ? 'Need more markers in view (2+)' : 'Point the camera at the marker sheet'; return; }
    // sharpness: mean gradient (blur check)
    t0 = performance.now();
    let s = 0, n = 0;
    for (let y = 4; y < this.h - 4; y += 3) for (let x = 4; x < this.w - 4; x += 3) { s += Math.abs(gray[y * this.w + x + 2] - gray[y * this.w + x - 2]) + Math.abs(gray[(y + 2) * this.w + x] - gray[(y - 2) * this.w + x]); n++; }
    this.sharp = s / n; this.sharpRef = Math.max(this.sharpRef * 0.995, this.sharp);
    const good = r.pose.markers >= 6 && r.pose.rms < 1.2 && this.sharp > 0.65 * this.sharpRef;
    const bin = this.binOf(this.cam!);
    this.note = !this.f ? `calibrating the camera… ${this.cal.count}/10 views` : good ? 'scanning' : r.pose.markers < 6 ? 'move back: 6+ markers should be visible' : this.sharp <= 0.65 * this.sharpRef ? 'hold still (blurry)' : 'checking the pose…';
    if (good && bin >= 0 && this.cover[bin] < 2 && now - this.lastKf > 350 && this.kfs.length + this.pending.length < MAX_KF) {
      this.addView({ markers: this.markers, gray, color, sharp: this.sharp }, bin);
      this.lastKf = now;
    }
  }

  private binOf(c: [number, number, number]): number {
    const el = (Math.atan2(c[2], Math.hypot(c[0], c[1])) * 180) / Math.PI, az = (Math.atan2(c[1], c[0]) * 180) / Math.PI + 180;
    if (el < EL_EDGES[0] || el > EL_EDGES[3]) return -1;
    let e = 0; while (e < EL_BINS - 1 && el >= EL_EDGES[e + 1]) e++;
    return e * AZ_BINS + Math.min(AZ_BINS - 1, Math.floor((az / 360) * AZ_BINS));
  }

  private snap(force: boolean): void {
    if (!this.pose || !this.cam || this.w === 0) { this.note = 'No pose: cannot capture'; return; }
    const { gray, color } = this.grab();
    this.addView({ markers: this.markers, gray, color, sharp: this.sharp }, force ? this.binOf(this.cam) : -1);
  }

  private addView(p: Pending, bin: number): void {
    if (bin >= 0) this.cover[bin]++;
    if (!this.f) { this.pending.push(p); return; }       // carve only with a calibrated focal length
    this.carveView(p);
  }

  /** Once the focal length is known the stored views get their final pose and are carved. */
  private flushPending(): void {
    const list = this.pending; this.pending = [];
    for (const p of list) this.carveView(p);
  }

  private carveView(p: Pending): void {
    const K = this.K(), r = estimatePose(this.L, p.markers, K);
    if (!r || r.pose.markers < 4 || r.pose.rms > 1.5) return;
    const bg = backgroundMask(p.gray, this.w, this.h, r.pose, K, this.L, this.B);
    let sI = 0, cnt = 0;
    for (let q = 0; q < bg.length; q += 7) if (bg[q]) { sI += p.gray[q]; cnt++; }
    const kf: Keyframe = { R: r.pose.R, t: r.pose.t, K, w: this.w, h: this.h, bg, color: p.color, cw: this.col.width, ch: this.col.height, center: cameraCenter(r.pose), gray: p.gray, gain: cnt > 50 ? sI / cnt / 170 : 1 };
    this.kfs.push(kf);
    this.hull.carve(kf);
    if (this.trim !== null) this.hull.trimTop(this.trim);
    if (this.kfs.length % 3 === 0) this.hull.keepLargest();   // drop floating leftovers
  }

  private rebuildHull(): void {
    this.hull = new Hull(64, SIZES[this.sizeIdx]);
    for (const kf of this.kfs) this.hull.carve(kf);
    if (this.trim !== null) this.hull.trimTop(this.trim);
    this.hull.keepLargest();
  }

  private reset(): void {
    this.kfs = []; this.pending = []; this.cover.fill(0); this.trim = null; this.f = 0; this.cal = new FocalCalibrator();
    this.hull.reset(); this.meshVersion = -1;
  }

  private askTop(): void {
    const v = prompt('Object height in mm (cuts everything above; empty = no cut):', this.trim !== null ? String(this.trim) : '');
    if (v === null) return;
    const mm = parseFloat(v);
    this.trim = isFinite(mm) && mm > 5 ? mm : null;
    this.rebuildHull();
  }

  private askScale(): void {
    const v = prompt('Printed 100 mm bar measures (mm)? 100 = exact print size:', '100');
    const m = v === null ? NaN : parseFloat(v);
    if (!isFinite(m) || m < 80 || m > 120) return;
    const k = m / 100;
    // the printed sheet is k times larger than designed: scale the layout and rebuild everything
    const base = makeLayout(this.paper);
    this.L = { ...base, w: base.w * k, h: base.h * k, markers: base.markers.map((mk) => ({ ...mk, cx: mk.cx * k, cy: mk.cy * k })), freeX: base.freeX * k, freeY: base.freeY * k };
    this.note = `sheet scale ${(k * 100).toFixed(1)}% — press RESET and scan again`;
  }

  private refine(): void {
    this.note = 'refining…';
    setTimeout(() => { const n = this.hull.refine(this.kfs, { std: 20, passes: 14 }); this.hull.keepLargest(); this.note = `refine removed ${n} voxels`; }, 30);
  }

  private save(): void {
    if (!this.kfs.length) { this.note = 'Nothing to save yet'; return; }
    const st = this.hull.stats(), dims = [0, 1, 2].map((a) => (st.max[a] - st.min[a]).toFixed(0));
    const ply = this.hull.toPly(this.kfs, [`object scan, size ${dims.join(' x ')} mm, volume ${(st.volumeMm3 / 1000).toFixed(0)} cm3, ${this.kfs.length} views`]);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ply], { type: 'text/plain' })); a.download = `object-${Date.now()}.ply`;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  // ---------------- sheet printing ----------------

  private openSheet(): void {
    if (this.sheetView) return;
    const root = document.createElement('div');
    root.style.cssText = 'position:fixed;inset:0;z-index:30;background:#111;color:#fff;overflow:auto;padding:10px;text-align:center;font-size:13px';
    const c = document.createElement('canvas');
    drawPrintable(this.L, c);
    c.style.cssText = 'width:min(92vw,60vh);height:auto;background:#fff;margin:8px auto;display:block';
    const mk = (label: string, fn: () => void) => { const b = document.createElement('button'); b.textContent = label; b.style.cssText = 'margin:4px;padding:10px 14px'; b.onclick = fn; return b; };
    const blob = () => new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/png'));
    const info = document.createElement('p');
    info.textContent = `${this.paper} sheet with 14 markers (ArUco 4x4, 28 mm). Print at 100% / "actual size" (no fit-to-page), on matte paper, flat. The bar in the middle must measure 100 mm: if not, use SCALE.`;
    info.style.cssText = 'max-width:520px;margin:6px auto';
    root.append(info, mk(`PAPER: ${this.paper}`, () => { this.paper = this.paper === 'A4' ? 'Letter' : 'A4'; this.L = makeLayout(this.paper); this.B = renderSheet(this.L, 3); this.det = new ArucoDetector(this.L.markers.map((m) => m.id)); close(); this.openSheet(); }),
      mk('PRINT', async () => {
        const url = URL.createObjectURL(await blob()), win = window.open('', '_blank');
        if (!win) { this.note = 'Pop-up blocked: use SAVE and print the image'; return; }
        win.document.write(`<!doctype html><title>Scan sheet</title><style>@page{size:${this.paper === 'A4' ? 'A4' : 'letter'};margin:0}html,body{margin:0}img{display:block;width:${this.L.w}mm;height:${this.L.h}mm}</style><img src="${url}" onload="setTimeout(function(){window.print()},300)">`);
        win.document.close();
      }),
      mk('SAVE / SHARE', async () => {
        const b = await blob(), file = new File([b], `scan-sheet-${this.paper}.png`, { type: 'image/png' });
        const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
        if (nav.canShare?.({ files: [file] })) { try { await nav.share({ files: [file], title: 'Scan sheet' }); return; } catch { /* cancelled */ } }
        const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = file.name; document.body.append(a); a.click(); a.remove();
      }),
      mk('CLOSE', () => close()), c);
    const close = () => { root.remove(); this.sheetView = null; };
    this.hud.append(root);
    this.sheetView = root;
  }

  // ---------------- drawing ----------------

  private proj(X: [number, number, number]): [number, number] | null {
    const p = this.pose;
    if (!p) return null;
    const { R, t } = p, K = this.K(), xc = R[0] * X[0] + R[1] * X[1] + R[2] * X[2] + t[0], yc = R[3] * X[0] + R[4] * X[1] + R[5] * X[2] + t[1], zc = R[6] * X[0] + R[7] * X[1] + R[8] * X[2] + t[2];
    if (zc < 30) return null;
    return [K.f * xc / zc + K.cx, K.f * yc / zc + K.cy];
  }

  private draw(): void {
    const c = this.ov, sw = c.clientWidth, sh = c.clientHeight, dpr = Math.min(devicePixelRatio || 1, 2);
    if (c.width !== sw * dpr || c.height !== sh * dpr) { c.width = sw * dpr; c.height = sh * dpr; }
    const g = this.ovx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, sw, sh);
    const st = this.hull.stats();
    this.text.textContent = `${this.note}\n`
      + `markers ${this.markers.length} · pose ${this.pose ? this.pose.rms.toFixed(2) + ' px' : '-'} · focal ${this.f ? this.f.toFixed(0) + ' px' : '?'} · views ${this.kfs.length}${this.pending.length ? '+' + this.pending.length : ''} · ${this.msDetect.toFixed(0)} ms\n`
      + (this.kfs.length ? `model ${[0, 1, 2].map((a) => (st.max[a] - st.min[a]).toFixed(0)).join(' x ')} mm · ${(st.volumeMm3 / 1000).toFixed(0)} cm³${this.trim ? ` · cut at ${this.trim} mm` : ''}` : '');
    if (!this.model && this.w) {
      const k = Math.max(sw / this.w, sh / this.h), ox = (sw - this.w * k) / 2, oy = (sh - this.h * k) / 2;
      const P = (p: [number, number]): [number, number] => [ox + p[0] * k, oy + p[1] * k];
      g.lineWidth = 2; g.strokeStyle = '#4aff7a';
      for (const m of this.markers) { g.beginPath(); m.corners.forEach((p, i) => { const q = P(p as [number, number]); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }); g.closePath(); g.stroke(); }
      const line = (a: [number, number, number], b: [number, number, number]) => { const p = this.proj(a), q = this.proj(b); if (!p || !q) return; const A = P(p), B2 = P(q); g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B2[0], B2[1]); g.stroke(); };
      if (this.pose) {
        const s = SIZES[this.sizeIdx] / 2, top = this.trim ?? SIZES[this.sizeIdx];
        g.strokeStyle = 'rgba(255,208,64,.9)';
        const cs: Array<[number, number]> = [[-s, -s], [s, -s], [s, s], [-s, s]];
        for (let i = 0; i < 4; i++) { const a = cs[i], b = cs[(i + 1) % 4]; line([a[0], a[1], 0], [b[0], b[1], 0]); line([a[0], a[1], top], [b[0], b[1], top]); line([a[0], a[1], 0], [a[0], a[1], top]); }
        g.fillStyle = 'rgba(80,220,255,.65)';          // current model: surface voxels
        const { n, occ } = this.hull, step = 2;
        for (let k = 0; k < n; k += step) for (let j = 0; j < n; j += step) for (let i = 0; i < n; i += step) {
          const id = (k * n + j) * n + i;
          if (!occ[id]) continue;
          if (i > 0 && i < n - 1 && j > 0 && j < n - 1 && k < n - 1 && occ[id - 1] && occ[id + 1] && occ[id - n] && occ[id + n] && occ[id + n * n] && (k === 0 || occ[id - n * n])) continue;
          const p = this.proj(this.hull.center(i, j, k));
          if (p) { const q = P(p); g.fillRect(q[0] - 1, q[1] - 1, 2.5, 2.5); }
        }
      }
    }
    // coverage dial: rings = elevation (inner = high), sectors = azimuth
    const d = this.dialx, R0 = 52;
    d.clearRect(0, 0, 110, 110);
    d.fillStyle = 'rgba(0,0,0,.4)'; d.beginPath(); d.arc(55, 55, 54, 0, 7); d.fill();
    for (let e = 0; e < EL_BINS; e++) for (let a = 0; a < AZ_BINS; a++) {
      const r1 = R0 * (1 - e / EL_BINS), r0 = R0 * (1 - (e + 1) / EL_BINS), a0 = (a / AZ_BINS) * Math.PI * 2 - Math.PI, a1 = ((a + 1) / AZ_BINS) * Math.PI * 2 - Math.PI;
      d.beginPath(); d.arc(55, 55, r1, a0 + 0.02, a1 - 0.02); d.arc(55, 55, r0 + 1, a1 - 0.02, a0 + 0.02, true); d.closePath();
      const cnt = this.cover[e * AZ_BINS + a];
      d.fillStyle = cnt >= 2 ? 'rgba(80,220,120,.85)' : cnt === 1 ? 'rgba(220,200,60,.8)' : 'rgba(255,255,255,.18)'; d.fill();
    }
    if (this.cam) {
      const el = Math.atan2(this.cam[2], Math.hypot(this.cam[0], this.cam[1])), az = Math.atan2(this.cam[1], this.cam[0]) + Math.PI;
      const rr = R0 * (1 - Math.max(0, Math.min(1, (el * 180 / Math.PI - EL_EDGES[0]) / (EL_EDGES[3] - EL_EDGES[0]))));
      d.fillStyle = '#fff'; d.beginPath(); d.arc(55 + rr * Math.cos(az - Math.PI), 55 + rr * Math.sin(az - Math.PI), 4, 0, 7); d.fill();
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
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x555566, 1.1), new THREE.DirectionalLight(0xffffff, 0.8));
    this.scene.add(new THREE.GridHelper(300, 30, 0x445566, 0x26313a));
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
    if (!this.gl) this.setup3d();                    // WebGL only when the model view is first opened
    this.model = !this.model;
    this.gl!.domElement.style.display = this.model ? 'block' : 'none';
    this.btnModel.textContent = this.model ? 'CAMERA' : 'MODEL';
    this.meshVersion = -1;
  }

  private render3d(now: number): void {
    const gl = this.gl!, w = gl.domElement.clientWidth, h = gl.domElement.clientHeight;
    if (gl.domElement.width !== Math.floor(w * gl.getPixelRatio())) { gl.setSize(w, h, false); this.cam3.aspect = w / h; this.cam3.updateProjectionMatrix(); }
    if (this.hull.version !== this.meshVersion && now - this.meshT > 1500) {
      this.meshVersion = this.hull.version; this.meshT = now;
      const m = this.hull.mesh(this.kfs);
      if (this.meshObj) { this.scene.remove(this.meshObj); this.meshObj.geometry.dispose(); }
      const geo = new THREE.BufferGeometry();
      // board (x right, y up the paper, z up) -> three (x, y up, z toward the viewer): (x, z, -y)
      const pos = new Float32Array(m.positions.length), nor = new Float32Array(m.normals.length);
      for (let i = 0; i < pos.length; i += 3) { pos[i] = m.positions[i]; pos[i + 1] = m.positions[i + 2]; pos[i + 2] = -m.positions[i + 1]; nor[i] = m.normals[i]; nor[i + 1] = m.normals[i + 2]; nor[i + 2] = -m.normals[i + 1]; }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('color', new THREE.BufferAttribute(m.colors, 3));
      this.meshObj = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
      this.scene.add(this.meshObj);
    }
    const o = this.orbit, ty = SIZES[this.sizeIdx] * 0.25;
    this.cam3.position.set(o.r * Math.sin(o.phi) * Math.sin(o.theta), ty + o.r * Math.cos(o.phi), o.r * Math.sin(o.phi) * Math.cos(o.theta));
    this.cam3.lookAt(0, ty, 0);
    gl.render(this.scene, this.cam3);
  }
}
