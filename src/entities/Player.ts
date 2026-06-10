import * as THREE from 'three';
import {
  DOUBLE_JUMP_SPEED,
  GRAVITY,
  HALF_LENGTH,
  HALF_WIDTH,
  JUMP_SPEED,
  PLAYER_ACCEL,
  PLAYER_DECEL,
  PLAYER_RADIUS,
  SPRINT_SPEED,
  STAMINA_DRAIN,
  STAMINA_MAX,
  STAMINA_MIN_SPRINT,
  STAMINA_REGEN,
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

/**
 * Giocatore di movimento: cinematica con inerzia, scatto con stamina,
 * salto e doppio salto sovrumani, rig procedurale animato via codice.
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
  readonly team: number; // 0 = attacca +x, 1 = attacca -x
  readonly name: string;
  events: PlayerEvents = {};

  private wantSprint = false;

  constructor(name: string, team: number, colors: RigColors) {
    this.name = name;
    this.team = team;
    this.rig = new PlayerRig(colors);
  }

  get object3d(): THREE.Object3D {
    return this.rig.root;
  }

  get maxSpeed(): number {
    return this.sprinting ? SPRINT_SPEED : WALK_SPEED;
  }

  update(dt: number, cmd: PlayerCommand | null): void {
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

    // --- gravità e contatto col terreno ---
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

    // --- limiti dell'arena (i muri fermano anche i giocatori) ---
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

    // --- orientamento verso la direzione di movimento ---
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (speed > 0.5) {
      const targetYaw = Math.atan2(this.velocity.x, this.velocity.z);
      this.facing = dampAngle(this.facing, targetYaw, 12, dt);
    }

    // --- sincronizza il rig ---
    this.rig.root.position.copy(this.position);
    this.rig.root.rotation.y = this.facing;
    this.rig.animate(dt, speed, SPRINT_SPEED, this.onGround, this.velocity.y, this.kickCharge);
  }

  /** Direzione frontale sul piano (unitaria). */
  forward(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(Math.sin(this.facing), 0, Math.cos(this.facing));
  }
}
