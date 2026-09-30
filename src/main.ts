import { Game } from './game/Game';
import { scorePhoto } from './game/Scoring';
import { LEVELS } from './data/environments';
import { LevelDef } from './data/environments/Level';
import { SyntheticRenderer } from './rendering/SyntheticRenderer';
import { DeviceOrientation } from './input/DeviceOrientation';
import { attachDesktopInput } from './input/DesktopInput';
import { attachTouchInput } from './input/TouchInput';
import { attachTapInput } from './input/TapInput';
import { MoveInput } from './input/MoveInput';
import { HUD } from './ui/HUD';
import { Joystick } from './ui/Joystick';
import { Gallery } from './ui/Gallery';
import { PhotoStore, PhotoRecord, RECORD_SCHEMA } from './storage/PhotoStore';

const device = new DeviceOrientation();
const store = new PhotoStore();
const gallery = new Gallery(store);
const view = document.getElementById('view')!;
const start = document.getElementById('start')!;
const msg = document.getElementById('startMsg')!;

const toggleFullscreen = () => {
  try {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  } catch { /* unsupported (e.g. iOS Safari) */ }
};

function begin(level: LevelDef): void {
  const game = new Game(level);
  const renderer = new SyntheticRenderer();
  device.attach(game.player);
  game.onCalibrate = () => device.calibrate();
  renderer.init(view, game);
  window.addEventListener('resize', () => renderer.resize());

  const moveInput = new MoveInput(game.player);
  attachDesktopInput(view, game);
  attachTouchInput(view, game, () => device.active);

  const hudRoot = document.getElementById('hud')!;
  const hud = new HUD(hudRoot, game, {
    calibrate: () => game.calibrate(),
    gallery: () => { void gallery.open(); },
    fullscreen: toggleFullscreen,
    crouch: () => { game.player.crouching = !game.player.crouching; },
    level: () => location.reload(),
  });
  new Joystick(hudRoot, moveInput.joy);

  let busy = false;
  let lastShot = 0;
  async function shoot(): Promise<void> {
    const now = performance.now();
    if (busy || now - lastShot < game.camera.shutterCooldownMs) return;
    busy = true; lastShot = now;
    try {
      // Score and capture the same instant.
      const result = scorePhoto(game, renderer.aspect());
      const blob = await renderer.capture(game);
      hud.flash();
      if (!blob) { hud.toast('Capture failed'); return; }
      const p = game.player;
      const rec: PhotoRecord = {
        schema: RECORD_SCHEMA,
        timestamp: Date.now(),
        level: level.id,
        position: { ...p.position },
        species: result.species,
        animalId: result.animalId,
        distance: result.distance,
        equipment: game.camera.name,
        zoom: Math.round(p.zoom * 10) / 10,
        weather: 'clear',
        timeOfDay: game.sim.timeOfDay,
        score: result.total,
        breakdown: result.breakdown,
      };
      const b = result.breakdown;
      const sub = b
        ? `size ${b.size} · frame ${b.framing} · comp ${b.composition} · vis ${b.visibility} · pose ${b.posture} · calm ${b.awareness} · light ${b.lighting} · q x${b.quality}`
        : '';
      const title = result.species ? `${result.speciesName} · ${result.distance} m · ${result.total}/100` : 'No animal in frame';
      try {
        await store.add(rec, blob);
        hud.toast(title, sub);
      } catch {
        hud.toast(title, 'not saved (storage unavailable)');
      }
    } finally {
      busy = false;
    }
  }
  attachTapInput(view, () => { void shoot(); });

  let last = performance.now();
  function frame(now: number): void {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    device.update(dt);
    moveInput.update();
    game.update(dt);
    renderer.render(game);
    hud.update(dt, device.active);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// Start screen: one button per level.
const levelsEl = document.getElementById('levels')!;
for (const level of Object.values(LEVELS)) {
  const b = document.createElement('button');
  b.textContent = level.name;
  const sm = document.createElement('small'); sm.textContent = level.description;
  b.append(sm);
  b.addEventListener('click', async () => {
    // Permission request must run directly inside this click handler (iOS).
    const ok = await device.start();
    if (!ok) msg.textContent = 'No motion sensor access. Using mouse/touch look.';
    start.remove();
    begin(level);
    if (ok) toggleFullscreen();
  });
  levelsEl.append(b);
}
