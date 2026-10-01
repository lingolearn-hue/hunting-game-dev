import { vFovRad } from '../game/view';

const NS = 'http://www.w3.org/2000/svg';
const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};

/**
 * Binocular view: two overlapping circles, a rangefinder readout and ranging rails
 * (mrad scale for estimating distance: distance in m = object size in m x 1000 / mrad).
 */
export class BinocularsOverlay {
  private svg = document.createElementNS(NS, 'svg');
  private readout = el('text', {});
  private key = '';

  constructor(root: HTMLElement) {
    const s = this.svg;
    s.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;display:none';
    root.prepend(s);
  }

  show(on: boolean): void { this.svg.style.display = on ? 'block' : 'none'; }

  update(zoom: number, distText: string): void {
    const w = window.innerWidth, h = window.innerHeight;
    const key = `${w}x${h}@${zoom.toFixed(2)}@${vFovRad(1).toFixed(3)}`;
    if (key !== this.key) { this.key = key; this.build(w, h, zoom); }
    this.readout.textContent = distText;
  }

  private build(w: number, h: number, zoom: number): void {
    const s = this.svg;
    s.setAttribute('viewBox', `0 0 ${w} ${h}`);
    s.replaceChildren();
    const cx = w / 2, cy = h / 2, unit = Math.min(w, h);
    const r = 0.42 * unit, d = 0.5 * r;

    // Black mask with two overlapping circular holes
    const defs = el('defs', {});
    const mask = el('mask', { id: 'binoMask' });
    mask.append(el('rect', { width: w, height: h, fill: '#fff' }),
      el('circle', { cx: cx - d, cy, r, fill: '#000' }), el('circle', { cx: cx + d, cy, r, fill: '#000' }));
    defs.append(mask);
    s.append(defs, el('rect', { width: w, height: h, fill: '#000', mask: 'url(#binoMask)' }));
    for (const x of [cx - d, cx + d]) s.append(el('circle', { cx: x, cy, r, fill: 'none', stroke: 'rgba(255,255,255,.4)', 'stroke-width': 1.5 }));

    // Ranging rails: 5 mrad per tick, longer every 10 mrad
    const vfov = vFovRad(zoom);
    const pxPerMrad = (h / 2 / Math.tan(vfov / 2)) / 1000;
    const stroke = { stroke: 'rgba(255,255,255,.9)', 'stroke-width': 1.2, fill: 'none' };
    const rails = el('g', {});
    const halfH = w / 2 - 12, halfV = r - 10;
    rails.append(el('line', { x1: cx - halfH, y1: cy, x2: cx - 10, y2: cy, ...stroke }), el('line', { x1: cx + 10, y1: cy, x2: cx + halfH, y2: cy, ...stroke }),
      el('line', { x1: cx, y1: cy - halfV, x2: cx, y2: cy - 10, ...stroke }), el('line', { x1: cx, y1: cy + 10, x2: cx, y2: cy + halfV, ...stroke }));
    for (let m = 5; m * pxPerMrad < Math.max(halfH, halfV); m += 5) {
      const off = m * pxPerMrad, major = m % 10 === 0, len = major ? 8 : 4;
      if (off < halfH) for (const sx of [-1, 1]) rails.append(el('line', { x1: cx + sx * off, y1: cy - len, x2: cx + sx * off, y2: cy + len, ...stroke }));
      if (off < halfV) for (const sy of [-1, 1]) rails.append(el('line', { x1: cx - len, y1: cy + sy * off, x2: cx + len, y2: cy + sy * off, ...stroke }));
      if (major && off < halfV) {
        const t = el('text', { x: cx + 12, y: cy - off + 3, fill: '#fff', 'font-size': 10, 'font-family': 'system-ui, sans-serif' });
        t.textContent = String(m);
        rails.append(t);
      }
    }
    s.append(rails);

    // Readout (rangefinder) and hint
    Object.entries({ x: cx, y: cy - r + 30, 'text-anchor': 'middle', fill: '#fff', 'font-size': 22, 'font-family': 'system-ui, sans-serif',
      stroke: '#000', 'stroke-width': 3, 'paint-order': 'stroke' }).forEach(([k, v]) => this.readout.setAttribute(k, String(v)));
    s.append(this.readout);
    const hint = el('text', { x: cx, y: cy + r - 12, 'text-anchor': 'middle', fill: 'rgba(255,255,255,.75)', 'font-size': 11, 'font-family': 'system-ui, sans-serif' });
    hint.textContent = 'tick = 5 mrad · distance (m) ≈ size (m) × 1000 ÷ mrad';
    s.append(hint);
  }
}
