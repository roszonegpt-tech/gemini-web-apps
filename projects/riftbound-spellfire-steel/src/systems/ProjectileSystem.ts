// Projectiles: straight shots (arcane bolts, fireballs, rifle/minigun/sniper rounds,
// drone lasers) with swept collision against cover and actors, and arcing ordnance
// (grenades, mortar shells, rocket salvos, frost bombs) that fly over cover to a target.
import * as THREE from 'three';
import type { DmgType, Faction } from '../config/types';
import type { Actor } from '../entities/Actor';
import { CF, type ShotRules } from '../core/Physics';
import type { World } from '../scenes/World';
import { segCircle } from '../utils/math';

export type ProjKind =
  | 'bolt' | 'fireball' | 'bullet' | 'sniper' | 'laser' | 'reflect' | 'arcBolt' | 'beam'
  | 'grenade' | 'mortar' | 'rocket' | 'shell' | 'frostbomb';

export interface Projectile {
  active: boolean;
  kind: ProjKind;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  ox: number;
  oz: number;
  travelled: number;
  range: number;
  // arcs
  arc: boolean;
  sx: number;
  sz: number;
  tx: number;
  tz: number;
  t: number;
  dur: number;
  arcH: number;
  dmg: number;
  type: DmgType;
  radius: number;
  aoe: number;
  faction: Faction;
  source: Actor | null;
  spell: string | null;
  color: number;
  size: number;
  hit: boolean;
  beepT: number;
  pierce: number;
  hitIds: number[];
  /** Collider mask: plunging fire from aircraft only collides with tall geometry. */
  mask: number;
}

export interface FireOpts {
  faction: Faction;
  source?: Actor | null;
  dmg: number;
  type: DmgType;
  range?: number;
  radius?: number;
  aoe?: number;
  spell?: string | null;
  color?: number;
  size?: number;
  pierce?: number;
  plunging?: boolean;
}

const STRAIGHT_STYLE: Partial<Record<ProjKind, { tracer: boolean; color: number; size: number; len?: number }>> = {
  bolt: { tracer: false, color: 0xc78bff, size: 0.2 },
  fireball: { tracer: false, color: 0xff8a2a, size: 0.34 },
  bullet: { tracer: true, color: 0xffe9a0, size: 0.06, len: 0.9 },
  sniper: { tracer: true, color: 0xffffff, size: 0.08, len: 2.5 },
  laser: { tracer: true, color: 0xff3a3a, size: 0.08, len: 1.0 },
  reflect: { tracer: false, color: 0xff7bf2, size: 0.18 },
  arcBolt: { tracer: false, color: 0x7fd8ff, size: 0.2 },
  beam: { tracer: true, color: 0x9cffd8, size: 0.2, len: 1.6 },
};

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();
const tmpE = new THREE.Euler();

export class ProjectileSystem {
  private pool: Projectile[] = [];
  private world: World;
  private balls: THREE.InstancedMesh;
  private tracers: THREE.InstancedMesh;
  private readonly max = 420;

  constructor(world: World) {
    this.world = world;
    for (let i = 0; i < this.max; i++) this.pool.push(this.blank());
    this.balls = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), this.max);
    this.balls.frustumCulled = false;
    this.balls.count = 0;
    this.tracers = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), this.max);
    this.tracers.frustumCulled = false;
    this.tracers.count = 0;
    this.tracers.renderOrder = 22;
    // force instanceColor allocation
    this.balls.setColorAt(0, tmpC.setHex(0xffffff));
    this.tracers.setColorAt(0, tmpC.setHex(0xffffff));
    world.scene.add(this.balls, this.tracers);
  }

  private blank(): Projectile {
    return {
      active: false, kind: 'bullet', x: 0, y: 1, z: 0, vx: 0, vz: 0, ox: 0, oz: 0, travelled: 0, range: 30,
      arc: false, sx: 0, sz: 0, tx: 0, tz: 0, t: 0, dur: 1, arcH: 3,
      dmg: 0, type: 'bullet', radius: 0.1, aoe: 0, faction: 'army', source: null, spell: null, color: 0xffffff, size: 0.1,
      hit: false, beepT: 0, pierce: 0, hitIds: [], mask: CF.SHOT,
    };
  }

  private alloc(): Projectile | null {
    for (const p of this.pool) if (!p.active) return p;
    return null;
  }

  fire(kind: ProjKind, x: number, y: number, z: number, dx: number, dz: number, speed: number, o: FireOpts): Projectile | null {
    const p = this.alloc();
    if (!p) return null;
    const l = Math.hypot(dx, dz) || 1;
    const st = STRAIGHT_STYLE[kind];
    p.active = true; p.kind = kind; p.arc = false;
    p.x = x; p.y = y; p.z = z; p.ox = x; p.oz = z;
    p.vx = (dx / l) * speed; p.vz = (dz / l) * speed;
    p.travelled = 0; p.range = o.range || 30;
    p.dmg = o.dmg; p.type = o.type; p.radius = o.radius !== undefined ? o.radius : 0.12; p.aoe = o.aoe || 0;
    p.faction = o.faction; p.source = o.source || null; p.spell = o.spell || null;
    p.color = o.color !== undefined ? o.color : st ? st.color : 0xffffff;
    p.size = o.size !== undefined ? o.size : st ? st.size : 0.15;
    p.hit = false; p.pierce = o.pierce || 0; p.hitIds.length = 0;
    p.mask = o.plunging ? CF.SIGHT : CF.SHOT;
    return p;
  }

  lob(kind: ProjKind, sx: number, sz: number, tx: number, tz: number, dur: number, height: number, o: FireOpts): Projectile | null {
    const p = this.alloc();
    if (!p) return null;
    p.active = true; p.kind = kind; p.arc = true;
    p.sx = sx; p.sz = sz; p.tx = tx; p.tz = tz; p.t = 0; p.dur = dur; p.arcH = height;
    p.x = sx; p.z = sz; p.y = 1; p.ox = sx; p.oz = sz;
    p.dmg = o.dmg; p.type = o.type; p.aoe = o.aoe || 2.5; p.radius = 0.2;
    p.faction = o.faction; p.source = o.source || null; p.spell = o.spell || null;
    p.color = o.color !== undefined ? o.color : 0x333333;
    p.size = o.size !== undefined ? o.size : 0.16;
    p.hit = false; p.beepT = 0; p.pierce = 0; p.hitIds.length = 0;
    return p;
  }

  forEachActive(cb: (p: Projectile) => void): void {
    for (const p of this.pool) if (p.active) cb(p);
  }

  kill(p: Projectile): void {
    p.active = false;
  }

  clear(): void {
    for (const p of this.pool) p.active = false;
  }

  update(dt: number): void {
    const w = this.world;
    for (const p of this.pool) {
      if (!p.active) continue;
      if (p.arc) this.updateArc(p, dt);
      else this.updateStraight(p, dt);
    }
    // visuals
    let nb = 0, nt = 0;
    for (const p of this.pool) {
      if (!p.active) continue;
      const st = STRAIGHT_STYLE[p.kind];
      if (st && st.tracer) {
        const len = (st.len || 1) * (p.kind === 'beam' ? 1 : 1);
        tmpE.set(0, Math.atan2(p.vx, p.vz), 0);
        tmpQ.setFromEuler(tmpE);
        tmpM.compose(tmpP.set(p.x, p.y, p.z), tmpQ, tmpS.set(p.size, p.size, len));
        this.tracers.setMatrixAt(nt, tmpM);
        this.tracers.setColorAt(nt, tmpC.setHex(p.color));
        nt++;
      } else {
        const s = p.size;
        tmpM.compose(tmpP.set(p.x, p.y, p.z), tmpQ.identity(), tmpS.set(s, s, s));
        this.balls.setMatrixAt(nb, tmpM);
        this.balls.setColorAt(nb, tmpC.setHex(p.color));
        nb++;
        if (p.kind === 'bolt' || p.kind === 'reflect' || p.kind === 'arcBolt') {
          w.lights.request(p.x, p.y, p.z, p.color, 6, 5);
          if (Math.random() < 0.7) w.particles.emit({ x: p.x, y: p.y, z: p.z, count: 1, color: [p.color, 0xffffff], speed: 0.4, life: [0.15, 0.3], size: [0.14, 0.22], jitter: 0.05 });
        } else if (p.kind === 'fireball') {
          w.lights.request(p.x, p.y, p.z, 0xff8a2a, 10, 7);
          w.particles.emit({ x: p.x, y: p.y, z: p.z, count: 2, color: [0xff8a2a, 0xffd04a, 0xff3a1a], speed: 0.8, life: [0.2, 0.4], size: [0.25, 0.4], jitter: 0.12, gravity: -2 });
        } else if (p.kind === 'frostbomb') {
          w.lights.request(p.x, p.y, p.z, 0x7fd8ff, 4, 4);
          if (Math.random() < 0.6) w.particles.emit({ x: p.x, y: p.y, z: p.z, count: 1, color: [0x9fe8ff, 0xffffff], speed: 0.3, life: [0.2, 0.4], size: [0.12, 0.18] });
        } else if (p.kind === 'rocket') {
          w.lights.request(p.x, p.y, p.z, 0xff9a3a, 4, 4);
          w.particles.smoke(p.x, p.y, p.z, 1, 0x777777, 0.5);
        }
      }
    }
    this.balls.count = nb;
    this.tracers.count = nt;
    this.balls.instanceMatrix.needsUpdate = true;
    this.tracers.instanceMatrix.needsUpdate = true;
    if (this.balls.instanceColor) this.balls.instanceColor.needsUpdate = true;
    if (this.tracers.instanceColor) this.tracers.instanceColor.needsUpdate = true;
  }

  private updateStraight(p: Projectile, dt: number): void {
    const w = this.world;
    const nx = p.x + p.vx * dt, nz = p.z + p.vz * dt;
    // nearest actor along the segment
    let hitActor: Actor | null = null;
    let hitT = 2;
    for (const a of w.actors) {
      if (!a.alive || !a.targetable || a.faction === p.faction || a.faction === 'neutral') continue;
      if (p.hitIds.indexOf(a.id) >= 0) continue;
      const t = segCircle(p.x, p.z, nx, nz, a.x, a.z, a.radius + p.radius);
      if (t >= 0 && t < hitT) {
        hitT = t;
        hitActor = a;
      }
    }
    const rules: ShotRules = { sx: p.ox, sz: p.oz };
    if (hitActor) {
      rules.tx = hitActor.x;
      rules.tz = hitActor.z;
      rules.targetExposed = hitActor.exposed || hitActor.flying;
    }
    const mask = p.mask;
    const hit = w.phys.raycast(p.x, p.z, nx, nz, mask, rules, p.kind === 'fireball' ? 0.1 : 0);
    // flying targets: shots pass over low cover once out of it
    if (hit && (!hitActor || hit.t < hitT) && !(hitActor && hitActor.flying && (hit.collider.flags & CF.LOW) && !(hit.collider.flags & CF.SIGHT))) {
      p.x = hit.x; p.z = hit.z;
      this.impactCollider(p, hit.collider);
      return;
    }
    if (hitActor) {
      p.x = p.x + (nx - p.x) * hitT;
      p.z = p.z + (nz - p.z) * hitT;
      this.impactActor(p, hitActor);
      return;
    }
    const step = Math.hypot(nx - p.x, nz - p.z);
    p.x = nx; p.z = nz;
    p.travelled += step;
    if (p.travelled >= p.range) {
      if (p.aoe > 0) this.detonate(p);
      p.active = false;
    }
  }

  private updateArc(p: Projectile, dt: number): void {
    const w = this.world;
    p.t += dt;
    const k = Math.min(1, p.t / p.dur);
    p.x = p.sx + (p.tx - p.sx) * k;
    p.z = p.sz + (p.tz - p.sz) * k;
    if (p.kind === 'mortar') {
      // falls in from high above
      p.y = 0.3 + (1 - k) * 26;
      p.x = p.tx - (1 - k) * 3;
    } else {
      p.y = 0.8 + 4 * p.arcH * k * (1 - k);
    }
    if (p.kind === 'grenade') {
      p.beepT -= dt;
      if (p.beepT <= 0) {
        p.beepT = 0.3;
        w.audio.play('grenadeBeep', { x: p.x, z: p.z, throttle: 0 });
      }
    }
    if (k >= 1) {
      p.x = p.tx; p.z = p.tz;
      this.detonate(p);
      p.active = false;
    }
  }

  private impactCollider(p: Projectile, c: { owner: unknown; flags: number }): void {
    const w = this.world;
    const owner = c.owner as { isProp?: boolean } | null;
    if (owner && owner.isProp) {
      w.damageProp(owner as never, { amount: p.dmg, type: p.type, source: p.source, x: p.x, z: p.z, spell: p.spell as never });
    }
    if (p.kind === 'fireball' || p.aoe > 0) {
      this.detonate(p);
    } else if (p.kind === 'bolt' || p.kind === 'reflect' || p.kind === 'arcBolt') {
      w.particles.burst(p.x, p.y, p.z, [p.color, 0xffffff], 6, 4, 0.2, 0.3);
      w.audio.play('boltHit', { x: p.x, z: p.z, vol: 0.5 });
    } else {
      w.particles.burst(p.x, p.y, p.z, [0xffe9a0, 0xb0a080], 3, 3, 0.12, 0.25);
      w.particles.smoke(p.x, p.y, p.z, 1, 0x9a8f80, 0.35);
      if (Math.random() < 0.2) w.audio.play('ricochet', { x: p.x, z: p.z, throttle: 0.1 });
      else w.audio.play('coverHit', { x: p.x, z: p.z, vol: 0.5, throttle: 0.05 });
    }
    p.active = false;
  }

  private impactActor(p: Projectile, a: Actor): void {
    const w = this.world;
    // ward snap: reflect bullets back at their shooter
    if (a === w.player && p.faction === 'army' && (p.kind === 'bullet' || p.kind === 'laser' || p.kind === 'sniper') && w.player.trySnapReflect()) {
      const src = p.source;
      let dx = -p.vx, dz = -p.vz;
      if (src && src.alive) { dx = src.x - p.x; dz = src.z - p.z; }
      const sp = Math.hypot(p.vx, p.vz) * 1.1;
      const l = Math.hypot(dx, dz) || 1;
      p.vx = (dx / l) * sp; p.vz = (dz / l) * sp;
      p.faction = 'mage'; p.kind = 'reflect'; p.color = 0xff7bf2; p.size = 0.18;
      p.dmg *= 3; p.type = 'arcane'; p.source = w.player; p.ox = p.x; p.oz = p.z; p.travelled = 0; p.range = 30; p.spell = 'combo';
      return;
    }
    if (p.aoe > 0 || p.kind === 'fireball') {
      this.detonate(p);
      p.active = false;
      return;
    }
    const dealt = w.dealDamage(a, { amount: p.dmg, type: p.type, source: p.source, dirX: p.vx, dirZ: p.vz, x: p.x, z: p.z, spell: p.spell as never, knockback: p.kind === 'bolt' ? 0.4 : 0 });
    if (p.faction === 'mage' && dealt > 0) p.hit = true;
    if (p.kind === 'bolt' || p.kind === 'reflect' || p.kind === 'arcBolt') {
      w.particles.burst(p.x, p.y, p.z, [p.color, 0xffffff], 8, 5, 0.22, 0.3);
      w.audio.play('boltHit', { x: p.x, z: p.z, vol: 0.6 });
    } else if (a !== w.player) {
      w.particles.burst(p.x, p.y, p.z, 0xffe9a0, 3, 3, 0.12, 0.2);
    }
    if (p.pierce > 0) {
      p.pierce--;
      p.hitIds.push(a.id);
    } else {
      p.active = false;
    }
    if (p.spell && p.faction === 'mage') w.recordHit(p.hit);
  }

  private detonate(p: Projectile): void {
    const w = this.world;
    switch (p.kind) {
      case 'fireball':
        w.spells.fireExplosion(p.x, p.z, p.aoe, p.dmg, p.spell === 'inferno');
        w.recordHit(w.lastExplosionHits > 0);
        break;
      case 'frostbomb':
        w.spells.frostExplosion(p.x, p.z, p.aoe, p.dmg);
        break;
      case 'grenade':
      case 'mortar':
      case 'rocket':
      case 'shell':
        w.explode(p.x, p.z, p.aoe, p.dmg, 'explosive', p.source, { faction: p.faction, shake: p.kind === 'shell' ? 0.45 : 0.3 });
        break;
      default:
        w.explode(p.x, p.z, p.aoe || 1.5, p.dmg, p.type, p.source, { faction: p.faction, shake: 0.1 });
    }
  }

  dispose(): void {
    this.balls.geometry.dispose();
    this.tracers.geometry.dispose();
    this.balls.removeFromParent();
    this.tracers.removeFromParent();
  }
}
