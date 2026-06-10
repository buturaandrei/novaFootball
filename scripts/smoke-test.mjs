// Smoke test headless: carica il gioco, entra in campo, simula input e
// verifica i criteri della milestone corrente (passaggi, portiere, goal,
// cronometro, fischio finale). Uso: node scripts/smoke-test.mjs [url]
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

const check = (name, ok) => {
  console.log(`${ok ? '✓' : '✗'} ${name}`);
  if (!ok) errors.push(`verifica fallita: ${name}`);
};

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/shot-menu.png' });

// entra in campo
await page.mouse.click(400, 225);
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/shot-kickoff.png' });

// --- squadre complete ---
const counts = await page.evaluate(() => {
  const g = window.__nova;
  return {
    players: g.players.length,
    gks: g.players.filter((p) => p.role === 'portiere').length,
  };
});
check('14 giocatori in campo (7v7)', counts.players === 14);
check('2 portieri', counts.gks === 2);

// --- movimento e doppio salto (input reali da tastiera) ---
await page.keyboard.down('KeyD');
await page.keyboard.down('ShiftLeft');
await page.waitForTimeout(1200);
await page.keyboard.press('Space');
await page.waitForTimeout(250);
await page.keyboard.press('Space');
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/shot-sprint.png' });
await page.keyboard.up('ShiftLeft');
await page.keyboard.up('KeyD');

// --- passaggio rasoterra: possesso a un compagno, palla in movimento ---
const passOk = await page.evaluate(() => {
  const g = window.__nova;
  const passer = g.teams[0].fieldPlayers[0];
  g.ballControl.givePossession(passer);
  const ok = g.ballControl.pass(passer, null, false);
  return ok && g.ball.velocity.length() > 8;
});
check('passaggio rasoterra eseguito', passOk);
try {
  await page.waitForFunction(
    () => {
      const g = window.__nova;
      return g.ballControl.owner && g.ballControl.owner.team === 0;
    },
    { timeout: 20000 },
  );
  check('il compagno riceve il passaggio', true);
} catch {
  check('il compagno riceve il passaggio', false);
}
await page.screenshot({ path: '/tmp/shot-pass.png' });

// --- parata del portiere: tiro centrale parabile ---
const saveResult = await page.evaluate(() => {
  const g = window.__nova;
  g.ball.position.set(16, 1, 0);
  g.ball.velocity.set(14, 1.5, 0);
  return g.match.score.join('-');
});
try {
  await page.waitForFunction(
    () => {
      const g = window.__nova;
      return g.ballControl.heldBy !== null || g.ball.velocity.x < 0;
    },
    { timeout: 25000 },
  );
  const noGoal = await page.evaluate(
    (before) => window.__nova.match.score.join('-') === before,
    saveResult,
  );
  check('il portiere para il tiro centrale', noGoal);
} catch {
  check('il portiere para il tiro centrale', false);
}
await page.screenshot({ path: '/tmp/shot-save.png' });

// --- goal: tiro fortissimo sotto l'incrocio, fuori portata del tuffo ---
// (prima aspetta che il portiere abbia rinviato la palla della parata)
try {
  await page.waitForFunction(
    () => window.__nova.ballControl.heldBy === null && window.__nova.match.phase === 'playing',
    { timeout: 30000 },
  );
} catch {
  errors.push('il portiere non ha mai rinviato la palla');
}
await page.evaluate(() => {
  const g = window.__nova;
  g.ball.position.set(28.5, 1.2, 3.1);
  g.ball.velocity.set(34, 2, 0);
});
try {
  await page.waitForFunction(() => window.__nova.match.score[0] === 1, { timeout: 30000 });
  check('goal sul tiro imparabile', true);
} catch {
  check('goal sul tiro imparabile', false);
}
await page.screenshot({ path: '/tmp/shot-goal.png' });
try {
  await page.waitForFunction(() => window.__nova.match.phase === 'playing', { timeout: 60000 });
  check('kickoff dopo la celebrazione', true);
} catch {
  check('kickoff dopo la celebrazione', false);
}

// --- cronometro che scorre ---
const clockA = await page.evaluate(() => window.__nova.match.clock);
await page.waitForTimeout(2500);
const clockB = await page.evaluate(() => window.__nova.match.clock);
check('il cronometro scorre', clockB < clockA);

// --- fischio finale e rivincita ---
await page.evaluate(() => {
  const g = window.__nova;
  g.match.half = 2;
  g.match.clock = 0.3;
});
try {
  await page.waitForFunction(() => window.__nova.match.phase === 'fulltime', { timeout: 20000 });
  check('fischio finale al termine del 2º tempo', true);
} catch {
  check('fischio finale al termine del 2º tempo', false);
}
await page.screenshot({ path: '/tmp/shot-fulltime.png' });
// a pochi FPS (rendering software) un press rapido cade tra due frame:
// tieni premuto abbastanza a lungo da essere campionato
await page.keyboard.down('KeyJ');
await page.waitForTimeout(800);
await page.keyboard.up('KeyJ');
try {
  await page.waitForFunction(
    () => window.__nova.match.phase === 'playing' && window.__nova.match.half === 1,
    { timeout: 20000 },
  );
  check('rivincita dopo il fischio finale', true);
} catch {
  check('rivincita dopo il fischio finale', false);
}

const hudText = await page.evaluate(() => document.body.innerText.replace(/\n+/g, ' | '));
console.log('HUD:', hudText);
console.log('Errori console:', errors.length ? errors : 'nessuno');

await browser.close();
process.exit(errors.length > 0 ? 1 : 0);
