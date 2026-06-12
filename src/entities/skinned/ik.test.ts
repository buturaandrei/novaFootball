import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { aimBoneNegY, solveTwoBoneIK } from './ik';

/** Catena gamba sintetica: anca a (0,1,0), segmenti da 0.4 verso il basso. */
function makeChain() {
  const root = new THREE.Object3D();
  const upper = new THREE.Object3D();
  upper.position.set(0, 1, 0);
  const lower = new THREE.Object3D();
  lower.position.set(0, -0.4, 0);
  const end = new THREE.Object3D();
  end.position.set(0, -0.4, 0);
  root.add(upper);
  upper.add(lower);
  lower.add(end);
  root.updateMatrixWorld(true);
  return { root, upper, lower, end };
}

describe('solveTwoBoneIK', () => {
  it('porta l’estremità sul bersaglio raggiungibile', () => {
    const { upper, lower, end } = makeChain();
    const target = new THREE.Vector3(0.2, 0.45, 0.15);
    solveTwoBoneIK(upper, lower, end, target, 1);
    const p = end.getWorldPosition(new THREE.Vector3());
    expect(p.distanceTo(target)).toBeLessThan(3e-3);
  });

  it('clampa i bersagli fuori portata alla lunghezza massima', () => {
    const { upper, lower, end } = makeChain();
    const target = new THREE.Vector3(0, 1, 2.5); // lontanissimo
    solveTwoBoneIK(upper, lower, end, target, 1);
    const hip = upper.getWorldPosition(new THREE.Vector3());
    const p = end.getWorldPosition(new THREE.Vector3());
    const reach = p.distanceTo(hip);
    expect(reach).toBeGreaterThan(0.78);
    expect(reach).toBeLessThanOrEqual(0.8 + 1e-3);
    // e l'estremità giace sulla direzione del bersaglio
    const dirT = target.clone().sub(hip).normalize();
    const dirP = p.clone().sub(hip).normalize();
    expect(dirT.dot(dirP)).toBeGreaterThan(0.999);
  });

  it('con blend 0 non tocca la posa', () => {
    const { upper, lower, end } = makeChain();
    const before = end.getWorldPosition(new THREE.Vector3());
    solveTwoBoneIK(upper, lower, end, new THREE.Vector3(0.3, 0.5, 0.1), 0);
    const after = end.getWorldPosition(new THREE.Vector3());
    expect(after.distanceTo(before)).toBeLessThan(1e-6);
  });

  it('è stabile se richiamato molte volte sullo stesso bersaglio', () => {
    const { upper, lower, end } = makeChain();
    const target = new THREE.Vector3(0.15, 0.5, -0.1);
    for (let i = 0; i < 50; i++) solveTwoBoneIK(upper, lower, end, target, 1);
    const p = end.getWorldPosition(new THREE.Vector3());
    expect(p.distanceTo(target)).toBeLessThan(3e-3);
    expect(Number.isFinite(upper.quaternion.x)).toBe(true);
  });
});

describe('aimBoneNegY', () => {
  it('orienta il segmento verso il punto', () => {
    const { upper, lower } = makeChain();
    const target = new THREE.Vector3(0.5, 0.8, 0.3);
    aimBoneNegY(upper, target);
    const a = upper.getWorldPosition(new THREE.Vector3());
    const b = lower.getWorldPosition(new THREE.Vector3());
    const seg = b.sub(a).normalize();
    const want = target.sub(a).normalize();
    expect(seg.dot(want)).toBeGreaterThan(0.999);
  });
});
