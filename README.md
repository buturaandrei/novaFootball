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
| Scatto | Maiusc | RB | joystick a fondo corsa |
| Salto / doppio salto | Spazio | A | SALTO |
| Tiro (carica) / scivolata in difesa | J | X | TIRO |
| Passaggio rasoterra / contrasto in piedi | K | B | PASSA (tap) |
| Filtrante alto | L | Y | PASSA (tieni premuto) |
| Scatto Flux | E | RT | FLUX (senza palla) |
| Dribbling Flux | R | LT | FLUX (con palla) |
| Tiro Flux (a barra piena, palla al piede) | F | R3 o LT+RT | FLUX (con palla, barra piena: si illumina) |
| Parata Flux (QTE durante il tiro avversario) | J | X | TIRO |
| Cambio giocatore | Q / Tab | LB | CAMBIO |
| Cambio visuale (azione ↔ telecronaca) | C | — | CAM |
| Difficoltà (facile/normale/difficile) | 1 / 2 / 3 | — | — |
| Mostra/nascondi aiuto | H | — | — |

Visuali: **azione** (default) è una terza persona dietro il giocatore attivo
in stile Rematch; **telecronaca** è la classica inquadratura laterale alta.
La preferenza viene ricordata tra una partita e l'altra.

Su touch lo schema è volutamente minimale (stile "The Spike"): tre pulsanti
contestuali (TIRO, PASSA, FLUX) + SALTO; è il contesto a decidere la mossa.

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
5. ✅ **Tiro Flux con sequenza cinematica completa, parata Flux, replay dei goal**
   - Sequenza del §6 frame-by-frame: tempo a 0.08x con letterbox (gli altri
     continuano in slow-motion), camera che orbita il tiratore avvicinandosi
     con FOV che si stringe, aura convergente, terreno reattivo (cerchio
     d'energia crescente), banner inclinato col nome della mossa, rombo
     crescente; flash + frame-freeze sul momento dell'impatto piede-palla;
     volo a 0.5x con scia volumetrica e difensori spazzati via
   - Ogni energia ha la SUA coreografia: ZERO ASSOLUTO (orbita bassa, tiro
     teso che congela una scia), ECLISSE (orbita alta opposta, palla quasi
     invisibile a metà traiettoria), METEORA RUGGENTE (orbita larga con
     tremore, parabola devastante con onda d'urto)
   - Parata Flux: il portiere spende Flux per l'unico modo di fermare un
     tiro Flux — QTE di timing per l'umano, probabilità per difficoltà
     per l'IA; clash di energie con knockback e slow-mo
   - Replay automatico di ogni goal da 2 angolazioni (dietro la porta +
     laterale bassa) con slow-motion extra sull'impatto
   - Coreografie corporee distinte per le mosse Flux: piroetta (GELO),
     spallata (RUGGITO), sparizione vera (OMBRA), windup e strike del tiro
6. ✅ **Arena completa, pubblico, audio, HUD finale, menu, polish e bilanciamento**
   - Pubblico instanced (~4000 spettatori in un draw call) che ondeggia e
     si alza a esultare sui goal; navette che passano nello skybox;
     tabellone olografico fluttuante con punteggio e tempo (CanvasTexture
     procedurale); coni di luce volumetrici sui riflettori
   - Menu olografico: selezione della tua squadra, dell'avversario e della
     difficoltà (le 3 squadre con Flux diversi); scorciatoia via URL
     `?io=gelo&avversario=ruggito&difficolta=difficile`; `?demo=1` per la
     partita automatica IA vs IA
   - Pausa (P / pulsante ⏸) con schema comandi completo; pannello risultato
     con RIGIOCA / TORNA AL MENU; radar minimappa nell'HUD
   - Bilanciamento misurato con partite demo automatiche
     (`scripts/balance-test.mjs`): l'IA ora risparmia il Flux oltre il 62%
     della barra per arrivare al tiro Flux; ritmo partita nel target
     (3–6 goal, ≥2 momenti Flux per tempo)
