import { SPECIES_LIST } from '../data/species';
import { LEVELS } from '../data/environments';
import { FieldJournal } from '../game/Journal';

/** Field journal screen: all species, discovered ones show details. */
export class JournalView {
  private root = document.createElement('div');

  constructor(private journal: FieldJournal) {
    this.root.id = 'gallery'; // shares the gallery styling
    this.root.style.display = 'none';
    document.body.append(this.root);
  }

  open(): void {
    const r = this.root;
    r.style.display = 'block';
    const found = SPECIES_LIST.filter((s) => this.journal.entries.has(s.id)).length;
    const head = document.createElement('div'); head.className = 'ghead';
    const t = document.createElement('span'); t.textContent = `Field journal · ${found}/${SPECIES_LIST.length}`;
    const x = document.createElement('button'); x.textContent = 'CLOSE'; x.onclick = () => this.close();
    head.append(t, x);
    r.replaceChildren(head);

    for (const [lid, level] of Object.entries(LEVELS)) {
      const h = document.createElement('div');
      h.textContent = level.name; h.style.cssText = 'margin:14px 0 6px;font-size:13px;opacity:.6;text-transform:uppercase;letter-spacing:.08em';
      r.append(h);
      for (const sp of SPECIES_LIST) {
        if (!level.spawns.some((s) => s.species === sp.id)) continue;
        const e = this.journal.entries.get(sp.id);
        const card = document.createElement('div');
        card.style.cssText = 'padding:8px 10px;margin-bottom:6px;border:1px solid rgba(255,255,255,.2);border-radius:8px;font-size:13px;line-height:1.5';
        const stars = '★'.repeat(sp.rarity) + '☆'.repeat(5 - sp.rarity);
        if (!e) {
          card.style.opacity = '.5';
          card.textContent = `??? · ${stars}\nNot yet observed. Watch or photograph it.`;
          card.style.whiteSpace = 'pre-line';
        } else {
          const lines = [
            `${sp.name} · ${stars}`,
            sp.description,
            `Observed ${Math.round(e.watchSeconds)} s · behaviors: ${e.behaviors.length ? e.behaviors.join(', ') : '–'}`,
            `Photos ${e.photos}${e.bestScore ? ` (best ${e.bestScore}/100)` : ''}${e.kills ? ` · harvested ${e.kills}` : ''}`,
            `First seen ${new Date(e.firstSeen).toLocaleDateString()} · ${LEVELS[e.level]?.name ?? lid}`,
          ];
          card.style.whiteSpace = 'pre-line';
          card.textContent = lines.join('\n');
        }
        r.append(card);
      }
    }
  }

  close(): void {
    this.root.style.display = 'none';
    this.root.replaceChildren();
  }
}
