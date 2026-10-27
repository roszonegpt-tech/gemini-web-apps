// v1.1 — Arcane Golem flight segment (Sector 2, flooded trench run).
// Valerius awakens a giant flying stone golem at a shrine, flies it over the flooded
// trenches and blasts the Vanguard anti-air battery with a chest laser beam.
//  - ArcaneGolem: inertial flight with drift, chest beam (heat gauge), Stone Volley, Rift Dash,
//    Stone Brace (damage reduction), stone-armour durability, crash + respawn.
//  - Obstacles: AA missile towers (homing missiles), radar mines, barrier pylon fences,
//    sandbag emplacements with troopers, and an attack helicopter.
// Everything is installed into an existing World through its extension hooks
// (`updaters`, `cameraFocus`, `mountTarget`, `PlayerMage.mounted`) — no core files change.
import * as THREE from 'three';
import type { DamageInfo } from '../config/types';
import { VERSION } from '../config/version';
import { CF } from '../core/Physics';
import { recordPlaytest } from '../core/Save';
import type { World } from '../scenes/World';
import { box, buildGolem, cyl, glowMat, mat, mesh, octa, torus, COL } from '../utils/models';
import { propTexture, runeTexture } from '../utils/textures';
import { clamp, damp, dist, heading, pointSegDist, rand, segCircle, turnToward } from '../utils/math';
import { Actor } from './Actor';
import type { Interactable, MapIcon } from './Interactables';
import type { PlayerMage } from './PlayerMage';
import type { VanguardEnemy } from './VanguardEnemy';

// ------------------------------------------------------------------ tuning

export const GOLEM = {
  hp: 650,
  radius: 1.4,
  hover: 3.4,
  accel: 22,
  drag: 1.6,
  maxSpeed: 9.5,
  braceMul: 0.45,
  braceReduce: 0.7,
  beamRange: 19,
  beamDps: 85,
  heatRate: 0.24,
  coolRate: 0.38,
  overheatLock: 2.0,
  volleyCd: 3.2,
  dashCd: 2.2,
  dashSpeed: 22,
  respawn: 8,
  // v1.2 collision response
  restitution: 0.35, // share of the normal speed kept after a bounce
  scrapeFriction: 0.85, // tangential speed kept on contact
  impactFx: 3.5, // normal speed (m/s) above which an impact shakes the camera + throws stone chips
  impactDamage: 12, // normal speed above which the golem chips itself (only dashes get there)
  impactDamagePerMs: 2.2,
  chargeTime: 0.15, // beam charge-up before it fires
};

/**
 * Flight corridor for Sector 2 as a union of rectangles [x0, z0, x1, z1] that bound the golem's
 * centre: the flooded strip (z ≥ 62) plus the zone-B ground area.
 */
const CORRIDOR: [number, number, number, number][] = [
  [3, 62, 86.5, 79],
  [45.5, 2, 86.5, 62],
];

function allowed(x: number, z: number): boolean {
  for (const [x0, z0, x1, z1] of CORRIDOR) if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return true;
  return false;
}

/** Nearest point of the corridor to (x, z) (the point itself when inside). */
function clampToCorridor(x: number, z: number, out: { x: number; z: number }): { x: number; z: number } {
  let best = Infinity;
  for (const [x0, z0, x1, z1] of CORRIDOR) {
    const cx = clamp(x, x0, x1), cz = clamp(z, z0, z1);
    const d = (cx - x) * (cx - x) + (cz - z) * (cz - z);
    if (d < best) { best = d; out.x = cx; out.z = cz; }
  }
  return out;
}

// ------------------------------------------------------------------ sounds (registered once)

let soundsReady = false;
function registerSounds(w: World): void {
  if (soundsReady) return;
  soundsReady = true;
  const a = w.audio;
  a.registerRecipe('golemLaser', (e, o) => {
    e.tone(o, { type: 'sawtooth', f0: 220, f1: 660, dur: 0.25, vol: 0.12 });
    e.noise(o, { dur: 0.2, vol: 0.15, filter: 'bandpass', f0: 1800, q: 3 });
  });
  a.registerRecipe('golemAwaken', (e, o) => {
    e.tone(o, { type: 'sine', f0: 55, f1: 110, dur: 1.4, vol: 0.4, attack: 0.3 });
    e.noise(o, { dur: 1.2, vol: 0.35, filter: 'lowpass', f0: 400, f1: 120, q: 1 });
    [196, 294, 392].forEach((f, i) => e.tone(o, { type: 'triangle', f0: f, dur: 1.5, vol: 0.1, delay: 0.3 + i * 0.08 }));
  });
  a.registerRecipe('golemDash', (e, o) => {
    e.noise(o, { dur: 0.35, vol: 0.34, filter: 'bandpass', f0: 500, f1: 2200, q: 1.3 });
    e.tone(o, { type: 'sine', f0: 90, f1: 40, dur: 0.3, vol: 0.3 });
  });
  a.registerRecipe('aaLaunch', (e, o) => {
    e.noise(o, { dur: 0.6, vol: 0.45, filter: 'bandpass', f0: 900, f1: 2200, q: 1.2 });
    e.tone(o, { type: 'square', f0: 900, f1: 1300, dur: 0.15, vol: 0.1 });
  });
  // missile lock warning: must cut through the engine rumble and the beam (v1.2: longer + louder)
  a.registerRecipe('lockTone', (e, o) => {
    e.tone(o, { type: 'square', f0: 1500, dur: 0.11, vol: 0.22 });
    e.tone(o, { type: 'triangle', f0: 3000, dur: 0.08, vol: 0.08 });
  });
  a.registerRecipe('stoneHit', (e, o) => {
    e.noise(o, { dur: 0.12, vol: 0.25, filter: 'lowpass', f0: 800, f1: 200, q: 0.8 });
    e.tone(o, { type: 'sine', f0: 140, f1: 70, dur: 0.12, vol: 0.2 });
    e.noise(o, { dur: 0.05, vol: 0.16, filter: 'bandpass', f0: 1600, q: 1.5 }); // phone-speaker click
  });
  // v1.2
  a.registerRecipe('golemScrape', (e, o, p) => {
    e.noise(o, { dur: 0.4, vol: 0.32, filter: 'bandpass', f0: 1100 * p, f1: 260, q: 1.4 });
    e.tone(o, { type: 'sine', f0: 95 * p, f1: 38, dur: 0.28, vol: 0.38 });
    e.noise(o, { dur: 0.07, vol: 0.14, filter: 'highpass', f0: 2200, q: 0.6 });
    for (let i = 0; i < 3; i++) e.noise(o, { dur: 0.04, vol: 0.08, filter: 'bandpass', f0: 1800 + i * 500, q: 3, delay: 0.06 + i * 0.05 });
  });
  a.registerRecipe('golemStomp', (e, o, p) => {
    e.tone(o, { type: 'sine', f0: 72 * p, f1: 34, dur: 0.32, vol: 0.5 });
    e.noise(o, { dur: 0.36, vol: 0.3, filter: 'lowpass', f0: 520, f1: 80, q: 0.8 });
    e.noise(o, { dur: 0.16, vol: 0.2, filter: 'bandpass', f0: 750, f1: 300, q: 1.1 }); // stone crunch
    e.noise(o, { dur: 0.06, vol: 0.22, filter: 'bandpass', f0: 1300, q: 1.2 });
  });
  a.registerRecipe('golemCharge', (e, o) => {
    e.tone(o, { type: 'sawtooth', f0: 140, f1: 520, dur: GOLEM.chargeTime + 0.06, vol: 0.14, attack: 0.04 });
    e.tone(o, { type: 'sine', f0: 600, f1: 1500, dur: GOLEM.chargeTime + 0.04, vol: 0.12, attack: 0.03 });
  });
  a.registerRecipe('golemOverheat', (e, o) => {
    e.noise(o, { dur: 1.7, vol: 0.18, filter: 'highpass', f0: 3200, q: 0.5, attack: 0.02 });
    e.noise(o, { dur: 1.1, vol: 0.14, filter: 'bandpass', f0: 1400, f1: 500, q: 0.8 });
    e.tone(o, { type: 'square', f0: 240, f1: 120, dur: 0.22, vol: 0.06 });
  });
  a.registerRecipe('golemHeatWarn', (e, o) => e.tone(o, { type: 'square', f0: 2000, dur: 0.06, vol: 0.2 }));
}

// Loop nodes are kept so their pitch / filter can follow the golem every frame. AudioEngine owns
// the loops (one per name); the builders refresh these handles whenever it (re)builds them.
let engineNodes: { saw: OscillatorNode; sub: OscillatorNode; lp: BiquadFilterNode; grind: GainNode; grindF: BiquadFilterNode } | null = null;
let beamNodes: { o: OscillatorNode; o2: OscillatorNode; bp: BiquadFilterNode } | null = null;

/** Engine rumble (loop/golemHum): sawtooth + sub through a lowpass, plus a stone/air grind band. */
const humLoop = (a: World['audio'], out: GainNode): AudioScheduledSourceNode[] => {
  const ctx = a.ctx as AudioContext;
  const saw = ctx.createOscillator(); saw.type = 'sawtooth'; saw.frequency.value = 46;
  const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = 92;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240; lp.Q.value = 2.5;
  const g = ctx.createGain(); g.gain.value = 0.2;
  saw.connect(lp); sub.connect(lp); lp.connect(g); g.connect(out);
  const n = a.noiseSource() as AudioBufferSourceNode;
  const grindF = ctx.createBiquadFilter(); grindF.type = 'bandpass'; grindF.frequency.value = 420; grindF.Q.value = 1.1;
  const grind = ctx.createGain(); grind.gain.value = 0.07;
  n.connect(grindF); grindF.connect(grind); grind.connect(out);
  saw.start(); sub.start(); n.start();
  engineNodes = { saw, sub, lp, grind, grindF };
  return [saw, sub, n];
};

/** Chest-beam loop (loop/golemBeam): detuned saw/square through a bandpass; pitch rises with heat. */
const beamLoop = (a: World['audio'], out: GainNode): AudioScheduledSourceNode[] => {
  const ctx = a.ctx as AudioContext;
  const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 330;
  const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 331.5;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 18;
  const lg = ctx.createGain(); lg.gain.value = 40;
  lfo.connect(lg); lg.connect(o.frequency);
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1200; bp.Q.value = 2;
  const g = ctx.createGain(); g.gain.value = 0.75;
  o.connect(bp); o2.connect(bp); bp.connect(g); g.connect(out); o.start(); o2.start(); lfo.start();
  beamNodes = { o, o2, bp };
  return [o, o2, lfo];
};

/** Engine pitch / filter / grind follow speed (0–1, >1 while dashing) and Stone Brace. */
function tuneEngine(a: World['audio'], speed: number, brace: boolean): void {
  if (!engineNodes || !a.ctx) return;
  const t = a.ctx.currentTime;
  const s = clamp(speed, 0, 1.6);
  const f = 44 + 24 * s - (brace ? 9 : 0);
  engineNodes.saw.frequency.setTargetAtTime(f, t, 0.12);
  engineNodes.sub.frequency.setTargetAtTime(f * 2, t, 0.12);
  engineNodes.lp.frequency.setTargetAtTime((brace ? 170 : 230) + 820 * s, t, 0.1);
  engineNodes.grind.gain.setTargetAtTime(0.07 + 0.22 * s + (brace ? 0.09 : 0), t, 0.15);
  engineNodes.grindF.frequency.setTargetAtTime((brace ? 300 : 380) + 900 * s, t, 0.15);
}

function tuneBeam(a: World['audio'], heat: number): void {
  if (!beamNodes || !a.ctx) return;
  const t = a.ctx.currentTime;
  const f = 300 + heat * 240;
  beamNodes.o.frequency.setTargetAtTime(f, t, 0.08);
  beamNodes.o2.frequency.setTargetAtTime(f * 1.005, t, 0.08);
  beamNodes.bp.frequency.setTargetAtTime(1100 + heat * 900, t, 0.08);
}

// ------------------------------------------------------------------ the golem

export class ArcaneGolem extends Actor {
  model = buildGolem(1.25);
  rider: PlayerMage | null = null;
  parked = true;
  heat = 0;
  overheat = 0;
  firing = false;
  beamEndX = 0;
  beamEndZ = 0;
  volleyCd = 0;
  dashCd = 0;
  dashT = 0;
  bracing = false;
  animT = 0;
  hurtT = 0;
  chargeT = 0;
  /** True while descending onto the ground after a dismount / re-forming (stomps on touchdown). */
  landing = false;
  /** Count of hard impacts and the last impact's normal speed (read by tests / dev tools). */
  impacts = 0;
  lastImpact = 0;
  overheats = 0;
  readonly beamMat: THREE.MeshBasicMaterial;
  private beam: THREE.Mesh;
  private rings: THREE.Object3D[] = [];
  private flyOut = { x: 0, z: 0 };
  private impactCd = 0;
  private heatWarnT = 0;

  constructor(world: World, x: number, z: number) {
    super(world, 'mage');
    this.kind = 'arcaneGolem';
    this.name = 'Arcane Golem';
    this.hp = this.maxHp = GOLEM.hp;
    this.radius = GOLEM.radius;
    this.flying = true;
    this.x = x;
    this.z = z;
    this.y = 0.2;
    this.facing = Math.PI;
    this.targetable = false; // a dormant statue draws no fire
    this.root.add(this.model.root);
    this.model.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    // arcane thruster rings under the golem
    for (let i = 0; i < 2; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(1.0 + i * 0.5, 0.06, 4, 18), glowMat(0x7fd8ff, 0.7 - i * 0.25));
      r.rotation.x = Math.PI / 2;
      r.position.y = -0.2 - i * 0.25;
      this.root.add(r);
      this.rings.push(r);
    }
    this.beamMat = new THREE.MeshBasicMaterial({ color: 0x9cf6ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    this.beam = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 1), this.beamMat);
    this.beam.visible = false;
    world.scene.add(this.beam);
    this.syncRoot();
  }

  get mounted(): boolean {
    return !!this.rider;
  }

  protected override modifyDamage(info: DamageInfo): number {
    if (!this.rider) return 0; // dormant statue
    let amt = info.amount;
    if (info.type === 'bullet' || info.type === 'laser') amt *= 0.45; // stone armour
    if (this.bracing) amt *= 1 - GOLEM.braceReduce;
    if (this.dashT > 0) amt *= 0.2;
    return amt;
  }

  protected override onHurt(_info: DamageInfo, amount: number): void {
    this.hurtT = 0.3;
    this.world.audio.play('stoneHit', { x: this.x, z: this.z, throttle: 0.08 });
    if (amount > 15) this.world.camRig.addTrauma(0.15);
    if (this.rider) this.rider.hurtT = 0.4;
  }

  protected override onDeath(): void {
    const w = this.world;
    w.explode(this.x, this.z, 3.5, 0, 'explosive', this, { faction: 'neutral', shake: 0.7, color: [0x8a8496, 0x7fd8ff, 0xffffff] });
    w.particles.emit({ x: this.x, y: this.y + 1.5, z: this.z, count: 70, color: [0x8a8496, 0x6a6478, 0x5f9440], speed: [3, 9], life: [0.6, 1.2], size: [0.3, 0.6], gravity: 12, additive: false });
    w.banner('THE GOLEM SHATTERS', 'warn');
  }

  mount(p: PlayerMage): void {
    const w = this.world;
    this.rider = p;
    this.parked = false;
    this.targetable = true;
    w.audio.loopVolume('ward', 0);
    p.mounted = true;
    p.targetable = false;
    p.root.visible = false;
    p.wardUp = false;
    w.mountTarget = this;
    w.cameraFocus = this;
    w.audio.play('golemAwaken', { x: this.x, z: this.z });
    w.fx.shockwave(this.x, this.z, 5, 0x7fd8ff, 0.6);
    w.particles.emit({ x: this.x, y: 1.5, z: this.z, count: 60, color: [0x7fd8ff, 0xffffff, 0x8a8496], speed: [2, 6], life: [0.4, 1.0], size: [0.2, 0.4], jitter: 1.2 });
    w.banner('ARCANE GOLEM AWAKENED', 'big');
    w.subtitle('High Priestess Lyra', 'Hold fire to sweep the chest beam. Watch its heat — and brace (Ward) against flak.', 4.5);
  }

  dismount(): void {
    const w = this.world;
    const p = this.rider;
    if (!p) return;
    this.rider = null;
    this.parked = true;
    this.landing = true;
    this.targetable = false;
    this.firing = false;
    this.chargeT = 0;
    this.beam.visible = false;
    p.mounted = false;
    p.targetable = true;
    p.root.visible = true;
    p.invuln = 1;
    p.vx = p.vz = 0;
    const out = { x: 0, z: 0 };
    w.phys.resolveCircle(this.x + 1.8, this.z + 1.2, p.radius, CF.MOVE, out);
    p.x = out.x;
    p.z = out.z;
    p.syncRoot();
    w.mountTarget = null;
    w.cameraFocus = null;
    w.audio.loopVolume('golemHum', 0, humLoop);
    w.audio.loopVolume('golemBeam', 0, beamLoop);
    w.particles.emit({ x: p.x, y: 1, z: p.z, count: 24, color: [0xb36bff, 0xffffff], speed: [1, 4], life: [0.3, 0.6], size: [0.15, 0.3] });
  }

  /** Can the rider step off here? (ground side of zone B, on walkable ground) */
  canDismount(): boolean {
    const w = this.world;
    return this.z < 61.5 && this.x > 45.5 && w.nav.walkable(this.x + 1.8, this.z + 1.2) && w.phys.circleFree(this.x + 1.8, this.z + 1.2, 0.45, CF.MOVE);
  }

  update(dt: number): void {
    const w = this.world;
    this.animT += dt;
    if (!this.alive) {
      this.beam.visible = false;
      return;
    }
    this.tickStatus(dt);
    if (this.hurtT > 0) this.hurtT -= dt;
    const m = this.model;
    if (!this.rider) {
      // dormant statue on its shrine
      this.y = damp(this.y, 0.25, 3, dt);
      if (this.landing && this.y < 0.6) this.touchDown();
      m.core.emissiveIntensity = 0.5 + Math.sin(this.animT * 2) * 0.3;
      for (const r of this.rings) r.visible = false;
      this.syncRoot();
      return;
    }
    for (const r of this.rings) r.visible = true;
    const inp = w.input;
    const p = this.rider;
    // ---- flight with inertia / drift
    this.bracing = inp.isDown('ward');
    let ax = inp.moveX, az = inp.moveY;
    const al = Math.hypot(ax, az);
    if (al > 1) { ax /= al; az /= al; }
    const accel = GOLEM.accel * (this.bracing ? GOLEM.braceMul : 1);
    this.vx += ax * accel * dt;
    this.vz += az * accel * dt;
    const drag = Math.exp(-GOLEM.drag * dt);
    this.vx *= drag;
    this.vz *= drag;
    if (this.dashCd > 0) this.dashCd -= dt;
    if (this.dashT > 0) this.dashT -= dt;
    if (inp.pressed('blink') && this.dashCd <= 0) {
      let dx = ax, dz = az;
      if (Math.hypot(dx, dz) < 0.2) { dx = Math.sin(this.facing); dz = Math.cos(this.facing); }
      const l = Math.hypot(dx, dz) || 1;
      this.vx = (dx / l) * GOLEM.dashSpeed;
      this.vz = (dz / l) * GOLEM.dashSpeed;
      this.dashT = 0.35;
      this.dashCd = GOLEM.dashCd;
      w.audio.play('golemDash', { x: this.x, z: this.z });
      w.fx.shockwave(this.x, this.z, 3, 0x7fd8ff, 0.3, this.y);
    }
    const sp = Math.hypot(this.vx, this.vz);
    const maxSp = this.dashT > 0 ? GOLEM.dashSpeed : GOLEM.maxSpeed * (this.bracing ? GOLEM.braceMul + 0.2 : 1);
    if (sp > maxSp) { this.vx *= maxSp / sp; this.vz *= maxSp / sp; }
    // swept move against tall geometry (FLY) and the flight corridor; knockback joins the velocity
    this.applyKnock(dt);
    if (this.impactCd > 0) this.impactCd -= dt;
    this.moveSwept(dt);
    // facing follows the aim
    const aimX = w.aimX, aimZ = w.aimZ;
    this.facing = turnToward(this.facing, heading(aimX - this.x, aimZ - this.z), dt * 5);
    this.y = damp(this.y, GOLEM.hover + Math.sin(this.animT * 1.6) * 0.25, 3, dt);
    // keep the rider glued to the golem so zone logic / aim / camera follow it
    p.x = this.x;
    p.z = this.z;
    p.vx = this.vx;
    p.vz = this.vz;
    p.facing = this.facing;
    // ---- chest beam
    if (this.overheat > 0) {
      this.overheat -= dt;
      this.heat = Math.max(0, this.heat - GOLEM.coolRate * dt);
    }
    // short charge-up before the beam fires (audible + visible telegraph)
    const wantFire = inp.isDown('fire1') && this.overheat <= 0 && !w.cinematicLock;
    if (wantFire) {
      if (this.chargeT === 0) w.audio.play('golemCharge', { x: this.x, z: this.z, throttle: 0.1 });
      this.chargeT += dt;
    } else {
      this.chargeT = 0;
    }
    const wasFiring = this.firing;
    this.firing = wantFire && this.chargeT >= GOLEM.chargeTime;
    if (this.firing && !wasFiring) w.audio.play('golemLaser', { x: this.x, z: this.z, throttle: 0.1 }); // ignition crack
    if (this.firing) {
      this.heat += GOLEM.heatRate * dt;
      if (this.heat > 0.8) {
        this.heatWarnT -= dt;
        if (this.heatWarnT <= 0) { this.heatWarnT = 0.32 - (this.heat - 0.8) * 0.9; w.audio.play('golemHeatWarn', { throttle: 0.1 }); }
      }
      if (this.heat >= 1) {
        this.heat = 1;
        this.overheat = GOLEM.overheatLock;
        this.overheats++;
        this.firing = false;
        this.chargeT = 0;
        w.floatText(this.x, this.y + 3, this.z, 'BEAM OVERHEATED', '#ffb04a');
        w.audio.play('golemOverheat', { x: this.x, z: this.z });
        w.particles.smoke(this.x + Math.sin(this.facing), this.y + 2, this.z + Math.cos(this.facing), 10, 0xd8d4d0, 0.8);
      }
    } else if (this.overheat <= 0) {
      this.heat = Math.max(0, this.heat - GOLEM.coolRate * dt);
    }
    if (this.overheat > 0 && Math.random() < dt * 14) {
      // venting steam while locked
      w.particles.emit({ x: this.x + rand(-0.5, 0.5), y: this.y + 2.2, z: this.z + rand(-0.5, 0.5), count: 1, color: [0xe8e4e0, 0xffb04a], speed: [1, 2.5], life: [0.4, 0.8], size: [0.2, 0.35], dir: [0, 1, 0], spread: 0.5, additive: false, alpha: 0.5 });
    }
    this.updateBeam(dt, aimX, aimZ);
    // ---- Stone Volley (secondary)
    if (this.volleyCd > 0) this.volleyCd -= dt;
    if (inp.pressed('fire2') && this.volleyCd <= 0) {
      this.volleyCd = GOLEM.volleyCd;
      for (let i = 0; i < 3; i++) {
        const tx = aimX + rand(-2, 2), tz = aimZ + rand(-2, 2);
        w.projectiles.lob('shell', this.x, this.z, tx, tz, 0.8 + i * 0.1, 2.5, { faction: 'mage', source: this, dmg: 45 * p.spellPower, type: 'explosive', aoe: 2.6, color: 0x8a8496, size: 0.45, spell: 'golem' });
        w.fx.telegraph(tx, tz, 2.6, 0.8 + i * 0.1, 0x7fd8ff);
      }
      w.audio.play('throw', { x: this.x, z: this.z, pitch: 0.6 });
    }
    // ---- animation, lights, audio
    m.legL.rotation.x = Math.sin(this.animT * 2) * 0.15 + 0.25;
    m.legR.rotation.x = -Math.sin(this.animT * 2) * 0.15 + 0.25;
    const lean = clamp(Math.hypot(this.vx, this.vz) / GOLEM.maxSpeed, 0, 1);
    m.body.rotation.x = lean * 0.25;
    m.armL.rotation.x = damp(m.armL.rotation.x, this.firing ? -1.2 : this.bracing ? -2.2 : -0.3, 10, dt);
    m.armR.rotation.x = damp(m.armR.rotation.x, this.firing ? -1.2 : this.bracing ? -2.2 : -0.3, 10, dt);
    const charging = !this.firing && this.chargeT > 0;
    m.core.emissiveIntensity = this.firing ? 3 : 1.2 + this.heat + (charging ? 1.6 : 0);
    m.core.emissive.setHex(this.overheat > 0 ? 0xff5a2a : this.heat > 0.7 ? 0xffb04a : 0x4fc8ff);
    if (charging && Math.random() < dt * 40) {
      const a = rand(0, Math.PI * 2);
      const cx = this.x + Math.sin(this.facing) * 1.1, cz = this.z + Math.cos(this.facing) * 1.1;
      w.particles.emit({ x: cx + Math.sin(a) * 1.2, y: this.y + 2, z: cz + Math.cos(a) * 1.2, count: 1, color: [0x9cf6ff, 0xffffff], speed: [3, 4], life: [0.1, 0.18], size: [0.12, 0.22], dir: [-Math.sin(a), 0, -Math.cos(a)], spread: 0.1 });
    }
    for (let i = 0; i < this.rings.length; i++) this.rings[i].rotation.z += dt * (i ? -3 : 4);
    if (Math.random() < dt * 30) w.particles.emit({ x: this.x + rand(-0.8, 0.8), y: this.y - 0.3, z: this.z + rand(-0.8, 0.8), count: 1, color: [0x7fd8ff, 0xffffff], speed: [1, 3], life: [0.2, 0.5], size: [0.15, 0.3], dir: [0, -1, 0], spread: 0.3 });
    w.lights.request(this.x, this.y + 1.5, this.z, 0x7fd8ff, this.firing ? 14 : charging ? 9 : 5, 9);
    const speed = Math.hypot(this.vx, this.vz) / GOLEM.maxSpeed;
    w.audio.loopVolume('golemHum', 0.22 + clamp(speed, 0, 1.5) * 0.08 + (this.bracing ? 0.05 : 0), humLoop);
    tuneEngine(w.audio, speed, this.bracing);
    w.audio.loopVolume('golemBeam', this.firing ? 0.38 : 0, beamLoop);
    if (this.firing) tuneBeam(w.audio, this.heat);
    this.syncRoot();
  }

  /** Converts knockback (explosions, barrier shocks) into flight velocity, so it is swept too. */
  override applyKnock(_dt: number): void {
    if (Math.abs(this.knockX) + Math.abs(this.knockZ) < 0.01) return;
    this.vx += this.knockX * 1.2;
    this.vz += this.knockZ * 1.2;
    this.knockX = this.knockZ = 0;
  }

  private valid(x: number, z: number): boolean {
    return allowed(x, z) && this.world.phys.circleFree(x, z, this.radius - 0.02, CF.FLY);
  }

  /**
   * Swept circle movement: the step is split so no sub-step is longer than a quarter of the golem's
   * radius (≤ 0.35 m at dash speed), each sub-step is pushed out of FLY colliders and then clamped into
   * the corridor, and the velocity is reflected about the contact normal with damping. The golem's
   * previous position is always valid, so it can never end a frame inside geometry or outside the corridor.
   */
  private moveSwept(dt: number): void {
    const w = this.world;
    const len = Math.hypot(this.vx, this.vz) * dt;
    const steps = Math.min(16, Math.max(1, Math.ceil(len / (this.radius * 0.25))));
    const h = dt / steps;
    const o = this.flyOut;
    let impact = 0, inx = 0, inz = 0;
    for (let i = 0; i < steps; i++) {
      const px = this.x + this.vx * h, pz = this.z + this.vz * h;
      w.phys.resolveCircle(px, pz, this.radius, CF.FLY, o);
      clampToCorridor(o.x, o.z, o);
      // the corridor clamp may push back into a spire / gate: resolve once more
      w.phys.resolveCircle(o.x, o.z, this.radius, CF.FLY, o);
      let nx = o.x, nz = o.z;
      if (!this.valid(nx, nz) && this.valid(this.x, this.z)) { nx = this.x; nz = this.z; }
      // contact normal = direction the constraints pushed us
      let cx = nx - px, cz = nz - pz;
      const cl = Math.hypot(cx, cz);
      if (cl > 1e-5) {
        cx /= cl; cz /= cl;
        const vn = this.vx * cx + this.vz * cz;
        if (vn < 0) {
          const tx = this.vx - vn * cx, tz = this.vz - vn * cz;
          this.vx = tx * GOLEM.scrapeFriction - vn * GOLEM.restitution * cx;
          this.vz = tz * GOLEM.scrapeFriction - vn * GOLEM.restitution * cz;
          if (-vn > impact) { impact = -vn; inx = cx; inz = cz; }
        }
      }
      this.x = nx;
      this.z = nz;
    }
    if (impact > GOLEM.impactFx && this.impactCd <= 0) this.onImpact(impact, inx, inz);
  }

  private onImpact(speed: number, nx: number, nz: number): void {
    const w = this.world;
    this.impactCd = 0.2;
    this.impacts++;
    this.lastImpact = speed;
    const k = clamp((speed - GOLEM.impactFx) / (GOLEM.dashSpeed - GOLEM.impactFx), 0, 1);
    w.camRig.addTrauma(0.12 + k * 0.3);
    const ix = this.x - nx * this.radius, iz = this.z - nz * this.radius;
    w.particles.emit({ x: ix, y: this.y + 0.8, z: iz, count: 10 + Math.round(k * 22), color: [0x8a8496, 0x6a6478, 0xb8b0a0], speed: [2, 5 + k * 5], life: [0.3, 0.8], size: [0.15, 0.35], dir: [nx, 0.6, nz], spread: 0.8, gravity: 14, additive: false });
    w.particles.emit({ x: ix, y: this.y + 0.8, z: iz, count: 4 + Math.round(k * 8), color: [0x7fd8ff, 0xffffff], speed: [3, 7], life: [0.1, 0.3], size: [0.1, 0.2], dir: [nx, 0.3, nz], spread: 0.9 });
    w.audio.play('golemScrape', { x: this.x, z: this.z, vol: 0.55 + k * 0.45, pitch: 1.1 - k * 0.25, throttle: 0.12 });
    if (speed > GOLEM.impactDamage) {
      // light, never lethal self-damage for slamming into terrain at dash speed (bracing softens it)
      const dmg = (speed - GOLEM.impactDamage) * GOLEM.impactDamagePerMs * (this.bracing ? 0.3 : 1);
      this.hp = Math.max(Math.min(this.hp, 1), this.hp - dmg);
      this.hurtT = 0.3;
      if (this.rider) this.rider.hurtT = 0.3;
      w.floatText(this.x, this.y + 3, this.z, `-${Math.round(dmg)}`, '#b8b0a0');
    }
  }

  /** Two heavy stone footfalls as the golem settles onto the ground. */
  private touchDown(): void {
    const w = this.world;
    this.landing = false;
    w.audio.play('golemStomp', { x: this.x, z: this.z, throttle: 0 });
    setTimeout(() => {
      if (!w.disposed && this.alive) w.audio.play('golemStomp', { x: this.x, z: this.z, pitch: 0.9, throttle: 0 });
    }, 190);
    w.camRig.addTrauma(0.18);
    w.fx.shockwave(this.x, this.z, 3.2, 0xb8b0a0, 0.35);
    w.particles.emit({ x: this.x, y: 0.3, z: this.z, count: 28, color: [0xb8b0a0, 0x8a8496, 0x6f6a5a], speed: [1.5, 4], life: [0.4, 0.9], size: [0.2, 0.4], dir: [0, 0.4, 0], spread: 1, gravity: 6, additive: false, jitter: 1.4 });
  }

  private updateBeam(dt: number, aimX: number, aimZ: number): void {
    const w = this.world;
    const ox = this.x + Math.sin(this.facing) * 1.1, oz = this.z + Math.cos(this.facing) * 1.1, oy = this.y + 2.0;
    if (!this.firing) {
      this.beam.visible = false;
      return;
    }
    let dx = aimX - ox, dz = aimZ - oz;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    const range = GOLEM.beamRange;
    let ex = ox + dx * range, ez = oz + dz * range;
    // first army actor along the beam (ground or air)
    let hitA: Actor | null = null;
    let hitT = 2;
    for (const a of w.actors) {
      if (!a.alive || !a.targetable || a.faction !== 'army') continue;
      const t = segCircle(ox, oz, ex, ez, a.x, a.z, a.radius + 0.35);
      if (t >= 0 && t < hitT) { hitT = t; hitA = a; }
    }
    // tall geometry stops the beam; low cover is shot *over* from the air but sandbags get blasted
    const hit = w.phys.raycast(ox, oz, ex, ez, CF.SIGHT | CF.FLY, null, 0);
    if (hit && hit.t < hitT) {
      ex = hit.x; ez = hit.z;
      const owner = hit.collider.owner as { isProp?: boolean } | null;
      if (owner && owner.isProp) w.damageProp(owner as never, { amount: GOLEM.beamDps * dt * 2, type: 'arcane', source: this, x: ex, z: ez });
      hitA = null;
    } else if (hitA) {
      ex = ox + (ex - ox) * hitT;
      ez = oz + (ez - oz) * hitT;
      w.dealDamage(hitA, { amount: GOLEM.beamDps * dt * (this.rider ? this.rider.spellPower : 1), type: 'laser', source: this, x: ex, z: ez, spell: 'golem' });
    } else {
      // scorch low cover along the last metre of the beam (sandbag lines in the trenches)
      for (const pr of w.propsList) {
        if (pr.destroyed || pr.material !== 'sand') continue;
        if (pointSegDist(pr.x, pr.z, ox, oz, ex, ez) < 0.8) w.damageProp(pr, { amount: GOLEM.beamDps * dt, type: 'arcane', source: this, x: pr.x, z: pr.z });
      }
    }
    this.beamEndX = ex;
    this.beamEndZ = ez;
    const ey = hitA ? hitA.y + (hitA.flying ? 0 : 1) : 0.3;
    // visual: stretched glowing box from the chest to the impact point
    const mx = (ox + ex) / 2, my = (oy + ey) / 2, mz = (oz + ez) / 2;
    const len = Math.hypot(ex - ox, ey - oy, ez - oz);
    this.beam.visible = true;
    this.beam.position.set(mx, my, mz);
    this.beam.scale.set(1 + Math.sin(this.animT * 40) * 0.25, 1 + Math.sin(this.animT * 40) * 0.25, len);
    this.beam.lookAt(ex, ey, ez);
    this.beamMat.opacity = 0.7 + Math.random() * 0.3;
    w.lights.request(ex, ey + 0.5, ez, 0x9cf6ff, 10, 7);
    if (Math.random() < dt * 40) w.particles.emit({ x: ex, y: ey + 0.2, z: ez, count: 2, color: [0x9cf6ff, 0xffffff, 0xffd84a], speed: [2, 6], life: [0.15, 0.35], size: [0.15, 0.3], gravity: 6 });
    if (Math.random() < dt * 6) w.fx.scorch(ex, ez, 0.6);
    // the beam can also shoot down AA missiles
    for (const g of segments) if (g.world === w) g.beamHit(ox, oz, ex, ez, dt);
  }

  override dispose(): void {
    this.beam.removeFromParent();
    this.beam.geometry.dispose();
    super.dispose();
  }
}

// ------------------------------------------------------------------ obstacles

class AATower extends Actor {
  head = new THREE.Group();
  light: THREE.MeshLambertMaterial;
  cd = rand(1.5, 3);
  lockT = 0;
  constructor(w: World, x: number, z: number) {
    super(w, 'army');
    this.kind = 'aaTower';
    this.name = 'Anti-Air Missile Tower';
    this.structure = true;
    this.tag = 'aa';
    this.zone = 1;
    this.hp = this.maxHp = 300;
    this.radius = 1.1;
    this.x = x;
    this.z = z;
    const steel = mat(COL.steel);
    mesh(cyl(1.0, 1.3, 0.6, 8), mat(COL.steelDark), this.root, 0, 0.3, 0);
    mesh(cyl(0.35, 0.45, 2.2, 6), steel, this.root, 0, 1.6, 0);
    this.head.position.y = 2.9;
    this.root.add(this.head);
    mesh(box(1.6, 0.8, 1.2), mat(0x4e5a36, { map: propTexture('crate') }), this.head, 0, 0, 0);
    for (let i = 0; i < 4; i++) mesh(cyl(0.12, 0.12, 1.2, 6), mat(0xc23a2e), this.head, -0.45 + (i % 2) * 0.9, 0.2 + Math.floor(i / 2) * 0.35, 0.3).rotation.x = Math.PI / 2 - 0.6;
    mesh(cyl(0.5, 0.1, 0.15, 10), mat(0xc8c8c0), this.head, 0, 0.75, -0.4).rotation.x = -0.5;
    this.light = new THREE.MeshLambertMaterial({ color: 0xff2020, emissive: 0xff0000, emissiveIntensity: 1.5 });
    mesh(box(0.15, 0.15, 0.15), this.light, this.head, 0.6, 0.5, 0.5, false);
    this.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    w.phys.addCircle(x, z, 1.0, CF.MOVE | CF.SHOT | CF.SIGHT, this);
    this.syncRoot();
  }
  update(dt: number): void {
    const w = this.world;
    if (!this.alive) return;
    this.tickStatus(dt);
    const g = w.mountTarget;
    if (!g || !g.alive) { this.lockT = 0; return; }
    const d = dist(this.x, this.z, g.x, g.z);
    this.head.rotation.y = turnToward(this.head.rotation.y, heading(g.x - this.x, g.z - this.z), dt * 3);
    if (d > 28) { this.lockT = 0; return; }
    this.cd -= dt;
    this.lockT += dt;
    const blink = Math.floor(this.lockT * (this.cd < 1 ? 12 : 4)) % 2 === 0;
    this.light.emissiveIntensity = blink ? 2 : 0.3;
    // lock warning sounds inside the golem (not at the tower), so it is heard at any lock range
    if (this.cd < 1 && blink && Math.random() < dt * 8) w.audio.play('lockTone', { vol: 0.9, throttle: 0.12 });
    if (this.cd <= 0) {
      this.cd = rand(3.2, 4.2);
      launchMissile(w, this.x, this.z, this);
    }
  }
  protected override onDeath(): void {
    const w = this.world;
    w.explode(this.x, this.z, 3.5, 0, 'explosive', this, { faction: 'neutral', shake: 0.5 });
    this.root.scale.y = 0.4;
    this.root.rotation.z = 0.3;
    this.light.emissiveIntensity = 0;
    w.banner('AA TOWER DESTROYED', 'info');
  }
}

class RadarMine extends Actor {
  armed = 0;
  core: THREE.MeshLambertMaterial;
  baseX: number;
  baseZ: number;
  constructor(w: World, x: number, z: number) {
    super(w, 'army');
    this.kind = 'radarMine';
    this.name = 'Radar Mine';
    this.structure = true;
    this.flying = true;
    this.zone = 1;
    this.hp = this.maxHp = 45;
    this.radius = 0.7;
    this.x = this.baseX = x;
    this.z = this.baseZ = z;
    this.y = GOLEM.hover + 0.5;
    this.core = new THREE.MeshLambertMaterial({ color: 0xff3030, emissive: 0xff1010, emissiveIntensity: 1 });
    mesh(octa(0.55), mat(0x3a3e45), this.root, 0, 0, 0);
    for (let i = 0; i < 6; i++) {
      const s = mesh(cyl(0.05, 0.05, 1.5, 4), mat(0x6b7078), this.root, 0, 0, 0, false);
      s.rotation.set(i < 2 ? Math.PI / 2 : 0, 0, i >= 2 && i < 4 ? Math.PI / 2 : 0);
    }
    mesh(octa(0.25), this.core, this.root, 0, 0.55, 0, false);
    mesh(torus(0.8, 0.04, 3, 14), glowMat(0xff3030, 0.4), this.root, 0, 0, 0, false).rotation.x = Math.PI / 2;
    this.syncRoot();
  }
  update(dt: number): void {
    const w = this.world;
    if (!this.alive) return;
    this.tickStatus(dt);
    const g = w.mountTarget;
    this.root.rotation.y += dt * (this.armed > 0 ? 8 : 1);
    if (!g || !g.alive) {
      this.x = damp(this.x, this.baseX, 1, dt);
      this.z = damp(this.z, this.baseZ, 1, dt);
      this.y = GOLEM.hover + 0.5 + Math.sin(this.root.rotation.y) * 0.2;
      this.syncRoot();
      return;
    }
    const d = dist(this.x, this.z, g.x, g.z);
    if (this.armed <= 0 && d < 7) {
      this.armed = 0.01;
      w.audio.play('lockTone', { x: this.x, z: this.z, throttle: 0 });
      w.floatText(this.x, this.y + 1, this.z, 'MINE ARMED', '#ff6a5a');
    }
    if (this.armed > 0) {
      this.armed += dt;
      this.core.emissiveIntensity = Math.floor(this.armed * 10) % 2 ? 2.5 : 0.4;
      if (this.armed > 0.6) {
        const sp = 7.5 * dt;
        this.x += ((g.x - this.x) / Math.max(0.1, d)) * Math.min(sp, d);
        this.z += ((g.z - this.z) / Math.max(0.1, d)) * Math.min(sp, d);
      }
      if (d < 1.9 || this.armed > 5) {
        this.alive = false;
        this.hp = 0;
        w.explode(this.x, this.z, 2.6, 55, 'explosive', this, { faction: 'army', shake: 0.4, heavy: true });
        this.root.visible = false;
        this.removed = true;
        return;
      }
    }
    w.lights.request(this.x, this.y, this.z, 0xff3030, this.armed > 0 ? 4 : 1.5, 4);
    this.syncRoot();
  }
  protected override onDeath(): void {
    this.world.explode(this.x, this.z, 2.2, 0, 'explosive', this, { faction: 'neutral', shake: 0.2, small: true });
    this.root.visible = false;
    this.removed = true;
  }
}

class BarrierPylon extends Actor {
  core: THREE.MeshLambertMaterial;
  constructor(w: World, x: number, z: number) {
    super(w, 'army');
    this.kind = 'barrierPylon';
    this.name = 'Barrier Pylon';
    this.structure = true;
    this.zone = 1;
    this.hp = this.maxHp = 170;
    this.radius = 0.8;
    this.x = x;
    this.z = z;
    mesh(box(1.2, 0.5, 1.2), mat(COL.steelDark), this.root, 0, 0.25, 0);
    mesh(box(0.5, 4.6, 0.5), mat(COL.steel), this.root, 0, 2.6, 0);
    this.core = new THREE.MeshLambertMaterial({ color: 0xffb030, emissive: 0xff8a00, emissiveIntensity: 1.4 });
    mesh(octa(0.4), this.core, this.root, 0, 5.1, 0);
    mesh(box(0.55, 0.3, 0.55), mat(0xd9b23a, { map: propTexture('hazard') }), this.root, 0, 1.2, 0);
    this.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    w.phys.addCircle(x, z, 0.7, CF.MOVE | CF.SHOT, this);
    this.syncRoot();
  }
  update(dt: number): void {
    if (!this.alive) return;
    this.tickStatus(dt);
    this.core.emissiveIntensity = 1.2 + Math.sin(performance.now() / 120) * 0.4;
  }
  protected override onDeath(): void {
    this.world.explode(this.x, this.z, 2.5, 0, 'explosive', this, { faction: 'neutral', shake: 0.3 });
    this.root.scale.y = 0.3;
    this.core.emissiveIntensity = 0;
  }
}

class Emplacement extends Actor {
  constructor(w: World, x: number, z: number) {
    super(w, 'army');
    this.kind = 'emplacement';
    this.name = 'Sandbag Emplacement';
    this.structure = true;
    this.zone = 1;
    this.hp = this.maxHp = 240;
    this.radius = 2.2;
    this.x = x;
    this.z = z;
    const sand = mat(0xffffff, { map: propTexture('sandbag') });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const b = mesh(box(1.0, 0.75, 0.55), sand, this.root, Math.sin(a) * 2.1, 0.37, Math.cos(a) * 2.1);
      b.rotation.y = a + Math.PI / 2;
    }
    mesh(box(0.6, 0.5, 0.6), mat(COL.olive, { map: propTexture('crate') }), this.root, 0.6, 0.25, -0.5);
    this.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    this.syncRoot();
  }
  update(dt: number): void {
    if (this.alive) this.tickStatus(dt);
  }
  protected override modifyDamage(info: DamageInfo): number {
    return info.type === 'bullet' ? 0 : info.amount;
  }
  protected override onDeath(): void {
    const w = this.world;
    w.explode(this.x, this.z, 3, 60, 'explosive', this, { faction: 'neutral', shake: 0.4 });
    w.particles.emit({ x: this.x, y: 0.6, z: this.z, count: 40, color: [0xc6ae80, 0xa8936a], speed: [2, 6], life: [0.4, 0.9], size: [0.2, 0.35], gravity: 12, additive: false, jitter: 1.5 });
    this.root.scale.y = 0.25;
    w.banner('EMPLACEMENT DESTROYED', 'info');
  }
}

// ------------------------------------------------------------------ homing AA missiles

interface Missile {
  x: number;
  z: number;
  y: number;
  vx: number;
  vz: number;
  life: number;
  mesh: THREE.Mesh;
  alive: boolean;
}

let missileGeo: THREE.BufferGeometry | null = null;

function launchMissile(w: World, x: number, z: number, src: Actor): void {
  const seg = segments.find((s) => s.world === w);
  if (!seg) return;
  if (!missileGeo) missileGeo = new THREE.ConeGeometry(0.18, 0.9, 6).rotateX(Math.PI / 2);
  const m = new THREE.Mesh(missileGeo, mat(0xd8d8d0, { emissive: 0x552200, ei: 1 }));
  w.scene.add(m);
  seg.missiles.push({ x, z, y: 3, vx: 0, vz: 0, life: 6.5, mesh: m, alive: true });
  w.audio.play('aaLaunch', { x, z });
  w.particles.smoke(x, 3.2, z, 6, 0x9a9590, 0.9);
  void src;
}

// ------------------------------------------------------------------ shrine & mount points

class GolemShrine implements Interactable {
  kind = 'golemShrine';
  range = 3.4;
  tag: string | null = null;
  done = false;
  icon: MapIcon = 'objective';
  root = new THREE.Group();
  seg: GolemSegment;
  constructor(seg: GolemSegment, public x: number, public z: number) {
    this.seg = seg;
    const w = seg.world;
    const stone = mat(COL.stone, { map: propTexture('brick') });
    mesh(cyl(3.2, 3.5, 0.35, 10), stone, this.root, 0, 0.17, 0).receiveShadow = true;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      mesh(cyl(0.22, 0.3, 2.4, 6), stone, this.root, Math.cos(a) * 3, 1.2, Math.sin(a) * 3);
      mesh(octa(0.25), mat(0x7fd8ff, { emissive: 0x4fc8ff, ei: 1.2 }), this.root, Math.cos(a) * 3, 2.6, Math.sin(a) * 3, false);
    }
    const rune = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ map: runeTexture(0), color: 0x7fd8ff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    rune.rotation.x = -Math.PI / 2;
    rune.position.y = 0.37;
    this.root.add(rune);
    this.root.position.set(x, 0, z);
    w.scene.add(this.root);
  }
  prompt(): string | null {
    const g = this.seg.golem;
    return g && g.alive && g.parked && dist(g.x, g.z, this.x, this.z) < 2 ? 'Awaken the Arcane Golem' : null;
  }
  holdTime(): number {
    return 1.5;
  }
  interact(_w: World, p: PlayerMage): void {
    if (this.seg.golem) this.seg.golem.mount(p);
  }
  update(): void {
    const g = this.seg.golem;
    this.icon = g && g.parked && !this.seg.aaDone() && dist(g.x, g.z, this.x, this.z) < 2 ? 'objective' : null;
  }
  isObjective(): boolean {
    return this.icon === 'objective';
  }
  dispose(): void {
    this.root.removeFromParent();
  }
}

/** Lets the mage re-mount a golem parked away from its shrine. */
class ParkedGolemMount implements Interactable {
  kind = 'golemMount';
  range = 3.2;
  tag: string | null = null;
  done = false;
  icon: MapIcon = null;
  constructor(public seg: GolemSegment) {}
  get x(): number { return this.seg.golem ? this.seg.golem.x : -999; }
  get z(): number { return this.seg.golem ? this.seg.golem.z : -999; }
  prompt(): string | null {
    const g = this.seg.golem;
    return g && g.alive && g.parked && dist(g.x, g.z, this.seg.shrine.x, this.seg.shrine.z) >= 2 ? 'Mount the Arcane Golem' : null;
  }
  holdTime(): number { return 0.6; }
  interact(_w: World, p: PlayerMage): void {
    if (this.seg.golem) this.seg.golem.mount(p);
  }
  update(): void {}
  isObjective(): boolean { return false; }
  dispose(): void {}
}

/** HUD prompt shown while mounted (the golem itself reads the key). */
class DismountPrompt implements Interactable {
  kind = 'golemDismount';
  range = 0;
  tag: string | null = null;
  done = false;
  icon: MapIcon = null;
  constructor(public seg: GolemSegment) {}
  get x(): number { return this.seg.golem ? this.seg.golem.x : 0; }
  get z(): number { return this.seg.golem ? this.seg.golem.z : 0; }
  prompt(): string | null {
    const g = this.seg.golem;
    return g && g.mounted && g.canDismount() ? 'Dismount' : null;
  }
  holdTime(): number { return 0; }
  interact(): void {}
  update(): void {}
  isObjective(): boolean { return false; }
  dispose(): void {}
}

// ------------------------------------------------------------------ segment controller

const segments: GolemSegment[] = [];

/** Layout of the flooded-trench course (Sector 2, strip z 63–80). */
const COURSE = {
  shrine: [80.5, 57.5] as [number, number],
  towers: [[68, 74], [50, 67], [31, 75], [13, 69]] as [number, number][],
  mines: [[74, 66], [61, 77], [44, 72], [38, 65], [24, 71], [8, 76]] as [number, number][],
  fences: [[[57, 63.5], [57, 79.5]], [[21, 63.5], [21, 79.5]]] as [[number, number], [number, number]][],
  emplacements: [[62, 71], [36, 68.5], [17, 76.5]] as [number, number][],
};

export class GolemSegment {
  world: World;
  golem: ArcaneGolem | null = null;
  shrine: GolemShrine;
  missiles: Missile[] = [];
  towers: AATower[] = [];
  fences: { a: BarrierPylon; b: BarrierPylon; cool: number }[] = [];
  private spawned = false;
  private heliSpawned = false;
  private respawnT = 0;
  private dismountUi: DismountPrompt;
  private hinted = false;
  private disposed = false;
  // v1.3 playtest metrics (recorded on dispose when the player opted in)
  private metrics = { mounted: 0, armourLost: 0, impacts: 0, overheats: 0, missilesDown: 0, crashes: 0 };
  private lastHp = GOLEM.hp;

  constructor(world: World) {
    this.world = world;
    registerSounds(world);
    segments.push(this);
    this.shrine = new GolemShrine(this, COURSE.shrine[0], COURSE.shrine[1]);
    world.interactables.push(this.shrine, new ParkedGolemMount(this));
    this.dismountUi = new DismountPrompt(this);
    this.spawnGolem();
    for (const [x, z] of COURSE.towers) {
      const t = new AATower(world, x, z);
      world.addActor(t);
      this.towers.push(t);
    }
    // the AA objective joins zone B's objectives (required)
    const zb = world.objectives.zones[1];
    if (zb && !zb.objs.some((o) => o.data.id === 'aa')) {
      zb.objs.push({ data: { id: 'aa', type: 'destroy', tag: 'aa', text: 'Arcane Golem: destroy the AA battery' }, done: false, failed: false, progress: 0, total: COURSE.towers.length, label: 'Arcane Golem: destroy the AA battery' });
      world.objectives.dirty = true;
    }
    // checkpoint restarts beyond zone B: the battery was already destroyed
    if (world.activeZone > 1) {
      for (const t of this.towers) world.forceDestroyed(t);
      if (zb) for (const o of zb.objs) if (o.data.id === 'aa') o.done = true;
    }
    world.updaters.push((dt) => this.update(dt));
  }

  aaDone(): boolean {
    return this.towers.every((t) => !t.alive);
  }

  private spawnGolem(drop = false): void {
    const g = new ArcaneGolem(this.world, this.shrine.x, this.shrine.z);
    if (drop) {
      // re-forms in the air above the shrine and stomps down onto it
      g.y = 4.5;
      g.landing = true;
    }
    this.world.addActor(g);
    this.world.allies.push(g);
    this.golem = g;
  }

  /** Spawned when the golem first takes off: the battery's guards, mines and barrier fences. */
  private spawnCourse(): void {
    const w = this.world;
    this.spawned = true;
    for (const [x, z] of COURSE.mines) w.addActor(new RadarMine(w, x, z));
    for (const [[ax, az], [bx, bz]] of COURSE.fences) {
      const a = new BarrierPylon(w, ax, az);
      const b = new BarrierPylon(w, bx, bz);
      w.addActor(a);
      w.addActor(b);
      this.fences.push({ a, b, cool: 0 });
    }
    for (const [x, z] of COURSE.emplacements) {
      w.addActor(new Emplacement(w, x, z));
      for (let i = 0; i < 2; i++) {
        const e = w.spawnEnemy('trooper', x + (i ? 0.8 : -0.8), z + 0.3, 1, null) as VanguardEnemy | null;
        if (e) { e.alerted = true; e.perch = true; }
      }
    }
    w.banner('VANGUARD AA BATTERY ALERTED', 'warn');
  }

  update(dt: number): void {
    if (this.disposed) return;
    const w = this.world;
    const g = this.golem;
    const p = w.player;
    if (!this.hinted && w.activeZone === 1) {
      this.hinted = true;
      setTimeout(() => {
        if (!w.disposed) w.subtitle('High Priestess Lyra', 'A stone guardian sleeps at the shrine by the flooded trenches. Awaken it — their anti-air battery must fall.', 5);
      }, 9000);
    }
    if (g && g.mounted) {
      this.metrics.mounted += dt;
      if (g.hp < this.lastHp) this.metrics.armourLost += this.lastHp - g.hp;
      if (!this.spawned) this.spawnCourse();
      p.focus = this.dismountUi;
      if (w.input.pressed('interact') && g.canDismount()) g.dismount();
      if (!this.heliSpawned && g.x < 45 && g.z > 62) {
        this.heliSpawned = true;
        const h = w.spawnEnemy('helicopter', 4, 70, 1, null);
        if (h) { h.alerted = true; h.entering = 2.5; h.destX = g.x - 8; h.destZ = 70; w.banner('ATTACK HELICOPTER INBOUND', 'warn'); }
      }
      if (this.aaDone() && !this.doneMsg) {
        this.doneMsg = true;
        w.subtitle('High Priestess Lyra', 'The battery is silent! Bring the golem back over solid ground and dismount.', 4);
      }
    }
    if (g) this.lastHp = g.hp;
    // golem destroyed → crash, rider thrown clear, golem re-forms at the shrine
    if (g && !g.alive) {
      if (g.rider) {
        this.metrics.crashes++;
        const r = g.rider;
        g.rider = null;
        r.mounted = false;
        r.targetable = true;
        r.root.visible = true;
        const out = { x: 0, z: 0 };
        const tx = clamp(g.x, 46, 86), tz = Math.min(60, g.z);
        w.phys.resolveCircle(tx, tz, r.radius, CF.MOVE, out);
        r.x = out.x; r.z = out.z;
        r.invuln = 0;
        w.dealDamage(r, { amount: 15, type: 'explosive', source: null });
        r.invuln = 1.5;
        w.mountTarget = null;
        w.cameraFocus = null;
        w.audio.loopVolume('golemHum', 0, humLoop);
        w.audio.loopVolume('golemBeam', 0, beamLoop);
        this.respawnT = GOLEM.respawn;
      }
      this.respawnT -= dt;
      if (this.respawnT <= 0) {
        this.metrics.impacts += g.impacts;
        this.metrics.overheats += g.overheats;
        g.removed = true;
        this.spawnGolem(true);
        w.banner('THE GOLEM RE-FORMS AT ITS SHRINE', 'info');
      }
    }
    this.updateMissiles(dt);
    this.updateFences(dt);
  }
  private doneMsg = false;

  private updateMissiles(dt: number): void {
    const w = this.world;
    const g = w.mountTarget;
    for (const m of this.missiles) {
      if (!m.alive) continue;
      m.life -= dt;
      if (g && g.alive) {
        const want = heading(g.x - m.x, g.z - m.z);
        const cur = Math.hypot(m.vx, m.vz) > 0.1 ? heading(m.vx, m.vz) : want;
        const h = turnToward(cur, want, dt * 1.9);
        const sp = Math.min(11, Math.hypot(m.vx, m.vz) + dt * 14);
        m.vx = Math.sin(h) * sp;
        m.vz = Math.cos(h) * sp;
        m.y = damp(m.y, g.y + 1, 2, dt);
      }
      m.x += m.vx * dt;
      m.z += m.vz * dt;
      m.mesh.position.set(m.x, m.y, m.z);
      m.mesh.lookAt(m.x + m.vx, m.y, m.z + m.vz);
      if (Math.random() < dt * 30) w.particles.smoke(m.x, m.y, m.z, 1, 0xb0aaa0, 0.45);
      w.lights.request(m.x, m.y, m.z, 0xff8a2a, 3, 4);
      if ((g && g.alive && dist(m.x, m.z, g.x, g.z) < g.radius + 0.4) || m.life <= 0) {
        this.detonate(m);
      }
    }
    this.missiles = this.missiles.filter((m) => m.alive);
  }

  private detonate(m: Missile): void {
    m.alive = false;
    m.mesh.removeFromParent();
    this.world.explode(m.x, m.z, 2.4, 42, 'explosive', null, { faction: 'army', shake: 0.35, heavy: true });
  }

  /** Called by the golem beam each frame it fires: missiles on the beam are shot down. */
  beamHit(ox: number, oz: number, ex: number, ez: number, _dt: number): void {
    for (const m of this.missiles) {
      if (!m.alive) continue;
      if (pointSegDist(m.x, m.z, ox, oz, ex, ez) < 0.9) {
        m.alive = false;
        m.mesh.removeFromParent();
        this.metrics.missilesDown++;
        this.world.explode(m.x, m.z, 1.6, 0, 'explosive', null, { faction: 'neutral', shake: 0.1, small: true });
        this.world.floatText(m.x, m.y + 0.5, m.z, 'MISSILE DOWN', '#9cf6ff');
      }
    }
  }

  private updateFences(dt: number): void {
    const w = this.world;
    const g = w.mountTarget;
    for (const f of this.fences) {
      if (!f.a.alive || !f.b.alive) continue;
      const flick = 0.6 + Math.random() * 0.4;
      for (const h of [1.2, 2.6, 4.0]) w.fx.beam(`${f.a.id}-${h}`, f.a.x, h, f.a.z, f.b.x, h, f.b.z, 0xffb030, flick);
      if (f.cool > 0) { f.cool -= dt; continue; }
      if (g && g.alive && pointSegDist(g.x, g.z, f.a.x, f.a.z, f.b.x, f.b.z) < g.radius) {
        f.cool = 0.6;
        const nx = g.x - f.a.x;
        w.dealDamage(g, { amount: 32, type: 'laser', source: f.a, dirX: nx >= 0 ? 1 : -1, dirZ: 0, knockback: 4, x: g.x, z: g.z });
        g.vx = (nx >= 0 ? 1 : -1) * 8;
        w.floatText(g.x, g.y + 3, g.z, 'BARRIER — DESTROY A PYLON', '#ffb030');
        w.audio.play('wardBreak', { x: g.x, z: g.z, vol: 0.5 });
      }
    }
  }

  /** v1.3: opt-in local playtest record of this golem segment (only if the golem was flown). */
  recordRun(): void {
    const m = this.metrics;
    if (m.mounted < 1) return;
    const g = this.golem;
    const save = this.world.services.save;
    const ok = recordPlaytest(save, {
      kind: 'golem', id: 'sector2-golem', at: Date.now(), version: VERSION,
      outcome: this.aaDone() ? 'aa-destroyed' : 'incomplete',
      time: Math.round(m.mounted * 10) / 10, damage: Math.round(m.armourLost),
      impacts: m.impacts + (g ? g.impacts : 0), overheats: m.overheats + (g ? g.overheats : 0),
      missilesDown: m.missilesDown, crashes: m.crashes, towersLeft: this.towers.filter((t) => t.alive).length,
    });
    if (ok) this.world.services.persist();
  }

  dispose(): void {
    if (!this.disposed) this.recordRun();
    this.disposed = true;
    for (const m of this.missiles) m.mesh.removeFromParent();
    this.missiles = [];
    const i = segments.indexOf(this);
    if (i >= 0) segments.splice(i, 1);
  }
}

/** Installs the golem flight segment into a Sector 2 world. Returns null for other levels. */
export function installGolemSegment(world: World): GolemSegment | null {
  if (world.level.id !== 'sector2' || world.mode !== 'campaign') return null;
  // lift decorative floating islands above the flight course so they never block the zoomed-out view
  for (const isl of world.islands) {
    if (isl.obj.position.z > 58) isl.baseY = Math.max(isl.baseY, 30);
  }
  return new GolemSegment(world);
}
