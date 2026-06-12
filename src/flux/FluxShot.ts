import * as THREE from 'three';
import { FLUX_SAVE_COST, GOAL_WIDTH, GRAVITY, HALF_LENGTH } from '../core/constants';
import type { AudioSystem } from '../audio/AudioSystem';
import type { Ball } from '../physics/Ball';
import type { BallControl } from '../match/BallControl';
import type { CameraDirector } from '../camera/CameraDirector';
import { CameraState } from '../camera/CameraDirector';
import type { Cinematics } from '../ui/Cinematics';
import type { Player } from '../entities/Player';
import type { ParticlePool } from '../vfx/ParticlePool';
import type { Team } from '../match/Team';
import type { Time } from '../core/Time';
import type { FluxProfile } from './FluxProfile';
import type { FluxSystem } from './FluxSystem';

type Phase = 'idle' | 'carica' | 'freeze' | 'volo' | 'clash' | 'chiusura';

export interface FluxShotDeps {
  time: Time;
  director: CameraDirector;
  cinematics: Cinematics;
  particles: ParticlePool;
  ball: Ball;
  ballControl: BallControl;
  audio: AudioSystem;
  teams: Team[];
  fluxSystems: FluxSystem[];
  /** Probabilità di parata Flux del portiere IA (per difficoltà). */
  aiSaveChance: () => number;
  /** Notifica esiti al Game (messaggi HUD, ecc.). */
  onResult: (outcome: 'goal' | 'parata', shooterTeam: number) => void;
  onEnd: () => void;
}

const CHARGE_TIME = 1.4; // durata reale della carica
const FREEZE_TIME = 0.09; // frame-freeze sul momento dell'impatto
const FLIGHT_TIMEOUT = 2.4;

/**
 * Il tiro Flux: la sequenza cinematica del §6, coreografata per energia.
 * Tempo di gioco a 0.08x con letterbox, camera che orbita il tiratore,
 * aura convergente e terreno reattivo; frame-freeze al rilascio; volo a
 * 0.5x con scia volumetrica e difensori spazzati via; parata Flux del
 * portiere come unico modo realistico di fermarlo (QTE per l'umano).
 */
export class FluxShot {
  phase: Phase = 'idle';
  private t = 0;
  private shooter!: Player;
  private shooterTeam = 0;
  private profile!: FluxProfile;
  private goalSign = 1;
  private target = new THREE.Vector3();
  private launchVel = new THREE.Vector3();
  private flightTime = 1;
  private flightElapsed = 0;
  private orbitStart = new THREE.Vector3();
  private groundRing: THREE.Mesh;
  private ringMat: THREE.MeshBasicMaterial;
  private qtePressT: number | null = null;
  private qteShown = false;
  private saveResolved = false;
  private goalHappened = false;

  // scratch
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();

  constructor(private deps: FluxShotDeps) {
    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.groundRing = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 48), this.ringMat);
    this.groundRing.rotation.x = -Math.PI / 2;
    this.groundRing.visible = false;
  }

  get ringMesh(): THREE.Mesh {
    return this.groundRing;
  }

  get active(): boolean {
    return this.phase !== 'idle';
  }

  /** Innesco: barra piena e palla al piede (verificati dal chiamante). */
  start(shooter: Player, team: number, profile: FluxProfile): void {
    const d = this.deps;
    this.shooter = shooter;
    this.shooterTeam = team;
    this.profile = profile;
    this.goalSign = -d.teams[team].defendsSide;
    this.phase = 'carica';
    this.t = 0;
    this.qtePressT = null;
    this.qteShown = false;
    this.saveResolved = false;
    this.goalHappened = false;
    this.startAngleCache = null;

    // bersaglio: un angolo dello specchio, coerente con l'energia
    const cornerZ = (Math.random() < 0.5 ? -1 : 1) * (GOAL_WIDTH / 2 - 0.9);
    const targetY = profile.id === 'gelo' ? 0.7 : profile.id === 'ombra' ? 1.7 : 2.6;
    this.target.set(this.goalSign * HALF_LENGTH, targetY, cornerZ);

    // il tempo crolla, letterbox, banner, rombo
    d.time.setScale(0.08, 0.2);
    d.cinematics.setLetterbox(true);
    d.cinematics.showBanner(profile.shotName, `#${profile.color.toString(16).padStart(6, '0')}`);
    d.audio.fluxRumble(CHARGE_TIME);

    shooter.velocity.set(0, 0, 0);
    shooter.facing = Math.atan2(this.target.x - shooter.position.x, this.target.z - shooter.position.z);
    shooter.playFluxAnim('windup', CHARGE_TIME);

    // anello a terra che cresce
    this.groundRing.visible = true;
    this.groundRing.position.set(shooter.position.x, 0.05, shooter.position.z);
    this.ringMat.color.setHex(profile.id === 'ombra' ? 0x7a30c8 : profile.color);

    this.orbitStart.copy(d.director.camera.position);
    d.director.takeOver(CameraState.FluxShot, (cam, dt) => this.driveCamera(cam, dt));
  }

  /** Da chiamare ogni frame col dt REALE; kickPressed per il QTE. */
  update(realDt: number, scaledDt: number, kickPressed: boolean): void {
    if (this.phase === 'idle') return;
    const d = this.deps;
    this.t += realDt;

    switch (this.phase) {
      case 'carica': {
        // sicurezza: se il tiratore perde palla la sequenza si annulla
        if (d.ballControl.owner !== this.shooter || this.shooter.action !== 'normale') {
          this.abort();
          return;
        }
        const k = Math.min(1, this.t / CHARGE_TIME);
        // aura convergente, sempre più fitta
        if (Math.random() < 0.35 + k * 0.5) {
          d.particles.burst(this.tmpA.copy(this.shooter.position).setY(1.1), {
            count: 4 + Math.floor(k * 5),
            color: Math.random() < 0.6 ? this.profile.color : this.profile.accent,
            speed: 5 + k * 4,
            life: 0.4,
            size: 1.1,
            gravity: 0,
            drag: 0,
            implodeRadius: 2.6,
          });
        }
        // terreno reattivo: cerchio crescente
        const ringScale = 0.6 + k * 5.4;
        this.groundRing.scale.setScalar(ringScale);
        this.ringMat.opacity = 0.25 + k * 0.5;
        this.shooter.rig.setGlow(2 + k * 5);

        if (this.t >= CHARGE_TIME) {
          this.phase = 'freeze';
          this.t = 0;
          d.time.setScale(0.0005, 0.01);
          d.cinematics.doFlash();
          this.shooter.clearFluxAnim();
          this.shooter.playFluxAnim('strike', 0.5);
          d.audio.fluxBlast(false);
        }
        break;
      }
      case 'freeze': {
        if (this.t >= FREEZE_TIME) {
          this.launch();
        }
        break;
      }
      case 'volo': {
        this.flightElapsed += scaledDt;
        this.updateFlight(kickPressed);
        if (this.goalHappened) {
          this.finishFlight('goal');
        } else if (this.t > FLIGHT_TIMEOUT) {
          this.finishFlight(null); // fuori/strano: chiudi senza enfasi
        }
        break;
      }
      case 'clash': {
        if (this.t > 0.55) {
          this.finishFlight('parata');
        }
        break;
      }
      case 'chiusura': {
        if (this.t > 0.45) {
          this.end();
        }
        break;
      }
      default:
        break;
    }
  }

  /** Il Match ha segnato goal durante il volo. */
  notifyGoal(): void {
    if (this.phase === 'volo') this.goalHappened = true;
  }

  /** Annulla la sequenza in corso (reset di fase, test, casi limite). */
  cancel(): void {
    if (this.active) this.abort();
  }

  // ------------------------------------------------------------- interni
  private launch(): void {
    const d = this.deps;
    this.phase = 'volo';
    this.t = 0;
    this.flightElapsed = 0;

    // traiettoria balistica esatta sul bersaglio (velocità per energia)
    const from = d.ball.position;
    const horiz = this.tmpA.copy(this.target).sub(from).setY(0);
    const dist = horiz.length();
    const speed = this.profile.id === 'gelo' ? 38 : this.profile.id === 'ombra' ? 34 : 26;
    this.flightTime = Math.max(0.25, dist / speed);
    const vy = (this.target.y - from.y) / this.flightTime + 0.5 * GRAVITY * this.flightTime;
    horiz.normalize().multiplyScalar(speed);
    this.launchVel.set(horiz.x, vy, horiz.z);

    d.ballControl.releaseOwner(this.shooter);
    d.ball.kick(this.launchVel.clone(), new THREE.Vector3());
    d.ball.setFlux(this.profile.color);
    d.time.setScale(0.5, 0.12);
    d.audio.fluxBlast(true);
    d.particles.burst(from.clone(), {
      count: 50,
      color: this.profile.color,
      direction: this.launchVel.clone().normalize(),
      spread: 0.6,
      speed: 9,
      life: 0.6,
      size: 1.6,
      gravity: 2,
    });
    this.groundRing.visible = false;
    this.shooter.rig.setGlow(2.6);
    setTimeout(() => this.deps.cinematics.hideBanner(), 350);
  }

  private updateFlight(kickPressed: boolean): void {
    const d = this.deps;
    const ball = d.ball;
    const flightK = THREE.MathUtils.clamp(this.flightElapsed / this.flightTime, 0, 1);

    // scia volumetrica per energia
    const dir = this.tmpA.copy(ball.velocity).normalize();
    d.particles.burst(ball.position, {
      count: this.profile.id === 'ruggito' ? 6 : 4,
      color: Math.random() < 0.7 ? this.profile.color : this.profile.accent,
      direction: dir.clone().negate(),
      spread: 0.35,
      speed: 4,
      life: 0.55,
      size: 1.4,
      gravity: 0,
      drag: 1,
    });

    if (this.profile.id === 'gelo') {
      // Zero Assoluto: congela una scia sul terreno
      if (ball.position.y < 3) {
        d.particles.burst(this.tmpB.set(ball.position.x, 0.06, ball.position.z), {
          count: 3, color: 0xd9fbff, speed: 0.6, life: 1.1, size: 1.0, gravity: 0, drag: 2,
        });
      }
    } else if (this.profile.id === 'ombra') {
      // Eclisse: quasi invisibile a metà traiettoria
      const vis = flightK > 0.25 && flightK < 0.75 ? 0.06 : 1;
      ball.setVisibility(vis);
    }

    // difensori sulla traiettoria spazzati via (ragdoll verlet)
    const sweepRadius = this.profile.id === 'ruggito' ? 2.4 : 1.4;
    for (const p of d.teams[1 - this.shooterTeam].fieldPlayers) {
      if (p.action !== 'normale') continue;
      if (p.position.distanceTo(ball.position) < sweepRadius) {
        const away = this.tmpB.copy(p.position).sub(ball.position).setY(0).normalize();
        p.knockdown(new THREE.Vector3(away.x * 10, 5.5, away.z * 10));
        d.particles.burst(p.position.clone().setY(1), {
          count: 14, color: this.profile.color, speed: 5, life: 0.5, size: 1.2, gravity: 5,
        });
      }
    }

    // QTE per la parata Flux quando difende la squadra dell'umano
    const defendingTeam = 1 - this.shooterTeam;
    const gkFlux = d.fluxSystems[defendingTeam];
    const canSave = gkFlux.value >= FLUX_SAVE_COST;
    if (defendingTeam === 0 && canSave) {
      const perfect = this.flightTime * 0.8;
      this.qteShown = true;
      d.cinematics.setQte(THREE.MathUtils.clamp(this.flightElapsed / perfect, 0, 1.25));
      if (kickPressed && this.qtePressT === null) {
        this.qtePressT = this.flightElapsed;
      }
    }

    // risoluzione della parata poco prima della porta
    const distToLine = Math.abs(this.goalSign * HALF_LENGTH - ball.position.x);
    if (!this.saveResolved && distToLine < 3.2) {
      this.saveResolved = true;
      this.resolveSave(canSave, defendingTeam);
    }
  }

  private resolveSave(canSave: boolean, defendingTeam: number): void {
    const d = this.deps;
    if (this.qteShown) d.cinematics.setQte(null);
    if (!canSave) return; // nessuna energia: il tiro passa

    let success: boolean;
    let attempted: boolean;
    if (defendingTeam === 0) {
      // umano: finestra di timing attorno all'80% del volo
      const perfect = this.flightTime * 0.8;
      attempted = this.qtePressT !== null;
      success = attempted && Math.abs(this.qtePressT! - perfect) < this.flightTime * 0.16;
    } else {
      attempted = true;
      success = Math.random() < d.aiSaveChance();
    }
    if (!attempted) return;

    d.fluxSystems[defendingTeam].spend(FLUX_SAVE_COST);
    if (!success) return; // tentata e fallita: goal in arrivo

    // PARATA FLUX: clash di energie sul guantone
    const gk = d.teams[defendingTeam].goalkeeper;
    const ball = d.ball;
    // il portiere vola sull'intercetto
    const dive = this.tmpA.copy(ball.position).sub(gk.position);
    dive.x = 0;
    const tNeed = 0.18;
    gk.startDive(new THREE.Vector3(0, Math.max(2, dive.y / tNeed * 0.4 + 3), dive.z / tNeed * 0.25), 0.7);
    // palla respinta con knockback
    const back = this.tmpB.copy(ball.velocity).normalize();
    ball.velocity.set(-back.x * 13, 7, -back.z * 6 + (Math.random() - 0.5) * 6);
    ball.setFlux(null);
    ball.setVisibility(1);
    gk.velocity.x += this.goalSign * 5; // contraccolpo verso la rete
    d.audio.fluxClash();
    d.cinematics.doFlash();
    d.time.setScale(0.12, 0.05);
    d.particles.burst(ball.position.clone(), {
      count: 70,
      color: this.profile.color,
      speed: 10,
      life: 0.8,
      size: 1.7,
      gravity: 4,
    });
    d.particles.burst(ball.position.clone(), {
      count: 40,
      color: d.fluxSystems[defendingTeam].profile.color,
      speed: 8,
      life: 0.7,
      size: 1.5,
      gravity: 3,
    });
    this.phase = 'clash';
    this.t = 0;
  }

  private finishFlight(outcome: 'goal' | 'parata' | null): void {
    const d = this.deps;
    if (this.qteShown) d.cinematics.setQte(null);
    d.ball.setFlux(null);
    d.ball.setVisibility(1);
    if (outcome) d.onResult(outcome, this.shooterTeam);
    // il tempo torna a 1x in 0.4s, rientro a taglio netto
    d.time.setScale(1, 0.4);
    this.phase = 'chiusura';
    this.t = 0;
  }

  private abort(): void {
    const d = this.deps;
    d.time.setScale(1, 0.25);
    d.cinematics.setLetterbox(false);
    d.cinematics.hideBanner();
    d.cinematics.setQte(null);
    this.groundRing.visible = false;
    this.shooter.clearFluxAnim();
    this.shooter.rig.setGlow(2.6);
    d.director.releaseOverride(true);
    this.phase = 'idle';
    d.onEnd();
  }

  private end(): void {
    const d = this.deps;
    d.cinematics.setLetterbox(false);
    d.cinematics.hideBanner();
    this.groundRing.visible = false;
    this.shooter.clearFluxAnim();
    d.director.releaseOverride(true);
    this.phase = 'idle';
    d.onEnd();
  }

  // ----------------------------------------------------- regia della camera
  private driveCamera(cam: THREE.PerspectiveCamera, dt: number): void {
    const d = this.deps;
    const sPos = this.shooter.position;

    if (this.phase === 'carica' || this.phase === 'freeze') {
      const k = this.phase === 'freeze' ? 1 : Math.min(1, this.t / CHARGE_TIME);
      // ogni energia ha la sua orbita: GELO bassa antioraria, OMBRA alta
      // oraria, RUGGITO larga con tremore
      let h: number;
      let r: number;
      let dirSign: number;
      let fovEnd: number;
      if (this.profile.id === 'gelo') {
        h = THREE.MathUtils.lerp(1.3, 2.0, k); r = THREE.MathUtils.lerp(8, 4.4, k); dirSign = 1; fovEnd = 38;
      } else if (this.profile.id === 'ombra') {
        h = THREE.MathUtils.lerp(4.6, 2.4, k); r = THREE.MathUtils.lerp(9, 5, k); dirSign = -1; fovEnd = 42;
      } else {
        h = THREE.MathUtils.lerp(2.4, 3.4, k); r = THREE.MathUtils.lerp(10, 5.6, k); dirSign = 1; fovEnd = 45;
      }
      const angle = this.startAngle(k) + dirSign * k * THREE.MathUtils.degToRad(110);
      cam.position.set(sPos.x + Math.sin(angle) * r, h, sPos.z + Math.cos(angle) * r);
      if (this.profile.id === 'ruggito') {
        cam.position.x += (Math.random() - 0.5) * 0.12 * k;
        cam.position.y += (Math.random() - 0.5) * 0.12 * k;
      }
      cam.fov = THREE.MathUtils.damp(cam.fov, fovEnd, 3.5, dt);
      cam.updateProjectionMatrix();
      cam.lookAt(sPos.x, 1.2, sPos.z);
      return;
    }

    // volo: inseguimento della palla da dietro-lato, per energia
    const ball = d.ball.position;
    const dir = this.tmpA.copy(d.ball.velocity).setY(0).normalize();
    const side = this.tmpB.set(dir.z, 0, -dir.x);
    if (this.profile.id === 'ombra') {
      cam.position.set(
        ball.x - dir.x * 5 + side.x * 0.8,
        ball.y + 3.4,
        ball.z - dir.z * 5 + side.z * 0.8,
      );
    } else if (this.profile.id === 'ruggito') {
      cam.position.set(
        ball.x - dir.x * 7 + side.x * 2.6,
        Math.max(1.1, ball.y - 0.6),
        ball.z - dir.z * 7 + side.z * 2.6,
      );
    } else {
      cam.position.set(
        ball.x - dir.x * 6 + side.x * 2.2,
        Math.max(1.4, ball.y + 1.6),
        ball.z - dir.z * 6 + side.z * 2.2,
      );
    }
    cam.fov = THREE.MathUtils.damp(cam.fov, 60, 4, dt);
    cam.updateProjectionMatrix();
    cam.lookAt(ball.x + dir.x * 3, ball.y, ball.z + dir.z * 3);
  }

  private startAngleCache: number | null = null;
  private startAngle(k: number): number {
    if (this.startAngleCache === null || k === 0) {
      this.startAngleCache = Math.atan2(
        this.orbitStart.x - this.shooter.position.x,
        this.orbitStart.z - this.shooter.position.z,
      );
    }
    return this.startAngleCache;
  }
}
