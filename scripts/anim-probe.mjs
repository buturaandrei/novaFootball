import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 400, height: 225 } });
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e)));
await page.goto('http://localhost:4517/?io=gelo&avversario=ombra', { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__nova, undefined, { timeout: 20000 });
await page.waitForTimeout(1500);
await page.keyboard.down('KeyD');
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(900);
  const s = await page.evaluate(() => {
    const g = window.__nova;
    const p = g.activePlayer;
    const rig = p.rig;
    const d = rig.driver;
    const w = {};
    for (const [k, a] of Object.entries(d.loco)) w[k] = +a.getEffectiveWeight().toFixed(2);
    return {
      speed: +Math.hypot(p.velocity.x, p.velocity.z).toFixed(1),
      thighL: +rig.bones.thighL.rotation.x.toFixed(2),
      runTime: +d.loco.run.time.toFixed(2),
      runScale: +d.loco.run.getEffectiveTimeScale().toFixed(2),
      busy: d.busy, cur: d.currentName,
      w,
    };
  });
  console.log(JSON.stringify(s));
}
await page.keyboard.up('KeyD');
await browser.close();
