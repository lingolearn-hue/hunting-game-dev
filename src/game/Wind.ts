/** Slowly varying wind. (x, z) is the unit direction the wind blows TOWARD; scent is carried that way. */
export class Wind {
  x = 1; z = 0;
  speed = 3;
  private angle0: number;

  constructor(seed: number, private base = 3) {
    this.angle0 = (seed * 2.399) % (Math.PI * 2);
    this.update(0);
  }

  update(t: number): void {
    const a = this.angle0 + 0.9 * Math.sin(t * 0.006) + 0.35 * Math.sin(t * 0.021 + 1.3);
    this.x = Math.cos(a); this.z = Math.sin(a);
    this.speed = Math.max(0.3, this.base * (0.75 + 0.35 * Math.sin(t * 0.013 + 0.7) + 0.15 * Math.sin(t * 0.05)));
  }
}
