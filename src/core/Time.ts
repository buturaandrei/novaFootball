import { damp } from './math';

/**
 * Gestione del tempo di gioco con time-scale variabile.
 * Predisposto per lo slow-motion delle sequenze Flux (milestone 5):
 * la scala transita in modo fluido verso il valore richiesto.
 */
export class Time {
  /** Scala corrente del tempo di gioco (1 = tempo reale). */
  scale = 1;
  private targetScale = 1;
  private transitionLambda = 10;

  /** Tempo totale di gioco scalato (secondi). */
  elapsed = 0;
  /** Tempo reale totale (secondi), per UI e shader che non devono rallentare. */
  realElapsed = 0;

  /** Richiede una transizione del time-scale; duration ≈ tempo per arrivarci. */
  setScale(target: number, duration = 0.2): void {
    this.targetScale = target;
    this.transitionLambda = duration > 0 ? 4 / duration : 1000;
  }

  /** Aggiorna con il dt reale e restituisce il dt scalato. */
  update(rawDt: number): number {
    this.scale = damp(this.scale, this.targetScale, this.transitionLambda, rawDt);
    if (Math.abs(this.scale - this.targetScale) < 0.001) this.scale = this.targetScale;
    const dt = rawDt * this.scale;
    this.elapsed += dt;
    this.realElapsed += rawDt;
    return dt;
  }
}
