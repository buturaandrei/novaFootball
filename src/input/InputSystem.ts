import { GamepadSource } from './GamepadSource';
import { KeyboardSource } from './KeyboardSource';
import { TouchSource } from './TouchSource';
import type { InputFrame, InputSource } from './types';

/**
 * Unifica tastiera, gamepad e touch in un unico InputFrame per frame,
 * con rilevamento centralizzato dei fronti di pressione/rilascio.
 */
export class InputSystem {
  readonly touch: TouchSource;
  private sources: InputSource[];

  private prevJump = false;
  private prevKick = false;
  private prevSwitch = false;

  readonly frame: InputFrame = {
    moveX: 0,
    moveY: 0,
    sprint: false,
    jumpPressed: false,
    kickHeld: false,
    kickPressed: false,
    kickReleased: false,
    switchPressed: false,
  };

  constructor(uiParent: HTMLElement) {
    this.touch = new TouchSource(uiParent);
    this.sources = [new KeyboardSource(), new GamepadSource(), this.touch];
  }

  update(): InputFrame {
    let moveX = 0;
    let moveY = 0;
    let sprint = false;
    let jump = false;
    let kick = false;
    let sw = false;

    for (const src of this.sources) {
      const s = src.poll();
      moveX += s.moveX;
      moveY += s.moveY;
      sprint = sprint || s.sprint;
      jump = jump || s.jump;
      kick = kick || s.kick;
      sw = sw || s.switchPlayer;
    }

    const len = Math.hypot(moveX, moveY);
    if (len > 1) {
      moveX /= len;
      moveY /= len;
    }

    const f = this.frame;
    f.moveX = moveX;
    f.moveY = moveY;
    f.sprint = sprint;
    f.jumpPressed = jump && !this.prevJump;
    f.kickHeld = kick;
    f.kickPressed = kick && !this.prevKick;
    f.kickReleased = !kick && this.prevKick;
    f.switchPressed = sw && !this.prevSwitch;

    this.prevJump = jump;
    this.prevKick = kick;
    this.prevSwitch = sw;
    return f;
  }
}
