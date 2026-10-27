// Procedural low-poly model builders. Everything is assembled from primitives with
// flat-shaded Lambert materials; rendered at low resolution this produces the chunky
// "3D pixel art" look of the reference. Asset names match assets_manifest.json.
import * as THREE from 'three';
import { propTexture, runeTexture } from './textures';

// ------------------------------------------------------------------ materials

const matCache = new Map<string, THREE.Material>();

export interface MatOpts {
  emissive?: number;
  ei?: number;
  map?: THREE.Texture | null;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
  basic?: boolean;
  additive?: boolean;
  depthWrite?: boolean;
}

export function mat(color: number, o: MatOpts = {}): THREE.Material {
  const key = `${color}|${o.emissive || 0}|${o.ei || 0}|${o.map ? o.map.uuid : ''}|${o.transparent ? 1 : 0}|${o.opacity || 1}|${o.side || 0}|${o.basic ? 1 : 0}|${o.additive ? 1 : 0}|${o.depthWrite === false ? 0 : 1}`;
  let m = matCache.get(key);
  if (m) return m;
  if (o.basic) {
    m = new THREE.MeshBasicMaterial({
      color, map: o.map || null, transparent: !!o.transparent || !!o.additive, opacity: o.opacity !== undefined ? o.opacity : 1,
      side: o.side || THREE.FrontSide, blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: o.depthWrite === false ? false : !o.additive,
    });
  } else {
    m = new THREE.MeshLambertMaterial({
      color, map: o.map || null, emissive: o.emissive || 0, emissiveIntensity: o.ei !== undefined ? o.ei : 1,
      transparent: !!o.transparent, opacity: o.opacity !== undefined ? o.opacity : 1, side: o.side || THREE.FrontSide,
      flatShading: true,
    });
  }
  matCache.set(key, m);
  return m;
}

/** Unique (non-cached) material for objects whose colour/emissive animates. */
export function uniqueMat(color: number, o: MatOpts = {}): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({
    color, emissive: o.emissive || 0, emissiveIntensity: o.ei !== undefined ? o.ei : 1, flatShading: true,
    transparent: !!o.transparent, opacity: o.opacity !== undefined ? o.opacity : 1, map: o.map || null,
  });
}

export function glowMat(color: number, opacity = 1): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
}

// ------------------------------------------------------------------ geometry helpers

const geoCache = new Map<string, THREE.BufferGeometry>();
function g<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let geo = geoCache.get(key) as T | undefined;
  if (!geo) {
    geo = make();
    geoCache.set(key, geo);
  }
  return geo;
}

export const box = (w: number, h: number, d: number) => g(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
export const cyl = (rt: number, rb: number, h: number, s = 8) => g(`c${rt},${rb},${h},${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));
export const cone = (r: number, h: number, s = 8) => g(`k${r},${h},${s}`, () => new THREE.ConeGeometry(r, h, s));
export const sphere = (r: number, ws = 8, hs = 6) => g(`s${r},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
export const halfSphere = (r: number) => g(`hs${r}`, () => new THREE.SphereGeometry(r, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2));
export const ico = (r: number, d = 0) => g(`i${r},${d}`, () => new THREE.IcosahedronGeometry(r, d));
export const octa = (r: number) => g(`o${r}`, () => new THREE.OctahedronGeometry(r, 0));
export const torus = (r: number, t: number, rs = 6, ts = 12) => g(`t${r},${t},${rs},${ts}`, () => new THREE.TorusGeometry(r, t, rs, ts));
export const plane = (w: number, h: number) => g(`p${w},${h}`, () => new THREE.PlaneGeometry(w, h));
export const ring = (ri: number, ro: number, s = 24) => g(`r${ri},${ro},${s}`, () => new THREE.RingGeometry(ri, ro, s));

export function mesh(geo: THREE.BufferGeometry, m: THREE.Material, parent?: THREE.Object3D, x = 0, y = 0, z = 0, shadow = true): THREE.Mesh {
  const me = new THREE.Mesh(geo, m);
  me.position.set(x, y, z);
  me.castShadow = shadow;
  me.receiveShadow = false;
  if (parent) parent.add(me);
  return me;
}

// ------------------------------------------------------------------ palette

export const COL = {
  skin: 0xf0c49a,
  robe: 0x3557bd,
  robeDark: 0x26408f,
  hat: 0xd552c4,
  hatDark: 0xa83a9a,
  gold: 0xe7c45a,
  staff: 0x6b4a2a,
  olive: 0x76804e,
  oliveDark: 0x3f4632,
  fatigue: 0x3b3f31,
  steel: 0x5d6168,
  steelDark: 0x3a3e45,
  gun: 0x26282b,
  tan: 0x8f7d55,
  concrete: 0x9a978f,
  stone: 0x8f8aa3,
  sand: 0xc6ae80,
  barrel: 0xb83a2a,
  crystal: 0xa66bff,
  arcane: 0xb36bff,
  white: 0xe8e6df,
  red: 0xc23a2e,
};

// ------------------------------------------------------------------ characters

export interface MageModel {
  root: THREE.Group;
  body: THREE.Group;
  hat: THREE.Group;
  armR: THREE.Group;
  armL: THREE.Group;
  staffOrb: THREE.Mesh;
  orb: THREE.Mesh;
  glowMat: THREE.MeshLambertMaterial;
  orbMat: THREE.MeshLambertMaterial;
}

export function buildMage(glowColor: number, robeColor = COL.robe, hatColor = COL.hat): MageModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const robeTex = propTexture('robe');
  const robe = mat(robeColor, { map: robeTex });
  mesh(cyl(0.2, 0.44, 1.0, 8), robe, body, 0, 0.5, 0);
  const glow = uniqueMat(glowColor, { emissive: glowColor, ei: 0.9 });
  mesh(cyl(0.445, 0.45, 0.06, 8), glow, body, 0, 0.05, 0);
  mesh(cyl(0.2, 0.23, 0.38, 8), mat(COL.robeDark), body, 0, 1.15, 0);
  mesh(cyl(0.235, 0.235, 0.06, 8), mat(COL.gold), body, 0, 0.98, 0);
  // runes on the robe front
  mesh(box(0.06, 0.3, 0.02), glow, body, 0, 0.55, 0.34, false);
  mesh(box(0.18, 0.04, 0.02), glow, body, 0, 0.62, 0.33, false);
  // head + beard
  mesh(sphere(0.19, 8, 6), mat(COL.skin), body, 0, 1.46, 0.02);
  const beard = mesh(cone(0.15, 0.36, 6), mat(0xeeeeee), body, 0, 1.25, 0.12);
  beard.rotation.x = Math.PI;
  // hat (bent pointy wizard hat like the reference)
  const hat = new THREE.Group();
  hat.position.set(0, 1.6, 0);
  body.add(hat);
  const hatMat = mat(hatColor);
  mesh(cyl(0.46, 0.48, 0.05, 10), hatMat, hat, 0, 0, 0);
  mesh(cyl(0.27, 0.29, 0.08, 8), mat(COL.gold), hat, 0, 0.06, 0);
  const c1 = mesh(cone(0.27, 0.55, 8), hatMat, hat, 0, 0.32, 0);
  c1.rotation.x = -0.12;
  const tip = mesh(cone(0.12, 0.38, 6), mat(COL.hatDark), hat, 0, 0.66, -0.12);
  tip.rotation.x = -0.75;
  // arms (wide sleeves)
  const armR = new THREE.Group();
  armR.position.set(0.27, 1.22, 0);
  body.add(armR);
  const sleeve = mesh(cyl(0.07, 0.12, 0.42, 6), mat(COL.robeDark), armR, 0, -0.18, 0);
  sleeve.rotation.z = 0.15;
  mesh(sphere(0.07, 6, 4), mat(COL.skin), armR, 0.02, -0.42, 0.02);
  // staff in right hand
  const staff = new THREE.Group();
  staff.position.set(0.04, -0.42, 0.05);
  armR.add(staff);
  mesh(cyl(0.035, 0.035, 1.7, 5), mat(COL.staff), staff, 0, 0.35, 0);
  mesh(torus(0.11, 0.025, 4, 8), mat(COL.gold), staff, 0, 1.22, 0);
  const orbMat = uniqueMat(glowColor, { emissive: glowColor, ei: 1.4 });
  const staffOrb = mesh(octa(0.11), orbMat, staff, 0, 1.24, 0);
  const armL = new THREE.Group();
  armL.position.set(-0.27, 1.22, 0);
  body.add(armL);
  const sleeveL = mesh(cyl(0.07, 0.12, 0.42, 6), mat(COL.robeDark), armL, 0, -0.18, 0);
  sleeveL.rotation.z = -0.15;
  mesh(sphere(0.07, 6, 4), mat(COL.skin), armL, -0.02, -0.42, 0.02);
  // hovering companion orb
  const orb = mesh(ico(0.13, 0), orbMat, root, 0.6, 1.7, -0.3);
  return { root, body, hat, armR, armL, staffOrb, orb, glowMat: glow, orbMat };
}

export interface SoldierModel {
  root: THREE.Group;
  body: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  upper: THREE.Group;
  head: THREE.Mesh;
  muzzle: THREE.Object3D;
  tint: THREE.MeshLambertMaterial[];
  extra: THREE.Object3D | null;
}

export type SoldierLook = 'trooper' | 'sniper' | 'heavy' | 'officer' | 'vance';

export function buildSoldier(look: SoldierLook): SoldierModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const heavy = look === 'heavy' || look === 'vance';
  const S = look === 'heavy' ? 1.3 : look === 'vance' ? 1.18 : 1;
  body.scale.setScalar(S);
  const uniformC = look === 'officer' ? COL.tan : look === 'sniper' ? 0x56633a : heavy ? COL.steel : COL.olive;
  const pantsC = look === 'officer' ? 0x6e6142 : heavy ? COL.steelDark : COL.oliveDark;
  const tintMats: THREE.MeshLambertMaterial[] = [];
  const tm = (c: number) => {
    const m = uniqueMat(c);
    tintMats.push(m);
    return m;
  };
  const uni = tm(uniformC);
  const pants = tm(pantsC);
  const legL = new THREE.Group();
  legL.position.set(-0.11, 0.5, 0);
  body.add(legL);
  mesh(box(0.15, 0.5, 0.17), pants, legL, 0, -0.25, 0);
  mesh(box(0.16, 0.1, 0.22), mat(0x2a2522), legL, 0, -0.47, 0.03);
  const legR = new THREE.Group();
  legR.position.set(0.11, 0.5, 0);
  body.add(legR);
  mesh(box(0.15, 0.5, 0.17), pants, legR, 0, -0.25, 0);
  mesh(box(0.16, 0.1, 0.22), mat(0x2a2522), legR, 0, -0.47, 0.03);
  const upper = new THREE.Group();
  upper.position.set(0, 0.52, 0);
  body.add(upper);
  mesh(box(0.42, 0.5, 0.26), uni, upper, 0, 0.26, 0);
  if (look === 'vance') {
    mesh(box(0.5, 0.3, 0.32), mat(COL.steelDark), upper, 0, 0.36, 0);
    mesh(box(0.22, 0.2, 0.36), mat(0xc9a640), upper, -0.32, 0.46, 0);
    mesh(box(0.22, 0.2, 0.36), mat(0xc9a640), upper, 0.32, 0.46, 0);
    mesh(box(0.08, 0.5, 0.02), mat(0x9b2a2a), upper, 0, 0.2, 0.17, false);
  } else if (heavy) {
    mesh(box(0.56, 0.38, 0.36), mat(COL.steelDark), upper, 0, 0.32, 0);
    mesh(box(0.26, 0.22, 0.38), mat(COL.steel), upper, -0.36, 0.44, 0);
    mesh(box(0.26, 0.22, 0.38), mat(COL.steel), upper, 0.36, 0.44, 0);
    mesh(box(0.4, 0.4, 0.22), mat(COL.steelDark), upper, 0, 0.3, -0.26);
  } else {
    mesh(box(0.46, 0.34, 0.3), mat(look === 'officer' ? 0x5a4d33 : COL.fatigue), upper, 0, 0.3, 0);
    mesh(box(0.08, 0.1, 0.06), mat(0x32381f), upper, -0.12, 0.25, 0.16);
    mesh(box(0.08, 0.1, 0.06), mat(0x32381f), upper, 0.12, 0.25, 0.16);
  }
  const head = mesh(sphere(0.13, 7, 5), mat(COL.skin), upper, 0, 0.64, 0);
  if (look === 'officer') {
    const beret = mesh(sphere(0.15, 7, 4), mat(0x8a2a2a), upper, 0.03, 0.74, 0);
    beret.scale.set(1, 0.45, 1);
  } else if (look === 'vance') {
    mesh(box(0.28, 0.08, 0.28), mat(0x2d3328), upper, 0, 0.76, 0);
    mesh(box(0.3, 0.03, 0.12), mat(0x2d3328), upper, 0, 0.73, 0.16);
    mesh(box(0.2, 0.04, 0.02), mat(0x111111), upper, 0, 0.66, 0.13, false);
  } else if (heavy) {
    mesh(box(0.32, 0.3, 0.32), mat(COL.steelDark), upper, 0, 0.66, 0);
    mesh(box(0.24, 0.05, 0.02), mat(0xff5a2a, { emissive: 0xff5a2a, ei: 1 }), upper, 0, 0.68, 0.165, false);
  } else {
    mesh(halfSphere(0.165), mat(look === 'sniper' ? 0x4f5e33 : 0x3a4030), upper, 0, 0.66, 0);
  }
  // red IFF strobe on the helmet / shoulder: keeps Vanguard units readable at low resolution
  if (look !== 'vance') mesh(box(0.08, 0.08, 0.08), mat(0xff2a2a, { emissive: 0xff1a1a, ei: 2 }), upper, 0.1, look === 'heavy' ? 0.84 : 0.82, -0.08, false);
  if (look === 'sniper') {
    const fuzz = mat(0x6b7a3e);
    const fuzz2 = mat(0x4b5a2c);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const f = mesh(box(0.12, 0.08, 0.12), i % 2 ? fuzz : fuzz2, upper, Math.cos(a) * 0.22, 0.45 + (i % 3) * 0.12, Math.sin(a) * 0.15);
      f.rotation.y = a;
    }
  }
  // arms + weapon
  const arms = new THREE.Group();
  arms.position.set(0, 0.42, 0);
  upper.add(arms);
  const armMat = heavy ? mat(COL.steel) : uni;
  const aR = mesh(box(0.11, 0.38, 0.12), armMat, arms, 0.24, -0.05, 0.12);
  aR.rotation.x = -1.1;
  const aL = mesh(box(0.11, 0.38, 0.12), armMat, arms, -0.2, -0.05, 0.16);
  aL.rotation.x = -1.2;
  aL.rotation.z = 0.4;
  const muzzle = new THREE.Object3D();
  let extra: THREE.Object3D | null = null;
  if (look === 'heavy') {
    const gun = new THREE.Group();
    gun.position.set(0.18, -0.08, 0.38);
    arms.add(gun);
    mesh(cyl(0.13, 0.13, 0.5, 8), mat(COL.gun), gun, 0, 0, 0).rotation.x = Math.PI / 2;
    const barrels = new THREE.Group();
    barrels.position.z = 0.5;
    gun.add(barrels);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const b = mesh(cyl(0.025, 0.025, 0.55, 4), mat(0x3a3a3a), barrels, Math.cos(a) * 0.07, Math.sin(a) * 0.07, 0, false);
      b.rotation.x = Math.PI / 2;
    }
    muzzle.position.set(0, 0, 0.32);
    barrels.add(muzzle);
    extra = barrels;
  } else if (look === 'officer' || look === 'vance') {
    mesh(box(0.06, 0.1, 0.24), mat(COL.gun), arms, 0.22, -0.04, 0.42);
    muzzle.position.set(0.22, -0.02, 0.56);
    arms.add(muzzle);
  } else {
    const len = look === 'sniper' ? 1.05 : 0.72;
    mesh(box(0.07, 0.09, len), mat(COL.gun), arms, 0.1, -0.02, 0.18 + len / 2 - 0.2);
    mesh(box(0.05, 0.12, 0.12), mat(COL.gun), arms, 0.1, -0.1, 0.12);
    if (look === 'sniper') mesh(cyl(0.04, 0.04, 0.24, 6), mat(0x111111), arms, 0.1, 0.06, 0.28).rotation.x = Math.PI / 2;
    muzzle.position.set(0.1, -0.02, 0.2 + len - 0.2);
    arms.add(muzzle);
  }
  return { root, body, legL, legR, upper, head, muzzle, tint: tintMats, extra };
}

export function buildDrone(): { root: THREE.Group; rotors: THREE.Object3D[]; eye: THREE.Mesh; muzzle: THREE.Object3D } {
  const root = new THREE.Group();
  const bodyM = mat(0x4b5057);
  mesh(box(0.55, 0.16, 0.55), bodyM, root, 0, 0, 0);
  mesh(box(0.3, 0.12, 0.3), mat(0x2f3338), root, 0, -0.12, 0);
  const eye = mesh(sphere(0.07, 6, 4), mat(0xff3030, { emissive: 0xff2020, ei: 1.5 }), root, 0, -0.1, 0.2, false);
  const rotors: THREE.Object3D[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const x = Math.cos(a) * 0.45, z = Math.sin(a) * 0.45;
    const arm = mesh(box(0.5, 0.05, 0.06), bodyM, root, x / 2, 0, z / 2, false);
    arm.rotation.y = -a;
    const rotor = mesh(cyl(0.2, 0.2, 0.02, 8), mat(0x8a9099, { transparent: true, opacity: 0.6 }), root, x, 0.08, z, false);
    rotors.push(rotor);
  }
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, -0.12, 0.3);
  root.add(muzzle);
  return { root, rotors, eye, muzzle };
}

export function buildHelicopter(): { root: THREE.Group; rotor: THREE.Object3D; tailRotor: THREE.Object3D; muzzle: THREE.Object3D } {
  const root = new THREE.Group();
  const hull = mat(0x4e5a36);
  const dark = mat(0x323a24);
  mesh(box(1.4, 1.2, 3.0), hull, root, 0, 0, 0);
  const nose = mesh(cone(0.7, 1.2, 6), hull, root, 0, -0.1, 2.0);
  nose.rotation.x = Math.PI / 2;
  mesh(box(1.2, 0.6, 1.0), mat(0x223344, { emissive: 0x112233, ei: 0.4 }), root, 0, 0.25, 1.45);
  mesh(box(0.35, 0.4, 3.2), hull, root, 0, 0.25, -2.9);
  mesh(box(0.1, 1.0, 0.6), dark, root, 0, 0.7, -4.4);
  mesh(box(0.15, 0.15, 2.6), dark, root, -0.6, -0.85, 0.2);
  mesh(box(0.15, 0.15, 2.6), dark, root, 0.6, -0.85, 0.2);
  mesh(box(2.4, 0.15, 0.4), dark, root, 0, -0.2, 0.3);
  mesh(box(0.3, 0.3, 0.9), mat(0x2a2a2a), root, -1.2, -0.3, 0.3);
  mesh(box(0.3, 0.3, 0.9), mat(0x2a2a2a), root, 1.2, -0.3, 0.3);
  const rotor = new THREE.Group();
  rotor.position.set(0, 0.85, 0);
  root.add(rotor);
  mesh(cyl(0.12, 0.12, 0.3, 6), dark, rotor, 0, -0.1, 0);
  mesh(box(7.0, 0.04, 0.3), mat(0x222222), rotor, 0, 0.05, 0, true);
  mesh(box(0.3, 0.04, 7.0), mat(0x222222), rotor, 0, 0.05, 0, true);
  const tailRotor = new THREE.Group();
  tailRotor.position.set(0.12, 0.8, -4.4);
  root.add(tailRotor);
  mesh(box(0.04, 1.3, 0.15), mat(0x222222), tailRotor, 0, 0, 0, false);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, -0.5, 2.4);
  root.add(muzzle);
  return { root, rotor, tailRotor, muzzle };
}

export function buildDropship(): { root: THREE.Group; fans: THREE.Object3D[] } {
  const root = new THREE.Group();
  const hull = mat(0x5a5f66);
  const dark = mat(0x3a3e44);
  mesh(box(2.6, 1.6, 6.5), hull, root, 0, 0, 0);
  const nose = mesh(cone(1.3, 1.8, 4), hull, root, 0, 0, 4.1);
  nose.rotation.x = Math.PI / 2;
  nose.rotation.y = Math.PI / 4;
  mesh(box(1.8, 0.5, 1.2), mat(0x223344), root, 0, 0.6, 3.0);
  mesh(box(7.5, 0.3, 1.6), dark, root, 0, 0.3, -0.5);
  mesh(box(0.2, 1.4, 1.4), dark, root, 0, 1.2, -2.8);
  mesh(box(1.8, 0.2, 1.4), mat(0xd9b23a), root, 0, -0.85, -2.6);
  const fans: THREE.Object3D[] = [];
  for (const sx of [-3.4, 3.4]) {
    mesh(cyl(0.9, 0.9, 0.6, 10), dark, root, sx, 0.3, -0.5);
    const fan = new THREE.Group();
    fan.position.set(sx, 0.62, -0.5);
    root.add(fan);
    mesh(box(1.6, 0.05, 0.2), mat(0x222222), fan, 0, 0, 0, false);
    mesh(box(0.2, 0.05, 1.6), mat(0x222222), fan, 0, 0, 0, false);
    fans.push(fan);
  }
  return { root, fans };
}

export interface TankModel {
  root: THREE.Group;
  hull: THREE.Group;
  turret: THREE.Group;
  barrels: THREE.Object3D[];
  muzzles: THREE.Object3D[];
  treadMats: THREE.MeshLambertMaterial[];
  hatch: THREE.Object3D;
  vance: THREE.Object3D;
  rocketPods: THREE.Object3D[];
  tint: THREE.MeshLambertMaterial[];
}

export function buildTank(): TankModel {
  const root = new THREE.Group();
  const hull = new THREE.Group();
  root.add(hull);
  const camo = propTexture('camo');
  const hullM = uniqueMat(0x8c9a74, { map: camo });
  const darkM = uniqueMat(0x3b4048);
  const tint = [hullM, darkM];
  mesh(box(4.4, 1.1, 6.2), hullM, hull, 0, 1.05, 0);
  mesh(box(3.8, 0.5, 1.2), hullM, hull, 0, 1.3, 3.4).rotation.x = 0.35;
  const treadMats: THREE.MeshLambertMaterial[] = [];
  for (const sx of [-2.35, 2.35]) {
    const tmat = uniqueMat(0x2b2d30);
    treadMats.push(tmat);
    mesh(box(0.9, 1.0, 6.6), tmat, hull, sx, 0.5, 0);
    for (let i = 0; i < 5; i++) mesh(cyl(0.38, 0.38, 0.95, 8), darkM, hull, sx, 0.42, -2.4 + i * 1.2).rotation.z = Math.PI / 2;
  }
  mesh(box(4.0, 0.15, 0.6), mat(0xd9b23a, { map: propTexture('hazard') }), hull, 0, 1.62, -2.9);
  const turret = new THREE.Group();
  turret.position.set(0, 1.6, -0.3);
  hull.add(turret);
  mesh(box(2.8, 1.0, 3.0), hullM, turret, 0, 0.5, 0);
  mesh(box(2.2, 0.4, 2.2), darkM, turret, 0, 1.15, -0.3);
  const barrels: THREE.Object3D[] = [];
  const muzzles: THREE.Object3D[] = [];
  for (const sx of [-0.55, 0.55]) {
    const b = new THREE.Group();
    b.position.set(sx, 0.55, 1.4);
    turret.add(b);
    mesh(cyl(0.16, 0.2, 3.4, 8), darkM, b, 0, 0, 1.7).rotation.x = Math.PI / 2;
    mesh(cyl(0.24, 0.24, 0.4, 8), darkM, b, 0, 0, 3.4).rotation.x = Math.PI / 2;
    const m = new THREE.Object3D();
    m.position.set(0, 0, 3.7);
    b.add(m);
    barrels.push(b);
    muzzles.push(m);
  }
  const rocketPods: THREE.Object3D[] = [];
  for (const sx of [-1.7, 1.7]) {
    const pod = new THREE.Group();
    pod.position.set(sx, 0.7, -0.4);
    turret.add(pod);
    mesh(box(0.7, 0.6, 1.2), darkM, pod, 0, 0, 0);
    for (let i = 0; i < 4; i++) mesh(cyl(0.08, 0.08, 0.1, 6), mat(0xc23a2e), pod, -0.15 + (i % 2) * 0.3, -0.12 + Math.floor(i / 2) * 0.24, 0.62, false).rotation.x = Math.PI / 2;
    rocketPods.push(pod);
  }
  const hatch = new THREE.Group();
  hatch.position.set(0.5, 1.35, -0.7);
  turret.add(hatch);
  mesh(cyl(0.45, 0.45, 0.12, 10), darkM, hatch, 0, 0, 0);
  const vance = buildSoldier('vance').root;
  vance.scale.setScalar(0.9);
  vance.position.set(0, -0.6, 0);
  hatch.add(vance);
  // antenna + emitter dish
  mesh(cyl(0.02, 0.02, 1.8, 4), mat(0x222222), turret, -1.0, 1.9, -1.2, false);
  mesh(cyl(0.5, 0.2, 0.2, 10), mat(0x4fc8ff, { emissive: 0x2a8ac8, ei: 0.8 }), turret, 0, 1.45, -1.2);
  return { root, hull, turret, barrels, muzzles, treadMats, hatch, vance, rocketPods, tint };
}

export function buildShieldPylon(): { root: THREE.Group; core: THREE.MeshLambertMaterial } {
  const root = new THREE.Group();
  mesh(box(1.4, 0.4, 1.4), mat(COL.steelDark), root, 0, 0.2, 0);
  mesh(cyl(0.25, 0.4, 2.6, 6), mat(COL.steel), root, 0, 1.6, 0);
  const core = uniqueMat(0x4fc8ff, { emissive: 0x2aa0ff, ei: 1.2 });
  mesh(octa(0.45), core, root, 0, 3.2, 0);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    mesh(box(0.15, 1.2, 0.15), mat(0xd9b23a), root, Math.cos(a) * 0.55, 0.9, Math.sin(a) * 0.55);
  }
  return { root, core };
}

export function buildGolem(scale = 1): { root: THREE.Group; body: THREE.Group; armL: THREE.Group; armR: THREE.Group; legL: THREE.Group; legR: THREE.Group; core: THREE.MeshLambertMaterial } {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(scale);
  root.add(body);
  const stone = mat(0x8a8496);
  const dark = mat(0x6a6478);
  const moss = mat(0x5f9440);
  const core = uniqueMat(0x7fd8ff, { emissive: 0x4fc8ff, ei: 1.3 });
  const legL = new THREE.Group(); legL.position.set(-0.45, 1.0, 0); body.add(legL);
  mesh(box(0.5, 1.0, 0.55), dark, legL, 0, -0.5, 0);
  const legR = new THREE.Group(); legR.position.set(0.45, 1.0, 0); body.add(legR);
  mesh(box(0.5, 1.0, 0.55), dark, legR, 0, -0.5, 0);
  mesh(box(1.5, 1.2, 1.0), stone, body, 0, 1.65, 0);
  mesh(box(1.2, 0.3, 1.1), moss, body, 0, 2.3, -0.05);
  mesh(octa(0.25), core, body, 0, 1.75, 0.52, false);
  mesh(box(0.6, 0.5, 0.6), stone, body, 0, 2.55, 0.15);
  mesh(box(0.4, 0.08, 0.05), core, body, 0, 2.6, 0.46, false);
  const armL = new THREE.Group(); armL.position.set(-0.95, 2.05, 0); body.add(armL);
  mesh(box(0.45, 1.2, 0.5), stone, armL, 0, -0.55, 0);
  mesh(box(0.55, 0.45, 0.6), dark, armL, 0, -1.2, 0.05);
  const armR = new THREE.Group(); armR.position.set(0.95, 2.05, 0); body.add(armR);
  mesh(box(0.45, 1.2, 0.5), stone, armR, 0, -0.55, 0);
  mesh(box(0.55, 0.45, 0.6), dark, armR, 0, -1.2, 0.05);
  return { root, body, armL, armR, legL, legR, core };
}

// ------------------------------------------------------------------ structures & interactables

export function buildTurret(): { root: THREE.Group; head: THREE.Group; muzzle: THREE.Object3D; light: THREE.MeshLambertMaterial } {
  const root = new THREE.Group();
  mesh(cyl(0.5, 0.65, 0.4, 8), mat(COL.steelDark), root, 0, 0.2, 0);
  mesh(cyl(0.15, 0.2, 0.7, 6), mat(COL.steel), root, 0, 0.7, 0);
  const head = new THREE.Group();
  head.position.set(0, 1.1, 0);
  root.add(head);
  mesh(box(0.7, 0.45, 0.8), mat(0x56633a), head, 0, 0, 0);
  mesh(box(0.6, 0.3, 0.1), mat(COL.steel), head, 0, 0.05, 0.42);
  const barrel = mesh(cyl(0.06, 0.06, 0.9, 6), mat(COL.gun), head, 0, 0, 0.8);
  barrel.rotation.x = Math.PI / 2;
  const light = uniqueMat(0xff3030, { emissive: 0xff2020, ei: 1.5 });
  mesh(box(0.12, 0.08, 0.05), light, head, 0.2, 0.15, 0.42, false);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, 1.3);
  head.add(muzzle);
  return { root, head, muzzle, light };
}

export function buildMortar(): { root: THREE.Group; tube: THREE.Object3D } {
  const root = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    if (i === 2) continue;
    const s = mesh(box(0.9, 0.45, 0.5), mat(COL.sand, { map: propTexture('sandbag') }), root, Math.cos(a) * 1.15, 0.22, Math.sin(a) * 1.15);
    s.rotation.y = -a + Math.PI / 2;
  }
  mesh(cyl(0.5, 0.5, 0.08, 8), mat(COL.steelDark), root, 0, 0.05, 0);
  const tube = new THREE.Group();
  tube.position.set(0, 0.2, 0);
  root.add(tube);
  const t = mesh(cyl(0.12, 0.14, 1.3, 8), mat(0x3e4626), tube, 0, 0.55, 0.2);
  t.rotation.x = 0.55;
  mesh(cyl(0.02, 0.02, 0.6, 4), mat(COL.gun), root, 0.2, 0.3, 0.3).rotation.x = -0.4;
  mesh(box(0.5, 0.35, 0.4), mat(COL.olive, { map: propTexture('crate') }), root, -0.6, 0.18, -0.4);
  return { root, tube };
}

export function buildJammer(): { root: THREE.Group; dish: THREE.Object3D; light: THREE.MeshLambertMaterial } {
  const root = new THREE.Group();
  const steel = mat(0x6b7078);
  for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
    const leg = mesh(box(0.1, 4.6, 0.1), steel, root, x * 0.8, 2.3, z * 0.8);
    leg.rotation.z = x * -0.06;
    leg.rotation.x = z * 0.06;
  }
  for (let y = 0.8; y < 4.4; y += 0.9) {
    mesh(box(0.9, 0.06, 0.06), steel, root, 0, y, 0.38, false);
    mesh(box(0.9, 0.06, 0.06), steel, root, 0, y, -0.38, false);
    mesh(box(0.06, 0.06, 0.9), steel, root, 0.38, y, 0, false);
    mesh(box(0.06, 0.06, 0.9), steel, root, -0.38, y, 0, false);
  }
  mesh(box(1.2, 0.9, 0.8), mat(0x4d5832, { map: propTexture('crate') }), root, 0, 0.45, 0);
  const dish = new THREE.Group();
  dish.position.set(0, 4.7, 0);
  root.add(dish);
  const d = mesh(cyl(0.7, 0.15, 0.25, 10), mat(0xc8c8c0), dish, 0, 0, 0.2);
  d.rotation.x = Math.PI / 2 - 0.3;
  const light = uniqueMat(0xff2a2a, { emissive: 0xff2020, ei: 2 });
  mesh(sphere(0.12, 6, 4), light, root, 0, 5.3, 0, false);
  return { root, dish, light };
}

export function buildDepot(): THREE.Group {
  const root = new THREE.Group();
  const crate = mat(COL.olive, { map: propTexture('crate') });
  mesh(box(1.4, 0.8, 0.9), crate, root, -0.8, 0.4, -0.5);
  mesh(box(1.4, 0.8, 0.9), crate, root, 0.7, 0.4, -0.5);
  mesh(box(1.4, 0.8, 0.9), crate, root, -0.1, 1.2, -0.5);
  mesh(box(1.4, 0.8, 0.9), crate, root, -0.8, 0.4, 0.6);
  mesh(box(1.4, 0.8, 0.9), crate, root, 0.7, 0.4, 0.6);
  mesh(box(3.4, 0.08, 2.6), mat(0x55633a), root, 0, 2.2, 0);
  for (const [x, z] of [[-1.6, -1.2], [1.6, -1.2], [-1.6, 1.2], [1.6, 1.2]]) mesh(box(0.1, 2.2, 0.1), mat(COL.gun), root, x, 1.1, z);
  mesh(box(0.5, 0.5, 0.05), mat(0xd9b23a, { map: propTexture('hazard') }), root, 0.7, 0.5, 1.06, false);
  return root;
}

export function buildGenerator(): { root: THREE.Group; coil: THREE.MeshLambertMaterial; fan: THREE.Object3D } {
  const root = new THREE.Group();
  mesh(box(2.4, 1.4, 1.6), mat(0x56633a), root, 0, 0.7, 0);
  mesh(box(2.5, 0.25, 1.7), mat(0xd9b23a, { map: propTexture('hazard') }), root, 0, 1.45, 0);
  const coil = uniqueMat(0xffb347, { emissive: 0xff9020, ei: 1.2 });
  for (const sx of [-0.7, 0, 0.7]) {
    mesh(cyl(0.18, 0.18, 0.9, 8), mat(COL.steelDark), root, sx, 2.0, 0);
    mesh(torus(0.22, 0.05, 4, 10), coil, root, sx, 2.2, 0, false).rotation.x = Math.PI / 2;
  }
  const fan = new THREE.Group();
  fan.position.set(0, 0.75, 0.82);
  root.add(fan);
  mesh(box(0.9, 0.08, 0.04), mat(0x222222), fan, 0, 0, 0, false);
  mesh(box(0.08, 0.9, 0.04), mat(0x222222), fan, 0, 0, 0, false);
  return { root, coil, fan };
}

export function buildAnchor(): { root: THREE.Group; crystal: THREE.MeshLambertMaterial; ringA: THREE.Object3D; ringB: THREE.Object3D } {
  const root = new THREE.Group();
  mesh(cyl(1.2, 1.5, 0.3, 8), mat(COL.steelDark), root, 0, 0.15, 0);
  mesh(cyl(0.35, 0.55, 2.4, 6), mat(COL.steel), root, 0, 1.5, 0);
  mesh(cone(0.5, 1.0, 6), mat(0x2b2d30), root, 0, 0.0, 0).rotation.x = Math.PI;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const strut = mesh(box(0.15, 1.6, 0.15), mat(0xd9b23a), root, Math.cos(a) * 0.9, 0.9, Math.sin(a) * 0.9);
    strut.rotation.z = Math.cos(a) * 0.35;
    strut.rotation.x = -Math.sin(a) * 0.35;
  }
  const crystal = uniqueMat(0xd05cff, { emissive: 0xb03cff, ei: 1.4 });
  mesh(octa(0.6), crystal, root, 0, 3.3, 0);
  const ringA = mesh(torus(0.95, 0.05, 4, 16), crystal, root, 0, 3.3, 0, false);
  const ringB = mesh(torus(1.2, 0.04, 4, 16), crystal, root, 0, 3.3, 0, false);
  return { root, crystal, ringA, ringB };
}

export function buildWell(): { root: THREE.Group; liquid: THREE.MeshLambertMaterial; runes: THREE.Mesh } {
  const root = new THREE.Group();
  const stone = mat(COL.stone, { map: propTexture('brick') });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const b = mesh(box(0.75, 0.55, 0.35), stone, root, Math.cos(a) * 1.05, 0.28, Math.sin(a) * 1.05);
    b.rotation.y = -a + Math.PI / 2;
  }
  const liquid = uniqueMat(0x9a5cff, { emissive: 0x8a3cff, ei: 1.0 });
  const disc = mesh(cyl(0.95, 0.95, 0.1, 12), liquid, root, 0, 0.42, 0, false);
  disc.receiveShadow = false;
  for (const a of [0.6, 2.7, 4.8]) mesh(cyl(0.12, 0.15, 1.6, 6), stone, root, Math.cos(a) * 1.35, 0.8, Math.sin(a) * 1.35);
  const runes = new THREE.Mesh(plane(3.6, 3.6), new THREE.MeshBasicMaterial({ map: runeTexture(1), color: 0xb36bff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
  runes.rotation.x = -Math.PI / 2;
  runes.position.y = 0.04;
  root.add(runes);
  return { root, liquid, runes };
}

export function buildChest(): { root: THREE.Group; lid: THREE.Group; glow: THREE.MeshLambertMaterial } {
  const root = new THREE.Group();
  const wood = mat(0x8a5a32, { map: propTexture('wood') });
  mesh(box(1.0, 0.55, 0.65), wood, root, 0, 0.28, 0);
  mesh(box(1.04, 0.08, 0.69), mat(COL.gold), root, 0, 0.5, 0);
  const lid = new THREE.Group();
  lid.position.set(0, 0.56, -0.32);
  root.add(lid);
  mesh(box(1.0, 0.25, 0.65), wood, lid, 0, 0.12, 0.32);
  mesh(box(0.16, 0.2, 0.05), mat(COL.gold), root, 0, 0.45, 0.34);
  const glow = uniqueMat(0xffd84a, { emissive: 0xffc02a, ei: 0.8 });
  mesh(box(0.9, 0.04, 0.55), glow, root, 0, 0.57, 0, false);
  return { root, lid, glow };
}

export function buildCatalyst(): { root: THREE.Group; gem: THREE.Mesh; mat: THREE.MeshLambertMaterial; rings: THREE.Object3D[] } {
  const root = new THREE.Group();
  const stone = mat(COL.stone, { map: propTexture('brick') });
  mesh(cyl(1.4, 1.7, 0.5, 8), stone, root, 0, 0.25, 0);
  mesh(cyl(0.9, 1.1, 0.4, 8), stone, root, 0, 0.7, 0);
  const m = uniqueMat(0x7fd8ff, { emissive: 0x3fb8ff, ei: 1.3 });
  const gem = mesh(octa(0.9), m, root, 0, 2.4, 0);
  gem.scale.set(0.8, 1.5, 0.8);
  const rings: THREE.Object3D[] = [];
  for (let i = 0; i < 2; i++) {
    const r = mesh(torus(1.3 + i * 0.3, 0.05, 4, 18), m, root, 0, 2.4, 0, false);
    rings.push(r);
  }
  return { root, gem, mat: m, rings };
}

export function buildCage(): { root: THREE.Group; door: THREE.Object3D; prisoner: THREE.Group } {
  const root = new THREE.Group();
  const bar = mat(0x4a4d52);
  mesh(box(2.0, 0.15, 2.0), bar, root, 0, 0.07, 0);
  mesh(box(2.0, 0.12, 2.0), bar, root, 0, 2.2, 0);
  for (let i = 0; i < 16; i++) {
    const side = Math.floor(i / 4), k = (i % 4) / 3 - 0.5;
    const x = side === 0 ? k * 1.9 : side === 1 ? 0.95 : side === 2 ? -k * 1.9 : -0.95;
    const z = side === 0 ? 0.95 : side === 1 ? k * 1.9 : side === 2 ? -0.95 : -k * 1.9;
    if (side === 0 && (i % 4 === 1 || i % 4 === 2)) continue;
    mesh(cyl(0.04, 0.04, 2.1, 4), bar, root, x, 1.1, z, false);
  }
  const door = new THREE.Group();
  door.position.set(-0.32, 0, 0.95);
  root.add(door);
  for (const x of [0.2, 0.44]) mesh(cyl(0.04, 0.04, 2.1, 4), bar, door, x, 1.1, 0, false);
  const p = buildMage(0x9cffd8, 0x5a3d8a, 0x3d6b5a);
  p.root.scale.setScalar(0.85);
  p.orb.visible = false;
  root.add(p.root);
  return { root, door, prisoner: p.root };
}

export function buildPortal(): { root: THREE.Group; disc: THREE.MeshBasicMaterial; blocks: THREE.MeshLambertMaterial } {
  // The "sun gate" archway from the reference: a ring of stone blocks around a glowing disc.
  const root = new THREE.Group();
  const stone = mat(0xe8e2d4);
  const blocks = uniqueMat(0xd8b84a, { emissive: 0x8a6a10, ei: 0.3 });
  mesh(box(4.8, 0.4, 1.6), stone, root, 0, 0.2, 0);
  mesh(box(4.2, 0.3, 1.3), mat(0xcfc9ba), root, 0, 0.5, 0);
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const b = mesh(box(0.6, 0.6, 0.6), i % 3 === 0 ? blocks : stone, root, Math.cos(a) * 1.9, 2.55 + Math.sin(a) * 1.9, 0);
    b.rotation.z = a;
  }
  const disc = new THREE.MeshBasicMaterial({ color: 0x8a6a2a, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  const d = new THREE.Mesh(new THREE.CircleGeometry(1.65, 20), disc);
  d.position.set(0, 2.55, 0);
  root.add(d);
  return { root, disc, blocks };
}

export function buildWatchtower(): THREE.Group {
  const root = new THREE.Group();
  const wood = mat(0x7a5634, { map: propTexture('wood') });
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) mesh(box(0.18, 3.2, 0.18), wood, root, x, 1.6, z);
  mesh(box(2.6, 0.2, 2.6), wood, root, 0, 3.2, 0);
  for (const [x, z, w, d] of [[0, -1.25, 2.6, 0.1], [0, 1.25, 2.6, 0.1], [-1.25, 0, 0.1, 2.6], [1.25, 0, 0.1, 2.6]]) mesh(box(w, 0.7, d), mat(COL.sand, { map: propTexture('sandbag') }), root, x, 3.6, z);
  for (const [x, z] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) mesh(box(0.1, 1.3, 0.1), wood, root, x, 4.3, z, false);
  mesh(box(2.9, 0.15, 2.9), mat(0x4d5832), root, 0, 5.0, 0);
  return root;
}

export function buildSearchlight(): { root: THREE.Group; head: THREE.Group; beam: THREE.Mesh } {
  const root = new THREE.Group();
  mesh(cyl(0.4, 0.5, 0.4, 8), mat(COL.steelDark), root, 0, 0.2, 0);
  mesh(cyl(0.08, 0.08, 1.2, 6), mat(COL.steel), root, 0, 0.9, 0);
  const head = new THREE.Group();
  head.position.set(0, 1.6, 0);
  root.add(head);
  const lamp = mesh(cyl(0.35, 0.3, 0.5, 10), mat(COL.steel), head, 0, 0, 0);
  lamp.rotation.x = Math.PI / 2 - 0.5;
  mesh(cyl(0.3, 0.3, 0.05, 10), mat(0xfff6c8, { emissive: 0xfff0a0, ei: 2 }), head, 0, -0.12, 0.24, false).rotation.x = Math.PI / 2 - 0.5;
  const beamGeo = new THREE.ConeGeometry(2.2, 9, 12, 1, true);
  beamGeo.translate(0, -4.5, 0);
  const beam = new THREE.Mesh(beamGeo, glowMat(0xfff2b0, 0.09));
  beam.rotation.x = -(Math.PI / 2 - 0.5) - Math.PI / 2 + Math.PI;
  beam.rotation.x = Math.PI / 2 + 0.5;
  head.add(beam);
  return { root, head, beam };
}

export function buildIsland(seed: number, size = 4): THREE.Group {
  const root = new THREE.Group();
  const rock = mat(0x6a5568);
  const rock2 = mat(0x564458);
  const grass = mat(0x6bab42);
  const r = size;
  mesh(cyl(r, r * 0.9, 0.6, 7), grass, root, 0, 0, 0);
  mesh(cone(r * 0.92, r * 1.6, 7), rock, root, 0, -r * 0.8 - 0.3, 0).rotation.x = Math.PI;
  mesh(cone(r * 0.4, r * 0.9, 5), rock2, root, r * 0.3, -r * 1.5, 0.2).rotation.x = Math.PI;
  const rnd = (i: number) => {
    const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  const n = 1 + Math.floor(rnd(1) * 3);
  for (let i = 0; i < n; i++) {
    const a = rnd(i + 2) * Math.PI * 2, d = rnd(i + 5) * r * 0.6;
    if (rnd(i + 9) < 0.6) {
      const t = buildTreeMesh(0.7 + rnd(i) * 0.4, rnd(i + 3));
      t.position.set(Math.cos(a) * d, 0.3, Math.sin(a) * d);
      root.add(t);
    } else {
      const c = mesh(octa(0.5), mat(COL.crystal, { emissive: 0x8a3cff, ei: 0.8 }), root, Math.cos(a) * d, 0.9, Math.sin(a) * d);
      c.scale.set(0.6, 1.8, 0.6);
    }
  }
  return root;
}

export function buildTreeMesh(scale: number, tone: number): THREE.Group {
  const t = new THREE.Group();
  t.scale.setScalar(scale);
  mesh(cyl(0.18, 0.26, 1.4, 6), mat(0x5e4024), t, 0, 0.7, 0);
  const greens = [0x4f8f35, 0x5ea23e, 0x6ab248, 0x45802f];
  const c0 = greens[Math.floor(tone * 4) % 4];
  mesh(ico(1.1, 0), mat(c0), t, 0, 2.0, 0);
  mesh(ico(0.8, 0), mat(greens[(Math.floor(tone * 4) + 1) % 4]), t, 0.6, 1.7, 0.3);
  mesh(ico(0.75, 0), mat(greens[(Math.floor(tone * 4) + 2) % 4]), t, -0.55, 1.8, -0.2);
  return t;
}

export function buildWreck(kind: 'jeep' | 'truck'): THREE.Group {
  const root = new THREE.Group();
  const burnt = mat(0x3a3530);
  const olive = mat(0x4a5233);
  if (kind === 'jeep') {
    mesh(box(1.8, 0.7, 3.2), olive, root, 0, 0.6, 0);
    mesh(box(1.6, 0.5, 1.2), burnt, root, 0, 1.15, -0.4);
    for (const [x, z] of [[-0.9, -1.1], [0.9, -1.1], [-0.9, 1.1], [0.9, 1.1]]) mesh(cyl(0.35, 0.35, 0.3, 8), mat(0x1e1e1e), root, x, 0.35, z).rotation.z = Math.PI / 2;
  } else {
    mesh(box(2.4, 1.6, 2.0), olive, root, 0, 1.0, 2.2);
    mesh(box(2.5, 1.9, 4.2), burnt, root, 0, 1.15, -0.8);
    mesh(box(2.6, 0.1, 4.4), mat(0x2f3522), root, 0, 2.15, -0.8);
    for (const [x, z] of [[-1.15, 2.2], [1.15, 2.2], [-1.15, -1.8], [1.15, -1.8]]) mesh(cyl(0.45, 0.45, 0.35, 8), mat(0x1e1e1e), root, x, 0.45, z).rotation.z = Math.PI / 2;
  }
  return root;
}

export function buildHangar(w: number, d: number): THREE.Group {
  const root = new THREE.Group();
  const wall = mat(0x6e737b, { map: propTexture('metal') });
  const roof = mat(0x4d5359);
  mesh(box(w, 4.2, 0.4), wall, root, 0, 2.1, -d / 2);
  mesh(box(0.4, 4.2, d), wall, root, -w / 2, 2.1, 0);
  mesh(box(0.4, 4.2, d), wall, root, w / 2, 2.1, 0);
  const rf = mesh(box(w + 0.6, 0.3, d + 0.4), roof, root, 0, 4.35, 0);
  rf.receiveShadow = true;
  mesh(box(w * 0.5, 0.6, 0.1), mat(0xd9b23a, { map: propTexture('hazard') }), root, 0, 3.8, d / 2 + 0.2, false);
  return root;
}

// ------------------------------------------------------------------ instanced prop part definitions

export interface PartDef {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  m: THREE.Matrix4;
  castShadow: boolean;
  receiveShadow: boolean;
}

const M4 = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
  const m = new THREE.Matrix4();
  m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  return m;
};

const part = (geo: THREE.BufferGeometry, m: THREE.Material, mm: THREE.Matrix4, cast = true, recv = false): PartDef => ({ geo, mat: m, m: mm, castShadow: cast, receiveShadow: recv });

function jerseyGeo(): THREE.BufferGeometry {
  return g('jersey', () => {
    const s = new THREE.Shape();
    s.moveTo(-0.32, 0); s.lineTo(0.32, 0); s.lineTo(0.22, 0.25); s.lineTo(0.13, 0.95); s.lineTo(-0.13, 0.95); s.lineTo(-0.22, 0.25); s.lineTo(-0.32, 0);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 1.9, bevelEnabled: false });
    geo.translate(0, 0, -0.95);
    geo.rotateY(Math.PI / 2);
    return geo;
  });
}

/** Parts for each instanced prop kind; instance transforms are applied on top. */
export function propParts(kind: string): PartDef[] {
  switch (kind) {
    case 'sandbag': {
      const m = mat(0xffffff, { map: propTexture('sandbag') });
      return [part(box(1.0, 0.4, 0.6), m, M4(0, 0.2, 0)), part(box(0.95, 0.38, 0.5), m, M4(0.08, 0.58, 0.02, 0, 0.05))];
    }
    case 'concrete':
      return [part(jerseyGeo(), mat(0xffffff), M4()), part(box(1.9, 0.12, 0.42), mat(0xd9b23a, { map: propTexture('hazard') }), M4(0, 0.42, 0), false)];
    case 'crate':
      return [part(box(1, 1, 1), mat(0xffffff, { map: propTexture('wood') }), M4(0, 0.5, 0))];
    case 'ammo':
      return [part(box(1.4, 0.85, 0.95), mat(0xffffff, { map: propTexture('crate') }), M4(0, 0.425, 0))];
    case 'barrel':
      return [
        part(cyl(0.36, 0.36, 0.95, 10), mat(0xffffff), M4(0, 0.475, 0)),
        part(cyl(0.375, 0.375, 0.07, 10), mat(0x2a2a2a), M4(0, 0.3, 0), false),
        part(cyl(0.375, 0.375, 0.07, 10), mat(0x2a2a2a), M4(0, 0.7, 0), false),
      ];
    case 'tree':
      return [
        part(cyl(0.18, 0.26, 1.4, 6), mat(0x5e4024), M4(0, 0.7, 0)),
        part(ico(1.1, 0), mat(0xffffff), M4(0, 2.0, 0)),
        part(ico(0.8, 0), mat(0xffffff), M4(0.6, 1.7, 0.3, 0, 0.6)),
        part(ico(0.75, 0), mat(0xffffff), M4(-0.55, 1.85, -0.25, 0.3, 0.2)),
      ];
    case 'pine':
      return [
        part(cyl(0.15, 0.2, 1.0, 5), mat(0x5e4024), M4(0, 0.5, 0)),
        part(cone(1.0, 1.6, 7), mat(0xffffff), M4(0, 1.6, 0)),
        part(cone(0.75, 1.3, 7), mat(0xffffff), M4(0, 2.4, 0)),
      ];
    case 'bush':
      return [part(ico(0.7, 0), mat(0xffffff), M4(0, 0.45, 0, 0, 0, 0, 1, 0.75, 1)), part(ico(0.5, 0), mat(0xffffff), M4(0.45, 0.35, 0.2, 0, 0, 0, 1, 0.8, 1))];
    case 'pyramid':
      return [part(cone(0.5, 0.55, 4), mat(0xffffff), M4(0, 0.27, 0, 0, Math.PI / 4))];
    case 'rock':
      return [part(ico(0.7, 0), mat(0xffffff), M4(0, 0.35, 0, 0, 0, 0, 1, 0.7, 1))];
    case 'pylon': {
      const stripe = new THREE.MeshLambertMaterial({ color: 0xffffff, map: stripeTexture(), flatShading: true });
      return [
        part(box(0.26, 1.2, 0.26), mat(0xdedad0), M4(0, 0.6, 0)),
        part(box(0.5, 0.25, 0.5), stripe, M4(0, 1.3, 0)),
        part(box(0.3, 0.1, 0.3), mat(0xdedad0), M4(0, 1.47, 0), false),
      ];
    }
    case 'pillar':
      return [part(cyl(0.45, 0.5, 1, 8), mat(0xffffff, { map: propTexture('brick') }), M4(0, 0.5, 0)), part(box(1.2, 0.3, 1.2), mat(COL.stone), M4(0, 0.15, 0))];
    case 'wall':
      return [part(box(1, 1, 1), mat(0xffffff), M4(0, 0.5, 0), true, true)];
    case 'crystal':
      return [
        part(octa(0.5), mat(0xffffff, { emissive: 0x7a2cff, ei: 0.9 }), M4(0, 0.9, 0, 0, 0, 0.1, 0.55, 1.9, 0.55)),
        part(octa(0.35), mat(0xffffff, { emissive: 0x7a2cff, ei: 0.9 }), M4(0.4, 0.55, 0.15, 0.3, 0, -0.5, 0.5, 1.5, 0.5)),
        part(octa(0.3), mat(0xffffff, { emissive: 0x7a2cff, ei: 0.9 }), M4(-0.35, 0.45, -0.1, -0.2, 0, 0.6, 0.5, 1.4, 0.5)),
      ];
    case 'spire':
      return [part(cone(0.8, 5.5, 6), mat(0xffffff, { emissive: 0x6a2cd8, ei: 0.7 }), M4(0, 2.75, 0)), part(cone(0.45, 3, 6), mat(0xffffff, { emissive: 0x6a2cd8, ei: 0.7 }), M4(0.8, 1.4, 0.3, 0, 0, -0.35))];
    case 'grass':
      return [
        part(cone(0.07, 0.42, 3), mat(0xffffff), M4(0, 0.2, 0, 0, 0, 0.2), false),
        part(cone(0.06, 0.34, 3), mat(0xffffff), M4(0.1, 0.16, 0.06, 0.25, 0, -0.3), false),
        part(cone(0.06, 0.3, 3), mat(0xffffff), M4(-0.08, 0.15, -0.05, -0.3, 0, 0.1), false),
      ];
    case 'wire':
      return [
        part(torus(0.3, 0.025, 3, 8), mat(0x8a8d92), M4(0, 0.3, 0, 0, Math.PI / 2), false),
        part(torus(0.3, 0.025, 3, 8), mat(0x8a8d92), M4(0.35, 0.3, 0, 0, Math.PI / 2 + 0.3), false),
        part(box(0.06, 0.7, 0.06), mat(0x5a4a3a), M4(0.17, 0.35, 0), false),
      ];
    case 'fence':
      return [part(box(0.1, 1.3, 0.1), mat(0x6b6e74), M4(-0.95, 0.65, 0)), part(box(2.0, 0.05, 0.04), mat(0x8a8d92), M4(0, 1.1, 0), false), part(box(2.0, 0.05, 0.04), mat(0x8a8d92), M4(0, 0.6, 0), false)];
    case 'lamp':
      return [part(box(0.12, 2.6, 0.12), mat(0x3a3e45), M4(0, 1.3, 0)), part(box(0.4, 0.15, 0.25), mat(0xfff0b0, { emissive: 0xffe08a, ei: 1.5 }), M4(0, 2.6, 0.1), false)];
    case 'flower':
      return [part(box(0.12, 0.12, 0.12), mat(0xffffff, { emissive: 0x111111, ei: 1 }), M4(0, 0.14, 0), false), part(box(0.04, 0.12, 0.04), mat(0x4f8a34), M4(0, 0.05, 0), false)];
    default:
      return [part(box(1, 1, 1), mat(0xff00ff), M4(0, 0.5, 0))];
  }
}

let stripeTex: THREE.Texture | null = null;
function stripeTexture(): THREE.Texture {
  if (stripeTex) return stripeTex;
  const c = document.createElement('canvas');
  c.width = 8; c.height = 8;
  const g2 = c.getContext('2d') as CanvasRenderingContext2D;
  for (let x = 0; x < 8; x++) {
    g2.fillStyle = Math.floor(x / 2) % 2 ? '#e8e2d6' : '#c23a2e';
    g2.fillRect(x, 0, 1, 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  stripeTex = t;
  return t;
}
