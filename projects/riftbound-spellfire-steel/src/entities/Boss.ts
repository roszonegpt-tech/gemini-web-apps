// Sector 4 boss: General Vance & the Iron Goliath.
//  Phase 1  Shielded  – a hex shield dome powered by three generator pylons.
//  Phase 2  Assault   – dual cannons, rocket salvos, coax MG, mortar calls.
//  At 50%   Reboot    – pylons re-energise the shield once; reinforcements drop in.
//  Phase 3  Overdrive – faster fire and ram charges.
//  Wrecked            – General Vance ejects in his exo-suit and fights on foot.
import * as THREE from 'three';
import type { DamageInfo } from '../config/types';
import { CF, type Collider } from '../core/Physics';
import type { World } from '../scenes/World';
import { buildShieldPylon, buildTank, type TankModel } from '../utils/models';
import { hexTexture } from '../utils/textures';
import { chance, clamp, dist, heading, rand, turnToward, wrapAngle } from '../utils/math';
import { Actor } from './Actor';

export class ShieldPylon extends Actor {
  core: THREE.MeshLambertMaterial;
  collider: Collider | null = null;
  animT = 0;

  constructor(world: World, x: number, z: number) {
    super(world, 'army');
    this.kind = 'pylon';
    this.name = 'Shield Generator Pylon';
    this.structure = true;
    this.hp = this.maxHp = 240;
    this.radius = 0.9;
    this.x = x;
    this.z = z;
    const m = buildShieldPylon();
    this.core = m.core;
    this.root.add(m.root);
    this.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    this.collider = world.phys.addCircle(x, z, 0.75, CF.MOVE, this);
    this.syncRoot();
  }

  update(dt: number): void {
    this.animT += dt;
    if (!this.alive) return;
    this.tickStatus(dt);
    this.core.emissiveIntensity = 1 + Math.sin(this.animT * 5) * 0.4;
    this.world.lights.request(this.x, 3.2, this.z, 0x4fc8ff, 4, 6);
  }

  protected override onDeath(): void {
    const w = this.world;
    w.explode(this.x, this.z, 3, 20, 'explosive', this, { faction: 'neutral', shake: 0.35 });
    this.root.scale.y = 0.4;
    this.core.emissive.setHex(0x111111);
    w.banner('SHIELD PYLON DESTROYED', 'info');
  }

  reboot(): void {
    this.alive = true;
    this.hp = this.maxHp;
    this.root.scale.y = 1;
    this.core.emissive.setHex(0x2aa0ff);
    this.world.particles.emit({ x: this.x, y: 3, z: this.z, count: 30, color: [0x4fc8ff, 0xffffff], speed: [2, 5], life: [0.3, 0.7], size: [0.2, 0.3] });
  }
}

type TankPhase = 'dormant' | 'shielded' | 'assault' | 'reboot' | 'overdrive' | 'wrecked';

export class GoliathTank extends Actor {
  model: TankModel;
  phase: TankPhase = 'dormant';
  pylons: ShieldPylon[] = [];
  shieldMesh: THREE.Mesh;
  shieldMat: THREE.MeshBasicMaterial;
  collider: Collider;
  rebooted = false;
  cannonCd = 3;
  rocketCd = 6;
  mgCd = 1.5;
  mortarCd = 10;
  chargeCd = 6;
  charging = 0;
  ramCd = 0;
  waypoint = 0;
  waypoints: [number, number][] = [];
  turretYaw = 0;
  mgBurst = 0;
  mgT = 0;
  animT = 0;
  shieldMsgT = 0;
  wreckT = 0;
  hatchSink = 0;

  constructor(world: World, x: number, z: number) {
    super(world, 'army');
    this.kind = 'goliath';
    this.name = 'The Iron Goliath';
    this.isBoss = true;
    this.hp = this.maxHp = 2600 * world.difficultyHp;
    this.radius = 3.1;
    this.x = x;
    this.z = z;
    this.facing = Math.PI;
    this.model = buildTank();
    this.root.add(this.model.root);
    this.tintMats = this.model.tint;
    this.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    this.shieldMat = new THREE.MeshBasicMaterial({ color: 0x4fc8ff, map: hexTexture(), transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(4.8, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), this.shieldMat);
    this.root.add(this.shieldMesh);
    this.collider = world.phys.addCircle(x, z, 2.9, CF.MOVE, this);
    const r = 11;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this.waypoints.push([x + Math.cos(a) * r, z + Math.sin(a) * r * 0.7]);
    }
    this.targetable = true;
    this.syncRoot();
  }

  get shielded(): boolean {
    return this.phase === 'shielded' || this.phase === 'reboot' || this.phase === 'dormant';
  }

  activate(): void {
    if (this.phase !== 'dormant') return;
    this.phase = 'shielded';
    this.world.music.play('boss');
  }

  protected override modifyDamage(info: DamageInfo): number {
    if (this.shielded) {
      if (this.shieldMsgT <= 0 && info.spell) {
        this.shieldMsgT = 1.2;
        this.world.floatText(this.x, 4, this.z, 'SHIELDED — DESTROY THE PYLONS', '#4fc8ff');
      }
      this.world.audio.play('shieldHit', { x: this.x, z: this.z, throttle: 0.08 });
      this.shieldMat.opacity = 0.7;
      return 0;
    }
    let amt = info.amount;
    if (info.type === 'frost' || info.type === 'wind') amt *= 0.3;
    if (info.type === 'bullet') amt *= 0.2;
    return amt;
  }

  protected override onHurt(): void {
    const frac = this.hp / this.maxHp;
    if (!this.rebooted && frac <= 0.5 && this.phase === 'assault') {
      this.rebooted = true;
      this.phase = 'reboot';
      const w = this.world;
      for (const p of this.pylons) p.reboot();
      w.banner('GOLIATH SHIELD REBOOTED', 'warn');
      w.subtitle('General Vance', 'Reroute everything to the shield! Bring in the reserves!', 3.5);
      w.subtitle('High Priestess Lyra', 'The pylons are back online — break them again, Valerius!', 3.5);
      w.dropship(this.x + 10, this.z + 8, ['trooper', 'trooper', 'heavy']);
    }
  }

  protected override onDeath(): void {
    const w = this.world;
    this.phase = 'wrecked';
    this.wreckT = 0;
    this.alive = false;
    w.banner('IRON GOLIATH DESTROYED', 'big');
    w.camRig.addTrauma(0.8);
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        if (w.disposed) return;
        w.explode(this.x + rand(-2.5, 2.5), this.z + rand(-2.5, 2.5), 3, 0, 'explosive', this, { faction: 'neutral', shake: 0.4 });
      }, i * 220);
    }
    w.fx.scorch(this.x, this.z, 5);
    w.onTankDestroyed(this);
  }

  update(dt: number): void {
    const w = this.world;
    this.animT += dt;
    if (this.shieldMsgT > 0) this.shieldMsgT -= dt;
    if (this.phase === 'wrecked') {
      this.wreckT += dt;
      if (Math.random() < dt * 10) w.particles.smoke(this.x + rand(-2, 2), 2, this.z + rand(-2, 2), 1, 0x4e4844, 1.6);
      if (Math.random() < dt * 4) w.particles.emit({ x: this.x + rand(-2, 2), y: 1.5, z: this.z + rand(-2, 2), count: 2, color: [0xff8a2a, 0xffd04a], speed: 1, life: [0.3, 0.6], size: [0.3, 0.5], gravity: -3 });
      this.model.vance.visible = false;
      return;
    }
    this.tickStatus(dt);
    // shield visuals & pylon beams
    const alivePylons = this.pylons.filter((p) => p.alive);
    if ((this.phase === 'shielded' || this.phase === 'reboot') && alivePylons.length === 0) {
      this.phase = this.rebooted ? 'overdrive' : 'assault';
      w.banner('GOLIATH SHIELD DOWN', 'big');
      w.audio.play('wardBreak', { x: this.x, z: this.z });
      w.particles.emit({ x: this.x, y: 2.5, z: this.z, count: 80, color: [0x4fc8ff, 0xffffff], speed: [4, 9], life: [0.4, 0.9], size: [0.2, 0.4], jitter: 2 });
      if (!this.rebooted) w.subtitle('High Priestess Lyra', 'The shield is down! Strike the Goliath now!', 3);
    }
    const shieldOn = this.shielded;
    this.shieldMesh.visible = shieldOn || this.phase === 'dormant';
    this.shieldMat.opacity = Math.max(shieldOn ? 0.22 + Math.sin(this.animT * 3) * 0.06 : 0, this.shieldMat.opacity - dt * 2);
    this.shieldMesh.rotation.y += dt * 0.3;
    if (shieldOn) {
      for (const p of alivePylons) w.fx.beam(p, p.x, 3.2, p.z, this.x, 2.5, this.z, 0x4fc8ff, 0.8);
      w.lights.request(this.x, 3, this.z, 0x4fc8ff, 6, 9);
    }
    if (this.phase === 'dormant') {
      this.syncRoot();
      return;
    }
    const t = w.player.alive ? w.player : null;
    if (!t) { this.syncRoot(); return; }
    const overdrive = this.phase === 'overdrive';
    const rate = overdrive ? 1.45 : 1;
    // hull movement
    if (this.charging > 0) {
      this.charging -= dt;
      this.drive(dt, t.x, t.z, 9);
      if (dist(this.x, this.z, t.x, t.z) < this.radius + 0.9 && this.ramCd <= 0) {
        this.ramCd = 1.2;
        w.dealDamage(t, { amount: 35, type: 'melee', source: this, dirX: t.x - this.x, dirZ: t.z - this.z, knockback: 3 });
        w.camRig.addTrauma(0.4);
      }
    } else if (!this.disabled) {
      const [wx, wz] = this.waypoints[this.waypoint];
      if (dist(this.x, this.z, wx, wz) < 2) this.waypoint = (this.waypoint + 1) % this.waypoints.length;
      this.drive(dt, wx, wz, overdrive ? 3.2 : 2.2);
    }
    if (this.ramCd > 0) this.ramCd -= dt;
    // turret tracking
    const want = heading(t.x - this.x, t.z - this.z) - this.facing;
    this.turretYaw = turnToward(this.turretYaw, wrapAngle(want), dt * 1.4 * rate);
    this.model.turret.rotation.y = this.turretYaw;
    if (this.disabled) { this.syncRoot(); return; }
    // weapons
    this.cannonCd -= dt * rate;
    this.rocketCd -= dt * rate;
    this.mgCd -= dt * rate;
    this.mortarCd -= dt;
    this.chargeCd -= dt;
    const aligned = Math.abs(wrapAngle(want - this.turretYaw)) < 0.25;
    if (this.cannonCd <= 0 && aligned) {
      this.cannonCd = 3.2;
      this.fireCannons(t);
    } else if (this.rocketCd <= 0) {
      this.rocketCd = 8.5;
      this.rocketSalvo(t, overdrive ? 10 : 7);
    } else if (this.mortarCd <= 0) {
      this.mortarCd = 15;
      w.mortarStrike(t.x, t.z, 4, 4, this);
      w.subtitle('General Vance', 'Artillery! Flatten that sorcerer!', 2.5);
    } else if (overdrive && this.chargeCd <= 0 && dist(this.x, this.z, t.x, t.z) < 14) {
      this.chargeCd = 9;
      this.charging = 2.2;
      w.banner('GOLIATH IS CHARGING!', 'warn');
      w.audio.play('alarm', { x: this.x, z: this.z });
    }
    if (this.mgCd <= 0 && this.mgBurst <= 0) {
      this.mgBurst = 8;
      this.mgCd = 2.4;
    }
    if (this.mgBurst > 0) {
      this.mgT -= dt;
      if (this.mgT <= 0) {
        this.mgT = 0.09;
        this.mgBurst--;
        const a = this.facing + this.turretYaw + (Math.random() - 0.5) * 0.16;
        const mx = this.x + Math.sin(a) * 3.2, mz = this.z + Math.cos(a) * 3.2;
        w.projectiles.fire('bullet', mx, 2.1, mz, Math.sin(a), Math.cos(a), 34, { faction: 'army', source: this, dmg: 4 * w.difficultyDmg, type: 'bullet', range: 30, radius: 0.1 });
        w.audio.play('minigunShot', { x: this.x, z: this.z, vol: 0.5, throttle: 0.05 });
      }
    }
    // engine audio + treads
    w.audio.loopVolume('engine', 0.45);
    this.model.hatch.position.y = 1.35 + Math.sin(this.animT * 2) * 0.03;
    this.syncRoot();
  }

  private drive(dt: number, tx: number, tz: number, speed: number): void {
    const want = heading(tx - this.x, tz - this.z);
    this.facing = turnToward(this.facing, want, dt * (this.charging > 0 ? 1.8 : 0.8));
    const fx = Math.sin(this.facing), fz = Math.cos(this.facing);
    const align = Math.max(0, Math.cos(wrapAngle(want - this.facing)));
    const w = this.world;
    // temporarily remove own collider while moving
    w.phys.remove(this.collider);
    const out = { x: 0, z: 0 };
    w.phys.resolveCircle(this.x + fx * speed * align * dt, this.z + fz * speed * align * dt, 2.9, CF.MOVE, out);
    this.x = out.x;
    this.z = out.z;
    this.collider = w.phys.addCircle(this.x, this.z, 2.9, CF.MOVE, this);
    if (Math.random() < dt * 6) w.particles.smoke(this.x - fx * 3.4, 1.8, this.z - fz * 3.4, 1, 0x7a746c, 1.0);
  }

  private fireCannons(t: Actor): void {
    const w = this.world;
    const a = this.facing + this.turretYaw;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -0.55 : 0.55;
      const mx = this.x + Math.sin(a) * 5.3 + Math.cos(a) * side, mz = this.z + Math.cos(a) * 5.3 - Math.sin(a) * side;
      const d = dist(mx, mz, t.x, t.z);
      const lead = d / 22 * 0.7;
      const tx = t.x + t.vx * lead + rand(-1, 1), tz = t.z + t.vz * lead + rand(-1, 1);
      setTimeout(() => {
        if (w.disposed || !this.alive) return;
        w.projectiles.fire('shell', mx, 2.1, mz, tx - mx, tz - mz, 22, { faction: 'army', source: this, dmg: 28 * w.difficultyDmg, type: 'explosive', range: Math.min(30, d + 2), radius: 0.3, aoe: 2.8, color: 0x2a2a2a, size: 0.32 });
        w.particles.smoke(mx, 2.1, mz, 8, 0x6a6560, 1.0);
        w.particles.emit({ x: mx, y: 2.1, z: mz, count: 10, color: [0xffd04a, 0xff8a2a], speed: 4, life: [0.1, 0.25], size: [0.3, 0.5] });
        w.lights.request(mx, 2.1, mz, 0xffb050, 20, 10);
        w.audio.play('cannon', { x: this.x, z: this.z });
        w.camRig.addTrauma(0.15);
      }, i * 260);
    }
  }

  private rocketSalvo(t: Actor, n: number): void {
    const w = this.world;
    w.audio.play('rocket', { x: this.x, z: this.z });
    for (let i = 0; i < n; i++) {
      const tx = clamp(t.x + rand(-4.5, 4.5), w.phys.minX + 2, w.phys.maxX - 2), tz = clamp(t.z + rand(-4.5, 4.5), w.phys.minZ + 2, w.phys.maxZ - 2);
      const dur = 1.2 + i * 0.12;
      const pod = this.model.rocketPods[i % 2];
      const v = new THREE.Vector3();
      pod.getWorldPosition(v);
      w.projectiles.lob('rocket', v.x, v.z, tx, tz, dur, 3, { faction: 'army', source: this, dmg: 20 * w.difficultyDmg, type: 'explosive', aoe: 2.4, color: 0xc23a2e, size: 0.18 });
      w.fx.telegraph(tx, tz, 2.4, dur, 0xff4a2a);
    }
    if (chance(0.5)) w.subtitle('General Vance', 'Rockets away!', 1.8);
  }

  override dispose(): void {
    this.world.phys.remove(this.collider);
    super.dispose();
  }
}
