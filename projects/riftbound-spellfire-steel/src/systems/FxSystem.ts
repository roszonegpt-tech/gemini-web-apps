// Transient visual effects: danger telegraph circles, shockwave rings, jagged lightning,
// laser/tracer lines, scorch decals, rune glyphs on cast and floating combat text.
import * as THREE from 'three';
import { blobTexture, runeTexture } from '../utils/textures';

interface Timed {
  obj: THREE.Object3D;
  t: number;
  life: number;
  active: boolean;
}

interface TeleFx extends Timed {
  ring: THREE.Mesh;
  fill: THREE.Mesh;
  r: number;
}

interface RingFx extends Timed {
  r: number;
  mat: THREE.MeshBasicMaterial;
}

interface LineFx extends Timed {
  line: THREE.Line;
  mat: THREE.LineBasicMaterial;
  geo: THREE.BufferGeometry;
}

interface GlyphFx extends Timed {
  mat: THREE.MeshBasicMaterial;
  spin: number;
  follow: { x: number; z: number } | null;
}

export interface FloatText {
  x: number;
  y: number;
  z: number;
  text: string;
  color: string;
  t: number;
  life: number;
  big: boolean;
}

export class FxSystem {
  private scene: THREE.Scene;
  private teles: TeleFx[] = [];
  private rings: RingFx[] = [];
  private lines: LineFx[] = [];
  private glyphs: GlyphFx[] = [];
  private scorches: THREE.Mesh[] = [];
  private scorchI = 0;
  texts: FloatText[] = [];
  private persistent = new Map<unknown, LineFx>();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    const ringGeo = new THREE.RingGeometry(0.88, 1, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const discGeo = new THREE.CircleGeometry(1, 28);
    discGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 28; i++) {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.85, depthWrite: false }));
      const fill = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.25, depthWrite: false }));
      ring.renderOrder = 5; fill.renderOrder = 5;
      g.add(ring, fill);
      g.visible = false;
      scene.add(g);
      this.teles.push({ obj: g, ring, fill, t: 0, life: 1, active: false, r: 1 });
    }
    const swGeo = new THREE.RingGeometry(0.8, 1, 36);
    swGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 16; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
      const m = new THREE.Mesh(swGeo, mat);
      m.visible = false;
      m.renderOrder = 15;
      scene.add(m);
      this.rings.push({ obj: m, t: 0, life: 0.4, active: false, r: 1, mat });
    }
    for (let i = 0; i < 24; i++) this.lines.push(this.makeLine());
    const glyphGeo = new THREE.PlaneGeometry(1, 1);
    glyphGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 10; i++) {
      const mat = new THREE.MeshBasicMaterial({ map: runeTexture(i % 2), color: 0xb36bff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      const m = new THREE.Mesh(glyphGeo, mat);
      m.visible = false;
      m.renderOrder = 6;
      scene.add(m);
      this.glyphs.push({ obj: m, t: 0, life: 0.6, active: false, mat, spin: 1, follow: null });
    }
    const scorchGeo = new THREE.PlaneGeometry(1, 1);
    scorchGeo.rotateX(-Math.PI / 2);
    const scorchMat = new THREE.MeshBasicMaterial({ map: blobTexture(), color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false });
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(scorchGeo, scorchMat);
      m.visible = false;
      m.renderOrder = 2;
      scene.add(m);
      this.scorches.push(m);
    }
  }

  private makeLine(): LineFx {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(32 * 3), 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    line.visible = false;
    line.renderOrder = 25;
    this.scene.add(line);
    return { obj: line, line, mat, geo, t: 0, life: 0.1, active: false };
  }

  telegraph(x: number, z: number, r: number, dur: number, color = 0xff3030): void {
    const f = this.teles.find((t) => !t.active);
    if (!f) return;
    f.active = true;
    f.t = 0;
    f.life = dur;
    f.r = r;
    f.obj.visible = true;
    f.obj.position.set(x, 0.06, z);
    f.ring.scale.setScalar(r);
    (f.ring.material as THREE.MeshBasicMaterial).color.setHex(color);
    (f.fill.material as THREE.MeshBasicMaterial).color.setHex(color);
    f.fill.scale.setScalar(0.01);
  }

  shockwave(x: number, z: number, r: number, color: number, dur = 0.4, y = 0.15): void {
    const f = this.rings.find((t) => !t.active);
    if (!f) return;
    f.active = true;
    f.t = 0;
    f.life = dur;
    f.r = r;
    f.mat.color.setHex(color);
    f.obj.visible = true;
    f.obj.position.set(x, y, z);
    f.obj.scale.setScalar(0.1);
  }

  /** Polyline (lightning, chain arcs). pts = [x,y,z, x,y,z, …] */
  polyline(pts: number[], color: number, dur: number): void {
    const f = this.lines.find((t) => !t.active);
    if (!f) return;
    const arr = (f.geo.attributes.position as THREE.BufferAttribute).array as Float32Array;
    const n = Math.min(32, pts.length / 3);
    for (let i = 0; i < n * 3; i++) arr[i] = pts[i];
    f.geo.setDrawRange(0, n);
    (f.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    f.mat.color.setHex(color);
    f.mat.opacity = 1;
    f.active = true;
    f.t = 0;
    f.life = dur;
    f.line.visible = true;
  }

  lightning(ax: number, ay: number, az: number, bx: number, by: number, bz: number, color: number, dur = 0.16, jag = 0.5): void {
    const pts: number[] = [];
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const j = i === 0 || i === n ? 0 : jag;
      pts.push(ax + (bx - ax) * t + (Math.random() - 0.5) * j, ay + (by - ay) * t + (Math.random() - 0.5) * j, az + (bz - az) * t + (Math.random() - 0.5) * j);
    }
    this.polyline(pts, color, dur);
    const pts2: number[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const j = i === 0 || i === n ? 0 : jag * 0.6;
      pts2.push(ax + (bx - ax) * t + (Math.random() - 0.5) * j, ay + (by - ay) * t + (Math.random() - 0.5) * j, az + (bz - az) * t + (Math.random() - 0.5) * j);
    }
    this.polyline(pts2, 0xffffff, dur * 0.7);
  }

  line(ax: number, ay: number, az: number, bx: number, by: number, bz: number, color: number, dur: number): void {
    this.polyline([ax, ay, az, bx, by, bz], color, dur);
  }

  /** A persistent line keyed by its owner (sniper laser sight); call every frame while visible. */
  beam(owner: unknown, ax: number, ay: number, az: number, bx: number, by: number, bz: number, color: number, opacity = 1): void {
    let f = this.persistent.get(owner);
    if (!f) {
      f = this.makeLine();
      this.persistent.set(owner, f);
    }
    const arr = (f.geo.attributes.position as THREE.BufferAttribute).array as Float32Array;
    arr[0] = ax; arr[1] = ay; arr[2] = az; arr[3] = bx; arr[4] = by; arr[5] = bz;
    f.geo.setDrawRange(0, 2);
    (f.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    f.mat.color.setHex(color);
    f.mat.opacity = opacity;
    f.line.visible = true;
    f.t = 0;
    f.life = 0.05;
    f.active = true;
  }

  scorch(x: number, z: number, r: number): void {
    const m = this.scorches[this.scorchI];
    this.scorchI = (this.scorchI + 1) % this.scorches.length;
    m.visible = true;
    m.position.set(x, 0.03 + this.scorchI * 0.0005, z);
    m.scale.setScalar(r * 2);
    m.rotation.y = Math.random() * 6;
  }

  glyph(x: number, z: number, r: number, color: number, dur = 0.7, follow: { x: number; z: number } | null = null): void {
    const f = this.glyphs.find((t) => !t.active);
    if (!f) return;
    f.active = true;
    f.t = 0;
    f.life = dur;
    f.mat.color.setHex(color);
    f.obj.visible = true;
    f.obj.position.set(x, 0.07, z);
    f.obj.scale.setScalar(r * 2);
    f.spin = Math.random() < 0.5 ? -2 : 2;
    f.follow = follow;
  }

  text(x: number, y: number, z: number, text: string, color: string, big = false): void {
    if (this.texts.length > 60) this.texts.shift();
    this.texts.push({ x: x + (Math.random() - 0.5) * 0.5, y, z, text, color, t: 0, life: big ? 1.3 : 0.8, big });
  }

  update(dt: number): void {
    for (const f of this.teles) {
      if (!f.active) continue;
      f.t += dt;
      const p = Math.min(1, f.t / f.life);
      f.fill.scale.setScalar(Math.max(0.01, f.r * p));
      (f.ring.material as THREE.MeshBasicMaterial).opacity = 0.5 + 0.5 * Math.abs(Math.sin(f.t * 12));
      if (f.t >= f.life) { f.active = false; f.obj.visible = false; }
    }
    for (const f of this.rings) {
      if (!f.active) continue;
      f.t += dt;
      const p = Math.min(1, f.t / f.life);
      f.obj.scale.setScalar(0.1 + f.r * (1 - (1 - p) * (1 - p)));
      f.mat.opacity = 1 - p;
      if (f.t >= f.life) { f.active = false; f.obj.visible = false; }
    }
    for (const f of this.lines) {
      if (!f.active) continue;
      f.t += dt;
      f.mat.opacity = Math.max(0, 1 - f.t / f.life);
      if (f.t >= f.life) { f.active = false; f.line.visible = false; }
    }
    this.persistent.forEach((f) => {
      if (!f.active) return;
      f.t += dt;
      if (f.t > f.life) { f.active = false; f.line.visible = false; }
    });
    for (const f of this.glyphs) {
      if (!f.active) continue;
      f.t += dt;
      const p = f.t / f.life;
      f.obj.rotation.y += f.spin * dt;
      if (f.follow) f.obj.position.set(f.follow.x, 0.07, f.follow.z);
      f.mat.opacity = p < 0.2 ? p / 0.2 : 1 - (p - 0.2) / 0.8;
      if (f.t >= f.life) { f.active = false; f.obj.visible = false; }
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.t += dt;
      t.y += dt * 1.2;
      if (t.t >= t.life) this.texts.splice(i, 1);
    }
  }
}
