'use strict';
// Moss & Moon — per-region visual config (owner: WORLD). Loaded BEFORE baseline.js: pure data + build
// functions that only run later, called by src/systems/world-render.js. Never touch baseline globals here.
//
// Each region: { name, tint, shadow:[r,g,b], side, skirt, backdrop, fog, ambient, foliage, terrain(x,y,c), build(B,c) }
//   terrain(x,y,c) -> tile family for tile (x,y) (centre x+.5,y+.5). Families = MM.art tile bases
//                     (grass_grove, grass_wild, forest_moss, path_dirt, cobble, crypt_flag, snow, ice,
//                      swamp_mud, swamp_bog, water, soil_dry, soil_wet). Procedural fallbacks exist for all.
//   build(B,c)      -> places props / interactables / NPCs / decals / scatter. Builder API (see world-render.js):
//      B.p(sprite, x, y, opts)   prop. opts: k kind (tree|bush|rock|house|...; picks fallback art + collision),
//                                flip, r (collision radius, tiles), rect [x0,y0,x1,y1], low (broom flies over),
//                                tall (fades when covering the player), sway, smoke [[dx,dy]], lights [{dx,dy,r,color,flicker,night}]
//      B.i(id, x, y, {prompt, r, kind})   interactable (E). ids match MM.CAMPAIGN_DATA.interactions where they exist.
//      B.npc(id, x, y, {name})   villager (procedural sprite unless MM.art has 'npc_<id>'); also an interactable.
//      B.decal(sprite, x, y, {water})     flat sprite baked into the ground cache (water:true → drawn in the water pass)
//      B.garland(x1,y1,z1, x2,y2,z2, {kind:'bunting'|'lanterns'})   hanging decoration
//      B.reserve(x, y, r)        keep scatter away from this spot
//      B.scatter({s:[names], n, zone:'back'|'front'|'rim'|'inner'|'shore'|'any', on:[families], avoid, k, minL, maxL, decal})
//   c = {L restoration 0..4, mw moonwell 0..3, restored(id), h(x,y,n) hash 0..1, noise(x,y,scale,seed) 0..1,
//        dist(x,y,polyline) tile distance, near(x,y,polylines,w), floor, blocks (dungeon blocks), region}
window.MM = window.MM || {};
(function (MM) {
  const R = {};
  const SPAWN = [9.7, 10];
  // Default exterior buildings (used until/unless MM.BUILDINGS has placements for the region). Sizes follow the
  // player-derived unit: witch ≈ 39 px tall/24 px wide → door 26×54 px (≥1.35× height), walls 66 px, windows 14×16.
  const DOOR = { w: 26, h: 54 }, WIN = { w: 14, h: 16, z: 26 };
  const win = (face, at, o) => Object.assign({ face, at }, WIN, o || {});
  // building(id, x, y, o): x,y = front ground corner (tile coords); o: fw, fd, name, type, spec (painter spec), door {face, at},
  // enterable, lockedReason, interior, smoke, art (sprite name used instead of the painter when MM.art has it)
  const bld = (id, x, y, o) => Object.assign({ id, x, y, enterable: true }, o);
  MM.WORLD_BUILDINGS_DEFAULT = {
    grove: (c) => {
      const L = c.L, base = { fw: 4, fd: 3, wh: 66, rh: 40, door: Object.assign({ face: 'L', at: 24 }, DOOR), windows: [win('L', 50), win('R', 24)], chimney: { at: 44 } };
      const st = [
        { wall: 'plank', roofColor: 'moss', ruined: true, weather: 0.9, shuttered: true, steps: 1 },
        { wall: 'plank', roofColor: 'shingle', weather: 0.5, steps: 2 },
        { wall: 'plaster', roofColor: 'shingle', weather: 0.3, steps: 2 },
        { wall: 'plaster', roofColor: 'shingle', weather: 0.15, flowerBoxes: true, porch: { depth: 10 } },
        { wall: 'plaster', roofColor: 'shingle', weather: 0.1, flowerBoxes: true, ivy: 0.6, porch: { depth: 10 } },
      ][L];
      return [bld('cottage', 7.4, 5.2, { type: 'cottage_home', name: 'the cottage', fw: 4, fd: 3, interior: 'cottage', smoke: L >= 2, litWindows: L >= 1, spec: Object.assign({}, base, st, { seed: 11 }) })];
    },
    village: () => [
      bld('elder_house', 6.8, 6.4, { type: 'elder_house', name: "Elder Marrow's house", fw: 4, fd: 3, interior: 'elder_house', smoke: true, litWindows: true,
        spec: { fw: 4, fd: 3, wh: 66, rh: 42, wall: 'plaster', roofColor: 'red', door: Object.assign({ face: 'L', at: 26 }, DOOR), windows: [win('L', 52), win('R', 22)], steps: 2, weather: 0.15, flowerBoxes: true, seed: 21, chimney: { at: 40 } } }),
      bld('village_shop', 15.6, 5.2, { type: 'village_shop', name: "Pip's shop", fw: 3.5, fd: 3, interior: 'village_shop', smoke: true, litWindows: true,
        spec: { fw: 3.5, fd: 3, wh: 66, rh: 40, wall: 'stone', roofColor: 'violet', door: Object.assign({ face: 'L', at: 22 }, DOOR), windows: [win('L', 44), win('R', 24)], awning: { stripes: ['v', 'c'] }, steps: 2, weather: 0.2, seed: 22, chimney: { at: 34 } } }),
      bld('herbalist_house', 5.6, 15.8, { type: 'herbalist_house', name: "Wren's cottage", fw: 3.5, fd: 3, interior: 'herbalist_house', smoke: true, litWindows: true,
        spec: { fw: 3.5, fd: 3, wh: 66, rh: 38, wall: 'log', roof: 'thatch', door: Object.assign({ face: 'R', at: 22 }, DOOR), windows: [win('L', 28), win('R', 42, { w: 10 })], porch: { depth: 9 }, ivy: 0.5, flowerBoxes: true, weather: 0.3, seed: 23, chimney: { at: 20 } } }),
      bld('mill_shed', 17.6, 15.0, { type: 'shed', name: 'the old mill shed', fw: 2.5, fd: 2, enterable: false, lockedReason: 'The shed is barred shut. Pip says the miller took the key to the coast.', smoke: false,
        spec: { fw: 2.5, fd: 2, wh: 60, rh: 30, wall: 'plank', roofColor: 'slate', locked: true, door: Object.assign({ face: 'R', at: 16 }, DOOR), windows: [win('L', 20, { w: 12 })], steps: 1, weather: 0.6, seed: 24, chimney: false } }),
    ],
  };

  // ------------------------------------------------------------------ homestead (restoration 0..4)
  const G_PATHS = [
    [[5.9, 6.1], [5.9, 8.6], [9.6, 8.6]],          // cottage door -> yard
    [[9.6, 8.6], [9.6, 20.5]],                      // lane south (travel board)
    [[9.6, 8.6], [12.2, 7.4], [13.2, 6.9]],         // to the Moonwell
  ];
  const pond = (x, y) => ((x - 18.2) / 3.1) ** 2 + ((y - 1.6) / 2.5) ** 2 < 1;
  R.grove = {
    name: 'Moonflower Grove', tint: null, shadow: [36, 56, 42], side: 'side_earth',
    skirt: { a: '#5c4634', b: '#3f3029', drip: 'roots', dripColor: '#6f8a5a' },
    backdrop: { top: '#b9d3a6', bottom: '#6e9372', motif: 'canopy', far: '#86a983', near: '#5f8566', haze: '#e3edd0' },
    fog: { color: '#f1f5e1', alpha: 0.10, count: 3 },
    ambient: [{ kind: 'pollen', n: 18 }, { kind: 'fireflies', n: [3, 6, 10, 16, 24] }],
    foliage: 'leafy',
    tintByLevel: ['rgba(92,96,84,.22)', 'rgba(92,100,84,.12)', 'rgba(100,110,90,.05)', null, null],
    terrain(x, y, c) {
      const cx = x + 0.5, cy = y + 0.5, L = c.L;
      if (pond(cx, cy)) return 'water';
      if (c.near(cx, cy, G_PATHS, 0.62)) return (L === 0 && c.noise(cx, cy, 1.3, 3) < 0.38) ? 'grass_wild' : 'path_dirt';
      const dw = Math.hypot(cx - 13.6, cy - 6.0);
      if (dw < 1.9) return L >= 2 || c.h(x, y, 9) < 0.45 + L * 0.2 ? 'cobble' : 'grass_wild';
      const wild = [0.98, 0.72, 0.46, 0.24, 0.07][L];
      return c.noise(cx, cy, 3.4, 7) < wild ? 'grass_wild' : 'grass_grove';
    },
    build(B, c) {
      const L = c.L;
      B.reserve(SPAWN[0], SPAWN[1], 1.3); B.reserve(12, 9, 0.9); // spawn + training dummy
      B.reserve(8, 11.5, 2.0);                                   // garden plots 7..9 x 11..12
      // Moonwell (state = campaign moonwell level, else derived from restoration)
      const mwS = ['moonwell_dark', 'moonwell_faint', 'moonwell_glow', 'moonwell_restored'][c.mw];
      B.p(mwS, 13.6, 6.2, { k: 'moonwell', r: 0.85, moonwell: c.mw,
        lights: c.mw ? [{ dx: 0, dy: -10, r: [0, 34, 60, 90][c.mw] + (L >= 4 ? 20 : 0), color: c.mw >= 3 ? '#c9f3ff' : '#b9a6e6', flicker: 0.08, night: false, kind: 'moonwell' }] : null });
      B.i('moonwell', 13.6, 7.0, { prompt: 'Visit the Moonwell', r: 1.5, kind: 'moonwell' });
      // garden: soil beds under the six plots + fence on the back/left (front gets a gate gap)
      for (let i = 0; i < 6; i++) B.decal(L >= 1 ? 'soil_wet' : 'soil_dry', 7 + (i % 3), 11 + Math.floor(i / 3), { tile: true });
      const brk = (i) => L === 0 && (i % 2 === 0) ? '_broken' : '';
      [7, 8, 9].forEach((x, i) => { if (L > 0 || i !== 1) B.p('fence_x' + brk(i), x, 10.25, { k: 'fence', low: true }); });
      [11, 12].forEach((y, i) => B.p('fence_y' + brk(i + 1), 6.25, y, { k: 'fence', low: true }));
      if (L >= 1) { B.p('fence_x', 7, 12.75, { k: 'fence', low: true }); B.p('fence_x', 8, 12.75, { k: 'fence', low: true }); B.p('fence_y', 9.75, 11, { k: 'fence', low: true }); }
      if (L >= 1) B.p('scarecrow', 6.0, 13.5, { k: 'scarecrow', r: 0.2, tall: true });
      B.p('barrel', 10.5, 12.7, { k: 'barrel', r: 0.25, low: true });
      B.i('seed_barrel', 10.5, 12.7, { prompt: 'Check the seed barrel', r: 1.1, kind: 'seeds' });
      B.p('bucket', 10.2, 11.6, { k: 'bucket', low: true });
      if (L >= 1) B.p('compost', 5.3, 10.6, { k: 'crate', r: 0.3, low: true });
      if (L >= 2) B.p('sack', 10.9, 12.2, { k: 'sack', low: true });
      // brewing corner by the cottage
      B.p('cauldron', 7.9, 6.9, { k: 'cauldron', r: 0.32, low: true, lights: [{ dx: 0, dy: -4, r: 18, color: '#ff9a52', flicker: 0.5, night: false, kind: 'fire' }] });
      B.i('cauldron', 7.9, 6.9, { prompt: 'Brew at the cauldron', r: 1.1, kind: 'brew' });
      if (L >= 1) { B.p('alchemy_table', 9.0, 5.9, { k: 'table', r: 0.4, low: true }); B.i('alchemy_table', 9.0, 5.9, { prompt: 'Use the alchemy table', r: 1.0, kind: 'craft' }); }
      B.p('broom_stand', 7.9, 4.1, { k: 'broom_stand', r: 0.2 });
      B.i('broom_stand', 7.9, 4.1, { prompt: 'Broom stand', r: 1.0, kind: 'broom' });
      B.p('woodpile', 3.7, 6.3, { k: 'woodpile', r: 0.3, low: true });
      B.p('@mailbox', 10.9, 7.6, { k: 'mailbox', r: 0.15 });
      B.i('mailbox', 10.9, 7.6, { prompt: 'Check the mailbox', r: 0.9, kind: 'mail' });
      B.p('signpost', 10.7, 17.4, { k: 'signpost', r: 0.2 });
      B.i('travel_board', 10.7, 17.4, { prompt: 'Travel', r: 1.3, kind: 'travel' });
      // lamps & decorations appear as the homestead is restored
      if (L >= 2) { B.p('lamp_post', 10.7, 9.0, { k: 'lamp', r: 0.12, lights: [{ dx: 0, dy: -30, r: 34, color: '#ffe0a0', flicker: 0.2, night: true, kind: 'lamp' }] });
        B.p('lamp_post', 8.6, 15.2, { k: 'lamp', r: 0.12, lights: [{ dx: 0, dy: -30, r: 34, color: '#ffe0a0', flicker: 0.2, night: true, kind: 'lamp' }] }); }
      if (L >= 3) { B.p('lamp_post', 12.6, 8.4, { k: 'lamp', r: 0.12, lights: [{ dx: 0, dy: -30, r: 34, color: '#ffe0a0', flicker: 0.2, night: true, kind: 'lamp' }] });
        B.p('bench', 12.0, 11.4, { k: 'bench', r: 0.35, low: true });
        B.garland(7.4, 5.2, 62, 10.7, 9.0, 30, { kind: 'lanterns' }); }
      if (L >= 1) B.p('lantern', 4.6, 5.8, { k: 'lantern', lights: [{ dx: 0, dy: -8, r: 20, color: '#ffd27a', flicker: 0.3, night: true, kind: 'lantern' }] });
      if (L >= 4) { B.p('pumpkin', 6.1, 14.2, { k: 'pumpkin', low: true }); B.p('pumpkin', 5.5, 13.0, { k: 'pumpkin', low: true }); }
      // pond dressing
      B.p('tree_willow', 14.7, 1.3, { k: 'tree', r: 0.35, tall: true, sway: true });
      B.p('tree_willow', 19.0, 5.2, { k: 'tree', r: 0.35, tall: true, sway: true, flip: true });
      B.scatter({ s: ['reeds_0', 'reeds_1'], n: 6, zone: 'shore', avoid: 0.7, k: 'reeds', sway: true });
      B.scatter({ s: ['lilypad'], n: 5, on: ['water'], decal: true, water: true, avoid: 0.8 });
      // trees, bushes, overgrowth, flowers
      B.scatter({ s: ['tree_oak_0', 'tree_oak_1', 'tree_oak_2'], n: 15, zone: 'back', avoid: 1.5, k: 'tree', tall: true, sway: true });
      B.scatter({ s: ['tree_oak_1', 'tree_oak_2'], n: 4, zone: 'front', avoid: 2.4, k: 'tree', tall: true, sway: true });
      B.scatter({ s: L >= 3 ? ['bush_0', 'bush_1', 'bush_berry'] : ['bush_0', 'bush_1'], n: 10, zone: 'rim', avoid: 1.0, k: 'bush', sway: true });
      B.scatter({ s: ['bush_blight'], n: [6, 3, 0, 0, 0][L], zone: 'inner', avoid: 1.2, cluster: true, k: 'bush' });
      B.scatter({ s: ['grass_tall'], n: [26, 16, 8, 4, 2][L], zone: 'any', avoid: 0.7, cluster: true, k: 'grass', sway: true });
      B.scatter({ s: ['log', 'stump'], n: [4, 3, 2, 1, 1][L], zone: 'rim', avoid: 1.2, k: 'log', r: 0.3, low: true });
      B.scatter({ s: ['rock_moss', 'rock_0', 'rock_1'], n: 5, zone: 'any', avoid: 1.2, k: 'rock', r: 0.3, low: true });
      B.scatter({ s: ['flowers_wild'], n: [2, 6, 10, 14, 18][L], zone: 'any', avoid: 0.6, cluster: true, decal: true });
      B.scatter({ s: ['flowers_moon'], n: [0, 0, 3, 7, 12][L], zone: 'any', avoid: 0.6, cluster: true, decal: true });
      B.scatter({ s: ['mushroom_moon'], n: [0, 0, 1, 3, 6][L], zone: 'any', avoid: 0.9, k: 'mushroom', glow: L >= 3 ? '#c6aedb' : null });
      B.scatter({ s: ['mushroom_brown'], n: 3, zone: 'rim', avoid: 0.9, k: 'mushroom', decal: true });
    },
  };

  // ------------------------------------------------------------------ village hub
  const V_ROADS = [[[9.8, 9.8], [9.8, -0.5]], [[9.8, 9.8], [9.8, 20.5]], [[9.8, 9.8], [20.5, 9.8]], [[9.8, 9.8], [-0.5, 9.8]],
    [[5.2, 6.6], [7.2, 8.2]], [[13.4, 5.6], [12.2, 7.6]], [[5.6, 13.6], [7.4, 12.0]]];
  R.village = {
    name: 'Hollowbrook Village', tint: null, shadow: [44, 52, 40], side: 'side_stone',
    skirt: { a: '#6b6656', b: '#45423b', drip: 'roots', dripColor: '#7d9a66' },
    backdrop: { top: '#d7dfb8', bottom: '#8eac85', motif: 'roofs', far: '#a8bf98', near: '#7d9a78', haze: '#f1eedb' },
    fog: { color: '#fbf6e4', alpha: 0.06, count: 2 },
    ambient: [{ kind: 'petals', n: 14 }, { kind: 'fireflies', n: 8 }],
    foliage: 'bunting',
    terrain(x, y, c) {
      const cx = x + 0.5, cy = y + 0.5;
      const d = Math.hypot(cx - 9.8, cy - 9.8);
      if (d < 3.4 || (d < 3.9 && c.h(x, y, 4) < 0.5)) return 'cobble';
      if (c.near(cx, cy, V_ROADS, 0.7)) return 'path_dirt';
      return c.noise(cx, cy, 3, 21) < 0.28 ? 'grass_wild' : 'grass_grove';
    },
    build(B, c) {
      B.reserve(SPAWN[0], SPAWN[1], 1.4);
      const win = (dx, dy) => ({ dx, dy, r: 24, color: '#ffd98a', flicker: 0.15, night: true, kind: 'window' });
      // plaza
      B.p('well', 12.4, 7.8, { k: 'well', r: 0.55 }); B.i('well', 12.4, 7.8, { prompt: 'Draw water from the well', r: 1.0, kind: 'well' });
      B.p('@notice_board', 8.0, 7.0, { k: 'board', r: 0.25 }); B.i('notice_board', 8.0, 7.0, { prompt: 'Read the notice board', r: 1.1, kind: 'board' });
      B.npc('marrow', 8.9, 7.3, { name: 'Elder Marrow' });
      B.p('shop_stall', 13.9, 11.8, { k: 'stall', rect: [13.2, 11.3, 14.6, 12.2] }); B.i('shop', 13.6, 12.6, { prompt: "Browse Pip's stall", r: 1.1, kind: 'shop' });
      B.npc('pip', 13.2, 11.0, { name: 'Pip' });
      B.p('crate_stack', 15.0, 12.5, { k: 'crate', r: 0.3 }); B.p('barrel', 14.9, 10.6, { k: 'barrel', r: 0.25, low: true }); B.p('crate', 12.6, 13.1, { k: 'crate', r: 0.25, low: true });
      // Wren's herb corner by her cottage
      B.npc('wren', 7.0, 12.9, { name: 'Wren' });
      B.p('alchemy_table', 6.3, 12.0, { k: 'table', r: 0.4, low: true }); B.i('cauldron', 6.3, 12.0, { prompt: "Use Wren's brewing table", r: 1.0, kind: 'brew' });
      B.p('bush_berry', 4.4, 11.6, { k: 'bush', sway: true }); B.p('flowers_moon', 5.2, 11.2, { k: 'flowers' }); B.p('sack', 7.6, 13.9, { k: 'sack', low: true });
      B.decal('flowers_wild', 6.0, 11.0); B.decal('flowers_moon', 4.9, 12.6); B.decal('flowers_wild', 3.8, 12.2);
      // street furniture
      const lamp = { k: 'lamp', r: 0.12, lights: [{ dx: 0, dy: -30, r: 36, color: '#ffe0a0', flicker: 0.2, night: true, kind: 'lamp' }] };
      B.p('lamp_post', 7.2, 9.3, lamp); B.p('lamp_post', 12.5, 12.7, lamp); B.p('lamp_post', 12.4, 5.9, lamp); B.p('lamp_post', 7.0, 14.6, lamp);
      B.p('bench', 8.0, 12.6, { k: 'bench', r: 0.35, low: true }); B.p('bench', 11.6, 6.6, { k: 'bench', r: 0.35, low: true });
      B.p('barrel', 4.4, 7.4, { k: 'barrel', r: 0.25, low: true }); B.p('woodpile', 3.3, 6.9, { k: 'woodpile', low: true });
      B.p('pumpkin', 11.4, 13.4, { k: 'pumpkin', low: true });
      B.garland(6.8, 6.4, 62, 12.4, 5.9, 30, { kind: 'bunting' });
      B.garland(7.2, 9.3, 30, 12.5, 12.7, 30, { kind: 'lanterns' });
      B.p('signpost', 10.8, 17.6, { k: 'signpost', r: 0.2 }); B.i('travel_board', 10.8, 17.6, { prompt: 'Travel', r: 1.3, kind: 'travel' });
      B.p('fence_x', 15.6, 14.8, { k: 'fence', low: true }); B.p('fence_x', 16.6, 14.8, { k: 'fence', low: true }); B.p('fence_y', 15.1, 15.3, { k: 'fence', low: true });
      B.scatter({ s: ['tree_oak_0', 'tree_oak_1', 'tree_oak_2'], n: 12, zone: 'back', avoid: 1.6, k: 'tree', tall: true, sway: true });
      B.scatter({ s: ['tree_oak_0', 'tree_oak_2'], n: 3, zone: 'front', avoid: 2.5, k: 'tree', tall: true, sway: true });
      B.scatter({ s: ['bush_0', 'bush_1', 'bush_berry'], n: 10, zone: 'rim', avoid: 1.0, k: 'bush', sway: true });
      B.scatter({ s: ['flowers_wild', 'flowers_moon'], n: 12, zone: 'any', avoid: 0.7, cluster: true, decal: true });
      B.scatter({ s: ['grass_tall'], n: 5, zone: 'rim', avoid: 0.8, k: 'grass', sway: true });
    },
  };

  // ------------------------------------------------------------------ wild regions
  const TRAIL = [[[10.2, 20.5], [9.2, 15.5], [11.0, 11.5], [9.6, 7.5], [10.0, 3.4]]];
  const entrance = (B, s, label) => {
    B.reserve(10, 3.2, 1.7);
    B.p(s, 10.0, 2.4, { k: 'entrance', rect: [8.9, 1.4, 11.1, 2.6], tall: true, lights: [{ dx: 0, dy: -14, r: 40, color: '#b69be6', flicker: 0.25, night: false, kind: 'portal' }] });
    B.i('dungeon', 10.0, 3.2, { prompt: label, r: 1.3, kind: 'dungeon' });
    B.p('@waystone', 10.9, 17.4, { k: 'waystone', r: 0.25, lights: [{ dx: 0, dy: -18, r: 22, color: '#9fe8d8', flicker: 0.1, night: false, kind: 'rune' }] });
    B.i('travel_board', 10.9, 17.4, { prompt: 'Travel (waystone)', r: 1.3, kind: 'travel' });
    B.reserve(SPAWN[0], SPAWN[1], 1.6);
  };
  R.forest = {
    name: 'Blighted Forest', tint: 'rgba(52,44,64,.16)', shadow: [24, 30, 28], side: 'side_earth', dungeon: 'forest',
    skirt: { a: '#4a3a31', b: '#2b2422', drip: 'roots', dripColor: '#5a4a6a' },
    backdrop: { top: '#6b7558', bottom: '#2c3a2f', motif: 'deadtrees', far: '#46523f', near: '#2a3528', haze: '#8a8f74' },
    fog: { color: '#b9b4c8', alpha: 0.12, count: 5 },
    ambient: [{ kind: 'leaves', n: 16 }, { kind: 'spores', n: 8, color: '#b98fd8' }],
    foliage: 'thorn',
    terrain(x, y, c) {
      const cx = x + 0.5, cy = y + 0.5;
      if (c.near(cx, cy, TRAIL, c.h(x, y, 2) < 0.3 ? 0.9 : 0.62)) return 'path_dirt';
      const n = c.noise(cx, cy, 3, 31);
      if (n > (c.restored('forest') ? 0.45 : 0.74)) return 'grass_wild';
      return 'forest_moss';
    },
    build(B, c) {
      const ok = c.restored('forest');
      entrance(B, '@thorn_gate', 'Enter the Rootways');
      B.scatter({ s: ok ? ['tree_oak_0', 'tree_oak_1', 'tree_blighted'] : ['tree_blighted', 'tree_blighted', 'tree_blighted_small'], n: 18, zone: 'back', avoid: 1.5, k: 'tree', tall: true, sway: ok });
      B.scatter({ s: ok ? ['tree_oak_2', 'tree_blighted_small'] : ['tree_blighted', 'tree_blighted_small'], n: 7, zone: 'inner', avoid: 2.2, k: 'tree', tall: true });
      B.scatter({ s: ['tree_blighted_small', 'tree_blighted'], n: 4, zone: 'front', avoid: 2.4, k: 'tree', tall: true });
      B.scatter({ s: ok ? ['bush_0', 'bush_blight'] : ['bush_blight'], n: 12, zone: 'any', avoid: 1.0, k: 'bush' });
      B.scatter({ s: ['log', 'stump'], n: 6, zone: 'any', avoid: 1.3, k: 'log', r: 0.3, low: true });
      B.scatter({ s: ['rock_moss', 'rock_1'], n: 5, zone: 'any', avoid: 1.2, k: 'rock', r: 0.3, low: true });
      B.scatter({ s: ['mushroom_red', 'mushroom_brown'], n: 8, zone: 'any', avoid: 0.8, cluster: true, k: 'mushroom', decal: true });
      B.scatter({ s: ['mushroom_glow'], n: 3, zone: 'inner', avoid: 1.5, k: 'mushroom', glow: '#8ff0d0' });
      B.scatter({ s: ['grass_tall'], n: 8, zone: 'any', avoid: 0.8, k: 'grass', sway: true });
      if (ok) B.scatter({ s: ['flowers_wild'], n: 8, zone: 'any', avoid: 0.7, decal: true });
    },
  };
  R.swamp = {
    name: 'Whispering Swamp', tint: 'rgba(40,80,82,.14)', shadow: [20, 40, 42], side: 'side_earth', dungeon: 'swamp',
    skirt: { a: '#3e3b2a', b: '#22261f', drip: 'moss', dripColor: '#4f7a5e' },
    backdrop: { top: '#55766e', bottom: '#1f3534', motif: 'mistwater', far: '#3a5753', near: '#25403e', haze: '#9fbcb2' },
    fog: { color: '#cfe8dc', alpha: 0.16, count: 7 },
    ambient: [{ kind: 'spores', n: 18, color: '#8ff0d0' }, { kind: 'fireflies', n: 10, color: '#c8f59a' }],
    foliage: 'moss',
    terrain(x, y, c) {
      const cx = x + 0.5, cy = y + 0.5;
      if (c.near(cx, cy, TRAIL, 0.75)) return 'swamp_mud';
      const n = c.noise(cx, cy, 3.2, 41);
      if (n > 0.66 && Math.hypot(cx - 9.7, cy - 10) > 2) return 'water';
      if (n > 0.47) return 'swamp_bog';
      return c.noise(cx, cy, 2, 42) > 0.8 ? 'grass_wild' : 'swamp_mud';
    },
    build(B, c) {
      entrance(B, '@sunken_arch', 'Enter the Sunken Lanterns');
      B.scatter({ s: ['tree_willow'], n: 9, zone: 'back', avoid: 2.0, k: 'tree', tall: true, sway: true, on: ['swamp_mud', 'grass_wild'] });
      B.scatter({ s: ['tree_willow', 'tree_blighted_small'], n: 4, zone: 'inner', avoid: 2.6, k: 'tree', tall: true, sway: true, on: ['swamp_mud', 'grass_wild'] });
      B.scatter({ s: ['@pillar', '@pillar_broken'], n: 5, zone: 'any', avoid: 2.0, k: 'pillar', r: 0.3, on: ['swamp_mud', 'swamp_bog'] });
      B.scatter({ s: ['reeds_0', 'reeds_1'], n: 18, zone: 'shore', avoid: 0.6, cluster: true, k: 'reeds', sway: true });
      B.scatter({ s: ['lilypad'], n: 10, on: ['water'], decal: true, water: true, avoid: 0.7 });
      B.scatter({ s: ['bush_swamp'], n: 9, zone: 'any', avoid: 1.1, k: 'bush', sway: true, on: ['swamp_mud', 'grass_wild'] });
      B.scatter({ s: ['mushroom_glow'], n: 8, zone: 'any', avoid: 1.2, cluster: true, k: 'mushroom', glow: '#8ff0d0', on: ['swamp_mud', 'grass_wild', 'swamp_bog'] });
      B.scatter({ s: ['log'], n: 3, zone: 'any', avoid: 1.5, k: 'log', r: 0.3, low: true, on: ['swamp_mud'] });
      B.scatter({ s: ['rock_moss'], n: 4, zone: 'any', avoid: 1.3, k: 'rock', r: 0.3, low: true });
      B.p('lantern', 9.0, 15.0, { k: 'lantern', lights: [{ dx: 0, dy: -8, r: 22, color: '#b8f0c0', flicker: 0.35, night: false, kind: 'lantern' }] });
      B.p('lantern', 11.6, 7.0, { k: 'lantern', lights: [{ dx: 0, dy: -8, r: 22, color: '#b8f0c0', flicker: 0.35, night: false, kind: 'lantern' }] });
    },
  };
  R.mountain = {
    name: 'Frostpeak', tint: 'rgba(150,180,215,.10)', shadow: [64, 84, 118], side: 'side_snow', dungeon: 'mountain',
    skirt: { a: '#7d8aa0', b: '#4c566a', drip: 'icicles', dripColor: '#d6f1fb' },
    backdrop: { top: '#d5e6ef', bottom: '#8fb0c6', motif: 'peaks', far: '#b4cadb', near: '#90a9bf', haze: '#f4f9fb' },
    fog: { color: '#ffffff', alpha: 0.14, count: 5 },
    ambient: [{ kind: 'snow', n: 46 }],
    foliage: 'pine',
    terrain(x, y, c) {
      const cx = x + 0.5, cy = y + 0.5;
      if (c.near(cx, cy, TRAIL, 0.6) && c.h(x, y, 5) < 0.75) return 'path_dirt';
      const n = c.noise(cx, cy, 3.3, 51);
      if (n > 0.7) return 'ice';
      return 'snow';
    },
    build(B, c) {
      entrance(B, '@ice_cave', 'Enter the Rime Halls');
      B.scatter({ s: ['tree_pine_snow'], n: 17, zone: 'back', avoid: 1.4, k: 'pine', tall: true, sway: true, on: ['snow'] });
      B.scatter({ s: ['tree_pine_snow'], n: 6, zone: 'front', avoid: 2.0, k: 'pine', tall: true, on: ['snow'] });
      B.scatter({ s: ['tree_pine_snow'], n: 3, zone: 'inner', avoid: 3, k: 'pine', tall: true, on: ['snow'] });
      B.scatter({ s: ['rock_snow', 'rock_1'], n: 8, zone: 'any', avoid: 1.3, k: 'rock', r: 0.32, low: true });
      B.scatter({ s: ['ice_crystal_1', 'ice_crystal_0'], n: 8, zone: 'any', avoid: 1.6, k: 'crystal', r: 0.25, glow: '#a5d6d8' });
      B.scatter({ s: ['snow_mound'], n: 7, zone: 'any', avoid: 1.0, cluster: true, k: 'mound', decal: true, on: ['snow'] });
      B.scatter({ s: ['bush_snow'], n: 6, zone: 'rim', avoid: 1.0, k: 'bush', on: ['snow'] });
    },
  };
  R.crypt = {
    name: 'Old Crypt', tint: 'rgba(58,44,84,.24)', shadow: [26, 20, 36], side: 'side_crypt', dungeon: 'crypt',
    skirt: { a: '#45405a', b: '#221e2c', drip: 'roots', dripColor: '#4a4060' },
    backdrop: { top: '#4b4163', bottom: '#17141f', motif: 'stars', far: '#2c2640', near: '#1d1928', haze: '#6d5f8e' },
    fog: { color: '#c9bde6', alpha: 0.14, count: 6 },
    ambient: [{ kind: 'wisps', n: 12, color: '#c6aedb' }, { kind: 'embers', n: 8 }],
    foliage: 'web',
    terrain(x, y, c) {
      const cx = x + 0.5, cy = y + 0.5;
      if (c.near(cx, cy, TRAIL, 0.65) || Math.hypot(cx - 10, cy - 4) < 1.8) return 'crypt_flag';
      return c.noise(cx, cy, 2.8, 61) > 0.62 ? 'forest_moss' : 'grass_wild';
    },
    build(B, c) {
      entrance(B, '@mausoleum', 'Descend into the Long Dark');
      for (let row = 0; row < 3; row++) for (let i = 0; i < 4; i++) {
        const x = 4 + i * 1.5 + (row % 2) * 0.5, y = 5.2 + row * 2.6;
        if (c.h(i, row, 71) < 0.82) B.p('tombstone_' + Math.floor(c.h(i, row, 72) * 3), x, y, { k: 'tombstone', r: 0.22, low: true });
        if (c.h(i, row, 73) < 0.5) B.decal('grave_mound', x - 0.2, y + 0.55);
      }
      for (let row = 0; row < 2; row++) for (let i = 0; i < 3; i++) {
        const x = 13.5 + i * 1.6, y = 12 + row * 2.5;
        B.p('tombstone_' + Math.floor(c.h(i, row, 74) * 3), x, y, { k: 'tombstone', r: 0.22, low: true });
      }
      const br = { k: 'brazier', r: 0.2, lights: [{ dx: 0, dy: -20, r: 34, color: '#b48cff', flicker: 0.5, night: false, kind: 'fire' }] };
      B.p('brazier', 8.6, 4.4, br); B.p('brazier', 11.4, 4.4, br); B.p('brazier', 9.0, 14.2, br);
      B.scatter({ s: ['tree_crypt'], n: 12, zone: 'back', avoid: 1.8, k: 'tree', tall: true });
      B.scatter({ s: ['tree_crypt'], n: 3, zone: 'front', avoid: 2.6, k: 'tree', tall: true });
      B.scatter({ s: ['rock_crypt', 'rock_2'], n: 6, zone: 'any', avoid: 1.3, k: 'rock', r: 0.3, low: true });
      B.scatter({ s: ['fence_x_broken', 'fence_y_broken'], n: 6, zone: 'rim', avoid: 1.4, k: 'fence', low: true });
      B.scatter({ s: ['mushroom_moon'], n: 5, zone: 'any', avoid: 1.2, k: 'mushroom', glow: '#c6aedb' });
      B.scatter({ s: ['grass_tall'], n: 6, zone: 'any', avoid: 1, k: 'grass', sway: true });
    },
  };
  R.sky = {
    name: 'Starfall Island', tint: 'rgba(120,100,170,.14)', shadow: [44, 36, 70], side: 'side_stone', dungeon: 'crypt',
    skirt: { a: '#6f6890', b: '#3a3456', drip: 'crystals', dripColor: '#c6aedb' },
    backdrop: { top: '#8c7bb5', bottom: '#241f45', motif: 'stars', far: '#5a4f86', near: '#3a3263', haze: '#b6a7dc' },
    fog: { color: '#e9e1f7', alpha: 0.1, count: 4 },
    ambient: [{ kind: 'motes', n: 20, color: '#ebe1f7' }, { kind: 'fireflies', n: 10, color: '#fff3c4' }],
    foliage: 'none',
    terrain(x, y, c) {
      const cx = x + 0.5, cy = y + 0.5;
      if (Math.hypot(cx - 9.8, cy - 9.8) < 2.2) return 'cobble';
      return c.noise(cx, cy, 3, 81) > 0.6 ? 'grass_wild' : 'grass_grove';
    },
    build(B, c) {
      B.reserve(SPAWN[0], SPAWN[1], 1.8);
      B.p('@waystone', 10.9, 17.4, { k: 'waystone', r: 0.25, lights: [{ dx: 0, dy: -18, r: 22, color: '#9fe8d8', flicker: 0.1, night: false, kind: 'rune' }] });
      B.i('travel_board', 10.9, 17.4, { prompt: 'Travel (waystone)', r: 1.3, kind: 'travel' });
      B.scatter({ s: ['ice_crystal_1', 'ice_crystal_0'], n: 10, zone: 'any', avoid: 1.6, k: 'crystal', r: 0.25, glow: '#ebe1f7' });
      B.scatter({ s: ['flowers_moon'], n: 16, zone: 'any', avoid: 0.6, cluster: true, decal: true });
      B.scatter({ s: ['tree_oak_2', 'tree_willow'], n: 8, zone: 'back', avoid: 2, k: 'tree', tall: true, sway: true });
      B.scatter({ s: ['mushroom_moon'], n: 6, zone: 'any', avoid: 1, k: 'mushroom', glow: '#c6aedb' });
    },
  };

  // ------------------------------------------------------------------ tutorial sandbox (region id 'tutorial', TUTORIAL agent)
  // A tidy practice yard: grass, a fenced lane, a few trees. Buildings (the practice hut) come from MM.BUILDINGS placements;
  // the sign is interactable 'tutorial_sign'. Plots/dummy are drawn by the baseline/tutorial module.
  const T_PATHS = [[[9.7, 10.4], [9.7, 6.0]], [[9.7, 10.4], [13.2, 10.4]], [[9.7, 10.4], [7.0, 12.4]]];
  R.tutorial = {
    name: 'Practice Yard', tint: null, shadow: [36, 56, 42], side: 'side_earth',
    skirt: { a: '#5c4634', b: '#3f3029', drip: 'roots', dripColor: '#6f8a5a' },
    backdrop: { top: '#c3dab0', bottom: '#7a9d7a', motif: 'canopy', far: '#93b48d', near: '#6b8f6c', haze: '#eef3dc' },
    fog: { color: '#f1f5e1', alpha: 0.06, count: 2 }, ambient: [{ kind: 'pollen', n: 14 }], foliage: 'leafy',
    terrain(x, y, c) { const cx = x + 0.5, cy = y + 0.5; if (c.near(cx, cy, T_PATHS, 0.6)) return 'path_dirt'; return c.noise(cx, cy, 3, 99) < 0.2 ? 'grass_wild' : 'grass_grove'; },
    build(B, c) {
      B.reserve(9.7, 10, 1.6); B.reserve(8, 11.5, 2.0); B.reserve(12, 9, 1.0);
      B.p('signpost', 11.2, 9.0, { k: 'signpost', r: 0.2 }); B.i('tutorial_sign', 11.2, 9.0, { prompt: 'Read the sign', r: 1.2, kind: 'sign' });
      B.p('barrel', 6.2, 9.4, { k: 'barrel', r: 0.25, low: true }); B.p('bucket', 6.8, 9.0, { k: 'bucket', low: true });
      B.scatter({ s: ['tree_oak_0', 'tree_oak_1', 'tree_oak_2'], n: 12, zone: 'back', avoid: 1.6, k: 'tree', tall: true, sway: true });
      B.scatter({ s: ['bush_0', 'bush_1'], n: 8, zone: 'rim', avoid: 1.0, k: 'bush', sway: true, cluster: true });
      B.scatter({ s: ['flowers_wild'], n: 10, zone: 'any', avoid: 0.7, decal: true, cluster: true });
    },
  };

  // ------------------------------------------------------------------ dungeon floor themes
  // Blocks (baseline dungeonBlocks on even tiles) are drawn as themed walls by world-render.js.
  const D = {};
  D.forest = {
    name: 'Rootways', tint: 'rgba(28,22,36,.34)', shadow: [14, 16, 14], side: 'side_earth', dark: true,
    skirt: { a: '#3a2c26', b: '#1a1513', drip: 'roots', dripColor: '#4a3a52' },
    backdrop: { top: '#1d2119', bottom: '#0b0d0a', motif: 'roots', far: '#262b20', near: '#141711', haze: '#3a3f30' },
    fog: { color: '#a59ab8', alpha: 0.12, count: 5 }, ambient: [{ kind: 'spores', n: 14, color: '#b98fd8' }], foliage: 'roots',
    walls: ['bush_blight', 'tree_blighted_small', 'bush_blight'],
    terrain: (x, y, c) => c.noise(x, y, 2.5, 91 + c.floor) > 0.62 ? 'path_dirt' : 'forest_moss',
    decor: { s: ['mushroom_glow', 'mushroom_red', 'stump', 'log'], n: 10, glow: '#8ff0d0' },
  };
  D.swamp = {
    name: 'Sunken Lanterns', tint: 'rgba(18,40,46,.32)', shadow: [10, 22, 24], side: 'side_stone', dark: true,
    skirt: { a: '#3c4a4a', b: '#141e20', drip: 'moss', dripColor: '#3d6a55' },
    backdrop: { top: '#16292a', bottom: '#060d0e', motif: 'mistwater', far: '#1d3333', near: '#0f1d1e', haze: '#2f4c48' },
    fog: { color: '#bfe2d4', alpha: 0.16, count: 7 }, ambient: [{ kind: 'spores', n: 16, color: '#8ff0d0' }], foliage: 'moss',
    walls: ['@pillar', '@pillar_broken', 'rock_moss'],
    terrain: (x, y, c) => { const n = c.noise(x, y, 2.6, 93 + c.floor); return n > 0.68 ? 'swamp_bog' : n < 0.3 ? 'crypt_flag' : 'swamp_mud'; },
    decor: { s: ['reeds_1', 'mushroom_glow', 'lilypad'], n: 9, glow: '#8ff0d0' },
  };
  D.mountain = {
    name: 'Rime Halls', tint: 'rgba(40,60,100,.26)', shadow: [30, 44, 74], side: 'side_snow', dark: true,
    skirt: { a: '#5b6b86', b: '#232b3c', drip: 'icicles', dripColor: '#c2e6f5' },
    backdrop: { top: '#1d2638', bottom: '#090c14', motif: 'icicles', far: '#27324a', near: '#141a28', haze: '#4a5d80' },
    fog: { color: '#e6f5ff', alpha: 0.12, count: 5 }, ambient: [{ kind: 'snow', n: 18 }], foliage: 'icicles',
    walls: ['ice_crystal_1', 'rock_snow', 'ice_crystal_0'],
    terrain: (x, y, c) => c.noise(x, y, 2.5, 95 + c.floor) > 0.5 ? 'ice' : 'snow',
    decor: { s: ['ice_crystal_0', 'snow_mound', 'rock_snow'], n: 9, glow: '#a5d6d8' },
  };
  D.crypt = {
    name: 'Long Dark', tint: 'rgba(30,22,44,.34)', shadow: [12, 10, 18], side: 'side_crypt', dark: true,
    skirt: { a: '#34304a', b: '#0f0d16', drip: 'roots', dripColor: '#3a3450' },
    backdrop: { top: '#19152a', bottom: '#07060c', motif: 'stars', far: '#211c33', near: '#120f1c', haze: '#3b3355' },
    fog: { color: '#b9abd8', alpha: 0.12, count: 5 }, ambient: [{ kind: 'embers', n: 12 }, { kind: 'wisps', n: 6, color: '#c6aedb' }], foliage: 'web',
    walls: ['rock_crypt', '@crypt_block', 'tombstone_1'],
    terrain: (x, y, c) => 'crypt_flag',
    decor: { s: ['grave_mound', 'tombstone_2', 'brazier', 'mushroom_moon'], n: 8, glow: '#b48cff' },
  };
  D.rift = Object.assign({}, D.crypt, { name: 'Rift', tint: 'rgba(70,40,110,.30)', backdrop: { top: '#2a1846', bottom: '#09050f', motif: 'stars', far: '#3a2460', near: '#1a1030', haze: '#6a4aa0' } });

  MM.REGION_VISUALS = R;
  MM.DUNGEON_VISUALS = D;
})(window.MM);
