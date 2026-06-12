import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e)));
await page.goto('http://localhost:4517/?io=gelo&avversario=ombra', { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__nova, undefined, { timeout: 20000 });
await page.waitForTimeout(2000);

// 1) tuffo del portiere: tiro parabile e pausa sul tuffo
await page.evaluate(() => {
  const g = window.__nova;
  g.match.kickoff();
  g.ball.position.set(20, 1, 0);
  g.ball.velocity.set(14, 2.5, 2.5);
});
await page.waitForFunction(
  () => window.__nova.teams[1].goalkeeper.action === 'tuffo',
  undefined, { timeout: 30000 },
).catch(() => console.log('niente tuffo, proseguo'));
await page.evaluate(() => {
  const g = window.__nova;
  g.togglePause();
  g.hud.setPauseVisible(false);
  const gk = g.teams[1].goalkeeper;
  const cam = g.director.camera;
  cam.position.set(gk.position.x - 4, 1.6, gk.position.z + 3);
  cam.lookAt(gk.position.x, 1.0, gk.position.z);
  cam.fov = 40; cam.updateProjectionMatrix();
});
await page.waitForTimeout(600);
await page.screenshot({ path: '/tmp/anim-dive.png' });
await page.evaluate(() => window.__nova.togglePause());

// 2) esultanza dopo il goal
await page.evaluate(() => {
  const g = window.__nova;
  g.ballControl.clearHold();
  g.match.kickoff();
  g.ball.position.set(28.5, 1.2, 3.1);
  g.ball.velocity.set(34, 2, 0);
});
await page.waitForFunction(() => window.__nova.match.phase === 'goalCelebration', undefined, { timeout: 30000 });
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const g = window.__nova;
  g.togglePause();
  g.hud.setPauseVisible(false);
  const p = g.teams[0].fieldPlayers[5];
  const cam = g.director.camera;
  cam.position.set(p.position.x + 3, 1.6, p.position.z + 2.4);
  cam.lookAt(p.position.x, 1.1, p.position.z);
  cam.fov = 42; cam.updateProjectionMatrix();
});
await page.waitForTimeout(600);
await page.screenshot({ path: '/tmp/anim-celebrate.png' });
await browser.close();
console.log('ok');
