import * as THREE from 'three';

interface Ghost {
  mesh: THREE.Group;
  material: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
}

/**
 * Sagome residue ("after-image") per scatti e dribbling Flux: copie
 * stilizzate del giocatore che restano indietro e svaniscono. Pool fisso,
 * nessuna allocazione durante il gioco.
 */
export class AfterImages {
  readonly group = new THREE.Group();
  private ghosts: Ghost[] = [];
  private cursor = 0;

  constructor(capacity = 14) {
    for (let i = 0; i < capacity; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const g = new THREE.Group();
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.5, 2, 6), material);
      torso.position.y = 1.05;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5), material);
      head.position.y = 1.66;
      const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.5, 2, 6), material);
      legs.position.y = 0.45;
      g.add(torso, head, legs);
      g.visible = false;
      this.group.add(g);
      this.ghosts.push({ mesh: g, material, life: 0, maxLife: 0.4 });
    }
  }

  spawn(position: THREE.Vector3, facing: number, color: number, life = 0.4): void {
    const ghost = this.ghosts[this.cursor];
    this.cursor = (this.cursor + 1) % this.ghosts.length;
    ghost.mesh.position.copy(position);
    ghost.mesh.rotation.y = facing;
    ghost.material.color.setHex(color);
    ghost.life = life;
    ghost.maxLife = life;
    ghost.mesh.visible = true;
  }

  update(dt: number): void {
    for (const ghost of this.ghosts) {
      if (!ghost.mesh.visible) continue;
      ghost.life -= dt;
      if (ghost.life <= 0) {
        ghost.mesh.visible = false;
        ghost.material.opacity = 0;
        continue;
      }
      const t = ghost.life / ghost.maxLife;
      ghost.material.opacity = 0.45 * t;
      ghost.mesh.scale.setScalar(1 + (1 - t) * 0.15);
    }
  }
}
