import { Equipment } from './Equipment';

/** Target-seeking rocket launcher (abstract game model). Only available on levels that list it. */
export class Launcher implements Equipment {
  readonly id = 'launcher';
  readonly name = 'Seeker rockets';
  readonly kind = 'launcher' as const;
  readonly minZoom = 1;
  readonly maxZoom = 4;
  readonly overlay = 'launcher' as const;

  swayDeg = 0.3;
  range = 400;          // m, lock range
  lockTime = 1.5;       // s to acquire a lock
  lockConeDeg = 5;      // lock-on cone around the view center
  magazine = 3;
  actionMs = 1200;
  reloadMs = 5000;

  ammo = 3;
  private nextShotAt = 0;
  private reloadUntil = 0;

  get reloading(): boolean { return this.ammo === 0; }

  tick(now: number): void {
    if (this.ammo === 0 && now >= this.reloadUntil) this.ammo = this.magazine;
  }

  canFire(now: number): boolean {
    return this.ammo > 0 && now >= this.nextShotAt;
  }

  consume(now: number): void {
    this.ammo--;
    this.nextShotAt = now + this.actionMs;
    if (this.ammo === 0) this.reloadUntil = now + this.reloadMs;
  }
}
