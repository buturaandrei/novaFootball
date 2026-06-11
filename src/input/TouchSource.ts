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
  private fluxShotBtn!: HTMLDivElement;

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
      this.state.sprint = false;
      this.stickBase.style.display = 'none';
      this.stickKnob.style.display = 'none';
    };
    stickZone.addEventListener('pointerup', endStick);
    stickZone.addEventListener('pointercancel', endStick);

    // --- Pulsanti (lato destro) ---
    // Schema minimale "stile The Spike": 3 azioni contestuali + salto.
    // Lo scatto normale è sul joystick (spingilo fino al bordo);
    // TIRO = tiro/scivolata/parata, PASSA = tap rasoterra · tieni
    // premuto filtrante / contrasto in difesa, FLUX decide da solo
    // (tiro Flux a barra piena, dribbling con palla, scatto senza).
    this.makeButton('TIRO', 'right:14px;bottom:14px;width:86px;height:86px;', (down) => {
      this.state.kick = down;
    });
    this.makePassButton('right:110px;bottom:14px;width:72px;height:72px;');
    this.fluxShotBtn = this.makeButton('FLUX', 'right:24px;bottom:112px;width:70px;height:70px;', (down) => {
      this.state.fluxSmart = down;
    }, true);
    this.fluxShotBtn.style.opacity = '0.55';
    this.makeButton('SALTO', 'right:118px;bottom:98px;width:62px;height:62px;', (down) => {
      this.state.jump = down;
    });
    this.makeButton('CAMBIO', 'right:14px;top:64px;width:46px;height:46px;', (down) => {
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
    // scatto integrato nel joystick: spinta a fondo corsa = corsa
    this.state.sprint = len >= this.stickRadius * 0.95;
  }

  /** Il pulsante FLUX si accende quando la barra è piena (tiro pronto). */
  setFluxShotReady(ready: boolean): void {
    if (!this.fluxShotBtn) return;
    this.fluxShotBtn.style.opacity = ready ? '1' : '0.55';
    this.fluxShotBtn.style.boxShadow = ready
      ? '0 0 26px rgba(190,140,255,.95), inset 0 0 20px rgba(190,140,255,.45)'
      : '0 0 14px rgba(170,110,255,.35), inset 0 0 16px rgba(60,200,255,.12)';
  }

  /**
   * PASSA con doppia funzione: tap = passaggio rasoterra, pressione
   * prolungata (350 ms) = filtrante alto. Gli impulsi restano attivi
   * ~150 ms così il polling a frame li campiona anche a basso framerate.
   */
  private makePassButton(pos: string): void {
    this.makeButton('PASSA', pos, (down) => {
      const now = performance.now();
      if (down) {
        this.passBtnDown = true;
        this.passDownSince = now;
        this.passHoldFired = false;
      } else {
        if (this.passBtnDown && !this.passHoldFired && now - this.passDownSince < 350) {
          this.passPulseUntil = now + 150; // tap breve → rasoterra
        }
        this.passBtnDown = false;
      }
    });
  }

  private passBtnDown = false;
  private passDownSince = 0;
  private passHoldFired = false;
  private passPulseUntil = 0;
  private lobPulseUntil = 0;

  private makeButton(label: string, pos: string, onChange: (down: boolean) => void, flux = false): HTMLDivElement {
    const btn = document.createElement('div');
    btn.textContent = label;
    const border = flux ? 'rgba(190,160,255,.65)' : 'rgba(80,220,255,.55)';
    const glow = flux ? 'rgba(170,110,255,.35)' : 'rgba(60,200,255,.25)';
    btn.style.cssText =
      `position:absolute;${pos}border-radius:50%;pointer-events:auto;touch-action:none;` +
      'display:flex;align-items:center;justify-content:center;text-align:center;' +
      `border:2px solid ${border};color:rgba(190,245,255,.95);` +
      'font-size:10px;font-weight:700;letter-spacing:.5px;' +
      'background:radial-gradient(circle, rgba(40,140,200,.16), rgba(40,140,200,.05));' +
      `box-shadow:0 0 14px ${glow}, inset 0 0 16px rgba(60,200,255,.12);`;
    const set = (down: boolean) => {
      onChange(down);
      btn.style.background = down
        ? 'radial-gradient(circle, rgba(120,230,255,.45), rgba(60,180,230,.2))'
        : 'radial-gradient(circle, rgba(40,140,200,.16), rgba(40,140,200,.05))';
    };
    btn.addEventListener('pointerdown', (e) => {
      // i pulsanti sono cerchi ma il DOM ha aree quadrate: gli angoli
      // invisibili non devono rubare il tocco al pulsante accanto
      const r = btn.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      if (Math.hypot(dx, dy) > r.width / 2 + 8) return;
      btn.setPointerCapture(e.pointerId);
      set(true);
    });
    btn.addEventListener('pointerup', () => set(false));
    btn.addEventListener('pointercancel', () => set(false));
    this.root.appendChild(btn);
    return btn;
  }

  poll(): RawInputState {
    const now = performance.now();
    // pressione prolungata di PASSA → filtrante alto, subito alla soglia
    if (this.passBtnDown && !this.passHoldFired && now - this.passDownSince >= 350) {
      this.passHoldFired = true;
      this.lobPulseUntil = now + 150;
    }
    this.state.pass = now < this.passPulseUntil;
    this.state.lob = now < this.lobPulseUntil;
    return this.state;
  }
}
