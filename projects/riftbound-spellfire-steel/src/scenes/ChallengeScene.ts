// v1.1 — Challenge Trials: three standalone skill challenges reachable from the title menu.
//  1. Arcane Target Run   – destroy 25 military targets with Flame Burst before 90 s expire.
//  2. Barrier Survival    – survive 3 minutes of mortar + minigun fire with only Ward and Blink.
//  3. Rift Onslaught      – defeat 5 escalating waves of Vanguard troops and attack helicopters.
// Stars (1–3) are graded on clear time and damage taken; new stars convert into Crystal
// Shards for the campaign's Grimoire Sanctum. Records persist in SaveData.challenges.
import * as THREE from 'three';
import { SECONDARY_SPELLS } from '../config/balance';
import type { DamageInfo, EnemyKind, LevelData } from '../config/types';
import { VERSION } from '../config/version';
import type { Action } from '../core/Input';
import { recordPlaytest } from '../core/Save';
import type { GameState } from '../core/StateManager';
import type { Services } from '../core/Services';
import { CF } from '../core/Physics';
import { Actor } from '../entities/Actor';
import { VanguardEnemy } from '../entities/VanguardEnemy';
import type { UISystem } from '../systems/UISystem';
import { box, buildSoldier, cyl, mat, mesh, COL } from '../utils/models';
import { propTexture } from '../utils/textures';
import { clamp, dist, heading, pick, rand } from '../utils/math';
import { World, emptyStats } from './World';

export type TrialId = 'targetRun' | 'barrierSurvival' | 'riftOnslaught';

export interface TrialDef {
  id: TrialId;
  name: string;
  short: string;
  desc: string;
  rules: string;
  stars: [string, string, string];
}

export const TRIALS: TrialDef[] = [
  {
    id: 'targetRun', name: 'Arcane Target Run', short: 'Trial I',
    desc: 'Destroy 25 military targets using Flame Burst before the 90-second timer expires. Only fire damages the targets; sentry guns shoot back.',
    rules: 'Flame Burst only · 90 s limit',
    stars: ['Destroy all 25 targets in time', 'Clear in 60 s or less', 'Clear in 45 s or less taking ≤ 30 damage'],
  },
  {
    id: 'barrierSurvival', name: 'Barrier Survival', short: 'Trial II',
    desc: 'Survive 3 minutes of continuous mortar and minigun fire. No spells, no potions — only your Arcane Ward and Teleport Blink.',
    rules: 'Ward + Blink only · 3:00',
    stars: ['Survive 3 minutes', 'Take ≤ 150 damage', 'Take ≤ 70 damage'],
  },
  {
    id: 'riftOnslaught', name: 'Rift Onslaught', short: 'Trial III',
    desc: 'Defeat 5 escalating waves of mixed Vanguard troops, drones and attack helicopters. Every spell in the Grimoire is unlocked for this trial.',
    rules: 'All spells · 5 waves',
    stars: ['Defeat all 5 waves', 'Clear in 5:30 or less', 'Clear in 4:20 or less taking ≤ 200 damage'],
  },
];

export const SHARDS_PER_STAR = 40;
export const FIRST_CLEAR_SHARDS = 25;

export interface TrialResult {
  trial: TrialDef;
  victory: boolean;
  reason: string;
  time: number;
  damage: number;
  kills: number;
  stars: number;
  score: number;
  shards: number;
  newBest: boolean;
  prevStars: number;
}

// ------------------------------------------------------------------ arenas

const theme = (o: Partial<LevelData['theme']>): LevelData['theme'] => ({
  sky: '#2a1250', fog: '#24123c', fogNear: 50, fogFar: 120, hemiSky: '#d8ccff', hemiGround: '#4a3a48', hemiIntensity: 1.35,
  sun: '#ffe8d0', sunIntensity: 1.7, rain: 0, ground: 'grass', cliff: '#4a3446', riftColor: '#c04cff', ...o,
});

function arena(id: TrialId): LevelData {
  if (id === 'targetRun') {
    return {
      id: 'trial-targetRun', index: -1, name: 'Arcane Target Run', subtitle: 'Fire only, Valerius. Burn them down before the clock runs out.',
      size: [60, 44], player: [7, 22], parTime: 60, briefing: [],
      theme: theme({ rain: 0.2 }),
      ground: [
        { m: 'asphalt', shape: 'rect', x: 16, z: 4, w: 42, d: 36, edge: 0.6 },
        { m: 'paintY', shape: 'rect', x: 16, z: 15.8, w: 42, d: 0.35 },
        { m: 'paintY', shape: 'rect', x: 16, z: 28.2, w: 42, d: 0.35 },
        { m: 'paintW', shape: 'rect', x: 16, z: 4, w: 0.4, d: 36 },
        { m: 'dirt', shape: 'path', pts: [[0, 22], [16, 22]], width: 3 },
        { m: 'stone', shape: 'circle', x: 7, z: 22, r: 4 },
      ],
      zones: [{ id: 'T', name: 'Firing Range', rect: [0, 0, 60, 44], checkpoint: [7, 22], objectives: [{ id: 'trial', type: 'survive', text: 'Destroy 25 targets with Flame Burst' }], enemies: [] }],
      props: [
        { t: 'glyph', x: 7, z: 22, r: 3.5 },
        { t: 'sandbags', a: [14, 12], b: [14, 18] },
        { t: 'sandbags', a: [14, 26], b: [14, 32] },
        { t: 'barriers', a: [26, 9], b: [26, 13] },
        { t: 'barriers', a: [26, 31], b: [26, 35] },
        { t: 'crates', x: 36, z: 20, n: 2 },
        { t: 'barrels', x: 44, z: 26, n: 3 },
        { t: 'barrels', x: 40, z: 14, n: 2 },
        { t: 'tower', x: 54, z: 6 },
        { t: 'tower', x: 54, z: 38 },
        { t: 'lamp', x: 17, z: 5 }, { t: 'lamp', x: 17, z: 39 }, { t: 'lamp', x: 57, z: 22 },
        { t: 'trees', x: 0, z: 0, w: 14, d: 10, n: 6 },
        { t: 'trees', x: 0, z: 34, w: 14, d: 10, n: 6 },
        { t: 'grass', x: 0, z: 0, w: 16, d: 44, n: 140 },
        { t: 'pylon', x: 12, z: 6 }, { t: 'pylon', x: 12, z: 38 },
        { t: 'island', x: 30, z: -4, h: 11, r: 4 },
      ],
    };
  }
  if (id === 'barrierSurvival') {
    return {
      id: 'trial-barrierSurvival', index: -1, name: 'Barrier Survival', subtitle: 'No spells. Ward, blink, and keep breathing.',
      size: [46, 46], player: [23, 23], parTime: 180, briefing: [],
      theme: theme({ sky: '#3a0a50', fog: '#2a0a3a', hemiSky: '#e6c4ff', hemiGround: '#40204a', ground: 'crystal', rain: 0 }),
      ground: [
        { m: 'stone', shape: 'circle', x: 23, z: 23, r: 15, edge: 0.4 },
        { m: 'crystal', shape: 'ring', x: 23, z: 23, r: 17, r2: 15 },
        { m: 'rift', shape: 'path', pts: [[8, 8], [23, 23], [38, 38]], width: 1.2, edge: 0.3 },
      ],
      zones: [{ id: 'T', name: 'Killing Field', rect: [0, 0, 46, 46], checkpoint: [23, 23], objectives: [{ id: 'trial', type: 'survive', text: 'Survive the barrage' }], enemies: [] }],
      props: [
        { t: 'glyph', x: 23, z: 23, r: 6 },
        { t: 'rock', x: 16, z: 17, r: 1.2 }, { t: 'rock', x: 30, z: 29, r: 1.2 }, { t: 'rock', x: 29, z: 15, r: 1 },
        { t: 'rock', x: 15, z: 30, r: 1 },
        { t: 'pyramids', a: [18, 23], b: [28, 23], n: 3 },
        { t: 'sandbags', a: [21, 13], b: [25, 13] },
        { t: 'sandbags', a: [21, 33], b: [25, 33] },
        { t: 'crystal', x: 11, z: 23 }, { t: 'crystal', x: 35, z: 23 },
        { t: 'spire', x: 6, z: 40, r: 1.2 }, { t: 'spire', x: 40, z: 6, r: 1.2 },
        { t: 'island', x: 23, z: -5, h: 12, r: 4 },
      ],
    };
  }
  return {
    id: 'trial-riftOnslaught', index: -1, name: 'Rift Onslaught', subtitle: 'Five waves. Every spell you know. Hold the line.',
    size: [70, 60], player: [35, 30], parTime: 330, briefing: [],
    theme: theme({ sky: '#1f1240', fog: '#2a2040', hemiSky: '#c0c8f0', hemiGround: '#3a3020', hemiIntensity: 1.3, sun: '#dde4ff', sunIntensity: 1.35, rain: 0.8 }),
    ground: [
      { m: 'stone', shape: 'circle', x: 35, z: 30, r: 9, edge: 0.4 },
      { m: 'mud', shape: 'path', pts: [[4, 12], [66, 12]], width: 3 },
      { m: 'mud', shape: 'path', pts: [[4, 48], [66, 48]], width: 3 },
      { m: 'dirt', shape: 'path', pts: [[35, 0], [35, 60]], width: 2.5 },
    ],
    zones: [{ id: 'T', name: 'The Breach', rect: [0, 0, 70, 60], checkpoint: [35, 30], objectives: [{ id: 'trial', type: 'survive', text: 'Defeat 5 waves' }], enemies: [] }],
    props: [
      { t: 'glyph', x: 35, z: 30, r: 6 },
      { t: 'well', x: 12, z: 30 }, { t: 'well', x: 58, z: 30 },
      { t: 'sandbags', a: [20, 10], b: [26, 10] }, { t: 'sandbags', a: [44, 10], b: [50, 10] },
      { t: 'sandbags', a: [20, 50], b: [26, 50] }, { t: 'sandbags', a: [44, 50], b: [50, 50] },
      { t: 'barriers', a: [28, 20], b: [28, 24] }, { t: 'barriers', a: [42, 36], b: [42, 40] },
      { t: 'pillar', x: 29, z: 30, h: 3 }, { t: 'pillar', x: 41, z: 30, h: 3 },
      { t: 'rock', x: 18, z: 22, r: 1.3 }, { t: 'rock', x: 52, z: 38, r: 1.3 },
      { t: 'barrels', x: 10, z: 8, n: 3 }, { t: 'barrels', x: 58, z: 52, n: 3 },
      { t: 'crystal', x: 24, z: 38 }, { t: 'crystal', x: 46, z: 22 },
      { t: 'wreck', x: 14, z: 44, rot: 90, mat: 'truck' }, { t: 'wreck', x: 56, z: 16, rot: 0, mat: 'jeep' },
      { t: 'trees', x: 0, z: 0, w: 70, d: 5, n: 10, mat: 'pine' },
      { t: 'trees', x: 0, z: 55, w: 70, d: 5, n: 10, mat: 'pine' },
      { t: 'grass', x: 0, z: 0, w: 70, d: 60, n: 260 },
      { t: 'island', x: 35, z: -6, h: 13, r: 5 },
    ],
  };
}

// ------------------------------------------------------------------ trial actors

let targetTex: THREE.Texture | null = null;
function targetTexture(): THREE.Texture {
  if (targetTex) return targetTex;
  const c = document.createElement('canvas');
  c.width = 32; c.height = 32;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  for (let r = 16, i = 0; r > 0; r -= 4, i++) {
    g.fillStyle = i % 2 ? '#f2eee4' : '#c23a2e';
    g.beginPath(); g.arc(16, 16, r, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  targetTex = t;
  return t;
}

/** Military practice target: only fire / explosive damage counts. */
class TargetDummy extends Actor {
  style: 'board' | 'crate' | 'jeep';
  railA = 0;
  railB = 0;
  dir = 1;
  popT = 0;
  constructor(w: World, x: number, z: number, style: 'board' | 'crate' | 'jeep') {
    super(w, 'army');
    this.kind = 'target';
    this.name = 'Practice Target';
    this.structure = true;
    this.tag = 'trialTarget';
    this.zone = 0;
    this.style = style;
    this.x = x;
    this.z = z;
    this.exposed = true;
    if (style === 'board') {
      this.hp = this.maxHp = 28;
      this.radius = 0.7;
      mesh(box(0.15, 1.4, 0.15), mat(0x6b4a2a), this.root, 0, 0.7, 0);
      const b = mesh(cyl(0.75, 0.75, 0.1, 16), mat(0xffffff, { map: targetTexture() }), this.root, 0, 1.6, 0);
      b.rotation.x = Math.PI / 2;
    } else if (style === 'crate') {
      this.hp = this.maxHp = 40;
      this.radius = 0.8;
      mesh(box(1.4, 0.85, 0.95), mat(0xffffff, { map: propTexture('crate') }), this.root, 0, 0.42, 0);
      mesh(box(1.0, 0.7, 0.8), mat(0xffffff, { map: propTexture('crate') }), this.root, 0.1, 1.2, 0);
    } else {
      this.hp = this.maxHp = 55;
      this.radius = 1.2;
      mesh(box(1.8, 0.8, 3.0), mat(0x5b6b3a), this.root, 0, 0.7, 0);
      mesh(box(1.6, 0.6, 1.2), mat(0x3e4626), this.root, 0, 1.3, -0.4);
      mesh(cyl(0.75, 0.75, 0.1, 16), mat(0xffffff, { map: targetTexture() }), this.root, 0, 1.9, 0.6).rotation.x = Math.PI / 2;
      this.railA = 6;
      this.railB = 38;
    }
    this.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    this.root.scale.set(1, 0.01, 1);
    this.syncRoot();
  }
  protected override modifyDamage(info: DamageInfo): number {
    if (info.type === 'fire' || info.type === 'explosive') return info.amount;
    if (info.spell) this.world.floatText(this.x, 2.4, this.z, 'FIRE ONLY', '#ffb04a');
    return 0;
  }
  update(dt: number): void {
    if (!this.alive) {
      this.deathT += dt;
      this.root.scale.y = Math.max(0.01, 1 - this.deathT * 4);
      if (this.deathT > 0.4) this.removed = true;
      return;
    }
    this.tickStatus(dt);
    this.popT = Math.min(1, this.popT + dt * 4);
    this.root.scale.y = this.popT;
    if (this.style === 'jeep') {
      this.z += this.dir * 4.5 * dt;
      if (this.z > this.railB) this.dir = -1;
      if (this.z < this.railA) this.dir = 1;
      this.facing = this.dir > 0 ? 0 : Math.PI;
      this.vz = this.dir * 4.5;
    }
    this.syncRoot();
  }
  protected override onDeath(): void {
    const w = this.world;
    this.deathT = 0;
    w.particles.emit({ x: this.x, y: 1, z: this.z, count: 24, color: [0xff8a2a, 0xffd04a, 0x8a5a32], speed: [2, 6], life: [0.3, 0.7], size: [0.2, 0.35], gravity: 8 });
    w.audio.play('enemyDie', { x: this.x, z: this.z, pitch: 1.5 });
  }
}

/** Fixed minigun nest for Barrier Survival: sweeps streams of fire across the arena. */
class MinigunNest {
  w: World;
  x: number;
  z: number;
  root = new THREE.Group();
  gun: ReturnType<typeof buildSoldier>;
  phase: 'rest' | 'spin' | 'fire' = 'rest';
  t = rand(1, 4);
  ang = 0;
  sweep = 0;
  shotT = 0;
  constructor(w: World, x: number, z: number) {
    this.w = w;
    this.x = x;
    this.z = z;
    this.root.position.set(x, 0, z);
    const sand = mat(0xffffff, { map: propTexture('sandbag') });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const b = mesh(box(1.0, 0.7, 0.55), sand, this.root, Math.sin(a) * 1.6, 0.35, Math.cos(a) * 1.6);
      b.rotation.y = a + Math.PI / 2;
    }
    this.gun = buildSoldier('heavy');
    this.root.add(this.gun.root);
    this.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    w.scene.add(this.root);
    w.phys.addCircle(x, z, 2.0, CF.MOVE, null);
  }
  update(dt: number, intensity: number): void {
    const w = this.w;
    const p = w.player;
    const want = heading(p.x - this.x, p.z - this.z);
    this.t -= dt;
    if (this.phase === 'rest') {
      this.ang = want;
      if (this.t <= 0) { this.phase = 'spin'; this.t = 0.9; w.audio.play('spinUp', { x: this.x, z: this.z }); }
    } else if (this.phase === 'spin') {
      this.ang = want;
      if (this.t <= 0) { this.phase = 'fire'; this.t = 2.6 + intensity * 1.5; this.sweep = rand(-1, 1) > 0 ? 1 : -1; this.ang = want - this.sweep * 0.35; }
    } else {
      this.ang += this.sweep * dt * 0.28;
      this.shotT -= dt;
      while (this.shotT <= 0) {
        this.shotT += 1 / (9 + intensity * 5);
        const a = this.ang + (Math.random() - 0.5) * 0.12;
        const mx = this.x + Math.sin(a) * 1.6, mz = this.z + Math.cos(a) * 1.6;
        w.projectiles.fire('bullet', mx, 1.3, mz, Math.sin(a), Math.cos(a), 32, { faction: 'army', source: null, dmg: 4, type: 'bullet', range: 46, radius: 0.1 });
        w.particles.emit({ x: mx, y: 1.3, z: mz, count: 2, color: [0xffe08a, 0xffffff], speed: 2, life: [0.04, 0.08], size: [0.2, 0.3] });
        w.lights.request(mx, 1.3, mz, 0xffc060, 5, 5);
        w.audio.play('minigunShot', { x: this.x, z: this.z, vol: 0.5, throttle: 0.05 });
      }
      if (this.t <= 0) { this.phase = 'rest'; this.t = rand(2.2, 3.5) - intensity; }
    }
    this.gun.root.rotation.y = this.ang;
    if (this.gun.extra) this.gun.extra.rotation.z += dt * (this.phase === 'fire' ? 30 : this.phase === 'spin' ? 12 : 0);
  }
  dispose(): void {
    this.root.removeFromParent();
  }
}

// ------------------------------------------------------------------ scene

export interface ChallengeHost {
  services: Services;
  ui: UISystem;
  handleGlobalKeys(world: World): void;
}

const ONSLAUGHT_WAVES: { ship: EnemyKind[][]; heli: number; drones: number }[] = [
  { ship: [['trooper', 'trooper', 'trooper'], ['trooper', 'trooper']], heli: 0, drones: 0 },
  { ship: [['trooper', 'trooper', 'sniper'], ['trooper', 'trooper']], heli: 0, drones: 2 },
  { ship: [['trooper', 'trooper', 'heavy'], ['trooper', 'officer', 'trooper']], heli: 0, drones: 1 },
  { ship: [['trooper', 'trooper', 'trooper'], ['heavy', 'trooper']], heli: 1, drones: 2 },
  { ship: [['trooper', 'trooper', 'heavy'], ['trooper', 'officer', 'trooper'], ['sniper', 'trooper']], heli: 2, drones: 2 },
];

export class ChallengeScene implements GameState {
  readonly name = 'challenge';
  world: World | null = null;
  trial: TrialDef = TRIALS[0];
  ended = false;
  pausedOverlay = false;
  private host: ChallengeHost;
  private t = 0;
  // target run
  private destroyed = 0;
  private spawnedTargets = 0;
  private targetSpots: [number, number][] = [];
  // survival
  private nests: MinigunNest[] = [];
  private mortarT = 3;
  // onslaught
  private wave = 0;
  private waveBreak = 3;
  private waveActive = false;

  constructor(host: ChallengeHost) {
    this.host = host;
  }

  get svc(): Services {
    return this.host.services;
  }

  enter(params?: unknown): void {
    const id = (params as { trial: TrialId }).trial;
    this.trial = TRIALS.find((t) => t.id === id) || TRIALS[0];
    this.build();
  }

  private build(): void {
    const ui = this.host.ui;
    this.ended = false;
    this.pausedOverlay = false;
    this.t = 0;
    this.destroyed = 0;
    this.spawnedTargets = 0;
    this.nests = [];
    this.mortarT = 3;
    this.wave = 0;
    this.waveBreak = 3;
    this.waveActive = false;
    const w = new World(this.svc, arena(this.trial.id), { mode: 'challenge', stats: emptyStats() });
    this.world = w;
    w.events = {
      banner: (t, k) => ui.banner(t, k),
      subtitle: (who, t, d) => ui.subtitle(who, t, d),
      hit: (dir, amt) => ui.hit(dir, amt),
      failed: () => this.finish(false, 'fallen'),
    };
    const p = w.player;
    if (this.trial.id === 'targetRun') {
      p.loadout = ['flameBurst', 'flameBurst', 'flameBurst', 'flameBurst'];
      p.slot = 0;
      p.bombs = 0;
      for (let x = 30; x <= 52; x += 5.5) for (let z = 7; z <= 37; z += 6) this.targetSpots.push([x + rand(-1, 1), z + rand(-1, 1)]);
      for (let i = 0; i < 7; i++) this.spawnTarget();
      w.spawnEnemy('turret', 46, 8, 0, null);
      w.spawnEnemy('turret', 46, 36, 0, null);
    } else if (this.trial.id === 'barrierSurvival') {
      p.bombs = 0;
      p.hpPotions = 0;
      p.manaPotions = 0;
      this.nests.push(new MinigunNest(w, 4, 23), new MinigunNest(w, 42, 9), new MinigunNest(w, 40, 40));
    } else {
      for (const id of SECONDARY_SPELLS) p.unlockSpell(id);
    }
    w.updaters.push((dt) => this.logic(dt));
    this.svc.music.play(this.trial.id === 'riftOnslaught' ? 'boss' : 'explore');
    this.svc.input.gameplayActive = true;
    ui.hideScreens();
    ui.clearSubtitles();
    ui.showHud(true);
    ui.banner(`${this.trial.short.toUpperCase()}: ${this.trial.name.toUpperCase()}`, 'big');
    ui.subtitle('High Priestess Lyra', w.level.subtitle, 4);
    this.svc.engine.resetWarmup();
  }

  /** v1.3: touch layout for this trial — locked actions are hidden, the aim stick casts the allowed spell. */
  touchRules(): { hide: Action[]; aim: Action | null } {
    if (this.trial.id === 'targetRun') return { hide: ['bomb', 'cycle'], aim: 'fire2' };
    if (this.trial.id === 'barrierSurvival') return { hide: ['fire2', 'bomb', 'potion', 'cycle'], aim: null };
    return { hide: [], aim: 'fire1' };
  }

  /** v1.3: opt-in local playtest record of this run (Settings → Record playtest runs). */
  private record(outcome: string, res?: TrialResult): void {
    const w = this.world;
    if (!w) return;
    const time = res ? res.time : this.t;
    const ok = recordPlaytest(this.svc.save, {
      kind: 'trial', id: this.trial.id, at: Date.now(), version: VERSION, outcome,
      time: Math.round(time * 10) / 10, damage: Math.round(w.stats.damageTaken),
      stars: res ? res.stars : 0, kills: w.stats.kills + this.destroyed, score: res ? res.score : 0,
      targets: this.destroyed, wave: this.wave,
    });
    if (ok) this.svc.persist();
  }

  exit(): void {
    if (this.world && !this.ended && this.t > 1) this.record('quit');
    for (const n of this.nests) n.dispose();
    this.nests = [];
    if (this.world) this.world.dispose();
    this.world = null;
    this.svc.input.gameplayActive = false;
    this.host.ui.showHud(false);
    this.host.ui.clearSubtitles();
  }

  restart(): void {
    if (this.world && !this.ended && this.t > 1) this.record('restart');
    for (const n of this.nests) n.dispose();
    if (this.world) this.world.dispose();
    this.world = null;
    this.build();
  }

  pause(): void {
    if (!this.world || this.ended || this.pausedOverlay) return;
    this.pausedOverlay = true;
    this.svc.input.gameplayActive = false;
    this.svc.audio.stopAllLoops();
    this.host.ui.go('pause');
  }

  resume(): void {
    if (!this.pausedOverlay) return;
    this.pausedOverlay = false;
    this.svc.input.gameplayActive = true;
    this.svc.input.clearAll();
    this.host.ui.hideScreens();
  }

  private spawnTarget(): void {
    const w = this.world as World;
    if (this.spawnedTargets >= 40) return;
    const free = this.targetSpots.filter(([x, z]) => !w.actors.some((a) => a.alive && a.kind === 'target' && dist(a.x, a.z, x, z) < 3) && dist(w.player.x, w.player.z, x, z) > 6);
    if (!free.length) return;
    const [x, z] = pick(free);
    const roll = Math.random();
    const style = this.spawnedTargets > 6 && roll < 0.25 ? 'jeep' : roll < 0.6 ? 'board' : 'crate';
    const t = new TargetDummy(w, style === 'jeep' ? 33 + rand(0, 10) : x, z, style);
    w.addActor(t);
    this.spawnedTargets++;
  }

  private setLabel(text: string): void {
    const w = this.world as World;
    const o = w.objectives.zones[0].objs[0];
    if (o.label !== text) {
      o.label = text;
      w.objectives.dirty = true;
    }
  }

  /** Trial rules, run every simulation step through World.updaters. */
  private logic(dt: number): void {
    const w = this.world;
    if (!w || this.ended) return;
    this.t += dt;
    const p = w.player;
    if (this.trial.id === 'targetRun') {
      p.cd.arcaneBolt = 1; // fireball only
      for (const a of w.actors) {
        if (a.kind === 'target' && !a.alive && !(a as TargetDummy & { counted?: boolean }).counted) {
          (a as TargetDummy & { counted?: boolean }).counted = true;
          this.destroyed++;
          if (this.destroyed < 25) setTimeout(() => { if (this.world === w && !this.ended) this.spawnTarget(); }, 500);
        }
      }
      const alive = w.actors.filter((a) => a.kind === 'target' && a.alive).length;
      if (alive < 3 && this.destroyed + alive < 25) this.spawnTarget();
      const left = Math.max(0, 90 - this.t);
      this.setLabel(`Targets destroyed: ${this.destroyed} / 25`);
      if (this.destroyed >= 25) this.finish(true, 'cleared');
      else if (left <= 0) this.finish(false, 'timeout');
    } else if (this.trial.id === 'barrierSurvival') {
      p.cd.arcaneBolt = 1;
      for (const id of SECONDARY_SPELLS) p.cd[id] = 1;
      const intensity = clamp(this.t / 180, 0, 1);
      for (const n of this.nests) n.update(dt, intensity);
      this.mortarT -= dt;
      if (this.mortarT <= 0) {
        this.mortarT = 3.4 - intensity * 1.6;
        w.mortarStrike(p.x + p.vx * 0.8, p.z + p.vz * 0.8, 2 + Math.floor(intensity * 3), 3 + intensity * 2, null);
      }
      const left = Math.max(0, 180 - this.t);
      this.setLabel(`Survive: ${Math.ceil(left)}s · damage taken ${Math.round(w.stats.damageTaken)}`);
      if (left <= 0 && p.alive) this.finish(true, 'survived');
    } else {
      const hostiles = w.actors.filter((a) => a instanceof VanguardEnemy && a.alive && !a.structure).length;
      const pending = w.dropships.some((d) => d.dropped < d.kinds.length);
      if (this.waveActive && hostiles === 0 && !pending) {
        this.waveActive = false;
        this.waveBreak = 3.5;
        if (this.wave >= ONSLAUGHT_WAVES.length) { this.finish(true, 'cleared'); return; }
        w.banner(`WAVE ${this.wave} CLEARED`, 'objective');
      }
      if (!this.waveActive) {
        this.waveBreak -= dt;
        if (this.waveBreak <= 0) this.startWave();
      }
      this.setLabel(`Wave ${Math.max(1, this.wave)} / ${ONSLAUGHT_WAVES.length} · hostiles ${hostiles}`);
    }
  }

  private startWave(): void {
    const w = this.world as World;
    const def = ONSLAUGHT_WAVES[this.wave];
    this.wave++;
    this.waveActive = true;
    w.banner(`WAVE ${this.wave} / ${ONSLAUGHT_WAVES.length}`, 'big');
    const drops: [number, number][] = [[12, 12], [58, 12], [12, 48], [58, 48], [35, 8], [35, 52]];
    def.ship.forEach((kinds, i) => {
      const [x, z] = drops[(i + this.wave) % drops.length];
      setTimeout(() => { if (this.world === w && !this.ended) w.dropship(x, z, kinds); }, i * 1500);
    });
    for (let i = 0; i < def.drones; i++) {
      const e = w.spawnEnemy('drone', i % 2 ? 6 : 64, 10 + i * 8, 0, null);
      if (e) e.alerted = true;
    }
    for (let i = 0; i < def.heli; i++) {
      setTimeout(() => { if (this.world === w && !this.ended) w.runEvent({ on: 'time', do: 'heli', x: 35 + (i ? 10 : -10), z: 28 }, 0); }, 2500 + i * 3000);
    }
  }

  private finish(victory: boolean, reason: string): void {
    const w = this.world;
    if (!w || this.ended) return;
    this.ended = true;
    this.svc.input.gameplayActive = false;
    this.svc.audio.stopAllLoops();
    const res = gradeTrial(this.trial, victory, reason, this.trial.id === 'barrierSurvival' ? Math.min(180, this.t) : this.t, w.stats.damageTaken, w.stats.kills + this.destroyed);
    applyTrialReward(this.svc, res);
    this.record(victory ? 'complete' : reason, res);
    this.svc.music.play(victory ? 'victory' : 'none');
    setTimeout(() => {
      if (this.world !== w) return;
      this.host.ui.showHud(false);
      this.host.ui.go('trialResults', res);
    }, victory ? 1400 : 900);
  }

  update(dt: number): void {
    const w = this.world;
    if (!w) return;
    const inp = this.svc.input;
    if (this.pausedOverlay) {
      if (inp.pressed('pause') && this.host.ui.current === 'pause') this.resume();
      return;
    }
    if (!this.ended) {
      if (inp.pressed('pause')) { this.pause(); return; }
      if (inp.pressed('map')) { this.pause(); this.host.ui.go('map'); return; }
    }
    this.host.handleGlobalKeys(w);
    w.update(dt);
  }

  render(dt: number): void {
    const w = this.world;
    if (!w) return;
    w.render(this.svc.engine.renderer);
    const timer = this.trial.id === 'targetRun' ? Math.max(0, 90 - this.t) : this.trial.id === 'barrierSurvival' ? Math.max(0, 180 - this.t) : this.t;
    this.host.ui.update(dt, w, !this.pausedOverlay && !this.ended, timer);
  }
}

// ------------------------------------------------------------------ grading & rewards

export function gradeTrial(trial: TrialDef, victory: boolean, reason: string, time: number, damage: number, kills: number): TrialResult {
  let stars = 0;
  let score = 0;
  if (victory) {
    stars = 1;
    if (trial.id === 'targetRun') {
      if (time <= 60) stars++;
      if (time <= 45 && damage <= 30) stars++;
      score = Math.round(2500 + Math.max(0, 90 - time) * 50 - damage * 5);
    } else if (trial.id === 'barrierSurvival') {
      if (damage <= 150) stars++;
      if (damage <= 70) stars++;
      score = Math.round(10000 - damage * 20);
    } else {
      if (time <= 330) stars++;
      if (time <= 260 && damage <= 200) stars++;
      score = Math.round(kills * 100 + Math.max(0, 400 - time) * 20 - damage * 5);
    }
  }
  return { trial, victory, reason, time, damage, kills, stars, score: Math.max(0, score), shards: 0, newBest: false, prevStars: 0 };
}

/** Saves the record and converts newly earned Challenge Stars into Crystal Shards. */
export function applyTrialReward(svc: Services, r: TrialResult): void {
  const save = svc.save;
  const prev = save.challenges[r.trial.id] || { bestTime: null, bestScore: 0, stars: 0 };
  r.prevStars = prev.stars;
  if (r.victory) {
    const newStars = Math.max(0, r.stars - prev.stars);
    const first = prev.stars === 0;
    r.shards = newStars * SHARDS_PER_STAR + (first ? FIRST_CLEAR_SHARDS : 0);
    r.newBest = r.score > prev.bestScore;
    save.challenges[r.trial.id] = {
      bestTime: prev.bestTime === null ? Math.round(r.time * 10) / 10 : Math.min(prev.bestTime, Math.round(r.time * 10) / 10),
      bestScore: Math.max(prev.bestScore, r.score),
      stars: Math.max(prev.stars, r.stars),
    };
    save.shards += r.shards;
    save.shardsEarnedTotal += r.shards;
  }
  svc.persist();
}

/** Total Challenge Stars earned across all trials. */
export function totalTrialStars(svc: Services): number {
  return TRIALS.reduce((n, t) => n + ((svc.save.challenges[t.id] && svc.save.challenges[t.id].stars) || 0), 0);
}
