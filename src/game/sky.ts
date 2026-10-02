/** Sun position and night level from the game hour. Sun rises at 6:00 in the east (+X) and sets at 18:00. */
export function sunElevation(hour: number): number {
  return Math.sin(((hour - 6) / 12) * Math.PI);
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** 0 = day .. 1 = deep night (about 19:45); monsters follow this. Smooth through dusk and dawn. */
export function nightLevel(hour: number): number {
  return clamp01((-sunElevation(hour) - 0.12) / 0.30);
}
