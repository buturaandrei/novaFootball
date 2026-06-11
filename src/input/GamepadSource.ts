import type { InputSource, RawInputState } from './types';
import { emptyRawState } from './types';

const DEADZONE = 0.18;

function applyDeadzone(v: number): number {
  const a = Math.abs(v);
  if (a < DEADZONE) return 0;
  return Math.sign(v) * ((a - DEADZONE) / (1 - DEADZONE));
}

/**
 * Gamepad (layout standard): stick sinistro movimento, A salto,
 * X tiro/scivolata, B passaggio/contrasto, Y filtrante alto,
 * LB cambio giocatore, RB/RT scatto.
 */
export class GamepadSource implements InputSource {
  private state = emptyRawState();

  poll(): RawInputState {
    const s = this.state;
    s.moveX = 0; s.moveY = 0;
    s.sprint = false; s.jump = false; s.kick = false;
    s.pass = false; s.lob = false; s.switchPlayer = false;

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      s.moveX += applyDeadzone(pad.axes[0] ?? 0);
      s.moveY += -applyDeadzone(pad.axes[1] ?? 0);
      const btn = (i: number) => !!pad.buttons[i] && (pad.buttons[i].pressed || pad.buttons[i].value > 0.4);
      s.jump = s.jump || btn(0); // A / Cross
      s.pass = s.pass || btn(1); // B / Cerchio
      s.kick = s.kick || btn(2); // X / Quadrato
      s.lob = s.lob || btn(3); // Y / Triangolo
      s.switchPlayer = s.switchPlayer || btn(4); // LB
      s.sprint = s.sprint || btn(5); // RB
      s.fluxSprint = s.fluxSprint || btn(7); // RT
      s.fluxDribble = s.fluxDribble || btn(6); // LT
      s.fluxShot = s.fluxShot || btn(11) || (btn(6) && btn(7)); // R3 oppure LT+RT
    }
    s.moveX = Math.max(-1, Math.min(1, s.moveX));
    s.moveY = Math.max(-1, Math.min(1, s.moveY));
    return s;
  }
}
