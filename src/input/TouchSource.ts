import type { InputSource, RawInputState } from './types';
import { emptyRawState } from './types';

/**
 * Sorgente touch: joystick virtuale a origine dinamica sulla metà sinistra
 * dello schermo + pulsanti olografici (SCATTO, SALTO, TIRO, CAMBIO) a destra.
 * Crea i propri elementi DOM e si mostra solo su dispositivi touch
 * (oppure al primo tocco su dispositivi ibridi).
 */
export class TouchSource implements InputSource {
  private state = emptyRawState();
  private root: HTMLDivElement;
  private stickBase: HTMLDivElement;
  private stickKnob: HTMLDivElement;
  private stickPointerId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private readonly stickRadius = 60;
  private visible = false;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.style.cssText =
      'position:fixed;inset:0;pointer-events:none;z-index:40;display:none;';
    parent.appendChild(this.root);

    // --- Joystick (metà sinistra) ---
    const stickZone = document.createElement('div');
    stickZone.style.cssText =
      'position:absolute;left:0;top:0;bottom:0;width:50%;pointer-events:auto;touch-action:none;';
    this.root.appendChild(stickZone);

    this.stickBase = document.createElement('div');
    this.stickBase.style.cssText =
      `position:absolute;width:${this.stickRadius * 2}px;height:${this.stickRadius * 2}px;` +
      'border:2px solid rgba(80,220,255,.55);border-radius:50%;' +
      'background:radial-gradient(circle, rgba(40,140,200,.12), rgba(40,140,200,.03));' +
      'box-shadow:0 0 18px rgba(60,200,255,.25), inset 0 0 24px rgba(60,200,255,.12);' +
      'transform:translate(-50%,-50%);display:none;pointer-events:none;';
    this.root.appendChild(this.stickBase);

    this.stickKnob = document.createElement('div');
    this.stickKnob.style.cssText =
      'position:absolute;width:52px;height:52px;border-radius:50%;' +
      'background:radial-gradient(circle, rgba(140,240,255,.85), rgba(60,180,230,.5));' +
      'box-shadow:0 0 16px rgba(120,230,255,.7);' +
      'transform:translate(-50%,-50%);display:none;pointer-events:none;';
    this.root.appendChild(this.stickKnob);

    stickZone.addEventListener('pointerdown', (e) => {
      if (this.stickPointerId !== null) return;
      this.stickPointerId = e.pointerId;
      stickZone.setPointerCapture(e.pointerId);
      this.stickOrigin = { x: e.clientX, y: e.clientY };
      this.moveStick(e.clientX, e.clientY);
      this.stickBase.style.display = 'block';
      this.stickKnob.style.display = 'block';
      this.stickBase.style.left = `${e.clientX}px`;
      this.stickBase.style.top = `${e.clientY}px`;
    });
    stickZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stickPointerId) return;
      this.moveStick(e.clientX, e.clientY);
    });
    const endStick = (e: PointerEvent) => {
      if (e.pointerId !== this.stickPointerId) return;
      this.stickPointerId = null;
      this.state.moveX = 0;
      this.state.moveY = 0;
      this.stickBase.style.display = 'none';
      this.stickKnob.style.display = 'none';
    };
    stickZone.addEventListener('pointerup', endStick);
    stickZone.addEventListener('pointercancel', endStick);

    // --- Pulsanti (lato destro) ---
    this.makeButton('TIRO', 'right:28px;bottom:96px;width:88px;height:88px;', (down) => {
      this.state.kick = down;
    });
    this.makeButton('SALTO', 'right:128px;bottom:40px;width:74px;height:74px;', (down) => {
      this.state.jump = down;
    });
    this.makeButton('SCATTO', 'right:36px;bottom:208px;width:70px;height:70px;', (down) => {
      this.state.sprint = down;
    });
    this.makeButton('CAMBIO', 'right:150px;bottom:172px;width:58px;height:58px;', (down) => {
      this.state.switchPlayer = down;
    });

    // Mostra i controlli su dispositivi touch, o al primo tocco su ibridi.
    if (window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) {
      this.show();
    } else {
      window.addEventListener('touchstart', () => this.show(), { once: true });
    }
  }

  private show(): void {
    this.visible = true;
    this.root.style.display = 'block';
  }

  get isVisible(): boolean {
    return this.visible;
  }

  private moveStick(x: number, y: number): void {
    let dx = x - this.stickOrigin.x;
    let dy = y - this.stickOrigin.y;
    const len = Math.hypot(dx, dy);
    if (len > this.stickRadius) {
      dx = (dx / len) * this.stickRadius;
      dy = (dy / len) * this.stickRadius;
    }
    this.stickKnob.style.left = `${this.stickOrigin.x + dx}px`;
    this.stickKnob.style.top = `${this.stickOrigin.y + dy}px`;
    this.state.moveX = dx / this.stickRadius;
    this.state.moveY = -dy / this.stickRadius;
  }

  private makeButton(label: string, pos: string, onChange: (down: boolean) => void): void {
    const btn = document.createElement('div');
    btn.textContent = label;
    btn.style.cssText =
      `position:absolute;${pos}border-radius:50%;pointer-events:auto;touch-action:none;` +
      'display:flex;align-items:center;justify-content:center;' +
      'border:2px solid rgba(80,220,255,.55);color:rgba(190,245,255,.95);' +
      'font-size:11px;font-weight:700;letter-spacing:1px;' +
      'background:radial-gradient(circle, rgba(40,140,200,.16), rgba(40,140,200,.05));' +
      'box-shadow:0 0 14px rgba(60,200,255,.25), inset 0 0 16px rgba(60,200,255,.12);';
    const set = (down: boolean) => {
      onChange(down);
      btn.style.background = down
        ? 'radial-gradient(circle, rgba(120,230,255,.45), rgba(60,180,230,.2))'
        : 'radial-gradient(circle, rgba(40,140,200,.16), rgba(40,140,200,.05))';
    };
    btn.addEventListener('pointerdown', (e) => {
      btn.setPointerCapture(e.pointerId);
      set(true);
    });
    btn.addEventListener('pointerup', () => set(false));
    btn.addEventListener('pointercancel', () => set(false));
    this.root.appendChild(btn);
  }

  poll(): RawInputState {
    return this.state;
  }
}
