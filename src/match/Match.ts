import * as THREE from 'three';
import type { Ball } from '../physics/Ball';
import type { Player } from '../entities/Player';

export interface TeamInfo {
  name: string;
  /** Lato difeso: -1 difende la porta a x negativo, +1 quella a x positivo. */
  defendsSide: number;
  color: number;
}

export interface MatchEvents {
  onGoal?: (scoringTeam: number, ballPos: THREE.Vector3) => void;
  onKickoff?: () => void;
}

type MatchPhase = 'playing' | 'goalCelebration';

/**
 * Stato della partita (milestone 1: punteggio, goal e kickoff;
 * tempi di gioco, falli e regole complete nelle milestone successive).
 */
export class Match {
  readonly teams: TeamInfo[];
  readonly score = [0, 0];
  phase: MatchPhase = 'playing';
  events: MatchEvents = {};

  private celebrationTimer = 0;

  constructor(
    private ball: Ball,
    private players: Player[],
    teams: TeamInfo[],
  ) {
    this.teams = teams;
    this.ball.events.onGoal = (side) => this.handleGoal(side);
  }

  private handleGoal(side: number): void {
    if (this.phase !== 'playing') return;
    // segna la squadra che NON difende quel lato
    const scorer = this.teams.findIndex((t) => t.defendsSide !== side);
    if (scorer >= 0) this.score[scorer]++;
    this.phase = 'goalCelebration';
    this.celebrationTimer = 3.2;
    this.events.onGoal?.(scorer, this.ball.position.clone());
  }

  kickoff(): void {
    this.ball.reset();
    for (const p of this.players) {
      const side = this.teams[p.team].defendsSide;
      p.position.set(side * 7, 0, p.team === 0 ? 0 : 0);
      p.velocity.set(0, 0, 0);
      p.facing = side === -1 ? Math.PI / 2 : -Math.PI / 2; // guarda verso il centro
      p.stamina = 100;
    }
    this.phase = 'playing';
    this.events.onKickoff?.();
  }

  update(dt: number): void {
    if (this.phase === 'goalCelebration') {
      this.celebrationTimer -= dt;
      if (this.celebrationTimer <= 0) this.kickoff();
    }
  }
}
