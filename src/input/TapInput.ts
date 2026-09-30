/** Tap (or click / Space) triggers the action. Drags and multi-touch are ignored. */
export function attachTapInput(el: HTMLElement, onTap: () => void): void {
  const active = new Set<number>();
  let start: { id: number; x: number; y: number; t: number } | null = null;
  let cancelled = false;

  el.addEventListener('pointerdown', (e) => {
    active.add(e.pointerId);
    if (active.size === 1) {
      start = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
      cancelled = false;
    } else {
      cancelled = true;
    }
  });
  window.addEventListener('pointerup', (e) => {
    active.delete(e.pointerId);
    if (start && e.pointerId === start.id) {
      const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      if (!cancelled && moved < 10 && performance.now() - start.t < 400) onTap();
      start = null;
    }
  });
  window.addEventListener('pointercancel', (e) => { active.delete(e.pointerId); cancelled = true; });
  window.addEventListener('keydown', (e) => { if (e.code === 'Space' && !e.repeat) { e.preventDefault(); onTap(); } });
}
