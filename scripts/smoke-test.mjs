// Smoke test headless: carica il gioco, entra in campo, simula input
// e cattura screenshot + errori console. Uso: node scripts/smoke-test.mjs [url]
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:4517/';
const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });

const errors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});
page.on('pageerror', (err) => errors.push(String(err)));

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/shot-menu.png' });

// entra in campo
await page.mouse.click(640, 360);
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/shot-kickoff.png' });

// corri verso la palla e oltre
await page.keyboard.down('KeyD');
await page.keyboard.down('ShiftLeft');
await page.waitForTimeout(1800);
await page.screenshot({ path: '/tmp/shot-sprint.png' });
await page.keyboard.up('ShiftLeft');

// doppio salto
await page.keyboard.press('Space');
await page.waitForTimeout(250);
await page.keyboard.press('Space');
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/shot-jump.png' });
await page.keyboard.up('KeyD');
await page.waitForTimeout(800);

// tiro caricato al massimo verso la porta
await page.keyboard.down('KeyD');
await page.waitForTimeout(600);
await page.keyboard.down('KeyJ');
await page.waitForTimeout(1100);
await page.screenshot({ path: '/tmp/shot-charge.png' });
await page.keyboard.up('KeyJ');
await page.keyboard.up('KeyD');
await page.waitForTimeout(900);
await page.screenshot({ path: '/tmp/shot-shot.png' });
await page.waitForTimeout(2500);
await page.screenshot({ path: '/tmp/shot-after.png' });

// verifica del flusso goal: spara la palla dentro la porta a +x
await page.evaluate(() => {
  const g = window.__nova;
  g.ball.position.set(20, 1, 0);
  g.ball.velocity.set(24, 1, 0);
});
// nel rendering software headless il tempo di gioco scorre più lento del
// wall-clock: si fa polling sullo stato invece di attese fisse
try {
  await page.waitForFunction(() => window.__nova.match.score[0] === 1, { timeout: 30000 });
} catch {
  errors.push('goal non registrato entro 30s');
}
await page.screenshot({ path: '/tmp/shot-goal.png' });
console.log('Punteggio dopo il tiro in porta:', await page.evaluate(() => window.__nova.match.score.join('-')));
try {
  await page.waitForFunction(() => window.__nova.match.phase === 'playing', { timeout: 60000 });
  console.log('Kickoff dopo la celebrazione: ok');
} catch {
  errors.push('kickoff non avvenuto entro 60s');
}

// stato di gioco e FPS dal DOM
const hudText = await page.evaluate(() => document.body.innerText.replace(/\n+/g, ' | '));
console.log('HUD:', hudText);
console.log('Errori console:', errors.length ? errors : 'nessuno');

await browser.close();
process.exit(errors.length > 0 ? 1 : 0);
