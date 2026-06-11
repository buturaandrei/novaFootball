/** Stato grezzo prodotto da ogni sorgente di input (tastiera, gamepad, touch). */
export interface RawInputState {
  /** Asse orizzontale schermo: -1 sinistra, +1 destra. */
  moveX: number;
  /** Asse verticale schermo: -1 verso il giocatore, +1 verso il fondo. */
  moveY: number;
  sprint: boolean;
  jump: boolean;
  kick: boolean;
  pass: boolean;
  lob: boolean;
  switchPlayer: boolean;
  fluxSprint: boolean;
  fluxDribble: boolean;
  fluxShot: boolean;
  /** Pulsante FLUX contestuale del touch: tiro/dribbling/scatto Flux. */
  fluxSmart: boolean;
}

export function emptyRawState(): RawInputState {
  return {
    moveX: 0,
    moveY: 0,
    sprint: false,
    jump: false,
    kick: false,
    pass: false,
    lob: false,
    switchPlayer: false,
    fluxSprint: false,
    fluxDribble: false,
    fluxShot: false,
    fluxSmart: false,
  };
}

/** Frame di input unificato, con rilevamento dei fronti (pressed/released). */
export interface InputFrame {
  moveX: number;
  moveY: number;
  sprint: boolean;
  jumpPressed: boolean;
  kickHeld: boolean;
  kickPressed: boolean;
  kickReleased: boolean;
  passPressed: boolean;
  lobPressed: boolean;
  switchPressed: boolean;
  fluxSprintPressed: boolean;
  fluxDribblePressed: boolean;
  fluxShotPressed: boolean;
  fluxSmartPressed: boolean;
}

export interface InputSource {
  /** Aggiorna e restituisce lo stato grezzo corrente della sorgente. */
  poll(): RawInputState;
}
