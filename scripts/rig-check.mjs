import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const shot = async (url, name, run) => {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__nova, undefined, { timeout: 20000 });
  await page.waitForTimeout(2500);
  if (run) {
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(2000);
  }
  await page.screenshot({ path: `/tmp/${name}.png` });
  if (run) await page.keyboard.up('KeyD');
};

await shot('http://localhost:4517/?io=gelo&avversario=ruggito', 'rig-idle', false);
await shot('http://localhost:4517/?io=gelo&avversario=ruggito', 'rig-run', true);
await shot('http://localhost:4517/?io=gelo&avversario=ruggito&rig=classico', 'rig-classic', false);
console.log('errori:', errors.length ? errors.slice(0, 4) : 'nessuno');
await browser.close();
