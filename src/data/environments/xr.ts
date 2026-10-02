import { LevelDef } from './Level';

/**
 * AR world with real 6-DoF tracking (WebXR, ARCore on Android). The player's position and orientation come from
 * the tracking; machines are real size and live in the tracked space: walk around them.
 */
export const XR: LevelDef = {
  id: 'xr',
  name: 'AR World (SLAM)',
  description: 'WebXR tracking (Android). Walk around real-size drones and vehicles.',
  seed: 5,
  startHour: 12,
  terrain: { hillAmp: 0, hillFreq: 1 },
  pond: { x: 3000, z: 3000, r: 1 },
  props: [],
  treeStyle: 'conifer',
  ambience: 'range',
  windSpeed: 3,
  renderer: 'xr',
  flatGround: 0,           // the tracked floor (adjust in the menu with GROUND = CROSSHAIR)
  elevation: [10, 60],     // drones stay above the horizon
  patrolRange: [8, 35],    // real-size drones are only visible when fairly close
  wander: 40,              // vehicles stay within 40 m of the start point
  extraEquipment: ['launcher'],
  palette: {
    sky: 0x000000, fogNear: 100, fogFar: 400,
    groundLo: 0x000000, groundHi: 0x000000, sand: 0x000000, water: 0x000000,
    trunk: 0, leaf: 0, bush: 0, rock: 0,
    sun: 0xffffff, sunIntensity: 1.3, hemiSky: 0xffffff, hemiGround: 0x888888,
  },
  spawns: [
    { species: 'rover', count: 1, minDist: 8, maxDist: 14, front: true },
    { species: 'rover', count: 2, minDist: 8, maxDist: 28 },
    { species: 'ugv', count: 1, minDist: 14, maxDist: 28 },
    { species: 'scoutdrone', count: 3, minDist: 8, maxDist: 30 },
    { species: 'heavydrone', count: 1, minDist: 15, maxDist: 35 },
  ],
};
