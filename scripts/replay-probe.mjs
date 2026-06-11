import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e)));
await page.goto('http://localhost:4517/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
await page.mouse.click(320, 180);
await page.waitForTimeout(3000); // lascia registrare qualche campione
await page.evaluate(() => {
  const g = window.__nova;
  g.ball.position.set(28.5, 1.2, 3.1);
  g.ball.velocity.set(34, 2, 0);
});
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(3000);
  const s = await page.evaluate(() => {
    const g = window.__nova;
    const rd = g.replayDirector;
    return {
      phase: g.match.phase,
      running: g.replayRunning,
      rdActive: rd.active,
      cut: rd.cut,
      playT: rd.playT && +rd.playT.toFixed(2),
      startT: rd.startT && +rd.startT.toFixed(2),
      endT: rd.endT && +rd.endT.toFixed(2),
      dirState: g.director?.state,
      hasOverride: !!g.director?.override,
    };
  });
  console.log(JSON.stringify(s));
  if (s.phase === 'playing' && i > 2) break;
}
await browser.close();
