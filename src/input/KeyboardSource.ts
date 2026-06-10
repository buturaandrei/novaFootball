import type { InputSource, RawInputState } from './types';
import { emptyRawState } from './types';

/**
 * Tastiera: WASD / frecce per muoversi, Maiusc scatto, Spazio salto,
 * J calcio (tieni premuto per caricare), Q o Tab cambio giocatore.
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
    s.kick = this.down('KeyJ', 'KeyK');
    s.switchPlayer = this.down('KeyQ', 'Tab');
    return s;
  }
}
