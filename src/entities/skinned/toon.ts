import * as THREE from 'three';

/** Ramp a 3 bande per il cel-shading (MeshToonMaterial.gradientMap). */
export function makeToonGradient(): THREE.DataTexture {
  // banda scura comunque leggibile, come nei cartoon (mai nero pieno)
  const data = new Uint8Array([118, 118, 118, 255, 190, 190, 190, 255, 255, 255, 255, 255]);
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Materiale per l'outline "inverted hull" compatibile con lo skinning:
 * seconda mesh con normali estruse, facce interne, colore scuro.
 */
export function makeOutlineMaterial(thickness = 0.02): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uOutline: { value: thickness },
      uColor: { value: new THREE.Color(0x040a14) },
    },
    vertexShader: /* glsl */ `
      #include <common>
      #include <skinning_pars_vertex>
      uniform float uOutline;
      void main() {
        #include <skinbase_vertex>
        #include <beginnormal_vertex>
        #include <skinnormal_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        transformed += normalize(objectNormal) * uOutline;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      void main() {
        gl_FragColor = vec4(uColor, 1.0);
      }
    `,
    side: THREE.BackSide,
  });
}
