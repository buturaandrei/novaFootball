import * as THREE from 'three';
import {
  DOUBLE_JUMP_SPEED,
  GETUP_DURATION,
  GRAVITY,
  HALF_LENGTH,
  HALF_WIDTH,
  JUMP_SPEED,
  PLAYER_ACCEL,
  PLAYER_DECEL,
  PLAYER_RADIUS,
  SLIDE_DURATION,
  SLIDE_SPEED,
  SPRINT_SPEED,
  STAMINA_DRAIN,
  STAMINA_MAX,
  STAMINA_MIN_SPRINT,
  STAMINA_REGEN,
  STUN_DURATION,
  WALK_SPEED,
} from '../core/constants';
import { dampAngle } from '../core/math';
import { PlayerRig, type RigColors } from './PlayerRig';

/** Comando di movimento per un giocatore, già convertito in spazio mondo. */
export interface PlayerCommand {
  moveDir: THREE.Vector3; // direzione richiesta sul piano, lunghezza 0..1
  sprint: boolean;
  jumpPressed: boolean;
}

export interface PlayerEvents {
  onJump?: (player: Player, double: boolean) => void;
}

export type PlayerRole = 'campo' | 'portiere';

/** Azioni speciali che sospendono il controllo normale del giocatore. */
export type PlayerAction = 'normale' | 'scivolata' | 'tuffo' | 'stordito' | 'rialzo';

/**
 * Giocatore: cinematica con inerzia, scatto con stamina, salto e doppio
 * salto sovrumani, azioni speciali (scivolata, tuffo del portiere,
 * stordimento da fallo), rig procedurale animato via codice.
 */
export class Player {
  readonly rig: PlayerRig;
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  facing = 0; // yaw in radianti, 0 = +z (forward = (sin, 0, cos))
  stamina = STAMINA_MAX;
  onGround = true;
  jumpsUsed = 0;
  sprinting = false;
  /** Carica del tiro corrente (0..1), gestita da BallControl, letta dal rig. */
  kickCharge = 0;
  action: PlayerAction = 'normale';
  actionTimer = 0;
  /** Lato del tuffo (-1/+1) per la posa del rig. */
  diveSide = 1;
  /** Posizione di formazione assegnata (riferimento per kickoff e IA). */
  readonly homePosition = new THREE.Vector3();
  /** Boost di velocità temporaneo (scatto Flux). */
  boostFactor = 1;
  boostTimer = 0;
  /** Coreografia Flux sovrapposta al movimento (piroetta, spallata, carica). */
  fluxAnim: { kind: 'spin' | 'charge' | 'windup' | 'strike'; t: number; dur: number } | null = null;
  readonly team: number; // 0 = attacca +x, 1 = attacca -x (vedi Match)
  readonly role: PlayerRole;
  readonly name: string;
  events: PlayerEvents = {};

  private wantSprint = false;
  private actionTime = 0; // tempo trascorso nell'azione corrente

  constructor(name: string, team: number, role: PlayerRole, colors: RigColors) {
    this.name = name;
    this.team = team;
    this.role = role;
    this.rig = new PlayerRig(colors);
  }

  get object3d(): THREE.Object3D {
    return this.rig.root;
  }

  get maxSpeed(): number {
    const base = this.sprinting ? SPRINT_SPEED : WALK_SPEED;
    return this.boostTimer > 0 ? base * this.boostFactor : base;
  }

  /** Attiva un boost temporaneo di velocità (scatto Flux). */
  applyBoost(factor: number, duration: number): void {
    this.boostFactor = factor;
    this.boostTimer = duration;
  }

  /** Avvia una coreografia Flux (non blocca il movimento). */
  playFluxAnim(kind: 'spin' | 'charge' | 'windup' | 'strike', dur: number): void {
    this.fluxAnim = { kind, t: 0, dur };
  }

  /** true se il giocatore può ricevere comandi di movimento. */
  get controllable(): boolean {
    return this.action === 'normale';
  }

  /** Avvia una scivolata nella direzione in cui guarda. */
  startSlide(): void {
    if (this.action !== 'normale' || !this.onGround) return;
    this.action = 'scivolata';
    this.actionTimer = SLIDE_DURATION;
    this.actionTime = 0;
    const dir = this.forward();
    this.velocity.x = dir.x * SLIDE_SPEED;
    this.velocity.z = dir.z * SLIDE_SPEED;
  }

  /** Tuffo del portiere verso una velocità calcolata dall'IA. */
  startDive(vel: THREE.Vector3, duration: number): void {
    if (this.action === 'tuffo') return;
    this.action = 'tuffo';
    this.actionTimer = duration;
    this.actionTime = 0;
    this.velocity.copy(vel);
    this.diveSide = Math.sign(
      vel.x * Math.cos(this.facing) - vel.z * Math.sin(this.facing),
    ) || 1;
    this.onGround = false;
  }

  /** Stordimento dopo un fallo subito. */
  stun(): void {
    this.action = 'stordito';
    this.actionTimer = STUN_DURATION;
    this.actionTime = 0;
  }

  update(dt: number, cmd: PlayerCommand | null): void {
    if (this.boostTimer > 0) this.boostTimer -= dt;
    if (this.action !== 'normale') {
      this.updateAction(dt);
      return;
    }

    const move = cmd?.moveDir ?? null;
    const moveLen = move ? Math.min(1, move.length()) : 0;

    // --- scatto e stamina ---
    const sprintHeld = !!cmd?.sprint && moveLen > 0.1;
    if (sprintHeld && !this.wantSprint) {
      // nuovo tentativo di scatto: serve una soglia minima di stamina
      this.sprinting = this.stamina > STAMINA_MIN_SPRINT;
    } else if (!sprintHeld) {
      this.sprinting = false;
    }
    this.wantSprint = sprintHeld;
    if (this.sprinting && this.stamina <= 0) this.sprinting = false;

    if (this.sprinting) {
      this.stamina = Math.max(0, this.stamina - STAMINA_DRAIN * dt);
    } else {
      this.stamina = Math.min(STAMINA_MAX, this.stamina + STAMINA_REGEN * dt);
    }

    // --- movimento orizzontale con inerzia ---
    const target = new THREE.Vector3();
    if (move && moveLen > 0.01) {
      target.copy(move).setY(0).normalize().multiplyScalar(this.maxSpeed * moveLen);
    }
    const horiz = new THREE.Vector3(this.velocity.x, 0, this.velocity.z);
    const accel = moveLen > 0.01 ? PLAYER_ACCEL : PLAYER_DECEL;
    const airControl = this.onGround ? 1 : 0.45;
    const delta = target.sub(horiz);
    const maxDelta = accel * airControl * dt;
    if (delta.length() > maxDelta) delta.setLength(maxDelta);
    horiz.add(delta);
    this.velocity.x = horiz.x;
    this.velocity.z = horiz.z;

    // --- salto e doppio salto ---
    if (cmd?.jumpPressed) {
      if (this.onGround) {
        this.velocity.y = JUMP_SPEED;
        this.onGround = false;
        this.jumpsUsed = 1;
        this.events.onJump?.(this, false);
      } else if (this.jumpsUsed < 2) {
        this.velocity.y = DOUBLE_JUMP_SPEED;
        this.jumpsUsed = 2;
        this.events.onJump?.(this, true);
      }
    }

    this.integrate(dt);

    // --- orientamento verso la direzione di movimento ---
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (speed > 0.5) {
      const targetYaw = Math.atan2(this.velocity.x, this.velocity.z);
      this.facing = dampAngle(this.facing, targetYaw, 12, dt);
    }

    // --- sincronizza il rig ---
    this.syncRig();
    if (this.fluxAnim) {
      const fa = this.fluxAnim;
      fa.t += dt;
      const t01 = fa.t / fa.dur;
      if (t01 >= 1 && fa.kind !== 'windup') {
        this.fluxAnim = null;
        this.rig.recoverPose(dt);
      } else {
        switch (fa.kind) {
          case 'spin': this.rig.fluxSpinPose(Math.min(1, t01)); break;
          case 'charge': this.rig.fluxChargePose(t01); break;
          case 'windup': this.rig.fluxWindupPose(Math.min(1, t01), dt); break;
          case 'strike': this.rig.fluxStrikePose(); break;
        }
      }
    } else {
      this.rig.animate(dt, speed, SPRINT_SPEED, this.onGround, this.velocity.y, this.kickCharge);
    }
  }

  /** Chiude la coreografia Flux in corso (es. fine del windup). */
  clearFluxAnim(): void {
    this.fluxAnim = null;
  }

  /** Gestione delle azioni speciali che sospendono il controllo. */
  private updateAction(dt: number): void {
    this.actionTimer -= dt;
    this.actionTime += dt;

    switch (this.action) {
      case 'scivolata': {
        // attrito della scivolata
        const f = Math.max(0, 1 - 3.2 * dt);
        this.velocity.x *= f;
        this.velocity.z *= f;
        this.integrate(dt);
        this.rig.slidePose(dt);
        if (this.actionTimer <= 0) {
          this.action = 'rialzo';
          this.actionTimer = GETUP_DURATION;
        }
        break;
      }
      case 'tuffo': {
        this.integrate(dt);
        this.rig.divePose(this.diveSide, dt);
        if (this.actionTimer <= 0 && this.onGround) {
          this.action = 'rialzo';
          this.actionTimer = GETUP_DURATION + 0.15;
          this.velocity.set(0, 0, 0);
        }
        break;
      }
      case 'stordito': {
        const f = Math.max(0, 1 - 6 * dt);
        this.velocity.x *= f;
        this.velocity.z *= f;
        this.integrate(dt);
        this.rig.stunPose(this.actionTime);
        if (this.actionTimer <= 0) {
          this.action = 'rialzo';
          this.actionTimer = GETUP_DURATION * 0.5;
        }
        break;
      }
      case 'rialzo':
      default: {
        this.velocity.x = 0;
        this.velocity.z = 0;
        this.integrate(dt);
        this.rig.recoverPose(dt);
        if (this.actionTimer <= 0) this.action = 'normale';
        break;
      }
    }
    this.syncRig();
  }

  /** Gravità, integrazione della posizione, terreno e limiti dell'arena. */
  private integrate(dt: number): void {
    if (!this.onGround) {
      this.velocity.y -= GRAVITY * dt;
    }
    this.position.addScaledVector(this.velocity, dt);
    if (this.position.y <= 0) {
      this.position.y = 0;
      if (this.velocity.y < 0) this.velocity.y = 0;
      this.onGround = true;
      this.jumpsUsed = 0;
    } else {
      this.onGround = false;
    }

    const mx = HALF_LENGTH - PLAYER_RADIUS;
    const mz = HALF_WIDTH - PLAYER_RADIUS;
    if (Math.abs(this.position.x) > mx) {
      this.position.x = Math.sign(this.position.x) * mx;
      this.velocity.x = 0;
    }
    if (Math.abs(this.position.z) > mz) {
      this.position.z = Math.sign(this.position.z) * mz;
      this.velocity.z = 0;
    }
  }

  private syncRig(): void {
    this.rig.root.position.copy(this.position);
    this.rig.root.rotation.y = this.facing;
  }

  /** Direzione frontale sul piano (unitaria). */
  forward(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(Math.sin(this.facing), 0, Math.cos(this.facing));
  }
}
