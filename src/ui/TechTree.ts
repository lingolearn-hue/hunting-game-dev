import { Game } from '../game/Game';
import { TECH, TECH_BY_ID, TechNode, TechCategory, CATEGORY_OF, techApplies } from '../data/tech';

const CATEGORIES: TechCategory[] = ['Tools', 'Weapons', 'Construction'];

/**
 * Tech tree screen: Tools / Weapons / Construction, each a tree of compact chips (parent -> upgrades).
 * Tap a chip to see its description and buy it. Coins are this level's coins.
 */
export class TechTreeView {
  private root = document.createElement('div');
  private selected: string | null = null;
  private collapsed = new Set<TechCategory>();

  constructor(private game: Game, private onBuy: (id: string) => void) {
    this.root.id = 'gallery'; // shares the gallery styling
    this.root.style.display = 'none';
    (document.getElementById('ui') ?? document.body).append(this.root);
  }

  open(): void {
    this.root.style.display = 'block';
    this.render();
  }

  close(): void {
    this.root.style.display = 'none';
    this.root.replaceChildren();
  }

  /** The node this one hangs under (first requirement that exists on this level and is in the same category). */
  private parentOf(n: TechNode): TechNode | null {
    const g = this.game;
    for (const r of n.requires ?? []) {
      const p = TECH_BY_ID[r];
      if (p && techApplies(p, g.level, g.naturalist) && CATEGORY_OF[p.group] === CATEGORY_OF[n.group]) return p;
    }
    return null;
  }

  private render(): void {
    const g = this.game, pr = g.progress, r = this.root;
    const scroll = r.scrollTop;
    const nodes = TECH.filter((n) => techApplies(n, g.level, g.naturalist));
    const wrap = document.createElement('div');
    wrap.style.cssText = 'max-width:400px;margin:0 auto';

    const head = document.createElement('div'); head.className = 'ghead';
    const t = document.createElement('span'); t.textContent = `Tech tree · ${pr.coins} coins`;
    const x = document.createElement('button'); x.textContent = 'CLOSE'; x.onclick = () => this.close();
    head.append(t, x);
    wrap.append(head);

    // Detail panel for the selected node (name, description, requirements, BUY)
    const detail = document.createElement('div');
    detail.style.cssText = 'position:sticky;top:0;z-index:2;background:#111;border:1px solid rgba(255,255,255,.25);border-radius:8px;padding:8px 10px;margin-bottom:8px;font-size:12px;line-height:1.4;min-height:44px';
    const sel = this.selected ? TECH_BY_ID[this.selected] : null;
    if (sel && nodes.includes(sel)) {
      const owned = pr.has(sel.id), missing = pr.requirements(sel.id).filter((q) => !pr.has(q));
      const txt = document.createElement('div');
      txt.style.cssText = 'white-space:pre-line';
      txt.textContent = `${sel.name}\n${sel.desc}` + (missing.length ? `\nneeds: ${missing.map((m) => TECH_BY_ID[m].name).join(', ')}` : '');
      const row = document.createElement('div'); row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px';
      const b = document.createElement('button');
      b.style.cssText = 'padding:6px 12px;font-size:13px;white-space:nowrap';
      if (owned) { b.textContent = 'OWNED'; b.disabled = true; b.style.opacity = '.6'; }
      else {
        const can = pr.canBuy(sel.id);
        b.textContent = `BUY ${sel.cost}`; b.disabled = !can; b.style.opacity = can ? '1' : '.4';
        b.onclick = () => { this.onBuy(sel.id); this.render(); };
      }
      row.append(txt, b);
      detail.append(row);
    } else {
      detail.textContent = 'Tap a node. Coins and unlocks are saved separately for this level.';
      detail.style.opacity = '.7';
    }
    wrap.append(detail);

    const chip = (n: TechNode): HTMLButtonElement => {
      const owned = pr.has(n.id), can = pr.canBuy(n.id);
      const b = document.createElement('button');
      b.textContent = owned ? `✓ ${n.name}` : `${n.name} · ${n.cost}`;
      b.style.cssText = 'display:block;width:100%;text-align:left;font-size:11px;padding:5px 7px;margin:2px 0;border-radius:6px;color:#fff;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.06)';
      if (owned) { b.style.background = 'rgba(76,154,95,.35)'; b.style.borderColor = 'rgba(120,200,140,.6)'; }
      else if (can) { b.style.borderColor = '#ffd966'; b.style.color = '#ffe9a0'; }
      else b.style.opacity = '.55';
      if (n.id === this.selected) b.style.outline = '2px solid #fff';
      b.onclick = () => { this.selected = n.id; this.render(); };
      return b;
    };
    const subtree = (n: TechNode): HTMLElement => {
      const el = document.createElement('div');
      el.append(chip(n));
      const kids = nodes.filter((k) => this.parentOf(k) === n);
      if (kids.length) {
        const box = document.createElement('div');
        box.style.cssText = 'margin-left:8px;padding-left:6px;border-left:2px solid rgba(255,255,255,.18)';
        for (const k of kids) box.append(subtree(k));
        el.append(box);
      }
      return el;
    };

    for (const cat of CATEGORIES) {
      const inCat = nodes.filter((n) => CATEGORY_OF[n.group] === cat);
      if (!inCat.length) continue;
      const h = document.createElement('button');
      const open = !this.collapsed.has(cat);
      h.textContent = `${open ? '▾' : '▸'} ${cat.toUpperCase()}`;
      h.style.cssText = 'display:block;width:100%;text-align:left;margin:8px 0 4px;font-size:13px;letter-spacing:.08em;padding:6px 8px';
      h.onclick = () => { if (open) this.collapsed.add(cat); else this.collapsed.delete(cat); this.render(); };
      wrap.append(h);
      if (!open) continue;
      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(165px,1fr));gap:2px 10px';
      for (const root of inCat.filter((n) => this.parentOf(n) === null)) grid.append(subtree(root));
      wrap.append(grid);
    }

    r.replaceChildren(wrap);
    r.scrollTop = scroll;
  }
}
