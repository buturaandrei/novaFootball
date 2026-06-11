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
| Tiro (carica) / scivolata in difesa | J | X | pulsante TIRO |
| Passaggio rasoterra / contrasto in piedi | K | B | pulsante PASSA |
| Filtrante alto | L | Y | pulsante LANCIO |
| Scatto Flux | E | RT | pulsante ⚡SCATTO |
| Dribbling Flux | R | LT | pulsante ⚡DRIBLO |
| Cambio giocatore | Q / Tab | LB | pulsante CAMBIO |
| Difficoltà (facile/normale/difficile) | 1 / 2 / 3 | — | — |
| Mostra/nascondi aiuto | H | — | — |

Avversario alternativo (in attesa del menu della milestone 6):
`?avversario=ruggito` nell'URL per affrontare RUGGITO invece di OMBRA.

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
2. ✅ **Squadre complete, possesso/passaggi/tiri/contrasti, portieri, goal e regole**
   - 7v7: formazione 2-3-1 + portiere per squadra (GELO vs OMBRA, rose con nomi)
   - Passaggio rasoterra e filtrante alto, entrambi con anticipo sul movimento
     del compagno; cambio automatico al ricevitore
   - Contrasti in piedi e in scivolata con finestra di timing; corpo colpito
     senza palla = fallo → punizione semplificata (avversari a distanza,
     battuta manuale o automatica per l'IA)
   - Portieri con IA dedicata: piazzamento sull'arco palla-porta, uscite,
     tuffi calcolati sulla traiettoria (parabilità in funzione di velocità,
     angolo e altezza), prese, respinte e rinvio a un compagno
   - Due tempi da 3 minuti con cronometro, intervallo, fischio finale e
     rivincita; stordimento di chi subisce fallo, pose dedicate del rig
     (scivolata, tuffo, barcollamento)
   - Nota: i compagni di movimento tengono la posizione — l'IA tattica
     e individuale arriva con la milestone 3
3. ✅ **IA tattica + individuale, cambio giocatore automatico, partita completa**
   - IA a due livelli per entrambe le squadre: livello **tattico** (fase di
     possesso/non possesso/palla contesa, pressing coordinato — primo uomo
     pressa, secondo copre — marcature, smarcamenti nei mezzi spazi, tagli
     della punta alle spalle della difesa) e livello **individuale**
     (macchina a stati: attacca, smarcati, taglia, pressa, copri, marca,
     insegui, rientra)
   - Il portatore IA decide tra dribbling (con scarto del difensore),
     passaggio (linee di passaggio valutate per progresso/smarcatezza,
     filtrante se la linea è chiusa) e tiro a portata di specchio
   - Cambio giocatore automatico intelligente: il controllo segue chi
     riceve o conquista palla, mai tolto al ricevitore di un passaggio
   - 3 livelli di difficoltà (tasti 1/2/3): reattività delle decisioni,
     precisione di tiro/passaggio, raggio del pressing, aggressività nei
     contrasti e propensione allo scatto — non solo la velocità
   - I compagni dell'umano giocano sempre a livello "normale"
4. ✅ **Sistema Flux: barra, scatto e dribbling Flux per le 3 squadre**
   - Barra Flux per squadra: si carica con tempo, passaggi riusciti,
     contrasti vinti, doppi salti e goal; si svuota a ogni uso; stato
     "PRONTO" pulsante quando è piena (per il tiro Flux della milestone 5)
   - Tre identità complete con meccaniche diverse, non solo colori:
     **GELO** (Soffio di Gelo: Scia Polare + Passo di Brina, guizzo con
     after-image di ghiaccio e palla incollata), **OMBRA** (Velo d'Ombra:
     Corsa Notturna + Passo nel Buio, vero teletrasporto corto),
     **RUGGITO** (Ruggito Solare: Carica Ferina + Zampata, onda d'urto
     che sbilancia e stordisce i difensori vicini)
   - Audio Flux sintetizzato distinto per energia (cristalli / risucchio
     scuro / ringhio ambrato) + segnale PRONTO
   - L'IA avversaria spende Flux: la punta ("personaggio stella") usa il
     dribbling Flux sotto pressione, lo scatto a campo aperto e in
     recupero — frequenza legata alla difficoltà
   - HUD: barra Flux col nome dell'energia + mini-barra avversaria;
     scie after-image e FOV allargato negli scatti Flux
5. ⬜ Tiro Flux con sequenza cinematica completa, parata Flux, replay dei goal
6. ⬜ Arena completa, pubblico, audio finale, HUD/menu, polish e bilanciamento
