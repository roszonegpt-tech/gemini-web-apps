/* Test autopilot, injected by tests/campaign.cjs. Plays missions through the real input layer: walks the nav path to the
   objective, fights what is near, opens chests, builds at stakes, uses the special. Runs with god mode so it measures
   "can this mission be finished", not balance. */
window.startBot = function (opt) {
  opt = opt || {}; const CD = window.CD, I = CD.Input, W = CD.World; let path = null, pt = 0, lastX = 0, lastY = 0, stuck = 0;
  window.BOT = setInterval(function () {
    const M = CD.M; if (!M || M.state !== 'play') return; I.keys.left = I.keys.right = I.keys.up = I.keys.down = false; I.keys.attack = false;
    if (M.over || M.paused) return; if (opt.god !== false) M.god = true; I.lastWasMouse = false;
    const h = M.hero, ob = CD.Mission.objective(M); let e = null, bd = 150;
    if (M.hall) bd = 400;
    window.BOTIGN = window.BOTIGN || new Set(); if (M !== window.BOTM) { window.BOTM = M; window.BOTIGN = new Set(); }
    for (const u of M.units) if (u.team === 1 && !u.dead && !u.dormant && !window.BOTIGN.has(u.id)) { if (M.hall && Math.hypot(u.x - M.hall.x, u.y - M.hall.y) > 230) continue; const d = Math.hypot(u.x - h.x, u.y - h.y); if (d < bd) { bd = d; e = u; } }
    if (e) { if (window.BOTE !== e.id) { window.BOTE = e.id; window.BOTEH = e.hp; window.BOTET = M.t; } else if (e.hp < window.BOTEH) { window.BOTEH = e.hp; window.BOTET = M.t; } else if (M.t - window.BOTET > 8) { window.BOTIGN.add(e.id); e = null; } }   // ignore an enemy we cannot hurt
    let tgt = e, stop = e ? Math.min(60, (h.w.kind === 'gun' ? h.w.range * 0.5 : h.w.reach * 0.7) + e.r) : 16, objStruct = false;
    if (!tgt && ob.at) { tgt = ob.at; if (ob.at.isStruct && ob.at.hp != null) { objStruct = true; stop = (h.w.kind === 'gun' ? 70 : h.w.reach * 0.6) + (ob.at.r || 8); } else stop = ob.zone ? 14 : 8; }
    if (!tgt && M.hall) { tgt = {x: M.hall.x, y: M.hall.y + 50}; stop = 20; }
    if (!tgt) { let bd2 = 1e9; for (const u of M.units) if (u.team === 1 && !u.dead) { const d = Math.hypot(u.x - h.x, u.y - h.y); if (d < bd2) { bd2 = d; tgt = u; } } if (tgt) stop = 60; }
    if (M.near && M.near.k === 'chest') I.press('use');
    if (M.near && M.near.k === 'stake' && M.scrip >= 20 && opt.build !== false) { M.buildOpen = true; CD.Mission.build(1); }
    if (!tgt) return;
    const d = Math.hypot(tgt.x - h.x, tgt.y - h.y);
    if ((e || objStruct) && [0.2, 0.4, 0.6, 0.8].some(t => W.shotBlocked(M, h.x + (tgt.x - h.x) * t, h.y + (tgt.y - h.y) * t))) stop = 8;   // a wall is in the way: walk round it
    if (e || (objStruct && d < stop + 30)) { I.keys.attack = true; if (h.spCd <= 0 && e) I.press('special'); }
    if (d > stop) {
      let gx = tgt.x, gy = tgt.y; pt -= 0.05;
      if (!W.los(M, h.x, h.y, gx, gy)) { if (!path || pt <= 0) { path = W.path(M, h.x, h.y, gx, gy); pt = 0.5; } if (path && path.length) { while (path.length > 1 && Math.hypot(path[0][0] - h.x, path[0][1] - h.y) < 10) path.shift(); gx = path[0][0]; gy = path[0][1]; } else if (!path) window.BOTNOPATH = (window.BOTNOPATH || 0) + 1; } else path = null;
      const dx = gx - h.x, dy = gy - h.y; if (dx > 3) I.keys.right = true; if (dx < -3) I.keys.left = true; if (dy > 3) I.keys.down = true; if (dy < -3) I.keys.up = true;
      if (Math.hypot(h.x - lastX, h.y - lastY) < 0.5) { if (++stuck > 12) { I.press('roll'); stuck = 0; } } else stuck = 0; lastX = h.x; lastY = h.y;
    }
  }, 50);
};
window.stopBot = function () { clearInterval(window.BOT); const I = window.CD.Input; I.keys = {}; };
