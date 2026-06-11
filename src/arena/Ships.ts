import * as THREE from 'three';

interface Ship {
  group: THREE.Group;
  speed: number;
  range: number;
  z: number;
  y: number;
  offset: number;
}

/** Navette che passano in lontananza dietro le tribune, in loop. */
export class Ships {
  readonly group = new THREE.Group();
  private ships: Ship[] = [];

  constructor(count = 5) {
    for (let i = 0; i < count; i++) {
      const g = new THREE.Group();
      const hullColor = i % 2 === 0 ? 0x2a3c52 : 0x3a3050;
      const glow = i % 2 === 0 ? 0x49c8ff : 0xff9a4a;
      const hull = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.9, 4.5, 2, 6),
        new THREE.MeshBasicMaterial({ color: hullColor }),
      );
      hull.rotation.z = Math.PI / 2;
      g.add(hull);
      const engine = new THREE.Mesh(
        new THREE.SphereGeometry(0.55, 6, 5),
        new THREE.MeshBasicMaterial({ color: glow }),
      );
      engine.position.x = -2.8;
      g.add(engine);
      const trail = new THREE.Mesh(
        new THREE.PlaneGeometry(9, 0.5),
        new THREE.MeshBasicMaterial({
          color: glow,
          transparent: true,
          opacity: 0.3,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      trail.position.x = -7;
      g.add(trail);

      const ship: Ship = {
        group: g,
        speed: 9 + Math.random() * 14,
        range: 320,
        z: -160 - Math.random() * 180,
        y: 35 + Math.random() * 55,
        offset: Math.random() * 640,
      };
      // metà passano dal lato opposto
      if (i % 2 === 1) ship.z = -ship.z;
      this.ships.push(ship);
      this.group.add(g);
    }
  }

  update(time: number): void {
    for (const s of this.ships) {
      const span = s.range * 2;
      const x = ((time * s.speed + s.offset) % span) - s.range;
      const dir = s.z < 0 ? 1 : -1;
      s.group.position.set(x * dir, s.y, s.z);
      s.group.rotation.y = dir > 0 ? 0 : Math.PI;
    }
  }
}
