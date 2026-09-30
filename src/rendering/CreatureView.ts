import * as THREE from 'three';
import { Animal } from '../game/Animal';

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
};

/** Low-poly creature built from primitives, driven by the species LookDef. Model faces -Z. */
export class CreatureView {
  readonly group = new THREE.Group();
  private neck = new THREE.Group();
  private legs: THREE.Group[] = [];
  private phase = Math.random() * 6.28;
  private stance: 'quad' | 'biped';
  private legLen: number;
  private dead = 0;
  private halfBody: number;

  constructor(animal: Animal) {
    const L = animal.species.look, C = L.colors, g = this.group;
    this.stance = L.stance;
    this.legLen = L.legLen;
    this.halfBody = L.body[0] / 2;
    this.group.rotation.order = 'YXZ';
    const [bw, bh, bl] = L.body, [hw, hh, hl] = L.head;
    const bodyCY = L.legLen + bh * 0.3;

    const body = box(bw, bh, bl, C.body); body.position.y = bodyCY; g.add(body);

    if (L.tail === 'tuft') {
      const t = box(0.12, 0.16, 0.08, C.accent); t.position.set(0, bodyCY + bh * 0.25, bl / 2 + 0.02); g.add(t);
    } else if (L.tail === 'long') {
      const len = L.tailLen ?? bl * 0.6;
      const t = cone(bw * 0.3, len, C.body, Math.PI / 2); // tip toward +Z
      t.position.set(0, bodyCY + bh * 0.1, bl / 2 + len / 2 - 0.1); g.add(t);
    }

    // Neck + head
    this.neck.position.set(0, bodyCY + bh * 0.35, -bl / 2 + 0.05);
    const nt = Math.max(0.12, bw * 0.3);
    const neckMesh = box(nt, L.neckLen, nt, C.body); neckMesh.position.y = L.neckLen / 2;
    const headY = L.neckLen + hh * 0.3;
    const head = box(hw, hh, hl, C.body); head.position.set(0, headY, -hl * 0.3);
    const nose = box(hw * 0.5, hh * 0.45, hl * 0.2, C.dark); nose.position.set(0, L.neckLen + hh * 0.2, -hl * 0.8);
    this.neck.add(neckMesh, head, nose);

    if (L.feature === 'antlers') {
      for (const sx of [-1, 1]) {
        const ear = box(0.05, 0.14, 0.05, C.dark); ear.position.set(sx * 0.11, headY + 0.12, -0.02);
        this.neck.add(ear);
        if (animal.sex === 'M') {
          const a = box(0.03, 0.35, 0.03, C.horn); a.position.set(sx * 0.07, headY + 0.29, -0.05); a.rotation.z = -sx * 0.35;
          this.neck.add(a);
        }
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
    // Death: roll onto the side.
    this.dead += ((a.state === 'DEAD' ? 1 : 0) - this.dead) * Math.min(1, dt * 4);
    this.group.rotation.set(0, a.direction, this.dead * (Math.PI / 2));
    this.group.position.y += this.dead * this.halfBody;

    this.phase += a.speed * dt * 3.6 / (this.legLen + 0.35);
    const s = Math.sin(this.phase) * Math.min(0.7, a.speed * 0.3);
    if (this.stance === 'quad') {
      this.legs[0].rotation.x = s; this.legs[3].rotation.x = s;
      this.legs[1].rotation.x = -s; this.legs[2].rotation.x = -s;
    } else {
      this.legs[0].rotation.x = s; this.legs[1].rotation.x = -s;
    }

    const pose = POSE[this.stance];
    const target = a.state === 'FORAGING' ? pose.forage : a.state === 'ALERT' ? pose.alert
      : a.state === 'FLEEING' ? pose.flee : pose.idle;
    this.neck.rotation.x += (target - this.neck.rotation.x) * Math.min(1, dt * 6);
  }
}
