import * as THREE from 'three';
import { damp } from '../../core/math';
import { buildClipLibrary, type ClipLibrary } from './clips';

const LOCO_NAMES = ['idle', 'walk', 'run', 'sprint', 'back', 'strafeL', 'strafeR', 'aria'] as const;
type LocoName = (typeof LOCO_NAMES)[number];

export interface LocomotionParams {
  speed: number;
  maxSpeed: number;
  onGround: boolean;
  /** Componenti della velocità nello spazio locale del giocatore. */
  forward: number;
  side: number;
  /** Carica del tiro 0..1 (layer solo parte alta). */
  charge: number;
}

/**
 * Pilota l'AnimationMixer del rig skinned: blend space di locomozione
 * (idle/walk/run/sprint + retro/laterali + aria) pesato sulla velocità
 * reale, azioni one-shot e tenute con crossfade, layer "carica" solo
 * sulla parte alta del corpo.
 */
export class AnimDriver {
  readonly mixer: THREE.AnimationMixer;
  readonly library: ClipLibrary;
  private loco = {} as Record<LocoName, THREE.AnimationAction>;
  private charge: THREE.AnimationAction;
  private actions = new Map<string, THREE.AnimationAction>();
  /** Azione corrente che possiede il corpo (one-shot o tenuta). */
  private current: { name: string; action: THREE.AnimationAction; hold: boolean } | null = null;

  constructor(root: THREE.Object3D, restPelvisY: number) {
    this.mixer = new THREE.AnimationMixer(root);
    this.library = buildClipLibrary(restPelvisY);

    for (const name of LOCO_NAMES) {
      const action = this.mixer.clipAction(this.library.clips.get(name)!);
      action.play();
      action.setEffectiveWeight(name === 'idle' ? 1 : 0);
      this.loco[name] = action;
    }
    this.charge = this.mixer.clipAction(this.library.clips.get('carica')!);
    this.charge.setLoop(THREE.LoopOnce, 1);
    this.charge.clampWhenFinished = true;
    this.charge.play();
    this.charge.setEffectiveWeight(0);

    this.mixer.addEventListener('finished', (e) => {
      // i one-shot non tenuti tornano da soli alla locomozione
      if (this.current && e.action === this.current.action && !this.current.hold) {
        this.current.action.fadeOut(0.12);
        this.current = null;
      }
    });
  }

  private getAction(name: string): THREE.AnimationAction {
    let a = this.actions.get(name);
    if (!a) {
      const clip = this.library.clips.get(name);
      if (!clip) throw new Error(`clip sconosciuta: ${name}`);
      a = this.mixer.clipAction(clip);
      this.actions.set(name, a);
    }
    return a;
  }

  /** Azione one-shot (calcio, passaggio, rialzata, esultanza, rinvio...). */
  playOneShot(name: string, fade = 0.06, repetitions = 1): void {
    const action = this.getAction(name);
    if (this.current?.action === action && action.isRunning()) return;
    this.interruptCurrent(fade);
    action.reset();
    action.setLoop(repetitions > 1 ? THREE.LoopRepeat : THREE.LoopOnce, repetitions);
    action.clampWhenFinished = true;
    action.setEffectiveWeight(1);
    action.fadeIn(fade);
    action.play();
    this.current = { name, action, hold: false };
    this.fadeLocoOut(fade);
  }

  /** Azione tenuta finché non si torna alla locomozione (scivolata, tuffi, stordito). */
  ensureHold(name: string): void {
    if (this.current?.name === name) return;
    const action = this.getAction(name);
    this.interruptCurrent(0.08);
    action.reset();
    const isLoop = name === 'stordito';
    action.setLoop(isLoop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = true;
    action.setEffectiveWeight(1);
    action.fadeIn(0.08);
    action.play();
    this.current = { name, action, hold: true };
    this.fadeLocoOut(0.08);
  }

  /** Rilascia l'azione tenuta (se presente) tornando alla locomozione. */
  releaseHold(fade = 0.15): void {
    if (this.current?.hold) {
      this.current.action.fadeOut(fade);
      this.current = null;
    }
  }

  private interruptCurrent(fade: number): void {
    if (this.current) {
      this.current.action.fadeOut(fade);
      this.current = null;
    }
  }

  private fadeLocoOut(fade: number): void {
    for (const name of LOCO_NAMES) this.loco[name].fadeOut(fade);
  }

  /** true se un'azione possiede il corpo in questo momento. */
  get busy(): boolean {
    return this.current !== null;
  }

  get currentName(): string | null {
    return this.current?.name ?? null;
  }

  /** Aggiorna pesi di locomozione e avanza il mixer. */
  update(dt: number, p: LocomotionParams | null): void {
    if (p && !this.busy) {
      const w = this.locoWeights(p);
      for (const name of LOCO_NAMES) {
        const a = this.loco[name];
        // ri-attiva eventuali fadeOut precedenti e riprendi il controllo dei pesi
        if (!a.isRunning()) a.play();
        a.stopFading();
        a.setEffectiveWeight(damp(a.getEffectiveWeight(), w[name], 12, dt));
      }
      // il ciclo segue la velocità reale dei piedi
      const stride = Math.max(0.4, p.speed / 7.2);
      this.loco.run.setEffectiveTimeScale(stride);
      this.loco.sprint.setEffectiveTimeScale(Math.max(0.6, p.speed / 11));
      this.loco.walk.setEffectiveTimeScale(Math.max(0.5, p.speed / 3.2));
    }
    if (p) {
      this.charge.setEffectiveWeight(damp(this.charge.getEffectiveWeight(), p.charge * 1.4, 14, dt));
      if (p.charge > 0 && !this.charge.isRunning()) {
        this.charge.reset();
        this.charge.play();
      }
    }
    this.mixer.update(dt);
  }

  private locoWeights(p: LocomotionParams): Record<LocoName, number> {
    const w: Record<LocoName, number> = {
      idle: 0, walk: 0, run: 0, sprint: 0, back: 0, strafeL: 0, strafeR: 0, aria: 0,
    };
    if (!p.onGround) {
      w.aria = 1;
      return w;
    }
    const speed = p.speed;
    if (speed < 0.25) {
      w.idle = 1;
      return w;
    }
    // direzione locale: laterale/indietro sostituiscono il ciclo frontale
    const mag = Math.max(0.001, Math.hypot(p.forward, p.side));
    const sideRatio = Math.abs(p.side) / mag;
    const backRatio = p.forward < 0 ? -p.forward / mag : 0;

    // blend frontale per velocità
    let front: Partial<Record<LocoName, number>>;
    if (speed < 3.2) {
      const t = (speed - 0.25) / (3.2 - 0.25);
      front = { idle: 1 - t, walk: t };
    } else if (speed < 7.6) {
      const t = (speed - 3.2) / (7.6 - 3.2);
      front = { walk: 1 - t, run: t };
    } else {
      const t = Math.min(1, (speed - 7.6) / (11 - 7.6));
      front = { run: 1 - t, sprint: t };
    }
    const frontShare = Math.max(0, 1 - sideRatio * 0.9 - backRatio);
    for (const [k, v] of Object.entries(front)) w[k as LocoName] = v! * frontShare;
    if (sideRatio > 0.05) {
      const sideW = sideRatio * 0.9 * (1 - backRatio);
      if (p.side >= 0) w.strafeR = sideW;
      else w.strafeL = sideW;
    }
    w.back = backRatio;
    return w;
  }
}
