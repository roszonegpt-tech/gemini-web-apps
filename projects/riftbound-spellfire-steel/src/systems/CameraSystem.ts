// Pseudo-isometric camera rig: ~55° pitched perspective camera that smoothly follows
// the player with aim look-ahead, zooms out during big skirmishes, clamps to level
// bounds, shakes (unless reduced motion) and supports cinematic, free (F8) and orbit (F7) modes.
import * as THREE from 'three';
import { clamp, damp } from '../utils/math';

export type CamMode = 'follow' | 'cinematic' | 'free' | 'orbit';

export interface CamKey {
  x: number;
  z: number;
  dist: number;
  pitch?: number;
  yaw?: number;
  t: number; // seconds to reach this key from the previous one
}

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  mode: CamMode = 'follow';
  tx = 0;
  tz = 0;
  ty = 0.8;
  dist = 25;
  baseDist = 25;
  zoomOut = 0;
  pitch = 0.95; // radians from horizontal
  yaw = 0;
  trauma = 0;
  reducedMotion = false;
  tilt = 0;
  minX = -1e9;
  minZ = -1e9;
  maxX = 1e9;
  maxZ = 1e9;
  private keys: CamKey[] = [];
  private keyT = 0;
  private from = { x: 0, z: 0, dist: 30, pitch: 0.95, yaw: 0 };
  private orbitA = 0;
  orbitDist = 16;
  orbitPitch = 0.6;
  orbitSpeed = 0.35;
  private raycaster = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private v2 = new THREE.Vector2();
  private v3 = new THREE.Vector3();
  onCinematicDone: (() => void) | null = null;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(32, 16 / 9, 1, 400);
  }

  setBounds(minX: number, minZ: number, maxX: number, maxZ: number): void {
    this.minX = minX; this.minZ = minZ; this.maxX = maxX; this.maxZ = maxZ;
  }

  snapTo(x: number, z: number): void {
    this.tx = x;
    this.tz = z;
    this.apply(0);
  }

  addTrauma(t: number): void {
    this.trauma = Math.min(1, this.trauma + t);
  }

  playCinematic(keys: CamKey[]): void {
    this.mode = 'cinematic';
    this.keys = keys.slice();
    this.keyT = 0;
    this.from = { x: this.tx, z: this.tz, dist: this.dist, pitch: this.pitch, yaw: this.yaw };
  }

  endCinematic(): void {
    if (this.mode !== 'cinematic') return;
    this.mode = 'follow';
    this.keys = [];
    this.yaw = 0;
    this.pitch = 0.95;
    const cb = this.onCinematicDone;
    this.onCinematicDone = null;
    if (cb) cb();
  }

  update(dt: number, fx: number, fz: number, lookX: number, lookZ: number, freeMoveX = 0, freeMoveZ = 0): void {
    if (this.mode === 'cinematic') {
      const k = this.keys[0];
      if (!k) {
        this.endCinematic();
      } else {
        this.keyT += dt;
        const t = clamp(this.keyT / Math.max(0.01, k.t), 0, 1);
        const e = t * t * (3 - 2 * t);
        this.tx = this.from.x + (k.x - this.from.x) * e;
        this.tz = this.from.z + (k.z - this.from.z) * e;
        this.dist = this.from.dist + (k.dist - this.from.dist) * e;
        const kp = k.pitch !== undefined ? k.pitch : 0.95;
        const ky = k.yaw !== undefined ? k.yaw : 0;
        this.pitch = this.from.pitch + (kp - this.from.pitch) * e;
        this.yaw = this.from.yaw + (ky - this.from.yaw) * e;
        if (t >= 1) {
          this.keys.shift();
          this.keyT = 0;
          this.from = { x: k.x, z: k.z, dist: k.dist, pitch: kp, yaw: ky };
          if (!this.keys.length) this.endCinematic();
        }
      }
    } else if (this.mode === 'free') {
      this.tx += freeMoveX * dt * 22;
      this.tz += freeMoveZ * dt * 22;
    } else if (this.mode === 'orbit') {
      this.orbitA += dt * this.orbitSpeed;
      this.yaw = this.orbitA;
      this.tx = damp(this.tx, fx, 6, dt);
      this.tz = damp(this.tz, fz, 6, dt);
      this.dist = damp(this.dist, this.orbitDist, 2, dt);
      this.pitch = damp(this.pitch, this.orbitPitch, 2, dt);
    } else {
      // follow with look-ahead toward the aim point
      let lx = (lookX - fx) * 0.22, lz = (lookZ - fz) * 0.22;
      const ll = Math.hypot(lx, lz);
      if (ll > 4) { lx = (lx / ll) * 4; lz = (lz / ll) * 4; }
      const gx = fx + lx, gz = fz + lz;
      this.tx = damp(this.tx, gx, 5, dt);
      this.tz = damp(this.tz, gz, 5, dt);
      this.dist = damp(this.dist, this.baseDist + this.zoomOut, 1.6, dt);
      this.yaw = damp(this.yaw, 0, 3, dt);
      this.pitch = damp(this.pitch, 0.95, 3, dt);
      // clamp so the view stays mostly over the playfield
      const halfW = this.dist * 0.5, halfH = this.dist * 0.3;
      this.tx = clamp(this.tx, this.minX + halfW * 0.8, Math.max(this.minX + halfW * 0.8, this.maxX - halfW * 0.8));
      this.tz = clamp(this.tz, this.minZ + halfH * 0.55, Math.max(this.minZ + halfH * 0.55, this.maxZ - halfH * 0.45));
    }
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    this.tilt = damp(this.tilt, 0, 4, dt);
    this.apply(dt);
  }

  private apply(_dt: number): void {
    const cam = this.camera;
    const d = this.dist;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const ox = Math.sin(this.yaw) * cp * d, oz = Math.cos(this.yaw) * cp * d, oy = sp * d;
    let sx = 0, sy = 0;
    if (!this.reducedMotion && this.trauma > 0) {
      const s = this.trauma * this.trauma;
      const t = performance.now() / 1000;
      sx = Math.sin(t * 47.3) * s * 0.7;
      sy = Math.cos(t * 39.1) * s * 0.7;
    }
    cam.position.set(this.tx + ox + sx, this.ty + oy + sy, this.tz + oz);
    cam.lookAt(this.tx + sx * 0.5, this.ty, this.tz);
    if (!this.reducedMotion && this.tilt) cam.rotateZ(this.tilt);
    cam.updateMatrixWorld();
  }

  /** Converts a stage pixel position to a world point on the horizontal plane y=h. */
  screenToWorld(px: number, py: number, w: number, h: number, planeY: number, out: THREE.Vector3): THREE.Vector3 | null {
    this.v2.set((px / w) * 2 - 1, -(py / h) * 2 + 1);
    this.raycaster.setFromCamera(this.v2, this.camera);
    this.plane.constant = -planeY;
    return this.raycaster.ray.intersectPlane(this.plane, out);
  }

  /** Projects a world point to stage pixels; returns false when behind the camera. */
  worldToScreen(x: number, y: number, z: number, w: number, h: number, out: { x: number; y: number }): boolean {
    this.v3.set(x, y, z).project(this.camera);
    out.x = (this.v3.x * 0.5 + 0.5) * w;
    out.y = (-this.v3.y * 0.5 + 0.5) * h;
    return this.v3.z < 1;
  }
}
