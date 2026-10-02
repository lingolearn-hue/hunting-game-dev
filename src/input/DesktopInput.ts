import { Game } from '../game/Game';

/** Mouse drag = look, wheel = zoom, R = recalibrate. */
export function attachDesktopInput(el: HTMLElement, game: Game): void {
  let dragging = false;
  el.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') dragging = true; });
  window.addEventListener('pointerup', () => { dragging = false; });
  window.addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerType !== 'mouse') return;
    const k = 0.004 / game.player.zoom;
    game.player.addLook(-e.movementX * k, -e.movementY * k);
  });
  let lastWheel = 0;
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    const now = performance.now();
    if (now - lastWheel < 150) return; // one zoom step per wheel notch
    lastWheel = now;
    game.stepZoom(e.deltaY < 0 ? 1 : -1);
  }, { passive: false });
  window.addEventListener('keydown', (e) => { if (e.key === 'r' || e.key === 'R') game.calibrate(); });
}
