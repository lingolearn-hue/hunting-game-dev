export type PropKind = 'tree' | 'bush' | 'rock';
export interface Prop { kind: PropKind; x: number; z: number; scale: number; rot: number; }

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
  treeStyle: 'conifer' | 'palm';
  palette: Palette;
  spawns: SpawnSpec[];
}
