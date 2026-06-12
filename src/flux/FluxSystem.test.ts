import { describe, expect, it } from 'vitest';
import { FLUX_DRIBBLE_COST, FLUX_MAX, FLUX_SHOT_COST, FLUX_SPRINT_COST } from '../core/constants';
import { FLUX_PROFILES } from './FluxProfile';
import { FluxSystem } from './FluxSystem';

describe('FluxSystem', () => {
  it('si carica col tempo fino al massimo e segnala PRONTO una sola volta', () => {
    const f = new FluxSystem(FLUX_PROFILES.gelo);
    let readyCount = 0;
    f.events.onReady = () => readyCount++;
    for (let i = 0; i < 600; i++) f.update(1 / 6); // 100 secondi
    expect(f.value).toBe(FLUX_MAX);
    expect(f.ready).toBe(true);
    expect(readyCount).toBe(1);
  });

  it('spende solo se ha energia sufficiente', () => {
    const f = new FluxSystem(FLUX_PROFILES.ombra);
    f.value = FLUX_DRIBBLE_COST - 1;
    expect(f.spend(FLUX_DRIBBLE_COST)).toBe(false);
    expect(f.value).toBe(FLUX_DRIBBLE_COST - 1);
    f.value = FLUX_MAX;
    expect(f.spend(FLUX_SHOT_COST)).toBe(true);
    expect(f.value).toBe(0);
  });

  it('i costi permettono il ciclo previsto dal bilanciamento', () => {
    // a barra piena: tiro intero, oppure sprint+dribbling con avanzo
    expect(FLUX_SHOT_COST).toBe(FLUX_MAX);
    expect(FLUX_SPRINT_COST + FLUX_DRIBBLE_COST).toBeLessThan(FLUX_MAX);
  });

  it('i crediti di gioco caricano la barra', () => {
    const f = new FluxSystem(FLUX_PROFILES.ruggito);
    const v0 = f.value;
    f.creditPass();
    f.creditTackle();
    f.creditAerial();
    f.creditGoal();
    expect(f.value).toBeGreaterThan(v0);
  });
});
