# Nova Football

Gioco di calcio futuristico ispirato all'estetica e al feeling di **Galactik Football**
(omaggio, non clone: nomi e design originali). Calcio 7v7 in un'arena orbitale
olografica sospesa nello spazio, con poteri **Flux**, regia cinematica e acrobazie aeree.

Tutto procedurale: niente asset esterni — modelli low-poly costruiti in codice,
shader GLSL per campo/muri/cielo, audio sintetizzato con Web Audio API.

## Stack

- [Three.js](https://threejs.org/) + TypeScript + Vite
- Architettura a sistemi separati: `input`, `physics`, `camera`, `vfx`, `match`, `audio`, `arena`, `entities`, `ui`

## Avvio

```bash
npm install
npm run dev      # server di sviluppo
npm run build    # type-check + build di produzione
npm run preview  # serve la build
```

Smoke test headless (richiede Playwright + Chromium):

```bash
npm run preview -- --port 4517 &
node scripts/smoke-test.mjs
```

## Comandi

| Azione | Tastiera | Gamepad | Touch |
| --- | --- | --- | --- |
| Movimento | WASD / frecce | stick sinistro | joystick virtuale (metà sinistra) |
| Scatto | Maiusc | RB / RT | pulsante SCATTO |
| Salto / doppio salto | Spazio | A | pulsante SALTO |
| Tiro (tieni premuto per caricare) | J | X | pulsante TIRO |
| Cambio giocatore | Q / Tab | Y | pulsante CAMBIO |
| Mostra/nascondi aiuto | H | — | — |

## Stato delle milestone

1. ✅ **Campo, camera director base, movimento + palla fisica, 1v1 senza IA**
   - Arena orbitale: campo olografico con griglia animata (shader), piattaforma sospesa,
     muri energetici con onde sugli impatti, porte con rete energetica, skybox procedurale
     con stelle/nebulosa/pianeta, tribune silhouette, riflettori, bloom
   - Movimento con inerzia, scatto con stamina, salto e doppio salto
   - Palla con gravità, drag, effetto/spin (Magnus), rimbalzi su terreno/muri/cupola
   - Controllo palla magnetico leggero, tiro caricato a 3 livelli con anello di carica
   - `CameraDirector` a stati con priorità e durata minima (gioco aperto, goal, ecc.),
     anticipo sulla palla, smorzamento a molla, FOV che si allarga in scatto
   - Goal, celebrazione orbitale, kickoff; audio sintetizzato (calci, rimbalzi, muri,
     fischio, boato); input completo tastiera + gamepad + touch
2. ⬜ Squadre complete, possesso/passaggi/tiri/contrasti, portieri, goal e regole
3. ⬜ IA tattica + individuale, cambio giocatore automatico, partita completa
4. ⬜ Sistema Flux: barra, scatto e dribbling Flux per le 3 squadre
5. ⬜ Tiro Flux con sequenza cinematica completa, parata Flux, replay dei goal
6. ⬜ Arena completa, pubblico, audio finale, HUD/menu, polish e bilanciamento
