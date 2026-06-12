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
import { buildTeamConfig } from '../match/teamConfigs';
import { FLUX_PROFILES, type FluxProfileId } from '../flux/FluxProfile';
import { FluxMoves } from '../flux/FluxMoves';
import { FluxShot } from '../flux/FluxShot';
import { FluxSystem } from '../flux/FluxSystem';
import { Recorder } from '../replay/Recorder';
import { ReplayDirector } from '../replay/ReplayDirector';
import { Cinematics } from '../ui/Cinematics';
import { AfterImages } from '../vfx/AfterImages';
import { ChargeRing } from '../vfx/ChargeRing';
import { ParticlePool } from '../vfx/ParticlePool';
import { Hud } from '../ui/Hud';
import { Time } from './Time';
import {
  FLUX_DRIBBLE_COST,
  FLUX_SHOT_COST,
  FLUX_SPRINT_COST,
  HALF_LENGTH,
  PLAYER_RADIUS,
} from './constants';

export interface GameConfig {
  player: FluxProfileId;
  opponent: FluxProfileId;
  difficulty: DifficultyName;
  /** Partita automatica IA contro IA (bilanciamento / modalità vetrina). */
  demo?: boolean;
}

/**
 * Cuore del gioco: collega input, fisica, regia, vfx, audio, match e HUD.
 * Le squadre e la difficoltà arrivano dal menu di selezione; la modalità
 * demo fa giocare l'IA anche per la squadra del giocatore.
 */
export class Game {
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private scene = new THREE.Scene();
  readonly time = new Time();
  private clock = new THREE.Clock();

  private arena: Arena;
  readonly ball = new Ball();
  readonly teams: Team[];
  readonly demo: boolean;
  /** Contatori per il bilanciamento (mosse e tiri Flux per squadra). */
  readonly stats = { fluxUses: [0, 0], fluxShots: [0, 0] };
  private paused = false;
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
  readonly fluxSystems: FluxSystem[];
  private fluxMoves: FluxMoves;
  readonly fluxShot: FluxShot;
  private cinematics: Cinematics;
  private recorder: Recorder;
  private replayDirector: ReplayDirector;
  private replayRunning = false;
  private goalSide = 1;
  private afterImages = new AfterImages(16);
  private lastPassReceiver: Player | null = null;
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

  constructor(container: HTMLElement, config: GameConfig) {
    this.demo = !!config.demo;
    this.difficulty = config.difficulty;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.director = new CameraDirector(window.innerWidth / window.innerHeight);
    // visuale preferita salvata (default: terza persona "azione")
    const savedView = window.localStorage?.getItem('nova-visuale');
    if (savedView === 'telecronaca' || savedView === 'azione') {
      this.director.viewMode = savedView;
    }

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

    // --- squadre dal menu di selezione ---
    this.teams = [
      new Team(buildTeamConfig(config.player, -1), 0),
      new Team(buildTeamConfig(config.opponent, 1), 1),
    ];

    // --- scena ---
    this.arena = new Arena([this.teams[0].color, this.teams[1].color]);
    this.scene.add(this.arena.group);
    this.scene.add(this.ball.mesh);
    this.scene.add(this.particles.points);
    this.scene.add(this.chargeRing.mesh);
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

    this.scene.add(this.afterImages.group);

    // --- sistemi di gioco ---
    this.input = new InputSystem(container);
    this.ballControl = new BallControl(this.ball, this.players);
    this.tackles = new Tackles(this.ball, this.ballControl);
    this.match = new Match(this.ball, this.teams);
    this.fluxSystems = this.teams.map((t) => new FluxSystem(FLUX_PROFILES[t.config.flux]));
    this.fluxMoves = new FluxMoves(this.ball, this.ballControl, this.particles, this.afterImages, this.audio);
    this.cinematics = new Cinematics(container);
    this.recorder = new Recorder(this.players, this.ball);
    this.replayDirector = new ReplayDirector(this.players, this.ball);
    this.fluxShot = new FluxShot({
      time: this.time,
      director: this.director,
      cinematics: this.cinematics,
      particles: this.particles,
      ball: this.ball,
      ballControl: this.ballControl,
      audio: this.audio,
      teams: this.teams,
      fluxSystems: this.fluxSystems,
      aiSaveChance: () => DIFFICULTIES[this.difficulty].gkFluxSave,
      onResult: (outcome, shooterTeam) => {
        if (outcome === 'parata') {
          const gk = this.teams[1 - shooterTeam].goalkeeper;
          this.hud.showMessage(`PARATA FLUX DI ${gk.name.toUpperCase()}!`, 2.2);
          this.audio.goalRoar();
        }
      },
      onEnd: () => {
        // se nel frattempo è arrivato il goal, la regia passa alla celebrazione
        if (this.match.phase === 'goalCelebration') {
          this.director.request(CameraState.Goal, { focus: this.ball.position.clone(), cut: true });
        }
      },
    });
    this.scene.add(this.fluxShot.ringMesh);
    this.goalkeepers = this.teams.map(
      (team) => new Goalkeeper(team.goalkeeper, team, this.ball, this.ballControl),
    );
    // IA a due livelli per entrambe le squadre: i compagni dell'umano
    // giocano sempre a livello "normale", l'avversario segue la difficoltà
    this.teamAIs = [
      new TeamAI(
        this.teams[0], this.teams[1], this.ball, this.ballControl, this.tackles,
        () => (this.demo ? DIFFICULTIES[this.difficulty] : DIFFICULTIES.normale),
        (p) => !this.demo && p === this.activePlayerRef,
        this.demo
          ? {
              trySprint: (p) => this.useFlux(0, 'sprint', p),
              tryDribble: (p) => this.useFlux(0, 'dribble', p),
              tryFluxShot: (p) => this.startFluxShot(0, p, true),
              barRatio: () => this.fluxSystems[0].ratio,
            }
          : null,
      ),
      new TeamAI(
        this.teams[1], this.teams[0], this.ball, this.ballControl, this.tackles,
        () => DIFFICULTIES[this.difficulty],
        () => false,
        {
          trySprint: (p) => this.useFlux(1, 'sprint', p),
          tryDribble: (p) => this.useFlux(1, 'dribble', p),
          tryFluxShot: (p) => this.startFluxShot(1, p, true),
          barRatio: () => this.fluxSystems[1].ratio,
        },
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

    this.hud = new Hud(container);
    this.hud.onPauseRequest = () => this.togglePause();
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyP' || e.code === 'Escape') this.togglePause();
    });
    // ritenta lo sblocco audio al primo gesto in partita (iOS)
    container.addEventListener('pointerdown', () => this.audio.unlock(), { once: true });
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
      this.lastPassReceiver = info.receiver;
      if (info.passer.team === 0 && info.receiver.team === 0 && info.receiver.role === 'campo') {
        this.setActivePlayer(info.receiver);
      }
    };

    // cambio automatico intelligente: quando un compagno conquista palla,
    // il controllo passa a lui; il passaggio riuscito carica il Flux
    this.ballControl.events.onPossession = (p) => {
      if (p && p.team === 0 && p.role === 'campo') this.setActivePlayer(p);
      if (p && this.lastPassReceiver === p) {
        this.fluxSystems[p.team].creditPass();
      }
      this.lastPassReceiver = null;
    };

    // contrasti → audio, falli, carica Flux
    this.tackles.events.onWin = (tackler) => {
      this.audio.bounce(0.8);
      this.fluxSystems[tackler.team].creditTackle();
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

    // salti → whoosh; il doppio salto è giocata spettacolare (carica Flux)
    for (const p of this.players) {
      p.events.onJump = (pl, double) => {
        this.audio.whoosh(double ? 1 : 0.6);
        if (double) this.fluxSystems[pl.team].creditAerial();
      };
    }

    // barra piena → segnale PRONTO per la squadra del giocatore
    this.fluxSystems[0].events.onReady = () => {
      this.audio.fluxReady();
      this.hud.showMessage('FLUX PRONTO!', 1.4);
    };

    // goal → messaggio, boato, orbita celebrativa, esplosione di particelle
    this.match.events.onGoal = (scoringTeam, ballPos) => {
      const teamName = scoringTeam >= 0 ? this.teams[scoringTeam].name : '';
      if (scoringTeam >= 0) {
        this.fluxSystems[scoringTeam].creditGoal();
        // la squadra che ha segnato esulta (clip dedicata sul rig skinned)
        for (const p of this.teams[scoringTeam].fieldPlayers) p.celebrate();
      }
      this.arena.crowd.cheer();
      this.hud.showMessage(`GOAL! ${teamName}`, 2.8);
      this.hud.setScore(this.match);
      this.audio.whistle();
      this.audio.goalRoar();
      this.director.request(CameraState.Goal, { focus: ballPos });
      this.fluxShot.notifyGoal();
      // replay automatico da 2 angolazioni dopo la celebrazione
      this.goalSide = Math.sign(ballPos.x) || 1;
      this.match.pendingReplay = this.recorder.getWindow(3.4) !== null;

      const isFluxGoal = this.ball.fluxColor !== null;
      const color = scoringTeam >= 0 ? this.teams[scoringTeam].color : 0xffffff;
      this.particles.burst(ballPos.clone().setY(Math.max(1, ballPos.y)), {
        count: isFluxGoal ? 200 : 120,
        color,
        speed: isFluxGoal ? 15 : 11,
        life: 1.2,
        size: 1.7,
        gravity: 7,
      });
      if (isFluxGoal) {
        // onda d'urto sulla rete energetica + boato extra
        this.audio.fluxBlast(true);
        const sign = Math.sign(ballPos.x);
        for (let i = 0; i < 3; i++) {
          this.arena.registerWallImpact(
            new THREE.Vector3(ballPos.x, 1.5 + i, ballPos.z * 0.5),
            'x', sign, 1.5,
          );
        }
      }
    };
    this.match.events.onKickoff = () => {
      this.ballControl.clearHold(); // mai un kickoff con la palla "in presa"
      this.director.request(CameraState.OpenPlay, { cut: true });
      this.director.resetChase(Math.PI / 2); // la squadra di casa attacca verso +x
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
      this.hud.showResult(result, () => this.rematch());
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

  /** Tenta una mossa Flux per la squadra: spende energia ed esegue. */
  useFlux(teamIndex: number, kind: 'sprint' | 'dribble', player: Player): boolean {
    if (this.match.phase !== 'playing' || player.action !== 'normale' || this.fluxShot.active) return false;
    const system = this.fluxSystems[teamIndex];
    const cost = kind === 'sprint' ? FLUX_SPRINT_COST : FLUX_DRIBBLE_COST;
    if (!system.spend(cost)) return false;
    const opponents = this.teams[1 - teamIndex].players;
    if (kind === 'sprint') {
      this.fluxMoves.sprint(player, system.profile);
    } else {
      this.fluxMoves.dribble(player, system.profile, opponents);
    }
    this.stats.fluxUses[teamIndex]++;
    return true;
  }

  /**
   * Innesca il tiro Flux cinematico: serve barra piena e palla al piede.
   * `silent` per l'IA (nessun feedback negativo a schermo).
   */
  startFluxShot(teamIndex: number, shooter: Player, silent = false): boolean {
    const system = this.fluxSystems[teamIndex];
    const feedback = (msg: string) => {
      if (!silent) {
        this.audio.denied();
        this.hud.showMessage(msg, 1.1);
      }
    };
    if (this.fluxShot.active || this.match.phase !== 'playing' || shooter.action !== 'normale') {
      return false;
    }
    if (!system.ready) {
      feedback('FLUX NON PRONTO');
      return false;
    }
    if (this.ballControl.owner !== shooter) {
      feedback('SERVE LA PALLA AL PIEDE');
      return false;
    }
    system.spend(FLUX_SHOT_COST);
    this.fluxShot.start(shooter, teamIndex, system.profile);
    this.stats.fluxShots[teamIndex]++;
    return true;
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

  /** Avvia la partita (dopo il menu): sblocca l'audio e fischia l'inizio. */
  beginMatch(): void {
    this.audio.unlock();
    if (!this.started) {
      this.started = true;
      this.match.restart();
      this.hud.showMessage('SI COMINCIA!', 1.6);
    }
  }

  togglePause(): void {
    if (!this.started) return;
    this.paused = !this.paused;
    this.hud.setPauseVisible(this.paused);
  }

  /** Rivincita con le stesse squadre. */
  private rematch(): void {
    this.hud.hideResult();
    this.match.restart();
    for (const f of this.fluxSystems) f.reset();
    this.stats.fluxUses = [0, 0];
    this.stats.fluxShots = [0, 0];
    this.hud.setScore(this.match);
    this.hud.showMessage('SI RICOMINCIA!', 1.6);
  }

  private frame(): void {
    if (this.paused) {
      this.composer.render();
      return;
    }
    const frameDt = this.clock.getDelta();
    const rawDt = Math.min(frameDt, 1 / 30);
    const dt = this.time.update(rawDt);

    const frame = this.input.update();
    const active = this.activePlayer;

    // cambio giocatore manuale: il compagno più vicino alla palla
    if (frame.switchPressed) {
      this.setActivePlayer(this.nearestFieldPlayer(this.ball.position, active));
    }

    // cambio visuale (C / pulsante CAM)
    if (frame.cameraPressed) {
      const next = this.director.viewMode === 'azione' ? 'telecronaca' : 'azione';
      this.director.viewMode = next;
      window.localStorage?.setItem('nova-visuale', next);
      this.hud.showMessage(next === 'azione' ? 'VISUALE: AZIONE' : 'VISUALE: TELECRONACA', 1.2);
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
    const cine = this.fluxShot.active; // sequenza del tiro Flux in corso
    const inReplay = phase === 'replay';

    // sequenza cinematica del tiro Flux (timer in tempo reale)
    this.fluxShot.update(rawDt, dt, frame.kickPressed);

    // replay del goal da 2 angolazioni
    if (inReplay && !this.replayRunning) {
      const window = this.recorder.getWindow(3.4);
      if (!window) {
        this.match.finishReplay();
      } else {
        this.replayRunning = true;
        this.cinematics.setReplay(true);
        this.replayDirector.start(window, this.goalSide);
        this.director.takeOver(CameraState.Replay, (cam, dtR) => {
          if (!this.replayDirector.update(dtR, cam)) {
            this.replayRunning = false;
            this.cinematics.setReplay(false);
            this.director.releaseOverride(true);
            this.match.finishReplay();
          }
        });
      }
    }

    // rivincita a fischio finale (oltre ai pulsanti del pannello)
    if (phase === 'fulltime' && (frame.kickPressed || frame.passPressed)) {
      this.rematch();
    }

    // mosse Flux del giocatore (scatto E / dribbling R / tiro F), con
    // feedback chiaro quando l'energia non basta
    if (phase === 'playing' && this.started && !cine) {
      if (frame.fluxSprintPressed && !this.useFlux(0, 'sprint', this.activePlayer)) {
        this.audio.denied();
        this.hud.showMessage('FLUX INSUFFICIENTE', 0.9);
      }
      if (frame.fluxDribblePressed && !this.useFlux(0, 'dribble', this.activePlayer)) {
        this.audio.denied();
        this.hud.showMessage('FLUX INSUFFICIENTE', 0.9);
      }
      if (frame.fluxShotPressed) {
        this.startFluxShot(0, this.activePlayer);
      }
      // pulsante FLUX contestuale (touch): decide da solo la mossa.
      // A barra piena promette SEMPRE il tiro Flux: se la palla è a
      // portata viene agganciata, altrimenti lo dice chiaramente —
      // mai uno scatto "a sorpresa" che brucia l'energia del tiro.
      if (frame.fluxSmartPressed) {
        const active = this.activePlayer;
        const hasBall = this.ballControl.owner === active;
        if (this.fluxSystems[0].ready) {
          const ballNear =
            !this.ballControl.heldBy &&
            active.position.distanceTo(this.ball.position) < 2.6;
          if (!hasBall && ballNear) this.ballControl.givePossession(active);
          if (hasBall || ballNear) {
            this.startFluxShot(0, active);
          } else {
            this.audio.denied();
            this.hud.showMessage('SERVE LA PALLA AL PIEDE', 1.1);
          }
        } else {
          const done = hasBall
            ? this.useFlux(0, 'dribble', active)
            : this.useFlux(0, 'sprint', active);
          if (!done) {
            this.audio.denied();
            this.hud.showMessage('FLUX INSUFFICIENTE', 0.9);
          }
        }
      }
    }

    // --- azioni contestuali del giocatore attivo ---
    if (playing && !cine) {
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

    // --- IA di squadra (tattica + individuale) e carica Flux ---
    // (durante la cinematica niente nuove decisioni: gli altri continuano
    //  in slow-motion sui bersagli correnti)
    if (phase === 'playing' && this.started && !cine) {
      for (const ai of this.teamAIs) ai.update(dt);
      for (const f of this.fluxSystems) f.update(dt);
    }
    if (phase === 'playing' && this.started) {
      this.recorder.update(dt);
    }

    // --- aggiornamento giocatori (nel replay le posizioni sono riprodotte) ---
    const activeNow = this.activePlayer; // può essere cambiato dalle azioni sopra
    if (!inReplay) {
      for (let ti = 0; ti < this.teams.length; ti++) {
        for (const p of this.teams[ti].players) {
          if (p.role === 'portiere') continue; // gestiti dai controller
          let cmd: PlayerCommand | null = null;
          if (playing && p === activeNow && !cine && !this.demo) {
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
    }

    this.match.update(dt);

    // regia
    this.director.update(rawDt, {
      ball: this.ball,
      active: activeNow,
      charging: this.ballControl.charging,
      fluxBoost: activeNow.boostTimer > 0,
    });

    // vfx
    this.fluxMoves.update(dt, this.players);
    this.afterImages.update(dt);
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
    this.input.touch.setFluxShotReady(this.fluxSystems[0].ready);

    // tabellone olografico e radar
    const cl = Math.max(0, Math.ceil(this.match.clock));
    this.arena.scoreboard.setText(
      `${this.teams[0].name} ${this.match.score[0]} — ${this.match.score[1]} ${this.teams[1].name}` +
      `   ${this.match.half}T ${Math.floor(cl / 60)}:${String(cl % 60).padStart(2, '0')}`,
    );
    this.hud.updateRadar(
      this.players.map((p) => ({ x: p.position.x, z: p.position.z, team: p.team })),
      { x: this.ball.position.x, z: this.ball.position.z },
      [
        `#${this.teams[0].color.toString(16).padStart(6, '0')}`,
        `#${this.teams[1].color.toString(16).padStart(6, '0')}`,
      ],
    );

    this.hud.setStamina(activeNow.stamina / 100);
    this.hud.setFlux(
      this.fluxSystems[0].ratio, this.fluxSystems[0].ready, this.fluxSystems[0].profile,
      this.fluxSystems[1].ratio, this.fluxSystems[1].profile,
    );
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
