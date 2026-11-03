// Verifies every vendored Sprite Fusion effect runs headlessly and renders pixels; writes a contact sheet.
// node tests/sfvfx-test.js   -> tests/out/sfvfx-sheet.png
const { chromium } = require('playwright'); const path = require('path'), fs = require('fs');
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1300, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.setContent('<body style="margin:0;background:#1d2b2a"><canvas id=c width=1280 height=880></canvas></body>');
  await p.addScriptTag({ content: fs.readFileSync(path.join(__dirname, '../src/systems/sfvfx.js'), 'utf8') });
  const res = await p.evaluate(() => {
    const names = Object.keys(MM.sfvfx), W = 128, H = 100, PX = 2, out = [], cv = document.getElementById('c'), cx = cv.getContext('2d');
    cx.imageSmoothingEnabled = false; cx.fillStyle = '#1d2b2a'; cx.fillRect(0, 0, cv.width, cv.height);
    names.forEach((n, i) => {
      const r = { name: n }; const ox = (i % 5) * 256, oy = Math.floor(i / 5) * 176;
      try {
        const frame = { w: W, h: H, ox: 0, oy: 0, color: new Uint32Array(W * H), light: new Uint32Array(W * H) };
        const fx = MM.sfvfx[n]({ x: W * PX / 2, y: H * PX * 0.78, ground: H * PX * 0.78, area: { x: 0, y: 0, w: W * PX, h: H * PX }, box: [W - 16, H * PX * 0.78 - 32, 32, 32], seed: 7 });
        let lit = 0, frames = 0, done = false;
        const snaps = [8, 20, 40];
        for (let f = 0; f < 420 && !done; f++) {
          fx.update(1 / 60); frame.color.fill(0); frame.light.fill(0);
          for (const layer of ['back', 'front']) fx.draw(frame, layer);
          let n2 = 0; for (let k = 0; k < frame.color.length; k++) if (frame.color[k] >>> 24) n2++;
          lit = Math.max(lit, n2); frames = f;
          const si = snaps.indexOf(f);
          if (si >= 0) { const id = new ImageData(new Uint8ClampedArray(frame.color.buffer.slice(0)), W, H); const t = document.createElement('canvas'); t.width = W; t.height = H; t.getContext('2d').putImageData(id, 0, 0); cx.drawImage(t, ox + si * 0, oy, W, H); if (si === 0) {} else {} cx.drawImage(t, ox + (si === 0 ? 0 : 0), oy); }
          if (f === 20) { const id = new ImageData(new Uint8ClampedArray(frame.color.buffer.slice(0)), W, H); const t = document.createElement('canvas'); t.width = W; t.height = H; t.getContext('2d').putImageData(id, 0, 0); cx.fillStyle = '#1d2b2a'; cx.fillRect(ox, oy, W * 2, H); cx.drawImage(t, ox, oy, W * 2, H * 1); }
          done = fx.done();
        }
        r.maxLit = lit; r.frames = frames; r.done = done;
        cx.fillStyle = '#cfaa71'; cx.font = '11px monospace'; cx.fillText(n + (done ? '' : ' (loops)'), ox + 4, oy + H + 14);
      } catch (e) { r.error = String(e && e.stack || e).split('\n').slice(0, 2).join(' | '); }
      out.push(r);
    });
    return out;
  });
  await p.screenshot({ path: path.join(__dirname, 'out/sfvfx-sheet.png') });
  const bad = res.filter(r => r.error || !r.maxLit);
  console.log(res.map(r => `${r.name}: ${r.error ? 'ERROR ' + r.error : `lit=${r.maxLit} frames=${r.frames} done=${r.done}`}`).join('\n'));
  console.log(JSON.stringify({ effects: res.length, failing: bad.map(r => r.name), pageErrors: errs }));
  await b.close(); process.exit(bad.length || errs.length ? 1 : 0);
})();
