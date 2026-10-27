// Summoned Arcane Golem ally (scripted defence events and the rescued sorcerer's
// guardian): walks to the nearest Vanguard unit, slams the ground and hurls boulders.
import type * as THREE from 'three';
import type { DamageInfo } from '../config/types';
import { CF } from '../core/Physics';
import type { World } from '../scenes/World';
import { buildGolem } from '../utils/models';
import { damp, dist, heading, turnToward } from '../utils/math';
import { Actor } from './Actor';

export class AllyGolem extends Actor {
  model = buildGolem(0.85);
  life: number;
  target: Actor | null = null;
  attackCd = 1;
  throwCd = 3;
  animT = 0;
  slamT = 0;
  path: number[] | null = null;
  pathI = 0;
  repathT = 0;

  constructor(world: World, x: number, z: number, life: number) {
    super(world, 'mage');
    this.kind = 'allyGolem';
    this.name = 'Arcane Golem';
    this.hp = this.maxHp = 600;
    this.radius = 0.9;
    this.x = x;
    this.z = z;
    this.life = life;
    this.root.add(this.model.root);
    this.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    world.particles.emit({ x, y: 1.5, z, count: 60, color: [0x7fd8ff, 0xffffff, 0x8a8496], speed: [2, 6], life: [0.4, 1], size: [0.2, 0.4], jitter: 1 });
    world.fx.glyph(x, z, 3, 0x7fd8ff, 1.2);
    world.audio.play('seal', { x, z });
    this.syncRoot();
  }

  protected override modifyDamage(info: DamageInfo): number {
    return info.type === 'bullet' ? info.amount * 0.5 : info.amount;
  }

  protected override onDeath(): void {
    const w = this.world;
    w.particles.emit({ x: this.x, y: 1.5, z: this.z, count: 50, color: [0x8a8496, 0x6a6478, 0x7fd8ff], speed: [2, 6], life: [0.5, 1], size: [0.3, 0.5], gravity: 8 });
    w.audio.play('explosion', { x: this.x, z: this.z, pitch: 1.4 });
    this.removed = true;
  }

  update(dt: number): void {
    const w = this.world;
    this.animT += dt;
    if (!this.alive) return;
    this.tickStatus(dt);
    this.life -= dt;
    if (this.life <= 0) {
      w.floatText(this.x, 3, this.z, 'GOLEM RETURNS TO STONE', '#7fd8ff');
      this.alive = false;
      this.onDeath();
      return;
    }
    this.repathT -= dt;
    this.attackCd -= dt;
    this.throwCd -= dt;
    // choose target
    if (!this.target || !this.target.alive || this.repathT <= 0) {
      let best: Actor | null = null;
      let bd = 22;
      for (const a of w.actors) {
        if (!a.alive || a.faction !== 'army' || !a.targetable || a.flying) continue;
        const d = dist(this.x, this.z, a.x, a.z);
        if (d < bd) { bd = d; best = a; }
      }
      this.target = best;
      if (best && w.pathBudget > 0) {
        w.pathBudget--;
        this.path = w.nav.findPath(this.x, this.z, best.x, best.z, w.phys);
        this.pathI = 0;
      }
      this.repathT = 1.2;
    }
    let moving = false;
    const t = this.target;
    if (t) {
      const d = dist(this.x, this.z, t.x, t.z);
      if (d < this.radius + t.radius + 1.0) {
        this.facing = turnToward(this.facing, heading(t.x - this.x, t.z - this.z), dt * 6);
        if (this.attackCd <= 0) {
          this.attackCd = 1.4;
          this.slamT = 0.4;
          w.fx.shockwave(this.x + Math.sin(this.facing) * 1.2, this.z + Math.cos(this.facing) * 1.2, 2.8, 0x7fd8ff, 0.35);
          w.audio.play('shockwave', { x: this.x, z: this.z });
          w.camRig.addTrauma(0.08);
          for (const a of w.actors) {
            if (a.alive && a.faction === 'army' && dist(a.x, a.z, this.x, this.z) < 3 + a.radius) {
              w.dealDamage(a, { amount: 45, type: 'melee', source: this, dirX: a.x - this.x, dirZ: a.z - this.z, knockback: 2, spell: 'golem' });
            }
          }
        }
      } else {
        if (d < 14 && this.throwCd <= 0 && w.phys.lineOfSight(this.x, this.z, t.x, t.z)) {
          this.throwCd = 3.5;
          this.slamT = 0.4;
          w.projectiles.lob('shell', this.x, this.z, t.x, t.z, 0.9, 2.5, { faction: 'mage', source: this, dmg: 40, type: 'explosive', aoe: 2.2, color: 0x8a8496, size: 0.4, spell: 'golem' });
        }
        if (this.path && this.pathI < this.path.length) {
          const px = this.path[this.pathI], pz = this.path[this.pathI + 1];
          if (dist(this.x, this.z, px, pz) < 0.5) this.pathI += 2;
          else {
            const dx = px - this.x, dz = pz - this.z, l = Math.hypot(dx, dz);
            this.moveBy((dx / l) * 3.6 * dt, (dz / l) * 3.6 * dt, CF.MOVE);
            this.facing = turnToward(this.facing, heading(dx, dz), dt * 5);
            moving = true;
          }
        }
      }
    } else {
      // follow the mage
      const p = w.player;
      if (dist(this.x, this.z, p.x, p.z) > 4) {
        const dx = p.x - this.x, dz = p.z - this.z, l = Math.hypot(dx, dz);
        this.moveBy((dx / l) * 3.6 * dt, (dz / l) * 3.6 * dt, CF.MOVE);
        this.facing = turnToward(this.facing, heading(dx, dz), dt * 5);
        moving = true;
      }
    }
    this.applyKnock(dt);
    // animation
    const m = this.model;
    const sw = moving ? Math.sin(this.animT * 6) * 0.5 : 0;
    m.legL.rotation.x = damp(m.legL.rotation.x, sw, 10, dt);
    m.legR.rotation.x = damp(m.legR.rotation.x, -sw, 10, dt);
    if (this.slamT > 0) this.slamT -= dt;
    const arm = this.slamT > 0 ? -2.4 + (0.4 - this.slamT) * 6 : -sw * 0.5;
    m.armL.rotation.x = damp(m.armL.rotation.x, arm, 14, dt);
    m.armR.rotation.x = damp(m.armR.rotation.x, arm, 14, dt);
    m.core.emissiveIntensity = 1.2 + Math.sin(this.animT * 4) * 0.3;
    w.lights.request(this.x, 2, this.z, 0x7fd8ff, 3, 5);
    this.syncRoot();
  }
}
