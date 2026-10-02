import * as THREE from 'three';
import { Game } from '../game/Game';
import { BuildKind } from '../equipment/MultiTool';
import { buildCost } from '../game/Buildings';
import { buildTarget } from '../game/Gather';
import { TORCH_TIERS } from '../equipment/Torch';
import { rotateVec } from '../util/quat';

const lam = (c: number) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
const WOOD = lam(0x7a5a3a), WOOD_DARK = lam(0x5a4228), STONE = lam(0x8a8780), STONE_DARK = lam(0x5c5a56), METAL = lam(0x4a4f55);
const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); return b;
};

interface Parts { group: THREE.Group; turret?: THREE.Group; barrel?: THREE.Group; flames?: THREE.Mesh[]; }

/** Low-poly structures. Local axes: x along the building, -z is "front" (the cannon aims relative to this). */
function makeBuilding(kind: BuildKind): Parts {
  const g = new THREE.Group();
  if (kind === 'campfire') {
    for (let i = 0; i < 3; i++) { const l = box(1.1, 0.14, 0.14, WOOD_DARK, 0, 0.15, 0); l.rotation.y = (i * Math.PI) / 3; g.add(l); }
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; g.add(box(0.28, 0.2, 0.28, STONE, Math.cos(a) * 0.65, 0.1, Math.sin(a) * 0.65)); }
    const flames: THREE.Mesh[] = [];
    for (const [r, h, c, y] of [[0.3, 0.9, 0xff7a20, 0.5], [0.2, 0.6, 0xffd040, 0.45]] as Array<[number, number, number, number]>) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), new THREE.MeshBasicMaterial({ color: c, fog: false }));
      f.position.y = y; g.add(f); flames.push(f);
    }
    return { group: g, flames };
  }
  if (kind === 'wall') {
    g.add(box(4, 2.5, 0.6, STONE, 0, 1.25, 0), box(4.1, 0.2, 0.7, STONE_DARK, 0, 2.55, 0));
    for (const x of [-1.9, 0, 1.9]) g.add(box(0.2, 2.7, 0.7, WOOD, x, 1.35, 0));
    return { group: g };
  }
  if (kind === 'tower') {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.22, 5, 0.22, WOOD, sx * 1.3, 2.5, sz * 1.3));
    g.add(box(3.3, 0.2, 3.3, WOOD_DARK, 0, 5, 0));
    for (const [x, z, w, d] of [[0, -1.5, 3.2, 0.08], [0, 1.5, 3.2, 0.08], [-1.5, 0, 0.08, 3.2], [1.5, 0, 0.08, 3.2]] as number[][]) g.add(box(w, 0.6, d, WOOD, x, 5.45, z));
    for (let i = 0; i < 9; i++) g.add(box(0.9, 0.08, 0.1, WOOD, 0, 0.3 + i * 0.55, -1.52)); // ladder rungs
    g.add(box(0.08, 5, 0.1, WOOD, -0.42, 2.5, -1.52), box(0.08, 5, 0.1, WOOD, 0.42, 2.5, -1.52));
    g.add(box(3.5, 0.12, 3.5, WOOD_DARK, 0, 5.9, 0).translateY(0.6)); // light roof
    return { group: g };
  }
  // autocannons
  const heavy = kind === 'cannon2';
  const s = heavy ? 1.25 : 1;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.75 * s, 0.85 * s, 0.7 * s, 10), STONE_DARK); base.position.y = 0.35 * s; g.add(base);
  const turret = new THREE.Group(); turret.position.y = 0.9 * s;
  turret.add(box(0.8 * s, 0.5 * s, 0.9 * s, METAL, 0, 0.1, 0));
  const barrel = new THREE.Group(); barrel.position.set(0, 0.15 * s, -0.3 * s);
  const offsets = heavy ? [-0.14, 0.14] : [0];
  for (const x of offsets) barrel.add(box(0.1 * s, 0.1 * s, 1.5 * s, lam(0x2a2d31), x, 0, -0.75 * s));
  turret.add(barrel); g.add(turret);
  return { group: g, turret, barrel };
}

/** Structures, the build preview, turret tracers and the dynamic lights (torch, campfires). */
export class BuildingViews {
  private views = new Map<number, Parts>();
  private version = -1;
  private ghost: { kind: BuildKind; parts: Parts } | null = null;
  private tracers: THREE.Line[] = [];
  private torch: THREE.SpotLight;
  private fires: THREE.PointLight[] = [];
  private t = 0;

  constructor(private scene: THREE.Scene) {
    // A fixed set of lights (changing the number of lights would recompile every shader)
    this.torch = new THREE.SpotLight(0xffa040, 0, 20, 0.6, 0.5, 1.2);
    scene.add(this.torch, this.torch.target);
    for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xffa850, 0, 24, 1.6); scene.add(l); this.fires.push(l); }
    for (let i = 0; i < 8; i++) {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe080, fog: false }));
      line.visible = false; line.frustumCulled = false;
      scene.add(line); this.tracers.push(line);
    }
  }

  update(game: Game, dt: number, cam: THREE.Camera): void {
    this.t += dt;
    const bs = game.sim.buildings;

    if (bs.version !== this.version) {
      this.version = bs.version;
      for (const v of this.views.values()) this.scene.remove(v.group);
      this.views.clear();
      for (const b of bs.list) {
        const parts = makeBuilding(b.kind);
        parts.group.position.set(b.x, b.y, b.z);
        parts.group.rotation.y = b.rot;
        this.scene.add(parts.group);
        this.views.set(b.id, parts);
      }
    }
    for (const b of bs.list) {
      const v = this.views.get(b.id);
      if (!v) continue;
      if (v.turret) v.turret.rotation.y = b.aimYaw - b.rot;
      if (v.barrel) v.barrel.rotation.x = b.aimPitch;
      if (v.flames) v.flames.forEach((f, i) => { const k = 1 + 0.18 * Math.sin(this.t * (13 + i * 4) + b.id); f.scale.set(1 / k, k, 1 / k); });
    }

    // Campfire lights: the nearest four
    const campfires = bs.list.filter((b) => b.kind === 'campfire')
      .map((b) => ({ b, d: Math.hypot(b.x - cam.position.x, b.z - cam.position.z) }))
      .filter((c) => c.d < 80).sort((a, b) => a.d - b.d);
    this.fires.forEach((l, i) => {
      const c = campfires[i];
      if (!c) { l.intensity = 0; return; }
      l.position.set(c.b.x, c.b.y + 1.3, c.b.z);
      l.intensity = 2.6 * (1 + 0.15 * Math.sin(this.t * 17 + c.b.id) + 0.08 * Math.sin(this.t * 31));
    });

    // Torch
    const tool = game.current;
    if (tool.kind === 'torch') {
      const spec = TORCH_TIERS[game.torch.tier];
      const f = rotateVec(game.player.orientation, [0, 0, -1]);
      this.torch.color.setHex(spec.color);
      this.torch.intensity = spec.intensity * (1 + spec.flicker * (Math.sin(this.t * 19) * 0.5 + Math.sin(this.t * 47) * 0.3));
      this.torch.distance = spec.range;
      this.torch.angle = spec.angle;
      this.torch.position.copy(cam.position);
      this.torch.target.position.set(cam.position.x + f[0] * 10, cam.position.y + f[1] * 10, cam.position.z + f[2] * 10);
    } else {
      this.torch.intensity = 0;
    }

    this.updateGhost(game);

    // Turret tracers
    this.tracers.forEach((line, i) => {
      const tr = bs.tracers[i];
      line.visible = !!tr;
      if (!tr) return;
      const pos = (line.geometry as THREE.BufferGeometry).getAttribute('position') as THREE.BufferAttribute;
      pos.setXYZ(0, tr.a[0], tr.a[1], tr.a[2]); pos.setXYZ(1, tr.b[0], tr.b[1], tr.b[2]);
      pos.needsUpdate = true;
    });
  }

  /** Translucent preview of the structure about to be placed (green = ok, red = not possible). */
  private updateGhost(game: Game): void {
    const mt = game.multitool;
    const kind = game.current.kind === 'multitool' && mt.buildKind && mt.buildKind !== 'remove' ? mt.buildKind : null;
    if (!kind) { if (this.ghost) { this.scene.remove(this.ghost.parts.group); this.ghost = null; } return; }
    if (!this.ghost || this.ghost.kind !== kind) {
      if (this.ghost) this.scene.remove(this.ghost.parts.group);
      const parts = makeBuilding(kind);
      parts.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.material = new THREE.MeshBasicMaterial({ color: 0x40ff60, transparent: true, opacity: 0.45, depthWrite: false });
      });
      this.scene.add(parts.group);
      this.ghost = { kind, parts };
    }
    const t = buildTarget(game, kind), c = buildCost(game.level, kind), pr = game.progress;
    const ok = pr.wood >= c.wood && pr.stone >= c.stone && pr.coins >= c.coins && game.sim.buildings.canPlace(kind, t.x, t.z, t.rot, game.player.position);
    const g = this.ghost.parts.group;
    g.position.set(t.x, game.world.heightAt(t.x, t.z), t.z);
    g.rotation.y = t.rot;
    g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) (m.material as THREE.MeshBasicMaterial).color.setHex(ok ? 0x40ff60 : 0xff4040); });
  }
}
