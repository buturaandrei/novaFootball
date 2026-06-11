import {
  FLUX_AERIAL_BONUS,
  FLUX_GOAL_BONUS,
  FLUX_MAX,
  FLUX_PASS_BONUS,
  FLUX_TACKLE_BONUS,
  FLUX_TIME_RATE,
} from '../core/constants';
import type { FluxProfile } from './FluxProfile';

export interface FluxEvents {
  /** La barra ha raggiunto il massimo (stato PRONTO). */
  onReady?: () => void;
}

/**
 * Barra Flux di squadra: si carica col tempo, coi passaggi riusciti,
 * coi contrasti vinti e con le giocate spettacolari; si svuota a ogni uso
 * (scatto, dribbling e — dalla milestone 5 — il tiro che la consuma tutta).
 */
export class FluxSystem {
  value = 25; // si parte con un po' di energia
  events: FluxEvents = {};
  private wasReady = false;

  constructor(readonly profile: FluxProfile) {}

  get ratio(): number {
    return this.value / FLUX_MAX;
  }

  /** true quando la barra è piena: il tiro Flux è PRONTO. */
  get ready(): boolean {
    return this.value >= FLUX_MAX;
  }

  update(dt: number): void {
    this.add(FLUX_TIME_RATE * dt);
  }

  add(amount: number): void {
    this.value = Math.min(FLUX_MAX, this.value + amount);
    if (this.ready && !this.wasReady) {
      this.wasReady = true;
      this.events.onReady?.();
    }
    if (!this.ready) this.wasReady = false;
  }

  creditPass(): void {
    this.add(FLUX_PASS_BONUS);
  }

  creditTackle(): void {
    this.add(FLUX_TACKLE_BONUS);
  }

  creditAerial(): void {
    this.add(FLUX_AERIAL_BONUS);
  }

  creditGoal(): void {
    this.add(FLUX_GOAL_BONUS);
  }

  /** Tenta di spendere `cost`: false se l'energia non basta. */
  spend(cost: number): boolean {
    if (this.value < cost) return false;
    this.value -= cost;
    this.wasReady = false;
    return true;
  }

  reset(): void {
    this.value = 25;
    this.wasReady = false;
  }
}
