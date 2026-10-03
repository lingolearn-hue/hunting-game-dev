import { Game } from './game/Game';
import { scorePhoto } from './game/Scoring';
import { fireShot, fireRocket } from './game/Hunting';
import { gather, tryBuild, removeBuilding } from './game/Gather';
import { KILL_COINS } from './game/Rewards';
import { allTechIds } from './data/tech';
import { ProgressRecord } from './game/Progress';
import { TechTreeView } from './ui/TechTree';
import { ScanApp } from './slam/ScanApp';
import { ObjectScanApp } from './object3d/ObjectScanApp';
import { EquipId } from './game/Game';
import { LEVELS } from './data/environments';
import { LevelDef } from './data/environments/Level';
import { SyntheticRenderer } from './rendering/SyntheticRenderer';
import { ARRenderer } from './rendering/ARRenderer';
import { XRRenderer } from './rendering/XRRenderer';
import { CameraBackground } from './rendering/CameraBackground';
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
const camBg = new CameraBackground();
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function begin(level: LevelDef, rec: ProgressRecord | undefined, cameraOk = true, xrSession: any = null): void {
  const xr = level.renderer === 'xr' && !!xrSession;
  const ar = level.renderer === 'ar' || xr; // camera-based levels: no walking sticks
  const game = new Game(level, rec, naturalist);
  const renderer = xr ? new XRRenderer(xrSession) : level.renderer === 'ar' ? new ARRenderer(camBg) : new SyntheticRenderer();
  device.attach(game.player);
  game.onCalibrate = () => device.calibrate();
  renderer.init(view, game);
  window.addEventListener('resize', () => renderer.resize());

  const moveInput = new MoveInput(game.player);
  const lookInput = new LookInput(game.player);
  attachDesktopInput(view, game);
  attachTouchInput(view, game, () => device.active);

  // Progress (coins, tech, resources, base) is stored per level
  let saveT = 0;
  const save = () => { store.putProgress(game.progress.toRecord()).catch(() => { /* storage unavailable */ }); };
  game.progress.onChange = () => { clearTimeout(saveT); saveT = window.setTimeout(save, 800); };
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

  // Tools come from the tech tree (in WebXR there is no zoom and no camera image: rifle only).
  const hudRoot = document.getElementById('hud')!;
  const hud = new HUD(hudRoot, game, {
    equip: (id) => { if (game.tools().includes(id)) game.equip(id); },
    menu: () => menu.open(),
    crouch: () => { game.player.crouching = !game.player.crouching; },
    trigger: () => act(),
    zoomIn: () => game.stepZoom(1),
    zoomOut: () => game.stepZoom(-1),
    thermal: () => { if (game.thermalAvailable()) game.thermalOn = !game.thermalOn; },
    build: (k) => { game.multitool.buildKind = k; },
  }, { ar, xr });
  game.progress.onCoins = (n, why) => { hud.coin(n, why); audio.coin(); };
  const techTree = new TechTreeView(game, (id) => {
    if (game.progress.buy(id)) { game.applyTech(); audio.coin(); }
  });
  const speeds: Array<[number, string]> = [[1 / 60, 'TIME: NORMAL'], [4 / 60, 'TIME: FAST'], [0, 'TIME: PAUSED']];
  let speedIdx = 0;
  const menu = new Menu([
    { label: 'CALIBRATE', fn: () => game.calibrate() },
    { label: 'PHOTOS / HARVEST', fn: () => { void gallery.open(); } },
    { label: 'FIELD JOURNAL', fn: () => journalView.open() },
    { label: 'TECH TREE', fn: () => techTree.open() },
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
    ...(xr ? [{
      label: 'GROUND = CROSSHAIR',
      fn: () => {
        const y = (renderer as XRRenderer).groundHit();
        if (y === null) { hud.toast('No surface found', 'aim at the floor and try again'); return; }
        game.world.setGround(y);
        hud.toast('Ground set', `${y.toFixed(2)} m`);
      },
    }] : []),
    ...(level.renderer === 'ar' ? [{
      label: `AR FOV: ${camBg.fovLong}°`, keepOpen: true,
      fn: (b: HTMLButtonElement) => {
        camBg.fovLong = camBg.fovLong >= 80 ? 50 : camBg.fovLong + 5; // calibration: match drones to the real view
        b.textContent = `AR FOV: ${camBg.fovLong}°`;
        (renderer as ARRenderer).applyFov();
      },
    }] : []),
    { label: 'FULLSCREEN', fn: toggleFullscreen },
    { label: 'LEVEL SELECT', fn: () => location.reload() },
  ]);
  if (!ar) { // in AR the phone is the view: no walking, and a look stick would break the registration with the camera image
    new Joystick(hudRoot, moveInput.joy, 'left');
    new Joystick(hudRoot, lookInput.joy, 'right');
  } else if (!cameraOk) {
    hud.toast('Camera unavailable', 'allow camera access (HTTPS) to see the real view');
  }

  window.addEventListener('keydown', (e) => {
    const key: Record<string, EquipId> = { Digit1: 'camera', Digit2: 'binoculars', Digit3: 'rifle', Digit4: 'launcher', Digit5: 'torch', Digit6: 'multitool' };
    if (key[e.code]) { if (game.tools().includes(key[e.code])) game.equip(key[e.code]); }
    if (e.code === 'Equal' || e.code === 'NumpadAdd') game.stepZoom(1);
    else if (e.code === 'Minus' || e.code === 'NumpadSubtract') game.stepZoom(-1);
    else if (e.code === 'KeyT' && game.thermalAvailable()) game.thermalOn = !game.thermalOn;
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
      const photographed = game.sim.animals.list.find((a) => a.id === result.animalId);
      if (photographed) game.progress.addCoins(game.progress.photoCoins(photographed.species.id, result.total), `photo of ${photographed.species.name}`);
      journal.recordPhoto(photographed, result.total, level.id);
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
        const k = game.sim.animals.list.find((x) => x.id === o.animalId);
        journal.recordKill(k, level.id);
        if (k) game.progress.addCoins(KILL_COINS, `${k.species.name} down — harvest it with the multitool`);
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
        if (h.killed) { journal.recordKill(a, level.id); game.progress.addCoins(KILL_COINS, `${a.species.name} destroyed`); }
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
    else if (game.current.kind === 'multitool') useMultitool();
  }

  /** Multitool: gather, harvest, build or demolish depending on the selected mode. */
  function useMultitool(): void {
    const mt = game.multitool, now = performance.now();
    if (now < mt.nextStrikeAt) return;
    mt.nextStrikeAt = now + mt.strikeMs;
    const k = mt.buildKind;
    if (k === null) {
      const r = gather(game);
      if (r.kind === 'none') { hud.toast('Nothing in reach', 'aim at a tree, rock or carcass within 4 m'); return; }
      audio.chop(r.kind === 'stone');
      if (r.kind === 'harvest') hud.toast(`${r.animal.species.name} harvested`, `+${r.coins} coins`);
      else hud.toast(`+${r.amount} ${r.kind}`, r.depleted ? (r.kind === 'wood' ? 'tree felled' : 'rock mined out') : '');
    } else if (k === 'remove') {
      const b = removeBuilding(game);
      hud.toast(b ? 'Structure removed' : 'No structure in front', b ? '50% of the materials returned' : '');
    } else {
      const r = tryBuild(game, k);
      if (r.ok) { audio.build(); hud.toast('Built'); } else hud.toast("Can't build", r.reason);
    }
  }

  let edgeShown = false;
  attachTapInput(view, () => { if (game.current.kind === 'camera') act(); });

  let last = performance.now();
  let prevPose: { x: number; z: number } | null = null;
  function frame(now: number): void {
    const dt = Math.min(0.1, Math.max(0.001, (now - last) / 1000));
    last = now;
    if (xr) {
      // WebXR: position and orientation come from the tracking (SLAM)
      const pose = (renderer as XRRenderer).viewerPose();
      if (pose) {
        const p = game.player;
        const inst = prevPose ? Math.hypot(pose.position.x - prevPose.x, pose.position.z - prevPose.z) / dt : 0;
        p.speed += (inst - p.speed) * 0.25;
        prevPose = { x: pose.position.x, z: pose.position.z };
        p.position.x = pose.position.x; p.position.y = pose.position.y; p.position.z = pose.position.z;
        p.deviceQuat = [pose.orientation.x, pose.orientation.y, pose.orientation.z, pose.orientation.w];
        p.crouching = pose.position.y < 1.05; // real crouching
      }
    } else {
      device.update(dt);
    }
    moveInput.update();
    lookInput.update(dt);
    game.update(dt);
    journal.observe(game, dt, renderer.aspect());
    game.lock.update(game, dt, renderer.aspect(), game.current.kind === 'launcher');
    handleBlasts();
    for (const a of game.sim.buildings.drainKills()) game.progress.addCoins(KILL_COINS, `${a.species.name} shot by autocannon`);
    for (const sp of game.sim.drainAttackLog()) {
      audio.maul();
      hud.flash(0.95, 900, '#a00');
      hud.toast(`${sp.name} got you — respawned`, 'predators back off for a while');
    }
    for (const a of game.sim.animals.drainBleedDeaths()) {
      const p = game.player.position, dist = Math.round(Math.hypot(a.position.x - p.x, a.position.z - p.z));
      journal.recordKill(a, level.id);
      game.progress.addCoins(KILL_COINS, `${a.species.name} bled out`);
      store.addHunt({ schema: 1, timestamp: Date.now(), level: level.id, species: a.species.id, zone: 'bleed', distance: dist, damage: 0, killed: true })
        .catch(() => { /* storage unavailable */ });
      hud.toast(`Wounded ${a.species.name} bled out`, `${dist} m away`);
    }
    if (game.sim.atEdge && !edgeShown) hud.toast('Edge of the area');
    edgeShown = game.sim.atEdge;
    audio.playCalls(game.sim.animals.drainEvents(), game);
    audio.update(dt, game);
    renderer.render(game);
    hud.update(dt, xr || device.active);
    if (!xr) requestAnimationFrame(frame);
  }
  if (xr) (renderer as XRRenderer).runLoop(frame);
  else requestAnimationFrame(frame);
}

/** WebXR AR session (Android Chrome with ARCore). Must be requested inside a user gesture. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function requestXrSession(): Promise<any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const xr = (navigator as any).xr;
  if (!xr) return null;
  try {
    return await xr.requestSession('immersive-ar', {
      requiredFeatures: ['local-floor', 'dom-overlay'],
      optionalFeatures: ['hit-test'],
      domOverlay: { root: document.getElementById('ui') },
    });
  } catch {
    return null;
  }
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
  const card = document.createElement('div'); card.className = 'levelCard';
  const b = document.createElement('button');
  b.textContent = level.name;
  const sm = document.createElement('small'); sm.textContent = level.description;
  b.append(sm);
  // Per-level progress: coins, tech, with RESET and UNLOCK ALL
  const tools = document.createElement('div'); tools.className = 'levelTools';
  const stat = document.createElement('span');
  const ids = allTechIds(level);
  const refresh = async () => {
    const rec = await store.getProgress(level.id).catch(() => undefined);
    const n = rec ? rec.unlocked.filter((id) => ids.includes(id)).length : 0;
    stat.textContent = `${rec?.coins ?? 0} coins · tech ${n}/${ids.length}`;
  };
  void refresh();
  const reset = document.createElement('button'); reset.textContent = 'RESET';
  reset.onclick = async () => {
    if (!confirm(`Reset all progress of "${level.name}"? Coins, unlocked tech, resources and buildings are deleted.`)) return;
    await store.deleteProgress(level.id).catch(() => { /* storage unavailable */ });
    void refresh();
  };
  const unlock = document.createElement('button'); unlock.textContent = 'UNLOCK ALL';
  unlock.onclick = async () => {
    const rec = (await store.getProgress(level.id).catch(() => undefined)) ?? { level: level.id, coins: 0, unlocked: [], wood: 0, stone: 0, buildings: [], removedProps: [], nextBuildingId: 1 };
    rec.unlocked = [...new Set([...rec.unlocked, ...ids])];
    await store.putProgress(rec).catch(() => { /* storage unavailable */ });
    void refresh();
  };
  tools.append(stat, reset, unlock);
  card.append(b, tools);
  b.addEventListener('click', async () => {
    // Sensor permission and audio unlock must run directly inside this click handler (iOS).
    audio.unlock();
    const xrP = level.renderer === 'xr' ? requestXrSession() : null; // the XR session must start inside the click
    const camP = level.renderer === 'ar' ? camBg.start() : null; // camera permission must also start inside the click
    const ok = xrP ? false : await device.start(); // XR tracking replaces the phone sensors
    const camOk = camP ? await camP : true;
    const xrSession = xrP ? await xrP : null;
    if (xrP && !xrSession) {
      msg.textContent = 'WebXR AR could not start. It needs Android Chrome with ARCore (HTTPS) and camera permission.';
      return;
    }
    if (!ok && !xrSession) msg.textContent = 'No motion sensor access. Using mouse/touch look.';
    const rec = await store.getProgress(level.id).catch(() => undefined);
    start.remove();
    begin(level, rec, camOk, xrSession);
    if (ok) toggleFullscreen();
  });
  levelsEl.append(card);
  if (level.renderer === 'xr') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const xr = (navigator as any).xr;
    const note = (t: string) => { sm.textContent = `${level.description} (${t})`; };
    if (!xr) { b.disabled = true; b.style.opacity = '0.5'; note('not supported on this device'); }
    else xr.isSessionSupported('immersive-ar').then((supported: boolean) => {
      if (!supported) { b.disabled = true; b.style.opacity = '0.5'; note('needs Android Chrome with ARCore'); }
    }).catch(() => { /* leave enabled */ });
  }
}

// 3D scan prototype (works with any phone camera, including iPhone Safari): optical flow + phone orientation -> sparse 3D map.
{
  const b = document.createElement('button');
  b.textContent = '3D Scan (beta)';
  const sm = document.createElement('small'); sm.textContent = 'Builds a sparse 3D map from the camera image and the phone orientation. No WebXR needed.';
  b.append(sm);
  b.addEventListener('click', async () => {
    const camP = camBg.start(); // permissions must start inside the click
    const ok = await device.start();
    const camOk = await camP;
    if (!camOk) { msg.textContent = 'Camera unavailable: allow camera access (HTTPS).'; return; }
    if (!ok) { msg.textContent = 'No motion sensor access: the scan needs the phone orientation.'; return; }
    start.remove();
    new ScanApp(camBg, device, view, document.getElementById('hud')!).start();
  });
  const card = document.createElement('div'); card.className = 'levelCard'; card.append(b);
  levelsEl.append(card);
}

// Object scan: ArUco marker sheet + camera -> 3D model of a single object (no motion sensors needed)
{
  const b = document.createElement('button');
  b.textContent = 'Object Scan (markers)';
  const sm = document.createElement('small'); sm.textContent = 'Print the marker sheet, put an object on it and walk around it: builds a 3D model in millimetres.';
  b.append(sm);
  b.addEventListener('click', async () => {
    const camOk = await camBg.start();
    if (!camOk) { msg.textContent = 'Camera unavailable: allow camera access (HTTPS).'; return; }
    start.remove();
    new ObjectScanApp(camBg, view, document.getElementById('hud')!).start();
  });
  const card = document.createElement('div'); card.className = 'levelCard'; card.append(b);
  levelsEl.append(card);
}

// Offline support (production builds only).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => { /* ignore */ }); });
}
