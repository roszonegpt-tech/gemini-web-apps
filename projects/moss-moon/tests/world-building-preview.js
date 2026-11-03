// Renders the procedural building painter for a set of specs next to the witch (scale check). Usage: node tests/world-building-preview.js [out.png]
const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1400, height: 700 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.resolve(__dirname, 'world-harness.html') + '?wb=1'); await p.waitForFunction(() => window.__harnessReady); await p.waitForTimeout(300);
  const url = await p.evaluate(() => {
    const specs = [
      { fw: 4, fd: 3, wh: 66, rh: 40, wall: 'plaster', roofColor: 'shingle', door: { face: 'L', at: 22, w: 26, h: 54 }, windows: [{ face: 'L', at: 48, z: 26, w: 14, h: 16 }, { face: 'R', at: 24, z: 26, w: 14, h: 16 }], porch: { depth: 10 }, flowerBoxes: true, ivy: 0.5, weather: 0.2 },
      { fw: 4, fd: 3, wh: 66, rh: 40, wall: 'plank', roofColor: 'moss', ruined: true, weather: 0.8, door: { face: 'L', at: 22, w: 26, h: 54 }, windows: [{ face: 'L', at: 48, z: 26, w: 14, h: 16 }], shuttered: true },
      { fw: 4.5, fd: 3.5, wh: 70, rh: 44, wall: 'stone', roofColor: 'violet', door: { face: 'L', at: 30, w: 26, h: 54 }, windows: [{ face: 'L', at: 56, z: 26, w: 14, h: 16 }, { face: 'R', at: 28, z: 26, w: 14, h: 16 }], awning: { stripes: ['f', 'c'] }, steps: 2 },
      { fw: 3.5, fd: 3, wh: 70, rh: 36, wall: 'log', roof: 'thatch', door: { face: 'R', at: 24, w: 26, h: 54 }, windows: [{ face: 'L', at: 28, z: 28, w: 14, h: 14 }], locked: true },
    ];
    const W = 1300, H = 330, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.fillStyle = '#a6c593'; g.fillRect(0, 0, W, H);
    let x = 10;
    for (const s of specs) { const r = MM.worldBuildings.paint(s); g.drawImage(r.c, x, H - 20 - r.h + (r.h - r.ay)); const fx = x + r.ax; const img = recoloredAtlas || atlasImages[chosenLook.style]; g.drawImage(img, 0, 4 * 56, 48, 56, fx - 24 - 30, H - 20 - 49 + 6, 48, 56); x += r.w + 20; }
    return c.toDataURL();
  });
  const fs = require('fs'); fs.writeFileSync(process.argv[2] || 'tests/out/world-building-preview.png', Buffer.from(url.split(',')[1], 'base64'));
  console.log(JSON.stringify({ errors: errs })); await b.close();
})();
