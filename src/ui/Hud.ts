import type { Match } from '../match/Match';
import type { FluxProfile } from '../flux/FluxProfile';

function hexColor(c: number): string {
  return `#${c.toString(16).padStart(6, '0')}`;
}

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
  private fluxLabel: HTMLDivElement;
  private fluxFill: HTMLDivElement;
  private fluxReadyEl: HTMLDivElement;
  private oppFluxFill: HTMLDivElement;
  private messageEl: HTMLDivElement;
  private fpsEl: HTMLDivElement;
  private helpEl: HTMLDivElement;

  private radar: HTMLCanvasElement;
  private radarCtx: CanvasRenderingContext2D;
  private pauseOverlay: HTMLDivElement;
  private resultPanel: HTMLDivElement;
  private messageTimer = 0;
  private fpsAccum = 0;
  private fpsFrames = 0;
  private fpsTimer = 0;
  /** Richiesta di pausa dal pulsante ⏸ (impostata dal Game). */
  onPauseRequest: (() => void) | null = null;

  constructor(parent: HTMLElement) {
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

    // barra Flux sopra la stamina
    const fluxBox = document.createElement('div');
    fluxBox.style.cssText = 'position:absolute;left:22px;bottom:64px;width:200px;';
    this.fluxLabel = document.createElement('div');
    this.fluxLabel.textContent = 'FLUX';
    this.fluxLabel.style.cssText =
      'font-size:11px;letter-spacing:3px;margin-bottom:4px;opacity:.9;text-shadow:0 0 8px rgba(110,230,255,.7);';
    fluxBox.appendChild(this.fluxLabel);
    const fluxBar = document.createElement('div');
    fluxBar.style.cssText =
      'position:relative;height:12px;border:1px solid rgba(160,220,255,.6);border-radius:6px;overflow:hidden;' +
      'background:rgba(8,24,40,.7);box-shadow:0 0 14px rgba(110,200,255,.3);';
    this.fluxFill = document.createElement('div');
    this.fluxFill.style.cssText =
      'height:100%;width:25%;border-radius:5px;background:#6ef0ff;box-shadow:0 0 12px #6ef0ff;';
    fluxBar.appendChild(this.fluxFill);
    this.fluxReadyEl = document.createElement('div');
    this.fluxReadyEl.textContent = 'PRONTO';
    this.fluxReadyEl.style.cssText =
      'position:absolute;inset:0;display:none;align-items:center;justify-content:center;' +
      'font-size:9px;font-weight:900;letter-spacing:4px;color:#04111e;' +
      'animation:novaPulse 1s ease-in-out infinite;';
    fluxBar.appendChild(this.fluxReadyEl);
    fluxBox.appendChild(fluxBar);
    this.root.appendChild(fluxBox);

    // mini-barra Flux dell'avversario, sotto il cronometro
    this.oppFluxFill = document.createElement('div');
    const oppFluxBar = document.createElement('div');
    oppFluxBar.style.cssText =
      'position:absolute;top:88px;left:50%;transform:translateX(-50%);width:110px;height:5px;' +
      'border:1px solid rgba(160,220,255,.35);border-radius:3px;overflow:hidden;background:rgba(8,24,40,.6);';
    this.oppFluxFill.style.cssText = 'height:100%;width:25%;background:#b44aff;';
    oppFluxBar.appendChild(this.oppFluxFill);
    this.root.appendChild(oppFluxBar);

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
      ' <b>J</b> tiro / scivolata · <b>K</b> passaggio / contrasto · <b>L</b> filtrante ·' +
      ' <b>E</b> scatto Flux · <b>R</b> dribbling Flux ·' +
      ' <b>Q</b> cambio · <b>1/2/3</b> difficoltà · <b>H</b> nascondi';
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

    const style = document.createElement('style');
    style.textContent = '@keyframes novaPulse{0%,100%{opacity:.45}50%{opacity:1}}';
    document.head.appendChild(style);

    // radar minimappa (proporzioni campo 62:38)
    this.radar = document.createElement('canvas');
    this.radar.width = 150;
    this.radar.height = 92;
    this.radar.style.cssText =
      'position:absolute;left:50%;bottom:18px;transform:translateX(-50%);width:150px;height:92px;' +
      'border:1px solid rgba(80,220,255,.4);border-radius:6px;background:rgba(6,18,30,.55);' +
      'box-shadow:0 0 12px rgba(60,200,255,.2);';
    this.radarCtx = this.radar.getContext('2d')!;
    this.root.appendChild(this.radar);

    // pulsante pausa
    const pauseBtn = document.createElement('div');
    pauseBtn.textContent = '⏸';
    pauseBtn.style.cssText =
      'position:absolute;top:12px;left:16px;width:38px;height:38px;border-radius:50%;' +
      'display:flex;align-items:center;justify-content:center;pointer-events:auto;cursor:pointer;' +
      'border:1px solid rgba(80,220,255,.5);background:rgba(8,24,40,.7);font-size:16px;';
    pauseBtn.addEventListener('pointerdown', () => this.onPauseRequest?.());
    this.root.appendChild(pauseBtn);

    // overlay di pausa con schema comandi
    this.pauseOverlay = document.createElement('div');
    this.pauseOverlay.style.cssText =
      'position:fixed;inset:0;z-index:55;display:none;flex-direction:column;gap:16px;' +
      'align-items:center;justify-content:center;pointer-events:auto;' +
      'background:rgba(2,8,18,.88);color:#cdf3ff;text-align:center;padding:16px;';
    const pTitle = document.createElement('div');
    pTitle.textContent = 'PAUSA';
    pTitle.style.cssText =
      'font-size:42px;font-weight:900;letter-spacing:8px;transform:skewX(-8deg);color:#eaffff;' +
      'text-shadow:0 0 18px rgba(110,230,255,1);';
    const pHelp = document.createElement('div');
    pHelp.style.cssText = 'font-size:13px;line-height:2;opacity:.85;max-width:600px;';
    pHelp.innerHTML =
      '<b>WASD</b> muovi · <b>MAIUSC</b> scatto · <b>SPAZIO</b> salto/doppio salto<br>' +
      '<b>J</b> tiro / scivolata · <b>K</b> passaggio / contrasto · <b>L</b> filtrante alto<br>' +
      '<b>E</b> scatto Flux · <b>R</b> dribbling Flux · <b>F</b> tiro Flux (barra piena)<br>' +
      '<b>Q</b> cambio giocatore · <b>C</b> visuale · <b>1/2/3</b> difficoltà · <b>P</b> pausa<br>' +
      '<span style="opacity:.7">Touch: TIRO · PASSA (tieni premuto = filtrante) · FLUX contestuale · SALTO<br>' +
      'joystick a fondo corsa = scatto</span>';
    const pResume = document.createElement('div');
    pResume.textContent = 'RIPRENDI';
    pResume.style.cssText =
      'padding:10px 28px;border-radius:8px;cursor:pointer;font-weight:800;letter-spacing:3px;' +
      'border:2px solid rgba(80,220,255,.7);background:rgba(70,200,255,.2);';
    pResume.addEventListener('pointerdown', () => this.onPauseRequest?.());
    const pMenu = document.createElement('div');
    pMenu.textContent = 'TORNA AL MENU';
    pMenu.style.cssText =
      'padding:8px 20px;border-radius:8px;cursor:pointer;font-size:12px;letter-spacing:2px;' +
      'border:1px solid rgba(80,220,255,.4);background:rgba(8,24,40,.7);';
    pMenu.addEventListener('pointerdown', () => window.location.reload());
    this.pauseOverlay.append(pTitle, pHelp, pResume, pMenu);
    parent.appendChild(this.pauseOverlay);

    // pannello risultato a fine partita
    this.resultPanel = document.createElement('div');
    this.resultPanel.style.cssText =
      'position:fixed;left:50%;top:55%;transform:translate(-50%,-50%);z-index:54;display:none;' +
      'flex-direction:column;gap:14px;align-items:center;pointer-events:auto;' +
      'padding:22px 34px;border-radius:12px;border:1px solid rgba(80,220,255,.5);' +
      'background:rgba(4,16,28,.92);box-shadow:0 0 30px rgba(60,200,255,.3);color:#cdf3ff;';
    parent.appendChild(this.resultPanel);
  }

  /** Mostra/nasconde l'overlay di pausa. */
  setPauseVisible(on: boolean): void {
    this.pauseOverlay.style.display = on ? 'flex' : 'none';
  }

  /** Pannello di fine partita con RIGIOCA / MENU. */
  showResult(text: string, onReplay: () => void): void {
    this.resultPanel.replaceChildren();
    const t = document.createElement('div');
    t.textContent = text;
    t.style.cssText =
      'font-size:26px;font-weight:900;letter-spacing:3px;text-shadow:0 0 14px rgba(110,230,255,.9);';
    const again = document.createElement('div');
    again.textContent = 'RIGIOCA';
    again.style.cssText =
      'padding:10px 28px;border-radius:8px;cursor:pointer;font-weight:800;letter-spacing:3px;' +
      'border:2px solid rgba(80,220,255,.7);background:rgba(70,200,255,.2);';
    again.addEventListener('pointerdown', () => onReplay());
    const menu = document.createElement('div');
    menu.textContent = 'TORNA AL MENU';
    menu.style.cssText =
      'padding:8px 20px;border-radius:8px;cursor:pointer;font-size:12px;letter-spacing:2px;' +
      'border:1px solid rgba(80,220,255,.4);background:rgba(8,24,40,.7);';
    menu.addEventListener('pointerdown', () => window.location.reload());
    this.resultPanel.append(t, again, menu);
    this.resultPanel.style.display = 'flex';
  }

  hideResult(): void {
    this.resultPanel.style.display = 'none';
  }

  /** Radar minimappa: campo, giocatori (colori squadra) e palla. */
  updateRadar(
    players: { x: number; z: number; team: number }[],
    ball: { x: number; z: number },
    colors: [string, string],
  ): void {
    const c = this.radarCtx;
    const w = this.radar.width;
    const h = this.radar.height;
    c.clearRect(0, 0, w, h);
    c.strokeStyle = 'rgba(90,220,255,.5)';
    c.strokeRect(3, 3, w - 6, h - 6);
    c.beginPath();
    c.moveTo(w / 2, 3);
    c.lineTo(w / 2, h - 3);
    c.stroke();
    const px = (x: number) => ((x + 31) / 62) * (w - 10) + 5;
    const pz = (z: number) => ((z + 19) / 38) * (h - 10) + 5;
    for (const p of players) {
      c.fillStyle = colors[p.team];
      c.fillRect(px(p.x) - 1.7, pz(p.z) - 1.7, 3.4, 3.4);
    }
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(px(ball.x), pz(ball.z), 2.4, 0, Math.PI * 2);
    c.fill();
  }

  setScore(match: Match): void {
    const [a, b] = match.score;
    this.scoreEl.innerHTML =
      `<span style="color:#7fe8ff">${match.teams[0].name}</span>` +
      ` &nbsp;${a} — ${b}&nbsp; ` +
      `<span style="color:#ffba7a">${match.teams[1].name}</span>`;
  }

  setFlux(
    ratio: number,
    ready: boolean,
    profile: FluxProfile,
    oppRatio: number,
    oppProfile: FluxProfile,
  ): void {
    this.fluxLabel.textContent = `FLUX — ${profile.energyName}`;
    const color = hexColor(profile.color);
    this.fluxFill.style.width = `${Math.min(100, ratio * 100)}%`;
    this.fluxFill.style.background = color;
    this.fluxFill.style.boxShadow = `0 0 12px ${color}`;
    this.fluxReadyEl.style.display = ready ? 'flex' : 'none';
    this.oppFluxFill.style.width = `${Math.min(100, oppRatio * 100)}%`;
    this.oppFluxFill.style.background = hexColor(oppProfile.color);
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
