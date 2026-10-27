// Instanced prop renderer: every prop kind (sandbag, crate, tree, grass …) is drawn
// with one InstancedMesh per part, keeping draw calls low on mobile. Instances can
// be re-transformed, tinted (scorch / damage states) or hidden after creation.
import * as THREE from 'three';
import { propParts, type PartDef } from '../utils/models';

interface KindRec {
  name: string;
  parts: PartDef[];
  meshes: THREE.InstancedMesh[];
  data: number[]; // per instance: x,y,z,ry,sx,sy,sz
  colors: number[];
  hidden: boolean[];
}

export interface PropHandle {
  kind: KindRec;
  i: number;
}

const tmpM = new THREE.Matrix4();
const tmpBase = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export class PropSystem {
  private kinds = new Map<string, KindRec>();
  private group = new THREE.Group();
  private finalized = false;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  add(kind: string, x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1, color = 0xffffff): PropHandle {
    if (this.finalized) throw new Error('PropSystem: add after finalize');
    let k = this.kinds.get(kind);
    if (!k) {
      k = { name: kind, parts: propParts(kind), meshes: [], data: [], colors: [], hidden: [] };
      this.kinds.set(kind, k);
    }
    k.data.push(x, y, z, ry, sx, sy, sz);
    k.colors.push(color);
    k.hidden.push(false);
    return { kind: k, i: k.colors.length - 1 };
  }

  finalize(): void {
    this.finalized = true;
    this.kinds.forEach((k) => {
      const n = k.colors.length;
      for (const p of k.parts) {
        const im = new THREE.InstancedMesh(p.geo, p.mat, n);
        im.castShadow = p.castShadow;
        im.receiveShadow = p.receiveShadow;
        im.frustumCulled = false;
        const tintable = (p.mat as THREE.MeshLambertMaterial).color && (p.mat as THREE.MeshLambertMaterial).color.getHex() === 0xffffff;
        im.userData.tint = tintable;
        this.group.add(im);
        k.meshes.push(im);
      }
      for (let i = 0; i < n; i++) this.apply(k, i);
      for (const im of k.meshes) {
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
      }
    });
  }

  private apply(k: KindRec, i: number): void {
    const d = k.data, o = i * 7;
    tmpBase.compose(tmpV.set(d[o], d[o + 1], d[o + 2]), tmpQ.setFromAxisAngle(UP, d[o + 3]), tmpS.set(d[o + 4], d[o + 5], d[o + 6]));
    tmpC.setHex(k.colors[i]);
    for (let p = 0; p < k.parts.length; p++) {
      const im = k.meshes[p];
      if (k.hidden[i]) im.setMatrixAt(i, ZERO);
      else im.setMatrixAt(i, tmpM.multiplyMatrices(tmpBase, k.parts[p].m));
      if (im.userData.tint) im.setColorAt(i, tmpC);
    }
  }

  private flag(k: KindRec): void {
    for (const im of k.meshes) {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }

  update(h: PropHandle, x: number, y: number, z: number, ry: number, sx: number, sy: number, sz: number): void {
    const d = h.kind.data, o = h.i * 7;
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = ry; d[o + 4] = sx; d[o + 5] = sy; d[o + 6] = sz;
    if (this.finalized) { this.apply(h.kind, h.i); this.flag(h.kind); }
  }

  /** Scale only the height (crumbling cover). */
  setHeight(h: PropHandle, sy: number): void {
    const d = h.kind.data, o = h.i * 7;
    this.update(h, d[o], d[o + 1], d[o + 2], d[o + 3], d[o + 4], sy, d[o + 6]);
  }

  setColor(h: PropHandle, color: number): void {
    h.kind.colors[h.i] = color;
    if (this.finalized) { this.apply(h.kind, h.i); this.flag(h.kind); }
  }

  hide(h: PropHandle): void {
    h.kind.hidden[h.i] = true;
    if (this.finalized) { this.apply(h.kind, h.i); this.flag(h.kind); }
  }

  dispose(): void {
    this.kinds.forEach((k) => k.meshes.forEach((m) => m.dispose()));
    this.group.removeFromParent();
  }
}
