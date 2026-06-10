import * as THREE from 'three';
import { HALF_LENGTH, HALF_WIDTH } from '../core/constants';
import { Player } from '../entities/Player';
import type { RigColors } from '../entities/PlayerRig';

export interface TeamConfig {
  name: string;
  /** Lato difeso: -1 difende la porta a x negativo, +1 quella a x positivo. */
  defendsSide: number;
  color: number;
  colors: RigColors;
  gkColors: RigColors;
  /** 7 nomi: portiere + 6 di movimento (2 difensori, 3 centrocampisti, 1 punta). */
  roster: string[];
}

/**
 * Posizioni di formazione 2-3-1 espresse come frazioni:
 * x = profondità verso la propria porta (1 = sulla linea), z = larghezza.
 */
const FORMATION: { x: number; z: number }[] = [
  { x: 0.95, z: 0 },     // portiere
  { x: 0.62, z: -0.34 }, // difensore sinistro
  { x: 0.62, z: 0.34 },  // difensore destro
  { x: 0.34, z: -0.6 },  // ala sinistra
  { x: 0.38, z: 0 },     // mediano
  { x: 0.34, z: 0.6 },   // ala destra
  { x: 0.1, z: 0 },      // punta
];

/** Squadra completa: 6 giocatori di movimento in formazione 2-3-1 + portiere. */
export class Team {
  readonly config: TeamConfig;
  readonly players: Player[] = [];
  readonly goalkeeper: Player;
  readonly fieldPlayers: Player[] = [];

  constructor(config: TeamConfig, teamIndex: number) {
    this.config = config;
    for (let i = 0; i < 7; i++) {
      const role = i === 0 ? 'portiere' : 'campo';
      const colors = i === 0 ? config.gkColors : config.colors;
      const p = new Player(config.roster[i] ?? `${config.name} ${i}`, teamIndex, role, colors);
      this.players.push(p);
      if (role === 'campo') this.fieldPlayers.push(p);
    }
    this.goalkeeper = this.players[0];
  }

  get name(): string {
    return this.config.name;
  }

  get defendsSide(): number {
    return this.config.defendsSide;
  }

  get color(): number {
    return this.config.color;
  }

  /** Posizione di formazione in coordinate mondo per l'i-esimo giocatore. */
  formationPosition(index: number, out = new THREE.Vector3()): THREE.Vector3 {
    const f = FORMATION[index];
    return out.set(this.defendsSide * f.x * HALF_LENGTH, 0, f.z * HALF_WIDTH * 0.82);
  }

  /** Dispone la squadra per il kickoff; chi batte ha la punta sulla palla. */
  placeForKickoff(hasKickoff: boolean): void {
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      this.formationPosition(i, p.homePosition);
      p.position.copy(p.homePosition);
      // la punta della squadra che batte parte accanto alla palla
      if (hasKickoff && i === this.players.length - 1) {
        p.position.set(this.defendsSide * 1.2, 0, 0.6);
      }
      p.velocity.set(0, 0, 0);
      p.stamina = 100;
      p.action = 'normale';
      p.facing = this.defendsSide === -1 ? Math.PI / 2 : -Math.PI / 2; // verso il centro
      p.kickCharge = 0;
    }
  }
}
