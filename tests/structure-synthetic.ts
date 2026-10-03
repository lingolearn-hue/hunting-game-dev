/**
 * Structure test on a synthetic room (floor, back wall z=-7, left wall x=-3.5, 1 m box at (1.3,-4), true corner (-3.5,-7)).
 * Several seeds; sensor error = small noise + slowly drifting bias. Run: npx tsx tests/structure-synthetic.ts
 */
import { W, H, pathStruct, render, noisyQ, seedRandom } from './slam-synthetic';
import { Slam } from '../src/slam/Slam';
import { StructureTracker, describe } from '../src/slam/Structure';

const DEG = Math.PI / 180;
function once(seed: number, sigma: number, drift: number, verbose: boolean) {
  seedRandom(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(Math.random() + 1e-12)) * Math.cos(2 * Math.PI * Math.random());
  const fps = 15, T = 17, slam = new Slam({ width: W, height: H, fovLongDeg: 65, camHeight: 1.5 }), st = new StructureTracker();
  const bias: [number, number, number] = [0, 0, 0];
  for (let i = 0; i <= T * fps; i++) {
    const p = pathStruct(i / fps), img = render(p.c, p.q, 65);
    for (let k = 0; k < 3; k++) bias[k] += (-bias[k] / 3) / fps + drift * DEG * Math.sqrt(2 / fps / 3) * gauss();
    slam.process(img, null, noisyQ(p.q, sigma, bias));
    if (i % 10 === 0 && slam.state === 'track') st.update(slam);
    if (slam.state === 'track') st.verify(slam);
  }
  const lineErr = (w: { ax: number; az: number; bx: number; bz: number }, dir: number, off: number) => {
    const a = Math.atan2(w.bz - w.az, w.bx - w.ax), d = Math.abs(((a - dir) % Math.PI + Math.PI) % Math.PI);
    const nx = -Math.sin(dir), nz = Math.cos(dir), o = Math.abs(nx * ((w.ax + w.bx) / 2) + nz * ((w.az + w.bz) / 2) - off);
    return { ang: Math.min(d, Math.PI - d) / DEG, off: o };
  };
  const walls = st.walls.filter((w) => w.seen >= 3);
  const best = (dir: number, off: number) => walls.map((w) => ({ w, ...lineErr(w, dir, off) })).filter((e) => e.ang < 10).sort((a, b) => a.off - b.off)[0];
  const b1 = best(0, -7), b2 = best(Math.PI / 2, -3.5 * -1 * -1);
  // wall x=-3.5: with dir pi/2 the normal is (-1, 0): offset = -x -> 3.5 ... compute directly
  const w2 = walls.map((w) => ({ w, ang: lineErr(w, Math.PI / 2, 0).ang, off: Math.abs((w.ax + w.bx) / 2 + 3.5) })).filter((e) => e.ang < 10).sort((a, b) => a.off - b.off)[0];
  const box = st.boxes.filter((b) => b.seen >= 3).sort((a, b) => Math.hypot(a.cx - 1.3, a.cz + 4) - Math.hypot(b.cx - 1.3, b.cz + 4))[0];
  const corner = st.corners.map((c) => Math.hypot(c.x + 3.5, c.z + 7)).sort((a, b) => a - b)[0];
  const matchedWall = (w: { ax: number; az: number; bx: number; bz: number }) => lineErr(w, 0, -7).ang < 10 && lineErr(w, 0, -7).off < 1.2 || (Math.abs(((w.ax + w.bx) / 2) + 3.5) < 1.2 && lineErr(w, Math.PI / 2, 0).ang < 10);
  const falseWalls = st.walls.filter((w) => w.confirmed && !matchedWall(w)).length;
  const falseBoxes = st.boxes.filter((b) => b.confirmed && Math.hypot(b.cx - 1.3, b.cz + 4) > 1.2).length;
  if (verbose) for (const l of describe(st)) console.log('   ', l);
  return {
    back: b1 ? b1.off : NaN, left: w2 ? w2.off : NaN, box: box ? Math.hypot(box.cx - 1.3, box.cz + 4) : NaN, boxTop: box ? box.y1 : NaN,
    corner: corner ?? NaN, falseWalls, falseBoxes, grid: st.manhattan === null ? NaN : Math.min(st.manhattan, Math.PI / 2 - st.manhattan) / DEG,
    edge: st.walls.concat(st.boxes as never[]).filter((x) => x.edgeTries > 10).map((x) => x.edgeHits / x.edgeTries),
  };
}
const f = (v: number, d = 2) => (isNaN(v) ? '  - ' : v.toFixed(d));
const seeds = [1, 2, 3, 4, 5, 6];
for (const [sigma, drift] of [[0.03, 0.3], [0.03, 0.6]] as Array<[number, number]>) {
  console.log(`\nSensor error: ${sigma} deg noise + ${drift} deg drift`);
  console.log('seed | back wall off (m) | left wall off (m) | box center err (m) | box top | corner err (m) | grid err (deg) | false walls | false boxes');
  const rows = seeds.map((s) => once(s, sigma, drift, false));
  rows.forEach((r, i) => console.log(`${String(seeds[i]).padStart(4)} | ${f(r.back).padStart(17)} | ${f(r.left).padStart(17)} | ${f(r.box).padStart(18)} | ${f(r.boxTop).padStart(7)} | ${f(r.corner).padStart(14)} | ${f(r.grid, 1).padStart(14)} | ${String(r.falseWalls).padStart(11)} | ${r.falseBoxes}`));
  const found = (k: 'back' | 'left' | 'box' | 'corner', th: number) => rows.filter((r) => r[k] < th).length;
  console.log(`found within tolerance (of ${seeds.length}): back wall ${found('back', 1.0)}, left wall ${found('left', 1.0)}, box ${found('box', 0.8)}, corner ${found('corner', 1.2)}; mean false walls ${(rows.reduce((a, r) => a + r.falseWalls, 0) / rows.length).toFixed(1)}, false boxes ${(rows.reduce((a, r) => a + r.falseBoxes, 0) / rows.length).toFixed(1)}`);
  const ev = rows.flatMap((r) => r.edge);
  console.log(`image-edge corroboration: mean edge support of items with recent checks ${ev.length ? (ev.reduce((a, b) => a + b, 0) / ev.length * 100).toFixed(0) + '%' : 'n/a'} (${ev.length} items)`);
}
