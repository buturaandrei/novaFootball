/**
 * Audio interamente sintetizzato con Web Audio API: niente file esterni.
 * Calci, rimbalzi, impatti sui muri energetici, fischio, boato del pubblico
 * e un tappeto ambientale di folla in loop.
 */
export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private crowdGain: GainNode | null = null;
  private crowdSwellTarget = 0;

  /** Da chiamare al primo gesto dell'utente per sbloccare l'AudioContext. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(this.ctx.destination);
    this.startCrowdBed();
  }

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  private noiseBuffer(duration: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** Mormorio di folla continuo: rumore filtrato con lente modulazioni. */
  private startCrowdBed(): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(2);
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 520;
    bp.Q.value = 0.6;
    this.crowdGain = ctx.createGain();
    this.crowdGain.gain.value = 0.05;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.018;
    lfo.connect(lfoGain).connect(this.crowdGain.gain);
    src.connect(bp).connect(this.crowdGain).connect(this.master!);
    src.start();
    lfo.start();
  }

  /** Calcio alla palla: thump grave + sbuffo di rumore, intensità 0..1. */
  kick(power: number): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const p = Math.min(1, Math.max(0, power));

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120 + 60 * p, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.14);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.5 + 0.45 * p, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(og).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.2);

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer(0.1);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.18 + 0.25 * p, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    noise.connect(hp).connect(ng).connect(this.master);
    noise.start(t);
  }

  /** Rimbalzo a terra. */
  bounce(intensity: number): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const i = Math.min(1, intensity);
    if (i < 0.05) return;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(170, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.25 * i, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.12);
  }

  /** Impatto sul muro energetico: "zap" elettrico + sub. */
  wallHit(intensity: number): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const i = Math.min(1, intensity);

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(420, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.18);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(900, t);
    bp.frequency.exponentialRampToValueAtTime(200, t + 0.18);
    bp.Q.value = 2.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.3 * i + 0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.connect(bp).connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.3);

    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(70, t);
    sub.frequency.exponentialRampToValueAtTime(34, t + 0.2);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.3 * i, t);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    sub.connect(sg).connect(this.master);
    sub.start(t);
    sub.stop(t + 0.25);
  }

  /** Fischio dell'arbitro (doppio trillo). */
  whistle(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    for (let n = 0; n < 2; n++) {
      const t = t0 + n * 0.22;
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 2350;
      const vib = ctx.createOscillator();
      vib.frequency.value = 38;
      const vibGain = ctx.createGain();
      vibGain.gain.value = 120;
      vib.connect(vibGain).connect(osc.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
      g.gain.setValueAtTime(0.12, t + 0.12);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.connect(g).connect(this.master);
      osc.start(t);
      osc.stop(t + 0.2);
      vib.start(t);
      vib.stop(t + 0.2);
    }
  }

  /** Boato del pubblico per il goal: swell di rumore + spinta al tappeto. */
  goalRoar(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer(2.5);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(420, t);
    bp.frequency.linearRampToValueAtTime(750, t + 0.5);
    bp.Q.value = 0.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.55, t + 0.25);
    g.gain.setValueAtTime(0.55, t + 1.0);
    g.gain.exponentialRampToValueAtTime(0.001, t + 2.4);
    noise.connect(bp).connect(g).connect(this.master);
    noise.start(t);

    this.crowdSwellTarget = 1.6;
  }

  /** "Whoosh" del salto/scatto, leggero. */
  whoosh(intensity: number): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer(0.25);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(1800, t + 0.18);
    bp.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.08 * intensity + 0.02, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    noise.connect(bp).connect(g).connect(this.master);
    noise.start(t);
  }

  /** "Whoosh" energetico del Flux, con timbro diverso per ogni energia. */
  fluxSurge(id: 'gelo' | 'ombra' | 'ruggito', strong: boolean): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dur = strong ? 0.45 : 0.3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(strong ? 0.3 : 0.2, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    g.connect(this.master);

    if (id === 'gelo') {
      // scintillio cristallino ascendente
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(900, t);
      osc.frequency.exponentialRampToValueAtTime(2600, t + dur);
      osc.connect(g);
      osc.start(t);
      osc.stop(t + dur);
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer(dur);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 3200;
      noise.connect(hp).connect(g);
      noise.start(t);
    } else if (id === 'ombra') {
      // risucchio scuro discendente
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer(dur);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(1400, t);
      lp.frequency.exponentialRampToValueAtTime(140, t + dur);
      noise.connect(lp).connect(g);
      noise.start(t);
      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(90, t);
      sub.frequency.exponentialRampToValueAtTime(38, t + dur);
      sub.connect(g);
      sub.start(t);
      sub.stop(t + dur);
    } else {
      // ringhio ambrato: due seghe detonate + rumore
      for (const f of [62, 93]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f, t);
        osc.frequency.exponentialRampToValueAtTime(f * 0.6, t + dur);
        const og = ctx.createGain();
        og.gain.value = 0.5;
        osc.connect(og).connect(g);
        osc.start(t);
        osc.stop(t + dur);
      }
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer(dur);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 300;
      bp.Q.value = 1.5;
      noise.connect(bp).connect(g);
      noise.start(t);
    }
  }

  /** Campanellino: la barra Flux è piena (PRONTO). */
  fluxReady(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = i === 0 ? 1320 : 1980;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + i * 0.09);
      g.gain.exponentialRampToValueAtTime(0.12, t + i * 0.09 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 0.3);
      osc.connect(g).connect(this.master);
      osc.start(t + i * 0.09);
      osc.stop(t + i * 0.09 + 0.32);
    }
  }

  update(dt: number): void {
    if (this.crowdGain && this.crowdSwellTarget > 0) {
      this.crowdSwellTarget = Math.max(0, this.crowdSwellTarget - dt);
      const boost = Math.min(1, this.crowdSwellTarget) * 0.1;
      this.crowdGain.gain.value = 0.05 + boost;
    }
  }
}
