# Roadmap fase 2 — Corpi 3D veri, animazioni avanzate, effetti fedeli a Galactik Football

> Continua dal piano originale (milestone 1–6, completate). Una milestone per sessione,
> con criteri di accettazione e test automatici come finora.

---

## Parte I — Studio di Galactik Football

### Come è fatta la serie (e cosa implica per noi)

- La serie mescola personaggi **3D in toon/cel-shading** su sfondi 2D, e le azioni di
  gioco sono **motion-capture di veri calciatori, stuntman e acrobati**. È questo il
  motivo per cui i movimenti "sembrano veri": non sono keyframe cartoon, è recitazione
  fisica reale ricoperta da una resa da cartone (toon ramp + contorni).
  → Per riprodurre il feeling servono: (1) scheletri veri con cicli di corsa/calcio
  curati nei timing, (2) cel-shading con outline, (3) regia che indugia su pose-chiave.
- Il Flux è descritto come **un'aura in costante movimento** attorno al corpo: non
  particelle statiche ma **nastri/volute che scorrono** lungo gambe e busto, e che
  avvolgono anche la palla quando viene colpita.

### Linguaggio visivo dei Flux (dalla serie → al nostro gioco)

| Flux della serie | Squadra | Aspetto visivo | Abilità | Nostro equivalente |
| --- | --- | --- | --- | --- |
| **The Breath (Soffio di Akillian)** | Snow Kids | Nuvola/correnti di plasma **blu-bianco** in continuo movimento attorno a corpo e palla; salti al limite del volo | velocità, agilità, forza, scudo contro altri flux | **GELO — Soffio di Gelo** |
| **The Smog** | Shadows | Volute di **fumo nero-viola** che avvolgono gli arti; **teletrasporto**; legato a rabbia/emozioni negative; "ammala" gli avversari | teletrasporto, stealth | **OMBRA — Velo d'Ombra** |
| **Flux dei Wambas** ("il ruggito") | Wambas | Aura **fulva/dorata**, prende il nome dal **ruggito leonino** emesso quando lo si usa | agilità felina superiore | **RUGGITO — Ruggito Solare** |
| **Metal Scream** | Rykers | **Urlo metallico** proiettato dalla bocca, onda che **paralizza/scuote** gli avversari | stordimento a distanza | eco già presente nell'onda d'urto della METEORA RUGGENTE |
| **Flux degli Xenons** | Xenons | proiettabile all'esterno per **congelare** temporaneamente l'avversario | forza+velocità, proiezione | candidato per una **4ª squadra futura** |

> Nota omaggio: manteniamo nomi e design originali (niente marchi/personaggi della
> serie); riproduciamo fedelmente il **linguaggio visivo** — nastri d'aura, palla-cometa,
> pose congelate, scie — non i contenuti protetti.

### Grammatica visiva ricorrente della serie (checklist di fedeltà)

1. **Attivazione**: l'aura *sale* dal terreno/caviglie verso il busto in ~mezzo secondo,
   con accelerazione del "flusso" dei nastri; spesso accompagnata da un suono firma
   (vento gelido / sibilo scuro / ruggito).
2. **Aura attiva**: 2–3 nastri semitrasparenti che spiraleggiano attorno a gambe e
   braccia + foschia bassa ai piedi; sempre in movimento, mai statica.
3. **Scatto**: il corpo si allunga in avanti, **speed-lines** e scia; nel teletrasporto
   resta una **silhouette di fumo che si dissolve**.
4. **Tiro speciale**: wind-up con posa caricata → **frame quasi fermi** sul momento
   dell'impatto → la palla diventa una **cometa** avvolta dal flux con scia a nastro
   elicoidale → impatto con esplosione a tema e onda sulla porta.
5. **Regia**: orbite strette sul tiratore, tagli rapidi, slow-motion selettivo,
   inquadrature dal basso sulle pose hero, replay.
6. **Il campo reagisce**: brina/ombre/bagliori si propagano dal giocatore al terreno.

*(I punti 1, 4, 5 e 6 sono già parzialmente implementati nella sequenza del tiro Flux
della milestone 5: la fase 2 li porta alla qualità "serie TV".)*

---

## Parte II — Roadmap tecnica (milestone 7–12)

### M7 — Corpi skinned procedurali + cel-shading di base ✅
- **Scheletro vero in codice** (`THREE.Skeleton` + `SkinnedMesh`, ~17 ossa: bacino,
  spina, petto, collo, testa, spalla/braccio/avambraccio/mano ×2, coscia/tibia/piede ×2).
- Mesh unica per giocatore costruita proceduralmente (sezioni capsulari unite) con
  **pesi di skinning calcolati in codice** (falloff per distanza dall'osso).
- Proporzioni e dettagli per squadra (corporature leggermente diverse: GELO slanciati,
  RUGGITO massicci, OMBRA affilati) + visiera/dettagli emissivi come oggi.
- **Toon shading**: ramp a 3 bande (luce/mezzitoni/ombra) + **outline inverted-hull**.
- *Criteri*: 14 giocatori skinned a 60 fps su hardware medio; silhouette leggibile
  in cel-shading; nessuna compenetrazione evidente alle pose estreme.

### M8 — Sistema di animazione scheletrica ✅
- **Clip di animazione keyframe definite in codice** (`AnimationClip` generati):
  idle (respiro+peso), camminata, corsa, sprint (lean accentuato), calcio leggero,
  calcio caricato (wind-up→strike→follow-through), passaggio, scivolata, contrasto,
  4 tuffi del portiere (alto/basso × dx/sx), presa, rinvio, esultanza, stordito,
  rialzata, corsa all'indietro e laterale (strafe).
- **AnimationMixer** con crossfade temporizzati + **layer separati busto/gambe**
  (es. guardarsi attorno mentre si corre; caricare il tiro in corsa).
- **Sincronizzazione gameplay**: l'istante di contatto piede-palla del gameplay
  coincide col keyframe di impatto della clip (la palla parte sul frame giusto).
- *Criteri*: nessun "pop" visibile nelle transizioni; il calcio connette col frame
  d'impatto; locomotion blend space (idle↔walk↔run↔sprint) guidato dalla velocità reale.

### M9 — Animazione avanzata (il salto di qualità "mocap-feel") ✅
- **IK**: piedi piantati sul terreno (niente scivolamento), gamba del calcio orientata
  alla posizione REALE della palla (two-bone IK), testa/occhi look-at palla.
- **Motion warping** sui contrasti: la scivolata si adatta alla distanza dal portatore.
- **Ragdoll semplificato** (verlet a 6 segmenti) per i difensori spazzati via dal tiro
  Flux e per i falli violenti, con rialzata che riparte dalla posa del ragdoll.
- **Secondary motion**: catene a molla su sciarpe/capelli/antenna divisa (2-3 ossa).
- Anticipazione e follow-through su tutte le clip (curve di easing non lineari).
- *Criteri*: il piede non slitta a nessuna velocità; il calcio colpisce palla in
  qualsiasi posizione entro il raggio; ragdoll stabile (mai esplosioni numeriche).

### M10 — Look "serie TV" completo
- Outline + toon ramp rifiniti su TUTTO (palla, porte, arena in chiave grafica coerente).
- Post-processing anime: **speed-lines radiali** negli scatti Flux, **radial blur**
  nella carica del tiro, **smear frames** sulle pose congelate, vignettatura dinamica.
- Pose hero con freeze a 2-3 frame disegnati (smear) come nella serie.
- *Criteri*: screenshot affiancabile a un fotogramma della serie senza stonare nel
  linguaggio (non nei contenuti); 60 fps mantenuti.

### M11 — Kit effetti Flux fedeli (cuore della fase 2)
Nuovo sistema **FluxAura a nastri** (ribbon mesh con shader a scorrimento UV, non solo
particelle), 7 stati visivi per ogni energia:
`aura-idle → attivazione → scatto → dribbling → carica tiro → volo palla → impatto`.
- **GELO / Soffio** (fedele al Breath): nastri blu-bianchi che spiraleggiano dalle
  caviglie al busto in salita continua; foschia bassa ai piedi; brina che si propaga
  sul terreno; palla-cometa con scia elicoidale a nastro; salti "quasi volo" con
  amplificazione del doppio salto sotto aura; suono di vento glaciale.
- **OMBRA / Velo** (fedele allo Smog): volute di fumo nero-viola che risalgono gli
  arti; teletrasporto che lascia una **silhouette di fumo** che si dissolve (mesh
  fantasma con shader dissolve, non solo after-image); il tiro "sporca" l'aria
  (distorsione + calo di luce locale); **legame con la rabbia**: l'aura si carica di
  più dopo falli subiti e nei momenti di svantaggio.
- **RUGGITO / Solare** (fedele al flux dei Wambas + eco del Metal Scream): aura fulva
  con "criniera" energetica su spalle/testa; movenze feline (clip dedicate in M8-M9);
  onda d'urto conica visibile (mesh cono + distorsione) sul dribbling e sul tiro;
  impronte ardenti che restano sul campo; ruggito sintetizzato in attivazione.
- *Criteri*: i tre kit riconoscibili a colpo d'occhio in silhouette/bianco e nero
  (forma diversa, non solo colore); zero allocazioni per frame; 60 fps.

### M12 — Regia finale e rifinitura
- Le coreografie del tiro Flux rifatte sul nuovo rig: pose hero specifiche per energia
  (frame-by-frame), camera che taglia sulle pose, replay con speed-lines e smear.
- Esultanze post-goal per squadra; reazioni del pubblico coordinate con le aure.
- **LOD performance**: ossa aggiornate a frequenza dimezzata oltre 25 m, outline solo
  entro 35 m, nastri d'aura ridotti sugli avversari lontani.
- Bilanciamento finale rigiocato (partita demo) + passata di pulizia del codice.
- *Criteri*: 60 fps su hardware medio con tutto attivo; partita demo nei target;
  suite di test verde.

---

## Parte III — Note tecniche di implementazione

- **Skinning procedurale**: `Bone` hierarchy costruita in codice; geometria fusa con
  `BufferGeometryUtils.mergeGeometries`; `skinIndex`/`skinWeight` calcolati per
  vertice con falloff gaussiano sulla distanza dai segmenti-osso. Niente asset esterni.
- **Clip in codice**: `AnimationClip` da `VectorKeyframeTrack`/`QuaternionKeyframeTrack`
  generate da tabelle di pose (DSL minima: `{ t, bone, rot }`); easing con
  `Interpolant` custom dove serve anticipazione.
- **Two-bone IK** analitico (coscia-tibia e spalla-avambraccio) — niente solver
  generici, bastano coseni.
- **Ribbon d'aura**: triangle strip per nastro (24-32 segmenti) aggiornato su una
  curva elicoidale attorno all'osso, shader con scroll UV + fresnel + dissolve in punta;
  3 nastri per giocatore in aura attiva.
- **Outline**: inverted hull (scala lungo le normali, `BackSide`, nero) — robusto con
  skinning perché usa la stessa mesh; il postprocess Sobel resta opzione di riserva.
- **Speed-lines/radial blur**: pass full-screen a shader sul composer esistente,
  pilotati dal CameraDirector (intensità per stato).
- **Ragdoll verlet**: 6 punti (testa, petto, bacino, 2 mani, 2 piedi… 7) con vincoli
  di distanza, 2 iterazioni/frame, mappati alle ossa al posto del mixer finché attivo.
- Il rendering attuale (capsule rigide) resta come **fallback** dietro flag fino a M9,
  così ogni milestone resta giocabile e confrontabile (A/B con un tasto debug).
