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
 * X calcio, RB/RT scatto, Y cambio giocatore.
 */
export class GamepadSource implements InputSource {
  private state = emptyRawState();

  poll(): RawInputState {
    const s = this.state;
    s.moveX = 0; s.moveY = 0;
    s.sprint = false; s.jump = false; s.kick = false; s.switchPlayer = false;

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      s.moveX += applyDeadzone(pad.axes[0] ?? 0);
      s.moveY += -applyDeadzone(pad.axes[1] ?? 0);
      const btn = (i: number) => !!pad.buttons[i] && (pad.buttons[i].pressed || pad.buttons[i].value > 0.4);
      s.jump = s.jump || btn(0); // A / Cross
      s.kick = s.kick || btn(2); // X / Square
      s.switchPlayer = s.switchPlayer || btn(3); // Y / Triangle
      s.sprint = s.sprint || btn(5) || btn(7); // RB o RT
    }
    s.moveX = Math.max(-1, Math.min(1, s.moveX));
    s.moveY = Math.max(-1, Math.min(1, s.moveY));
    return s;
  }
}
