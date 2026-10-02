import { Game } from '../game/Game';
import { yawOf } from '../util/quat';
import { BUILD_DEFS } from '../game/Buildings';
import { WORLD_SIZE } from '../game/World';

const CELL = 12;

/** Stylized transparent minimap (player up): forest dark green, water blue, animals purple, monsters red, buildings black. */
export class MiniMap {
  readonly canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private size = 116;
  private grid: Uint8Array | null = null;
  private gridVersion = -1;
  private n = Math.ceil(WORLD_SIZE / CELL);
  private t = 0;

  constructor(root: HTMLElement) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.className = 'map';
    this.canvas.width = this.canvas.height = this.size * dpr;
    this.canvas.style.width = this.canvas.style.height = `${this.size}px`;
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.scale(dpr, dpr);
    root.append(this.canvas);
  }

  /** Forest cells: 12 m cells with at least 3 living trees. */
  private buildGrid(game: Game): void {
    const n = this.n, counts = new Uint8Array(n * n);
    for (const p of game.world.props) {
      if (p.kind !== 'tree' || p.removed) continue;
      const i = Math.floor((p.x + WORLD_SIZE / 2) / CELL), j = Math.floor((p.z + WORLD_SIZE / 2) / CELL);
      if (i >= 0 && j >= 0 && i < n && j < n) counts[j * n + i] = Math.min(255, counts[j * n + i] + 1);
    }
    this.grid = counts;
    this.gridVersion = game.world.removedVersion;
  }

  radius(game: Game): number {
    return game.has('map.r2') ? 160 : game.has('map.r1') ? 100 : 60;
  }

  update(game: Game, dt: number): void {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.1;
    if (this.grid === null || this.gridVersion !== game.world.removedVersion) this.buildGrid(game);
    const c = this.ctx, S = this.size, R = this.radius(game), s = (S / 2 - 2) / R;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const p = game.player.position, yaw = yawOf(game.player.orientation);
    const cos = Math.cos(yaw), sin = Math.sin(yaw);

    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, S, S);
    c.save();
    c.beginPath(); c.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2); c.clip();
    c.translate(S / 2, S / 2);
    c.transform(s * cos, s * sin, -s * sin, s * cos, 0, 0); // world -> map: the view direction is up
    c.translate(-p.x, -p.z);
    this.draw(game, c, R, s);
    c.restore();
  }

  private draw(game: Game, c: CanvasRenderingContext2D, R: number, s: number): void {
    const p = game.player.position;

    // forest
    c.fillStyle = 'rgba(18,92,40,0.6)';
    const n = this.n;
    const i0 = Math.max(0, Math.floor((p.x - R + WORLD_SIZE / 2) / CELL)), i1 = Math.min(n - 1, Math.floor((p.x + R + WORLD_SIZE / 2) / CELL));
    const j0 = Math.max(0, Math.floor((p.z - R + WORLD_SIZE / 2) / CELL)), j1 = Math.min(n - 1, Math.floor((p.z + R + WORLD_SIZE / 2) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (this.grid![j * n + i] >= 3) c.fillRect(i * CELL - WORLD_SIZE / 2, j * CELL - WORLD_SIZE / 2, CELL + 0.5, CELL + 0.5);
    }
    // water
    if (game.world.flatY === null) {
      c.fillStyle = 'rgba(50,120,230,0.75)';
      c.beginPath(); c.arc(game.world.pond.x, game.world.pond.z, game.world.pond.r * 1.6, 0, Math.PI * 2); c.fill();
    }
    // base buildings (black)
    c.fillStyle = '#000';
    for (const b of game.sim.buildings.list) {
      const d = BUILD_DEFS[b.kind];
      c.save(); c.translate(b.x, b.z); c.rotate(-b.rot);
      c.fillRect(-Math.max(d.hx, 1.5 / s), -Math.max(d.hz, 1.5 / s), 2 * Math.max(d.hx, 1.5 / s), 2 * Math.max(d.hz, 1.5 / s));
      c.restore();
    }
    // animals (purple) and detected monsters (red)
    for (const a of game.sim.animals.list) {
      if (a.state === 'DEAD') continue;
      const d = Math.hypot(a.position.x - p.x, a.position.z - p.z);
      if (d > R) continue;
      c.fillStyle = a.species.monster ? '#ff2a2a' : '#b44cff';
      c.beginPath(); c.arc(a.position.x, a.position.z, (a.species.monster ? 3.4 : 2.6) / s, 0, Math.PI * 2); c.fill();
    }
    // player: white arrow pointing up (forward)
    c.save();
    c.translate(p.x, p.z);
    const yaw = yawOf(game.player.orientation);
    c.rotate(-yaw);                       // undo the map rotation: the arrow always points up on screen
    c.fillStyle = '#fff';
    const u = 4.5 / s;
    c.beginPath(); c.moveTo(0, -u * 1.3); c.lineTo(u * 0.8, u); c.lineTo(0, u * 0.5); c.lineTo(-u * 0.8, u); c.closePath(); c.fill();
    c.restore();
  }
}
