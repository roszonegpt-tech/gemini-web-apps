// WORLD walk-through test: MM.buildings.validate() == [] (+ {world:true} per region) and, for every building in every region,
// a grid path search over the live collision (baseline blockedAt + MM.world obstacles) from the player spawn to the door approach.
// Also drives the real moveActor along the found path to prove no collision trap. Usage: node tests/world-walk.js
const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('file://' + path.resolve(__dirname, 'world-harness.html')); await p.waitForFunction(() => window.__harnessReady && MM.art.ready); await p.waitForTimeout(300);
  const res = await p.evaluate(() => {
    const out = { validate: MM.buildings.validate(), regions: {} };
    for (const region of ['grove', 'village', 'tutorial']) {
      if (!REGIONS[region]) REGIONS[region] = { name: region, tint: null, mob: 'slime', level: 1 };
      goRegion(region); enemies = []; draw(); // apply layout
      const r = out.regions[region] = { validateWorld: MM.buildings.validate({ world: true }).filter((s) => !/unit|interior/.test(s)), doors: {} };
      const obs = MM.world.obstacles();
      const solid = (x, y) => blockedAt(x, y) || obs.some((o) => !o.low && (o.rect ? x > o.rect[0] - 0.22 && x < o.rect[2] + 0.22 && y > o.rect[1] - 0.22 && y < o.rect[3] + 0.22 : Math.hypot(x - o.x, y - o.y) < o.r + 0.22)) || MM.world.tileAt(x, y) === 'water';
      for (const bd of MM.world.buildings()) {
        const S = 4, N = 20 * S, start = [Math.round(9.7 * S), Math.round(10 * S)], goal = [Math.round(bd.door.ax * S), Math.round(bd.door.ay * S)];
        const prev = new Int32Array(N * N).fill(-2), q = [start[0] + start[1] * N]; prev[q[0]] = -1; let found = false;
        while (q.length) { const k = q.shift(), x = k % N, y = (k / N) | 0; if (Math.abs(x - goal[0]) <= 1 && Math.abs(y - goal[1]) <= 1) { found = k; break; }
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (X < 3 || Y < 3 || X > N - 3 || Y > N - 3) continue; const kk = X + Y * N; if (prev[kk] !== -2 || solid(X / S, Y / S)) continue; prev[kk] = k; q.push(kk); } }
        let walked = false;
        if (found !== false) { // replay the path with the real movement code
          const pts = []; for (let k = found; k >= 0; k = prev[k]) pts.unshift([(k % N) / S, ((k / N) | 0) / S]);
          game.x = 9.7; game.y = 10; game.height = 0;
          for (const [tx, ty] of pts) for (let i = 0; i < 6; i++) { const dx = tx - game.x, dy = ty - game.y; if (Math.hypot(dx, dy) < 0.02) break; moveActor(game, dx * 0.5, dy * 0.5); }
          walked = Math.hypot(game.x - bd.door.ax, game.y - bd.door.ay) < 0.45;
          const pr = MM.world.currentPrompt(); r.doors[bd.id] = { reachable: true, walked, prompt: pr && pr.id, enterable: bd.enterable };
        } else r.doors[bd.id] = { reachable: false };
      }
    }
    return out;
  });
  console.log(JSON.stringify(res, null, 1));
  let fail = res.validate.length;
  for (const r of Object.values(res.regions)) { fail += r.validateWorld.length; for (const d of Object.values(r.doors)) if (!d.reachable || !d.walked) fail++; }
  console.log(JSON.stringify({ fail, errors: errs })); await b.close(); process.exit(fail || errs.length ? 1 : 0);
})();
