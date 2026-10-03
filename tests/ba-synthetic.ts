/** Bundle adjustment on a synthetic orbit: noisy start (sensor rotation error, drifting positions, wrong focal), check recovery. */
import { bundleAdjust, BAProblem, skewExp, mul3, project, V3 } from '../src/object3d/ba';
let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const fTrue = 260, cx = 160, cy = 120;
const lookAtR = (c: V3, t: V3): number[] => { // camera looks along -z, y up, world y up
  const z: V3 = [c[0] - t[0], c[1] - t[1], c[2] - t[2]], zl = Math.hypot(...z); z[0] /= zl; z[1] /= zl; z[2] /= zl;
  let x: V3 = [z[2], 0, -z[0]]; const xl = Math.hypot(...x); x = [x[0] / xl, 0, x[2] / xl];
  const y: V3 = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  return [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
};
const N = 40, M = 600, cams: { R: number[]; c: V3 }[] = [];
for (let k = 0; k < N; k++) { const a = (k / N) * 2 * Math.PI * 1.05, el = (35 + 15 * k / N) * Math.PI / 180, r = 3.5; const c: V3 = [r * Math.cos(el) * Math.cos(a), r * Math.sin(el), r * Math.cos(el) * Math.sin(a)]; cams.push({ R: lookAtR(c, [0, 0.25, 0]), c }); }
const pts: V3[] = []; for (let j = 0; j < M; j++) pts.push(j % 2 ? [(rnd() - 0.5) * 2.4, 0, (rnd() - 0.5) * 2.4] : [(rnd() - 0.5) * 0.7, rnd() * 0.7, (rnd() - 0.5) * 0.7]);
const obs: { cam: number; pt: number; u: number; v: number }[] = [];
cams.forEach((cm, k) => pts.forEach((X, j) => { const q = project(cm.R, cm.c, X, fTrue, cx, cy); if (q && q[0] > 5 && q[0] < 315 && q[1] > 5 && q[1] < 235 && rnd() < 0.6) obs.push({ cam: k, pt: j, u: q[0] + gauss() * 0.4, v: q[1] + gauss() * 0.4 }); }));
for (let i = 0; i < obs.length * 0.03; i++) { const o = obs[(rnd() * obs.length) | 0]; o.u += (rnd() - 0.5) * 40; o.v += (rnd() - 0.5) * 40; }   // 3% outliers
// perturbed start: rotation bias drifting (1 deg), positions drifting, points from noisy triangulation (+-5 cm), wrong focal
const bias = [0, 0, 0];
const start: BAProblem = {
  cams: cams.map((cm, k) => { for (let a = 0; a < 3; a++) bias[a] += (-bias[a] * 0.05) + gauss() * 0.004; const R = mul3(skewExp(bias as V3), cm.R); return { R, c: [cm.c[0] + 0.06 * Math.sin(k / 6) + 0.002 * k, cm.c[1] + 0.03 * Math.cos(k / 7), cm.c[2] + 0.05 * Math.sin(k / 9)] as V3 }; }),
  pts: pts.map((X) => [X[0] + gauss() * 0.05, X[1] + gauss() * 0.05, X[2] + gauss() * 0.05] as V3),
  obs, f: 235, cx, cy, priorR: [],
};
start.priorR = start.cams.map((c) => c.R.slice());
// camera 0 is the gauge: start it exactly at truth
start.cams[0] = { R: cams[0].R.slice(), c: [...cams[0].c] as V3 }; start.priorR[0] = cams[0].R.slice();
const err = (P: BAProblem) => {
  let pe = 0, re = 0; P.cams.forEach((c, k) => { pe += Math.hypot(c.c[0] - cams[k].c[0], c.c[1] - cams[k].c[1], c.c[2] - cams[k].c[2]); const d = mul3(c.R, [cams[k].R[0], cams[k].R[3], cams[k].R[6], cams[k].R[1], cams[k].R[4], cams[k].R[7], cams[k].R[2], cams[k].R[5], cams[k].R[8]]); re += Math.acos(Math.max(-1, Math.min(1, (d[0] + d[4] + d[8] - 1) / 2))) * 180 / Math.PI; });
  return { pos: pe / P.cams.length * 100, rot: re / P.cams.length };   // position in cm (unit = 1 dm... printed as x10 mm)
};
const e0 = err(start); const t0 = performance.now();
const res = bundleAdjust(start, { iters: 15 });
const e1 = err(start);
console.log(`BA: ${N} cameras, ${M} points, ${obs.length} observations (3% outliers) in ${(performance.now() - t0).toFixed(0)} ms, ${res.iterations} iterations`);
console.log(`reprojection RMS ${res.rmsBefore.toFixed(2)} -> ${res.rmsAfter.toFixed(2)} px, ${res.dropped} observations dropped`);
console.log(`camera position error ${(e0.pos).toFixed(1)} -> ${(e1.pos).toFixed(1)} mm (units: 1 = 100 mm), rotation error ${e0.rot.toFixed(2)} -> ${e1.rot.toFixed(2)} deg, focal ${start.f.toFixed(1)} (true ${fTrue}, started 235)`);
