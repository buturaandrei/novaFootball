import * as THREE from 'three';
import { GOAL_WIDTH, HALF_LENGTH, HALF_WIDTH, SPRINT_SPEED } from '../core/constants';
import type { Ball } from '../physics/Ball';
import type { Player } from '../entities/Player';
import type { ReplaySample } from './Recorder';

/**
 * Riproduzione del replay di un goal da 2 angolazioni:
 * 1) da dietro la porta, 2) laterale bassa — con slow-motion extra
 * sul momento dell'impatto (gli ultimi istanti prima del goal).
 */
export class ReplayDirector {
  private samples: ReplaySample[] = [];
  private cut = 0;
  private playT = 0;
  private startT = 0;
  private endT = 0;
  private goalSide = 1;
  private realElapsed = 0;
  active = false;

  // scratch
  private tmpBall = new THREE.Vector3();

  constructor(
    private players: Player[],
    private ball: Ball,
  ) {}

  start(samples: ReplaySample[], goalSide: number): void {
    this.samples = samples;
    this.goalSide = goalSide;
    this.cut = 0;
    this.active = true;
    this.realElapsed = 0;
    this.endT = samples[samples.length - 1].t;
    this.startT = Math.max(samples[0].t, this.endT - 2.2);
    this.playT = this.startT;
  }

  /** Avanza il replay; restituisce false quando è finito. */
  update(realDt: number, camera: THREE.PerspectiveCamera): boolean {
    if (!this.active) return false;

    // limite di sicurezza sulla durata totale del replay
    this.realElapsed += realDt;
    if (this.realElapsed > 12) {
      this.active = false;
      return false;
    }

    // slow-motion: 0.6x di base, 0.18x negli ultimi istanti (impatto)
    const remaining = this.endT - this.playT;
    const rate = remaining < 0.55 ? 0.18 : 0.6;
    this.playT += realDt * rate;

    if (this.playT >= this.endT) {
      this.cut++;
      if (this.cut >= 2) {
        this.active = false;
        return false;
      }
      this.playT = this.startT;
    }

    this.apply(this.playT, realDt);
    this.placeCamera(camera, realDt);
    return true;
  }

  /** Interpola e applica lo stato registrato a palla e giocatori. */
  private apply(t: number, dt: number): void {
    const s = this.samples;
    let i = 1;
    while (i < s.length - 1 && s[i].t < t) i++;
    const a = s[i - 1];
    const b = s[i];
    const k = THREE.MathUtils.clamp((t - a.t) / Math.max(1e-4, b.t - a.t), 0, 1);

    this.ball.position.lerpVectors(a.ball, b.ball, k);
    this.ball.mesh.position.copy(this.ball.position);

    const sampleDt = Math.max(1e-3, b.t - a.t);
    for (let p = 0; p < this.players.length; p++) {
      const player = this.players[p];
      const ax = a.players[p * 4], ay = a.players[p * 4 + 1], az = a.players[p * 4 + 2];
      const bx = b.players[p * 4], by = b.players[p * 4 + 1], bz = b.players[p * 4 + 2];
      player.position.set(
        THREE.MathUtils.lerp(ax, bx, k),
        THREE.MathUtils.lerp(ay, by, k),
        THREE.MathUtils.lerp(az, bz, k),
      );
      player.facing = THREE.MathUtils.lerp(a.players[p * 4 + 3], b.players[p * 4 + 3], k);
      player.rig.root.position.copy(player.position);
      player.rig.root.rotation.y = player.facing;
      // corsa ricostruita dalla velocità tra i campioni
      const speed = Math.hypot(bx - ax, bz - az) / sampleDt;
      player.rig.animate(dt, speed, SPRINT_SPEED, player.position.y < 0.05, 0, 0);
    }
  }

  private placeCamera(camera: THREE.PerspectiveCamera, dt: number): void {
    const ballPos = this.tmpBall.copy(this.ball.position);
    if (this.cut === 0) {
      // dietro la porta (sulla linea, sopra la traversa): l'azione che arriva
      camera.position.set(
        this.goalSide * (HALF_LENGTH - 1.2),
        3.6,
        THREE.MathUtils.clamp(ballPos.z * 0.35, -GOAL_WIDTH, GOAL_WIDTH),
      );
      camera.fov = THREE.MathUtils.damp(camera.fov, 52, 3, dt);
    } else {
      // laterale bassa: pelo d'erba olografica
      camera.position.set(
        THREE.MathUtils.clamp(ballPos.x * 0.75 + this.goalSide * 4, -HALF_LENGTH + 4, HALF_LENGTH - 4),
        1.1,
        HALF_WIDTH + 7,
      );
      camera.fov = THREE.MathUtils.damp(camera.fov, 42, 3, dt);
    }
    camera.updateProjectionMatrix();
    camera.lookAt(ballPos.x, Math.max(0.6, ballPos.y), ballPos.z);
  }
}
