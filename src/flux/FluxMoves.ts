import * as THREE from 'three';
import {
  BALL_RADIUS,
  FLUX_SPRINT_DURATION,
  FLUX_SPRINT_FACTOR,
  HALF_LENGTH,
  HALF_WIDTH,
  PLAYER_RADIUS,
} from '../core/constants';
import type { AudioSystem } from '../audio/AudioSystem';
import type { Ball } from '../physics/Ball';
import type { BallControl } from '../match/BallControl';
import type { Player } from '../entities/Player';
import type { AfterImages } from '../vfx/AfterImages';
import type { ParticlePool } from '../vfx/ParticlePool';
import type { FluxProfile } from './FluxProfile';

/**
 * Esecuzione delle mosse Flux. Ogni energia ha meccaniche proprie:
 * - GELO:    scatto con scia polare; dribbling = guizzo fulmineo con
 *            after-image di ghiaccio (la palla resta incollata)
 * - OMBRA:   dribbling = vero teletrasporto corto attraverso l'avversario
 * - RUGGITO: dribbling = zampata con onda d'urto che sbilancia i vicini
 */
export class FluxMoves {
  private trailTimers = new Map<Player, number>();
  private trailColor = new Map<Player, number>();

  // scratch
  private tmpA = new THREE.Vector3();

  constructor(
    private ball: Ball,
    private ballControl: BallControl,
    private particles: ParticlePool,
    private afterImages: AfterImages,
    private audio: AudioSystem,
  ) {}

  /** Scatto Flux: burst di velocità con scia di sagome e particelle. */
  sprint(player: Player, profile: FluxProfile): void {
    player.applyBoost(FLUX_SPRINT_FACTOR, FLUX_SPRINT_DURATION);
    this.trailColor.set(player, profile.color);
    this.audio.fluxSurge(profile.id, false);
    this.particles.burst(this.tmpA.copy(player.position).setY(0.6), {
      count: 26,
      color: profile.color,
      speed: 5,
      life: 0.5,
      size: 1.3,
      gravity: 1,
    });
  }

  /** Dribbling Flux: evasione che supera un avversario, per identità. */
  dribble(player: Player, profile: FluxProfile, opponents: Player[]): void {
    const fwd = player.forward(this.tmpA.set(0, 0, 0));
    const hadBall = this.ballControl.owner === player;
    this.audio.fluxSurge(profile.id, true);

    switch (profile.id) {
      case 'ombra': {
        // teletrasporto corto: sparisce e riappare oltre il difensore
        const from = player.position.clone();
        this.particles.burst(from.clone().setY(1), {
          count: 36, color: profile.color, speed: 4, life: 0.5, size: 1.4, gravity: 0.5,
        });
        for (let i = 0; i < 3; i++) {
          this.afterImages.spawn(
            from.clone().addScaledVector(fwd, i * 1.4),
            player.facing,
            profile.color,
            0.5,
          );
        }
        player.position.addScaledVector(fwd, 5.5);
        player.position.x = THREE.MathUtils.clamp(player.position.x, -HALF_LENGTH + PLAYER_RADIUS, HALF_LENGTH - PLAYER_RADIUS);
        player.position.z = THREE.MathUtils.clamp(player.position.z, -HALF_WIDTH + PLAYER_RADIUS, HALF_WIDTH - PLAYER_RADIUS);
        player.velocity.copy(fwd).multiplyScalar(9);
        if (hadBall) {
          this.ball.position.copy(player.position).addScaledVector(fwd, 0.8);
          this.ball.position.y = BALL_RADIUS;
          this.ball.velocity.copy(player.velocity);
        }
        this.particles.burst(player.position.clone().setY(1), {
          count: 36, color: profile.color, speed: 4.5, life: 0.5, size: 1.4, gravity: 0.5,
        });
        break;
      }
      case 'ruggito': {
        // zampata: accelerazione ferina + onda d'urto che sbilancia
        player.applyBoost(1.5, 0.9);
        player.velocity.addScaledVector(fwd, 9);
        this.trailColor.set(player, profile.color);
        let nearest: Player | null = null;
        let nearestDist = Infinity;
        for (const o of opponents) {
          const d = o.position.distanceTo(player.position);
          if (d < 3.4 && o.action === 'normale') {
            const away = this.tmpA.copy(o.position).sub(player.position).setY(0).normalize();
            o.velocity.addScaledVector(away, 9);
            o.velocity.y = Math.max(o.velocity.y, 3);
            o.onGround = false;
            if (d < nearestDist) {
              nearestDist = d;
              nearest = o;
            }
          }
        }
        if (nearest) nearest.stun();
        this.particles.burst(player.position.clone().setY(0.4), {
          count: 48, color: profile.color, speed: 8, life: 0.55, size: 1.5, gravity: 6,
        });
        if (hadBall) this.ball.velocity.addScaledVector(fwd, 6);
        break;
      }
      case 'gelo':
      default: {
        // passo di brina: guizzo fulmineo con after-image, palla incollata
        player.applyBoost(1.35, 0.55);
        player.velocity.copy(fwd).multiplyScalar(19);
        this.trailColor.set(player, profile.color);
        for (let i = 0; i < 4; i++) {
          this.afterImages.spawn(
            player.position.clone().addScaledVector(fwd, -i * 0.5),
            player.facing,
            profile.color,
            0.45,
          );
        }
        if (hadBall) {
          this.ball.velocity.copy(player.velocity).multiplyScalar(1.02);
          this.ball.velocity.y = 0;
        }
        this.particles.burst(player.position.clone().setY(0.5), {
          count: 30, color: profile.accent, speed: 4, life: 0.45, size: 1.1, gravity: 2,
        });
        break;
      }
    }
  }

  /** Scie per i giocatori con boost attivo (sagome + particelle). */
  update(dt: number, players: Player[]): void {
    for (const p of players) {
      if (p.boostTimer > 0) {
        const timer = (this.trailTimers.get(p) ?? 0) - dt;
        if (timer <= 0) {
          const color = this.trailColor.get(p) ?? 0x6ef0ff;
          this.afterImages.spawn(p.position, p.facing, color, 0.35);
          this.particles.burst(this.tmpA.copy(p.position).setY(0.4), {
            count: 3, color, speed: 1.5, life: 0.4, size: 0.9, gravity: 1,
          });
          this.trailTimers.set(p, 0.08);
        } else {
          this.trailTimers.set(p, timer);
        }
      }
    }
  }
}
