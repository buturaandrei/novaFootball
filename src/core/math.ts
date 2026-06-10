import * as THREE from 'three';

/** Smorzamento esponenziale indipendente dal framerate (stile critically-damped). */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return THREE.MathUtils.damp(current, target, lambda, dt);
}

export function dampVec3(current: THREE.Vector3, target: THREE.Vector3, lambda: number, dt: number): void {
  current.x = damp(current.x, target.x, lambda, dt);
  current.y = damp(current.y, target.y, lambda, dt);
  current.z = damp(current.z, target.z, lambda, dt);
}

/** Smorzamento di un angolo lungo il percorso più breve. */
export function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  let delta = (target - current) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return current + delta * (1 - Math.exp(-lambda * dt));
}

export const clamp = THREE.MathUtils.clamp;
export const lerp = THREE.MathUtils.lerp;
