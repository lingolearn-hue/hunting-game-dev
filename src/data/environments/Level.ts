export type PropKind = 'tree' | 'bush' | 'rock';
export interface Prop {
  kind: PropKind; x: number; z: number; scale: number; rot: number;
  /** Remaining multitool hits (trees and rocks). */
  hp?: number;
  /** Cut down / mined out: ignored by collision, sight and rendering. */
  removed?: boolean;
}

export interface PropSpec { kind: PropKind; count: number; minScale: number; maxScale: number; minDist: number; }

export interface Palette {
  sky: number; fogNear: number; fogFar: number;
  groundLo: number; groundHi: number; sand: number; water: number;
  trunk: number; leaf: number; bush: number; rock: number;
  sun: number; sunIntensity: number; hemiSky: number; hemiGround: number;
}

export interface SpawnSpec {
  species: string; count: number; minDist: number; maxDist: number;
  /** First animal of this entry spawns in front of the player (easy to find). */
  front?: boolean;
  /** Spawn on the pond (water birds). */
  at?: 'pond';
}

export interface LevelDef {
  id: string;
  name: string;
  description: string;
  seed: number;
  startHour: number;
  terrain: { hillAmp: number; hillFreq: number };
  pond: { x: number; z: number; r: number };
  props: PropSpec[];
  treeStyle: 'conifer' | 'palm' | 'container';
  ambience: 'forest' | 'valley' | 'range';
  /** Extra equipment available on this level. */
  extraEquipment?: Array<'launcher'>;
  /** Base wind speed (m/s). Default 3. */
  windSpeed?: number;
  /** 'ar': camera background, only animals are rendered (no terrain/sky). Default synthetic. */
  renderer?: 'synthetic' | 'ar' | 'xr';
  /** AR: patrol flyers stay between these elevation angles (deg) above the player's horizon. */
  elevation?: [number, number];
  /** AR: distance range (m) of patrol waypoints around the player. Default [40, 110]. */
  patrolRange?: [number, number];
  /** Animals stay within this radius (m) of the origin. Default 40% of the world size. */
  wander?: number;
  /** AR camera level: a continuous stream of drones crossing the sky in the viewing direction. */
  stream?: { species: string[]; every: [number, number]; max: number };
  /** Perfectly flat ground at this height (AR world: the real floor). */
  flatGround?: number;
  palette: Palette;
  spawns: SpawnSpec[];
}
