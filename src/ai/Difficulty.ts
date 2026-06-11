/**
 * Tre livelli di difficoltà dell'IA avversaria: cambiano reattività,
 * precisione, aggressività e raggio del pressing — non solo la velocità.
 * (la frequenza d'uso del Flux si aggiunge con la milestone 4)
 */
export interface DifficultyParams {
  /** Etichetta mostrata nell'HUD. */
  label: string;
  /** Intervallo tra le decisioni tattiche (s): più basso = più reattiva. */
  decisionInterval: number;
  /** Errore angolare massimo sul tiro (radianti). */
  shotError: number;
  /** Errore angolare massimo sui passaggi (radianti). */
  passError: number;
  /** Distanza entro cui si scatena il pressing coordinato. */
  pressDistance: number;
  /** Probabilità (per decisione) di tentare un contrasto a portata. */
  tackleAggression: number;
  /** Probabilità di scattare quando serve. */
  sprintTendency: number;
  /** Distanza dalla porta entro cui l'IA prova il tiro. */
  shootRange: number;
  /** Fattore sulla velocità massima richiesta dall'IA (0..1). */
  speedFactor: number;
}

export type DifficultyName = 'facile' | 'normale' | 'difficile';

export const DIFFICULTIES: Record<DifficultyName, DifficultyParams> = {
  facile: {
    label: 'FACILE',
    decisionInterval: 0.5,
    shotError: 0.22,
    passError: 0.2,
    pressDistance: 9,
    tackleAggression: 0.25,
    sprintTendency: 0.3,
    shootRange: 13,
    speedFactor: 0.82,
  },
  normale: {
    label: 'NORMALE',
    decisionInterval: 0.28,
    shotError: 0.12,
    passError: 0.1,
    pressDistance: 15,
    tackleAggression: 0.55,
    sprintTendency: 0.6,
    shootRange: 16,
    speedFactor: 0.94,
  },
  difficile: {
    label: 'DIFFICILE',
    decisionInterval: 0.15,
    shotError: 0.05,
    passError: 0.04,
    pressDistance: 23,
    tackleAggression: 0.85,
    sprintTendency: 0.88,
    shootRange: 19,
    speedFactor: 1.0,
  },
};
