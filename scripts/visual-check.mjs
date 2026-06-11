import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e)));
await page.goto('http://localhost:4517/', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/m6-menu.png' });
await page.click('[data-team="ruggito"]');
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/m6-menu2.png' });
await page.click('[data-team="ombra"]');
await page.waitForFunction(() => !!window.__nova, undefined, { timeout: 20000 });
await page.waitForTimeout(2500);
// inquadra la tribuna per vedere il pubblico + esultanza
await page.evaluate(() => {
  const g = window.__nova;
  g.match.score[0] = 2; g.match.score[1] = 1;
  g.arena.crowd.cheer();
});
await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/m6-game.png' });
await page.keyboard.down('KeyC'); await page.waitForTimeout(500); await page.keyboard.up('KeyC');
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/m6-tele.png' });
await browser.close();
console.log('ok');
