'use strict';
// Moss & Moon — campaign systems (owner: CAMPAIGN). Loads AFTER baseline.js and src/entities/bosses.js.
// Zero-patch integration: wraps baseline functions by name, mutates SPELLS/SEED_TYPES/REGIONS, and keeps its own
// serializable state (save section 'campaign'). Public API = MM.campaign (see notes/PHASE2_CONTRACT.md and
// notes/handoff/campaign.md). Every cross-module call is guarded so the game runs with or without MM core/UI/world/fx.
(function () {
  const MM = window.MM = window.MM || {};
  try { void world; void game; void SPELLS; void enemies; } catch (e) { console.warn('[campaign] baseline not available — campaign disabled', e); return; }
  const D = MM.CAMPAIGN_DATA;
  if (!D) { console.warn('[campaign] MM.CAMPAIGN_DATA missing (src/config/campaign.js not loaded)'); return; }
  const BOSS = () => MM.bosses;
  const KIT = () => MM.bosses?.kit;
  const STORY_REGIONS = ['forest', 'swamp', 'mountain'];
  const SIG = D.spells.map(s => s.id);
  const sigDef = id => D.spells.find(s => s.id === id);

  // ================================================================ utilities
  const listeners = {};
  function emit(name, data) {
    try { MM.bus?.emit?.(name, data); } catch (e) { console.error('[campaign] bus emit', name, e); }
    for (const fn of (listeners[name] || []).slice()) { try { fn(data); } catch (e) { console.error('[campaign] listener', name, e); } }
  }
  const fmt = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, k) => v && v[k] != null ? v[k] : m);
  const clone = o => JSON.parse(JSON.stringify(o));
  const tdist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const playerName = () => MM.game?.name || (typeof MM.game?.name === 'function' ? MM.game.name() : null) || 'little witch';
  const inPlay = () => !MM.state || !MM.state.current || MM.state.current === 'play';
  // Campaign bookkeeping is dormant in the tutorial sandbox and in any screen whose sim policy isn't 'world'.
  const SANDBOX_STATES = ['tutorial', 'logo', 'intro', 'title', 'creation', 'boot'];
  function dormant() {
    try {
      if (world.region === 'tutorial' || !D.regions[world.region]) return true;
      const cur = MM.state?.current; if (cur && SANDBOX_STATES.includes(cur)) return true;
      const sim = MM.screens?.current?.sim ?? MM.screens?.def?.(cur)?.sim; if (sim && sim !== 'world') return true;
    } catch (_) { }
    return false;
  }
  // timers that die with the current screen when MM.screens exists (phase 3 policy), else plain timeouts
  const later = (fn, ms) => { try { if (typeof MM.screens?.timeout === 'function') return MM.screens.timeout(fn, ms); } catch (_) { } return setTimeout(fn, ms); };
  let cinePlaying = false; const toastQueue = [];
  function toast(text, kind) {
    if (!text) return;
    if (cinePlaying) { toastQueue.push([text, kind]); return; }
    emit('toast', { text, kind: kind || 'info' });
    try { message(text); } catch (_) { }
  }
  const flushToasts = () => { while (toastQueue.length && !cinePlaying) { const [t, k] = toastQueue.shift(); toast(t, k); } };

  // ================================================================ state
  function fresh() {
    return {
      v: 1, started: false, chapter: 0, flags: {}, fragments: [], placed: [], restored: { forest: false, swamp: false, mountain: false },
      bosses: {}, requests: {}, relations: { marrow: 0, pip: 0, wren: 0 }, homestead: { level: 0 }, moonwell: { level: 0 },
      memories: [], rewarded: {}, tutorial: { step: 0, done: false }, endingSeen: false,
      items: {}, equipment: { ...D.start.equipment }, owned: Object.values(D.start.equipment), spells: { unlocked: ['moonbolt'], ranks: {} }, recipes: ['healing'],
      visited: { grove: true }, dungeon: {}, buffs: {}, seedBarrelDay: 0, gifts: {}, talked: {}, raidNight: -1,
      counters: { harvest: { any: 0 }, kills: { any: 0 }, sold: 0, crafted: 0 },
      stats: { defeats: 0, kills: 0, harvested: 0, crafted: 0, goldEarned: 0, goldSpent: 0, playTime: 0, bossTimes: {} }
    };
  }
  let state = fresh();
  // volatile (never saved)
  const V = { T: 0, cooldowns: {}, finalActive: false, downed: false, lastDefeat: null, pendingBoss: false, forcedArch: null, respawning: false,
    hazards: [], chill: 0, hazardAcc: 0, slow: [], lastPos: null, tick: 0, objKey: '', proxCooldown: 0, quietCines: false, bossStart: 0, lastArea: '' };

  // ================================================================ inventory core
  function ensureWorld() {
    if (!world.seeds || typeof world.seeds !== 'object') world.seeds = {};
    if (!world.harvest || typeof world.harvest !== 'object') world.harvest = {};
    for (const c of Object.keys(D.crops)) { if (!Number.isFinite(world.seeds[c])) world.seeds[c] = 0; if (!Number.isFinite(world.harvest[c])) world.harvest[c] = 0; }
    if (!SEED_TYPES[world.seed]) world.seed = 'wheat';
  }
  function count(id) {
    if (id === 'gold') return Math.floor(world.gold);
    const it = D.items[id]; if (!it) return 0; const st = it.store;
    if (st === 'harvest') return world.harvest[id] || 0;
    if (st.startsWith('seed:')) return world.seeds[st.slice(5)] || 0;
    if (st.startsWith('world:')) return world[st.slice(6)] || 0;
    return state.items[id] || 0;
  }
  function addItem(id, n) {
    n = n == null ? 1 : n; if (!n) return;
    if (id === 'gold') { world.gold = Math.max(0, world.gold + n); if (n > 0) state.stats.goldEarned += n; return; }
    const it = D.items[id]; if (!it) { console.warn('[campaign] unknown item', id); return; } const st = it.store;
    if (st === 'harvest') world.harvest[id] = Math.max(0, (world.harvest[id] || 0) + n);
    else if (st.startsWith('seed:')) { const c = st.slice(5); world.seeds[c] = Math.max(0, (world.seeds[c] || 0) + n); }
    else if (st.startsWith('world:')) { const f = st.slice(6); world[f] = Math.max(0, (world[f] || 0) + n); }
    else state.items[id] = Math.max(0, (state.items[id] || 0) + n);
    emit('inventory', { id, n });
  }
  function take(id, n) { n = n == null ? 1 : n; if (count(id) < n) return false; addItem(id, -n); if (id === 'gold') state.stats.goldSpent += n; return true; }
  const itemName = id => id === 'gold' ? 'gold' : (D.items[id]?.name || id);
  function costText(cost) {
    if (!cost) return 'free'; const parts = [];
    if (cost.gold) parts.push(cost.gold + ' gold'); if (cost.points) parts.push(cost.points + ' skill point');
    for (const [k, v] of Object.entries(cost.items || {})) parts.push(v + ' ' + itemName(k));
    return parts.join(' + ') || 'free';
  }
  function canPay(cost) { if (!cost) return true; if ((cost.gold || 0) > world.gold) return false; if ((cost.points || 0) > world.points) return false; return Object.entries(cost.items || {}).every(([k, v]) => count(k) >= v); }
  function missing(cost) { const m = []; if ((cost.gold || 0) > world.gold) m.push((cost.gold - Math.floor(world.gold)) + ' more gold'); if ((cost.points || 0) > world.points) m.push('a skill point'); for (const [k, v] of Object.entries(cost.items || {})) if (count(k) < v) m.push((v - count(k)) + ' more ' + itemName(k)); return m.join(', '); }
  function pay(cost) { if (!canPay(cost)) return false; if (cost.gold) take('gold', cost.gold); if (cost.points) world.points -= cost.points; for (const [k, v] of Object.entries(cost.items || {})) take(k, v); return true; }

  // ================================================================ conditions & unlocks
  function cond(c) {
    if (!c || c === 'start') return true;
    return String(c).split('|').some(one => {
      const [k, v] = one.split(':');
      if (k === 'tutorial') return v ? (state.tutorial.done || state.tutorial.step >= D.tutorial.findIndex(t => t.id === v)) : state.tutorial.done;   // reached step v
      if (k === 'chapter') return state.chapter >= Number(v);
      if (k === 'fragment') return state.fragments.includes(v);
      if (k === 'request') return state.requests[v]?.state === 'done';
      if (k === 'flag') return !!state.flags[v];
      if (k === 'postgame') return state.chapter >= 5;
      return false;
    });
  }
  function tutorialPast(stepId) { if (state.tutorial.done) return true; const i = D.tutorial.findIndex(s => s.id === stepId); return i >= 0 && state.tutorial.step > i; }
  function applyUnlocks(silent) {
    for (const s of D.spells) if (!state.spells.unlocked.includes(s.id) && cond(s.unlock)) { state.spells.unlocked.push(s.id); if (!silent) { toast(fmt(D.toasts.spell, { spell: s.name + ' (key ' + s.key + ')' }), 'unlock'); emit('spell', { id: s.id, name: s.name }); } }
    for (const r of D.recipes) if (!state.recipes.includes(r.id) && r.unlock && !String(r.unlock).startsWith('request:') && cond(r.unlock)) { state.recipes.push(r.id); if (!silent) toast(fmt(D.toasts.recipe, { recipe: r.name }), 'unlock'); }
    for (const [crop, c] of Object.entries(D.cropUnlock)) if (c && typeof c === 'string' && cond(c)) state.flags[crop + '_seeds_ok'] = true;
  }
  function unlockRecipe(ids, silent) { for (const id of [].concat(ids || [])) if (!state.recipes.includes(id)) { state.recipes.push(id); const r = D.recipes.find(x => x.id === id); if (!silent && r) toast(fmt(D.toasts.recipe, { recipe: r.name }), 'unlock'); } }

  // grant a reward object {gold,xp,items,recipe,flag,relation,spell} ; giver = npc id for relation
  function grant(rw, giver) {
    if (!rw) return [];
    const out = [];
    if (rw.gold) { addItem('gold', rw.gold); out.push(rw.gold + ' gold'); }
    if (rw.xp) { try { awardXP(rw.xp); } catch (_) { } }
    for (const [k, v] of Object.entries(rw.items || {})) { addItem(k, v); out.push(v + ' ' + itemName(k)); }
    if (rw.recipe) unlockRecipe(rw.recipe);
    if (rw.flag) state.flags[rw.flag] = true;
    if (rw.relation && giver && state.relations[giver] != null) state.relations[giver] = Math.min(5, state.relations[giver] + rw.relation);
    if (rw.spell && !state.spells.unlocked.includes(rw.spell)) state.spells.unlocked.push(rw.spell);
    applyUnlocks();
    return out;
  }
  function grantOnce(key, fn) {
    if (state.rewarded[key]) return false;
    state.rewarded[key] = true;
    try { typeof fn === 'function' ? fn() : grant(fn); } catch (e) { console.error('[campaign] grantOnce', key, e); }
    return true;
  }

  // ================================================================ baseline table mutations
  for (const [id, c] of Object.entries(D.crops)) {
    if (!SEED_TYPES[id]) SEED_TYPES[id] = { name: c.name, color: c.color, season: c.season, time: c.time };
  }
  if (!REGIONS.village) REGIONS.village = { name: D.regions.village.name, tint: 'rgba(214,186,140,.10)', mob: 'slime', level: 1 };
  const ORIGINAL_TINT = {};
  for (const [id, r] of Object.entries(D.regions)) if (REGIONS[id]) { REGIONS[id].level = r.level; REGIONS[id].name = r.name; ORIGINAL_TINT[id] = REGIONS[id].tint; }
  const RESTORED_TINT = { forest: 'rgba(110,150,90,.10)', swamp: 'rgba(90,140,125,.12)', mountain: 'rgba(190,215,235,.20)' };
  // signature spells at indices 0..4 (keys 1-5)
  for (let i = SPELLS.length - 1; i >= 0; i--) if (SIG.includes(SPELLS[i].id)) SPELLS.splice(i, 1);
  SPELLS.unshift(...D.spells.map(s => { const o = Object.assign({}, s); delete o.unlock; return o; }));
  try { spellSelect.innerHTML = SPELLS.map((s, i) => `<option value="${i}">${s.school} · ${s.name}</option>`).join(''); } catch (_) { }
  try { gameUI('regionSelect').innerHTML = Object.entries(REGIONS).map(([id, r]) => `<option value="${id}">${r.name}</option>`).join(''); gameUI('seedSelect').innerHTML = Object.entries(SEED_TYPES).map(([id, s]) => `<option value="${id}">${s.name}</option>`).join(''); } catch (_) { }
  ensureWorld();

  // ================================================================ chapters / tutorial
  function computeChapter() {
    if (!state.tutorial.done) return 0;
    if (state.flags.finalWon) return 5;
    if (state.placed.length >= 3) return 4;
    return 1 + state.placed.length;
  }
  function applyChapter(silent) {
    const c = computeChapter();
    if (c !== state.chapter) {
      const up = c > state.chapter; state.chapter = c;
      const ch = D.chapters[c];
      if (!silent && up) { toast(fmt(D.toasts.chapter, { n: c, name: ch.name }), 'chapter'); emit('chapter', { chapter: c, name: ch.name, desc: ch.desc }); }
    }
    applyUnlocks(silent);
  }
  function tut(kind, data) {
    if (state.tutorial.done) return;
    const idx = D.tutorial.findIndex(s => s.id === kind); if (idx < 0) return;
    if (idx < state.tutorial.step) return;
    if (idx > state.tutorial.step) { if (kind === 'request' || kind === 'brew') return; } // strict order for the last steps
    while (state.tutorial.step <= idx && !state.tutorial.done) {
      const s = D.tutorial[state.tutorial.step]; state.tutorial.step++;
      toast(s.toast, 'tutorial'); emit('tutorial', { step: state.tutorial.step, id: s.id });
      if (state.tutorial.step >= D.tutorial.length) { state.tutorial.done = true; onTutorialDone(); }
    }
    if (kind === 'plant' && data?.plot?.watered) tut('water');
    pushObjective(true);
  }
  function tutorialPeriodic() {
    if (state.tutorial.done) return;
    const s = D.tutorial[state.tutorial.step]?.id;
    if (s === 'plant' && world.plots.some(p => p.seed)) tut('plant');
    else if (s === 'water' && world.plots.some(p => p.seed && p.watered)) tut('water');
  }
  function onTutorialDone() { applyChapter(); requestSave('tutorial'); }

  // ================================================================ cinematics
  const cineQ = []; let cineBusy = false;
  // playStory(id,{reward, after, presave}) — rewards & memory are recorded immediately (skip == watch, never repeats after load)
  function playStory(id, opts) {
    opts = opts || {};
    const first = !state.memories.includes(id);
    if (first) state.memories.push(id);
    if (opts.reward) grantOnce('cine.' + id, opts.reward);
    if (opts.presave) requestSave('story:' + id, true);
    if (!first && !opts.replay) { if (opts.after) afterCine(opts.after, { id, skipped: false, notPlayed: true }); return Promise.resolve({ id, skipped: false, notPlayed: true }); }
    emit('story:cine', { id });
    if (V.quietCines || !MM.cine?.play || (MM.cine.has && !MM.cine.has(id))) { if (opts.after) afterCine(opts.after, { id, skipped: false, notPlayed: true }); return Promise.resolve({ id, skipped: false, notPlayed: true }); }
    return new Promise(res => { cineQ.push({ id, opts, res }); pumpCine(); });
  }
  function pumpCine() {
    if (cineBusy || !cineQ.length) return;
    const job = cineQ.shift(); cineBusy = true; cinePlaying = true;
    try {
      const cur = MM.state?.current;
      if (cur && cur !== 'cine') { V.cineReturn = (cur === 'interior' || cur === 'play') ? { name: cur, data: MM.state.data } : { name: 'play' }; }
      if (MM.state?.go && cur !== 'cine') MM.state.go('cine', { id: job.id, returnTo: V.cineReturn?.name || 'play' });
    } catch (e) { console.error(e); }
    let p; try { p = MM.cine.play(job.id, { skippable: true }); } catch (e) { p = Promise.resolve({ id: job.id, skipped: false, reason: 'error' }); }
    Promise.resolve(p).catch(() => ({ id: job.id, skipped: false, reason: 'error' })).then(r => {
      cineBusy = false;
      if (!cineQ.length) {
        cinePlaying = false;
        afterCine(job.opts.after || 'play', r);
        flushToasts();
      }
      job.res(r || { id: job.id });
      pumpCine();
    });
  }
  function afterCine(next, r) {
    try {
      if (next === 'ending') { enterEnding(); return; }
      if (MM.state?.go && (MM.state.current === 'cine' || MM.state.current === 'loading')) {
        const ret = V.cineReturn || { name: 'play' }; V.cineReturn = null;
        if (ret.name === 'interior') MM.state.go('interior', Object.assign({}, ret.data || {}, { resume: true, fromCine: true }));
        else MM.state.go('play');
      }
    } catch (e) { console.error('[campaign] afterCine', e); }
  }

  // ================================================================ save
  let registered = false;
  const FALLBACK_KEY = 'moss-moon-campaign-v1';
  function serialize() { const s = clone(state); return s; }
  function deserialize(o) {
    const f = fresh();
    if (!o || typeof o !== 'object') return f;
    const s = Object.assign(f, o);
    for (const k of ['flags', 'restored', 'bosses', 'requests', 'relations', 'homestead', 'moonwell', 'rewarded', 'tutorial', 'items', 'equipment', 'spells', 'visited', 'dungeon', 'buffs', 'gifts', 'talked', 'counters', 'stats'])
      s[k] = Object.assign({}, fresh()[k], o[k] && typeof o[k] === 'object' ? o[k] : {});
    for (const k of ['fragments', 'placed', 'memories', 'owned', 'recipes']) s[k] = Array.isArray(o[k]) ? o[k].slice() : fresh()[k];
    s.spells.unlocked = Array.isArray(s.spells.unlocked) ? s.spells.unlocked : ['moonbolt']; s.spells.ranks = s.spells.ranks || {};
    if (!s.spells.unlocked.includes('moonbolt')) s.spells.unlocked.unshift('moonbolt');
    s.counters.harvest = Object.assign({ any: 0 }, s.counters.harvest || {}); s.counters.kills = Object.assign({ any: 0 }, s.counters.kills || {});
    return s;
  }
  function afterLoad(silent) {
    ensureWorld();
    V.finalActive = false; V.downed = false; V.cooldowns = {}; V.chill = 0; V.slow = [];
    applyChapter(true); applyUnlocks(true);
    if (!spellOk(SPELLS[spellIndex]?.id)) selectFirstSpell();
    applyRestorationVisuals();
    onAreaChanged(true);
    pushObjective(true);
    if (!silent) emit('campaign:loaded', { chapter: state.chapter });
  }
  function trySaveRegister() {
    if (registered) return true;
    if (typeof MM.save?.registerSection !== 'function') return false;
    try {
      MM.save.registerSection('campaign', {
        get: () => serialize(),
        set: o => { state = deserialize(o); afterLoad(); },
        reset: () => { state = fresh(); afterLoad(true); }
      });
      registered = true;
    } catch (e) { console.error('[campaign] registerSection failed', e); }
    return registered;
  }
  function fallbackSave() { try { localStorage.setItem(FALLBACK_KEY, JSON.stringify(serialize())); return true; } catch (_) { return false; } }
  function fallbackLoad() { try { const raw = localStorage.getItem(FALLBACK_KEY); if (raw) { state = deserialize(JSON.parse(raw)); afterLoad(true); return true; } } catch (e) { console.warn('[campaign] fallback load failed', e); } return false; }
  function requestSave(reason, force) {
    try {
      if (MM.save?.save) return MM.save.save({ silent: true, reason: reason || 'campaign', force: !!force });
      return saveWorld(true);
    } catch (e) { console.warn('[campaign] save failed', e); return false; }
  }

  // ================================================================ spells
  const spellIdx = id => SPELLS.findIndex(s => s.id === id);
  const spellOk = id => !id ? false : SIG.includes(id) ? state.spells.unlocked.includes(id) : state.chapter >= 5;
  const rankOf = id => state.spells.ranks[id] || 0;
  const cdOf = s => Math.max(0, (s.cooldown || 0) - (s.id === 'starfall' ? 1.5 * rankOf(s.id) : 0));
  function selectFirstSpell() { const i = spellIdx(state.spells.unlocked[0] || 'moonbolt'); if (i >= 0) { try { _chooseSpell(i); } catch (_) { } } }
  function onSpellHit(fx, snap) {
    const s = sigDef(fx.spell.id), target = fx.target; if (!s || !target || !KIT()) return;
    const isDummy = target === dummy, mult = spellMultiplier(fx.spell, game, target), here = { x: target.x, y: target.y };
    const others = r => enemies.filter(e => e !== target && e.hp > 0 && !e.dead && !e.mmInvuln && tdist(e, here) <= r);
    if (s.id === 'emberbloom') {
      const b = s.mmBloom;
      for (const e of others(b.r)) applyStatusTo(e, 'burn');
      KIT().zone({ kind: 'bloom', friendly: true, x: here.x, y: here.y, r: b.r, dur: b.dur, every: b.every, onTick: z => { for (const e of enemies.slice()) if (e.hp > 0 && !e.mmInvuln && tdist(e, z) <= z.r) hitEntity(e, b.dmg * mult, '#f69655', game); } });
      burnBrambles(here, b.r + .6);
    } else if (s.id === 'thornbind') {
      const z0 = s.mmZone;
      KIT().zone({ kind: 'thorn', friendly: true, x: here.x, y: here.y, r: z0.r, dur: z0.dur, every: z0.every, rooted: new Set(), onTick: z => {
        for (const e of enemies.slice()) {
          if (e.hp <= 0 || e.mmInvuln || tdist(e, z) > z.r) continue;
          e.mmRootUntil = V.T + z0.every + .1;
          if (!e.mmBoss) applyStatusTo(e, 'root'); else if (!z.rooted.has(e.id)) { z.rooted.add(e.id); e.status.root = { time: 1.2 }; }
          hitEntity(e, z0.dmg * mult, '#9bcc68', game);
        }
      } });
    } else if (s.id === 'frostbell') {
      const p = s.mmPulse;
      if (snap.chilled && !isDummy) { const bonus = p.shatter * mult * (target.mmExposed ? 2 : 1); hitEntity(target, bonus, '#e9ffff', game); try { addParticles(target, '#e9ffff', '#ffffff', 14, 1.1); } catch (_) { } toast('Shatter!', 'combat'); }
      for (const e of others(p.r)) { applyStatusTo(e, 'chill'); hitEntity(e, s.damage * p.splash * mult, s.color, game); }
    } else if (s.id === 'starfall') {
      const st = s.mmStrike;
      for (const e of others(st.r)) if (screenDistance(e, target) >= 28) hitEntity(e, s.damage * st.splash * mult, s.color, game);
      try { MM.camera?.shake?.(2, .2); } catch (_) { }
    }
  }

  // ================================================================ enemies (archetypes, scaling)
  const KIND_ARCH = { blight: 'blightling', slime: 'moss_slime', ghost: 'bog_ghost', ice: 'rime_imp', skeleton: 'crypt_skeleton', spirit: 'frost_spirit', wisp: 'marsh_wisp', golem: 'stone_golem' };
  function pickArch(type) {
    const roster = D.regions[world.region]?.roster || [];
    if (!roster.length) return KIND_ARCH[type] || 'blightling';
    const total = roster.reduce((a, r) => a + r[1], 0); let roll = Math.random() * total;
    for (const [id, w] of roster) { roll -= w; if (roll <= 0) return id; }
    return roster[0][0];
  }
  function enemyLevel() {
    const r = D.regions[world.region] || { level: 1, recommended: 1 };
    if (world.region === 'grove') return Math.max(1, Math.ceil(world.level / 2));
    return r.level + Math.max(0, Math.floor((world.level - r.recommended) / 3));
  }
  function applyArch(e, arch) {
    const A = D.archetypes[arch]; if (!A) return e;
    const S = D.scaling, lvl = enemyLevel();
    let hp = A.hp * (1 + S.hpPerLevel * (lvl - 1)) * (1 + S.hpPerFloor * (world.floor || 0));
    if (world.mode === 'rift') hp *= 1.25; if (state.chapter >= 5 && D.regions[world.region]?.optional) hp *= S.postgame;
    e.type = A.kind; e.mmArch = arch; e.mmName = A.name; e.hp = e.maxHP = Math.round(hp);
    e.mmDmg = Math.max(1, Math.round(A.dmg * (1 + S.dmgPerLevel * (lvl - 1)))); e.mmRate = A.rate; e.mmSpeed = A.speed; e.mmAtk = .6 + Math.random();
    if (A.anchored) e.mmStatic = true; if (A.slowOnHit) e.mmSlowOnHit = A.slowOnHit; e.mmTint = A.tint || null;
    return e;
  }
  function spawnArch(arch, x, y) {
    const A = D.archetypes[arch]; if (!A) return null;
    V.forcedArch = arch; let e;
    try { e = makeEnemy(A.kind, x, y, false); } finally { V.forcedArch = null; }
    enemies.push(e); return e;
  }
  const campaignBoss = region => (STORY_REGIONS.includes(region) ? D.regions[region].boss : null);

  // ================================================================ baseline wrappers
  const _makeEnemy = makeEnemy;
  makeEnemy = function (type, x, y, boss) {
    if (boss && world.mode === 'dungeon' && campaignBoss(world.region)) { V.pendingBoss = true; boss = false; }
    const e = _makeEnemy(type, x, y, !!boss);
    if (!e.boss) applyArch(e, V.forcedArch || pickArch(type));
    else { e.mmGenericBoss = true; e.mmDmg = Math.round(12 * (1 + D.scaling.dmgPerLevel * (enemyLevel() - 1))); e.mmRate = 1.3; if (state.chapter >= 5) { e.hp = e.maxHP = Math.round(e.maxHP * D.scaling.postgame * 1.6); } }
    return e;
  };

  const _goRegion = goRegion;
  goRegion = function (id) {
    if (!REGIONS[id]) return;
    if (!V.respawning && id !== 'grove') { const lock = regionLock(id); if (lock) { toast(lock, 'warn'); return; } }
    const r = _goRegion(id);
    if (world.region === id && world.mode === 'outside') onAreaChanged();
    return r;
  };
  const _enterDungeon = enterDungeon;
  enterDungeon = function (rift) {
    if (rift && state.chapter < 5) { toast('Rifts only open once the Moonwell is whole again.', 'warn'); return; }
    if (!rift && !D.regions[world.region]?.dungeon) { toast('There is no dungeon here.', 'warn'); return; }
    if (!rift && world.mode !== 'outside') { toast('You are already underground.', 'warn'); return; }
    const r = _enterDungeon(!!rift);
    if (world.mode !== 'outside') onDungeonEntered();
    return r;
  };
  const _advanceFloor = advanceFloor;
  advanceFloor = function () {
    const reg = D.regions[world.region];
    if (world.mode === 'dungeon' && reg?.dungeon && !reg.dungeon.endless && world.floor >= 3) { toast('This is the deepest floor. The way home is up the stairs.', 'info'); return; }
    const before = world.floor; V.pendingBoss = false;
    const r = _advanceFloor();
    if (world.floor !== before) onFloor();
    return r;
  };
  const _resetPlayer = resetPlayer;
  resetPlayer = function () { if (V.respawning || dormant()) return _resetPlayer(); onPlayerDown({ kind: 'baseline' }); };

  const _tendPlot = tendPlot;
  tendPlot = function (plot) {
    if (!plot && !MM.world && inPlay()) { const ip = nearestInteraction(); if (ip && !(world.region === 'grove' && world.mode === 'outside' && nearPlot())) { interact(ip.id); return false; } }
    ensureWorld();
    const before = world.plots.map(p => ({ seed: p.seed, watered: p.watered, growth: p.growth })), hv = Object.assign({}, world.harvest);
    const r = _tendPlot(plot);
    world.plots.forEach((p, i) => {
      const b = before[i]; if (!b) return;
      if (!b.seed && p.seed) gameEvent('plant', { plot: p, seed: p.seed });
      else if (b.seed && !p.seed && b.growth >= 100) gameEvent('harvest', { plot: p, seed: b.seed, amount: (world.harvest[b.seed] || 0) - (hv[b.seed] || 0) });
      else if (b.seed && !b.watered && p.watered) gameEvent('water', { plot: p, seed: p.seed });
    });
    return r;
  };
  const _brew = brew;
  brew = function () { const p = world.potions; const r = _brew(); if (world.potions > p) onCrafted('healing', 1); return r; };
  const _sellHarvest = sellHarvest;
  sellHarvest = function () { const tot = Object.values(world.harvest).reduce((a, b) => a + (b || 0), 0), g = world.gold; const r = _sellHarvest(); if (tot > 0) { state.counters.sold += tot; state.stats.goldEarned += world.gold - g; } return r; };
  const _turnInQuest = turnInQuest;
  turnInQuest = function () { return interact('marrow'); };
  const _upgradeBroom = upgradeBroom;
  upgradeBroom = function () { const r = buyUpgrade('broom'); toast(r.msg, r.ok ? 'good' : 'warn'); return r; };

  const _hitEntity = hitEntity;
  hitEntity = function (target, amount, color, source) {
    if (target && target !== dummy && target.mmInvuln) { if (target.hp > 0 && Math.random() < .25) { try { numbers.push({ value: '·', color: '#c9d2e6', life: .5, offset: 0, x: target.x, y: target.y }); } catch (_) { } } return; }
    const was = !!target?.dead;
    const r = _hitEntity(target, amount, color, source);
    if (target && target !== dummy && target.dead && !was) onKill(target, source);
    return r;
  };
  const _pickup = pickup;
  pickup = function (drop, actor) {
    if (drop && drop.type === 'item') { const id = drop.item?.id; if (id) { addItem(id, drop.item.n || 1); try { message('Found ' + itemName(id)); } catch (_) { } gameEvent('pickup', { item: id }); } drop.life = 0; return; }
    const g = world.gold; const r = _pickup(drop, actor); if (world.gold > g) state.stats.goldEarned += world.gold - g; return r;
  };
  const _spellMultiplier = spellMultiplier;
  spellMultiplier = function (spell, actor, target) {
    let f = _spellMultiplier(spell, actor, target);
    if (actor === game || actor == null) {
      f += wandBonus();
      if (SIG.includes(spell.id)) { f += rankOf(spell.id) * .15; if (spell.id === 'moonbolt' && isNight()) f += (sigDef('moonbolt').mmNight || .2) + (hasBuff('nightvision') ? .25 : 0); }
      f *= BOSS()?.damageFactor?.(target, spell) ?? 1;
    }
    return f;
  };
  const _heroMaxHP = heroMaxHP;
  heroMaxHP = function () { return _heroMaxHP() + equipBonus('robe') + (state.homestead.level >= 4 ? 20 : 0); };
  const _castSpell = castSpell;
  castSpell = function (actor) {
    actor = actor || game;
    if (actor !== game) return _castSpell(actor);
    let spell = SPELLS[spellIndex];
    if (!spellOk(spell?.id)) { selectFirstSpell(); spell = SPELLS[spellIndex]; }
    const s = sigDef(spell.id);
    if (s) {
      const left = V.cooldowns[s.id] || 0;
      if (left > 0) { try { message(spell.name + ' recharging · ' + left.toFixed(1) + 's'); } catch (_) { } emit('cast:fail', { spell: s.id, reason: 'cooldown', left }); return false; }
      const base = Math.min(17, 6 + Math.floor(spell.damage / 16));
      if (world.mana < base + (s.extraCost || 0)) { try { message('Not enough mana yet'); } catch (_) { } emit('cast:fail', { spell: s.id, reason: 'mana' }); return false; }
    }
    const ok = _castSpell(actor);
    if (ok && s) {
      V.cooldowns[s.id] = cdOf(s); world.mana = Math.max(0, world.mana - (s.extraCost || 0));
      const fx = effects[effects.length - 1];
      if (s.id === 'starfall' && fx?.target && KIT()) KIT().telegraph({ shape: 'circle', x: fx.target.x, y: fx.target.y, r: s.mmStrike.r, dur: s.hit[0], kind: 'friendly', friendly: true });
    }
    return ok;
  };
  const _chooseSpell = chooseSpell;
  chooseSpell = function (index) {
    const s = SPELLS[index];
    if (s && !spellOk(s.id)) { const d = sigDef(s.id); toast(s.name + ' is not learned yet' + (d ? ' — ' + unlockHint(d.unlock) : ''), 'warn'); return; }
    return _chooseSpell(index);
  };
  const _spellTarget = spellTarget;
  spellTarget = function (actor) {
    const r = _spellTarget(actor);
    const well = enemies.find(e => e.mmWell && e.hp > 0);
    if (well && (!r || r === dummy || r.mmInvuln) && screenDistance(actor, well) < 220) return well;
    if (r && r !== dummy && r.mmInvuln) { let best = null, bd = 190; for (const e of enemies) { if (e.hp <= 0 || e.mmInvuln) continue; const d = screenDistance(actor, e); if (d < bd) { bd = d; best = e; } } return best; }
    return r;
  };
  const _nearestEnemy = nearestEnemy;
  nearestEnemy = function (actor, max) {
    let best = null, dist = max == null ? 170 : max;
    for (const e of enemies) { if (e.hp <= 0 || e.mmInvuln) continue; const d = screenDistance(actor, e); if (d < dist) { dist = d; best = e; } }
    return best;
  };
  const _updateCombat = updateCombat;
  updateCombat = function (dt) {
    const snap = [];
    for (const fx of effects) if (fx.caster === game && SIG.includes(fx.spell.id)) snap.push({ fx, hi: fx.hitIndex, chilled: !!(fx.target?.status?.chill || fx.target?.status?.root) });
    const r = _updateCombat(dt);
    for (const s of snap) if (s.fx.hitIndex > s.hi) { try { onSpellHit(s.fx, s); } catch (e) { console.error('[campaign] onSpellHit', e); } }
    return r;
  };
  const _updateWorld = updateWorld;
  updateWorld = function (dt) {
    if (dormant()) return _updateWorld(dt);
    let pre = null;
    try { pre = preWorld(dt); } catch (e) { console.error('[campaign] preWorld', e); }
    const r = _updateWorld(dt);
    try { postWorld(dt, pre); } catch (e) { console.error('[campaign] postWorld', e); }
    return r;
  };
  const _drawMonster = drawMonster;
  drawMonster = function (e) {
    const p = worldToCanvas(e.x, e.y);
    try { if (BOSS()?.drawEnemy?.(e, p)) return; } catch (err) { console.error('[campaign] drawEnemy', err); }
    if (e.mmTint) { ctx.save(); ctx.filter = e.mmTint; try { _drawMonster(e); } finally { ctx.restore(); } return; }
    return _drawMonster(e);
  };
  const _saveWorld = saveWorld;
  saveWorld = function (silent) { const r = _saveWorld(silent); if (!registered) fallbackSave(); return r; };
  // draw layer: ground hook when CORE dispatches it, otherwise just before particles (after entities)
  let frameNo = 0, hookFrame = -1;
  const _draw = draw;
  draw = function () { frameNo++; return _draw(); };
  const _drawExtraMagic = drawExtraMagic;
  drawExtraMagic = function () { if (hookFrame !== frameNo) { try { drawLayer(); } catch (e) { console.error('[campaign] drawLayer', e); } } return _drawExtraMagic(); };

  // ================================================================ per-frame systems
  function preWorld(dt) {
    ensureWorld();
    // player slow (hazards / debuffs): scale this frame's displacement
    const mul = playerSlowMul();
    if (V.lastPos && mul < 1) { const dx = game.x - V.lastPos.x, dy = game.y - V.lastPos.y; if (Math.abs(dx) + Math.abs(dy) < .5) { game.x = V.lastPos.x + dx * mul; game.y = V.lastPos.y + dy * mul; } }
    for (const e of enemies) { e.attack = 9; e.special = 9; e.mmPx = e.x; e.mmPy = e.y; }
    // raid timing fix (audit §9 #2) + suppression during tutorial / final / recovery
    if (world.region === 'grove' && world.mode === 'outside' && isNight()) {
      const key = world.time < .10 ? world.day - 1 : world.day;
      if (state.raidNight === key || !state.tutorial.done || V.finalActive || V.downed || cinePlaying) world.lastRaid = Math.max(world.lastRaid || 0, key);
    }
    return { lastRaid: world.lastRaid, day: world.day, growth: world.plots.map(p => p.growth) };
  }
  function postWorld(dt, pre) {
    V.T += dt; state.stats.playTime += dt;
    for (const k of Object.keys(V.cooldowns)) V.cooldowns[k] = Math.max(0, V.cooldowns[k] - dt);
    for (const k of Object.keys(state.buffs)) { state.buffs[k] -= dt; if (state.buffs[k] <= 0) { delete state.buffs[k]; toast(({ nightvision: 'Night-vision fades.', hearthfire: 'The Hearthfire warmth fades.', mireward: 'The Mire Ward wears off.' })[k] || '', 'info'); } }
    V.slow = V.slow.filter(s => s.until > V.T);
    // movement post-processing: anchors, static, speed scaling
    for (const e of enemies) {
      if (e.mmPx == null) continue;
      if (e.mmAnchor) { e.x = e.mmAnchor.x; e.y = e.mmAnchor.y; }
      else if (e.mmStatic || e.mmAnchorTmp) { e.x = e.mmPx; e.y = e.mmPy; }
      else if (e.mmSpeed != null && e.mmSpeed !== 1) {
        const nx = e.mmPx + (e.x - e.mmPx) * e.mmSpeed, ny = e.mmPy + (e.y - e.mmPy) * e.mmSpeed;
        if (!blockedAt(nx, ny)) { e.x = Math.max(.6, Math.min(19.4, nx)); e.y = Math.max(.6, Math.min(19.4, ny)); }
      }
    }
    sanitizeEnemies();
    melee(dt);
    if (KIT()) KIT().update(dt);
    if (BOSS()) BOSS().update(dt);
    farmingExtras(dt, pre);
    if (pre && world.lastRaid !== pre.lastRaid && world.region === 'grove') onRaid();
    hazardsTick(dt);
    // mana: charm bonus, crypt gloom
    let regen = equipBonus('charm');
    if (V.hazards.some(h => h.kind === 'gloom') && !hasBuff('nightvision')) regen -= (8 + ranks()[2] * 2) * D.hazards.gloom.manaMul;
    world.mana = Math.max(0, Math.min(100, world.mana + dt * regen));
    if (pre && world.day !== pre.day) emit('campaign:day', { day: world.day });
    V.tick += dt; V.proxCooldown -= dt;
    if (V.tick >= .2) { V.tick = 0; proximity(); if (!state.tutorial.done && state.started) syncFlowTutorial(); tutorialPeriodic(); pushObjective(); }
    if (world.hp <= 0 && !V.downed) onPlayerDown({ kind: 'hp' });
    V.lastPos = { x: game.x, y: game.y };
  }
  function sanitizeEnemies() {
    const bossId = campaignBoss(world.region);
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e.boss && !e.mmBoss && bossId && world.mode === 'dungeon') {
        enemies.splice(i, 1);
        if (!state.bosses[bossId] && !enemies.some(x => x.mmBoss)) BOSS()?.spawn(bossId, e.x, e.y, { quiet: true });
        continue;
      }
      if (!e.boss && !e.mmArch && !e.mmWell) applyArch(e, pickArch(e.type));
    }
  }
  function melee(dt) {
    if (V.downed || !inPlay()) return;
    const kit = KIT();
    for (const e of enemies) {
      if (e.hp <= 0 || e.dead || e.mmFriendly) continue;
      if (e.mmBoss && (e.mmHidden || e.mmState === 'dash')) continue;
      e.mmAtk = (e.mmAtk == null ? 1 : e.mmAtk) - dt;
      if ((e.mmRootUntil || 0) > V.T) continue;           // Thornbind: no melee while standing in the roots
      const cands = (world.cloak > 0 ? [] : [game]).concat(party.filter(p => p.hp > 0), allies.filter(a => a.type === 'mirage' && a.hp > 0));
      let hero = cands.reduce((b, p) => !b || screenDistance(e, p) < screenDistance(e, b) ? p : b, null);
      if (e.raid) { const crop = world.plots.filter(p => p.seed).reduce((b, p) => !b || screenDistance(e, p) < screenDistance(e, b) ? p : b, null); if (crop && (!hero || screenDistance(e, crop) < screenDistance(e, hero) * .85)) hero = crop; }
      if (!hero) continue;
      const reach = e.mmBoss ? 30 : 23;
      if (screenDistance(e, hero) > reach || e.mmAtk > 0) continue;
      e.mmAtk = e.mmRate || 1.8; const dmg = e.mmDmg || 4;
      if (world.plots.includes(hero)) { hero.health = (hero.health ?? 100) - dmg * 2; if (hero.health <= 0) { hero.seed = null; hero.growth = 0; hero.watered = false; toast('A raider trampled a crop!', 'warn'); } }
      else if (hero.type === 'mirage') { hero.hp -= dmg; if (hero.hp <= 0) hero.life = 0; }
      else if (hero === game) { kit ? kit.hurt(dmg, { melee: true, source: e, kind: 'melee' }) : (world.hp -= dmg); if (e.mmSlowOnHit) slowPlayer(e.mmSlowOnHit, 1, 'hit'); }
      else { hero.lastDamage = dmg; hero.hp -= dmg; if (hero.hp <= 0) { hero.hp = 65; hero.x = game.x + .5; hero.y = game.y + .5; } }
      try { addParticles(hero, '#ee8b77', '#ffdbbf', 6, .7); } catch (_) { }
      if (V.downed) break;
    }
  }
  function farmingExtras(dt, pre) {
    if (!pre) return;
    const night = isNight(), rain = world.weather === 'Rain', hl = state.homestead.level;
    world.plots.forEach((p, i) => {
      if (!p.seed || p.growth >= 100) return;
      const d = p.growth - (pre.growth[i] || 0); if (d <= 0) return;
      const c = D.crops[p.seed] || {};
      let m = hl >= 2 ? 1.15 : 1;
      if (c.rainBonus && rain) m *= c.rainBonus;
      if (c.nightBonus && night) m *= c.nightBonus;
      if (c.dayPenalty && !night) m *= c.dayPenalty;
      if (m !== 1) p.growth = Math.max(0, Math.min(100, p.growth + d * (m - 1)));
    });
  }
  function onRaid() {
    const key = world.time < .10 ? world.day - 1 : world.day; state.raidNight = key;
    if (state.homestead.level >= 4) { let raiders = enemies.filter(e => e.raid); for (const e of raiders.slice(2)) { e.hp = 0; e.dead = true; } }
    toast('Night raid! Blightlings are creeping toward your crops — defend the garden!', 'warn');
  }

  // ---------------------------------------------------------------- hazards
  function buildHazards() {
    V.hazards = []; V.chill = 0;
    const reg = world.region; if (state.restored[reg]) return;
    const spots = D.hazardSpots[reg];
    if (reg === 'forest' || reg === 'swamp') {
      const kind = reg === 'forest' ? 'brambles' : 'bog';
      let list = Array.isArray(spots) ? spots.map(s => ({ x: s[0], y: s[1], r: s[2] })) : [];
      if (world.mode !== 'outside') {
        list = []; const seed = (world.dungeonSeed || 1) + world.floor * 13;
        for (let i = 0; i < 4; i++) { const x = 3 + hash(i, 3, seed) * 14, y = 3 + hash(5, i, seed) * 14; if (Math.abs(x - 10) < 2.2 || Math.abs(y - 10) < 2.2 || blockedAt(x, y)) continue; list.push({ x, y, r: .9 + hash(i, i, seed) * .5 }); }
      }
      V.hazards = list.map(s => Object.assign({ kind }, s));
    } else if (reg === 'mountain') {
      const warm = world.mode === 'outside' ? (spots?.warm || []) : [[10, 4.5], [10, 15.5]];
      V.hazards = [{ kind: 'frost', global: true }].concat(warm.map(w => ({ kind: 'warm', x: w[0], y: w[1], r: D.hazards.frost.warmR })));
    } else if (reg === 'crypt') V.hazards = [{ kind: 'gloom', global: true }];
  }
  function burnBrambles(at, r) {
    const before = V.hazards.length;
    V.hazards = V.hazards.filter(h => !(h.kind === 'brambles' && tdist(h, at) <= r + h.r * .5));
    if (V.hazards.length < before) { toast('The brambles crackle and burn away.', 'good'); try { addParticles(at, '#f47c46', '#ffe3a1', 12, .9); } catch (_) { } }
  }
  const inPatch = kind => V.hazards.find(h => h.kind === kind && !h.global && tdist(h, game) <= h.r);
  function hazardsTick(dt) {
    if (!V.hazards.length || V.downed || !inPlay()) return;
    V.hazardAcc += dt;
    const br = inPatch('brambles');
    if (br && V.hazardAcc >= D.hazards.brambles.every) { V.hazardAcc = 0; KIT()?.hurt(D.hazards.brambles.dmg, { kind: 'thorn' }); }
    if (V.hazards.some(h => h.kind === 'frost')) {
      const F = D.hazards.frost, warm = hasBuff('hearthfire') || !!inPatch('warm');
      V.chill = warm ? Math.max(0, V.chill - 25 * dt) : Math.min(100, V.chill + F.chillRate * dt * (isNight() ? F.chillNight : 1));
      if (V.chill >= 100) { V.frostAcc = (V.frostAcc || 0) + dt; if (V.frostAcc >= F.every) { V.frostAcc = 0; KIT()?.hurt(F.dmg, { kind: 'cold' }); } }
    }
  }
  function playerSlowMul() {
    let m = 1;
    for (const s of V.slow) if (s.until > V.T) m = Math.min(m, s.mult);
    if (inPatch('brambles')) m = Math.min(m, D.hazards.brambles.slow);
    if (inPatch('bog') && !hasBuff('mireward')) m = Math.min(m, D.hazards.bog.slow);
    if (V.chill >= 100) m = Math.min(m, D.hazards.frost.slowAtFull);
    return m;
  }
  function slowPlayer(mult, dur, kind) { if ((kind === 'poison' || kind === 'grab') && hasBuff('mireward') && kind === 'poison') return; V.slow.push({ mult, until: V.T + dur, kind }); }
  const hasBuff = id => (state.buffs[id] || 0) > 0;
  function damageTakenMul(opts) {
    let m = 1;
    if (opts?.kind === 'poison' && hasBuff('mireward')) m *= .5;
    if (opts?.kind === 'cold' && hasBuff('hearthfire')) m *= .5;
    return m;
  }
  function hazardStatus() {
    const reg = world.region, H = D.hazards;
    if (V.hazards.some(h => h.kind === 'frost')) { const warm = hasBuff('hearthfire') || !!inPatch('warm'); return { kind: 'frost', name: H.frost.name, value: Math.round(V.chill), warm, protected: hasBuff('hearthfire'), hint: H.frost.hint }; }
    const p = inPatch('brambles') || inPatch('bog');
    if (p) return { kind: p.kind, name: H[p.kind].name, inPatch: true, protected: p.kind === 'bog' && hasBuff('mireward'), hint: H[p.kind].hint };
    if (V.hazards.some(h => h.kind === 'gloom')) return { kind: 'gloom', name: H.gloom.name, protected: hasBuff('nightvision'), hint: H.gloom.hint };
    const any = V.hazards.find(h => h.kind === 'brambles' || h.kind === 'bog');
    return any ? { kind: any.kind, name: H[any.kind].name, inPatch: false, hint: H[any.kind].hint, region: reg } : null;
  }

  // ================================================================ events from gameplay
  function gameEvent(name, d) {
    if (dormant()) return;
    if (name === 'plant') { tut('plant', d); }
    else if (name === 'water') { tut('water', d); }
    else if (name === 'harvest') {
      const n = Math.max(1, d.amount || 1);
      if (state.homestead.level >= 3 && Math.random() < .15) { world.harvest[d.seed] = (world.harvest[d.seed] || 0) + 1; toast('Moon Garden blessing: +1 ' + itemName(d.seed) + '!', 'good'); }
      state.counters.harvest[d.seed] = (state.counters.harvest[d.seed] || 0) + n; state.counters.harvest.any += n; state.stats.harvested += n;
      tut('harvest', d);
    }
    emit('campaign:' + name, d);
  }
  function onKill(e, source) {
    if (dormant()) return;
    if (e.mmWell) { BOSS()?.onKill(e); return; }
    const reg = world.region;
    state.counters.kills[reg] = (state.counters.kills[reg] || 0) + 1; state.counters.kills.any++; state.stats.kills++;
    const A = D.archetypes[e.mmArch];
    if (A && !e.raid) for (const [id, ch] of Object.entries(A.drops || {})) if (Math.random() < ch) lootDrops.push({ id: worldId++, x: e.x + .15, y: e.y + .2, type: 'item', item: { id }, life: 90 });
    if (!e.mmBoss && isNight() && world.mode === 'outside' && reg !== 'grove' && Math.random() < D.scaling.nightDust) lootDrops.push({ id: worldId++, x: e.x - .2, y: e.y + .1, type: 'item', item: { id: 'moon_dust' }, life: 90 });
    BOSS()?.onKill(e);
    if (world.mode === 'dungeon' && !enemies.some(x => x.hp > 0 && !x.dead) && world.floor < 3 && STORY_REGIONS.includes(reg)) toast('The floor is clear — the way down is open.', 'good');
    gameEvent('kill', { enemy: e, region: reg });
  }
  function onCrafted(recipe, n) { state.counters.crafted += n; state.stats.crafted += n; if (recipe === 'healing') tut('brew'); gameEvent('craft', { recipe, n }); }

  // ================================================================ areas, dungeons, bosses
  function onAreaChanged(fromLoad) {
    V.lastArea = world.region + ':' + world.mode + ':' + world.floor;
    KIT()?.clear();
    if (V.finalActive && (world.region !== 'grove' || world.mode !== 'outside')) abortFinal();
    if (world.region === 'village' && world.mode === 'outside') enemies = [];
    if (world.mode === 'outside' && state.restored[world.region] && !fromLoad) {
      const keep = enemies.slice(0, D.scaling.restoredCount); for (const e of keep) e.mmDmg = Math.max(1, Math.round((e.mmDmg || 4) * D.scaling.restoredDmg)); enemies = keep;
    }
    state.visited[world.region] = true;
    buildHazards(); V.lastPos = { x: game.x, y: game.y };
    pushObjective(true);
  }
  function onDungeonEntered() {
    onAreaChanged();
    const reg = world.region, dd = state.dungeon[reg] = state.dungeon[reg] || {}; dd.entered = (dd.entered || 0) + 1;
    const bossId = campaignBoss(reg);
    if (bossId && dd.reachedBoss && !state.bosses[bossId] && world.mode === 'dungeon') {
      toast('You remember the way — straight down to the guardian.', 'info');
      world.floor = 2; enemies = []; _advanceFloor(); onFloor();
    } else { const f = D.regions[reg]?.dungeon?.floors?.[0]; if (f) toast(f + ' · floor 1 of 3', 'area'); }
  }
  function onFloor() {
    onAreaChanged();
    const reg = world.region, bossId = campaignBoss(reg), name = D.regions[reg]?.dungeon?.floors?.[world.floor - 1];
    if (world.mode === 'dungeon' && bossId && world.floor === 3) {
      (state.dungeon[reg] = state.dungeon[reg] || {}).reachedBoss = true;
      enemies = []; V.pendingBoss = false;
      game.x = 10; game.y = 15.5; game.vx = game.vy = 0; game.target = null; const p = project(game.x, game.y); game.camX = p.x; game.camY = p.y; V.lastPos = { x: game.x, y: game.y };
      if (state.bosses[bossId]) { toast((name || 'The throne room') + ' is quiet now. Only roots and old light remain.', 'area'); return; }
      const d = D.bosses[bossId];
      const spawn = () => { if (world.region === reg && world.mode === 'dungeon' && world.floor === 3 && !enemies.some(e => e.mmBoss)) { BOSS()?.spawn(bossId, 10, 8.6); V.bossStart = state.stats.playTime; } };
      if (d.cine && !state.memories.includes(d.cine)) playStory(d.cine).then(spawn); else spawn();
      requestSave('boss-floor');
    } else if (name) toast(name + ' · floor ' + world.floor + ' of 3', 'area');
  }
  function obtainFragment(region, quiet) {
    if (!STORY_REGIONS.includes(region) || state.fragments.includes(region)) return false;
    const F = D.fragments[region];
    state.fragments.push(region); addItem(F.item, 1);
    emit('fragment', { region, item: F.item, name: F.name, count: state.fragments.length });
    toast(fmt(D.toasts.fragment, { fragment: F.name }), 'fragment');
    try { MM.fx?.burst?.('fragment', game.x, game.y, {}); } catch (_) { }
    applyUnlocks();
    if (state.fragments.length >= 3 && !quiet) playStory('final_fragment', { reward: { items: { moon_dust: 1 } } });
    pushObjective(true);
    return true;
  }
  function onBossDefeated(id, e) {
    if (state.bosses[id] && id !== 'hollow_moon') return;
    state.bosses[id] = true;
    const d = D.bosses[id]; state.stats.bossTimes[id] = Math.round(state.stats.playTime - (V.bossStart || state.stats.playTime));
    grantOnce('boss.' + id, () => { const got = grant(d.reward); toast(d.name + ' is defeated! ' + (got.length ? 'You found ' + got.join(', ') + '.' : ''), 'boss'); });
    emit('quest', { id: 'main', status: 'boss', boss: id });
    if (id === 'hollow_moon') { finishFinal(); return; }
    obtainFragment(d.region);
    requestSave('boss:' + id, true);
  }

  // ---------------------------------------------------------------- Moonwell / restoration / final
  // Live interactable position from MM.world (fallback: data defaults). id e.g. 'moonwell', 'wren', 'dungeon', 'stairs'.
  function pointOf(region, id) {
    try {
      if (region === world.region && typeof MM.world?.interactables === 'function') { const m = (MM.world.interactables() || []).find(p => p.id === id); if (m && Number.isFinite(m.x)) return { x: m.x, y: m.y, r: m.r || 1.2 }; }
      const L = MM.world?.layout?.(region);
      const list = [].concat(L?.interactables || [], L?.npcs || []);
      const m = list.find(p => p.id === id); if (m && Number.isFinite(m.x)) return { x: m.x, y: m.y, r: m.r || 1.2 };
    } catch (_) { }
    const I = D.interactions, d = (I[region] || []).find(p => p.id === id) || (id === 'dungeon' ? I.dungeon : id === 'stairs' ? I.stairs : id === 'exit' ? I.exit : null);
    return d ? { x: d.x, y: d.y, r: d.r || 1.2 } : null;
  }
  function moonwellPos() { return pointOf('grove', 'moonwell') || { x: 13.6, y: 7.0, r: 1.5 }; }
  function placeFragments() {
    const todo = state.fragments.filter(r => !state.placed.includes(r)); if (!todo.length) return false;
    for (const r of todo) restoreRegion(r);
    return true;
  }
  function restoreRegion(region) {
    if (state.placed.includes(region)) return;
    const F = D.fragments[region];
    state.placed.push(region); state.restored[region] = true; take(F.item, 1);
    state.moonwell.level = Math.min(3, state.placed.length); state.homestead.level = Math.max(state.homestead.level, Math.min(4, state.placed.length));
    toast(D.dialogue.moonwell.placed, 'story');
    toast(fmt(D.toasts.restored, { region: D.regions[region].name }), 'restored');
    applyRestorationVisuals();
    try { MM.fx?.restorationWave?.(region); } catch (_) { }
    emit('restored', { region, name: D.regions[region].name, moonwell: state.moonwell.level, homestead: state.homestead.level });
    applyChapter();
    const isFirst = state.placed.length === 1;
    if (isFirst) playStory('first_restoration', { presave: true, reward: () => { const got = grant({ gold: 25, items: { moon_dust: 2 } }); toast('The Moonwell gifts you ' + got.join(' and ') + '.', 'good'); } });
    else requestSave('restored:' + region, true);
  }
  function applyRestorationVisuals() {
    try { MM.world?.setRestoration?.(state.homestead.level, { moonwell: state.moonwell.level, restored: Object.assign({}, state.restored), final: !!state.flags.finalWon }); } catch (e) { console.warn('[campaign] setRestoration', e); }
    for (const r of STORY_REGIONS) if (REGIONS[r]) REGIONS[r].tint = state.restored[r] ? RESTORED_TINT[r] : ORIGINAL_TINT[r];
    try { drawGround(); } catch (_) { }
    emit('homestead', { level: state.homestead.level, moonwell: state.moonwell.level });
  }
  function beginFinal() {
    if (V.finalActive || state.flags.finalWon || state.chapter !== 4) return false;
    if (world.region !== 'grove' || world.mode !== 'outside') return false;
    V.finalActive = true; KIT()?.clear();
    enemies = enemies.filter(e => !e.raid);
    const mw = moonwellPos();
    BOSS()?.spawn('hollow_moon', mw.x - .3, mw.y + 2.0);
    V.bossStart = state.stats.playTime;
    emit('quest', { id: 'main', status: 'final' });
    pushObjective(true);
    return true;
  }
  function abortFinal() { V.finalActive = false; for (const e of enemies) if (e.mmBoss === 'hollow_moon' || e.mmWell) { e.hp = 0; e.dead = true; } enemies = enemies.filter(e => !e.dead); KIT()?.clear(); }
  function finishFinal() {
    V.finalActive = false; state.flags.finalWon = true;
    state.homestead.level = 4; state.moonwell.level = 3;
    applyRestorationVisuals();
    try { MM.fx?.restorationWave?.('grove'); } catch (_) { }
    applyChapter();
    state.endingSeen = true;
    playStory('ending', { presave: true, after: 'ending', reward: () => grant({ items: { moon_dust: 3, starlight: 1 } }) });
  }
  function enterEnding() {
    const s = state.stats, summary = { title: D.ending.title, text: D.ending.text, unlocks: D.ending.unlocks, playTime: Math.round(s.playTime), kills: s.kills, harvested: s.harvested, crafted: s.crafted, defeats: s.defeats, goldEarned: Math.round(s.goldEarned), day: world.day, level: world.level };
    emit('ending', summary);
    try { if (MM.state?.go) MM.state.go('ending', summary); } catch (e) { console.error(e); }
    if (!MM.ui) later(() => { try { if (MM.state?.current === 'ending') MM.state.go('play'); } catch (_) { } }, 1500);
    requestSave('ending', true);
  }
  function interactMoonwell() {
    const t = D.dialogue.moonwell;
    if (state.fragments.some(r => !state.placed.includes(r))) { placeFragments(); return { ok: true, msg: t.placed }; }
    if (state.chapter === 4 && !V.finalActive) { beginFinal(); return { ok: true, msg: t.ready }; }
    const msg = state.flags.finalWon ? t.done : state.placed.length ? fmt(t.waiting, { n: state.placed.length }) : t.dark;
    toast(msg, 'story'); return { ok: true, msg };
  }

  // ---------------------------------------------------------------- defeat / recovery
  // With MM core: baseline resetPlayer() -> MM.game.handleDeath() enters 'defeat'; the defeat screen calls MM.game.respawnHome()
  // (which applies the 15%/max 25 gold loss) and core emits bus 'respawn'. The campaign adds bookkeeping + penalty text only.
  function defeatData() {
    const Df = D.defeat, goldLost = Math.min(Df.goldMax, Math.floor(Math.max(0, world.gold) * Df.goldPct));
    return { title: Df.title, text: Df.text, penalty: fmt(Df.penaltyText, { gold: goldLost }), goldLost, region: world.region, regionName: D.regions[world.region]?.name, mode: world.mode, floor: world.floor, tip: Df.tips[state.stats.defeats % Df.tips.length], kept: 'Items, fragments, recipes and story progress are kept.' };
  }
  function onPlayerDown(opts) {
    if (V.downed) return;
    const data = defeatData();
    V.downed = true; state.stats.defeats++;
    if (V.finalActive) abortFinal();
    KIT()?.clear(); V.slow = []; V.chill = 0;
    V.lastDefeat = data;
    emit('defeat', data);
    if (typeof MM.game?.handleDeath === 'function' && MM.state?.go) {
      world.hp = Math.min(world.hp, 0);
      V.respawning = true; try { _resetPlayer(); } finally { V.respawning = false; }   // emits 'death' + handleDeath -> 'defeat'
      if (MM.state.current !== 'defeat') { try { MM.game.handleDeath(); } catch (_) { } }
      return;
    }
    // no core: own fallback (lose gold, wake at home)
    world.gold = Math.max(0, world.gold - data.goldLost); world.hp = 1;
    try { if (MM.state?.go) MM.state.go('defeat', data); } catch (e) { console.error(e); }
    later(() => recover(), MM.state ? 1500 : 0);
  }
  function onRespawned() {
    if (!V.downed) return;
    V.downed = false; world.hp = heroMaxHP(); world.mana = 100;
    onAreaChanged();
    toast('You wake at the homestead, a little bruised. ' + (V.lastDefeat?.penalty || ''), 'info');
    if (!state.memories.includes('defeat_recover') && MM.cine?.play) playStory('defeat_recover');
  }
  function recover() {
    if (!V.downed) return { ok: false, msg: 'Not downed' };
    if (typeof MM.game?.respawnHome === 'function') { MM.game.respawnHome({ goldLoss: V.lastDefeat?.goldLost }); onRespawned(); return { ok: true, msg: 'Recovered at the homestead' }; }
    V.respawning = true; const g = world.gold;
    try { _resetPlayer(); } catch (e) { console.error('[campaign] respawn', e); } finally { V.respawning = false; }
    world.gold = g;
    if (world.region !== 'grove' || world.mode !== 'outside') { V.respawning = true; try { _goRegion('grove'); } finally { V.respawning = false; } }
    try { if (MM.state?.go && MM.state.current === 'defeat') MM.state.go('play'); } catch (_) { }
    onRespawned(); requestSave('recover');
    return { ok: true, msg: 'Recovered at the homestead' };
  }

  // ================================================================ travel
  function regionLock(id) {
    const r = D.regions[id]; if (!r) return null;   // regions the campaign doesn't own (e.g. the tutorial sandbox) are never locked here
    const q = r.requires; if (!q) return null;
    if (q.chapterStep && !tutorialPast(q.chapterStep)) return r.lockReason;
    if (q.tutorial && !state.tutorial.done) return r.lockReason;
    if (q.postgame && state.chapter < 5) return r.lockReason;
    if (q.broom && world.broom < q.broom) return r.lockReason;
    if (q.broomOr != null && !(world.broom >= q.broomOr || state.restored[q.restoredOr])) return r.lockReason;
    return null;
  }
  function transition(fn, data) {
    if (MM.state?.go) {
      try { MM.state.go('loading', data); } catch (_) { }
      later(() => { try { fn(); } catch (e) { console.error('[campaign] transition', e); } finally { try { if (MM.state.current === 'loading') MM.state.go('play'); } catch (_) { } } }, 650);
      return true;
    }
    fn(); return false;
  }
  function travelTo(id) {
    const r = D.regions[id]; if (!r || !REGIONS[id]) return { ok: false, msg: 'Unknown destination.' };
    if (V.downed) return { ok: false, msg: 'Rest first.' };
    const lock = id === 'grove' ? null : regionLock(id); if (lock) return { ok: false, msg: lock, locked: true };
    if (world.region === id && world.mode === 'outside') return { ok: false, msg: 'You are already in ' + r.name + '.' };
    const pending = transition(() => goRegion(id), { kind: 'travel', to: id, name: r.name, desc: r.desc });
    return { ok: true, msg: 'Flying to ' + r.name + '…', pending };
  }
  function enterDungeonCampaign() {
    const r = D.regions[world.region];
    if (!r?.dungeon) return { ok: false, msg: 'There is no dungeon here.' };
    if (world.mode !== 'outside') return { ok: false, msg: 'You are already underground.' };
    const pending = transition(() => enterDungeon(false), { kind: 'dungeon', to: world.region, name: r.dungeon.name, desc: r.dungeon.floors[0] });
    return { ok: true, msg: 'Entering ' + r.dungeon.name + '…', pending };
  }
  function nextFloor() {
    if (world.mode === 'outside') return { ok: false, msg: 'Enter a dungeon first.' };
    if (enemies.some(e => e.hp > 0 && !e.dead)) return { ok: false, msg: 'Defeat the remaining enemies first.' };
    const reg = D.regions[world.region];
    if (reg?.dungeon && !reg.dungeon.endless && world.floor >= 3 && world.mode === 'dungeon') return { ok: false, msg: 'This is the deepest floor.' };
    const pending = transition(() => advanceFloor(), { kind: 'floor', to: world.region, name: reg?.dungeon?.floors?.[world.floor] || ('Floor ' + (world.floor + 1)) });
    return { ok: true, msg: 'Descending…', pending };
  }
  function exitDungeon() { if (world.mode === 'outside') return { ok: false, msg: 'You are outside.' }; const reg = world.region; const pending = transition(() => { V.respawning = true; try { goRegion(reg === 'grove' ? 'grove' : reg); } finally { V.respawning = false; } }, { kind: 'travel', to: reg, name: D.regions[reg]?.name }); return { ok: true, msg: 'Climbing back up…', pending }; }

  // ================================================================ requests
  const reqDef = id => D.requests.find(r => r.id === id);
  const reqAvailable = r => !state.requests[r.id] && cond(r.offer);
  function counterFor(r) {
    if (r.type === 'harvest') return state.counters.harvest[r.crop || 'any'] || 0;
    if (r.type === 'kill') return state.counters.kills[r.region || 'any'] || 0;
    if (r.type === 'sell') return state.counters.sold || 0;
    return 0;
  }
  function reqProgress(r) {
    const st = state.requests[r.id];
    if (r.type === 'deliver') { let have = 0, need = 0; const parts = []; for (const [k, v] of Object.entries(r.items)) { const c = Math.min(v, count(k)); have += c; need += v; parts.push(c + '/' + v + ' ' + itemName(k)); } return { have, need, label: parts.join(', ') }; }
    const need = r.n || 1, have = st?.state === 'done' ? need : Math.max(0, Math.min(need, counterFor(r) - (st?.start || 0)));
    const label = r.type === 'harvest' ? have + '/' + need + ' ' + (r.crop ? itemName(r.crop) : 'crops') + ' harvested' : r.type === 'kill' ? have + '/' + need + ' ' + (D.regions[r.region]?.short || '') + ' creatures calmed' : r.type === 'sell' ? have + '/' + need + ' crops sold' : have + '/' + need;
    return { have, need, label };
  }
  function acceptRequest(id) {
    const r = reqDef(id); if (!r) return { ok: false, msg: 'Unknown request.' };
    if (state.requests[id]) return { ok: false, msg: 'Already ' + (state.requests[id].state === 'done' ? 'finished.' : 'accepted.') };
    if (!cond(r.offer)) return { ok: false, msg: 'Not available yet.' };
    state.requests[id] = { state: 'active', start: counterFor(r), day: world.day };
    if (r.onAccept) { if (r.onAccept.flag) state.flags[r.onAccept.flag] = true; for (const [k, v] of Object.entries(r.onAccept.items || {})) addItem(k, v); }
    emit('quest', { id, status: 'active', title: r.title });
    toast('Request accepted: ' + r.title, 'quest');
    tut('request');
    return { ok: true, msg: 'Accepted "' + r.title + '".' };
  }
  function turnIn(id) {
    const r = reqDef(id), st = state.requests[id]; if (!r || !st) return { ok: false, msg: 'You have not taken that request.' };
    if (st.state === 'done') return { ok: false, msg: 'Already finished.' };
    const p = reqProgress(r); if (p.have < p.need) return { ok: false, msg: 'Not finished yet: ' + p.label + '.' };
    if (r.type === 'deliver') for (const [k, v] of Object.entries(r.items)) take(k, v);
    st.state = 'done'; st.doneDay = world.day;
    grantOnce('request.' + id, () => grant(Object.assign({}, r.reward, { relation: r.reward.relation || 1 }), r.giver));
    try { world.requests = (world.requests || 0) + 1; } catch (_) { }
    emit('quest', { id, status: 'done', title: r.title });
    toast('Request complete: ' + r.title + ' — ' + r.reward.text, 'quest');
    applyUnlocks(); requestSave('request:' + id);
    return { ok: true, msg: (D.npcs[r.giver]?.name || 'They') + ' thanks you warmly. ' + r.reward.text + '.' };
  }
  function quests() {
    const list = [];
    const ch = D.chapters[state.chapter];
    list.push({ id: 'main', title: ch.name, desc: ch.desc, giver: 'story', giverName: 'The Moonwell', status: state.chapter >= 5 ? 'done' : 'active', main: true, progress: { have: state.placed.length + (state.flags.finalWon ? 1 : 0), need: 4, label: state.placed.length + '/3 fragments in the Moonwell' + (state.flags.finalWon ? ' · Moonwell restored' : '') }, reward: 'The grove, whole again' });
    for (const r of D.requests) {
      const st = state.requests[r.id]; if (!st && !reqAvailable(r)) continue;
      const p = reqProgress(r), status = st ? st.state : 'offered';
      list.push({ id: r.id, title: r.title, desc: r.desc, giver: r.giver, giverName: D.npcs[r.giver].name, status, ready: status === 'active' && p.have >= p.need, progress: p, reward: r.reward.text, tutorial: !!r.tutorial });
    }
    return list;
  }

  // ================================================================ objective
  function objective() {
    const O = D.objectives, mk = (k, vars, target, extra) => Object.assign({ id: k, title: fmt(O[k].title, vars), why: fmt(O[k].why, vars), hint: fmt(O[k].hint, vars), target: target || null, chapter: state.chapter }, extra || {});
    const mw = moonwellPos(), mwT = { region: 'grove', x: mw.x, y: mw.y };
    if (V.downed) return { id: 'recover', title: 'Rest and recover', why: 'Grandmother\'s charm carried you home. Nothing important was lost.', hint: 'Wake up when you are ready.', target: { region: 'grove', x: D.home.x, y: D.home.y }, chapter: state.chapter };
    if (V.finalActive) return mk('final_fight', {}, mwT);
    const unplaced = state.fragments.find(r => !state.placed.includes(r));
    if (unplaced) return mk('place_fragment', { fragment: D.fragments[unplaced].name }, mwT);
    if (state.chapter === 0) {
      const s = D.tutorial[state.tutorial.step]; const plot = world.plots.find(p => p.seed) || world.plots[0];
      const ptarget = { region: 'grove', x: plot.x, y: plot.y };
      if (s.id === 'tut_request' || s.id === 'request') { return mk('tut_request', {}, Object.assign({ region: 'village' }, pointOf('village', 'wren')), { step: state.tutorial.step }); }
      if (s.id === 'brew') return mk('tut_brew', {}, Object.assign({ region: 'grove' }, pointOf('grove', 'cauldron')), { step: state.tutorial.step });
      return mk(s.objective, {}, ptarget, { step: state.tutorial.step });
    }
    if (state.chapter === 4) return mk('final', {}, mwT);
    if (state.chapter >= 5) { const act = quests().find(q => !q.main && q.status === 'active'); return act ? { id: 'postgame', title: act.title + ' (' + act.giverName + ')', why: D.objectives.postgame.why, hint: act.progress.label, target: { region: 'village' }, chapter: 5 } : mk('postgame', {}, null); }
    const R = STORY_REGIONS.find(r => !state.restored[r] && !state.fragments.includes(r));
    if (!R) return mk('final', {}, mwT);
    const reg = D.regions[R], lock = regionLock(R);
    if (lock) {
      const need = reg.requires.broom || reg.requires.broomOr || 1, lv = D.upgrades.broom.levels[Math.min(need, world.broom + 1)];
      return mk('need_broom', { need, why: lock, cost: costText(broomCost(world.broom + 1)) }, Object.assign({ region: 'village' }, pointOf('village', 'pip')), { cost: lv ? broomCost(world.broom + 1) : null });
    }
    if (world.region !== R) return mk('goto_region', { region: reg.name, why: reg.desc }, { region: R });
    if (world.mode === 'outside') return mk('enter_dungeon', { dungeon: reg.dungeon.name, region: reg.name }, Object.assign({ region: R }, pointOf(R, 'dungeon')));
    if (world.floor < 3) { const left = enemies.filter(e => e.hp > 0 && !e.dead).length; return left ? mk('descend', { floor: world.floor, left }, { region: R }) : mk('descend_go', {}, Object.assign({ region: R }, pointOf(R, 'stairs'))); }
    const b = enemies.find(e => e.mmBoss);
    return mk('boss', { boss: D.bosses[reg.boss].name }, b ? { region: R, x: b.x, y: b.y } : { region: R });
  }
  function pushObjective(force) {
    const o = objective(), key = o.id + '|' + o.title + '|' + o.hint;
    if (force || key !== V.objKey) { if (key !== V.objKey) { V.objKey = key; emit('objective', o); } }
    return o;
  }

  // ================================================================ proximity & interactions
  function proximity() {
    if (!inPlay() || V.downed || cinePlaying) return;
    if (world.region === 'grove' && world.mode === 'outside' && V.proxCooldown <= 0) {
      const mw = moonwellPos();
      if (tdist(game, mw) <= mw.r) {
        if (state.fragments.some(r => !state.placed.includes(r))) { V.proxCooldown = 2; placeFragments(); }
        else if (state.chapter === 4 && !V.finalActive && !state.flags.finalWon) { V.proxCooldown = 3; beginFinal(); }
      }
    }
  }
  function interactionsFor(regionId) {
    const reg = regionId || world.region, list = [];
    if (world.mode !== 'outside' && !regionId) {
      const left = enemies.some(e => e.hp > 0 && !e.dead), r = D.regions[reg];
      if (!left && r?.dungeon && (r.dungeon.endless || world.floor < 3)) list.push(Object.assign({ prompt: 'Descend deeper' }, D.interactions.stairs));
      list.push(Object.assign({ prompt: 'Climb back to the surface' }, D.interactions.exit));
    } else {
      for (const p of (D.interactions[reg] || [])) { const live = pointOf(reg, p.id) || p; list.push(Object.assign({}, p, { x: live.x, y: live.y }, p.id === 'moonwell' ? { prompt: state.fragments.some(r => !state.placed.includes(r)) ? 'Place the fragment' : state.chapter === 4 ? 'Face the Moonwell' : 'Visit the Moonwell' } : {})); }
      if (D.regions[reg]?.dungeon) { const d = pointOf(reg, 'dungeon'); list.push(Object.assign({}, D.interactions.dungeon, d || {}, { prompt: 'Enter ' + D.regions[reg].dungeon.name })); }
    }
    return list.map(p => Object.assign(p, { action: () => interact(p.id) }));
  }
  function nearestInteraction() { let best = null; for (const p of interactionsFor()) { const d = tdist(game, p); if (d <= (p.r || 1.2) && (!best || d < best.d)) best = Object.assign({ d }, p); } return best; }
  function nearPlot() { return world.plots.some(p => screenDistance(game, p) <= 52); }
  function openUI(screen, data) { try { if (MM.ui?.open) { MM.ui.open(screen, data); return true; } } catch (e) { console.warn('[campaign] ui.open', e); } emit('campaign:open', { screen, data }); return false; }
  function talk(npc) {
    const script = dialogue(npc);
    try { if (MM.ui?.dialogue) { MM.ui.dialogue(script); return { ok: true, dialogue: script }; } } catch (e) { console.warn('[campaign] ui.dialogue', e); }
    emit('campaign:talk', { npc, script });
    return { ok: true, dialogue: script };
  }
  // Interaction ids (exterior world ids from regions-visual.js + interior furniture ids for MM.interiors). See handoff.
  function interact(id, ctx) {
    const [kind, arg] = String(id || '').split(':');
    switch (kind) {
      case 'moonwell': return interactMoonwell();
      case 'seed_barrel': { const r = claimSeeds(); toast(r.msg, r.ok ? 'good' : 'info'); return r; }
      case 'cauldron': case 'alchemy_table': case 'brewing': case 'brew': V.activeCraft = world.region; openUI('crafting', { from: id }); return { ok: true, open: 'crafting' };
      case 'bed': case 'rest': { const r = rest(); toast(r.msg, r.ok ? 'good' : 'info'); return r; }
      case 'travel_board': case 'travel': openUI('travel', { from: id }); return { ok: true, open: 'travel' };
      case 'shop': case 'shop_counter': case 'counter': { const npc = D.shops[arg] ? arg : (world.region === 'village' || !arg ? 'pip' : 'pip'); api.activeShop = npc; openUI('shop', { npc, from: id }); return { ok: true, open: 'shop', npc }; }
      case 'herbs': case 'herb_shop': api.activeShop = 'wren'; openUI('shop', { npc: 'wren', from: id }); return { ok: true, open: 'shop', npc: 'wren' };
      case 'talk': case 'npc': return talk(arg || ctx?.id);
      case 'marrow': case 'pip': case 'wren': return talk(kind);
      case 'notice_board': case 'board': return talk('board');
      case 'dungeon': case 'dungeon_entrance': { const r = enterDungeonCampaign(); toast(r.msg, r.ok ? 'info' : 'warn'); return r; }
      case 'stairs': { const r = nextFloor(); if (!r.ok) toast(r.msg, 'warn'); return r; }
      case 'exit': case 'dungeon_exit': { const r = exitDungeon(); if (!r.ok) toast(r.msg, 'info'); return r; }
      default: return { ok: false, msg: 'Nothing happens.' };
    }
  }
  const WORLD_IDS = ['moonwell', 'seed_barrel', 'cauldron', 'alchemy_table', 'bed', 'travel_board', 'marrow', 'pip', 'wren', 'notice_board', 'shop', 'dungeon', 'stairs', 'exit'];
  let worldRegistered = false;
  function registerWorld() {
    if (worldRegistered || typeof MM.world?.register !== 'function') return;
    for (const id of WORLD_IDS) try { MM.world.register(id, (it) => { interact(id, it); return true; }); } catch (e) { console.warn('[campaign] world.register', id, e); }
    worldRegistered = true;
  }
  // Rest (cottage bed exterior/interior): advance a quarter day, crops grow for that time, full heal. Repeatable.
  function rest(opts) {
    const inside = MM.state?.current === 'interior';
    if (world.region !== 'grove' && !opts?.force) return { ok: false, msg: 'You can only rest at home.' };
    if (world.mode !== 'outside' && !inside) return { ok: false, msg: 'You can only rest at home.' };
    if (V.finalActive || enemies.some(e => e.hp > 0 && !e.dead && screenDistance(e, game) < 140)) return { ok: false, msg: 'You can\'t rest with danger this close.' };
    const secs = 30;     // a quarter of a 120 s day
    for (const p of world.plots) if (p.seed && (p.watered || world.weather === 'Rain') && p.growth < 100) {
      const c = D.crops[p.seed] || {}, base = 100 / (SEED_TYPES[p.seed]?.time || 30) * (world.cls === 'grove' ? 1.25 : 1) * (state.homestead.level >= 2 ? 1.15 : 1) * (c.nightBonus ? 1.2 : 1);
      p.growth = Math.min(100, p.growth + base * secs); p.watered = true;
    }
    world.time += .25; let newDay = false;
    if (world.time >= 1) { world.time -= 1; world.day++; world.weather = weatherFor(world.day); newDay = true; emit('day', { day: world.day, season: season(), weather: world.weather, rested: true }); }
    world.hp = heroMaxHP(); world.mana = 100;
    emit('campaign:rest', { day: world.day, time: world.time, newDay });
    requestSave('rest');
    return { ok: true, msg: newDay ? 'You sleep soundly. A new morning — day ' + world.day + '. The seed barrel has refilled.' : 'You rest a while by the hearth. Time passes; you feel restored.', newDay };
  }

  // ================================================================ dialogue
  function dialogue(npc) {
    const vars = { name: playerName() };
    if (npc === 'board') {
      const open = quests().filter(q => !q.main && q.status !== 'done');
      return { npc: 'board', speaker: 'Notice board', pages: [{ text: D.dialogue.board[1] }, { text: open.length ? 'Pinned requests: ' + open.map(q => q.title + ' (' + q.giverName + (q.status === 'active' ? ', ' + q.progress.label : ', new') + ')').join(' · ') : 'No new requests today. Check back after your next adventure.', choices: [{ label: 'Close', action: 'bye' }] }] };
    }
    const n = D.npcs[npc], L = D.dialogue[npc]; if (!n || !L) return { npc, speaker: npc, pages: [{ text: '…' }] };
    const pages = [];
    if (!state.talked[npc]) { L.first.forEach(t => pages.push({ text: fmt(t, vars) })); state.talked[npc] = true; }
    else { const lines = L['ch' + state.chapter] || L.ch0; pages.push({ text: fmt(lines[Math.floor(V.T) % lines.length], vars) }); }
    const choices = [];
    for (const r of D.requests.filter(r => r.giver === npc)) {
      const st = state.requests[r.id];
      if (st?.state === 'active') { const p = reqProgress(r); choices.push(p.have >= p.need ? { label: 'Hand in: ' + r.title, action: 'turnin:' + r.id } : { label: r.title + ' (' + p.label + ')', action: 'info:' + r.id }); }
      else if (!st && reqAvailable(r)) choices.push({ label: 'New request: ' + r.title, action: 'offer:' + r.id });
    }
    if (npc === 'pip') choices.push({ label: 'Browse the stall', action: 'shop' });
    if (npc === 'wren') { choices.push({ label: 'Browse herbs & seeds', action: 'shop' }); choices.push({ label: 'Use the brewing table', action: 'craft' }); }
    choices.push({ label: npc === 'marrow' ? 'Tell me about the Moonwell' : 'How are things?', action: 'lore' });
    if (canGift(npc)) choices.push({ label: 'Give a ' + itemName(n.likes) + ' (they love these)', action: 'gift' });
    choices.push({ label: 'Goodbye', action: 'bye' });
    const ready = choices.filter(c => c.action.startsWith('turnin')).length, offers = choices.filter(c => c.action.startsWith('offer')).length;
    pages.push({ text: ready ? 'You have something for me? Let\'s see!' : offers ? 'I could use a hand, if you have a moment.' : 'What can I do for you?', choices });
    return { npc, speaker: n.name, title: n.title, portrait: n.portrait, relation: state.relations[npc], pages };
  }
  const canGift = npc => { const n = D.npcs[npc]; return n && count(n.likes) > 0 && state.relations[npc] < 5 && state.gifts[npc] !== world.day; };
  const page = (npc, text, extra) => ({ npc, speaker: D.npcs[npc]?.name || 'Notice board', portrait: D.npcs[npc]?.portrait, pages: [{ text, choices: extra || [{ label: 'Back', action: 'back' }, { label: 'Goodbye', action: 'bye' }] }] });
  function choose(npc, action) {
    const [verb, arg] = String(action || '').split(':');
    if (verb === 'bye' || verb === 'close') return { ok: true, close: true };
    if (verb === 'back') return { ok: true, next: dialogue(npc) };
    if (verb === 'offer') { const r = reqDef(arg); if (!r) return { ok: false, msg: 'Unknown request.' }; return { ok: true, next: page(npc, r.desc + ' Reward: ' + r.reward.text + '.', [{ label: 'Accept', action: 'accept:' + r.id }, { label: 'Not now', action: 'back' }]) }; }
    if (verb === 'accept') { const r = acceptRequest(arg); return Object.assign(r, { next: page(npc, r.ok ? 'Thank you! ' + (reqDef(arg)?.type === 'deliver' ? 'Bring it by whenever it\'s ready.' : 'Come back when it\'s done.') : r.msg) }); }
    if (verb === 'turnin') { const r = turnIn(arg); return Object.assign(r, { next: page(npc, r.msg) }); }
    if (verb === 'info') { const r = reqDef(arg); const p = r ? reqProgress(r) : null; return { ok: true, next: page(npc, r ? r.desc + ' Progress: ' + p.label + '.' : '…') }; }
    if (verb === 'shop') { MM.campaign.activeShop = D.shops[npc] ? npc : 'pip'; return { ok: true, open: 'shop', npc: MM.campaign.activeShop }; }
    if (verb === 'craft') return { ok: true, open: 'crafting' };
    if (verb === 'lore') return { ok: true, next: page(npc, fmt(D.dialogue[npc].lore[state.relations[npc] % D.dialogue[npc].lore.length], { name: playerName() })) };
    if (verb === 'gift') {
      if (!canGift(npc)) return { ok: false, msg: 'Maybe tomorrow.', next: page(npc, 'You\'ve already been so kind today.') };
      const n = D.npcs[npc]; take(n.likes, 1); state.gifts[npc] = world.day; state.relations[npc] = Math.min(5, state.relations[npc] + 1);
      const thanks = { marrow: 'A moonflower! She used to leave these on my step. Thank you, truly.', pip: 'Ooh, a pepper! For the fire-arrows. You\'re a peach.', wren: 'A glowcap… oh, it\'s perfect. I\'ll plant the spores right away.' }[npc];
      emit('relation', { npc, value: state.relations[npc] });
      return { ok: true, msg: 'Friendship with ' + n.name + ' grew.', next: page(npc, thanks) };
    }
    return { ok: false, msg: 'Unknown choice.' };
  }

  // ================================================================ economy: shop, crafting, items
  function shopPrice(entry, npc) {
    let p = entry.price || 0;
    if (entry.kind === 'seed' && state.flags.pip_discount) p *= .75;
    if (npc === 'pip' && state.relations.pip >= 3) p *= .9;
    return Math.max(1, Math.round(p));
  }
  function sellPrice(id, npc) {
    if (String(id).startsWith('gear:')) { const g = world.gear[Number(id.slice(5))]; return g ? 5 + (g.power || 0) * 3 : 0; }
    const it = D.items[id]; if (!it || !it.sell || it.story) return 0;
    let p = it.sell; if (npc === 'wren' && (id === 'glowcap' || id === 'starmint')) p = Math.round(p * 1.2);
    return p;
  }
  function shop(npc) {
    npc = D.shops[npc] ? npc : (MM.campaign.activeShop || 'pip');
    const S = D.shops[npc], stock = [];
    for (const e of S.stock) {
      if (e.kind === 'equipment') {
        const id = e.id.slice(6), q = D.equipment.items[id]; if (!q) continue;
        const locked = q.unlock && !cond(q.unlock);
        stock.push({ id: e.id, name: q.name, desc: q.desc, icon: 'equip_' + id, kind: 'equipment', slot: q.slot, tier: q.tier, price: q.cost.gold, cost: q.cost, costText: costText(q.cost), owned: state.owned.includes(id), equipped: state.equipment[q.slot] === id, locked: !!locked, reason: locked ? unlockHint(q.unlock) : null, canAfford: canPay(q.cost) });
      } else if (e.kind === 'upgrade') {
        const u = upgrades().find(x => x.id === e.id.slice(8)); if (!u) continue;
        stock.push({ id: e.id, name: u.name + (u.level < u.max ? ' → Lv ' + (u.level + 1) : ' (max)'), desc: u.nextDesc || u.desc, icon: 'upgrade_' + u.id, kind: 'upgrade', price: u.cost?.gold || 0, cost: u.cost, costText: u.cost ? costText(u.cost) : '—', level: u.level, max: u.max, maxed: u.level >= u.max, locked: !!u.locked, reason: u.reason, canAfford: u.canAfford });
      } else {
        if (e.unlock && !cond(e.unlock)) continue;
        const it = D.items[e.id];
        stock.push({ id: e.id, name: it.name + (e.qty > 1 ? ' ×' + e.qty : ''), desc: it.desc, icon: it.icon || e.id, kind: e.kind, qty: e.qty, price: shopPrice(e, npc), have: count(e.id), canAfford: world.gold >= shopPrice(e, npc) });
      }
    }
    const sell = {};
    for (const id of Object.keys(D.items)) { const p = sellPrice(id, npc); if (p && count(id) > 0) sell[id] = p; }
    world.gear.forEach((g, i) => { if (world.equipped !== i + 1) sell['gear:' + i] = sellPrice('gear:' + i); });
    return { npc, name: S.name, greeting: S.greeting, gold: Math.floor(world.gold), stock, sell };
  }
  function buy(id, qty, npc) {
    qty = Math.max(1, Math.floor(qty || 1)); npc = npc || MM.campaign.activeShop || 'pip';
    if (String(id).startsWith('equip:')) return buyEquipment(id.slice(6));
    if (String(id).startsWith('upgrade:')) return buyUpgrade(id.slice(8));
    const S = D.shops[npc] || D.shops.pip, e = S.stock.find(x => x.id === id) || D.shops.pip.stock.find(x => x.id === id);
    if (!e) return { ok: false, msg: 'That isn\'t for sale here.' };
    if (e.unlock && !cond(e.unlock)) return { ok: false, msg: 'Not in stock yet.' };
    const total = shopPrice(e, npc) * qty;
    if (world.gold < total) return { ok: false, msg: 'You need ' + (total - Math.floor(world.gold)) + ' more gold.' };
    take('gold', total); addItem(id, (e.qty || 1) * qty);
    emit('shop', { action: 'buy', id, qty, total });
    return { ok: true, msg: 'Bought ' + itemName(id) + ' ×' + ((e.qty || 1) * qty) + ' for ' + total + ' gold.' };
  }
  function sell(id, qty, npc) {
    qty = Math.max(1, Math.floor(qty || 1)); npc = npc || MM.campaign.activeShop || 'pip';
    if (String(id).startsWith('gear:')) {
      const i = Number(id.slice(5)), g = world.gear[i]; if (!g) return { ok: false, msg: 'Nothing to sell.' };
      if (world.equipped === i + 1) return { ok: false, msg: 'Unequip it first.' };
      const p = sellPrice(id); world.gear.splice(i, 1); if (world.equipped > i + 1) world.equipped--; addItem('gold', p);
      emit('shop', { action: 'sell', id, qty: 1, total: p }); return { ok: true, msg: 'Sold ' + g.name + ' for ' + p + ' gold.' };
    }
    const p = sellPrice(id, npc); if (!p) return { ok: false, msg: 'Pip shakes his head kindly. "Keep that one."' };
    qty = Math.min(qty, count(id)); if (qty <= 0) return { ok: false, msg: 'You have none to sell.' };
    take(id, qty); addItem('gold', p * qty);
    if (D.items[id].kind === 'crop') state.counters.sold += qty;
    emit('shop', { action: 'sell', id, qty, total: p * qty });
    return { ok: true, msg: 'Sold ' + qty + ' ' + itemName(id) + ' for ' + p * qty + ' gold.' };
  }
  function sellAllCrops(npc) { let total = 0, n = 0; for (const c of Object.keys(D.crops)) { const k = count(c); if (k) { const r = sell(c, k, npc); if (r.ok) { total += sellPrice(c, npc) * k; n += k; } } } return n ? { ok: true, msg: 'Sold ' + n + ' crops for ' + total + ' gold.' } : { ok: false, msg: 'No crops to sell.' }; }
  function claimSeeds() {
    if (world.region !== 'grove') return { ok: false, msg: 'The seed barrel is at the homestead.' };
    if (state.seedBarrelDay === world.day) return { ok: false, msg: 'The barrel is empty — it refills every morning.' };
    state.seedBarrelDay = world.day;
    const got = Object.assign({}, D.dailySeeds.base), pool = Object.keys(D.crops).filter(c => c !== 'wheat' && (!D.cropUnlock[c] || cond(D.cropUnlock[c])));
    for (let i = 0; i < D.dailySeeds.extraPerHomestead * Math.max(1, state.homestead.level); i++) { const c = pool[Math.floor(Math.random() * pool.length)] || 'wheat'; got[c] = (got[c] || 0) + 1; }
    for (const [c, n] of Object.entries(got)) world.seeds[c] = (world.seeds[c] || 0) + n;
    const text = Object.entries(got).map(([c, n]) => n + ' ' + itemName('seed_' + c)).join(', ');
    emit('inventory', { id: 'seeds' });
    return { ok: true, msg: fmt(D.toasts.seedBarrel, { text }), seeds: got };
  }
  function recipes() { return D.recipes.map(r => ({ id: r.id, name: r.name, desc: r.desc, ingredients: Object.assign({}, r.ingredients), makes: Object.keys(r.makes)[0], makesQty: Object.values(r.makes)[0], icon: r.icon, unlocked: state.recipes.includes(r.id), canCraft: state.recipes.includes(r.id) && Object.entries(r.ingredients).every(([k, v]) => count(k) >= v), unlockHint: state.recipes.includes(r.id) ? null : unlockHint(r.unlock), have: Object.fromEntries(Object.keys(r.ingredients).map(k => [k, count(k)])) })); }
  function craft(id, times) {
    times = Math.max(1, Math.floor(times || 1));
    const r = D.recipes.find(x => x.id === id); if (!r) return { ok: false, msg: 'Unknown recipe.' };
    if (!state.recipes.includes(id)) return { ok: false, msg: 'You haven\'t learned ' + r.name + ' yet.' };
    let made = 0;
    for (let i = 0; i < times; i++) {
      if (!Object.entries(r.ingredients).every(([k, v]) => count(k) >= v)) break;
      for (const [k, v] of Object.entries(r.ingredients)) take(k, v);
      for (const [k, v] of Object.entries(r.makes)) addItem(k, v); made++;
    }
    if (!made) return { ok: false, msg: 'Missing ingredients: ' + Object.entries(r.ingredients).filter(([k, v]) => count(k) < v).map(([k, v]) => (v - count(k)) + ' ' + itemName(k)).join(', ') + '.' };
    onCrafted(id, made);
    const [mk, mv] = Object.entries(r.makes)[0];
    return { ok: true, msg: 'Brewed ' + itemName(mk) + ' ×' + mv * made + '.' };
  }
  function useItem(id) {
    if (count(id) <= 0) return { ok: false, msg: 'You have none.' };
    const it = D.items[id]; if (!it) return { ok: false, msg: 'Unknown item.' };
    if (it.kind === 'seed') { world.seed = it.crop; return { ok: true, msg: 'Planting ' + it.name + ' next.' }; }
    const max = heroMaxHP();
    switch (id) {
      case 'potion': { const n = world.potions; drink(); return world.potions < n ? { ok: true, msg: 'Healing Draught: +40 health, +25 mana.' } : { ok: false, msg: 'Health and mana are already full.' }; }
      case 'greater_potion': if (world.hp >= max) return { ok: false, msg: 'Health is already full.' }; take(id); world.hp = Math.min(max, world.hp + 80); return { ok: true, msg: 'Greater Healing: +80 health.' };
      case 'mana_tonic': if (world.mana >= 99) return { ok: false, msg: 'Mana is already full.' }; take(id); world.mana = Math.min(100, world.mana + 60); return { ok: true, msg: 'Mana Tonic: +60 mana.' };
      case 'starlight': take(id); world.hp = max; world.mana = 100; world.ward = Math.min(60, (world.ward || 0) + 30); return { ok: true, msg: 'Starlight Elixir: fully restored, with a shimmering ward.' };
      case 'nightvision': case 'hearthfire': case 'mireward': take(id); state.buffs[id] = id === 'nightvision' ? 90 : 150; emit('buff', { id, time: state.buffs[id] }); return { ok: true, msg: it.name + ' takes effect.' };
      case 'growth_tonic': {
        const planted = world.plots.filter(p => p.seed && p.growth < 100); if (!planted.length) return { ok: false, msg: 'Nothing is growing in the garden right now.' };
        take(id); for (const p of planted) { p.growth = Math.min(100, p.growth + 50); p.watered = true; } return { ok: true, msg: 'The garden shoots up with a happy rustle.' };
      }
      case 'bomb': { const n = world.bombs; throwBomb(); return world.bombs < n ? { ok: true, msg: 'Ember bomb away!' } : { ok: false, msg: 'No target in range.' }; }
      default: return { ok: false, msg: 'You can\'t use that right now.' };
    }
  }
  function inventory() {
    const groups = [['Crops', 'crop'], ['Seeds', 'seed'], ['Potions & bombs', ['potion', 'bomb']], ['Materials', ['material', 'rune']], ['Story', ['fragment', 'key']]];
    const out = groups.map(([name, kinds]) => ({ name, items: Object.entries(D.items).filter(([id, it]) => [].concat(kinds).includes(it.kind) && (count(id) > 0 || (it.kind === 'fragment' && state.placed.includes(Object.keys(D.fragments).find(r => D.fragments[r].item === id))))).map(([id, it]) => ({ id, name: it.name, count: count(id), icon: it.icon || id, desc: it.desc + (it.kind === 'fragment' && !count(id) ? ' (Resting in the Moonwell.)' : ''), sellPrice: sellPrice(id) || null, usable: !!it.usable || it.kind === 'seed', kind: it.kind, selected: it.kind === 'seed' && world.seed === it.crop })) }));
    out.push({ name: 'Found gear', items: world.gear.map((g, i) => ({ id: 'gear:' + i, name: g.name, count: 1, icon: 'gear_' + String(g.rarity || 'common').toLowerCase(), desc: 'Power ' + g.power + ' · ' + g.affix + ' · sockets ' + g.sockets + '/' + g.maxSockets, sellPrice: sellPrice('gear:' + i), usable: false, equipped: world.equipped === i + 1, kind: 'gear' })) });
    return { gold: Math.floor(world.gold), groups: out.filter(g => g.items.length) };
  }

  // ---------------------------------------------------------------- equipment
  const equipBonus = slot => D.equipment.items[state.equipment[slot]]?.bonus || 0;
  const wandBonus = () => equipBonus('wand');
  function equipment() {
    const slots = D.equipment.slots.map(slot => { const id = state.equipment[slot], q = D.equipment.items[id]; return { slot, id, name: q?.name, desc: q?.desc, tier: q?.tier, bonus: q?.bonus }; });
    const g = world.gear[world.equipped - 1];
    slots.push({ slot: 'trinket', id: g ? 'gear:' + (world.equipped - 1) : null, name: g ? g.name : null, desc: g ? 'Power ' + g.power + ' · ' + g.affix : 'Found gear from dungeons goes here.', tier: g ? g.power : 0 });
    const owned = state.owned.map(id => { const q = D.equipment.items[id]; return { id, name: q.name, slot: q.slot, tier: q.tier, desc: q.desc, equipped: state.equipment[q.slot] === id }; })
      .concat(world.gear.map((g, i) => ({ id: 'gear:' + i, name: g.name, slot: 'trinket', tier: g.power, desc: 'Power ' + g.power + ' · ' + g.affix, equipped: world.equipped === i + 1 })));
    return { slots, owned, stats: { spellBonus: Math.round(wandBonus() * 100), maxHP: heroMaxHP(), manaRegen: 8 + equipBonus('charm') } };
  }
  function equip(id) {
    if (String(id).startsWith('gear:')) { const i = Number(id.slice(5)); if (!world.gear[i]) return { ok: false, msg: 'Not found.' }; world.equipped = i + 1; return { ok: true, msg: 'Equipped ' + world.gear[i].name + '.' }; }
    const q = D.equipment.items[id]; if (!q || !state.owned.includes(id)) return { ok: false, msg: 'You don\'t own that.' };
    state.equipment[q.slot] = id; world.hp = Math.min(world.hp, heroMaxHP()); emit('equip', { slot: q.slot, id });
    return { ok: true, msg: 'Equipped ' + q.name + '.' };
  }
  function buyEquipment(id) {
    const q = D.equipment.items[id]; if (!q) return { ok: false, msg: 'Unknown item.' };
    if (state.owned.includes(id)) return { ok: false, msg: 'You already own ' + q.name + '.' };
    if (q.unlock && !cond(q.unlock)) return { ok: false, msg: 'Pip: "Not in stock yet — ' + unlockHint(q.unlock) + '."' };
    if (!pay(q.cost)) return { ok: false, msg: 'You need ' + missing(q.cost) + '.' };
    state.owned.push(id);
    const cur = D.equipment.items[state.equipment[q.slot]]; if (!cur || q.tier > cur.tier) state.equipment[q.slot] = id;
    emit('shop', { action: 'buy', id: 'equip:' + id }); requestSave('buy');
    return { ok: true, msg: 'Bought and equipped ' + q.name + '. ' + q.desc };
  }

  // ---------------------------------------------------------------- upgrades
  function broomCost(lv) { const L = D.upgrades.broom.levels[lv]; if (!L) return null; const c = clone(L.cost); if (state.flags.broom_discount) c.gold = Math.round(c.gold * .8); return c; }
  function upgrades() {
    const out = [], U = D.upgrades;
    const bl = world.broom, bc = broomCost(bl + 1);
    out.push({ id: 'broom', name: U.broom.name, desc: U.broom.desc, level: bl, max: U.broom.max, cost: bc, costText: bc ? costText(bc) : null, nextDesc: U.broom.levels[bl + 1]?.desc || 'Fully tuned.', canAfford: !!bc && canPay(bc), apply: 'flight speed +15% per level; Lv1 opens the swamp, Lv2 opens Frostpeak early' });
    const hl = state.homestead.level, hL = U.homestead.levels[hl + 1];
    out.push({ id: 'homestead', name: U.homestead.name, desc: U.homestead.desc, level: hl, max: U.homestead.max, cost: hL ? hL.cost : null, costText: hL ? costText(hL.cost) : null, nextDesc: hL ? hL.name + ': ' + hL.desc : 'Fully restored.', canAfford: !!hL && canPay(hL.cost), apply: 'restoration visuals + garden perks' });
    for (const s of D.spells) {
      const rk = rankOf(s.id), L = U.spells.levels[rk + 1], unl = state.spells.unlocked.includes(s.id);
      out.push({ id: 'spell_' + s.id, name: s.name + ' mastery', desc: U.spells.desc, level: rk, max: U.spells.max, cost: L ? L.cost : null, costText: L ? costText(L.cost) : null, nextDesc: L ? 'Rank ' + (rk + 1) + ': +' + (rk + 1) * 15 + '% damage' : 'Mastered.', canAfford: unl && !!L && canPay(L.cost), locked: !unl, reason: unl ? null : 'Learn ' + s.name + ' first.', apply: '+15% damage per rank' });
    }
    const paths = ['Power', 'Guard', 'Growth'], pdesc = ['+10% spell damage per rank', '+20 max health per rank', '+2 mana/s and +12% crop growth per rank'];
    ranks().forEach((r, i) => out.push({ id: 'skill_' + i, name: 'Skill: ' + paths[i], desc: pdesc[i], level: r, max: 3, cost: r < 3 ? { points: 1 } : null, costText: r < 3 ? '1 skill point' : null, nextDesc: pdesc[i], canAfford: r < 3 && world.points > 0, apply: pdesc[i], skill: true }));
    return out;
  }
  function buyUpgrade(id) {
    const u = upgrades().find(x => x.id === id); if (!u) return { ok: false, msg: 'Unknown upgrade.' };
    if (u.locked) return { ok: false, msg: u.reason };
    if (u.level >= u.max || !u.cost) return { ok: false, msg: u.name + ' is already at its best.' };
    if (!canPay(u.cost)) return { ok: false, msg: 'You need ' + missing(u.cost) + '.' };
    if (u.skill) { const i = Number(id.slice(6)); try { upgradeSkill(i); } catch (_) { } return { ok: true, msg: u.name + ' rank ' + ranks()[i] + '.' }; }
    pay(u.cost);
    if (id === 'broom') { world.broom = Math.min(3, world.broom + 1); toast('Broom tuned to level ' + world.broom + '!', 'unlock'); }
    else if (id === 'homestead') { state.homestead.level = Math.min(4, state.homestead.level + 1); applyRestorationVisuals(); try { MM.fx?.restorationWave?.('grove'); } catch (_) { } toast('Homestead: ' + D.upgrades.homestead.levels[state.homestead.level].name + '!', 'unlock'); }
    else if (id.startsWith('spell_')) { const s = id.slice(6); state.spells.ranks[s] = rankOf(s) + 1; }
    emit('upgrade', { id, level: (upgrades().find(x => x.id === id) || {}).level }); requestSave('upgrade:' + id); pushObjective(true);
    return { ok: true, msg: u.name + ' upgraded. ' + (u.nextDesc || '') };
  }
  function unlockHint(c) {
    if (!c || c === 'start') return 'available';
    const one = String(c).split('|')[0], [k, v] = one.split(':');
    if (k === 'chapter') return 'reach chapter ' + v + ' (' + D.chapters[Number(v)].name + ')';
    if (k === 'fragment') return 'recover the ' + D.fragments[v].name;
    if (k === 'request') return 'finish "' + (reqDef(v)?.title || v) + '"';
    if (k === 'tutorial') return 'finish settling in at the homestead';
    if (k === 'flag') return 'help a villager';
    return 'later';
  }

  // ================================================================ regions / map / spells listing
  function regions() {
    return D.regionOrder.filter(id => !(D.regions[id].hidden && state.chapter < 5)).map(id => {
      const r = D.regions[id], lock = id === 'grove' ? null : regionLock(id), bossId = r.boss;
      return { id, name: r.name, short: r.short, desc: r.desc, level: r.level, recommended: r.recommended, locked: !!lock, reason: lock, optional: !!r.optional,
        boss: bossId ? { id: bossId, name: D.bosses[bossId].name, defeated: !!state.bosses[bossId] } : null, restored: !!state.restored[id], fragment: r.fragment ? { name: D.fragments[r.fragment].name, found: state.fragments.includes(r.fragment), placed: state.placed.includes(r.fragment) } : null,
        visited: !!state.visited[id], current: world.region === id, dungeon: r.dungeon ? { name: r.dungeon.name, floors: r.dungeon.floors.slice() } : null, hazards: r.hazards.map(h => D.hazards[h]?.name || h), resources: r.resources.slice() };
    });
  }
  function spells() {
    const list = D.spells.map(s => {
      const b = SPELLS[spellIdx(s.id)], cost = Math.min(17, 6 + Math.floor(s.damage / 16)) + (s.extraCost || 0);
      return { id: s.id, name: s.name, desc: s.description, icon: s.icon, unlocked: state.spells.unlocked.includes(s.id), key: s.key, cost, cooldown: cdOf(s), remaining: +(V.cooldowns[s.id] || 0).toFixed(2), school: s.school, damage: s.damage, rank: rankOf(s.id), selected: SPELLS[spellIndex]?.id === s.id, unlockHint: state.spells.unlocked.includes(s.id) ? null : unlockHint(s.unlock), signature: true, kind: b?.kind };
    });
    if (state.chapter >= 5) for (const s of SPELLS) if (!SIG.includes(s.id)) list.push({ id: s.id, name: s.name, desc: s.description, icon: 'spell_' + s.id, unlocked: true, key: null, cost: s.summon ? 18 : (s.blessing || s.rewind || s.cloak) ? 15 : Math.min(17, 6 + Math.floor(s.damage / 16)), cooldown: 0, remaining: 0, school: s.school, damage: s.damage, rank: 0, selected: SPELLS[spellIndex]?.id === s.id, signature: false });
    return list;
  }
  function selectSpell(id) { const i = spellIdx(id); if (i < 0) return { ok: false, msg: 'Unknown spell.' }; if (!spellOk(id)) return { ok: false, msg: 'Not learned yet.' }; _chooseSpell(i); emit('spell:select', { id }); return { ok: true, msg: SPELLS[i].name + ' ready.' }; }

  // ================================================================ draw layer (hazards, zones, telegraphs, fallbacks)
  function drawLayer() {
    if (!ready) return;
    const t = game.elapsed;
    for (const h of V.hazards) {
      if (h.global) continue; const p = worldToCanvas(h.x, h.y), rx = h.r * 22.6, ry = h.r * 11.3;
      if (h.kind === 'brambles') {
        ctx.fillStyle = 'rgba(70,52,38,.35)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
        for (let i = 0; i < 9; i++) { const a = i * 2.2, rr = .25 + (i % 3) * .3, x = Math.round(p.x + Math.cos(a) * rr * rx), y = Math.round(p.y + Math.sin(a) * rr * ry); fill('#5a4030', x - 3, y - 4, 7, 1); fill('#6e5040', x, y - 7, 1, 7); fill('#c9b78a', x + 2, y - 6, 1, 1); fill('#c9b78a', x - 2, y - 3, 1, 1); }
      } else if (h.kind === 'bog') {
        ctx.fillStyle = 'rgba(48,72,58,.42)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(120,160,130,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(p.x, p.y, rx * .7, ry * .7, 0, 0, Math.PI * 2); ctx.stroke();
        for (let i = 0; i < 3; i++) { const k = (t * .7 + i * .33) % 1; fill('rgba(170,210,180,' + (1 - k) * .7 + ')', p.x - 8 + i * 8, p.y - 1 - Math.round(k * 4), 2, 2); }
      } else if (h.kind === 'warm') {
        ctx.fillStyle = 'rgba(255,170,90,.10)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
    KIT()?.draw(ctx);
  }
  // ================================================================ start / new game
  function resetWorldForNewGame() {
    world = newWorld(); enemies = []; lootDrops = []; allies = []; party = []; dungeonBlocks = [];
    game = freshGame(); const p = project(game.x, game.y); game.camX = p.x; game.camY = p.y;
    familiarSprite.x = game.x + .55; familiarSprite.y = game.y - .55;
    try { resetTraining(); } catch (_) { }
    try { drawGround(); } catch (_) { }
  }
  function start(opts) {
    opts = opts || {};
    if (opts.fresh || !MM.game?.newGame) resetWorldForNewGame();
    state = fresh(); state.started = true;
    const S = D.start;
    world.gold = S.gold; world.potions = S.potions; world.bombs = S.bombs; world.runes = S.runes; world.cls = S.cls; world.seed = 'wheat';
    world.seeds = Object.assign({}, S.seeds); world.harvest = Object.assign({}, S.harvest);
    afterLoad(true);
    selectFirstSpell();
    // The intro cinematic is shown by MM.flow before the main menu (phase 3); the campaign just begins the Arrival chapter.
    if (!state.memories.includes('intro')) state.memories.push('intro');
    grantOnce('cine.intro', () => addItem('moon_charm', 1));
    syncFlowTutorial();
    emit('campaign:start', { chapter: state.chapter });
    toast(state.tutorial.done ? 'Welcome home. Elder Marrow is waiting in the village.' : 'Welcome home. The old garden is waiting.', 'story');
    pushObjective(true);
    requestSave('campaign-start');
    return Promise.resolve({ ok: true, chapter: state.chapter });
  }
  // If the interactive tutorial (MM.flow, persisted in MM.storage 'moss-moon-flow-v1') was completed or skipped, the Arrival
  // story chain auto-completes: the village opens and Wren's first request is simply offered (no forced re-teaching).
  function flowTutorialDone() {
    try {
      if (typeof MM.flow?.tutorialDone === 'function') return !!MM.flow.tutorialDone();
      if (MM.flow && typeof MM.flow.tutorialDone === 'boolean') return MM.flow.tutorialDone;
      if (MM.flow?.flags?.tutorialDone != null) return !!MM.flow.flags.tutorialDone;
      const raw = MM.storage?.get?.('moss-moon-flow-v1') ?? (() => { try { return localStorage.getItem('moss-moon-flow-v1'); } catch (_) { return null; } })();
      const o = typeof raw === 'string' ? JSON.parse(raw) : raw; return !!o?.tutorialDone;
    } catch (_) { return false; }
  }
  function syncFlowTutorial() {
    if (state.tutorial.done || !flowTutorialDone()) return false;
    state.tutorial.step = D.tutorial.length; state.tutorial.done = true; state.flags.flowTutorial = true;
    emit('tutorial', { step: state.tutorial.step, id: 'auto', skipped: true });
    applyChapter(true); applyUnlocks(true); pushObjective(true);
    return true;
  }

  // ================================================================ debug / test helpers (real code paths)
  const step = (sec, dt) => { dt = dt || 1 / 30; const n = Math.ceil(sec / dt); for (let i = 0; i < n; i++) update(dt); };
  const debug = {
    step,
    give(item, n) { addItem(item, n == null ? 1 : n); return count(item); },
    grantFragment(region) { return obtainFragment(region); },
    teleport(x, y, region) { if (region && region !== world.region) { V.respawning = true; try { _goRegion(region); onAreaChanged(); } finally { V.respawning = false; } } game.x = x; game.y = y; game.vx = game.vy = 0; game.target = null; const p = project(x, y); game.camX = p.x; game.camY = p.y; V.lastPos = { x, y }; return { x, y, region: world.region }; },
    killAll(includeBoss) { let n = 0; for (const e of enemies.slice()) if (e.hp > 0 && !e.dead && !e.mmWell && (includeBoss || !e.mmBoss) && !e.mmInvuln) { hitEntity(e, e.hp + 999, '#ffffff', game); n++; } return n; },
    killBoss(maxIter) {
      for (let it = 0; it < (maxIter || 600); it++) {
        const b = enemies.find(e => e.mmBoss && e.hp > 0 && !e.dead);
        if (!b) return { ok: true, iterations: it };
        if (b.mmInvuln) { for (const a of enemies.filter(e => e.hp > 0 && !e.dead && e.mmOwner === b.id)) hitEntity(a, a.hp + 5, '#ffffff', game); }
        else hitEntity(b, Math.max(1, Math.ceil(b.maxHP * .12)), '#ffffff', game);
        step(.2);
        if (MM.state?.current && MM.state.current !== 'play') return { ok: !enemies.some(e => e.mmBoss && e.hp > 0), iterations: it, state: MM.state.current };
      }
      return { ok: false, msg: 'boss still alive' };
    },
    hurt(n) { return KIT()?.hurt(n, { kind: 'debug', ignoreWard: true }); },
    heal() { world.hp = heroMaxHP(); world.mana = 100; },
    setTime(t) { world.time = t; },
    quietCines(on) { V.quietCines = !!on; },
    skipTo(ch) {
      V.quietCines = true;
      try {
        if (ch >= 1 && !state.tutorial.done) { for (const s of ['plant', 'water', 'harvest', 'brew']) tut(s); acceptRequest('wren_seeds'); }
        const regs = STORY_REGIONS.slice(0, Math.max(0, Math.min(3, ch - 1)));
        for (const r of regs) { state.bosses[D.regions[r].boss] = true; obtainFragment(r, true); restoreRegion(r); }
        if (ch >= 5 && !state.flags.finalWon) { state.bosses.hollow_moon = true; finishFinal(); }
        applyChapter();
      } finally { V.quietCines = false; }
      return state.chapter;
    },
    snapshot() { return { chapter: state.chapter, tutorial: Object.assign({}, state.tutorial), fragments: state.fragments.slice(), placed: state.placed.slice(), restored: Object.assign({}, state.restored), bosses: Object.assign({}, state.bosses), gold: Math.floor(world.gold), hp: world.hp, region: world.region, mode: world.mode, floor: world.floor, memories: state.memories.slice(), rewarded: Object.keys(state.rewarded).sort(), homestead: state.homestead.level, moonwell: state.moonwell.level, items: Object.assign({}, state.items), spells: state.spells.unlocked.slice(), recipes: state.recipes.slice(), requests: clone(state.requests), endingSeen: state.endingSeen, finalActive: V.finalActive, downed: V.downed, broom: world.broom, level: world.level, enemies: enemies.filter(e => e.hp > 0).length }; },
    V
  };

  // ================================================================ public API
  const api = {
    get state() { return state; },
    data: D,
    objective, grantOnce, start, quests, recipes, craft, shop, buy, sell, sellAllCrops, upgrades, buyUpgrade,
    regions, travelTo, enterDungeon: enterDungeonCampaign, nextFloor, exitDungeon, dialogue, choose, talk, interact, interactions: interactionsFor,
    inventory, useItem, equipment, equip, spells, selectSpell, selectSeed(crop) { if (!SEED_TYPES[crop]) return { ok: false, msg: 'Unknown seed.' }; world.seed = crop; return { ok: true, msg: 'Planting ' + SEED_TYPES[crop].name + ' next.' }; },
    claimSeeds, recover, acceptRequest, turnIn, placeFragments, beginFinal,
    map() { return { regions: regions(), player: { region: world.region, mode: world.mode, floor: world.floor, x: game.x, y: game.y }, objective: objective(), interactions: interactionsFor() }; },
    status() { const bs = BOSS()?.active?.() || []; return { chapter: state.chapter, chapterName: D.chapters[state.chapter].name, objective: objective(), fragments: { found: state.fragments.slice(), placed: state.placed.slice() }, homestead: state.homestead.level, moonwell: state.moonwell.level, broom: world.broom, hazard: hazardStatus(), buffs: Object.assign({}, state.buffs), cooldowns: Object.assign({}, V.cooldowns), boss: bs[0] || null, downed: V.downed, finalActive: V.finalActive, defeat: V.downed ? V.lastDefeat : null }; },
    hazards: () => V.hazards.map(h => Object.assign({}, h)), hazardStatus, hasBuff, slowPlayer, damageTakenMul, isDown: () => V.downed, onPlayerDown, onBossDefeated, spawnArch, moonwellPos, toast,
    lastDefeat: () => V.lastDefeat, rest, pointOf, isDormant: dormant,
    on(name, fn) { (listeners[name] = listeners[name] || []).push(fn); return () => { listeners[name] = listeners[name].filter(f => f !== fn); }; },
    activeShop: 'pip', debug, playStory, regionLock, version: 1
  };
  MM.campaign = api;

  // ================================================================ boot
  let ready = false;
  function lateInit() {
    trySaveRegister(); registerWorld();
    if (!api._hooked && typeof MM.hooks?.on === 'function') {
      api._hooked = true;
      try { MM.hooks.on('drawables', (list, project) => {
        if (dormant() || !MM.art?.has?.('brazier')) return;
        for (const h of V.hazards) if (h.kind === 'warm') list.push({ type: 'custom', x: h.x, y: h.y, depth: project(h.x, h.y).y, draw: (c, pos) => MM.art.draw(c, 'brazier', pos.x, pos.y, { t: game.elapsed }) });
      }, 5); } catch (e) { console.warn('[campaign] hooks.on drawables', e); }
      try { MM.hooks.on('drawGround', () => { hookFrame = frameNo; try { drawLayer(); } catch (e) { console.error('[campaign] drawLayer', e); } }, 5); } catch (e) { console.warn('[campaign] hooks.on', e); }
    }
    if (!api._busHooked && typeof MM.bus?.on === 'function') {
      api._busHooked = true;
      MM.bus.on('ready', lateInit);
      MM.bus.on('state', d => { if (d?.to === 'play') flushToasts(); });
      MM.bus.on('respawn', () => { try { onRespawned(); } catch (e) { console.error('[campaign] respawn', e); } });
      MM.bus.on('game:new', () => { V.downed = false; V.finalActive = false; });
    }
  }
  if (!trySaveRegister()) fallbackLoad();
  afterLoad(true);
  ready = true;
  lateInit();
  document.addEventListener('DOMContentLoaded', lateInit);
  window.addEventListener('load', lateInit);
})();
