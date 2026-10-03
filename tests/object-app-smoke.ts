/**
 * Drives the real ObjectScanApp with a stubbed DOM and synthetic camera frames (an orbit around an object on the sheet),
 * the way a phone would: checks calibration, view capture, coverage and the final model. Run: npx tsx tests/object-app-smoke.ts
 */
import { makeLayout, renderSheet } from '../src/object3d/sheet';
import { lookAt, renderView, Scene, inside, V3 } from './object-render';

const W = 640, H = 480, DEG = Math.PI / 180, SS = Number(process.env.SS || 1);
let current: { gray: Uint8Array } = { gray: new Uint8Array(W * H) };
const ctxFor = () => {
  let last: { tw: number; th: number } = { tw: W, th: H };
  const base: Record<string, unknown> = {
    drawImage: (_s: unknown, _x: number, _y: number, tw: number, th: number) => { last = { tw, th }; },
    getImageData: (_x: number, _y: number, w: number, h: number) => {
      const data = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const g = current.gray[Math.min(H - 1, Math.floor((y * H) / last.th)) * W + Math.min(W - 1, Math.floor((x * W) / last.tw))]; const o = (y * w + x) * 4; data[o] = g; data[o + 1] = g; data[o + 2] = g; data[o + 3] = 255; }
      return { data };
    },
  };
  return new Proxy(base, { get: (t, k: string) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k: string, v) => { t[k] = v; return true; } });
};
const el = (): any => { const e: any = { style: { cssText: '' }, clientWidth: 400, clientHeight: 700, width: 0, height: 0, children: [] as any[], append(...c: any[]) { this.children.push(...c); }, remove() {}, addEventListener() {}, getContext: () => ctxFor(), toBlob() {} }; return e; };
(globalThis as any).document = { createElement: () => el(), body: el() };
(globalThis as any).window = { addEventListener() {}, devicePixelRatio: 1 };
(globalThis as any).devicePixelRatio = 1;
(globalThis as any).requestAnimationFrame = () => 0;
(globalThis as any).location = { reload() {} };
(globalThis as any).prompt = () => null;

const main = async () => {
  const { ObjectScanApp } = await import('../src/object3d/ObjectScanApp');
  const L = makeLayout('A4'), B = renderSheet(L, 3);
  const sc: Scene = { tint: 160, shapes: [{ kind: 'cyl', cx: 0, cy: 0, r: 26, z0: 0, z1: 36 }, { kind: 'sphere', cx: 0, cy: 0, cz: 54, r: 20 }] };
  const video: any = { videoWidth: W, videoHeight: H };
  const camBg: any = { video, ok: true, fovLong: 65, attach() {} };
  const app: any = new ObjectScanApp(camBg, el(), el());
  const fTrue = 522; let now = 1000;
  const frames = 120;
  for (let i = 0; i < frames; i++) {
    // three rings around the object (low, middle, high), as the coverage dial asks the user to do
    const ring = Math.floor(i / 40), az = (((i % 40) * 9) % 360) * DEG, el0 = [28, 48, 68][ring % 3] * DEG, dist = 340 + 25 * Math.sin(i / 9);
    const eye: V3 = [dist * Math.cos(el0) * Math.cos(az), dist * Math.cos(el0) * Math.sin(az), dist * Math.sin(el0)];
    current.gray = renderView(L, B, sc, lookAt(eye, [0, 0, 25], fTrue, W, H), { noise: 2, blur: true, gain: 0.95, offset: 3, ss: SS });
    now += 160; app.frame(now);
  }
  const st = app.hull.stats(), cov = app.cover.filter((c: number) => c > 0).length;
  let tp = 0, fp = 0, fn = 0; const h = app.hull;
  for (let k = 0; k < h.n; k++) for (let j = 0; j < h.n; j++) for (let i = 0; i < h.n; i++) { const c = h.center(i, j, k), t = inside(sc, c[0], c[1], c[2]), o = h.occ[h.idx(i, j, k)] === 1; if (t && o) tp++; else if (o) fp++; else if (t) fn++; }
  console.log(`frames ${frames}: calibrated focal ${app.f.toFixed(0)} px (true ${fTrue}), views carved ${app.kfs.length}, pending ${app.pending.length}, coverage bins ${cov}/36`);
  console.log(`model ${[0, 1, 2].map((a) => (st.max[a] - st.min[a]).toFixed(0)).join('x')} mm (true 52x52x74), volume ${(st.volumeMm3 / 1000).toFixed(0)} cm3, IoU ${(tp / (tp + fp + fn) * 100).toFixed(0)}%, recall ${(tp / (tp + fn) * 100).toFixed(0)}%`);
  app.trim = 76; app.rebuildHull();
  const st2 = app.hull.stats(); console.log(`after TOP cut at 76 mm: height ${(st2.max[2] - st2.min[2]).toFixed(0)} mm, volume ${(st2.volumeMm3 / 1000).toFixed(0)} cm3`);
  const ply = app.hull.toPly(app.kfs, ['smoke']); console.log(`PLY export: ${ply.split('\n').length} lines, ${(ply.length / 1024).toFixed(0)} KB`);
  console.log('note:', app.note);
  const bins = app.cover as number[]; console.log('coverage (rows = elevation low..high, 12 azimuth sectors):'); for (let e = 0; e < 3; e++) console.log('  ' + bins.slice(e * 12, e * 12 + 12).join(' '));
  const fr = app.kfs.map((k: any) => { let c = 0; for (let i = 0; i < k.bg.length; i += 5) c += k.bg[i]; return Math.round((c / (k.bg.length / 5)) * 100); });
  console.log('known-background % of the image per carved view:', fr.join(' '));
};
main();
