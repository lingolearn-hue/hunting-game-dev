# Phone Hunting & Wildlife Simulation — Specification

Status: v08
Platform: Mobile Web / PWA
Language: TypeScript (strict)
Build: Vite
Initial renderer: Synthetic 3D
Future renderer: Optional AR

## 1. Concept

A mobile hunting and wildlife simulation where the phone acts as a physical viewport into a virtual 3D world.

The player physically rotates the phone to look around.

The same simulation supports:
- Wildlife photography
- Hunting simulation
- Wildlife observation / naturalist mode

The initial version uses a completely synthetic environment.
AR is a future rendering mode.

## 2. Architecture

                    GAME SIMULATION
                          |
          +---------------+----------------+
          |               |                |
        World           Animals          Player
          |               |                |
          +---------------+----------------+
                          |
                      Equipment
                          |
             +------------+------------+
             |            |            |
           Camera      Binoculars    Weapon
             |            |            |
             +------------+------------+
                          |
                      Rendering
                    +-----+-----+
                    |           |
                Synthetic       AR

The simulation must not depend directly on Three.js or the phone camera.

## 3. Technology

Core:
- TypeScript (strict)
- Vite
- HTML
- CSS
- WebGL
- Three.js

Browser APIs:
- DeviceOrientation API
- DeviceMotion API
- Fullscreen API
- IndexedDB
- MediaDevices / camera API for future AR mode

Deployment:
- HTTPS required (sensor and camera APIs)
- Static hosting
- GitHub Pages compatible
- PWA
- Offline-capable

## 4. Game Modes

### 4.1 Wildlife Photography

Objective: find and photograph animals.

Gameplay:
1. Explore.
2. Locate animals.
3. Use binoculars or naked-eye view.
4. Equip camera.
5. Aim and compose.
6. Take photograph.
7. Evaluate photograph.

Possible scoring factors:
- Species
- Distance
- Visibility
- Animal posture
- Composition
- Lighting
- Rarity
- Animal awareness
- Background

### 4.2 Hunting Simulation

Objective: locate, approach, identify and simulate hunting animals.

Possible mechanics:
- Tracking
- Animal behavior
- Wind
- Distance estimation
- Equipment selection
- Aiming
- Hit detection
- Animal response
- Scoring / harvest information

Initial implementation should use simplified game mechanics rather than detailed weapon simulation.

### 4.3 Naturalist Mode

Optional non-hunting mode.

Objectives:
- Discover species
- Observe behavior
- Photograph animals
- Maintain field journal
- Discover rare species

## 5. Player Controls

### Phone

The phone orientation determines viewing direction.

Phone movement
      |
Device sensors
      |
Orientation
      |
Virtual camera
      |
3D viewport

Expected behavior:
- Rotate left -> look left
- Rotate right -> look right
- Tilt up -> look up
- Tilt down -> look down

A calibration function is required.

Sensor handling:
- iOS requires `DeviceOrientationEvent.requestPermission()` from a user gesture. A start screen is mandatory.
- Orientation is handled as quaternions (no Euler angles at runtime), compensated for screen rotation.
- iOS alpha is relative, Android may be absolute. Heading is normalised by calibration (auto-calibrate on start, recalibrate button).
- Smoothing via slerp. Strength scales with zoom (more smoothing at high zoom).
- Rotation drift is handled by sensor fusion plus recalibration. No camera-based correction.

### Touch

- Tap -> interaction / photograph / equipment action
- Pinch -> zoom
- Swipe -> optional fallback camera control
- Buttons -> equipment selection
- UI -> map, inventory, journal, settings

### Desktop

- Mouse -> look
- WASD -> movement
- Mouse click -> equipment action
- Number keys -> equipment selection

## 6. Player Movement

### MVP

Player remains stationary.

Phone orientation controls viewing direction.

### Implemented (project v05)

- Walking: virtual joystick (touch) or WASD/arrows (desktop). Movement is relative to the view heading.
- Crouching: toggle button or C key. Lower eye height (0.9 m vs 1.7 m), slower (0.9 vs 1.8 m/s), stealthier.
- Collision: world edge, deep water, tree trunks and rocks (sliding). Bushes are passable.
- Detection: moving is noticed more, crouching less (stationary x0.6, moving x1.6 vs x2.5 standing).

### Later

Possible movement systems:
- Virtual joystick
- Touch buttons
- Step detection via DeviceMotion (no accelerometer double integration, it drifts within seconds)
- WebXR 6DoF tracking (Android Chrome only)
- Optional printed-marker (ArUco/AprilTag) recalibration
- Hybrid predefined paths

## 7. World

Initial environment:
- Forest
- Clearing
- Water source
- Hills
- Trees
- Bushes
- Rocks
- Grass
- Paths

The initial world should prioritize gameplay and performance over graphical realism.

World state:
- Player position
- Player orientation
- Terrain
- Objects
- Animals
- Time
- Weather

## 8. Time

The world should have simulated time.

Variables:
- Time of day
- Sunrise
- Daylight
- Sunset
- Night
- Season

Animal activity can depend on time.

## 9. Weather

Later feature.

Possible states:
- Clear
- Cloudy
- Rain
- Fog
- Wind

Weather can affect visibility and animal behavior.

## 10. Animals

Animals are simulation entities.

Each animal contains:

{
  id,
  species,
  position,
  direction,
  speed,
  age,
  sex,
  health,
  awareness,
  state,
  activitySchedule,
  habitat
}

Initial behavior states:

IDLE
  |
FORAGING
  |
MOVING
  |
ALERT
  |
FLEEING

Possible future states:
- Resting
- Drinking
- Socializing
- Fighting
- Following
- Territorial behavior

## 11. Animal Detection

Animals can detect the player based on:
- Distance
- Visibility
- Player movement
- Noise
- Wind
- Player posture
- Animal awareness

The first version should use simple rules rather than complex AI.

## 12. Equipment

Equipment is modular and independent from the simulation.

### Camera

Parameters:
- Field of view
- Optical zoom
- Digital zoom
- Focus distance
- Image quality
- Shutter action

### Binoculars

Parameters:
- Magnification
- Field of view
- Stability
- Visibility/range

### Hunting Equipment

Abstract game parameters:
- Range
- Accuracy
- Aim stability
- Effective range
- Action time

The first prototype should use a simplified hit model.

## 13. Camera System

The virtual camera (`ViewCamera`) is separate from the physical phone camera and from the camera equipment (`CameraEquipment`).

Phone sensors
      |
Orientation
      |
Virtual camera
      |
Three.js renderer
      |
Phone display

Camera supports:
- Field of view
- Zoom
- View direction
- Camera position
- Camera shake
- Equipment-specific overlays

## 14. Virtual Photography

Taking a photograph captures the current rendered view.

Store:
- Timestamp
- Game-world position
- Species
- Distance
- Equipment
- Zoom
- Weather
- Time of day

Initially, photographs can simply be screenshots of the WebGL canvas.
Capture immediately after a render call (avoid `preserveDrawingBuffer` for performance).

## 15. AR Mode

AR is a future renderer.

             Simulation
                 |
        +--------+--------+
        |                 |
        v                 v
 Synthetic renderer    AR renderer
        |                 |
     3D world         Camera feed
                        +
                    virtual animals

Potential features:
- Real camera background
- Virtual animals
- Spatial anchors
- Real-world scale
- Surface detection
- Occlusion

AR must not be required for the MVP.

Platform limits:
- WebXR (tracking, anchors, surface detection, occlusion): Android Chrome only.
- iOS Safari: camera background via `getUserMedia` only, no real tracking.

## 16. User Interface

Keep the HUD minimal.

+------------------------------+
|  10:42       WIND ->         |
|                              |
|                              |
|             +                |
|                              |
|                         [deer]|
|                              |
|                              |
|  BINOCULARS   CAMERA   MENU  |
+------------------------------+

The UI should cover as little of the viewport as possible.

## 17. Persistence

Use IndexedDB.

Store:
- Player progress
- Discovered species
- Photographs
- Equipment
- Settings
- Relevant world state

The core game should eventually work offline.

Notes:
- Store photos as blobs, keep metadata records separate.
- Version the save data schema and provide migrations.
- iOS Safari may evict site data after about 7 days without use unless installed as a PWA.

## 18. Audio

Later feature.

Sounds may include:
- Animal calls
- Footsteps
- Wind
- Rain
- Water
- Birds
- Equipment
- Environmental ambience

Audio can become an important way of locating animals outside the current viewport.

## 19. Rendering

Initial target:
- Low-poly / stylized 3D
- Mobile-friendly geometry
- Limited texture resolution
- Simple lighting
- Level of detail where useful

Target:
- 30–60 FPS on modern phones
- Dynamic quality scaling where necessary

Avoid photorealistic graphics during the prototype phase.

## 20. Performance

Main constraints:
- Mobile GPU
- Battery
- Memory
- Sensor processing
- JavaScript execution

Priorities:
1. Limit visible objects.
2. Use low-poly models.
3. Instance repeated vegetation.
4. Use level of detail.
5. Keep animal AI lightweight.
6. Limit unnecessary sensor processing.

## 21. Suggested Project Structure

src/
├── game/
│   ├── Game.ts
│   ├── World.ts
│   ├── Player.ts
│   ├── Animal.ts
│   ├── AnimalManager.ts
│   └── Simulation.ts
│
├── equipment/
│   ├── Equipment.ts
│   ├── CameraEquipment.ts
│   ├── Binoculars.ts
│   └── Weapon.ts
│
├── input/
│   ├── TouchInput.ts
│   ├── DeviceOrientation.ts
│   └── DesktopInput.ts
│
├── rendering/
│   ├── Renderer.ts
│   ├── ViewCamera.ts
│   ├── SyntheticRenderer.ts
│   └── ARRenderer.ts
│
├── ui/
│   ├── HUD.ts
│   ├── Menu.ts
│   └── Journal.ts
│
├── util/
│   ├── rng.ts
│   └── quat.ts
│
├── data/
│   ├── species/
│   ├── equipment/
│   └── environments/
│
└── main.ts

## 22. Development Phases

### Phase 1 — Sensor Prototype

- Three.js scene
- Simple environment
- DeviceOrientation
- Virtual camera
- Desktop mouse fallback

No animals.

### Phase 2 — Wildlife

- One animal species
- Animal movement
- Basic AI
- Animal visibility
- World coordinates

### Phase 3 — Photography

- Camera equipment
- Zoom
- Photograph button
- Canvas capture
- Photo gallery
- Basic scoring

### Phase 4 — Exploration

- Player movement (step detection, optional WebXR)
- Larger environment
- Multiple species
- Time of day
- Basic audio

### Phase 5 — Hunting

- Hunting equipment
- Tracking
- Animal awareness
- Aim system
- Hit simulation
- Progression

### Phase 6 — Advanced Simulation

- Weather
- Wind
- Seasons
- Population simulation
- Advanced AI
- Ecosystem behavior

### Phase 7 — AR

(Full tracking on Android/WebXR only. iOS: camera background only.)

- Camera background
- AR tracking
- Anchoring
- Virtual animals
- Occlusion
- Real-world interaction

## 23. MVP Definition

The first playable prototype contains:
- One small 3D forest
- One animal
- Stationary player
- Phone orientation controls camera
- Desktop mouse fallback
- Crosshair
- Moving animal
- Tap-to-photograph
- Local photograph storage

MVP success criterion:

A player can pick up their phone, physically look around a virtual forest, find a moving animal, aim at it and take a virtual photograph.

Everything else is secondary to this interaction.

## 24. Future Extensions

Potential long-term features:
- Procedural environments
- Large open world
- Animal population simulation
- Migration
- Dynamic ecosystems
- Multiplayer
- Shared photography expeditions
- AR mode
- Real-world geographic environments
- GPS-based world generation
- AI-generated animal behavior
- AI-assisted species/photo identification

The architecture should allow these features to be added without replacing the core simulation.

## 25. Conventions

- Units: meters, seconds.
- Coordinate system: right-handed, Y up. After calibration the player faces -Z.
- Simulation runs on a fixed timestep (30 Hz), decoupled from rendering.
- All randomness uses a seeded RNG (deterministic worlds, reproducible tests).
- Simulation code contains no Three.js or DOM references.
- Save data carries a schema version.

## 26. Scoring Notes (Phase 3)

- Composition: project animal bounds to screen space.
- Visibility/occlusion: raycast from camera to animal.
- Both are feasible on mobile but need planning in Phase 3.

## 27. Non-Goals (for now)

- Photorealistic graphics.
- Detailed ballistics.
- Multiplayer.
- Camera-based drift correction for rotation.
- True position tracking outside WebXR.

## 28. Measurable MVP Criteria

- Sustained 30 FPS on a mid-range phone from the last 3 years (target device to be named).
- Initial load under 5 s on a typical mobile connection.
- Orientation latency imperceptible, no visible jitter at 1x zoom.
- Works on iOS Safari and Android Chrome over HTTPS.

## 29. Levels

A level (`data/environments/`) defines terrain parameters, pond, props, palette (sky, fog, ground, light),
tree style, start time and animal spawns. The simulation core is level-agnostic.

- **Forest:** deer, conifers, bushes, rocks.
- **Dinosaur Valley:** Parasaurolophus, Triceratops, Raptor, T-rex. Palm-like trees, ferns, boulders, warm hazy light.

Level selection is on the start screen. The LEVEL button reloads to the start screen.

## 30. Species

Species (`data/species/`) define behavior parameters, bounding box (scoring/visibility) and a procedural look
(primitives; stance quad or biped). Reaction to detection: `flee` or `stand` (holds ground, stays ALERT).
Predators (T-rex, raptor) do not attack yet. Predator behavior is a Phase 5+ topic.

## 31. Equipment and Hunting (implemented, project v06)

Equipment switching: BINOCULARS / CAMERA / RIFLE buttons (keys 1/2/3). Tap = action of the equipped item.

| Item | Zoom | Sway (deg, standing) | Action | Overlay |
|---|---|---|---|---|
| Binoculars | 8x fixed | 0.2 | none | circular vignette |
| Camera | 1-8x (4 optical, 2 digital) | 0.12 | photograph | crosshair |
| Rifle | 2-8x | 0.4 | shoot | scope reticle |

Zoom: pinch, +/- buttons, mouse wheel, +/- keys. Range depends on the equipped item.

Aim: hand shake is added to the view (crouching x0.5, moving x3). Each shot adds recoil (about 1.1 deg, decays quickly).

Rifle (abstract): damage 100, spread 0.15 deg, effective range 150 m, max range 300 m, magazine 5, bolt action 1.4 s, reload 3 s.

Hit model (simplified): a ray from the eye through the view center (plus sway, recoil, random spread) is tested against each
animal's oriented bounding box. Terrain, trees, bushes and rocks block the ray. The hit point selects a zone:
head x1.5, vital x1.0, body x0.35, tail x0.1. Damage falls off beyond the effective range (min 30%).

Animal response: killed animals stay down (DEAD). Survivors flee (slower below 60% health). A shot is loud: animals within
60 m panic, within 150 m become wary. Species with reaction `stand` also flee when hit.

Harvest log: each hit is stored (IndexedDB store `hunts`, DB v2) and listed under MENU > PHOTOS / HARVEST.

Not yet: tracking wounded animals, wind, scent, bleeding, reloading by button, ammo types, predator attacks.

## 32. Controls and PWA (implemented, project v07)

Touch layout:
- Left: movement joystick, CROUCH button above it.
- Right: look joystick (rate control, slower at high zoom, finer near center), red trigger button above it (PHOTO for camera, FIRE for rifle, hidden for binoculars), zoom +/- above the trigger.
- Bottom row: BINOCULARS, CAMERA, RIFLE, MENU.
- Tap on the view also triggers the equipped item.
- The look stick adds a yaw/pitch offset on top of the phone orientation. CALIBRATE resets it.
- Landscape: crouch, trigger and zoom move inward next to the sticks.

Speeds: walking 3.5 m/s, crouching 1.8 m/s.

PWA / offline:
- `manifest.webmanifest` (fullscreen, any orientation, icons incl. maskable) and iOS meta tags / touch icon.
- `sw.js` generated at build time: precaches the app shell (cache-first), new cache per build, old caches deleted.
- Updates apply on the next launch after the new service worker installs.
- No external assets at runtime (all bundled). Photos and harvest log stay in IndexedDB.

## 33. Fauna, Time, Audio, Journal (implemented, project v08)

Fauna:
- Forest: deer, elk, wild boar, fox (dusk/night), rabbit, bear (holds ground), hawk (soaring), crow, duck (pond).
- Dinosaur Valley: Parasaurolophus, Triceratops, Raptor, T-rex, Pteranodon (soaring), Archaeopteryx.
- Aerial behavior: `soar` flyers circle at 25-55 m and ignore the player. `hop` flyers perch/forage on the ground, fly between spots, take off when alarmed and land away from the player. Shot flyers fall.
- Species have rarity (1-5), description, call type and health.
- Scoring size uses the larger of height and width fraction (birds, long animals).

Time and sky: simulated day (1 game minute per real second; MENU: normal / fast / paused). Sun and moon, orange twilight, night fog and light levels. Animal activity windows apply (e.g. foxes at dusk and night).

Audio (synthesized, no assets, offline): rifle shot with reverb, bolt click, camera shutter, footsteps (quieter crouched), wind, birdsong by day, crickets by night, distant roars in the valley. Animal calls are positional (stereo pan by bearing, gain and muffling by distance) to locate animals outside the view. MENU toggles sound.

Field journal (MENU > FIELD JOURNAL): a species is discovered by watching it near the view center at 2.5x zoom or more for 1.5 s, by photographing it, or by harvesting it. Entries track observed behaviors, watch time, photos and best score, harvests and first-seen date. Undiscovered species show as ???. Stored in IndexedDB (DB v3, store `journal`).

Naturalist mode (start screen toggle, remembered): no rifle. All other features unchanged.

## 34. Changes in project v09

Area: playable area 480 x 480 m (was 240). The ground continues 120 m beyond the edge (hidden by fog). Props and animal counts scaled up. The player is blocked at the edge ("Edge of the area"). Animals are kept inside: they turn back toward the center near the edge, wander within 40% of the world size, positions are clamped, and soaring orbits stay inside.

Terrain: dry ground has a floor level, so there are no dry basins that look or behave like water. Only the pond holds water (blocks walking). Sand only appears around the pond.

Equipment:
- Changing tool resets zoom to that tool's minimum (camera 1x, rifle 2x, binoculars 8x, rockets 1x).
- Binoculars: two overlapping view circles, rangefinder readout (distance along the view center to the first animal, object, water or terrain), and ranging rails with 5 mrad ticks (distance in m = object size in m x 1000 / mrad).
- Tapping the view only takes photos. Weapons fire only from the trigger button.

Shooting: aim uses the phone orientation from 0.12 s before the trigger press (pressing a button jolts a phone held for sensor aiming). Hit boxes are 12 cm more forgiving. Rifle sway 0.3 deg, spread 0.1 deg. Misses report how the shot passed the nearest animal.

Machine Range (third level): Scout Drone (fast, evades), Heavy Drone (does not evade), Scout Rover, Heavy UGV (holds position). Patrol flyers fly waypoints at 10-35 m and never land. Containers, scrub and rocks. Machines "hum" or "rumble" positionally.

Seeker rockets (Machine Range only, not in naturalist mode): 3 rockets, 1.2 s cycle, 5 s reload. Lock-on: keep a target within a 5 deg cone with clear line of sight for 1.5 s (HUD bracket; LOCKING / LOCKED). A locked rocket homes with a limited turn rate (1.6 rad/s), so fast evasive targets can still be missed. Unlocked rockets fly straight. Proximity fuze, 7 m splash radius, 250 damage at the center. Rockets stop on terrain and obstacles. Key 4 / ROCKETS button.

## 35. Predators, Wind, Scent, Tracking (implemented, project v10)

Predators (T-rex, Raptor, Bear): reaction `hunt`. When aware of the player (awareness above the species trigger, within its range) a predator roars (warning, positional audio), then either charges (T-rex, bear) or stalks and then charges (raptor). Charges are limited: the predator tires and gives up after `chargeTime` or if the player gets far away. A predator within attack range hits the player.
- T-rex: trigger 0.6, range 90 m, 2.2 s warning, charge 9 m/s for up to 8 s.
- Raptor: trigger 0.5, range 70 m, 1.2 s warning, creeps at 1.8 m/s until 22 m, then charges at 12 m/s for up to 5 s.
- Bear: defensive, trigger 0.7, range 40 m, 2.5 s warning, charge 8 m/s for up to 4 s.
- A shot predator keeps attacking while above its flee threshold (T-rex 30%, raptor 50%, bear 35% health), then flees.
- Gunshots and rocket blasts raise awareness of nearby animals, including predators.
- Warning banner shows the predator, state, distance and direction. The screen shakes when a big predator charges nearby; footfalls are positional.

Respawn on hit: the player respawns at camp (start clearing), or at the safest nearby spot if predators are close to camp. 6 s protection, all predators stand down for 40 s. Death counter in the HUD. MENU toggles PREDATORS ON/OFF. Predators are active in Naturalist mode too.

Wind: slowly varying direction and speed (level base: forest 3, valley 4, range 5 m/s). The HUD arrow shows where the wind blows toward, relative to the view. Scent is carried that way: animals downwind of the player within range (40-140 m depending on species smell and wind speed) notice the player even without sight. Stay downwind of animals (wind blowing from them toward you).

Line of sight: sight detection needs a clear line to the player (re-checked about 4 times per second per animal). Without it sight detection drops to 12%.

Bleeding and tracking: a hit animal below 70% health bleeds (1.2% of max health per second) and leaves blood drops (red marks on the ground, max 400) while moving. It dies when its health runs out, even if it is out of sight. Follow the trail to find it. Bleed-outs are credited to the harvest log and the journal.
