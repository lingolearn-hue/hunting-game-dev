import { Game } from './game/Game';
import { SyntheticRenderer } from './rendering/SyntheticRenderer';
import { DeviceOrientation } from './input/DeviceOrientation';
import { attachDesktopInput } from './input/DesktopInput';
import { attachTouchInput } from './input/TouchInput';
import { HUD } from './ui/HUD';

const game = new Game();
const renderer = new SyntheticRenderer();
const device = new DeviceOrientation(game.player);
game.onCalibrate = () => device.calibrate();

const view = document.getElementById('view')!;
renderer.init(view, game);
window.addEventListener('resize', () => renderer.resize());

attachDesktopInput(view, game);
attachTouchInput(view, game, () => device.active);

const toggleFullscreen = () => {
  try {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  } catch { /* unsupported (e.g. iOS Safari) */ }
};
const hud = new HUD(document.getElementById('hud')!, game, { calibrate: () => game.calibrate(), fullscreen: toggleFullscreen });

const start = document.getElementById('start')!;
const msg = document.getElementById('startMsg')!;
document.getElementById('startBtn')!.addEventListener('click', async () => {
  // Permission request must run directly inside this click handler (iOS).
  const ok = await device.start();
  if (!ok) msg.textContent = 'No motion sensor access. Using mouse/touch look.';
  start.remove();
  if (ok) toggleFullscreen();
});

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  device.update(dt);
  game.update(dt);
  renderer.render(game);
  hud.update(dt, device.active);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
