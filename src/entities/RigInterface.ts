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
    /** Componenti della velocità nello spazio locale (avanti / laterale). */
    forward?: number,
    side?: number,
  ): void;
  kickPose(): void;
  slidePose(dt: number): void;
  divePose(side: number, dt: number, high?: boolean): void;
  stunPose(time: number, dt?: number): void;
  recoverPose(dt: number): void;
  fluxSpinPose(t01: number): void;
  fluxChargePose(t01: number): void;
  fluxWindupPose(t01: number, dt: number): void;
  fluxStrikePose(): void;
  /** Clip d'azione extra (solo rig skinned: esultanza, rinvio, contrasto...). */
  playActionClip?(name: 'esultanza' | 'rinvio' | 'contrasto' | 'passaggio'): void;
  /** La testa segue questo punto (la palla); null per disattivare. */
  setLookTarget?(p: THREE.Vector3 | null): void;
  /** IK della gamba del calcio sul punto reale della palla (peso 0..1). */
  setKickTarget?(p: THREE.Vector3 | null, weight?: number): void;
  /** Ragdoll semplificato (spazzate Flux, falli violenti). */
  startRagdoll?(impulse: THREE.Vector3): boolean;
  updateRagdoll?(dt: number, out: THREE.Vector3): boolean;
  endRagdoll?(): void;
}

/** Corporatura: altezza e massa relative (1 = riferimento). */
export interface Physique {
  height: number;
  bulk: number;
}
