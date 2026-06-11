import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { Arena } from '../arena/Arena';
import { AudioSystem } from '../audio/AudioSystem';
import { CameraDirector, CameraState } from '../camera/CameraDirector';
import { Goalkeeper } from '../ai/Goalkeeper';
import { TeamAI } from '../ai/TeamAI';
import { DIFFICULTIES, type DifficultyName } from '../ai/Difficulty';
import { Player, type PlayerCommand } from '../entities/Player';
import { InputSystem } from '../input/InputSystem';
import { BallControl } from '../match/BallControl';
import { Match } from '../match/Match';
import { Tackles } from '../match/Tackles';
import { Team } from '../match/Team';
import { Ball } from '../physics/Ball';
import { ChargeRing } from '../vfx/ChargeRing';
import { ParticlePool } from '../vfx/ParticlePool';
import { Hud } from '../ui/Hud';
import { Time } from './Time';
import { HALF_LENGTH, PLAYER_RADIUS } from './constants';

/**
 * Cuore del gioco: collega input, fisica, regia, vfx, audio, match e HUD.
 * Milestone 2: squadre complete 7v7 (formazione 2-3-1 + portiere con IA
 * dedicata), passaggi rasoterra/filtranti, contrasti con falli e punizioni
 * semplificate, due tempi con cronometro. L'IA di movimento arriva nella
 * milestone 3: i compagni tengono la posizione di formazione.
 */
export class Game {
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private scene = new THREE.Scene();
  readonly time = new Time();
  private clock = new THREE.Clock();

  private arena = new Arena();
  readonly ball = new Ball();
  readonly teams: Team[];
  readonly players: Player[];
  private activePlayerRef: Player;

  private input: InputSystem;
  private director: CameraDirector;
  readonly ballControl: BallControl;
  readonly match: Match;
  private tackles: Tackles;
  private goalkeepers: Goalkeeper[];
  private teamAIs: TeamAI[];
  difficulty: DifficultyName = 'normale';
  private audio = new AudioSystem();
  private particles = new ParticlePool(768);
  private chargeRing = new ChargeRing();
  private hud: Hud;
  private activeMarker: THREE.Mesh;

  private started = false;
  private opponentFreeKickTimer = 0;

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

    // --- squadre: GELO (giocatore) contro OMBRA ---
    this.teams = [
      new Team(
        {
          name: 'GELO',
          defendsSide: -1,
          color: 0x49e9ff,
          colors: { primary: 0x2a6f9e, secondary: 0x10222e, glow: 0x49e9ff },
          gkColors: { primary: 0x1a4a72, secondary: 0x0c1a26, glow: 0x9af2ff },
          roster: ['Boreas', 'Ilya', 'Vesna', 'Nyra', 'Sorin', 'Mirka', 'Kael'],
        },
        0,
      ),
      new Team(
        {
          name: 'OMBRA',
          defendsSide: 1,
          color: 0xb44aff,
          colors: { primary: 0x4a2a6e, secondary: 0x1a1024, glow: 0xb44aff },
          gkColors: { primary: 0x32184e, secondary: 0x120a1c, glow: 0xd99aff },
          roster: ['Tenebr', 'Nox', 'Lyrr', 'Vesper', 'Crepus', 'Umbra', 'Vrax'],
        },
        1,
      ),
    ];
    this.players = [...this.teams[0].players, ...this.teams[1].players];
    for (const p of this.players) this.scene.add(p.object3d);
    this.activePlayerRef = this.teams[0].fieldPlayers[this.teams[0].fieldPlayers.length - 1];

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
    this.tackles = new Tackles(this.ball, this.ballControl);
    this.match = new Match(this.ball, this.teams);
    this.goalkeepers = this.teams.map(
      (team) => new Goalkeeper(team.goalkeeper, team, this.ball, this.ballControl),
    );
    // IA a due livelli per entrambe le squadre: i compagni dell'umano
    // giocano sempre a livello "normale", l'avversario segue la difficoltà
    this.teamAIs = [
      new TeamAI(
        this.teams[0], this.teams[1], this.ball, this.ballControl, this.tackles,
        () => DIFFICULTIES.normale,
        (p) => p === this.activePlayerRef,
      ),
      new TeamAI(
        this.teams[1], this.teams[0], this.ball, this.ballControl, this.tackles,
        () => DIFFICULTIES[this.difficulty],
        () => false,
      ),
    ];

    // difficoltà al volo con 1/2/3
    window.addEventListener('keydown', (e) => {
      const map: Record<string, DifficultyName> = {
        Digit1: 'facile',
        Digit2: 'normale',
        Digit3: 'difficile',
      };
      const d = map[e.code];
      if (d) this.setDifficulty(d);
    });

    this.hud = new Hud(container, () => {
      this.audio.unlock();
      if (!this.started) {
        this.started = true;
        this.match.restart();
        this.hud.showMessage('SI COMINCIA!', 1.6);
      }
    });
    this.hud.setScore(this.match);
    this.hud.setClock(this.match.half, this.match.clock);

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

    // calci → audio, particelle, regia, chiusura punizione
    this.ballControl.events.onKick = (info) => {
      this.audio.kick(info.power);
      this.match.freeKickTaken();
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

    // passaggi → audio, cambio automatico al ricevitore (mai togliere
    // il controllo a chi sta per ricevere)
    this.ballControl.events.onPass = (info) => {
      this.audio.kick(0.25);
      this.match.freeKickTaken();
      if (info.passer.team === 0 && info.receiver.team === 0 && info.receiver.role === 'campo') {
        this.setActivePlayer(info.receiver);
      }
    };

    // cambio automatico intelligente: quando un compagno conquista palla,
    // il controllo passa a lui
    this.ballControl.events.onPossession = (p) => {
      if (p && p.team === 0 && p.role === 'campo') this.setActivePlayer(p);
    };

    // contrasti → audio e falli
    this.tackles.events.onWin = (tackler) => {
      this.audio.bounce(0.8);
      if (tackler.team === 0) this.setActivePlayer(this.nearestFieldPlayer(this.ball.position, tackler));
    };
    this.tackles.events.onFoul = (offender, victim, spot) => {
      this.match.foul(offender, victim, spot);
    };
    this.match.events.onFoul = () => {
      this.audio.whistle();
      this.hud.showMessage('FALLO!', 1.6);
    };
    this.match.events.onFreeKickReady = (taker) => {
      this.ballControl.givePossession(taker);
      if (taker.team === 0) {
        this.setActivePlayer(taker);
        this.hud.showMessage('PUNIZIONE', 1.2);
        this.opponentFreeKickTimer = 0;
      } else {
        this.opponentFreeKickTimer = 1.6;
      }
    };

    // parate del portiere
    for (const gk of this.goalkeepers) {
      gk.events.onSave = (gkPlayer, caught) => {
        this.audio.whoosh(1);
        if (caught) {
          this.hud.showMessage(`PARATA DI ${gkPlayer.name.toUpperCase()}!`, 1.6);
        } else {
          this.hud.showMessage('RESPINTA!', 1.2);
        }
        this.particles.burst(this.ball.position, {
          count: 18,
          color: this.teams[gkPlayer.team].color,
          speed: 5,
          life: 0.5,
          size: 1.2,
          gravity: 4,
        });
      };
    }

    // salti → whoosh
    for (const p of this.players) {
      p.events.onJump = (_pl, double) => this.audio.whoosh(double ? 1 : 0.6);
    }

    // goal → messaggio, boato, orbita celebrativa, esplosione di particelle
    this.match.events.onGoal = (scoringTeam, ballPos) => {
      const teamName = scoringTeam >= 0 ? this.teams[scoringTeam].name : '';
      this.hud.showMessage(`GOAL! ${teamName}`, 2.8);
      this.hud.setScore(this.match);
      this.audio.whistle();
      this.audio.goalRoar();
      this.director.request(CameraState.Goal, { focus: ballPos });
      const color = scoringTeam >= 0 ? this.teams[scoringTeam].color : 0xffffff;
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
      this.setActivePlayer(this.nearestFieldPlayer(this.ball.position));
    };
    this.match.events.onHalftime = () => {
      this.audio.whistle();
      this.hud.showMessage('INTERVALLO', 2.5);
    };
    this.match.events.onFulltime = () => {
      this.audio.whistle();
      const [a, b] = this.match.score;
      const result =
        a === b
          ? `PAREGGIO ${a}–${b}`
          : a > b
            ? `VITTORIA ${this.teams[0].name} ${a}–${b}`
            : `VITTORIA ${this.teams[1].name} ${b}–${a}`;
      this.hud.showMessage(result, 6);
    };
  }

  get activePlayer(): Player {
    return this.activePlayerRef;
  }

  setDifficulty(d: DifficultyName): void {
    if (this.difficulty === d) return;
    this.difficulty = d;
    this.hud.showMessage(`DIFFICOLTÀ: ${DIFFICULTIES[d].label}`, 1.4);
  }

  private setActivePlayer(p: Player | null): void {
    if (!p || p.team !== 0 || p.role !== 'campo') return;
    this.activePlayerRef = p;
  }

  /** Giocatore di movimento della squadra 0 più vicino a un punto. */
  private nearestFieldPlayer(point: THREE.Vector3, exclude?: Player): Player {
    let best = this.teams[0].fieldPlayers[0];
    let bestDist = Infinity;
    for (const p of this.teams[0].fieldPlayers) {
      if (p === exclude) continue;
      const d = p.position.distanceTo(point);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    return best;
  }

  start(): void {
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private frame(): void {
    const frameDt = this.clock.getDelta();
    const rawDt = Math.min(frameDt, 1 / 30);
    const dt = this.time.update(rawDt);

    const frame = this.input.update();
    const active = this.activePlayer;

    // cambio giocatore manuale: il compagno più vicino alla palla
    if (frame.switchPressed) {
      this.setActivePlayer(this.nearestFieldPlayer(this.ball.position, active));
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

    const phase = this.match.phase;
    const playing = (phase === 'playing' || phase === 'freeKick') && this.started;

    // rivincita a fischio finale
    if (phase === 'fulltime' && (frame.kickPressed || frame.passPressed)) {
      this.match.restart();
      this.hud.setScore(this.match);
      this.hud.showMessage('SI RICOMINCIA!', 1.6);
    }

    // --- azioni contestuali del giocatore attivo ---
    if (playing) {
      const hasBall = this.ballControl.owner === this.activePlayer;
      if (hasBall) {
        if (frame.passPressed) this.ballControl.pass(this.activePlayer, this.moveDir, false);
        else if (frame.lobPressed) this.ballControl.pass(this.activePlayer, this.moveDir, true);
      } else if (phase === 'playing') {
        if (frame.passPressed) this.tackles.standing(this.activePlayer);
        else if (frame.kickPressed) this.tackles.slide(this.activePlayer);
      }
    }

    // punizione dell'avversario: batte da solo dopo una pausa, con
    // fallback garantito (mai lasciare la partita bloccata)
    if (phase === 'freeKick' && this.opponentFreeKickTimer > 0) {
      this.opponentFreeKickTimer -= dt;
      if (this.opponentFreeKickTimer <= 0 && this.match.freeKickTaker) {
        const taker = this.match.freeKickTaker;
        if (this.ballControl.owner !== taker) this.ballControl.givePossession(taker);
        if (!this.ballControl.pass(taker, null, false)) {
          // nessun compagno "davanti": scarico al più vicino in qualunque
          // direzione, o spazzata verso la metà campo avversaria
          const mates = this.teams[taker.team].fieldPlayers
            .filter((p) => p !== taker && p.action === 'normale')
            .sort((a, b) => a.position.distanceTo(taker.position) - b.position.distanceTo(taker.position));
          if (!(mates[0] && this.ballControl.passTo(taker, mates[0], false))) {
            const goalX = -this.teams[taker.team].defendsSide * HALF_LENGTH;
            this.ballControl.shootAt(taker, new THREE.Vector3(goalX, 1, 0), 0.6, 0.15);
          }
        }
      }
    }

    // --- IA di squadra (tattica + individuale) ---
    if (phase === 'playing' && this.started) {
      for (const ai of this.teamAIs) ai.update(dt);
    }

    // --- aggiornamento giocatori ---
    const activeNow = this.activePlayer; // può essere cambiato dalle azioni sopra
    for (let ti = 0; ti < this.teams.length; ti++) {
      for (const p of this.teams[ti].players) {
        if (p.role === 'portiere') continue; // gestiti dai controller
        let cmd: PlayerCommand | null = null;
        if (playing && p === activeNow) {
          cmd = { moveDir: this.moveDir, sprint: frame.sprint, jumpPressed: frame.jumpPressed };
        } else if (phase === 'playing' && this.started) {
          cmd = this.teamAIs[ti].getCommand(p);
        }
        p.update(dt, cmd);
        p.rig.setGlow(p === activeNow ? 2.6 : 1.2);
      }
    }
    for (const gk of this.goalkeepers) gk.update(dt);
    this.resolvePlayerCollisions();

    // possesso, dribbling, tiro, contrasti
    if (playing) {
      this.ballControl.update(dt, activeNow, frame.kickHeld, frame.kickReleased, frame.moveX);
      this.tackles.update(dt);
    }

    // fisica della palla (ferma quando è in presa al portiere)
    if (!this.ballControl.heldBy) {
      this.ball.update(dt / 2);
      this.ball.update(dt / 2);
    } else {
      this.ballControl.pinHeldBall();
    }

    this.match.update(dt);

    // regia
    this.director.update(rawDt, {
      ball: this.ball,
      active: activeNow,
      charging: this.ballControl.charging,
    });

    // vfx
    this.particles.update(dt);
    this.chargeRing.update(
      this.ballControl.visibleCharge,
      this.ballControl.owner ? this.ballControl.owner.position : null,
      this.time.elapsed,
    );
    this.activeMarker.position.set(activeNow.position.x, 0.03, activeNow.position.z);
    const markerMat = this.activeMarker.material as THREE.MeshBasicMaterial;
    markerMat.opacity = 0.4 + 0.2 * Math.sin(this.time.elapsed * 5);

    this.arena.update(dt, this.time.realElapsed);

    // audio e HUD
    this.audio.update(dt);
    this.hud.setStamina(activeNow.stamina / 100);
    this.hud.setClock(this.match.half, this.match.clock);
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
