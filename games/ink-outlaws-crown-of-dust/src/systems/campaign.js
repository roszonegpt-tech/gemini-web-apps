/* Crown of Dust - campaign rules (src/systems/campaign.js). The day-by-day strategy layer: who owns what, gold, the gang, raids. */
(function () {
'use strict';
const CD = window.CD, U = CD.U, D = CD.Data;
const K = CD.Camp = {};
let G = null;
K.state = () => G;
K.fresh = function (heroId) {
  const def = D.units[heroId];
  G = CD.G = {day: 1, gold: 50, hero: heroId, weapons: [def.weapon, def.weapon === 'fists' ? 'revolver' : 'fists'], armory: {fists: 1, revolver: 1}, mount: null, roster: [], posse: [], freed: {},
    bld: {saloon: 0, smithy: 0, doc: 0, tower: 0, powder: 0, stable: 0}, own: {}, log: [], won: false, seed: (Math.random() * 1e9) | 0, kills: 0, missions: 0, seen: {}, at: 'gulch', tut: 0};
  G.armory[def.weapon] = 1; D.terr.forEach(t => { G.own[t.id] = t.own; });
  K.note('Day 1. ' + def.name + ' rides into Dry Gulch with fifty gold and a grudge.'); K.save(); return G;
};
K.load = function () { const s = CD.Save.load(); if (!s || !s.G) return null; const g = K.sanitize(s.G); if (!g) return null; G = CD.G = g; return G; };
/* Rebuild a campaign from untrusted data (storage, or a pasted save code): whitelist every field and clamp every value. */
K.sanitize = function (g) {
  if (!g || typeof g !== 'object') return null;
  const num = (v, lo, hi, d) => typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, Math.floor(v))) : d;
  const isOut = id => typeof id === 'string' && D.outlaws.indexOf(id) >= 0, uniq = a => a.filter((x, i) => a.indexOf(x) === i);
  let hero = g.hero; if (hero === 'custom' && !D.units.custom) K.ensureCustom(); if (hero !== 'custom' && !isOut(hero)) return null; if (hero === 'custom' && !D.units.custom) hero = 'harrow';
  const arr = (a, f, n) => Array.isArray(a) ? uniq(a.filter(f)).slice(0, n) : [];
  const wOk = id => typeof id === 'string' && D.weapons[id], o = {};
  o.day = num(g.day, 1, 9999, 1); o.gold = num(g.gold, 0, 99999, 0); o.seed = num(g.seed, 0, 2147483647, 1); o.hero = hero;
  o.roster = arr(g.roster, id => isOut(id) && id !== hero, 40); o.posse = arr(g.posse, id => o.roster.indexOf(id) >= 0, 8);
  const ws = arr(g.weapons, wOk, 2); o.weapons = ws.length === 2 ? ws : [D.units[hero].weapon, D.units[hero].weapon === 'fists' ? 'revolver' : 'fists'];
  o.armory = {}; Object.keys(g.armory && typeof g.armory === 'object' ? g.armory : {}).forEach(k => { if (wOk(k)) o.armory[k] = 1; }); o.weapons.forEach(w => { o.armory[w] = 1; });
  o.mount = D.mounts.some(m => m[0] === g.mount) ? g.mount : null;
  o.freed = {}; Object.keys(g.freed && typeof g.freed === 'object' ? g.freed : {}).forEach(k => { if (isOut(k)) o.freed[k] = 1; });
  o.bld = {}; Object.keys(D.bld).forEach(k => { o.bld[k] = num(g.bld && g.bld[k], 0, D.bld[k].cost.length, 0); });
  o.own = {}; D.terr.forEach(t => { const f = g.own && g.own[t.id]; o.own[t.id] = D.factions[f] ? f : t.own; }); o.own.gulch = 'outlaw';
  o.at = D.terrById[g.at] ? g.at : 'gulch'; o.won = g.won === true; o.wonOnce = g.wonOnce === true;
  o.kills = num(g.kills, 0, 1e7, 0); o.missions = num(g.missions, 0, 1e5, 0); o.tut = num(g.tut, 0, 9, 0);
  o.seen = {}; Object.keys(g.seen && typeof g.seen === 'object' ? g.seen : {}).forEach(k => { if (D.units[k]) o.seen[k] = 1; });
  o.log = Array.isArray(g.log) ? g.log.filter(x => typeof x === 'string').slice(0, 30).map(x => x.slice(0, 200)) : [];
  return o;
};
/* A save code is the campaign as one pasteable line, for moving it between browsers and devices. */
const CODE = 'CODSAVE1.';
K.exportCode = function () { if (!G) return ''; const json = JSON.stringify({v: 1, G: G}); return CODE + btoa(unescape(encodeURIComponent(json))); };
K.importCode = function (text) {
  try {
    const t = String(text || '').replace(/\s+/g, ''); if (t.indexOf(CODE) !== 0) return {ok: false, msg: 'That is not a Crown of Dust save code.'};
    const obj = JSON.parse(decodeURIComponent(escape(atob(t.slice(CODE.length))))), g = obj && obj.v === 1 ? K.sanitize(obj.G) : null;
    if (!g) return {ok: false, msg: 'The save code is damaged or from a different version.'};
    CD.Save.store({G: g}); return {ok: true};
  } catch (e) { return {ok: false, msg: 'The save code could not be read. Copy it again in full.'}; }
};
K.save = function () { if (G) CD.Save.store({G: G}); };
K.note = function (txt) { G.log.unshift(txt); if (G.log.length > 30) G.log.length = 30; };
/* the hero designed in the Chunk Lab becomes a real unit entry */
K.ensureCustom = function () {
  const look = CD.Save.labLook(); if (!look) return false;
  D.looks.custom = look; D.units.custom = {id: 'custom', name: 'The Stranger', faction: 'outlaw', look: look, hp: 105, spd: 30, r: 6, mult: 1, ai: 'melee', dmg: 1, bounty: 0, weapon: look.weapon, cost: 0, tier: 0, blurb: 'Drawn in the Chunk Lab. Nobody knows the name.'};
  return true;
};
K.cap = () => 2 + G.bld.saloon;
K.owned = () => D.terr.filter(t => G.own[t.id] === 'outlaw');
K.income = () => K.owned().reduce((a, t) => a + t.income, 0);
K.holds = f => D.terr.filter(t => G.own[t.id] === f);
K.canAttack = function (t) {
  if (G.own[t.id] === 'outlaw') return false;
  if (!D.neighbors(t.id).some(n => G.own[n] === 'outlaw')) return false;
  if (t.final && D.terr.some(o => o.stronghold && !o.final && G.own[o.id] !== 'outlaw')) return false;
  return true;
};
K.whyNot = function (t) {
  if (G.own[t.id] === 'outlaw') return 'Yours.';
  if (!D.neighbors(t.id).some(n => G.own[n] === 'outlaw')) return 'No trail from your land reaches it yet.';
  if (t.final) return "The castle gates stay shut until Snig's Wreck and the Pale Hall are both yours.";
  return '';
};
K.perk = () => ({tower: G.bld.tower, smithy: G.bld.smithy, doc: G.bld.doc, powder: G.bld.powder});
K.heroSpec = () => ({id: G.hero, weapons: G.weapons.slice(), mount: G.mount});
K.specFor = function (t) {
  const prisoner = t.prisoner && !G.freed[t.prisoner] ? t.prisoner : null; let type = t.mission;
  if (type === 'rescue' && !prisoner) type = 'raid';
  return {type: type, faction: G.own[t.id], biome: D.factions[t.own].biome, tier: t.tier, seed: (G.seed + U.hash(t.id) + G.day * 7919) | 0, name: t.name, reward: t.reward, prisoner: prisoner, hero: K.heroSpec(), posse: G.posse.slice(0, K.cap()), perk: K.perk(), terr: t.id};
};
K.defendSpec = function (t, faction) {
  const tier = U.clamp(1 + Math.floor((K.owned().length + G.day / 4) / 2.5), 1, 5);
  return {type: 'defend', faction: faction, biome: t.home ? 'desert' : D.factions[t.own].biome, tier: tier, seed: (G.seed + G.day * 104729) | 0, name: 'Defend ' + t.name, reward: 30 + tier * 10, hero: K.heroSpec(), posse: G.posse.slice(0, K.cap()), perk: K.perk(), terr: t.id, defend: true};
};
/* after an attack mission */
K.applyAttack = function (t, res) {
  G.missions++; G.kills += res.kills; G.gold += res.gold;
  if (res.win) { const was = G.own[t.id]; G.own[t.id] = 'outlaw'; G.at = t.id; K.note('Day ' + G.day + '. ' + t.name + ' taken from ' + D.factions[was].name + '. +' + res.gold + ' gold.');
    if (res.freed) { G.freed[res.freed] = 1; if (G.roster.indexOf(res.freed) < 0) G.roster.push(res.freed); if (G.posse.length < K.cap()) G.posse.push(res.freed); K.note(D.units[res.freed].name + ' joins the gang.'); }
    if (t.stronghold) K.note(D.factions[was].name + ' are broken. Their last camps lose heart.');
    if (t.final) G.won = true; }
  else K.note('Day ' + G.day + '. Beaten back from ' + t.name + '.' + (res.gold ? ' Kept ' + res.gold + ' gold.' : ''));
};
/* close the day: income, then maybe an enemy raid. returns {income, raid: {t, faction, odds} | null} */
K.endDay = function () {
  const inc = K.income(); G.gold += inc; G.day++;
  let raid = null; const rng = U.rng32((G.seed + G.day * 31337) | 0), cands = [];
  for (const t of K.owned()) for (const n of D.neighbors(t.id)) { const f = G.own[n]; if (f === 'outlaw') continue; const strong = D.terr.find(o => o.stronghold && o.own === f && G.own[o.id] === f); cands.push({t: t, faction: f, w: (strong ? 1 : 0.35) * (t.home ? 0.5 : 1)}); }
  const chance = G.day < 3 ? 0 : Math.min(0.6, 0.3 + G.day * 0.012);
  if (cands.length && rng() < chance) { let tot = cands.reduce((a, c) => a + c.w, 0), r = rng() * tot, pick = cands[0]; for (const c of cands) { r -= c.w; if (r <= 0) { pick = c; break; } }
    raid = {t: pick.t, faction: pick.faction, odds: K.garrisonOdds(pick.t)}; }
  K.save(); return {income: inc, raid: raid};
};
K.garrisonOdds = t => U.clamp(0.3 + 0.13 * G.bld.tower + 0.04 * G.roster.length + (t.home ? 0.1 : 0), 0.1, 0.9);
K.resolveRaid = function (raid, held) {
  const t = raid.t, f = D.factions[raid.faction].name;
  if (held) { K.note('Day ' + G.day + '. ' + f + ' raided ' + t.name + ' and were thrown back.'); return 'held'; }
  if (t.home) { K.note('Day ' + G.day + '. Dry Gulch burned.'); return 'gameover'; }
  G.own[t.id] = raid.faction; if (G.at === t.id) G.at = 'gulch'; K.note('Day ' + G.day + '. ' + t.name + ' fell to ' + f + '.'); return 'lost';
};
K.autoRaid = function (raid) { const rng = U.rng32((G.seed + G.day * 977 + 5) | 0); return rng() < raid.odds; };
/* hiring */
K.forHire = function () {
  const n = K.owned().length, out = [];
  for (const id of D.outlaws) { if (id === G.hero || G.roster.indexOf(id) >= 0) continue; const u = D.units[id];
    if (u.tier === 3) continue; const tier = u.tier === 0 ? 2 : u.tier, cost = u.tier === 0 ? 100 : u.cost; out.push({id: id, cost: cost, locked: tier === 2 && n < 3 ? 'Take 3 territories' : ''}); }
  return out;
};
K.hire = function (id, cost) { if (G.gold < cost) return false; G.gold -= cost; G.roster.push(id); if (G.posse.length < K.cap()) G.posse.push(id); K.save(); return true; };
K.togglePosse = function (id) { const i = G.posse.indexOf(id); if (i >= 0) G.posse.splice(i, 1); else if (G.posse.length < K.cap()) G.posse.push(id); else return false; K.save(); return true; };
K.lead = function (id) {                                     // swap the leader with someone from the roster
  const i = G.roster.indexOf(id); if (i < 0) return; G.roster[i] = G.hero; const pi = G.posse.indexOf(id); if (pi >= 0) G.posse[pi] = G.hero; G.hero = id;
  const w = D.units[id].weapon; G.armory[w] = 1; G.weapons = [w, G.weapons.find(x => x !== w) || 'fists']; K.save();
};
K.buyWeapon = function (id, cost) { if (G.armory[id]) return true; if (G.gold < cost) return false; G.gold -= cost; G.armory[id] = 1; K.save(); return true; };
K.equip = function (slot, id) { if (!G.armory[id]) return; const other = 1 - slot; if (G.weapons[other] === id) G.weapons[other] = G.weapons[slot]; G.weapons[slot] = id; K.save(); };
K.upgrade = function (key) { const b = D.bld[key], lv = G.bld[key]; if (lv >= b.cost.length || G.gold < b.cost[lv]) return false; G.gold -= b.cost[lv]; G.bld[key]++; if (key === 'stable' && !G.mount) G.mount = D.mounts[0][0]; K.save(); return true; };
K.setMount = function (m) { G.mount = m; K.save(); };
})();
