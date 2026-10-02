import { Equipment, Overlay, ZoomStep } from './Equipment';

/** Abstract hunting rifle (simplified model). Tunable parameters are plain properties. */
export class Weapon implements Equipment {
  readonly id = 'rifle';
  readonly name = 'Hunting rifle';
  readonly kind = 'weapon' as const;
  readonly zoomSteps: ZoomStep[] = [{ zoom: 1, tech: 'rifle' }, { zoom: 4, tech: 'rifle.scope4' }, { zoom: 8, tech: 'rifle.scope8' }];
  readonly minZoom = 1;
  readonly maxZoom = 8;

  swayDeg = 0.3;          // aim stability (degrees, standing still)
  spreadDeg = 0.1;        // accuracy: random cone radius
  range = 300;            // m, max distance
  effectiveRange = 150;   // m, full damage up to here
  damage = 100;
  magazine = 5;
  actionMs = 1400;        // bolt action time between shots
  reloadMs = 3000;

  ammo = 5;
  private nextShotAt = 0;
  private reloadUntil = 0;

  /** 1x is the iron sight; 4x and 8x are scoped. */
  overlayAt(zoom: number): Overlay { return zoom < 1.5 ? 'iron' : 'scope'; }

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
