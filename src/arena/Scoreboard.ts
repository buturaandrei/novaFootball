import * as THREE from 'three';

/**
 * Tabellone olografico fluttuante sopra il centrocampo: punteggio e tempo
 * disegnati su una CanvasTexture (procedurale), doppia faccia, con cornice
 * luminosa e lenta rotazione.
 */
export class Scoreboard {
  readonly group = new THREE.Group();
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;
  private lastText = '';

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 768;
    this.canvas.height = 160;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;

    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 3.4),
      new THREE.MeshBasicMaterial({
        map: this.texture,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.group.add(panel);

    const frame = new THREE.Mesh(
      new THREE.PlaneGeometry(16.6, 4.0),
      new THREE.MeshBasicMaterial({
        color: 0x1a6f9e,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    frame.position.z = -0.02;
    this.group.add(frame);

    // pilone di sostegno olografico
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 8, 6),
      new THREE.MeshBasicMaterial({
        color: 0x2fb8e8,
        transparent: true,
        opacity: 0.25,
        blending: THREE.AdditiveBlending,
      }),
    );
    beam.position.y = -5.5;
    this.group.add(beam);

    this.group.position.set(0, 21, 0);
    this.setText('NOVA FOOTBALL');
  }

  setText(text: string): void {
    if (text === this.lastText) return;
    this.lastText = text;
    const c = this.ctx;
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.fillStyle = 'rgba(4, 18, 32, 0.55)';
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    c.font = '900 72px "Segoe UI", Arial, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.shadowColor = '#46e8ff';
    c.shadowBlur = 26;
    c.fillStyle = '#dffaff';
    c.fillText(text, this.canvas.width / 2, this.canvas.height / 2 + 4);
    this.texture.needsUpdate = true;
  }

  update(time: number): void {
    this.group.rotation.y = Math.sin(time * 0.12) * 0.5;
    this.group.position.y = 21 + Math.sin(time * 0.5) * 0.3;
  }
}
