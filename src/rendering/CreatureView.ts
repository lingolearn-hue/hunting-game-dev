import * as THREE from 'three';
import { Animal } from '../game/Animal';
import { LookDef } from '../data/species/SpeciesDef';

const mats = new Map<number, THREE.MeshLambertMaterial>();
const mat = (c: number) => {
  let m = mats.get(c);
  if (!m) { m = new THREE.MeshLambertMaterial({ color: c, flatShading: true }); mats.set(c, m); }
  return m;
};
const box = (w: number, h: number, d: number, c: number) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
/** Cone with its axis pointing along direction (0, cos t, sin t) in the YZ plane (t = angle from +Y toward +Z). */
const cone = (r: number, len: number, c: number, t: number) => {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, len, 6), mat(c));
  m.rotation.x = t;
  return m;
};

// Neck pitch per state (negative = leans forward/down; model faces -Z).
const POSE = {
  quad: { idle: -0.55, alert: -0.1, forage: -2.2, flee: -0.7 },
  biped: { idle: -1.0, alert: -0.5, forage: -1.9, flee: -1.4 },
  bird: { idle: -0.15, alert: 0.15, forage: -1.1, flee: -0.3 },
};

/** Low-poly creature built from primitives, driven by the species LookDef. Model faces -Z. */
export class CreatureView {
  readonly group = new THREE.Group();
  private neck = new THREE.Group();
  private legs: THREE.Group[] = [];
  private wings: THREE.Group[] = [];
  private birdLegs: THREE.Group | null = null;
  private phase = Math.random() * 6.28;
  private stance: 'quad' | 'biped' | 'bird' | 'drone' | 'vehicle';
  private rotors: THREE.Mesh[] = [];
  private wheels: THREE.Mesh[] = [];
  private turret: THREE.Group | null = null;
  private wheelR = 0.2;
  private t = 0;
  private legLen: number;
  private dead = 0;
  private halfBody: number;
  private wingAngle = -1.2;
  private span = 1;
  private soar: boolean;

  constructor(animal: Animal) {
    const L = animal.species.look;
    this.stance = L.stance;
    this.legLen = L.legLen;
    this.halfBody = L.stance === 'bird' || L.stance === 'drone' ? (L.wingSpan ?? 1) / 2 : L.body[0] / 2;
    this.wheelR = L.legLen;
    this.soar = animal.species.flight?.kind === 'soar';
    this.group.rotation.order = 'YXZ';
    if (L.stance === 'bird') this.buildBird(L);
    else if (L.stance === 'drone') this.buildDrone(L);
    else if (L.stance === 'vehicle') this.buildVehicle(L);
    else this.buildWalker(animal, L);
  }

  private buildDrone(L: LookDef): void {
    const g = this.group, C = L.colors;
    const [bw, bh, bl] = L.body;
    const span = L.wingSpan ?? 0.7;
    const cy = L.legLen + bh / 2;
    const body = box(bw, bh, bl, C.body); body.position.y = cy; g.add(body);
    const cam = box(bw * 0.4, bh * 0.8, bw * 0.4, C.dark); cam.position.set(0, cy - bh * 0.3, -bl / 2 - bw * 0.1); g.add(cam);
    const led = box(bw * 0.15, bh * 0.2, bw * 0.15, C.accent); led.position.set(0, cy + bh * 0.55, 0); g.add(led);
    for (const rot of [Math.PI / 4, -Math.PI / 4]) { // cross arms
      const arm = box(span, bh * 0.25, bh * 0.35, C.dark); arm.position.y = cy; arm.rotation.y = rot; g.add(arm);
    }
    const o = span * 0.35;
    for (const [x, z] of [[-o, -o], [o, -o], [-o, o], [o, o]]) { // rotors
      const motor = box(bh * 0.5, bh * 0.5, bh * 0.5, C.horn); motor.position.set(x, cy + bh * 0.3, z); g.add(motor);
      const r = new THREE.Mesh(new THREE.CylinderGeometry(span * 0.22, span * 0.22, 0.01, 10), mat(C.horn));
      r.position.set(x, cy + bh * 0.7, z);
      g.add(r); this.rotors.push(r);
    }
  }

  private buildVehicle(L: LookDef): void {
    const g = this.group, C = L.colors;
    const [bw, bh, bl] = L.body;
    const r = L.legLen, tracks = L.feature === 'tracks';
    const cy = r + bh / 2;
    const body = box(bw, bh, bl, C.body); body.position.y = cy; g.add(body);
    if (tracks) {
      for (const sx of [-1, 1]) {
        const tr = box(L.legThick, r * 1.8, bl * 1.1, C.dark); tr.position.set(sx * (bw / 2 + L.legThick / 2), r * 0.9, 0); g.add(tr);
      }
    } else {
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L.legThick, 10), mat(C.dark));
        w.rotation.z = Math.PI / 2;
        w.position.set(sx * (bw / 2 + L.legThick / 2), r, sz * bl * 0.33);
        g.add(w); this.wheels.push(w);
      }
    }
    // Sensor turret
    const tg = new THREE.Group(); tg.position.set(0, cy + bh / 2, -bl * 0.05);
    const tb = box(bw * 0.55, bh * 0.6, bl * 0.35, C.dark); tb.position.y = bh * 0.3; tg.add(tb);
    const eye = box(bw * 0.12, bh * 0.2, bl * 0.15, C.accent); eye.position.set(0, bh * 0.35, -bl * 0.2); tg.add(eye);
    if (tracks) {
      const arm = box(bw * 0.14, bh * 0.14, bl * 0.4, C.horn); arm.position.set(0, bh * 0.35, -bl * 0.35); tg.add(arm);
    }
    g.add(tg); this.turret = tg;
  }

  private buildBird(L: LookDef): void {
    const g = this.group, C = L.colors;
    const [bw, bh, bl] = L.body, [hw, hh, hl] = L.head;
    const span = this.span = L.wingSpan ?? 1;
    const cy = L.legLen + bh / 2;

    const body = box(bw, bh, bl, C.body); body.position.y = cy; g.add(body);
    const tl = L.tailLen ?? 0.2;
    const tail = box(bw * 1.4, Math.max(0.02, bh * 0.15), tl, C.dark);
    tail.position.set(0, cy, bl / 2 + tl / 2 - 0.02); g.add(tail);

    this.neck.position.set(0, cy + bh * 0.35, -bl / 2 + 0.02);
    const head = box(hw, hh, hl, C.accent); head.position.set(0, hh * 0.3, -hl * 0.4);
    const beakLen = hl * (hl > 0.5 ? 0.5 : 0.9);
    const beak = cone(hw * 0.35, beakLen, C.horn, -Math.PI / 2); // tip toward -Z
    beak.position.set(0, hh * 0.2, -hl * 0.8 - beakLen / 2 + 0.02);
    this.neck.add(head, beak);
    if (L.feature === 'crest') {
      const len = 0.8, t = Math.PI / 2 - 0.35;
      const crest = cone(0.05, len, C.horn, t);
      crest.position.set(0, hh * 0.55 + Math.cos(t) * len / 2, hl * 0.05 + Math.sin(t) * len / 2);
      this.neck.add(crest);
    }
    g.add(this.neck);

    const chord = bl * 0.9, thick = Math.max(0.02, bh * 0.12);
    for (const sx of [-1, 1]) {
      const w = new THREE.Group();
      w.position.set(sx * bw / 2, cy + bh * 0.3, 0);
      const m = box(span / 2, thick, chord, C.dark); m.position.x = sx * span / 4;
      w.add(m); g.add(w); this.wings.push(w); // [left, right]
    }

    const lg = new THREE.Group();
    for (const sx of [-1, 1]) {
      const leg = box(L.legThick, L.legLen, L.legThick, C.horn);
      leg.position.set(sx * bw * 0.25, L.legLen / 2, 0); lg.add(leg);
    }
    g.add(lg); this.birdLegs = lg;
  }

  private buildWalker(animal: Animal, L: LookDef): void {
    const g = this.group, C = L.colors;
    const [bw, bh, bl] = L.body, [hw, hh, hl] = L.head;
    const bodyCY = L.legLen + bh * 0.3;

    const body = box(bw, bh, bl, C.body); body.position.y = bodyCY; g.add(body);

    if (L.tail === 'tuft') {
      const t = box(0.12, 0.16, 0.08, C.accent); t.scale.setScalar(Math.max(0.4, Math.min(1, bw * 1.6)));
      t.position.set(0, bodyCY + bh * 0.25, bl / 2 + 0.02); g.add(t);
    } else if (L.tail === 'long') {
      const len = L.tailLen ?? bl * 0.6;
      const t = cone(bw * 0.3, len, C.body, Math.PI / 2); // tip toward +Z
      t.position.set(0, bodyCY + bh * 0.1, bl / 2 + len / 2 - 0.1); g.add(t);
    }

    // Neck + head
    this.neck.position.set(0, bodyCY + bh * 0.35, -bl / 2 + 0.05);
    const nt = Math.max(0.06, bw * 0.3);
    const neckMesh = box(nt, L.neckLen, nt, C.body); neckMesh.position.y = L.neckLen / 2;
    const headY = L.neckLen + hh * 0.3;
    const head = box(hw, hh, hl, C.body); head.position.set(0, headY, -hl * 0.3);
    const nose = box(hw * 0.5, hh * 0.45, hl * 0.2, C.dark); nose.position.set(0, L.neckLen + hh * 0.2, -hl * 0.8);
    this.neck.add(neckMesh, head, nose);

    if (L.feature === 'antlers') {
      const al = L.antlerLen ?? 0.35;
      for (const sx of [-1, 1]) {
        const ear = box(0.05, 0.14, 0.05, C.dark); ear.position.set(sx * hw * 0.65, headY + hh * 0.5, -0.02);
        this.neck.add(ear);
        if (animal.sex === 'M') {
          const a = box(0.03, al, 0.03, C.horn); a.position.set(sx * hw * 0.4, headY + hh * 0.5 + al / 2, -0.05); a.rotation.z = -sx * 0.35;
          this.neck.add(a);
          if (al > 0.5) { // elk: a second tine
            const b = box(0.03, al * 0.5, 0.03, C.horn); b.position.set(sx * hw * 0.9, headY + hh * 0.5 + al * 0.55, -0.15); b.rotation.z = -sx * 0.8;
            this.neck.add(b);
          }
        }
      }
    } else if (L.feature === 'ears') {
      const el = L.earLen ?? 0.1;
      for (const sx of [-1, 1]) {
        const ear = box(0.035, el, 0.03, C.dark); ear.position.set(sx * hw * 0.35, headY + hh * 0.5 + el / 2 - 0.01, hl * 0.05);
        this.neck.add(ear);
      }
    } else if (L.feature === 'tusks') {
      for (const sx of [-1, 1]) {
        const t = cone(0.03, hl * 0.4, C.horn, -0.6); // up and forward
        t.position.set(sx * hw * 0.35, L.neckLen + hh * 0.1, -hl * 0.75);
        this.neck.add(t);
      }
    } else if (L.feature === 'ceratopsian') {
      const frill = box(hw * 2.1, hh * 1.9, 0.12, C.dark);
      frill.position.set(0, headY + hh * 0.7, hl * 0.05); frill.rotation.x = 0.5;
      this.neck.add(frill);
      const hornLen = hl * 0.9;
      for (const sx of [-1, 1]) {
        const h = cone(0.11, hornLen, C.horn, -Math.PI / 2); // tip toward -Z
        h.position.set(sx * hw * 0.32, headY + hh * 0.55, -hl * 0.05 - hornLen / 2 - hl * 0.3);
        this.neck.add(h);
      }
      const nh = cone(0.1, hl * 0.4, C.horn, -1.1);
      nh.position.set(0, headY - hh * 0.05, -hl * 0.85);
      this.neck.add(nh);
    } else if (L.feature === 'crest') {
      const len = 1.3, t = Math.PI / 2 - 0.5;
      const dy = Math.cos(t), dz = Math.sin(t);
      const crest = cone(0.09, len, C.horn, t);
      crest.position.set(0, headY + hh * 0.5 + dy * len / 2, -hl * 0.1 + dz * len / 2);
      this.neck.add(crest);
    }
    g.add(this.neck);

    if (L.feature === 'arms') {
      const armLen = bh * 0.6;
      for (const sx of [-1, 1]) {
        const arm = box(bw * 0.12, armLen, bw * 0.12, C.dark);
        arm.position.set(sx * bw * 0.5, bodyCY - bh * 0.1, -bl / 2 + 0.1); arm.rotation.x = -0.5;
        g.add(arm);
      }
    }

    // Legs (pivot at the hip)
    const mk = (x: number, z: number) => {
      const leg = new THREE.Group();
      leg.position.set(x, L.legLen, z);
      const m = box(L.legThick, L.legLen, L.legThick, C.dark); m.position.y = -L.legLen / 2;
      leg.add(m); g.add(leg); this.legs.push(leg);
    };
    if (L.stance === 'quad') {
      // order: FL, FR, BL, BR
      mk(-bw * 0.36, -bl * 0.375); mk(bw * 0.36, -bl * 0.375); mk(-bw * 0.36, bl * 0.375); mk(bw * 0.36, bl * 0.375);
    } else {
      mk(-bw * 0.4, 0); mk(bw * 0.4, 0);
    }
  }

  update(a: Animal, dt: number): void {
    this.group.position.set(a.position.x, a.position.y, a.position.z);
    this.dead += ((a.state === 'DEAD' ? 1 : 0) - this.dead) * Math.min(1, dt * 4);
    const bank = this.soar ? -0.4 * (1 - this.dead) : 0; // soaring birds lean into the turn
    this.group.rotation.set(0, a.direction, this.dead * (Math.PI / 2) + bank);
    if (a.altitude < 0.3) this.group.position.y += this.dead * this.halfBody * (this.stance === 'bird' || this.stance === 'drone' ? 0.15 : 1);

    if (this.stance === 'bird') { this.updateBird(a, dt); return; }
    if (this.stance === 'drone') { this.updateDrone(a, dt); return; }
    if (this.stance === 'vehicle') { this.updateVehicle(a, dt); return; }

    this.phase += a.speed * dt * 3.6 / (this.legLen + 0.35);
    const s = Math.sin(this.phase) * Math.min(0.7, a.speed * 0.3);
    if (this.stance === 'quad') {
      this.legs[0].rotation.x = s; this.legs[3].rotation.x = s;
      this.legs[1].rotation.x = -s; this.legs[2].rotation.x = -s;
    } else {
      this.legs[0].rotation.x = s; this.legs[1].rotation.x = -s;
    }
    this.setNeck(a, POSE[this.stance], dt);
  }

  private updateDrone(a: Animal, dt: number): void {
    this.t += dt;
    const alive = a.state !== 'DEAD';
    for (const r of this.rotors) r.rotation.y += alive ? dt * 60 : 0;
    // Lean into the flight direction, small hover bob.
    const lean = alive ? -Math.min(0.35, a.speed * 0.025) : 0;
    this.group.rotation.x = lean;
    if (alive && a.altitude > 0.3) this.group.position.y += Math.sin(this.t * 3 + a.id) * 0.05;
  }

  private updateVehicle(a: Animal, dt: number): void {
    this.t += dt;
    for (const w of this.wheels) w.rotation.x += (a.speed * dt) / this.wheelR; // roll
    if (this.turret) {
      const scanning = a.state === 'FORAGING' || a.state === 'IDLE';
      const target = a.state === 'DEAD' ? 0 : scanning ? Math.sin(this.t * 0.8 + a.id) * 0.9 : 0;
      this.turret.rotation.y += (target - this.turret.rotation.y) * Math.min(1, dt * 4);
    }
  }

  private updateBird(a: Animal, dt: number): void {
    const flying = a.altitude > 0.3 && a.state !== 'DEAD';
    let target = -1.2; // folded
    if (flying) {
      if (this.soar) {
        target = 0.12 + 0.05 * Math.sin(this.phase * 0.2); // gliding
        this.phase += dt;
      } else {
        this.phase += dt * 10 / Math.sqrt(this.span);
        target = 0.2 + 0.9 * Math.sin(this.phase);
      }
    }
    this.wingAngle += (target - this.wingAngle) * Math.min(1, dt * (flying && !this.soar ? 30 : 8));
    this.wings[0].rotation.z = -this.wingAngle;
    this.wings[1].rotation.z = this.wingAngle;
    if (this.birdLegs) this.birdLegs.visible = !flying;
    this.setNeck(a, POSE.bird, dt);
  }

  private setNeck(a: Animal, pose: { idle: number; alert: number; forage: number; flee: number }, dt: number): void {
    const target = a.state === 'FORAGING' ? pose.forage : a.state === 'ALERT' ? pose.alert
      : a.state === 'FLEEING' ? pose.flee : pose.idle;
    this.neck.rotation.x += (target - this.neck.rotation.x) * Math.min(1, dt * 6);
  }
}
