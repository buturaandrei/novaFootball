import { describe, expect, it } from 'vitest';
import { buildClipLibrary } from './clips';

const REQUIRED = [
  'idle', 'walk', 'run', 'sprint', 'back', 'strafeL', 'strafeR', 'aria',
  'calcio', 'passaggio', 'contrasto', 'scivolata',
  'tuffoAltoL', 'tuffoAltoR', 'tuffoBassoL', 'tuffoBassoR',
  'stordito', 'rialzo', 'esultanza', 'rinvio', 'carica',
];

describe('libreria di clip', () => {
  const lib = buildClipLibrary(0.92);

  it('contiene tutte le clip richieste dal gameplay', () => {
    for (const name of REQUIRED) {
      expect(lib.clips.has(name), `manca la clip ${name}`).toBe(true);
    }
  });

  it('ogni clip ha tracce valide e durata positiva', () => {
    for (const [name, clip] of lib.clips) {
      expect(clip.duration, name).toBeGreaterThan(0);
      expect(clip.tracks.length, name).toBeGreaterThan(0);
      for (const track of clip.tracks) {
        expect(track.times.length, `${name}/${track.name}`).toBeGreaterThan(0);
        // i tempi devono essere ordinati e dentro la durata
        for (let i = 1; i < track.times.length; i++) {
          expect(track.times[i]).toBeGreaterThanOrEqual(track.times[i - 1]);
        }
        expect(track.times[track.times.length - 1]).toBeLessThanOrEqual(clip.duration + 1e-5);
      }
    }
  });

  it('i keyframe di impatto di calcio e passaggio cadono dentro le clip', () => {
    expect(lib.impactTime.calcio).toBeLessThan(lib.clips.get('calcio')!.duration);
    expect(lib.impactTime.passaggio).toBeLessThan(lib.clips.get('passaggio')!.duration);
  });

  it('le clip cicliche tornano alla posa iniziale (loop senza scatto)', () => {
    for (const name of ['walk', 'run', 'sprint', 'strafeL', 'strafeR']) {
      const clip = lib.clips.get(name)!;
      for (const track of clip.tracks) {
        const stride = track.getValueSize();
        const first = Array.from(track.values.slice(0, stride));
        const last = Array.from(track.values.slice(-stride));
        for (let i = 0; i < stride; i++) {
          expect(Math.abs(first[i] - last[i]), `${name}/${track.name}[${i}]`).toBeLessThan(1e-4);
        }
      }
    }
  });
});
