// The running mission: owns the Three.js scene, collision + navigation, every actor,
// projectile, spell effect, interactable and hazard, the objective flow and zone events.
// It is rendered by MissionScene (campaign) or ChallengeScene (trials).
import * as THREE from 'three';
import type { DevFlags, Services } from '../core/Services';
import type { DamageInfo, EnemyKind, LevelData, SpawnData, ZoneEvent } from '../config/types';
import { CollisionWorld, CF, NavGrid, type Collider } from '../core/Physics';
import { Actor } from '../entities/Actor';
import { AllyGolem } from '../entities/AllyGolem';
import { GoliathTank } from '../entities/Boss';
import {
  AmmoDepot, AntiMagicSmoke, ArcaneChest, Catalyst, Dropship, ExitPortal, Gate, Generator, Pickup, PrisonCage, RadioJammer,
  RiftAnchor, TurretHack, type Hazard, type Interactable,
} from '../entities/Interactables';
import { PlayerMage } from '../entities/PlayerMage';
import { VanguardEnemy } from '../entities/VanguardEnemy';
import { CameraRig } from '../systems/CameraSystem';
import { FxSystem } from '../systems/FxSystem';
import { buildLevel } from '../systems/LevelBuilder';
import { LightPool } from '../systems/LightPool';
import { ObjectiveSystem } from '../systems/ObjectiveSystem';
import { ParticleSystem } from '../systems/ParticleSystem';
import { ProjectileSystem } from '../systems/ProjectileSystem';
import { PropSystem, type PropHandle } from '../systems/PropSystem';
import { SpellSystem } from '../systems/SpellSystem';
import { chance, clamp, dist, rand } from '../utils/math';
import { skyTexture } from '../utils/textures';

export interface CoverPoint {
  x: number;
  z: number;
  cx: number;
  cz: number;
  owner: unknown | null;
}

export interface Prop {
  isProp: true;
  kind: string;
  material: 'sand' | 'wood' | 'concrete' | 'metal' | 'stone' | 'barrel' | 'crystal';
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  handle: PropHandle | null;
  collider: Collider | null;
  colliders: Collider[];
  destroyed: boolean;
  burning: number;
  color: number;
  sy: number;
}

export interface MissionStats {
  kills: number;
  shotsFired: number;
  shotsHit: number;
  wardsCast: number;
  damageTaken: number;
  anchorsSealed: number;
  potionsUsed: number;
  combos: number;
  blinks: number;
  wellsUsed: number;
  rescued: number;
  coverDestroyed: number;
  deaths: number;
  time: number;
}

export function emptyStats(): MissionStats {
  return { kills: 0, shotsFired: 0, shotsHit: 0, wardsCast: 0, damageTaken: 0, anchorsSealed: 0, potionsUsed: 0, combos: 0, blinks: 0, wellsUsed: 0, rescued: 0, coverDestroyed: 0, deaths: 0, time: 0 };
}

export interface WorldEvents {
  banner?: (text: string, kind: string) => void;
  subtitle?: (who: string, text: string, dur: number) => void;
  hit?: (dir: number, amount: number) => void;
  checkpoint?: (zone: number) => void;
  complete?: () => void;
  failed?: (reason: string) => void;
  bossIntro?: () => void;
  killed?: (e: VanguardEnemy) => void;
  /** Short in-game camera pan (e.g. dropship landing). */
  pan?: (x: number, z: number, dur: number) => void;
}

export interface ExplodeOpts {
  faction?: 'mage' | 'army' | 'neutral';
  shake?: number;
  ignite?: number;
  color?: number[];
  heavy?: boolean;
  small?: boolean;
  spell?: string;
}

export interface WorldOptions {
  mode: 'campaign' | 'challenge';
  startZone?: number;
  stats?: MissionStats;
  consumables?: { hp: number; mp: number; bombs: number } | null;
}

export class World {
  readonly services: Services;
  readonly level: LevelData;
  readonly mode: 'campaign' | 'challenge';
  scene = new THREE.Scene();
  camRig = new CameraRig();
  phys: CollisionWorld;
  nav: NavGrid;
  particles: ParticleSystem;
  lights: LightPool;
  props: PropSystem;
  fx: FxSystem;
  projectiles!: ProjectileSystem;
  spells: SpellSystem;
  objectives!: ObjectiveSystem;
  player!: PlayerMage;
  actors: Actor[] = [];
  allies: Actor[] = [];
  interactables: Interactable[] = [];
  hazards: Hazard[] = [];
  propsList: Prop[] = [];
  gates: Gate[] = [];
  coverPoints: CoverPoint[] = [];
  dropships: Dropship[] = [];
  smokes: AntiMagicSmoke[] = [];
  pools: { x: number; z: number; r: number; mana: boolean; foam: THREE.Mesh }[] = [];
  islands: { obj: THREE.Object3D; baseY: number; phase: number }[] = [];
  glyphs: THREE.Mesh[] = [];
  towers: { x: number; z: number }[] = [];
  lamps: { x: number; z: number }[] = [];
  exitPortal: ExitPortal | null = null;
  tank: GoliathTank | null = null;
  bossActor: Actor | null = null;
  groundCanvas: HTMLCanvasElement | null = null;
  disposables: { dispose(): void }[] = [];
  dev: DevFlags;
  stats: MissionStats;
  events: WorldEvents = {};
  /** Extension hooks (v1.1+ modules add per-frame logic without editing World). */
  updaters: ((dt: number) => void)[] = [];
  /** Optional camera focus override (e.g. a mounted vehicle). */
  cameraFocus: { x: number; z: number } | null = null;
  /** Enemies target this instead of the mage while mounted. */
  mountTarget: Actor | null = null;
  time = 0;
  activeZone = 0;
  checkpointZone = 0;
  pathBudget = 4;
  grenadeCd = 0;
  flankOrder = 0;
  lastExplosionHits = 0;
  missionShards = 0;
  difficultyHp = 1;
  difficultyDmg = 1;
  difficultySpread = 1;
  cinematicLock = false;
  aimX = 0;
  aimZ = 0;
  aimTarget: Actor | null = null;
  disposed = false;
  failed = false;
  completed = false;
  heat = 0;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  private rain: THREE.LineSegments | null = null;
  private rainPos: Float32Array | null = null;
  private seenT = 0;
  private boomT = rand(4, 9);
  private chatterCd = 0;
  private failT = -1;
  private failReason = '';
  private timers: { t: number; ev: ZoneEvent; zone: number }[] = [];
  private firedEnter = new Set<number>();
  private debugGroup = new THREE.Group();
  private debugBuilt = '';
  private tmpV = new THREE.Vector3();

  constructor(services: Services, level: LevelData, opts: WorldOptions) {
    this.services = services;
    this.level = level;
    this.mode = opts.mode;
    this.dev = services.dev;
    this.stats = opts.stats || emptyStats();
    const [W, H] = level.size;
    this.phys = new CollisionWorld(0, 0, W, H);
    this.nav = new NavGrid(0, 0, W, H);
    const q = services.engine.quality;
    this.particles = new ParticleSystem(this.scene, q === 2 ? 3000 : q === 1 ? 1800 : 900);
    this.particles.density = q === 2 ? 1 : q === 1 ? 0.65 : 0.4;
    this.lights = new LightPool(this.scene, 6);
    this.lights.enabled = q === 0 ? 3 : 6;
    this.props = new PropSystem(this.scene);
    this.fx = new FxSystem(this.scene);
    this.spells = new SpellSystem(this);
    // atmosphere
    const th = level.theme;
    this.scene.background = skyTexture(th.sky, '#06030c');
    this.scene.fog = new THREE.Fog(new THREE.Color(th.fog), th.fogNear, th.fogFar);
    this.hemi = new THREE.HemisphereLight(new THREE.Color(th.hemiSky), new THREE.Color(th.hemiGround), th.hemiIntensity);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(new THREE.Color(th.sun), th.sunIntensity);
    this.sun.castShadow = q > 0;
    const sm = q === 2 ? 2048 : 1024;
    this.sun.shadow.mapSize.set(sm, sm);
    const sc = this.sun.shadow.camera;
    sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 90;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(this.debugGroup);
    this.camRig.setBounds(0, 0, W, H);
    this.camRig.reducedMotion = services.settings.reducedMotion;

    this.projectiles = new ProjectileSystem(this);
    buildLevel(this);
    this.objectives = new ObjectiveSystem(this);
    // player
    this.player = new PlayerMage(this);
    if (opts.consumables) {
      this.player.hpPotions = opts.consumables.hp;
      this.player.manaPotions = opts.consumables.mp;
      this.player.bombs = opts.consumables.bombs;
    }
    const startZone = Math.min(opts.startZone || 0, level.zones.length - 1);
    const start = startZone > 0 ? level.zones[startZone].checkpoint : level.player;
    this.player.x = start[0];
    this.player.z = start[1];
    this.player.facing = Math.PI;
    this.addActor(this.player);
    // enemies (non-wave)
    level.zones.forEach((z, zi) => {
      if (zi < startZone) return;
      for (const s of z.enemies) if (!s.wave) this.spawnEnemy(s.k, s.x, s.z, zi, s);
    });
    if (startZone > 0) {
      this.objectives.fastForward(startZone);
      for (let i = 0; i < startZone; i++) if (this.gateForZone(i)) (this.gateForZone(i) as Gate).openGate(this);
      this.activeZone = this.checkpointZone = startZone;
    }
    this.objectives.zones[this.activeZone].entered = true;
    if (th.rain > 0) this.buildRain(th.rain * (q === 2 ? 1 : q === 1 ? 0.6 : 0.3));
    this.camRig.snapTo(this.player.x, this.player.z);
    this.aimX = this.player.x;
    this.aimZ = this.player.z - 5;
  }

  // ------------------------------------------------------------ accessors used by entities

  get input() { return this.services.input; }
  get audio() { return this.services.audio; }
  get music() { return this.services.music; }

  addActor(a: Actor): void {
    this.actors.push(a);
    this.scene.add(a.root);
  }

  gateForZone(zi: number): Gate | null {
    const g = this.level.zones[zi] && this.level.zones[zi].gate;
    if (!g) return null;
    return this.gates.find((x) => x.ax === g.a[0] && x.az === g.a[1] && x.bx === g.b[0] && x.bz === g.b[1]) || null;
  }

  spawnEnemy(kind: EnemyKind, x: number, z: number, zone: number, sd: SpawnData | null): VanguardEnemy | null {
    if (x < 1 || z < 1 || x > this.level.size[0] - 1 || z > this.level.size[1] - 1) return null;
    const e = new VanguardEnemy(this, kind, x, z);
    e.zone = zone;
    if (sd && sd.face !== undefined) e.facing = (sd.face * Math.PI) / 180;
    else if (zone >= 0 && this.level.zones[zone]) {
      const [cx, cz] = this.level.zones[zone].checkpoint;
      e.facing = Math.atan2(cx - x, cz - z);
    }
    if (sd) {
      if (sd.tag) e.tag = sd.tag;
      if (sd.patrol) e.patrol = sd.patrol.map((p) => [p[0], p[1]] as [number, number]);
      if (sd.perch) {
        e.perch = true;
        const tower = this.towers.find((t) => dist(t.x, t.z, x, z) < 2.5);
        if (tower) { e.x = tower.x; e.z = tower.z; e.y = 3.35; e.homeX = e.x; e.homeZ = e.z; }
      }
    }
    if (kind === 'turret') this.interactables.push(new TurretHack(e));
    if (kind === 'vance') this.bossActor = e;
    if (kind === 'helicopter' && zone >= 0) e.alerted = true;
    this.addActor(e);
    return e;
  }

  spawnAllyGolem(x: number, z: number, life: number): AllyGolem {
    const g = new AllyGolem(this, x, z, life);
    const out = { x: 0, z: 0 };
    this.phys.resolveCircle(x, z, 1, CF.MOVE, out);
    g.x = out.x; g.z = out.z;
    this.addActor(g);
    this.allies.push(g);
    return g;
  }

  dropship(x: number, z: number, kinds: EnemyKind[], target: Actor | null = null): void {
    this.dropships.push(new Dropship(this, x, z, kinds, this.activeZone, target));
  }

  pendingSpawns(zone: number): boolean {
    if (this.dropships.some((d) => d.zone === zone && d.dropped < d.kinds.length)) return true;
    return this.timers.some((t) => t.zone === zone && (t.ev.do === 'dropship' || t.ev.do === 'wave' || t.ev.do === 'heli'));
  }

  mortarStrike(x: number, z: number, n: number, spread: number, source: Actor | null): void {
    for (let i = 0; i < n; i++) {
      const tx = clamp(x + rand(-spread, spread), 1, this.level.size[0] - 1), tz = clamp(z + rand(-spread, spread), 1, this.level.size[1] - 1);
      const dur = 1.8 + i * 0.3;
      this.projectiles.lob('mortar', tx - 3, tz, tx, tz, dur, 0, { faction: 'army', source, dmg: 30 * this.difficultyDmg, type: 'explosive', aoe: 3, color: 0x333333, size: 0.22 });
      this.fx.telegraph(tx, tz, 3, dur, 0xff3030);
    }
    this.audio.play('mortarWhistle', { x, z });
  }

  // ------------------------------------------------------------ queries

  findInteractable(x: number, z: number): Interactable | null {
    let best: Interactable | null = null;
    let bd = 1e9;
    for (const it of this.interactables) {
      if (it.range <= 0) continue;
      const d = dist(x, z, it.x, it.z);
      if (d > it.range || d >= bd) continue;
      if (it.prompt(this) === null) continue;
      bd = d;
      best = it;
    }
    return best;
  }

  inSmoke(x: number, z: number): boolean {
    for (const s of this.smokes) if (s.inside(x, z)) return true;
    return false;
  }

  inManaPool(x: number, z: number): boolean {
    for (const p of this.pools) if (p.mana && dist(x, z, p.x, p.z) < p.r) return true;
    return false;
  }

  objectiveTagActive(tag: string | null): boolean {
    return this.objectives.tagActive(tag);
  }

  /** Does low cover next to `cp` protect it from a threat at (tx,tz)? */
  coverProtects(cp: CoverPoint, tx: number, tz: number): boolean {
    const hit = this.phys.raycast(tx, tz, cp.x, cp.z, CF.SHOT, { sx: tx, sz: tz }, 0);
    return !!hit && dist(hit.x, hit.z, cp.x, cp.z) < 1.9;
  }

  /** Would a shot from (sx,sz) at the target be stopped by cover? */
  shotBlockedByCover(sx: number, sz: number, t: Actor): boolean {
    return !!this.phys.raycast(sx, sz, t.x, t.z, CF.SHOT, { sx, sz, tx: t.x, tz: t.z, targetExposed: t.exposed }, 0);
  }

  // ------------------------------------------------------------ combat

  dealDamage(target: Actor, info: DamageInfo): number {
    if (!target.alive) return 0;
    if (info.spell === 'arcaneBolt' && target.frozen && target.faction === 'army' && !target.structure) {
      this.spells.crystalSpikes(target);
    }
    const dealt = target.damage(info);
    if (dealt >= 2.5 && target.faction === 'army' && info.spell) {
      this.fx.text(target.x, target.y + 2.1 + (target.isBoss ? 2 : 0), target.z, String(Math.round(dealt)), info.type === 'fire' ? '#ffb04a' : info.type === 'lightning' ? '#9fe8ff' : info.type === 'frost' ? '#cdf4ff' : '#e6c8ff', dealt > 60);
    }
    return dealt;
  }

  recordHit(hit: boolean): void {
    if (hit) this.stats.shotsHit++;
  }

  explode(x: number, z: number, r: number, dmg: number, type: DamageInfo['type'], source: unknown, o: ExplodeOpts = {}): void {
    const faction = o.faction || 'neutral';
    const colors = o.color || [0xffd04a, 0xff8a2a, 0xff3a1a, 0xffffff];
    const q = this.particles.density;
    this.particles.emit({ x, y: 0.6, z, count: Math.round((o.small ? 18 : 40) * (r / 3)), color: colors, speed: [2, 7 * Math.min(1.6, r / 3)], life: [0.25, 0.6], size: [0.3, 0.6], gravity: -1, jitter: r * 0.3 });
    this.particles.emit({ x, y: 0.5, z, count: Math.round(14 * (r / 3)), color: [0x5e5852, 0x55504a, 0x4e4844], speed: [3, 9], life: [0.5, 1.1], size: [0.12, 0.22], gravity: 14, dir: [0, 1, 0], spread: 0.7, additive: false });
    if (q > 0.5 || !o.small) this.particles.smoke(x, 0.8, z, Math.round(8 * (r / 3)), 0x7a746c, 1.1 * (r / 3));
    this.fx.shockwave(x, z, r * 1.1, colors[0], 0.35);
    this.lights.request(x, 1.5, z, colors[1] || 0xff8a2a, 26 * Math.min(2, r / 3), r * 3.5);
    if (!o.small) this.fx.scorch(x, z, r * 0.7);
    if (type !== 'fire') this.audio.play('explosion', { x, z, pitch: o.small ? 1.3 : 1, vol: o.small ? 0.6 : 1 });
    const pd = dist(x, z, this.player.x, this.player.z);
    this.camRig.addTrauma((o.shake !== undefined ? o.shake : 0.3) * clamp(1.2 - pd / 25, 0, 1));
    if (pd < 12) this.input.vibrate(60, 0.4);
    if (dmg > 0) {
      for (const a of this.actors) {
        if (!a.alive || !a.targetable) continue;
        if (faction !== 'neutral' && a.faction === faction) continue;
        if (a.flying && a.y > 4 && !o.heavy) continue;
        const d = dist(x, z, a.x, a.z);
        if (d > r + a.radius) continue;
        const fall = 1 - 0.5 * clamp(d / r, 0, 1);
        const dealt = this.dealDamage(a, { amount: dmg * fall, type, source, dirX: a.x - x, dirZ: a.z - z, x, z, knockback: o.heavy ? 2.5 : 1.2, spell: o.spell as DamageInfo['spell'] });
        if (dealt > 0 && a.faction === 'army') this.lastExplosionHits++;
        if (o.ignite && a.alive && a !== this.player) a.ignite(o.ignite, 8 * this.player.spellPower);
      }
      for (const p of this.propsList) {
        if (p.destroyed) continue;
        const d = dist(x, z, p.x, p.z);
        if (d < r + 0.5) this.damageProp(p, { amount: dmg * (1 - 0.5 * clamp(d / r, 0, 1)) * (o.heavy ? 2 : 1), type, source, x, z }, o.ignite ? true : false);
      }
    }
    this.alertNoise(x, z, 20);
  }

  damageProp(p: Prop, info: DamageInfo, ignite = false): void {
    if (p.destroyed || !p.handle) return;
    const t = info.type;
    let m = 1;
    switch (p.material) {
      case 'sand': m = t === 'bullet' ? 0.35 : t === 'ap' ? 0.6 : t === 'frost' || t === 'wind' ? 0.2 : 1; break;
      case 'wood': m = t === 'frost' ? 0.2 : 1; if (t === 'fire' || ignite) p.burning = Math.max(p.burning, 4); break;
      case 'concrete': m = t === 'explosive' ? 1 : t === 'fire' ? 0.55 : t === 'arcane' ? 0.35 : t === 'lightning' ? 0.15 : t === 'ap' ? 0.1 : 0; break;
      case 'metal': m = t === 'explosive' ? 0.4 : 0; break;
      case 'barrel': m = 1; break;
      case 'crystal': m = t === 'arcane' || t === 'lightning' || t === 'explosive' ? 1 : t === 'fire' ? 0.5 : 0.25; break;
      default: m = 0;
    }
    if (m <= 0) return;
    p.hp -= info.amount * m;
    const frac = clamp(p.hp / p.maxHp, 0, 1);
    if (p.material === 'sand' || p.material === 'concrete') {
      this.props.setHeight(p.handle, p.sy * (0.45 + 0.55 * frac));
      const c = new THREE.Color(p.color).multiplyScalar(0.55 + 0.45 * frac);
      this.props.setColor(p.handle, c.getHex());
    } else if (p.material === 'wood' && p.burning > 0) {
      this.props.setColor(p.handle, new THREE.Color(0xffffff).multiplyScalar(0.4 + 0.6 * frac).getHex());
    }
    if (info.x !== undefined && info.z !== undefined && Math.random() < 0.6) {
      const col = p.material === 'sand' ? 0xc6ae80 : p.material === 'wood' ? 0x8a5a32 : p.material === 'crystal' ? 0xc79bff : 0x9a978f;
      this.particles.emit({ x: info.x, y: 0.6, z: info.z, count: 3, color: col, speed: [1, 3], life: [0.3, 0.6], size: [0.1, 0.18], gravity: 10, additive: false });
    }
    if (p.hp <= 0) this.destroyProp(p);
  }

  destroyProp(p: Prop): void {
    if (p.destroyed) return;
    p.destroyed = true;
    p.burning = 0;
    if (p.handle) this.props.hide(p.handle);
    for (const c of p.colliders) this.phys.remove(c);
    this.nav.updateRect(this.phys, p.x - 1.5, p.z - 1.5, p.x + 1.5, p.z + 1.5);
    this.stats.coverDestroyed++;
    const col = p.material === 'sand' ? [0xc6ae80, 0xa8936a] : p.material === 'wood' ? [0x8a5a32, 0x5e4024] : p.material === 'crystal' ? [0xc79bff, 0xffffff] : [0x9a978f, 0x6a6862];
    this.particles.emit({ x: p.x, y: 0.5, z: p.z, count: 16, color: col, speed: [2, 5], life: [0.4, 0.9], size: [0.15, 0.3], gravity: 12, additive: false, jitter: 0.4 });
    this.particles.smoke(p.x, 0.5, p.z, 4, 0x8a8070, 0.9);
    if (p.material === 'barrel') {
      this.explode(p.x, p.z, 3.6, 55, 'explosive', null, { faction: 'neutral', shake: 0.45, ignite: 3 });
    } else if (p.material === 'crystal') {
      this.audio.play('shockwave', { x: p.x, z: p.z });
      this.fx.shockwave(p.x, p.z, 4.5, 0xc79bff, 0.45);
      this.lights.request(p.x, 1.2, p.z, 0xb07bff, 18, 9);
      for (const a of this.actors) {
        if (a.alive && a.faction === 'army' && dist(a.x, a.z, p.x, p.z) < 4.5 + a.radius) {
          this.dealDamage(a, { amount: 35 * this.player.spellPower, type: 'arcane', source: this.player, dirX: a.x - p.x, dirZ: a.z - p.z, knockback: 3, spell: 'combo' });
        }
      }
      for (const q of this.propsList) {
        if (q !== p && !q.destroyed && (q.material === 'crystal' || q.material === 'barrel') && dist(q.x, q.z, p.x, p.z) < 4.5) {
          const qq = q;
          setTimeout(() => { if (!this.disposed) this.damageProp(qq, { amount: 999, type: 'arcane', source: null }); }, 150);
        }
      }
    } else {
      this.audio.play('coverHit', { x: p.x, z: p.z, pitch: 0.6 });
    }
  }

  alertNoise(x: number, z: number, r: number): void {
    for (const a of this.actors) {
      if (!(a instanceof VanguardEnemy) || a.alerted || !a.alive || a.alertT > 0) continue;
      if (a.zone > this.activeZone && dist(a.x, a.z, x, z) > r * 0.5) continue;
      if (dist(a.x, a.z, x, z) < r) a.alertT = rand(0.2, 0.6);
    }
  }

  floatText(x: number, y: number, z: number, text: string, color: string): void {
    this.fx.text(x, y, z, text, color, true);
  }

  banner(text: string, kind = 'info'): void {
    if (this.events.banner) this.events.banner(text, kind);
  }

  subtitle(who: string, text: string, dur = 3): void {
    if (this.events.subtitle) this.events.subtitle(who, text, dur);
  }

  radioChatter(text: string, x: number, z: number, prob = 1): void {
    if (this.chatterCd > 0 || !chance(prob)) return;
    if (dist(x, z, this.player.x, this.player.z) > 32) return;
    this.chatterCd = 7;
    this.audio.play('radio', { x, z, vol: 0.8 });
    this.subtitle('Vanguard Radio', text, 2.4);
  }

  // ------------------------------------------------------------ callbacks from entities

  onPlayerHit(dir: number, amount: number): void {
    if (this.events.hit) this.events.hit(dir, amount);
  }

  onPlayerDown(): void {
    if (this.completed) return;
    this.stats.deaths++;
    this.failT = 1.8;
    this.failReason = 'fallen';
    this.services.save.stats.deaths++;
  }

  onCatalystDestroyed(): void {
    if (this.completed || this.failed) return;
    this.banner('THE RIFT CATALYST HAS SHATTERED', 'warn');
    this.failT = 1.6;
    this.failReason = 'catalyst';
  }

  onEnemyKilled(e: VanguardEnemy, _info: DamageInfo): void {
    if (!e.structure) {
      this.stats.kills++;
      this.services.save.stats.kills++;
      if (this.mode === 'campaign' && chance(0.3)) {
        const r = Math.random();
        this.interactables.push(new Pickup(this, e.x, e.z, r < 0.5 ? 'mana' : r < 0.8 ? 'hp' : 'shard'));
      }
    }
    if (this.events.killed) this.events.killed(e);
  }

  onTankDestroyed(t: GoliathTank): void {
    setTimeout(() => {
      if (this.disposed) return;
      const out = { x: 0, z: 0 };
      this.phys.resolveCircle(t.x + 4.5, t.z + 1, 0.6, CF.MOVE, out);
      const v = this.spawnEnemy('vance', out.x, out.z, t.zone, { k: 'vance', x: out.x, z: out.z, tag: 'vance' });
      if (v) {
        v.alerted = true;
        this.particles.emit({ x: v.x, y: 1, z: v.z, count: 40, color: [0xffd84a, 0xffffff], speed: [2, 6], life: [0.3, 0.7], size: [0.2, 0.3] });
      }
      this.banner('GENERAL VANCE EJECTS!', 'big');
      this.subtitle('General Vance', 'You wrecked my Goliath, wizard. Now it\'s personal!', 3.5);
    }, 1500);
  }

  onDefendStart(c: Catalyst): void {
    const zi = this.activeZone;
    const z = this.level.zones[zi];
    for (const ev of z.events || []) {
      if (ev.on === 'defendTick') this.timers.push({ t: ev.delay || 0, ev, zone: zi });
    }
    this.defendTarget = c;
  }
  defendTarget: Actor | null = null;

  onExitPortal(): void {
    if (this.completed || this.failed) return;
    this.completed = true;
    this.audio.play('portalOpen');
    if (this.events.complete) this.events.complete();
  }

  onObjectiveDone(id: string): void {
    const zi = this.activeZone;
    for (const ev of this.level.zones[zi].events || []) {
      if (ev.on === 'objective' && ev.ref === id) this.timers.push({ t: ev.delay || 0, ev, zone: zi });
    }
  }

  onZoneComplete(zi: number): void {
    const gate = this.gateForZone(zi);
    const last = zi >= this.level.zones.length - 1;
    if (gate && !last) {
      gate.openGate(this);
      this.banner('GATEWAY UNSEALED — ADVANCE', 'big');
    }
    if (last) {
      if (this.exitPortal) {
        this.exitPortal.activate(this);
        this.objectives.portalPhase = true;
        this.banner('THE RIFT GATE IS OPEN', 'big');
        this.subtitle('High Priestess Lyra', 'Well done, Valerius. Step through the Rift Gate.', 3);
      } else if (this.mode === 'campaign') {
        this.completed = true;
        setTimeout(() => { if (!this.disposed && this.events.complete) this.events.complete(); }, 1600);
      }
    }
  }

  /** Checkpoint fast-forward helpers. */
  forceDone(it: Interactable): void {
    it.done = true;
    it.icon = null;
    if (it instanceof RiftAnchor) { it.crystal.color.setHex(0x7fd8ff); it.crystal.emissive.setHex(0x2a8ac8); }
    if (it instanceof AmmoDepot) { it.root.scale.y = 0.25; if (it.collider) this.phys.remove(it.collider); }
    if (it instanceof Generator) it.coil.emissive.setHex(0x110800);
    if (it instanceof PrisonCage) { it.prisoner.visible = false; it.openT = 2; }
    if (it instanceof ArcaneChest) it.open = 1;
  }

  forceDestroyed(a: Actor): void {
    if (a instanceof Catalyst) { a.awakened = true; a.defendT = a.duration; return; }
    a.alive = false;
    a.hp = 0;
    if (a instanceof RadioJammer) { a.root.rotation.z = 0.5; a.root.scale.y = 0.6; }
    else a.root.visible = false;
  }

  startBoss(): void {
    if (this.tank) {
      this.tank.activate();
      this.bossActor = this.tank;
    }
  }

  // ------------------------------------------------------------ update

  update(dt: number): void {
    if (this.disposed) return;
    this.time += dt;
    if (!this.completed) this.stats.time += dt;
    this.pathBudget = 4;
    if (this.grenadeCd > 0) this.grenadeCd -= dt;
    if (this.flankOrder > 0) this.flankOrder -= dt;
    if (this.chatterCd > 0) this.chatterCd -= dt;
    this.computeAim();
    this.zoneFlow(dt);
    this.timersUpdate(dt);
    for (let i = 0; i < this.actors.length; i++) {
      const a = this.actors[i];
      this.services.engine.guard('actor', () => a.update(dt));
    }
    for (const u of this.updaters) u(dt);
    this.projectiles.update(dt);
    this.spells.update(dt);
    for (const it of this.interactables) it.update(dt, this);
    for (const h of this.hazards) h.update(dt, this);
    for (const g of this.gates) g.update(dt);
    for (let i = this.dropships.length - 1; i >= 0; i--) {
      const d = this.dropships[i];
      d.update(dt, this);
      if (d.done) { d.dispose(); this.dropships.splice(i, 1); }
    }
    this.updateProps(dt);
    this.objectives.update(dt);
    this.cleanup();
    this.updateVisibility(dt);
    this.updateAtmosphere(dt);
    this.fx.update(dt);
    this.particles.update(dt);
    // camera
    const focus = this.cameraFocus || this.player;
    const im = this.input;
    this.camRig.update(dt, focus.x, focus.z, this.aimX, this.aimZ, im.moveX, im.moveY);
    this.audio.setListener(focus.x, focus.z);
    // failure countdown
    if (this.failT > 0) {
      this.failT -= dt;
      if (this.failT <= 0 && !this.failed && !this.completed) {
        this.failed = true;
        if (this.events.failed) this.events.failed(this.failReason);
      }
    }
    if (this.dev.colliders || this.dev.nav) this.refreshDebug();
    else if (this.debugBuilt) { this.debugGroup.clear(); this.debugBuilt = ''; }
    if (this.dev.los) this.drawLosCones();
  }

  private computeAim(): void {
    const inp = this.input;
    const p = this.player;
    const eng = this.services.engine;
    const assist = this.services.settings.aimAssist;
    this.aimTarget = null;
    if (inp.aimMode === 'pointer' && inp.lastDevice === 'kbm') {
      const v = this.camRig.screenToWorld(inp.pointerX, inp.pointerY, eng.width, eng.height, 1.0, this.tmpV);
      if (v) { this.aimX = v.x; this.aimZ = v.z; }
      if (assist > 0) {
        let best: Actor | null = null;
        let bd = 0.7 + assist * 2.0;
        for (const a of this.actors) {
          if (!a.alive || a.faction !== 'army' || !a.targetable || !a.seen) continue;
          const d = dist(a.x, a.z, this.aimX, this.aimZ) - a.radius * 0.5;
          if (d < bd) { bd = d; best = a; }
        }
        this.aimTarget = best;
      }
      return;
    }
    let dx = inp.aimStickX, dz = inp.aimStickY;
    const len = Math.hypot(dx, dz);
    if (len < 0.25) {
      // no stick input: auto-target nearest visible enemy, else keep facing direction
      let best: Actor | null = null;
      let bd = 16;
      for (const a of this.actors) {
        if (!a.alive || a.faction !== 'army' || !a.targetable || !a.seen) continue;
        const d = dist(a.x, a.z, p.x, p.z);
        if (d < bd && this.phys.lineOfSight(p.x, p.z, a.x, a.z)) { bd = d; best = a; }
      }
      if (best && (inp.lastDevice === 'touch' || assist > 0.3)) {
        this.aimTarget = best;
        this.aimX = best.x; this.aimZ = best.z;
      } else {
        this.aimX = p.x + Math.sin(p.facing) * 8;
        this.aimZ = p.z + Math.cos(p.facing) * 8;
      }
      return;
    }
    dx /= len; dz /= len;
    const cone = 0.12 + assist * 0.45;
    let best: Actor | null = null;
    let bs = 1e9;
    for (const a of this.actors) {
      if (!a.alive || a.faction !== 'army' || !a.targetable || !a.seen) continue;
      const ax = a.x - p.x, az = a.z - p.z;
      const d = Math.hypot(ax, az);
      if (d > 22 || d < 0.1) continue;
      const cos = (ax * dx + az * dz) / d;
      const ang = Math.acos(clamp(cos, -1, 1));
      if (ang > cone) continue;
      const s = ang * 10 + d * 0.1;
      if (s < bs) { bs = s; best = a; }
    }
    if (best && assist > 0) {
      this.aimTarget = best;
      this.aimX = best.x; this.aimZ = best.z;
    } else {
      this.aimX = p.x + dx * 12;
      this.aimZ = p.z + dz * 12;
    }
  }

  private zoneFlow(dt: number): void {
    const zs = this.level.zones;
    if (!this.firedEnter.has(this.activeZone)) {
      this.firedEnter.add(this.activeZone);
      this.queueZoneEvents(this.activeZone, 'enter');
    }
    const cur = this.objectives.zones[this.activeZone];
    if (cur && cur.complete && this.activeZone < zs.length - 1) {
      const next = zs[this.activeZone + 1];
      const [x0, z0, x1, z1] = next.rect;
      const p = this.player;
      const fx = this.cameraFocus ? this.cameraFocus.x : p.x, fz = this.cameraFocus ? this.cameraFocus.z : p.z;
      if (fx >= x0 && fx <= x1 && fz >= z0 && fz <= z1) {
        this.activeZone++;
        this.checkpointZone = this.activeZone;
        this.objectives.zones[this.activeZone].entered = true;
        this.objectives.dirty = true;
        this.banner('CHECKPOINT REACHED', 'checkpoint');
        if (this.events.checkpoint) this.events.checkpoint(this.activeZone);
      }
    }
    void dt;
  }

  private queueZoneEvents(zi: number, on: 'enter'): void {
    for (const ev of this.level.zones[zi].events || []) {
      if (ev.on === on) this.timers.push({ t: ev.delay || 0, ev, zone: zi });
      if (ev.on === 'time') this.timers.push({ t: ev.delay || 0, ev, zone: zi });
    }
  }

  private timersUpdate(dt: number): void {
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= dt;
      if (t.t <= 0) {
        this.timers.splice(i, 1);
        this.runEvent(t.ev, t.zone);
      }
    }
  }

  runEvent(ev: ZoneEvent, zone: number): void {
    const p = this.player;
    switch (ev.do) {
      case 'dropship': {
        const dx = ev.x !== undefined ? ev.x : p.x + 8, dz = ev.z !== undefined ? ev.z : p.z - 6;
        this.dropships.push(new Dropship(this, dx, dz, ev.kinds || ['trooper', 'trooper', 'trooper'], zone, ev.on === 'defendTick' ? this.defendTarget : null));
        if (ev.pan && this.events.pan) this.events.pan(dx, dz, 3.2);
        break;
      }
      case 'subtitle':
        this.subtitle(ev.who || 'High Priestess Lyra', ev.text || '', 4);
        break;
      case 'banner':
        this.banner(ev.text || '', 'info');
        break;
      case 'mortarBarrage':
        this.mortarStrike(p.x, p.z, ev.n || 4, 3.5, null);
        break;
      case 'heli': {
        const sx = (ev.x || p.x) - 30, sz = (ev.z || p.z) - 20;
        const e = this.spawnEnemy('helicopter', clamp(sx, 2, this.level.size[0] - 2), clamp(sz, 2, this.level.size[1] - 2), zone, null);
        if (e) {
          e.entering = 3;
          e.destX = ev.x || p.x;
          e.destZ = ev.z || p.z;
          e.alerted = true;
          this.banner('ATTACK HELICOPTER INBOUND', 'warn');
        }
        break;
      }
      case 'allyGolem':
        this.spawnAllyGolem(ev.x || p.x + 2, ev.z || p.z + 2, ev.n || 90);
        this.subtitle('High Priestess Lyra', 'I have woken a stone guardian to stand with you!', 3);
        break;
      case 'wave':
        for (const s of this.level.zones[zone].enemies) {
          if (s.wave === ev.wave) {
            const e = this.spawnEnemy(s.k, s.x, s.z, zone, s);
            if (e) { e.alerted = true; e.objectiveTarget = this.defendTarget; }
          }
        }
        break;
      case 'bossIntro':
        if (this.events.bossIntro) this.events.bossIntro();
        else this.startBoss();
        break;
    }
  }

  private updateProps(dt: number): void {
    for (const p of this.propsList) {
      if (p.burning <= 0 || p.destroyed) continue;
      p.burning -= dt;
      p.hp -= 18 * dt;
      if (Math.random() < dt * 18) this.particles.emit({ x: p.x + rand(-0.4, 0.4), y: 0.8, z: p.z + rand(-0.4, 0.4), count: 1, color: [0xff8a2a, 0xffd04a, 0xff3a1a], speed: [0.5, 1.5], life: [0.3, 0.7], size: [0.25, 0.45], dir: [0, 1, 0], spread: 0.3, gravity: -3 });
      if (Math.random() < dt * 4) this.particles.smoke(p.x, 1.2, p.z, 1, 0x5e5852, 0.8);
      this.lights.request(p.x, 1, p.z, 0xff8a2a, 5, 5);
      // fire spreads to adjacent soldiers
      for (const a of this.actors) if (a.alive && a.faction === 'army' && dist(a.x, a.z, p.x, p.z) < 1.3) a.ignite(1.5, 6);
      if (p.handle) this.props.setColor(p.handle, new THREE.Color(0xffffff).multiplyScalar(0.35 + 0.65 * clamp(p.hp / p.maxHp, 0, 1)).getHex());
      if (p.hp <= 0) this.destroyProp(p);
    }
  }

  private cleanup(): void {
    for (let i = this.actors.length - 1; i >= 0; i--) {
      const a = this.actors[i];
      if (a.removed) {
        a.dispose();
        this.actors.splice(i, 1);
        const j = this.allies.indexOf(a);
        if (j >= 0) this.allies.splice(j, 1);
      }
    }
    for (let i = this.interactables.length - 1; i >= 0; i--) {
      const it = this.interactables[i];
      if (it instanceof Pickup && it.done) {
        it.dispose();
        this.interactables.splice(i, 1);
      }
    }
  }

  private updateVisibility(dt: number): void {
    this.seenT -= dt;
    let heat = 0;
    const p = this.player;
    let rotor = false;
    let engine = false;
    for (const a of this.actors) {
      if (a.faction !== 'army' && !(a instanceof VanguardEnemy)) continue;
      if (a instanceof VanguardEnemy && a.alive) {
        if (a.alerted && dist(a.x, a.z, p.x, p.z) < 24) heat += a.ek === 'heavy' || a.ek === 'helicopter' ? 2 : 1;
        if (a.ek === 'helicopter') rotor = true;
      }
      if (a instanceof GoliathTank && a.phase !== 'dormant' && a.phase !== 'wrecked') { heat += 5; engine = true; }
    }
    if (this.seenT <= 0) {
      this.seenT = 0.15;
      const fx = this.cameraFocus ? this.cameraFocus.x : p.x, fz = this.cameraFocus ? this.cameraFocus.z : p.z;
      for (const a of this.actors) {
        if (a.faction === 'mage' && !(a instanceof VanguardEnemy)) { a.seen = true; continue; }
        if (a.structure || a.isBoss || !a.alive) { a.seen = true; continue; }
        const d = dist(a.x, a.z, fx, fz);
        a.seen = d < 36 && (a.flying || (a as VanguardEnemy).perch || this.phys.lineOfSight(fx, fz, a.x, a.z));
      }
    }
    this.heat += (heat - this.heat) * Math.min(1, dt * 1.5);
    this.camRig.zoomOut = Math.min(10, this.heat * 1.1) + (this.cameraFocus ? 8 : 0);
    this.music.setIntensity(this.heat / 5);
    if (!rotor) this.audio.loopVolume('rotor', 0);
    else this.audio.loopVolume('rotor', 0.45);
    if (!engine) this.audio.loopVolume('engine', 0);
  }

  private updateAtmosphere(dt: number): void {
    const th = this.level.theme;
    this.audio.loopVolume('rain', th.rain * 0.32);
    this.audio.loopVolume('rift', 0.22);
    // chanting near charged mana wells (or while channelling)
    let chant = 0;
    for (const it of this.interactables) {
      if (it.kind === 'well' && it.prompt(this)) chant = Math.max(chant, (1 - dist(it.x, it.z, this.player.x, this.player.z) / 9) * 0.18);
    }
    this.audio.loopVolume('channel', this.player.channelTarget ? 0.35 : Math.max(0, chant));
    this.boomT -= dt;
    if (this.boomT <= 0) {
      this.boomT = rand(6, 14);
      this.audio.play('distantBoom', { vol: rand(0.4, 0.9) });
      if (chance(0.3)) this.audio.play('radio', { vol: 0.3 });
    }
    for (const isl of this.islands) {
      isl.obj.position.y = isl.baseY + Math.sin(this.time * 0.5 + isl.phase) * 0.35;
      isl.obj.rotation.y += dt * 0.02;
    }
    for (const g of this.glyphs) {
      g.rotation.z += dt * 0.08;
      (g.material as THREE.MeshBasicMaterial).opacity = 0.4 + Math.sin(this.time * 1.5 + g.position.x) * 0.15;
    }
    for (const l of this.lamps) this.lights.request(l.x, 2.4, l.z, 0xffe0a0, 2.5, 6);
    for (const pool of this.pools) {
      const s = 1 + Math.sin(this.time * 2 + pool.x) * 0.012;
      pool.foam.scale.set(s, s, 1);
    }
    if (this.rain && this.rainPos) {
      const arr = this.rainPos;
      const cx = this.camRig.tx, cz = this.camRig.tz;
      for (let i = 0; i < arr.length; i += 6) {
        arr[i + 1] -= dt * 26;
        arr[i + 4] -= dt * 26;
        arr[i] += dt * 3; arr[i + 3] += dt * 3;
        if (arr[i + 4] < 0 || Math.abs(arr[i] - cx) > 22 || Math.abs(arr[i + 2] - cz) > 20) {
          const x = cx + rand(-21, 21), z = cz + rand(-19, 19), y = rand(8, 18);
          arr[i] = x; arr[i + 1] = y; arr[i + 2] = z;
          arr[i + 3] = x + 0.12; arr[i + 4] = y - 0.9; arr[i + 5] = z;
          if (y < 9 && chance(0.15)) this.particles.emit({ x, y: 0.1, z, count: 1, color: 0xbfd8ff, speed: 0.6, life: [0.1, 0.2], size: [0.1, 0.12], alpha: 0.6 });
        }
      }
      (this.rain.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  private buildRain(amount: number): void {
    const n = Math.floor(500 * amount);
    if (n <= 0) return;
    const pos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const x = rand(-21, 21), y = rand(0, 18), z = rand(-19, 19);
      pos.set([x, y, z, x + 0.12, y - 0.9, z], i * 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x9fb8e0, transparent: true, opacity: 0.45 }));
    this.rain.frustumCulled = false;
    this.rainPos = pos;
    this.scene.add(this.rain);
    this.disposables.push(g);
  }

  // ------------------------------------------------------------ debug overlays

  private refreshDebug(): void {
    const key = `${this.dev.colliders}|${this.dev.nav}|${this.phys.all.length}`;
    if (key === this.debugBuilt) return;
    this.debugBuilt = key;
    this.debugGroup.clear();
    if (this.dev.colliders) {
      const pts: number[] = [];
      for (const c of this.phys.all) {
        if (c.shape === 'box') {
          const x0 = c.x - c.hw, x1 = c.x + c.hw, z0 = c.z - c.hd, z1 = c.z + c.hd, y = 0.15;
          pts.push(x0, y, z0, x1, y, z0, x1, y, z0, x1, y, z1, x1, y, z1, x0, y, z1, x0, y, z1, x0, y, z0);
        } else {
          for (let i = 0; i < 8; i++) {
            const a0 = (i / 8) * Math.PI * 2, a1 = ((i + 1) / 8) * Math.PI * 2;
            pts.push(c.x + Math.cos(a0) * c.r, 0.15, c.z + Math.sin(a0) * c.r, c.x + Math.cos(a1) * c.r, 0.15, c.z + Math.sin(a1) * c.r);
          }
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      this.debugGroup.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x00ff88 })));
      const cp: number[] = [];
      for (const c of this.coverPoints) cp.push(c.x, 0.2, c.z);
      const g2 = new THREE.BufferGeometry();
      g2.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
      this.debugGroup.add(new THREE.Points(g2, new THREE.PointsMaterial({ color: 0x3fa9ff, size: 4, sizeAttenuation: false })));
    }
    if (this.dev.nav) {
      const pts: number[] = [];
      for (let z = 0; z < this.nav.h; z++) for (let x = 0; x < this.nav.w; x++) if (this.nav.blocked[z * this.nav.w + x]) pts.push(x + 0.5, 0.12, z + 0.5);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      this.debugGroup.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xff3355, size: 3, sizeAttenuation: false })));
    }
  }

  private drawLosCones(): void {
    for (const a of this.actors) {
      if (!(a instanceof VanguardEnemy) || !a.alive) continue;
      const r = a.def.sight;
      const c = a.seesTarget ? 0xff3030 : a.alerted ? 0xffb030 : 0x30ff90;
      for (const s of [-1, 1]) {
        const ang = a.facing + s * (a.alerted ? Math.PI : 1.35);
        this.fx.beam(`${a.id}${s}`, a.x, 0.3, a.z, a.x + Math.sin(ang) * Math.min(r, 8), 0.3, a.z + Math.cos(ang) * Math.min(r, 8), c, 0.7);
      }
      if (a.path) {
        for (let i = a.pathI; i + 3 < a.path.length; i += 2) {
          this.fx.beam(`${a.id}p${i}`, a.path[i], 0.25, a.path[i + 1], a.path[i + 2], 0.25, a.path[i + 3], 0x3fa9ff, 0.8);
        }
      }
    }
  }

  // ------------------------------------------------------------ render

  render(renderer: THREE.WebGLRenderer): void {
    const cam = this.camRig.camera;
    const eng = this.services.engine;
    cam.aspect = eng.width / eng.height;
    cam.updateProjectionMatrix();
    // shadow camera follows the view, snapped to texels to avoid shimmering
    const tx = this.camRig.tx, tz = this.camRig.tz;
    const texel = 60 / this.sun.shadow.mapSize.x;
    const sx = Math.round(tx / texel) * texel, sz = Math.round(tz / texel) * texel;
    this.sun.position.set(sx - 16, 34, sz - 12);
    this.sun.target.position.set(sx, 0, sz);
    this.sun.target.updateMatrixWorld();
    this.lights.flush(tx, tz);
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.particles.setScale(size.y, cam.fov);
    renderer.render(this.scene, cam);
  }

  dispose(): void {
    this.disposed = true;
    this.audio.stopAllLoops();
    for (const a of this.actors) a.dispose();
    for (const it of this.interactables) it.dispose();
    for (const h of this.hazards) h.dispose();
    for (const g of this.gates) g.dispose();
    for (const d of this.dropships) d.dispose();
    this.spells.clear();
    this.projectiles.dispose();
    this.particles.dispose();
    this.props.dispose();
    for (const d of this.disposables) {
      try { d.dispose(); } catch { /* ignore */ }
    }
    this.scene.clear();
  }
}

