import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { damp } from '../../core/math';
import type { IPlayerRig, Physique } from '../RigInterface';
import type { RigColors } from '../PlayerRig';
import type { FluxProfileId } from '../../flux/FluxProfile';
import { makeOutlineMaterial, makeToonGradient } from './toon';

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
  private runPhase = Math.random() * Math.PI * 2;
  private physique: Physique;

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
  animate(dt: number, speed: number, maxSpeed: number, onGround: boolean, verticalVel: number, kickCharge: number): void {
    const b = this.bones;
    const r = Math.min(1, speed / maxSpeed);

    if (onGround) {
      this.runPhase += dt * (4 + speed * 1.6);
      const swing = r * 0.95;
      const s = Math.sin(this.runPhase);
      const c = Math.cos(this.runPhase);

      // gambe con flessione del ginocchio nel recupero
      b.thighL.rotation.x = s * swing;
      b.thighR.rotation.x = -s * swing;
      b.shinL.rotation.x = -Math.max(0, c) * swing * 1.35;
      b.shinR.rotation.x = -Math.max(0, -c) * swing * 1.35;
      b.footL.rotation.x = -b.thighL.rotation.x * 0.35 - b.shinL.rotation.x * 0.55;
      b.footR.rotation.x = -b.thighR.rotation.x * 0.35 - b.shinR.rotation.x * 0.55;

      // braccia opposte, gomito sempre un po' flesso
      b.upperArmL.rotation.x = -s * swing * 0.8;
      b.upperArmR.rotation.x = s * swing * 0.8;
      b.upperArmL.rotation.z = 0.12;
      b.upperArmR.rotation.z = -0.12;
      b.forearmL.rotation.x = -(0.25 + Math.max(0, s) * 0.55) * Math.max(r, 0.15);
      b.forearmR.rotation.x = -(0.25 + Math.max(0, -s) * 0.55) * Math.max(r, 0.15);

      // busto: inclinazione, contro-rotazione, bob del bacino, respiro da fermi
      b.spine.rotation.x = r * 0.2;
      b.chest.rotation.y = s * 0.1 * r;
      b.chest.rotation.x = r < 0.05 ? Math.sin(this.runPhase * 0.4) * 0.025 : 0;
      b.pelvis.rotation.y = -s * 0.06 * r;
      b.pelvis.rotation.x = 0;
      b.pelvis.rotation.z = 0;
      b.pelvis.position.y = this.restPelvisY + Math.abs(s) * 0.05 * r;
      b.head.rotation.x = -r * 0.12;
    } else {
      // posa aerea: gambe raccolte asimmetriche, braccia aperte
      const rising = verticalVel > 0;
      const tgt = rising ? 1.0 : 0.45;
      b.thighL.rotation.x = damp(b.thighL.rotation.x, tgt * 0.9, 10, dt);
      b.thighR.rotation.x = damp(b.thighR.rotation.x, tgt * 0.5, 10, dt);
      b.shinL.rotation.x = damp(b.shinL.rotation.x, -0.9 * tgt, 10, dt);
      b.shinR.rotation.x = damp(b.shinR.rotation.x, -0.6 * tgt, 10, dt);
      b.upperArmL.rotation.z = damp(b.upperArmL.rotation.z, 1.1, 10, dt);
      b.upperArmR.rotation.z = damp(b.upperArmR.rotation.z, -1.1, 10, dt);
      b.spine.rotation.x = damp(b.spine.rotation.x, rising ? -0.12 : 0.1, 8, dt);
      b.pelvis.position.y = this.restPelvisY;
    }

    // carica del tiro: torsione del busto, gamba destra arretrata
    if (kickCharge > 0) {
      const k = Math.min(1, kickCharge);
      b.spine.rotation.y = damp(b.spine.rotation.y, -0.5 * k, 12, dt);
      b.thighR.rotation.x = -1.0 * k;
      b.shinR.rotation.x = -0.45 * k;
      b.upperArmR.rotation.x = 0.7 * k;
    } else {
      b.spine.rotation.y = damp(b.spine.rotation.y, 0, 12, dt);
    }
  }

  kickPose(): void {
    const b = this.bones;
    b.thighR.rotation.x = 1.35;
    b.shinR.rotation.x = -0.1;
    b.upperArmL.rotation.x = 0.8;
  }

  slidePose(dt: number): void {
    const b = this.bones;
    b.pelvis.rotation.x = damp(b.pelvis.rotation.x, -1.15, 18, dt);
    b.pelvis.position.y = damp(b.pelvis.position.y, this.restPelvisY - 0.5, 18, dt);
    b.thighL.rotation.x = damp(b.thighL.rotation.x, 1.55, 18, dt);
    b.shinL.rotation.x = damp(b.shinL.rotation.x, -0.1, 18, dt);
    b.thighR.rotation.x = damp(b.thighR.rotation.x, 1.0, 18, dt);
    b.shinR.rotation.x = damp(b.shinR.rotation.x, -0.7, 18, dt);
    b.upperArmL.rotation.x = -0.6;
    b.upperArmR.rotation.x = -0.9;
  }

  divePose(side: number, dt: number): void {
    const b = this.bones;
    b.pelvis.rotation.z = damp(b.pelvis.rotation.z, side * 1.25, 14, dt);
    b.pelvis.rotation.x = damp(b.pelvis.rotation.x, -0.2, 14, dt);
    const reach = side >= 0 ? b.upperArmL : b.upperArmR;
    const other = side >= 0 ? b.upperArmR : b.upperArmL;
    reach.rotation.z = damp(reach.rotation.z, side * 2.7, 16, dt);
    other.rotation.z = damp(other.rotation.z, side * 1.6, 16, dt);
    reach.rotation.x = 0;
    b.thighL.rotation.x = 0.4;
    b.thighR.rotation.x = -0.3;
  }

  stunPose(time: number): void {
    const b = this.bones;
    b.pelvis.rotation.x = 0.25 + Math.sin(time * 14) * 0.08;
    b.pelvis.rotation.z = Math.sin(time * 9) * 0.12;
    b.upperArmL.rotation.z = 0.5;
    b.upperArmR.rotation.z = -0.5;
  }

  recoverPose(dt: number): void {
    for (const name of BONE_NAMES) {
      const bone = this.bones[name];
      bone.rotation.x = damp(bone.rotation.x, 0, 10, dt);
      bone.rotation.y = damp(bone.rotation.y, 0, 10, dt);
      bone.rotation.z = damp(bone.rotation.z, 0, 10, dt);
    }
    this.bones.pelvis.position.y = damp(this.bones.pelvis.position.y, this.restPelvisY, 10, dt);
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
