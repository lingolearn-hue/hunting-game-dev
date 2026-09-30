import { PhotoStore, PhotoRecord } from '../storage/PhotoStore';
import { SPECIES } from '../data/species';

const fmtTime = (t: number) => {
  const hh = Math.floor(t), mm = Math.floor((t - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};

/** Full-screen photo gallery (grid + detail view). */
export class Gallery {
  private root = document.createElement('div');
  private urls: string[] = [];

  constructor(private store: PhotoStore) {
    this.root.id = 'gallery';
    document.body.append(this.root);
  }

  async open(): Promise<void> {
    this.root.style.display = 'block';
    this.root.replaceChildren(this.header('Photos'));
    let list: PhotoRecord[];
    try {
      list = await this.store.list();
    } catch {
      this.root.append(this.text('Storage unavailable.'));
      return;
    }
    if (list.length === 0) { this.root.append(this.text('No photos yet. Tap the view to take one.')); return; }
    const grid = document.createElement('div'); grid.className = 'grid';
    this.root.append(grid);
    for (const rec of list) {
      const item = document.createElement('div'); item.className = 'item';
      const badge = document.createElement('span'); badge.className = 'badge';
      badge.textContent = rec.species ? `${rec.score}` : '–';
      item.append(badge);
      grid.append(item);
      this.store.getBlob(rec.id!).then((b) => {
        if (!b) return;
        const img = document.createElement('img');
        img.src = this.url(b);
        img.onclick = () => this.detail(rec, img.src);
        item.prepend(img);
      });
    }
  }

  close(): void {
    this.root.style.display = 'none';
    this.root.replaceChildren();
    this.urls.forEach((u) => URL.revokeObjectURL(u));
    this.urls = [];
  }

  private url(b: Blob): string {
    const u = URL.createObjectURL(b);
    this.urls.push(u);
    return u;
  }

  private header(title: string): HTMLElement {
    const h = document.createElement('div'); h.className = 'ghead';
    const t = document.createElement('span'); t.textContent = title;
    const x = document.createElement('button'); x.textContent = 'CLOSE'; x.onclick = () => this.close();
    h.append(t, x);
    return h;
  }

  private text(s: string): HTMLElement {
    const p = document.createElement('p'); p.textContent = s; p.style.opacity = '.7';
    return p;
  }

  private detail(rec: PhotoRecord, src: string): void {
    this.root.replaceChildren(this.header(rec.species ? `${SPECIES[rec.species]?.name ?? rec.species} · ${rec.score}/100` : 'No animal'));
    const img = document.createElement('img'); img.src = src; img.className = 'big';
    const d = new Date(rec.timestamp);
    const b = rec.breakdown;
    const info = document.createElement('p');
    info.textContent =
      `${d.toLocaleString()} · game time ${fmtTime(rec.timeOfDay)} · ${rec.distance} m · ${rec.zoom.toFixed(1)}x · ${rec.equipment}${rec.level ? ` · ${rec.level}` : ''}` +
      (b ? `\nsize ${b.size} · frame ${b.framing} · comp ${b.composition} · vis ${b.visibility} · pose ${b.posture} · calm ${b.awareness} · light ${b.lighting} · q x${b.quality}` : '');
    info.style.whiteSpace = 'pre-line'; info.style.fontSize = '13px'; info.style.opacity = '.8';
    const row = document.createElement('div'); row.className = 'ghead';
    const back = document.createElement('button'); back.textContent = 'BACK'; back.onclick = () => this.open();
    const del = document.createElement('button'); del.textContent = 'DELETE';
    del.onclick = async () => { try { await this.store.remove(rec.id!); } catch { /* ignore */ } this.open(); };
    row.append(back, del);
    this.root.append(img, info, row);
  }
}
