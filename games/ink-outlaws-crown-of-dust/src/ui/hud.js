/* Crown of Dust - mission HUD (src/ui/hud.js). DOM over the canvas, in the lab's paper / ink / mustard chips and buttons. */
(function () {
'use strict';
const CD = window.CD, U = CD.U, D = CD.Data, I = CD.Input, $ = U.$, mk = U.mk;
const H = CD.HUD = {built: false, last: {}, mapT: 0};
function set(id, prop, v) { const k = id + prop; if (H.last[k] === v) return; H.last[k] = v; const e = $(id); if (!e) return; if (prop === 'w') e.style.width = v + '%'; else if (prop === 'txt') e.textContent = v; else if (prop === 'show') e.style.display = v ? '' : 'none'; else if (prop === 'cls') e.className = v; }

H.build = function () {
  if (H.built) return; H.built = true;
  const hud = $('hud');
  hud.innerHTML = '<div id="hTop"><div id="hHero" class="chipbox"><b id="hName"></b><div class="bar"><i id="hHp"></i></div><div class="bar sp"><i id="hSp"></i></div><span id="hWeap"></span></div>' +
    '<div id="hObj"></div><div id="hRight"><div id="hRow"><span class="chip" id="hScrip"></span><button class="b sm" id="hPauseB" aria-label="Pause">II</button></div><canvas id="hMap" width="264" height="168"></canvas></div></div>' +
    '<div id="hBoss"><span id="hBossN"></span><div class="bar"><i id="hBossHp"></i></div></div><div id="hBanner"></div><div id="hPrompt"></div><div id="hBuild"></div>' +
    '<div id="hBottom"><div id="hPosse"></div><div id="hOrders"></div></div>' +
    '<div id="pad"><div id="stick"><div id="knob"></div></div><div id="btns"><button class="b" id="bSwap">SWAP</button><button class="b" id="bUse">USE</button><button class="b" id="bSpec">SPECIAL</button><button class="b" id="bRoll">ROLL</button><button class="b alt" id="bAtk">ATTACK</button></div></div>' +
    '<div id="hPause" class="overlay"><div class="panel"><h2>Paused</h2><div class="row col" id="hPauseRow"></div><p class="note" id="hHelp"></p></div></div>';
  [['follow', '1 Follow'], ['hold', '2 Hold'], ['charge', '3 Charge'], ['focus', '4 Focus']].forEach(o => { const b = U.btn(o[1], 'sm', () => CD.Mission.order(o[0]), $('hOrders')); b.id = 'ord_' + o[0]; });
  D.builds.forEach((b, i) => { const e = U.btn('', 'sm', () => CD.Mission.build(i), $('hBuild')); e.innerHTML = '<b>' + (i + 1) + ' ' + b[1] + '</b><small>' + b[2] + ' scrip · ' + b[3] + '</small>'; });
  I.bindStick($('stick'), $('knob')); I.bindHold($('bAtk'), 'attack');
  const tap = (id, n) => { const e = $(id); e.addEventListener('pointerdown', ev => { ev.preventDefault(); I.press(n); I.lastWasMouse = false; }); e.addEventListener('contextmenu', ev => ev.preventDefault()); };
  tap('bRoll', 'roll'); tap('bSpec', 'special'); tap('bSwap', 'swap'); tap('bUse', 'use');
  $('hPauseB').onclick = () => I.press('pause');
  U.btn('Resume', 'alt', () => I.press('pause'), $('hPauseRow'));
  const sb = U.btn('', '', () => { CD.Save.settings.sound = !CD.Save.settings.sound; CD.Sfx.setOn(CD.Save.settings.sound); CD.Save.saveSettings(); sb.textContent = 'Sound: ' + (CD.Save.settings.sound ? 'on' : 'off'); }, $('hPauseRow')); sb.textContent = 'Sound: ' + (CD.Save.settings.sound ? 'on' : 'off');
  const kb = U.btn('', '', () => { CD.Save.settings.shake = !CD.Save.settings.shake; CD.Save.saveSettings(); kb.textContent = 'Screen shake: ' + (CD.Save.settings.shake ? 'on' : 'off'); }, $('hPauseRow')); kb.textContent = 'Screen shake: ' + (CD.Save.settings.shake ? 'on' : 'off');
  U.btn('Abandon mission', '', () => { if (CD.M) { CD.M.paused = false; H.pause(false); CD.Mission.end(false, 'You pulled out.'); } }, $('hPauseRow'));
  $('hHelp').innerHTML = '<kbd>WASD</kbd> move · <kbd>mouse</kbd>/<kbd>J</kbd> attack · <kbd>Space</kbd>/<kbd>right click</kbd> roll · <kbd>F</kbd> special · <kbd>Q</kbd> swap weapon · <kbd>E</kbd> use / build · <kbd>1</kbd>–<kbd>4</kbd> posse orders · <kbd>Esc</kbd> pause';
};
H.show = function (M) {
  H.build(); H.last = {}; $('hud').classList.add('on'); $('hPause').classList.remove('on');
  const p = $('hPosse'); U.clear(p); H.chips = M.posse.map(u => { const c = mk('div', 'pchip', null, p); mk('b', null, u.name.split(' ')[0], c); const bar = mk('div', 'bar', null, c), i = mk('i', null, null, bar); return {u: u, el: c, i: i, w: -1, dead: false}; });
  $('hOrders').style.display = M.posse.length ? '' : 'none';
  set('hName', 'txt', M.hero.name);
};
H.hide = function () { const h = $('hud'); if (h) h.classList.remove('on'); };
H.pause = function (v) { $('hPause').classList.toggle('on', v); };
H.update = function (M) {
  const h = M.hero;
  set('hHp', 'w', Math.max(0, Math.round(h.hp / h.maxHp * 100)));
  const sp = D.specials[h.spec]; set('hSp', 'w', Math.round((1 - Math.max(0, h.spCd) / sp[1]) * 100));
  set('hWeap', 'txt', h.w.name + ' · ' + sp[0] + (h.spCd <= 0 ? ' ready' : ''));
  set('hScrip', 'txt', 'Scrip ' + M.scrip + (M.loot ? ' · Gold +' + M.loot : '') + (M.revives ? ' · Lives ' + M.revives : ''));
  const ob = CD.Mission.objective(M); set('hObj', 'txt', ob.txt);
  for (const c of H.chips) { const w = c.u.dead ? 0 : Math.round(c.u.hp / c.u.maxHp * 100); if (w !== c.w) { c.w = w; c.i.style.width = w + '%'; } if (c.u.dead !== c.dead) { c.dead = c.u.dead; c.el.classList.toggle('dead', c.dead); } }
  for (const o of ['follow', 'hold', 'charge']) set('ord_' + o, 'cls', 'b sm' + (M.order === o ? ' on' : '')); set('ord_focus', 'cls', 'b sm' + (M.focus ? ' on' : ''));
  const boss = (M.bosses || []).find(b => !b.dead && !b.ai.asleep) || (M.chief && !M.chief.dead && M.chief.ai.tg ? M.chief : null);
  set('hBoss', 'show', !!boss); if (boss) { set('hBossN', 'txt', boss.name); set('hBossHp', 'w', Math.max(0, Math.round(boss.hp / boss.maxHp * 100))); }
  set('hBanner', 'txt', M.bannerT > 0 ? M.bannerTxt : ''); set('hBanner', 'show', M.bannerT > 0);
  const n = M.near; set('hPrompt', 'show', !!n && !M.buildOpen && !M.over); if (n) set('hPrompt', 'txt', (U.COARSE ? 'USE: ' : 'E: ') + n.txt);
  set('hBuild', 'show', M.buildOpen);
  H.mapT -= 1; if (H.mapT <= 0) { H.mapT = 10; minimap(M); }
};
function minimap(M) {
  const cv = $('hMap'), c = cv.getContext('2d'), w = cv.width, hh = cv.height, sx = w / M.W, sy = hh / M.H;
  c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = M.B.ground; c.fillRect(0, 0, w, hh);
  c.fillStyle = U.INKC; for (const col of M.cols) if (col.wall && !col.gone && !col.s) c.fillRect(col.x * sx - Math.max(1.5, col.hw * sx), col.y * sy - Math.max(1.5, col.hh * sy), Math.max(3, col.hw * 2 * sx), Math.max(3, col.hh * 2 * sy));
  for (const s of M.structs) { if (s.gone || s.team === 3 || s.kind === 'gatepost') continue; c.fillStyle = s.team === 1 ? U.RED : s.team === 0 ? '#3f6f70' : '#7a6a58'; const r = s.hw > 12 ? 5 : 3.5; c.fillRect(s.x * sx - r, s.y * sy - r, r * 2, r * 2); }
  for (const st of M.stakes) if (!st.built) { c.strokeStyle = U.MUST; c.lineWidth = 2; c.strokeRect(st.x * sx - 3, st.y * sy - 3, 6, 6); }
  for (const u of M.units) { if (u.dead || u.dormant) continue; c.fillStyle = u.hero ? U.MUST : u.team === 0 ? U.PAPER : U.RED; const r = u.hero ? 5 : u.boss ? 6 : 3; c.beginPath(); c.arc(u.x * sx, u.y * sy, r, 0, 7); c.fill(); if (u.team === 0) { c.lineWidth = 1.5; c.strokeStyle = U.INKC; c.stroke(); } }
  const ob = CD.Mission.objective(M); if (ob.at) { c.strokeStyle = U.MUST; c.lineWidth = 3; c.beginPath(); c.arc(ob.at.x * sx, ob.at.y * sy, 8 + 2 * Math.sin(M.t * 5), 0, 7); c.stroke(); }
  const v = M.view; c.strokeStyle = 'rgba(22,18,20,.6)'; c.lineWidth = 1.5; c.strokeRect((M.cam.x - v.w / 2) * sx, (M.cam.y - v.h / 2) / U.YS * sy, v.w * sx, v.h / U.YS * sy);
}
})();
