import { Game } from '../game/Game';
import { TECH, TECH_BY_ID, TechGroup, techApplies } from '../data/tech';

const GROUPS: TechGroup[] = ['Camera', 'Binoculars', 'Rifle', 'Rockets', 'Torch', 'Multitool', 'Build', 'Map'];

/** Tech tree screen: spend this level's coins on tools, zoom levels, thermal view, torch tiers, building and more. */
export class TechTreeView {
  private root = document.createElement('div');

  constructor(private game: Game, private onBuy: (id: string) => void) {
    this.root.id = 'gallery'; // shares the gallery styling
    this.root.style.display = 'none';
    (document.getElementById('ui') ?? document.body).append(this.root);
  }

  open(): void {
    const g = this.game, pr = g.progress;
    const r = this.root;
    r.style.display = 'block';
    const head = document.createElement('div'); head.className = 'ghead';
    const t = document.createElement('span'); t.textContent = `Tech tree · ${pr.coins} coins`;
    const x = document.createElement('button'); x.textContent = 'CLOSE'; x.onclick = () => this.close();
    head.append(t, x);
    r.replaceChildren(head);
    const note = document.createElement('p');
    note.textContent = `Coins and unlocks are saved separately for this level (${g.level.name}). Earn coins with photos, kills, harvesting game and new species.`;
    note.style.cssText = 'font-size:12px;opacity:.7;margin:0 0 8px';
    r.append(note);

    for (const group of GROUPS) {
      const nodes = TECH.filter((n) => n.group === group && techApplies(n, g.level, g.naturalist));
      if (!nodes.length) continue;
      const h = document.createElement('div');
      h.textContent = group; h.style.cssText = 'margin:12px 0 6px;font-size:13px;opacity:.6;text-transform:uppercase;letter-spacing:.08em';
      r.append(h);
      for (const n of nodes) {
        const owned = pr.has(n.id), missing = (n.requires ?? []).filter((q) => !pr.has(q));
        const card = document.createElement('div');
        card.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 10px;margin-bottom:6px;border:1px solid rgba(255,255,255,.2);border-radius:8px;font-size:13px';
        if (owned) card.style.background = 'rgba(76,154,95,.18)';
        const text = document.createElement('div');
        text.style.cssText = 'white-space:pre-line;line-height:1.4';
        text.textContent = `${n.name}\n${n.desc}` + (missing.length ? `\nneeds: ${missing.map((m) => TECH_BY_ID[m].name).join(', ')}` : '');
        const b = document.createElement('button');
        b.style.minWidth = '84px';
        if (owned) { b.textContent = 'OWNED'; b.disabled = true; b.style.opacity = '.6'; }
        else {
          b.textContent = `BUY ${n.cost}`;
          const can = pr.canBuy(n.id);
          b.disabled = !can; b.style.opacity = can ? '1' : '.4';
          b.onclick = () => { this.onBuy(n.id); this.open(); };
        }
        card.append(text, b);
        r.append(card);
      }
    }
  }

  close(): void {
    this.root.style.display = 'none';
    this.root.replaceChildren();
  }
}
