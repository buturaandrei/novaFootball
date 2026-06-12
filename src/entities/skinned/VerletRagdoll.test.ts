import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { RAGDOLL_POINTS, VerletRagdoll, type RagdollPointName } from './VerletRagdoll';

function standingPose(): Record<RagdollPointName, THREE.Vector3> {
  return {
    head: new THREE.Vector3(0, 1.7, 0),
    chest: new THREE.Vector3(0, 1.35, 0),
    pelvis: new THREE.Vector3(0, 0.92, 0),
    handL: new THREE.Vector3(-0.3, 0.93, 0),
    handR: new THREE.Vector3(0.3, 0.93, 0),
    footL: new THREE.Vector3(-0.15, 0.1, 0),
    footR: new THREE.Vector3(0.15, 0.1, 0),
  };
}

describe('VerletRagdoll', () => {
  it('vola con l’impulso, resta finito e si ferma a terra', () => {
    const r = new VerletRagdoll();
    r.start(standingPose(), new THREE.Vector3(9, 5.5, 3));
    let settled = false;
    for (let i = 0; i < 60 * 6 && !settled; i++) {
      settled = r.step(1 / 60);
      for (const p of r.pos) {
        expect(Number.isFinite(p.x + p.y + p.z)).toBe(true);
        expect(p.y).toBeGreaterThanOrEqual(0.09);
        expect(p.y).toBeLessThan(6);
      }
    }
    expect(settled).toBe(true);
    // il corpo si è spostato nella direzione dell'impulso
    const pelvis = r.pos[r.index('pelvis')];
    expect(pelvis.x).toBeGreaterThan(0.5);
    // ed è accasciato (bacino vicino a terra)
    expect(pelvis.y).toBeLessThan(0.6);
  });

  it('i vincoli restano rispettati (corpo non smembrato né collassato)', () => {
    const r = new VerletRagdoll();
    const pose = standingPose();
    r.start(pose, new THREE.Vector3(-7, 6, -4));
    for (let i = 0; i < 240; i++) r.step(1 / 60);
    const head = r.pos[r.index('head')];
    const chest = r.pos[r.index('chest')];
    const d = head.distanceTo(chest);
    expect(d).toBeGreaterThan(0.2);
    expect(d).toBeLessThan(0.55);
  });

  it('senza impulso si affloscia dolcemente e si ferma presto', () => {
    const r = new VerletRagdoll();
    r.start(standingPose(), new THREE.Vector3(0, 0, 0));
    let settled = false;
    let frames = 0;
    for (; frames < 60 * 6 && !settled; frames++) settled = r.step(1 / 60);
    expect(settled).toBe(true);
    expect(RAGDOLL_POINTS.length).toBe(7);
  });
});
