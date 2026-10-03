/**
 * Drives the real ObjectScanFreeApp with a stubbed DOM, a fake sensor and the cached synthetic frames of
 * tests/free-scan-synthetic.ts (snowman orbit). Run it once after that test has filled the cache:
 *   npx tsx tests/free-scan-synthetic.ts snowman && npx tsx tests/free-app-smoke.ts
 */
import * as fs from 'fs';
import { lookAt, renderView } from './object-render';
import { scenes, orbitPose, trackerQuat } from './free-scan-synthetic';
import { Quat } from '../src/util/quat';

const N = 240, dir = `/tmp/t/frames_snowman_${N}`;
let cur: { g320: Uint8Array; g640: () => Uint8Array } = { g320: new Uint8Array(320 * 240), g640: () => new Uint8Array(640 * 480) };
const ctxFor = () => {
  let last = { tw: 320, th: 240 };
  const base: Record<string, unknown> = {
    drawImage: (_s: unknown, _x: number, _y: number, tw: number, th: number) => { last = { tw, th }; },
    getImageData: (_x: number, _y: number, w: number, h: number) => {
      const src = last.tw >= 640 ? cur.g640() : cur.g320, sw = last.tw >= 640 ? 640 : 320, sh = last.tw >= 640 ? 480 : 240;
      const data = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const g = src[Math.min(sh - 1, Math.floor(y * sh / h)) * sw + Math.min(sw - 1, Math.floor(x * sw / w))]; const o = (y * w + x) * 4; data[o] = g; data[o + 1] = g; data[o + 2] = g; data[o + 3] = 255; }
      return { data };
    },
  };
  return new Proxy(base, { get: (t, k: string) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k: string, v) => { t[k] = v; return true; } });
};
const el = (): any => ({ style: { cssText: '' }, clientWidth: 400, clientHeight: 700, width: 0, height: 0, append() {}, remove() {}, addEventListener() {}, getContext: () => ctxFor(), toBlob() {} });
(globalThis as any).document = { createElement: () => el(), body: el() };
(globalThis as any).window = { addEventListener() {}, devicePixelRatio: 1 };
(globalThis as any).devicePixelRatio = 1; (globalThis as any).requestAnimationFrame = () => 0; (globalThis as any).location = { reload() {} }; (globalThis as any).prompt = () => '80';

(async () => {
  const { ObjectScanFreeApp } = await import('../src/object3d/ObjectScanFreeApp');
  const sc = scenes.snowman;
  let q: Quat = [0, 0, 0, 1];
  const device: any = { attach(p: any) { this.p = p; }, update() { this.p.deviceQuat = q; } };
  const camBg: any = { video: { videoWidth: 320, videoHeight: 240 }, ok: true, fovLong: 63, attach() {} };
  const app: any = new ObjectScanFreeApp(camBg, device, el(), el());
  app.gl = { domElement: { style: {}, clientWidth: 400, clientHeight: 700, width: 0 }, getPixelRatio: () => 1, setSize() {}, render() {} };   // no WebGL in Node
  let now = 1000;
  for (let i = 0; i < N; i++) {
    const { eye, target } = orbitPose(i, N);
    const p320 = `${dir}/s${i}.bin`;
    cur.g320 = fs.existsSync(p320) ? new Uint8Array(fs.readFileSync(p320)) : renderView(null, null, sc, lookAt(eye, target, 260, 320, 240), { noise: 1.5, blur: true, gain: 0.95, offset: 3, ss: 1 });
    cur.g640 = () => { const p = `${dir}/k${i}.bin`; return fs.existsSync(p) ? new Uint8Array(fs.readFileSync(p)) : renderView(null, null, sc, lookAt(eye, target, 520, 640, 480), { noise: 2, blur: true, gain: 0.95, offset: 3, ss: 1 }); };
    q = trackerQuat(lookAt(eye, target, 260, 320, 240));
    now += 72; app.frame(now);
  }
  console.log(`live: ${app.fs.kfs.length} keyframes chosen by the app, tracker state ${app.slam.state}, coverage bins ${app.cover.filter((c: number) => c > 0).length}/36, centre ${app.centre?.map((v: number) => v.toFixed(2)).join(',')}`);
  await app.build(false);
  const st = app.hull?.stats();
  console.log('note:', app.note);
  if (st && app.info) {
    console.log(`built: ${app.info.keyframes} views, ${app.info.tracks} points, reprojection ${app.info.rmsBefore.toFixed(2)} -> ${app.info.rmsAfter.toFixed(2)} px, loop observations ${app.info.loopObs}, model ${[0, 1, 2].map((a) => (st.max[a] - st.min[a]).toFixed(0)).join('x')} (assumed scale), volume ${(st.volumeMm3 / 1000).toFixed(0)} cm3`);
    app.askScale();
    const ply = app.hull.toPly(app.carveKfs, ['smoke'], app.userScale);
    console.log(`after SCALE to 80 mm height: scale factor ${app.userScale.toFixed(3)}, PLY ${(ply.length / 1024).toFixed(0)} KB`);
  }
})();
