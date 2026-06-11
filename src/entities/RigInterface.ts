import type * as THREE from 'three';

/**
 * Interfaccia comune dei rig giocatore: il rig "classico" a capsule rigide
 * (fallback) e quello skinned con scheletro vero la implementano entrambi,
 * così Player e tutti i sistemi non cambiano.
 */
export interface IPlayerRig {
  readonly root: THREE.Group;
  setGlow(intensity: number): void;
  animate(
    dt: number,
    speed: number,
    maxSpeed: number,
    onGround: boolean,
    verticalVel: number,
    kickCharge: number,
  ): void;
  kickPose(): void;
  slidePose(dt: number): void;
  divePose(side: number, dt: number): void;
  stunPose(time: number): void;
  recoverPose(dt: number): void;
  fluxSpinPose(t01: number): void;
  fluxChargePose(t01: number): void;
  fluxWindupPose(t01: number, dt: number): void;
  fluxStrikePose(): void;
}

/** Corporatura: altezza e massa relative (1 = riferimento). */
export interface Physique {
  height: number;
  bulk: number;
}
