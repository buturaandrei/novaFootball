import * as THREE from 'three';
import {
  BALL_RADIUS,
  DOME_HEIGHT,
  GOAL_DEPTH,
  GOAL_HEIGHT,
  GOAL_WIDTH,
  GRAVITY,
  HALF_LENGTH,
  HALF_WIDTH,
} from '../core/constants';

export interface BallEvents {
  /** Impatto su un muro energetico. axis: quale muro, sign: quale lato. */
  onWallImpact?: (pos: THREE.Vector3, axis: 'x' | 'z' | 'dome', sign: number, speed: number) => void;
  onGroundBounce?: (pos: THREE.Vector3, speed: number) => void;
  /** La palla è entrata in porta. side: +1 porta a x positivo, -1 a x negativo. */
  onGoal?: (side: number) => void;
}

const RESTITUTION_GROUND = 0.62;
const RESTITUTION_WALL = 0.86;
const RESTITUTION_NET = 0.25;
const AIR_DRAG = 0.012;       // quadratico
const ROLL_FRICTION = 3.2;    // decelerazione del rotolamento (m/s²)
const MAGNUS_K = 0.045;       // intensità dell'effetto
const SPIN_DECAY = 0.7;

/**
 * Palla olografica con fisica completa: gravità, drag, effetto/spin (Magnus),
 * rimbalzi su terreno, muri energetici e cupola. L'arena è chiusa: niente
 * rimesse, solo energia che pulsa a ogni impatto.
 */
export class Ball {
  readonly mesh: THREE.Group;
  readonly position = new THREE.Vector3(0, BALL_RADIUS, 0);
  readonly velocity = new THREE.Vector3();
  /** Velocità angolare (rad/s) usata per il Magnus e per ruotare la mesh. */
  readonly spin = new THREE.Vector3();
  events: BallEvents = {};
  /** true mentre la palla è dentro una porta (in attesa del reset). */
  inGoal = false;

  private core: THREE.Mesh;
  private shell: THREE.LineSegments;
  private glowMat: THREE.MeshStandardMaterial;

  constructor() {
    this.mesh = new THREE.Group();

    this.glowMat = new THREE.MeshStandardMaterial({
      color: 0xe8f4ff,
      emissive: 0x9adfff,
      emissiveIntensity: 0.55,
      roughness: 0.35,
      metalness: 0.1,
      flatShading: true,
    });
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(BALL_RADIUS, 1), this.glowMat);
    this.core.castShadow = true;
    this.mesh.add(this.core);

    this.shell = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(BALL_RADIUS * 1.02, 1)),
      new THREE.LineBasicMaterial({ color: 0x35d6ff, transparent: true, opacity: 0.8 }),
    );
    this.mesh.add(this.shell);

    const light = new THREE.PointLight(0x66ccff, 2.2, 7, 2);
    this.mesh.add(light);
  }

  reset(x = 0, z = 0): void {
    this.position.set(x, BALL_RADIUS, z);
    this.velocity.set(0, 0, 0);
    this.spin.set(0, 0, 0);
    this.inGoal = false;
  }

  /** Calcia la palla: velocità impostata direttamente più spin per l'effetto. */
  kick(vel: THREE.Vector3, spin: THREE.Vector3): void {
    this.velocity.copy(vel);
    this.spin.copy(spin);
  }

  update(dt: number): void {
    const v = this.velocity;
    const speed = v.length();

    // gravità
    v.y -= GRAVITY * dt;

    // drag aerodinamico quadratico
    if (speed > 0.01) {
      const drag = AIR_DRAG * speed;
      v.multiplyScalar(Math.max(0, 1 - drag * dt));
    }

    // effetto Magnus: accelerazione ∝ spin × velocità
    if (speed > 1 && this.spin.lengthSq() > 0.01) {
      const magnus = new THREE.Vector3().crossVectors(this.spin, v).multiplyScalar(MAGNUS_K * dt);
      v.add(magnus);
    }
    this.spin.multiplyScalar(Math.max(0, 1 - SPIN_DECAY * dt));

    this.position.addScaledVector(v, dt);

    this.collideGround(dt);
    this.collideWalls();

    // rotazione visiva della mesh in base al movimento
    const horizSpeed = Math.hypot(v.x, v.z);
    if (horizSpeed > 0.05) {
      const axis = new THREE.Vector3(v.z, 0, -v.x).normalize();
      const angle = (horizSpeed / BALL_RADIUS) * dt;
      this.mesh.rotateOnWorldAxis(axis, angle);
    }
    this.mesh.position.copy(this.position);

    // la palla "si accende" con la velocità
    this.glowMat.emissiveIntensity = 0.45 + Math.min(1.6, speed * 0.06);
  }

  private collideGround(dt: number): void {
    const v = this.velocity;
    if (this.position.y < BALL_RADIUS) {
      this.position.y = BALL_RADIUS;
      if (v.y < -0.8) {
        const impact = -v.y;
        v.y = -v.y * RESTITUTION_GROUND;
        // attrito tangenziale nel rimbalzo + trasferimento dello spin
        v.x *= 0.88;
        v.z *= 0.88;
        this.events.onGroundBounce?.(this.position, impact);
      } else {
        v.y = 0;
        // rotolamento: attrito costante
        const horiz = Math.hypot(v.x, v.z);
        if (horiz > 0.01) {
          const dec = Math.min(horiz, ROLL_FRICTION * dt);
          const f = (horiz - dec) / horiz;
          v.x *= f;
          v.z *= f;
        }
      }
    }
    // cupola energetica
    if (this.position.y > DOME_HEIGHT - BALL_RADIUS && v.y > 0) {
      this.position.y = DOME_HEIGHT - BALL_RADIUS;
      v.y = -v.y * RESTITUTION_WALL;
      this.events.onWallImpact?.(this.position, 'dome', 1, Math.abs(v.y));
    }
  }

  private collideWalls(): void {
    const v = this.velocity;
    const p = this.position;
    const limX = HALF_LENGTH - BALL_RADIUS;
    const limZ = HALF_WIDTH - BALL_RADIUS;

    // muri laterali (asse z)
    if (Math.abs(p.z) > limZ) {
      const sign = Math.sign(p.z);
      p.z = sign * limZ;
      if (v.z * sign > 0) {
        const impact = Math.abs(v.z);
        v.z = -v.z * RESTITUTION_WALL;
        this.spin.multiplyScalar(0.5);
        this.events.onWallImpact?.(p, 'z', sign, impact);
      }
    }

    // muri di fondo (asse x) con bocca della porta
    const inMouth = Math.abs(p.z) < GOAL_WIDTH / 2 - BALL_RADIUS * 0.5 && p.y < GOAL_HEIGHT - BALL_RADIUS * 0.5;

    if (!this.inGoal && Math.abs(p.x) > limX) {
      const sign = Math.sign(p.x);
      if (inMouth && v.x * sign > 0) {
        // entra in porta
        this.inGoal = true;
        this.events.onGoal?.(sign);
      } else {
        p.x = sign * limX;
        if (v.x * sign > 0) {
          const impact = Math.abs(v.x);
          v.x = -v.x * RESTITUTION_WALL;
          this.spin.multiplyScalar(0.5);
          this.events.onWallImpact?.(p, 'x', sign, impact);
        }
      }
    }

    // dentro la porta: la rete energetica assorbe la palla
    if (this.inGoal) {
      const sign = Math.sign(p.x);
      const backX = HALF_LENGTH + GOAL_DEPTH - BALL_RADIUS;
      if (Math.abs(p.x) > backX && v.x * sign > 0) {
        p.x = sign * backX;
        v.x = -v.x * RESTITUTION_NET;
        v.multiplyScalar(0.5);
      }
      const sideZ = GOAL_WIDTH / 2 - BALL_RADIUS;
      if (Math.abs(p.z) > sideZ) {
        p.z = Math.sign(p.z) * sideZ;
        v.z = -v.z * RESTITUTION_NET;
      }
      if (p.y > GOAL_HEIGHT - BALL_RADIUS && v.y > 0) {
        p.y = GOAL_HEIGHT - BALL_RADIUS;
        v.y = -v.y * RESTITUTION_NET;
      }
    }
  }
}
