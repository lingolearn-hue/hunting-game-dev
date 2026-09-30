# Phone Hunting & Wildlife Simulation — Specification

Status: v03
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
