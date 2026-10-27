// Interactive world objects (mana wells, chests, rift anchors, C4 depots, generators,
// prison cages, the rift catalyst, exit gate, turret hijack points, pickups), zone gates,
// environmental hazards (barbed wire, laser tripwires, anti-magic smoke, unstable rifts,
// portal beams, searchlights) and the scripted dropship.
import * as THREE from 'three';
import { PLAYER } from '../config/balance';
import type { EnemyKind } from '../config/types';
import { CF, type Collider } from '../core/Physics';
import type { World } from '../scenes/World';
import {
  buildAnchor, buildCage, buildCatalyst, buildChest, buildDepot, buildDropship, buildGenerator, buildJammer,
  buildPortal, buildSearchlight, buildWell, glowMat, mat, box,
} from '../utils/models';
import { blobTexture } from '../utils/textures';
import { dist, pointSegDist, rand } from '../utils/math';
import { Actor } from './Actor';
import type { PlayerMage } from './PlayerMage';
import type { VanguardEnemy } from './VanguardEnemy';

export type MapIcon = 'well' | 'objective' | 'chest' | 'portal' | null;

export interface Interactable {
  kind: string;
  x: number;
  z: number;
  range: number;
  tag: string | null;
  done: boolean;
  icon: MapIcon;
  /** Prompt text, or null when not currently usable. */
  prompt(w: World): string | null;
  holdTime(w: World): number;
  interact(w: World, p: PlayerMage): void;
  update(dt: number, w: World): void;
  /** Shown as an active objective marker. */
  isObjective(): boolean;
  dispose(): void;
}

abstract class BaseInteractable implements Interactable {
  kind = 'thing';
  x: number;
  z: number;
  range = 2.4;
  tag: string | null;
  done = false;
  icon: MapIcon = null;
  root = new THREE.Group();
  collider: Collider | null = null;
  t = 0;
  constructor(w: World, x: number, z: number, tag: string | null) {
    this.x = x;
    this.z = z;
    this.tag = tag;
    this.root.position.set(x, 0, z);
    w.scene.add(this.root);
  }
  abstract prompt(w: World): string | null;
  holdTime(_w: World): number {
    return 0;
  }
  abstract interact(w: World, p: PlayerMage): void;
  update(dt: number, _w: World): void {
    this.t += dt;
  }
  isObjective(): boolean {
    return false;
  }
  dispose(): void {
    this.root.removeFromParent();
  }
  protected shadows(): void {
    this.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  }
}

// ---------------------------------------------------------------- mana well

export class ManaWell extends BaseInteractable {
  charged = true;
  recharge = 0;
  liquid: THREE.MeshLambertMaterial;
  runes: THREE.Mesh;
  constructor(w: World, x: number, z: number) {
    super(w, x, z, null);
    this.kind = 'well';
    this.icon = 'well';
    this.range = 2.6;
    const m = buildWell();
    this.liquid = m.liquid;
    this.runes = m.runes;
    this.root.add(m.root);
    this.shadows();
    this.collider = w.phys.addCircle(x, z, 1.15, CF.MOVE | CF.SHOT | CF.LOW, null);
  }
  prompt(): string | null {
    return this.charged ? 'Channel Mana Well' : null;
  }
  override holdTime(): number {
    return PLAYER.channelTime;
  }
  interact(w: World, p: PlayerMage): void {
    this.charged = false;
    this.recharge = 45;
    p.mana = p.maxMana;
    p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.5);
    p.ward = p.wardMax;
    p.hpPotions = Math.min(PLAYER.maxPotions, p.hpPotions + 1);
    p.manaPotions = Math.min(PLAYER.maxPotions, p.manaPotions + 1);
    p.bombs = Math.min(PLAYER.maxBombs, p.bombs + 1);
    w.audio.play('channelDone');
    w.fx.shockwave(this.x, this.z, 4, 0xb36bff, 0.6);
    w.particles.emit({ x: this.x, y: 1, z: this.z, count: 60, color: [0xb36bff, 0xffffff, 0x7fd8ff], speed: [2, 6], life: [0.5, 1.0], size: [0.15, 0.3], dir: [0, 1, 0], spread: 0.6, gravity: -1 });
    w.banner('MANA RESTORED', 'info');
    w.stats.wellsUsed++;
  }
  override update(dt: number, w: World): void {
    super.update(dt, w);
    if (!this.charged) {
      this.recharge -= dt;
      if (this.recharge <= 0) this.charged = true;
    }
    const k = this.charged ? 1 : 0.15;
    this.liquid.emissiveIntensity = (0.8 + Math.sin(this.t * 3) * 0.25) * k;
    (this.runes.material as THREE.MeshBasicMaterial).opacity = 0.55 * k;
    this.runes.rotation.z += dt * 0.3;
    if (this.charged) {
      w.lights.request(this.x, 1.2, this.z, 0xa45cff, 5, 7);
      if (Math.random() < dt * 6) w.particles.emit({ x: this.x, y: 0.6, z: this.z, count: 1, color: [0xb36bff, 0xd9b8ff], speed: [0.3, 1], life: [0.8, 1.4], size: [0.12, 0.2], dir: [0, 1, 0], spread: 0.2, gravity: -1.2, jitter: 0.7 });
    }
  }
}

// ---------------------------------------------------------------- chest

export class ArcaneChest extends BaseInteractable {
  lid: THREE.Group;
  glow: THREE.MeshLambertMaterial;
  open = 0;
  loot: string;
  constructor(w: World, x: number, z: number, loot: string, rot: number) {
    super(w, x, z, null);
    this.kind = 'chest';
    this.icon = 'chest';
    this.range = 2.0;
    this.loot = loot || 'mixed';
    const m = buildChest();
    this.lid = m.lid;
    this.glow = m.glow;
    this.root.add(m.root);
    this.root.rotation.y = rot;
    this.shadows();
    this.collider = w.phys.addCircle(x, z, 0.6, CF.MOVE, null);
  }
  prompt(): string | null {
    return this.done ? null : 'Open Arcane Chest';
  }
  override holdTime(): number {
    return 0.5;
  }
  interact(w: World, p: PlayerMage): void {
    this.done = true;
    this.icon = null;
    const gains: string[] = [];
    if (this.loot === 'bombs' || this.loot === 'mixed') { p.bombs = Math.min(PLAYER.maxBombs, p.bombs + 2); gains.push('+2 Frost Bombs'); }
    if (this.loot === 'potions' || this.loot === 'mixed') {
      p.hpPotions = Math.min(PLAYER.maxPotions, p.hpPotions + 1);
      p.manaPotions = Math.min(PLAYER.maxPotions, p.manaPotions + 1);
      gains.push('+1 Health / +1 Mana Potion');
    }
    const shards = this.loot === 'shards' ? 40 : 15;
    w.missionShards += shards;
    gains.push(`+${shards} Crystal Shards`);
    w.audio.play('pickup');
    w.banner(gains.join('  ·  '), 'info');
    w.particles.emit({ x: this.x, y: 0.8, z: this.z, count: 40, color: [0xffd84a, 0xffffff], speed: [2, 5], life: [0.4, 0.9], size: [0.15, 0.28], dir: [0, 1, 0], spread: 0.5, gravity: 3 });
  }
  override update(dt: number, w: World): void {
    super.update(dt, w);
    if (this.done) this.open = Math.min(1, this.open + dt * 3);
    this.lid.rotation.x = -this.open * 1.8;
    this.glow.emissiveIntensity = this.done ? 0.1 : 0.6 + Math.sin(this.t * 4) * 0.3;
    if (!this.done) w.lights.request(this.x, 1, this.z, 0xffc02a, 2.5, 4);
  }
}

// ---------------------------------------------------------------- rift anchor (seal)

export class RiftAnchor extends BaseInteractable {
  crystal: THREE.MeshLambertMaterial;
  ringA: THREE.Object3D;
  ringB: THREE.Object3D;
  constructor(w: World, x: number, z: number, tag: string | null) {
    super(w, x, z, tag);
    this.kind = 'anchor';
    this.icon = 'objective';
    this.range = 3.2;
    const m = buildAnchor();
    this.crystal = m.crystal;
    this.ringA = m.ringA;
    this.ringB = m.ringB;
    this.root.add(m.root);
    this.shadows();
    this.collider = w.phys.addCircle(x, z, 1.2, CF.MOVE | CF.SHOT | CF.LOW, null);
  }
  prompt(w: World): string | null {
    return !this.done && w.objectiveTagActive(this.tag) ? 'Seal Rift Anchor' : null;
  }
  override holdTime(): number {
    return 3.0;
  }
  interact(w: World): void {
    this.done = true;
    this.icon = null;
    this.crystal.color.setHex(0x7fd8ff);
    this.crystal.emissive.setHex(0x2a8ac8);
    w.stats.anchorsSealed++;
    w.audio.play('seal', { x: this.x, z: this.z });
    w.fx.shockwave(this.x, this.z, 8, 0x7fd8ff, 0.8);
    w.particles.emit({ x: this.x, y: 3, z: this.z, count: 90, color: [0x7fd8ff, 0xffffff, 0xb36bff], speed: [3, 9], life: [0.5, 1.2], size: [0.2, 0.4], jitter: 0.6 });
    w.camRig.addTrauma(0.3);
    w.banner('RIFT ANCHOR SEALED', 'big');
    w.alertNoise(this.x, this.z, 30);
  }
  override isObjective(): boolean {
    return !this.done;
  }
  override update(dt: number, w: World): void {
    super.update(dt, w);
    this.ringA.rotation.x = Math.PI / 2 + Math.sin(this.t) * 0.3;
    this.ringA.rotation.y += dt * (this.done ? 0.3 : 2);
    this.ringB.rotation.x = Math.PI / 2 + Math.cos(this.t * 0.8) * 0.4;
    this.ringB.rotation.z += dt * (this.done ? 0.2 : 1.5);
    this.crystal.emissiveIntensity = this.done ? 0.8 : 1.2 + Math.sin(this.t * 9) * 0.4;
    w.lights.request(this.x, 3.3, this.z, this.done ? 0x7fd8ff : 0xc04cff, this.done ? 4 : 9, 9);
    if (!this.done && Math.random() < dt * 14) {
      w.particles.emit({ x: this.x, y: 3.3, z: this.z, count: 1, color: [0xd05cff, 0xff7bf2, 0xffffff], speed: [1, 3], life: [0.4, 0.8], size: [0.15, 0.3], jitter: 0.4 });
    }
    if (!this.done && Math.random() < dt * 0.6) w.fx.lightning(this.x, 3.3, this.z, this.x + rand(-3, 3), 0.1, this.z + rand(-3, 3), 0xd05cff, 0.12, 0.6);
  }
}

// ---------------------------------------------------------------- ammo depot (C4 sabotage)

export class AmmoDepot extends BaseInteractable {
  armed = -1;
  beepT = 0;
  light: THREE.Mesh;
  constructor(w: World, x: number, z: number, tag: string | null) {
    super(w, x, z, tag);
    this.kind = 'depot';
    this.icon = 'objective';
    this.range = 3.4;
    this.root.add(buildDepot());
    this.shadows();
    this.collider = w.phys.addBox(x, z, 1.7, 1.3, CF.MOVE | CF.SHOT | CF.LOW, null);
    this.light = new THREE.Mesh(box(0.25, 0.15, 0.25), mat(0xff2020, { emissive: 0xff0000, ei: 2 }));
    this.light.position.set(0.7, 1.0, 1.1);
    this.light.visible = false;
    this.root.add(this.light);
  }
  prompt(w: World): string | null {
    return this.armed < 0 && !this.done && w.objectiveTagActive(this.tag) ? 'Plant C4 Charge' : null;
  }
  override holdTime(): number {
    return 1.5;
  }
  interact(w: World): void {
    this.armed = 4.5;
    this.light.visible = true;
    w.banner('C4 ARMED — GET CLEAR!', 'warn');
    w.fx.telegraph(this.x, this.z, 6.5, 4.5, 0xff3030);
  }
  override isObjective(): boolean {
    return !this.done;
  }
  override update(dt: number, w: World): void {
    super.update(dt, w);
    if (this.armed > 0) {
      this.armed -= dt;
      this.beepT -= dt;
      if (this.beepT <= 0) {
        this.beepT = Math.max(0.12, this.armed * 0.15);
        w.audio.play('c4Beep', { x: this.x, z: this.z, throttle: 0 });
        this.light.visible = !this.light.visible;
      }
      if (this.armed <= 0) {
        this.done = true;
        this.icon = null;
        this.light.visible = false;
        w.explode(this.x, this.z, 6.5, 90, 'explosive', w.player, { faction: 'neutral', shake: 0.9, heavy: true, ignite: 3 });
        w.audio.play('explosion', { x: this.x, z: this.z, pitch: 0.7 });
        w.fx.scorch(this.x, this.z, 5);
        this.root.scale.y = 0.25;
        if (this.collider) { w.phys.remove(this.collider); w.nav.updateRect(w.phys, this.x - 2, this.z - 2, this.x + 2, this.z + 2); }
        w.banner('AMMO DEPOT DESTROYED', 'big');
      }
    }
    if (this.done && Math.random() < dt * 8) w.particles.smoke(this.x + rand(-1, 1), 0.8, this.z + rand(-1, 1), 1, 0x4e4844, 1.2);
  }
}

// ---------------------------------------------------------------- generator (overload)

export class Generator extends BaseInteractable {
  coil: THREE.MeshLambertMaterial;
  fan: THREE.Object3D;
  overload = -1;
  constructor(w: World, x: number, z: number, tag: string | null) {
    super(w, x, z, tag);
    this.kind = 'generator';
    this.icon = 'objective';
    this.range = 3.0;
    const m = buildGenerator();
    this.coil = m.coil;
    this.fan = m.fan;
    this.root.add(m.root);
    this.shadows();
    this.collider = w.phys.addBox(x, z, 1.3, 0.9, CF.MOVE | CF.SHOT | CF.LOW, null);
  }
  prompt(w: World): string | null {
    return this.overload < 0 && !this.done && w.objectiveTagActive(this.tag) ? 'Overload Military Generator' : null;
  }
  override holdTime(): number {
    return 2.5;
  }
  interact(w: World): void {
    this.overload = 2.0;
    w.audio.play('turretHack', { x: this.x, z: this.z });
    w.banner('GENERATOR OVERLOADING', 'warn');
  }
  override isObjective(): boolean {
    return !this.done;
  }
  override update(dt: number, w: World): void {
    super.update(dt, w);
    this.fan.rotation.z += dt * (this.done ? 0 : this.overload > 0 ? 40 : 12);
    if (!this.done) {
      this.coil.emissiveIntensity = 1 + Math.sin(this.t * (this.overload > 0 ? 30 : 4)) * 0.5;
      w.lights.request(this.x, 2.2, this.z, 0xffa040, this.overload > 0 ? 10 : 3, 6);
    }
    if (this.overload > 0) {
      this.overload -= dt;
      if (Math.random() < dt * 20) w.fx.lightning(this.x, 2.2, this.z, this.x + rand(-3, 3), 0.2, this.z + rand(-3, 3), 0xffc04a, 0.1, 0.6);
      if (this.overload <= 0) {
        this.done = true;
        this.icon = null;
        this.coil.emissive.setHex(0x110800);
        w.explode(this.x, this.z, 4.5, 50, 'explosive', w.player, { faction: 'neutral', shake: 0.6, heavy: true });
        w.audio.play('explosion', { x: this.x, z: this.z });
        w.banner('GENERATOR DESTROYED', 'big');
      }
    }
    if (this.done && Math.random() < dt * 4) w.particles.smoke(this.x, 1.8, this.z, 1, 0x4e4844, 1);
  }
}

// ---------------------------------------------------------------- prison cage (rescue)

export class PrisonCage extends BaseInteractable {
  door: THREE.Object3D;
  prisoner: THREE.Group;
  openT = 0;
  constructor(w: World, x: number, z: number, tag: string | null) {
    super(w, x, z, tag);
    this.kind = 'cage';
    this.icon = 'objective';
    this.range = 2.4;
    const m = buildCage();
    this.door = m.door;
    this.prisoner = m.prisoner;
    this.root.add(m.root);
    this.shadows();
    this.collider = w.phys.addBox(x, z, 1.0, 1.0, CF.MOVE, null);
  }
  prompt(): string | null {
    return this.done ? null : 'Rescue Imprisoned Sorcerer';
  }
  override holdTime(): number {
    return 2.0;
  }
  interact(w: World): void {
    this.done = true;
    this.icon = null;
    w.audio.play('chime');
    w.banner('SORCERER RESCUED', 'big');
    w.subtitle('Sorcerer Aldren', 'Bless you, Archmage! Take my stone guardian — it will fight at your side.', 4);
    w.missionShards += 40;
    w.stats.rescued++;
    w.spawnAllyGolem(this.x + 2, this.z + 2, 70);
  }
  override isObjective(): boolean {
    return !this.done;
  }
  override update(dt: number, w: World): void {
    super.update(dt, w);
    if (this.done) {
      this.openT += dt;
      this.door.rotation.y = -Math.min(1.6, this.openT * 3);
      if (this.openT > 1.2 && this.prisoner.visible) {
        this.prisoner.visible = false;
        w.particles.emit({ x: this.x, y: 1, z: this.z, count: 40, color: [0x9cffd8, 0xffffff], speed: [1, 4], life: [0.4, 0.9], size: [0.15, 0.3], gravity: -2, jitter: 0.4 });
        w.audio.play('blink', { x: this.x, z: this.z });
      }
    } else {
      this.prisoner.rotation.y = Math.sin(this.t * 0.7) * 0.6;
    }
  }
}

// ---------------------------------------------------------------- exit gate

export class ExitPortal extends BaseInteractable {
  disc: THREE.MeshBasicMaterial;
  blocks: THREE.MeshLambertMaterial;
  active = false;
  constructor(w: World, x: number, z: number) {
    super(w, x, z, null);
    this.kind = 'portal';
    this.icon = null;
    this.range = 1.8;
    const m = buildPortal();
    this.disc = m.disc;
    this.blocks = m.blocks;
    this.root.add(m.root);
    this.shadows();
    this.collider = w.phys.addBox(x, z - 0.5, 2.4, 0.3, CF.MOVE | CF.SHOT, null);
  }
  activate(w: World): void {
    if (this.active) return;
    this.active = true;
    this.icon = 'portal';
    w.audio.play('portalOpen', { x: this.x, z: this.z });
  }
  prompt(): string | null {
    return null;
  }
  interact(): void {}
  override isObjective(): boolean {
    return this.active;
  }
  override update(dt: number, w: World): void {
    super.update(dt, w);
    const a = this.active;
    this.disc.color.setHex(a ? 0xffd84a : 0x6a5a3a);
    this.disc.opacity = a ? 0.75 + Math.sin(this.t * 5) * 0.15 : 0.55;
    this.blocks.emissiveIntensity = a ? 1 + Math.sin(this.t * 3) * 0.3 : 0.2;
    if (a) {
      w.lights.request(this.x, 2.5, this.z + 0.5, 0xffd84a, 12, 10);
      if (Math.random() < dt * 20) w.particles.emit({ x: this.x + rand(-1.4, 1.4), y: 2.5 + rand(-1.4, 1.4), z: this.z + 0.1, count: 1, color: [0xffd84a, 0xffffff], speed: 0.6, life: [0.5, 1], size: [0.15, 0.25], gravity: -0.5 });
      w.audio.loopVolume('portal', Math.max(0, 0.3 - dist(this.x, this.z, w.player.x, w.player.z) / 40));
      if (dist(this.x, this.z + 0.6, w.player.x, w.player.z) < 1.9 && w.player.alive) w.onExitPortal();
    }
  }
}

// ---------------------------------------------------------------- turret hijack point

export class TurretHack implements Interactable {
  kind = 'turretHack';
  range = 2.4;
  tag: string | null = null;
  done = false;
  icon: MapIcon = null;
  turret: VanguardEnemy;
  constructor(turret: VanguardEnemy) {
    this.turret = turret;
  }
  get x(): number { return this.turret.x; }
  get z(): number { return this.turret.z; }
  prompt(): string | null {
    return this.turret.alive && this.turret.hijacked <= 0 ? 'Enchant Turret' : null;
  }
  holdTime(): number {
    return 1.2;
  }
  interact(): void {
    this.turret.hijack();
  }
  update(): void {}
  isObjective(): boolean {
    return false;
  }
  dispose(): void {}
}

// ---------------------------------------------------------------- pickups

export class Pickup implements Interactable {
  kind: string;
  x: number;
  z: number;
  range = 0;
  tag: string | null = null;
  done = false;
  icon: MapIcon = null;
  mesh: THREE.Mesh;
  t = 0;
  constructor(w: World, x: number, z: number, kind: 'mana' | 'hp' | 'shard') {
    this.kind = kind;
    this.x = x;
    this.z = z;
    const color = kind === 'mana' ? 0xb36bff : kind === 'hp' ? 0x5dff9a : 0xffd84a;
    this.mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), mat(color, { emissive: color, ei: 1.2 }));
    this.mesh.position.set(x, 0.6, z);
    w.scene.add(this.mesh);
  }
  prompt(): string | null { return null; }
  holdTime(): number { return 0; }
  interact(): void {}
  isObjective(): boolean { return false; }
  update(dt: number, w: World): void {
    this.t += dt;
    const p = w.player;
    const d = dist(this.x, this.z, p.x, p.z);
    if (d < 4 && p.alive) {
      this.x += (p.x - this.x) * Math.min(1, dt * 6);
      this.z += (p.z - this.z) * Math.min(1, dt * 6);
    }
    this.mesh.position.set(this.x, 0.6 + Math.sin(this.t * 4) * 0.15, this.z);
    this.mesh.rotation.y += dt * 3;
    if (d < 0.9 && p.alive) {
      this.done = true;
      if (this.kind === 'mana') { p.mana = Math.min(p.maxMana, p.mana + 12); w.floatText(p.x, 2.2, p.z, '+12', '#c78bff'); }
      else if (this.kind === 'hp') { p.hp = Math.min(p.maxHp, p.hp + 10); w.floatText(p.x, 2.2, p.z, '+10', '#5dff9a'); }
      else { w.missionShards += 5; w.floatText(p.x, 2.2, p.z, '+5 ✦', '#ffd84a'); }
      w.audio.play('pickup', { vol: 0.5 });
    }
    if (this.t > 20) this.done = true;
  }
  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
  }
}

// ---------------------------------------------------------------- destructible objective structures

export class RadioJammer extends Actor {
  dish: THREE.Object3D;
  light: THREE.MeshLambertMaterial;
  collider: Collider;
  animT = 0;
  constructor(w: World, x: number, z: number, tag: string | null) {
    super(w, 'army');
    this.kind = 'jammer';
    this.name = 'Radio Jammer';
    this.structure = true;
    this.tag = tag;
    this.hp = this.maxHp = 200;
    this.radius = 0.9;
    this.x = x;
    this.z = z;
    const m = buildJammer();
    this.dish = m.dish;
    this.light = m.light;
    this.root.add(m.root);
    this.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    this.collider = w.phys.addCircle(x, z, 0.85, CF.MOVE, this);
    this.syncRoot();
  }
  update(dt: number): void {
    this.animT += dt;
    if (!this.alive) return;
    this.tickStatus(dt);
    this.dish.rotation.y += dt * 0.8;
    const on = Math.floor(this.animT * 2) % 2 === 0;
    this.light.emissiveIntensity = on ? 2 : 0.2;
    if (on) this.world.lights.request(this.x, 5.3, this.z, 0xff2020, 3, 5);
    if (Math.random() < dt * 0.3) this.world.audio.play('radio', { x: this.x, z: this.z, vol: 0.5, throttle: 2 });
  }
  protected override onDeath(): void {
    const w = this.world;
    w.explode(this.x, this.z, 3.2, 25, 'explosive', this, { faction: 'neutral', shake: 0.4 });
    this.root.rotation.z = 0.5;
    this.root.scale.y = 0.6;
    this.light.emissiveIntensity = 0;
    w.banner('RADIO JAMMER DESTROYED', 'big');
  }
}

export class Catalyst extends Actor {
  model: ReturnType<typeof buildCatalyst>;
  awakened = false;
  defendT = 0;
  duration = 60;
  animT = 0;
  collider: Collider;
  constructor(w: World, x: number, z: number, tag: string | null) {
    super(w, 'mage');
    this.kind = 'catalyst';
    this.name = 'Rift Crystal Catalyst';
    this.structure = true;
    this.tag = tag;
    this.hp = this.maxHp = 700;
    this.radius = 1.5;
    this.x = x;
    this.z = z;
    this.model = buildCatalyst();
    this.root.add(this.model.root);
    this.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    this.collider = w.phys.addCircle(x, z, 1.5, CF.MOVE | CF.SHOT | CF.LOW, this);
    this.syncRoot();
  }
  update(dt: number): void {
    this.animT += dt;
    const w = this.world;
    if (!this.alive) return;
    this.model.gem.rotation.y += dt * (this.awakened ? 2 : 0.5);
    this.model.gem.position.y = 2.4 + Math.sin(this.animT * 2) * 0.15;
    this.model.rings[0].rotation.x = Math.PI / 2 + Math.sin(this.animT) * 0.4;
    this.model.rings[1].rotation.y += dt;
    this.model.mat.emissiveIntensity = (this.awakened ? 1.6 : 0.9) + Math.sin(this.animT * 4) * 0.3;
    if (this.hitFlash > 0) { this.hitFlash -= dt; this.model.mat.emissive.setHex(0xff4040); } else this.model.mat.emissive.setHex(0x3fb8ff);
    w.lights.request(this.x, 2.6, this.z, 0x7fd8ff, this.awakened ? 12 : 5, 10);
    if (this.awakened && this.defendT < this.duration) {
      this.defendT += dt;
      if (Math.random() < dt * 20) w.particles.emit({ x: this.x, y: 2.4, z: this.z, count: 1, color: [0x7fd8ff, 0xffffff], speed: [2, 4], life: [0.4, 0.8], size: [0.15, 0.3], dir: [0, 1, 0], spread: 0.4, gravity: -3 });
    }
  }
  protected override onHurt(): void {
    this.world.audio.play('shieldHit', { x: this.x, z: this.z, throttle: 0.15, vol: 0.6 });
  }
  protected override onDeath(): void {
    const w = this.world;
    w.explode(this.x, this.z, 4, 0, 'arcane', this, { faction: 'neutral', shake: 0.8, color: [0x7fd8ff, 0xffffff] });
    this.root.visible = false;
    w.onCatalystDestroyed();
  }
}

export class CatalystAwaken implements Interactable {
  kind = 'catalystAwaken';
  range = 3.8;
  tag: string | null;
  done = false;
  icon: MapIcon = 'objective';
  c: Catalyst;
  duration: number;
  constructor(c: Catalyst, duration: number) {
    this.c = c;
    this.tag = c.tag;
    this.duration = duration;
  }
  get x(): number { return this.c.x; }
  get z(): number { return this.c.z; }
  prompt(w: World): string | null {
    return !this.c.awakened && this.c.alive && w.objectiveTagActive(this.tag) ? 'Awaken the Rift Catalyst' : null;
  }
  holdTime(): number { return 1.5; }
  interact(w: World): void {
    this.c.awakened = true;
    this.c.duration = this.duration;
    this.done = true;
    this.icon = null;
    w.audio.play('seal', { x: this.x, z: this.z });
    w.banner(`DEFEND THE CATALYST — ${this.duration}s`, 'warn');
    w.onDefendStart(this.c);
  }
  update(): void {}
  isObjective(): boolean { return !this.c.awakened; }
  dispose(): void {}
}

// ---------------------------------------------------------------- zone gate

export class Gate {
  isGate = true;
  type: 'barrier' | 'riftwall';
  ax: number; az: number; bx: number; bz: number;
  open = false;
  collider: Collider;
  group = new THREE.Group();
  wallMat: THREE.MeshBasicMaterial | null = null;
  openT = 0;
  constructor(w: World, type: 'barrier' | 'riftwall', a: [number, number], b: [number, number]) {
    this.type = type;
    [this.ax, this.az] = a;
    [this.bx, this.bz] = b;
    const cx = (this.ax + this.bx) / 2, cz = (this.az + this.bz) / 2;
    const hw = Math.max(0.5, Math.abs(this.bx - this.ax) / 2), hd = Math.max(0.5, Math.abs(this.bz - this.az) / 2);
    this.collider = w.phys.addBox(cx, cz, hw, hd, CF.MOVE | CF.SHOT | CF.SIGHT | CF.FLY, this);
    const len = Math.max(hw, hd) * 2;
    const vertical = hd > hw;
    this.group.position.set(cx, 0, cz);
    if (vertical) this.group.rotation.y = Math.PI / 2;
    if (type === 'riftwall') {
      this.wallMat = new THREE.MeshBasicMaterial({ color: 0xc04cff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false });
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(len, 4.5, 8, 2), this.wallMat);
      wall.position.y = 2.25;
      this.group.add(wall);
      for (let i = 0; i <= 1; i++) {
        const post = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), mat(0xc04cff, { emissive: 0xa03cff, ei: 1.3 }));
        post.position.set((i ? 1 : -1) * len / 2, 2.4, 0);
        post.scale.set(0.8, 3, 0.8);
        this.group.add(post);
      }
    } else {
      const n = Math.max(1, Math.round(len / 2));
      for (let i = 0; i < n; i++) {
        const x = -len / 2 + (i + 0.5) * (len / n);
        const blk = new THREE.Mesh(box(len / n - 0.1, 2.6, 0.9), mat(0x8f8d86));
        blk.position.set(x, 1.3, 0);
        blk.castShadow = true;
        this.group.add(blk);
        const band = new THREE.Mesh(box(len / n - 0.05, 0.35, 0.95), mat(0xd9b23a));
        band.position.set(x, 2.1, 0);
        this.group.add(band);
      }
      const wire = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 3, 8), mat(0x8a8d92));
      for (let i = 0; i < n * 2; i++) {
        const c = wire.clone();
        c.position.set(-len / 2 + (i + 0.5) * (len / (n * 2)), 2.9, 0);
        c.rotation.y = Math.PI / 2;
        this.group.add(c);
      }
    }
    w.scene.add(this.group);
  }
  openGate(w: World): void {
    if (this.open) return;
    this.open = true;
    w.phys.remove(this.collider);
    const minX = Math.min(this.ax, this.bx) - 1, maxX = Math.max(this.ax, this.bx) + 1;
    const minZ = Math.min(this.az, this.bz) - 1, maxZ = Math.max(this.az, this.bz) + 1;
    w.nav.updateRect(w.phys, minX, minZ, maxX, maxZ);
    const cx = (this.ax + this.bx) / 2, cz = (this.az + this.bz) / 2;
    if (this.type === 'barrier') {
      w.explode(cx, cz, 2, 0, 'explosive', null, { faction: 'neutral', shake: 0.5 });
      for (let i = 0; i < 6; i++) w.particles.smoke(cx + rand(-2, 2), 1, cz + rand(-2, 2), 4, 0x8a8580, 1.4);
      w.audio.play('explosion', { x: cx, z: cz });
    } else {
      w.audio.play('portalOpen', { x: cx, z: cz });
      w.particles.emit({ x: cx, y: 2, z: cz, count: 80, color: [0xc04cff, 0xffffff], speed: [1, 4], life: [0.5, 1.2], size: [0.2, 0.35], jitter: 3, gravity: -1 });
    }
  }
  update(dt: number): void {
    if (this.open) {
      this.openT += dt;
      if (this.type === 'barrier') {
        this.group.position.y = -Math.min(3.2, this.openT * 3);
      } else if (this.wallMat) {
        this.wallMat.opacity = Math.max(0, 0.45 - this.openT);
      }
      if (this.openT > 1.5) this.group.visible = false;
    } else if (this.wallMat) {
      this.wallMat.opacity = 0.35 + Math.sin(performance.now() / 300) * 0.1;
    }
  }
  dispose(): void {
    this.group.removeFromParent();
  }
}

// ---------------------------------------------------------------- hazards

export interface Hazard {
  update(dt: number, w: World): void;
  dispose(): void;
}

export class BarbedWire implements Hazard {
  constructor(public ax: number, public az: number, public bx: number, public bz: number) {}
  update(dt: number, w: World): void {
    const p = w.player;
    if (!p.alive || p.mounted) return;
    if (pointSegDist(p.x, p.z, this.ax, this.az, this.bx, this.bz) < 0.7) {
      p.slowT = 0.25;
      w.dealDamage(p, { amount: 7 * dt, type: 'melee', source: null });
    }
  }
  dispose(): void {}
}

export class LaserTripwire implements Hazard {
  armedT = 0;
  posts: THREE.Group;
  constructor(w: World, public ax: number, public az: number, public bx: number, public bz: number) {
    this.posts = new THREE.Group();
    for (const [x, z] of [[ax, az], [bx, bz]]) {
      const post = new THREE.Mesh(box(0.2, 1.0, 0.2), mat(0x3a3e45));
      post.position.set(x, 0.5, z);
      post.castShadow = true;
      this.posts.add(post);
      const eye = new THREE.Mesh(box(0.12, 0.12, 0.12), mat(0xff2020, { emissive: 0xff0000, ei: 2 }));
      eye.position.set(x, 0.85, z);
      this.posts.add(eye);
    }
    w.scene.add(this.posts);
  }
  update(dt: number, w: World): void {
    if (this.armedT > 0) { this.armedT -= dt; return; }
    w.fx.beam(this, this.ax, 0.85, this.az, this.bx, 0.85, this.bz, 0xff2020, 0.8);
    const p = w.player;
    if (p.alive && !p.mounted && pointSegDist(p.x, p.z, this.ax, this.az, this.bx, this.bz) < p.radius + 0.05) {
      this.armedT = 9;
      w.audio.play('alarm');
      w.banner('TRIPWIRE ALARM — MORTARS INCOMING', 'warn');
      w.mortarStrike(p.x, p.z, 4, 3.5, null);
      w.alertNoise(p.x, p.z, 40);
    }
  }
  dispose(): void {
    this.posts.removeFromParent();
  }
}

export class AntiMagicSmoke implements Hazard {
  clearT = 0;
  constructor(public x: number, public z: number, public r: number) {}
  active(): boolean {
    return this.clearT <= 0;
  }
  update(dt: number, w: World): void {
    if (this.clearT > 0) { this.clearT -= dt; return; }
    if (w.spells.inVortex(this.x, this.z) || w.spells.vortexes.some((v) => dist(v.x, v.z, this.x, this.z) < this.r + v.r)) {
      this.clearT = 12;
      w.floatText(this.x, 2, this.z, 'SMOKE DISPERSED', '#9cffd8');
      return;
    }
    if (Math.random() < dt * 14 * w.particles.density) {
      const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * this.r;
      w.particles.emit({ x: this.x + Math.cos(a) * rr, y: 0.4, z: this.z + Math.sin(a) * rr, count: 1, color: [0x8d8a99, 0x75727f, 0x9d97b0], speed: [0.2, 0.6], life: [2, 3.5], size: [1.6, 2.4], dir: [0, 1, 0], spread: 0.8, gravity: -0.15, additive: false, grow: 1.4, alpha: 0.4 });
    }
  }
  inside(x: number, z: number): boolean {
    return this.active() && dist(x, z, this.x, this.z) < this.r;
  }
  dispose(): void {}
}

export class RiftHazard implements Hazard {
  t = rand(0, 3);
  disc: THREE.Mesh;
  constructor(w: World, public x: number, public z: number, public r: number) {
    const m = new THREE.MeshBasicMaterial({ map: blobTexture(), color: 0xc04cff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
    this.disc = new THREE.Mesh(new THREE.PlaneGeometry(r * 2.2, r * 2.2), m);
    this.disc.rotation.x = -Math.PI / 2;
    this.disc.position.set(x, 0.05, z);
    w.scene.add(this.disc);
  }
  update(dt: number, w: World): void {
    this.t += dt;
    const cycle = this.t % 4;
    (this.disc.material as THREE.MeshBasicMaterial).opacity = 0.3 + (cycle > 2.8 ? 0.5 : 0.1 * Math.sin(this.t * 5));
    if (Math.random() < dt * 5) w.particles.emit({ x: this.x + rand(-this.r, this.r) * 0.7, y: 0.2, z: this.z + rand(-this.r, this.r) * 0.7, count: 1, color: [0xc04cff, 0xff7bf2], speed: [1, 3], life: [0.3, 0.6], size: [0.15, 0.25], dir: [0, 1, 0], spread: 0.3 });
    if (cycle > 2.8 && cycle - dt <= 2.8) w.fx.telegraph(this.x, this.z, this.r, 1.2, 0xc04cff);
    if (cycle < dt && this.t > 1) {
      w.fx.shockwave(this.x, this.z, this.r, 0xc04cff, 0.4);
      for (let i = 0; i < 3; i++) w.fx.lightning(this.x, 0.2, this.z, this.x + rand(-this.r, this.r), 2.5, this.z + rand(-this.r, this.r), 0xd05cff, 0.15, 0.8);
      w.audio.play('lightning', { x: this.x, z: this.z, vol: 0.6 });
      for (const a of w.actors) {
        if (a.alive && !a.flying && !a.structure && dist(a.x, a.z, this.x, this.z) < this.r + a.radius) w.dealDamage(a, { amount: 18, type: 'rift', source: null, x: this.x, z: this.z });
      }
    }
  }
  dispose(): void {
    this.disc.removeFromParent();
  }
}

export class PortalBeam implements Hazard {
  angle: number;
  beam: THREE.Mesh;
  constructor(w: World, public cx: number, public cz: number, public r: number, public speed: number) {
    this.angle = rand(0, Math.PI * 2);
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 30, 10, 1, true), glowMat(0xd05cff, 0.35));
    this.beam.position.y = 15;
    w.scene.add(this.beam);
  }
  update(dt: number, w: World): void {
    this.angle += dt * this.speed;
    const x = this.cx + Math.cos(this.angle) * this.r, z = this.cz + Math.sin(this.angle) * this.r;
    this.beam.position.set(x, 15, z);
    (this.beam.material as THREE.MeshBasicMaterial).opacity = 0.3 + Math.sin(performance.now() / 90) * 0.08;
    w.lights.request(x, 1.5, z, 0xd05cff, 10, 8);
    if (Math.random() < dt * 20) w.particles.emit({ x, y: 0.3, z, count: 1, color: [0xd05cff, 0xffffff], speed: [2, 4], life: [0.2, 0.5], size: [0.2, 0.3], jitter: 0.8 });
    for (const a of w.actors) {
      if (a.alive && !a.flying && !a.structure && dist(a.x, a.z, x, z) < 1.1 + a.radius) w.dealDamage(a, { amount: 30 * dt, type: 'rift', source: null, x, z });
    }
  }
  dispose(): void {
    this.beam.removeFromParent();
  }
}

export class Searchlight implements Hazard {
  head: THREE.Group;
  root: THREE.Group;
  t = rand(0, 6);
  cool = 0;
  constructor(w: World, public x: number, public z: number, public baseRot: number) {
    const m = buildSearchlight();
    this.root = m.root;
    this.head = m.head;
    this.root.position.set(x, 0, z);
    w.scene.add(this.root);
    w.phys.addCircle(x, z, 0.5, CF.MOVE | CF.SHOT | CF.LOW, null);
  }
  update(dt: number, w: World): void {
    this.t += dt;
    const a = this.baseRot + Math.sin(this.t * 0.45) * 0.9;
    this.head.rotation.y = a;
    const gx = this.x + Math.sin(a) * 7, gz = this.z + Math.cos(a) * 7;
    w.lights.request(gx, 2.5, gz, 0xfff2b0, 8, 7);
    if (this.cool > 0) { this.cool -= dt; return; }
    const p = w.player;
    if (p.alive && dist(p.x, p.z, gx, gz) < 2.4) {
      this.cool = 6;
      w.floatText(p.x, 2.6, p.z, 'SPOTTED!', '#fff2b0');
      w.audio.play('alarm', { vol: 0.6 });
      w.alertNoise(p.x, p.z, 30);
    }
  }
  dispose(): void {
    this.root.removeFromParent();
  }
}

// ---------------------------------------------------------------- dropship (scripted reinforcements)

export class Dropship {
  root: THREE.Group;
  fans: THREE.Object3D[];
  phase: 'in' | 'hover' | 'out' = 'in';
  t = 0;
  sx: number; sz: number; tx: number; tz: number;
  kinds: EnemyKind[];
  dropped = 0;
  done = false;
  zone: number;
  objectiveTarget: Actor | null;
  constructor(w: World, tx: number, tz: number, kinds: EnemyKind[], zone: number, objectiveTarget: Actor | null) {
    const m = buildDropship();
    this.root = m.root;
    this.fans = m.fans;
    this.tx = tx;
    this.tz = tz;
    this.sx = tx - 40;
    this.sz = tz - 30;
    this.kinds = kinds;
    this.zone = zone;
    this.objectiveTarget = objectiveTarget;
    this.root.position.set(this.sx, 14, this.sz);
    this.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    w.scene.add(this.root);
    w.audio.play('dropship', { x: tx, z: tz });
    w.banner('ENEMY DROPSHIP INBOUND', 'warn');
  }
  update(dt: number, w: World): void {
    this.t += dt;
    for (const f of this.fans) f.rotation.y += dt * 30;
    if (this.phase === 'in') {
      const k = Math.min(1, this.t / 3);
      const e = 1 - (1 - k) * (1 - k);
      this.root.position.set(this.sx + (this.tx - this.sx) * e, 14 - 7 * e, this.sz + (this.tz - this.sz) * e);
      this.root.rotation.y = Math.atan2(this.tx - this.sx, this.tz - this.sz);
      if (k >= 1) { this.phase = 'hover'; this.t = 0; }
    } else if (this.phase === 'hover') {
      this.root.position.y = 7 + Math.sin(this.t * 2) * 0.2;
      w.particles.emit({ x: this.tx + rand(-3, 3), y: 0.2, z: this.tz + rand(-3, 3), count: 1, color: 0x9a9080, speed: [2, 4], life: [0.4, 0.8], size: [0.5, 0.9], dir: [0, 0.3, 0], spread: 1, additive: false, alpha: 0.5, grow: 2 });
      const per = 2.4 / Math.max(1, this.kinds.length);
      while (this.dropped < this.kinds.length && this.t > this.dropped * per + 0.3) {
        const k = this.kinds[this.dropped++];
        const a = (this.dropped / this.kinds.length) * Math.PI * 2;
        const e = w.spawnEnemy(k, this.tx + Math.cos(a) * 1.8, this.tz + Math.sin(a) * 1.8, this.zone, null);
        if (e) {
          e.alerted = true;
          e.objectiveTarget = this.objectiveTarget;
          w.particles.emit({ x: e.x, y: 3, z: e.z, count: 8, color: 0xd8d0b0, speed: 1, life: [0.3, 0.6], size: [0.2, 0.3], dir: [0, -1, 0], spread: 0.3 });
        }
      }
      if (this.t > 2.8) { this.phase = 'out'; this.t = 0; }
    } else {
      const k = this.t / 3;
      this.root.position.set(this.tx + k * k * 45, 7 + k * 12, this.tz - k * k * 20);
      if (k >= 1) this.done = true;
    }
    w.lights.request(this.root.position.x, this.root.position.y - 1, this.root.position.z, 0xff3030, 3, 6);
  }
  dispose(): void {
    this.root.removeFromParent();
  }
}
