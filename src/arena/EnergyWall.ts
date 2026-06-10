import * as THREE from 'three';

const MAX_IMPACTS = 8;

/**
 * Muro di energia perimetrale: pattern esagonale tenue, fascia luminosa
 * alla base e onde circolari che si espandono dai punti di impatto.
 */
export class EnergyWall {
  readonly mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  private impacts: THREE.Vector4[] = [];
  private cursor = 0;
  private width: number;
  private height: number;

  constructor(width: number, height: number, color: THREE.Color, goalMouth?: { halfWidth: number; height: number }) {
    this.width = width;
    this.height = height;
    for (let i = 0; i < MAX_IMPACTS; i++) this.impacts.push(new THREE.Vector4(0, 0, 1e3, 0));

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: color },
        uSize: { value: new THREE.Vector2(width, height) },
        uImpacts: { value: this.impacts },
        uGoalMouth: { value: new THREE.Vector2(goalMouth?.halfWidth ?? 0, goalMouth?.height ?? 0) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uColor;
        uniform vec2 uSize;
        uniform vec4 uImpacts[${MAX_IMPACTS}];
        uniform vec2 uGoalMouth;
        varying vec2 vUv;

        // distanza da una griglia esagonale (approssimazione economica)
        float hexLine(vec2 p, float scale) {
          p /= scale;
          vec2 a = mod(p, vec2(1.732, 1.0)) - vec2(0.866, 0.5);
          vec2 b = mod(p + vec2(0.866, 0.5), vec2(1.732, 1.0)) - vec2(0.866, 0.5);
          float d = min(dot(a, a), dot(b, b));
          return smoothstep(0.18, 0.16, d);
        }

        void main() {
          // coordinate locali in metri, origine al centro-base del muro
          vec2 p = vec2((vUv.x - 0.5) * uSize.x, vUv.y * uSize.y);

          float hex = hexLine(p, 1.4) * 0.05;
          float baseGlow = exp(-vUv.y * 4.5) * 0.4;
          float topFade = 1.0 - smoothstep(0.55, 1.0, vUv.y);
          float shimmer = 0.04 * (0.5 + 0.5 * sin(p.x * 0.7 + uTime * 2.0));

          float ripple = 0.0;
          for (int i = 0; i < ${MAX_IMPACTS}; i++) {
            vec4 im = uImpacts[i];
            float age = im.z;
            if (age > 2.0) continue;
            float r = age * 9.0;
            float d = distance(p, im.xy);
            float band = exp(-abs(d - r) * 1.8);
            ripple += band * im.w * exp(-age * 2.2);
          }

          float alpha = (hex + shimmer) * topFade + baseGlow * 0.6 + ripple * 0.9;

          // foro visivo per la bocca della porta (resta un velo leggero)
          if (uGoalMouth.x > 0.0 && abs(p.x) < uGoalMouth.x && p.y < uGoalMouth.y) {
            alpha *= 0.15;
          }

          vec3 col = uColor * (1.0 + ripple * 2.5);
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });

    const geo = new THREE.PlaneGeometry(width, height);
    geo.translate(0, height / 2, 0);
    this.mesh = new THREE.Mesh(geo, this.material);
  }

  /** Registra un impatto in coordinate locali del muro (x lungo il muro, y altezza). */
  addImpact(localX: number, localY: number, strength: number): void {
    const im = this.impacts[this.cursor];
    this.cursor = (this.cursor + 1) % MAX_IMPACTS;
    im.set(
      THREE.MathUtils.clamp(localX, -this.width / 2, this.width / 2),
      THREE.MathUtils.clamp(localY, 0, this.height),
      0,
      THREE.MathUtils.clamp(strength, 0.2, 1.5),
    );
  }

  update(dt: number, time: number): void {
    this.material.uniforms.uTime.value = time;
    for (const im of this.impacts) im.z += dt;
  }
}
