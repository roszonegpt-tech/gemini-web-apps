'use strict';
// Moss & Moon — interactive tutorial (owner: TUTORIAL). Screen state 'tutorial' (sim:'world', draw:'world') over a
// SANDBOX: the real world/game/entity arrays are set aside on start (the `world` binding is swapped for a practice copy,
// `game`/`dummy` are snapshotted and restored in place) and put back exactly on finish / skip / abort. While the sandbox
// is alive MM.save.save() refuses (also in 'interior'/'menu'/'dialogue' entered from the tutorial), so the real save is
// never written. Steps are event/state verified (MM.bus + state diffs), never timers. Data: src/config/tutorial.js.
// Flow: MM.flow.startTutorial() -> state 'tutorial' -> ... -> MM.flow.finishTutorial({skipped}). Docs: notes/TUTORIAL.md.
window.MM = window.MM || {};
(function () {
  const MM = window.MM;
  if (!MM.TUTORIAL) { console.warn('[MM.tutorial] src/config/tutorial.js missing'); return; }
  try { world; game; dummy; } catch (e) { console.warn('[MM.tutorial] baseline missing; tutorial disabled'); return; } // eslint-disable-line no-undef
  const T = MM.TUTORIAL, STEPS = T.steps;
  const KEEP = ['interior', 'menu', 'dialogue', 'cine']; // states that keep the sandbox alive (they return to the tutorial)
  const safe = (fn, fb) => { try { return fn(); } catch (e) { console.error('[MM.tutorial]', e); return fb; } };
  const sfx = (id) => safe(() => MM.audio && MM.audio.sfx && MM.audio.sfx(id));
  const toast = (t, k) => safe(() => (MM.ui && MM.ui.toast ? MM.ui.toast(t, k || 'info') : window.message && window.message(t)));
  const glyph = (a) => safe(() => (MM.input && MM.input.glyph ? MM.input.glyph(a) : a), a);
  const method = () => safe(() => (MM.input && MM.input.method) || 'keyboard', 'keyboard');
  const st = () => (MM.state ? MM.state.current : null);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const maxHP = () => safe(() => heroMaxHP(), 100); // eslint-disable-line no-undef
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let SB = null; // live sandbox session
  const counters = { started: 0, ended: 0, restored: 0, aborted: 0 };

  // ================================================================== baseline adapters (active only inside the practice yard)
  const inYard = () => !!SB && world.region === T.region && world.mode === 'outside'; // eslint-disable-line no-undef
  // Baseline farming and dummy targeting are hard-wired to the grove; in the yard they run the same code with the region
  // briefly presented as 'grove' (synchronous, restored in finally) so the real plant/water/harvest/cast paths run.
  const _tend = window.tendPlot;
  if (typeof _tend === 'function') window.tendPlot = function () {
    if (!inYard()) return _tend.apply(this, arguments);
    world.region = 'grove'; try { return _tend.apply(this, arguments); } finally { world.region = T.region; } // eslint-disable-line no-undef
  };
  const _target = window.spellTarget;
  if (typeof _target === 'function') window.spellTarget = function () {
    if (!inYard()) return _target.apply(this, arguments);
    return dummy.hp > 0 ? dummy : null; // eslint-disable-line no-undef
  };

  // ================================================================== sandbox: snapshot / build / restore
  function snapshot() {
    /* eslint-disable no-undef */
    return {
      world, worldJSON: JSON.stringify(world), game: clone(game), gameJSON: JSON.stringify(game),
      enemies, lootDrops, allies, party, particles, bursts, dungeonBlocks,
      effects: effects.splice(0), numbers: numbers.splice(0), dummy: clone(dummy),
      spellIndex, castCooldown, familiar: { x: familiarSprite.x, y: familiarSprite.y },
      campaignJSON: safe(() => (MM.campaign && MM.campaign.state ? JSON.stringify(MM.campaign.state) : null), null),
    };
    /* eslint-enable no-undef */
  }
  function buildSandbox() {
    /* eslint-disable no-undef */
    const w = JSON.parse(SB.snap.worldJSON);
    Object.assign(w, { region: T.region, mode: 'outside', floor: 0, modifier: '', weather: 'Clear', time: 0.3, targetId: 'dummy', coop: false,
      plots: [{ x: T.plot.x, y: T.plot.y, seed: null, growth: 0, watered: false, health: 100 }], wards: [],
      seeds: Object.assign({}, w.seeds || {}, T.give.seeds), seed: T.give.seed, potions: Math.max(T.give.potions, 0), mana: 100 });
    w.hp = maxHP(); w.harvest = Object.assign({}, w.harvest || {});
    world = w;
    enemies = []; lootDrops = []; allies = []; party = []; particles = []; bursts = []; dungeonBlocks = [];
    Object.assign(dummy, { x: T.dummy.x, y: T.dummy.y, hp: dummy.maxHP, status: {}, flash: 0, resetIn: 0 });
    place(T.spawn.x, T.spawn.y, T.spawn.facing);
    world.hp = maxHP();
    safe(() => drawGround());
    /* eslint-enable no-undef */
  }
  function place(x, y, facing) {
    /* eslint-disable no-undef */
    Object.assign(game, { x, y, vx: 0, vy: 0, target: null, mounted: false, transition: null, height: 0 });
    if (facing) game.facing = facing;
    familiarSprite.x = x + 0.55; familiarSprite.y = y - 0.55;
    safe(() => clearControls());
    safe(() => (MM.camera && MM.camera.snap ? MM.camera.snap() : null));
    /* eslint-enable no-undef */
  }
  function restore() {
    const s = SB.snap;
    /* eslint-disable no-undef */
    world = s.world;
    if (JSON.stringify(world) !== s.worldJSON) { // someone touched the real object: put every field back
      const o = JSON.parse(s.worldJSON); for (const k of Object.keys(world)) if (!(k in o)) delete world[k]; Object.assign(world, o);
    }
    for (const k of Object.keys(game)) if (!(k in s.game)) delete game[k];
    Object.assign(game, clone(s.game));
    enemies = s.enemies; lootDrops = s.lootDrops; allies = s.allies; party = s.party; particles = s.particles; bursts = s.bursts; dungeonBlocks = s.dungeonBlocks;
    effects.length = 0; effects.push(...s.effects); numbers.length = 0; numbers.push(...s.numbers);
    for (const k of Object.keys(dummy)) if (!(k in s.dummy)) delete dummy[k];
    Object.assign(dummy, s.dummy);
    spellIndex = s.spellIndex; castCooldown = s.castCooldown; familiarSprite.x = s.familiar.x; familiarSprite.y = s.familiar.y;
    safe(() => clearControls()); safe(() => drawGround());
    /* eslint-enable no-undef */
    safe(() => MM.camera && MM.camera.snap && MM.camera.snap());
    counters.restored++;
  }
  // real save is never written while the sandbox lives (covers interior/menu/dialogue entered from the tutorial)
  function gateSave(on) {
    const S = MM.save; if (!S) return;
    if (on) {
      SB.save = { save: S.save, whyNot: S.whyNot };
      S.save = function () { S.lastResult = { ok: false, reason: 'tutorial' }; return false; };
      S.whyNot = function () { return 'tutorial'; };
    } else if (SB.save) { S.save = SB.save.save; S.whyNot = SB.save.whyNot; SB.save = null; }
  }

  // ================================================================== session lifecycle
  function start(data) {
    if (SB) return;
    counters.started++;
    SB = { data: data || {}, snap: snapshot(), offs: [], i: 0, step: null, ended: false, ev: {}, t: 0, done: false };
    gateSave(true);
    buildSandbox();
    safe(() => MM.interiors && MM.interiors.resetTemp && MM.interiors.resetTemp());
    const B = MM.bus, H = MM.hooks;
    const on = (n, f) => { if (B && B.on) SB.offs.push(B.on(n, f)); };
    on('plant', (d) => d && d.plot === world.plots[0] && note('plant')); // eslint-disable-line no-undef
    on('water', (d) => d && d.plot === world.plots[0] && note('water')); // eslint-disable-line no-undef
    on('harvest', (d) => d && d.plot === world.plots[0] && note('harvest')); // eslint-disable-line no-undef
    on('cast', (d) => { if (d && d.actor === game && d.target === dummy) { note('cast'); SB.castHP = dummy.hp; } }); // eslint-disable-line no-undef
    on('hit', (d) => { if (d && d.target === dummy) note('hitDummy'); }); // eslint-disable-line no-undef
    on('interact', (d) => d && d.id === T.sign.id && note('sign'));
    on('potion', () => note('potion'));
    on('mount', (d) => { if (d && d.phase === 'end') note(game.mounted ? 'mounted' : 'landed'); }); // eslint-disable-line no-undef
    on('interior:enter', (d) => d && d.id === T.hut && note('enter'));
    on('interior:exit', (d) => d && d.id === T.hut && note('exit'));
    on('input:method', () => render());
    on('state', onState);
    if (H && H.on) { SB.offs.push(H.on('drawables', drawables, 10)); SB.offs.push(H.on('overlay', overlay, 90)); }
    if (MM.world && MM.world.register) SB.offs.push(MM.world.register(T.sign.id, readSign));
    if (MM.loop && MM.loop.onTick) SB.offs.push(MM.loop.onTick(tick));
    else { const id = setInterval(() => tick(1 / 30), 33); SB.offs.push(() => clearInterval(id)); }
    buildHUD();
    begin(0);
    safe(() => MM.bus.emit('tutorial:start', { replay: !!SB.data.replay, from: SB.data.from || null }));
  }
  // why: 'finish' | 'skip' | 'abort'
  function end(why) {
    if (!SB || SB.ended) return false;
    SB.ended = true;
    if (MM.interiors && MM.interiors.active) safe(() => MM.interiors.exit({ force: false }));
    if (MM.interiors && MM.interiors.active) safe(() => MM.interiors.resetTemp());
    for (const f of SB.offs.splice(0)) safe(() => typeof f === 'function' && f());
    unglow();
    if (SB.blocked) { safe(() => MM.input.block(false)); SB.blocked = false; }
    safe(() => SB.hud && SB.hud.remove()); safe(() => SB.panel && SB.panel.remove());
    restore();
    gateSave(false);
    const s = SB; SB = null; counters.ended++; if (why === 'abort') counters.aborted++;
    safe(() => MM.bus.emit('tutorial:end', { why, step: s.i, steps: STEPS.length }));
    return true;
  }
  function onState(d) {
    if (!SB || !d) return;
    if (d.to !== 'tutorial' && !KEEP.includes(d.to)) { end('abort'); return; }
    render();
  }

  // ================================================================== steps
  const cur = () => STEPS[SB.i] || null;
  function note(k) { if (!SB) return; SB.ev[k] = (SB.ev[k] || 0) + 1; if (SB.step) SB.step.seen[k] = (SB.step.seen[k] || 0) + 1; }
  const plot = () => world.plots && world.plots[0]; // eslint-disable-line no-undef
  function begin(i) {
    SB.i = i;
    const s = cur();
    if (!s) { celebrate(); return; }
    /* eslint-disable no-undef */
    SB.step = { id: s.id, seen: {}, x0: game.x, y0: game.y, t: 0, potions: world.potions, hp: world.hp, harvested: world.harvested || 0, mountedAt: game.mounted, early: SB.ev[s.id] || 0, inv: false };
    prepare(s, false);
    /* eslint-enable no-undef */
    render();
    // state-based early completion (the action was already done before the prompt appeared)
    if (alreadyDone(s)) { SB.step.auto = true; complete('Already done — nicely spotted!'); }
  }
  // make sure everything the step needs exists (respawn / refill). hard = the Reset button.
  function prepare(s, hard) {
    /* eslint-disable no-undef */
    const p = plot() || (world.plots = [{ x: T.plot.x, y: T.plot.y, seed: null, growth: 0, watered: false, health: 100 }])[0];
    Object.assign(dummy, { hp: dummy.maxHP, resetIn: 0 }); if (hard) dummy.status = {};
    if (world.mana < 40 || hard) world.mana = 100;
    if (s.id === 'plant') { if (hard) Object.assign(p, { seed: null, growth: 0, watered: false }); if (!p.seed) world.seeds[T.give.seed] = Math.max(1, world.seeds[T.give.seed] || 0); world.seed = T.give.seed; }
    if (s.id === 'water') { if (!p.seed) Object.assign(p, { seed: T.give.seed, growth: 0, watered: false, health: 100 }); if (hard) p.watered = false; }
    if (s.id === 'harvest') { if (!p.seed || hard) Object.assign(p, { seed: T.give.seed, growth: hard ? 0 : p.growth, watered: true, health: 100 }); p.watered = true; SB.step.magic = 0; }
    if (s.id === 'potion') { world.potions = Math.max(1, world.potions); const low = Math.floor(maxHP() * T.hpFrac); if (world.hp > low || hard) world.hp = low; world.mana = Math.min(world.mana, 70); SB.step.potions = world.potions; SB.step.hp = world.hp; }
    if (s.id === 'broom' && hard && (game.mounted || game.transition)) { Object.assign(game, { mounted: false, transition: null, height: 0 }); }
    if (s.id === 'broom') SB.step.mountedAt = game.mounted;
    if (s.id === 'menu' && hard) safe(() => MM.ui && MM.ui.closeAll && MM.ui.closeAll());
    /* eslint-enable no-undef */
  }
  function alreadyDone(s) {
    const p = plot();
    if (s.id === 'plant') return !!(p && p.seed);
    if (s.id === 'water') return !!(p && p.seed && p.watered);
    if (s.id === 'enter') return st() === 'interior' && MM.interiors && MM.interiors.current === T.hut;
    return false;
  }
  // per-frame verification (runs for every state while the sandbox lives; tiny)
  function tick(dt) {
    if (!SB || SB.ended) return;
    dt = Math.min(0.1, dt || 0);
    const state = st(), s = cur();
    syncVisibility(state);
    if (!s || SB.done) return;
    SB.step.t += dt;
    /* eslint-disable no-undef */
    if (state === 'tutorial' && inYard()) { // safe practice: daylight, infinite dummy, never harmed
      if (world.time > 0.6 || world.time < 0.12) world.time = 0.3;
      if (dummy.hp < dummy.maxHP * 0.5) Object.assign(dummy, { hp: dummy.maxHP, resetIn: 0 });
      if (s.id !== 'potion' && world.hp < maxHP() * 0.5) world.hp = maxHP();
      enemies.length = 0;
    }
    const k = SB.step.seen, p = plot();
    switch (s.id) {
      case 'move': if (state === 'tutorial' && Math.hypot(game.x - SB.step.x0, game.y - SB.step.y0) >= s.distance) complete(); break;
      case 'sign': if (k.sign) complete(); break;
      case 'enter': if (state === 'interior' && MM.interiors && MM.interiors.current === T.hut) complete(); break;
      case 'exit': if (state === 'tutorial' && !(MM.interiors && MM.interiors.active) && inYard()) complete(); break;
      case 'plant': if (k.plant && p && p.seed) complete(); break;
      case 'water': if (k.water && p && p.watered) complete(); break;
      case 'harvest':
        if (k.harvest) { complete(); break; }
        if (p && p.seed && p.growth < 100 && state === 'tutorial') { // the framed "magic growth": a visible ~1.5 s ripening
          const was = p.growth; p.growth = Math.min(100, p.growth + dt * 70); p.watered = true;
          if (was < 100 && p.growth >= 100) { safe(() => MM.fx && MM.fx.burst && MM.fx.burst('harvest', p.x, p.y, { count: 14 })); sfx('ui_select'); render(); }
        }
        break;
      case 'cast': if (k.cast && (k.hitDummy || dummy.hp < (SB.castHP != null ? SB.castHP : dummy.maxHP) || dummy.flash > 0)) complete(); break;
      case 'potion': if (k.potion || (world.potions < SB.step.potions && world.hp > SB.step.hp)) complete(); else if (world.potions < 1 && SB.step.t > 0.5 && world.hp <= SB.step.hp) { world.potions = 1; SB.step.potions = 1; } break;
      case 'menu': {
        if (MM.ui && MM.ui.isOpen && MM.ui.isOpen('inventory')) { if (!SB.step.inv) { SB.step.inv = true; render(); } }
        if (SB.step.inv && state === 'tutorial' && !(MM.ui && MM.ui.isOpen && MM.ui.isOpen())) complete();
        break;
      }
      case 'broom':
        if (k.mounted || SB.step.mountedAt) SB.step.up = true;
        if (SB.step.up && (k.landed || (!game.mounted && !game.transition && k.mounted))) complete();
        else if (SB.step.up && !SB.step.r) { SB.step.r = 1; render(); }
        break;
      default: break;
    }
    /* eslint-enable no-undef */
  }
  function complete(msg) {
    const s = cur(); if (!s || SB.done) return;
    SB.done = true;
    toast(msg || ('Well done — ' + s.title.toLowerCase() + '!'), 'good');
    sfx('ui_select');
    const at = target(s) || { x: game.x, y: game.y }; // eslint-disable-line no-undef
    safe(() => MM.fx && MM.fx.burst && MM.fx.burst('sparkle', at.x, at.y, { count: 10 }));
    safe(() => MM.bus.emit('tutorial:step', { id: s.id, index: SB.i, auto: !!(SB.step && SB.step.auto) }));
    if (SB.hud) { SB.hud.classList.remove('mm-tut-pop'); void SB.hud.offsetWidth; SB.hud.classList.add('mm-tut-pop'); }
    SB.done = false;
    begin(SB.i + 1);
  }
  function resetStep() {
    if (!SB) return false;
    const s = cur(); if (!s) return false;
    /* eslint-disable no-undef */
    const inHut = MM.interiors && MM.interiors.active;
    if (s.id === 'exit' && inHut) { const I = MM.interiors.instance, sp = I && I.I && I.I.spawn; if (sp) { game.x = I.O.x + sp.x; game.y = I.O.y + sp.y; game.target = null; } }
    else {
      if (inHut) safe(() => MM.interiors.exit());
      const tg = target(s), b = MM.buildings && MM.buildings.get && MM.buildings.get(T.hut);
      if (s.id === 'enter' && b && b.spawn) place(b.spawn.x, b.spawn.y, b.spawn.facing);
      else if (s.id === 'exit') { if (b && b.spawn) place(b.spawn.x, b.spawn.y, b.spawn.facing); begin(SB.i - 1); toast('Step reset — go inside first.', 'info'); return true; }
      else if (tg && s.target !== 'player' && s.target !== 'ring') place(tg.x - 0.9, tg.y + 0.7);
      else if (s.id === 'move' || s.id === 'sign') place(T.spawn.x, T.spawn.y, T.spawn.facing);
    }
    prepare(s, true);
    SB.step.seen = {}; SB.step.x0 = game.x; SB.step.y0 = game.y; SB.step.t = 0; SB.step.inv = false; SB.step.up = !!game.mounted; SB.step.r = 0; SB.castHP = null;
    /* eslint-enable no-undef */
    toast('Step reset. Try again whenever you like.', 'info'); sfx('ui_select');
    safe(() => MM.bus.emit('tutorial:reset', { id: s.id, index: SB.i }));
    render();
    return true;
  }
  async function skip(opts) {
    if (!SB || SB.asking) return false;
    opts = opts || {};
    let ok = !!opts.confirmed;
    if (!ok) {
      SB.asking = true;
      const confirm = (MM.flow && MM.flow.kit && MM.flow.kit.confirm) || (MM.ui && MM.ui.confirm) || null;
      ok = confirm ? !!(await safe(() => confirm({ title: 'Skip the tutorial?', body: 'You can replay it any time from the main menu or the pause menu. Nothing from the practice yard is kept.', yes: 'Skip tutorial', no: 'Keep practising', icon: 'sprout' }), Promise.resolve(false))) : true;
      if (SB) SB.asking = false;
      // wait for the confirm screen to close and the UI to hand control back
      for (let n = 0; n < 20 && SB && MM.ui && MM.ui.isOpen && MM.ui.isOpen(); n++) await new Promise((r) => setTimeout(r, 25));
    }
    if (!ok || !SB) { if (SB && SB.hud) focusBtn('skip'); return false; }
    end('skip');
    safe(() => MM.flow && MM.flow.finishTutorial ? MM.flow.finishTutorial({ skipped: true }) : MM.state.go('play'));
    return true;
  }
  function finish() {
    if (!SB) return false;
    end('finish');
    sfx('quest_complete');
    safe(() => MM.flow && MM.flow.finishTutorial ? MM.flow.finishTutorial({ skipped: false }) : MM.state.go('play'));
    return true;
  }

  // ================================================================== the sign
  function readSign() {
    const d = MM.ui && MM.ui.dialogue ? safe(() => MM.ui.dialogue({ speaker: 'Signpost', pages: [{ text: T.signText }] }), null) : null;
    if (!d) toast(T.signText, 'info');
    return true;
  }

  // ================================================================== world-space highlight + extra drawables
  function target(s) {
    s = s || cur(); if (!s) return null;
    /* eslint-disable no-undef */
    switch (s.target) {
      case 'ring': return SB && SB.step ? { x: SB.step.x0, y: SB.step.y0, ring: s.distance } : null;
      case 'sign': return { x: T.sign.x, y: T.sign.y, h: 30 };
      case 'plot': return { x: T.plot.x, y: T.plot.y, h: 14 };
      case 'dummy': return { x: dummy.x, y: dummy.y, h: 40 };
      case 'player': return { x: game.x, y: game.y, h: 46 };
      case 'door': {
        const bl = safe(() => (MM.world && MM.world.buildings ? MM.world.buildings() : []), []).find((b) => b.id === T.hut);
        if (bl && bl.door && Number.isFinite(bl.door.x)) return { x: bl.door.x, y: bl.door.y, h: 40 };
        const b = MM.buildings && MM.buildings.get && MM.buildings.get(T.hut); return b && b.spawn ? { x: b.spawn.x, y: b.spawn.y, h: 30 } : null;
      }
      default: return null;
    }
    /* eslint-enable no-undef */
  }
  function drawables(list) {
    if (!inYard()) return;
    /* eslint-disable no-undef */
    list.push({ type: 'dummy', depth: project(dummy.x, dummy.y).y });
    for (const p of world.plots) list.push({ type: 'plot', p, depth: project(p.x, p.y).y - 0.1 });
    /* eslint-enable no-undef */
  }
  function px(g, x, y, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), 1, 1); }
  function overlay(g) {
    if (!inYard() || st() !== 'tutorial' || !SB.step || SB.panel) return;
    const tg = target(); if (!tg) return;
    const t = (performance.now() / 1000), pos = worldToCanvas(tg.x, tg.y); // eslint-disable-line no-undef
    const rx = tg.ring ? tg.ring * 22.6 : 13 + Math.sin(t * 4) * 1.5, ry = rx / 2, n = Math.max(48, Math.round(rx * 3));
    g.save();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (tg.ring ? 0 : t * 0.8), x = pos.x + Math.cos(a) * rx, y = pos.y + Math.sin(a) * ry;
      if (tg.ring && i % 4 > 1) continue;
      px(g, x, y + 1, '#263a37'); px(g, x, y, (i + Math.floor(t * 8)) % 6 < 3 ? '#ecd29b' : '#cfaa71');
    }
    if (!tg.ring) { // bobbing pixel arrow above the target (clamped to the screen edge when off-screen)
      let ax = pos.x, ay = pos.y - (tg.h || 30) - 10 + Math.round(Math.sin(t * 5) * 2);
      ax = Math.max(10, Math.min(502, ax)); ay = Math.max(12, Math.min(300, ay));
      for (let r = 0; r < 6; r++) for (let c = -r - 1; c <= r + 1; c++) px(g, ax + c, ay + r, Math.abs(c) === r + 1 || r === 5 ? '#263a37' : r < 2 ? '#fff3c4' : '#eac979');
      g.fillStyle = '#263a37'; g.fillRect(ax - 2, ay - 6, 5, 7); g.fillStyle = '#eac979'; g.fillRect(ax - 1, ay - 5, 3, 6);
    }
    g.restore();
  }

  // ================================================================== HUD (DOM, moonlit style; keyboard + touch operable)
  const CSS = `
  .mm-tut{position:fixed;left:50%;top:calc(8px + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:4;width:min(94vw,420px);
    pointer-events:auto;padding:8px 11px 8px;border-radius:12px;color:var(--cream,#f4ecd6);font-family:var(--sans,system-ui,sans-serif);
    background:linear-gradient(180deg,rgba(21,51,55,.94),rgba(8,22,25,.94));border:1px solid var(--gold-dim,rgba(207,170,113,.42));
    box-shadow:0 0 0 1px rgba(8,22,25,.8),0 6px 22px rgba(0,0,0,.45),inset 0 1px 0 rgba(236,210,155,.18);transition:opacity .2s}
  .mm-tut.mm-tut-off{opacity:0;visibility:hidden;pointer-events:none}
  .mm-tut.mm-tut-pop{animation:mmTutPop .45s ease-out}
  @keyframes mmTutPop{0%{box-shadow:0 0 0 2px #ecd29b,0 0 26px rgba(236,210,155,.7)}100%{box-shadow:0 0 0 1px rgba(8,22,25,.8),0 6px 22px rgba(0,0,0,.45)}}
  .mm-tut-top{display:flex;align-items:center;gap:8px;font-size:.78em;color:var(--gold-hi,#ecd29b);letter-spacing:.04em;text-transform:uppercase}
  .mm-tut-bar{flex:1;height:5px;border-radius:3px;background:rgba(236,210,155,.15);overflow:hidden}
  .mm-tut-bar i{display:block;height:100%;background:linear-gradient(90deg,#9fd197,#ecd29b);transition:width .35s}
  .mm-tut h2{font-family:var(--serif,Georgia,serif);font-size:1.08em;margin:5px 0 2px;color:var(--cream,#f4ecd6)}
  .mm-tut p{margin:0;font-size:.9em;line-height:1.35}
  .mm-tut .mm-tut-hint{margin-top:5px;color:var(--moss,#9fd197);font-size:.86em}
  .mm-tut kbd{display:inline-block;min-width:1.6em;padding:0 .4em;border-radius:5px;border:1px solid var(--gold,#cfaa71);background:rgba(207,170,113,.14);
    color:var(--gold-hi,#ecd29b);font:600 .92em var(--mono,monospace);text-align:center}
  .mm-tut-row{display:flex;align-items:flex-end;gap:8px;margin-top:5px}.mm-tut-row .mm-tut-hint{flex:1;margin:0}
  .mm-tut-btns{display:flex;gap:6px;flex:none}
  .mm-tut button{pointer-events:auto;min-height:32px;padding:3px 9px;border-radius:8px;cursor:pointer;font:inherit;font-size:.84em;color:var(--cream,#f4ecd6);
    background:rgba(30,68,72,.85);border:1px solid var(--gold-dim,rgba(207,170,113,.42))}
  .mm-tut button:hover{background:rgba(42,88,92,.95)}
  .mm-tut button:focus-visible,.mm-tut-done button:focus-visible{outline:2px solid #ecd29b;outline-offset:2px;box-shadow:0 0 0 5px rgba(236,210,155,.22)}
  .mm-tut-glow{animation:mmTutGlow 1.1s ease-in-out infinite!important}
  @keyframes mmTutGlow{50%{box-shadow:0 0 0 3px #ecd29b,0 0 18px rgba(236,210,155,.85)}}
  .mm-tut-done{position:fixed;inset:0;z-index:6;display:grid;place-items:center;pointer-events:auto;background:rgba(8,22,25,.45)}
  .mm-tut-done>div{width:min(90vw,360px);text-align:center;padding:16px 18px 18px;border-radius:14px;color:var(--cream,#f4ecd6);
    background:linear-gradient(180deg,rgba(21,51,55,.97),rgba(8,22,25,.97));border:1px solid var(--gold,#cfaa71);box-shadow:0 0 30px rgba(236,210,155,.25);animation:mmTutPop .6s ease-out}
  .mm-tut-done canvas{width:96px;height:96px;image-rendering:pixelated;display:block;margin:0 auto 6px}
  .mm-tut-done h2{font-family:var(--serif,Georgia,serif);margin:0 0 6px;color:var(--gold-hi,#ecd29b)}
  .mm-tut-done p{margin:0 0 12px;font-size:.92em}
  .mm-tut-done button{min-height:38px;padding:6px 18px;border-radius:9px;font:inherit;cursor:pointer;color:#081619;background:linear-gradient(180deg,#ecd29b,#cfaa71);border:1px solid #fff3c4}
  @media (prefers-reduced-motion:reduce){.mm-tut,.mm-tut-done>div,.mm-tut-glow{animation:none!important}}`;
  function injectCSS() { if (document.getElementById('mm-tut-css')) return; const s = document.createElement('style'); s.id = 'mm-tut-css'; s.textContent = CSS; document.head.appendChild(s); }
  function host() { return document.getElementById('mm-ui') || document.getElementById('mm-stage') || document.body; }
  function buildHUD() {
    injectCSS();
    const el = document.createElement('section');
    el.className = 'mm-tut'; el.setAttribute('role', 'region'); el.setAttribute('aria-label', 'Tutorial');
    el.innerHTML = '<div class="mm-tut-top"><span class="mm-tut-n"></span><div class="mm-tut-bar"><i></i></div><span>Tutorial</span></div>' +
      '<h2 class="mm-tut-title"></h2><p class="mm-tut-text" aria-live="polite"></p>' +
      '<div class="mm-tut-row"><p class="mm-tut-hint"></p><div class="mm-tut-btns"><button type="button" data-act="reset" title="Put this step back the way it started">Reset step</button><button type="button" data-act="skip">Skip tutorial</button></div></div>';
    el.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('button[data-act]'); if (!b) return;
      e.preventDefault(); e.stopPropagation();
      if (e.detail > 0) b.blur(); // mouse/touch: don't leave focus on the button (Space would re-press it instead of casting)
      if (b.dataset.act === 'reset') resetStep(); else skip();
    });
    el.addEventListener('pointerdown', (e) => e.stopPropagation()); // never click-to-move through the panel
    el.addEventListener('keydown', (e) => { if (e.key === 'Escape' && e.target && e.target.blur) { e.target.blur(); } });
    host().appendChild(el); SB.hud = el;
  }
  function fmt(s) { return esc(s).replace(/\{(\w+)\}/g, (m, a) => '<kbd>' + esc(glyph(a)) + '</kbd>'); }
  function render() {
    if (!SB || !SB.hud) return;
    const s = cur(), el = SB.hud, n = STEPS.length;
    el.querySelector('.mm-tut-n').textContent = s ? 'Step ' + (SB.i + 1) + ' / ' + n : 'Complete';
    el.querySelector('.mm-tut-bar i').style.width = Math.round((SB.i / n) * 100) + '%';
    el.querySelector('.mm-tut-title').textContent = s ? s.title : T.done.title;
    let text = s ? s.text : '', hint = s ? s.hint : '';
    if (s && s.id === 'harvest') { const p = plot(); if (p && p.growth >= 100) text = 'The wheat is golden. Harvest it!'; }
    if (s && s.id === 'menu' && SB.step && SB.step.inv) { text = 'That\'s your bag. Now close the menus to return to the yard.'; hint = '{back} or Resume'; }
    if (s && s.id === 'broom' && SB.step && SB.step.up) { text = 'You\'re flying! Now land again.'; hint = '{broom} to land'; }
    if (method() === 'touch') hint = hint.replace(' · or {click} the ground', '');
    el.querySelector('.mm-tut-text').textContent = text;
    el.querySelector('.mm-tut-hint').innerHTML = fmt(hint);
    glowUI(s);
  }
  const UI_ALIAS = { interact: 'use', cast: 'cast', potion: 'potion', pause: 'pause', broom: 'broom' };
  function unglow() { for (const e of document.querySelectorAll('.mm-tut-glow')) e.classList.remove('mm-tut-glow'); }
  function glowUI(s) {
    unglow();
    if (!s || !s.ui || method() !== 'touch') return;
    const a = s.id === 'menu' && SB.step && SB.step.inv ? null : s.ui; if (!a) return;
    const el = document.querySelector('#mm-ui .mm-tbtn-' + UI_ALIAS[a] + ', #mm-ui [data-action="' + a + '"], #mm-ui [data-act="' + a + '"]');
    if (el) el.classList.add('mm-tut-glow');
  }
  function syncVisibility(state) { if (SB && SB.hud) SB.hud.classList.toggle('mm-tut-off', !(state === 'tutorial' || state === 'interior') || !!SB.panel); }
  function focusBtn(act) { const b = SB && SB.hud && SB.hud.querySelector('[data-act="' + act + '"]'); if (b) safe(() => b.focus({ preventScroll: true })); }

  // completion moment: short celebratory panel + effect, then MM.flow.finishTutorial({skipped:false})
  function celebrate() {
    if (!SB || SB.panel) return;
    SB.done = true; render(); unglow();
    sfx('quest_complete');
    safe(() => MM.fx && MM.fx.burst && MM.fx.burst('levelup', game.x, game.y, { count: 24 })); // eslint-disable-line no-undef
    safe(() => MM.input && MM.input.block && (MM.input.block(true), (SB.blocked = true)));
    const wrap = document.createElement('div');
    wrap.className = 'mm-tut-done'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-labelledby', 'mm-tut-done-t');
    wrap.innerHTML = '<div><canvas width="48" height="48" aria-hidden="true"></canvas><h2 id="mm-tut-done-t"></h2><p></p><button type="button">Begin the journey</button></div>';
    wrap.querySelector('h2').textContent = T.done.title; wrap.querySelector('p').textContent = T.done.text;
    const cv = wrap.querySelector('canvas'), g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    const A = MM.art, names = ['moonflower', 'crop_moon_4', 'crop_wheat_4', 'icon_star', 'moonwell_restored', 'moonwell_glow'];
    const nm = A && A.has ? names.find((n) => safe(() => A.has(n), false)) : null;
    if (nm) safe(() => { const f = A.get(nm), s = Math.max(1, Math.floor(44 / Math.max(f.w || 44, f.h || 44))); A.draw(g, nm, 24, 24 + Math.round(((f.h || 32) * s) / 2) - 2, { scale: s }); });
    else { g.fillStyle = '#eac979'; g.fillRect(20, 10, 8, 28); g.fillRect(10, 20, 28, 8); }
    const btn = wrap.querySelector('button');
    btn.addEventListener('click', () => finish());
    wrap.addEventListener('keydown', (e) => { if (e.key === 'Tab') { e.preventDefault(); btn.focus(); } e.stopPropagation(); }, false);
    wrap.addEventListener('pointerdown', (e) => e.stopPropagation());
    host().appendChild(wrap); SB.panel = wrap;
    syncVisibility(st());
    safe(() => btn.focus({ preventScroll: true }));
    safe(() => MM.bus.emit('tutorial:complete', { steps: STEPS.length }));
  }

  // ================================================================== screen registration + API
  function enter(data, prev) {
    if (!SB) { start(data); return; }
    // resumed from the hut / pause menu / a dialogue: keep going
    render();
  }
  function exit(next) { if (SB && !KEEP.includes(next)) end('abort'); }
  function register() {
    if (!MM.screens || typeof MM.screens.register !== 'function') return false;
    MM.screens.register('tutorial', { sim: 'world', draw: 'world', audio: { keep: true }, enter, exit });
    return true;
  }
  register();

  MM.tutorial = {
    steps: STEPS,
    start(opts) { return MM.flow && MM.flow.startTutorial ? MM.flow.startTutorial(opts || {}) : MM.state.go('tutorial', opts || {}); },
    get active() { return !!SB; },
    get index() { return SB ? SB.i : -1; },
    get step() { const s = SB && cur(); return s ? s.id : SB ? 'complete' : null; },
    reset: resetStep, skip, finish,
    target: () => (SB ? target() : null),
    stats() { return Object.assign({ active: !!SB, offs: SB ? SB.offs.length : 0, hud: document.querySelectorAll('.mm-tut').length, panels: document.querySelectorAll('.mm-tut-done').length, glows: document.querySelectorAll('.mm-tut-glow').length }, counters); },
    _debug: { snapshot: () => (SB ? { worldJSON: SB.snap.worldJSON, gameJSON: SB.snap.gameJSON, campaignJSON: SB.snap.campaignJSON } : null), seen: () => (SB ? Object.assign({}, SB.ev) : null) },
  };
})();
