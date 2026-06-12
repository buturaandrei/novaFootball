import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from './Difficulty';

describe('difficoltà', () => {
  it('la scala facile→difficile è monotona su ogni parametro', () => {
    const [f, n, d] = [DIFFICULTIES.facile, DIFFICULTIES.normale, DIFFICULTIES.difficile];
    // più difficile = più reattiva, più precisa, più aggressiva
    expect(f.decisionInterval).toBeGreaterThan(n.decisionInterval);
    expect(n.decisionInterval).toBeGreaterThan(d.decisionInterval);
    expect(f.shotError).toBeGreaterThan(n.shotError);
    expect(n.shotError).toBeGreaterThan(d.shotError);
    expect(f.passError).toBeGreaterThan(n.passError);
    expect(n.passError).toBeGreaterThan(d.passError);
    expect(f.pressDistance).toBeLessThan(n.pressDistance);
    expect(n.pressDistance).toBeLessThan(d.pressDistance);
    expect(f.tackleAggression).toBeLessThan(d.tackleAggression);
    expect(f.fluxTendency).toBeLessThan(n.fluxTendency);
    expect(n.fluxTendency).toBeLessThan(d.fluxTendency);
    expect(f.gkFluxSave).toBeLessThan(n.gkFluxSave);
    expect(n.gkFluxSave).toBeLessThan(d.gkFluxSave);
  });
});
