import { LevelDef } from './Level';

export const MACHINE: LevelDef = {
  id: 'machine',
  name: 'Machine Range',
  description: 'Drones and unmanned vehicles. Seeker rockets available.',
  seed: 3,
  startHour: 14,
  terrain: { hillAmp: 0.6, hillFreq: 0.7 },
  pond: { x: 40, z: -60, r: 7 },
  props: [
    { kind: 'tree', count: 90, minScale: 0.8, maxScale: 1.4, minDist: 14 },   // cargo containers
    { kind: 'bush', count: 700, minScale: 0.6, maxScale: 1.4, minDist: 5 },   // scrub
    { kind: 'rock', count: 260, minScale: 0.6, maxScale: 2.2, minDist: 6 },
  ],
  treeStyle: 'container',
  ambience: 'range',
  extraEquipment: ['launcher'],
  palette: {
    sky: 0xb9c6d0, fogNear: 60, fogFar: 210,
    groundLo: 0x7a765f, groundHi: 0xa39a7c, sand: 0x8a8470, water: 0x3a5060,
    trunk: 0x000000, leaf: 0x55654f, bush: 0x6a7a4a, rock: 0x7d7d7a,
    sun: 0xfff2dd, sunIntensity: 1.8, hemiSky: 0xd0dce6, hemiGround: 0x5a5a48,
  },
  spawns: [
    { species: 'rover', count: 1, minDist: 30, maxDist: 40, front: true },
    { species: 'scoutdrone', count: 3, minDist: 30, maxDist: 80 },
    { species: 'rover', count: 5, minDist: 40, maxDist: 190 },
    { species: 'scoutdrone', count: 3, minDist: 60, maxDist: 190 },
    { species: 'heavydrone', count: 2, minDist: 50, maxDist: 170 },
    { species: 'ugv', count: 3, minDist: 60, maxDist: 200 },
  ],
};
