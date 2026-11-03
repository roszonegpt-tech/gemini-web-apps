// CPU profile of live play (grove, walking + casting) with Chromium's sampling profiler; prints top self-time functions and frame stats.
// node tests/perf-profile.js [index.html] [seconds=8] [width=1280 height=800 via env W/H]
const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const file = path.resolve(process.argv[2] || 'index.html'), secs = +(process.argv[3] || 8);
  const b = await chromium.launch(), c = await b.newContext({ viewport: { width: +(process.env.W || 1280), height: +(process.env.H || 800) }, deviceScaleFactor: +(process.env.DPR || 1) }), p = await c.newPage();
  await p.goto('file://' + file + (process.env.HASH || '#mm-new')); await p.waitForFunction(() => window.MM && MM.state.current === 'play', null, { timeout: 20000 }); await p.waitForTimeout(2500);
  await p.evaluate(() => { window.__f = []; let l = performance.now(); (function t(n) { window.__f.push(n - l); l = n; requestAnimationFrame(t); })(l); }); // observer only (measurement rAF)
  const cdp = await c.newCDPSession(p); await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 400 }); await cdp.send('Profiler.start');
  await p.keyboard.down('d'); for (let i = 0; i < secs * 2; i++) { await p.waitForTimeout(500); if (i % 4 === 1) await p.keyboard.press(' '); if (i === Math.floor(secs)) { await p.keyboard.up('d'); await p.keyboard.down('s'); } } await p.keyboard.up('s');
  const { profile } = await cdp.send('Profiler.stop');
  const f = await p.evaluate(() => window.__f.slice(5)); f.sort((a, b) => a - b);
  const total = profile.samples.length, self = new Map(), byId = new Map(profile.nodes.map(n => [n.id, n]));
  const dts = profile.timeDeltas; profile.samples.forEach((id, i) => { const n = byId.get(id), cf = n.callFrame, key = (cf.functionName || '(anon)') + ' ' + cf.url.split('/').pop() + ':' + cf.lineNumber; self.set(key, (self.get(key) || 0) + (dts[i] || 0)); });
  const sum = [...self.values()].reduce((a, c) => a + c, 0);
  // who calls the expensive native functions (drawImage / putImageData)?
  const parent = new Map(); profile.nodes.forEach(n => (n.children || []).forEach(ch => parent.set(ch, n.id)));
  const callers = new Map(); profile.samples.forEach((id, i) => { const n = byId.get(id); if (!/^(drawImage|putImageData|getImageData|fillRect|fill|stroke)$/.test(n.callFrame.functionName)) return; const pn = byId.get(parent.get(id)); const gp = pn && byId.get(parent.get(pn.id)); const k = n.callFrame.functionName + ' <- ' + (pn ? pn.callFrame.functionName + ' ' + pn.callFrame.url.split('/').pop() + ':' + pn.callFrame.lineNumber : '?') + (gp ? ' <- ' + gp.callFrame.functionName : ''); callers.set(k, (callers.get(k) || 0) + (dts[i] || 0)); });
  console.log('frames', f.length, 'median ms', f[f.length >> 1].toFixed(1), 'p95', f[Math.floor(f.length * 0.95)].toFixed(1), 'max', f[f.length - 1].toFixed(1));
  [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 28).forEach(([k, v]) => console.log((v / sum * 100).toFixed(1).padStart(5) + '%  ' + (v / 1000).toFixed(0).padStart(6) + 'ms  ' + k));
  console.log('--- native callers'); [...callers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([k, v]) => console.log((v / 1000).toFixed(0).padStart(6) + 'ms  ' + k));
  await b.close();
})();
