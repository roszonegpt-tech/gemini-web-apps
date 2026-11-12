/* Crown of Dust - menus (src/ui/menus.js). Title, hero pick, map furniture, camp management, briefing, results, raids, wanted posters. */
(function () {
'use strict';
const CD = window.CD, U = CD.U, D = CD.Data, K = CD.Camp, INK = window.INK, $ = U.$, mk = U.mk, btn = U.btn;
const UI = CD.UI = {};
const root = () => $('ui');
function screen(solid) { const r = root(); U.clear(r); r.className = 'on' + (solid ? ' solid' : ''); r.scrollTop = 0; return r; }
UI.hide = function () { const r = root(); U.clear(r); r.className = ''; };
function modal(title, cls) { const m = mk('div', 'modal', null, root()), p = mk('div', 'panel', null, m); root().classList.add('on'); if (title) mk('h2', cls, title, p); return {m: m, p: p, close: () => { m.remove(); }}; }
const stat = (p, a, b) => { const s = mk('div', 'stat', null, p); mk('span', null, a, s); mk('b', null, b, s); return s; };

/* paint a character straight onto a card canvas with the lab painter */
UI.portrait = function (cv, look, o) {
  o = o || {}; const dpr = Math.min(window.devicePixelRatio || 1, 2), r = cv.getBoundingClientRect(), w = Math.max(40, Math.round((r.width || 200) * dpr)), h = Math.max(40, Math.round((r.height || 120) * dpr));
  cv.width = w; cv.height = h; const c = cv.getContext('2d'), tall = look.mount && look.mount !== 'none' ? 96 : 72, s = h / tall * (o.zoom || 1);
  try { INK.draw(c, look, o.act || 'idle', o.f || 0, o.dir || 'SE', {x: w / 2, y: h * 0.93, scale: s, ground: true}); } catch (e) { /* a look the painter rejects leaves the card blank */ }
};
function lookOf(id) { return D.units[id].look; }
function weaponLine(id) { const u = D.units[id], w = D.weapons[u.weapon], sp = D.specials[D.specialOf(u.weapon)]; return w.name + ' · ' + sp[0]; }
function card(host, id, o) {
  o = o || {}; const u = D.units[id], c = mk('div', 'card' + (o.cls ? ' ' + o.cls : ''), null, host), cv = mk('canvas', null, null, c); mk('h3', null, u.name, c); mk('p', null, o.sub || weaponLine(id), c); if (o.txt !== false) mk('p', null, o.txt || u.blurb || '', c);
  requestAnimationFrame(() => UI.portrait(cv, o.look || u.look, o.port)); return c;
}

/* ================= title ================= */
UI.title = function () {
  const r = screen(false), t = mk('div', 'title', null, r), h = mk('h1', null, null, t); h.innerHTML = 'Ink Outlaws<b>Crown of Dust</b>';
  const row = mk('div', 'row', null, t), has = !!CD.Save.load();
  if (has) btn('Continue', 'alt', () => { if (K.load()) CD.go('map'); else UI.newGame(); }, row);
  btn('New game', has ? '' : 'alt', () => UI.newGame(), row);
  btn('Wanted posters', '', () => UI.codex(() => UI.title()), row);
  const row2 = mk('div', 'row', null, t);
  const sb = btn('', 'sm', () => { CD.Save.settings.sound = !CD.Save.settings.sound; CD.Sfx.setOn(CD.Save.settings.sound); CD.Save.saveSettings(); sb.textContent = 'Sound: ' + (CD.Save.settings.sound ? 'on' : 'off'); }, row2); sb.textContent = 'Sound: ' + (CD.Save.settings.sound ? 'on' : 'off');
  const lab = mk('a', 'b sm', 'Open the Chunk Lab', row2); lab.href = 'docs/lab/Chunk_Lab_Ink_Outlaws_v0.5.0.html'; lab.style.textDecoration = 'none'; lab.style.display = 'inline-flex'; lab.style.alignItems = 'center'; if (CD.SINGLE) lab.style.display = 'none';
  mk('small', null, 'v' + CD.VERSION + ' · every sprite, building and tree is drawn in code by the Chunk Lab ink painter', t);
};
UI.newGame = function () {
  const r = screen(true), hd = mk('header', 'top', null, r); mk('h1', null, null, hd).innerHTML = 'Pick your <b>captain</b>'; mk('span', 'sp', null, hd); btn('Back', 'sm', () => UI.title(), hd);
  const s = mk('div', 'screen', null, r); mk('p', 'note', 'The other two stay around Dry Gulch and can be hired later. Whoever leads decides the special move; weapons can be swapped at the armoury.', s);
  const g = mk('div', 'grid', null, s), ids = ['harrow', 'goro', 'wren']; if (K.ensureCustom()) ids.push('custom');
  let sel = ids[0]; const cards = {};
  ids.forEach(id => { const c = card(g, id, {port: {zoom: 1.5}}); c.style.cursor = 'pointer'; c.onclick = () => { sel = id; sync(); CD.Sfx.play('click'); }; cards[id] = c; c.querySelector('canvas').style.height = '170px'; });
  const sync = () => ids.forEach(id => cards[id].classList.toggle('sel', id === sel)); sync();
  if (ids.indexOf('custom') < 0) mk('p', 'note', 'Tip: design a character in the Chunk Lab (title screen) and it appears here as a fourth captain.', s);
  const row = mk('div', 'row', null, s); btn('Ride into Dry Gulch', 'alt', () => { K.fresh(sel); CD.Map.sel = 'gulch'; CD.Map.invalidate(); CD.go('map', {intro: true}); }, row);
};

/* ================= campaign map furniture ================= */
UI.mapChrome = function (arg) {
  const r = screen(false), G = CD.G, bar = mk('div', null, null, r); bar.id = 'mapBar';
  mk('h1', null, null, bar).innerHTML = 'Crown of <b>Dust</b>'; const st = mk('span', 'chip', null, bar); st.id = 'mapStat'; mk('span', 'sp', null, bar);
  btn('Camp', 'alt', () => UI.camp('posse'), bar); btn('Posters', '', () => UI.codex(() => CD.go('map')), bar); btn('Menu', '', () => UI.pauseMenu(), bar);
  const info = mk('div', 'panel', null, r); info.id = 'mapInfo'; const log = mk('div', 'panel', null, r); log.id = 'mapLog';
  UI.mapStat(); G.log.slice(0, 8).forEach(l => mk('p', null, l, log));
  if (arg && arg.intro && !G.tut) { G.tut = 1; K.save(); const m = modal('The Tally Basin');
    m.p.insertAdjacentHTML('beforeend', '<p>Three powers carved up the basin: the <b>Greenskin Corsairs</b> in the south-west swamps, the <b>Hollow Court</b> in the dead woods, and the <b>Gilded Crown</b> in the east.</p><p>Each day, ride out against a territory that touches your land. Winning takes it: more gold every day, sometimes a prisoner freed for the gang. Then the enemy moves, and may raid you back.</p><p>Spend gold in <b>Camp</b>: hire a posse, buy weapons, build up Dry Gulch. Break both lesser strongholds to open Castle Gilt.</p>');
    btn('Saddle up', 'alt', m.close, mk('div', 'row', null, m.p)); }
  if (arg && arg.note) { const m = modal(arg.note.title); mk('p', null, arg.note.txt, m.p); btn('Right', 'alt', m.close, mk('div', 'row', null, m.p)); }
};
UI.mapStat = function () { const G = CD.G, e = $('mapStat'); if (e) e.innerHTML = 'Day <b>' + G.day + '</b> · Gold <b>' + G.gold + '</b> · +' + K.income() + '/day · Land <b>' + K.owned().length + '</b>/' + D.terr.length; };
UI.mapInfo = function (t) {
  const p = $('mapInfo'); if (!p || !t) return; U.clear(p); const G = CD.G, own = G.own[t.id], f = D.factions[own];
  mk('h2', null, t.name, p); const c = mk('span', 'chip', f.name, p); c.style.background = f.color;
  mk('p', null, t.txt, p); stat(p, 'Pays', t.income + ' gold a day');
  if (own !== 'outlaw') { const spec = K.specFor(t); stat(p, 'Job', D.missionNames[spec.type] + ' · danger ' + '◆'.repeat(t.tier)); stat(p, 'Bounty', t.reward + ' gold');
    if (spec.prisoner) stat(p, 'Held here', D.units[spec.prisoner].name);
    const row = mk('div', 'row', null, p);
    if (K.canAttack(t)) btn('Ride out', 'alt', () => UI.brief(t, spec), row); else mk('p', 'note', K.whyNot(t), p); }
  else if (t.home) { const row = mk('div', 'row', null, p); btn('Open camp', 'alt', () => UI.camp('posse'), row); }
};
UI.pauseMenu = function () {
  const m = modal('Menu'), row = mk('div', 'row col', null, m.p);
  btn('Back to the map', 'alt', m.close, row);
  const sb = btn('', '', () => { CD.Save.settings.sound = !CD.Save.settings.sound; CD.Sfx.setOn(CD.Save.settings.sound); CD.Save.saveSettings(); sb.textContent = 'Sound: ' + (CD.Save.settings.sound ? 'on' : 'off'); }, row); sb.textContent = 'Sound: ' + (CD.Save.settings.sound ? 'on' : 'off');
  btn('Save and quit to title', '', () => { K.save(); CD.go('title'); }, row);
  mk('p', 'note', 'The campaign saves in this browser after every day.', m.p);
};

/* ================= briefing ================= */
const BRIEF = {raid: 'Burn every tent inside the palisade, then topple their standard. Tents keep sending fighters until they burn.', rescue: 'Smash the cage, then walk the prisoner back down the trail alive. The whole camp will come after you.',
  heist: 'Grab the three strongboxes and get back to the wagon. The alarm goes up at the first box.', defend: 'Riders are coming in waves. Keep the town hall standing. Spend scrip at the surveyor stakes: barricades, gun nests, campfires, powder kegs.',
  boss: 'A stronghold. Break in, and put down whoever runs it.'};
UI.brief = function (t, spec, onGo) {
  const G = CD.G, m = modal(D.missionNames[spec.type] + ': ' + spec.name), f = D.factions[spec.faction];
  const c = mk('span', 'chip', f.name, m.p); c.style.background = f.color;
  mk('p', null, BRIEF[spec.type], m.p); if (spec.prisoner && spec.type !== 'rescue') mk('p', null, D.units[spec.prisoner].name + ' is caged in the camp. Break the cage and they fight for you.', m.p);
  stat(m.p, 'Captain', D.units[G.hero].name + (G.mount ? ' (mounted)' : '')); stat(m.p, 'Weapons', G.weapons.map(w => D.weapons[w].name).join(' / '));
  stat(m.p, 'Posse', spec.posse.length ? spec.posse.map(id => D.units[id].name.split(' ')[0]).join(', ') : 'Nobody. Hire some in Camp.'); stat(m.p, 'Danger', '◆'.repeat(spec.tier));
  const row = mk('div', 'row', null, m.p);
  btn('Go', 'alt', () => { m.close(); if (onGo) onGo(); else UI.launch(t, spec); }, row); btn('Not yet', '', m.close, row);
};
UI.launch = function (t, spec, raid) {
  for (const u of CD.Mission.start(spec, res => UI.afterMission(t, spec, res, raid)).units) CD.G.seen[u.def.id] = 1;
  CD.go('mission');
};
UI.afterMission = function (t, spec, res, raid) {
  const G = CD.G; CD.go('map'); CD.Map.invalidate();
  let out = null;
  if (raid) { G.missions++; G.kills += res.kills; G.gold += res.gold; out = K.resolveRaid(raid, res.win); } else K.applyAttack(t, res);
  K.save(); CD.Map.invalidate(); UI.mapStat();
  const m = modal(res.win ? 'Victory' : 'Defeat', 'big');
  mk('p', null, res.win ? (raid ? t.name + ' holds.' : t.name + ' is yours.') : (res.why || 'The day is lost.'), m.p);
  stat(m.p, 'Gold', '+' + res.gold); stat(m.p, 'Enemies down', String(res.kills)); stat(m.p, 'Time', Math.floor(res.time / 60) + ':' + String(Math.floor(res.time % 60)).padStart(2, '0'));
  if (res.freed) stat(m.p, 'Freed', D.units[res.freed].name + ' joins the gang');
  if (res.lost && res.lost.length) stat(m.p, 'Knocked out', res.lost.map(id => D.units[id].name.split(' ')[0]).join(', ') + ' (back tomorrow)');
  const row = mk('div', 'row', null, m.p);
  btn('Continue', 'alt', () => { m.close(); if (out === 'gameover') return UI.gameOver(raid); if (G.won) return UI.victory(); if (raid) { CD.go('map'); return; } UI.nextDay(); }, row);
};
UI.nextDay = function () {
  const d = K.endDay(); CD.Map.invalidate();
  if (!d.raid) { CD.go('map', {note: {title: 'Day ' + CD.G.day, txt: 'The land paid ' + d.income + ' gold overnight. The trails are quiet.'}}); return; }
  CD.go('map'); UI.raid(d.raid, d.income);
};
UI.raid = function (raid, income) {
  const t = raid.t, f = D.factions[raid.faction], m = modal('Raid on ' + t.name + '!', 'big'); const c = mk('span', 'chip', f.name, m.p); c.style.background = f.color;
  mk('p', null, 'Day ' + CD.G.day + '. The land paid ' + income + ' gold. Then riders were sighted: ' + f.name + ' are coming for ' + t.name + '.', m.p);
  const row = mk('div', 'row col', null, m.p);
  btn('Defend it yourself', 'alt', () => { m.close(); UI.launch(t, K.defendSpec(t, raid.faction), raid); }, row);
  if (!t.home) { const b = btn('', '', () => { m.close(); const held = K.autoRaid(raid), out = K.resolveRaid(raid, held); K.save(); CD.Map.invalidate(); CD.go('map', {note: {title: held ? 'The garrison held' : t.name + ' is lost', txt: held ? 'Your people threw the raiders back without you.' : 'The garrison broke. ' + f.name + ' hold ' + t.name + ' again.'}}); }, row);
    b.innerHTML = 'Trust the garrison<small>' + Math.round(raid.odds * 100) + '% to hold · watchtowers and a bigger gang improve this</small>'; }
  else mk('p', 'note', 'This is home. Nobody else is going to hold it.', m.p);
};
UI.gameOver = function (raid) {
  const m = modal('Dry Gulch has fallen', 'big'); mk('p', null, 'The gang scatters into the hills. It does not have to end this way.', m.p); const row = mk('div', 'row col', null, m.p);
  btn('Make the stand again', 'alt', () => { m.close(); UI.launch(raid.t, K.defendSpec(raid.t, raid.faction), raid); }, row); btn('Give up (title)', '', () => { CD.go('title'); }, row);
};
UI.victory = function () {
  const G = CD.G, r = screen(true), hd = mk('header', 'top', null, r); mk('h1', null, null, hd).innerHTML = 'The crown is <b>dust</b>';
  const s = mk('div', 'screen', null, r); mk('p', 'big', 'The Tally Basin is free.', s);
  mk('p', null, 'King Odo the Gilded is finished, the Tyrant with him. ' + D.units[G.hero].name + ' hangs the crown on a fence post outside Dry Gulch, where the cat sleeps in it.', s);
  const p = mk('div', 'panel', null, s); stat(p, 'Days', String(G.day)); stat(p, 'Missions', String(G.missions)); stat(p, 'Enemies down', String(G.kills)); stat(p, 'Gang', String(G.roster.length + 1)); stat(p, 'Gold', String(G.gold));
  const g = mk('div', 'grid', null, s); g.style.marginTop = '10px'; [G.hero].concat(G.roster).slice(0, 12).forEach(id => card(g, id, {txt: false, port: {act: 'dance1', f: 2}}));
  const row = mk('div', 'row', null, s); btn('Keep riding (free play)', 'alt', () => { G.won = false; G.wonOnce = true; K.save(); CD.go('map'); }, row); btn('Title', '', () => CD.go('title'), row);
};

/* ================= camp ================= */
UI.camp = function (tab) {
  const G = CD.G, r = screen(true), hd = mk('header', 'top', null, r); mk('h1', null, null, hd).innerHTML = 'Dry Gulch <b>camp</b>'; const gold = mk('small', null, '', hd); mk('span', 'sp', null, hd); btn('Back to the map', 'sm alt', () => CD.go('map'), hd);
  const tabs = mk('div', 'tabs', null, r), s = mk('div', 'screen', null, r);
  const T = [['posse', 'Posse'], ['hero', 'Captain'], ['town', 'Town']]; T.forEach(t => { const b = mk('button', t[0] === tab ? 'on' : '', t[1], tabs); b.onclick = () => { CD.Sfx.play('page'); UI.camp(t[0]); }; });
  const refresh = () => UI.camp(tab); gold.textContent = 'Gold ' + G.gold + ' · +' + K.income() + ' a day';
  if (tab === 'posse') {
    mk('p', 'note', 'Riding with you: ' + G.posse.length + ' of ' + K.cap() + ' seats (build the Saloon for more). Tap a gang member to seat or bench them.', s);
    const p1 = mk('div', 'panel', null, s); mk('h2', null, 'The gang', p1); const g1 = mk('div', 'grid', null, p1);
    if (!G.roster.length) mk('p', 'note', 'Nobody yet. Hire below, or free prisoners from enemy camps.', p1);
    G.roster.forEach(id => { const inP = G.posse.indexOf(id) >= 0, c = card(g1, id, {cls: inP ? 'sel' : '', txt: false}); const row = mk('div', 'row', null, c);
      btn(inP ? 'Riding' : 'Benched', 'sm' + (inP ? ' on' : ''), () => { if (!K.togglePosse(id)) CD.Sfx.play('hurt'); refresh(); }, row); btn('Make captain', 'sm', () => { K.lead(id); CD.Map.invalidate(); refresh(); }, row); });
    const p2 = mk('div', 'panel', null, s); p2.style.marginTop = '10px'; mk('h2', null, 'For hire', p2); const g2 = mk('div', 'grid', null, p2);
    K.forHire().forEach(h => { const c = card(g2, h.id, {cls: h.locked ? 'off' : ''}); const b = btn(h.locked ? h.locked : 'Hire · ' + h.cost + ' gold', 'sm alt', () => { if (K.hire(h.id, h.cost)) { CD.Sfx.play('coin'); refresh(); } }, mk('div', 'row', null, c)); b.disabled = !!h.locked || G.gold < h.cost; });
    const lockedN = D.outlaws.filter(id => D.units[id].tier === 3 && !G.freed[id]).length; if (lockedN) mk('p', 'note', lockedN + ' more outlaws are held prisoner in enemy camps. Their names show on the map.', s);
  } else if (tab === 'hero') {
    const p1 = mk('div', 'panel', null, s); mk('h2', null, 'Captain', p1); const g = mk('div', 'grid', null, p1); card(g, G.hero, {look: CD.Map.heroLook(), port: {zoom: 1.4}, sub: 'Health ' + Math.round(D.units[G.hero].hp * 1.15 * (1 + 0.15 * G.bld.doc))}).querySelector('canvas').style.height = '170px';
    const info = mk('div', 'card', null, g); mk('h3', null, 'Carrying', info);
    G.weapons.forEach((w, i) => { const sp = D.specials[D.specialOf(w)]; mk('p', null, (i ? 'Second: ' : 'First: ') + D.weapons[w].name + ' — special: ' + sp[0] + '. ' + sp[2], info); });
    mk('p', 'note', 'Swap between the two in a fight with Q or SWAP.', info);
    if (G.bld.stable) { mk('h3', null, 'Mount', info); const row = mk('div', 'row', null, info); btn('On foot', 'sm' + (!G.mount ? ' on' : ''), () => { K.setMount(null); CD.Map.invalidate(); refresh(); }, row);
      D.mounts.slice(0, G.bld.stable).forEach(mt => btn(mt[1], 'sm' + (G.mount === mt[0] ? ' on' : ''), () => { K.setMount(mt[0]); CD.Map.invalidate(); refresh(); }, row)); }
    const p2 = mk('div', 'panel', null, s); p2.style.marginTop = '10px'; mk('h2', null, 'Armoury', p2); const g2 = mk('div', 'grid', null, p2);
    D.armory.forEach(a => { const id = a[0], w = D.weapons[id], have = !!G.armory[id], c = mk('div', 'card' + (G.weapons.indexOf(id) >= 0 ? ' sel' : ''), null, g2), cv = mk('canvas', null, null, c); mk('h3', null, w.name, c);
      mk('p', null, (w.kind === 'gun' ? 'Ranged · ' + Math.round(w.dmg * w.pellets) + ' dmg · range ' + w.range : 'Melee · ' + w.dmg + ' dmg · reach ' + w.reach) + ' · ' + D.specials[D.specialOf(id)][0], c);
      requestAnimationFrame(() => UI.portrait(cv, CD.Ent.lookWith(D.units[G.hero].look, id), {act: w.kind === 'gun' || w.thrust ? 'shoot' : 'attack', f: w.kind === 'gun' || w.thrust ? 1 : 3, dir: 'E'}));
      const row = mk('div', 'row', null, c);
      if (!have) { const b = btn('Buy · ' + a[1] + ' gold', 'sm alt', () => { if (K.buyWeapon(id, a[1])) { CD.Sfx.play('coin'); refresh(); } }, row); b.disabled = G.gold < a[1]; }
      else { btn('First', 'sm' + (G.weapons[0] === id ? ' on' : ''), () => { K.equip(0, id); CD.Map.invalidate(); refresh(); }, row); btn('Second', 'sm' + (G.weapons[1] === id ? ' on' : ''), () => { K.equip(1, id); refresh(); }, row); } });
  } else {
    mk('p', 'note', 'Dry Gulch grows with the gang. Everything here applies to every mission.', s); const g = mk('div', 'grid', null, s);
    Object.keys(D.bld).forEach(key => { const b = D.bld[key], lv = G.bld[key], max = b.cost.length, c = mk('div', 'card', null, g), cv = mk('canvas', null, null, c); mk('h3', null, b.name + ' · level ' + lv + ' of ' + max, c); mk('p', null, b.txt, c);
      requestAnimationFrame(() => { const dpr = Math.min(window.devicePixelRatio || 1, 2), rc = cv.getBoundingClientRect(); cv.width = Math.round(rc.width * dpr); cv.height = Math.round(rc.height * dpr); const cx = cv.getContext('2d'), def = CD.Art.defs[b.art], sc = cv.height / (def.r[1] + def.r[2] + 6); cx.setTransform(sc, 0, 0, sc, cv.width / 2, cv.height - (def.r[2] + 3) * sc); CD.Art.draw(cx, b.art, 0, 0, b.v, 'outlaw'); });
      const row = mk('div', 'row', null, c); if (lv >= max) mk('span', 'chip', 'Complete', row); else { const bb = btn('Build · ' + b.cost[lv] + ' gold', 'sm alt', () => { if (K.upgrade(key)) { CD.Sfx.play('build'); refresh(); } }, row); bb.disabled = G.gold < b.cost[lv]; } });
  }
};

/* ================= wanted posters ================= */
UI.codex = function (back) {
  const G = CD.G || {seen: {}}, r = screen(true), hd = mk('header', 'top', null, r); mk('h1', null, null, hd).innerHTML = 'Wanted <b>posters</b>'; mk('small', null, Object.keys(D.units).length + ' faces of the Tally Basin', hd); mk('span', 'sp', null, hd); btn('Back', 'sm alt', back, hd);
  const s = mk('div', 'screen', null, r);
  ['outlaw', 'corsair', 'hollow', 'crown'].forEach(f => { const F = D.factions[f], p = mk('div', 'panel', null, s); p.style.marginTop = '10px'; const h = mk('h2', null, F.name, p); h.style.color = F.color; const g = mk('div', 'grid', null, p); g.style.gridTemplateColumns = 'repeat(auto-fill,minmax(150px,1fr))';
    Object.keys(D.units).forEach(id => { const u = D.units[id]; if (u.faction !== f || id === 'snigrider' || id === 'gloopling') return; const w = D.weapons[u.weapon];
      card(g, id, {sub: u.bite != null ? 'Beast · ' + u.hp + ' hp' : w.name + ' · ' + u.hp + ' hp', txt: u.blurb || (u.boss ? 'Boss.' : u.elite ? 'Captain.' : false), port: {zoom: u.mult > 1.5 ? 0.9 : 1}}); }); });
};
})();
