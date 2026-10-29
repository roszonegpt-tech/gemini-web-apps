// Art metadata read by tools/build-art.js (plain CommonJS, not a pxl file).
// anchor modes: 'bottom' (default: x = floor(w/2), y = h-1, the ground/foot point),
// 'center' (floor(w/2), floor(h/2)), 'topleft' (0, 0). Per-sprite overrides: [ax, ay] or (w, h) => [ax, ay].
'use strict';
const tile = (w, h) => [16, 8];   // every 32x16 ground piece: diamond centre
module.exports = {
  palette: {
    k: '#263a37', j: '#2f4b47', t: '#46695f', T: '#6a907f',
    G: '#4b7052', g: '#688d65', h: '#87ad7b', H: '#a6c593', y: '#d2e3ad',
    d: '#4a3a31', D: '#6e5642', w: '#8f7a5a', W: '#b89d72', s: '#c8aa86',
    S: '#4e5660', r: '#737d7e', R: '#9ea79f', q: '#d5d6bd',
    c: '#f7f4e9', C: '#e2dcc2',
    a: '#9a7444', o: '#cfaa71', O: '#eac979', Y: '#fff3c4',
    m: '#4f4566', v: '#8a78a8', l: '#c6aedb', L: '#ebe1f7',
    b: '#36636f', B: '#5f9ca3', i: '#a5d6d8',
    e: '#8a4a40', E: '#d27a55', p: '#e8b8a8', f: '#c95d6a',
    x: '#2e2638', X: '#7b4f7d', z: '#8ff0d0',
    u: '#59573a', U: '#8b8a58',
  },
  sheets: {
    tiles: { anchor: 'center', width: 512, note: '32x16 iso diamonds, anchor = diamond centre (16,8). Side skirts anchor at their top vertex.' },
    nature: { anchor: 'bottom', note: 'Trees, bushes, rocks, fungi, reeds, crystals. Anchor = trunk/base bottom-centre.' },
    props: { anchor: 'bottom', note: 'Placeable props. Anchor = bottom-centre ground point. Fences anchor at the segment midpoint.' },
    buildings: { anchor: 'bottom', width: 1024, note: 'Buildings + Moonwell. Anchor = bottom vertex of the footprint diamond (front corner).' },
    crops: { anchor: 'bottom', note: 'Crops stand on the plot centre; soil overlay is a 32x16 diamond (anchor 16,8).' },
    bosses: { anchor: 'bottom', width: 1024, note: 'Bosses: <id>_<idle|windup>_<s|e>; west = draw east with flip.' },
    icons: { anchor: 'topleft', note: '16x16 UI icons (topleft anchor). UI ornaments + 3-frame motes too.' },
    fx: { anchor: 'center', note: 'Spell impact / pickup effects, centred on the impact point.' },
  },
  anchors: {},
};
// Side skirts are 32x(16+depth) and share the tile anchor so they line up under a ground tile.
module.exports.sheets.tiles.anchors = { side_earth: tile, side_stone: tile, side_snow: tile, side_crypt: tile };
module.exports.sheets.crops.anchors = { soil_watered: tile };
// Fence segments: anchor = midpoint between the two post bases (put it on the tile-edge midpoint).
module.exports.sheets.props.anchors = { fence_x: [10, 19], fence_y: [10, 19], fence_x_broken: [10, 19], fence_y_broken: [10, 19] };
// Buildings: front ground corner of the footprint (left face width A, +1 for the outline).
const front = (A) => (w, h) => [A + 1, h - 2];
module.exports.sheets.buildings.anchors = {
  cottage_ruined: front(48), cottage_mended: front(48), cottage_lush: front(48),
  house_village_0: front(54), house_village_1: front(46), house_village_2: front(40),
};
// Wind-up and impact animations play once and hold the last frame.
module.exports.sheets.bosses.once = (n) => n.includes('_windup_');
module.exports.sheets.fx.once = (n) => !/^(fx_aura|fx_mote)/.test(n);
