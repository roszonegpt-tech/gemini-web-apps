#!/usr/bin/env node
// Moss Moon art pipeline.
//   node tools/build-art.js [--only tiles,props] [--preview] [--pxl /path/to/claude-pxl]
// 1. Runs claude-pxl (`pxl build art/<name>.px.js --out assets/images/pxl/<name>`) for every
//    art/*.px.js (files starting with "_" are shared includes, not built on their own).
// 2. Packs each file's sprites + anim strips into one sheet: assets/images/<name>.png
//    (anim frames stay contiguous left->right, so frame i is at x + i*w).
// 3. Writes assets/images/manifest.json and assets/js/art-data.js (window.MM_ART, data URIs).
// Anchors come from art/meta.js (per-sheet default + per-sprite overrides).
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib'), cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ART = path.join(ROOT, 'art'), IMG = path.join(ROOT, 'assets/images'), OUT_JS = path.join(ROOT, 'assets/js/art-data.js');
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const PXL = path.join(opt('--pxl') || process.env.PXL_HOME || '/home/user/crsolver/claude-pxl', 'bin/pxl.js');
const ONLY = opt('--only') ? opt('--only').split(',') : null;
const PREVIEW = args.includes('--preview');
const MAX_COLORS = 40;

// ------------------------------------------------------------------ PNG decode / encode (8-bit, non-interlaced)
function decodePng(buf) {
  let p = 8, w, h, ct, pal = null, trns = null; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; if (d[8] !== 8 || d[12]) throw new Error('unsupported PNG'); }
    else if (type === 'PLTE') pal = d; else if (type === 'tRNS') trns = d; else if (type === 'IDAT') idat.push(d);
    p += 12 + len;
  }
  const bpp = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct], raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp;
  const px = Buffer.alloc(w * h * bpp), out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), o = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[o + x - bpp] : 0, b = y ? px[o - stride + x] : 0, c = x >= bpp && y ? px[o - stride + x - bpp] : 0;
      let v = row[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[o + x] = v & 255;
    }
  }
  for (let i = 0; i < w * h; i++) {
    if (ct === 6) { out.set(px.subarray(i * 4, i * 4 + 4), i * 4); }
    else if (ct === 2) { out.set(px.subarray(i * 3, i * 3 + 3), i * 4); out[i * 4 + 3] = 255; }
    else if (ct === 3) { const k = px[i]; out[i * 4] = pal[k * 3]; out[i * 4 + 1] = pal[k * 3 + 1]; out[i * 4 + 2] = pal[k * 3 + 2]; out[i * 4 + 3] = trns && k < trns.length ? trns[k] : 255; }
    else if (ct === 0) { out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = px[i]; out[i * 4 + 3] = 255; }
    else if (ct === 4) { out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = px[i * 2]; out[i * 4 + 3] = px[i * 2 + 1]; }
  }
  return { w, h, data: out };
}
function chunk(type, data) {
  const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}
function encodePng(img) {
  const { w, h, data } = img, idx = new Map();
  const keyAt = (i) => data[i * 4 + 3] === 0 ? 0 : ((data[i * 4] << 24) | (data[i * 4 + 1] << 16) | (data[i * 4 + 2] << 8) | data[i * 4 + 3]) >>> 0;
  idx.set(0, 0);   // transparent first
  for (let i = 0; i < w * h && idx.size <= 256; i++) { const key = keyAt(i); if (!idx.has(key)) idx.set(key, idx.size); }
  const indexed = idx.size <= 256, rowLen = indexed ? w + 1 : w * 4 + 1, raw = Buffer.alloc(rowLen * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (indexed) raw[y * rowLen + 1 + x] = idx.get(keyAt(i));
    else for (let k = 0; k < 4; k++) raw[y * rowLen + 1 + x * 4 + k] = data[i * 4 + k];
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = indexed ? 3 : 6;
  const parts = [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr)];
  if (indexed) {
    const keys = [...idx.keys()], plte = Buffer.alloc(keys.length * 3), trns = Buffer.alloc(keys.length);
    keys.forEach((c, i) => { plte[i * 3] = c >>> 24; plte[i * 3 + 1] = (c >>> 16) & 255; plte[i * 3 + 2] = (c >>> 8) & 255; trns[i] = c & 255; });
    parts.push(chunk('PLTE', plte), chunk('tRNS', trns));
  }
  parts.push(chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}
const blank = (w, h) => ({ w, h, data: new Uint8Array(w * h * 4) });
function blit(dst, src, dx, dy, sx = 0, sy = 0, w = src.w, h = src.h) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const si = ((sy + y) * src.w + sx + x) * 4, di = ((dy + y) * dst.w + dx + x) * 4;
    for (let k = 0; k < 4; k++) dst.data[di + k] = src.data[si + k];
  }
}

// ------------------------------------------------------------------ build
const meta = require(path.join(ART, 'meta.js'));
const files = fs.readdirSync(ART).filter((f) => /\.px\.js$/.test(f) && !f.startsWith('_')).sort();
const sheets = {}, manifest = { version: '', palette: meta.palette || null, sheets: {} };
let failed = false;

for (const file of files) {
  const name = file.replace(/\.px\.js$/, ''), out = path.join(IMG, 'pxl', name);
  const built = !ONLY || ONLY.includes(name);
  if (built) {
    fs.rmSync(out, { recursive: true, force: true });
    const r = cp.spawnSync(process.execPath, [PXL, 'build', path.join(ART, file), '--out', out, ...(PREVIEW ? [] : ['--no-preview'])], { encoding: 'utf8' });
    const errs = (r.stdout + r.stderr).split('\n').filter((l) => /error|Error|✗/.test(l));
    if (r.status !== 0 || errs.length) { failed = true; console.error(`pxl ${file}: exit ${r.status}\n${r.stdout}\n${r.stderr}`); }
    else console.log(`pxl ${file}: ok`);
    // GIFs are review aids only; keep them with --preview, drop them otherwise to keep the repo lean.
    if (!PREVIEW) for (const d of ['sprites', 'anims']) { const dd = path.join(out, d); if (fs.existsSync(dd)) for (const f of fs.readdirSync(dd)) if (f.endsWith('.gif')) fs.unlinkSync(path.join(dd, f)); }
  }
  if (!fs.existsSync(out)) { console.error(`missing ${out} (build it first)`); failed = true; continue; }

  // Collect sprites (single frame) and anims (strip + json).
  const items = [], cfg = meta.sheets[name] || {};
  const sdir = path.join(out, 'sprites'), adir = path.join(out, 'anims');
  if (fs.existsSync(sdir)) for (const f of fs.readdirSync(sdir).sort()) {
    if (!f.endsWith('.png') || f.endsWith('_n.png')) continue;
    const img = decodePng(fs.readFileSync(path.join(sdir, f)));
    items.push({ name: f.slice(0, -4), img, fw: img.w, fh: img.h, frames: 1, durs: null });
  }
  if (fs.existsSync(adir)) for (const f of fs.readdirSync(adir).sort()) {
    if (!f.endsWith('.json')) continue;
    const n = f.slice(0, -5), j = JSON.parse(fs.readFileSync(path.join(adir, f), 'utf8'));
    const fr = Object.values(j.frames), img = decodePng(fs.readFileSync(path.join(adir, n + '.png')));
    const fw = fr[0].frame.w, fh = fr[0].frame.h;
    // Re-blit into a tight strip (frame i at i*fw) in case pxl ever pads.
    const strip = blank(fw * fr.length, fh);
    fr.forEach((q, i) => blit(strip, img, i * fw, 0, q.frame.x, q.frame.y, fw, fh));
    const durs = fr.map((q) => q.duration || 125);
    items.push({ name: n, img: strip, fw, fh, frames: fr.length, durs });
  }
  if (!items.length) continue;

  // Shelf pack, tallest first.
  const pad = 1, maxW = cfg.width || 512;
  items.sort((a, b) => b.img.h - a.img.h || b.img.w - a.img.w || (a.name < b.name ? -1 : 1));
  let x = 0, y = 0, rowH = 0, W = 0;
  for (const it of items) {
    if (x && x + it.img.w > maxW) { x = 0; y += rowH + pad; rowH = 0; }
    it.x = x; it.y = y; x += it.img.w + pad; rowH = Math.max(rowH, it.img.h); W = Math.max(W, it.x + it.img.w);
  }
  const sheet = blank(W, y + rowH);
  for (const it of items) blit(sheet, it.img, it.x, it.y);
  const png = encodePng(sheet);
  fs.writeFileSync(path.join(IMG, name + '.png'), png);

  const frames = {};
  for (const it of items.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const a = anchorFor(cfg, it.name, it.fw, it.fh);
    const e = { x: it.x, y: it.y, w: it.fw, h: it.fh, ax: a[0], ay: a[1], frames: it.frames, fps: 0 };
    if (it.frames > 1) {
      const ms = it.durs[0];
      e.fps = Math.round(1000 / ms * 10) / 10;
      if (it.durs.some((d) => d !== ms)) e.durs = it.durs;
      const once = cfg.once; if (typeof once === 'function' ? once(it.name) : (once || []).includes(it.name)) e.loop = false;
    }
    // contact-shadow size for things that stand on the ground (props, nature, buildings, bosses, crops)
    if (cfg.shadow) { const sh = typeof cfg.shadow === 'function' ? cfg.shadow(it.name, it.fw, it.fh) : null; if (sh) e.sh = sh; }
    frames[it.name] = e;
  }
  // Aliases (art/meta.js): extra names for existing sprites, e.g. the baseline's 'prop_tree_0' seam.
  for (const [al, target] of Object.entries(meta.aliases || {})) if (frames[target]) frames[al] = Object.assign({ alias: target }, frames[target], frames[target].sh ? { autoShadow: true } : {});
  sheets[name] = { png, frames, w: sheet.w, h: sheet.h, data: sheet };
  manifest.sheets[name] = { file: 'assets/images/' + name + '.png', w: sheet.w, h: sheet.h, anchor: cfg.anchor || 'bottom', note: cfg.note || '', frames };
}

function anchorFor(cfg, n, w, h) {
  const o = (cfg.anchors || {})[n] || (meta.anchors || {})[n];
  if (o) return typeof o === 'function' ? o(w, h) : o;
  const mode = cfg.anchor || 'bottom';
  if (mode === 'center') return [Math.floor(w / 2), Math.floor(h / 2)];
  if (mode === 'topleft') return [0, 0];
  return [Math.floor(w / 2), h - 1];   // bottom-center: the bottom pixel row sits on the ground point
}

// ------------------------------------------------------------------ palette audit
const colors = new Map();
for (const [n, s] of Object.entries(sheets)) {
  const d = s.data.data;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3]) {
    const hex = '#' + [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('') + (d[i + 3] < 255 ? d[i + 3].toString(16).padStart(2, '0') : '');
    if (!colors.has(hex)) colors.set(hex, new Set());
    colors.get(hex).add(n);
  }
}
const allowed = new Set(Object.values(meta.palette || {}).map((c) => c.toLowerCase()));
const stray = [...colors.keys()].filter((c) => allowed.size && !allowed.has(c));
console.log(`palette: ${colors.size} colors used across ${Object.keys(sheets).length} sheets (limit ${MAX_COLORS})`);
if (stray.length) console.warn('  colors outside the master palette: ' + stray.map((c) => c + ' [' + [...colors.get(c)].join(',') + ']').join(' '));
if (colors.size > MAX_COLORS) console.warn('  WARNING: more than ' + MAX_COLORS + ' colors');

// ------------------------------------------------------------------ outputs
const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
manifest.version = stamp;
manifest.generated = 'tools/build-art.js from art/*.px.js (claude-pxl)';
fs.writeFileSync(path.join(IMG, 'manifest.json'), JSON.stringify(manifest, null, 1));
const js = ['/* Moss Moon art atlas. GENERATED by tools/build-art.js from art/*.px.js; do not edit by hand. */',
  "'use strict';",
  'window.MM_ART = {version:' + JSON.stringify(stamp) + ',sheets:{'];
const ent = Object.entries(sheets);
ent.forEach(([n, s], i) => {
  js.push(JSON.stringify(n) + ':{w:' + s.w + ',h:' + s.h + ',src:"data:image/png;base64,' + s.png.toString('base64') + '",');
  js.push('frames:' + JSON.stringify(s.frames) + '}' + (i < ent.length - 1 ? ',' : ''));
});
js.push('}};');
fs.writeFileSync(OUT_JS, js.join('\n') + '\n');
const total = ent.reduce((a, [, s]) => a + Object.keys(s.frames).length, 0);
console.log(`wrote ${path.relative(ROOT, OUT_JS)} (${(fs.statSync(OUT_JS).size / 1024).toFixed(0)} KB, ${total} sprites in ${ent.length} sheets)`);
if (failed) { console.error('some art files failed'); process.exit(1); }
