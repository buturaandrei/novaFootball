// Sonda di debug IA: dà palla a un centrocampista OMBRA e campiona
// posizioni/velocità per capire cosa fa il portatore.
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:4517/';
const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (err) => console.log('PAGEERROR:', String(err)));

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
await page.mouse.click(320, 180);
await page.waitForTimeout(500);

await page.evaluate(() => {
  const g = window.__nova;
  g.setDifficulty('difficile');
  g.ballControl.givePossession(g.teams[1].fieldPlayers[3]);
});

for (let i = 0; i < 14; i++) {
  await page.waitForTimeout(2000);
  const s = await page.evaluate(() => {
    const g = window.__nova;
    const o = g.ballControl.owner;
    const mid = g.teams[1].fieldPlayers[3];
    return {
      owner: o ? `${o.name} (t${o.team})` : g.ballControl.heldBy ? `presa:${g.ballControl.heldBy.name}` : 'nessuno',
      ball: g.ball.position.toArray().map((v) => +v.toFixed(1)),
      ballVel: +g.ball.velocity.length().toFixed(1),
      mid: mid.position.toArray().map((v) => +v.toFixed(1)),
      midVel: +mid.velocity.length().toFixed(1),
      midAction: mid.action,
      phase: g.match.phase,
      score: g.match.score.join('-'),
    };
  });
  console.log(JSON.stringify(s));
}
await browser.close();
