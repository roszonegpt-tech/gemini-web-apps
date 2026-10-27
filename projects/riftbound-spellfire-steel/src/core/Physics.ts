// Dynamic collision world (circles + axis-aligned boxes in a spatial hash) and a
// grid navigation mesh with A* pathfinding. Everything lives on the XZ plane.
import { clamp, dist, segAABB, segCircle } from '../utils/math';

export const CF = {
  MOVE: 1, // blocks walking
  SHOT: 2, // blocks projectiles
  SIGHT: 4, // blocks line of sight (tall)
  LOW: 8, // low cover: shooters adjacent to it fire over it
  FLY: 16, // blocks flying units / golem (tall terrain)
} as const;

export interface Collider {
  id: number;
  shape: 'circle' | 'box';
  x: number;
  z: number;
  r: number;
  hw: number;
  hd: number;
  flags: number;
  active: boolean;
  /** Gameplay object that owns this collider (prop, entity, gate …). */
  owner: unknown;
  cells: number[];
  /** Query stamp used to visit each collider once per query. */
  qs: number;
}

export interface RayHit {
  t: number;
  x: number;
  z: number;
  collider: Collider;
}

export interface ShotRules {
  /** Shooter position: low cover within LOW_IGNORE of it is ignored. */
  sx: number;
  sz: number;
  /** Optional target position: low cover hugging an exposed target is ignored. */
  tx?: number;
  tz?: number;
  targetExposed?: boolean;
}

const LOW_IGNORE_SHOOTER = 1.6;
const LOW_IGNORE_TARGET = 1.5;

export class CollisionWorld {
  readonly cell = 4;
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
  private cols: number;
  private rows: number;
  private grid: Collider[][];
  private nextId = 1;
  private stamp = 0;
  all: Collider[] = [];

  constructor(minX: number, minZ: number, maxX: number, maxZ: number) {
    this.minX = minX; this.minZ = minZ; this.maxX = maxX; this.maxZ = maxZ;
    this.cols = Math.ceil((maxX - minX) / this.cell) + 1;
    this.rows = Math.ceil((maxZ - minZ) / this.cell) + 1;
    this.grid = [];
    for (let i = 0; i < this.cols * this.rows; i++) this.grid.push([]);
  }

  private cellIndex(cx: number, cz: number): number {
    return cz * this.cols + cx;
  }

  private cellRange(minX: number, minZ: number, maxX: number, maxZ: number): [number, number, number, number] {
    const c0 = clamp(Math.floor((minX - this.minX) / this.cell), 0, this.cols - 1);
    const r0 = clamp(Math.floor((minZ - this.minZ) / this.cell), 0, this.rows - 1);
    const c1 = clamp(Math.floor((maxX - this.minX) / this.cell), 0, this.cols - 1);
    const r1 = clamp(Math.floor((maxZ - this.minZ) / this.cell), 0, this.rows - 1);
    return [c0, r0, c1, r1];
  }

  addCircle(x: number, z: number, r: number, flags: number, owner: unknown = null): Collider {
    return this.insert({ id: this.nextId++, shape: 'circle', x, z, r, hw: r, hd: r, flags, active: true, owner, cells: [], qs: 0 });
  }

  addBox(x: number, z: number, hw: number, hd: number, flags: number, owner: unknown = null): Collider {
    return this.insert({ id: this.nextId++, shape: 'box', x, z, r: Math.hypot(hw, hd), hw, hd, flags, active: true, owner, cells: [], qs: 0 });
  }

  private insert(c: Collider): Collider {
    const [c0, r0, c1, r1] = this.cellRange(c.x - c.hw, c.z - c.hd, c.x + c.hw, c.z + c.hd);
    for (let rz = r0; rz <= r1; rz++) {
      for (let cx = c0; cx <= c1; cx++) {
        const idx = this.cellIndex(cx, rz);
        this.grid[idx].push(c);
        c.cells.push(idx);
      }
    }
    this.all.push(c);
    return c;
  }

  remove(c: Collider): void {
    if (!c.active) return;
    c.active = false;
    for (const idx of c.cells) {
      const arr = this.grid[idx];
      const i = arr.indexOf(c);
      if (i >= 0) arr.splice(i, 1);
    }
    c.cells.length = 0;
    const i = this.all.indexOf(c);
    if (i >= 0) this.all.splice(i, 1);
  }

  /** Visits each collider overlapping the box once. Return true from cb to stop early. */
  query(minX: number, minZ: number, maxX: number, maxZ: number, mask: number, cb: (c: Collider) => boolean | void): void {
    const [c0, r0, c1, r1] = this.cellRange(minX, minZ, maxX, maxZ);
    const stamp = ++this.stamp;
    for (let rz = r0; rz <= r1; rz++) {
      for (let cx = c0; cx <= c1; cx++) {
        const arr = this.grid[this.cellIndex(cx, rz)];
        for (let i = 0; i < arr.length; i++) {
          const c = arr[i];
          if (!(c.flags & mask)) continue;
          if (c.qs === stamp) continue;
          c.qs = stamp;
          if (cb(c)) return;
        }
      }
    }
  }

  /** Pushes a circle out of colliders matching `mask`. Returns the corrected position. */
  resolveCircle(x: number, z: number, r: number, mask: number, out: { x: number; z: number }): { x: number; z: number } {
    let px = x, pz = z;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      this.query(px - r, pz - r, px + r, pz + r, mask, (c) => {
        if (c.shape === 'circle') {
          const dx = px - c.x, dz = pz - c.z;
          const d = Math.sqrt(dx * dx + dz * dz);
          const min = r + c.r;
          if (d < min) {
            if (d < 1e-5) { px += min; } else {
              px = c.x + (dx / d) * min;
              pz = c.z + (dz / d) * min;
            }
            moved = true;
          }
        } else {
          const nx = clamp(px, c.x - c.hw, c.x + c.hw);
          const nz = clamp(pz, c.z - c.hd, c.z + c.hd);
          const dx = px - nx, dz = pz - nz;
          const d2 = dx * dx + dz * dz;
          if (d2 < r * r) {
            if (d2 > 1e-8) {
              const d = Math.sqrt(d2);
              px = nx + (dx / d) * r;
              pz = nz + (dz / d) * r;
            } else {
              // centre inside box: push out along the shallowest axis
              const left = px - (c.x - c.hw), right = c.x + c.hw - px;
              const top = pz - (c.z - c.hd), bottom = c.z + c.hd - pz;
              const m = Math.min(left, right, top, bottom);
              if (m === left) px = c.x - c.hw - r;
              else if (m === right) px = c.x + c.hw + r;
              else if (m === top) pz = c.z - c.hd - r;
              else pz = c.z + c.hd + r;
            }
            moved = true;
          }
        }
      });
      if (!moved) break;
    }
    out.x = clamp(px, this.minX + r, this.maxX - r);
    out.z = clamp(pz, this.minZ + r, this.maxZ - r);
    return out;
  }

  circleFree(x: number, z: number, r: number, mask: number): boolean {
    if (x - r < this.minX || z - r < this.minZ || x + r > this.maxX || z + r > this.maxZ) return false;
    let free = true;
    this.query(x - r, z - r, x + r, z + r, mask, (c) => {
      if (c.shape === 'circle') {
        if (dist(x, z, c.x, c.z) < r + c.r) { free = false; return true; }
      } else {
        const nx = clamp(x, c.x - c.hw, c.x + c.hw);
        const nz = clamp(z, c.z - c.hd, c.z + c.hd);
        if ((x - nx) * (x - nx) + (z - nz) * (z - nz) < r * r) { free = false; return true; }
      }
      return false;
    });
    return free;
  }

  /**
   * First collider hit along a→b (optionally with `radius` inflation).
   * When `rules` is given, LOW cover next to the shooter (or hugging an exposed target) is ignored.
   */
  raycast(ax: number, az: number, bx: number, bz: number, mask: number, rules?: ShotRules | null, radius = 0, ignore?: Collider | null): RayHit | null {
    let best: RayHit | null = null;
    const minX = Math.min(ax, bx) - radius - 0.1, maxX = Math.max(ax, bx) + radius + 0.1;
    const minZ = Math.min(az, bz) - radius - 0.1, maxZ = Math.max(az, bz) + radius + 0.1;
    // For long rays the box query can touch many cells; that's fine for our level sizes.
    this.query(minX, minZ, maxX, maxZ, mask, (c) => {
      if (c === ignore) return;
      if (rules && (c.flags & CF.LOW) && !(c.flags & CF.SIGHT)) {
        if (nearCollider(c, rules.sx, rules.sz, LOW_IGNORE_SHOOTER)) return;
        if (rules.targetExposed && rules.tx !== undefined && rules.tz !== undefined && nearCollider(c, rules.tx, rules.tz, LOW_IGNORE_TARGET)) return;
      }
      let t: number;
      if (c.shape === 'circle') t = segCircle(ax, az, bx, bz, c.x, c.z, c.r + radius);
      else t = segAABB(ax, az, bx, bz, c.x - c.hw - radius, c.z - c.hd - radius, c.x + c.hw + radius, c.z + c.hd + radius);
      if (t >= 0 && (!best || t < best.t)) {
        best = { t, x: ax + (bx - ax) * t, z: az + (bz - az) * t, collider: c };
      }
    });
    return best;
  }

  /** True when nothing tall blocks sight between a and b. */
  lineOfSight(ax: number, az: number, bx: number, bz: number): boolean {
    return this.raycast(ax, az, bx, bz, CF.SIGHT) === null;
  }
}

function nearCollider(c: Collider, x: number, z: number, d: number): boolean {
  if (c.shape === 'circle') return dist(x, z, c.x, c.z) < c.r + d;
  const nx = clamp(x, c.x - c.hw, c.x + c.hw);
  const nz = clamp(z, c.z - c.hd, c.z + c.hd);
  return (x - nx) * (x - nx) + (z - nz) * (z - nz) < d * d;
}

// ------------------------------------------------------------------ navigation

class MinHeap {
  private items: number[] = [];
  private prio: number[] = [];
  get size(): number {
    return this.items.length;
  }
  clear(): void {
    this.items.length = 0;
    this.prio.length = 0;
  }
  push(item: number, p: number): void {
    const it = this.items, pr = this.prio;
    it.push(item); pr.push(p);
    let i = it.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (pr[parent] <= pr[i]) break;
      [it[parent], it[i]] = [it[i], it[parent]];
      [pr[parent], pr[i]] = [pr[i], pr[parent]];
      i = parent;
    }
  }
  pop(): number {
    const it = this.items, pr = this.prio;
    const top = it[0];
    const lastI = it.pop() as number, lastP = pr.pop() as number;
    if (it.length > 0) {
      it[0] = lastI; pr[0] = lastP;
      let i = 0;
      const n = it.length;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < n && pr[l] < pr[m]) m = l;
        if (r < n && pr[r] < pr[m]) m = r;
        if (m === i) break;
        [it[m], it[i]] = [it[i], it[m]];
        [pr[m], pr[i]] = [pr[i], pr[m]];
        i = m;
      }
    }
    return top;
  }
}

export class NavGrid {
  readonly cell = 1;
  readonly w: number;
  readonly h: number;
  readonly ox: number;
  readonly oz: number;
  blocked: Uint8Array;
  private g: Float32Array;
  private parent: Int32Array;
  private seen: Uint32Array;
  private closed: Uint32Array;
  private gen = 1;
  private heap = new MinHeap();
  agentRadius = 0.45;

  constructor(minX: number, minZ: number, maxX: number, maxZ: number) {
    this.ox = minX;
    this.oz = minZ;
    this.w = Math.ceil(maxX - minX);
    this.h = Math.ceil(maxZ - minZ);
    const n = this.w * this.h;
    this.blocked = new Uint8Array(n);
    this.g = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.seen = new Uint32Array(n);
    this.closed = new Uint32Array(n);
  }

  rebuild(world: CollisionWorld): void {
    this.blocked.fill(0);
    for (let z = 0; z < this.h; z++) {
      for (let x = 0; x < this.w; x++) {
        if (x === 0 || z === 0 || x === this.w - 1 || z === this.h - 1) { this.blocked[z * this.w + x] = 1; continue; }
        const cx = this.ox + x + 0.5, cz = this.oz + z + 0.5;
        if (!world.circleFree(cx, cz, this.agentRadius, CF.MOVE)) this.blocked[z * this.w + x] = 1;
      }
    }
  }

  /** Re-evaluate cells in a rectangle (after cover is destroyed or a gate opens). */
  updateRect(world: CollisionWorld, minX: number, minZ: number, maxX: number, maxZ: number): void {
    const x0 = clamp(Math.floor(minX - this.ox) - 1, 1, this.w - 2);
    const z0 = clamp(Math.floor(minZ - this.oz) - 1, 1, this.h - 2);
    const x1 = clamp(Math.ceil(maxX - this.ox) + 1, 1, this.w - 2);
    const z1 = clamp(Math.ceil(maxZ - this.oz) + 1, 1, this.h - 2);
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const cx = this.ox + x + 0.5, cz = this.oz + z + 0.5;
        this.blocked[z * this.w + x] = world.circleFree(cx, cz, this.agentRadius, CF.MOVE) ? 0 : 1;
      }
    }
  }

  cellOf(x: number, z: number): number {
    const cx = clamp(Math.floor(x - this.ox), 0, this.w - 1);
    const cz = clamp(Math.floor(z - this.oz), 0, this.h - 1);
    return cz * this.w + cx;
  }

  walkable(x: number, z: number): boolean {
    return this.blocked[this.cellOf(x, z)] === 0;
  }

  /** Nearest open cell to (x,z) within a small radius; returns cell index or -1. */
  nearestOpen(x: number, z: number, maxR = 4): number {
    const c = this.cellOf(x, z);
    if (!this.blocked[c]) return c;
    const cx = c % this.w, cz = (c / this.w) | 0;
    for (let r = 1; r <= maxR; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
          const nx = cx + dx, nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= this.w || nz >= this.h) continue;
          const i = nz * this.w + nx;
          if (!this.blocked[i]) return i;
        }
      }
    }
    return -1;
  }

  /** A* path from a to b. Returns flattened [x0,z0,x1,z1,…] waypoints (excluding start), or null. */
  findPath(ax: number, az: number, bx: number, bz: number, world: CollisionWorld, maxExpand = 3500): number[] | null {
    const start = this.nearestOpen(ax, az);
    const goal = this.nearestOpen(bx, bz);
    if (start < 0 || goal < 0) return null;
    if (start === goal) return [bx, bz];
    const w = this.w;
    const gen = ++this.gen;
    const heap = this.heap;
    heap.clear();
    const gx = goal % w, gz = (goal / w) | 0;
    const hfn = (i: number) => {
      const dx = Math.abs((i % w) - gx), dz = Math.abs(((i / w) | 0) - gz);
      return dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz);
    };
    this.g[start] = 0;
    this.seen[start] = gen;
    this.parent[start] = -1;
    heap.push(start, hfn(start));
    let found = false;
    let expanded = 0;
    let bestI = start, bestH = hfn(start);
    while (heap.size > 0 && expanded < maxExpand) {
      const cur = heap.pop();
      if (this.closed[cur] === gen) continue;
      this.closed[cur] = gen;
      expanded++;
      if (cur === goal) { found = true; break; }
      const hcur = hfn(cur);
      if (hcur < bestH) { bestH = hcur; bestI = cur; }
      const cx = cur % w, cz = (cur / w) | 0;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = cx + dx, nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= w || nz >= this.h) continue;
          const ni = nz * w + nx;
          if (this.blocked[ni] || this.closed[ni] === gen) continue;
          if (dx && dz && (this.blocked[cz * w + nx] || this.blocked[nz * w + cx])) continue; // no corner cutting
          const ng = this.g[cur] + (dx && dz ? Math.SQRT2 : 1);
          if (this.seen[ni] !== gen || ng < this.g[ni]) {
            this.seen[ni] = gen;
            this.g[ni] = ng;
            this.parent[ni] = cur;
            heap.push(ni, ng + hfn(ni));
          }
        }
      }
    }
    const end = found ? goal : bestI;
    if (end === start) return null;
    const cells: number[] = [];
    for (let i = end; i !== -1 && i !== start; i = this.parent[i]) cells.push(i);
    cells.reverse();
    // string-pull: keep only waypoints needed for line-of-walk
    const pts: number[] = [];
    let fromX = ax, fromZ = az;
    for (let i = 0; i < cells.length; i++) {
      const isLast = i === cells.length - 1;
      const nextI = isLast ? -1 : cells[i + 1];
      if (!isLast) {
        const nx = this.ox + (nextI % w) + 0.5, nz = this.oz + ((nextI / w) | 0) + 0.5;
        if (!world.raycast(fromX, fromZ, nx, nz, CF.MOVE, null, this.agentRadius * 0.9)) continue;
      }
      const px = isLast && found ? bx : this.ox + (cells[i] % w) + 0.5;
      const pz = isLast && found ? bz : this.oz + ((cells[i] / w) | 0) + 0.5;
      pts.push(px, pz);
      fromX = px; fromZ = pz;
    }
    return pts.length ? pts : null;
  }
}
