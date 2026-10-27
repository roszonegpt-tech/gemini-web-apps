// 101st Vanguard Division units and their AI.
//  - Trooper: finds protective cover, ducks / peeks / fires 3-round bursts, relocates and
//    flanks, throws frag grenades at a mage who hides behind cover too long.
//  - Heavy Exo-Gunner: advances, spins up a suppressive minigun stream; armoured front,
//    weak back.
//  - Sniper: holds long sight lines, paints the target with a red laser, fires AP rounds.
//  - Officer: uses cover, calls mortar strikes and orders squad flanks.
//  - Drone / Helicopter: flying units that ignore low cover.
//  - Sentry turret (hijackable) and mortar emplacement: stationary.
//  - General Vance (on foot): the final boss phase.
import * as THREE from 'three';
import { ENEMIES, type EnemyDef } from '../config/balance';
import type { DamageInfo, EnemyKind } from '../config/types';
import { CF } from '../core/Physics';
import type { World, CoverPoint } from '../scenes/World';
import { buildDrone, buildHelicopter, buildMortar, buildSoldier, buildTurret, type SoldierModel } from '../utils/models';
import { chance, clamp, damp, dist, heading, pick, rand, turnToward, wrapAngle } from '../utils/math';
import { Actor } from './Actor';

type Phase = 'move' | 'duck' | 'peek' | 'advance';

const CHATTER = [
  'Contact! Hostile caster, twelve o\'clock!',
  'Wizard spotted — light him up!',
  'Eyes on the robe! Weapons free!',
  'He\'s throwing fire! Get to cover!',
  'Flank left, flank left!',
  'Command, we have a magic user in the AO!',
];

export class VanguardEnemy extends Actor {
  ek: EnemyKind;
  def: EnemyDef;
  soldier: SoldierModel | null = null;
  partA: THREE.Object3D | null = null; // drone rotors group / heli rotor / turret head / mortar tube
  partB: THREE.Object3D | null = null;
  rotors: THREE.Object3D[] = [];
  muzzle: THREE.Object3D | null = null;
  turretLight: THREE.MeshLambertMaterial | null = null;
  alerted = false;
  alertT = -1;
  target: Actor | null = null;
  seesTarget = false;
  lastSeenX = 0;
  lastSeenZ = 0;
  perceiveT = Math.random() * 0.2;
  path: number[] | null = null;
  pathI = 0;
  repathT = 0;
  destX = 0;
  destZ = 0;
  cover: CoverPoint | null = null;
  coverCheckT = 0;
  coverSearchT = 0;
  cycles = 0;
  phase: Phase = 'advance';
  phaseT = 0;
  burst = 0;
  burstT = 0;
  fireCd = rand(0.5, 1.5);
  grenadeCd = rand(4, 8);
  specialCd = rand(6, 10);
  protectedT = 0;
  flankBias = chance(0.3);
  perch = false;
  patrol: [number, number][] | null = null;
  patrolI = 0;
  homeX = 0;
  homeZ = 0;
  aimX = 0;
  aimZ = 0;
  laserT = 0;
  shots = 0;
  spin = 0;
  firingT = 0;
  hijacked = 0;
  orbitDir = chance(0.5) ? 1 : -1;
  orbitR = rand(7, 10);
  animT = Math.random() * 10;
  crouch = 0;
  recoil = 0;
  stuckT = 0;
  lastX = 0;
  lastZ = 0;
  /** Wave units in defend events go for the catalyst. */
  objectiveTarget: Actor | null = null;
  entering = 0;
  isVance = false;
  dashCd = 4;
  private lastHurtSfx = 0;

  constructor(world: World, kind: EnemyKind, x: number, z: number) {
    super(world, 'army');
    this.ek = kind;
    this.kind = kind;
    this.def = ENEMIES[kind];
    this.name = this.def.name;
    this.hp = this.maxHp = this.def.hp * world.difficultyHp;
    this.radius = this.def.radius;
    this.x = this.homeX = this.lastX = x;
    this.z = this.homeZ = this.lastZ = z;
    this.flying = !!this.def.flying;
    this.structure = kind === 'turret' || kind === 'mortar';
    this.scoreValue = this.def.score;
    this.exposed = true;
    this.facing = Math.PI;
    this.build();
    this.syncRoot();
  }

  private build(): void {
    switch (this.ek) {
      case 'trooper':
      case 'sniper':
      case 'heavy':
      case 'officer':
      case 'vance': {
        const s = buildSoldier(this.ek);
        this.soldier = s;
        this.root.add(s.root);
        this.muzzle = s.muzzle;
        this.tintMats = s.tint;
        if (this.ek === 'vance') { this.isVance = true; this.isBoss = true; }
        break;
      }
      case 'drone': {
        const d = buildDrone();
        this.root.add(d.root);
        d.root.position.y = 0;
        this.rotors = d.rotors;
        this.muzzle = d.muzzle;
        this.y = 2.4;
        break;
      }
      case 'helicopter': {
        const h = buildHelicopter();
        this.root.add(h.root);
        this.partA = h.rotor;
        this.partB = h.tailRotor;
        this.muzzle = h.muzzle;
        this.y = 7;
        break;
      }
      case 'turret': {
        const t = buildTurret();
        this.root.add(t.root);
        this.partA = t.head;
        this.muzzle = t.muzzle;
        this.turretLight = t.light;
        this.exposed = true;
        break;
      }
      case 'mortar': {
        const m = buildMortar();
        this.root.add(m.root);
        this.partA = m.tube;
        break;
      }
    }
    this.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  }

  // ------------------------------------------------------------ damage

  protected override modifyDamage(info: DamageInfo): number {
    let amt = info.amount;
    if (this.ek === 'heavy') {
      const src = info.source as Actor | null;
      const sx = src && typeof src === 'object' && 'x' in src ? src.x : info.x;
      const sz = src && typeof src === 'object' && 'z' in src ? src.z : info.z;
      if (sx !== undefined && sz !== undefined) {
        const toSrc = heading(sx - this.x, sz - this.z);
        const diff = Math.abs(wrapAngle(toSrc - this.facing));
        if (diff < 1.0) amt *= 0.45;
        else if (diff > 2.1) {
          amt *= 1.6;
          if (info.spell && Math.random() < 0.3) this.world.floatText(this.x, 2.6, this.z, 'WEAK POINT', '#ffd84a');
        }
      }
    }
    if (this.ek === 'helicopter' && info.type === 'bullet') amt *= 0.5;
    if (this.structure && (info.type === 'frost' || info.type === 'wind')) amt *= 0.3;
    return amt;
  }

  protected override onHurt(info: DamageInfo): void {
    if (!this.alerted) this.becomeAlerted(true);
    const now = this.world.time;
    if (now - this.lastHurtSfx > 0.08) {
      this.lastHurtSfx = now;
      this.world.audio.play(this.structure || this.flying ? 'metalHit' : 'enemyHurt', { x: this.x, z: this.z, vol: 0.6 });
    }
    // getting hit at cover makes troopers reconsider
    if (this.phase === 'duck' && info.spell && chance(0.15)) this.cover = null;
  }

  protected override onDeath(info: DamageInfo): void {
    const w = this.world;
    this.deathT = 0;
    if (this.cover) { this.cover.owner = null; this.cover = null; }
    w.onEnemyKilled(this, info);
    if (this.ek === 'drone' || this.ek === 'turret' || this.ek === 'mortar') {
      w.explode(this.x, this.z, this.ek === 'drone' ? 1.6 : 2.6, 15, 'explosive', this, { faction: 'neutral', shake: 0.15, small: true });
    } else if (this.ek === 'helicopter') {
      w.audio.play('explosion', { x: this.x, z: this.z });
    } else {
      w.audio.play('enemyDie', { x: this.x, z: this.z, vol: 0.7 });
    }
  }

  // ------------------------------------------------------------ main update

  update(dt: number): void {
    const w = this.world;
    this.animT += dt;
    if (!this.alive) {
      this.updateDeath(dt);
      return;
    }
    this.tickStatus(dt);
    if (!this.alive) return;
    this.applyKnock(dt);
    if (this.hijacked > 0) {
      this.updateHijacked(dt);
      this.syncRoot();
      return;
    }
    const dormant = !this.alerted && this.zone > w.activeZone && this.zone >= 0;
    if (!dormant) this.perceive(dt);
    if (this.disabled) {
      this.animate(dt, false);
      this.syncRoot();
      return;
    }
    if (this.fireCd > 0) this.fireCd -= dt;
    if (this.grenadeCd > 0) this.grenadeCd -= dt;
    if (this.specialCd > 0) this.specialCd -= dt;
    if (this.repathT > 0) this.repathT -= dt;
    if (this.coverSearchT > 0) this.coverSearchT -= dt;
    if (this.entering > 0) this.entering -= dt;
    let moving = false;
    if (!this.alerted || !this.target) {
      moving = this.idleBehaviour(dt);
    } else {
      switch (this.ek) {
        case 'trooper':
        case 'officer':
          moving = this.updateInfantry(dt);
          break;
        case 'sniper':
          moving = this.updateSniper(dt);
          break;
        case 'heavy':
          moving = this.updateHeavy(dt);
          break;
        case 'drone':
          moving = this.updateDrone(dt);
          break;
        case 'helicopter':
          moving = this.updateHeli(dt);
          break;
        case 'turret':
          this.updateTurret(dt);
          break;
        case 'mortar':
          this.updateMortar(dt);
          break;
        case 'vance':
          moving = this.updateVance(dt);
          break;
      }
    }
    if (!this.flying && !this.structure) this.separate(dt);
    this.animate(dt, moving);
    this.syncRoot();
  }

  // ------------------------------------------------------------ perception

  private perceive(dt: number): void {
    const w = this.world;
    this.perceiveT -= dt;
    if (this.alertT > 0) {
      this.alertT -= dt;
      if (this.alertT <= 0) this.becomeAlerted(false);
    }
    if (this.perceiveT > 0) return;
    this.perceiveT = 0.2;
    const t = this.chooseTarget();
    this.target = t;
    if (!t) { this.seesTarget = false; return; }
    const d = dist(this.x, this.z, t.x, t.z);
    let sees = d < this.def.sight * (this.alerted ? 1.15 : 1);
    if (sees && !this.alerted) {
      const ang = Math.abs(wrapAngle(heading(t.x - this.x, t.z - this.z) - this.facing));
      if (ang > 1.35 && d > 5) sees = false;
    }
    if (sees && !this.flying) sees = w.phys.lineOfSight(this.x, this.z, t.x, t.z);
    else if (sees && this.flying) sees = this.y > 5 || w.phys.lineOfSight(this.x, this.z, t.x, t.z);
    this.seesTarget = sees;
    if (sees) {
      this.lastSeenX = t.x;
      this.lastSeenZ = t.z;
      if (!this.alerted && this.alertT < 0) this.alertT = this.structure ? 0.1 : rand(0.3, 0.6);
    }
  }

  chooseTarget(): Actor | null {
    const w = this.world;
    if (this.objectiveTarget && this.objectiveTarget.alive) {
      const p = w.player;
      if (p.alive && dist(this.x, this.z, p.x, p.z) < 7) return p;
      return this.objectiveTarget;
    }
    let best: Actor | null = w.player.alive && !w.player.mounted ? w.player : null;
    let bestD = best ? dist(this.x, this.z, best.x, best.z) : 1e9;
    for (const a of w.allies) {
      if (!a.alive || !a.targetable) continue;
      const d = dist(this.x, this.z, a.x, a.z) * 1.4;
      if (d < bestD) { bestD = d; best = a; }
    }
    if (w.player.mounted && w.mountTarget) best = w.mountTarget;
    return best;
  }

  becomeAlerted(silent: boolean): void {
    if (this.alerted || !this.alive) return;
    this.alerted = true;
    this.alertT = -1;
    const w = this.world;
    if (!this.target) this.target = this.chooseTarget();
    if (!silent && !this.structure && !this.flying) w.radioChatter(pick(CHATTER), this.x, this.z);
    // alert the squad
    for (const a of w.actors) {
      if (a instanceof VanguardEnemy && a !== this && !a.alerted && a.alive && dist(a.x, a.z, this.x, this.z) < 18) a.alertT = a.alertT > 0 ? a.alertT : rand(0.2, 0.7);
    }
  }

  private idleBehaviour(dt: number): boolean {
    if (this.patrol && this.patrol.length > 1 && !this.structure && !this.flying) {
      const [px, pz] = this.patrol[this.patrolI];
      if (dist(this.x, this.z, px, pz) < 0.6) {
        this.patrolI = (this.patrolI + 1) % this.patrol.length;
        return false;
      }
      this.moveToward(px, pz, this.def.speed * 0.4, dt);
      return true;
    }
    if (this.ek === 'drone') {
      this.y = 2.4 + Math.sin(this.animT * 2) * 0.2;
      this.facing += dt * 0.4;
    } else if (this.ek === 'turret' && this.partA) {
      this.partA.rotation.y = Math.sin(this.animT * 0.5) * 1.2;
    } else if (this.ek === 'helicopter') {
      this.alerted = true;
    }
    return false;
  }

  // ------------------------------------------------------------ movement helpers

  private moveToward(tx: number, tz: number, speed: number, dt: number): void {
    const dx = tx - this.x, dz = tz - this.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.01) return;
    const s = speed * (this.slowT > 0 ? 0.5 : 1);
    const step = Math.min(d, s * dt);
    this.vx = (dx / d) * s;
    this.vz = (dz / d) * s;
    this.moveBy((dx / d) * step, (dz / d) * step, this.flying ? CF.FLY : CF.MOVE);
    this.facing = turnToward(this.facing, heading(dx, dz), dt * 8);
  }

  /** Follows the current path; returns true while moving. */
  private followPath(dt: number, speed: number): boolean {
    if (!this.path || this.pathI >= this.path.length) {
      this.vx = this.vz = 0;
      return false;
    }
    const px = this.path[this.pathI], pz = this.path[this.pathI + 1];
    if (dist(this.x, this.z, px, pz) < 0.35) {
      this.pathI += 2;
      return this.pathI < this.path.length;
    }
    this.moveToward(px, pz, speed, dt);
    // stuck detection
    this.stuckT += dt;
    if (this.stuckT > 0.8) {
      if (dist(this.x, this.z, this.lastX, this.lastZ) < 0.25) this.path = null;
      this.lastX = this.x; this.lastZ = this.z; this.stuckT = 0;
    }
    return true;
  }

  private pathTo(x: number, z: number): boolean {
    const w = this.world;
    if (w.pathBudget <= 0) return false;
    w.pathBudget--;
    this.path = w.nav.findPath(this.x, this.z, x, z, w.phys);
    this.pathI = 0;
    this.destX = x;
    this.destZ = z;
    this.repathT = 1.0;
    return !!this.path;
  }

  private separate(dt: number): void {
    for (const a of this.world.actors) {
      if (a === this || !a.alive || a.flying || a.faction !== 'army' || a.structure) continue;
      const dx = this.x - a.x, dz = this.z - a.z;
      const d2 = dx * dx + dz * dz;
      const min = this.radius + a.radius + 0.1;
      if (d2 < min * min && d2 > 1e-4) {
        const d = Math.sqrt(d2);
        const push = (min - d) * 0.5 * Math.min(1, dt * 10);
        this.moveBy((dx / d) * push, (dz / d) * push);
      }
    }
  }

  // ------------------------------------------------------------ cover logic

  private chooseCover(t: Actor): CoverPoint | null {
    const w = this.world;
    const pref = this.ek === 'officer' ? 13 : 11;
    const cands: { cp: CoverPoint; d: number }[] = [];
    for (const cp of w.coverPoints) {
      if (cp.owner && cp.owner !== this) continue;
      const d = dist(this.x, this.z, cp.x, cp.z);
      if (d > 22) continue;
      const dt = dist(cp.x, cp.z, t.x, t.z);
      if (dt < 5.5 || dt > this.def.range + 1) continue;
      cands.push({ cp, d });
    }
    cands.sort((a, b) => a.d - b.d);
    let best: CoverPoint | null = null;
    let bestScore = -1e9;
    const myAng = heading(this.x - t.x, this.z - t.z);
    let checked = 0;
    for (const { cp, d } of cands) {
      if (checked++ > 18) break;
      if (!w.nav.walkable(cp.x, cp.z)) continue;
      if (!w.coverProtects(cp, t.x, t.z)) continue;
      if (!w.phys.lineOfSight(cp.x, cp.z, t.x, t.z)) continue;
      const dt = dist(cp.x, cp.z, t.x, t.z);
      let score = -d * 0.35 - Math.abs(dt - pref) * 0.3 + Math.random() * 2;
      if (this.flankBias || w.flankOrder > 0) {
        const ang = Math.abs(wrapAngle(heading(cp.x - t.x, cp.z - t.z) - myAng));
        if (ang > 0.8 && ang < 2.2) score += 4;
      }
      if (score > bestScore) { bestScore = score; best = cp; }
    }
    return best;
  }

  private updateInfantry(dt: number): boolean {
    const w = this.world;
    const t = this.target as Actor;
    const d = dist(this.x, this.z, t.x, t.z);
    let moving = false;
    // validate cover
    this.coverCheckT -= dt;
    if (this.cover && this.coverCheckT <= 0) {
      this.coverCheckT = 1.0;
      const atCover = dist(this.x, this.z, this.cover.x, this.cover.z) < 0.8;
      if ((atCover && this.phaseT < -0.5 && !w.coverProtects(this.cover, t.x, t.z)) || dist(this.cover.x, this.cover.z, t.x, t.z) < 4) {
        this.cover.owner = null;
        this.cover = null;
      }
    }
    if (!this.cover && this.coverSearchT <= 0) {
      this.coverSearchT = rand(1.5, 2.5);
      const cp = this.chooseCover(t);
      if (cp && this.pathTo(cp.x, cp.z)) {
        if (this.cover) (this.cover as CoverPoint).owner = null;
        this.cover = cp;
        cp.owner = this;
        this.phase = 'move';
        this.cycles = 0;
        if (this.flankBias && chance(0.5)) w.radioChatter('Moving to flank!', this.x, this.z, 0.4);
      } else {
        this.phase = 'advance';
      }
    }
    // protected-target timer for grenades
    if (t === w.player) {
      if (this.seesTarget && w.shotBlockedByCover(this.x, this.z, t)) this.protectedT += dt;
      else if (!this.seesTarget) this.protectedT += dt * 0.5;
      else this.protectedT = Math.max(0, this.protectedT - dt);
    }
    this.phaseT -= dt;
    switch (this.phase) {
      case 'move': {
        this.exposed = true;
        this.crouch = 0;
        moving = this.followPath(dt, this.def.speed);
        if (this.seesTarget && this.fireCd <= 0 && chance(0.4)) this.startBurst(2, 1.6);
        else if (this.fireCd <= 0) this.fireCd = 0.6;
        if (!moving) {
          if (this.cover && dist(this.x, this.z, this.cover.x, this.cover.z) > 1.2) {
            if (this.repathT <= 0 && !this.pathTo(this.cover.x, this.cover.z)) { this.cover.owner = null; this.cover = null; }
          } else {
            this.phase = 'duck';
            this.phaseT = rand(0.5, 1.2);
          }
        }
        break;
      }
      case 'duck':
        this.exposed = false;
        this.crouch = 1;
        this.faceToward(t.x, t.z, dt, 5);
        if (this.phaseT <= 0) {
          if (this.seesTarget || w.phys.lineOfSight(this.x, this.z, t.x, t.z)) {
            this.phase = 'peek';
            this.phaseT = 0.35;
          } else {
            this.phaseT = 0.8;
            this.cycles++;
            if (this.cycles > 2 && this.cover) { this.cover.owner = null; this.cover = null; }
          }
        }
        break;
      case 'peek':
        this.exposed = true;
        this.crouch = 0;
        this.faceToward(t.x, t.z, dt, 10);
        if (this.phaseT <= 0 && this.burst === 0) {
          if (this.ek === 'officer' && this.specialCd <= 0 && this.seesTarget) {
            this.specialCd = rand(11, 14);
            w.mortarStrike(t.x, t.z, 3, 2.5, this);
            w.flankOrder = 8;
            w.radioChatter('Fire mission! Danger close!', this.x, this.z, 1);
          } else if (t === w.player && this.protectedT > 3 && this.grenadeCd <= 0 && w.grenadeCd <= 0 && d > 4 && d < 15) {
            this.throwGrenade(t);
          } else if (this.seesTarget) {
            this.startBurst(this.ek === 'officer' ? 2 : 3, 0);
          }
          this.phase = 'duck';
          this.phaseT = rand(1.1, 2.0) + (this.burst ? 0.4 : 0);
          this.cycles++;
          if (this.cycles > 3 && chance(0.4) && this.cover) { this.cover.owner = null; this.cover = null; this.flankBias = chance(0.5); }
        }
        break;
      case 'advance': {
        this.exposed = true;
        this.crouch = 0;
        // no cover: approach to preferred range or strafe
        if (d > this.def.range * 0.8 || !this.seesTarget) {
          if (this.repathT <= 0 || !this.path) this.pathTo(t.x, t.z);
          moving = this.followPath(dt, this.def.speed);
        } else {
          const side = heading(t.x - this.x, t.z - this.z) + Math.PI / 2;
          this.moveToward(this.x + Math.sin(side) * this.orbitDir, this.z + Math.cos(side) * this.orbitDir, this.def.speed * 0.5, dt);
          if (chance(dt * 0.3)) this.orbitDir *= -1;
          moving = true;
          this.faceToward(t.x, t.z, dt, 10);
        }
        if (this.seesTarget && this.fireCd <= 0) this.startBurst(3, 1.2);
        break;
      }
    }
    this.updateBurst(dt);
    return moving;
  }

  private faceToward(x: number, z: number, dt: number, rate: number): void {
    this.facing = turnToward(this.facing, heading(x - this.x, z - this.z), dt * rate);
  }

  // ------------------------------------------------------------ weapons

  private startBurst(n: number, extraCd: number): void {
    if (this.burst > 0 || this.fireCd > 0) return;
    this.burst = n;
    this.burstT = 0;
    this.fireCd = rand(1.4, 2.2) + extraCd;
  }

  private updateBurst(dt: number): void {
    if (this.burst <= 0) return;
    this.burstT -= dt;
    if (this.burstT > 0) return;
    const t = this.target;
    if (!t || !t.alive) { this.burst = 0; return; }
    this.exposed = true;
    this.burstT = this.ek === 'officer' || this.ek === 'vance' ? 0.16 : 0.1;
    this.burst--;
    this.shoot(t, this.ek === 'officer' || this.ek === 'vance' ? 'pistol' : 'rifle');
  }

  muzzlePos(): [number, number, number] {
    const f = this.facing;
    const fx = Math.sin(f), fz = Math.cos(f);
    const rx = Math.cos(f), rz = -Math.sin(f);
    const fwd = this.ek === 'heavy' ? 1.3 : this.ek === 'sniper' ? 1.2 : this.flying ? 0.4 : 0.85;
    const side = this.flying || this.structure ? 0 : 0.12;
    const y = this.ek === 'turret' ? 1.1 : this.flying ? this.y - 0.2 : 1.25 * (this.ek === 'heavy' ? 1.1 : 1);
    return [this.x + fx * fwd + rx * side, y, this.z + fz * fwd + rz * side];
  }

  private shoot(t: Actor, weapon: 'rifle' | 'pistol' | 'minigun' | 'laser' | 'sniper'): void {
    const w = this.world;
    const [mx, my, mz] = this.muzzlePos();
    const d = dist(mx, mz, t.x, t.z);
    const speeds = { rifle: 30, pistol: 26, minigun: 34, laser: 24, sniper: 90 };
    const sp = speeds[weapon];
    const lead = (d / sp) * (weapon === 'sniper' ? 0 : 0.55);
    let tx = t.x + t.vx * lead, tz = t.z + t.vz * lead;
    if (weapon === 'sniper') { tx = this.aimX; tz = this.aimZ; }
    const spreadBase = { rifle: 0.06, pistol: 0.07, minigun: 0.11, laser: 0.05, sniper: 0.004 }[weapon];
    const spread = spreadBase * w.difficultySpread + (this.phase === 'move' ? 0.05 : 0);
    const ang = heading(tx - mx, tz - mz) + (Math.random() - 0.5) * 2 * spread;
    const dmg = this.def.damage * w.difficultyDmg;
    const kind = weapon === 'laser' ? 'laser' : weapon === 'sniper' ? 'sniper' : 'bullet';
    w.projectiles.fire(kind, mx, my, mz, Math.sin(ang), Math.cos(ang), sp, {
      faction: this.faction === 'mage' ? 'mage' : 'army', source: this, dmg, type: weapon === 'sniper' ? 'ap' : weapon === 'laser' ? 'laser' : 'bullet',
      range: weapon === 'sniper' ? 45 : 32, radius: 0.1, plunging: this.flying || this.perch,
    });
    // muzzle flash
    w.particles.emit({ x: mx, y: my, z: mz, count: 3, color: weapon === 'laser' ? [0xff4040, 0xffffff] : [0xffe08a, 0xffffff, 0xff9a3a], speed: 2, life: [0.04, 0.09], size: [0.2, 0.35] });
    w.lights.request(mx, my, mz, weapon === 'laser' ? 0xff3030 : 0xffc060, 6, 5);
    const sfx = weapon === 'pistol' ? 'pistol' : weapon === 'minigun' ? 'minigunShot' : weapon === 'laser' ? 'laserShot' : weapon === 'sniper' ? 'sniper' : 'gunshot';
    w.audio.play(sfx, { x: this.x, z: this.z, pitch: 0.9 + Math.random() * 0.2, vol: weapon === 'minigun' ? 0.6 : 1, throttle: weapon === 'minigun' ? 0.04 : 0.02 });
    this.recoil = 1;
    this.exposed = true;
    w.alertNoise(this.x, this.z, 14);
  }

  private throwGrenade(t: Actor): void {
    const w = this.world;
    this.grenadeCd = rand(8, 12);
    w.grenadeCd = 2.5;
    this.protectedT = 0;
    const tx = t.x + rand(-1, 1), tz = t.z + rand(-1, 1);
    const d = dist(this.x, this.z, tx, tz);
    const dur = 0.9 + d * 0.04;
    w.projectiles.lob('grenade', this.x, this.z, tx, tz, dur, 2.2, { faction: 'army', source: this, dmg: 30 * w.difficultyDmg, type: 'explosive', aoe: 2.8, color: 0x3e4a2c, size: 0.14 });
    w.fx.telegraph(tx, tz, 2.8, dur, 0xff4a2a);
    w.audio.play('throw', { x: this.x, z: this.z });
    w.radioChatter('Frag out!', this.x, this.z, 0.5);
  }

  // ------------------------------------------------------------ sniper

  private updateSniper(dt: number): boolean {
    const w = this.world;
    const t = this.target as Actor;
    const d = dist(this.x, this.z, t.x, t.z);
    let moving = false;
    this.exposed = true;
    if (!this.perch && d < 7) {
      // retreat away from the mage
      const ax = this.x + (this.x - t.x), az = this.z + (this.z - t.z);
      if (this.repathT <= 0) this.pathTo(ax, az);
      moving = this.followPath(dt, this.def.speed);
      this.laserT = 0;
      return moving;
    }
    if (!this.seesTarget || d > this.def.range) {
      this.laserT = Math.max(0, this.laserT - dt * 2);
      if (!this.perch && (this.repathT <= 0 || !this.path)) this.pathTo(this.lastSeenX, this.lastSeenZ);
      if (!this.perch) moving = this.followPath(dt, this.def.speed * 0.8);
      return moving;
    }
    this.path = null;
    this.faceToward(t.x, t.z, dt, 4);
    if (this.fireCd > 0) {
      this.laserT = 0;
      this.aimX = t.x; this.aimZ = t.z;
      return false;
    }
    if (this.laserT === 0) { this.aimX = t.x + rand(-2, 2); this.aimZ = t.z + rand(-2, 2); w.audio.play('laserCharge', { x: this.x, z: this.z, vol: 0.6 }); }
    this.laserT += dt;
    const k = Math.min(1, dt * (this.laserT > 1.2 ? 1.2 : 2.6));
    this.aimX += (t.x - this.aimX) * k;
    this.aimZ += (t.z - this.aimZ) * k;
    const [mx, my, mz] = this.muzzlePos();
    const dx = this.aimX - mx, dz = this.aimZ - mz;
    const l = Math.hypot(dx, dz) || 1;
    const reach = l + 1.5;
    const hit = w.phys.raycast(mx, mz, mx + (dx / l) * reach, mz + (dz / l) * reach, this.perch ? CF.SIGHT : CF.SHOT, { sx: mx, sz: mz });
    const ex = hit ? hit.x : mx + (dx / l) * reach, ez = hit ? hit.z : mz + (dz / l) * reach;
    const flash = this.laserT > 1.4 ? (Math.floor(this.laserT * 20) % 2 ? 1 : 0.3) : 0.6;
    w.fx.beam(this, mx, my, mz, ex, 1.0, ez, 0xff2020, flash);
    if (this.laserT > 1.7) {
      this.shoot(t, 'sniper');
      this.laserT = 0;
      this.fireCd = 2.6;
      this.shots++;
      w.fx.line(mx, my, mz, ex, 1, ez, 0xffffff, 0.25);
      if (!this.perch && this.shots % 2 === 0) {
        // relocate after two shots
        const a = Math.random() * Math.PI * 2;
        this.pathTo(this.homeX + Math.cos(a) * 5, this.homeZ + Math.sin(a) * 5);
      }
    }
    return moving;
  }

  // ------------------------------------------------------------ heavy

  private updateHeavy(dt: number): boolean {
    const w = this.world;
    const t = this.target as Actor;
    const d = dist(this.x, this.z, t.x, t.z);
    this.exposed = true;
    let moving = false;
    if (this.firingT > 0) {
      this.firingT -= dt;
      this.facing = turnToward(this.facing, heading(t.x - this.x, t.z - this.z), dt * 1.5);
      this.burstT -= dt;
      if (this.burstT <= 0) {
        this.burstT = 1 / 11;
        this.shoot(t, 'minigun');
      }
      this.spin = Math.min(1, this.spin + dt * 3);
      if (this.firingT <= 0) this.fireCd = 1.6;
      return false;
    }
    this.spin = Math.max(0, this.spin - dt);
    if (d > 11 || !this.seesTarget) {
      if (this.repathT <= 0 || !this.path) this.pathTo(t.x, t.z);
      moving = this.followPath(dt, this.def.speed);
      this.burst = 0;
      return moving;
    }
    this.path = null;
    this.facing = turnToward(this.facing, heading(t.x - this.x, t.z - this.z), dt * 1.6);
    if (this.fireCd <= 0) {
      if (this.burst === 0) {
        this.burst = 1;
        this.burstT = 0.8;
        w.audio.play('spinUp', { x: this.x, z: this.z });
      } else {
        this.burstT -= dt;
        this.spin = Math.min(1, this.spin + dt * 2);
        if (this.burstT <= 0) {
          this.burst = 0;
          this.firingT = 2.6;
          this.burstT = 0;
        }
      }
    } else if (d > 7) {
      moving = true;
      this.moveToward(t.x, t.z, this.def.speed * 0.6, dt);
    }
    return moving;
  }

  // ------------------------------------------------------------ drone / helicopter

  private updateDrone(dt: number): boolean {
    const t = this.target as Actor;
    const a = heading(this.x - t.x, this.z - t.z) + this.orbitDir * dt * 0.8;
    const gx = t.x + Math.sin(a) * this.orbitR, gz = t.z + Math.cos(a) * this.orbitR;
    this.moveToward(gx, gz, this.def.speed, dt);
    if (chance(dt * 0.25)) this.orbitDir *= -1;
    this.faceToward(t.x, t.z, dt, 12);
    this.y = damp(this.y, 2.4 + Math.sin(this.animT * 3) * 0.25, 4, dt);
    if (this.seesTarget && this.fireCd <= 0) {
      this.burst = 3;
      this.burstT = 0;
      this.fireCd = rand(1.8, 2.6);
    }
    if (this.burst > 0) {
      this.burstT -= dt;
      if (this.burstT <= 0) {
        this.burstT = 0.13;
        this.burst--;
        this.shoot(t, 'laser');
      }
    }
    return true;
  }

  private updateHeli(dt: number): boolean {
    const w = this.world;
    const t = this.target as Actor;
    if (this.entering > 0) {
      this.moveToward(this.destX, this.destZ, this.def.speed * 1.6, dt);
      return true;
    }
    const a = heading(this.x - t.x, this.z - t.z) + this.orbitDir * dt * 0.35;
    const gx = clamp(t.x + Math.sin(a) * 13, w.phys.minX + 4, w.phys.maxX - 4);
    const gz = clamp(t.z + Math.cos(a) * 13, w.phys.minZ + 4, w.phys.maxZ - 4);
    this.moveToward(gx, gz, this.def.speed, dt);
    this.faceToward(t.x, t.z, dt, 2);
    if (this.specialCd <= 0) {
      this.specialCd = rand(5, 7);
      for (let i = 0; i < 4; i++) {
        const tx = t.x + rand(-3.5, 3.5), tz = t.z + rand(-3.5, 3.5);
        const dur = 1.1 + i * 0.15;
        w.projectiles.lob('rocket', this.x, this.z, tx, tz, dur, 2.5, { faction: 'army', source: this, dmg: 22 * w.difficultyDmg, type: 'explosive', aoe: 2.4, color: 0xc23a2e, size: 0.16 });
        w.fx.telegraph(tx, tz, 2.4, dur, 0xff4a2a);
      }
      w.audio.play('rocket', { x: this.x, z: this.z });
    } else if (this.seesTarget && this.fireCd <= 0) {
      this.burst = 6;
      this.burstT = 0;
      this.fireCd = rand(1.6, 2.4);
    }
    if (this.burst > 0) {
      this.burstT -= dt;
      if (this.burstT <= 0) {
        this.burstT = 0.08;
        this.burst--;
        this.shoot(t, 'rifle');
      }
    }
    return true;
  }

  // ------------------------------------------------------------ stationary

  private updateTurret(dt: number): void {
    const t = this.target as Actor;
    if (!this.partA) return;
    const want = heading(t.x - this.x, t.z - this.z);
    this.facing = turnToward(this.facing, want, dt * 2.2);
    this.partA.rotation.y = 0;
    const aligned = Math.abs(wrapAngle(want - this.facing)) < 0.15;
    const d = dist(this.x, this.z, t.x, t.z);
    if (this.seesTarget && aligned && d < this.def.range && this.fireCd <= 0) {
      this.burst = 4;
      this.burstT = 0;
      this.fireCd = rand(1.4, 1.9);
    }
    if (this.burst > 0) {
      this.burstT -= dt;
      if (this.burstT <= 0) {
        this.burstT = 0.1;
        this.burst--;
        this.shoot(t, 'rifle');
      }
    }
    if (this.turretLight) this.turretLight.emissiveIntensity = 1 + Math.sin(this.animT * 8) * 0.5;
  }

  /** Hijacked by the mage: fires arcane bolts at Vanguard units, then overloads. */
  private updateHijacked(dt: number): void {
    const w = this.world;
    this.hijacked -= dt;
    this.faction = 'mage';
    let best: Actor | null = null;
    let bd = this.def.range + 2;
    for (const a of w.actors) {
      if (!a.alive || a.faction !== 'army' || !a.targetable) continue;
      const d = dist(this.x, this.z, a.x, a.z);
      if (d < bd && w.phys.lineOfSight(this.x, this.z, a.x, a.z)) { bd = d; best = a; }
    }
    if (this.turretLight) { this.turretLight.color.setHex(0xb36bff); this.turretLight.emissive.setHex(0x9a4cff); }
    w.lights.request(this.x, 1.6, this.z, 0xb36bff, 5, 5);
    if (best) {
      this.facing = turnToward(this.facing, heading(best.x - this.x, best.z - this.z), dt * 4);
      if (this.fireCd <= 0) {
        this.fireCd = 0.28;
        const [mx, my, mz] = this.muzzlePos();
        w.projectiles.fire('arcBolt', mx, my, mz, best.x - mx, best.z - mz, 30, { faction: 'mage', source: this, dmg: 14 * w.player.spellPower, type: 'arcane', range: 24, radius: 0.25, spell: 'turret' });
        w.audio.play('bolt', { x: this.x, z: this.z, pitch: 0.7, vol: 0.6 });
      }
    }
    if (this.fireCd > 0) this.fireCd -= dt;
    if (this.hijacked <= 0) {
      w.floatText(this.x, 2.4, this.z, 'OVERLOAD', '#b36bff');
      this.faction = 'army';
      this.damage({ amount: 9999, type: 'arcane', source: w.player, spell: 'turret' });
    }
  }

  hijack(): void {
    this.hijacked = 25;
    this.faction = 'mage';
    this.world.audio.play('turretHack', { x: this.x, z: this.z });
    this.world.banner('TURRET ENCHANTED', 'info');
    this.world.stats.combos++;
  }

  private updateMortar(dt: number): void {
    const w = this.world;
    const t = this.target as Actor;
    if (!this.alerted && this.zone > w.activeZone) return;
    const d = dist(this.x, this.z, t.x, t.z);
    if (this.partA) this.partA.rotation.y = turnToward(this.partA.rotation.y, heading(t.x - this.x, t.z - this.z), dt * 2);
    if (d < this.def.range && this.fireCd <= 0) {
      this.fireCd = rand(5.5, 7.5);
      const tx = t.x + t.vx * 1.2 + rand(-1.5, 1.5), tz = t.z + t.vz * 1.2 + rand(-1.5, 1.5);
      w.projectiles.lob('mortar', tx - 3, tz, tx, tz, 2.0, 0, { faction: 'army', source: this, dmg: this.def.damage * w.difficultyDmg, type: 'explosive', aoe: 3, color: 0x3a3a3a, size: 0.22 });
      w.fx.telegraph(tx, tz, 3, 2.0, 0xff3030);
      w.audio.play('mortarLaunch', { x: this.x, z: this.z });
      w.audio.play('mortarWhistle', { x: tx, z: tz, vol: 0.7 });
      w.particles.smoke(this.x, 1.5, this.z, 6, 0x8a8580, 0.8);
    }
  }

  // ------------------------------------------------------------ General Vance (on foot)

  private updateVance(dt: number): boolean {
    const w = this.world;
    const t = this.target as Actor;
    const d = dist(this.x, this.z, t.x, t.z);
    this.exposed = true;
    this.dashCd -= dt;
    let moving = false;
    if (this.dashCd <= 0 && d < 14) {
      this.dashCd = rand(3.5, 5);
      const side = heading(t.x - this.x, t.z - this.z) + (chance(0.5) ? 1 : -1) * Math.PI / 2;
      for (let r = 6; r > 1; r -= 0.5) {
        const nx = this.x + Math.sin(side) * r, nz = this.z + Math.cos(side) * r;
        if (w.phys.circleFree(nx, nz, this.radius, CF.MOVE)) {
          w.particles.emit({ x: this.x, y: 1, z: this.z, count: 16, color: [0xffd84a, 0xffffff], speed: 3, life: [0.2, 0.4], size: [0.15, 0.25] });
          this.x = nx; this.z = nz;
          w.audio.play('blink', { x: nx, z: nz, vol: 0.5 });
          break;
        }
      }
    }
    if (this.specialCd <= 0) {
      this.specialCd = rand(9, 12);
      w.mortarStrike(t.x, t.z, 5, 4, this);
      w.subtitle('General Vance', pick(['All batteries — fire on my position\'s target!', 'You think a few tricks scare me, wizard?', 'Vanguard never retreats!']), 3);
    } else if (this.grenadeCd <= 0 && d > 5 && d < 14) {
      this.throwGrenade(t);
    }
    if (d > 9 || !this.seesTarget) {
      if (this.repathT <= 0 || !this.path) this.pathTo(t.x, t.z);
      moving = this.followPath(dt, this.def.speed);
    } else {
      const side = heading(t.x - this.x, t.z - this.z) + Math.PI / 2;
      this.moveToward(this.x + Math.sin(side) * this.orbitDir, this.z + Math.cos(side) * this.orbitDir, this.def.speed * 0.6, dt);
      if (chance(dt * 0.5)) this.orbitDir *= -1;
      moving = true;
      this.faceToward(t.x, t.z, dt, 12);
    }
    if (this.seesTarget && this.fireCd <= 0) this.startBurst(4, -0.4);
    this.updateBurst(dt);
    return moving;
  }

  // ------------------------------------------------------------ animation & death

  private animate(dt: number, moving: boolean): void {
    const s = this.soldier;
    if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - dt * 8);
    if (s) {
      const sw = moving ? Math.sin(this.animT * 11) * 0.7 : 0;
      s.legL.rotation.x = damp(s.legL.rotation.x, sw, 14, dt);
      s.legR.rotation.x = damp(s.legR.rotation.x, -sw, 14, dt);
      const c = this.frozen ? s.body.scale.y : damp(s.body.scale.y / (this.ek === 'heavy' ? 1.3 : this.ek === 'vance' ? 1.18 : 1), 1 - this.crouch * 0.3, 10, dt);
      const base = this.ek === 'heavy' ? 1.3 : this.ek === 'vance' ? 1.18 : 1;
      if (!this.frozen) s.body.scale.y = c * base;
      s.upper.rotation.x = -this.recoil * 0.15 + (moving ? 0.1 : 0);
      if (s.extra) s.extra.rotation.z += dt * 30 * this.spin;
    }
    for (const r of this.rotors) r.rotation.y += dt * 40;
    if (this.partA && this.ek === 'helicopter') this.partA.rotation.y += dt * 25;
    if (this.partB && this.ek === 'helicopter') this.partB.rotation.x += dt * 30;
    if (this.ek === 'helicopter') {
      this.root.rotation.z = Math.sin(this.animT) * 0.05;
      w_light(this);
    }
    if (this.ek === 'drone') this.root.rotation.x = 0.1;
    // line-of-sight fog: fade units the mage cannot see
    const target = this.seen ? 1 : 0;
    this.seenFade = damp(this.seenFade, target, 6, dt);
    this.root.visible = this.seenFade > 0.15;
  }

  private updateDeath(dt: number): void {
    this.deathT += dt;
    const w = this.world;
    if (this.soldier) {
      const k = Math.min(1, this.deathT / 0.35);
      this.soldier.body.rotation.x = -k * Math.PI / 2;
      this.soldier.body.position.y = k * 0.25;
      if (this.deathT > 4) this.root.position.y = -(this.deathT - 4) * 0.5;
    } else if (this.ek === 'drone' || this.ek === 'helicopter') {
      this.y = Math.max(0.2, this.y - dt * (this.ek === 'helicopter' ? 4 : 6));
      this.facing += dt * 6;
      if (this.ek === 'helicopter') {
        w.particles.smoke(this.x, this.y, this.z, 2, 0x5e5852, 1.4);
        if (this.y <= 0.25 && this.deathT < 50) {
          this.deathT = 50;
          w.explode(this.x, this.z, 4.5, 40, 'explosive', this, { faction: 'neutral', shake: 0.6 });
          w.fx.scorch(this.x, this.z, 4);
        }
      }
      this.root.position.set(this.x, this.y, this.z);
      this.root.rotation.y = this.facing;
      if (this.y <= 0.25 && this.ek === 'drone') this.root.visible = false;
    } else {
      // structures: leave scorched wreck
      this.root.scale.y = Math.max(0.35, 1 - this.deathT * 2);
      if (this.deathT < 3 && Math.random() < dt * 8) w.particles.smoke(this.x, 1, this.z, 1, 0x5e5852, 1);
    }
    if (this.soldier && this.deathT > 6) this.removed = true;
    if ((this.ek === 'drone' && this.deathT > 2) || (this.ek === 'helicopter' && this.deathT > 55)) this.removed = true;
    if (this.ek === 'helicopter' && this.deathT >= 50 && this.deathT < 55) this.root.visible = false;
  }
}

function w_light(e: VanguardEnemy): void {
  const blink = Math.floor(e.animT * 2) % 2 === 0;
  if (blink) e.world.lights.request(e.x, e.y - 0.6, e.z, 0xff2020, 2, 4);
}
