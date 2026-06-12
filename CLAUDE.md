# Nova Football — guida operativa del progetto

Gioco di calcio futuristico 7v7 (Three.js + TypeScript + Vite), omaggio a
Galactik Football. Tutto in italiano (codice commentato, UI, messaggi).

## Comandi

```bash
npm run dev        # server di sviluppo
npm run build      # tsc --noEmit + vite build (DEVE essere verde prima di ogni commit)
npm run lint       # eslint su src/ e scripts/
npm test           # vitest (unit test deterministici)
npm run preview -- --port 4517   # serve la build per i test headless
```

Test headless (richiedono `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` nel container):

```bash
node scripts/smoke-test.mjs      # suite E2E completa (~26 verifiche)
node scripts/touch-check.mjs     # layout pulsanti touch in landscape
node scripts/balance-test.mjs    # partita demo IA vs IA (criteri: 3–6 goal, ≥2 momenti Flux/tempo)
node scripts/rig-closeup.mjs     # screenshot ravvicinati dei corpi
node scripts/anim-probe.mjs      # telemetria ossa/mixer durante la corsa
```

## Architettura (src/)

- `core/` — Game (orchestratore), Time (slow-motion), constants, math
- `entities/` — Player + rig: `PlayerRig` (classico, fallback) e
  `skinned/` (scheletro 17 ossa, clip, AnimDriver, toon shading)
- `match/` — Match (fasi/regole), Team, BallControl (possesso, calci
  SINCRONIZZATI al keyframe d'impatto), Tackles, teamConfigs
- `ai/` — TeamAI (tattico+individuale), Goalkeeper, Difficulty
- `flux/` — FluxSystem (barra), FluxMoves, FluxShot (cinematica), FluxProfile
- `camera/` — CameraDirector (stati con priorità, visuali azione/telecronaca, override)
- `arena/`, `vfx/`, `audio/` (tutto sintetizzato), `ui/`, `replay/`, `physics/`

## Procedure

1. **Milestone**: sviluppa su `claude/galactik-football-game-hs0an3` →
   build+lint+test+smoke verdi → commit → push → merge ff su `main` →
   il deploy parte SOLO da main (run di GitHub Actions, verificarne l'esito).
   URL live: https://buturaandrei.github.io/novaFootball/
2. **Bilanciamento**: si misura giocando (`balance-test.mjs`), non si stima.
3. **Bug visivi**: prima la sonda strumentale (anim-probe & co.), poi il fix —
   mai fidarsi solo dell'occhio sugli screenshot headless a 4 fps.
4. **Riuso**: librerie/asset free (MIT/CC0) benvenuti — non reinventare la
   ruota (postprocessing, lil-gui già in dipendenze; Kenney/Quaternius CC0
   come opzione per asset). NIENTE contenuti protetti della serie GF:
   nomi/design originali, si riproduce solo il linguaggio visivo.

## Trappole note (headless/test)

- Il rendering software gira a 1–4 fps: il tempo di gioco scorre ~0.13×
  wall-clock; i timer delle cinematiche sono in tempo reale → timeout generosi.
- `page.waitForFunction(fn, ARG, OPTIONS)` — l'arg viene PRIMA delle opzioni
  (bug storico: timeout passati come arg venivano ignorati).
- I preamboli dei test devono essere atomici: `fluxShot.cancel()`,
  `ballControl.clearHold()`, `match.kickoff()` prima di teleportare la palla
  (palla in presa al portiere = re-incollata ai guantoni ogni frame).
- Non lanciare due browser headless in parallelo (contesa CPU → falsi rossi).
- Handle di debug: `window.__nova` (Game). Param URL: `?io=&avversario=&difficolta=`
  (salta il menu), `?demo=1` (IA vs IA), `?rig=classico` (corpi vecchi),
  `?debug=1` (pannello tuning lil-gui).

## Skill installate (.claude/skills/)

`/balance-check`, `/perf-profile`, `/playtest-report`, `/ux-review` —
adattate da Claude-Code-Game-Studios (MIT), senza hook/agenti/settings.

## Roadmap

Fase 1 (M1–M6) completata; fase 2 in corso: vedi `ROADMAP.md`
(M7 ✅ corpi skinned, M8 ✅ clip+mixer, M9 IK/ragdoll, M10 look serie TV,
M11 aure a nastri, M12 regia finale). Il criterio d'oro: ogni mossa Flux
riconoscibile in silhouette, 60 fps su hardware medio.
