import * as THREE from 'three';

const vA = new THREE.Vector3();
const vB = new THREE.Vector3();
const vC = new THREE.Vector3();
const vT = new THREE.Vector3();
const vN = new THREE.Vector3();
const vTmp = new THREE.Vector3();
const vTmp2 = new THREE.Vector3();
const qDelta = new THREE.Quaternion();
const qParent = new THREE.Quaternion();
const qParentInv = new THREE.Quaternion();
const qSaveU = new THREE.Quaternion();
const qSaveL = new THREE.Quaternion();
const lookM = new THREE.Matrix4();
const lookQ = new THREE.Quaternion();
const ZERO = new THREE.Vector3(0, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Applica una rotazione in spazio MONDO a un osso: newWorld = qW · oldWorld.
 * newLocal = parentW⁻¹ · qW · parentW · oldLocal.
 */
export function rotateBoneWorld(bone: THREE.Object3D, qW: THREE.Quaternion): void {
  bone.parent!.getWorldQuaternion(qParent);
  qParentInv.copy(qParent).invert();
  bone.quaternion.premultiply(qParent).premultiply(qW).premultiply(qParentInv);
}

/** Orienta l'asse -Y dell'osso (direzione del segmento) verso un punto mondo. */
export function aimBoneNegY(bone: THREE.Object3D, targetWorld: THREE.Vector3): void {
  bone.getWorldPosition(vA);
  const want = vT.copy(targetWorld).sub(vA);
  if (want.lengthSq() < 1e-8) return;
  want.normalize();
  // direzione attuale del segmento: -Y in spazio mondo
  bone.getWorldQuaternion(qDelta);
  const cur = vTmp.set(0, -1, 0).applyQuaternion(qDelta).normalize();
  qDelta.setFromUnitVectors(cur, want);
  rotateBoneWorld(bone, qDelta);
}

/**
 * IK a due ossa "dalla posa corrente" (stile motion-editing):
 * 1) ruota la catena perché l'estremità punti al bersaglio,
 * 2) corregge gli angoli interni col teorema del coseno (il piano del
 *    ginocchio/gomito resta quello della posa animata).
 * `blend` 0..1 mescola tra posa animata e soluzione IK.
 */
export function solveTwoBoneIK(
  upper: THREE.Object3D, // coscia / braccio
  lower: THREE.Object3D, // tibia / avambraccio
  end: THREE.Object3D,   // caviglia / polso (figlio di lower)
  targetWorld: THREE.Vector3,
  blend: number,
): void {
  if (blend <= 0.001) return;
  qSaveU.copy(upper.quaternion);
  qSaveL.copy(lower.quaternion);

  upper.getWorldPosition(vA);
  lower.getWorldPosition(vB);
  end.getWorldPosition(vC);
  const l1 = vA.distanceTo(vB);
  const l2 = vB.distanceTo(vC);
  if (l1 < 1e-5 || l2 < 1e-5) return;

  // bersaglio raggiungibile: clampa tra |l1−l2| e l1+l2
  vT.copy(targetWorld).sub(vA);
  let d = vT.length();
  if (d < 1e-6) return;
  const maxD = (l1 + l2) * 0.999;
  const minD = Math.abs(l1 - l2) * 1.05 + 1e-4;
  const clamped = THREE.MathUtils.clamp(d, minD, maxD);
  vT.multiplyScalar(clamped / d);
  d = clamped;

  // 1) ginocchio/gomito: porta la distanza anca→estremità a d.
  //    Ruotare bc attorno a (bc×ba) di +θ RIDUCE l'angolo interno,
  //    quindi θ = curB − desB.
  const ba = vTmp.copy(vA).sub(vB);
  const bc = vTmp2.copy(vC).sub(vB);
  const curB = ba.angleTo(bc);
  const desB = Math.acos(THREE.MathUtils.clamp((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2), -1, 1));
  vN.copy(bc).cross(ba);
  if (vN.lengthSq() < 1e-8) vN.set(1, 0, 0); // catena dritta: piano sagittale
  qDelta.setFromAxisAngle(vN.normalize(), curB - desB);
  rotateBoneWorld(lower, qDelta);

  // 2) mira: ora |AC| = d, basta allineare l'estremità al bersaglio
  end.getWorldPosition(vC);
  vTmp.copy(vC).sub(vA);
  if (vTmp.lengthSq() < 1e-8) return;
  qDelta.setFromUnitVectors(vTmp.normalize(), vTmp2.copy(vT).normalize());
  rotateBoneWorld(upper, qDelta);

  // blend con la posa animata di partenza
  if (blend < 1) {
    qDelta.copy(upper.quaternion);
    upper.quaternion.copy(qSaveU).slerp(qDelta, blend);
    qDelta.copy(lower.quaternion);
    lower.quaternion.copy(qSaveL).slerp(qDelta, blend);
  }
}

/**
 * Orienta la testa verso un punto: il +Z dell'osso punta al bersaglio,
 * limitato a `maxAngle` radianti dalla posa animata corrente.
 */
export function aimHead(
  head: THREE.Object3D,
  targetWorld: THREE.Vector3,
  maxAngle: number,
  weight: number,
): void {
  if (weight <= 0.001) return;
  head.getWorldPosition(vA);
  vT.copy(targetWorld).sub(vA);
  if (vT.lengthSq() < 0.09) return;
  // Matrix4.lookAt(eye=dir, target=0, up): la base +Z risultante = dir
  lookM.lookAt(vT.normalize(), ZERO, UP);
  lookQ.setFromRotationMatrix(lookM);

  head.parent!.getWorldQuaternion(qParent);
  qParentInv.copy(qParent).invert();
  const desiredLocal = qDelta.copy(qParentInv).multiply(lookQ);
  const angle = head.quaternion.angleTo(desiredLocal);
  const w = angle > maxAngle ? (weight * maxAngle) / Math.max(angle, 1e-4) : weight;
  head.quaternion.slerp(desiredLocal, Math.min(1, w));
}
