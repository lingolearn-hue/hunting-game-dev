export type Reaction = 'flee' | 'stand'; // 'stand': holds ground (stays ALERT), never flees

export interface LookDef {
  stance: 'quad' | 'biped';
  colors: { body: number; dark: number; accent: number; horn: number };
  body: [number, number, number];  // w, h, l (m)
  legLen: number;
  legThick: number;
  neckLen: number;
  head: [number, number, number];  // w, h, l
  tail: 'none' | 'tuft' | 'long';
  tailLen?: number;
  feature: 'none' | 'antlers' | 'ceratopsian' | 'crest' | 'arms';
}

export interface SpeciesDef {
  id: string;
  name: string;
  walkSpeed: number;       // m/s
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
  /** Approximate bounding box for scoring/visibility (m). */
  bounds: { halfLength: number; halfWidth: number; height: number };
  look: LookDef;
}
