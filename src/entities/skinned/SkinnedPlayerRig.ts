import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { damp } from '../../core/math';
import type { IPlayerRig, Physique } from '../RigInterface';
import type { RigColors } from '../PlayerRig';
import type { FluxProfileId } from '../../flux/FluxProfile';
import { makeOutlineMaterial, makeToonGradient } from './toon';
import { AnimDriver } from './AnimDriver';
import { aimBoneNegY, aimHead, solveTwoBoneIK } from './ik';
import { VerletRagdoll, type RagdollPointName } from './VerletRagdoll';

/** Corporature per energia: GELO slanciati, OMBRA affilati, RUGGITO massicci. */
export const PHYSIQUES: Record<FluxProfileId, Physique> = {
  gelo: { height: 1.0, bulk: 0.97 },
  ombra: { height: 1.03, bulk: 0.86 },
  ruggito: { height: 1.04, bulk: 1.16 },
};

const BONE_NAMES = [
  'pelvis', 'spine', 'chest', 'neck', 'head',
  'upperArmL', 'forearmL', 'handL',
  'upperArmR', 'forearmR', 'handR',
  'thighL', 'shinL', 'footL',
  'thighR', 'shinR', 'footR',
] as const;
type BoneName = (typeof BONE_NAMES)[number];

interface BoneDef {
  name: BoneName;
  parent: BoneName | null;
  /** Posizione mondo in T-pose: [x·bulk, y·height, z]. */
  x: number;
  y: number;
}

const BONE_DEFS: BoneDef[] = [
  { name: 'pelvis', parent: null, x: 0, y: 0.92 },
  { name: 'spine', parent: 'pelvis', x: 0, y: 1.08 },
  { name: 'chest', parent: 'spine', x: 0, y: 1.28 },
  { name: 'neck', parent: 'chest', x: 0, y: 1.5 },
  { name: 'head', parent: 'neck', x: 0, y: 1.6 },
  { name: 'upperArmL', parent: 'chest', x: -0.3, y: 1.45 },
  { name: 'forearmL', parent: 'upperArmL', x: -0.3, y: 1.17 },
  { name: 'handL', parent: 'forearmL', x: -0.3, y: 0.93 },
  { name: 'upperArmR', parent: 'chest', x: 0.3, y: 1.45 },
  { name: 'forearmR', parent: 'upperArmR', x: 0.3, y: 1.17 },
  { name: 'handR', parent: 'forearmR', x: 0.3, y: 0.93 },
  { name: 'thighL', parent: 'pelvis', x: -0.15, y: 0.9 },
  { name: 'shinL', parent: 'thighL', x: -0.15, y: 0.5 },
  { name: 'footL', parent: 'shinL', x: -0.15, y: 0.1 },
  { name: 'thighR', parent: 'pelvis', x: 0.15, y: 0.9 },
  { name: 'shinR', parent: 'thighR', x: 0.15, y: 0.5 },
  { name: 'footR', parent: 'shinR', x: 0.15, y: 0.1 },
];

/** Ancora di skinning: osso + quota mondo attorno a cui pesare i vertici. */
type Anchor = [BoneName, number];

interface PartDef {
  kind: 'capsule' | 'sphere';
  radius: number;
  length?: number; // solo capsule (sezione cilindrica)
  cx: number; // ·bulk
  cy: number; // ·height
  color: 'primary' | 'secondary';
  /** Ancore ordinate dall'alto in basso (quote ·height). */
  anchors: Anchor[];
}

const PART_DEFS: PartDef[] = [
  // busto: dal bacino al petto
  { kind: 'capsule', radius: 0.27, length: 0.34, cx: 0, cy: 1.16, color: 'primary',
    anchors: [['chest', 1.34], ['spine', 1.1], ['pelvis', 0.9]] },
  // collo e testa
  { kind: 'capsule', radius: 0.085, length: 0.07, cx: 0, cy: 1.54, color: 'secondary',
    anchors: [['head', 1.6], ['chest', 1.46]] },
  { kind: 'sphere', radius: 0.18, cx: 0, cy: 1.7, color: 'secondary',
    anchors: [['head', 1.7]] },
  // braccia
  { kind: 'capsule', radius: 0.088, length: 0.18, cx: -0.3, cy: 1.31, color: 'primary',
    anchors: [['chest', 1.49], ['upperArmL', 1.4], ['forearmL', 1.17]] },
  { kind: 'capsule', radius: 0.074, length: 0.16, cx: -0.3, cy: 1.05, color: 'primary',
    anchors: [['upperArmL', 1.2], ['forearmL', 1.08], ['handL', 0.93]] },
  { kind: 'capsule', radius: 0.088, length: 0.18, cx: 0.3, cy: 1.31, color: 'primary',
    anchors: [['chest', 1.49], ['upperArmR', 1.4], ['forearmR', 1.17]] },
  { kind: 'capsule', radius: 0.074, length: 0.16, cx: 0.3, cy: 1.05, color: 'primary',
    anchors: [['upperArmR', 1.2], ['forearmR', 1.08], ['handR', 0.93]] },
  // gambe
  { kind: 'capsule', radius: 0.115, length: 0.26, cx: -0.15, cy: 0.7, color: 'secondary',
    anchors: [['pelvis', 0.93], ['thighL', 0.82], ['shinL', 0.5]] },
  { kind: 'capsule', radius: 0.09, length: 0.27, cx: -0.15, cy: 0.3, color: 'secondary',
    anchors: [['thighL', 0.53], ['shinL', 0.4], ['footL', 0.12]] },
  { kind: 'capsule', radius: 0.115, length: 0.26, cx: 0.15, cy: 0.7, color: 'secondary',
    anchors: [['pelvis', 0.93], ['thighR', 0.82], ['shinR', 0.5]] },
  { kind: 'capsule', radius: 0.09, length: 0.27, cx: 0.15, cy: 0.3, color: 'secondary',
    anchors: [['thighR', 0.53], ['shinR', 0.4], ['footR', 0.12]] },
];

const toonGradient = makeToonGradient();

/**
 * Rig con scheletro vero: SkinnedMesh costruita interamente in codice
 * (capsule fuse, pesi di skinning calcolati per vertice con blend morbido
 * alle giunture), cel-shading a 3 bande + outline inverted-hull,
 * dettagli emissivi agganciati alle ossa. Stessa interfaccia del rig
 * classico: tutto il gameplay resta invariato.
 */
export class SkinnedPlayerRig implements IPlayerRig {
  readonly root = new THREE.Group();
  private bones = {} as Record<BoneName, THREE.Bone>;
  private restPelvisY: number;
  private glowMaterial: THREE.MeshStandardMaterial;
  private driver!: AnimDriver;
  private physique: Physique;
  // --- M9: IK, sguardo, ragdoll, secondary motion ---
  private lookTarget: THREE.Vector3 | null = null;
  private lookPoint = new THREE.Vector3();
  private kickPoint = new THREE.Vector3();
  private kickWeight = 0;
  private locks = {
    L: { on: false, w: 0, anchor: new THREE.Vector3() },
    R: { on: false, w: 0, anchor: new THREE.Vector3() },
  };
  private ragdoll: VerletRagdoll | null = null;
  private plumeP1 = new THREE.Vector3();
  private plumeP2 = new THREE.Vector3();
  private plumeSegs: THREE.Mesh[] = [];
  private plumeInit = false;

  constructor(colors: RigColors, physique: Physique = { height: 1, bulk: 1 }) {
    this.physique = physique;
    const H = physique.height;
    const B = physique.bulk;

    // --- scheletro ---
    const world = new Map<BoneName, THREE.Vector3>();
    const boneList: THREE.Bone[] = [];
    for (const def of BONE_DEFS) {
      const bone = new THREE.Bone();
      bone.name = def.name;
      const w = new THREE.Vector3(def.x * B, def.y * H, 0);
      world.set(def.name, w);
      if (def.parent) {
        const pw = world.get(def.parent)!;
        bone.position.copy(w).sub(pw);
        this.bones[def.parent].add(bone);
      } else {
        bone.position.copy(w);
      }
      this.bones[def.name] = bone;
      boneList.push(bone);
    }
    this.restPelvisY = this.bones.pelvis.position.y;
    const skeleton = new THREE.Skeleton(boneList);
    const boneIndex = new Map<BoneName, number>(BONE_NAMES.map((n, i) => [n, i]));

    // --- geometria skinnata ---
    const primary = new THREE.Color(colors.primary);
    const secondary = new THREE.Color(colors.secondary);
    const parts: THREE.BufferGeometry[] = [];
    for (const part of PART_DEFS) {
      const geo =
        part.kind === 'capsule'
          ? new THREE.CapsuleGeometry(part.radius * B, (part.length ?? 0.2) * H, 3, 8)
          : new THREE.SphereGeometry(part.radius, 10, 8);
      geo.translate(part.cx * B, part.cy * H, 0);

      const count = geo.attributes.position.count;
      const skinIndex = new Uint16Array(count * 4);
      const skinWeight = new Float32Array(count * 4);
      const colorAttr = new Float32Array(count * 3);
      const col = part.color === 'primary' ? primary : secondary;
      const pos = geo.attributes.position;

      for (let i = 0; i < count; i++) {
        const y = pos.getY(i);
        const [iA, wA, iB, wB] = this.weightsForY(y, part.anchors, H, boneIndex);
        skinIndex[i * 4] = iA;
        skinIndex[i * 4 + 1] = iB;
        skinWeight[i * 4] = wA;
        skinWeight[i * 4 + 1] = wB;
        colorAttr[i * 3] = col.r;
        colorAttr[i * 3 + 1] = col.g;
        colorAttr[i * 3 + 2] = col.b;
      }
      geo.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
      geo.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
      geo.setAttribute('color', new THREE.BufferAttribute(colorAttr, 3));
      parts.push(geo);
    }
    const merged = mergeGeometries(parts, false)!;
    for (const p of parts) p.dispose();

    // --- corpo cel-shaded + outline ---
    const bodyMat = new THREE.MeshToonMaterial({
      color: 0xffffff,
      vertexColors: true,
      gradientMap: toonGradient,
    });
    const body = new THREE.SkinnedMesh(merged, bodyMat);
    body.castShadow = true;
    body.add(this.bones.pelvis);
    body.bind(skeleton);
    body.frustumCulled = false; // le pose estreme escono dal bounding statico
    this.root.add(body);
    this.driver = new AnimDriver(body, this.restPelvisY);

    const outline = new THREE.SkinnedMesh(merged, makeOutlineMaterial(0.018 * B));
    outline.bind(skeleton, body.bindMatrix);
    outline.frustumCulled = false;
    this.root.add(outline);

    // --- dettagli emissivi agganciati alle ossa ---
    this.glowMaterial = new THREE.MeshStandardMaterial({
      color: 0x101820,
      emissive: colors.glow,
      emissiveIntensity: 1.8,
      roughness: 0.4,
    });
    const darkMat = new THREE.MeshToonMaterial({ color: colors.secondary, gradientMap: toonGradient });

    const attach = (boneName: BoneName, mesh: THREE.Mesh, wx: number, wy: number, wz: number) => {
      const bw = world.get(boneName)!;
      mesh.position.set(wx * B - bw.x, wy * H - bw.y, wz);
      this.bones[boneName].add(mesh);
    };
    // visiera
    attach('head', new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.1), this.glowMaterial), 0, 1.67, 0.15);
    // barra sul petto
    attach('chest', new THREE.Mesh(new THREE.BoxGeometry(0.34 * B, 0.1, 0.16), this.glowMaterial), 0, 1.38, 0.2 * B);
    // spallacci
    attach('chest', new THREE.Mesh(new THREE.SphereGeometry(0.125 * B, 8, 6), darkMat), -0.33, 1.46, 0);
    attach('chest', new THREE.Mesh(new THREE.SphereGeometry(0.125 * B, 8, 6), darkMat), 0.33, 1.46, 0);
    // guanti
    attach('handL', new THREE.Mesh(new THREE.SphereGeometry(0.095, 6, 5), this.glowMaterial), -0.3, 0.91, 0);
    attach('handR', new THREE.Mesh(new THREE.SphereGeometry(0.095, 6, 5), this.glowMaterial), 0.3, 0.91, 0);
    // scarpini
    attach('footL', new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.3), this.glowMaterial), -0.15, 0.05, 0.06);
    attach('footR', new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.3), this.glowMaterial), 0.15, 0.05, 0.06);
  }

  /** Pesi (max 2 influenze) per quota mondo del vertice, ancore desc. */
  private weightsForY(
    y: number,
    anchors: Anchor[],
    H: number,
    boneIndex: Map<BoneName, number>,
  ): [number, number, number, number] {
    const top = anchors[0];
    const bottom = anchors[anchors.length - 1];
    if (y >= top[1] * H) return [boneIndex.get(top[0])!, 1, 0, 0];
    if (y <= bottom[1] * H) return [boneIndex.get(bottom[0])!, 1, 0, 0];
    for (let i = 0; i < anchors.length - 1; i++) {
      const hi = anchors[i][1] * H;
      const lo = anchors[i + 1][1] * H;
      if (y <= hi && y >= lo) {
        let t = (y - lo) / Math.max(1e-5, hi - lo);
        t = t * t * (3 - 2 * t); // smoothstep
        return [boneIndex.get(anchors[i][0])!, t, boneIndex.get(anchors[i + 1][0])!, 1 - t];
      }
    }
    return [boneIndex.get(bottom[0])!, 1, 0, 0];
  }

  setGlow(intensity: number): void {
    this.glowMaterial.emissiveIntensity = intensity;
  }

  // -------------------------------------------------------------- animazione
  animate(
    dt: number,
    speed: number,
    maxSpeed: number,
    onGround: boolean,
    verticalVel: number,
    kickCharge: number,
    forward?: number,
    side?: number,
  ): void {
    // si torna alla locomozione: le azioni "tenute" vengono rilasciate
    this.driver.releaseHold(0.18);
    this.driver.update(dt, {
      speed,
      maxSpeed,
      onGround,
      forward: forward ?? speed,
      side: side ?? 0,
      charge: kickCharge,
    });
    // pitch aereo additivo post-mixer (salita/caduta)
    if (!onGround) {
      this.bones.spine.rotateX(verticalVel > 0 ? -0.08 : 0.12);
    }
    this.postPass(dt, speed, onGround);
  }

  /**
   * Passata post-mixer: foot-lock IK (niente scivolamento), gamba del
   * calcio sulla palla vera, testa che segue la palla, pennacchio a molla.
   */
  private postPass(dt: number, speed: number, onGround: boolean): void {
    const b = this.bones;
    if (onGround && !this.driver.busy) {
      this.updateFootLocks(dt, speed);
    } else {
      this.locks.L.on = false;
      this.locks.R.on = false;
      this.locks.L.w = 0;
      this.locks.R.w = 0;
    }
    if (this.kickWeight > 0.02) {
      solveTwoBoneIK(b.thighR, b.shinR, b.footR, this.kickPoint, Math.min(1, this.kickWeight) * 0.85);
    }
    if (this.lookTarget) {
      aimHead(b.head, this.lookPoint, 0.85, 0.3);
    }
    this.updatePlume(dt);
  }

  /**
   * Foot-lock: durante la fase d'appoggio della falcata la caviglia viene
   * ancorata al punto di contatto e la gamba risolta in IK — il piede
   * non slitta. Da fermi entrambi i piedi restano piantati (re-ancoraggio
   * solo se il corpo si sposta davvero).
   */
  private updateFootLocks(dt: number, speed: number): void {
    const s = Math.sin(this.driver.phase * Math.PI * 2);
    const idle = speed < 0.6;
    this.updateFootLock('L', idle || s < -0.2, idle, dt);
    this.updateFootLock('R', idle || s > 0.2, idle, dt);
  }

  private updateFootLock(side: 'L' | 'R', stance: boolean, idle: boolean, dt: number): void {
    const lock = this.locks[side];
    const b = this.bones;
    const foot = side === 'L' ? b.footL : b.footR;
    const thigh = side === 'L' ? b.thighL : b.thighR;
    const shin = side === 'L' ? b.shinL : b.shinR;

    if (stance && !lock.on) {
      foot.getWorldPosition(lock.anchor);
      lock.on = true;
    } else if (!stance) {
      lock.on = false;
    }
    lock.w = damp(lock.w, lock.on ? 0.85 : 0, 22, dt);
    if (!lock.on || lock.w < 0.02) return;

    foot.getWorldPosition(SCRATCH_A);
    const dx = SCRATCH_A.x - lock.anchor.x;
    const dz = SCRATCH_A.z - lock.anchor.z;
    const drift = Math.hypot(dx, dz);
    // mismatch eccessivo (o passetto da fermi): ri-ancora invece di stirare
    if (drift > (idle ? 0.28 : 0.45)) {
      lock.anchor.copy(SCRATCH_A);
      return;
    }
    SCRATCH_B.set(lock.anchor.x, SCRATCH_A.y, lock.anchor.z); // blocca solo x/z
    solveTwoBoneIK(thigh, shin, foot, SCRATCH_B, lock.w);
  }

  /** Pennacchio sul casco: due segmenti che inseguono la testa con lag. */
  private updatePlume(dt: number): void {
    const head = this.bones.head;
    head.updateWorldMatrix(true, false);
    const base = SCRATCH_A.setFromMatrixPosition(head.matrixWorld);
    head.getWorldQuaternion(SCRATCH_Q);
    const up = SCRATCH_B.set(0, 1, 0).applyQuaternion(SCRATCH_Q);
    const back = SCRATCH_C.set(0, 0, -1).applyQuaternion(SCRATCH_Q);
    base.addScaledVector(up, 0.16).addScaledVector(back, 0.04);
    const rest1 = SCRATCH_D.copy(base).addScaledVector(up, 0.1).addScaledVector(back, 0.05);
    const rest2 = SCRATCH_E.copy(base).addScaledVector(up, 0.17).addScaledVector(back, 0.13);

    if (!this.plumeInit) {
      this.plumeInit = true;
      this.plumeP1.copy(rest1);
      this.plumeP2.copy(rest2);
      for (let i = 0; i < 2; i++) {
        const seg = new THREE.Mesh(
          new THREE.CylinderGeometry(i === 0 ? 0.028 : 0.02, i === 0 ? 0.022 : 0.012, 1, 5),
          this.glowMaterial,
        );
        this.plumeSegs.push(seg);
        this.root.add(seg);
      }
    }
    // inseguimento smorzato: il lag È il secondary motion
    this.plumeP1.x = damp(this.plumeP1.x, rest1.x, 26, dt);
    this.plumeP1.y = damp(this.plumeP1.y, rest1.y, 26, dt);
    this.plumeP1.z = damp(this.plumeP1.z, rest1.z, 26, dt);
    this.plumeP2.x = damp(this.plumeP2.x, rest2.x, 11, dt);
    this.plumeP2.y = damp(this.plumeP2.y, rest2.y - 0.02, 11, dt);
    this.plumeP2.z = damp(this.plumeP2.z, rest2.z, 11, dt);

    this.root.updateWorldMatrix(true, false);
    this.placePlumeSeg(this.plumeSegs[0], base, this.plumeP1);
    this.placePlumeSeg(this.plumeSegs[1], this.plumeP1, this.plumeP2);
  }

  private placePlumeSeg(seg: THREE.Mesh, aW: THREE.Vector3, bW: THREE.Vector3): void {
    const a = SCRATCH_F.copy(aW);
    const bL = SCRATCH_G.copy(bW);
    this.root.worldToLocal(a);
    this.root.worldToLocal(bL);
    seg.position.copy(a).add(bL).multiplyScalar(0.5);
    SCRATCH_C.copy(bL).sub(a);
    const len = Math.max(0.02, SCRATCH_C.length());
    seg.scale.set(1, len, 1);
    seg.quaternion.setFromUnitVectors(UP_VEC, SCRATCH_C.normalize());
  }

  // ----------------------------------------------------- bersagli esterni
  /** La testa segue questo punto (di solito la palla). */
  setLookTarget(p: THREE.Vector3 | null): void {
    if (p) {
      this.lookPoint.copy(p);
      this.lookTarget = this.lookPoint;
    } else {
      this.lookTarget = null;
    }
  }

  /** La gamba del calcio viene risolta in IK su questo punto (palla vera). */
  setKickTarget(p: THREE.Vector3 | null, weight = 1): void {
    if (p) {
      this.kickPoint.copy(p);
      this.kickWeight = weight;
    } else {
      this.kickWeight = 0;
    }
  }

  // ------------------------------------------------------------- ragdoll
  /** Attiva il ragdoll dalla posa corrente. Ritorna true se supportato. */
  startRagdoll(impulse: THREE.Vector3): boolean {
    this.ragdoll ??= new VerletRagdoll();
    const b = this.bones;
    const grab = (bone: THREE.Bone) => bone.getWorldPosition(new THREE.Vector3());
    const map: Record<RagdollPointName, THREE.Vector3> = {
      head: grab(b.head),
      chest: grab(b.chest),
      pelvis: grab(b.pelvis),
      handL: grab(b.handL),
      handR: grab(b.handR),
      footL: grab(b.footL),
      footR: grab(b.footR),
    };
    this.ragdoll.start(map, impulse);
    return true;
  }

  /** Avanza il ragdoll e applica la posa; scrive in out la posizione (x,z). */
  updateRagdoll(dt: number, out: THREE.Vector3): boolean {
    if (!this.ragdoll?.active) return true;
    const settled = this.ragdoll.step(dt);
    this.applyRagdollPose();
    const pelvis = this.ragdoll.pos[this.ragdoll.index('pelvis')];
    out.set(pelvis.x, 0, pelvis.z);
    return settled;
  }

  endRagdoll(): void {
    this.ragdoll?.stop();
  }

  /** Mappa i 7 punti verlet sulle ossa (ragdoll semplificato). */
  private applyRagdollPose(): void {
    const r = this.ragdoll!;
    const b = this.bones;
    const P = (n: RagdollPointName) => r.pos[r.index(n)];
    this.root.updateWorldMatrix(true, false);

    // bacino: posizione + inclinazione della schiena
    const pelvisL = SCRATCH_A.copy(P('pelvis'));
    this.root.worldToLocal(pelvisL);
    b.pelvis.position.copy(pelvisL);
    const spineDir = SCRATCH_B.copy(P('chest')).sub(P('pelvis'));
    SCRATCH_C.copy(spineDir);
    this.root.getWorldQuaternion(SCRATCH_Q).invert();
    SCRATCH_C.applyQuaternion(SCRATCH_Q);
    if (SCRATCH_C.lengthSq() > 1e-6) {
      b.pelvis.quaternion.setFromUnitVectors(UP_VEC, SCRATCH_C.normalize());
    }
    b.spine.quaternion.identity();
    b.chest.quaternion.identity();
    b.neck.quaternion.identity();
    b.head.quaternion.identity();

    // arti tesi verso i punti (avambracci/tibie dritti)
    b.forearmL.quaternion.identity();
    b.forearmR.quaternion.identity();
    b.shinL.quaternion.identity();
    b.shinR.quaternion.identity();
    aimBoneNegY(b.upperArmL, P('handL'));
    aimBoneNegY(b.upperArmR, P('handR'));
    aimBoneNegY(b.thighL, P('footL'));
    aimBoneNegY(b.thighR, P('footR'));
  }

  kickPose(): void {
    this.driver.playOneShot('calcio', 0.05);
  }

  playActionClip(name: 'esultanza' | 'rinvio' | 'contrasto' | 'passaggio'): void {
    this.driver.playOneShot(name, 0.07, name === 'esultanza' ? 2 : 1);
  }

  slidePose(dt: number): void {
    this.driver.ensureHold('scivolata');
    this.driver.update(dt, null);
  }

  divePose(side: number, dt: number, high = false): void {
    this.driver.ensureHold(`tuffo${high ? 'Alto' : 'Basso'}${side >= 0 ? 'L' : 'R'}`);
    this.driver.update(dt, null);
  }

  stunPose(time: number, dt = 1 / 60): void {
    void time;
    this.driver.ensureHold('stordito');
    this.driver.update(dt, null);
  }

  recoverPose(dt: number): void {
    // dalla terra (scivolata/tuffo) si rialza con la clip dedicata;
    // negli altri casi basta il crossfade verso la locomozione
    const from = this.driver.currentName;
    if (from && (from === 'scivolata' || from.startsWith('tuffo'))) {
      this.driver.playOneShot('rialzo', 0.06);
    } else {
      this.driver.releaseHold(0.14);
    }
    this.driver.update(dt, null);
  }

  // --------------------------------------------------- coreografie Flux
  fluxSpinPose(t01: number): void {
    const b = this.bones;
    b.pelvis.rotation.y = t01 * Math.PI * 2;
    b.pelvis.position.y = this.restPelvisY + Math.sin(t01 * Math.PI) * 0.18;
    b.upperArmL.rotation.set(0, 0, 1.6);
    b.upperArmR.rotation.set(0, 0, -1.6);
    b.spine.rotation.x = -0.15;
    b.thighL.rotation.x = -0.25;
    b.thighR.rotation.x = 0.5;
    b.shinR.rotation.x = -0.5;
  }

  fluxChargePose(t01: number): void {
    const b = this.bones;
    const k = Math.sin(Math.min(1, t01) * Math.PI);
    b.pelvis.rotation.z = -0.55 * k;
    b.pelvis.rotation.x = 0.45 * k;
    b.upperArmR.rotation.x = -1.4 * k;
    b.upperArmR.rotation.z = -0.5 * k;
    b.upperArmL.rotation.x = 1.0 * k;
    b.thighL.rotation.x = -0.6 * k;
    b.thighR.rotation.x = 0.8 * k;
    b.shinR.rotation.x = -0.6 * k;
  }

  fluxWindupPose(t01: number, dt: number): void {
    const b = this.bones;
    const k = Math.min(1, t01);
    b.spine.rotation.x = damp(b.spine.rotation.x, 0.25 * k, 10, dt);
    b.pelvis.position.y = damp(b.pelvis.position.y, this.restPelvisY - 0.2 * k, 10, dt);
    b.upperArmL.rotation.x = -2.4 * k;
    b.upperArmR.rotation.x = -2.4 * k;
    b.upperArmL.rotation.z = 0.5 * k;
    b.upperArmR.rotation.z = -0.5 * k;
    b.forearmL.rotation.x = -0.5 * k;
    b.forearmR.rotation.x = -0.5 * k;
    b.thighL.rotation.x = 0.35 * k;
    b.thighR.rotation.x = -0.5 * k;
    b.shinR.rotation.x = -0.4 * k;
    // tremito crescente dell'energia
    b.chest.rotation.z = Math.sin(t01 * 50) * 0.035 * k;
  }

  fluxStrikePose(): void {
    const b = this.bones;
    b.spine.rotation.y = -0.7;
    b.spine.rotation.x = -0.25;
    b.pelvis.position.y = this.restPelvisY + 0.05;
    b.thighR.rotation.x = 1.7;
    b.shinR.rotation.x = -0.05;
    b.thighL.rotation.x = -0.5;
    b.upperArmL.rotation.set(-1.2, 0, 0.9);
    b.upperArmR.rotation.set(0.9, 0, -0.6);
  }

  /** Altezza effettiva (per camera/effetti che vogliono scalare). */
  get height(): number {
    return this.physique.height;
  }
}

// scratch condivisi del modulo (zero allocazioni per frame)
const SCRATCH_A = new THREE.Vector3();
const SCRATCH_B = new THREE.Vector3();
const SCRATCH_C = new THREE.Vector3();
const SCRATCH_D = new THREE.Vector3();
const SCRATCH_E = new THREE.Vector3();
const SCRATCH_F = new THREE.Vector3();
const SCRATCH_G = new THREE.Vector3();
const SCRATCH_Q = new THREE.Quaternion();
const UP_VEC = new THREE.Vector3(0, 1, 0);
