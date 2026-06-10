import * as THREE from 'three';
import { FREE_KICK_DISTANCE, HALF_DURATION, HALF_LENGTH, HALF_WIDTH } from '../core/constants';
import type { Ball } from '../physics/Ball';
import type { Player } from '../entities/Player';
import type { Team } from './Team';

export type MatchPhase =
  | 'playing'
  | 'goalCelebration'
  | 'freeKick'
  | 'halftime'
  | 'fulltime';

export interface MatchEvents {
  onGoal?: (scoringTeam: number, ballPos: THREE.Vector3) => void;
  onKickoff?: () => void;
  onFoul?: (offender: Player, victim: Player, spot: THREE.Vector3) => void;
  onFreeKickReady?: (taker: Player) => void;
  onHalftime?: () => void;
  onFulltime?: () => void;
}

/**
 * Stato e regole della partita: punteggio, due tempi con cronometro,
 * kickoff, falli con punizione semplificata, intervallo e fischio finale.
 */
export class Match {
  readonly teams: Team[];
  readonly score = [0, 0];
  phase: MatchPhase = 'playing';
  half = 1;
  /** Secondi rimanenti nel tempo corrente. */
  clock = HALF_DURATION;
  events: MatchEvents = {};
  /** Battitore della punizione corrente (anche per il kickoff del Game). */
  freeKickTaker: Player | null = null;
  freeKickTeam = -1;

  private phaseTimer = 0;
  private kickoffTeam = 0;

  constructor(
    private ball: Ball,
    teams: Team[],
  ) {
    this.teams = teams;
    this.ball.events.onGoal = (side) => this.handleGoal(side);
  }

  get allPlayers(): Player[] {
    return [...this.teams[0].players, ...this.teams[1].players];
  }

  private handleGoal(side: number): void {
    if (this.phase !== 'playing' && this.phase !== 'freeKick') return;
    // segna la squadra che NON difende quel lato
    const scorer = this.teams.findIndex((t) => t.defendsSide !== side);
    if (scorer >= 0) this.score[scorer]++;
    this.phase = 'goalCelebration';
    this.phaseTimer = 3.2;
    this.kickoffTeam = scorer >= 0 ? 1 - scorer : 0; // riparte chi ha subito
    this.events.onGoal?.(scorer, this.ball.position.clone());
  }

  /** Fallo: punizione semplificata dal punto del contatto. */
  foul(offender: Player, victim: Player, spot: THREE.Vector3): void {
    if (this.phase !== 'playing') return;
    this.phase = 'freeKick';
    this.phaseTimer = 0.9; // pausa fischio prima di sistemare la battuta
    this.freeKickTeam = victim.team;
    this.freeKickTaker = null;
    // il punto resta dentro il campo
    spot.x = THREE.MathUtils.clamp(spot.x, -HALF_LENGTH + 2, HALF_LENGTH - 2);
    spot.z = THREE.MathUtils.clamp(spot.z, -HALF_WIDTH + 2, HALF_WIDTH - 2);
    spot.y = 0;
    this.pendingSpot.copy(spot);
    this.events.onFoul?.(offender, victim, spot.clone());
  }

  private pendingSpot = new THREE.Vector3();

  /** Sistemazione della punizione: palla sul punto, avversari a distanza. */
  private setupFreeKick(): void {
    const spot = this.pendingSpot;
    this.ball.reset(spot.x, spot.z);

    const attackers = this.teams[this.freeKickTeam];
    const defenders = this.teams[1 - this.freeKickTeam];

    // gli avversari arretrano dal punto di battuta
    for (const p of defenders.players) {
      if (p.role === 'portiere') continue;
      const d = p.position.distanceTo(spot);
      if (d < FREE_KICK_DISTANCE) {
        const away = p.position.clone().sub(spot).setY(0);
        if (away.lengthSq() < 0.01) away.set(-defenders.defendsSide, 0, 0).negate();
        away.normalize();
        p.position.copy(spot).addScaledVector(away, FREE_KICK_DISTANCE);
        p.position.x = THREE.MathUtils.clamp(p.position.x, -HALF_LENGTH + 1, HALF_LENGTH - 1);
        p.position.z = THREE.MathUtils.clamp(p.position.z, -HALF_WIDTH + 1, HALF_WIDTH - 1);
        p.velocity.set(0, 0, 0);
      }
    }

    // battitore: il giocatore di movimento più vicino
    let best: Player | null = null;
    let bestDist = Infinity;
    for (const p of attackers.fieldPlayers) {
      const d = p.position.distanceTo(spot);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    if (best) {
      const goalDir = -attackers.defendsSide; // verso la porta avversaria
      best.position.set(spot.x - goalDir * 1.4, 0, spot.z);
      best.velocity.set(0, 0, 0);
      best.facing = Math.atan2(goalDir, 0);
      best.action = 'normale';
      this.freeKickTaker = best;
      this.events.onFreeKickReady?.(best);
    }
  }

  /** La punizione è stata battuta: si torna a giocare. */
  freeKickTaken(): void {
    if (this.phase === 'freeKick' && this.freeKickTaker) {
      this.phase = 'playing';
      this.freeKickTaker = null;
      this.freeKickTeam = -1;
    }
  }

  kickoff(): void {
    this.ball.reset();
    this.teams[0].placeForKickoff(this.kickoffTeam === 0);
    this.teams[1].placeForKickoff(this.kickoffTeam === 1);
    this.phase = 'playing';
    this.freeKickTaker = null;
    this.events.onKickoff?.();
  }

  /** Reset completo per una nuova partita. */
  restart(): void {
    this.score[0] = 0;
    this.score[1] = 0;
    this.half = 1;
    this.clock = HALF_DURATION;
    this.kickoffTeam = 0;
    this.kickoff();
  }

  update(dt: number): void {
    switch (this.phase) {
      case 'playing': {
        this.clock -= dt;
        if (this.clock <= 0) {
          this.clock = 0;
          if (this.half === 1) {
            this.phase = 'halftime';
            this.phaseTimer = 4;
            this.events.onHalftime?.();
          } else {
            this.phase = 'fulltime';
            this.events.onFulltime?.();
          }
        }
        break;
      }
      case 'goalCelebration': {
        this.phaseTimer -= dt;
        if (this.phaseTimer <= 0) this.kickoff();
        break;
      }
      case 'freeKick': {
        if (this.phaseTimer > 0) {
          this.phaseTimer -= dt;
          if (this.phaseTimer <= 0) this.setupFreeKick();
        }
        break;
      }
      case 'halftime': {
        this.phaseTimer -= dt;
        if (this.phaseTimer <= 0) {
          this.half = 2;
          this.clock = HALF_DURATION;
          this.kickoffTeam = 1; // il secondo tempo lo batte l'altra squadra
          this.kickoff();
        }
        break;
      }
      case 'fulltime':
      default:
        break;
    }
  }
}
