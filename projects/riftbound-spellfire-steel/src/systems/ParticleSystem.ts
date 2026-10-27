// GPU point-sprite particles with CPU simulation. Two pools: additive (magic, sparks,
// fire) and alpha-blended (smoke, debris, dust). Square points rendered at low res give
// chunky pixel particles. Particle budget scales with the quality level.
import * as THREE from 'three';

export interface EmitOpts {
  x: number;
  y: number;
  z: number;
  count: number;
  color: number | number[];
  speed: number | [number, number];
  life: [number, number];
  size: [number, number];
  /** Direction bias (unit-ish vector); spread 0 = exact, 1 = full sphere. */
  dir?: [number, number, number];
  spread?: number;
  gravity?: number;
  drag?: number;
  additive?: boolean;
  /** Size multiplier at end of life. */
  grow?: number;
  /** Random position jitter radius. */
  jitter?: number;
  alpha?: number;
}

const VERT = `
attribute float psize;
attribute float palpha;
attribute vec3 pcolor;
uniform float uScale;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = pcolor;
  vAlpha = palpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = max(1.0, psize * uScale / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = `
varying vec3 vColor;
varying float vAlpha;
void main() {
  if (vAlpha < 0.01) discard;
  gl_FragColor = vec4(vColor, vAlpha);
}`;

class Pool {
  max: number;
  count = 0;
  pos: Float32Array;
  col: Float32Array;
  size: Float32Array;
  alpha: Float32Array;
  vel: Float32Array;
  life: Float32Array;
  maxLife: Float32Array;
  s0: Float32Array;
  s1: Float32Array;
  a0: Float32Array;
  grav: Float32Array;
  drag: Float32Array;
  geo: THREE.BufferGeometry;
  points: THREE.Points;
  material: THREE.ShaderMaterial;

  constructor(max: number, additive: boolean, scene: THREE.Scene) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.a0 = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('psize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('palpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 300 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 20 : 10;
    scene.add(this.points);
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, s0: number, s1: number, r: number, g: number, b: number, a: number, grav: number, drag: number): void {
    if (this.count >= this.max) return;
    const i = this.count++;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.col[i3] = r; this.col[i3 + 1] = g; this.col[i3 + 2] = b;
    this.life[i] = life; this.maxLife[i] = life;
    this.s0[i] = s0; this.s1[i] = s1; this.size[i] = s0;
    this.a0[i] = a; this.alpha[i] = a;
    this.grav[i] = grav; this.drag[i] = drag;
  }

  private copy(from: number, to: number): void {
    const f3 = from * 3, t3 = to * 3;
    for (let k = 0; k < 3; k++) {
      this.pos[t3 + k] = this.pos[f3 + k];
      this.vel[t3 + k] = this.vel[f3 + k];
      this.col[t3 + k] = this.col[f3 + k];
    }
    this.life[to] = this.life[from]; this.maxLife[to] = this.maxLife[from];
    this.s0[to] = this.s0[from]; this.s1[to] = this.s1[from]; this.size[to] = this.size[from];
    this.a0[to] = this.a0[from]; this.alpha[to] = this.alpha[from];
    this.grav[to] = this.grav[from]; this.drag[to] = this.drag[from];
  }

  update(dt: number): void {
    let i = 0;
    while (i < this.count) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.count--;
        if (i !== this.count) this.copy(this.count, i);
        continue;
      }
      const i3 = i * 3;
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i3] *= d; this.vel[i3 + 1] = this.vel[i3 + 1] * d - this.grav[i] * dt; this.vel[i3 + 2] *= d;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.pos[i3 + 1] < 0.02 && this.grav[i] > 0) {
        this.pos[i3 + 1] = 0.02;
        this.vel[i3 + 1] *= -0.3;
        this.vel[i3] *= 0.6; this.vel[i3 + 2] *= 0.6;
      }
      const t = 1 - this.life[i] / this.maxLife[i];
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      this.alpha[i] = this.a0[i] * (t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3);
      i++;
    }
    this.geo.setDrawRange(0, this.count);
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.pcolor as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.psize as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.palpha as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.geo.dispose();
    this.material.dispose();
    this.points.removeFromParent();
  }
}

const tmpColor = new THREE.Color();

export class ParticleSystem {
  private add: Pool;
  private norm: Pool;
  /** 0..1 emission multiplier set from quality level. */
  density = 1;

  constructor(scene: THREE.Scene, max = 3000) {
    this.add = new Pool(max, true, scene);
    this.norm = new Pool(Math.floor(max * 0.6), false, scene);
  }

  setScale(bufferHeight: number, fovDeg: number): void {
    const s = bufferHeight / (2 * Math.tan((fovDeg * Math.PI) / 360));
    this.add.material.uniforms.uScale.value = s;
    this.norm.material.uniforms.uScale.value = s;
  }

  emit(o: EmitOpts): void {
    const pool = o.additive === false ? this.norm : this.add;
    const n = Math.max(1, Math.round(o.count * this.density));
    const colors = Array.isArray(o.color) ? o.color : [o.color];
    const spread = o.spread !== undefined ? o.spread : 1;
    const dir = o.dir || [0, 1, 0];
    const jitter = o.jitter || 0;
    for (let k = 0; k < n; k++) {
      const sp = Array.isArray(o.speed) ? o.speed[0] + Math.random() * (o.speed[1] - o.speed[0]) : o.speed * (0.5 + Math.random() * 0.5);
      // random direction blended with bias
      let rx = Math.random() * 2 - 1, ry = Math.random() * 2 - 1, rz = Math.random() * 2 - 1;
      const rl = Math.hypot(rx, ry, rz) || 1;
      rx = (rx / rl) * spread + dir[0] * (1 - spread);
      ry = (ry / rl) * spread + dir[1] * (1 - spread);
      rz = (rz / rl) * spread + dir[2] * (1 - spread);
      const dl = Math.hypot(rx, ry, rz) || 1;
      tmpColor.setHex(colors[Math.floor(Math.random() * colors.length)]);
      const life = o.life[0] + Math.random() * (o.life[1] - o.life[0]);
      const s0 = o.size[0] + Math.random() * (o.size[1] - o.size[0]);
      pool.spawn(
        o.x + (Math.random() * 2 - 1) * jitter, o.y + (Math.random() * 2 - 1) * jitter * 0.5, o.z + (Math.random() * 2 - 1) * jitter,
        (rx / dl) * sp, (ry / dl) * sp, (rz / dl) * sp,
        life, s0, s0 * (o.grow !== undefined ? o.grow : 0.3),
        tmpColor.r, tmpColor.g, tmpColor.b, o.alpha !== undefined ? o.alpha : 1,
        o.gravity || 0, o.drag !== undefined ? o.drag : 1.5,
      );
    }
  }

  /** Common one-liners. */
  burst(x: number, y: number, z: number, color: number | number[], count: number, speed = 4, size = 0.25, life = 0.5): void {
    this.emit({ x, y, z, count, color, speed: [speed * 0.3, speed], life: [life * 0.5, life], size: [size * 0.6, size], gravity: 4, drag: 2 });
  }

  smoke(x: number, y: number, z: number, count: number, color = 0x8a8580, size = 0.9): void {
    this.emit({ x, y, z, count, color, speed: [0.3, 1.4], life: [0.7, 1.5], size: [size * 0.5, size * 0.8], dir: [0, 1, 0], spread: 0.6, gravity: -0.8, drag: 1.2, additive: false, grow: 1.8, jitter: 0.4, alpha: 0.42 });
  }

  update(dt: number): void {
    this.add.update(dt);
    this.norm.update(dt);
  }

  get count(): number {
    return this.add.count + this.norm.count;
  }

  dispose(): void {
    this.add.dispose();
    this.norm.dispose();
  }
}
