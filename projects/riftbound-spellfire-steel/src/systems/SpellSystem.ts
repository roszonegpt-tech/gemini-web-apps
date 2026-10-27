// Spell casting and lingering spell effects. Spells: Arcane Bolt (primary), Flame Burst /
// Inferno Fireball, Chain Lightning, Vortex Surge, Meteor Strike, Frost Bomb (consumable).
// Combination system: Flame Burst into a Vortex = Firestorm; Arcane Bolt into a frozen
// soldier = Crystal Spikes; Chain Lightning on wet soldiers deals +50%.
import * as THREE from 'three';
import { PLAYER, SPELLS } from '../config/balance';
import type { SecondarySpellId } from '../config/types';
import type { Actor } from '../entities/Actor';
import type { PlayerMage } from '../entities/PlayerMage';
import type { World } from '../scenes/World';
import { clamp, dist } from '../utils/math';
import { glowMat, octa } from '../utils/models';

interface Vortex {
  x: number;
  z: number;
  r: number;
  t: number;
  life: number;
  fire: boolean;
  group: THREE.Group;
  mats: THREE.MeshBasicMaterial[];
}

interface Meteor {
  x: number;
  z: number;
  t: number;
  delay: number;
  mesh: THREE.Mesh;
}

interface Spike {
  mesh: THREE.Mesh;
  t: number;
}

export class SpellSystem {
  private world: World;
  vortexes: Vortex[] = [];
  private meteors: Meteor[] = [];
  private spikes: Spike[] = [];
  private spikeMat = new THREE.MeshLambertMaterial({ color: 0xc9a2ff, emissive: 0x7a3cff, emissiveIntensity: 0.9, flatShading: true });
  private meteorMat = new THREE.MeshBasicMaterial({ color: 0xff7a2a });

  constructor(world: World) {
    this.world = world;
  }

  private staffTip(p: PlayerMage): [number, number, number] {
    const fx = Math.sin(p.facing), fz = Math.cos(p.facing);
    return [p.x + fx * 0.55 + Math.cos(p.facing) * 0.25, 1.35, p.z + fz * 0.55 - Math.sin(p.facing) * 0.25];
  }

  /** Aim point, leading a locked target slightly. */
  private aimPoint(p: PlayerMage, speed: number): [number, number] {
    const t = p.lockTarget;
    if (t && t.alive) {
      const d = dist(p.x, p.z, t.x, t.z);
      const lead = (d / speed) * 0.6;
      return [t.x + t.vx * lead, t.z + t.vz * lead];
    }
    return [p.aimX, p.aimZ];
  }

  castBolt(p: PlayerMage): boolean {
    const w = this.world;
    const def = SPELLS.arcaneBolt;
    if (!p.spendMana(def.mana)) return false;
    p.setCooldown('arcaneBolt', def.cooldown);
    const [sx, sy, sz] = this.staffTip(p);
    const [ax, az] = this.aimPoint(p, 32);
    w.projectiles.fire('bolt', sx, sy, sz, ax - sx, az - sz, 32, {
      faction: 'mage', source: p, dmg: def.damage * p.spellPower, type: 'arcane', range: 24, radius: 0.28, spell: 'arcaneBolt',
    });
    w.stats.shotsFired++;
    w.audio.play('bolt', { pitch: 0.9 + Math.random() * 0.2 });
    w.particles.emit({ x: sx, y: sy, z: sz, count: 4, color: [0xc78bff, 0xffffff], speed: 2, life: [0.1, 0.2], size: [0.15, 0.25] });
    w.lights.request(sx, sy, sz, 0xb36bff, 8, 5);
    w.alertNoise(p.x, p.z, 10);
    return true;
  }

  castSecondary(id: SecondarySpellId, p: PlayerMage): boolean {
    switch (id) {
      case 'flameBurst': return this.castFlame(p);
      case 'chainLightning': return this.castChain(p);
      case 'vortexSurge': return this.castVortex(p);
      case 'meteorStrike': return this.castMeteor(p);
    }
    return false;
  }

  private castFlame(p: PlayerMage): boolean {
    const w = this.world;
    const def = SPELLS.flameBurst;
    if (!p.spendMana(def.mana)) return false;
    p.setCooldown('flameBurst', def.cooldown);
    const inferno = w.services.save.spells.inferno;
    const [sx, sy, sz] = this.staffTip(p);
    const [ax, az] = this.aimPoint(p, 20);
    const range = clamp(dist(sx, sz, ax, az), 2.5, 18);
    w.projectiles.fire('fireball', sx, sy, sz, ax - sx, az - sz, 20, {
      faction: 'mage', source: p, dmg: def.damage * p.spellPower * (inferno ? 1.3 : 1), type: 'fire', range, radius: 0.3,
      aoe: inferno ? 4.2 : 3, spell: inferno ? 'inferno' : 'flameBurst', size: inferno ? 0.45 : 0.34,
    });
    w.stats.shotsFired++;
    w.audio.play('fireCast');
    w.fx.glyph(p.x, p.z, 1.3, 0xff8a2a, 0.5, p);
    w.alertNoise(p.x, p.z, 14);
    return true;
  }

  fireExplosion(x: number, z: number, r: number, dmg: number, inferno: boolean): void {
    const w = this.world;
    const p = w.player;
    w.lastExplosionHits = 0;
    // Firestorm combo
    for (const v of this.vortexes) {
      if (!v.fire && dist(x, z, v.x, v.z) < v.r + r * 0.5) {
        v.fire = true;
        v.life += 2.5;
        for (const m of v.mats) m.color.setHex(0xff7a2a);
        w.audio.play('firestorm', { x: v.x, z: v.z });
        w.banner('COMBO: FIRESTORM', 'combo');
        w.stats.combos++;
      }
    }
    w.explode(x, z, r, dmg, 'fire', p, { faction: 'mage', shake: inferno ? 0.3 : 0.2, ignite: 3 * p.elemMul, color: [0xff8a2a, 0xffd04a, 0xff3a1a], spell: 'flameBurst' });
    w.audio.play('fireBoom', { x, z, pitch: inferno ? 0.8 : 1 });
  }

  private castChain(p: PlayerMage): boolean {
    const w = this.world;
    const def = SPELLS.chainLightning;
    const [sx, sy, sz] = this.staffTip(p);
    // first target: locked target, else enemy nearest the aim point
    let first: Actor | null = null;
    const valid = (a: Actor) => a.alive && a.targetable && a.faction === 'army' && dist(p.x, p.z, a.x, a.z) < 19 && w.phys.lineOfSight(p.x, p.z, a.x, a.z);
    if (p.lockTarget && valid(p.lockTarget)) first = p.lockTarget;
    else {
      let best = 4.5;
      for (const a of w.actors) {
        if (!valid(a)) continue;
        const d = dist(a.x, a.z, p.aimX, p.aimZ);
        if (d < best) { best = d; first = a; }
      }
    }
    if (!p.spendMana(first ? def.mana : def.mana * 0.4)) return false;
    p.setCooldown('chainLightning', first ? def.cooldown : 0.5);
    w.audio.play('lightning');
    w.alertNoise(p.x, p.z, 14);
    w.stats.shotsFired++;
    if (!first) {
      const ax = clamp(p.aimX, p.x - 14, p.x + 14), az = clamp(p.aimZ, p.z - 14, p.z + 14);
      w.fx.lightning(sx, sy, sz, ax, 0.3, az, 0x7fd8ff, 0.18, 0.8);
      w.particles.burst(ax, 0.3, az, [0x7fd8ff, 0xffffff], 10, 4, 0.2, 0.3);
      w.lights.request(ax, 1, az, 0x7fd8ff, 14, 8);
      this.chainProps(ax, az, 3);
      return true;
    }
    const hits: Actor[] = [first];
    let cur = first;
    let dmg = def.damage * p.spellPower;
    let px = sx, py = sy, pz = sz;
    for (let i = 0; i < 5 && cur; i++) {
      w.fx.lightning(px, py, pz, cur.x, cur.y + 1.0, cur.z, 0x7fd8ff, 0.2, 0.7);
      w.lights.request(cur.x, 1.5, cur.z, 0x9fe8ff, 16, 8);
      w.particles.burst(cur.x, cur.y + 1, cur.z, [0x7fd8ff, 0xffffff], 12, 5, 0.2, 0.35);
      w.dealDamage(cur, { amount: dmg, type: 'lightning', source: p, spell: 'chainLightning' });
      cur.stunT = Math.max(cur.stunT, 0.5 * p.elemMul);
      this.chainProps(cur.x, cur.z, 4);
      px = cur.x; py = cur.y + 1.0; pz = cur.z;
      dmg *= 0.85;
      let next: Actor | null = null;
      let best = 7.5;
      for (const a of w.actors) {
        if (!a.alive || !a.targetable || a.faction !== 'army' || hits.indexOf(a) >= 0) continue;
        const d = dist(cur.x, cur.z, a.x, a.z);
        if (d < best) { best = d; next = a; }
      }
      if (!next) break;
      hits.push(next);
      cur = next;
    }
    w.recordHit(true);
    return true;
  }

  /** Lightning arcs detonate fuel drums and resonate crystal clusters nearby. */
  private chainProps(x: number, z: number, r: number): void {
    const w = this.world;
    for (const pr of w.propsList) {
      if (pr.destroyed || (pr.material !== 'barrel' && pr.material !== 'crystal')) continue;
      if (dist(x, z, pr.x, pr.z) < r) {
        w.fx.lightning(x, 1, z, pr.x, 0.8, pr.z, 0x7fd8ff, 0.15, 0.5);
        w.damageProp(pr, { amount: 999, type: 'lightning', source: w.player });
      }
    }
  }

  private castVortex(p: PlayerMage): boolean {
    const w = this.world;
    const def = SPELLS.vortexSurge;
    if (!p.spendMana(def.mana)) return false;
    p.setCooldown('vortexSurge', def.cooldown);
    const dx = p.aimX - p.x, dz = p.aimZ - p.z;
    const l = Math.hypot(dx, dz) || 1;
    const d = Math.min(l, 16);
    const x = p.x + (dx / l) * d, z = p.z + (dz / l) * d;
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const mats: THREE.MeshBasicMaterial[] = [];
    for (let i = 0; i < 4; i++) {
      const m = glowMat(0x9cffd8, 0.35);
      mats.push(m);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.8 + i * 0.7, 0.06, 4, 20), m);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.3 + i * 0.8;
      group.add(ring);
    }
    w.scene.add(group);
    this.vortexes.push({ x, z, r: 3.6, t: 0, life: 4 * p.elemMul, fire: false, group, mats });
    w.audio.play('vortex', { x, z });
    w.fx.glyph(x, z, 3.6, 0x9cffd8, 1.0);
    w.alertNoise(x, z, 12);
    return true;
  }

  private castMeteor(p: PlayerMage): boolean {
    const w = this.world;
    const def = SPELLS.meteorStrike;
    if (!p.spendMana(def.mana)) return false;
    p.setCooldown('meteorStrike', def.cooldown);
    const dx = p.aimX - p.x, dz = p.aimZ - p.z;
    const l = Math.hypot(dx, dz) || 1;
    const d = Math.min(l, 18);
    const x = p.x + (dx / l) * d, z = p.z + (dz / l) * d;
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 0), this.meteorMat);
    mesh.position.set(x - 10, 30, z - 12);
    w.scene.add(mesh);
    this.meteors.push({ x, z, t: 0, delay: 1.0, mesh });
    w.fx.telegraph(x, z, 5, 1.0, 0xff7a2a);
    w.fx.glyph(p.x, p.z, 1.6, 0xff5a3a, 0.8, p);
    w.audio.play('meteorFall', { x, z });
    w.stats.shotsFired++;
    return true;
  }

  throwFrostBomb(p: PlayerMage): boolean {
    const w = this.world;
    const dx = p.aimX - p.x, dz = p.aimZ - p.z;
    const l = Math.hypot(dx, dz) || 1;
    const d = clamp(l, 2, PLAYER.bombRange);
    const tx = p.x + (dx / l) * d, tz = p.z + (dz / l) * d;
    w.projectiles.lob('frostbomb', p.x, p.z, tx, tz, 0.55 + d * 0.03, 1.4, {
      faction: 'mage', source: p, dmg: 20 * p.spellPower, type: 'frost', aoe: 3.5, color: 0x9fe8ff, size: 0.22, spell: 'frostBomb',
    });
    w.fx.telegraph(tx, tz, 3.5, 0.55 + d * 0.03, 0x7fd8ff);
    w.audio.play('throw');
    return true;
  }

  frostExplosion(x: number, z: number, r: number, dmg: number): void {
    const w = this.world;
    const p = w.player;
    w.audio.play('freeze', { x, z });
    w.fx.shockwave(x, z, r, 0x9fe8ff, 0.5);
    w.particles.emit({ x, y: 0.6, z, count: 50, color: [0x9fe8ff, 0xffffff, 0x5fb8ff], speed: [2, 7], life: [0.4, 0.9], size: [0.15, 0.35], gravity: 3, jitter: 0.6 });
    w.lights.request(x, 1.5, z, 0x9fe8ff, 18, 9);
    let n = 0;
    for (const a of w.actors) {
      if (!a.alive || a.faction !== 'army') continue;
      if (dist(x, z, a.x, a.z) < r + a.radius) {
        w.dealDamage(a, { amount: dmg, type: 'frost', source: p, spell: 'frostBomb' });
        if (!a.isBoss && !a.structure) a.freeze(2.5 * p.elemMul);
        n++;
      }
    }
    for (const pr of w.propsList) if (pr.burning && dist(x, z, pr.x, pr.z) < r) pr.burning = 0;
    if (n > 0) w.floatText(x, 2, z, n > 1 ? `${n} FROZEN` : 'FROZEN', '#9fe8ff');
  }

  /** Combo: arcane damage on a frozen soldier shatters it into crystal spikes. */
  crystalSpikes(target: Actor): void {
    const w = this.world;
    const p = w.player;
    target.freezeT = 0;
    w.audio.play('shatter', { x: target.x, z: target.z });
    w.banner('COMBO: CRYSTAL SPIKES', 'combo');
    w.stats.combos++;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const rr = 0.6 + Math.random() * 1.6;
      const m = new THREE.Mesh(octa(0.35), this.spikeMat);
      m.position.set(target.x + Math.cos(a) * rr, 0, target.z + Math.sin(a) * rr);
      m.scale.set(0.6, 0.01, 0.6);
      m.rotation.set((Math.random() - 0.5) * 0.6, Math.random() * 3, (Math.random() - 0.5) * 0.6);
      w.scene.add(m);
      this.spikes.push({ mesh: m, t: 0 });
    }
    w.particles.emit({ x: target.x, y: 1, z: target.z, count: 40, color: [0xc9a2ff, 0xffffff, 0x9fe8ff], speed: [3, 8], life: [0.3, 0.7], size: [0.15, 0.3], gravity: 5, jitter: 0.5 });
    for (const a of w.actors) {
      if (!a.alive || a.faction !== 'army') continue;
      if (dist(target.x, target.z, a.x, a.z) < 2.8 + a.radius) w.dealDamage(a, { amount: 40 * p.spellPower, type: 'arcane', source: p, spell: 'combo' });
    }
  }

  update(dt: number): void {
    const w = this.world;
    // vortexes
    for (let i = this.vortexes.length - 1; i >= 0; i--) {
      const v = this.vortexes[i];
      v.t += dt;
      v.group.rotation.y += dt * (v.fire ? 7 : 5);
      const fade = Math.min(1, (v.life - v.t) / 0.5);
      for (let k = 0; k < v.mats.length; k++) {
        v.mats[k].opacity = 0.35 * fade;
        v.group.children[k].scale.setScalar(1 + Math.sin(v.t * 6 + k) * 0.08);
      }
      w.lights.request(v.x, 1.5, v.z, v.fire ? 0xff7a2a : 0x9cffd8, v.fire ? 14 : 6, 8);
      if (Math.random() < dt * 40) {
        const a = Math.random() * Math.PI * 2, rr = Math.random() * v.r;
        w.particles.emit({ x: v.x + Math.cos(a) * rr, y: 0.3 + Math.random() * 2.5, z: v.z + Math.sin(a) * rr, count: 1, color: v.fire ? [0xff8a2a, 0xffd04a] : [0x9cffd8, 0xffffff], speed: [1, 3], life: [0.3, 0.6], size: [0.15, 0.3], dir: [-Math.sin(a), 0.5, Math.cos(a)], spread: 0.3, gravity: -2 });
      }
      for (const a of w.actors) {
        if (!a.alive || a.faction !== 'army' || a.structure || a.isBoss) continue;
        const d = dist(v.x, v.z, a.x, a.z);
        if (d < v.r + 1.2) {
          const pull = a.flying ? 3 : 5;
          if (d > 0.4) {
            a.knockX += ((v.x - a.x) / d) * pull * dt * 4;
            a.knockZ += ((v.z - a.z) / d) * pull * dt * 4;
          }
          w.dealDamage(a, { amount: (v.fire ? 26 : 8) * w.player.spellPower * dt, type: v.fire ? 'fire' : 'wind', source: w.player, spell: 'vortexSurge' });
          if (v.fire) a.ignite(1.5, 6);
        }
      }
      // swallow enemy bullets
      w.projectiles.forEachActive((pr) => {
        if (pr.faction === 'army' && !pr.arc && dist(pr.x, pr.z, v.x, v.z) < v.r) {
          w.projectiles.kill(pr);
          w.particles.emit({ x: pr.x, y: pr.y, z: pr.z, count: 2, color: 0x9cffd8, speed: 2, life: [0.1, 0.3], size: [0.1, 0.2] });
        }
      });
      if (v.t >= v.life) {
        v.group.removeFromParent();
        v.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose(); });
        for (const m of v.mats) m.dispose();
        this.vortexes.splice(i, 1);
      }
    }
    // meteors
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      m.t += dt;
      const k = Math.min(1, m.t / m.delay);
      m.mesh.position.set(m.x - 10 * (1 - k), 30 * (1 - k) + 0.5, m.z - 12 * (1 - k));
      m.mesh.rotation.x += dt * 5;
      w.particles.emit({ x: m.mesh.position.x, y: m.mesh.position.y, z: m.mesh.position.z, count: 3, color: [0xff7a2a, 0xffd04a, 0xff3a1a], speed: 1, life: [0.3, 0.6], size: [0.4, 0.7], jitter: 0.5 });
      w.lights.request(m.mesh.position.x, m.mesh.position.y, m.mesh.position.z, 0xff7a2a, 20, 14);
      if (k >= 1) {
        m.mesh.removeFromParent();
        this.meteors.splice(i, 1);
        w.lastExplosionHits = 0;
        w.explode(m.x, m.z, 5, SPELLS.meteorStrike.damage * w.player.spellPower, 'explosive', w.player, {
          faction: 'mage', shake: 0.7, ignite: 3 * w.player.elemMul, color: [0xff7a2a, 0xffd04a, 0xff3a1a, 0x5a3a2a], heavy: true, spell: 'meteorStrike',
        });
        w.recordHit(w.lastExplosionHits > 0);
        w.audio.play('meteorImpact', { x: m.x, z: m.z });
        w.fx.scorch(m.x, m.z, 4);
      }
    }
    // crystal spikes
    for (let i = this.spikes.length - 1; i >= 0; i--) {
      const s = this.spikes[i];
      s.t += dt;
      const up = Math.min(1, s.t / 0.12);
      const down = s.t > 0.9 ? Math.max(0, 1 - (s.t - 0.9) / 0.3) : 1;
      s.mesh.scale.set(0.6, 2.4 * up * down + 0.01, 0.6);
      s.mesh.position.y = 0.4 * up;
      if (s.t > 1.2) {
        s.mesh.removeFromParent();
        this.spikes.splice(i, 1);
      }
    }
  }

  /** Is (x,z) inside an active vortex? (Rift catalysts / golems use this for effects.) */
  inVortex(x: number, z: number): boolean {
    return this.vortexes.some((v) => dist(x, z, v.x, v.z) < v.r);
  }

  clear(): void {
    for (const v of this.vortexes) v.group.removeFromParent();
    for (const m of this.meteors) m.mesh.removeFromParent();
    for (const s of this.spikes) s.mesh.removeFromParent();
    this.vortexes = [];
    this.meteors = [];
    this.spikes = [];
  }
}
