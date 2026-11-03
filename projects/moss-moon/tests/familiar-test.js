// Familiar behaviour: it roams (not glued to the witch), actually walks (artMoving + walk frames), is brisk, and keeps up when the witch moves.
// node tests/familiar-test.js [index.html]
const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const file = path.resolve(process.argv[2] || 'index.html');
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1000, height: 640 } }); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto('file://' + file + '#mm-new'); await p.waitForFunction(() => window.MM && MM.state.current === 'play', null, { timeout: 20000 });
  const res = []; const ck = (n, ok, i) => { res.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i) : '')); };
  const fam = await p.evaluate(() => { world.familiar = 'cat'; familiarSprite.x = game.x + .55; familiarSprite.y = game.y - .55; return world.familiar; });
  // 1) idle witch for 24 s: sample the familiar every 100 ms
  const idle = await p.evaluate(async () => {
    const out = { d: [], moving: 0, n: 0, maxStep: 0, frames: new Set(), minD: 1e9 }; let last = null;
    for (let i = 0; i < 240; i++) {
      await new Promise(r => setTimeout(r, 100));
      const a = project(familiarSprite.x, familiarSprite.y), w = project(game.x, game.y), d = Math.hypot(a.x - w.x, a.y - w.y); out.d.push(d); out.minD = Math.min(out.minD, d);
      if (familiarSprite.artMoving > 0) { out.moving++; out.frames.add(Math.floor((familiarSprite.artDistance || 0) / 3) % 8); } out.n++;
      if (last) out.maxStep = Math.max(out.maxStep, Math.hypot(a.x - last.x, a.y - last.y)); last = a;
    }
    out.frames = out.frames.size; return out;
  });
  const mean = idle.d.reduce((a, c) => a + c, 0) / idle.d.length, spread = Math.max(...idle.d) - Math.min(...idle.d), moving = idle.moving / idle.n;
  ck('roams: distance from the witch varies', spread > 25, { mean: +mean.toFixed(1), spread: +spread.toFixed(1) });
  ck('not glued to the leg: spends time >30 px away', idle.d.filter(d => d > 30).length / idle.d.length > 0.35, idle.d.filter(d => d > 30).length / idle.d.length);
  ck('walks part of the time and rests part of the time', moving > 0.15 && moving < 0.9, +moving.toFixed(2));
  ck('walk animation cycles through frames', idle.frames >= 4, idle.frames);
  ck('brisk: peak speed >= 35 px/s', idle.maxStep / 0.1 >= 35, +(idle.maxStep / 0.1).toFixed(1));
  // 2) witch walks away for ~6 s then the familiar must be near again
  await p.evaluate(() => { game.x = 9.7; game.y = 10; });
  await p.keyboard.down('d'); await p.waitForTimeout(6000); await p.keyboard.up('d'); await p.waitForTimeout(3500);
  const follow = await p.evaluate(() => { const a = project(familiarSprite.x, familiarSprite.y), w = project(game.x, game.y); return { d: Math.hypot(a.x - w.x, a.y - w.y), wx: game.x }; });
  ck('keeps up with the witch', follow.d < 110, follow);
  ck('no page errors', errs.length === 0, errs.slice(0, 2));
  await b.close(); const bad = res.filter(x => !x).length; console.log(JSON.stringify({ pass: !bad, total: res.length })); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('CRASH', e.message); process.exit(2); });
