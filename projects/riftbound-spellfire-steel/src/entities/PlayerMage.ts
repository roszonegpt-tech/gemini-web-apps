// Archmage Valerius: movement, aiming, spell input, Arcane Ward (hold to absorb 80% of
// bullet damage, "snap" timing reflects bullets), Teleport Blink, mana well channelling,
// potions and frost bombs, plus procedural animation of the low-poly model.
import * as THREE from 'three';
import { PLAYER, ROBE_GLOWS, SECONDARY_SPELLS, SPELLS } from '../config/balance';
import type { DamageInfo, SecondarySpellId, SpellId } from '../config/types';
import { CF } from '../core/Physics';
import type { World } from '../scenes/World';
import { buildMage, type MageModel } from '../utils/models';
import { hexTexture } from '../utils/textures';
import { clamp, damp, heading, lerpAngle } from '../utils/math';
import { Actor } from './Actor';
import type { Interactable } from './Interactables';

export class PlayerMage extends Actor {
  model: MageModel;
  mana = 100;
  maxMana = 100;
  manaRegen = PLAYER.manaRegen;
  ward = 100;
  wardMax = 100;
  wardUp = false;
  wardBroken = 0;
  wardIdle = 0;
  wardUpT = 0;
  wardDrainMul = 1;
  spellPower = 1;
  elemMul = 1;
  blinkRange = PLAYER.blinkRange;
  blinkCooldown = PLAYER.blinkCooldown;
  cd: Record<string, number> = {};
  slot = 0;
  loadout: SecondarySpellId[];
  hpPotions = PLAYER.startHpPotions;
  manaPotions = PLAYER.startManaPotions;
  bombs = PLAYER.startBombs;
  aimX = 0;
  aimZ = 0;
  lockTarget: Actor | null = null;
  invuln = 0;
  castAnim = 0;
  throwAnim = 0;
  channelTarget: Interactable | null = null;
  channelT = 0;
  focus: Interactable | null = null;
  downedT = 0;
  moving = false;
  speedMul = 1;
  animT = 0;
  firing = false;
  inSmoke = false;
  inPool = false;
  lowManaWarnT = 0;
  hurtDir = 0;
  hurtT = 0;
  wardBreakFlash = 0;
  /** Set when mounted on a vehicle (v1.1 golem) to suspend ground controls. */
  mounted = false;
  private wardMesh: THREE.Mesh;
  private wardMat: THREE.MeshBasicMaterial;
  private unlocked: SpellId[];

  constructor(world: World) {
    super(world, 'mage');
    this.kind = 'player';
    this.name = 'Archmage Valerius';
    const save = world.services.save;
    const up = save.upgrades;
    const glow = ROBE_GLOWS.find((g) => g.id === save.cosmetics.robeGlow) || ROBE_GLOWS[0];
    this.model = buildMage(glow.color);
    this.root.add(this.model.root);
    this.maxHp = PLAYER.hp + up.maxHealth * 15;
    this.hp = this.maxHp;
    this.maxMana = PLAYER.mana + up.maxMana * 15;
    this.mana = this.maxMana;
    this.manaRegen = PLAYER.manaRegen * (1 + up.manaRegen * 0.15);
    this.blinkRange = PLAYER.blinkRange + up.blink * 0.8;
    this.blinkCooldown = Math.max(0.8, PLAYER.blinkCooldown - up.blink * 0.2);
    this.wardMax = PLAYER.wardMax + up.wardResist * 10;
    this.ward = this.wardMax;
    this.wardDrainMul = Math.max(0.3, 1 - up.wardResist * 0.12);
    this.spellPower = 1 + up.spellPower * 0.1;
    this.elemMul = 1 + up.elemDuration * 0.15;
    this.radius = PLAYER.radius;
    this.loadout = save.spells.loadout.slice() as SecondarySpellId[];
    this.unlocked = save.spells.unlocked.slice();
    this.slot = Math.max(0, this.loadout.findIndex((s) => this.unlocked.indexOf(s) >= 0));
    this.wardMat = new THREE.MeshBasicMaterial({ color: 0x5fd8ff, map: hexTexture(), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.wardMesh = new THREE.Mesh(new THREE.SphereGeometry(1.25, 14, 10), this.wardMat);
    this.wardMesh.position.y = 1.0;
    this.wardMesh.visible = false;
    this.root.add(this.wardMesh);
    this.model.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  }

  get secondary(): SecondarySpellId {
    return this.loadout[this.slot];
  }

  isUnlocked(id: SpellId): boolean {
    return this.unlocked.indexOf(id) >= 0 || this.world.dev.allSpells;
  }

  unlockSpell(id: SpellId): void {
    if (this.unlocked.indexOf(id) < 0) this.unlocked.push(id);
  }

  cooldownFrac(id: string): number {
    const def = (SPELLS as Record<string, { cooldown: number }>)[id];
    const total = id === 'blink' ? this.blinkCooldown : def ? def.cooldown : 1;
    return clamp((this.cd[id] || 0) / total, 0, 1);
  }

  spendMana(cost: number): boolean {
    if (this.world.dev.infiniteMana) return true;
    const c = cost * (this.inSmoke ? 1.6 : 1);
    if (this.mana < c) {
      if (this.lowManaWarnT <= 0) {
        this.world.audio.play('lowMana');
        this.world.floatText(this.x, 2.4, this.z, 'NO MANA', '#b36bff');
        this.lowManaWarnT = 0.8;
      }
      return false;
    }
    this.mana -= c;
    return true;
  }

  setCooldown(id: string, t: number): void {
    this.cd[id] = this.world.dev.noCooldowns ? 0 : t;
  }

  ready(id: string): boolean {
    return (this.cd[id] || 0) <= 0;
  }

  update(dt: number): void {
    const w = this.world;
    this.animT += dt;
    for (const k in this.cd) if (this.cd[k] > 0) this.cd[k] -= dt;
    if (this.lowManaWarnT > 0) this.lowManaWarnT -= dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.hurtT > 0) this.hurtT -= dt;
    if (this.wardBreakFlash > 0) this.wardBreakFlash -= dt;
    if (!this.alive) {
      this.downedT += dt;
      this.animate(dt);
      this.syncRoot();
      return;
    }
    this.tickStatus(dt);
    if (!this.alive) return;
    this.inSmoke = w.inSmoke(this.x, this.z);
    this.inPool = w.inManaPool(this.x, this.z);
    if (this.inPool) this.wetT = 1.5;
    if (this.mounted) {
      this.wardUp = false;
      this.wardMesh.visible = false;
      this.syncRoot();
      return;
    }
    const inp = w.input;
    const cinematic = w.cinematicLock;

    // ---- aim
    this.aimX = w.aimX;
    this.aimZ = w.aimZ;
    this.lockTarget = w.aimTarget;
    const adx = this.aimX - this.x, adz = this.aimZ - this.z;

    // ---- ward (hold)
    const wantWard = !cinematic && inp.isDown('ward') && this.wardBroken <= 0 && !this.disabled;
    if (wantWard && !this.wardUp) {
      if (this.ward > 8) {
        this.wardUp = true;
        this.wardUpT = 0;
        w.stats.wardsCast++;
        w.audio.play('wardUp');
        w.fx.glyph(this.x, this.z, 1.4, 0x5fd8ff, 0.5, this);
      }
    } else if (!wantWard && this.wardUp) {
      this.wardUp = false;
    }
    if (this.wardUp) {
      this.wardUpT += dt;
      this.ward -= PLAYER.wardDrainHold * this.wardDrainMul * dt;
      this.wardIdle = 0;
      if (this.ward <= 0) this.breakWard();
    } else {
      this.wardIdle += dt;
      if (this.wardBroken > 0) this.wardBroken -= dt;
      else if (this.wardIdle > PLAYER.wardRegenDelay) this.ward = Math.min(this.wardMax, this.ward + PLAYER.wardRegen * dt);
    }
    w.audio.loopVolume('ward', this.wardUp ? 0.5 : 0);

    // ---- mana regen
    if (!this.inSmoke) this.mana = Math.min(this.maxMana, this.mana + this.manaRegen * (this.inPool ? 3 : 1) * dt);

    // ---- channel / interact
    this.focus = cinematic ? null : w.findInteractable(this.x, this.z);
    if (this.channelTarget) {
      const it = this.channelTarget;
      if (!inp.isDown('interact') || Math.hypot(inp.moveX, inp.moveY) > 0.3 || it.prompt(w) === null || this.disabled) {
        this.channelTarget = null;
        this.channelT = 0;
        w.audio.loopVolume('channel', 0);
      } else {
        this.channelT += dt;
        w.audio.loopVolume('channel', 0.35);
        if (Math.random() < dt * 30) w.particles.emit({ x: it.x, y: 1.2, z: it.z, count: 1, color: [0xb36bff, 0x7fd8ff, 0xffffff], speed: [1, 3], life: [0.4, 0.7], size: [0.15, 0.25], jitter: 1.2, gravity: -2 });
        if (this.channelT >= it.holdTime(w)) {
          this.channelTarget = null;
          this.channelT = 0;
          w.audio.loopVolume('channel', 0);
          it.interact(w, this);
        }
      }
    } else if (this.focus && inp.pressed('interact')) {
      if (this.focus.holdTime(w) <= 0) this.focus.interact(w, this);
      else {
        this.channelTarget = this.focus;
        this.channelT = 0;
      }
    }
    const channeling = !!this.channelTarget;

    // ---- movement
    let mx = inp.moveX, mz = inp.moveY;
    if (cinematic || this.disabled || channeling) { mx = 0; mz = 0; }
    this.firing = !cinematic && inp.isDown('fire1');
    let spd = PLAYER.speed * this.speedMul;
    if (this.wardUp) spd *= PLAYER.wardMoveMul;
    if (this.firing) spd *= PLAYER.castMoveMul;
    if (this.slowT > 0) spd *= 0.5;
    this.vx = damp(this.vx, mx * spd, 14, dt);
    this.vz = damp(this.vz, mz * spd, 14, dt);
    this.moving = Math.hypot(this.vx, this.vz) > 0.4;
    if (this.moving) this.moveBy(this.vx * dt, this.vz * dt, CF.MOVE);
    this.applyKnock(dt);
    this.speedMul = 1;

    // facing toward aim (or movement when not aiming)
    const aimLen = Math.hypot(adx, adz);
    const face = aimLen > 0.3 ? heading(adx, adz) : this.moving ? heading(this.vx, this.vz) : this.facing;
    this.facing = lerpAngle(this.facing, face, Math.min(1, dt * 18));

    if (!cinematic && !this.disabled && !channeling) this.handleCasting();
    this.animate(dt);
    this.syncRoot();
  }

  private handleCasting(): void {
    const w = this.world;
    const inp = w.input;
    // spell selection
    const order: ('spell1' | 'spell2' | 'spell3' | 'spell4')[] = ['spell1', 'spell2', 'spell3', 'spell4'];
    for (let i = 0; i < 4; i++) if (inp.pressed(order[i])) this.selectSlot(i);
    if (inp.pressed('cycle') || inp.wheel !== 0) this.cycleSlot(inp.wheel < 0 ? -1 : 1);

    if (inp.isDown('fire1') && this.ready('arcaneBolt')) {
      if (w.spells.castBolt(this)) this.castAnim = 0.18;
    }
    if (inp.pressed('fire2') || (inp.isDown('fire2') && this.secondary === 'flameBurst')) {
      const id = this.secondary;
      if (this.isUnlocked(id) && this.ready(id)) {
        if (w.spells.castSecondary(id, this)) this.castAnim = 0.3;
      } else if (!this.isUnlocked(id) && inp.pressed('fire2')) {
        w.audio.play('uiDeny');
        w.floatText(this.x, 2.4, this.z, 'SPELL LOCKED', '#aaa');
      }
    }
    if (inp.pressed('blink')) this.tryBlink();
    if (inp.pressed('bomb')) {
      if (this.bombs > 0 || w.dev.infiniteMana) {
        if (w.spells.throwFrostBomb(this)) {
          if (!w.dev.infiniteMana) this.bombs--;
          this.throwAnim = 0.35;
        }
      } else w.audio.play('uiDeny');
    }
    if (inp.pressed('potionHp')) this.drink('hp');
    if (inp.pressed('potionMp')) this.drink('mp');
    if (inp.pressed('potion')) this.drink(this.hp / this.maxHp < 0.6 || this.mana / this.maxMana > 0.5 ? 'hp' : 'mp');
  }

  selectSlot(i: number): void {
    const id = this.loadout[i];
    if (!id) return;
    if (!this.isUnlocked(id)) {
      this.world.audio.play('uiDeny');
      this.world.floatText(this.x, 2.4, this.z, `${SPELLS[id].name.toUpperCase()} LOCKED`, '#aaa');
      return;
    }
    if (this.slot !== i) {
      this.slot = i;
      this.world.audio.play('uiClick', { vol: 0.5 });
    }
  }

  cycleSlot(dir: number): void {
    for (let k = 1; k <= 4; k++) {
      const i = (this.slot + dir * k + 8) % 4;
      if (this.isUnlocked(this.loadout[i])) {
        this.selectSlot(i);
        return;
      }
    }
  }

  drink(kind: 'hp' | 'mp'): void {
    const w = this.world;
    if (kind === 'hp') {
      if (this.hpPotions <= 0 || this.hp >= this.maxHp) { w.audio.play('uiDeny'); return; }
      this.hpPotions--;
      this.hp = Math.min(this.maxHp, this.hp + PLAYER.potionHp);
      w.particles.emit({ x: this.x, y: 1, z: this.z, count: 20, color: [0x5dff9a, 0xffffff], speed: [1, 3], life: [0.4, 0.8], size: [0.15, 0.25], dir: [0, 1, 0], spread: 0.5, gravity: -2, jitter: 0.4 });
      w.floatText(this.x, 2.4, this.z, `+${PLAYER.potionHp} HP`, '#5dff9a');
    } else {
      if (this.manaPotions <= 0 || this.mana >= this.maxMana) { w.audio.play('uiDeny'); return; }
      this.manaPotions--;
      this.mana = Math.min(this.maxMana, this.mana + PLAYER.potionMana);
      w.particles.emit({ x: this.x, y: 1, z: this.z, count: 20, color: [0xb36bff, 0xffffff], speed: [1, 3], life: [0.4, 0.8], size: [0.15, 0.25], dir: [0, 1, 0], spread: 0.5, gravity: -2, jitter: 0.4 });
      w.floatText(this.x, 2.4, this.z, `+${PLAYER.potionMana} MANA`, '#c78bff');
    }
    w.stats.potionsUsed++;
    w.audio.play('potion');
  }

  tryBlink(): void {
    const w = this.world;
    if (!this.ready('blink')) return;
    let dx = w.input.moveX, dz = w.input.moveY;
    if (Math.hypot(dx, dz) < 0.3) { dx = this.aimX - this.x; dz = this.aimZ - this.z; }
    const l = Math.hypot(dx, dz);
    if (l < 0.01) return;
    dx /= l; dz /= l;
    let range = this.blinkRange;
    // can pass through walls and bullet streams, but never through a sealed zone gate
    const gateHit = w.phys.raycast(this.x, this.z, this.x + dx * range, this.z + dz * range, CF.MOVE, null, 0);
    if (gateHit && (gateHit.collider.owner as { isGate?: boolean } | null)?.isGate) range = Math.max(0, gateHit.t * range - 0.8);
    for (let r = range; r >= 0.75; r -= 0.25) {
      const tx = this.x + dx * r, tz = this.z + dz * r;
      if (w.phys.circleFree(tx, tz, this.radius, CF.MOVE) && w.nav.walkable(tx, tz)) {
        const ox = this.x, oz = this.z;
        w.particles.emit({ x: ox, y: 1, z: oz, count: 26, color: [0xb36bff, 0xffffff, 0x7fd8ff], speed: [1, 4], life: [0.3, 0.6], size: [0.15, 0.3], jitter: 0.4 });
        w.fx.glyph(ox, oz, 1.2, 0xb36bff, 0.5);
        this.x = tx;
        this.z = tz;
        this.invuln = PLAYER.blinkInvuln;
        this.setCooldown('blink', this.blinkCooldown);
        w.fx.glyph(tx, tz, 1.4, 0x7fd8ff, 0.6);
        w.fx.shockwave(tx, tz, 1.6, 0xb36bff, 0.3);
        w.particles.emit({ x: tx, y: 1, z: tz, count: 20, color: [0xb36bff, 0xffffff], speed: [2, 5], life: [0.2, 0.5], size: [0.15, 0.25], jitter: 0.3 });
        w.audio.play('blink');
        if (!w.services.settings.reducedMotion) w.camRig.tilt = dx * 0.03;
        w.stats.blinks++;
        return;
      }
    }
    w.audio.play('uiDeny');
  }

  breakWard(): void {
    const w = this.world;
    this.ward = 0;
    this.wardUp = false;
    this.wardBroken = PLAYER.wardBreakLock;
    this.wardBreakFlash = 0.4;
    w.audio.play('wardBreak');
    w.particles.emit({ x: this.x, y: 1, z: this.z, count: 40, color: [0x5fd8ff, 0xffffff], speed: [3, 7], life: [0.3, 0.7], size: [0.15, 0.3], gravity: 6, jitter: 0.8 });
    w.camRig.addTrauma(0.25);
    w.input.vibrate(120, 0.6);
  }

  /** Ward "snap": raising the ward right before a bullet lands reflects it. */
  trySnapReflect(): boolean {
    if (this.wardUp && this.wardUpT < PLAYER.snapWindow) {
      this.world.audio.play('snap');
      this.world.stats.combos++;
      this.world.floatText(this.x, 2.6, this.z, 'REFLECT!', '#ff7bf2');
      return true;
    }
    return false;
  }

  protected override modifyDamage(info: DamageInfo): number {
    const w = this.world;
    if (w.dev.god || this.invuln > 0 || w.cinematicLock) return 0;
    let amt = info.amount;
    if (this.wardUp && this.ward > 0) {
      const red = info.type === 'ap' ? PLAYER.wardReduceAP : info.type === 'explosive' ? PLAYER.wardReduceExplosive : info.type === 'rift' ? 0.3 : PLAYER.wardReduce;
      const absorbed = amt * red;
      amt -= absorbed;
      this.ward -= absorbed * 1.1 * this.wardDrainMul;
      this.wardIdle = 0;
      w.audio.play('wardHit', { throttle: 0.05 });
      if (Math.random() < 0.5) w.particles.emit({ x: info.x !== undefined ? info.x : this.x, y: 1.1, z: info.z !== undefined ? info.z : this.z, count: 3, color: [0x5fd8ff, 0xffffff], speed: 3, life: [0.1, 0.25], size: [0.12, 0.2] });
      if (this.ward <= 0) this.breakWard();
    }
    return amt;
  }

  protected override onHurt(info: DamageInfo, amount: number): void {
    const w = this.world;
    w.stats.damageTaken += amount;
    if (info.type !== 'fire' || amount > 2) {
      this.hurtT = 0.6;
      const sx = info.source as Actor | null;
      const fx = sx && typeof sx === 'object' && 'x' in sx ? sx.x : info.x !== undefined ? info.x : this.x - (info.dirX || 0);
      const fz = sx && typeof sx === 'object' && 'z' in sx ? sx.z : info.z !== undefined ? info.z : this.z - (info.dirZ || 0);
      this.hurtDir = Math.atan2(fx - this.x, -(fz - this.z));
      w.audio.play('playerHurt', { throttle: 0.12 });
      w.onPlayerHit(this.hurtDir, amount);
      if (amount > 10) w.input.vibrate(80, Math.min(1, amount / 40));
    }
    if (this.channelTarget) {
      this.channelT = Math.max(0, this.channelT - 0.15);
    }
  }

  protected override onDeath(): void {
    const w = this.world;
    this.wardUp = false;
    this.wardMesh.visible = false;
    this.channelTarget = null;
    w.audio.loopVolume('ward', 0);
    w.audio.loopVolume('channel', 0);
    w.particles.emit({ x: this.x, y: 1, z: this.z, count: 40, color: [0xb36bff, 0x7fd8ff], speed: [1, 4], life: [0.6, 1.2], size: [0.2, 0.35], gravity: -1, jitter: 0.5 });
    w.onPlayerDown();
  }

  revive(x: number, z: number): void {
    this.alive = true;
    this.hp = this.maxHp;
    this.mana = this.maxMana;
    this.ward = this.wardMax;
    this.wardBroken = 0;
    this.burnT = this.freezeT = this.stunT = this.slowT = 0;
    this.downedT = 0;
    this.x = x;
    this.z = z;
    this.vx = this.vz = 0;
    this.knockX = this.knockZ = 0;
    this.invuln = 1.5;
    this.model.body.rotation.set(0, 0, 0);
    this.model.body.position.set(0, 0, 0);
    this.syncRoot();
  }

  private animate(dt: number): void {
    const m = this.model;
    const t = this.animT;
    if (!this.alive) {
      // downed: collapse to knees, staff drops, glow fades
      const k = Math.min(1, this.downedT * 2.5);
      m.body.rotation.x = -k * 1.2;
      m.body.position.y = -k * 0.35;
      m.orb.position.y = 1.7 - k * 1.4;
      return;
    }
    const run = this.moving ? 1 : 0;
    m.body.position.y = Math.abs(Math.sin(t * 9)) * 0.08 * run + Math.sin(t * 2) * 0.02;
    m.body.rotation.x = damp(m.body.rotation.x, run * 0.12, 10, dt);
    m.hat.rotation.z = Math.sin(t * 9) * 0.05 * run;
    if (this.castAnim > 0) this.castAnim -= dt;
    if (this.throwAnim > 0) this.throwAnim -= dt;
    const casting = this.castAnim > 0 || this.firing;
    const channeling = !!this.channelTarget;
    let armR = 0, armL = 0;
    if (this.wardUp || channeling) { armR = -2.2; armL = -2.2; }
    else if (this.throwAnim > 0) armR = -2.6 + this.throwAnim * 4;
    else if (casting) armR = -1.4;
    else armR = Math.sin(t * 9) * 0.3 * run;
    m.armR.rotation.x = damp(m.armR.rotation.x, armR, 18, dt);
    m.armL.rotation.x = damp(m.armL.rotation.x, armL || -Math.sin(t * 9) * 0.3 * run, 18, dt);
    // hovering companion orb circles the mage
    const oa = t * 1.6;
    m.orb.position.set(Math.cos(oa) * 0.7, 1.8 + Math.sin(t * 3) * 0.12, Math.sin(oa) * 0.7);
    const pulse = casting ? 2.2 : 1.1 + Math.sin(t * 4) * 0.2;
    m.orbMat.emissiveIntensity = pulse;
    // ward dome
    this.wardMesh.visible = this.wardUp;
    if (this.wardUp) {
      const frac = this.ward / this.wardMax;
      this.wardMat.opacity = 0.18 + 0.3 * frac;
      this.wardMesh.scale.setScalar(1 + Math.sin(t * 10) * 0.03);
      this.wardMesh.rotation.y += dt * 0.6;
      this.world.lights.request(this.x, 1.2, this.z, 0x5fd8ff, 5, 5);
    }
    if (this.invuln > 0 && this.invuln < 1.2) this.model.root.visible = Math.floor(this.invuln * 20) % 2 === 0;
    else this.model.root.visible = true;
    // staff glow light
    this.world.lights.request(this.x, 1.8, this.z, 0xb36bff, casting ? 5 : 2, 5);
  }

  /** Persisted between checkpoint restarts within a mission. */
  snapshotConsumables(): { hp: number; mp: number; bombs: number } {
    return { hp: this.hpPotions, mp: this.manaPotions, bombs: this.bombs };
  }

  static secondaryList(): SecondarySpellId[] {
    return SECONDARY_SPELLS.slice();
  }
}
