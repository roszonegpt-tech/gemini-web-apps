// Builds a level from levels/*.json: painted pixel ground, floating-island cliffs,
// instanced props with colliders and hit points, interactables, hazards, structures,
// zone gates and tactical cover points for the Vanguard AI.
import * as THREE from 'three';
import type { LevelData, PropData } from '../config/types';
import { CF } from '../core/Physics';
import { GoliathTank, ShieldPylon } from '../entities/Boss';
import {
  AmmoDepot, AntiMagicSmoke, ArcaneChest, BarbedWire, Catalyst, CatalystAwaken, ExitPortal, Gate, Generator, LaserTripwire,
  ManaWell, PortalBeam, PrisonCage, RadioJammer, RiftAnchor, RiftHazard, Searchlight,
} from '../entities/Interactables';
import type { Prop, World } from '../scenes/World';
import { Rng, hashString } from '../utils/rng';
import { buildHangar, buildIsland, buildWatchtower, buildWreck, mat } from '../utils/models';
import { canvasTexture, paintGround, propTexture, runeTexture } from '../utils/textures';

const DEG = Math.PI / 180;

const PROP_HP: Record<string, number> = { sand: 90, wood: 70, concrete: 320, metal: 420, barrel: 25, crystal: 50 };

export function buildLevel(w: World): void {
  const L = w.level;
  const [W, H] = L.size;
  const rng = new Rng(hashString(L.id));

  // ---- ground
  const groundCanvas = paintGround(L);
  w.groundCanvas = groundCanvas;
  const groundTex = canvasTexture(groundCanvas);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshLambertMaterial({ map: groundTex }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(W / 2, 0, H / 2);
  ground.receiveShadow = true;
  w.scene.add(ground);
  w.disposables.push(ground.geometry, ground.material as THREE.Material, groundTex);

  // ---- floating-landmass cliffs
  const cliffTex = propTexture('cliff');
  const cliffMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(L.theme.cliff), map: cliffTex });
  const depth = 7;
  const addCliff = (x: number, z: number, w2: number, d2: number) => {
    const g = new THREE.BoxGeometry(w2, depth, d2);
    const m = new THREE.Mesh(g, cliffMat);
    m.position.set(x, -depth / 2 - 0.01, z);
    m.receiveShadow = true;
    w.scene.add(m);
    w.disposables.push(g);
  };
  addCliff(W / 2, H / 2, W, H);
  for (let i = 0; i < 26; i++) {
    const side = i % 4;
    const t = rng.next();
    const x = side === 0 ? t * W : side === 1 ? W : side === 2 ? t * W : 0;
    const z = side === 0 ? 0 : side === 1 ? t * H : side === 2 ? H : t * H;
    const r = rng.range(2, 5);
    const g = new THREE.ConeGeometry(r, rng.range(6, 14), 6);
    const c = new THREE.Mesh(g, cliffMat);
    c.rotation.x = Math.PI;
    c.position.set(x, -depth - 2, z);
    w.scene.add(c);
    w.disposables.push(g);
  }
  w.disposables.push(cliffMat);

  // ---- props
  for (const p of L.props) {
    try {
      buildProp(w, p, rng);
    } catch (err) {
      console.warn('[level] failed to build prop', p, err);
    }
  }

  // ---- zone gates
  for (const z of L.zones) {
    if (z.gate) w.gates.push(new Gate(w, z.gate.type, z.gate.a, z.gate.b));
  }

  // link boss pylons
  const tank = w.actors.find((a) => a instanceof GoliathTank) as GoliathTank | undefined;
  if (tank) tank.pylons = w.actors.filter((a) => a instanceof ShieldPylon) as ShieldPylon[];

  w.props.finalize();
  w.nav.rebuild(w.phys);
  buildCoverPoints(w);
}

function zoneAt(w: World, x: number, z: number): number {
  const zs = w.level.zones;
  for (let i = 0; i < zs.length; i++) {
    const [x0, z0, x1, z1] = zs[i].rect;
    if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return i;
  }
  return -1;
}

function addProp(w: World, kind: string, material: Prop['material'], x: number, z: number, ry: number, sx: number, sy: number, sz: number, color: number, collider: 'circle' | 'box' | null, cr: number, flags: number, hw = 0, hd = 0): Prop {
  const handle = w.props.add(kind, x, 0, z, ry, sx, sy, sz, color);
  const hp = PROP_HP[material] || 9999;
  const prop: Prop = {
    isProp: true, kind, material, x, z, hp, maxHp: hp, handle, collider: null, destroyed: false, burning: 0, color, sy,
    colliders: [],
  };
  if (collider === 'circle') prop.colliders.push(w.phys.addCircle(x, z, cr, flags, prop));
  else if (collider === 'box') prop.colliders.push(w.phys.addBox(x, z, hw, hd, flags, prop));
  prop.collider = prop.colliders[0] || null;
  w.propsList.push(prop);
  return prop;
}

const SHADES = {
  foliage: [0x5ea23e, 0x4f8f35, 0x6ab248, 0x58993a, 0x77bd4f],
  pine: [0x3f7a3a, 0x4a8a44, 0x356b33],
  grass: [0x6bab42, 0x7ab84b, 0x5e9c3b, 0x8ccf5a, 0x4f8a34],
  stone: [0xb2adc4, 0xa8a4bc, 0x9d98b3],
  crystal: [0xb07bff, 0xc79bff, 0x9a62ff],
  flowers: [0xff8ad8, 0xffe14a, 0xffffff, 0x9ad8ff, 0xff6a5a],
};

function buildProp(w: World, p: PropData, rng: Rng): void {
  const x = p.x || 0, z = p.z || 0;
  const rot = (p.rot || 0) * DEG;
  const line = (spacing: number, fn: (x: number, z: number, ang: number) => void) => {
    const [ax, az] = p.a || [x, z];
    const [bx, bz] = p.b || [x, z];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / spacing));
    const ang = Math.atan2(bx - ax, bz - az);
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : (i + 0.5) / n;
      fn(ax + (bx - ax) * t, az + (bz - az) * t, ang);
    }
  };
  const scatter = (count: number, fn: (x: number, z: number) => void) => {
    const w2 = p.w || 10, d2 = p.d || 10;
    for (let i = 0; i < count; i++) fn(x + rng.next() * w2, z + rng.next() * d2);
  };
  switch (p.t) {
    // ------------------------------------------------ cover
    case 'sandbags':
      line(1.0, (px, pz, ang) => addProp(w, 'sandbag', 'sand', px, pz, ang + Math.PI / 2, 1, 1, 1, 0xffffff, 'circle', 0.52, CF.MOVE | CF.SHOT | CF.LOW));
      break;
    case 'sandbagRing': {
      const r = p.r || 2.5;
      const n = Math.max(6, Math.round((Math.PI * 2 * r) / 1.0));
      const gap = p.gap !== undefined ? p.gap * DEG : -999;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        if (Math.abs(Math.atan2(Math.sin(a - gap), Math.cos(a - gap))) < 0.5) continue;
        addProp(w, 'sandbag', 'sand', x + Math.sin(a) * r, z + Math.cos(a) * r, a + Math.PI / 2, 1, 1, 1, 0xffffff, 'circle', 0.52, CF.MOVE | CF.SHOT | CF.LOW);
      }
      break;
    }
    case 'barriers':
      line(2.0, (px, pz, ang) => {
        const pr = addProp(w, 'concrete', 'concrete', px, pz, ang + Math.PI / 2, 1, 1, 1, 0xa5a29a, null, 0, 0);
        const ox = Math.sin(ang) * 0.5, oz = Math.cos(ang) * 0.5;
        pr.colliders.push(w.phys.addCircle(px + ox, pz + oz, 0.45, CF.MOVE | CF.SHOT | CF.LOW, pr));
        pr.colliders.push(w.phys.addCircle(px - ox, pz - oz, 0.45, CF.MOVE | CF.SHOT | CF.LOW, pr));
        pr.collider = pr.colliders[0];
      });
      break;
    case 'crate':
      addProp(w, 'crate', 'wood', x, z, rot, 1, 1, 1, 0xffffff, 'box', 0, CF.MOVE | CF.SHOT | CF.LOW, 0.5, 0.5);
      break;
    case 'crates': {
      const n = p.n || 3;
      for (let i = 0; i < n; i++) {
        const cx = x + (i % 2) * 1.05, cz = z + Math.floor(i / 2) * 1.05;
        addProp(w, 'crate', 'wood', cx, cz, 0, 1, 1, 1, 0xffffff, 'box', 0, CF.MOVE | CF.SHOT | CF.LOW, 0.5, 0.5);
      }
      break;
    }
    case 'ammo':
      addProp(w, 'ammo', 'metal', x, z, Math.abs(rot) > 0.1 ? Math.PI / 2 : 0, 1, 1, 1, 0xffffff, 'box', 0, CF.MOVE | CF.SHOT | CF.LOW, Math.abs(rot) > 0.1 ? 0.48 : 0.7, Math.abs(rot) > 0.1 ? 0.7 : 0.48);
      break;
    case 'barrel':
      addProp(w, 'barrel', 'barrel', x, z, rng.next() * 6, 1, 1, 1, 0xc23a2e, 'circle', 0.4, CF.MOVE | CF.SHOT | CF.LOW);
      break;
    case 'barrels': {
      const n = p.n || 3;
      for (let i = 0; i < n; i++) addProp(w, 'barrel', 'barrel', x + (i % 2) * 0.85, z + Math.floor(i / 2) * 0.85 + (i % 2) * 0.3, rng.next() * 6, 1, 1, 1, 0xc23a2e, 'circle', 0.4, CF.MOVE | CF.SHOT | CF.LOW);
      break;
    }
    case 'crystal':
      addProp(w, 'crystal', 'crystal', x, z, rng.next() * 6, 1, 1, 1, rng.pick(SHADES.crystal), 'circle', 0.6, CF.MOVE | CF.SHOT | CF.LOW);
      break;
    case 'rock':
      addProp(w, 'rock', 'stone', x, z, rng.next() * 6, p.r || 1, (p.r || 1) * rng.range(0.8, 1.2), p.r || 1, rng.pick(SHADES.stone), 'circle', 0.62 * (p.r || 1), CF.MOVE | CF.SHOT | CF.LOW);
      break;
    case 'wreck': {
      const kind = p.mat === 'truck' ? 'truck' : 'jeep';
      const g = buildWreck(kind);
      g.position.set(x, 0, z);
      g.rotation.y = rot;
      g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      w.scene.add(g);
      const turned = Math.abs(Math.sin(rot)) > 0.7;
      const hw = kind === 'truck' ? 1.3 : 0.95, hd = kind === 'truck' ? 3.2 : 1.65;
      const pr: Prop = { isProp: true, kind: 'wreck', material: 'metal', x, z, hp: 9999, maxHp: 9999, handle: null, collider: null, destroyed: false, burning: 0, color: 0, sy: 1, colliders: [] };
      pr.colliders.push(w.phys.addBox(x, z, turned ? hd : hw, turned ? hw : hd, CF.MOVE | CF.SHOT | (kind === 'truck' ? CF.SIGHT : CF.LOW), pr));
      pr.collider = pr.colliders[0];
      w.propsList.push(pr);
      break;
    }
    // ------------------------------------------------ walls & structures
    case 'wall': {
      const [ax, az] = p.a || [x, z];
      const [bx, bz] = p.b || [x, z];
      const h = p.h || 2.6;
      const th = p.d || 0.8;
      const cx = (ax + bx) / 2, cz = (az + bz) / 2;
      const horiz = Math.abs(bx - ax) >= Math.abs(bz - az);
      const len = Math.max(Math.abs(bx - ax), Math.abs(bz - az)) || 1;
      const color = p.mat === 'concrete' ? 0x8f8d86 : p.mat === 'metal' ? 0x6e737b : p.mat === 'wood' ? 0x7a5634 : 0x9a95ad;
      w.props.add('wall', cx, 0, cz, 0, horiz ? len : th, h, horiz ? th : len, color);
      const flags = CF.MOVE | CF.SHOT | (h > 1.4 ? CF.SIGHT : CF.LOW) | (h > 3 ? CF.FLY : 0);
      w.phys.addBox(cx, cz, horiz ? len / 2 : th / 2, horiz ? th / 2 : len / 2, flags, null);
      break;
    }
    case 'bunker': {
      const bw = p.w || 8, bd = p.d || 6, h = p.h || 2.2;
      const door = p.door || 's';
      const sides: [number, number, number, number, string][] = [
        [x - bw / 2, z - bd / 2, x + bw / 2, z - bd / 2, 'n'],
        [x - bw / 2, z + bd / 2, x + bw / 2, z + bd / 2, 's'],
        [x - bw / 2, z - bd / 2, x - bw / 2, z + bd / 2, 'w'],
        [x + bw / 2, z - bd / 2, x + bw / 2, z + bd / 2, 'e'],
      ];
      for (const [ax, az, bx, bz, side] of sides) {
        if (side === door) {
          const mx = (ax + bx) / 2, mz = (az + bz) / 2;
          const gap = 1.6;
          const horiz = az === bz;
          buildProp(w, { t: 'wall', a: [ax, az], b: horiz ? [mx - gap, mz] : [mx, mz - gap], h, mat: 'concrete' }, rng);
          buildProp(w, { t: 'wall', a: horiz ? [mx + gap, mz] : [mx, mz + gap], b: [bx, bz], h, mat: 'concrete' }, rng);
        } else {
          buildProp(w, { t: 'wall', a: [ax, az], b: [bx, bz], h, mat: 'concrete' }, rng);
        }
      }
      break;
    }
    case 'hangar': {
      const hw = p.w || 14, hd = p.d || 10;
      const g = buildHangar(hw, hd);
      g.position.set(x, 0, z);
      g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      w.scene.add(g);
      w.phys.addBox(x, z, hw / 2 + 0.3, hd / 2 + 0.2, CF.MOVE | CF.SHOT | CF.SIGHT | CF.FLY, null);
      break;
    }
    case 'tower': {
      const g = buildWatchtower();
      g.position.set(x, 0, z);
      g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; } });
      w.scene.add(g);
      for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) w.phys.addCircle(x + ox, z + oz, 0.2, CF.MOVE, null);
      w.towers.push({ x, z });
      break;
    }
    case 'pillar': {
      const h = p.h || 3;
      addProp(w, 'pillar', 'stone', x, z, rng.next(), 1, h, 1, 0xffffff, 'circle', 0.5, CF.MOVE | CF.SHOT | (h > 1.4 ? CF.SIGHT : CF.LOW) | (h > 3 ? CF.FLY : 0));
      break;
    }
    case 'pillars':
      {
        const [ax, az] = p.a || [x, z];
        const [bx, bz] = p.b || [x, z];
        const n = p.n || 3;
        for (let i = 0; i < n; i++) {
          const t = n === 1 ? 0.5 : i / (n - 1);
          buildProp(w, { t: 'pillar', x: ax + (bx - ax) * t, z: az + (bz - az) * t, h: (p.h || 3) * rng.range(0.55, 1.1) }, rng);
        }
      }
      break;
    case 'spire':
      addProp(w, 'spire', 'stone', x, z, rng.next() * 6, p.r || 1, (p.r || 1) * rng.range(0.8, 1.3), p.r || 1, rng.pick(SHADES.crystal), 'circle', 0.8 * (p.r || 1), CF.MOVE | CF.SHOT | CF.SIGHT | CF.FLY);
      break;
    case 'archway': {
      for (const s of [-1, 1]) buildProp(w, { t: 'pillar', x: x + Math.cos(rot) * s * 2.2, z: z - Math.sin(rot) * s * 2.2, h: 4.2 }, rng);
      w.props.add('wall', x, 4.2, z, rot, 5.4, 0.7, 1.0, 0x9a95ad);
      break;
    }
    case 'fence':
      line(2.0, (px, pz, ang) => {
        addProp(w, 'fence', 'metal', px, pz, ang + Math.PI / 2, 1, 1, 1, 0xffffff, null, 0, 0);
      });
      {
        const [ax, az] = p.a || [x, z];
        const [bx, bz] = p.b || [x, z];
        w.phys.addBox((ax + bx) / 2, (az + bz) / 2, Math.max(0.1, Math.abs(bx - ax) / 2), Math.max(0.1, Math.abs(bz - az) / 2), CF.MOVE, null);
      }
      break;
    // ------------------------------------------------ hazards
    case 'wire': {
      line(0.75, (px, pz, ang) => { w.props.add('wire', px, 0, pz, ang + Math.PI / 2, 1, 1, 1); });
      const [ax, az] = p.a || [x, z];
      const [bx, bz] = p.b || [x, z];
      w.hazards.push(new BarbedWire(ax, az, bx, bz));
      break;
    }
    case 'tripwire': {
      const [ax, az] = p.a || [x, z];
      const [bx, bz] = p.b || [x, z];
      w.hazards.push(new LaserTripwire(w, ax, az, bx, bz));
      break;
    }
    case 'smoke': {
      const s = new AntiMagicSmoke(x, z, p.r || 4);
      w.hazards.push(s);
      w.smokes.push(s);
      break;
    }
    case 'riftHazard':
      w.hazards.push(new RiftHazard(w, x, z, p.r || 3));
      break;
    case 'beam':
      w.hazards.push(new PortalBeam(w, x, z, p.r || 10, (p.n || 1) * 0.25));
      break;
    case 'searchlight':
      w.hazards.push(new Searchlight(w, x, z, rot));
      break;
    // ------------------------------------------------ decor
    case 'tree':
      addProp(w, rng.next() < 0.25 ? 'pine' : 'tree', 'stone', x, z, rng.next() * 6, p.r || 1, p.r || 1, p.r || 1, rng.pick(SHADES.foliage), 'circle', 0.45 * (p.r || 1), CF.MOVE);
      break;
    case 'trees':
      scatter(p.n || 6, (px, pz) => {
        const s = rng.range(0.8, 1.3);
        const pine = p.mat === 'pine' || (p.mat !== 'round' && rng.next() < 0.2);
        addProp(w, pine ? 'pine' : 'tree', 'stone', px, pz, rng.next() * 6, s, s, s, rng.pick(pine ? SHADES.pine : SHADES.foliage), 'circle', 0.45 * s, CF.MOVE);
      });
      break;
    case 'bushes':
      scatter(p.n || 6, (px, pz) => {
        const s = rng.range(0.7, 1.3);
        w.props.add('bush', px, 0, pz, rng.next() * 6, s, s, s, rng.pick(SHADES.foliage));
      });
      break;
    case 'grass':
      scatter(p.n || 40, (px, pz) => {
        const s = rng.range(0.7, 1.4);
        w.props.add('grass', px, 0, pz, rng.next() * 6, s, s * rng.range(0.8, 1.3), s, rng.pick(SHADES.grass));
      });
      break;
    case 'flowers':
      scatter(p.n || 20, (px, pz) => { w.props.add('flower', px, 0, pz, 0, 1, 1, 1, rng.pick(SHADES.flowers)); });
      break;
    case 'pyramids':
      line(p.n ? Math.hypot(((p.b || [0, 0])[0] - (p.a || [0, 0])[0]), ((p.b || [0, 0])[1] - (p.a || [0, 0])[1])) / p.n : 2.2, (px, pz) => {
        const s = rng.range(0.85, 1.25);
        addProp(w, 'pyramid', 'stone', px + rng.range(-0.3, 0.3), pz + rng.range(-0.3, 0.3), rng.range(-0.3, 0.3), s, s, s, rng.pick(SHADES.stone), 'circle', 0.4 * s, CF.MOVE | CF.SHOT | CF.LOW);
      });
      break;
    case 'pylon':
      addProp(w, 'pylon', 'stone', x, z, rot, 1, 1, 1, 0xffffff, 'circle', 0.22, CF.MOVE);
      break;
    case 'lamp':
      w.props.add('lamp', x, 0, z, rot, 1, 1, 1);
      w.phys.addCircle(x, z, 0.15, CF.MOVE, null);
      w.lamps.push({ x, z });
      break;
    case 'glyph': {
      const r = p.r || 3;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: runeTexture(p.n || 0), color: 0xb36bff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = rot;
      m.position.set(x, 0.04, z);
      w.scene.add(m);
      w.glyphs.push(m);
      break;
    }
    case 'pool': {
      const r = p.r || 4;
      const mana = !!p.mana;
      const water = new THREE.Mesh(new THREE.CircleGeometry(r, 28), mana
        ? mat(0x6a3cc8, { emissive: 0x5a2cb8, ei: 0.7, transparent: true, opacity: 0.88 })
        : mat(0x234f7a, { transparent: true, opacity: 0.92 }));
      water.rotation.x = -Math.PI / 2;
      water.position.set(x, 0.05, z);
      water.receiveShadow = true;
      w.scene.add(water);
      const foam = new THREE.Mesh(new THREE.RingGeometry(r - 0.25, r, 28), new THREE.MeshBasicMaterial({ color: mana ? 0xd9b8ff : 0xdff3ff, transparent: true, opacity: 0.6, depthWrite: false }));
      foam.rotation.x = -Math.PI / 2;
      foam.position.set(x, 0.06, z);
      w.scene.add(foam);
      w.pools.push({ x, z, r, mana, foam });
      if (!mana) w.phys.addCircle(x, z, r - 0.4, CF.MOVE, null);
      break;
    }
    case 'island': {
      const g = buildIsland(hashString(`${x},${z}`), p.r || 4);
      const y = p.h || 9;
      g.position.set(x, y, z);
      g.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
      w.scene.add(g);
      w.islands.push({ obj: g, baseY: y, phase: rng.next() * 6 });
      break;
    }
    // ------------------------------------------------ interactables & structures
    case 'well':
      w.interactables.push(new ManaWell(w, x, z));
      break;
    case 'chest':
      w.interactables.push(new ArcaneChest(w, x, z, p.loot || 'mixed', rot));
      break;
    case 'anchor':
      w.interactables.push(new RiftAnchor(w, x, z, p.tag || null));
      break;
    case 'depot':
      w.interactables.push(new AmmoDepot(w, x, z, p.tag || null));
      break;
    case 'generator':
      w.interactables.push(new Generator(w, x, z, p.tag || null));
      break;
    case 'cage':
      w.interactables.push(new PrisonCage(w, x, z, p.tag || null));
      break;
    case 'portal': {
      const ep = new ExitPortal(w, x, z);
      w.interactables.push(ep);
      w.exitPortal = ep;
      break;
    }
    case 'jammer': {
      const j = new RadioJammer(w, x, z, p.tag || null);
      j.zone = zoneAt(w, x, z);
      w.addActor(j);
      break;
    }
    case 'catalyst': {
      const c = new Catalyst(w, x, z, p.tag || null);
      c.zone = zoneAt(w, x, z);
      w.addActor(c);
      w.allies.push(c);
      w.interactables.push(new CatalystAwaken(c, p.n || 60));
      break;
    }
    case 'shieldPylon': {
      const s = new ShieldPylon(w, x, z);
      s.tag = p.tag || 'pylon';
      s.zone = zoneAt(w, x, z);
      w.addActor(s);
      break;
    }
    case 'goliath': {
      const t = new GoliathTank(w, x, z);
      t.tag = p.tag || 'goliath';
      t.zone = zoneAt(w, x, z);
      w.addActor(t);
      w.tank = t;
      break;
    }
    default:
      console.warn('[level] unknown prop type', p.t);
  }
}

/** Candidate cover positions next to low cover, used by soldier AI. */
function buildCoverPoints(w: World): void {
  const seen = new Set<string>();
  for (const c of w.phys.all) {
    if (!(c.flags & CF.LOW) || (c.flags & CF.SIGHT)) continue;
    const r = (c.shape === 'circle' ? c.r : Math.max(c.hw, c.hd)) + 0.75;
    const n = c.shape === 'circle' ? 6 : 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      let px: number, pz: number;
      if (c.shape === 'circle') {
        px = c.x + Math.cos(a) * r;
        pz = c.z + Math.sin(a) * r;
      } else {
        px = c.x + Math.max(-1, Math.min(1, Math.cos(a) * 1.5)) * (c.hw + 0.75);
        pz = c.z + Math.max(-1, Math.min(1, Math.sin(a) * 1.5)) * (c.hd + 0.75);
      }
      const key = `${Math.round(px / 1.3)},${Math.round(pz / 1.3)}`;
      if (seen.has(key)) continue;
      if (!w.phys.circleFree(px, pz, 0.45, CF.MOVE)) continue;
      if (!w.nav.walkable(px, pz)) continue;
      seen.add(key);
      w.coverPoints.push({ x: px, z: pz, cx: c.x, cz: c.z, owner: null });
    }
  }
}
