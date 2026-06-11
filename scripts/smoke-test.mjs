// Smoke test headless: carica il gioco, entra in campo, simula input e
// verifica i criteri della milestone corrente (passaggi, portiere, goal,
// cronometro, fischio finale). Uso: node scripts/smoke-test.mjs [url]
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:4517/?io=gelo&avversario=ombra';
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

// Riporta la partita in fase "playing". Il rendering software è lentissimo
// (1-4 fps): i replay durano minuti in wall-clock, quindi dopo averli
// osservati li mandiamo in avanti veloce via debug.
const ensurePlaying = async (timeout = 180000) => {
  await page.waitForFunction(
    () => {
      const g = window.__nova;
      if (g.match.phase === 'replay') g.replayDirector.realElapsed = 999;
      return g.match.phase === 'playing';
    },
    { timeout, polling: 500 },
  );
};

// --- menu: selezione squadra, avversario e difficoltà ---
// (si carica l'URL base senza parametri, dove il menu appare davvero)
const baseUrl = url.split('?')[0];
await page.goto(baseUrl, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/shot-menu.png' });
try {
  await page.click('[data-team="gelo"]', { timeout: 10000 });
  await page.click('[data-diff="normale"]', { timeout: 10000 });
  await page.click('[data-team="ombra"]', { timeout: 10000 });
  await page.waitForFunction(() => !!window.__nova, { timeout: 20000 });
  check('menu: selezione squadre e avvio partita', true);
} catch {
  check('menu: selezione squadre e avvio partita', false);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__nova, { timeout: 20000 });
}
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/shot-kickoff.png' });

// --- pausa: P congela il cronometro ---
await page.keyboard.down('KeyP');
await page.waitForTimeout(400);
await page.keyboard.up('KeyP');
await page.waitForTimeout(300);
const pausedState = await page.evaluate(() => window.__nova.paused === true);
await page.keyboard.down('KeyP');
await page.waitForTimeout(400);
await page.keyboard.up('KeyP');
const resumedState = await page.evaluate(() => window.__nova.paused === false);
check('pausa e ripresa con P', pausedState && resumedState);

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
// l'IA avversaria può intercettare legittimamente: fino a 3 tentativi
// da situazione pulita di kickoff
let passLaunched = false;
let passReceived = false;
for (let attempt = 0; attempt < 3 && !passReceived; attempt++) {
  passLaunched = await page.evaluate(() => {
    const g = window.__nova;
    g.match.kickoff();
    const passer = g.teams[0].fieldPlayers[3];
    g.ballControl.givePossession(passer);
    window.__passer = passer;
    const ok = g.ballControl.pass(passer, null, false);
    return ok && g.ball.velocity.length() > 8;
  });
  if (!passLaunched) continue;
  try {
    await page.waitForFunction(
      () => {
        const g = window.__nova;
        return g.ballControl.owner && g.ballControl.owner.team === 0 && g.ballControl.owner !== window.__passer;
      },
      { timeout: 25000 },
    );
    passReceived = true;
  } catch {
    passReceived = false;
  }
}
check('passaggio rasoterra eseguito', passLaunched);
check('il compagno riceve il passaggio', passReceived);
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

// --- tiro Flux: sequenza cinematica completa (carica → volo → esito) ---
await page.evaluate(() => {
  const g = window.__nova;
  g.match.kickoff();
  g.fluxSystems[0].value = 100;
  g.ballControl.givePossession(g.activePlayer);
});
await page.keyboard.down('KeyF');
await page.waitForTimeout(900);
await page.keyboard.up('KeyF');
try {
  await page.waitForFunction(() => window.__nova.fluxShot.active, { timeout: 15000 });
  check('tiro Flux: sequenza innescata', true);
  try {
    await page.waitForFunction(() => window.__nova.time.scale < 0.2, { timeout: 20000 });
    check('tiro Flux: slow-motion attivo', true);
  } catch {
    check('tiro Flux: slow-motion attivo', false);
  }
} catch {
  check('tiro Flux: sequenza innescata', false);
}
await page.waitForTimeout(4000);
await page.screenshot({ path: '/tmp/shot-fluxshot.png' });
let sawFluxBall = false;
try {
  await page.waitForFunction(() => window.__nova.ball.fluxColor !== null, { timeout: 60000 });
  sawFluxBall = true;
} catch { /* la palla potrebbe già aver concluso */ }
check('tiro Flux: palla avvolta dall\'energia', sawFluxBall);
await page.screenshot({ path: '/tmp/shot-fluxflight.png' });
try {
  await page.waitForFunction(
    () => !window.__nova.fluxShot.active && window.__nova.time.scale > 0.9,
    { timeout: 120000 },
  );
  const outcome = await page.evaluate(() => ({
    score: window.__nova.match.score.join('-'),
    phase: window.__nova.match.phase,
  }));
  console.log('  esito tiro Flux:', JSON.stringify(outcome));
  check('tiro Flux: sequenza conclusa e tempo ripristinato', true);
} catch {
  check('tiro Flux: sequenza conclusa e tempo ripristinato', false);
}
// se è stato goal, completa il giro celebrazione→replay→kickoff
try {
  await ensurePlaying();
} catch {
  errors.push('la partita non è ripresa dopo il tiro Flux');
}

// --- FLUX contestuale (pulsante touch): a barra piena aggancia la palla
//     vicina e fa partire il tiro Flux, mai uno scatto a sorpresa ---
await ensurePlaying().catch(() => {});
await page.evaluate(() => {
  const g = window.__nova;
  g.match.kickoff();
  g.fluxSystems[0].value = 100;
  const a = g.activePlayer;
  g.ball.reset(a.position.x + 1.5, a.position.z); // vicina ma non agganciata
  g.input.touch.state.fluxSmart = true;
});
await page.waitForTimeout(700);
await page.evaluate(() => { window.__nova.input.touch.state.fluxSmart = false; });
try {
  await page.waitForFunction(() => window.__nova.fluxShot.active, { timeout: 15000 });
  check('FLUX contestuale: tiro Flux con palla vicina', true);
} catch {
  check('FLUX contestuale: tiro Flux con palla vicina', false);
}
try {
  await page.waitForFunction(
    () => !window.__nova.fluxShot.active && window.__nova.time.scale > 0.9,
    { timeout: 120000 },
  );
} catch { errors.push('sequenza FLUX contestuale non conclusa'); }
await ensurePlaying().catch(() => errors.push('partita non ripresa dopo FLUX contestuale'));

// --- cambio visuale: C alterna terza persona e telecronaca ---
await page.keyboard.down('KeyC');
await page.waitForTimeout(600);
await page.keyboard.up('KeyC');
const vm = await page.evaluate(() => window.__nova.director.viewMode);
check('cambio visuale con C (azione → telecronaca)', vm === 'telecronaca');
await page.keyboard.down('KeyC');
await page.waitForTimeout(600);
await page.keyboard.up('KeyC');
await page.screenshot({ path: '/tmp/shot-terza.png' });

// --- regressione: la punizione IA non blocca più la partita ---
await ensurePlaying().catch(() => errors.push('fase playing non raggiunta prima della punizione'));
const fkApplied = await page.evaluate(() => {
  const g = window.__nova;
  if (g.match.phase !== 'playing') g.match.kickoff(); // atomico: niente gare col gioco vivo
  g.match.foul(g.teams[0].fieldPlayers[0], g.teams[1].fieldPlayers[2], g.teams[1].fieldPlayers[2].position.clone());
  return g.match.phase === 'freeKick';
});
try {
  await ensurePlaying(120000);
  check('la punizione IA viene battuta e il gioco riprende', fkApplied);
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
await ensurePlaying().catch(() => errors.push('fase playing non raggiunta prima della parata'));
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
const scoreBefore = await page.evaluate(() => {
  const g = window.__nova;
  if (g.match.phase !== 'playing') g.match.kickoff();
  g.ball.position.set(28.5, 1.2, 3.1);
  g.ball.velocity.set(34, 2, 0);
  return g.match.score[0];
});
try {
  await page.waitForFunction(
    (before) => window.__nova.match.score[0] > before,
    { timeout: 30000 },
    scoreBefore,
  );
  check('goal sul tiro imparabile', true);
} catch {
  check('goal sul tiro imparabile', false);
}
await page.screenshot({ path: '/tmp/shot-goal.png' });
// dopo la celebrazione parte il replay automatico da 2 angolazioni
let replaySeen = false;
try {
  await page.waitForFunction(() => window.__nova.match.phase === 'replay', { timeout: 90000 });
  replaySeen = true;
  await page.waitForTimeout(4000); // lascialo girare per lo screenshot
  await page.screenshot({ path: '/tmp/shot-replay.png' });
} catch { /* potrebbe essere già passato */ }
check('replay del goal avviato', replaySeen);
try {
  await ensurePlaying();
  check('kickoff dopo celebrazione e replay', true);
} catch {
  check('kickoff dopo celebrazione e replay', false);
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
