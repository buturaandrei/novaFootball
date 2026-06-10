import * as THREE from 'three';
import {
  FIELD_LENGTH,
  FIELD_WIDTH,
  HALF_LENGTH,
  HALF_WIDTH,
  WALL_HEIGHT,
  GOAL_WIDTH,
  GOAL_HEIGHT,
  GOAL_DEPTH,
} from '../core/constants';
import { EnergyWall } from './EnergyWall';

/**
 * Arena orbitale: campo olografico procedurale con griglia luminosa animata,
 * piattaforma sospesa, muri energetici, porte, anelli di tribune (silhouette,
 * pubblico completo in milestone 6), skybox con nebulosa e pianeta.
 */
export class Arena {
  readonly group = new THREE.Group();
  readonly walls: { wall: EnergyWall; axis: 'x' | 'z'; sign: number }[] = [];

  private fieldMaterial: THREE.ShaderMaterial;
  private skyMaterial: THREE.ShaderMaterial;

  constructor() {
    this.fieldMaterial = this.buildField();
    this.buildPlatform();
    this.buildWalls();
    this.buildGoals();
    this.buildStands();
    this.skyMaterial = this.buildSky();
    this.buildPlanet();
    this.buildLights();
  }

  // ---------------------------------------------------------------- campo
  private buildField(): THREE.ShaderMaterial {
    const apron = 5; // bordo oltre le linee
    const w = FIELD_LENGTH + apron * 2;
    const h = FIELD_WIDTH + apron * 2;

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: new THREE.Vector2(w, h) },
        uHalf: { value: new THREE.Vector2(HALF_LENGTH, HALF_WIDTH) },
        uLineColor: { value: new THREE.Color(0x46e8ff) },
        uGridColor: { value: new THREE.Color(0x1879a8) },
        uBaseColor: { value: new THREE.Color(0x041222) },
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
        uniform vec2 uSize;
        uniform vec2 uHalf;
        uniform vec3 uLineColor;
        uniform vec3 uGridColor;
        uniform vec3 uBaseColor;
        varying vec2 vUv;

        float sdRect(vec2 p, vec2 halfSize) {
          vec2 q = abs(p) - halfSize;
          return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
        }

        float lineMask(float d, float w) {
          return 1.0 - smoothstep(w * 0.5, w * 0.5 + 0.06, abs(d));
        }

        void main() {
          vec2 p = (vUv - 0.5) * uSize; // metri, origine al centro

          float inside = step(sdRect(p, uHalf), 0.0);

          // linee del campo
          float border = lineMask(sdRect(p, uHalf), 0.22);
          float midline = lineMask(p.x, 0.16) * inside;
          float circle = lineMask(length(p) - 6.0, 0.16);
          float centerDot = 1.0 - smoothstep(0.28, 0.42, length(p));
          vec2 qArea = vec2(abs(p.x) - (uHalf.x - 4.5), p.y);
          float area = lineMask(sdRect(qArea, vec2(4.5, 8.0)), 0.16) * inside;
          float lines = max(max(border, midline), max(max(circle, centerDot), area));

          // griglia olografica ogni 2 metri, con onda di energia che scorre
          vec2 cell = abs(fract(p / 2.0 + 0.5) - 0.5) * 2.0; // 0 sulla linea
          float grid = max(1.0 - smoothstep(0.0, 0.07, cell.x),
                           1.0 - smoothstep(0.0, 0.07, cell.y));
          float wave = 0.45 + 0.55 * sin(p.x * 0.22 - uTime * 1.6)
                            * sin(p.y * 0.18 + uTime * 0.9);
          grid *= (0.22 + 0.18 * wave) * inside;

          // alone radiale dal centro, respiro lento
          float breath = 0.05 * (0.5 + 0.5 * sin(uTime * 0.8)) * exp(-length(p) * 0.05);

          vec3 col = uBaseColor * (inside > 0.5 ? 1.0 : 0.45);
          col += uGridColor * grid;
          col += uLineColor * lines * 1.7;
          col += uLineColor * breath;

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    const geo = new THREE.PlaneGeometry(w, h);
    const mesh = new THREE.Mesh(geo, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = false;
    this.group.add(mesh);

    // piano d'ombra trasparente sopra il campo olografico
    const shadowMat = new THREE.ShadowMaterial({ opacity: 0.35 });
    const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), shadowMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = 0.01;
    shadowPlane.receiveShadow = true;
    this.group.add(shadowPlane);

    return material;
  }

  // ----------------------------------------------------------- piattaforma
  private buildPlatform(): void {
    const apron = 5;
    const w = FIELD_LENGTH + apron * 2;
    const h = FIELD_WIDTH + apron * 2;

    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(w + 2, 2.4, h + 2),
      new THREE.MeshStandardMaterial({ color: 0x0a1622, roughness: 0.85, metalness: 0.4 }),
    );
    slab.position.y = -1.21;
    this.group.add(slab);

    // strisce luminose lungo i bordi della piattaforma
    const stripMat = new THREE.MeshBasicMaterial({ color: 0x2fd8ff });
    const mkStrip = (sx: number, sz: number, px: number, pz: number) => {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.18, sz), stripMat);
      strip.position.set(px, -0.55, pz);
      this.group.add(strip);
    };
    mkStrip(w + 2.1, 0.25, 0, (h + 2) / 2);
    mkStrip(w + 2.1, 0.25, 0, -(h + 2) / 2);
    mkStrip(0.25, h + 2.1, (w + 2) / 2, 0);
    mkStrip(0.25, h + 2.1, -(w + 2) / 2, 0);

    // piloni di energia sotto la piattaforma (l'arena è sospesa)
    const pylonMat = new THREE.MeshStandardMaterial({
      color: 0x0d2436,
      emissive: 0x1466a0,
      emissiveIntensity: 0.7,
      roughness: 0.6,
      metalness: 0.5,
    });
    for (const [px, pz] of [[-w / 3, -h / 3], [w / 3, -h / 3], [-w / 3, h / 3], [w / 3, h / 3]] as const) {
      const pylon = new THREE.Mesh(new THREE.ConeGeometry(2.2, 9, 6), pylonMat);
      pylon.position.set(px, -7, pz);
      pylon.rotation.x = Math.PI;
      this.group.add(pylon);
    }
  }

  // ------------------------------------------------------------------ muri
  private buildWalls(): void {
    const cyan = new THREE.Color(0x39c8ff);

    const sideN = new EnergyWall(FIELD_LENGTH, WALL_HEIGHT, cyan.clone());
    sideN.mesh.position.set(0, 0, -HALF_WIDTH);
    this.group.add(sideN.mesh);
    this.walls.push({ wall: sideN, axis: 'z', sign: -1 });

    const sideS = new EnergyWall(FIELD_LENGTH, WALL_HEIGHT, cyan.clone());
    sideS.mesh.position.set(0, 0, HALF_WIDTH);
    sideS.mesh.rotation.y = Math.PI;
    this.group.add(sideS.mesh);
    this.walls.push({ wall: sideS, axis: 'z', sign: 1 });

    const mouth = { halfWidth: GOAL_WIDTH / 2, height: GOAL_HEIGHT };
    const endE = new EnergyWall(FIELD_WIDTH, WALL_HEIGHT, cyan.clone(), mouth);
    endE.mesh.position.set(HALF_LENGTH, 0, 0);
    endE.mesh.rotation.y = -Math.PI / 2;
    this.group.add(endE.mesh);
    this.walls.push({ wall: endE, axis: 'x', sign: 1 });

    const endW = new EnergyWall(FIELD_WIDTH, WALL_HEIGHT, cyan.clone(), mouth);
    endW.mesh.position.set(-HALF_LENGTH, 0, 0);
    endW.mesh.rotation.y = Math.PI / 2;
    this.group.add(endW.mesh);
    this.walls.push({ wall: endW, axis: 'x', sign: -1 });
  }

  /** Propaga un impatto della palla al muro giusto, in coordinate locali. */
  registerWallImpact(pos: THREE.Vector3, axis: 'x' | 'z' | 'dome', sign: number, strength: number): void {
    if (axis === 'dome') return;
    for (const entry of this.walls) {
      if (entry.axis !== axis || entry.sign !== sign) continue;
      // coordinata locale lungo il muro
      let localX: number;
      if (axis === 'z') {
        localX = entry.sign === -1 ? pos.x : -pos.x;
      } else {
        localX = entry.sign === 1 ? -pos.z : pos.z;
      }
      entry.wall.addImpact(localX, pos.y, strength);
    }
  }

  // ----------------------------------------------------------------- porte
  private buildGoals(): void {
    const frameColors = [0x49e9ff, 0xff9a3c]; // est: azzurro (GELO), ovest: ambra
    [1, -1].forEach((sign, idx) => {
      const color = frameColors[idx];
      const frameMat = new THREE.MeshStandardMaterial({
        color: 0x12222e,
        emissive: color,
        emissiveIntensity: 1.6,
        roughness: 0.4,
        metalness: 0.6,
      });
      const goal = new THREE.Group();
      goal.position.set(sign * HALF_LENGTH, 0, 0);

      const postGeo = new THREE.CylinderGeometry(0.14, 0.14, GOAL_HEIGHT, 8);
      for (const z of [-GOAL_WIDTH / 2, GOAL_WIDTH / 2]) {
        const post = new THREE.Mesh(postGeo, frameMat);
        post.position.set(0, GOAL_HEIGHT / 2, z);
        post.castShadow = true;
        goal.add(post);
      }
      const barGeo = new THREE.CylinderGeometry(0.14, 0.14, GOAL_WIDTH + 0.28, 8);
      const bar = new THREE.Mesh(barGeo, frameMat);
      bar.rotation.x = Math.PI / 2;
      bar.position.set(0, GOAL_HEIGHT, 0);
      goal.add(bar);

      // rete energetica: scatola semitrasparente dietro la linea
      const netMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.10,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const net = new THREE.Mesh(new THREE.BoxGeometry(GOAL_DEPTH, GOAL_HEIGHT, GOAL_WIDTH), netMat);
      net.position.set(sign * GOAL_DEPTH / 2, GOAL_HEIGHT / 2, 0);
      goal.add(net);
      const netEdges = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(GOAL_DEPTH, GOAL_HEIGHT, GOAL_WIDTH)),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5 }),
      );
      netEdges.position.copy(net.position);
      goal.add(netEdges);

      this.group.add(goal);
    });
  }

  // -------------------------------------------------------------- tribune
  private buildStands(): void {
    // Anelli di tribune sospesi attorno all'arena: per ora silhouette con
    // fasce emissive; il pubblico instanced animato arriva nella milestone 6.
    const standMat = new THREE.MeshStandardMaterial({
      color: 0x0b1826,
      roughness: 0.9,
      metalness: 0.3,
      side: THREE.DoubleSide,
    });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x1d6f9e });

    const rings: { radius: number; y: number; height: number; tilt: number }[] = [
      { radius: 58, y: 6, height: 7, tilt: 0.5 },
      { radius: 72, y: 13, height: 8, tilt: 0.55 },
      { radius: 88, y: 21, height: 9, tilt: 0.6 },
    ];
    for (const r of rings) {
      const geo = new THREE.CylinderGeometry(
        r.radius + r.height * Math.tan(r.tilt),
        r.radius,
        r.height,
        48,
        1,
        true,
      );
      const ring = new THREE.Mesh(geo, standMat);
      ring.position.y = r.y;
      ring.scale.set(1.25, 1, 1); // ellittico, segue la forma del campo
      this.group.add(ring);

      const stripGeo = new THREE.TorusGeometry(r.radius, 0.22, 6, 64);
      const strip = new THREE.Mesh(stripGeo, glowMat);
      strip.rotation.x = Math.PI / 2;
      strip.position.y = r.y - r.height / 2 + 0.2;
      strip.scale.set(1.25, 1, 1);
      this.group.add(strip);
    }
  }

  // ----------------------------------------------------------------- cielo
  private buildSky(): THREE.ShaderMaterial {
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying vec3 vDir;

        float hash(vec3 p) {
          p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
          p *= 17.0;
          return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }

        float noise(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
                mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
            mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
            f.z);
        }

        float fbm(vec3 p) {
          float v = 0.0;
          float a = 0.5;
          for (int i = 0; i < 4; i++) {
            v += a * noise(p);
            p *= 2.1;
            a *= 0.5;
          }
          return v;
        }

        void main() {
          vec3 d = normalize(vDir);

          // fondo spazio profondo con leggero gradiente
          vec3 col = mix(vec3(0.004, 0.008, 0.02), vec3(0.012, 0.02, 0.05), d.y * 0.5 + 0.5);

          // nebulosa: due colori che si intrecciano
          float n1 = fbm(d * 2.4 + vec3(7.0, 0.0, 3.0));
          float n2 = fbm(d * 3.1 + vec3(0.0, 5.0, 9.0) + n1);
          float nebMask = smoothstep(0.45, 0.85, n2) * smoothstep(-0.4, 0.5, d.y + n1 * 0.5);
          col += vec3(0.30, 0.10, 0.45) * nebMask * 0.6;
          col += vec3(0.05, 0.30, 0.38) * smoothstep(0.5, 0.9, n1) * 0.5;

          // stelle su tre scale, con leggero scintillio
          for (int layer = 0; layer < 3; layer++) {
            float scale = 60.0 + float(layer) * 70.0;
            vec3 g = d * scale;
            vec3 id = floor(g);
            float h = hash(id);
            if (h > 0.985) {
              vec3 f = fract(g) - 0.5;
              float starDist = length(f);
              float tw = 0.7 + 0.3 * sin(uTime * (1.0 + h * 4.0) + h * 40.0);
              float star = smoothstep(0.35, 0.0, starDist) * tw;
              col += vec3(0.9, 0.95, 1.0) * star * (0.4 + h);
            }
          }

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 24), material);
    sky.frustumCulled = false;
    this.group.add(sky);
    return material;
  }

  private buildPlanet(): void {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vPos;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying vec3 vNormal;
        varying vec3 vPos;

        float hash1(float n) { return fract(sin(n) * 43758.5453); }

        void main() {
          // bande del gigante ghiacciato
          float lat = vPos.y * 0.018 + 0.15 * sin(vPos.x * 0.01 + uTime * 0.02);
          float band = 0.5 + 0.5 * sin(lat * 9.0);
          vec3 c1 = vec3(0.45, 0.65, 0.85);
          vec3 c2 = vec3(0.20, 0.35, 0.60);
          vec3 col = mix(c1, c2, band);

          // illuminazione finta da una "stella" fissa
          vec3 sun = normalize(vec3(0.6, 0.4, 0.7));
          float light = clamp(dot(vNormal, sun), 0.04, 1.0);
          col *= light;

          // atmosfera sul bordo
          float rim = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.5);
          col += vec3(0.35, 0.6, 0.9) * rim * 0.8;

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const planet = new THREE.Mesh(new THREE.SphereGeometry(150, 48, 32), material);
    planet.position.set(-380, -120, -520);
    this.group.add(planet);
  }

  // ------------------------------------------------------------------ luci
  private buildLights(): void {
    this.group.add(new THREE.AmbientLight(0x223244, 1.2));
    const hemi = new THREE.HemisphereLight(0x3a5a7a, 0x0a1018, 1.0);
    this.group.add(hemi);

    const key = new THREE.DirectionalLight(0xbfe8ff, 2.2);
    key.position.set(20, 40, 18);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -HALF_LENGTH - 6;
    key.shadow.camera.right = HALF_LENGTH + 6;
    key.shadow.camera.top = HALF_WIDTH + 6;
    key.shadow.camera.bottom = -HALF_WIDTH - 6;
    key.shadow.camera.far = 120;
    key.shadow.bias = -0.0005;
    this.group.add(key);

    // riflettori dagli angoli dell'arena
    const spotPositions: [number, number, number][] = [
      [-HALF_LENGTH - 8, 26, -HALF_WIDTH - 8],
      [HALF_LENGTH + 8, 26, -HALF_WIDTH - 8],
      [-HALF_LENGTH - 8, 26, HALF_WIDTH + 8],
      [HALF_LENGTH + 8, 26, HALF_WIDTH + 8],
    ];
    for (const [x, y, z] of spotPositions) {
      const spot = new THREE.SpotLight(0x9fd8ff, 600, 120, Math.PI / 5, 0.5, 1.8);
      spot.position.set(x, y, z);
      spot.target.position.set(x * 0.25, 0, z * 0.25);
      this.group.add(spot);
      this.group.add(spot.target);

      // torre del riflettore (silhouette)
      const tower = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.9, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0x0d1c2a, emissive: 0x14506e, emissiveIntensity: 0.5 }),
      );
      tower.position.set(x, y - 5, z);
      this.group.add(tower);
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(1.0, 12, 8),
        new THREE.MeshBasicMaterial({ color: 0xcfeaff }),
      );
      lamp.position.set(x, y, z);
      this.group.add(lamp);
    }
  }

  update(dt: number, time: number): void {
    this.fieldMaterial.uniforms.uTime.value = time;
    this.skyMaterial.uniforms.uTime.value = time;
    for (const { wall } of this.walls) wall.update(dt, time);
  }
}
