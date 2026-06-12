import * as THREE from 'three';
import {
  FOUL_BODY_RADIUS,
  SLIDE_DURATION,
  SLIDE_REACH,
  TACKLE_COOLDOWN,
  TACKLE_LUNGE,
  TACKLE_REACH,
  TACKLE_WINDOW,
} from '../core/constants';
import type { Ball } from '../physics/Ball';
import type { Player } from '../entities/Player';
import type { BallControl } from './BallControl';

export interface TackleEvents {
  onWin?: (tackler: Player, carrier: Player | null) => void;
  onFoul?: (offender: Player, victim: Player, spot: THREE.Vector3) => void;
}

interface ActiveTackle {
  player: Player;
  type: 'piedi' | 'scivolata';
  timer: number;
  resolved: boolean;
}

/**
 * Contrasti con finestra di timing: in piedi (slancio corto) e in
 * scivolata (corsa a terra). Se si prende la palla il contrasto è pulito;
 * se si colpisce il corpo dell'avversario senza palla è fallo.
 */
export class Tackles {
  events: TackleEvents = {};
  private active: ActiveTackle[] = [];
  private cooldowns = new Map<Player, number>();

  // scratch
  private tmpA = new THREE.Vector3();

  constructor(
    private ball: Ball,
    private ballControl: BallControl,
  ) {}

  /** Contrasto in piedi: slancio in avanti con finestra breve. */
  standing(tackler: Player): boolean {
    if (this.cooldowns.has(tackler) || tackler.action !== 'normale' || !tackler.onGround) return false;
    if (this.ballControl.owner === tackler) return false;
    const dir = tackler.forward(this.tmpA);
    tackler.velocity.x += dir.x * TACKLE_LUNGE;
    tackler.velocity.z += dir.z * TACKLE_LUNGE;
    if (tackler.rig.playActionClip) tackler.rig.playActionClip('contrasto');
    else tackler.rig.kickPose();
    this.active.push({ player: tackler, type: 'piedi', timer: TACKLE_WINDOW, resolved: false });
    this.cooldowns.set(tackler, TACKLE_COOLDOWN);
    return true;
  }

  /**
   * Scivolata: il giocatore parte a terra nella direzione di sguardo.
   * Motion warping: la velocità si adatta alla distanza dalla palla,
   * così la corsa a terra arriva DOVE serve (né corta né lunghissima).
   */
  slide(tackler: Player): boolean {
    if (this.cooldowns.has(tackler) || tackler.action !== 'normale' || !tackler.onGround) return false;
    if (this.ballControl.owner === tackler) return false;
    const dist = this.tmpA.copy(this.ball.position).sub(tackler.position).setY(0).length();
    const speed = THREE.MathUtils.clamp((dist * 0.92) / SLIDE_DURATION, 9, 15.5);
    tackler.startSlide(speed);
    this.active.push({ player: tackler, type: 'scivolata', timer: SLIDE_DURATION, resolved: false });
    this.cooldowns.set(tackler, TACKLE_COOLDOWN * 1.4);
    return true;
  }

  update(dt: number): void {
    for (const [p, t] of this.cooldowns) {
      const nt = t - dt;
      if (nt <= 0) this.cooldowns.delete(p);
      else this.cooldowns.set(p, nt);
    }

    for (let i = this.active.length - 1; i >= 0; i--) {
      const tk = this.active[i];
      tk.timer -= dt;
      if (!tk.resolved) this.resolve(tk);
      if (tk.timer <= 0 || tk.resolved) this.active.splice(i, 1);
    }
  }

  private resolve(tk: ActiveTackle): void {
    const tackler = tk.player;
    const reach = tk.type === 'scivolata' ? SLIDE_REACH : TACKLE_REACH;
    const carrier = this.ballControl.owner;
    if (this.ballControl.heldBy) return; // mai contrastare il portiere in presa

    // palla raggiungibile → contrasto pulito: la palla schizza via
    const distBall = this.tmpA.copy(this.ball.position).sub(tackler.position).setY(0).length();
    if (distBall < reach && this.ball.position.y < 1.2) {
      const dir = tackler.forward(this.tmpA);
      const knock = dir.multiplyScalar(7.5);
      this.ball.kick(
        new THREE.Vector3(knock.x, 1.8, knock.z),
        new THREE.Vector3(),
      );
      const prevCarrier = carrier;
      if (prevCarrier) this.ballControl.releaseOwner(prevCarrier);
      tk.resolved = true;
      this.events.onWin?.(tackler, prevCarrier);
      return;
    }

    // corpo dell'avversario colpito senza palla → fallo
    // (la scivolata sbagliata è violenta: la vittima va giù in ragdoll)
    if (carrier && carrier.team !== tackler.team) {
      const distBody = this.tmpA.copy(carrier.position).sub(tackler.position).setY(0).length();
      if (distBody < FOUL_BODY_RADIUS) {
        tk.resolved = true;
        if (tk.type === 'scivolata') {
          const push = this.tmpA.copy(carrier.position).sub(tackler.position).setY(0).normalize();
          carrier.knockdown(new THREE.Vector3(push.x * 6.5, 3.5, push.z * 6.5));
        } else {
          carrier.stun();
        }
        this.ballControl.releaseOwner(carrier, tackler);
        this.events.onFoul?.(tackler, carrier, carrier.position.clone());
      }
    }
  }
}
