export type Reaction = 'flee' | 'stand' | 'ignore' | 'hunt'; // 'stand': holds ground; 'ignore': never reacts; 'hunt': predator, attacks the player

export type CallKind =
  | 'chirp' | 'caw' | 'quack' | 'screech' | 'grunt' | 'bugle' | 'bark' | 'squeak' | 'roar' | 'honk'
  | 'hum' | 'motor';

export interface FlightDef {
  kind: 'soar' | 'hop' | 'patrol'; // soar: circles at altitude. hop: perches, flies between spots. patrol: flies waypoints, never lands.
  cruiseAlt: [number, number];   // m above ground
  radius?: number;               // soar: orbit radius (m)
}

export interface PredatorDef {
  triggerAwareness: number;  // awareness needed to start hunting the player
  maxRange: number;          // only hunts while the player is within this distance (m)
  windup: number;            // s of roar/warning before the attack run
  stalkSpeed?: number;       // creeping approach speed (m/s) until within chargeRange
  chargeRange: number;       // start charging when closer than this (stalkers)
  chargeSpeed: number;       // m/s
  chargeTime: number;        // s, then it tires and gives up
  attackRange: number;       // m, the player is hit within this distance
  cooldown: number;          // s before it hunts again
  fleeBelow: number;         // when hit: keeps attacking above this health fraction, flees below
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
  feature: 'none' | 'antlers' | 'ceratopsian' | 'crest' | 'arms' | 'ears' | 'tusks' | 'turret' | 'tracks' | 'eyes';
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
  /** Night monster: spawns at night, hunts the player, not part of the field journal. */
  monster?: boolean;
  flight?: FlightDef;
  predator?: PredatorDef;
  /** 0..1: how well it smells the player downwind (default 0.6, flyers 0.15). */
  smell?: number;
  call?: { kind: CallKind; interval: [number, number] };
  /** Approximate bounding box for scoring/visibility (m). y = 0 at the underside. */
  bounds: { halfLength: number; halfWidth: number; height: number };
  look: LookDef;
}
