// One-file offline build test: node tests/offline.js (builds both files; needs Playwright + Chromium).
// Copies each built file ALONE into an empty folder, opens it from file:// with the network switched off,
// and checks that nothing is requested or fails, the game loads, plays and has no errors.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('playwright');
(async () => {
  const root = path.resolve(__dirname, '..');
  const fail = (m) => { console.log('FAIL', m); process.exitCode = 1; };
  execSync('node tools/build_offline.js', { cwd: root, stdio: 'pipe' });
  execSync('node tools/build_offline.js --demo', { cwd: root, stdio: 'pipe' });
  // the relay address can be baked in, and a bad one is refused
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'billy-relay-'));
  execSync('node tools/build_offline.js ' + tmp, { cwd: root, stdio: 'pipe', env: Object.assign({}, process.env, { RELAY_URL: 'https://relay.example.com/' }) });
  if (!fs.readFileSync(path.join(tmp, 'get-em-billy.html'), 'utf8').includes("const NET_RELAY = 'https://relay.example.com';")) fail('relay address not baked in');
  try { execSync('node tools/build_offline.js ' + tmp, { cwd: root, stdio: 'pipe', env: Object.assign({}, process.env, { RELAY_URL: "x' + alert(1) + '" }) }); fail('a bad relay address was accepted'); } catch (e) { /* refused, as it should be */ }
  execSync('node tools/build_site.js', { cwd: root, stdio: 'pipe' });
  for (const f of ['index.html', 'manifest.webmanifest', 'sw.js', 'assets/icons/icon-192.png', '.nojekyll']) if (!fs.existsSync(path.join(root, 'build/site', f))) fail('site build is missing ' + f);
  fs.rmSync(tmp, { recursive: true, force: true });
  const b = await chromium.launch();
  for (const [name, demo] of [['get-em-billy.html', false], ['get-em-billy-demo.html', true]]) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'billy-'));
    fs.copyFileSync(path.join(root, 'build', name), path.join(dir, name));
    const ctx = await b.newContext({ viewport: { width: 480, height: 864 }, offline: true });
    const p = await ctx.newPage();
    const bad = [], errs = [];
    p.on('request', r => { if (!/^(file|data|blob):/.test(r.url())) bad.push('request ' + r.url()); });
    p.on('requestfailed', r => bad.push('failed ' + r.url()));
    p.on('pageerror', e => errs.push(e.message));
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto('file://' + path.join(dir, name));
    await p.waitForTimeout(800);
    const t = await p.evaluate(() => ({ title: document.title, state, demo: DEMO, links: [...document.querySelectorAll('link,script[src],img')].map(e => e.getAttribute('href') || e.getAttribute('src')).filter(u => u && !/^data:/.test(u)) }));
    if (t.state !== 'TITLE' || t.demo !== demo) fail(name + ' state ' + JSON.stringify(t));
    if (t.links.length) fail(name + ' loads other files: ' + t.links.join(','));
    // play: start a defend round and let it run
    await p.evaluate(() => { settings.storySeen = true; settings.fullscreen = false; mode = 'defend'; selMap.defend = 0; enterPlayers('kbL'); players.forEach(q => q.ready = true); });
    await p.waitForTimeout(2800);
    await p.keyboard.down('d'); await p.keyboard.press('Space'); await p.waitForTimeout(1200); await p.keyboard.up('d');
    const g = await p.evaluate(() => ({ state, sheep: sheep.length, players: players.length, sw: 'serviceWorker' in navigator && !!navigator.serviceWorker.controller }));
    if (g.state !== 'PLAYING' || g.sheep < 5) fail(name + ' did not play ' + JSON.stringify(g));
    // the whole interface keeps working without the network: styles, trailers, the editor, a screen smash
    const x = await p.evaluate(() => { startTrailer('billy'); const on = showcase.on; endShowcase(); openEditor(); const ed = state; toTitle(); return { on, ed }; });
    if (!x.on || x.ed !== 'EDITOR') fail(name + ' features ' + JSON.stringify(x));
    if (bad.length) fail(name + ' network use: ' + bad.join(' | '));
    if (errs.length) fail(name + ' errors: ' + errs.join(' | '));
    console.log(name, Math.round(fs.statSync(path.join(dir, name)).size / 1024) + ' KB', 'alone in', path.basename(dir));
    await ctx.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(process.exitCode ? 'OFFLINE FAILED' : 'OFFLINE OK');
  await b.close();
})();
