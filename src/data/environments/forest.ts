import { LevelDef } from './Level';

export const FOREST: LevelDef = {
  id: 'forest',
  name: 'Forest',
  description: 'Deer in a temperate forest',
  seed: 1,
  startHour: 10.7,
  terrain: { hillAmp: 1, hillFreq: 1 },
  pond: { x: 18, z: -28, r: 9 },
  props: [
    { kind: 'tree', count: 700, minScale: 0.8, maxScale: 1.6, minDist: 9 },
    { kind: 'bush', count: 250, minScale: 0.6, maxScale: 1.3, minDist: 4 },
    { kind: 'rock', count: 80, minScale: 0.5, maxScale: 1.6, minDist: 4 },
  ],
  treeStyle: 'conifer',
  palette: {
    sky: 0x9cc7ee, fogNear: 60, fogFar: 190,
    groundLo: 0x3f6b34, groundHi: 0x7c9a4a, sand: 0x9a8f60, water: 0x3a78a8,
    trunk: 0x5a3d26, leaf: 0x2c5a30, bush: 0x3f7a3a, rock: 0x777a7c,
    sun: 0xffffff, sunIntensity: 1.6, hemiSky: 0xbfd9ff, hemiGround: 0x3a4a2a,
  },
  spawns: [
    { species: 'deer', count: 1, minDist: 30, maxDist: 40, front: true },
    { species: 'deer', count: 3, minDist: 40, maxDist: 90 },
  ],
};
