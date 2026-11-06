// Builds the folder to upload to your own domain: node tools/build_site.js [--demo] [outDir]
//   PEER_URL=https://peer.yourdomain.com/billy node tools/build_site.js   (optional: your own PeerServer; default is the free PeerJS cloud)
// build/site/ holds index.html, vendor/ (PeerJS), the manifest, service worker and icons, so the
// game installs as an app and plays offline once visited. Serve it over https. --demo builds the limited demo to build/site-demo/.
const fs = require('fs');
const path = require('path');
const bakePeer = require('./peer_url.js');
const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const demo = args.includes('--demo');
const out = path.resolve(root, args.find((a) => !a.startsWith('--')) || (demo ? 'build/site-demo' : 'build/site'));
let html = bakePeer(fs.readFileSync(path.join(root, 'index.html'), 'utf8'));
let manifest = fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8');
let sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
if (demo) {
  if (!html.includes('const DEMO = false;')) { console.error('could not find the DEMO flag'); process.exit(1); }
  html = html.replace('const DEMO = false;', 'const DEMO = true;').replace(/goatGuardian/g, 'goatGuardianDemo')
    .replace('<title>Get em Billy</title>', '<title>Get em Billy (Demo)</title>').replace('content="Get em Billy">', 'content="Get em Billy Demo">');
  manifest = manifest.replace('"name": "Get em Billy"', '"name": "Get em Billy (Demo)"').replace('"short_name": "Get em Billy"', '"short_name": "Billy Demo"');
  sw = sw.replace('get-em-billy-', 'get-em-billy-demo-');
}
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'assets/icons'), { recursive: true });
fs.mkdirSync(path.join(out, 'vendor'), { recursive: true });
for (const f of fs.readdirSync(path.join(root, 'vendor'))) fs.copyFileSync(path.join(root, 'vendor', f), path.join(out, 'vendor', f));
fs.writeFileSync(path.join(out, 'index.html'), html);
fs.writeFileSync(path.join(out, 'manifest.webmanifest'), manifest);
fs.writeFileSync(path.join(out, 'sw.js'), sw);
for (const f of fs.readdirSync(path.join(root, 'assets/icons'))) fs.copyFileSync(path.join(root, 'assets/icons', f), path.join(out, 'assets/icons', f));
fs.writeFileSync(path.join(out, '.nojekyll'), '');
console.log('Site build: ' + path.relative(process.cwd(), out) + (process.env.PEER_URL ? '  (own PeerServer ' + process.env.PEER_URL + ')' : '  (PeerJS cloud broker)'));
