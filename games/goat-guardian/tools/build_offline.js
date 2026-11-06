// Builds ONE self-contained HTML file that runs offline: node tools/build_offline.js [--demo] [outDir]
//   build/get-em-billy.html        the full game
//   build/get-em-billy-demo.html   with --demo (3 routes, 3 arenas, 8 waves; see tools/build_demo.sh)
// Open it by double-clicking (file://), from a phone's Files app, or host it anywhere. Everything is inside
// the file: the page, the code, the icons (as data URIs) and all art and sound (made in code). It needs no
// other file and makes no network requests. RELAY_URL=https://... bakes in the 6-digit room code server. Online play still needs a connection between the players.
const fs = require('fs');
const bakeRelay = require('./relay_url.js');
const path = require('path');
const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const demo = args.includes('--demo');
const outDir = path.resolve(root, args.find(a => !a.startsWith('--')) || 'build');
let html = bakeRelay(fs.readFileSync(path.join(root, 'index.html'), 'utf8'));
const must = (cond, what) => { if (!cond) { console.error('build_offline: could not find ' + what); process.exit(1); } };
const icon = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'assets/icons/icon-192.png')).toString('base64');
// no manifest or service worker: a lone file can't carry them
must(/<link rel="manifest"[^>]*>\n?/.test(html), 'the manifest link');
html = html.replace(/<link rel="manifest"[^>]*>\n?/, '');
must(/<link rel="apple-touch-icon"[^>]*>/.test(html), 'the icon link');
html = html.replace(/<link rel="apple-touch-icon"[^>]*>/, `<link rel="icon" type="image/png" href="${icon}">\n<link rel="apple-touch-icon" href="${icon}">`);
const a = html.indexOf('// installable app: register the service worker');
const b = html.indexOf('} catch (e) { /* not available here */ }', a);
must(a > 0 && b > a, 'the service worker block');
html = html.slice(0, a) + html.slice(b + '} catch (e) { /* not available here */ }'.length).replace(/^\n/, '');
if (demo) {
  must(html.includes('const DEMO = false;'), 'the DEMO flag');
  html = html.replace('const DEMO = false;', 'const DEMO = true;').replace(/goatGuardian/g, 'goatGuardianDemo')
    .replace('<title>Get em Billy</title>', '<title>Get em Billy (Demo)</title>').replace('content="Get em Billy">', 'content="Get em Billy Demo">');
}
const ver = (fs.readFileSync(path.join(root, 'VERSION.md'), 'utf8').match(/Version:\*\*\s*([\d.]+)/) || [, '?'])[1];
html = html.replace('<!DOCTYPE html>', `<!DOCTYPE html>\n<!-- Get em Billy v${ver}${demo ? ' DEMO' : ''}: one-file offline build. Everything the game needs is inside this file. -->`);
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, demo ? 'get-em-billy-demo.html' : 'get-em-billy.html');
fs.writeFileSync(out, html);
console.log('Offline build: ' + path.relative(process.cwd(), out) + ' (' + Math.round(fs.statSync(out).size / 1024) + ' KB, v' + ver + (demo ? ', demo' : '') + ')');
