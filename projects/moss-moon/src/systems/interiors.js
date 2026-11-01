'use strict';
// Moss & Moon — MM.interiors: enterable building interiors as the screen state 'interior' (owner: INTERIORS).
// Loaded after baseline.js and world-render.js (it wraps moveActor outermost). Data: MM.BUILDINGS (src/config/buildings.js).
// Rendering: src/systems/interior-render.js (MM.interiorRender). Docs: notes/BUILDINGS.md.
//
// How it works: the room is laid out in local floor coords [0,W]x[0,D] and placed at a fixed origin O inside the
// baseline's 20x20 movement box, so the baseline controller (input, acceleration, animation, 8-way facing) runs
// unchanged under CORE's sim:'player' policy; only collision is swapped (moveActor wrapper) while inside. The player's
// exterior position is never needed again: on exit the player is put on the building's validated outside spawn.
window.MM = window.MM || {};
(function () {
  const MM = window.MM;
  try { game; world; project; } catch (e) { console.warn('[MM.interiors] baseline missing; interiors disabled'); return; } // eslint-disable-line no-undef
  if (!MM.BUILDINGS || !MM.buildings) { console.warn('[MM.interiors] MM.BUILDINGS missing (load src/config/buildings.js)'); return; }
  const BD = MM.BUILDINGS, BU = MM.buildings, U = BD.unit;
  const G = () => game, W = () => world; // eslint-disable-line no-undef
  const base = (n) => (typeof window[n] === 'function' ? window[n] : null);
  const call = (n, ...a) => { const f = base(n); if (!f) return undefined; try { return f(...a); } catch (e) { console.error('[MM.interiors] ' + n, e); return undefined; } };
  const now = () => (window.performance ? performance.now() : Date.now()) / 1000;
  const emit = (n, d) => { try { MM.bus && MM.bus.emit(n, d); } catch (e) { /* */ } };
  const sfx = (id, o) => { try { MM.audio && MM.audio.sfx && MM.audio.sfx(id, o); } catch (e) { /* */ } };
  const toast = (text, kind) => { try { if (MM.ui && MM.ui.toast) { MM.ui.toast(text, kind || 'info'); return; } } catch (e) { /* */ } call('message', text); };
  const glyph = (a) => { try { return (MM.input && MM.input.glyph && MM.input.glyph(a || 'interact')) || 'E'; } catch (e) { return 'E'; } };
  const R = U.player.collisionR;
  const inRect = (x, y, r, pad) => { pad = pad || 0; return x > r[0] - pad && x < r[2] + pad && y > r[1] - pad && y < r[3] + pad; };
  const rectDist = (x, y, r) => Math.hypot(Math.max(r[0] - x, 0, x - r[2]), Math.max(r[1] - y, 0, y - r[3]));

  // ================================================================== persistent state (save section 'interiors')
  const fresh = () => ({ v: 1, chests: {}, placed: {}, visits: {}, flags: {}, hearth: {} });
  let S = fresh();          // persisted
  let TEMP = fresh();       // buildings with persist:false (tutorial practice hut): reset whenever the tutorial starts
  const store = (bid) => { const b = BU.get(bid); return b && b.def && b.def.persist === false ? TEMP : S; };

  // ================================================================== inventory abstraction (campaign items, else baseline fields)
  const STORY_KINDS = ['fragment', 'key', 'gear'];
  const BASE_ITEMS = { potion: ['potions', 'Healing Draught', 'potion'], bomb: ['bombs', 'Ember Bomb', 'bomb'], rune: ['runes', 'Rune', 'rune'] };
  const CROP_IDS = { wheat: 'wheat', ember: 'ember', frost: 'frost', moon: 'moon', glowcap: 'glowcap', starmint: 'starmint' };
  const inv = {
    // [{id,name,count,kind,icon}] storable items in the bag
    list() {
      const C = MM.campaign;
      if (C && typeof C.inventory === 'function') {
        try { const out = []; for (const g of C.inventory().groups || []) for (const it of g.items || []) if (it.count > 0 && !STORY_KINDS.includes(it.kind) && !String(it.id).startsWith('gear:')) out.push({ id: it.id, name: it.name, count: it.count, kind: it.kind, icon: it.icon }); return out; } catch (e) { /* fall back */ }
      }
      const w = W(), out = [];
      for (const k in (w.harvest || {})) if (w.harvest[k] > 0) out.push({ id: k, name: k, count: w.harvest[k], kind: 'crop' });
      for (const k in BASE_ITEMS) { const f = BASE_ITEMS[k]; if (w[f[0]] > 0) out.push({ id: k, name: f[1], count: w[f[0]], kind: f[2] }); }
      return out;
    },
    count(id) {
      const C = MM.campaign; if (C && typeof C.give === 'function') { try { return C.give(id, 0) || 0; } catch (e) { /* */ } }
      const w = W(); if (BASE_ITEMS[id]) return w[BASE_ITEMS[id][0]] || 0; return (w.harvest && w.harvest[id]) || 0;
    },
    add(id, n) {
      const C = MM.campaign; if (C && typeof C.give === 'function') { try { C.give(id, n); return; } catch (e) { /* */ } }
      const w = W(); if (BASE_ITEMS[id]) { const f = BASE_ITEMS[id][0]; w[f] = Math.max(0, (w[f] || 0) + n); return; }
      if (w.harvest) w.harvest[id] = Math.max(0, (w.harvest[id] || 0) + n);
    },
    name(id) {
      try { const it = MM.CAMPAIGN_DATA && MM.CAMPAIGN_DATA.items && MM.CAMPAIGN_DATA.items[id]; if (it && it.name) return it.name; } catch (e) { /* */ }
      if (BASE_ITEMS[id]) return BASE_ITEMS[id][1];
      try { const s = SEED_TYPES[id]; if (s) return s.name; } catch (e) { /* */ } // eslint-disable-line no-undef
      return String(id).replace(/_/g, ' ');
    },
    kind(id) { try { const it = MM.CAMPAIGN_DATA && MM.CAMPAIGN_DATA.items && MM.CAMPAIGN_DATA.items[id]; if (it) return it.kind; } catch (e) { /* */ } return BASE_ITEMS[id] ? BASE_ITEMS[id][2] : CROP_IDS[id] ? 'crop' : 'material'; },
  };
  // chest contents: saved copy if the chest was ever touched, else the interior's initial contents (fresh object)
  function chestOf(bid, chestId) {
    const st = store(bid);
    if (!st.chests[chestId]) {
      const I = BU.interior(bid), init = (I && I.def.chests && I.def.chests[chestId]) || (chestId === 'home_chest' ? { potion: 1, wheat: 3 } : {});
      st.chests[chestId] = Object.assign({}, init);
    }
    return st.chests[chestId];
  }
  function transfer(bid, chestId, id, n, toChest) {
    const c = chestOf(bid, chestId); n = Math.max(0, n | 0); if (!n) return 0;
    if (toChest) { const have = inv.count(id); n = Math.min(n, have); if (!n) return 0; inv.add(id, -n); c[id] = (c[id] || 0) + n; }
    else { n = Math.min(n, c[id] || 0); if (!n) return 0; c[id] -= n; if (!c[id]) delete c[id]; inv.add(id, n); }
    emit('interior:chest', { building: bid, chest: chestId, item: id, n, toChest: !!toChest });
    return n;
  }

  // ================================================================== current interior instance
  let cur = null;            // {id, building, I, O, items, decor, npc, t0, armed, from, fade}
  let exiting = false, lastExit = -10, resumeArmed = false;
  const O_OF = (I) => ({ x: Math.round((10 - I.W / 2) * 4) / 4, y: Math.round((10 - I.D / 2) * 4) / 4 });
  const local = (x, y) => ({ x: x - cur.O.x, y: y - cur.O.y });

  function buildInstance(bid) {
    const b = BU.get(bid), I = BU.interior(bid); if (!b || !I) return null;
    const st = store(bid);
    // instances are rebuilt from defs + saved state on every visit: no duplicates, no leftovers
    const items = I.items.map((f) => Object.assign({}, f, { rect: f.rect.slice(), open: 0, ph: Math.random() * 6.28 }));
    const decor = I.decor.map((d) => Object.assign({}, d));
    const npc = I.npc ? Object.assign({ name: BD.npcs[I.npc.id] || I.npc.id, t: 0 }, I.npc) : null;
    for (const f of items) if (f.type === 'hearth') f.lit = st.hearth[bid + ':' + f.id] !== false;
    return { id: bid, building: b, I, O: O_OF(I), items, decor, npc, t0: now(), armed: false, fade: 1, rest: 0, time: 0 };
  }

  // ================================================================== enter / exit
  function canEnterNow() { const s = MM.state && MM.state.current; return !s || s === 'play' || s === 'tutorial'; }
  function enter(bid, opts) {
    opts = opts || {};
    const b = BU.get(bid);
    if (!b) { console.warn('[MM.interiors] unknown building', bid); return false; }
    if (!b.enterable) { locked(bid); return false; }
    if (cur) return false;
    if (!opts.force && (now() - lastExit < U.enterCooldown || !canEnterNow())) return false;
    const inst = buildInstance(bid); if (!inst) { toast('The door won\'t open.', 'warn'); return false; }
    const g = G(), w = W();
    if (w.mode !== 'outside' && !opts.force) return false;
    inst.from = { region: w.region, state: (MM.state && MM.state.current) || 'play', x: g.x, y: g.y, via: opts.from || null };
    // land the broom instantly (no flying indoors) and drop any click-to-move target
    g.mounted = false; g.transition = null; g.height = 0; g.vx = 0; g.vy = 0; g.target = null;
    call('clearControls');
    const sp = inst.I.spawn; g.x = inst.O.x + sp.x; g.y = inst.O.y + sp.y; g.facing = sp.facing; g.heading = { NE: -Math.PI / 4, NW: -3 * Math.PI / 4 }[sp.facing] ?? g.heading;
    cur = inst;
    const st = store(bid), v = st.visits[bid] || (st.visits[bid] = { n: 0, first: w.day || 1, last: 0 });
    v.n++; v.last = w.day || 1;
    sfx('door_open'); emit('interior:enter', { id: bid, interior: inst.I.key, from: inst.from.region, visits: v.n });
    if (MM.state && MM.screens) { if (MM.state.current !== 'interior' && !MM.state.go('interior', { id: bid })) { cur = null; return false; } }
    else fallbackMode(true);
    return true;
  }
  function exit(opts) {
    opts = opts || {};
    if (!cur || exiting) return false;
    exiting = true;
    try {
      const inst = cur, b = inst.building, g = G();
      g.x = b.spawn.x; g.y = b.spawn.y; g.vx = 0; g.vy = 0; g.target = null; g.facing = b.spawn.facing;
      g.heading = b.spawn.facing === 'SW' ? 3 * Math.PI / 4 : Math.PI / 4;
      call('clearControls');
      try { MM.camera && MM.camera.snap && MM.camera.snap(); } catch (e) { /* */ }
      cur = null; lastExit = now();
      sfx('door_close'); emit('interior:exit', { id: inst.id, to: inst.from.region });
      const back = inst.from.state === 'tutorial' ? 'tutorial' : 'play';
      if (MM.state && MM.screens) { if (MM.state.current === 'interior' || opts.force) MM.state.go(back, { fromInterior: inst.id }); }
      else fallbackMode(false);
    } finally { exiting = false; }
    return true;
  }
  // abandon without moving the player (new game / title / load): whoever changed the world positioned the player
  function abandon() { if (!cur) return; const id = cur.id; cur = null; if (!(MM.state && MM.screens)) fallbackMode(false); emit('interior:abandon', { id }); }
  function locked(bid) {
    const b = BU.get(bid); if (!b) return false;
    toast(b.lockedReason || 'It\'s locked.', 'info'); sfx('locked'); emit('interior:locked', { id: bid });
    return true;
  }

  // ================================================================== collision (moveActor wrapper; outermost so exterior colliders don't apply)
  function blockedLocal(x, y) {
    const I = cur.I, d = I.door;
    const inGap = d.face === 'L' ? x > d.a0 + R && x < d.a1 - R : y > d.a0 + R && y < d.a1 - R;
    if (x < R || y < R) return true;
    if (d.face === 'L') { if (x > I.W - R) return true; if (y > I.D - R && !(inGap && y < I.D + 0.55)) return true; }
    else { if (y > I.D - R) return true; if (x > I.W - R && !(inGap && x < I.W + 0.55)) return true; }
    for (const f of cur.items) if (f.solid && inRect(x, y, f.rect, R)) return true;
    if (cur.npc && Math.hypot(x - cur.npc.x, y - cur.npc.y) < R + 0.25) return true;
    return false;
  }
  function moveInside(actor, dx, dy) {
    const p = local(actor.x, actor.y), ox = actor.x, oy = actor.y;
    let nx = p.x + dx, ny = p.y + dy;
    if (blockedLocal(nx, ny)) { if (!blockedLocal(nx, p.y)) ny = p.y; else if (!blockedLocal(p.x, ny)) nx = p.x; else { nx = p.x; ny = p.y; } }
    actor.x = cur.O.x + nx; actor.y = cur.O.y + ny;
    if (actor === G() && actor.target && Math.hypot(actor.x - ox, actor.y - oy) < Math.hypot(dx, dy) * 0.2) { cur.stuck = (cur.stuck || 0) + 1; if (cur.stuck > 25) { actor.target = null; cur.stuck = 0; } } else if (cur) cur.stuck = 0;
    call('noteCastMotion', actor, actor.x - ox, actor.y - oy);
  }
  let wrappedMove = null;
  function wrapMove() {
    if (window.moveActor === wrappedMove) return;
    const inner = window.moveActor;
    wrappedMove = function (actor, dx, dy) { if (cur && actor === G()) return moveInside(actor, dx, dy); return inner.apply(this, arguments); };
    window.moveActor = wrappedMove;
  }
  wrapMove();

  // ================================================================== interaction targets
  function candidates() {
    if (!cur) return [];
    const out = [], I = cur.I;
    for (const f of cur.items) if (f.interact) out.push({ id: f.id, kind: f.interact.kind, prompt: f.interact.prompt, rect: f.rect, reach: U.reach, ref: f });
    for (const d of cur.decor) if (d.interact || d.slot) {
      const half = (d.w || 16) / 32, rc = d.wall === 'y0' ? [d.at - half, 0, d.at + half, 0.05] : [0, d.at - half, 0.05, d.at + half];
      out.push({ id: d.type + '@' + d.at, kind: d.interact ? d.interact.kind : 'slot', prompt: d.interact ? d.interact.prompt : null, rect: rc, reach: U.reach + 0.45, ref: d });
    }
    if (cur.npc) out.push({ id: 'npc:' + cur.npc.id, kind: 'npc', prompt: cur.npc.interact.prompt, rect: [cur.npc.x, cur.npc.y, cur.npc.x, cur.npc.y], reach: cur.npc.reach || U.reach + 0.3, ref: cur.npc });
    const d = I.door; const dr = d.face === 'L' ? [d.a0, I.D, d.a1, I.D] : [I.W, d.a0, I.W, d.a1];
    out.push({ id: 'door', kind: 'exit', prompt: 'Leave ' + (cur.building.name || ''), rect: dr, reach: 0.75 });
    return out;
  }
  function slotPrompt(c) {
    const slot = c.ref.slot, st = store(cur.id), key = cur.id + ':' + slot, have = st.placed[key];
    const where = (cur.I.def.slots && cur.I.def.slots[slot] && cur.I.def.slots[slot].prompt) || 'the shelf';
    return have ? 'Take the ' + inv.name(have) + ' from ' + where : 'Place something on ' + where;
  }
  function nearest() {
    if (!cur) return null;
    const g = G(), p = local(g.x, g.y); let best = null, bd = Infinity;
    const fx = { N: [-1, -1], NE: [0, -1], E: [1, -1], SE: [1, 0], S: [1, 1], SW: [0, 1], W: [-1, 1], NW: [-1, 0] }[g.facing] || [0, 0];
    for (const c of candidates()) {
      const d = rectDist(p.x, p.y, c.rect); if (d > c.reach) continue;
      const cx = (c.rect[0] + c.rect[2]) / 2 - p.x, cy = (c.rect[1] + c.rect[3]) / 2 - p.y, m = Math.hypot(cx, cy) || 1;
      const score = d - 0.25 * ((cx * fx[0] + cy * fx[1]) / m / (Math.hypot(fx[0], fx[1]) || 1)) + (c.kind === 'exit' ? 0.3 : 0);
      if (score < bd) { bd = score; best = c; }
    }
    return best;
  }
  function prompt() {
    const c = nearest(); if (!c) return null;
    const text = c.kind === 'slot' ? slotPrompt(c) : c.prompt;
    return { text, key: glyph('interact'), kind: c.kind, id: c.id, glyph: glyph('interact') };
  }

  // ================================================================== handlers
  const handlers = {
    exit: () => exit(),
    rest() {
      const C = MM.campaign; let r = null;
      if (C && typeof C.interact === 'function') { try { r = C.interact('rest'); } catch (e) { console.error(e); } }
      else {
        const w = W(); w.time += 0.25; const max = call('heroMaxHP') || 100; w.hp = max; w.mana = 100;
        r = { ok: true, msg: 'You rest a while. A quarter of the day slips by.' }; toast(r.msg, 'good');
      }
      if (r && r.ok !== false) { cur.rest = 1.6; sfx('rest'); emit('interior:rest', { id: cur.id }); setTimeout(() => { try { if (MM.save && MM.save.save && (!MM.save.whyNot || !MM.save.whyNot())) MM.save.save({ silent: true, reason: 'rest' }); } catch (e) { /* */ } }, 50); }
      return true;
    },
    craft() {
      const C = MM.campaign;
      if (C && typeof C.interact === 'function') { C.interact('cauldron'); return true; }
      if (MM.ui && MM.ui.open) { MM.ui.open('crafting'); return true; }
      call('brew'); return true;
    },
    shop(c) {
      const npc = c.ref.interact.npc || 'pip', C = MM.campaign;
      if (C && typeof C.interact === 'function') { C.interact('shop:' + npc); return true; }
      if (MM.ui && MM.ui.open) { MM.ui.open('shop', { npc }); return true; }
      call('sellHarvest'); return true;
    },
    npc(c) {
      const id = c.ref.id, C = MM.campaign;
      if (C && typeof C.interact === 'function') { C.interact('talk:' + id); return true; }
      if (MM.ui && MM.ui.talk) { MM.ui.talk(id); return true; }
      toast((BD.npcs[id] || id) + ': Make yourself at home.'); return true;
    },
    lore(c) {
      const it = c.ref.interact, pages = (BD.lore[it.lore] || ['…']).map((text) => ({ text }));
      if (it.flag) S.flags[it.flag] = true;
      emit('interior:lore', { id: cur.id, lore: it.lore });
      if (MM.ui && MM.ui.dialogue) MM.ui.dialogue({ speaker: c.ref.name || cur.I.def.name, pages });
      else toast(pages[0].text);
      return true;
    },
    storage(c) { openChest(cur.id, c.ref.interact.chest, c.ref); return true; },
    hearth(c) {
      const f = c.ref, st = store(cur.id), key = cur.id + ':' + f.id;
      const choices = [{ label: f.lit ? 'Bank the fire for the night' : 'Light the fire', action: 'toggle' }];
      if (f.lit) choices.unshift({ label: 'Warm your hands', action: 'warm' });
      if (f.slot) choices.push({ label: slotPrompt({ ref: f }), action: 'slot' });
      choices.push({ label: 'Leave it be', action: null });
      const act = (a) => {
        if (a === 'toggle') { f.lit = !f.lit; st.hearth[key] = f.lit; sfx(f.lit ? 'fire_light' : 'fire_out'); toast(f.lit ? 'The hearth crackles back to life.' : 'You bank the embers. The room dims.', 'info'); }
        else if (a === 'warm') {
          const w = W(), today = w.day || 1, max = call('heroMaxHP') || 100;
          if (st.flags['warm:' + cur.id] === today || w.hp >= max) toast('The fire is warm and kind. You feel settled.', 'info');
          else { w.hp = Math.min(max, w.hp + 15); st.flags['warm:' + cur.id] = today; toast('The fire\'s warmth seeps in. +15 health.', 'good'); sfx('heal'); }
        } else if (a === 'slot') handleSlot({ ref: f });
      };
      if (MM.ui && MM.ui.dialogue) MM.ui.dialogue({ speaker: 'Hearth', pages: [{ text: f.lit ? 'The fire burns low and steady, smelling of apple wood.' : 'Cold ashes and a faint smell of smoke.', choices }] }).then(act);
      else act('toggle');
      return true;
    },
    slot(c) { handleSlot(c); return true; },
    wardrobe() {
      let pal = null; try { pal = PALETTES; } catch (e) { /* */ } // eslint-disable-line no-undef
      const look = (() => { try { return chosenLook; } catch (e) { return null; } })(); // eslint-disable-line no-undef
      const cycle = (group) => { if (!pal || !pal[group] || !look) return; const keys = Object.keys(pal[group]), i = keys.indexOf(look[group]); call('chooseLook', group, keys[(i + 1) % keys.length]); sfx('ui_select'); };
      const show = () => {
        if (!(MM.ui && MM.ui.dialogue)) { cycle('outfit'); return; }
        MM.ui.dialogue({ speaker: 'Mirror', pages: [{ text: 'You straighten your hat in the little mirror on the wardrobe door. Fancy a change?',
          choices: [{ label: 'Try another outfit colour', action: 'outfit' }, { label: 'Try another hair colour', action: 'hair' }, { label: 'Looks perfect', action: null }] }] })
          .then((a) => { if (a) { cycle(a); setTimeout(show, 0); } });
      };
      show(); return true;
    },
  };
  function handleSlot(c) {
    const slot = c.ref.slot, st = store(cur.id), key = cur.id + ':' + slot, have = st.placed[key];
    const accepts = (cur.I.def.slots && cur.I.def.slots[slot] && cur.I.def.slots[slot].accepts) || ['crop', 'potion', 'material'];
    if (have) { inv.add(have, 1); delete st.placed[key]; toast('You take the ' + inv.name(have) + ' back.', 'info'); sfx('pickup'); emit('interior:place', { id: cur.id, slot, item: null }); return; }
    const opts = inv.list().filter((it) => accepts.includes(it.kind)).slice(0, 5);
    if (!opts.length) { toast('Nothing to display yet — a crop or a potion would look lovely here.', 'info'); return; }
    const place = (id) => { if (!id || inv.count(id) <= 0 || !cur) return; inv.add(id, -1); st.placed[key] = id; toast('You set the ' + inv.name(id) + ' down. Home looks a little more yours.', 'good'); sfx('place'); emit('interior:place', { id: cur.id, slot, item: id }); };
    if (MM.ui && MM.ui.dialogue) MM.ui.dialogue({ speaker: 'Display', pages: [{ text: 'What would you like to display?', choices: opts.map((o) => ({ label: o.name + ' (' + o.count + ')', action: o.id })).concat([{ label: 'Never mind', action: null }]) }] }).then(place);
    else place(opts[0].id);
  }
  function interact(target) {
    if (typeof target === 'string' && target.startsWith('enter:')) { const id = target.slice(6), b = BU.get(id); if (!b) return false; return b.enterable ? enter(id) : locked(id); }
    if (!cur) return false;
    const c = target && typeof target === 'object' ? target : (target ? candidates().find((x) => x.id === target) : nearest());
    if (!c) return false;
    const h = handlers[c.kind]; if (!h) return false;
    emit('interact', { id: c.id, kind: c.kind, interior: cur.id });
    try { return h(c) !== false; } catch (e) { console.error('[MM.interiors] handler ' + c.kind, e); return true; }
  }

  // ================================================================== chest screen (registered on MM.ui; dialogue fallback)
  let chestCtx = null;
  function openChest(bid, chestId, item) {
    chestOf(bid, chestId); if (item) item.open = 1; sfx('chest_open');
    chestCtx = { bid, chestId, item };
    if (MM.ui && MM.ui.screens && MM.ui.screens.chest && MM.ui.open) { MM.ui.open('chest', { building: bid, chest: chestId }); return; }
    // fallback: dialogue-driven take-all / store-all
    const c = chestOf(bid, chestId), list = Object.keys(c).map((k) => inv.name(k) + ' ×' + c[k]).join(', ') || 'nothing';
    if (MM.ui && MM.ui.dialogue) MM.ui.dialogue({ speaker: 'Chest', pages: [{ text: 'Inside: ' + list + '.', choices: [{ label: 'Take everything', action: 'take' }, { label: 'Store all crops', action: 'store' }, { label: 'Close', action: null }] }] })
      .then((a) => { if (a === 'take') for (const k of Object.keys(c)) transfer(bid, chestId, k, c[k], false); if (a === 'store') for (const it of inv.list()) if (it.kind === 'crop') transfer(bid, chestId, it.id, it.count, true); if (item) item.open = 0; });
  }
  function registerChestScreen() {
    const ui = MM.ui; if (!ui || typeof ui.registerScreen !== 'function' || (ui.screens && ui.screens.chest) || !ui.panel || !ui.h) return false;
    const h = ui.h;
    ui.registerScreen('chest', (a) => {
      const ctxc = chestCtx || { bid: a.building, chestId: a.chest };
      const p = ui.panel({ title: 'Storage chest', subtitle: 'Select an item to move it. Shift / long-press moves the whole stack.', icon: 'bag', cls: 'mm-panel-wide mm-chest' });
      const bag = h('div', { class: 'mm-list', role: 'listbox', 'aria-label': 'Your bag' }), box = h('div', { class: 'mm-list', role: 'listbox', 'aria-label': 'Chest' });
      const col = (title, el) => h('div', { class: 'mm-inv-list' }, h('h3', { class: 'mm-chest-col' }, title), el);
      p.body.append(h('div', { class: 'mm-split' }, col('Bag', bag), col('Chest', box)));
      const inst = { el: p.el, label: 'Chest', state: 'menu' };
      const row = (it, toChest) => {
        const b = h('button', { type: 'button', class: 'mm-row', role: 'option', 'data-item': it.id, 'aria-label': (toChest ? 'Store ' : 'Take ') + it.name + ', ' + it.count },
          h('span', { class: 'mm-row-icon' }, ui.itemIcon ? ui.itemIcon(it, 28) : null), h('span', { class: 'mm-row-main' }, h('strong', null, it.name), h('small', null, '×' + it.count)),
          h('span', { class: 'mm-price' }, toChest ? '→' : '←'));
        b.addEventListener('click', (e) => { const n = transfer(ctxc.bid, ctxc.chestId, it.id, e.shiftKey ? it.count : 1, toChest); if (n) ui.sfx && ui.sfx('ui_move'); render(it.id); });
        b.addEventListener('contextmenu', (e) => { e.preventDefault(); transfer(ctxc.bid, ctxc.chestId, it.id, it.count, toChest); render(it.id); });
        return b;
      };
      function render(focusId) {
        const had = document.activeElement && document.activeElement.closest && document.activeElement.closest('.mm-list');
        bag.innerHTML = ''; box.innerHTML = '';
        const bi = inv.list(); const c = chestOf(ctxc.bid, ctxc.chestId);
        if (!bi.length) bag.appendChild(ui.empty ? ui.empty('bag', 'Bag is empty', 'Crops, seeds and potions can be stored here.') : h('p', null, 'Empty'));
        bi.forEach((it) => bag.appendChild(row(it, true)));
        const ci = Object.keys(c).map((id) => ({ id, name: inv.name(id), count: c[id], kind: inv.kind(id) }));
        if (!ci.length) box.appendChild(ui.empty ? ui.empty('bag', 'The chest is empty', 'Store things here to keep them safe at home.') : h('p', null, 'Empty'));
        ci.forEach((it) => box.appendChild(row(it, false)));
        const target = (had === box ? box : had === bag ? bag : null);
        if (focusId && target) { const el = target.querySelector('[data-item="' + focusId + '"]') || target.querySelector('button'); if (el) el.focus(); }
        else { const f = bag.querySelector('button') || box.querySelector('button'); if (f) f.dataset.autofocus = '1'; }
      }
      inst.refresh = () => render();
      inst.onOpen = () => render();
      inst.onClose = () => { if (ctxc.item) ctxc.item.open = 0; sfx('chest_close'); chestCtx = null; };
      return inst;
    });
    return true;
  }

  // ================================================================== screen state 'interior'
  function onKey(e) {
    if (!cur || e.altKey || e.ctrlKey || e.metaKey) return;
    try { if (MM.input && MM.input.isBlocked && MM.input.isBlocked()) return; } catch (err) { return; }
    const tg = e.target; if (tg && tg.closest && tg.closest('input,textarea,select,[contenteditable]')) return;
    const k = (e.key || '').toLowerCase();
    if (k === 'e') { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) interact(); }
    else if (k === ' ' || k === 'b') { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) toast(k === ' ' ? 'Spells stay holstered indoors.' : 'No broom-riding indoors!', 'info'); }
  }
  function onPointer(e) {
    if (!cur) return;
    try { if (MM.input && MM.input.isBlocked && MM.input.isBlocked()) return; } catch (err) { return; }
    const cv = document.getElementById('scene'); if (!cv || e.target !== cv) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const r = cv.getBoundingClientRect(); if (!r.width) return;
    const sx = (e.clientX - r.left) * 512 / r.width, sy = (e.clientY - r.top) * 320 / r.height;
    const view = MM.interiorRender && MM.interiorRender.view ? MM.interiorRender.view(cur) : null; if (!view) return;
    // clicked an interactable's sprite while in reach → use it; else click-to-move on the floor
    const pick = MM.interiorRender.pick ? MM.interiorRender.pick(cur, sx, sy) : null;
    if (pick) { const c = candidates().find((x) => x.id === pick); const g = G(), p = local(g.x, g.y); if (c && rectDist(p.x, p.y, c.rect) <= c.reach + 0.05) { interact(c); return; } }
    const wpt = view.toLocal(sx, sy), I = cur.I, d = I.door;
    let lx = Math.max(R, Math.min(I.W - R, wpt.x)), ly = Math.max(R, Math.min(I.D - R, wpt.y));
    if (d.face === 'L' && wpt.y > I.D - R && wpt.x > d.a0 && wpt.x < d.a1) ly = I.D + 0.4; // clicking the doorway walks out
    if (d.face === 'R' && wpt.x > I.W - R && wpt.y > d.a0 && wpt.y < d.a1) lx = I.W + 0.4;
    G().target = { x: cur.O.x + lx, y: cur.O.y + ly };
  }
  function update(dt) {
    if (!cur) return;
    cur.time += dt; if (cur.rest > 0) cur.rest = Math.max(0, cur.rest - dt);
    if (cur.npc) cur.npc.t += dt;
    const g = G(), p = local(g.x, g.y), I = cur.I;
    const inExit = inRect(p.x, p.y, I.exit, 0);
    if (!inExit) cur.armed = true;
    if (inExit && cur.armed && now() - cur.t0 > 0.35) exit();
  }
  function screenEnter(data, prev) {
    if (!cur) { // nobody called MM.interiors.enter(): never show an empty room
      const id = data && data.id; if (id && BU.get(id) && BU.get(id).enterable) enter(id, { force: true });
      if (!cur) { setTimeout(() => { if (MM.state.current === 'interior' && !cur) MM.state.go('play'); }, 0); return; }
    }
    resumeArmed = false;
    MM.screens.listen(window, 'keydown', onKey, true);
    MM.screens.listen(window, 'pointerdown', onPointer, true);
    if (prev === 'menu' || prev === 'dialogue' || prev === 'cine') cur.armed = true;
  }
  function screenExit(next) {
    if (!cur) return;
    // pausing / dialogue / cinematics keep the visit alive; anything else that leaves without exit() is handled by onState
    if (['menu', 'dialogue', 'cine', 'loading'].includes(next)) resumeArmed = true;
  }
  function render(ctx, w, h) { if (MM.interiorRender && cur) MM.interiorRender.draw(ctx, cur, w, h); else if (ctx) { ctx.fillStyle = '#120f16'; ctx.fillRect(0, 0, w, h); } }
  function registerScreen() {
    if (!MM.screens || typeof MM.screens.register !== 'function') return false;
    MM.screens.register('interior', { sim: 'player', draw: 'custom', audio: { keep: true }, enter: screenEnter, exit: screenExit, update, render });
    return true;
  }
  // Fallback when MM.screens is missing (older core): stay in 'play', draw the room instead of the world, freeze updateWorld.
  let fb = null;
  function fallbackMode(on) {
    if (on && !fb) {
      const _draw = window.draw, _uw = window.updateWorld, wasEnabled = MM.world ? MM.world.enabled : null;
      if (MM.world) MM.world.enabled = false;
      window.draw = function () { if (cur) { try { update(1 / 60); } catch (e) { console.error(e); } return render(ctx, 512, 320); } return _draw.apply(this, arguments); }; // eslint-disable-line no-undef
      window.updateWorld = function () { if (cur) return; return _uw.apply(this, arguments); };
      window.addEventListener('keydown', onKey, true); window.addEventListener('pointerdown', onPointer, true);
      fb = { _draw, _uw, wasEnabled };
    } else if (!on && fb) {
      window.draw = fb._draw; window.updateWorld = fb._uw; if (MM.world && fb.wasEnabled != null) MM.world.enabled = fb.wasEnabled;
      window.removeEventListener('keydown', onKey, true); window.removeEventListener('pointerdown', onPointer, true); fb = null;
    }
  }

  // ================================================================== state + save wiring
  function onState(d) {
    if (!d) return;
    if (d.to === 'tutorial' && d.from !== 'interior') TEMP = fresh();
    if (!cur || exiting) return;
    // a menu closed back into 'play' while a visit is still active (pause → resume): return to the room
    if ((d.to === 'play' || d.to === 'tutorial') && d.from !== 'interior' && resumeArmed) { resumeArmed = false; setTimeout(() => { if (cur && MM.state.current === d.to) MM.state.go('interior', { id: cur.id, resume: true }); }, 0); return; }
    if (['title', 'creation', 'defeat', 'logo', 'intro'].includes(d.to)) abandon();
  }
  function registerSave() {
    if (!MM.save || typeof MM.save.registerSection !== 'function') return;
    MM.save.registerSection('interiors', {
      get: () => ({ v: 1, chests: S.chests, placed: S.placed, visits: S.visits, flags: S.flags, hearth: S.hearth, inside: cur && store(cur.id) === S ? { id: cur.id } : null }),
      set: (d) => {
        if (!d || typeof d !== 'object') throw new Error('interiors');
        const ob = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
        S = { v: 1, chests: {}, placed: ob(d.placed), visits: ob(d.visits), flags: ob(d.flags), hearth: ob(d.hearth) };
        for (const [k, c] of Object.entries(ob(d.chests))) { const o = {}; for (const [i, n] of Object.entries(ob(c))) if (Number.isFinite(n) && n > 0) o[i] = Math.floor(n); S.chests[k] = o; }
        cur = null;
        // saved while indoors: the player section holds room coordinates; put the player safely outside that door
        const b = d.inside && BU.get(d.inside.id), w = W(), g = G();
        if (b && b.spawn && w && g && w.region === b.region) { g.x = b.spawn.x; g.y = b.spawn.y; g.target = null; try { MM.camera && MM.camera.snap && MM.camera.snap(); } catch (e) { /* */ } }
      },
      reset: () => { S = fresh(); TEMP = fresh(); cur = null; },
    });
  }
  function registerWorldDoors() {
    if (!MM.world || typeof MM.world.register !== 'function') return false;
    for (const b of BU.list()) MM.world.register('enter:' + b.id, () => { interact('enter:' + b.id); return true; });
    return true;
  }

  // ================================================================== public API
  MM.interiors = {
    enter, exit, locked, interact, prompt, nearest, candidates,
    get current() { return cur ? cur.id : null; },
    get active() { return !!cur; },
    get instance() { return cur; },
    get defs() { return BD.interiors; },
    state() { return JSON.parse(JSON.stringify(S)); },
    chest(bid, chestId) { return Object.assign({}, chestOf(bid, chestId)); },
    transfer, openChest, placed(bid, slot) { return store(bid).placed[bid + ':' + slot] || null; },
    visits(bid) { const v = store(bid).visits[bid]; return v ? v.n : 0; },
    resetTemp() { TEMP = fresh(); },
    local(x, y) { return cur ? local(x, y) : null; },
    toWorld(lx, ly) { return cur ? { x: cur.O.x + lx, y: cur.O.y + ly } : null; },
    _debug: { blockedLocal: (x, y) => (cur ? blockedLocal(x, y) : null) },
  };
  registerScreen();
  registerSave();
  MM.bus && MM.bus.on && MM.bus.on('state', onState);
  MM.bus && MM.bus.on && MM.bus.on('game:new', () => abandon());
  MM.bus && MM.bus.on && MM.bus.on('game:title', () => abandon());
  // late-bound modules (UI, world, screens) — try now and again once everything has loaded
  const lateInit = () => { if (!MM.screens || !MM.screens.def || MM.screens.def('interior').render !== render) registerScreen(); registerWorldDoors(); registerChestScreen(); wrapMove(); };
  lateInit();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', lateInit); else setTimeout(lateInit, 0);
  MM.bus && MM.bus.on && MM.bus.on('boot', lateInit);
})();
