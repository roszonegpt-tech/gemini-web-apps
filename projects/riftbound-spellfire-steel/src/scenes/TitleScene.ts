// Title screen backdrop: a small 3D diorama of a purple cosmic rift tearing through a
// military bunker — sandbags and searchlights on one side, rune stones and a wizard on
// the other — with a slowly orbiting camera behind the menu.
import * as THREE from 'three';
import type { LevelData } from '../config/types';
import type { GameState } from '../core/StateManager';
import type { Services } from '../core/Services';
import { buildMage, buildSoldier, glowMat } from '../utils/models';
import { World } from './World';

const TITLE_LEVEL: LevelData = {
  id: 'title', index: -1, name: 'Rift Breach', subtitle: '', size: [44, 44], player: [22, 30], parTime: 0, briefing: [],
  theme: { sky: '#2a1250', fog: '#1c0d34', fogNear: 40, fogFar: 95, hemiSky: '#b9a6ff', hemiGround: '#3a2a3a', hemiIntensity: 1.25, sun: '#ffe2c8', sunIntensity: 1.5, rain: 0.6, ground: 'grass', cliff: '#4a3446', riftColor: '#c04cff' },
  ground: [
    { m: 'asphalt', shape: 'rect', x: 4, z: 6, w: 18, d: 16, edge: 0.8 },
    { m: 'paintY', shape: 'rect', x: 6, z: 13.6, w: 14, d: 0.4 },
    { m: 'dirt', shape: 'path', pts: [[22, 44], [22, 30], [26, 22], [34, 14]], width: 3.2 },
    { m: 'stone', shape: 'circle', x: 28, z: 18, r: 6 },
    { m: 'rift', shape: 'path', pts: [[14, 26], [19, 21], [22, 19], [27, 17]], width: 1.6, edge: 0.4 },
    { m: 'mud', shape: 'circle', x: 12, z: 26, r: 3 },
  ],
  zones: [{ id: 't', name: 'Title', rect: [0, 0, 44, 44], checkpoint: [22, 30], objectives: [], enemies: [] }],
  props: [
    { t: 'bunker', x: 11, z: 11, w: 9, d: 7, door: 'e' },
    { t: 'sandbags', a: [5, 19], b: [13, 19] },
    { t: 'sandbagRing', x: 17, z: 23, r: 2.2, gap: 30 },
    { t: 'barrels', x: 4.5, z: 15, n: 3 },
    { t: 'crates', x: 16, z: 6, n: 4 },
    { t: 'searchlight', x: 6, z: 22, rot: 135 },
    { t: 'tower', x: 4, z: 4 },
    { t: 'portal', x: 28, z: 17 },
    { t: 'glyph', x: 28, z: 19, r: 4 },
    { t: 'pyramids', a: [20, 40], b: [20, 31] },
    { t: 'pyramids', a: [25, 40], b: [26, 29] },
    { t: 'pylon', x: 33, z: 22 },
    { t: 'pylon', x: 23, z: 24 },
    { t: 'crystal', x: 35, z: 18 },
    { t: 'crystal', x: 31, z: 25 },
    { t: 'spire', x: 37, z: 12 },
    { t: 'trees', x: 30, z: 26, w: 12, d: 14, n: 9, mat: 'round' },
    { t: 'trees', x: 1, z: 28, w: 14, d: 14, n: 8 },
    { t: 'grass', x: 18, z: 22, w: 26, d: 22, n: 220 },
    { t: 'flowers', x: 22, z: 24, w: 20, d: 18, n: 40 },
    { t: 'pool', x: 36, z: 34, r: 4.5 },
    { t: 'island', x: 8, z: -2, h: 11, r: 4 },
    { t: 'island', x: 40, z: 4, h: 14, r: 3 },
    { t: 'wire', a: [5, 25], b: [12, 30] },
  ],
};

export class TitleScene implements GameState {
  readonly name = 'title';
  world: World | null = null;
  private svc: Services;
  private portalFx: THREE.Group | null = null;
  private t = 0;
  onEnter: (() => void) | null = null;

  constructor(svc: Services) {
    this.svc = svc;
  }

  enter(): void {
    const w = new World(this.svc, TITLE_LEVEL, { mode: 'challenge' });
    this.world = w;
    w.cinematicLock = true;
    w.player.root.visible = false;
    w.player.targetable = false;
    if (w.exitPortal) w.exitPortal.activate(w);
    w.camRig.mode = 'orbit';
    w.camRig.orbitDist = 26;
    w.camRig.orbitPitch = 0.7;
    w.camRig.orbitSpeed = 0.07;
    w.cameraFocus = { x: 22, z: 19 };
    w.camRig.snapTo(22, 19);
    // posed figures
    const mage = buildMage(0xb36bff);
    mage.root.position.set(25.5, 0, 21);
    mage.root.rotation.y = -2.3;
    mage.armR.rotation.x = -1.6;
    w.scene.add(mage.root);
    const poses: [number, number, number, 'trooper' | 'heavy' | 'sniper'][] = [[14, 20.2, 0.8, 'trooper'], [10, 20.2, 0.6, 'trooper'], [17.5, 21.6, 1.0, 'heavy'], [4, 4, 0.9, 'sniper']];
    for (const [x, z, r, look] of poses) {
      const s = buildSoldier(look);
      s.root.position.set(x, look === 'sniper' ? 3.35 : 0, z);
      s.root.rotation.y = r;
      w.scene.add(s.root);
    }
    // swirling rift tearing through the bunker
    const g = new THREE.Group();
    g.position.set(16, 3.2, 14);
    for (let i = 0; i < 5; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2 + i * 0.6, 0.08 + i * 0.02, 4, 28), glowMat(i % 2 ? 0xff7bf2 : 0xb36bff, 0.6 - i * 0.08));
      ring.rotation.x = Math.PI / 2 - 0.6;
      g.add(ring);
    }
    const core = new THREE.Mesh(new THREE.CircleGeometry(1.4, 24), new THREE.MeshBasicMaterial({ color: 0x14002a, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
    core.rotation.x = Math.PI / 2 - 0.6;
    g.add(core);
    w.scene.add(g);
    this.portalFx = g;
    this.svc.music.play('title');
    if (this.onEnter) this.onEnter();
  }

  exit(): void {
    if (this.world) this.world.dispose();
    this.world = null;
    this.portalFx = null;
  }

  update(dt: number): void {
    const w = this.world;
    if (!w) return;
    this.t += dt;
    w.update(dt);
    if (this.portalFx) {
      this.portalFx.children.forEach((c, i) => { c.rotation.z += dt * (0.6 + i * 0.25) * (i % 2 ? -1 : 1); });
      const s = 1 + Math.sin(this.t * 2) * 0.05;
      this.portalFx.scale.setScalar(s);
      const p = this.portalFx.position;
      w.lights.request(p.x, p.y, p.z, 0xc04cff, 22, 14);
      if (Math.random() < dt * 40) {
        const a = Math.random() * Math.PI * 2;
        w.particles.emit({ x: p.x + Math.cos(a) * 3, y: p.y + Math.sin(a) * 2, z: p.z, count: 1, color: [0xc04cff, 0xff7bf2, 0xffffff], speed: [1, 3], life: [0.5, 1.2], size: [0.15, 0.3], dir: [-Math.cos(a), -Math.sin(a), 0], spread: 0.3 });
      }
      if (Math.random() < dt * 1.2) w.fx.lightning(p.x, p.y, p.z, p.x + (Math.random() - 0.5) * 10, 0.2, p.z + (Math.random() - 0.5) * 8, 0xd05cff, 0.15, 0.8);
      if (Math.random() < dt * 0.6) {
        // stray tracer fire across the breach
        w.fx.line(12, 1.2, 20, 26 + Math.random() * 3, 1.2, 18 + Math.random() * 4, 0xffe9a0, 0.08);
        w.audio.play('gunshot', { x: 30, z: 30, vol: 0.25 });
      }
    }
  }

  render(): void {
    if (this.world) this.world.render(this.svc.engine.renderer);
  }
}
