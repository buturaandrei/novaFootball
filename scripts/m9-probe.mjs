// Sonda M9: (1) foot-lock — drift del piede rispetto all'ancora durante
// l'appoggio; (2) ragdoll — ciclo knockdown→ragdoll→rialzo→normale.
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 400, height: 225 } });
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e)));
await page.goto('http://localhost:4517/?io=gelo&avversario=ombra', { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__nova, undefined, { timeout: 20000 });
await page.waitForTimeout(1500);

// --- 1) foot-lock durante la corsa ---
await page.keyboard.down('KeyD');
await page.waitForTimeout(1200);
const drift = await page.evaluate(async () => {
  const g = window.__nova;
  const rig = g.activePlayer.rig;
  const foot = rig.bones.footL;
  const V = foot.position.constructor;
  const tmp = new V();
  let maxDrift = 0;
  let samples = 0;
  const t0 = performance.now();
  while (performance.now() - t0 < 4000) {
    await new Promise(requestAnimationFrame);
    const lock = rig.locks.L;
    if (lock.on && lock.w > 0.5) {
      foot.getWorldPosition(tmp);
      const d = Math.hypot(tmp.x - lock.anchor.x, tmp.z - lock.anchor.z);
      maxDrift = Math.max(maxDrift, d);
      samples++;
    }
  }
  return { maxDrift: +maxDrift.toFixed(3), samples };
});
await page.keyboard.up('KeyD');
console.log('foot-lock:', JSON.stringify(drift), drift.samples > 5 && drift.maxDrift < 0.12 ? '✓' : '✗');

// --- 2) ragdoll ---
const rag = await page.evaluate(() => {
  const g = window.__nova;
  const V = g.ball.position.constructor;
  const p = g.teams[1].fieldPlayers[2];
  p.knockdown(new V(9, 5.5, 3));
  return p.action;
});
console.log('dopo knockdown:', rag, rag === 'ragdoll' ? '✓' : '✗');
await page.evaluate(() => {
  const g = window.__nova;
  g.togglePause(); g.hud.setPauseVisible(false);
  const p = g.teams[1].fieldPlayers[2];
  const cam = g.director.camera;
  cam.position.set(p.position.x + 3, 1.6, p.position.z + 2.4);
  cam.lookAt(p.position.x, 0.7, p.position.z);
  cam.fov = 45; cam.updateProjectionMatrix();
});
await page.waitForTimeout(600);
await page.screenshot({ path: '/tmp/m9-ragdoll.png' });
await page.evaluate(() => window.__nova.togglePause());
try {
  await page.waitForFunction(
    () => window.__nova.teams[1].fieldPlayers[2].action === 'normale',
    undefined, { timeout: 60000 },
  );
  const pos = await page.evaluate(() => {
    const p = window.__nova.teams[1].fieldPlayers[2].position;
    return Number.isFinite(p.x + p.y + p.z);
  });
  console.log('ragdoll→rialzo→normale, posizione finita:', pos ? '✓' : '✗');
} catch {
  console.log('ragdoll NON è tornato a normale ✗');
}
await browser.close();
