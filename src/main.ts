import { Game } from './game/Game';
import { scorePhoto } from './game/Scoring';
import { fireShot, fireRocket } from './game/Hunting';
import { EquipId } from './game/Game';
import { LEVELS } from './data/environments';
import { LevelDef } from './data/environments/Level';
import { SyntheticRenderer } from './rendering/SyntheticRenderer';
import { DeviceOrientation } from './input/DeviceOrientation';
import { attachDesktopInput } from './input/DesktopInput';
import { attachTouchInput } from './input/TouchInput';
import { attachTapInput } from './input/TapInput';
import { MoveInput } from './input/MoveInput';
import { LookInput } from './input/LookInput';
import { HUD } from './ui/HUD';
import { Joystick } from './ui/Joystick';
import { Gallery } from './ui/Gallery';
import { Menu } from './ui/Menu';
import { JournalView } from './ui/Journal';
import { AudioEngine } from './audio/Audio';
import { FieldJournal } from './game/Journal';
import { SPECIES } from './data/species';
import { PhotoStore, PhotoRecord, RECORD_SCHEMA } from './storage/PhotoStore';

const device = new DeviceOrientation();
const store = new PhotoStore();
const gallery = new Gallery(store);
const audio = new AudioEngine();
const journal = new FieldJournal();
const journalView = new JournalView(journal);
store.listJournal().then((l) => journal.load(l)).catch(() => { /* storage unavailable */ });
let naturalist = localStorage.getItem('hg_mode') === 'naturalist';
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
  const lookInput = new LookInput(game.player);
  attachDesktopInput(view, game);
  attachTouchInput(view, game, () => device.active);

  // Equipment available in this mode and level
  const equipList: EquipId[] = ['binoculars', 'camera', ...(naturalist ? [] : ['rifle' as EquipId, ...((level.extraEquipment ?? []) as EquipId[])])];
  const hudRoot = document.getElementById('hud')!;
  const zoomBy = (k: number) => game.player.setZoom(game.player.zoom * k);
  const hud = new HUD(hudRoot, game, {
    equip: (id) => { if (equipList.includes(id)) game.equip(id); },
    menu: () => menu.open(),
    crouch: () => { game.player.crouching = !game.player.crouching; },
    trigger: () => act(),
    zoomIn: () => zoomBy(1.25),
    zoomOut: () => zoomBy(1 / 1.25),
  }, { equipment: equipList });
  const speeds: Array<[number, string]> = [[1 / 60, 'TIME: NORMAL'], [4 / 60, 'TIME: FAST'], [0, 'TIME: PAUSED']];
  let speedIdx = 0;
  const menu = new Menu([
    { label: 'CALIBRATE', fn: () => game.calibrate() },
    { label: 'PHOTOS / HARVEST', fn: () => { void gallery.open(); } },
    { label: 'FIELD JOURNAL', fn: () => journalView.open() },
    {
      label: speeds[0][1], keepOpen: true,
      fn: (b) => { speedIdx = (speedIdx + 1) % speeds.length; game.sim.timeScale = speeds[speedIdx][0]; b.textContent = speeds[speedIdx][1]; },
    },
    {
      label: 'SOUND: ON', keepOpen: true,
      fn: (b) => { audio.setEnabled(!audio.enabled); b.textContent = audio.enabled ? 'SOUND: ON' : 'SOUND: OFF'; },
    },
    {
      label: 'PREDATORS: ON', keepOpen: true,
      fn: (b) => { game.player.safe = !game.player.safe; b.textContent = game.player.safe ? 'PREDATORS: OFF' : 'PREDATORS: ON'; },
    },
    { label: 'FULLSCREEN', fn: toggleFullscreen },
    { label: 'LEVEL SELECT', fn: () => location.reload() },
  ]);
  new Joystick(hudRoot, moveInput.joy, 'left');
  new Joystick(hudRoot, lookInput.joy, 'right');

  window.addEventListener('keydown', (e) => {
    const key: Record<string, EquipId> = { Digit1: 'binoculars', Digit2: 'camera', Digit3: 'rifle', Digit4: 'launcher' };
    if (key[e.code]) { if (equipList.includes(key[e.code])) game.equip(key[e.code]); }
    if (e.code === 'Equal' || e.code === 'NumpadAdd') zoomBy(1.25);
    else if (e.code === 'Minus' || e.code === 'NumpadSubtract') zoomBy(1 / 1.25);
  });

  let pendingDiscovery = false;
  journal.onDiscover = (e, rarity) => {
    const sp = SPECIES[e.species];
    if (busy) { pendingDiscovery = true; return; } // folded into the photo/shot message
    hud.toast(`New species: ${sp.name}${rarity >= 4 ? ' — rare!' : ''}`, 'Added to the field journal');
  };
  journal.onChange = (e) => { store.putJournal(e).catch(() => { /* storage unavailable */ }); };
  const discoverNote = () => { const n = pendingDiscovery ? ' · new species logged' : ''; pendingDiscovery = false; return n; };

  let busy = false;
  let lastShot = 0;
  async function photograph(): Promise<void> {
    const now = performance.now();
    if (busy || now - lastShot < game.camera.shutterCooldownMs) return;
    busy = true; lastShot = now;
    try {
      // Score and capture the same instant.
      const result = scorePhoto(game, renderer.aspect());
      const blob = await renderer.capture(game);
      audio.shutter();
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
      journal.recordPhoto(game.sim.animals.list.find((a) => a.id === result.animalId), result.total, level.id);
      const title = (result.species ? `${result.speciesName} · ${result.distance} m · ${result.total}/100` : 'No animal in frame') + discoverNote();
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

  function fire(): void {
    const now = performance.now();
    const w = game.rifle;
    w.tick(now);
    if (!w.canFire(now)) { hud.toast(w.reloading ? 'Reloading…' : 'Cycling bolt…'); return; }
    w.consume(now);
    audio.shot(); audio.bolt();
    const o = fireShot(game);
    hud.flash(0.5, 120);
    if (o.hit) {
      const zone = o.zone!;
      if (o.killed) { // fold a discovery into this message
        const prev = busy; busy = true;
        journal.recordKill(game.sim.animals.list.find((x) => x.id === o.animalId), level.id);
        busy = prev;
      }
      const title = (o.killed ? `${o.speciesName} harvested` : `${o.speciesName} hit — wounded`) + discoverNote();
      hud.toast(title, `${zone} · ${o.distance} m · ${o.damage} dmg`);
      store.addHunt({
        schema: 1, timestamp: Date.now(), level: level.id, species: o.species!, zone,
        distance: o.distance, damage: o.damage, killed: o.killed,
      }).catch(() => { /* storage unavailable */ });
    } else {
      hud.toast(o.blocked ? 'Blocked by obstacle' : o.near ? `Miss — ${o.near.name}: ${o.near.meters} m ${o.near.where}` : 'Miss');
    }
  }

  // Trigger button = action of the equipped item. Tapping the view only takes photos (no accidental shots).
  function launchRocket(): void {
    const now = performance.now();
    const L = game.launcher;
    L.tick(now);
    if (!L.canFire(now)) { hud.toast(L.reloading ? 'Reloading…' : 'Loading next rocket…'); return; }
    L.consume(now);
    const tgt = fireRocket(game);
    audio.launch();
    hud.flash(0.4, 120);
    hud.toast(tgt ? `Rocket away — tracking ${tgt.species.name}` : 'Rocket away (unguided)');
  }

  /** Rocket detonations: sound, flash, kills and results. */
  function handleBlasts(): void {
    for (const b of game.sim.rockets.drainResults()) {
      audio.blast(b.x, b.z, game);
      const p = game.player.position;
      if (Math.hypot(b.x - p.x, b.z - p.z) < 40) hud.flash(0.5, 200);
      for (const h of b.hits) {
        const a = h.animal;
        if (h.killed) journal.recordKill(a, level.id);
        store.addHunt({
          schema: 1, timestamp: Date.now(), level: level.id, species: a.species.id, zone: 'blast',
          distance: Math.round(Math.hypot(a.position.x - p.x, a.position.z - p.z)), damage: h.damage, killed: h.killed,
        }).catch(() => { /* storage unavailable */ });
      }
      const kills = b.hits.filter((h) => h.killed);
      if (kills.length) hud.toast(kills.map((h) => h.animal.species.name).join(', ') + (kills.length > 1 ? ' destroyed' : ' destroyed'), `${b.hits.length} hit`);
      else if (b.hits.length) hud.toast('Hit — target damaged', b.hits.map((h) => `${h.animal.species.name} ${h.damage}`).join(' · '));
    }
  }

  function act(): void {
    if (game.current.kind === 'camera') void photograph();
    else if (game.current.kind === 'weapon') fire();
    else if (game.current.kind === 'launcher') launchRocket();
  }

  let edgeShown = false;
  attachTapInput(view, () => { if (game.current.kind === 'camera') act(); });

  let last = performance.now();
  function frame(now: number): void {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    device.update(dt);
    moveInput.update();
    lookInput.update(dt);
    game.update(dt);
    journal.observe(game, dt, renderer.aspect());
    game.lock.update(game, dt, renderer.aspect(), game.current.kind === 'launcher');
    handleBlasts();
    for (const sp of game.sim.drainAttackLog()) {
      audio.maul();
      hud.flash(0.95, 900, '#a00');
      hud.toast(`${sp.name} got you — respawned`, 'predators back off for a while');
    }
    for (const a of game.sim.animals.drainBleedDeaths()) {
      const p = game.player.position, dist = Math.round(Math.hypot(a.position.x - p.x, a.position.z - p.z));
      journal.recordKill(a, level.id);
      store.addHunt({ schema: 1, timestamp: Date.now(), level: level.id, species: a.species.id, zone: 'bleed', distance: dist, damage: 0, killed: true })
        .catch(() => { /* storage unavailable */ });
      hud.toast(`Wounded ${a.species.name} bled out`, `${dist} m away`);
    }
    if (game.sim.atEdge && !edgeShown) hud.toast('Edge of the area');
    edgeShown = game.sim.atEdge;
    audio.playCalls(game.sim.animals.drainEvents(), game);
    audio.update(dt, game);
    renderer.render(game);
    hud.update(dt, device.active);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// Start screen: mode toggle and one button per level.
const modeBtn = document.getElementById('modeBtn')!;
const modeLabel = () => { modeBtn.textContent = naturalist ? 'Mode: Naturalist (no hunting)' : 'Mode: Hunting'; };
modeLabel();
modeBtn.addEventListener('click', () => {
  naturalist = !naturalist;
  localStorage.setItem('hg_mode', naturalist ? 'naturalist' : 'hunting');
  modeLabel();
});

// One button per level.
const levelsEl = document.getElementById('levels')!;
for (const level of Object.values(LEVELS)) {
  const b = document.createElement('button');
  b.textContent = level.name;
  const sm = document.createElement('small'); sm.textContent = level.description;
  b.append(sm);
  b.addEventListener('click', async () => {
    // Sensor permission and audio unlock must run directly inside this click handler (iOS).
    audio.unlock();
    const ok = await device.start();
    if (!ok) msg.textContent = 'No motion sensor access. Using mouse/touch look.';
    start.remove();
    begin(level);
    if (ok) toggleFullscreen();
  });
  levelsEl.append(b);
}

// Offline support (production builds only).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => { /* ignore */ }); });
}
