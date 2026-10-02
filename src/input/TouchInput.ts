import { Game } from '../game/Game';

/** Pinch = zoom. One-finger swipe = look (fallback, only without phone sensors). */
export function attachTouchInput(el: HTMLElement, game: Game, sensorActive: () => boolean): void {
  const pts = new Map<number, { x: number; y: number }>();
  let pinchDist = 0;
  let pinchAcc = 1; // zoom steps: spreading fingers 25% steps up, pinching steps down

  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) { pinchDist = dist(); pinchAcc = 1; }
  });
  const end = (e: PointerEvent) => { pts.delete(e.pointerId); };
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);

  window.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId);
    if (!p || e.pointerType !== 'touch') return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pts.size === 2) {
      const d = dist();
      if (pinchDist > 0) {
        pinchAcc *= d / pinchDist;
        if (pinchAcc > 1.25) { game.stepZoom(1); pinchAcc = 1; }
        else if (pinchAcc < 0.8) { game.stepZoom(-1); pinchAcc = 1; }
      }
      pinchDist = d;
    } else if (pts.size === 1 && !sensorActive()) {
      const k = 0.005 / game.player.zoom;
      game.player.addLook(-dx * k, -dy * k);
    }
  });

  function dist(): number {
    const [a, b] = [...pts.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
}
