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
  private prevPass = false;
  private prevLob = false;
  private prevSwitch = false;
  private prevFluxSprint = false;
  private prevFluxDribble = false;
  private prevFluxShot = false;
  private prevFluxSmart = false;

  readonly frame: InputFrame = {
    moveX: 0,
    moveY: 0,
    sprint: false,
    jumpPressed: false,
    kickHeld: false,
    kickPressed: false,
    kickReleased: false,
    passPressed: false,
    lobPressed: false,
    switchPressed: false,
    fluxSprintPressed: false,
    fluxDribblePressed: false,
    fluxShotPressed: false,
    fluxSmartPressed: false,
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
    let pass = false;
    let lob = false;
    let sw = false;
    let fxS = false;
    let fxD = false;
    let fxT = false;
    let fxC = false;

    for (const src of this.sources) {
      const s = src.poll();
      moveX += s.moveX;
      moveY += s.moveY;
      sprint = sprint || s.sprint;
      jump = jump || s.jump;
      kick = kick || s.kick;
      pass = pass || s.pass;
      lob = lob || s.lob;
      sw = sw || s.switchPlayer;
      fxS = fxS || s.fluxSprint;
      fxD = fxD || s.fluxDribble;
      fxT = fxT || s.fluxShot;
      fxC = fxC || s.fluxSmart;
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
    f.passPressed = pass && !this.prevPass;
    f.lobPressed = lob && !this.prevLob;
    f.switchPressed = sw && !this.prevSwitch;
    f.fluxSprintPressed = fxS && !this.prevFluxSprint;
    f.fluxDribblePressed = fxD && !this.prevFluxDribble;
    f.fluxShotPressed = fxT && !this.prevFluxShot;
    f.fluxSmartPressed = fxC && !this.prevFluxSmart;

    this.prevJump = jump;
    this.prevKick = kick;
    this.prevPass = pass;
    this.prevLob = lob;
    this.prevSwitch = sw;
    this.prevFluxSprint = fxS;
    this.prevFluxDribble = fxD;
    this.prevFluxShot = fxT;
    this.prevFluxSmart = fxC;
    return f;
  }
}
