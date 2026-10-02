import * as THREE from 'three';
import { sunElevation } from '../game/sky';
import { Palette } from '../data/environments/Level';
import { makeRng } from '../util/rng';

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const RADIUS = 340;

function radialTexture(stops: Array<[number, string]>, size = 128): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

function cloudTexture(seed: number): THREE.CanvasTexture {
  const rnd = makeRng(seed);
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 14; i++) { // overlapping soft puffs
    const x = 40 + rnd() * 176, y = 50 + rnd() * 40, r = 18 + rnd() * 30;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 128);
  }
  return new THREE.CanvasTexture(c);
}

export interface SkyTargets {
  sun: THREE.DirectionalLight;
  moon: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  scene: THREE.Scene;
  palette: Palette;
}

/** Sky dome with sun, moon, stars, a hint of the Milky Way and drifting clouds; drives lights and fog. */
export class SkySystem {
  readonly group = new THREE.Group();
  private dome: THREE.Mesh;
  private uniforms: Record<string, { value: unknown }>;
  private moonMesh: THREE.Mesh;
  private moonHalo: THREE.Sprite;
  private stars: THREE.Group;
  private starMats: THREE.PointsMaterial[] = [];
  private clouds: Array<{ s: THREE.Sprite; az: number; el: number }> = [];
  private tmp = new THREE.Color();
  private tmp2 = new THREE.Color();

  constructor(seed: number) {
    const rnd = makeRng(seed * 7919 + 13);
    this.uniforms = {
      uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uGlowAmt: { value: 0 }, uSunVis: { value: 1 }, uSunCol: { value: new THREE.Color() },
    };
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms as never, side: THREE.BackSide, depthWrite: false, fog: false,
        vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `
          uniform vec3 uZenith, uHorizon, uGlow, uSunDir, uSunCol; uniform float uGlowAmt, uSunVis; varying vec3 vDir;
          void main(){
            vec3 d = normalize(vDir); float h = d.y;
            vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.5));
            float sd = max(dot(d, uSunDir), 0.0);
            col += uGlow * (pow(sd, 5.0) * 0.45 + pow(sd, 40.0) * 0.8) * uGlowAmt;
            col += uSunCol * smoothstep(0.99935, 0.9998, sd) * uSunVis;
            col = mix(col, uHorizon * 0.55, smoothstep(0.0, -0.25, h));
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    );
    this.dome.renderOrder = -100;
    this.dome.frustumCulled = false;
    this.group.add(this.dome);

    // Moon (stylized, slightly oversized) with a halo
    const mc = document.createElement('canvas'); mc.width = mc.height = 128;
    const mg = mc.getContext('2d')!;
    mg.fillStyle = '#e9ecf2'; mg.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 16; i++) {
      const x = rnd() * 128, y = rnd() * 128, r = 6 + rnd() * 16;
      const gr = mg.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(120,125,140,0.45)'); gr.addColorStop(1, 'rgba(120,125,140,0)');
      mg.fillStyle = gr; mg.fillRect(0, 0, 128, 128);
    }
    this.moonMesh = new THREE.Mesh(
      new THREE.CircleGeometry(11, 32),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(mc), fog: false, depthWrite: false, transparent: true }),
    );
    this.moonMesh.renderOrder = -90;
    this.group.add(this.moonMesh);
    this.moonHalo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialTexture([[0, 'rgba(190,205,255,0.55)'], [0.3, 'rgba(160,180,255,0.18)'], [1, 'rgba(120,140,255,0)']]),
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true,
    }));
    this.moonHalo.scale.set(90, 90, 1); this.moonHalo.renderOrder = -91;
    this.group.add(this.moonHalo);

    // Stars: many faint, some bright, plus a Milky Way band
    this.stars = new THREE.Group();
    const dirOnSphere = () => { const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u); return new THREE.Vector3(s * Math.cos(a), u, s * Math.sin(a)); };
    const makePoints = (positions: number[], colors: number[], size: number): THREE.Points => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      const mat = new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, fog: false, opacity: 0 });
      this.starMats.push(mat);
      const p = new THREE.Points(geo, mat);
      p.renderOrder = -95; p.frustumCulled = false;
      return p;
    };
    const star = (n: number, bright: boolean, size: number) => {
      const pos: number[] = [], col: number[] = [];
      for (let i = 0; i < n; i++) {
        const d = dirOnSphere().multiplyScalar(RADIUS - 5);
        pos.push(d.x, d.y, d.z);
        const b = bright ? 0.9 + rnd() * 0.1 : 0.45 + rnd() * 0.5;
        col.push(b, b, b); // neutral white: no coloured dots
      }
      this.stars.add(makePoints(pos, col, size));
    };
    star(1700, false, 1.6);
    star(70, true, 3.4);
    // Milky Way: a tilted great circle with scattered points, denser and warmer toward a "galactic center"
    const normal = new THREE.Vector3(0.35, 0.8, 0.5).normalize();
    const e1 = new THREE.Vector3().crossVectors(normal, new THREE.Vector3(0, 0, 1)).normalize();
    const e2 = new THREE.Vector3().crossVectors(normal, e1).normalize();
    const mp: number[] = [], mcol: number[] = [];
    for (let i = 0; i < 3200; i++) {
      const t = rnd() * Math.PI * 2;
      const core = Math.exp(-Math.pow(((t - 1.3 + Math.PI) % (Math.PI * 2)) - Math.PI, 2) / 0.8); // brighter near t=1.3
      if (rnd() > 0.35 + 0.65 * core) continue;
      const spread = (rnd() + rnd() + rnd() - 1.5) * (0.16 + 0.1 * core);
      const d = e1.clone().multiplyScalar(Math.cos(t)).add(e2.clone().multiplyScalar(Math.sin(t))).add(normal.clone().multiplyScalar(spread)).normalize().multiplyScalar(RADIUS - 6);
      mp.push(d.x, d.y, d.z);
      const b = 0.28 + 0.35 * rnd() + 0.2 * core;
      mcol.push(b, b, b);
    }
    this.stars.add(makePoints(mp, mcol, 1.3));
    this.group.add(this.stars);

    // Clouds
    const textures = [cloudTexture(seed + 1), cloudTexture(seed + 2), cloudTexture(seed + 3)];
    for (let i = 0; i < 16; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: textures[i % 3], transparent: true, depthWrite: false, fog: false, opacity: 0.8 }));
      const w = 110 + rnd() * 90;
      s.scale.set(w, w * 0.42, 1);
      s.renderOrder = -80;
      this.clouds.push({ s, az: rnd() * Math.PI * 2, el: 0.12 + rnd() * 0.65 });
      this.group.add(s);
    }
  }

  /** Updates the sky for the hour and applies lighting, fog and background to the scene. */
  update(hour: number, camPos: THREE.Vector3, dt: number, wind: { x: number; z: number; speed: number }, t: SkyTargets): void {
    this.group.position.copy(camPos);
    const e = sunElevation(hour);
    const ang = ((hour - 6) / 12) * Math.PI;
    const dayK = smooth(-0.40, 0.35, e);                 // wide twilight (about 2.5 game hours): no sudden darkness
    const tw = Math.exp(-Math.pow(e / 0.26, 2));         // twilight bell around the horizon
    const P = t.palette;

    const sunDir = new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0.25 * Math.cos(ang)).normalize();
    // Colors
    const zen = this.tmp.setHex(0x040716).lerp(this.tmp2.setHex(P.sky).multiplyScalar(0.62), dayK);
    zen.lerp(this.tmp2.setHex(0x3a3478), tw * 0.35);
    (this.uniforms.uZenith.value as THREE.Color).copy(zen);
    const hor = this.tmp.setHex(0x0e1730).lerp(this.tmp2.setHex(P.sky), dayK);
    hor.lerp(this.tmp2.setHex(0xff8a50), tw * 0.8);
    (this.uniforms.uHorizon.value as THREE.Color).copy(hor);
    (this.uniforms.uGlow.value as THREE.Color).setHex(0xff7a3a);
    (this.uniforms.uSunDir.value as THREE.Vector3).copy(sunDir);
    this.uniforms.uGlowAmt.value = tw * 1.1 + 0.12 * dayK;
    this.uniforms.uSunVis.value = smooth(-0.06, 0.02, e);
    (this.uniforms.uSunCol.value as THREE.Color).setHex(0xfff2d0).lerp(this.tmp2.setHex(0xff9a50), tw);

    // Moon on its own slower path
    const mAng = ang + Math.PI * 0.85;
    const moonDir = new THREE.Vector3(Math.cos(mAng), Math.sin(mAng), -0.25).normalize();
    const night = 1 - dayK;
    this.moonMesh.position.copy(moonDir).multiplyScalar(RADIUS - 10);
    this.moonMesh.lookAt(0, 0, 0);
    this.moonHalo.position.copy(this.moonMesh.position);
    const moonUp = smooth(-0.05, 0.12, moonDir.y);
    (this.moonMesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0.08, night) * moonUp;
    (this.moonHalo.material as THREE.SpriteMaterial).opacity = night * moonUp * 0.9;

    // Stars: rotate slowly with the hour, fade in with the dark
    this.stars.rotation.y = hour * 0.2618;
    const starA = Math.pow(smooth(0.25, 0.85, night), 1.4);
    this.starMats.forEach((m, i) => { m.opacity = starA * (i === 2 ? 0.7 : 1) * (0.92 + 0.08 * Math.sin(hour * 900 + i)); });

    // Clouds: drift with the wind, tinted by the light (orange at sunset, dark blue at night)
    const drift = (wind.speed * 0.0015 * dt) / 3;
    for (const c of this.clouds) {
      c.az += drift;
      const cd = new THREE.Vector3(Math.cos(c.az) * Math.cos(c.el), Math.sin(c.el), Math.sin(c.az) * Math.cos(c.el));
      c.s.position.copy(cd).multiplyScalar(RADIUS - 20);
      const col = this.tmp.setHex(0x1c2438).lerp(this.tmp2.setHex(0xffffff), dayK);
      col.lerp(this.tmp2.setHex(0xffa070), tw * 0.8 * Math.max(0, cd.dot(sunDir) * 0.5 + 0.7));
      (c.s.material as THREE.SpriteMaterial).color.copy(col);
      (c.s.material as THREE.SpriteMaterial).opacity = 0.85 - 0.05 * dayK; // opaque enough to hide the stars behind
    }

    // Lighting and fog
    t.sun.position.copy(sunDir).multiplyScalar(100);
    t.sun.intensity = P.sunIntensity * smooth(-0.10, 0.35, e);
    t.sun.color.setHex(P.sun).lerp(this.tmp2.setHex(0xff8a4a), tw * 0.7);
    t.moon.position.copy(moonDir).multiplyScalar(100);
    t.moon.intensity = 0.55 * night * Math.max(0.35, moonUp);
    t.hemi.intensity = 0.32 + 0.58 * dayK;
    t.hemi.color.setHex(0x2c3a66).lerp(this.tmp2.setHex(P.hemiSky), dayK);
    t.hemi.groundColor.setHex(0x14182a).lerp(this.tmp2.setHex(P.hemiGround), dayK);
    const fog = t.scene.fog as THREE.Fog | null;
    if (fog) {
      fog.color.copy(hor).multiplyScalar(0.92);
      fog.near = 25 + (P.fogNear - 25) * dayK;
      fog.far = 140 + (P.fogFar - 140) * dayK;
    }
    if (t.scene.background instanceof THREE.Color) t.scene.background.copy(hor);
  }
}
