import { Game } from './Game';
import { Animal } from './Animal';
import { project } from './view';
import { isBlocked } from './Visibility';
import { JournalEntry } from '../storage/PhotoStore';

const WATCH_TO_DISCOVER = 1.5; // s of steady observation
const TICK = 0.2;              // s between observation checks

/** Field journal: discovers species by observing (zoomed view) or photographing them. */
export class FieldJournal {
  readonly entries = new Map<string, JournalEntry>();
  onDiscover?: (e: JournalEntry, rarity: number) => void;
  onChange?: (e: JournalEntry) => void;

  private acc = 0;
  private watch = new Map<string, number>();

  load(list: JournalEntry[]): void {
    for (const e of list) this.entries.set(e.species, e);
  }

  private entry(a: Animal, level: string, discover: boolean): JournalEntry | null {
    let e = this.entries.get(a.species.id);
    if (!e) {
      if (!discover) return null;
      e = { species: a.species.id, firstSeen: Date.now(), level, watchSeconds: 0, behaviors: [], photos: 0, bestScore: 0, kills: 0 };
      this.entries.set(e.species, e);
      this.onDiscover?.(e, a.species.rarity);
    }
    return e;
  }

  recordPhoto(a: Animal | undefined, score: number, level: string): void {
    if (!a || score <= 0) return;
    const e = this.entry(a, level, true)!;
    e.photos++;
    e.bestScore = Math.max(e.bestScore, score);
    this.onChange?.(e);
  }

  recordKill(a: Animal | undefined, level: string): void {
    if (!a) return;
    const e = this.entry(a, level, true)!;
    e.kills++;
    this.onChange?.(e);
  }

  /** Call every frame. Watching an animal near the view center at zoom >= 2.5 counts as observing it. */
  observe(game: Game, dt: number, aspect: number): void {
    this.acc += dt;
    if (this.acc < TICK) return;
    const step = this.acc; this.acc = 0;
    const p = game.player;
    if (p.zoom < 2.5) { this.watch.clear(); return; }
    const from: [number, number, number] = [p.position.x, p.position.y, p.position.z];
    const seen = new Set<string>();
    for (const a of game.sim.animals.list) {
      if (a.state === 'DEAD') continue;
      const dist = Math.hypot(a.position.x - p.position.x, a.position.z - p.position.z);
      if (dist > 170) continue;
      const B = a.species.bounds;
      const c: [number, number, number] = [a.position.x, a.position.y + B.height * 0.5, a.position.z];
      const n = project(p.position, p.orientation, p.zoom, aspect, c);
      if (!n || Math.abs(n.x) > 0.4 || Math.abs(n.y) > 0.4) continue;
      if (isBlocked(game.world, from, c)) continue;
      seen.add(a.species.id);
      const w = (this.watch.get(a.species.id) ?? 0) + step;
      this.watch.set(a.species.id, w);
      if (w < WATCH_TO_DISCOVER) continue;
      const e = this.entry(a, game.level.id, true)!;
      e.watchSeconds += step;
      const b = a.state.toLowerCase();
      if (!e.behaviors.includes(b)) { e.behaviors.push(b); this.onChange?.(e); }
      else if (Math.floor(e.watchSeconds) !== Math.floor(e.watchSeconds - step)) this.onChange?.(e);
    }
    for (const k of [...this.watch.keys()]) if (!seen.has(k)) this.watch.delete(k);
  }
}
