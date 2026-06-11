import * as THREE from 'three';

interface Particle {
  alive: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  color: THREE.Color;
  gravity: number;
  drag: number;
}

export interface BurstOptions {
  count: number;
  color: THREE.Color | number;
  speed?: number;
  spread?: number; // 0..1, quanto il cono si apre rispetto alla normale
  direction?: THREE.Vector3;
  life?: number;
  size?: number;
  gravity?: number;
  drag?: number;
  /** Implosione: nasce su una sfera di questo raggio e converge al centro. */
  implodeRadius?: number;
}

/**
 * Pool di particelle additive su un unico THREE.Points: zero allocazioni
 * per frame, burst riutilizzabili per impatti, calci, scie ed esplosioni.
 */
export class ParticlePool {
  readonly points: THREE.Points;
  private particles: Particle[] = [];
  private geometry: THREE.BufferGeometry;
  private positions: Float32Array;
  private colors: Float32Array;
  private sizes: Float32Array;
  private capacity: number;
  private cursor = 0;

  constructor(capacity = 768) {
    this.capacity = capacity;
    for (let i = 0; i < capacity; i++) {
      this.particles.push({
        alive: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        size: 1,
        color: new THREE.Color(),
        gravity: 0,
        drag: 0,
      });
    }
    this.positions = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 3);
    this.sizes = new Float32Array(capacity);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float aSize;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (220.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float a = smoothstep(0.5, 0.05, length(d));
          gl_FragColor = vec4(vColor, a);
        }
      `,
      vertexColors: true,
    });

    this.points = new THREE.Points(this.geometry, material);
    this.points.frustumCulled = false;
  }

  burst(origin: THREE.Vector3, opts: BurstOptions): void {
    const color = opts.color instanceof THREE.Color ? opts.color : new THREE.Color(opts.color);
    const speed = opts.speed ?? 6;
    const spread = opts.spread ?? 1;
    const dir = opts.direction;
    for (let i = 0; i < opts.count; i++) {
      const p = this.particles[this.cursor];
      this.cursor = (this.cursor + 1) % this.capacity;
      p.alive = true;
      p.pos.copy(origin);
      // direzione casuale nel cono attorno a `dir` (o sfera completa)
      const u = Math.random() * 2 - 1;
      const phi = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      p.vel.set(s * Math.cos(phi), s * Math.sin(phi), u);
      if (opts.implodeRadius) {
        // parte sulla sfera e converge verso l'origine
        p.pos.addScaledVector(p.vel, opts.implodeRadius * (0.7 + Math.random() * 0.5));
        p.vel.negate();
      } else if (dir) {
        p.vel.multiplyScalar(spread).add(dir).normalize();
      }
      p.vel.multiplyScalar(speed * (0.4 + Math.random() * 0.6));
      p.maxLife = (opts.life ?? 0.6) * (0.6 + Math.random() * 0.4);
      p.life = p.maxLife;
      p.size = (opts.size ?? 1.4) * (0.6 + Math.random() * 0.5);
      p.color.copy(color);
      p.gravity = opts.gravity ?? 6;
      p.drag = opts.drag ?? 1.5;
    }
  }

  update(dt: number): void {
    const pos = this.positions;
    const col = this.colors;
    const siz = this.sizes;
    for (let i = 0; i < this.capacity; i++) {
      const p = this.particles[i];
      if (!p.alive) {
        siz[i] = 0;
        continue;
      }
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        siz[i] = 0;
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.pos.addScaledVector(p.vel, dt);
      const t = p.life / p.maxLife;
      pos[i * 3] = p.pos.x;
      pos[i * 3 + 1] = p.pos.y;
      pos[i * 3 + 2] = p.pos.z;
      col[i * 3] = p.color.r * t;
      col[i * 3 + 1] = p.color.g * t;
      col[i * 3 + 2] = p.color.b * t;
      siz[i] = p.size * (0.4 + 0.6 * t);
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.attributes.aSize.needsUpdate = true;
  }
}
