#!/usr/bin/env node
// Moss & Moon single-file build (Node, no dependencies).
//   node tools/build.js            inline index.html's local scripts/styles/images -> builds/moss-moon-v<MM.version>.html (+ builds/LATEST.txt)
//   node tools/build.js --check    verify every file referenced by index.html exists (exit 1 if not); also lists planned modules
//   node tools/build.js --sync     rewrite the <!-- MM:SCRIPTS --> / <!-- MM:STYLES --> blocks of index.html from PLANNED
//                                  (only files that exist get a tag; UI order comes from src/ui/MANIFEST.txt when present)
//   --out <file>                   custom output path for the build
// Fails loudly (exit 1) on any missing referenced file.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
// The fixed script load order (notes/PHASE2_CONTRACT.md "File ownership"). '@ui' expands to the UI files.
const PLANNED = [
  'assets/js/atlas-data.js', 'assets/js/cast-data.js', 'assets/js/art-data.js',
  'src/core/legacy-shim.js', 'src/core/mm.js',
  'src/systems/audio.js', 'src/systems/art.js',
  'src/config/cinematics.js', 'src/systems/cinematics.js',
  'src/config/campaign.js', 'src/config/regions-visual.js',
  'src/core/baseline.js',
  'src/entities/bosses.js', 'src/systems/campaign.js', 'src/systems/world-render.js',
  'src/systems/lighting.js', 'src/systems/fx.js', 'src/systems/filter.js',
  '@ui',
  'src/core/boot.js',
];
const UI_DEFAULT = ['ui-core.js', 'ui-hud.js', 'ui-menus.js', 'ui-screens.js', 'ui-input.js'];
const STYLES = ['assets/css/ui.css'];
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.json': 'application/json', '.ico': 'image/x-icon' };

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const exists = (rel) => fs.existsSync(path.join(ROOT, rel)) && fs.statSync(path.join(ROOT, rel)).isFile();
const isLocal = (u) => u && !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(u);
function die(msg) { console.error('BUILD FAILED: ' + msg); process.exit(1); }

function uiFiles() {
  const mf = path.join(ROOT, 'src/ui/MANIFEST.txt');
  let names = UI_DEFAULT;
  if (fs.existsSync(mf)) {
    names = fs.readFileSync(mf, 'utf8').split(/\r?\n/).map((l) => l.replace(/#.*/, '').trim()).filter(Boolean);
  }
  return names.map((n) => (n.includes('/') ? n.replace(/^\.\//, '') : 'src/ui/' + n));
}
function plannedScripts() { return PLANNED.flatMap((p) => (p === '@ui' ? uiFiles() : [p])); }

function readIndex() { if (!fs.existsSync(INDEX)) die('index.html not found'); return fs.readFileSync(INDEX, 'utf8'); }
function stripComments(html) { return html.replace(/<!--[\s\S]*?-->/g, ''); }
function refs(html) {
  const live = stripComments(html), out = [];
  for (const m of live.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>\s*<\/script>/gi)) if (isLocal(m[1])) out.push({ kind: 'script', url: m[1] });
  for (const m of live.matchAll(/<link\b[^>]*>/gi)) { const rel = /\brel\s*=\s*["']([^"']+)["']/i.exec(m[0]), href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(m[0]); if (rel && href && isLocal(href[1])) out.push({ kind: /stylesheet/i.test(rel[1]) ? 'style' : 'link', url: href[1] }); }
  for (const m of live.matchAll(/<(?:img|source|video|audio)\b[^>]*\b(?:src|poster)\s*=\s*["']([^"']+)["']/gi)) if (isLocal(m[1])) out.push({ kind: 'media', url: m[1] });
  return out;
}
const clean = (u) => decodeURIComponent(u.split(/[?#]/)[0]);

function check(html) {
  const r = refs(html), missing = r.filter((x) => !exists(clean(x.url)));
  console.log('index.html references ' + r.length + ' local file(s).');
  for (const x of r) console.log((exists(clean(x.url)) ? '  ok      ' : '  MISSING ') + x.kind.padEnd(6) + ' ' + x.url);
  const planned = plannedScripts(), tagged = new Set(r.filter((x) => x.kind === 'script').map((x) => clean(x.url)));
  const notYet = planned.filter((p) => !exists(p)), untagged = planned.filter((p) => exists(p) && !tagged.has(p));
  if (notYet.length) console.log('Planned modules not on disk yet: ' + notYet.join(', '));
  if (untagged.length) console.log('WARNING: planned modules on disk but not in index.html (run --sync): ' + untagged.join(', '));
  for (const s of STYLES) if (exists(s) && !r.some((x) => clean(x.url) === s)) console.log('WARNING: ' + s + ' exists but is not linked (run --sync)');
  const order = r.filter((x) => x.kind === 'script').map((x) => planned.indexOf(clean(x.url))).filter((i) => i >= 0);
  if (order.some((v, i) => i && v < order[i - 1])) console.log('WARNING: script tags are not in the contract load order');
  if (missing.length) die(missing.length + ' referenced file(s) missing: ' + missing.map((x) => x.url).join(', '));
  console.log('check ok');
}

function sync(html) {
  const scripts = plannedScripts(), present = scripts.filter(exists), absent = scripts.filter((p) => !exists(p));
  const sBlock = '<!-- MM:SCRIPTS BEGIN -->\n' + present.map((p) => '<script src="' + p + '"></script>').join('\n') + '\n<!-- MM:SCRIPTS END -->';
  const cBlock = '<!-- MM:STYLES BEGIN -->\n' + STYLES.filter(exists).map((p) => '<link rel="stylesheet" href="' + p + '">').join('\n') + (STYLES.some(exists) ? '\n' : '') + '<!-- MM:STYLES END -->';
  if (!/<!-- MM:SCRIPTS BEGIN -->[\s\S]*?<!-- MM:SCRIPTS END -->/.test(html)) die('index.html has no MM:SCRIPTS markers');
  let out = html.replace(/<!-- MM:SCRIPTS BEGIN -->[\s\S]*?<!-- MM:SCRIPTS END -->/, sBlock);
  if (/<!-- MM:STYLES BEGIN -->[\s\S]*?<!-- MM:STYLES END -->/.test(out)) out = out.replace(/<!-- MM:STYLES BEGIN -->[\s\S]*?<!-- MM:STYLES END -->/, cBlock);
  const extraUI = fs.existsSync(path.join(ROOT, 'src/ui')) ? fs.readdirSync(path.join(ROOT, 'src/ui')).filter((f) => f.endsWith('.js')).map((f) => 'src/ui/' + f).filter((f) => !scripts.includes(f)) : [];
  if (out !== html) fs.writeFileSync(INDEX, out);
  console.log((out !== html ? 'index.html updated: ' : 'index.html already in sync: ') + present.length + ' script(s).');
  if (absent.length) console.log('Not on disk (skipped): ' + absent.join(', '));
  if (extraUI.length) console.log('WARNING: src/ui files not in MANIFEST/defaults (not loaded): ' + extraUI.join(', '));
}

function dataURI(abs) {
  const ext = path.extname(abs).toLowerCase(), mime = MIME[ext];
  if (!mime) die('no MIME type for ' + path.relative(ROOT, abs));
  return 'data:' + mime + ';base64,' + fs.readFileSync(abs).toString('base64');
}
function inlineCssUrls(css, baseDir, label) {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, u) => {
    if (!isLocal(u) || /^data:/i.test(u)) return m;
    const abs = path.resolve(baseDir, clean(u));
    if (!fs.existsSync(abs)) die('missing file ' + u + ' referenced from ' + label);
    return 'url("' + dataURI(abs) + '")';
  });
}
function build(html) {
  const mmSrc = path.join(ROOT, 'src/core/mm.js');
  if (!fs.existsSync(mmSrc)) die('src/core/mm.js missing (needed for MM.version)');
  const vm = /MM\.version\s*=\s*['"]([^'"]+)['"]/.exec(fs.readFileSync(mmSrc, 'utf8'));
  if (!vm) die('MM.version not found in src/core/mm.js');
  const version = vm[1];
  const read = (u, kind) => { const rel = clean(u), abs = path.join(ROOT, rel); if (!exists(rel)) die('missing ' + kind + ' ' + u); return { rel, abs, text: fs.readFileSync(abs, 'utf8') }; };
  let out = html.replace(/<!--[\s\S]*?-->/g, (c) => (/MM:(SCRIPTS|STYLES)/.test(c) ? '' : c));
  let nScripts = 0, nStyles = 0, nMedia = 0;
  out = out.replace(/<script\b([^>]*)\bsrc\s*=\s*["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (m, a, u, b) => {
    if (!isLocal(u)) return m;
    const f = read(u, 'script'); nScripts++;
    if (/<!--\s*<script/i.test(f.text)) console.warn('WARNING: "<!-- <script" sequence inside ' + f.rel);
    const code = f.text.replace(/<\/script/gi, '<\\/script');
    return '<script' + (a + b).replace(/\s+$/, '') + '>/* ' + f.rel + ' */\n' + code + '\n</script>';
  });
  out = out.replace(/<link\b[^>]*>/gi, (m) => {
    const rel = /\brel\s*=\s*["']([^"']+)["']/i.exec(m), href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(m);
    if (!rel || !href || !isLocal(href[1])) return m;
    if (/stylesheet/i.test(rel[1])) { const f = read(href[1], 'stylesheet'); nStyles++; return '<style>/* ' + f.rel + ' */\n' + inlineCssUrls(f.text, path.dirname(f.abs), f.rel).replace(/<\/style/gi, '<\\/style') + '\n</style>'; }
    const abs = path.join(ROOT, clean(href[1])); if (!fs.existsSync(abs)) die('missing link target ' + href[1]);
    nMedia++; return m.replace(href[0], 'href="' + dataURI(abs) + '"');
  });
  out = out.replace(/(<(?:img|source|video|audio)\b[^>]*\b(?:src|poster)\s*=\s*)(["'])([^"']+)\2/gi, (m, pre, q, u) => {
    if (!isLocal(u)) return m;
    const abs = path.join(ROOT, clean(u)); if (!fs.existsSync(abs)) die('missing media ' + u);
    nMedia++; return pre + '"' + dataURI(abs) + '"';
  });
  out = out.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (m, a, css, c) => a + inlineCssUrls(css, ROOT, 'index.html <style>') + c);
  const left = refs(out).filter((x) => x.kind !== 'link');
  if (left.length) die('unresolved local references after inlining: ' + left.map((x) => x.url).join(', '));
  const outIdx = args.indexOf('--out');
  const name = 'moss-moon-v' + version + '.html';
  const dest = outIdx >= 0 && args[outIdx + 1] ? path.resolve(args[outIdx + 1]) : path.join(ROOT, 'builds', name);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, out);
  const sha = crypto.createHash('sha256').update(out).digest('hex');
  if (outIdx < 0) fs.writeFileSync(path.join(ROOT, 'builds', 'LATEST.txt'), name + '\nversion ' + version + '\nbytes ' + Buffer.byteLength(out) + '\nsha256 ' + sha + '\nbuilt ' + new Date().toISOString() + '\n');
  console.log('built ' + path.relative(process.cwd(), dest) + ' (' + (Buffer.byteLength(out) / 1024).toFixed(0) + ' KiB; ' + nScripts + ' scripts, ' + nStyles + ' styles, ' + nMedia + ' media inlined)');
}

const html = readIndex();
if (has('--sync')) sync(html);
else if (has('--check')) check(html);
else { check(html); build(html); }
