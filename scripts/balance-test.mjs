// Test di bilanciamento: partita automatica IA vs IA (?demo=1) fino al
// fischio finale. Criterio della milestone 6: 3–6 goal a partita e almeno
// 2 momenti Flux per tempo. I replay vengono mandati avanti veloce.
// Uso: node scripts/balance-test.mjs [difficolta]
import { chromium } from 'playwright';

const diff = process.argv[2] ?? 'normale';
const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-gpu-sandbox'],
});
// viewport minuscola: massimi fps per il rendering software
const page = await browser.newPage({ viewport: { width: 256, height: 144 } });
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e)));

await page.goto(`http://localhost:4517/?demo=1&difficolta=${diff}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__nova, undefined, { timeout: 20000 });
console.log(`partita demo avviata (difficoltà ${diff})...`);

const t0 = Date.now();
let last = '';
let firstHalfFlux = null;
for (;;) {
  await page.waitForTimeout(5000);
  const s = await page.evaluate(() => {
    const g = window.__nova;
    if (g.match.phase === 'replay') g.replayDirector.realElapsed = 999;
    return {
      phase: g.match.phase,
      half: g.match.half,
      clock: Math.round(g.match.clock),
      score: g.match.score.join('-'),
      fluxUses: g.stats.fluxUses.join('+'),
      fluxShots: g.stats.fluxShots.join('+'),
    };
  });
  const line = JSON.stringify(s);
  if (line !== last) {
    console.log(`[${Math.round((Date.now() - t0) / 1000)}s]`, line);
    last = line;
  }
  if (s.half === 2 && firstHalfFlux === null) {
    firstHalfFlux = await page.evaluate(
      () => window.__nova.stats.fluxUses[0] + window.__nova.stats.fluxUses[1] +
            window.__nova.stats.fluxShots[0] + window.__nova.stats.fluxShots[1],
    );
  }
  if (s.phase === 'fulltime') break;
  if (Date.now() - t0 > 45 * 60 * 1000) {
    console.log('TIMEOUT: la partita non è finita in 45 minuti wall');
    break;
  }
}

const fin = await page.evaluate(() => {
  const g = window.__nova;
  return {
    score: g.match.score,
    fluxUses: g.stats.fluxUses,
    fluxShots: g.stats.fluxShots,
  };
});
const goals = fin.score[0] + fin.score[1];
const fluxTotal = fin.fluxUses[0] + fin.fluxUses[1] + fin.fluxShots[0] + fin.fluxShots[1];
const secondHalfFlux = fluxTotal - (firstHalfFlux ?? 0);
console.log('--- RISULTATO BILANCIAMENTO ---');
console.log(`goal totali: ${goals} (target 3–6)  punteggio ${fin.score.join('-')}`);
console.log(`momenti Flux 1° tempo: ${firstHalfFlux ?? '?'} · 2° tempo: ${secondHalfFlux} (target ≥2 per tempo)`);
console.log(`dettaglio: mosse ${fin.fluxUses.join('+')} · tiri Flux ${fin.fluxShots.join('+')}`);
const ok = goals >= 3 && goals <= 6 && (firstHalfFlux ?? 0) >= 2 && secondHalfFlux >= 2;
console.log(ok ? '✓ criteri rispettati' : '✗ criteri NON rispettati');
await browser.close();
process.exit(0);
