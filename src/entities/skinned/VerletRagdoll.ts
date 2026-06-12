import * as THREE from 'three';

export const RAGDOLL_POINTS = ['head', 'chest', 'pelvis', 'handL', 'handR', 'footL', 'footR'] as const;
export type RagdollPointName = (typeof RAGDOLL_POINTS)[number];

interface Stick {
  a: number;
  b: number;
  len: number;
}

const GRAVITY = 22;
const DAMPING = 0.992;
const GROUND_FRICTION = 0.55;
const MAX_SPEED = 18;

const vTmp = new THREE.Vector3();

/**
 * Ragdoll verlet a 7 punti (testa, petto, bacino, mani, piedi) con
 * vincoli di distanza presi dalla posa di attivazione: stabile per
 * costruzione (niente joint angolari), abbastanza espressivo per i
 * difensori spazzati via dal tiro Flux. I raggi tengono i punti sopra
 * il terreno; l'attrito a terra lo fa accasciare e fermare.
 */
export class VerletRagdoll {
  readonly pos: THREE.Vector3[] = [];
  private prev: THREE.Vector3[] = [];
  private sticks: Stick[] = [];
  private radii: number[] = [];
  private settledTime = 0;
  active = false;

  constructor() {
    for (let i = 0; i < RAGDOLL_POINTS.length; i++) {
      this.pos.push(new THREE.Vector3());
      this.prev.push(new THREE.Vector3());
      this.radii.push(RAGDOLL_POINTS[i] === 'head' ? 0.16 : 0.1);
    }
  }

  index(name: RagdollPointName): number {
    return RAGDOLL_POINTS.indexOf(name);
  }

  /** Attiva dalla posa corrente (posizioni mondo) con un impulso iniziale. */
  start(worldPositions: Record<RagdollPointName, THREE.Vector3>, impulse: THREE.Vector3): void {
    this.active = true;
    this.settledTime = 0;
    for (let i = 0; i < RAGDOLL_POINTS.length; i++) {
      const p = worldPositions[RAGDOLL_POINTS[i]];
      this.pos[i].copy(p);
      // verlet: la velocità iniziale è (pos − prev)/dt; seme con jitter
      // così il corpo rotola invece di traslare rigido
      const jitter = 0.25;
      vTmp.set(
        impulse.x * (1 + (Math.random() - 0.5) * jitter),
        impulse.y * (1 + (Math.random() - 0.5) * jitter),
        impulse.z * (1 + (Math.random() - 0.5) * jitter),
      );
      this.prev[i].copy(p).addScaledVector(vTmp, -1 / 60);
    }
    // vincoli dalla posa di attivazione (mai degeneri)
    this.sticks = [];
    const link = (a: RagdollPointName, b: RagdollPointName) => {
      const ia = this.index(a);
      const ib = this.index(b);
      this.sticks.push({ a: ia, b: ib, len: Math.max(0.12, this.pos[ia].distanceTo(this.pos[ib])) });
    };
    link('head', 'chest');
    link('chest', 'pelvis');
    link('head', 'pelvis'); // tirante: schiena quasi rigida
    link('chest', 'handL');
    link('chest', 'handR');
    link('pelvis', 'handL');
    link('pelvis', 'handR');
    link('pelvis', 'footL');
    link('pelvis', 'footR');
    link('footL', 'footR');
  }

  /** Avanza la simulazione; ritorna true quando il corpo si è fermato. */
  step(dt: number): boolean {
    if (!this.active) return true;
    const sub = 2;
    const h = Math.min(dt, 1 / 30) / sub;
    let maxMove = 0;

    for (let s = 0; s < sub; s++) {
      for (let i = 0; i < this.pos.length; i++) {
        const p = this.pos[i];
        const q = this.prev[i];
        // velocità implicita con clamp (mai esplosioni)
        vTmp.copy(p).sub(q);
        const speed = vTmp.length() / h;
        if (speed > MAX_SPEED) vTmp.multiplyScalar(MAX_SPEED / speed);
        vTmp.multiplyScalar(DAMPING);

        q.copy(p);
        p.add(vTmp);
        p.y -= GRAVITY * h * h;

        // terreno con attrito
        const r = this.radii[i];
        if (p.y < r) {
          p.y = r;
          q.x = p.x - (p.x - q.x) * GROUND_FRICTION;
          q.z = p.z - (p.z - q.z) * GROUND_FRICTION;
          if (q.y < p.y) q.y = p.y;
        }
        maxMove = Math.max(maxMove, vTmp.length());
      }
      // vincoli di distanza
      for (let iter = 0; iter < 3; iter++) {
        for (const st of this.sticks) {
          const pa = this.pos[st.a];
          const pb = this.pos[st.b];
          vTmp.copy(pb).sub(pa);
          const dLen = vTmp.length();
          if (dLen < 1e-6) continue;
          const diff = (dLen - st.len) / dLen / 2;
          pa.addScaledVector(vTmp, diff);
          pb.addScaledVector(vTmp, -diff);
        }
      }
      // i vincoli possono rispingere i punti sotto il pavimento: ri-clampa
      for (let i = 0; i < this.pos.length; i++) {
        if (this.pos[i].y < this.radii[i]) this.pos[i].y = this.radii[i];
      }
    }

    if (maxMove / (dt / sub || 1e-4) < 0.6) this.settledTime += dt;
    else this.settledTime = 0;
    return this.settledTime > 0.35;
  }

  stop(): void {
    this.active = false;
  }
}
