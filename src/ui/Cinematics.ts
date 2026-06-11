/**
 * Sovrimpressioni cinematiche DOM: bande letterbox, flash, banner della
 * mossa Flux (font inclinato + glow), indicatore REPLAY e mini-sfida di
 * timing (QTE) per la parata Flux.
 */
export class Cinematics {
  private top: HTMLDivElement;
  private bottom: HTMLDivElement;
  private flash: HTMLDivElement;
  private banner: HTMLDivElement;
  private replayEl: HTMLDivElement;
  private qteBox: HTMLDivElement;
  private qteRing: HTMLDivElement;
  private letterboxOn = false;

  constructor(parent: HTMLElement) {
    const band = (pos: string) => {
      const el = document.createElement('div');
      el.style.cssText =
        `position:fixed;left:0;right:0;${pos}:0;height:0;background:#000;z-index:45;` +
        'transition:height .22s ease-out;pointer-events:none;';
      parent.appendChild(el);
      return el;
    };
    this.top = band('top');
    this.bottom = band('bottom');

    this.flash = document.createElement('div');
    this.flash.style.cssText =
      'position:fixed;inset:0;background:#fff;opacity:0;z-index:48;pointer-events:none;' +
      'transition:opacity .25s ease-out;';
    parent.appendChild(this.flash);

    this.banner = document.createElement('div');
    this.banner.style.cssText =
      'position:fixed;top:18%;left:50%;z-index:46;pointer-events:none;' +
      'transform:translateX(-50%) skewX(-12deg) scale(.6);opacity:0;' +
      'font-size:52px;font-weight:900;letter-spacing:8px;white-space:nowrap;' +
      "font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;" +
      'transition:opacity .2s, transform .25s cubic-bezier(.2,1.6,.4,1);';
    parent.appendChild(this.banner);

    this.replayEl = document.createElement('div');
    this.replayEl.textContent = '◉ REPLAY';
    this.replayEl.style.cssText =
      'position:fixed;top:18px;left:22px;z-index:46;display:none;pointer-events:none;' +
      'font-size:16px;font-weight:800;letter-spacing:4px;color:#eaffff;' +
      'text-shadow:0 0 10px rgba(110,230,255,.9);animation:novaPulse 1.2s infinite;';
    parent.appendChild(this.replayEl);

    // QTE parata Flux: anello che si stringe sul bersaglio
    this.qteBox = document.createElement('div');
    this.qteBox.style.cssText =
      'position:fixed;bottom:26%;left:50%;transform:translateX(-50%);z-index:47;display:none;' +
      'pointer-events:none;text-align:center;';
    const label = document.createElement('div');
    label.textContent = 'PARATA FLUX — PREMI TIRO!';
    label.style.cssText =
      'font-size:15px;font-weight:800;letter-spacing:3px;color:#eaffff;margin-bottom:10px;' +
      'text-shadow:0 0 12px rgba(110,230,255,1);';
    const target = document.createElement('div');
    target.style.cssText =
      'position:relative;width:74px;height:74px;margin:0 auto;';
    const core = document.createElement('div');
    core.style.cssText =
      'position:absolute;inset:18px;border-radius:50%;border:3px solid #6ef0ff;' +
      'box-shadow:0 0 14px #6ef0ff, inset 0 0 10px rgba(110,240,255,.5);';
    this.qteRing = document.createElement('div');
    this.qteRing.style.cssText =
      'position:absolute;inset:-40px;border-radius:50%;border:3px solid #fff;' +
      'box-shadow:0 0 16px rgba(255,255,255,.8);';
    target.append(core, this.qteRing);
    this.qteBox.append(label, target);
    parent.appendChild(this.qteBox);
  }

  setLetterbox(on: boolean): void {
    if (this.letterboxOn === on) return;
    this.letterboxOn = on;
    const h = on ? '11vh' : '0px';
    this.top.style.height = h;
    this.bottom.style.height = h;
  }

  /** Flash bianco istantaneo che svanisce. */
  doFlash(): void {
    this.flash.style.transition = 'none';
    this.flash.style.opacity = '0.95';
    requestAnimationFrame(() => {
      this.flash.style.transition = 'opacity .3s ease-out';
      this.flash.style.opacity = '0';
    });
  }

  showBanner(text: string, colorHex: string): void {
    this.banner.textContent = text;
    this.banner.style.color = '#ffffff';
    this.banner.style.textShadow = `0 0 18px ${colorHex}, 0 0 50px ${colorHex}, 0 2px 0 #000`;
    this.banner.style.opacity = '1';
    this.banner.style.transform = 'translateX(-50%) skewX(-12deg) scale(1)';
  }

  hideBanner(): void {
    this.banner.style.opacity = '0';
    this.banner.style.transform = 'translateX(-50%) skewX(-12deg) scale(.6)';
  }

  setReplay(on: boolean): void {
    this.replayEl.style.display = on ? 'block' : 'none';
  }

  /** QTE: progress 0..1, 1 = anello chiuso sul bersaglio. */
  setQte(progress: number | null): void {
    if (progress === null) {
      this.qteBox.style.display = 'none';
      return;
    }
    this.qteBox.style.display = 'block';
    const inset = -40 + 58 * Math.min(1, progress); // -40px → 18px (sul cerchio)
    this.qteRing.style.inset = `${inset}px`;
  }
}
