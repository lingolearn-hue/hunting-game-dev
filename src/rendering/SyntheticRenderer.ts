import * as THREE from 'three';
import { Renderer } from './Renderer';
import { ViewCamera } from './ViewCamera';
import { Game } from '../game/Game';
import { WORLD_SIZE } from '../game/World';
import { Prop } from '../data/environments/Level';
import { CreatureView } from './CreatureView';
import { Rocket, Explosion } from '../game/Rocket';
import { SkySystem } from './Sky';
import { BuildingViews } from './BuildingViews';

const TERRAIN_MARGIN = 120;

export class SyntheticRenderer implements Renderer {
  protected gl!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private view = new ViewCamera();
  protected container!: HTMLElement;
  /** AR mode: transparent canvas, only animals/rockets/explosions are rendered (no terrain, sky or fog). */
  protected arMode = false;
  private views = new Map<number, CreatureView>();
  private rocketViews = new Map<number, { g: THREE.Group; trail: THREE.Line }>();
  private blastViews = new Map<Explosion, THREE.Mesh>();
  private blood!: THREE.InstancedMesh;
  private bloodVersion = -1;
  private last = performance.now();
  private sun = new THREE.DirectionalLight(0xffffff, 1.6);
  private hemi = new THREE.HemisphereLight(0xbfd9ff, 0x3a4a2a, 0.9);
  private palette!: Game['level']['palette'];
  private moon = new THREE.DirectionalLight(0x8898c8, 0);
  private sky: SkySystem | null = null;
  private bViews: BuildingViews | null = null;
  private propInst = new Map<Prop, Array<{ m: THREE.InstancedMesh; i: number }>>();
  private hiddenVersion = 0;
  private thermal = false;
  private thermalSaved = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private hotMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
  private coldMat = new THREE.MeshBasicMaterial({ color: 0x1b2128 });

  init(container: HTMLElement, game: Game): void {
    this.container = container;
    this.gl = new THREE.WebGLRenderer({ antialias: false, alpha: this.arMode, powerPreference: 'high-performance' });
    if (this.arMode) this.gl.setClearColor(0x000000, 0);
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.gl.domElement);

    const P = (this.palette = game.level.palette);
    if (!this.arMode) {
      const sky = new THREE.Color(P.sky);
      this.scene.background = sky;
      this.scene.fog = new THREE.Fog(sky, P.fogNear, P.fogFar);
    }
    this.sun.color.setHex(P.sun); this.sun.intensity = P.sunIntensity;
    this.hemi.color.setHex(P.hemiSky); this.hemi.groundColor.setHex(P.hemiGround);
    this.scene.add(this.hemi, this.sun, this.moon);
    this.sun.position.set(60, 90, 30);

    if (!this.arMode) {
      this.sky = new SkySystem(game.level.seed);
      this.scene.add(this.sky.group);
      this.scene.background = new THREE.Color(P.sky);
      this.bViews = new BuildingViews(this.scene);
      this.buildTerrain(game);
      this.buildWater(game);
      this.buildProps(game);
      this.blood = new THREE.InstancedMesh(new THREE.CircleGeometry(0.22, 8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x6a0f0f }), 400);
      this.blood.count = 0; this.blood.frustumCulled = false;
      this.scene.add(this.blood);
    }
    this.resize();
  }

  resize(): void {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.gl.setSize(w, h);
    this.view.setAspect(w / h);
  }

  render(game: Game): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const cull = this.scene.fog ? (this.scene.fog as THREE.Fog).far + 5 : 400;
    // Remove views of animals that are gone (respawn, harvested, dissolved at dawn)
    if (this.views.size > game.sim.animals.list.length) {
      const ids = new Set(game.sim.animals.list.map((a) => a.id));
      for (const [id, v] of this.views) if (!ids.has(id)) { this.scene.remove(v.group); this.views.delete(id); }
    }
    for (const a of game.sim.animals.list) {
      let v = this.views.get(a.id);
      if (!v) { v = new CreatureView(a); this.scene.add(v.group); this.views.set(a.id, v); }
      const pp = game.player.position;
      const near = Math.hypot(a.position.x - pp.x, a.position.z - pp.z) < cull; // beyond the fog: skip
      v.group.visible = near;
      if (near) v.update(a, dt);
    }
    this.syncEffects(game);
    this.view.update(game.player);
    if (!this.arMode) {
      this.syncBlood(game);
      this.syncRemovedProps(game);
      this.sky!.update(game.sim.timeOfDay, this.view.camera.position, dt, game.sim.wind, {
        sun: this.sun, moon: this.moon, hemi: this.hemi, scene: this.scene, palette: this.palette,
      });
      this.bViews!.update(game, dt, this.view.camera);
      this.applyThermal(game.thermalOn && game.thermalAvailable());
    }
    this.gl.render(this.scene, this.view.camera);
  }

  /** Hides trees and rocks that were cut down or mined. */
  private syncRemovedProps(game: Game): void {
    if (game.world.removedVersion === this.hiddenVersion) return;
    this.hiddenVersion = game.world.removedVersion;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const [p, insts] of this.propInst) {
      if (!p.removed) continue;
      for (const { m, i } of insts) { m.setMatrixAt(i, zero); m.instanceMatrix.needsUpdate = true; }
      this.propInst.delete(p);
    }
  }

  /**
   * Thermal view: creatures (and rockets) glow white, everything else is dark.
   * Materials are swapped once per mesh and restored when the view is switched off.
   */
  private applyThermal(on: boolean): void {
    if (on !== this.thermal) {
      this.thermal = on;
      this.sky!.group.visible = !on;
      this.gl.domElement.style.filter = on ? 'contrast(1.35) brightness(1.15)' : '';
      if (!on) {
        for (const [m, mat] of this.thermalSaved) m.material = mat;
        this.thermalSaved.clear();
        (this.scene.fog as THREE.Fog).color.setHex(0x000000);
      }
    }
    if (!on) return;
    (this.scene.fog as THREE.Fog).color.setHex(0x0a0d10);
    (this.scene.background as THREE.Color).setHex(0x0a0d10);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || this.thermalSaved.has(m)) return;
      if (m.material instanceof THREE.MeshBasicMaterial && (m.material as THREE.MeshBasicMaterial).fog === false) return; // flames, eyes, effects keep their look
      this.thermalSaved.set(m, m.material);
      m.material = m.userData.creature || m.userData.hot ? this.hotMat : this.coldMat;
    });
  }

  /** Blood trail of wounded animals. */
  private syncBlood(game: Game): void {
    const m = game.sim.animals;
    if (m.bloodVersion === this.bloodVersion) return;
    this.bloodVersion = m.bloodVersion;
    const d = new THREE.Object3D();
    m.blood.forEach((b, i) => {
      d.position.set(b.x, game.world.heightAt(b.x, b.z) + 0.05, b.z);
      d.rotation.y = i * 1.7;
      d.scale.setScalar(0.7 + ((i * 37) % 10) / 14);
      d.updateMatrix();
      this.blood.setMatrixAt(i, d.matrix);
    });
    this.blood.count = m.blood.length;
    this.blood.instanceMatrix.needsUpdate = true;
  }

  private rocketGroup(): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.9, 8), new THREE.MeshLambertMaterial({ color: 0xdddddd }));
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.25, 8), new THREE.MeshLambertMaterial({ color: 0xaa3030 }));
    nose.position.y = 0.57;
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.6, 8), new THREE.MeshBasicMaterial({ color: 0xffa030 }));
    flame.position.y = -0.7; flame.rotation.x = Math.PI;
    g.add(body, nose, flame);
    g.traverse((o) => { o.userData.hot = true; }); // rockets glow in thermal view
    return g;
  }

  /** Rockets (with smoke trail) and explosions from the simulation. */
  private syncEffects(game: Game): void {
    const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
    const live = new Set<number>();
    for (const r of game.sim.rockets.rockets as Rocket[]) {
      live.add(r.id);
      let v = this.rocketViews.get(r.id);
      if (!v) {
        const g = this.rocketGroup();
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(31 * 3), 3));
        const trail = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
        trail.frustumCulled = false;
        this.scene.add(g, trail);
        v = { g, trail };
        this.rocketViews.set(r.id, v);
      }
      v.g.position.set(r.pos[0], r.pos[1], r.pos[2]);
      v.g.quaternion.setFromUnitVectors(up, dir.set(r.dir[0], r.dir[1], r.dir[2]));
      const arr = (v.trail.geometry.getAttribute('position') as THREE.BufferAttribute);
      const pts = [...r.trail, r.pos];
      pts.forEach((p, i) => arr.setXYZ(i, p[0], p[1], p[2]));
      v.trail.geometry.setDrawRange(0, pts.length);
      arr.needsUpdate = true;
    }
    for (const [id, v] of this.rocketViews) {
      if (live.has(id)) continue;
      this.scene.remove(v.g, v.trail);
      v.trail.geometry.dispose();
      this.rocketViews.delete(id);
    }

    const blasts = new Set<Explosion>(game.sim.rockets.explosions);
    for (const e of blasts) {
      let m = this.blastViews.get(e);
      if (!m) {
        m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0.9 }));
        m.position.set(e.x, e.y, e.z);
        this.scene.add(m);
        this.blastViews.set(e, m);
      }
      const k = Math.min(1, e.age / 0.5);
      m.scale.setScalar(0.5 + k * 6.5);
      (m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 * (1 - e.age));
    }
    for (const [e, m] of this.blastViews) {
      if (blasts.has(e)) continue;
      this.scene.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
      this.blastViews.delete(e);
    }
  }

  aspect(): number {
    return this.container.clientWidth / this.container.clientHeight;
  }

  async capture(game: Game): Promise<Blob | null> {
    this.render(game); // read the buffer right after rendering (no preserveDrawingBuffer needed)
    const url = this.gl.domElement.toDataURL('image/jpeg', 0.85);
    try { return await (await fetch(url)).blob(); } catch { return null; }
  }

  private buildTerrain(game: Game): void {
    const size = WORLD_SIZE + 2 * TERRAIN_MARGIN; // ground continues beyond the playable area (hidden by fog)
    const seg = Math.round(size / 3);
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    const lo = new THREE.Color(this.palette.groundLo), hi = new THREE.Color(this.palette.groundHi), sand = new THREE.Color(this.palette.sand);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = game.world.heightAt(pos.getX(i), pos.getZ(i));
      pos.setY(i, y);
      const pd = Math.hypot(pos.getX(i) - game.world.pond.x, pos.getZ(i) - game.world.pond.z);
      if (y < game.world.waterLevel + 0.4 && pd < game.world.pond.r * 2.4) c.copy(sand); // beach only around the pond
      else c.copy(lo).lerp(hi, Math.min(1, Math.max(0, (y + 1) / 5)));
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    this.scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
  }

  private buildWater(game: Game): void {
    const { pond, waterLevel } = game.world;
    const m = new THREE.Mesh(
      new THREE.CircleGeometry(pond.r * 1.9, 32).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: this.palette.water, transparent: true, opacity: 0.85 }),
    );
    m.position.set(pond.x, waterLevel, pond.z);
    this.scene.add(m);
  }

  private buildProps(game: Game): void {
    const trees = game.world.props.filter((p) => p.kind === 'tree');
    const bushes = game.world.props.filter((p) => p.kind === 'bush');
    const rocks = game.world.props.filter((p) => p.kind === 'rock');
    const h = (x: number, z: number) => game.world.heightAt(x, z);
    const dummy = new THREE.Object3D();

    const inst = (geo: THREE.BufferGeometry, color: number, list: Prop[], yOff: number, sy = 1) => {
      const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color, flatShading: true }), list.length);
      list.forEach((p, i) => {
        dummy.position.set(p.x, h(p.x, p.z) + yOff * p.scale, p.z);
        dummy.rotation.set(0, p.rot, 0);
        dummy.scale.set(p.scale, p.scale * sy, p.scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      list.forEach((p, i) => { const a = this.propInst.get(p) ?? []; a.push({ m: mesh, i }); this.propInst.set(p, a); });
      this.scene.add(mesh);
    };

    const P = this.palette;
    if (game.level.treeStyle === 'container') {
      inst(new THREE.BoxGeometry(2.6, 2.6, 6), P.leaf, trees, 1.3);
      inst(new THREE.IcosahedronGeometry(0.8, 0), P.bush, bushes, 0.4, 0.8);
    } else if (game.level.treeStyle === 'conifer') {
      inst(new THREE.CylinderGeometry(0.18, 0.28, 3, 6), P.trunk, trees, 1.5);
      inst(new THREE.ConeGeometry(1.6, 5, 7), P.leaf, trees, 5.0);
      inst(new THREE.IcosahedronGeometry(0.8, 0), P.bush, bushes, 0.4, 0.8);
    } else {
      inst(new THREE.CylinderGeometry(0.2, 0.35, 6, 6), P.trunk, trees, 3.0);
      inst(new THREE.SphereGeometry(2.2, 7, 4), P.leaf, trees, 6.3, 0.4);
      inst(new THREE.IcosahedronGeometry(0.9, 0), P.bush, bushes, 0.3, 0.5); // ferns: wide and flat
    }
    inst(new THREE.DodecahedronGeometry(0.7, 0), P.rock, rocks, 0.25, 0.7);
  }
}
