import { LevelDef } from './Level';

export const DINO: LevelDef = {
  id: 'dino',
  name: 'Dinosaur Valley',
  description: 'Herbivores, raptors and a T-rex',
  seed: 2,
  startHour: 9,
  terrain: { hillAmp: 1.5, hillFreq: 0.8 },
  pond: { x: -26, z: -38, r: 12 },
  props: [
    { kind: 'tree', count: 320, minScale: 1.0, maxScale: 2.0, minDist: 10 },
    { kind: 'bush', count: 450, minScale: 0.8, maxScale: 1.8, minDist: 5 },
    { kind: 'rock', count: 90, minScale: 1.0, maxScale: 3.5, minDist: 7 },
  ],
  treeStyle: 'palm',
  palette: {
    sky: 0xd6cf9a, fogNear: 40, fogFar: 170,
    groundLo: 0x4b6b2a, groundHi: 0x8a9a3a, sand: 0xa89a6a, water: 0x4a8a78,
    trunk: 0x6a5236, leaf: 0x2f7a3a, bush: 0x4f9a3a, rock: 0x8a7c6a,
    sun: 0xffe0a0, sunIntensity: 1.7, hemiSky: 0xe0d8a0, hemiGround: 0x4a5a2a,
  },
  spawns: [
    { species: 'parasaurolophus', count: 1, minDist: 35, maxDist: 50, front: true },
    { species: 'parasaurolophus', count: 2, minDist: 50, maxDist: 100 },
    { species: 'triceratops', count: 2, minDist: 45, maxDist: 100 },
    { species: 'raptor', count: 3, minDist: 35, maxDist: 90 },
    { species: 'trex', count: 1, minDist: 70, maxDist: 100 },
  ],
};
