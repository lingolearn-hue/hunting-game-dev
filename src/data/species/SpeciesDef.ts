export type Reaction = 'flee' | 'stand' | 'ignore'; // 'stand': holds ground; 'ignore': never reacts (soaring flyers)

export type CallKind =
  | 'chirp' | 'caw' | 'quack' | 'screech' | 'grunt' | 'bugle' | 'bark' | 'squeak' | 'roar' | 'honk'
  | 'hum' | 'motor';

export interface FlightDef {
  kind: 'soar' | 'hop' | 'patrol'; // soar: circles at altitude. hop: perches, flies between spots. patrol: flies waypoints, never lands.
  cruiseAlt: [number, number];   // m above ground
  radius?: number;               // soar: orbit radius (m)
}

export interface LookDef {
  stance: 'quad' | 'biped' | 'bird' | 'drone' | 'vehicle';
  colors: { body: number; dark: number; accent: number; horn: number };
  body: [number, number, number];  // w, h, l (m)
  legLen: number;
  legThick: number;
  neckLen: number;
  head: [number, number, number];  // w, h, l
  tail: 'none' | 'tuft' | 'long';
  tailLen?: number;
  feature: 'none' | 'antlers' | 'ceratopsian' | 'crest' | 'arms' | 'ears' | 'tusks' | 'turret' | 'tracks';
  earLen?: number;
  antlerLen?: number;
  wingSpan?: number;               // birds: wing span; drones: rotor arm span
}

export interface SpeciesDef {
  id: string;
  name: string;
  description: string;
  rarity: number;          // 1 (common) .. 5 (very rare)
  walkSpeed: number;       // m/s (flyers: flight speed)
  foragingSpeed: number;   // m/s
  runSpeed: number;        // m/s
  viewRange: number;       // m, detection reaches zero at this distance
  closeRange: number;      // m, extra detection inside this distance
  detectRate: number;      // awareness/s at zero distance (stationary player)
  awarenessDecay: number;  // awareness/s
  alertThreshold: number;  // awareness at which ALERT starts (flee at 1)
  fleeDuration: [number, number]; // s
  reaction: Reaction;
  activity: Array<[number, number]>; // active hour windows
  habitat: string;
  health: number;
  flight?: FlightDef;
  call?: { kind: CallKind; interval: [number, number] };
  /** Approximate bounding box for scoring/visibility (m). y = 0 at the underside. */
  bounds: { halfLength: number; halfWidth: number; height: number };
  look: LookDef;
}
