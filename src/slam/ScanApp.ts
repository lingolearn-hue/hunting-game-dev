import * as THREE from 'three';
import { Slam } from './Slam';
import { toPly } from './MapBuilder';
import { StructureTracker, describe, confidence } from './Structure';
import { CameraBackground } from '../rendering/CameraBackground';
import { DeviceOrientation } from '../input/DeviceOrientation';
import { Player } from '../game/Player';
import { Quat, yawOf } from '../util/quat';

const LONG = 192;            // processing resolution (long side)
const FPS = 18;              // processing rate
const HEIGHTS = [1.2, 1.5, 1.7];
const LAGS = [0, 40, 80, 120];
const FOVS = [55, 60, 65, 70, 75];

/**
 * 3D scan prototype: live camera image + phone orientation -> sparse 3D map (see Slam.ts).
 * Overlay shows tracked features (green) and map points (red = used for pose), MAP shows the cloud in 3D,
 * the small top-down view shows points, objects and the walked path. SAVE exports a PLY file.
 */
export class ScanApp {
  private player = new Player();
  private slam: Slam | null = null;
  private cv = document.createElement('canvas');          // processing image
  private cx = this.cv.getContext('2d', { willReadFrequently: true })!;
  private ov = document.createElement('canvas');          // overlay
  private ovx = this.ov.getContext('2d')!;
  private top = document.createElement('canvas');         // top-down map
  private topx = this.top.getContext('2d')!;
  private text = document.createElement('div');
  private hist: Array<{ t: number; q: Quat }> = [];
  private lastProc = 0;
  private ms = 0; private frames = 0; private acc = 0;
  private height = 1.5; private lagIdx = 1; private fovIdx = 2;
  private vw = 0; private vh = 0;
  private st = new StructureTracker();
  private stT = 0;
  private stVersion = -1;
  // 3D view
  private view3d = false;
  private gl: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private cam3 = new THREE.PerspectiveCamera(60, 1, 0.05, 200);
  private cloud: THREE.Points | null = null;
  private cloudVersion = -1;
  private marker = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 8), new THREE.MeshBasicMaterial({ color: 0xffd040 }));
  private trailLine: THREE.Line | null = null;
  private structMeshes: THREE.Object3D[] = [];
  private orbit = { theta: 0.8, phi: 0.9, r: 6 };
  private btnMap!: HTMLButtonElement;

  constructor(private camBg: CameraBackground, private device: DeviceOrientation, private viewEl: HTMLElement, hud: HTMLElement) {
    device.attach(this.player);
    camBg.attach(viewEl);
    this.ov.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
    this.top.width = this.top.height = 130;
    this.top.style.cssText = 'position:absolute;left:10px;bottom:62px;width:130px;height:130px;border-radius:8px;background:rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.4);pointer-events:none';
    this.text.className = 'top';
    this.text.style.cssText = 'position:absolute;top:calc(env(safe-area-inset-top,0px) + 6px);left:12px;right:12px;font-size:12px;line-height:1.4;text-shadow:0 0 3px #000;white-space:pre-line;pointer-events:none';
    const bar = document.createElement('div'); bar.className = 'bottom';
    const mk = (label: string, fn: (b: HTMLButtonElement) => void) => { const b = document.createElement('button'); b.textContent = label; b.onclick = () => fn(b); bar.append(b); return b; };
    mk('RESET', () => this.reset());
    this.btnMap = mk('MAP 3D', () => this.toggle3d());
    mk(`H ${this.height} m`, (b) => { this.height = HEIGHTS[(HEIGHTS.indexOf(this.height) + 1) % HEIGHTS.length]; b.textContent = `H ${this.height} m`; this.reset(); });
    mk(`FOV ${FOVS[this.fovIdx]}°`, (b) => { this.fovIdx = (this.fovIdx + 1) % FOVS.length; b.textContent = `FOV ${FOVS[this.fovIdx]}°`; this.slam?.setFov(FOVS[this.fovIdx]); });
    mk(`LAG ${LAGS[this.lagIdx]}`, (b) => { this.lagIdx = (this.lagIdx + 1) % LAGS.length; b.textContent = `LAG ${LAGS[this.lagIdx]}`; });
    mk('SAVE', () => this.save());
    mk('EXIT', () => location.reload());
    hud.append(this.ov, this.top, this.text, bar);
    this.setup3d();
  }

  start(): void { requestAnimationFrame(this.frame); }

  private reset(): void { this.slam?.reset(false); this.st.reset(); }

  private save(): void {
    if (!this.slam) return;
    const pts = this.slam.alivePoints();
    const blob = new Blob([toPly(pts, describe(this.st))], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `scan-${Date.now()}.ply`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  /** Orientation `ago` ms ago (the video lags behind the sensors). */
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
    if (v.videoWidth !== this.vw || v.videoHeight !== this.vh || !this.slam) this.init(v.videoWidth, v.videoHeight);
    if (now - this.lastProc < 1000 / FPS) return;
    this.lastProc = now;

    const slam = this.slam!, W = this.cv.width, H = this.cv.height;
    this.cx.drawImage(v, 0, 0, W, H);
    const rgba = this.cx.getImageData(0, 0, W, H).data;
    const gray = new Uint8Array(W * H);
    for (let i = 0, j = 0; i < gray.length; i++, j += 4) gray[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
    const t0 = performance.now();
    const info = slam.process(gray, rgba, this.qAt(now - LAGS[this.lagIdx]));
    this.acc += performance.now() - t0; this.frames++;
    if (this.frames >= 15) { this.ms = this.acc / this.frames; this.acc = 0; this.frames = 0; }

    if (slam.state === 'track') {
      if (now - this.stT > 700) { this.stT = now; this.st.update(slam); }   // re-fit walls and boxes on the accumulated map
      this.st.verify(slam);                                                 // every frame: free-space and image-edge corroboration
    }
    this.text.textContent = `${info.state === 'track' ? 'TRACKING' : 'INITIALIZING'} · ${info.note}\n`
      + `tracks ${info.tracks} · pose pts ${info.inliers} · map ${info.mapSize} · walls ${this.st.walls.filter((w) => w.confirmed).length} · boxes ${this.st.boxes.filter((b) => b.confirmed).length} · corners ${this.st.corners.length} · ${this.ms.toFixed(0)} ms\n`
      + `pos ${slam.c.map((c) => c.toFixed(2)).join(', ')} m`
      + (info.state === 'init' ? '\nHold ~1.5 m high, tilt down ~35°, slide sideways ~0.5 m' : '');
    this.drawOverlay(slam);
    this.drawTop(slam);
    if (this.view3d) this.render3d(slam);
  };

  private init(vw: number, vh: number): void {
    this.vw = vw; this.vh = vh;
    const k = LONG / Math.max(vw, vh);
    this.cv.width = Math.round(vw * k); this.cv.height = Math.round(vh * k);
    this.slam = new Slam({ width: this.cv.width, height: this.cv.height, fovLongDeg: FOVS[this.fovIdx], camHeight: this.height });
    this.st.reset();
  }

  private drawOverlay(slam: Slam): void {
    const c = this.ov, sw = c.clientWidth, sh = c.clientHeight, dpr = Math.min(devicePixelRatio || 1, 2);
    if (c.width !== sw * dpr || c.height !== sh * dpr) { c.width = sw * dpr; c.height = sh * dpr; }
    const g = this.ovx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, sw, sh);
    if (this.view3d) return;
    const W = this.cv.width, k = Math.max(sw / this.vw, sh / this.vh) * (this.vw / W);   // processing px -> screen px (cover)
    const ox = (sw - this.vw * (k * W / this.vw)) / 2, oy = (sh - this.vh * (k * W / this.vw)) / 2;
    g.fillStyle = 'rgba(80,160,255,.8)';
    const pts = slam.alivePoints(); const step = Math.max(1, Math.floor(pts.length / 250));
    for (let i = 0; i < pts.length; i += step) {
      const p = slam.project(pts[i].X);
      if (p) g.fillRect(ox + p[0] * k - 1, oy + p[1] * k - 1, 3, 3);
    }
    for (const t of slam.tracks) {
      g.fillStyle = t.map >= 0 ? '#ff4a3a' : '#4aff7a';
      g.beginPath(); g.arc(ox + t.x * k, oy + t.y * k, t.map >= 0 ? 3 : 2, 0, 7); g.fill();
    }
    // detected structure: edges projected into the image. Solid = confirmed, dashed = tentative; brighter = image edges agree
    const line = (a: [number, number, number], b: [number, number, number], it: { confirmed: boolean } & Parameters<typeof confidence>[0]) => {
      const s = slam.projectSegment(a, b);
      if (!s) return;
      const conf = confidence(it), good = it.edgeTries > 3 && it.edgeHits / it.edgeTries > 0.4;
      g.strokeStyle = it.confirmed ? (good ? '#7dffb0' : '#35d070') : '#ffd040';
      g.globalAlpha = it.confirmed ? 0.55 + 0.45 * conf : 0.6;
      g.lineWidth = it.confirmed ? 2.5 : 1.5; g.setLineDash(it.confirmed ? [] : [5, 4]);
      g.beginPath(); g.moveTo(ox + s[0] * k, oy + s[1] * k); g.lineTo(ox + s[2] * k, oy + s[3] * k); g.stroke();
    };
    for (const w of this.st.walls) for (const [a, b] of this.st.wallEdges(w)) line(a, b, w);
    for (const b of this.st.boxes) for (const [p0, p1] of this.st.boxEdges(b)) line(p0, p1, b);
    g.setLineDash([]); g.globalAlpha = 1;
    g.fillStyle = '#fff';
    for (const c of this.st.corners) { const p = slam.project([c.x, slam.floorY, c.z]); if (p) { g.beginPath(); g.arc(ox + p[0] * k, oy + p[1] * k, 4, 0, 7); g.fill(); } }
  }

  private drawTop(slam: Slam): void {
    const g = this.topx, S = this.top.width, sc = 22; // px per meter
    g.clearRect(0, 0, S, S);
    const cx = slam.c[0], cz = slam.c[2], X = (x: number) => S / 2 + (x - cx) * sc, Z = (z: number) => S / 2 + (z - cz) * sc;
    g.fillStyle = 'rgba(80,220,120,.7)';
    for (const p of slam.alivePoints()) g.fillRect(X(p.X[0]) - 1, Z(p.X[2]) - 1, 2, 2);
    // walls: lines; boxes: rotated rectangles; corners: dots (white = confirmed, yellow = tentative)
    for (const w of this.st.walls) {
      g.strokeStyle = w.confirmed ? '#fff' : '#ffd040'; g.lineWidth = w.confirmed ? 3 : 1.5;
      g.beginPath(); g.moveTo(X(w.ax), Z(w.az)); g.lineTo(X(w.bx), Z(w.bz)); g.stroke();
    }
    for (const b of this.st.boxes) {
      const q = this.st.boxCorners(b);
      g.strokeStyle = b.confirmed ? '#8ff' : '#ffd040'; g.fillStyle = 'rgba(120,255,255,.22)'; g.lineWidth = 1.5;
      g.beginPath(); q.forEach((p, i) => (i ? g.lineTo(X(p[0]), Z(p[1])) : g.moveTo(X(p[0]), Z(p[1])))); g.closePath(); g.fill(); g.stroke();
    }
    g.fillStyle = '#fff';
    for (const c of this.st.corners) { g.beginPath(); g.arc(X(c.x), Z(c.z), 3, 0, 7); g.fill(); }
    g.lineWidth = 1;
    g.strokeStyle = '#ffd040'; g.beginPath();
    slam.trail.forEach((p, i) => (i ? g.lineTo(X(p[0]), Z(p[2])) : g.moveTo(X(p[0]), Z(p[2]))));
    g.stroke();
    const yaw = yawOf(slam.q);
    g.save(); g.translate(S / 2, S / 2); g.rotate(-yaw);
    g.fillStyle = '#ff4a3a'; g.beginPath(); g.moveTo(0, -8); g.lineTo(5, 6); g.lineTo(-5, 6); g.closePath(); g.fill(); g.restore();
  }

  // ---- 3D map view ----

  private setup3d(): void {
    const gl = new THREE.WebGLRenderer({ antialias: false });
    gl.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    gl.setClearColor(0x0c1218, 1);
    gl.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:none;z-index:2;touch-action:none';
    this.viewEl.append(gl.domElement);
    this.gl = gl;
    this.scene.add(new THREE.GridHelper(20, 40, 0x335566, 0x1c2a33), this.marker);
    const pts = new Map<number, { x: number; y: number }>();
    gl.domElement.addEventListener('pointerdown', (e) => pts.set(e.pointerId, { x: e.clientX, y: e.clientY }));
    const end = (e: PointerEvent) => pts.delete(e.pointerId);
    window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
    gl.domElement.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      if (pts.size === 1) { this.orbit.theta -= dx * 0.008; this.orbit.phi = Math.min(1.5, Math.max(0.1, this.orbit.phi - dy * 0.008)); }
    });
    gl.domElement.addEventListener('wheel', (e) => { e.preventDefault(); this.orbit.r = Math.min(40, Math.max(1.5, this.orbit.r * (e.deltaY > 0 ? 1.1 : 0.9))); }, { passive: false });
    let pinch = 0;
    gl.domElement.addEventListener('touchmove', (e) => {
      if (e.touches.length !== 2) { pinch = 0; return; }
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      if (pinch) this.orbit.r = Math.min(40, Math.max(1.5, this.orbit.r * (pinch / d)));
      pinch = d;
    }, { passive: true });
  }

  private toggle3d(): void {
    this.view3d = !this.view3d;
    this.gl!.domElement.style.display = this.view3d ? 'block' : 'none';
    this.btnMap.textContent = this.view3d ? 'CAMERA' : 'MAP 3D';
    this.cloudVersion = -1;
  }

  /** Walls as translucent quads, boxes as translucent boxes with outlines. */
  private build3dStructure(): void {
    for (const m of this.structMeshes) { this.scene.remove(m); }
    this.structMeshes = [];
    const add = (o: THREE.Object3D) => { this.scene.add(o); this.structMeshes.push(o); };
    for (const w of this.st.walls) {
      const col = w.confirmed ? 0x40ff90 : 0xffd040;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([w.ax, w.y0, w.az, w.bx, w.y0, w.bz, w.bx, w.y1, w.bz, w.ax, w.y1, w.az], 3));
      g.setIndex([0, 1, 2, 0, 2, 3]);
      add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: w.confirmed ? 0.25 : 0.1, side: THREE.DoubleSide, depthWrite: false })));
      add(new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: col })));
    }
    for (const b of this.st.boxes) {
      const col = b.confirmed ? 0x60e0ff : 0xffd040, h = b.y1 - b.y0;
      const geo = new THREE.BoxGeometry(b.hx * 2, b.table ? 0.04 : h, b.hz * 2);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: b.confirmed ? 0.3 : 0.12, depthWrite: false }));
      m.position.set(b.cx, b.table ? b.y1 : b.y0 + h / 2, b.cz); m.rotation.y = -b.theta;
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: col }));
      e.position.copy(m.position); e.rotation.y = m.rotation.y;
      add(m); add(e);
    }
  }

  private render3d(slam: Slam): void {
    const gl = this.gl!, w = gl.domElement.clientWidth, h = gl.domElement.clientHeight;
    if (gl.domElement.width !== Math.floor(w * gl.getPixelRatio())) { gl.setSize(w, h, false); this.cam3.aspect = w / h; this.cam3.updateProjectionMatrix(); }
    if (this.st.version !== this.stVersion) { this.stVersion = this.st.version; this.build3dStructure(); }
    if (slam.mapVersion !== this.cloudVersion) {
      this.cloudVersion = slam.mapVersion;
      const pts = slam.alivePoints(), pos = new Float32Array(pts.length * 3), col = new Float32Array(pts.length * 3);
      pts.forEach((p, i) => { pos.set(p.X, i * 3); col.set([p.color[0] / 255, p.color[1] / 255, p.color[2] / 255], i * 3); });
      if (this.cloud) { this.scene.remove(this.cloud); this.cloud.geometry.dispose(); }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      this.cloud = new THREE.Points(geo, new THREE.PointsMaterial({ size: 4, sizeAttenuation: false, vertexColors: true }));
      this.cloud.frustumCulled = false;
      this.scene.add(this.cloud);
    }
    if (this.trailLine) { this.scene.remove(this.trailLine); this.trailLine.geometry.dispose(); }
    if (slam.trail.length > 1) {
      this.trailLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(slam.trail.map((p) => new THREE.Vector3(p[0], p[1], p[2]))), new THREE.LineBasicMaterial({ color: 0xffd040 }));
      this.scene.add(this.trailLine);
    }
    this.scene.children.find((c) => c instanceof THREE.GridHelper)!.position.y = slam.floorY;
    this.marker.position.set(slam.c[0], slam.c[1], slam.c[2]);
    const o = this.orbit, tx = slam.c[0], ty = slam.floorY + 0.5, tz = slam.c[2];
    this.cam3.position.set(tx + o.r * Math.sin(o.phi) * Math.sin(o.theta), ty + o.r * Math.cos(o.phi), tz + o.r * Math.sin(o.phi) * Math.cos(o.theta));
    this.cam3.lookAt(tx, ty, tz);
    gl.render(this.scene, this.cam3);
  }
}
