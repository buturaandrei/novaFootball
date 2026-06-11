import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e)));
await page.goto('http://localhost:4517/?io=gelo&avversario=ruggito', { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__nova, undefined, { timeout: 20000 });
await page.waitForTimeout(2000);

// corsa per 2s, poi pausa a metà falcata e camera ravvicinata
await page.keyboard.down('KeyD');
await page.waitForTimeout(1800);
await page.evaluate(() => {
  const g = window.__nova;
  g.togglePause();
  g.hud.setPauseVisible(false);
  const p = g.activePlayer;
  const cam = g.director.camera;
  const f = p.forward();
  cam.position.set(p.position.x + f.x * 3.4 + 1.2, 1.3, p.position.z + f.z * 3.4 + 1.2);
  cam.lookAt(p.position.x, 1.0, p.position.z);
  cam.fov = 40; cam.updateProjectionMatrix();
});
await page.keyboard.up('KeyD');
await page.waitForTimeout(700);
await page.screenshot({ path: '/tmp/closeup-run.png' });

// primo piano di un RUGGITO (massiccio) fermo
await page.evaluate(() => {
  const g = window.__nova;
  const p = g.teams[1].fieldPlayers[1];
  const cam = g.director.camera;
  cam.position.set(p.position.x + 2.6, 1.4, p.position.z + 2.0);
  cam.lookAt(p.position.x, 1.0, p.position.z);
});
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/closeup-ruggito.png' });
await browser.close();
console.log('ok');
