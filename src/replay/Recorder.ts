import * as THREE from 'three';
import type { Ball } from '../physics/Ball';
import type { Player } from '../entities/Player';

const RATE = 20; // campionamenti al secondo
const WINDOW_SECONDS = 7;

export interface ReplaySample {
  t: number;
  ball: THREE.Vector3;
  /** [x, y, z, facing] per ogni giocatore. */
  players: Float32Array;
}

/**
 * Registratore ad anello dello stato di gioco (palla + giocatori) per i
 * replay automatici dei goal. Campiona a 20 Hz, finestra di ~7 secondi.
 */
export class Recorder {
  private samples: ReplaySample[] = [];
  private accumulator = 0;
  private time = 0;

  constructor(
    private players: Player[],
    private ball: Ball,
  ) {}

  update(dt: number): void {
    this.time += dt;
    this.accumulator += dt;
    if (this.accumulator < 1 / RATE) return;
    this.accumulator = 0;

    const data = new Float32Array(this.players.length * 4);
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      data[i * 4] = p.position.x;
      data[i * 4 + 1] = p.position.y;
      data[i * 4 + 2] = p.position.z;
      data[i * 4 + 3] = p.facing;
    }
    this.samples.push({ t: this.time, ball: this.ball.position.clone(), players: data });

    const cutoff = this.time - WINDOW_SECONDS;
    while (this.samples.length > 2 && this.samples[0].t < cutoff) this.samples.shift();
  }

  /** Ultimi `seconds` secondi registrati (almeno 2 campioni o null). */
  getWindow(seconds: number): ReplaySample[] | null {
    if (this.samples.length < 4) return null;
    const start = this.time - seconds;
    const win = this.samples.filter((s) => s.t >= start);
    return win.length >= 4 ? win.slice() : this.samples.slice();
  }

  get now(): number {
    return this.time;
  }
}
