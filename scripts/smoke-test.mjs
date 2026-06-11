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

// --- IA: pressing coordinato quando l'avversario ha palla ---
try {
  await page.waitForFunction(
    () => {
      const g = window.__nova;
      if (!g.ballControl.owner || g.ballControl.owner.team !== 1) {
        g.ballControl.givePossession(g.teams[1].fieldPlayers[3]);
        return false;
      }
      const carrier = g.ballControl.owner;
      let min = 1e9;
      for (const p of g.teams[0].fieldPlayers) {
        if (p === g.activePlayer) continue;
        min = Math.min(min, p.position.distanceTo(carrier.position));
      }
      return min < 4;
    },
    { timeout: 90000, polling: 500 },
  );
  check('IA: pressing sul portatore avversario', true);
} catch {
  check('IA: pressing sul portatore avversario', false);
}

// --- IA: OMBRA costruisce l'attacco verso la porta GELO ---
// situazione pulita (kickoff), palla a un centrocampista OMBRA, nessun
// intervento: la manovra deve far avanzare la palla di 8 m (o concludere)
await page.evaluate(() => {
  const g = window.__nova;
  g.setDifficulty('difficile');
  g.match.kickoff();
  g.ballControl.givePossession(g.teams[1].fieldPlayers[3]);
  window.__probeX0 = g.ball.position.x;
});
try {
  await page.waitForFunction(
    () => {
      const g = window.__nova;
      return (
        g.ball.position.x < window.__probeX0 - 8 ||
        g.match.score[1] > 0 ||
        g.ballControl.heldBy === g.teams[0].goalkeeper
      );
    },
    { timeout: 120000, polling: 400 },
  );
  check('IA: OMBRA costruisce e avanza verso la porta GELO', true);
} catch {
  check('IA: OMBRA costruisce e avanza verso la porta GELO', false);
}
await page.screenshot({ path: '/tmp/shot-ai.png' });

// --- Flux: la barra si carica col tempo ---
const fluxA = await page.evaluate(() => window.__nova.fluxSystems[0].value);
await page.waitForTimeout(3000);
const fluxB = await page.evaluate(() => window.__nova.fluxSystems[0].value);
check('la barra Flux si carica col tempo', fluxB > fluxA);

// --- Flux: scatto del giocatore (tasto E) spende energia e dà boost ---
await page.evaluate(() => {
  const g = window.__nova;
  g.setDifficulty('normale');
  g.match.kickoff();
  g.fluxSystems[0].value = 100;
});
await page.keyboard.down('KeyE');
await page.waitForTimeout(800);
await page.keyboard.up('KeyE');
const sprintFlux = await page.evaluate(() => {
  const g = window.__nova;
  return { boost: g.activePlayer.boostTimer > 0, value: g.fluxSystems[0].value };
});
check('scatto Flux attivo (boost + energia spesa)', sprintFlux.boost && sprintFlux.value < 100);
await page.screenshot({ path: '/tmp/shot-flux.png' });

// --- Flux: dribbling OMBRA = teletrasporto corto ---
const teleport = await page.evaluate(() => {
  const g = window.__nova;
  g.fluxSystems[1].value = 100;
  const p = g.teams[1].fieldPlayers[3];
  const before = p.position.clone();
  const ok = g.useFlux(1, 'dribble', p);
  return { ok, jump: p.position.distanceTo(before) };
});
check('dribbling Flux OMBRA: teletrasporto corto', teleport.ok && teleport.jump > 4);

// --- regressione: la punizione IA non blocca più la partita ---
await page.evaluate(() => {
  const g = window.__nova;
  g.match.foul(g.teams[0].fieldPlayers[0], g.teams[1].fieldPlayers[2], g.teams[1].fieldPlayers[2].position.clone());
});
try {
  await page.waitForFunction(() => window.__nova.match.phase === 'freeKick', { timeout: 10000 });
  await page.waitForFunction(() => window.__nova.match.phase === 'playing', { timeout: 90000 });
  check('la punizione IA viene battuta e il gioco riprende', true);
} catch {
  check('la punizione IA viene battuta e il gioco riprende', false);
}

// --- difficoltà selezionabile ---
const diffOk = await page.evaluate(() => {
  window.__nova.setDifficulty('difficile');
  return window.__nova.difficulty === 'difficile';
});
check('difficoltà cambiata a DIFFICILE', diffOk);
await page.evaluate(() => window.__nova.setDifficulty('normale'));

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
