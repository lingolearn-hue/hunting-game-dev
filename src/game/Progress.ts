import { TECH_BY_ID } from '../data/tech';

export interface BuildingRec { id: number; kind: string; x: number; z: number; rot: number; }

/** Stored per level. */
export interface ProgressRecord {
  level: string;
  coins: number;
  unlocked: string[];
  wood: number;
  stone: number;
  buildings: BuildingRec[];
  removedProps: number[];  // indices of trees/rocks that were cut down
  nextBuildingId: number;
}

/** Coins, unlocked tech, resources and the base of one level. */
export class Progress {
  coins = 0;
  wood = 0;
  stone = 0;
  unlocked = new Set<string>();
  buildings: BuildingRec[] = [];
  removedProps: number[] = [];
  nextBuildingId = 1;
  onChange?: () => void;
  onCoins?: (n: number, why: string) => void;

  constructor(readonly levelId: string, rec?: ProgressRecord) {
    if (rec) {
      this.coins = rec.coins; this.wood = rec.wood; this.stone = rec.stone;
      this.unlocked = new Set(rec.unlocked);
      this.buildings = rec.buildings ?? [];
      this.removedProps = rec.removedProps ?? [];
      this.nextBuildingId = rec.nextBuildingId ?? 1;
    }
  }

  /** null = always available. */
  has(id: string | null): boolean { return id === null || this.unlocked.has(id); }

  addCoins(n: number, why: string): void {
    if (n <= 0) return;
    this.coins += n;
    this.onCoins?.(n, why);
    this.onChange?.();
  }

  canBuy(id: string): boolean {
    const n = TECH_BY_ID[id];
    return !!n && !this.has(id) && this.coins >= n.cost && (n.requires ?? []).every((r) => this.has(r));
  }

  buy(id: string): boolean {
    if (!this.canBuy(id)) return false;
    this.coins -= TECH_BY_ID[id].cost;
    this.unlocked.add(id);
    this.onChange?.();
    return true;
  }

  changed(): void { this.onChange?.(); }

  toRecord(): ProgressRecord {
    return {
      level: this.levelId, coins: this.coins, unlocked: [...this.unlocked], wood: this.wood, stone: this.stone,
      buildings: this.buildings, removedProps: this.removedProps, nextBuildingId: this.nextBuildingId,
    };
  }
}
