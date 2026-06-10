/** Stato grezzo prodotto da ogni sorgente di input (tastiera, gamepad, touch). */
export interface RawInputState {
  /** Asse orizzontale schermo: -1 sinistra, +1 destra. */
  moveX: number;
  /** Asse verticale schermo: -1 verso il giocatore, +1 verso il fondo. */
  moveY: number;
  sprint: boolean;
  jump: boolean;
  kick: boolean;
  switchPlayer: boolean;
}

export function emptyRawState(): RawInputState {
  return { moveX: 0, moveY: 0, sprint: false, jump: false, kick: false, switchPlayer: false };
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
  switchPressed: boolean;
}

export interface InputSource {
  /** Aggiorna e restituisce lo stato grezzo corrente della sorgente. */
  poll(): RawInputState;
}
