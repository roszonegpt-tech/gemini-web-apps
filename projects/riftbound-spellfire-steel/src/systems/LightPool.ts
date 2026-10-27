// Dynamic point-light pool. Effects (spell projectiles, muzzle flashes, explosions,
// portals) *request* lights every frame; the pool assigns its fixed set of PointLights
// to the strongest requests near the camera. A fixed light count avoids shader recompiles.
import * as THREE from 'three';

interface LightReq {
  x: number;
  y: number;
  z: number;
  color: number;
  intensity: number;
  distance: number;
  score: number;
}

export class LightPool {
  readonly lights: THREE.PointLight[] = [];
  private reqs: LightReq[] = [];
  private reqCount = 0;
  enabled = 6;

  constructor(scene: THREE.Scene, count = 6) {
    for (let i = 0; i < count; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 8, 1.4);
      l.castShadow = false;
      scene.add(l);
      this.lights.push(l);
    }
    for (let i = 0; i < 64; i++) this.reqs.push({ x: 0, y: 0, z: 0, color: 0, intensity: 0, distance: 0, score: 0 });
  }

  request(x: number, y: number, z: number, color: number, intensity: number, distance: number): void {
    if (this.reqCount >= this.reqs.length) return;
    const r = this.reqs[this.reqCount++];
    r.x = x; r.y = y; r.z = z; r.color = color; r.intensity = intensity; r.distance = distance;
  }

  flush(cx: number, cz: number): void {
    const n = this.reqCount;
    for (let i = 0; i < n; i++) {
      const r = this.reqs[i];
      const d = Math.hypot(r.x - cx, r.z - cz);
      r.score = d > 34 ? -1 : r.intensity * r.distance / (1 + d * 0.15);
    }
    const sorted = this.reqs.slice(0, n).sort((a, b) => b.score - a.score);
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i];
      const r = sorted[i];
      if (r && r.score > 0 && i < this.enabled) {
        l.position.set(r.x, r.y, r.z);
        l.color.setHex(r.color);
        l.intensity = r.intensity;
        l.distance = r.distance;
      } else {
        l.intensity = 0;
      }
    }
    this.reqCount = 0;
  }

  clear(): void {
    this.reqCount = 0;
    for (const l of this.lights) l.intensity = 0;
  }
}
