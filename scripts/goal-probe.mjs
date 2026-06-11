import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 400, height: 225 } });
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e)));
await page.goto('http://localhost:4517/?io=gelo&avversario=ombra', { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__nova, undefined, { timeout: 20000 });
await page.waitForTimeout(3000);
const before = await page.evaluate(() => {
  const g = window.__nova;
  g.fluxShot.cancel();
  g.ballControl.clearHold();
  g.match.kickoff();
  g.ball.position.set(28.5, 1.2, 3.1);
  g.ball.velocity.set(34, 2, 0);
  return g.match.score.join('-');
});
console.log('score prima:', before);
for (let i = 0; i < 14; i++) {
  await page.waitForTimeout(1000);
  const s = await page.evaluate(() => {
    const g = window.__nova;
    return {
      ball: g.ball.position.toArray().map((v) => +v.toFixed(2)),
      vel: +g.ball.velocity.length().toFixed(1),
      inGoal: g.ball.inGoal,
      score: g.match.score.join('-'),
      phase: g.match.phase,
      held: g.ballControl.heldBy?.name ?? null,
      owner: g.ballControl.owner?.name ?? null,
    };
  });
  console.log(JSON.stringify(s));
  if (s.score !== before) { console.log('GOAL RILEVATO'); break; }
}
await browser.close();
