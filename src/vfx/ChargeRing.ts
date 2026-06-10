import * as THREE from 'three';

const LEVEL_COLORS = [0x46e8ff, 0xffe14a, 0xff5ad6];

/**
 * Anello di carica del tiro ai piedi del giocatore: si espande con la carica
 * e cambia colore ai 3 livelli di potenza.
 */
export class ChargeRing {
  readonly mesh: THREE.Mesh;
  private material: THREE.MeshBasicMaterial;

  constructor() {
    this.material = new THREE.MeshBasicMaterial({
      color: LEVEL_COLORS[0],
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 40), this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 0.04;
    this.mesh.visible = false;
  }

  update(charge: number, position: THREE.Vector3 | null, time: number): void {
    if (charge <= 0 || !position) {
      this.mesh.visible = false;
      this.material.opacity = 0;
      return;
    }
    this.mesh.visible = true;
    this.mesh.position.set(position.x, 0.04, position.z);
    const level = charge >= 0.99 ? 2 : charge >= 0.5 ? 1 : 0;
    this.material.color.setHex(LEVEL_COLORS[level]);
    const pulse = level === 2 ? 0.15 * Math.sin(time * 18) : 0;
    const scale = 0.9 + charge * 1.1 + pulse;
    this.mesh.scale.setScalar(scale);
    this.material.opacity = 0.35 + charge * 0.5;
  }
}
