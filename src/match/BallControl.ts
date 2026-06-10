import * as THREE from 'three';
import {
  BALL_RADIUS,
  CONTROL_LOSE_RADIUS,
  CONTROL_MAX_BALL_SPEED,
  CONTROL_RADIUS,
  KICK_CHARGE_TIME,
  KICK_COOLDOWN,
} from '../core/constants';
import type { Ball } from '../physics/Ball';
import type { Player } from '../entities/Player';

export interface KickInfo {
  player: Player;
  power: number; // 0..1
  level: number; // 1..3
  velocity: THREE.Vector3;
}

export interface BallControlEvents {
  onKick?: (info: KickInfo) => void;
  onPossession?: (player: Player | null) => void;
}

/**
 * Possesso e controllo palla: aggancio "magnetico" leggero in dribbling,
 * tiro caricato a 3 livelli con effetto (lo spin fa curvare la palla),
 * deflessioni sul corpo dei giocatori senza possesso.
 */
export class BallControl {
  owner: Player | null = null;
  charge = 0;
  charging = false;
  events: BallControlEvents = {};

  private cooldowns = new Map<Player, number>();

  // scratch
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();

  constructor(
    private ball: Ball,
    private players: Player[],
  ) {}

  /** Carica corrente solo se sta caricando, per HUD/anello. */
  get visibleCharge(): number {
    return this.charging ? Math.max(0.08, this.charge) : 0;
  }

  update(dt: number, activePlayer: Player, kickHeld: boolean, kickReleased: boolean, moveX = 0): void {
    for (const [p, t] of this.cooldowns) {
      const nt = t - dt;
      if (nt <= 0) this.cooldowns.delete(p);
      else this.cooldowns.set(p, nt);
    }

    if (this.ball.inGoal) {
      this.setOwner(null);
      this.charging = false;
      this.charge = 0;
      return;
    }

    this.updatePossession();
    this.updateDribble(dt);
    this.deflectOffBodies();

    // la carica del tiro è permessa solo al giocatore attivo in possesso
    if (this.owner === activePlayer) {
      if (kickHeld) {
        this.charging = true;
        this.charge = Math.min(1, this.charge + dt / KICK_CHARGE_TIME);
      }
      if (kickReleased && this.charging) {
        this.kick(activePlayer, this.charge, moveX);
        this.charging = false;
        this.charge = 0;
      }
    } else {
      this.charging = false;
      this.charge = 0;
    }
    activePlayer.kickCharge = this.owner === activePlayer && this.charging ? this.charge : 0;
    for (const p of this.players) {
      if (p !== activePlayer) p.kickCharge = 0;
    }
  }

  private setOwner(p: Player | null): void {
    if (this.owner === p) return;
    this.owner = p;
    this.events.onPossession?.(p);
  }

  private updatePossession(): void {
    const ballPos = this.ball.position;

    // perdita del possesso se la palla scappa
    if (this.owner) {
      const d = this.tmpA.copy(ballPos).sub(this.owner.position).setY(0).length();
      if (d > CONTROL_LOSE_RADIUS || ballPos.y > 1.4) {
        this.setOwner(null);
      }
    }

    if (!this.owner) {
      let best: Player | null = null;
      let bestDist = CONTROL_RADIUS;
      for (const p of this.players) {
        if (this.cooldowns.has(p)) continue;
        const d = this.tmpA.copy(ballPos).sub(p.position).setY(0).length();
        if (d > bestDist || ballPos.y > 1.3) continue;
        const relSpeed = this.tmpB.copy(this.ball.velocity).sub(p.velocity).length();
        if (relSpeed > CONTROL_MAX_BALL_SPEED) continue;
        best = p;
        bestDist = d;
      }
      if (best) this.setOwner(best);
    }
  }

  /** Magnetismo leggero: la palla insegue un punto davanti ai piedi. */
  private updateDribble(dt: number): void {
    const o = this.owner;
    if (!o) return;
    const target = o.forward(this.tmpA).multiplyScalar(0.8).add(o.position);
    target.y = BALL_RADIUS;

    const toTarget = this.tmpB.copy(target).sub(this.ball.position);
    toTarget.y = 0;

    // velocità desiderata: quella del giocatore + correzione a molla
    const desired = toTarget.multiplyScalar(9).add(o.velocity);
    desired.y = this.ball.velocity.y;
    // correzione limitata: il controllo è "leggero", non una colla
    const maxCorr = 30 * dt;
    const dv = desired.sub(this.ball.velocity);
    if (dv.length() > maxCorr * 10) dv.setLength(maxCorr * 10);
    this.ball.velocity.addScaledVector(dv, Math.min(1, 12 * dt));
    // tiene la palla bassa durante il dribbling
    if (this.ball.position.y > BALL_RADIUS * 1.5 && this.ball.velocity.y > 0) {
      this.ball.velocity.y *= 0.8;
    }
  }

  /** Deflessione semplice sul corpo dei giocatori che non hanno la palla. */
  private deflectOffBodies(): void {
    for (const p of this.players) {
      if (p === this.owner) continue;
      const diff = this.tmpA.copy(this.ball.position).sub(p.position);
      diff.y = this.ball.position.y - (p.position.y + 0.9);
      const dist = diff.length();
      const minDist = 0.55 + BALL_RADIUS;
      if (dist > minDist || dist < 1e-4) continue;
      const rel = this.tmpB.copy(this.ball.velocity).sub(p.velocity);
      const normal = diff.normalize();
      const vn = rel.dot(normal);
      if (vn < 0 && rel.length() > CONTROL_MAX_BALL_SPEED * 0.8) {
        // palla veloce: rimbalza sul corpo
        this.ball.velocity.addScaledVector(normal, -vn * 1.4);
        this.ball.velocity.multiplyScalar(0.65);
      }
    }
  }

  /**
   * Tiro caricato: 3 livelli di potenza visualizzati dall'anello.
   * Direzione = orientamento del giocatore; lo spostamento laterale
   * imprime effetto (la palla curva in volo).
   */
  private kick(player: Player, charge: number, moveX: number): void {
    if (this.owner !== player) return;
    const level = charge >= 0.99 ? 3 : charge >= 0.5 ? 2 : 1;

    const dir = player.forward(this.tmpA);
    const power = 13 + 17 * charge;
    const lift = charge < 0.18 ? 1.2 : 2.2 + 6.5 * charge;

    const vel = this.tmpB.copy(dir).multiplyScalar(power);
    vel.y = lift;
    vel.addScaledVector(player.velocity, 0.35);

    // effetto: spin verticale che fa curvare il tiro
    const spin = new THREE.Vector3(0, -moveX * 7 * charge, 0);

    this.ball.kick(vel, spin);
    this.setOwner(null);
    this.cooldowns.set(player, KICK_COOLDOWN);
    player.rig.kickPose();

    this.events.onKick?.({ player, power: charge, level, velocity: vel.clone() });
  }
}
