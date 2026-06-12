import * as THREE from 'three';
import {
  GK_CATCH_MAX_SPEED,
  GK_CLAIM_RADIUS,
  GK_DIVE_SPEED,
  GK_HOLD_TIME,
  GK_LINE_DISTANCE,
  GK_REACH,
  GOAL_HEIGHT,
  GOAL_WIDTH,
  GRAVITY,
  HALF_LENGTH,
} from '../core/constants';
import type { Ball } from '../physics/Ball';
import type { Player, PlayerCommand } from '../entities/Player';
import type { BallControl } from '../match/BallControl';
import type { Team } from '../match/Team';

export interface GoalkeeperEvents {
  onSave?: (gk: Player, caught: boolean) => void;
  onDistribute?: (gk: Player, receiver: Player) => void;
}

type GkState = 'posizione' | 'uscita' | 'tuffo' | 'presa';

/**
 * IA dedicata del portiere: piazzamento sull'arco palla-porta, uscite sulle
 * palle vaganti in area, tuffi calcolati sulla traiettoria del tiro
 * (la parabilità dipende da velocità, angolo e altezza), prese, respinte
 * e rinvio a un compagno.
 */
export class Goalkeeper {
  state: GkState = 'posizione';
  events: GoalkeeperEvents = {};

  private holdTimer = 0;
  private diveCooldown = 0;
  private cmdMove = new THREE.Vector3();
  private readonly cmd: PlayerCommand;

  // scratch
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();

  constructor(
    readonly player: Player,
    private team: Team,
    private ball: Ball,
    private ballControl: BallControl,
  ) {
    this.cmd = { moveDir: this.cmdMove, sprint: false, jumpPressed: false };
  }

  /** Linea di porta difesa (x con segno). */
  private get goalX(): number {
    return this.team.defendsSide * HALF_LENGTH;
  }

  update(dt: number): void {
    const gk = this.player;
    this.diveCooldown = Math.max(0, this.diveCooldown - dt);

    // palla in presa: aspetta e rinvia
    if (this.ballControl.heldBy === gk) {
      this.state = 'presa';
      this.holdTimer -= dt;
      this.cmdMove.set(0, 0, 0);
      // guarda verso il centro campo
      this.faceBall();
      if (this.holdTimer <= 0) this.distribute();
      gk.update(dt, this.cmd);
      return;
    }

    if (gk.action === 'tuffo' || gk.action === 'rialzo' || gk.action === 'stordito') {
      // durante tuffo/rialzata prova comunque la presa/respinta
      if (gk.action === 'tuffo') this.trySave();
      gk.update(dt, null);
      return;
    }

    this.state = 'posizione';

    // i tiri Flux non si fermano con la parata normale: la gestisce la
    // sequenza cinematica (parata Flux)
    const fluxIncoming = this.ball.fluxColor !== null;

    // tiro in arrivo? calcola l'intercetto ed eventualmente tuffati
    if (!fluxIncoming && this.diveCooldown <= 0 && this.detectShotAndDive()) {
      gk.update(dt, null);
      return;
    }

    // palla vagante vicino alla porta → uscita
    const ballDistToGoal = Math.hypot(this.ball.position.x - this.goalX, this.ball.position.z);
    const ballLoose = !this.ballControl.owner && !this.ballControl.heldBy;
    const ballSlow = this.ball.velocity.length() < 8;
    if (ballLoose && ballSlow && ballDistToGoal < GK_CLAIM_RADIUS && this.ball.position.y < 1.6) {
      this.state = 'uscita';
      this.moveToward(this.ball.position, true);
      // raccolta: palla a portata → presa
      const d = this.tmpA.copy(this.ball.position).sub(gk.position).setY(0).length();
      if (d < 0.9) {
        this.ballControl.hold(gk);
        this.holdTimer = GK_HOLD_TIME;
        this.events.onSave?.(gk, true);
      }
      gk.update(dt, this.cmd);
      return;
    }

    // possesso del portiere stesso (palla agganciata coi piedi) → rinvia subito
    if (this.ballControl.owner === gk) {
      this.ballControl.hold(gk);
      this.holdTimer = GK_HOLD_TIME * 0.7;
      gk.update(dt, null);
      return;
    }

    // piazzamento: sull'arco tra centro porta e palla, entro lo specchio
    const t = THREE.MathUtils.clamp(1 - Math.abs(this.ball.position.x - this.goalX) / HALF_LENGTH, 0, 1);
    const targetZ = THREE.MathUtils.clamp(
      this.ball.position.z * (0.25 + 0.35 * t),
      -GOAL_WIDTH * 0.42,
      GOAL_WIDTH * 0.42,
    );
    const targetX = this.goalX - this.team.defendsSide * GK_LINE_DISTANCE;
    this.moveToward(this.tmpB.set(targetX, 0, targetZ), false);
    this.faceBall();
    gk.update(dt, this.cmd);
  }

  private faceBall(): void {
    const gk = this.player;
    const speed = Math.hypot(gk.velocity.x, gk.velocity.z);
    if (speed < 1) {
      gk.facing = Math.atan2(this.ball.position.x - gk.position.x, this.ball.position.z - gk.position.z);
    }
  }

  private moveToward(target: THREE.Vector3, sprint: boolean): void {
    const gk = this.player;
    const to = this.tmpA.copy(target).sub(gk.position).setY(0);
    const dist = to.length();
    if (dist < 0.25) {
      this.cmdMove.set(0, 0, 0);
      this.cmd.sprint = false;
      return;
    }
    to.normalize().multiplyScalar(Math.min(1, dist / 1.5));
    this.cmdMove.copy(to);
    this.cmd.sprint = sprint && dist > 3;
  }

  /**
   * Rileva un tiro diretto verso la porta e calcola il punto di intercetto
   * sulla linea. Se è raggiungibile solo in tuffo, si tuffa; se la velocità
   * laterale richiesta supera quella del tuffo, il tiro non è parabile.
   */
  private detectShotAndDive(): boolean {
    const ball = this.ball;
    const gk = this.player;
    const side = this.team.defendsSide;

    const vx = ball.velocity.x;
    if (Math.abs(vx) < 6 || Math.sign(vx) !== side) return false; // non viaggia verso la porta
    const planeX = this.goalX - side * 0.8; // poco davanti alla linea
    const tx = (planeX - ball.position.x) / vx;
    if (tx < 0.04 || tx > 1.3) return false;

    // punto d'arrivo previsto (z lineare, y balistica)
    const iz = ball.position.z + ball.velocity.z * tx;
    const iy = ball.position.y + ball.velocity.y * tx - 0.5 * GRAVITY * tx * tx;
    if (Math.abs(iz) > GOAL_WIDTH / 2 + 1.2 || iy > GOAL_HEIGHT + 1 || iy < -0.5) return false;

    // il portiere può arrivarci? velocità laterale richiesta vs tuffo
    const dz = iz - gk.position.z;
    const dy = Math.max(0.2, iy) - 1.0; // mani a ~1m da fermo
    const required = Math.hypot(dz, Math.max(0, dy)) / tx;
    if (required > GK_DIVE_SPEED) return false; // imparabile: troppo angolato/veloce

    if (required < 2.2 && Math.abs(dz) < 0.9 && iy < 1.8) {
      // palla addosso: resta in piedi, la presa avviene in trySave
      this.trySave();
      return false;
    }

    // tuffo: velocità verso l'intercetto
    const vz = dz / tx;
    const vyNeed = (Math.max(0.4, iy) - 1.0) / tx + 0.5 * GRAVITY * tx;
    const diveVel = new THREE.Vector3(0, THREE.MathUtils.clamp(vyNeed, 1.5, 9), vz);
    gk.startDive(diveVel, Math.max(0.45, tx + 0.15));
    this.state = 'tuffo';
    this.diveCooldown = 1.2;
    return true;
  }

  /** Presa o respinta quando la palla è a portata delle mani. */
  trySave(): void {
    const gk = this.player;
    const ball = this.ball;
    if (this.ballControl.heldBy) return;
    if (ball.fluxColor !== null) return; // solo la parata Flux ferma un tiro Flux

    const hands = this.tmpA.copy(gk.position);
    hands.y += gk.action === 'tuffo' ? 1.0 : 1.1;
    const dist = this.tmpB.copy(ball.position).sub(hands).length();
    if (dist > GK_REACH) return;

    const speed = ball.velocity.length();
    const incoming = Math.sign(ball.velocity.x) === this.team.defendsSide;
    if (!incoming && speed > 4) return;

    if (speed <= GK_CATCH_MAX_SPEED) {
      // presa!
      this.ballControl.hold(gk);
      this.holdTimer = GK_HOLD_TIME;
      this.events.onSave?.(gk, true);
    } else {
      // respinta: la palla rimbalza via dalla porta, verso l'esterno
      const away = -this.team.defendsSide;
      ball.velocity.x = away * Math.abs(ball.velocity.x) * 0.45;
      ball.velocity.y = Math.abs(ball.velocity.y) * 0.3 + 4;
      ball.velocity.z += Math.sign(ball.position.z || 1) * 3 + gk.velocity.z * 0.5;
      ball.spin.multiplyScalar(0.2);
      this.events.onSave?.(gk, false);
    }
  }

  private distribute(): void {
    const gk = this.player;
    // rinvio al compagno di movimento più libero (il più lontano dalla palla avversaria va bene per ora: il più vicino a metà campo)
    let best: Player | null = null;
    let bestScore = -Infinity;
    for (const p of this.team.fieldPlayers) {
      if (p.action !== 'normale') continue;
      const score = -Math.abs(p.position.x - 0) - Math.abs(p.position.z) * 0.3;
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (!best) best = this.team.fieldPlayers[0];
    gk.rig.playActionClip?.('rinvio');
    this.ballControl.throwTo(best);
    this.events.onDistribute?.(gk, best);
    this.state = 'posizione';
  }
}
