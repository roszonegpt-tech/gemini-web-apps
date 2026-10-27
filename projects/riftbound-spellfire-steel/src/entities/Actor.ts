// Base class for everything that has health and a position: the mage, Vanguard
// soldiers and vehicles, the boss, allied golems and destructible objective structures.
import * as THREE from 'three';
import type { DamageInfo, Faction } from '../config/types';
import type { World } from '../scenes/World';

let nextId = 1;

export abstract class Actor {
  readonly id = nextId++;
  world: World;
  faction: Faction;
  kind = 'actor';
  name = '';
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vz = 0;
  radius = 0.45;
  hp = 100;
  maxHp = 100;
  alive = true;
  /** Set when the actor should be removed from the world list. */
  removed = false;
  facing = 0;
  root = new THREE.Group();
  zone = -1;
  tag: string | null = null;
  /** Structures count for objectives but not for soldier kill stats. */
  structure = false;
  flying = false;
  targetable = true;
  isBoss = false;
  /** Visible to the player (line-of-sight fog). */
  seen = true;
  seenFade = 1;
  /** Peeking out of cover: low cover next to it no longer protects it. */
  exposed = false;
  // status effects
  burnT = 0;
  burnDps = 0;
  freezeT = 0;
  stunT = 0;
  slowT = 0;
  wetT = 0;
  hitFlash = 0;
  knockX = 0;
  knockZ = 0;
  tintMats: THREE.MeshLambertMaterial[] = [];
  deathT = 0;
  scoreValue = 0;

  constructor(world: World, faction: Faction) {
    this.world = world;
    this.faction = faction;
  }

  abstract update(dt: number): void;

  get frozen(): boolean {
    return this.freezeT > 0;
  }

  get disabled(): boolean {
    return this.freezeT > 0 || this.stunT > 0;
  }

  /** Damage multiplier hook (armour, weak points). */
  protected modifyDamage(info: DamageInfo): number {
    return info.amount;
  }

  damage(info: DamageInfo): number {
    if (!this.alive || !this.targetable) return 0;
    let amt = this.modifyDamage(info);
    if (info.type === 'lightning' && this.wetT > 0) amt *= 1.5;
    if (amt <= 0) return 0;
    this.hp -= amt;
    this.hitFlash = 0.12;
    if (info.knockback && !this.structure && !this.isBoss) {
      const l = Math.hypot(info.dirX || 0, info.dirZ || 0) || 1;
      this.knockX += ((info.dirX || 0) / l) * info.knockback;
      this.knockZ += ((info.dirZ || 0) / l) * info.knockback;
    }
    this.onHurt(info, amt);
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.onDeath(info);
    }
    return amt;
  }

  protected onHurt(_info: DamageInfo, _amount: number): void {}
  protected onDeath(_info: DamageInfo): void {}

  ignite(seconds: number, dps: number): void {
    if (this.freezeT > 0) { this.freezeT = 0; return; }
    this.burnT = Math.max(this.burnT, seconds);
    this.burnDps = Math.max(this.burnDps, dps);
  }

  freeze(seconds: number): void {
    this.burnT = 0;
    this.freezeT = Math.max(this.freezeT, seconds);
  }

  /** Shared per-frame status processing. Returns false when the actor is dead. */
  tickStatus(dt: number): boolean {
    if (this.burnT > 0) {
      this.burnT -= dt;
      this.damage({ amount: this.burnDps * dt, type: 'fire', source: null });
      if (Math.random() < dt * 14) this.world.particles.emit({ x: this.x, y: this.y + 0.8, z: this.z, count: 1, color: [0xff8a2a, 0xffc04a, 0xff4a1a], speed: [0.5, 1.5], life: [0.3, 0.6], size: [0.25, 0.4], dir: [0, 1, 0], spread: 0.4, gravity: -3, jitter: this.radius });
    }
    if (this.freezeT > 0) this.freezeT -= dt;
    if (this.stunT > 0) {
      this.stunT -= dt;
      if (Math.random() < dt * 10) this.world.particles.emit({ x: this.x, y: this.y + 1.4, z: this.z, count: 1, color: 0x9fe8ff, speed: 2, life: [0.15, 0.3], size: [0.15, 0.2], jitter: 0.4 });
    }
    if (this.slowT > 0) this.slowT -= dt;
    if (this.wetT > 0) this.wetT -= dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    this.applyTint();
    return this.alive;
  }

  protected applyTint(): void {
    if (!this.tintMats.length) return;
    let e = 0x000000;
    if (this.hitFlash > 0) e = 0x883333;
    else if (this.freezeT > 0) e = 0x2a6a9a;
    else if (this.burnT > 0) e = 0x5a2a00;
    for (const m of this.tintMats) m.emissive.setHex(e);
  }

  /** Applies accumulated knockback with collision. */
  applyKnock(dt: number): void {
    if (Math.abs(this.knockX) + Math.abs(this.knockZ) < 0.01) return;
    this.moveBy(this.knockX * dt * 6, this.knockZ * dt * 6);
    const d = Math.exp(-8 * dt);
    this.knockX *= d;
    this.knockZ *= d;
  }

  private tmpOut = { x: 0, z: 0 };

  /** Moves with collision against MOVE colliders. */
  moveBy(dx: number, dz: number, mask = 1): void {
    const r = this.world.phys.resolveCircle(this.x + dx, this.z + dz, this.radius, mask, this.tmpOut);
    this.x = r.x;
    this.z = r.z;
  }

  syncRoot(): void {
    this.root.position.set(this.x, this.y, this.z);
    this.root.rotation.y = this.facing;
  }

  dispose(): void {
    this.root.removeFromParent();
  }
}
