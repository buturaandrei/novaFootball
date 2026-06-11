import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({
  viewport: { width: 740, height: 360 }, hasTouch: true, isMobile: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605 Mobile/15E148 Safari/604',
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:4517/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.touchscreen.tap(370, 180);
await page.waitForTimeout(800);
// raccogli i cerchi dei pulsanti e verifica: dentro lo schermo + nessuna sovrapposizione
const result = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('div')].filter((d) =>
    ['TIRO','PASSA','LANCIO','SALTO','⚡SCATTO','⚡DRIBLO','CAMBIO'].includes(d.textContent) && d.style.borderRadius === '50%');
  const circles = btns.map((b) => {
    const r = b.getBoundingClientRect();
    return { label: b.textContent, x: r.left + r.width/2, y: r.top + r.height/2, r: r.width/2, inView: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth };
  });
  const overlaps = [];
  for (let i = 0; i < circles.length; i++) for (let j = i+1; j < circles.length; j++) {
    const a = circles[i], b = circles[j];
    if (Math.hypot(a.x-b.x, a.y-b.y) < a.r + b.r) overlaps.push(`${a.label}~${b.label}`);
  }
  return { circles, overlaps };
});
for (const c of result.circles) console.log(c.label, 'centro', Math.round(c.x), Math.round(c.y), 'r', c.r, c.inView ? 'OK' : 'FUORI SCHERMO');
console.log('sovrapposizioni cerchi:', result.overlaps.length ? result.overlaps : 'nessuna');
// prova: tap sul pulsante TIRO e verifica che carichi il tiro (kickHeld)
await page.screenshot({ path: '/tmp/shot-touch.png' });
console.log('errori:', errors.length ? errors : 'nessuno');
await browser.close();
