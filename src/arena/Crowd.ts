import * as THREE from 'three';

interface RingSpec {
  radius: number;
  y: number;
  rows: number;
  count: number;
}

const RINGS: RingSpec[] = [
  { radius: 57, y: 7.2, rows: 3, count: 380 },
  { radius: 71, y: 14.5, rows: 3, count: 460 },
  { radius: 87, y: 22.5, rows: 3, count: 540 },
];

/**
 * Pubblico instanced: migliaia di quad colorati sulle tribune anulari,
 * animati nel vertex shader (ondeggiano sempre, esultano e "si alzano"
 * sui goal). Un solo draw call per tutto lo stadio.
 */
export class Crowd {
  readonly mesh: THREE.InstancedMesh;
  private material: THREE.ShaderMaterial;
  private excite = 0;

  constructor(teamColors: [number, number]) {
    const total = RINGS.reduce((s, r) => s + r.count * r.rows, 0);
    const geo = new THREE.PlaneGeometry(0.62, 0.95);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uExcite: { value: 0 },
      },
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        attribute float aPhase;
        attribute vec3 aColor;
        uniform float uTime;
        uniform float uExcite;
        varying vec3 vColor;
        varying float vGlow;
        void main() {
          vColor = aColor;
          // ondeggiamento di base + salto di esultanza sui goal
          float bob = sin(uTime * 2.0 + aPhase) * 0.05;
          float jump = uExcite * abs(sin(uTime * 7.0 + aPhase)) * (0.45 + 0.3 * fract(aPhase * 7.3));
          vGlow = 0.75 + 0.25 * sin(uTime * 1.3 + aPhase * 2.0) + uExcite * 0.5;
          vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
          world.y += bob + jump;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vGlow;
        void main() {
          gl_FragColor = vec4(vColor * vGlow, 1.0);
        }
      `,
    });

    this.mesh = new THREE.InstancedMesh(geo, this.material, total);
    this.mesh.frustumCulled = false;

    const phases = new Float32Array(total);
    const colors = new Float32Array(total * 3);
    const dummy = new THREE.Object3D();
    const palette = [
      new THREE.Color(teamColors[0]).multiplyScalar(0.8),
      new THREE.Color(teamColors[1]).multiplyScalar(0.8),
      new THREE.Color(0x9aa6b8),
      new THREE.Color(0x5a6a80),
      new THREE.Color(0xd8e4f0),
    ];

    let i = 0;
    for (const ring of RINGS) {
      for (let row = 0; row < ring.rows; row++) {
        for (let n = 0; n < ring.count; n++) {
          const angle = (n / ring.count) * Math.PI * 2 + row * 0.011 + ring.y;
          const r = ring.radius + row * 2.1;
          const x = Math.cos(angle) * r * 1.25; // tribune ellittiche
          const z = Math.sin(angle) * r;
          const y = ring.y + row * 1.35 + (Math.random() - 0.5) * 0.2;
          dummy.position.set(x, y, z);
          dummy.rotation.set(0, Math.atan2(-x, -z), 0);
          dummy.updateMatrix();
          this.mesh.setMatrixAt(i, dummy.matrix);
          phases[i] = Math.random() * Math.PI * 2;
          const c = palette[Math.floor(Math.random() * palette.length)];
          colors[i * 3] = c.r;
          colors[i * 3 + 1] = c.g;
          colors[i * 3 + 2] = c.b;
          i++;
        }
      }
    }
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
    geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(colors, 3));
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Esultanza: il pubblico si alza e salta, poi si calma da solo. */
  cheer(): void {
    this.excite = 1;
  }

  update(dt: number, time: number): void {
    this.excite = Math.max(0, this.excite - dt * 0.35);
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uExcite.value = this.excite;
  }
}
