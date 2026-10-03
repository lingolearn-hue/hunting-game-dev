/** Image pyramid and pyramidal Lucas-Kanade tracking (grayscale, 8 bit). */
export interface Pyr { w: number[]; h: number[]; d: Uint8Array[]; }

export function buildPyr(data: Uint8Array, w: number, h: number, levels = 3): Pyr {
  const P: Pyr = { w: [w], h: [h], d: [data] };
  for (let l = 1; l < levels; l++) {
    const pw = P.w[l - 1], ph = P.h[l - 1], src = P.d[l - 1];
    const nw = pw >> 1, nh = ph >> 1, dst = new Uint8Array(nw * nh);
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
      const i = 2 * y * pw + 2 * x;
      dst[y * nw + x] = (src[i] + src[i + 1] + src[i + pw] + src[i + pw + 1] + 2) >> 2;
    }
    P.w.push(nw); P.h.push(nh); P.d.push(dst);
  }
  return P;
}

function sample(d: Uint8Array, w: number, h: number, x: number, y: number): number {
  if (x < 0) x = 0; else if (x > w - 1.001) x = w - 1.001;
  if (y < 0) y = 0; else if (y > h - 1.001) y = h - 1.001;
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * w + x0;
  return (d[i] * (1 - fx) + d[i + 1] * fx) * (1 - fy) + (d[i + w] * (1 - fx) + d[i + w + 1] * fx) * fy;
}

export interface KltOptions { win: number; iters: number; eps: number; maxResidual: number; minEig: number; }
export const KLT_DEFAULTS: KltOptions = { win: 4, iters: 10, eps: 0.02, maxResidual: 22, minEig: 0.8 };

const TMPL = new Float32Array(400), IX = new Float32Array(400), IY = new Float32Array(400);

/** Tracks one point from `a` to `b`. Returns [x, y] or null. */
export function trackPoint(a: Pyr, b: Pyr, x: number, y: number, o: KltOptions, guess?: [number, number]): [number, number] | null {
  const hw = o.win, n = (2 * hw + 1) * (2 * hw + 1), levels = a.d.length;
  // optional initial displacement (pixels), e.g. predicted from known camera poses
  let gx = guess ? guess[0] / (1 << (levels - 1)) : 0, gy = guess ? guess[1] / (1 << (levels - 1)) : 0, resid = 0;
  for (let L = levels - 1; L >= 0; L--) {
    const s = 1 / (1 << L), px = x * s, py = y * s, W = a.w[L], H = a.h[L], A = a.d[L], B = b.d[L];
    if (px < hw + 2 || py < hw + 2 || px > W - hw - 3 || py > H - hw - 3) { if (L === 0) return null; gx *= 2; gy *= 2; continue; }
    let k = 0, gxx = 0, gxy = 0, gyy = 0, mT = 0;
    for (let j = -hw; j <= hw; j++) for (let i = -hw; i <= hw; i++, k++) {
      const sx = px + i, sy = py + j;
      TMPL[k] = sample(A, W, H, sx, sy);
      IX[k] = (sample(A, W, H, sx + 1, sy) - sample(A, W, H, sx - 1, sy)) * 0.5;
      IY[k] = (sample(A, W, H, sx, sy + 1) - sample(A, W, H, sx, sy - 1)) * 0.5;
      gxx += IX[k] * IX[k]; gxy += IX[k] * IY[k]; gyy += IY[k] * IY[k]; mT += TMPL[k];
    }
    mT /= n;
    const det = gxx * gyy - gxy * gxy, tr = gxx + gyy;
    const minEig = (tr - Math.sqrt(Math.max(0, tr * tr - 4 * det))) / 2 / n;
    if (minEig < o.minEig || det < 1e-6) return null;
    let vx = gx, vy = gy;
    for (let it = 0; it < o.iters; it++) {
      let k2 = 0, b1 = 0, b2 = 0, mJ = 0;
      for (let j = -hw; j <= hw; j++) for (let i = -hw; i <= hw; i++, k2++) mJ += sample(B, W, H, px + i + vx, py + j + vy);
      mJ /= n;
      k2 = 0; resid = 0;
      for (let j = -hw; j <= hw; j++) for (let i = -hw; i <= hw; i++, k2++) {
        const d = (TMPL[k2] - mT) - (sample(B, W, H, px + i + vx, py + j + vy) - mJ); // brightness offset removed
        b1 += d * IX[k2]; b2 += d * IY[k2]; resid += Math.abs(d);
      }
      const dx = (gyy * b1 - gxy * b2) / det, dy = (gxx * b2 - gxy * b1) / det;
      vx += dx; vy += dy;
      if (!isFinite(vx) || Math.abs(vx) > 40 || Math.abs(vy) > 40) return null;
      if (dx * dx + dy * dy < o.eps * o.eps) break;
    }
    gx = L > 0 ? vx * 2 : vx; gy = L > 0 ? vy * 2 : vy;
    resid /= n;
  }
  if (resid > o.maxResidual) return null;
  const nx = x + gx, ny = y + gy;
  if (nx < 4 || ny < 4 || nx > a.w[0] - 5 || ny > a.h[0] - 5) return null;
  return [nx, ny];
}

/** Forward-backward checked tracking. */
export function trackChecked(a: Pyr, b: Pyr, x: number, y: number, o: KltOptions, fbMax = 0.7): [number, number] | null {
  const f = trackPoint(a, b, x, y, o);
  if (!f) return null;
  const r = trackPoint(b, a, f[0], f[1], o);
  if (!r || Math.hypot(r[0] - x, r[1] - y) > fbMax) return null;
  return f;
}
