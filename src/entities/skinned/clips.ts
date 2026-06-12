import * as THREE from 'three';

/** Nomi ossa condivisi con lo scheletro procedurale. */
export type ClipBoneName =
  | 'pelvis' | 'spine' | 'chest' | 'neck' | 'head'
  | 'upperArmL' | 'forearmL' | 'handL'
  | 'upperArmR' | 'forearmR' | 'handR'
  | 'thighL' | 'shinL' | 'footL'
  | 'thighR' | 'shinR' | 'footR';

type Euler3 = [number, number, number];
export type Pose = Partial<Record<ClipBoneName, Euler3>> & { pelvisY?: number };

/** Keyframe sparso: tempo assoluto + pose parziale. */
export interface PoseKey {
  t: number;
  pose: Pose;
}

const Q = new THREE.Quaternion();
const E = new THREE.Euler();

/**
 * Costruisce una AnimationClip da keyframe sparsi: una QuaternionKeyframeTrack
 * per ogni osso citato (solo ai tempi in cui compare) + traccia di posizione
 * del bacino. Le ossa hanno rest pose a rotazione zero, quindi gli euler
 * sono assoluti.
 */
export function buildClip(name: string, duration: number, keys: PoseKey[], restPelvisY: number): THREE.AnimationClip {
  const boneTimes = new Map<ClipBoneName, number[]>();
  const boneValues = new Map<ClipBoneName, number[]>();
  const pyTimes: number[] = [];
  const pyValues: number[] = [];

  for (const key of keys) {
    for (const [bone, euler] of Object.entries(key.pose)) {
      if (bone === 'pelvisY') continue;
      const b = bone as ClipBoneName;
      const [x, y, z] = euler as Euler3;
      Q.setFromEuler(E.set(x, y, z));
      if (!boneTimes.has(b)) {
        boneTimes.set(b, []);
        boneValues.set(b, []);
      }
      boneTimes.get(b)!.push(key.t);
      boneValues.get(b)!.push(Q.x, Q.y, Q.z, Q.w);
    }
    if (key.pose.pelvisY !== undefined) {
      pyTimes.push(key.t);
      pyValues.push(0, restPelvisY + key.pose.pelvisY, 0);
    }
  }

  const tracks: THREE.KeyframeTrack[] = [];
  for (const [bone, times] of boneTimes) {
    tracks.push(new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, boneValues.get(bone)!));
  }
  if (pyTimes.length > 0) {
    tracks.push(new THREE.VectorKeyframeTrack('pelvis.position', pyTimes, pyValues));
  }
  return new THREE.AnimationClip(name, duration, tracks);
}

/**
 * Genera una clip ciclica campionando una funzione di fase (0..1):
 * la locomozione usa le stesse formule del rig procedurale già validate
 * visivamente, garantendo continuità perfetta del look.
 */
export function sampleLoop(
  name: string,
  period: number,
  samples: number,
  fn: (phase01: number) => Pose,
  restPelvisY: number,
): THREE.AnimationClip {
  const keys: PoseKey[] = [];
  for (let i = 0; i <= samples; i++) {
    const p = i / samples;
    keys.push({ t: p * period, pose: fn(p % 1) });
  }
  return buildClip(name, period, keys, restPelvisY);
}

// ------------------------------------------------------------ locomozione

/** Ciclo di corsa parametrico (camminata/corsa/sprint cambiano i parametri). */
function gaitPose(phase01: number, swing: number, knee: number, bob: number, lean: number, armSwing: number): Pose {
  const a = phase01 * Math.PI * 2;
  const s = Math.sin(a);
  const c = Math.cos(a);
  const thighL = s * swing;
  const thighR = -s * swing;
  const shinL = -Math.max(0, c) * knee;
  const shinR = -Math.max(0, -c) * knee;
  return {
    thighL: [thighL, 0, 0],
    thighR: [thighR, 0, 0],
    shinL: [shinL, 0, 0],
    shinR: [shinR, 0, 0],
    footL: [-thighL * 0.35 - shinL * 0.55, 0, 0],
    footR: [-thighR * 0.35 - shinR * 0.55, 0, 0],
    upperArmL: [-s * armSwing, 0, 0.12],
    upperArmR: [s * armSwing, 0, -0.12],
    forearmL: [-(0.25 + Math.max(0, s) * 0.55), 0, 0],
    forearmR: [-(0.25 + Math.max(0, -s) * 0.55), 0, 0],
    spine: [lean, 0, 0],
    chest: [0, s * 0.1, 0],
    head: [-lean * 0.6, 0, 0],
    pelvis: [0, -s * 0.06, 0],
    pelvisY: Math.abs(s) * bob,
  };
}

/** Passo laterale (portiere): incrocio gambe con abduzione. */
function strafePose(phase01: number, dir: number): Pose {
  const a = phase01 * Math.PI * 2;
  const s = Math.sin(a);
  return {
    thighL: [0.08, 0, dir * (0.18 + Math.max(0, s) * 0.35)],
    thighR: [0.08, 0, dir * (0.18 + Math.max(0, -s) * 0.35)],
    shinL: [-0.25, 0, 0],
    shinR: [-0.25, 0, 0],
    upperArmL: [0, 0, 0.35],
    upperArmR: [0, 0, -0.35],
    forearmL: [-0.5, 0, 0],
    forearmR: [-0.5, 0, 0],
    spine: [0.12, 0, 0],
    pelvisY: Math.abs(s) * 0.03,
  };
}

export interface ClipLibrary {
  clips: Map<string, THREE.AnimationClip>;
  /** Istante del contatto piede-palla nelle clip di calcio/passaggio. */
  impactTime: { calcio: number; passaggio: number };
}

/** Costruisce l'intera libreria di clip per uno scheletro col bacino a restPelvisY. */
export function buildClipLibrary(restPelvisY: number): ClipLibrary {
  const clips = new Map<string, THREE.AnimationClip>();
  const add = (c: THREE.AnimationClip) => clips.set(c.name, c);
  const R = restPelvisY;

  // --- locomozione (campionata, 8 chiavi per ciclo) ---
  add(sampleLoop('idle', 3.2, 8, (p) => {
    const a = p * Math.PI * 2;
    return {
      chest: [Math.sin(a) * 0.025, 0, 0],
      upperArmL: [0, 0, 0.12 + Math.sin(a) * 0.015],
      upperArmR: [0, 0, -0.12 - Math.sin(a) * 0.015],
      spine: [0.02, 0, 0],
      pelvisY: Math.sin(a * 2) * 0.006,
    };
  }, R));
  add(sampleLoop('walk', 0.92, 8, (p) => gaitPose(p, 0.42, 0.55, 0.025, 0.06, 0.3), R));
  add(sampleLoop('run', 0.62, 8, (p) => gaitPose(p, 0.98, 1.3, 0.05, 0.18, 0.75), R));
  add(sampleLoop('sprint', 0.5, 8, (p) => gaitPose(p, 1.25, 1.55, 0.065, 0.3, 1.0), R));
  add(sampleLoop('back', 0.8, 8, (p) => gaitPose(1 - p, 0.45, 0.5, 0.03, -0.08, 0.3), R));
  add(sampleLoop('strafeL', 0.7, 8, (p) => strafePose(p, 1), R));
  add(sampleLoop('strafeR', 0.7, 8, (p) => strafePose(p, -1), R));

  // posa aerea (tenuta, il pitch in salita/caduta è aggiunto dal rig)
  add(buildClip('aria', 0.4, [
    { t: 0, pose: { thighL: [0.85, 0, 0], thighR: [0.45, 0, 0], shinL: [-0.85, 0, 0], shinR: [-0.55, 0, 0], upperArmL: [0, 0, 1.1], upperArmR: [0, 0, -1.1], spine: [-0.06, 0, 0] } },
    { t: 0.4, pose: { thighL: [0.8, 0, 0], thighR: [0.5, 0, 0], shinL: [-0.8, 0, 0], shinR: [-0.6, 0, 0], upperArmL: [0, 0, 1.05], upperArmR: [0, 0, -1.05], spine: [-0.06, 0, 0] } },
  ], R));

  // --- azioni one-shot ---
  // calcio: windup → IMPATTO (t=0.12) → follow-through
  add(buildClip('calcio', 0.42, [
    { t: 0, pose: { thighR: [-0.95, 0, 0], shinR: [-0.8, 0, 0], spine: [0.12, 0.35, 0], upperArmL: [0.5, 0, 0.2], upperArmR: [-0.4, 0, -0.2], pelvisY: -0.04 } },
    { t: 0.12, pose: { thighR: [1.5, 0, 0], shinR: [-0.06, 0, 0], spine: [-0.08, -0.45, 0], upperArmL: [0.85, 0, 0.3], upperArmR: [0.3, 0, -0.3], footR: [0.5, 0, 0], pelvisY: 0.02 } },
    { t: 0.27, pose: { thighR: [0.95, 0, 0], shinR: [-0.35, 0, 0], spine: [0, -0.2, 0], upperArmL: [0.3, 0, 0.15], pelvisY: 0 } },
    { t: 0.42, pose: { thighR: [0, 0, 0], shinR: [0, 0, 0], spine: [0, 0, 0], upperArmL: [0, 0, 0.12], upperArmR: [0, 0, -0.12] } },
  ], R));
  // passaggio: rapido, IMPATTO t=0.06
  add(buildClip('passaggio', 0.26, [
    { t: 0, pose: { thighR: [-0.45, 0, 0], shinR: [-0.5, 0, 0], spine: [0.06, 0.15, 0] } },
    { t: 0.06, pose: { thighR: [0.8, 0, 0.12], shinR: [-0.1, 0, 0], spine: [0, -0.18, 0], footR: [0.3, 0, 0] } },
    { t: 0.26, pose: { thighR: [0, 0, 0], shinR: [0, 0, 0], spine: [0, 0, 0] } },
  ], R));
  // contrasto in piedi: affondo con allungo
  add(buildClip('contrasto', 0.34, [
    { t: 0, pose: { spine: [0.1, 0, 0], thighL: [0.2, 0, 0] } },
    { t: 0.12, pose: { spine: [0.5, 0, 0], thighL: [0.85, 0, 0], shinL: [-0.2, 0, 0], thighR: [-0.5, 0, 0], upperArmL: [-1.1, 0, 0.3], upperArmR: [-1.1, 0, -0.3], pelvisY: -0.1 } },
    { t: 0.34, pose: { spine: [0.1, 0, 0], thighL: [0, 0, 0], thighR: [0, 0, 0], upperArmL: [0, 0, 0.12], upperArmR: [0, 0, -0.12], pelvisY: 0 } },
  ], R));
  // scivolata (tenuta in fondo)
  add(buildClip('scivolata', 0.3, [
    { t: 0, pose: { pelvis: [-0.3, 0, 0], thighL: [0.6, 0, 0], pelvisY: -0.15 } },
    { t: 0.18, pose: { pelvis: [-1.15, 0, 0], thighL: [1.55, 0, 0], shinL: [-0.1, 0, 0], thighR: [1.0, 0, 0], shinR: [-0.7, 0, 0], upperArmL: [-0.6, 0, 0.25], upperArmR: [-0.9, 0, -0.25], spine: [0.15, 0, 0], pelvisY: -0.5 } },
    { t: 0.3, pose: { pelvis: [-1.15, 0, 0], thighL: [1.55, 0, 0], shinL: [-0.1, 0, 0], thighR: [1.0, 0, 0], shinR: [-0.7, 0, 0], pelvisY: -0.5 } },
  ], R));
  // tuffi del portiere: alto/basso × lato (roll del bacino + braccia tese)
  const dive = (name: string, side: number, high: boolean) => {
    const roll = side * (high ? 1.0 : 1.35);
    const armZ = side * (high ? 2.9 : 2.55);
    const py = high ? 0.05 : -0.18;
    add(buildClip(name, 0.5, [
      { t: 0, pose: { pelvis: [0, 0, roll * 0.25], thighL: [0.3, 0, 0], thighR: [0.3, 0, 0], pelvisY: -0.1 } },
      { t: 0.16, pose: {
        pelvis: [-0.2, 0, roll], pelvisY: py,
        upperArmL: [0, 0, side >= 0 ? armZ : side * 1.6],
        upperArmR: [0, 0, side >= 0 ? side * 1.6 : armZ],
        forearmL: [-0.1, 0, 0], forearmR: [-0.1, 0, 0],
        thighL: [0.45, 0, 0], thighR: [-0.3, 0, 0], shinL: [-0.3, 0, 0],
        head: [0, 0, -roll * 0.3],
      } },
      { t: 0.5, pose: { pelvis: [-0.2, 0, roll], pelvisY: py } },
    ], R));
  };
  dive('tuffoAltoL', 1, true);
  dive('tuffoAltoR', -1, true);
  dive('tuffoBassoL', 1, false);
  dive('tuffoBassoR', -1, false);
  // stordito (loop barcollante)
  add(sampleLoop('stordito', 0.9, 8, (p) => {
    const a = p * Math.PI * 2;
    return {
      pelvis: [0.25 + Math.sin(a * 2) * 0.08, 0, Math.sin(a) * 0.12],
      upperArmL: [0, 0, 0.5],
      upperArmR: [0, 0, -0.5],
      head: [0.15, Math.sin(a) * 0.2, 0],
    };
  }, R));
  // rialzata: dal basso alla posa neutra
  add(buildClip('rialzo', 0.4, [
    { t: 0, pose: { pelvis: [-0.6, 0, 0], pelvisY: -0.35, thighL: [0.9, 0, 0], shinL: [-0.9, 0, 0], thighR: [0.7, 0, 0], shinR: [-0.7, 0, 0], spine: [0.3, 0, 0] } },
    { t: 0.28, pose: { pelvis: [-0.1, 0, 0], pelvisY: -0.08, thighL: [0.25, 0, 0], shinL: [-0.3, 0, 0], thighR: [0.15, 0, 0], shinR: [-0.2, 0, 0], spine: [0.12, 0, 0] } },
    { t: 0.4, pose: { pelvis: [0, 0, 0], pelvisY: 0, thighL: [0, 0, 0], shinL: [0, 0, 0], thighR: [0, 0, 0], shinR: [0, 0, 0], spine: [0, 0, 0] } },
  ], R));
  // esultanza: doppio pugno al cielo con saltello
  add(sampleLoop('esultanza', 0.85, 8, (p) => {
    const a = p * Math.PI * 2;
    const up = Math.max(0, Math.sin(a));
    return {
      upperArmL: [-2.6 - up * 0.3, 0, 0.35],
      upperArmR: [-2.6 - up * 0.3, 0, -0.35],
      forearmL: [-0.4, 0, 0],
      forearmR: [-0.4, 0, 0],
      spine: [-0.12, 0, 0],
      head: [-0.2, 0, 0],
      thighL: [up * 0.4, 0, 0],
      thighR: [up * 0.4, 0, 0],
      shinL: [-up * 0.5, 0, 0],
      shinR: [-up * 0.5, 0, 0],
      pelvisY: up * 0.16,
    };
  }, R));
  // rinvio del portiere: lancio sopra la spalla
  add(buildClip('rinvio', 0.5, [
    { t: 0, pose: { upperArmR: [-2.8, 0, -0.3], forearmR: [-0.6, 0, 0], spine: [-0.1, 0.25, 0] } },
    { t: 0.18, pose: { upperArmR: [0.9, 0, -0.2], forearmR: [-0.1, 0, 0], spine: [0.18, -0.3, 0] } },
    { t: 0.5, pose: { upperArmR: [0, 0, -0.12], forearmR: [0, 0, 0], spine: [0, 0, 0] } },
  ], R));
  // carica del tiro (solo parte alta: torsione + braccio armato), tenuta
  add(buildClip('carica', 0.4, [
    { t: 0, pose: { spine: [0, -0.12, 0], upperArmR: [0.2, 0, -0.15] } },
    { t: 0.4, pose: { spine: [0.05, -0.5, 0], upperArmR: [0.7, 0, -0.3], chest: [0, -0.15, 0] } },
  ], R));

  return { clips, impactTime: { calcio: 0.12, passaggio: 0.06 } };
}
