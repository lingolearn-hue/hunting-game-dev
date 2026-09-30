import * as THREE from 'three';
import { Renderer } from './Renderer';
import { ViewCamera } from './ViewCamera';
import { Game } from '../game/Game';
import { WORLD_SIZE, Prop } from '../game/World';

export class SyntheticRenderer implements Renderer {
  private gl!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private view = new ViewCamera();
  private container!: HTMLElement;
  private sun = new THREE.DirectionalLight(0xffffff, 1.6);
  private hemi = new THREE.HemisphereLight(0xbfd9ff, 0x3a4a2a, 0.9);

  init(container: HTMLElement, game: Game): void {
    this.container = container;
    this.gl = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.gl.domElement);

    const sky = new THREE.Color(0x9cc7ee);
    this.scene.background = sky;
    this.scene.fog = new THREE.Fog(sky, 60, 190);
    this.scene.add(this.hemi, this.sun);
    this.sun.position.set(60, 90, 30);

    this.buildTerrain(game);
    this.buildWater(game);
    this.buildProps(game);
    this.resize();
  }

  resize(): void {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.gl.setSize(w, h);
    this.view.setAspect(w / h);
  }

  render(game: Game): void {
    this.view.update(game.player);
    this.gl.render(this.scene, this.view.camera);
  }

  private buildTerrain(game: Game): void {
    const seg = 96;
    const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    const lo = new THREE.Color(0x3f6b34), hi = new THREE.Color(0x7c9a4a), sand = new THREE.Color(0x9a8f60);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = game.world.heightAt(pos.getX(i), pos.getZ(i));
      pos.setY(i, y);
      if (y < game.world.waterLevel + 0.4) c.copy(sand);
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
      new THREE.MeshLambertMaterial({ color: 0x3a78a8, transparent: true, opacity: 0.85 }),
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
      this.scene.add(mesh);
    };

    inst(new THREE.CylinderGeometry(0.18, 0.28, 3, 6), 0x5a3d26, trees, 1.5);
    inst(new THREE.ConeGeometry(1.6, 5, 7), 0x2c5a30, trees, 5.0);
    inst(new THREE.IcosahedronGeometry(0.8, 0), 0x3f7a3a, bushes, 0.4, 0.8);
    inst(new THREE.DodecahedronGeometry(0.7, 0), 0x777a7c, rocks, 0.25, 0.7);
  }
}
