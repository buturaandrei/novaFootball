import type { Match } from '../match/Match';

function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * HUD diegetico in stile olografico (milestone 1: punteggio, stamina,
 * messaggi evento, schema comandi, contatore FPS; barra Flux, radar e
 * tabellone completo nelle milestone successive).
 */
export class Hud {
  private root: HTMLDivElement;
  private scoreEl: HTMLDivElement;
  private clockEl: HTMLDivElement;
  private staminaFill: HTMLDivElement;
  private messageEl: HTMLDivElement;
  private fpsEl: HTMLDivElement;
  private helpEl: HTMLDivElement;
  private overlayEl: HTMLDivElement | null;

  private messageTimer = 0;
  private fpsAccum = 0;
  private fpsFrames = 0;
  private fpsTimer = 0;

  constructor(parent: HTMLElement, onStart: () => void) {
    this.root = document.createElement('div');
    this.root.style.cssText =
      'position:fixed;inset:0;pointer-events:none;z-index:30;color:#cdf3ff;' +
      "font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;";
    parent.appendChild(this.root);

    // punteggio in alto al centro
    this.scoreEl = document.createElement('div');
    this.scoreEl.style.cssText =
      'position:absolute;top:14px;left:50%;transform:translateX(-50%);' +
      'padding:8px 26px;font-size:22px;font-weight:700;letter-spacing:2px;' +
      'background:linear-gradient(180deg, rgba(10,40,60,.75), rgba(6,20,34,.75));' +
      'border:1px solid rgba(80,220,255,.5);border-radius:6px;' +
      'box-shadow:0 0 18px rgba(60,200,255,.3), inset 0 0 14px rgba(60,200,255,.1);' +
      'text-shadow:0 0 10px rgba(110,230,255,.8);';
    this.root.appendChild(this.scoreEl);

    // cronometro sotto il punteggio
    this.clockEl = document.createElement('div');
    this.clockEl.style.cssText =
      'position:absolute;top:62px;left:50%;transform:translateX(-50%);' +
      'padding:2px 14px;font-size:14px;font-weight:600;letter-spacing:2px;' +
      'background:rgba(6,20,34,.7);border:1px solid rgba(80,220,255,.35);border-radius:4px;' +
      'text-shadow:0 0 8px rgba(110,230,255,.7);';
    this.root.appendChild(this.clockEl);

    // barra stamina in basso a sinistra
    const staminaBox = document.createElement('div');
    staminaBox.style.cssText =
      'position:absolute;left:22px;bottom:22px;width:200px;';
    const staminaLabel = document.createElement('div');
    staminaLabel.textContent = 'ENERGIA';
    staminaLabel.style.cssText =
      'font-size:11px;letter-spacing:3px;margin-bottom:4px;opacity:.85;text-shadow:0 0 8px rgba(110,230,255,.7);';
    staminaBox.appendChild(staminaLabel);
    const staminaBar = document.createElement('div');
    staminaBar.style.cssText =
      'height:10px;border:1px solid rgba(80,220,255,.55);border-radius:5px;overflow:hidden;' +
      'background:rgba(8,24,40,.7);box-shadow:0 0 12px rgba(60,200,255,.25);';
    this.staminaFill = document.createElement('div');
    this.staminaFill.style.cssText =
      'height:100%;width:100%;border-radius:4px;' +
      'background:linear-gradient(90deg,#2bd9ff,#9af2ff);box-shadow:0 0 10px rgba(120,230,255,.8);';
    staminaBar.appendChild(this.staminaFill);
    staminaBox.appendChild(staminaBar);
    this.root.appendChild(staminaBox);

    // messaggi evento (GOAL!, ecc.)
    this.messageEl = document.createElement('div');
    this.messageEl.style.cssText =
      'position:absolute;top:30%;left:50%;transform:translate(-50%,-50%) skewX(-8deg);' +
      'font-size:64px;font-weight:900;letter-spacing:6px;opacity:0;' +
      'transition:opacity .25s;color:#eaffff;' +
      'text-shadow:0 0 18px rgba(110,230,255,1),0 0 46px rgba(60,180,255,.8);';
    this.root.appendChild(this.messageEl);

    // FPS in alto a destra
    this.fpsEl = document.createElement('div');
    this.fpsEl.style.cssText =
      'position:absolute;top:14px;right:14px;font-size:11px;opacity:.6;letter-spacing:1px;';
    this.root.appendChild(this.fpsEl);

    // schema comandi in basso a destra
    this.helpEl = document.createElement('div');
    this.helpEl.innerHTML =
      '<b>WASD</b> muovi · <b>MAIUSC</b> scatto · <b>SPAZIO</b> salto ·' +
      ' <b>J</b> tiro / scivolata · <b>K</b> passaggio / contrasto ·' +
      ' <b>L</b> filtrante · <b>Q</b> cambio · <b>1/2/3</b> difficoltà · <b>H</b> nascondi';
    this.helpEl.style.cssText =
      'position:absolute;right:18px;bottom:20px;font-size:12px;opacity:.75;letter-spacing:.5px;' +
      'padding:6px 12px;background:rgba(6,20,34,.6);border:1px solid rgba(80,220,255,.3);border-radius:5px;';
    this.root.appendChild(this.helpEl);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyH') {
        this.helpEl.style.display = this.helpEl.style.display === 'none' ? 'block' : 'none';
      }
    });
    // su touch lo schema dei tasti è inutile e ruba spazio ai pulsanti
    if (window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) {
      this.helpEl.style.display = 'none';
    } else {
      window.addEventListener('touchstart', () => (this.helpEl.style.display = 'none'), { once: true });
    }

    // overlay iniziale: serve un gesto per sbloccare l'audio
    this.overlayEl = document.createElement('div');
    this.overlayEl.style.cssText =
      'position:fixed;inset:0;z-index:50;display:flex;flex-direction:column;gap:18px;' +
      'align-items:center;justify-content:center;pointer-events:auto;cursor:pointer;' +
      'background:radial-gradient(ellipse at center, rgba(4,18,32,.88), rgba(2,8,18,.96));';
    const title = document.createElement('div');
    title.textContent = 'NOVA FOOTBALL';
    title.style.cssText =
      'font-size:54px;font-weight:900;letter-spacing:10px;transform:skewX(-8deg);color:#eaffff;' +
      'text-shadow:0 0 22px rgba(110,230,255,1),0 0 60px rgba(60,180,255,.9);';
    const subtitle = document.createElement('div');
    subtitle.textContent = 'ARENA ORBITALE · MILESTONE 1';
    subtitle.style.cssText = 'font-size:14px;letter-spacing:6px;opacity:.8;';
    const prompt = document.createElement('div');
    prompt.textContent = 'TOCCA O PREMI UN TASTO PER ENTRARE IN CAMPO';
    prompt.style.cssText =
      'margin-top:26px;font-size:16px;letter-spacing:3px;animation:novaPulse 1.6s ease-in-out infinite;';
    const style = document.createElement('style');
    style.textContent = '@keyframes novaPulse{0%,100%{opacity:.45}50%{opacity:1}}';
    document.head.appendChild(style);
    this.overlayEl.append(title, subtitle, prompt);
    parent.appendChild(this.overlayEl);

    const start = () => {
      if (!this.overlayEl) return;
      this.overlayEl.remove();
      this.overlayEl = null;
      onStart();
    };
    this.overlayEl.addEventListener('pointerdown', start);
    window.addEventListener('keydown', start, { once: false });
  }

  setScore(match: Match): void {
    const [a, b] = match.score;
    this.scoreEl.innerHTML =
      `<span style="color:#7fe8ff">${match.teams[0].name}</span>` +
      ` &nbsp;${a} — ${b}&nbsp; ` +
      `<span style="color:#ffba7a">${match.teams[1].name}</span>`;
  }

  setClock(half: number, seconds: number): void {
    this.clockEl.textContent = `${half}ᵀ  ${formatClock(seconds)}`;
  }

  setStamina(ratio: number): void {
    const r = Math.max(0, Math.min(1, ratio));
    this.staminaFill.style.width = `${r * 100}%`;
    this.staminaFill.style.background = r > 0.3
      ? 'linear-gradient(90deg,#2bd9ff,#9af2ff)'
      : 'linear-gradient(90deg,#ff7a4a,#ffc24a)';
  }

  showMessage(text: string, duration = 2.2): void {
    this.messageEl.textContent = text;
    this.messageEl.style.opacity = '1';
    this.messageTimer = duration;
  }

  update(dt: number): void {
    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      if (this.messageTimer <= 0) this.messageEl.style.opacity = '0';
    }
  }

  tickFps(rawDt: number): void {
    this.fpsAccum += rawDt;
    this.fpsFrames++;
    this.fpsTimer += rawDt;
    if (this.fpsTimer >= 0.5) {
      const fps = this.fpsFrames / this.fpsAccum;
      this.fpsEl.textContent = `${fps.toFixed(0)} FPS`;
      this.fpsAccum = 0;
      this.fpsFrames = 0;
      this.fpsTimer = 0;
    }
  }
}
