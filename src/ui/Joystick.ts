/** Virtual joystick. Writes x (right) and y (forward) in [-1,1] to `out`. */
export class Joystick {
  constructor(root: HTMLElement, out: { x: number; y: number }) {
    const base = document.createElement('div'); base.className = 'joy';
    const knob = document.createElement('div'); knob.className = 'knob';
    base.append(knob);
    root.append(base);

    const R = 40;
    let id = -1;
    const set = (e: PointerEvent) => {
      const r = base.getBoundingClientRect();
      let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy), k = d > R ? R / d : 1;
      dx *= k; dy *= k;
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const mag = Math.hypot(dx, dy) / R;
      if (mag < 0.15) { out.x = 0; out.y = 0; } else { out.x = dx / R; out.y = -dy / R; }
    };
    const reset = () => { id = -1; knob.style.transform = ''; out.x = 0; out.y = 0; };

    base.addEventListener('pointerdown', (e) => { id = e.pointerId; base.setPointerCapture(id); set(e); e.preventDefault(); });
    base.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e); });
    base.addEventListener('pointerup', (e) => { if (e.pointerId === id) reset(); });
    base.addEventListener('pointercancel', (e) => { if (e.pointerId === id) reset(); });
  }
}
