import { LevelDef } from './Level';

/** Camera (AR) test: the real camera image is the background, only drones above the horizon are rendered. */
export const AR: LevelDef = {
  id: 'ar',
  name: 'AR Camera Test',
  description: 'Uses your camera. Drones above the horizon.',
  seed: 4,
  startHour: 12,
  terrain: { hillAmp: 0, hillFreq: 1 },
  pond: { x: 3000, z: 3000, r: 1 },
  props: [],
  treeStyle: 'conifer',
  ambience: 'range',
  windSpeed: 3,
  renderer: 'ar',
  elevation: [8, 50],
  extraEquipment: ['launcher'],
  palette: {
    sky: 0x000000, fogNear: 100, fogFar: 400,
    groundLo: 0x000000, groundHi: 0x000000, sand: 0x000000, water: 0x000000,
    trunk: 0, leaf: 0, bush: 0, rock: 0,
    sun: 0xffffff, sunIntensity: 1.3, hemiSky: 0xffffff, hemiGround: 0x888888,
  },
  // A continuous stream of drones appears above the horizon in the viewing direction and crosses overhead.
  stream: { species: ['arscout', 'arheavy'], every: [4, 9], max: 6 },
  spawns: [],
};
