import * as THREE from 'three';
import { damp, dampVec3 } from '../core/math';
import type { Ball } from '../physics/Ball';
import type { Player } from '../entities/Player';

/**
 * Stati del regista virtuale. Ogni stato ha priorità e durata minima:
 * una richiesta viene accettata solo se la sua priorità è >= a quella
 * dello stato corrente oppure se la durata minima è già trascorsa.
 * (tackle/shot/fluxShot/replay si attivano nelle milestone successive)
 */
export enum CameraState {
  OpenPlay = 'openPlay',
  Tackle = 'tackle',
  Shot = 'shot',
  FluxShot = 'fluxShot',
  Goal = 'goal',
  Replay = 'replay',
}

const PRIORITY: Record<CameraState, number> = {
  [CameraState.OpenPlay]: 0,
  [CameraState.Tackle]: 1,
  [CameraState.Shot]: 2,
  [CameraState.Goal]: 3,
  [CameraState.FluxShot]: 4,
  [CameraState.Replay]: 5,
};

const MIN_DURATION: Record<CameraState, number> = {
  [CameraState.OpenPlay]: 0.4,
  [CameraState.Tackle]: 0.5,
  [CameraState.Shot]: 0.6,
  [CameraState.Goal]: 2.6,
  [CameraState.FluxShot]: 1.0,
  [CameraState.Replay]: 1.5,
};

export interface DirectorContext {
  ball: Ball;
  active: Player;
  charging: boolean;
}

/**
 * Regista virtuale: camera da telecronaca ravvicinata che insegue l'azione
 * con anticipo sulla direzione della palla, smorzamento a molla e FOV che
 * respira con gli scatti. Sul goal passa a un'orbita celebrativa.
 */
export class CameraDirector {
  readonly camera: THREE.PerspectiveCamera;
  state = CameraState.OpenPlay;
  private stateTime = 0;
  private goalFocus = new THREE.Vector3();
  private goalOrbitAngle = 0;

  private currentPos = new THREE.Vector3(0, 14, 24);
  private currentLook = new THREE.Vector3();
  private currentFov = 55;
  /** true al primo frame dopo un cambio stato "a taglio netto". */
  private cutPending = false;

  // scratch
  private targetPos = new THREE.Vector3();
  private targetLook = new THREE.Vector3();
  private anticipation = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 2000);
    this.camera.position.copy(this.currentPos);
  }

  /** Richiede un cambio di stato; rispetta priorità e durata minima. */
  request(state: CameraState, data?: { focus?: THREE.Vector3; cut?: boolean }): boolean {
    if (state === this.state) return true;
    const canInterrupt =
      PRIORITY[state] >= PRIORITY[this.state] || this.stateTime >= MIN_DURATION[this.state];
    if (!canInterrupt) return false;
    this.state = state;
    this.stateTime = 0;
    if (data?.focus) this.goalFocus.copy(data.focus);
    if (data?.cut) this.cutPending = true;
    if (state === CameraState.Goal) this.goalOrbitAngle = Math.atan2(this.currentPos.z - this.goalFocus.z, this.currentPos.x - this.goalFocus.x);
    return true;
  }

  update(dt: number, ctx: DirectorContext): void {
    this.stateTime += dt;

    let targetFov = 55;
    let posLambda = 3.2;
    let lookLambda = 5.5;

    switch (this.state) {
      case CameraState.Goal: {
        // orbita celebrativa attorno al punto del goal
        this.goalOrbitAngle += dt * 0.55;
        const r = 10;
        this.targetPos.set(
          this.goalFocus.x + Math.cos(this.goalOrbitAngle) * r,
          3.2,
          this.goalFocus.z + Math.sin(this.goalOrbitAngle) * r,
        );
        this.targetLook.copy(this.goalFocus).setY(1.2);
        targetFov = 48;
        posLambda = 2.4;
        if (this.stateTime >= MIN_DURATION[CameraState.Goal]) {
          this.request(CameraState.OpenPlay);
        }
        break;
      }
      case CameraState.OpenPlay:
      default: {
        const ballPos = ctx.ball.position;
        const activePos = ctx.active.position;

        // fuoco: palla pesata col giocatore attivo + anticipo sulla velocità della palla
        this.anticipation.copy(ctx.ball.velocity).setY(0).multiplyScalar(0.35);
        const aLen = this.anticipation.length();
        if (aLen > 6) this.anticipation.multiplyScalar(6 / aLen);

        this.targetLook
          .copy(ballPos).multiplyScalar(0.62)
          .addScaledVector(activePos, 0.38)
          .add(this.anticipation);
        this.targetLook.y = Math.max(0.8, this.targetLook.y * 0.5 + 0.6);

        // telecronaca ravvicinata: dietro la linea laterale, segue lungo x
        this.targetPos.set(
          this.targetLook.x * 0.92,
          11.2 + ballPos.y * 0.25,
          this.targetLook.z * 0.55 + 16.8,
        );

        targetFov = ctx.active.sprinting ? 62 : 55;
        if (ctx.charging) targetFov -= 4; // leggera zoomata durante la carica
        break;
      }
    }

    if (this.cutPending) {
      // taglio netto: niente interpolazione su questo frame
      this.currentPos.copy(this.targetPos);
      this.currentLook.copy(this.targetLook);
      this.cutPending = false;
    } else {
      dampVec3(this.currentPos, this.targetPos, posLambda, dt);
      dampVec3(this.currentLook, this.targetLook, lookLambda, dt);
    }

    this.currentFov = damp(this.currentFov, targetFov, 4, dt);
    if (Math.abs(this.camera.fov - this.currentFov) > 0.01) {
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    }

    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLook);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
