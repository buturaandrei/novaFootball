import type { InputSource, RawInputState } from './types';
import { emptyRawState } from './types';

/**
 * Tastiera: WASD / frecce per muoversi, Maiusc scatto, Spazio salto,
 * J tiro (tieni premuto per caricare) / scivolata in difesa,
 * K passaggio rasoterra / contrasto in piedi, L filtrante alto,
 * Q o Tab cambio giocatore.
 */
export class KeyboardSource implements InputSource {
  private keys = new Set<string>();
  private state = emptyRawState();

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      this.keys.add(e.code);
    });
    target.addEventListener('keyup', (e) => this.keys.delete(e.code));
    target.addEventListener('blur', () => this.keys.clear());
  }

  private down(...codes: string[]): boolean {
    return codes.some((c) => this.keys.has(c));
  }

  poll(): RawInputState {
    const s = this.state;
    s.moveX = (this.down('KeyD', 'ArrowRight') ? 1 : 0) - (this.down('KeyA', 'ArrowLeft') ? 1 : 0);
    s.moveY = (this.down('KeyW', 'ArrowUp') ? 1 : 0) - (this.down('KeyS', 'ArrowDown') ? 1 : 0);
    s.sprint = this.down('ShiftLeft', 'ShiftRight');
    s.jump = this.down('Space');
    s.kick = this.down('KeyJ');
    s.pass = this.down('KeyK');
    s.lob = this.down('KeyL');
    s.switchPlayer = this.down('KeyQ', 'Tab');
    s.fluxSprint = this.down('KeyE');
    s.fluxDribble = this.down('KeyR');
    s.fluxShot = this.down('KeyF');
    s.camera = this.down('KeyC');
    return s;
  }
}
