import * as THREE from 'three';

export interface RigColors {
  primary: number;   // colore divisa
  secondary: number; // dettagli
  glow: number;      // emissivo (identità Flux della squadra)
}

/**
 * Modello low-poly procedurale del giocatore: capsule e giunti animabili
 * via codice. Rig minimo: busto, testa con visiera, braccia e gambe con
 * pivot a spalla/anca, dettagli emissivi a tema squadra.
 */
export class PlayerRig {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private armL: THREE.Group;
  private armR: THREE.Group;
  private legL: THREE.Group;
  private legR: THREE.Group;
  private torso: THREE.Mesh;
  private runPhase = Math.random() * Math.PI * 2;
  private glowMaterial: THREE.MeshStandardMaterial;

  constructor(colors: RigColors) {
    const suitMat = new THREE.MeshStandardMaterial({
      color: colors.primary,
      roughness: 0.55,
      metalness: 0.25,
      flatShading: true,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: colors.secondary,
      roughness: 0.7,
      metalness: 0.3,
      flatShading: true,
    });
    this.glowMaterial = new THREE.MeshStandardMaterial({
      color: 0x101820,
      emissive: colors.glow,
      emissiveIntensity: 1.8,
      roughness: 0.4,
    });

    this.root.add(this.body);

    // busto
    this.torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 0.42, 3, 8), suitMat);
    this.torso.position.y = 1.06;
    this.torso.castShadow = true;
    this.body.add(this.torso);

    // fascia luminosa sul petto
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.18), this.glowMaterial);
    chest.position.set(0, 1.22, 0.18);
    this.body.add(chest);

    // testa + visiera
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.185, 10, 8), darkMat);
    head.position.y = 1.66;
    head.castShadow = true;
    this.body.add(head);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.1), this.glowMaterial);
    visor.position.set(0, 1.67, 0.15);
    this.body.add(visor);

    // spallacci
    for (const side of [-1, 1]) {
      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), darkMat);
      pad.position.set(side * 0.34, 1.38, 0);
      this.body.add(pad);
    }

    // braccia (pivot alla spalla)
    const mkArm = (side: number): THREE.Group => {
      const g = new THREE.Group();
      g.position.set(side * 0.36, 1.34, 0);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.46, 2, 6), suitMat);
      arm.position.y = -0.3;
      arm.castShadow = true;
      g.add(arm);
      const glove = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), this.glowMaterial);
      glove.position.y = -0.62;
      g.add(glove);
      this.body.add(g);
      return g;
    };
    this.armL = mkArm(-1);
    this.armR = mkArm(1);

    // gambe (pivot all'anca)
    const mkLeg = (side: number): THREE.Group => {
      const g = new THREE.Group();
      g.position.set(side * 0.15, 0.82, 0);
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.52, 2, 6), darkMat);
      leg.position.y = -0.36;
      leg.castShadow = true;
      g.add(leg);
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.3), this.glowMaterial);
      boot.position.set(0, -0.68, 0.06);
      g.add(boot);
      this.body.add(g);
      return g;
    };
    this.legL = mkLeg(-1);
    this.legR = mkLeg(1);
  }

  /** Intensità dell'emissivo (per evidenziare il giocatore attivo o le aure Flux). */
  setGlow(intensity: number): void {
    this.glowMaterial.emissiveIntensity = intensity;
  }

  /**
   * Animazione procedurale: corsa con oscillazione di gambe/braccia
   * proporzionale alla velocità, posa raccolta in aria, idle con respiro.
   */
  animate(dt: number, speed: number, maxSpeed: number, onGround: boolean, verticalVel: number, kickCharge: number): void {
    const speedRatio = Math.min(1, speed / maxSpeed);

    if (onGround) {
      this.runPhase += dt * (4 + speed * 1.6);
      const swing = speedRatio * 0.9;
      const s = Math.sin(this.runPhase);
      this.legL.rotation.x = s * swing;
      this.legR.rotation.x = -s * swing;
      this.armL.rotation.x = -s * swing * 0.8;
      this.armR.rotation.x = s * swing * 0.8;
      this.armL.rotation.z = 0.12;
      this.armR.rotation.z = -0.12;
      // inclinazione in avanti durante la corsa + respiro da fermo
      this.body.rotation.x = speedRatio * 0.18;
      this.body.position.y = Math.abs(Math.sin(this.runPhase)) * 0.05 * speedRatio
        + (speedRatio < 0.05 ? Math.sin(this.runPhase * 0.4) * 0.012 : 0);
    } else {
      // posa aerea: gambe raccolte, braccia aperte; in caduta le gambe si distendono
      const rising = verticalVel > 0;
      const target = rising ? 1.0 : 0.45;
      this.legL.rotation.x = THREE.MathUtils.damp(this.legL.rotation.x, target * 0.9, 10, dt);
      this.legR.rotation.x = THREE.MathUtils.damp(this.legR.rotation.x, target * 0.5, 10, dt);
      this.armL.rotation.z = THREE.MathUtils.damp(this.armL.rotation.z, 1.1, 10, dt);
      this.armR.rotation.z = THREE.MathUtils.damp(this.armR.rotation.z, -1.1, 10, dt);
      this.body.rotation.x = THREE.MathUtils.damp(this.body.rotation.x, rising ? -0.12 : 0.1, 8, dt);
      this.body.position.y = 0;
    }

    // carica del tiro: il corpo si torce e la gamba destra arretra
    if (kickCharge > 0) {
      const c = Math.min(1, kickCharge);
      this.body.rotation.y = THREE.MathUtils.damp(this.body.rotation.y, -0.5 * c, 12, dt);
      this.legR.rotation.x = -1.0 * c;
      this.armR.rotation.x = 0.7 * c;
    } else {
      this.body.rotation.y = THREE.MathUtils.damp(this.body.rotation.y, 0, 12, dt);
    }
  }

  /** Scatto della gamba al momento del calcio. */
  kickPose(): void {
    this.legR.rotation.x = 1.3;
    this.armL.rotation.x = 0.8;
  }

  /** Scivolata: corpo disteso all'indietro, gamba tesa in avanti. */
  slidePose(dt: number): void {
    this.body.rotation.x = THREE.MathUtils.damp(this.body.rotation.x, -1.15, 18, dt);
    this.body.position.y = THREE.MathUtils.damp(this.body.position.y, -0.52, 18, dt);
    this.legL.rotation.x = THREE.MathUtils.damp(this.legL.rotation.x, 1.5, 18, dt);
    this.legR.rotation.x = THREE.MathUtils.damp(this.legR.rotation.x, 1.1, 18, dt);
    this.armL.rotation.x = -0.6;
    this.armR.rotation.x = -0.9;
  }

  /** Tuffo del portiere: corpo ruotato di lato, braccia tese verso la palla. */
  divePose(side: number, dt: number): void {
    this.body.rotation.z = THREE.MathUtils.damp(this.body.rotation.z, side * 1.25, 14, dt);
    this.body.rotation.x = THREE.MathUtils.damp(this.body.rotation.x, -0.2, 14, dt);
    const reach = side >= 0 ? this.armL : this.armR;
    const other = side >= 0 ? this.armR : this.armL;
    reach.rotation.z = THREE.MathUtils.damp(reach.rotation.z, side * 2.7, 16, dt);
    other.rotation.z = THREE.MathUtils.damp(other.rotation.z, side * 1.6, 16, dt);
    this.legL.rotation.x = 0.4;
    this.legR.rotation.x = -0.3;
  }

  /** Stordito dopo un fallo subito: barcolla. */
  stunPose(time: number): void {
    this.body.rotation.x = 0.25 + Math.sin(time * 14) * 0.08;
    this.body.rotation.z = Math.sin(time * 9) * 0.12;
    this.armL.rotation.z = 0.5;
    this.armR.rotation.z = -0.5;
  }

  /** Ritorno graduale alla posa neutra (rialzata). */
  recoverPose(dt: number): void {
    this.body.rotation.x = THREE.MathUtils.damp(this.body.rotation.x, 0, 10, dt);
    this.body.rotation.z = THREE.MathUtils.damp(this.body.rotation.z, 0, 10, dt);
    this.body.position.y = THREE.MathUtils.damp(this.body.position.y, 0, 10, dt);
    for (const g of [this.armL, this.armR, this.legL, this.legR]) {
      g.rotation.x = THREE.MathUtils.damp(g.rotation.x, 0, 10, dt);
      g.rotation.z = THREE.MathUtils.damp(g.rotation.z, 0, 10, dt);
    }
  }

  // ------------------------------------------------- coreografie Flux
  /** Piroetta del Passo di Brina (GELO): giro completo, braccia aperte. */
  fluxSpinPose(t01: number): void {
    this.body.rotation.y = t01 * Math.PI * 2;
    this.body.rotation.x = -0.15;
    this.body.position.y = Math.sin(t01 * Math.PI) * 0.18;
    this.armL.rotation.z = 1.6;
    this.armR.rotation.z = -1.6;
    this.armL.rotation.x = 0;
    this.armR.rotation.x = 0;
    this.legL.rotation.x = -0.25;
    this.legR.rotation.x = 0.5;
  }

  /** Spallata della Zampata (RUGGITO): corpo rollato sulla spalla. */
  fluxChargePose(t01: number): void {
    const k = Math.sin(Math.min(1, t01) * Math.PI);
    this.body.rotation.z = -0.55 * k;
    this.body.rotation.x = 0.45 * k;
    this.armR.rotation.x = -1.4 * k;
    this.armR.rotation.z = -0.5 * k;
    this.armL.rotation.x = 1.0 * k;
    this.legL.rotation.x = -0.6 * k;
    this.legR.rotation.x = 0.8 * k;
  }

  /** Raccolta dell'energia prima del tiro Flux: corpo raccolto, braccia che convergono. */
  fluxWindupPose(t01: number, dt: number): void {
    const k = Math.min(1, t01);
    this.body.rotation.x = THREE.MathUtils.damp(this.body.rotation.x, 0.25 * k, 10, dt);
    this.body.position.y = THREE.MathUtils.damp(this.body.position.y, -0.22 * k, 10, dt);
    this.armL.rotation.x = -2.4 * k;
    this.armR.rotation.x = -2.4 * k;
    this.armL.rotation.z = 0.5 * k;
    this.armR.rotation.z = -0.5 * k;
    this.legL.rotation.x = 0.35 * k;
    this.legR.rotation.x = -0.5 * k;
    // tremito crescente dell'energia
    this.body.rotation.z = Math.sin(t01 * 50) * 0.035 * k;
  }

  /** Posa del rilascio: corpo torto, gamba tesa nel calcio. */
  fluxStrikePose(): void {
    this.body.rotation.y = -0.7;
    this.body.rotation.x = -0.25;
    this.body.position.y = 0.05;
    this.legR.rotation.x = 1.7;
    this.legL.rotation.x = -0.5;
    this.armL.rotation.x = -1.2;
    this.armL.rotation.z = 0.9;
    this.armR.rotation.x = 0.9;
    this.armR.rotation.z = -0.6;
  }
}
