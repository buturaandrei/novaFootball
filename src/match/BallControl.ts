import * as THREE from 'three';
import {
  BALL_RADIUS,
  CONTROL_LOSE_RADIUS,
  CONTROL_MAX_BALL_SPEED,
  CONTROL_RADIUS,
  GRAVITY,
  KICK_CHARGE_TIME,
  KICK_COOLDOWN,
  LOB_MAX_TIME,
  LOB_MIN_TIME,
  PASS_MAX_SPEED,
  PASS_MIN_SPEED,
} from '../core/constants';
import type { Ball } from '../physics/Ball';
import type { Player } from '../entities/Player';

export interface KickInfo {
  player: Player;
  power: number; // 0..1
  level: number; // 1..3
  velocity: THREE.Vector3;
}

export interface PassInfo {
  passer: Player;
  receiver: Player;
  lob: boolean;
}

export interface BallControlEvents {
  onKick?: (info: KickInfo) => void;
  onPass?: (info: PassInfo) => void;
  onPossession?: (player: Player | null) => void;
}

/**
 * Possesso e controllo palla: aggancio "magnetico" leggero in dribbling,
 * tiro caricato a 3 livelli, passaggio rasoterra e filtrante alto con
 * anticipo sul movimento del compagno, presa del portiere (palla in mano),
 * deflessioni sul corpo dei giocatori senza possesso.
 */
export class BallControl {
  owner: Player | null = null;
  /** Portiere che tiene la palla in mano (il possesso è bloccato). */
  heldBy: Player | null = null;
  charge = 0;
  charging = false;
  events: BallControlEvents = {};

  private cooldowns = new Map<Player, number>();

  // scratch
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
  private tmpC = new THREE.Vector3();

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

    if (this.heldBy) {
      // palla in presa: nessun possesso conteso, la palla segue le mani
      this.pinHeldBall();
      this.charging = false;
      this.charge = 0;
      return;
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

  /** Toglie il possesso (contrasto vinto, fallo) con cooldown sui giocatori indicati. */
  releaseOwner(...cooldownPlayers: Player[]): void {
    this.setOwner(null);
    this.charging = false;
    this.charge = 0;
    for (const p of cooldownPlayers) this.cooldowns.set(p, KICK_COOLDOWN * 1.6);
  }

  /** Il portiere blocca la palla in presa. */
  hold(gk: Player): void {
    this.heldBy = gk;
    this.setOwner(null);
    this.charging = false;
    this.charge = 0;
    this.ball.velocity.set(0, 0, 0);
    this.ball.spin.set(0, 0, 0);
    this.pinHeldBall();
  }

  /** Tiene la palla incollata alle mani del portiere. */
  pinHeldBall(): void {
    if (!this.heldBy) return;
    const gk = this.heldBy;
    const fwd = gk.forward(this.tmpA);
    this.ball.position.copy(gk.position).addScaledVector(fwd, 0.5);
    this.ball.position.y = 1.15;
    this.ball.velocity.copy(gk.velocity);
    this.ball.mesh.position.copy(this.ball.position);
  }

  /** Rilascio/rinvio dalla presa: passaggio diretto a un compagno. */
  throwTo(receiver: Player): void {
    const gk = this.heldBy;
    if (!gk) return;
    this.heldBy = null;
    this.launchPass(gk, receiver, false);
  }

  /** Imposta direttamente il possesso (es. battuta di punizione). */
  givePossession(p: Player): void {
    this.heldBy = null;
    this.cooldowns.delete(p);
    this.setOwner(p);
    const fwd = p.forward(this.tmpA);
    this.ball.position.copy(p.position).addScaledVector(fwd, 0.8);
    this.ball.position.y = BALL_RADIUS;
    this.ball.velocity.set(0, 0, 0);
    this.ball.spin.set(0, 0, 0);
    this.ball.inGoal = false;
  }

  private updatePossession(): void {
    const ballPos = this.ball.position;

    // perdita del possesso se la palla scappa
    if (this.owner) {
      if (this.owner.action !== 'normale') {
        this.setOwner(null);
      } else {
        const d = this.tmpA.copy(ballPos).sub(this.owner.position).setY(0).length();
        if (d > CONTROL_LOSE_RADIUS || ballPos.y > 1.4) this.setOwner(null);
      }
    }

    if (!this.owner) {
      let best: Player | null = null;
      let bestDist = CONTROL_RADIUS;
      for (const p of this.players) {
        if (this.cooldowns.has(p) || p.action !== 'normale') continue;
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

  /**
   * Passaggio del giocatore attivo: sceglie il compagno migliore nella
   * direzione richiesta (o di sguardo) e anticipa il suo movimento.
   * `lob` = filtrante alto con traiettoria balistica oltre il ricevitore.
   */
  pass(passer: Player, preferDir: THREE.Vector3 | null, lob: boolean): boolean {
    if (this.owner !== passer) return false;
    const receiver = this.choosePassTarget(passer, preferDir, lob);
    if (!receiver) return false;
    this.launchPass(passer, receiver, lob);
    return true;
  }

  private choosePassTarget(passer: Player, preferDir: THREE.Vector3 | null, lob: boolean): Player | null {
    const dir = this.tmpA;
    if (preferDir && preferDir.lengthSq() > 0.09) {
      dir.copy(preferDir).setY(0).normalize();
    } else {
      passer.forward(dir);
    }

    let best: Player | null = null;
    let bestScore = -Infinity;
    for (const p of this.players) {
      if (p === passer || p.team !== passer.team || p.action !== 'normale') continue;
      const to = this.tmpB.copy(p.position).sub(passer.position).setY(0);
      const dist = to.length();
      if (dist < 2 || dist > 45) continue;
      to.normalize();
      const align = to.dot(dir);
      if (align < -0.1) continue;
      // preferenza: allineamento, distanza media, filtrante premia i compagni avanzati
      const idealDist = lob ? 18 : 11;
      let score = align * 3 - Math.abs(dist - idealDist) / 14;
      if (p.role === 'portiere') score -= 1.5; // retropassaggio solo se conviene davvero
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    return best;
  }

  private launchPass(passer: Player, receiver: Player, lob: boolean): void {
    const ball = this.ball;
    const from = ball.position;

    if (lob) {
      // filtrante alto: atterra leggermente oltre il ricevitore, verso
      // la porta avversaria (anticipo sul movimento del compagno)
      const attackSign = receiver.team === 0 ? 1 : -1;
      const target = this.tmpA.copy(receiver.position);
      const horizDist0 = this.tmpB.copy(target).sub(from).setY(0).length();
      const t = THREE.MathUtils.clamp(horizDist0 / 16, LOB_MIN_TIME, LOB_MAX_TIME);
      target.addScaledVector(receiver.velocity, t); // anticipo
      target.x += attackSign * 2.5;
      const delta = this.tmpB.copy(target).sub(from);
      const vel = this.tmpC.set(delta.x / t, GRAVITY * t * 0.5 + (0 - from.y) / t, delta.z / t);
      ball.kick(vel.clone(), new THREE.Vector3());
    } else {
      // rasoterra teso, con anticipo iterato sul tempo di volo
      const target = this.tmpA.copy(receiver.position);
      let dist = this.tmpB.copy(target).sub(from).setY(0).length();
      let speed = THREE.MathUtils.clamp(10 + dist * 0.6, PASS_MIN_SPEED, PASS_MAX_SPEED);
      const t = dist / speed;
      target.addScaledVector(receiver.velocity, t); // anticipo
      const delta = this.tmpB.copy(target).sub(from).setY(0);
      dist = delta.length();
      speed = THREE.MathUtils.clamp(10 + dist * 0.6, PASS_MIN_SPEED, PASS_MAX_SPEED);
      const vel = delta.normalize().multiplyScalar(speed);
      ball.kick(new THREE.Vector3(vel.x, 0.6, vel.z), new THREE.Vector3());
    }

    this.setOwner(null);
    this.cooldowns.set(passer, KICK_COOLDOWN);
    passer.rig.kickPose();
    this.events.onPass?.({ passer, receiver, lob });
  }
}
