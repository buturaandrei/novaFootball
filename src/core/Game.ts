import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { Arena } from '../arena/Arena';
import { AudioSystem } from '../audio/AudioSystem';
import { CameraDirector, CameraState } from '../camera/CameraDirector';
import { Player } from '../entities/Player';
import { InputSystem } from '../input/InputSystem';
import { BallControl } from '../match/BallControl';
import { Match } from '../match/Match';
import { Ball } from '../physics/Ball';
import { ChargeRing } from '../vfx/ChargeRing';
import { ParticlePool } from '../vfx/ParticlePool';
import { Hud } from '../ui/Hud';
import { Time } from './Time';
import { PLAYER_RADIUS } from './constants';

/**
 * Cuore del gioco: collega input, fisica, regia, vfx, audio, match e HUD.
 * Milestone 1: arena, movimento, palla fisica, 1v1 senza IA
 * (Q/Tab passa il controllo da un giocatore all'altro per testare entrambi).
 */
export class Game {
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private scene = new THREE.Scene();
  private time = new Time();
  private clock = new THREE.Clock();

  private arena = new Arena();
  readonly ball = new Ball();
  readonly players: Player[];
  private activeIndex = 0;

  private input: InputSystem;
  private director: CameraDirector;
  private ballControl: BallControl;
  readonly match: Match;
  private audio = new AudioSystem();
  private particles = new ParticlePool(768);
  private chargeRing = new ChargeRing();
  private hud: Hud;
  private activeMarker: THREE.Mesh;

  private started = false;

  // scratch
  private camForward = new THREE.Vector3();
  private camRight = new THREE.Vector3();
  private moveDir = new THREE.Vector3();

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.director = new CameraDirector(window.innerWidth / window.innerHeight);

    // post-processing: bloom per il look olografico
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.director.camera));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.5,  // intensità
      0.5,  // raggio
      0.85, // soglia
    );
    this.composer.addPass(bloom);
    this.composer.addPass(new OutputPass());

    // --- scena ---
    this.scene.add(this.arena.group);
    this.scene.add(this.ball.mesh);
    this.scene.add(this.particles.points);
    this.scene.add(this.chargeRing.mesh);

    // --- giocatori: 1v1, GELO (azzurro) contro OMBRA (viola) ---
    const p1 = new Player('Kael', 0, { primary: 0x2a6f9e, secondary: 0x10222e, glow: 0x49e9ff });
    const p2 = new Player('Vrax', 1, { primary: 0x4a2a6e, secondary: 0x1a1024, glow: 0xb44aff });
    this.players = [p1, p2];
    for (const p of this.players) this.scene.add(p.object3d);

    // marcatore del giocatore attivo
    this.activeMarker = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.66, 32),
      new THREE.MeshBasicMaterial({
        color: 0x49e9ff,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.activeMarker.rotation.x = -Math.PI / 2;
    this.scene.add(this.activeMarker);

    // --- sistemi di gioco ---
    this.input = new InputSystem(container);
    this.ballControl = new BallControl(this.ball, this.players);
    this.match = new Match(this.ball, this.players, [
      { name: 'GELO', defendsSide: -1, color: 0x49e9ff },
      { name: 'OMBRA', defendsSide: 1, color: 0xb44aff },
    ]);

    this.hud = new Hud(container, () => {
      this.audio.unlock();
      if (!this.started) {
        this.started = true;
        this.match.kickoff();
        this.hud.showMessage('SI COMINCIA!', 1.6);
      }
    });
    this.hud.setScore(this.match);

    this.wireEvents();
    this.match.kickoff();

    window.addEventListener('resize', () => this.onResize());
  }

  private wireEvents(): void {
    // impatti della palla → onde sui muri, particelle, audio
    this.ball.events.onWallImpact = (pos, axis, sign, speed) => {
      const strength = Math.min(1.5, speed / 18);
      this.arena.registerWallImpact(pos, axis, sign, strength);
      this.audio.wallHit(Math.min(1, speed / 22));
      const normal = axis === 'dome'
        ? new THREE.Vector3(0, -1, 0)
        : axis === 'x'
          ? new THREE.Vector3(-sign, 0.3, 0)
          : new THREE.Vector3(0, 0.3, -sign);
      this.particles.burst(pos, {
        count: Math.floor(8 + strength * 20),
        color: 0x55d8ff,
        direction: normal.normalize(),
        spread: 0.8,
        speed: 4 + speed * 0.25,
        life: 0.5,
        size: 1.2,
        gravity: 3,
      });
    };
    this.ball.events.onGroundBounce = (_pos, speed) => {
      this.audio.bounce(Math.min(1, speed / 14));
    };

    // calci → audio, particelle, regia
    this.ballControl.events.onKick = (info) => {
      this.audio.kick(info.power);
      if (info.level >= 2) {
        this.particles.burst(this.ball.position, {
          count: 10 + info.level * 8,
          color: info.level === 3 ? 0xff5ad6 : 0xffe14a,
          direction: info.velocity.clone().normalize(),
          spread: 0.5,
          speed: 5,
          life: 0.4,
          size: 1.1,
          gravity: 2,
        });
      }
      if (info.level === 3) {
        this.director.request(CameraState.Shot);
      }
    };

    // salti → whoosh
    for (const p of this.players) {
      p.events.onJump = (_pl, double) => this.audio.whoosh(double ? 1 : 0.6);
    }

    // goal → messaggio, boato, orbita celebrativa, esplosione di particelle
    this.match.events.onGoal = (scoringTeam, ballPos) => {
      const teamName = scoringTeam >= 0 ? this.match.teams[scoringTeam].name : '';
      this.hud.showMessage(`GOAL! ${teamName}`, 2.8);
      this.hud.setScore(this.match);
      this.audio.whistle();
      this.audio.goalRoar();
      this.director.request(CameraState.Goal, { focus: ballPos });
      const color = scoringTeam >= 0 ? this.match.teams[scoringTeam].color : 0xffffff;
      this.particles.burst(ballPos.clone().setY(Math.max(1, ballPos.y)), {
        count: 120,
        color,
        speed: 11,
        life: 1.1,
        size: 1.6,
        gravity: 7,
      });
    };
    this.match.events.onKickoff = () => {
      this.director.request(CameraState.OpenPlay, { cut: true });
    };
  }

  get activePlayer(): Player {
    return this.players[this.activeIndex];
  }

  start(): void {
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private frame(): void {
    const frameDt = this.clock.getDelta();
    const rawDt = Math.min(frameDt, 1 / 30);
    const dt = this.time.update(rawDt);

    const frame = this.input.update();

    // cambio giocatore manuale (in milestone 3 arriverà anche quello automatico)
    if (frame.switchPressed) {
      this.activeIndex = (this.activeIndex + 1) % this.players.length;
      const color = this.match.teams[this.activePlayer.team].color;
      (this.activeMarker.material as THREE.MeshBasicMaterial).color.setHex(color);
    }

    // input camera-relative
    this.director.camera.getWorldDirection(this.camForward);
    this.camForward.y = 0;
    if (this.camForward.lengthSq() < 1e-6) this.camForward.set(0, 0, -1);
    this.camForward.normalize();
    this.camRight.crossVectors(this.camForward, new THREE.Vector3(0, 1, 0));
    this.moveDir
      .set(0, 0, 0)
      .addScaledVector(this.camRight, frame.moveX)
      .addScaledVector(this.camForward, frame.moveY);

    const playing = this.match.phase === 'playing' && this.started;

    // aggiorna giocatori (il non attivo resta fermo: 1v1 senza IA)
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      const cmd = playing && i === this.activeIndex
        ? { moveDir: this.moveDir, sprint: frame.sprint, jumpPressed: frame.jumpPressed }
        : null;
      p.update(dt, cmd);
      p.rig.setGlow(i === this.activeIndex ? 2.6 : 1.2);
    }
    this.resolvePlayerCollisions();

    // possesso, dribbling, tiro
    if (playing) {
      this.ballControl.update(dt, this.activePlayer, frame.kickHeld, frame.kickReleased, frame.moveX);
    }

    // fisica della palla in 2 sottopassi per stabilità sui tiri veloci
    this.ball.update(dt / 2);
    this.ball.update(dt / 2);

    this.match.update(dt);

    // regia
    this.director.update(rawDt, {
      ball: this.ball,
      active: this.activePlayer,
      charging: this.ballControl.charging,
    });

    // vfx
    this.particles.update(dt);
    this.chargeRing.update(
      this.ballControl.visibleCharge,
      this.ballControl.owner ? this.ballControl.owner.position : null,
      this.time.elapsed,
    );
    this.activeMarker.position.set(this.activePlayer.position.x, 0.03, this.activePlayer.position.z);
    const markerMat = this.activeMarker.material as THREE.MeshBasicMaterial;
    markerMat.opacity = 0.4 + 0.2 * Math.sin(this.time.elapsed * 5);

    this.arena.update(dt, this.time.realElapsed);

    // audio e HUD
    this.audio.update(dt);
    this.hud.setStamina(this.activePlayer.stamina / 100);
    this.hud.update(rawDt);
    this.hud.tickFps(frameDt);

    this.composer.render();
  }

  /** Separazione orizzontale semplice tra i giocatori. */
  private resolvePlayerCollisions(): void {
    for (let i = 0; i < this.players.length; i++) {
      for (let j = i + 1; j < this.players.length; j++) {
        const a = this.players[i];
        const b = this.players[j];
        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const dy = Math.abs(b.position.y - a.position.y);
        if (dy > 1.6) continue;
        const dist = Math.hypot(dx, dz);
        const minDist = PLAYER_RADIUS * 2;
        if (dist < minDist && dist > 1e-5) {
          const push = (minDist - dist) / 2;
          const nx = dx / dist;
          const nz = dz / dist;
          a.position.x -= nx * push;
          a.position.z -= nz * push;
          b.position.x += nx * push;
          b.position.z += nz * push;
        }
      }
    }
  }

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.director.setAspect(w / h);
  }
}
