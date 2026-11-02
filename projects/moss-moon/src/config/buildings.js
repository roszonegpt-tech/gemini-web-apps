'use strict';
// Moss & Moon — MM.BUILDINGS: the single source of truth for building scale, exteriors, placements and interiors
// (owner: INTERIORS). Pure data + pure functions; loaded BEFORE baseline.js and never touches baseline globals at load.
// Consumers: WORLD (exterior painter/collision/door cues via MM.buildings.toWorld / footprintBlocks), INTERIORS
// (src/systems/interiors.js + interior-render.js), TUTORIAL (practice hut), CAMPAIGN (door targets).
// Math + conventions: notes/BUILDINGS.md.
//
// Coordinates: world tiles (x right-down, y left-down on screen; project(x,y) = ((x-y)*16, (x+y)*8)).
// A building footprint is [x0,y0]..[x1,y1]; its FRONT corner (x1,y1) is the bottom vertex on screen = sprite anchor.
// Face 'L' = wall at y=y1 (lower-left face, faces +y), face 'R' = wall at x=x1 (lower-right face, faces +x).
// Along a face, positions are "face px" measured from the front corner (16 face px per tile), exactly like the
// WORLD painter (src/systems/world-buildings.js) so its door/window rectangles line up with ours by construction.
window.MM = window.MM || {};
(function (MM) {
  // ================================================================== unit (everything derives from the player sprite)
  const TILE_W = 32, TILE_H = 16, FACE_PX = TILE_W / 2;          // 16 horizontal screen px per tile along a wall
  const ACROSS_PX = TILE_W / Math.SQRT2;                         // 22.63 screen px per world unit across the view
  // Measured from the witch atlas (idle+walk, all 8 directions; tests/interior-scale.js re-measures it): frame 48x56,
  // foot (24,49), visible height 40 px (walk 41), visible width 25..27 px.
  const PLAYER = { frameW: 48, frameH: 56, footX: 24, footY: 49, visibleH: 40, visibleW: 26, collisionR: 0.22 };
  PLAYER.worldW = +(PLAYER.visibleW / ACROSS_PX).toFixed(3);    // 1.149 world units (sprite envelope as an upright cylinder)
  const DOOR_MIN_H = Math.ceil(1.35 * PLAYER.visibleH);          // 54 px clear height
  const DOOR_MIN_W_SCREEN = 1.2 * PLAYER.visibleW;               // 31.2 px horizontal on screen
  const DOOR_MIN_W_WORLD = 1.2 * PLAYER.worldW;                  // 1.379 world units along the wall
  const q4 = (v) => Math.ceil(v * 4 - 1e-9) / 4;                 // round up to a quarter tile
  const DOOR_W_TILES = q4(Math.max(DOOR_MIN_W_SCREEN / FACE_PX, DOOR_MIN_W_WORLD)); // = 2.0 tiles (32 face px)
  const unit = {
    tileW: TILE_W, tileH: TILE_H, facePx: FACE_PX, acrossPx: +ACROSS_PX.toFixed(3), edgePx: +Math.hypot(16, 8).toFixed(3),
    player: PLAYER,
    // door: clear opening (inside the frame). w in face px; tiles = w/16. jamb = minimum wall left on either side.
    door: { w: DOOR_W_TILES * FACE_PX, h: DOOR_MIN_H, tiles: DOOR_W_TILES, minH: DOOR_MIN_H, minWScreen: DOOR_MIN_W_SCREEN, minWWorld: +DOOR_MIN_W_WORLD.toFixed(3),
      frame: 2, jamb: 0.4, recess: 0.3 },
    wall: { height: 66, plinth: 5, thickness: 0.25, cutaway: 12, lintel: 7 },   // eave = plinth + door + lintel = 66
    window: { w: 14, h: 16, sill: 26 },                                         // face px; head at 42 px < eave
    stairs: { rise: 3, run: 3 },                                                // px per step (painter: 3 px per step)
    porch: { depth: 10 },                                                       // face px (0.625 tile), walkable, never blocks
    roof: { overhang: 4, rise: { small: 30, medium: 38, large: 42 } },
    // interaction / spawn geometry (world tiles, along the door's outward normal)
    approach: 0.6, triggerOut: 0.8, spawnOut: 1.3, spawnIn: 0.9, exitIn: 0.2, reach: 0.95, enterCooldown: 0.6,
  };
  unit.wall.height = unit.wall.plinth + unit.door.h + unit.wall.lintel;          // 66

  // ================================================================== furniture size table
  // w,d = footprint tiles in the NATIVE facing (against the back wall y=0, front faces +y); rot:'y' = against the wall x=0,
  // front faces +x (dims swapped, sprite drawn mirrored). h = height px. Sprite anchor = front (bottom) vertex of the
  // footprint diamond, like buildings. sprite = preferred claude-pxl name(s); the first one MM.art has is used.
  const F = (w, d, h, o) => Object.assign({ w, d, h, solid: true }, o || {});
  const furniture = {
    bed: F(1.25, 2, 24, { sprite: ['int_bed'], mat: 'wood', cloth: '#5f9ca3' }),
    chest: F(1, 0.6, 16, { sprite: ['int_chest'], open: 'int_chest_open', mat: 'wood' }),
    hearth: F(1.75, 0.75, 62, { sprite: ['int_hearth'], mat: 'stone', light: { dz: 10, r: 70, color: '#ffb46a', flicker: 0.35 } }),
    bookcase: F(1.5, 0.5, 58, { sprite: ['int_bookcase'], mat: 'wood' }),
    wardrobe: F(1.25, 0.625, 60, { sprite: ['int_wardrobe'], mat: 'wood' }),
    rug: F(2.5, 1.75, 0, { solid: false, floor: true, sprite: ['int_rug'], cloth: '#8a4a40' }),
    rug_round: F(2, 1.5, 0, { solid: false, floor: true, sprite: ['int_rug_round'], cloth: '#4f4566' }),
    doormat: F(1.5, 0.5, 0, { solid: false, floor: true, sprite: ['int_doormat'], cloth: '#9a7444' }),
    table: F(1.5, 1, 20, { sprite: ['int_table'], mat: 'wood' }),
    worktable: F(1.5, 0.875, 22, { sprite: ['int_worktable'], mat: 'wood' }),
    chair: F(0.625, 0.625, 26, { sprite: ['int_chair'], mat: 'wood' }),
    stool: F(0.5, 0.5, 12, { sprite: ['int_stool'], mat: 'wood' }),
    armchair: F(0.875, 0.875, 30, { sprite: ['int_armchair'], cloth: '#7b4f7d', mat: 'wood' }),
    counter: F(3, 0.875, 24, { sprite: ['int_counter'], mat: 'wood' }),
    shelves: F(1.5, 0.5, 48, { sprite: ['int_shelves'], mat: 'wood' }),
    drying_rack: F(1.5, 0.4, 44, { sprite: ['int_drying_rack'], mat: 'wood' }),
    display_case: F(1, 0.625, 32, { sprite: ['int_display_case'], mat: 'wood' }),
    stove: F(0.75, 0.75, 34, { sprite: ['int_stove'], mat: 'iron', light: { dz: 8, r: 46, color: '#ffa860', flicker: 0.3 } }),
    plant: F(0.5, 0.5, 22, { sprite: ['int_plant'], mat: 'clay' }),
    // existing claude-pxl props (props.px.js), anchor bottom-centre == front vertex of a near-square footprint
    alchemy_table: F(1, 1, 28, { sprite: ['int_alchemy_table', 'alchemy_table'], mat: 'wood' }),
    cauldron: F(0.75, 0.75, 22, { sprite: ['int_cauldron', 'cauldron'], mat: 'iron', light: { dz: 4, r: 52, color: '#9cf0b4', flicker: 0.25 } }),
    barrel: F(0.5, 0.5, 18, { sprite: ['barrel'], mat: 'wood' }),
    crate: F(0.625, 0.625, 18, { sprite: ['crate'], mat: 'wood' }),
    crate_stack: F(0.75, 0.75, 28, { sprite: ['crate_stack'], mat: 'wood' }),
    sack: F(0.4, 0.4, 14, { sprite: ['sack'], mat: 'cloth', solid: false }),
    woodpile: F(0.75, 0.5, 16, { sprite: ['woodpile'], mat: 'wood' }),
    broom_stand: F(0.5, 0.5, 34, { sprite: ['broom_stand'], mat: 'wood' }),
    bucket: F(0.35, 0.35, 11, { sprite: ['bucket'], mat: 'wood', solid: false }),
    bench: F(1.25, 0.5, 24, { sprite: ['bench'], mat: 'wood' }),
  };
  // wall-mounted pieces (drawn on a back wall; never solid). w = face px along the wall, h px, z = bottom height px.
  const wallDecor = {
    window: { w: unit.window.w, h: unit.window.h, z: unit.window.sill, sprite: ['int_window'] },
    portrait: { w: 16, h: 20, z: 30, sprite: ['int_portrait'] },
    star_chart: { w: 22, h: 16, z: 32, sprite: ['int_star_chart'] },
    wall_shelf: { w: 24, h: 10, z: 34, sprite: ['int_wall_shelf'] },
    herbs_hanging: { w: 24, h: 14, z: 46, sprite: ['int_herbs_hanging'] },
    lesson_board: { w: 26, h: 18, z: 26, sprite: ['int_lesson_board'] },
    wall_lantern: { w: 8, h: 12, z: 40, sprite: ['int_wall_lantern', 'lantern'], light: { r: 40, color: '#ffd98a', flicker: 0.2 } },
  };

  // ================================================================== building types
  const win = (face, at, o) => Object.assign({ face, at }, o || {});
  const NPCS = { pip: 'Pip', wren: 'Wren', marrow: 'Elder Marrow' };
  const types = {
    cottage_home: {
      name: 'your cottage', fw: 5.5, fd: 4.5, enterable: true, interior: 'cottage_home', size: 'large',
      door: { face: 'L', at: 36 }, windows: [win('L', 70), win('R', 22), win('R', 52)], chimney: { at: 62 },
      paint: { wall: 'plaster', roofColor: 'shingle', steps: 2, seed: 11 },
      // exterior look by homestead restoration level 0..4 (merged over paint)
      levels: [
        { wall: 'plank', roofColor: 'moss', ruined: true, weather: 0.9, shuttered: true, steps: 1 },
        { wall: 'plank', roofColor: 'shingle', weather: 0.5, steps: 2 },
        { wall: 'plaster', roofColor: 'shingle', weather: 0.3, steps: 2 },
        { wall: 'plaster', roofColor: 'shingle', weather: 0.15, flowerBoxes: true, porch: { depth: 10 } },
        { wall: 'plaster', roofColor: 'shingle', weather: 0.1, flowerBoxes: true, ivy: 0.6, porch: { depth: 10 } },
      ],
      sprites: ['bld_cottage_home_<L>', 'bld_cottage_home'], smoke: (L) => L >= 2, litWindows: (L) => L >= 1,
    },
    village_shop: {
      name: "Pip's shop", fw: 5, fd: 4.5, enterable: true, interior: 'village_shop', npc: 'pip', size: 'medium',
      door: { face: 'L', at: 30 }, windows: [win('L', 62), win('R', 24), win('R', 50)], chimney: { at: 54 },
      paint: { wall: 'stone', roofColor: 'violet', awning: { stripes: ['v', 'c'] }, steps: 2, weather: 0.2, seed: 22 },
      sprites: ['bld_village_shop'], smoke: true, litWindows: true,
    },
    herbalist_house: {
      name: "Wren's cottage", fw: 4.5, fd: 4.5, enterable: true, interior: 'herbalist_house', npc: 'wren', size: 'medium',
      door: { face: 'R', at: 30 }, windows: [win('L', 26), win('L', 52), win('R', 60, { w: 10 })], chimney: { at: 30 },
      paint: { wall: 'log', roof: 'thatch', porch: { depth: 9 }, ivy: 0.5, flowerBoxes: true, weather: 0.3, seed: 23 },
      sprites: ['bld_herbalist_house'], smoke: true, litWindows: true,
    },
    elder_house: {
      name: "Elder Marrow's house", fw: 5, fd: 4, enterable: true, interior: 'elder_house', npc: 'marrow', size: 'medium',
      door: { face: 'L', at: 30 }, windows: [win('L', 64), win('R', 20), win('R', 46)], chimney: { at: 44 },
      paint: { wall: 'plaster', roofColor: 'red', steps: 2, weather: 0.15, flowerBoxes: true, seed: 21 },
      sprites: ['bld_elder_house'], smoke: true, litWindows: true,
    },
    tutorial_hut: {
      name: 'the practice hut', fw: 3.5, fd: 3, enterable: true, interior: 'tutorial_hut', size: 'small', persist: false,
      door: { face: 'L', at: 26 }, windows: [win('R', 24)], chimney: false,
      paint: { wall: 'plank', roofColor: 'shingle', steps: 1, weather: 0.1, seed: 31 },
      sprites: ['bld_tutorial_hut'], smoke: false, litWindows: true,
    },
    mill: {
      name: 'the old mill', fw: 4.5, fd: 4, enterable: false, size: 'large',
      lockedPrompt: 'The old mill is boarded up',
      lockedReason: "The mill door is nailed shut and the wheel hasn't turned since the Moonwell went dark. Nothing to do here yet.",
      door: { face: 'L', at: 28 }, windows: [win('L', 56), win('R', 30)], chimney: false,
      paint: { wall: 'stone', roofColor: 'slate', locked: true, shuttered: true, weather: 0.7, ivy: 0.4, steps: 1, seed: 41 },
      sprites: ['bld_mill_locked'], smoke: false, litWindows: false,
    },
    shed: {
      name: 'the old shed', fw: 3, fd: 3, enterable: false, size: 'small',
      lockedPrompt: 'The shed is barred shut',
      lockedReason: 'The shed is barred shut. Pip says the miller took the only key to the coast.',
      door: { face: 'R', at: 24 }, windows: [win('L', 24, { w: 12 })], chimney: false,
      paint: { wall: 'plank', roofColor: 'slate', locked: true, shuttered: true, steps: 1, weather: 0.6, seed: 24 },
      sprites: ['bld_shed_locked'], smoke: false, litWindows: false,
    },
  };
  // non-enterable structures that are not houses (no door; WORLD keeps drawing their own sprites)
  const structureTypes = {
    moonwell: { name: 'the Moonwell', fw: 1.7, fd: 1.7, enterable: false, interactId: 'moonwell',
      lockedReason: 'The Moonwell is a sacred spring, not a house: walk up to it to visit.',
      sprites: ['moonwell_dark', 'moonwell_faint', 'moonwell_glow', 'moonwell_restored'] },
  };

  // ================================================================== placements (ids are stable; x,y = FRONT corner)
  const placements = {
    grove: [
      { id: 'home', type: 'cottage_home', x: 8.0, y: 5.6 },
      { id: 'old_mill', type: 'mill', x: 19.0, y: 16.8 },
      { id: 'old_shed', type: 'shed', x: 6.2, y: 16.4 },
    ],
    village: [
      { id: 'marrow_house', type: 'elder_house', x: 6.8, y: 6.4 },
      { id: 'pip_shop', type: 'village_shop', x: 16.0, y: 5.6 },
      { id: 'wren_house', type: 'herbalist_house', x: 6.0, y: 16.2 },
    ],
    tutorial: [
      { id: 'practice_hut', type: 'tutorial_hut', x: 11.3, y: 5.4 },
    ],
  };
  const structures = {
    grove: [{ id: 'moonwell', type: 'moonwell', x: 13.6, y: 6.2 }],
  };

  // ================================================================== interiors (local floor coords: [0,W]x[0,D] from the inner back corner)
  // furniture: {id, type, x, y (back corner), rot?:'y', interact?:{kind, prompt, ...}} ; size comes from `furniture`.
  // walls: back walls 'y0' (along x, upper-right) and 'x0' (along y, upper-left); decor: {type, wall, at (tiles from the
  // top corner along the wall), interact?}. The front walls (y=D, x=W) are cut away; the entrance is in one of them.
  const LORE = {
    cottage_books: ['A shelf of your grandmother\'s books. Most are almanacs of moon phases, annotated in her tidy hand.',
      '"The Moonwell drinks moonlight the way a garden drinks rain," one margin reads. "Keep it company, and it keeps you."',
      'Pressed between two pages: a dried moonflower and a recipe — two wheat, simmered gently, for a healing draught.'],
    marrow_portrait: ['A portrait of your grandmother in her keeper\'s shawl, the silver moon charm at her throat.',
      'Marrow painted it himself, long ago. The brushwork is clumsy; the smile is exactly right.'],
    marrow_chart: ['A hand-inked star chart. Three stars are circled in silver — forest, swamp and mountain.',
      'A note beneath: "Where the moon fell, the light is waiting."'],
    marrow_case: ['A glass case of Moonwell memorabilia: the keeper\'s old lantern, a chipped silver ladle and a ribbon of blue cloth.',
      'A small card reads: "For when she comes home." The ink is newer than the rest.'],
    pip_crates: ['Crates stamped HOLLOWBROOK — FRAGILE. One is full of goose feathers, sorted by length.'],
    wren_racks: ['Bundles of starmint and wheat-stalk hang head-down to dry. The whole room smells green and sweet.'],
    wren_shelves: ['Jars labelled in a looping hand: "glowcap (do NOT lick)", "ember dust", "frost berry — winter only".'],
    hut_note: ['Practice notes, pinned to the table: "Walk with WASD or the joystick. Talk and use things with your interact key. Doors take you inside — and back out."'],
  };
  const interiors = {
    cottage_home: {
      building: 'cottage_home', name: 'Your cottage', floor: 'planks', wall: 'plaster', trim: 'timber',
      ambience: { tint: '#2a2030', warm: '#ffcf8a', motes: 26 },
      furniture: [
        { id: 'wardrobe', type: 'wardrobe', x: 0, y: 0.1, rot: 'y', interact: { kind: 'wardrobe', prompt: 'Look in the mirror' } },
        { id: 'hearth', type: 'hearth', x: 0, y: 1.45, rot: 'y', interact: { kind: 'hearth', prompt: 'Tend the hearth' }, slot: 'mantel' },
        { id: 'woodpile', type: 'woodpile', x: 0.05, y: 3.2, rot: 'y' },
        { id: 'bookcase', type: 'bookcase', x: 0.85, y: 0, interact: { kind: 'lore', prompt: 'Read grandmother\'s books', lore: 'cottage_books' } },
        { id: 'bed', type: 'bed', x: 3.65, y: 0, interact: { kind: 'rest', prompt: 'Rest (¼ day)' } },
        { id: 'chest', type: 'chest', x: 3.75, y: 2.15, interact: { kind: 'storage', prompt: 'Open the storage chest', chest: 'home_chest' } },
        { id: 'brewing', type: 'alchemy_table', x: 4.0, y: 3.0, interact: { kind: 'craft', prompt: 'Brew at the alchemy table' } },
        { id: 'rug', type: 'rug', x: 1.2, y: 1.0 },
        { id: 'mat', type: 'doormat', x: 2.25, y: 3.5 },
      ],
      decor: [
        { type: 'window', wall: 'y0', at: 2.95 },
        { type: 'wall_shelf', wall: 'y0', at: 2.95, z: 46, slot: 'sill' },
        { type: 'window', wall: 'x0', at: 3.3 },
        { type: 'wall_lantern', wall: 'y0', at: 4.6 },
      ],
      slots: {
        mantel: { prompt: 'the mantel', accepts: ['crop', 'potion', 'material'] },
        sill: { prompt: 'the shelf', accepts: ['crop', 'potion', 'material'] },
      },
      lights: [{ x: 2.6, y: 2.0, z: 54, r: 60, color: '#ffd9a0', flicker: 0.08, kind: 'lamp' }],
    },
    village_shop: {
      building: 'village_shop', name: "Pip's shop", floor: 'boards', wall: 'stone', trim: 'timber',
      ambience: { tint: '#24222e', warm: '#ffd59a', motes: 18 },
      furniture: [
        { id: 'shelves_a', type: 'shelves', x: 0.2, y: 0 },
        { id: 'shelves_b', type: 'shelves', x: 2.85, y: 0 },
        { id: 'shelves_c', type: 'shelves', x: 0, y: 0.75, rot: 'y' },
        { id: 'counter', type: 'counter', x: 0.9, y: 1.45, interact: { kind: 'shop', prompt: "Browse Pip's wares", npc: 'pip' } },
        { id: 'crates', type: 'crate_stack', x: 0.1, y: 3.15, interact: { kind: 'lore', prompt: 'Peek into the crates', lore: 'pip_crates' } },
        { id: 'crate', type: 'crate', x: 3.85, y: 2.55 },
        { id: 'barrel', type: 'barrel', x: 3.95, y: 3.35 },
        { id: 'sack', type: 'sack', x: 3.45, y: 3.5 },
        { id: 'mat', type: 'doormat', x: 2.15, y: 3.5 },
      ],
      decor: [
        { type: 'window', wall: 'y0', at: 2.3 },
        { type: 'wall_lantern', wall: 'x0', at: 2.9 },
        { type: 'wall_lantern', wall: 'y0', at: 4.2 },
      ],
      npc: { id: 'pip', x: 2.4, y: 0.95, facing: 'S', reach: 1.8, interact: { kind: 'npc', prompt: 'Talk to Pip' } },
      lights: [{ x: 2.4, y: 1.8, z: 50, r: 64, color: '#ffe0a8', flicker: 0.06, kind: 'lamp' }],
    },
    herbalist_house: {
      building: 'herbalist_house', name: "Wren's cottage", floor: 'herbs', wall: 'log', trim: 'log',
      ambience: { tint: '#1f2a26', warm: '#d9f0b0', motes: 30 },
      furniture: [
        { id: 'rack_a', type: 'drying_rack', x: 0.3, y: 0, interact: { kind: 'lore', prompt: 'Smell the drying herbs', lore: 'wren_racks' } },
        { id: 'shelves', type: 'shelves', x: 2.3, y: 0, interact: { kind: 'lore', prompt: 'Read the jar labels', lore: 'wren_shelves' } },
        { id: 'rack_b', type: 'drying_rack', x: 0, y: 0.6, rot: 'y' },
        { id: 'cauldron', type: 'cauldron', x: 1.55, y: 1.2, interact: { kind: 'craft', prompt: "Brew at Wren's cauldron" } },
        { id: 'worktable', type: 'worktable', x: 0, y: 2.3, rot: 'y' },
        { id: 'plant_a', type: 'plant', x: 1.25, y: 3.45 },
        { id: 'plant_b', type: 'plant', x: 3.45, y: 0.65 },
        { id: 'rug', type: 'rug_round', x: 1.2, y: 2.4 },
        { id: 'mat', type: 'doormat', x: 3.5, y: 1.625, rot: 'y' },
      ],
      decor: [
        { type: 'herbs_hanging', wall: 'y0', at: 1.0 },
        { type: 'window', wall: 'y0', at: 1.95 },
        { type: 'window', wall: 'x0', at: 1.95 },
        { type: 'herbs_hanging', wall: 'x0', at: 3.2 },
      ],
      npc: { id: 'wren', x: 2.85, y: 1.45, facing: 'SW', interact: { kind: 'npc', prompt: 'Talk to Wren' } },
      lights: [{ x: 2.0, y: 2.2, z: 50, r: 56, color: '#f6ffd0', flicker: 0.05, kind: 'lamp' }],
    },
    elder_house: {
      building: 'elder_house', name: "Elder Marrow's house", floor: 'flagstone', wall: 'plaster', trim: 'timber',
      ambience: { tint: '#26213a', warm: '#ffd0a0', motes: 22 },
      furniture: [
        { id: 'bookcase', type: 'bookcase', x: 2.15, y: 0 },
        { id: 'stove', type: 'stove', x: 3.75, y: 0 },
        { id: 'case', type: 'display_case', x: 0, y: 2.2, rot: 'y', interact: { kind: 'lore', prompt: 'Look at the keeper\'s keepsakes', lore: 'marrow_case' } },
        { id: 'armchair', type: 'armchair', x: 0.6, y: 0.55 },
        { id: 'table', type: 'table', x: 1.75, y: 1.05 },
        { id: 'chair', type: 'chair', x: 3.35, y: 1.25 },
        { id: 'rug', type: 'rug', x: 1.2, y: 0.8 },
        { id: 'mat', type: 'doormat', x: 2.15, y: 3.0 },
      ],
      decor: [
        { type: 'portrait', wall: 'x0', at: 1.0, interact: { kind: 'lore', prompt: 'Look at the portrait', lore: 'marrow_portrait', flag: 'saw_portrait' } },
        { type: 'star_chart', wall: 'y0', at: 1.0, interact: { kind: 'lore', prompt: 'Study the star chart', lore: 'marrow_chart' } },
        { type: 'window', wall: 'y0', at: 3.15 },
        { type: 'wall_lantern', wall: 'x0', at: 2.0 },
      ],
      npc: { id: 'marrow', x: 3.7, y: 2.4, facing: 'SW', interact: { kind: 'npc', prompt: 'Talk to Elder Marrow' } },
      lights: [{ x: 2.2, y: 1.6, z: 50, r: 58, color: '#ffd6a0', flicker: 0.07, kind: 'lamp' }],
    },
    tutorial_hut: {
      building: 'tutorial_hut', name: 'Practice hut', floor: 'planks', wall: 'plank', trim: 'timber',
      ambience: { tint: '#262a2a', warm: '#ffe0a6', motes: 14 },
      furniture: [
        { id: 'table', type: 'table', x: 0.2, y: 0, interact: { kind: 'lore', prompt: 'Read the practice notes', lore: 'hut_note' } },
        { id: 'chest', type: 'chest', x: 0, y: 1.1, rot: 'y', interact: { kind: 'storage', prompt: 'Open the practice chest', chest: 'practice_chest' } },
        { id: 'barrel', type: 'barrel', x: 2.4, y: 0.05 },
        { id: 'crate', type: 'crate', x: 2.3, y: 0.7 },
        { id: 'mat', type: 'doormat', x: 0.875, y: 2.0 },
      ],
      decor: [
        { type: 'lesson_board', wall: 'y0', at: 1.0 },
        { type: 'window', wall: 'x0', at: 1.9 },
        { type: 'wall_lantern', wall: 'y0', at: 2.2 },
      ],
      chests: { practice_chest: { potion: 1, wheat: 2 } },
      lights: [{ x: 1.5, y: 1.2, z: 46, r: 50, color: '#ffe2a8', flicker: 0.06, kind: 'lamp' }],
    },
  };

  // ================================================================== derived geometry
  const T = unit.wall.thickness;
  const allPlacements = () => { const out = []; for (const r in placements) for (const p of placements[r]) out.push(Object.assign({ region: r }, p)); return out; };
  const allStructures = () => { const out = []; for (const r in structures) for (const p of structures[r]) out.push(Object.assign({ region: r, structure: true }, p)); return out; };
  const cache = new Map();
  function findPlacement(id) { return allPlacements().find((p) => p.id === id) || allStructures().find((p) => p.id === id) || null; }
  // Door geometry from a type + front corner. Returns centre on the wall line, gap ends, outward normal.
  function doorGeom(t, x1, y1) {
    const d = t.door; if (!d) return null;
    const at = d.at / FACE_PX, w = (d.w || unit.door.w) / FACE_PX, h = d.h || unit.door.h;
    if (d.face === 'R') return { face: 'R', at: d.at, cx: x1, cy: y1 - at, a0: y1 - at - w / 2, a1: y1 - at + w / 2, nx: 1, ny: 0, w, h, wPx: w * FACE_PX };
    return { face: 'L', at: d.at, cx: x1 - at, cy: y1, a0: x1 - at - w / 2, a1: x1 - at + w / 2, nx: 0, ny: 1, w, h, wPx: w * FACE_PX };
  }
  // resolve(id) -> derived instance: rect, blocks (collision; door recess carved), door, trigger, approach, spawn, interactable.
  function resolve(id) {
    if (cache.has(id)) return cache.get(id);
    const pl = typeof id === 'object' ? id : findPlacement(id); if (!pl) return null;
    const t = (pl.structure ? structureTypes : types)[pl.type]; if (!t) return null;
    const x1 = pl.x, y1 = pl.y, x0 = x1 - t.fw, y0 = y1 - t.fd;
    const r = { id: pl.id, region: pl.region, type: pl.type, def: t, name: pl.name || t.name, enterable: !!t.enterable && !pl.locked,
      lockedReason: pl.lockedReason || t.lockedReason || null, lockedPrompt: t.lockedPrompt || null, interior: t.interior || null,
      x: x1, y: y1, fw: t.fw, fd: t.fd, rect: [x0, y0, x1, y1], anchor: { x: x1, y: y1 }, structure: !!pl.structure, facing: t.door ? t.door.face : null };
    const d = doorGeom(t, x1, y1);
    if (!d) { r.blocks = [r.rect.slice()]; r.door = null; }
    else {
      const rc = unit.door.recess;
      r.door = d;
      if (d.face === 'L') {
        r.blocks = [[x0, y0, x1, y1 - rc], [x0, y1 - rc, d.a0, y1], [d.a1, y1 - rc, x1, y1]];
        r.trigger = [d.a0, y1 - rc, d.a1, y1 + unit.triggerOut];
      } else {
        r.blocks = [[x0, y0, x1 - rc, y1], [x1 - rc, y0, x1, d.a0], [x1 - rc, d.a1, x1, y1]];
        r.trigger = [x1 - rc, d.a0, x1 + unit.triggerOut, d.a1];
      }
      r.approach = { x: d.cx + d.nx * unit.approach, y: d.cy + d.ny * unit.approach };
      r.spawn = { x: d.cx + d.nx * unit.spawnOut, y: d.cy + d.ny * unit.spawnOut, facing: d.face === 'L' ? 'SW' : 'SE' };
      r.interact = { id: 'enter:' + pl.id, x: r.approach.x, y: r.approach.y, r: 0.95, kind: 'door', building: pl.id, locked: !r.enterable,
        prompt: r.enterable ? 'Enter ' + r.name : (r.lockedPrompt || r.lockedReason || 'Locked') };
    }
    cache.set(pl.id, r);
    return r;
  }
  function list(region) { return allPlacements().filter((p) => !region || p.region === region).map((p) => resolve(p.id)); }
  function listStructures(region) { return allStructures().filter((p) => !region || p.region === region).map((p) => resolve(p.id)); }
  // Collision rectangles for WORLD (visible structure == collision; the door recess stays walkable).
  function footprintBlocks(region) {
    const out = [];
    for (const b of list(region).concat(listStructures(region))) for (const rc of b.blocks) out.push({ id: b.id, rect: rc.slice() });
    return out;
  }
  // WORLD painter spec (src/systems/world-buildings.js) for a building at restoration level L (cottage only varies).
  function paintSpec(id, L) {
    const b = resolve(id); if (!b || b.structure) return null; const t = b.def;
    const lv = t.levels ? t.levels[Math.max(0, Math.min(t.levels.length - 1, L == null ? 2 : L | 0))] : null;
    const rise = unit.roof.rise[t.size] || unit.roof.rise.medium;
    return Object.assign({ fw: t.fw, fd: t.fd, wh: unit.wall.height, rh: rise, foundation: unit.wall.plinth,
      door: { face: t.door.face, at: t.door.at, w: unit.door.w, h: unit.door.h },
      windows: (t.windows || []).map((w) => ({ face: w.face, at: w.at, w: w.w || unit.window.w, h: w.h || unit.window.h, z: w.z || unit.window.sill })),
      chimney: t.chimney === false ? false : t.chimney }, t.paint, lv || {}, t.enterable ? {} : { locked: true, shuttered: true });
  }
  const pick = (v, L) => (typeof v === 'function' ? !!v(L) : !!v);
  // Record in the exact shape WORLD's placeBuildings() consumes (MM.WORLD_BUILDINGS_DEFAULT entries).
  function toWorld(pl, L) {
    const b = resolve(typeof pl === 'string' ? pl : pl.id); if (!b || b.structure) return null; const t = b.def;
    const spec = paintSpec(b.id, L);
    return { id: b.id, x: b.x, y: b.y, fw: t.fw, fd: t.fd, name: b.name, type: b.type, interior: b.interior, enterable: b.enterable,
      lockedReason: b.enterable ? null : b.lockedReason, lockedPrompt: b.lockedPrompt, spec, rect: b.rect.slice(), blocks: b.blocks.map((r) => r.slice()),
      door: { face: t.door.face, at: t.door.at }, doorPt: { face: b.door.face, x: b.door.cx, y: b.door.cy, ax: b.approach.x, ay: b.approach.y },
      trigger: b.trigger.slice(), spawn: Object.assign({}, b.spawn), smoke: pick(t.smoke, L), litWindows: pick(t.litWindows, L),
      art: (t.sprites || []).map((s) => s.replace('<L>', L == null ? 2 : L)) };
  }
  // Interior geometry (local floor coords). Door from the exterior door by construction: same face, same offset.
  function interiorOf(idOrBuilding) {
    let b = resolve(idOrBuilding), def = null, key = null;
    if (b && b.interior) { key = b.interior; def = interiors[key]; }
    else if (interiors[idOrBuilding]) { key = idOrBuilding; def = interiors[key]; b = list().find((x) => x.interior === key) || null; }
    if (!def) return null;
    const t = types[def.building];
    const W = t.fw - 2 * T, D = t.fd - 2 * T, dw = (t.door.w || unit.door.w) / FACE_PX, at = t.door.at / FACE_PX;
    const door = t.door.face === 'L'
      ? { wall: 'yD', face: 'L', cx: t.fw - at - T, cy: D, a0: t.fw - at - T - dw / 2, a1: t.fw - at - T + dw / 2, nx: 0, ny: 1, w: dw, h: t.door.h || unit.door.h }
      : { wall: 'xW', face: 'R', cx: W, cy: t.fd - at - T, a0: t.fd - at - T - dw / 2, a1: t.fd - at - T + dw / 2, nx: 1, ny: 0, w: dw, h: t.door.h || unit.door.h };
    const spawn = { x: door.cx - door.nx * unit.spawnIn, y: door.cy - door.ny * unit.spawnIn, facing: door.face === 'L' ? 'NE' : 'NW' };
    const exit = door.face === 'L' ? [door.a0, D - unit.exitIn, door.a1, D + 0.6] : [W - unit.exitIn, door.a0, W + 0.6, door.a1];
    const items = (def.furniture || []).map((f) => {
      const s = furniture[f.type] || F(f.w || 1, f.d || 1, f.h || 20);
      const w = f.w || (f.rot === 'y' ? s.d : s.w), d = f.d || (f.rot === 'y' ? s.w : s.d);
      return Object.assign({}, s, f, { w, d, h: f.h ?? s.h, solid: f.solid ?? s.solid, rect: [f.x, f.y, f.x + w, f.y + d], spec: f.type });
    });
    const decor = (def.decor || []).map((d) => Object.assign({}, wallDecor[d.type] || {}, d, { spec: d.type }));
    return { key, def, building: b ? b.id : null, type: def.building, W, D, door, spawn, exit, items, decor, npc: def.npc || null, lights: def.lights || [],
      wallH: unit.wall.height, cutaway: unit.wall.cutaway, persist: t.persist !== false };
  }

  // ================================================================== validation
  // validate(opts) -> [] when everything is consistent; otherwise strings "<id>: problem". opts.world: also check the live
  // MM.world obstacles of the current region (spawn/approach clear of trees/props) when available.
  const inRect = (x, y, r, pad) => { pad = pad || 0; return x > r[0] - pad && x < r[2] + pad && y > r[1] - pad && y < r[3] + pad; };
  const overlap = (a, b, pad) => { pad = pad || 0; return a[0] < b[2] + pad && a[2] > b[0] - pad && a[1] < b[3] + pad && a[3] > b[1] - pad; };
  function validate(opts) {
    opts = opts || {};
    const P = [], push = (id, msg) => P.push(id + ': ' + msg), U = unit;
    if (U.door.w < U.door.minWScreen - 1e-6) push('unit', 'door width ' + U.door.w + 'px < 1.2x player width on screen (' + U.door.minWScreen + 'px)');
    if (U.door.tiles < U.door.minWWorld - 1e-6) push('unit', 'door width ' + U.door.tiles + ' tiles < 1.2x player world width (' + U.door.minWWorld + ')');
    if (U.door.h < 1.35 * U.player.visibleH - 1e-6) push('unit', 'door height < 1.35x player height');
    if (U.wall.plinth + U.door.h + 2 > U.wall.height) push('unit', 'wall too low for the door');
    if (U.spawnOut <= U.triggerOut + U.player.collisionR) push('unit', 'outside spawn would start inside the door trigger (re-entry loop)');
    if (U.window.sill + U.window.h > U.wall.height - 6) push('unit', 'window head too close to the eave');
    // types
    for (const k in types) {
      const t = types[k];
      if (!t.door) { push(k, 'no door'); continue; }
      const len = (t.door.face === 'L' ? t.fw : t.fd) * FACE_PX, dw = t.door.w || U.door.w, dh = t.door.h || U.door.h;
      if (dw < U.door.w - 1e-6) push(k, 'door narrower than unit.door.w');
      if (dh < U.door.h - 1e-6) push(k, 'door lower than unit.door.h');
      if (t.door.at - dw / 2 < U.door.jamb * FACE_PX - 1e-6 || t.door.at + dw / 2 > len - U.door.jamb * FACE_PX + 1e-6) push(k, 'door does not fit its face with jambs');
      const opens = [{ face: t.door.face, a: t.door.at - dw / 2 - 2, b: t.door.at + dw / 2 + 2, what: 'door' }];
      for (const w of t.windows || []) {
        const ww = w.w || U.window.w, flen = (w.face === 'L' ? t.fw : t.fd) * FACE_PX;
        if (w.at - ww / 2 < 3 || w.at + ww / 2 > flen - 3) push(k, 'window at ' + w.at + ' outside face ' + w.face);
        for (const o of opens) if (o.face === w.face && w.at + ww / 2 > o.a && w.at - ww / 2 < o.b) push(k, 'window at ' + w.at + ' overlaps ' + o.what + ' on face ' + w.face);
        opens.push({ face: w.face, a: w.at - ww / 2 - 1, b: w.at + ww / 2 + 1, what: 'window' });
      }
      if (t.enterable) { if (!interiors[t.interior]) push(k, 'enterable but interior "' + t.interior + '" missing'); }
      else if (!t.lockedReason) push(k, 'not enterable and no lockedReason');
    }
    // placements
    const seen = new Set(), byRegion = {};
    for (const pl of allPlacements().concat(allStructures())) {
      if (seen.has(pl.id)) push(pl.id, 'duplicate id'); seen.add(pl.id);
      const b = resolve(pl.id); if (!b) { push(pl.id, 'unknown type ' + pl.type); continue; }
      (byRegion[pl.region] = byRegion[pl.region] || []).push(b);
      const [x0, y0, x1, y1] = b.rect;
      if (x0 < 0.5 || y0 < 0.5 || x1 > 19.5 || y1 > 19.5) push(pl.id, 'footprint outside the region ground');
      if (!(b.anchor.x === x1 && b.anchor.y === y1)) push(pl.id, 'anchor is not the front corner');
      // a real sprite for this building must be anchored on the front ground corner (no floating art)
      try {
        const A = MM.art; const names = b.def.sprites || [];
        for (const n0 of names) { const n = n0.replace('<L>', '2'); if (!(A && A.has && A.has(n)) || b.structure) continue; const f = A.get(n);
          const want = Math.round(b.fw * FACE_PX); if (Math.abs(f.ax - want) > 8 || f.ay < f.h - 14) push(pl.id, 'sprite ' + n + ' anchor (' + f.ax + ',' + f.ay + ') not on the front corner (expected ax~' + want + ', ay near bottom)'); }
      } catch (e) { /* art optional */ }
      if (b.structure) continue;
      if (!b.door) { push(pl.id, 'no door'); continue; }
      const R = U.player.collisionR;
      for (const rc of b.blocks) {
        if (inRect(b.spawn.x, b.spawn.y, rc, R)) push(pl.id, 'outside spawn inside its own collision');
        if (inRect(b.approach.x, b.approach.y, rc, R)) push(pl.id, 'approach point inside its own collision (door blocked)');
      }
      if (inRect(b.spawn.x, b.spawn.y, b.trigger, 0)) push(pl.id, 'outside spawn inside the door trigger (enter/exit loop)');
      if (!inRect(b.approach.x, b.approach.y, b.trigger, 0)) push(pl.id, 'approach point not inside the trigger');
      const tc = b.door.face === 'L' ? (b.trigger[0] + b.trigger[2]) / 2 : (b.trigger[1] + b.trigger[3]) / 2, dc = b.door.face === 'L' ? b.door.cx : b.door.cy;
      if (Math.abs(tc - dc) > 1e-6) push(pl.id, 'trigger misaligned with the visible door');
      // the walk from the spawn into the door recess must be free of the building's own collision
      for (let k = 0; k <= 20; k++) { const s = U.spawnOut - k * (U.spawnOut + U.door.recess - 0.05) / 20, px = b.door.cx + b.door.nx * s, py = b.door.cy + b.door.ny * s;
        if (b.blocks.some((rc) => inRect(px, py, rc, 0.02))) { push(pl.id, 'door gap is blocked at ' + s.toFixed(2) + ' tiles'); break; } }
      if (b.spawn.x < 0.7 || b.spawn.y < 0.7 || b.spawn.x > 19.3 || b.spawn.y > 19.3) push(pl.id, 'outside spawn off the map');
      if (b.enterable) validateInterior(b, push);
    }
    for (const r in byRegion) {
      const L = byRegion[r];
      for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
        const a = L[i], c = L[j];
        if (overlap(a.rect, c.rect, 0.4)) push(a.id, 'too close to / overlaps ' + c.id);
        for (const [p, q] of [[a, c], [c, a]]) if (p.spawn && (inRect(p.spawn.x, p.spawn.y, q.rect, 0.3) || inRect(p.approach.x, p.approach.y, q.rect, 0.3))) push(p.id, 'door approach/spawn blocked by ' + q.id);
      }
    }
    if (opts.world) {
      try {
        const g = (function () { try { return world; } catch (e) { return null; } })(); // eslint-disable-line no-undef
        const obs = g && MM.world && MM.world.obstacles ? MM.world.obstacles() : null;
        if (obs) for (const b of list(g.region)) for (const o of obs) {
          if (o.low) continue;
          const hit = (p) => (o.rect ? inRect(p.x, p.y, o.rect, 0.2) && !b.blocks.some((rc) => Math.abs(rc[0] - o.rect[0]) < 0.3 && Math.abs(rc[3] - o.rect[3]) < 0.4) && !overlap(o.rect, b.rect, -0.2) : Math.hypot(p.x - o.x, p.y - o.y) < o.r + 0.2);
          if (b.spawn && hit(b.spawn)) push(b.id, 'outside spawn blocked by a world obstacle');
          if (b.approach && hit(b.approach)) push(b.id, 'door approach blocked by a world obstacle');
        }
      } catch (e) { /* world optional */ }
    }
    return P;
  }
  function validateInterior(b, push) {
    const I = interiorOf(b.id), id = b.id + '/interior', R = unit.player.collisionR;
    if (!I) { push(id, 'missing'); return; }
    const t = types[I.type];
    if (Math.abs(I.W - (t.fw - 2 * T)) > 1e-6 || Math.abs(I.D - (t.fd - 2 * T)) > 1e-6) push(id, 'room size inconsistent with the footprint');
    if (I.door.a0 < unit.door.jamb - T - 1e-6 || I.door.a1 > (I.door.face === 'L' ? I.W : I.D) - unit.door.jamb + T + 1e-6) push(id, 'doorway off the front wall');
    const solids = I.items.filter((f) => f.solid);
    for (const f of I.items) {
      const [x0, y0, x1, y1] = f.rect;
      if (x0 < -1e-6 || y0 < -1e-6 || x1 > I.W + 1e-6 || y1 > I.D + 1e-6) push(id, f.id + ' outside the room');
      if (!furniture[f.type]) push(id, f.id + ' unknown furniture type ' + f.type);
    }
    for (let i = 0; i < solids.length; i++) for (let j = i + 1; j < solids.length; j++) if (overlap(solids[i].rect, solids[j].rect, -1e-3)) push(id, solids[i].id + ' overlaps ' + solids[j].id);
    const doorZone = I.door.face === 'L' ? [I.door.a0, I.D - 0.7, I.door.a1, I.D] : [I.W - 0.7, I.door.a0, I.W, I.door.a1];
    for (const f of solids) if (overlap(f.rect, doorZone, -1e-3)) push(id, f.id + ' blocks the doorway');
    const blockedAt = (x, y) => x < R || y < R || x > I.W - R || y > I.D - R || solids.some((f) => inRect(x, y, f.rect, R)) || (I.npc && Math.hypot(x - I.npc.x, y - I.npc.y) < R + 0.25);
    if (blockedAt(I.spawn.x, I.spawn.y)) push(id, 'interior spawn inside a wall or furniture');
    if (inRect(I.spawn.x, I.spawn.y, I.exit, 0)) push(id, 'interior spawn inside the exit trigger (loop)');
    if (I.npc && solids.some((f) => inRect(I.npc.x, I.npc.y, f.rect, 0.2))) push(id, 'npc stands inside furniture');
    // flood fill reachability on a 1/8 tile grid
    const S = 8, nx = Math.round(I.W * S), ny = Math.round(I.D * S), seen = new Uint8Array(nx * ny), q = [];
    const cell = (x, y) => [Math.min(nx - 1, Math.max(0, Math.floor(x * S))), Math.min(ny - 1, Math.max(0, Math.floor(y * S)))];
    const [sx, sy] = cell(I.spawn.x, I.spawn.y); q.push(sx + sy * nx); seen[sx + sy * nx] = 1;
    while (q.length) { const k = q.pop(), cx = k % nx, cy = (k / nx) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = cx + dx, Y = cy + dy; if (X < 0 || Y < 0 || X >= nx || Y >= ny) continue; const kk = X + Y * nx; if (seen[kk] || blockedAt((X + 0.5) / S, (Y + 0.5) / S)) continue; seen[kk] = 1; q.push(kk); } }
    const reach = (pred) => { for (let k = 0; k < nx * ny; k++) if (seen[k] && pred((k % nx + 0.5) / S, ((k / nx | 0) + 0.5) / S)) return true; return false; };
    const ex = I.door.face === 'L' ? [I.door.cx, I.D - R - 0.05] : [I.W - R - 0.05, I.door.cy];
    if (!reach((x, y) => Math.hypot(x - ex[0], y - ex[1]) < 0.2)) push(id, 'exit not reachable from the spawn');
    const dist = (x, y, r) => Math.hypot(Math.max(r[0] - x, 0, x - r[2]), Math.max(r[1] - y, 0, y - r[3]));
    for (const f of I.items) if (f.interact && !reach((x, y) => dist(x, y, f.rect) <= unit.reach)) push(id, f.id + ' cannot be reached');
    if (I.npc && !reach((x, y) => Math.hypot(x - I.npc.x, y - I.npc.y) <= (I.npc.reach || unit.reach + 0.3))) push(id, 'npc cannot be reached');
    for (const d of I.decor) {
      const len = d.wall === 'y0' ? I.W : I.D, half = (d.w || 16) / FACE_PX / 2;
      if (d.wall !== 'y0' && d.wall !== 'x0') push(id, d.type + ' must hang on a back wall');
      if (d.at - half < 0 || d.at + half > len) push(id, d.type + ' at ' + d.at + ' off its wall');
      if (d.interact) { const p = d.wall === 'y0' ? [d.at, 0.3] : [0.3, d.at]; if (!reach((x, y) => Math.hypot(x - p[0], y - p[1]) <= unit.reach + 0.4)) push(id, d.type + ' cannot be reached'); }
    }
    const wins = I.decor.filter((d) => d.type === 'window');
    for (let i = 0; i < wins.length; i++) for (let j = i + 1; j < wins.length; j++) if (wins[i].wall === wins[j].wall && Math.abs(wins[i].at - wins[j].at) < 1) push(id, 'windows overlap on ' + wins[i].wall);
  }
  // Every sprite name the data asks for that MM.art does not have yet (ART2 checklist; fallbacks are drawn meanwhile).
  function missingSprites() {
    const A = MM.art, has = (n) => !!(A && A.has && A.has(n)), out = new Set();
    for (const k in furniture) { const s = furniture[k].sprite || []; if (!s.some(has)) out.add(s[0]); if (furniture[k].open && !has(furniture[k].open)) out.add(furniture[k].open); }
    for (const k in wallDecor) { const s = wallDecor[k].sprite || []; if (!s.some(has)) out.add(s[0]); }
    for (const k in types) for (const s of types[k].sprites || []) { const n = s.replace('<L>', '0'); if (!has(n) && !s.includes('<L>')) out.add(n); }
    for (const n of Object.keys(NPCS)) if (!has('npc_' + n)) out.add('npc_' + n);
    return [...out].sort();
  }

  // Restoration level for level-dependent exteriors (cottage): campaign homestead level, else MM.world's, else 2.
  function restorationLevel() {
    try { const c = MM.campaign && MM.campaign.state; if (c && c.homestead && Number.isFinite(c.homestead.level)) return c.homestead.level; } catch (e) { /* */ }
    try { const r = MM.world && MM.world.getRestoration && MM.world.getRestoration(); const L = r && (r.L ?? r.level ?? r); if (Number.isFinite(L)) return L; } catch (e) { /* */ }
    return 2;
  }
  // Make every raw placement record already WORLD-shaped (so `Object.assign({enterable:true}, pl)` works as-is):
  // static fields copied from toWorld(); `spec`/`smoke`/`litWindows`/`art` are getters following the restoration level
  // (spec objects are cached per level so identity-based sprite caches stay valid).
  for (const region in placements) for (const pl of placements[region]) {
    pl.region = region; const base = toWorld(pl.id, 2), specs = {};
    for (const k of ['fw', 'fd', 'name', 'interior', 'enterable', 'lockedReason', 'lockedPrompt', 'rect', 'blocks', 'door', 'doorPt', 'trigger', 'spawn']) pl[k] = base[k];
    const lvl = () => restorationLevel();
    Object.defineProperty(pl, 'spec', { enumerable: true, get() { const L = types[pl.type].levels ? lvl() : 2; return specs[L] || (specs[L] = paintSpec(pl.id, L)); } });
    Object.defineProperty(pl, 'smoke', { enumerable: true, get() { return pick(types[pl.type].smoke, lvl()); } });
    Object.defineProperty(pl, 'litWindows', { enumerable: true, get() { return pick(types[pl.type].litWindows, lvl()); } });
    Object.defineProperty(pl, 'art', { enumerable: true, get() { const L = lvl(); const A = MM.art; return (types[pl.type].sprites || []).map((s) => s.replace('<L>', L)).find((n) => A && A.has && A.has(n)) || null; } });
  }
  MM.BUILDINGS = { version: 1, unit, furniture, wallDecor, types, structureTypes, placements, structures, interiors, lore: LORE, npcs: NPCS };
  MM.buildings = {
    unit, get: resolve, resolve, list, structures: listStructures, footprintBlocks, paintSpec, toWorld, interior: interiorOf,
    door(id) { const b = resolve(id); return b && b.door ? { x: b.door.cx, y: b.door.cy, approach: Object.assign({}, b.approach), region: b.region } : null; },
    validate, missingSprites, byInterior(key) { return list().find((b) => b.interior === key) || null; },
    clearCache() { cache.clear(); },
  };
})(window.MM);
