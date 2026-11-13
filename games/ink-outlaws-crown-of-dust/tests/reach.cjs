/* Reachability check: builds many mission maps and confirms the hero can physically reach every objective.
   node tests/reach.cjs [territory ids comma separated] [seeds=40]. Simulates a walker that follows W.path with real collision. */
const { chromium } = require('playwright'), serve = require('./serve.cjs');
(async () => {
  const ids = (process.argv[2] || 'ford,mudhook,croak,wreck,rise,fen,chapel,pale,toll,farms,garrison,gilt').split(','), n = +process.argv[3] || 40, s = await serve(0), b = await chromium.launch(), pg = await b.newPage();
  await pg.goto('http://localhost:' + s.address().port + '/index.html'); let bad = 0;
  const r = await pg.evaluate(([ids, n]) => { CD.Save.settings.sound = false; CD.Camp.fresh('harrow'); const W = CD.World, out = [];
    for (const id of ids) for (let k = 0; k < n; k++) { const t = CD.Data.terrById[id], spec = CD.Camp.specFor(t); spec.seed = k * 7919 + 13; spec.posse = [];
      const M = CD.Mission.start(spec, () => {}); const h = M.hero, goals = [];
      if (M.boxes) M.boxes.forEach(b => goals.push(['box', b.x, b.y, 13])); if (M.cage) goals.push(['cage', M.cage.x, M.cage.y + M.cage.hh + 6, 10]); if (M.totem) goals.push(['totem', M.totem.x, M.totem.y + 10, 14]);
      M.tents.filter(t => t.inCamp).forEach(t => goals.push(['tent', t.x, t.y + t.hh + 6, 10])); (M.bosses || []).forEach(b => goals.push(['boss', b.x, b.y, 24]));
      for (const g of goals) { h.x = M.start[0]; h.y = M.start[1]; let path = W.path(M, h.x, h.y, g[1], g[2]); if (!path) { out.push(id + ' seed ' + k + ' NO PATH to ' + g[0]); continue; }
        for (let i = 0; i < 4000 && path.length; i++) { const p = path[0], dx = p[0] - h.x, dy = p[1] - h.y, d = Math.hypot(dx, dy); if (d < 4 && path.length > 1) { path.shift(); continue; } if (d < 1) break; h.x += dx / d * 2; h.y += dy / d * 2; W.resolve(M, h); }
        const d = Math.hypot(h.x - g[1], h.y - g[2]); if (d > g[3]) out.push(id + ' seed ' + k + ' ' + g[0] + ' ends ' + d.toFixed(1) + ' away at ' + Math.round(g[1]) + ',' + Math.round(g[2])); } CD.M = null; }
    return out; }, [ids, n]);
  r.forEach(x => console.log(x)); console.log(r.length ? 'FAIL ' + r.length : 'PASS all reachable'); await b.close(); s.close(); process.exit(r.length ? 1 : 0);
})();
