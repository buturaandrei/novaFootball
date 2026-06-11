import * as THREE from 'three';
import { HALF_LENGTH, HALF_WIDTH, GOAL_WIDTH, STAMINA_MIN_SPRINT } from '../core/constants';
import type { Player, PlayerCommand } from '../entities/Player';
import type { Ball } from '../physics/Ball';
import type { BallControl } from '../match/BallControl';
import type { Tackles } from '../match/Tackles';
import type { Team } from '../match/Team';
import type { DifficultyParams } from './Difficulty';

/**
 * Stati dell'IA individuale (livello basso della gerarchia):
 * - attacca:   porta palla verso la porta avversaria
 * - smarcati:  si offre nei mezzi spazi in fase di possesso
 * - taglia:    corsa della punta alle spalle della difesa
 * - pressa:    pressing sul portatore avversario
 * - copri:     copertura dietro il compagno che pressa
 * - marca:     marcatura di un avversario senza palla
 * - insegui:   caccia alla palla vagante
 * - rientra:   torna alla posizione di formazione (con scivolamento sulla palla)
 */
export type AIState =
  | 'attacca'
  | 'smarcati'
  | 'taglia'
  | 'pressa'
  | 'copri'
  | 'marca'
  | 'insegui'
  | 'rientra';

/** Ganci verso il sistema Flux: l'IA li usa se la squadra ha energia. */
export interface FluxHooks {
  /** Tenta lo scatto Flux: true se attivato (energia spesa). */
  trySprint: (p: Player) => boolean;
  /** Tenta il dribbling Flux: true se attivato. */
  tryDribble: (p: Player) => boolean;
  /** Tenta il tiro Flux cinematico (richiede barra piena): true se partito. */
  tryFluxShot: (p: Player) => boolean;
  /** Livello attuale della barra (0..1): oltre ~0.6 l'IA risparmia per il tiro. */
  barRatio: () => number;
}

/** Cervello individuale: stato + bersaglio di movimento assegnati dal TeamAI. */
class FieldBrain {
  state: AIState = 'rientra';
  readonly target = new THREE.Vector3();
  sprint = false;
  markTarget: Player | null = null;
  private readonly moveDir = new THREE.Vector3();
  readonly cmd: PlayerCommand;

  constructor(readonly player: Player) {
    this.cmd = { moveDir: this.moveDir, sprint: false, jumpPressed: false };
  }

  /** Steering "arrive": rallenta vicino al bersaglio. */
  buildCommand(speedFactor: number): PlayerCommand {
    const to = this.moveDir.copy(this.target).sub(this.player.position).setY(0);
    const dist = to.length();
    if (dist < 0.3) {
      to.set(0, 0, 0);
    } else {
      to.normalize().multiplyScalar(Math.min(1, dist / 2.2) * speedFactor);
    }
    this.cmd.sprint = this.sprint && this.player.stamina > STAMINA_MIN_SPRINT + 4;
    this.cmd.jumpPressed = false;
    return this.cmd;
  }
}

/**
 * Livello tattico dell'IA di squadra: legge la fase di gioco
 * (possesso / non possesso / palla contesa), assegna gli stati individuali
 * (formazione 2-3-1, pressing coordinato sul portatore, coperture,
 * marcature, smarcamenti nei mezzi spazi, tagli della punta) e per il
 * portatore IA decide dribbling, passaggio o tiro.
 */
export class TeamAI {
  private brains = new Map<Player, FieldBrain>();
  private decisionTimer = 0;

  // scratch
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
  private tmpC = new THREE.Vector3();

  constructor(
    private team: Team,
    private opponents: Team,
    private ball: Ball,
    private ballControl: BallControl,
    private tackles: Tackles,
    private getDifficulty: () => DifficultyParams,
    /** true se quel giocatore è guidato dall'umano in questo momento. */
    private isHuman: (p: Player) => boolean,
    private fluxHooks: FluxHooks | null = null,
  ) {
    for (const p of team.fieldPlayers) this.brains.set(p, new FieldBrain(p));
  }

  /** Direzione d'attacco sull'asse x (+1 o -1). */
  private get attackSign(): number {
    return -this.team.defendsSide;
  }

  update(dt: number): void {
    const diff = this.getDifficulty();
    this.decisionTimer -= dt;
    if (this.decisionTimer <= 0) {
      this.decisionTimer = diff.decisionInterval;
      this.assignStates(diff);
      this.carrierDecisions(diff);
    }
    // il bersaglio del pressing/inseguimento va aggiornato ogni frame
    this.refreshDynamicTargets();
  }

  getCommand(p: Player): PlayerCommand | null {
    const brain = this.brains.get(p);
    if (!brain || this.isHuman(p)) return null;
    return brain.buildCommand(this.getDifficulty().speedFactor);
  }

  stateOf(p: Player): AIState | null {
    return this.brains.get(p)?.state ?? null;
  }

  // ------------------------------------------------------- livello tattico
  private assignStates(diff: DifficultyParams): void {
    const owner = this.ballControl.owner;
    const held = this.ballControl.heldBy;
    const ourBall = (owner && owner.team === this.teamIndex()) || held === this.team.goalkeeper;
    const theirBall = (owner && owner.team !== this.teamIndex()) || (held && held !== this.team.goalkeeper);

    if (held && held !== this.team.goalkeeper) {
      // il portiere avversario ha bloccato la palla: tutti in posizione
      for (const p of this.team.fieldPlayers) {
        const brain = this.brains.get(p)!;
        brain.state = 'rientra';
        brain.sprint = false;
        brain.markTarget = null;
      }
    } else if (theirBall && owner) {
      this.assignDefense(owner, diff);
    } else if (ourBall && owner) {
      this.assignAttack(owner);
    } else {
      this.assignLooseBall();
    }
  }

  private teamIndex(): number {
    return this.team.fieldPlayers[0].team;
  }

  /** Fase di non possesso: pressing coordinato, copertura, marcature. */
  private assignDefense(carrier: Player, diff: DifficultyParams): void {
    const sorted = [...this.team.fieldPlayers].sort(
      (a, b) => a.position.distanceTo(carrier.position) - b.position.distanceTo(carrier.position),
    );

    const marked = new Set<Player>();
    let pressers = 0;
    sorted.forEach((p) => {
      const brain = this.brains.get(p)!;
      brain.markTarget = null;
      const distToCarrier = p.position.distanceTo(carrier.position);

      // i due più vicini coordinano il pressing (se a raggio utile)
      if (pressers === 0 && distToCarrier < diff.pressDistance * 2) {
        brain.state = 'pressa';
        brain.sprint = distToCarrier > 4 && Math.random() < diff.sprintTendency;
        pressers++;
        return;
      }
      if (pressers === 1 && distToCarrier < diff.pressDistance * 2.5) {
        brain.state = 'copri';
        brain.sprint = distToCarrier > 8;
        pressers++;
        return;
      }

      // gli altri marcano l'avversario libero più vicino, o rientrano
      let mark: Player | null = null;
      let bestDist = 14;
      for (const o of this.opponents.fieldPlayers) {
        if (o === carrier || marked.has(o) || o.action !== 'normale') continue;
        const d = p.position.distanceTo(o.position);
        if (d < bestDist) {
          bestDist = d;
          mark = o;
        }
      }
      if (mark) {
        marked.add(mark);
        brain.state = 'marca';
        brain.markTarget = mark;
        brain.sprint = false;
      } else {
        brain.state = 'rientra';
        brain.sprint = false;
      }
    });
  }

  /** Fase di possesso: portatore, tagli della punta, smarcamenti. */
  private assignAttack(owner: Player): void {
    const fielders = this.team.fieldPlayers;
    const fw = fielders[fielders.length - 1];
    const ballAdvanced = this.ball.position.x * this.attackSign > -HALF_LENGTH * 0.2;

    for (const p of fielders) {
      const brain = this.brains.get(p)!;
      brain.markTarget = null;
      if (p === owner) {
        brain.state = 'attacca';
        continue;
      }
      const idx = fielders.indexOf(p);
      if (p === fw) {
        brain.state = ballAdvanced ? 'taglia' : 'smarcati';
        brain.sprint = brain.state === 'taglia';
      } else if (idx >= 2) {
        brain.state = 'smarcati'; // centrocampisti nei mezzi spazi
        brain.sprint = false;
      } else {
        brain.state = 'rientra'; // i difensori salgono ma restano dietro
        brain.sprint = false;
      }
    }
  }

  /** Palla contesa: il più vicino la insegue, gli altri tengono posizione. */
  private assignLooseBall(): void {
    const sorted = [...this.team.fieldPlayers].sort(
      (a, b) => a.position.distanceTo(this.ball.position) - b.position.distanceTo(this.ball.position),
    );
    sorted.forEach((p, i) => {
      const brain = this.brains.get(p)!;
      brain.markTarget = null;
      brain.state = i === 0 ? 'insegui' : 'rientra';
      brain.sprint = i === 0 && p.position.distanceTo(this.ball.position) > 5;
    });
  }

  // -------------------------------------------- bersagli di movimento
  private refreshDynamicTargets(): void {
    const owner = this.ballControl.owner;
    const ourGoalX = this.team.defendsSide * HALF_LENGTH;

    for (const p of this.team.fieldPlayers) {
      const brain = this.brains.get(p)!;
      if (this.isHuman(p)) continue;
      const t = brain.target;

      switch (brain.state) {
        case 'attacca': {
          // dribbling: verso la porta, scartando il difensore più vicino
          const goal = this.tmpA.set(-ourGoalX, 0, THREE.MathUtils.clamp(p.position.z * 0.4, -4, 4));
          const dir = this.tmpB.copy(goal).sub(p.position).setY(0).normalize();
          const danger = this.nearestOpponentTo(p.position, 4.5);
          if (danger) {
            const away = this.tmpC.copy(p.position).sub(danger.position).setY(0);
            const side = Math.sign(away.x * dir.z - away.z * dir.x) || 1;
            // deviazione laterale (perpendicolare) per aggirare il difensore
            const px = dir.z * side;
            const pz = -dir.x * side;
            dir.x += px * 0.9;
            dir.z += pz * 0.9;
            dir.normalize();
          }
          t.copy(p.position).addScaledVector(dir, 6);
          brain.sprint = !danger;
          break;
        }
        case 'pressa': {
          if (owner) {
            t.copy(owner.position).addScaledVector(owner.velocity, 0.3);
          } else {
            t.copy(this.ball.position);
          }
          break;
        }
        case 'copri': {
          if (owner) {
            // tra il portatore e la propria porta, qualche metro dietro
            const dir = this.tmpA.set(ourGoalX, 0, 0).sub(owner.position).setY(0).normalize();
            t.copy(owner.position).addScaledVector(dir, 5);
          }
          break;
        }
        case 'marca': {
          const m = brain.markTarget;
          if (m) {
            // tra l'avversario e la propria porta
            const dir = this.tmpA.set(ourGoalX, 0, 0).sub(m.position).setY(0).normalize();
            t.copy(m.position).addScaledVector(dir, 1.3);
          }
          break;
        }
        case 'insegui': {
          t.copy(this.ball.position).addScaledVector(this.ball.velocity, 0.25);
          t.y = 0;
          break;
        }
        case 'taglia': {
          // alle spalle dell'ultimo difensore, verso la porta
          const lastDefX = this.lastDefenderLine();
          t.set(
            THREE.MathUtils.clamp(lastDefX + this.attackSign * 3, -HALF_LENGTH + 4, HALF_LENGTH - 4),
            0,
            THREE.MathUtils.clamp(-Math.sign(this.ball.position.z || 1) * GOAL_WIDTH * 0.6, -HALF_WIDTH + 3, HALF_WIDTH - 3),
          );
          break;
        }
        case 'smarcati': {
          // mezzo spazio: ancora di formazione spinta in avanti, lato palla
          this.anchor(p, t);
          t.x += this.attackSign * 7;
          t.z = THREE.MathUtils.lerp(t.z, Math.sign(t.z || 1) * HALF_WIDTH * 0.35 + this.ball.position.z * 0.2, 0.6);
          t.x = THREE.MathUtils.clamp(t.x, -HALF_LENGTH + 3, HALF_LENGTH - 3);
          break;
        }
        case 'rientra':
        default: {
          this.anchor(p, t);
          break;
        }
      }
    }
  }

  /** Ancora di formazione che scivola verso la palla (blocco compatto). */
  private anchor(p: Player, out: THREE.Vector3): void {
    const idx = this.team.players.indexOf(p);
    this.team.formationPosition(idx, out);
    const owner = this.ballControl.owner;
    const defending = owner && owner.team !== this.teamIndex();
    out.x += this.ball.position.x * 0.25 + (defending ? this.team.defendsSide * 3 : 0);
    out.z = out.z * 0.8 + this.ball.position.z * 0.2;
    out.x = THREE.MathUtils.clamp(out.x, -HALF_LENGTH + 2, HALF_LENGTH - 2);
  }

  private lastDefenderLine(): number {
    // x più avanzata (verso la nostra direzione d'attacco) della difesa avversaria
    let best = this.attackSign * HALF_LENGTH * 0.5;
    let bestVal = -Infinity;
    for (const o of this.opponents.fieldPlayers) {
      const v = o.position.x * this.attackSign;
      if (v > bestVal) {
        bestVal = v;
        best = o.position.x;
      }
    }
    return best;
  }

  private nearestOpponentTo(pos: THREE.Vector3, within: number): Player | null {
    let best: Player | null = null;
    let bestDist = within;
    for (const o of this.opponents.players) {
      if (o.action !== 'normale') continue;
      const d = this.tmpA.copy(o.position).sub(pos).setY(0).length();
      if (d < bestDist) {
        bestDist = d;
        best = o;
      }
    }
    return best;
  }

  // ------------------------------------------------ decisioni del portatore
  private carrierDecisions(diff: DifficultyParams): void {
    const owner = this.ballControl.owner;
    if (!owner || owner.team !== this.teamIndex() || this.isHuman(owner)) {
      this.maybeTackle(diff);
      return;
    }
    if (owner.role === 'portiere') return; // gestito dal Goalkeeper

    const goalX = -this.team.defendsSide * HALF_LENGTH;
    const goalCenter = this.tmpA.set(goalX, 0, 0);
    const distGoal = this.tmpB.copy(goalCenter).sub(owner.position).setY(0).length();
    const pressure = this.nearestPressure(owner);

    // Flux: il "personaggio stella" (la punta) lo usa più volentieri.
    // Oltre il 62% di barra l'IA RISPARMIA l'energia per il tiro Flux
    // (salvo emergenza), così la barra arriva davvero piena.
    if (this.fluxHooks) {
      const star = this.team.fieldPlayers[this.team.fieldPlayers.length - 1];
      const tendency = diff.fluxTendency * (owner === star ? 1.6 : 1);
      const savingForShot = this.fluxHooks.barRatio() > 0.62;
      // tiro Flux a barra piena, a distanza utile dalla porta
      if (distGoal < 26 && Math.random() < tendency * 0.9) {
        if (this.fluxHooks.tryFluxShot(owner)) return;
      }
      // dribbling Flux sotto pressione (in risparmio solo se braccato)
      if (pressure < 3 && Math.random() < tendency && (!savingForShot || pressure < 1.6)) {
        if (this.fluxHooks.tryDribble(owner)) return;
      }
      // scatto Flux a campo aperto
      if (!savingForShot && pressure > 7 && distGoal > 20 && Math.random() < tendency * 0.5) {
        this.fluxHooks.trySprint(owner);
      }
    }

    // tiro: a portata e con specchio ragionevole
    if (distGoal < diff.shootRange && Math.abs(owner.position.z) < HALF_WIDTH * 0.65) {
      const aimZ = (Math.random() - 0.5) * GOAL_WIDTH * 0.7;
      const charge = THREE.MathUtils.clamp(0.45 + distGoal / 22, 0.5, 1);
      this.ballControl.shootAt(owner, this.tmpA.set(goalX, 1.2, aimZ), charge, diff.shotError);
      return;
    }

    // passaggio: sotto pressione, o per trovare un compagno molto meglio piazzato
    const shouldPass = pressure < 3.2 || (pressure < 6 && Math.random() < 0.35);
    if (shouldPass) {
      const choice = this.choosePass(owner);
      if (choice) {
        this.ballControl.passTo(owner, choice.receiver, choice.lob, diff.passError);
        return;
      }
    }
    // altrimenti continua il dribbling (bersaglio già impostato da 'attacca')
  }

  /** Distanza del difensore avversario più vicino al portatore. */
  private nearestPressure(owner: Player): number {
    let best = Infinity;
    for (const o of this.opponents.fieldPlayers) {
      const d = o.position.distanceTo(owner.position);
      if (d < best) best = d;
    }
    return best;
  }

  /** Scelta del passaggio: progresso, smarcatezza e linea di passaggio libera. */
  private choosePass(owner: Player): { receiver: Player; lob: boolean } | null {
    let best: { receiver: Player; lob: boolean } | null = null;
    let bestScore = 0.5; // soglia minima: meglio tenere palla che regalare
    for (const p of this.team.fieldPlayers) {
      if (p === owner || p.action !== 'normale') continue;
      const dist = p.position.distanceTo(owner.position);
      if (dist < 3 || dist > 38) continue;

      const progress = (p.position.x - owner.position.x) * this.attackSign;
      const openness = this.minOpponentDistance(p.position);
      const laneBlock = this.laneBlocked(owner.position, p.position);

      let score = progress * 0.12 + Math.min(openness, 8) * 0.25 - dist * 0.03;
      let lob = false;
      if (laneBlock) {
        // linea chiusa: il filtrante alto la scavalca se c'è spazio
        if (openness > 4 && dist > 10) lob = true;
        else score -= 1.5;
      }
      if (score > bestScore) {
        bestScore = score;
        best = { receiver: p, lob };
      }
    }
    return best;
  }

  private minOpponentDistance(pos: THREE.Vector3): number {
    let best = Infinity;
    for (const o of this.opponents.fieldPlayers) {
      const d = this.tmpA.copy(o.position).sub(pos).setY(0).length();
      if (d < best) best = d;
    }
    return best;
  }

  /** true se un avversario è vicino alla linea di passaggio. */
  private laneBlocked(from: THREE.Vector3, to: THREE.Vector3): boolean {
    const seg = this.tmpA.copy(to).sub(from).setY(0);
    const len = seg.length();
    if (len < 0.1) return false;
    seg.normalize();
    for (const o of this.opponents.fieldPlayers) {
      const rel = this.tmpB.copy(o.position).sub(from).setY(0);
      const along = rel.dot(seg);
      if (along < 1 || along > len - 1) continue;
      const perp = this.tmpC.copy(rel).addScaledVector(seg, -along).length();
      if (perp < 1.4) return true;
    }
    return false;
  }

  /** Tentativi di contrasto di chi pressa, dosati dall'aggressività. */
  private maybeTackle(diff: DifficultyParams): void {
    const carrier = this.ballControl.owner;
    if (!carrier || carrier.team === this.teamIndex()) return;
    for (const p of this.team.fieldPlayers) {
      const brain = this.brains.get(p)!;
      if (this.isHuman(p) || brain.state !== 'pressa') continue;
      const d = p.position.distanceTo(carrier.position);
      // recupero in scatto Flux se il portatore sta scappando
      // (mai mentre si risparmia per il tiro)
      if (
        this.fluxHooks &&
        this.fluxHooks.barRatio() <= 0.62 &&
        d > 6 && d < 16 &&
        carrier.sprinting &&
        Math.random() < diff.fluxTendency * 0.4
      ) {
        this.fluxHooks.trySprint(p);
      }
      if (d < 2.1 && Math.random() < diff.tackleAggression) {
        // orienta il contrasto verso la palla
        p.facing = Math.atan2(
          this.ball.position.x - p.position.x,
          this.ball.position.z - p.position.z,
        );
        if (carrier.sprinting && d > 1.6 && Math.random() < 0.4) {
          this.tackles.slide(p);
        } else {
          this.tackles.standing(p);
        }
      }
    }
  }
}
