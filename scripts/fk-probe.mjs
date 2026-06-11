import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 400, height: 225 } });
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e)));
await page.goto('http://localhost:4517/?io=gelo&avversario=ombra', { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__nova, { timeout: 20000 });
await page.waitForTimeout(2000);
await page.evaluate(() => {
  const g = window.__nova;
  if (g.match.phase !== 'playing') g.match.kickoff();
  g.match.foul(g.teams[0].fieldPlayers[0], g.teams[1].fieldPlayers[2], g.teams[1].fieldPlayers[2].position.clone());
});
for (let i = 0; i < 24; i++) {
  await page.waitForTimeout(3000);
  const s = await page.evaluate(() => {
    const g = window.__nova;
    return {
      phase: g.match.phase,
      taker: g.match.freeKickTaker?.name ?? null,
      oppTimer: +(g.opponentFreeKickTimer ?? 0).toFixed(2),
      owner: g.ballControl.owner?.name ?? null,
      held: g.ballControl.heldBy?.name ?? null,
      clock: Math.round(g.match.clock),
    };
  });
  console.log(JSON.stringify(s));
  if (s.phase === 'playing' && i > 1) { console.log('OK: ripresa'); break; }
}
await browser.close();
