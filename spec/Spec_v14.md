# Phone Hunting & Wildlife Simulation — Specification

Status: v10
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

## 36. AR Camera Test (implemented, project v11)

Level `AR Camera Test` (start screen). The real camera image (rear camera, `getUserMedia`, HTTPS) is the background; a transparent WebGL canvas draws drones on top (`ARRenderer`, the second renderer from section 15). The view direction comes from the phone sensors; CALIBRATE re-centers.
- Drones fly only above the horizon: elevation 8-50 degrees as seen from the player, at 18-180 m (Scout Drone (AR) evades, Heavy Drone (AR) does not). Tested over 10 minutes with scares: never below 8 degrees.
- The AR drones are scaled up (about 3x / 2.5x) so they are more than a dot. Real-size scaling is a to-do (section 37).
- Digital zoom magnifies the camera image and the virtual camera together. Rifle, seeker rockets with lock-on, binoculars rangefinder and the camera all work; photos include the camera image.
- No walking and no look stick in AR (they would break the registration with the real view). Hunting rules, scoring, journal and audio are unchanged.
- Field of view: the virtual camera uses the vertical FOV of the displayed image. The camera's real FOV is unknown to the browser, so MENU has "AR FOV" (50-80 degrees along the long image side, default 65) to match drones to the real view. Accuracy is best near the screen center.
- If the camera is unavailable or denied, the level runs on a dark background with a message.

Landscape: menu and start screen scroll and use a multi-column layout on short screens.

## 37. Planned: Ground Vehicles on Detected Roads (additional map, not implemented)

Goal: vehicles that drive along real roads seen by the camera, at correct size and distance.
- Road detection: small in-browser segmentation model (TF.js or ONNX Runtime Web, cached for offline use) on camera frames at 5-10 Hz. Cheaper fallback heuristics (colour/texture, vanishing point) are less robust.
- Ground plane and scale: assume camera height (about 1.5 m, adjustable) and use the phone pitch to find the horizon. A ground pixel at depression angle d below the horizon is at distance height / tan(d) (flat ground). Vehicles are placed at those distances with real dimensions (e.g. car 4.5 m), checked against a lane-width prior (3-3.7 m).
- Optional: WebXR hit-test for a better ground plane (Android Chrome only; not on iOS Safari).
- Motion: vehicles follow the road polyline in ground coordinates. Without position tracking they stay correct only for rotation of the phone and short walks (drift).
- Limits: no occlusion by real objects, distance error about 20-30%, model size and battery cost, poor results in low light or on unmarked/curved roads.

## 38. AR World with SLAM (implemented, project v12; needs a test on an Android phone)

Level `AR World (SLAM)`. Tracking is provided by WebXR (`immersive-ar`, ARCore on Android Chrome): this is real visual-inertial SLAM done by the platform, not by our code. The player's position and orientation in the game are the tracked head pose (reference space `local-floor`: y = 0 at the floor, -Z = initial facing). Walk around machines that stay put in the tracked space.
- Renderer: `XRRenderer` (third renderer). The browser composites the camera image; we draw only virtual objects. The field of view comes from the XR projection matrix, so the registration is exact (no manual FOV setting).
- The UI is shown through the WebXR DOM overlay (everything in-game lives inside `#ui`). The XR session owns the frame loop.
- Real size: Scout Drone (0.7 m), Heavy Drone, Scout Rover (1.1 m), Heavy UGV (3 m). Drones stay above the horizon (10 degrees minimum) at 8-35 m, vehicles patrol on the floor within 40 m of the start point. They keep away from the player and turn back when fleeing too far.
- Ground height: MENU > GROUND = CROSSHAIR sets the ground to the real surface at the screen center (XR hit-test), so vehicles drive at the right height. Water and terrain do not exist on this level.
- Equipment: rifle and seeker rockets (lock-on uses the real camera FOV). Real crouching (eye height below 1.05 m) counts as crouching. No sway/recoil shake (the real hand shake is real). No zoom, no binoculars and no photos: WebXR does not give the page the camera image or a zoom. (Photos would need the `camera-access` feature.)
- Not on iPhone: Safari has no WebXR. The level is disabled there ("needs Android Chrome with ARCore"). iOS would need a native (ARKit) wrapper or a commercial web AR engine.
- Limits: no occlusion by real objects (virtual machines draw in front of everything), drift of tracking over long walks, outdoors in bright light or on featureless floors tracking is weaker.
- Interaction with the road-vehicle to-do (section 37): this level provides the metric scale and the ground plane; road detection itself (a segmentation model) is still open.

## 39. Sky, Day/Night, Weather-like Visuals (project v13)

Synthetic levels only (AR/XR show the real camera). `SkySystem` (`src/rendering/Sky.ts`) draws a shader sky dome, sun, moon, stars, Milky Way and clouds, and drives the sun/moon/hemisphere lights and fog.
- Twilight is wide: the sky and the light blend over about 2.5 game hours (sun elevation -0.40 .. +0.35). At normal time speed (1 game minute per second) dusk takes about 2.5 minutes. Night floor: ambient 0.32 plus moonlight, so the scene never goes black. Fog range shrinks to 140 m at night.
- Sunrise/sunset: horizon glow in orange/pink around the sun, purple zenith tint, clouds tinted orange on the sun side, visible sun disc.
- Night: moon (own slower path, stylized size) with halo, ~1700 faint plus 70 bright stars that rotate with the hour, and a Milky Way band (about 1000 points, denser toward a "galactic center") as a hint.
- Clouds: 16 soft sprites drifting with the wind; dark blue at night.

## 40. Tools, Order and Discrete Zoom

Tool row (left to right): CAM, BINO, RIFLE, ROCKET, TORCH, TOOL, MENU. Keys 1-6 in that order (T = thermal). Only unlocked tools appear. A new game starts with the camera only (WebXR level: the rifle, as there is no camera image).
- Zoom levels are discrete (unlocked in the tech tree). +/- buttons, wheel notch and pinch (25% steps) move one level.
  - Camera: 1x, 2x, 4x (optical only, quality always 1).
  - Binoculars: 2x, 4x, 8x (overlay with rangefinder and ranging rails).
  - Rifle: 1x iron sight (ring and front post), 4x and 8x scoped.
  - Rockets: 1x, 4x.
- Changing tool resets the zoom to the first unlocked level of that tool.

## 41. Tech Tree and Coins (per level)

Every level has its own coins, unlocked tech, wood, stone, buildings and removed trees/rocks, stored in IndexedDB (`progress` store, DB v4). Autosave 0.8 s after a change and on page hide.
- Start screen, per level: coin and tech counter, RESET (confirmation; deletes the progress record, keeps photos and journal) and UNLOCK ALL (unlocks all tech applicable on that level; coins unchanged).
- In-game: MENU > TECH TREE (Tools / Weapons / Construction as trees of compact chips: parent -> upgrades; tap a chip for description and BUY in the panel at the top; sections collapse). Nodes only appear where they make sense (no rifle in naturalist mode, no rockets without a launcher on the level, no thermal/torch/building in the AR levels).
- Nodes (cost): camera 2x (15), 4x (40), thermal (90); binoculars (25), 4x (40), 8x (70), thermal (100); rifle (60), scope 4x (60), 8x (100), thermal (120), extended magazine +3 (50), stabilizer -40% sway (80); rockets (150), 4x (80), thermal (100), +2 rockets (120); torch: fire (10), electric (60), LED floodlight (140); multitool (40); build: campfire (25), wall (40), tower (90), light autocannon (160), heavy autocannon (320); minimap radius 100 m (30) and 160 m (70). All costs are first guesses.
- Income (changed in project v14): photo coins are limited per species to 100 in total: a photo pays the improvement over the best score of that species so far (scores 10, 10, 15 pay 10, 0, 5). A kill pays a flat 10 coins, harvesting the carcass with the multitool another 10 (night monsters: 10 per kill). No bonus for new species.
- Thermal view (camera, binoculars, rifle scope, rocket sight; synthetic levels): creatures and rockets glow white on a dark scene; button THERMAL (key T).

## 42. Torch

Equipped like a tool (no action button). Tiers by tech: fire torch (warm, flickering, 16 m, wide), electric torch (36 m, focused), LED floodlight (60 m, wide). One spot light attached to the view; the number of dynamic lights is fixed (1 spot + 4 point lights) so shaders are never recompiled.

## 43. Multitool, Gathering and Building

Reach 4.5 m, strike every 0.55 s (USE button).
- GATHER mode: aim at a tree (wood), a rock (stone) or a carcass (harvest, coins). Trees and rocks take 2-4 hits (by size) and then disappear (hidden in the renderer, ignored by collision and line of sight, saved per level).
- BUILD modes (only unlocked structures are listed; costs in wood/stone): campfire (5/0), wall (3/4), hunters tower (20/6), autocannon (10/15), heavy autocannon (20/40). A translucent preview shows the spot 4.5-6 m ahead (green = possible, red = blocked or too expensive). REMOVE demolishes the structure in front and returns 50%.
- Placement rules: not within the edge margin, on water, on trees/rocks or on other structures.
- Campfire: light and a safe zone (7 m): night monsters do not attack there. If a campfire exists, the player respawns next to it.
- Wall: blocks the player and all ground animals.
- Tower: 5 m platform; walk into it to climb (smooth), step off to drop. Blocks animals. Monster reach is 3D, so monsters below cannot hit a player on the platform.
- Autocannons: shoot only night monsters in range with a clear line (light: 45 m, 4 shots/s, 12 dmg; heavy: 70 m, 2 shots/s, 45 dmg), tracers are drawn. Buildings cannot be damaged.
- The base is stored per level and restored when the level starts.

## 44. Night Monsters ("Shade")

Appear after dusk (night level 0..1 from the sun elevation, about 18:20-19:45), up to 6 at once, spawning 45-80 m around the player, one every 6-10 s, never within 14 m of a campfire. They always know where the player is, run at 6.2 m/s (player walks 3.5), attack within 1.8 m (3D) and respawn the player like a predator hit (6 s protection, 40 s calm-down). Glowing red eyes (visible through fog) and long arms; they slide along walls. They vanish at dawn. Health 70. Not part of the field journal.

## 45. Respawn

Killed animals and machines are replaced one at a time per species (every 30-80 s, at least 55 m from the player) until the original number of the level is reached again. Corpses disappear after 4 minutes (monsters after 20 s) or when harvested. Tested: 4 of 6 deer killed, all back after about 5 minutes.

## 46. AR Camera Level: Drone Stream

Only in `AR Camera Test`: no fixed drones; a stream of Scout/Heavy drones (80/20%) is spawned every 4-9 s (at most 6 at once) 140 m ahead in the current viewing direction, 28-58 m high (at least 8 degrees above the horizon), passing 35-70 m to one side of the player, crossing overhead at about 60% of walking speed, then leaving behind the player and disappearing. They do not flee. Tested over 4 minutes: 21 drones, 19 spawned in the viewing direction (the 2 others are the initial ones).

## 47. Minimap

Top right, transparent circle, the view direction is up, white arrow = player. Dark green = forest (12 m cells with at least 3 trees), blue = pond, purple = animals, red = monsters (detected within the radius), black = base buildings. Radius 60 m, 100 m and 160 m with the radar tech.

## 48. Project v14 changes

- Photo subject: the animal under the crosshair (nearest if several overlap there); without one, the animal closest to the image center. It no longer picks the best-scoring animal in frame. Low animals can sit below a crosshair at eye height; then the animal behind is the subject.
- Sky: stars and Milky Way are neutral white (no coloured dots), clouds are opaque enough to hide the stars behind them. (Assumption: the coloured dots were stars seen through clouds.)
- Autocannons in the AR levels (Camera Test and World): the tech nodes `build.cannon` / `build.cannon2` exist there without the wall/multitool prerequisites; once bought, the TOOL button appears and places only autocannons, paid in coins (40 / 100; REMOVE refunds half). They shoot the drones and machines. They are drawn over the camera image. AR bases are not saved (the real world differs every session). Note: kills by the autocannon pay coins, so the AR levels allow coin farming.

## 49. Not tested / open

- All visuals (sky, thermal, buildings, minimap layout) were only checked by scene-graph and logic tests, not on a device. Layout of the build panel and 7 tool buttons on small phones needs a look.
- Balance values (costs, rewards, monster count, turret damage) are first guesses.
- Thermal view uses a material swap; creature heat does not vary (dead animals glow like living ones).
- Road detection for ground vehicles (section 37) and iPhone SLAM (section 38) are still open.

## 50. 3D Scan: rudimentary mapping from optical flow in plain JS (project v15, prototype)

Start screen button `3D Scan (beta)`. Works in iPhone Safari (HTTPS): needs only `getUserMedia` and `DeviceOrientation` (permission requested in the click). No WebXR, no native app, no WASM. Code: `src/slam/` (Slam, klt, corners, vec, MapBuilder, ScanApp), synthetic test `tests/slam-synthetic.ts`.

### Method
1. Frames are drawn to a 192 px (long side) canvas, ~18 Hz, grayscale.
2. Features: Shi-Tomasi corners on a grid (up to 140), tracked with pyramidal Lucas-Kanade optical flow (3 levels, 9x9 window, brightness offset removed, forward-backward check).
3. Rotation comes from the phone sensors (accurate, and a time lag compensation: LAG button). Each pixel becomes a bearing ray in world coordinates.
4. Initialization: with known rotation the epipolar constraint t . (b1 x b2) = 0 is linear in the translation t. RANSAC + smallest eigenvector gives the direction of motion; the sign comes from positive depths. Metric scale: the phone is assumed to be H m above the floor (H button, default 1.5 m); tracks well below the horizon are floor points, so scale = median(floor depth / unit-baseline depth).
5. Tracking: camera position from tracked map points, linear least squares (sum (I - b b^T)(X - c) = 0, robust re-weighting). The sensor rotation is refined per frame by a small-angle correction fitted to the map (pulled toward the sensor value).
6. Mapping: new points are triangulated from several views (linear least squares) after 2 degrees of parallax and 8 cm baseline; points disagreeing with the pose are dropped.
7. Objects: points 0.25-3 m above the floor are binned into 0.25 m cells; connected cells = objects (position, radius, height).

### Screen
Camera image with tracked features (green), map points used for the pose (red), projected map points (blue); small top-down map (points, objects, path); MAP 3D (orbit with drag, pinch/wheel to zoom); SAVE writes a PLY point cloud; RESET, H (phone height), FOV (long-side camera FOV, 55-75 degrees), LAG.
How to use: hold the phone about 1.5 m high, tilted down about 35 degrees, slide it sideways about 0.5 m, then walk slowly.

### Synthetic test results (ray-traced floor, wall and box, 15 fps, 10 s, 3.5 m walk)
- Initialization after 0.5-0.7 s, about 470 points, 9-10 ms per frame in Node (an iPhone will be slower, estimated 2-4x; a Web Worker is advisable later).
- With realistic slowly varying sensor error (0.1 degree noise + 0.5-1 degree drift): median map error 14-16 cm, 68% of points within 25 cm of the true surfaces, camera position error 25-30 cm.
- A constant 2 degree tilt error is absorbed by the rotation refinement (error 15 cm).
- Sensitive to: white rotation noise above about 0.3 degrees per frame (0.5 degrees: pose error 70-90 cm), a wrong FOV (10 degrees off: pose error 70-85 cm; check with the FOV button), a wrong phone height (scale error equals the height error).
- Box test: the 1 m box was found as an object 35 cm off its true center, height 1.1 m.

### Not verified / limits
- Never run on a real iPhone or real camera images from this side. The synthetic images have ideal texture, no motion blur, rolling shutter, auto-exposure or auto-focus changes. Real scenes (white walls, grass, low light) will track much worse. (Confidence that it works usefully outdoors on textured ground: about 60%; indoors with plain floors: low.)
- Sensor/video time sync is unknown in Safari: tune LAG by looking whether the red/green points stick to the image while rotating.
- iOS `deviceorientation` yaw has no absolute north reference and drifts slowly; only relative yaw matters here.
- Monocular: scale comes only from the floor prior; it needs floor points in view during initialization. No loop closure, no relocalization, drift grows with distance. Moving objects (animals, people) are rejected only by RANSAC.
- Alternative with more robustness: AlvaAR (WebAssembly visual SLAM from OV2SLAM/ORB-SLAM2, claims iOS Safari support), but it is GPLv3: using it forces this project to be GPLv3 when published. Not tested here.
- Not yet connected to the game: the map objects could become props/occluders and the pose could drive an "AR World (iPhone)" level (the game already accepts an external pose).

## 51. 3D Scan: rectangular structure instead of cylinders (project v16)

The earlier object extraction binned points into cells and drew circles (cylinders). It is replaced by `src/slam/Structure.ts`, a Manhattan-world model (gravity = +Y is known from the sensors, so planes are either vertical or horizontal):
- **Walls** = vertical planes as segments in the floor plan with a height range. Found by RANSAC lines in the top-down projection; a line is scored by significance (inliers minus the points a strip of the same size would contain by chance), must hold 10+ points, 0.8 m length and 0.4 m of height spread; inlier distance follows each point's own uncertainty (sigma, from depth and baseline).
- **Boxes / tables** = horizontal planes: peaks in the height histogram of well-measured points (sigma < 12 cm, flat within 5 cm, dense and filling their rectangle) clustered in the floor plan and fitted with a minimum-area oriented rectangle. Extruded to the floor = solid box; if few points are between floor and top = table (open). Points on a box's faces are explained by the box and not turned into walls.
- **Right-angle grid**: if the walls and boxes agree on one direction (circular mean of 4 x angle), every direction within 10 degrees is snapped to it and refitted. Walls off the grid need 35 instead of 15 supporting points.
- **Corners**: two walls at about 90 degrees whose lines meet within 0.7 m of both segments give a corner; both wall ends are pulled to it.
- **Tracking over time**: each re-fit (every 0.7 s, on all accumulated points) is matched with the existing items (angle < 10 degrees, offset < 0.3 m, overlap), so items keep an id and a `seen` count. Confirmed after 4 sightings with enough support; confirmed items are removed only after 25 missed updates. The wall extent never shrinks once confirmed.

### Corroboration by later measurements (every camera frame)
1. **Free space**: the ray from the camera to a tracked map point must not pass through a wall or solid box; each violation counts against the item, and an item is dropped when violations exceed 60% of its support.
2. **Image edges**: every edge (wall top/bottom/ends, box top and bottom outline) is projected into the image and tested for a gradient across it, compared with the same line shifted 9 px to both sides (so textured surfaces do not count). The recent hit rate is shown through the line colour/opacity.
3. **Edge refinement**: each adjustable edge (wall line, wall ends, four box sides) is tested at -20, -10, 0, +10, +20 cm; when the image prefers a shifted position over many frames the correction is applied (up to 80 cm in total) and kept on top of later point-based re-fits.
4. Map points are re-triangulated when a new view adds baseline (multi-view least squares), and each point carries an uncertainty `sigma`.

### Screen
Camera view: structure edges projected over the image (solid green = confirmed, brighter = image edges agree, dashed yellow = tentative), white dots = corners. Top-down: wall lines, box rectangles, corner dots. MAP 3D: translucent wall quads and boxes. SAVE: PLY with the walls/boxes as comment lines.

### Synthetic room test (`tests/structure-synthetic.ts`, 6 seeds, 17 s, floor + back wall z=-7 + left wall x=-3.5 + 1 m box)
The path: slide right, walk toward the back wall, then turn left and walk along the left wall.
| sensor error | back wall | left wall | box | corner | false confirmed walls |
|---|---|---|---|---|---|
| 0.03 deg noise + 0.3 deg drift | 5 of 6 | 3 of 6 | 5 of 6 | 5 of 6 | 1.0 per run |
| 0.03 deg noise + 0.6 deg drift | 4 of 6 | 2 of 6 | 4 of 6 | 3 of 6 | 0.7 per run |
- "Found" = right orientation and offset within 1 m (walls), centre within 0.8 m (box), corner within 1.2 m.
- Box top height: 0.92-1.17 m (truth 1.0). Box centre error 3-52 cm. Back wall offset: typically 2-70 cm; corner error 24-130 cm.
- Absolute distances are limited by the sensor error, not by the model: a tilt bias of 0.5 degree moves a wall 7 m away by about 0.5 m, in a consistent way (the wall stays straight and keeps its angle).
- Image-edge corroboration is low: only 24-31% of the visible model edges lie on an image edge. The test image edges are real (neighbouring planes differ in brightness), so the model edges are still too inaccurate (tens of cm) for most checks, even after refinement. This is the weakest part.
- Geometry of the idea works best for objects within about 5 m, seen from at least two sides while moving sideways; walls seen head-on or while only rotating give no depth.

### Limits
- Not tested on real images/iPhone. Sparse features on plain walls are rare (a white wall has no corners to track): the model will mostly find edges, door frames, furniture and textured surfaces, not blank walls.
- Only vertical and horizontal planes at right angles are modeled; sloped roofs, round objects and non-rectangular rooms are not.
- Windows/doors, wall thickness and occlusion by furniture are ignored. A box seen only from the side shows as walls, not as a box.
