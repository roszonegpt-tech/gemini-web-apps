// Moss & Moon core — window.MM: bus, settings, state machine, input gate, hooks, camera, save, game.
// Classic script, loaded BEFORE src/core/baseline.js (baseline's load path and seams call into MM while
// it evaluates). It never touches baseline globals at load time; baseline bindings (`world`, `game`,
// `enemies`, `newAdventure`, ...) are only read by bare name inside functions, at call time, guarded.
// API contract: notes/PHASE2_CONTRACT.md "MM core API". Extras are documented in notes/handoff/core.md.
(function () {
  'use strict';
  const MM = window.MM = window.MM || {};
  MM.version = '0.2.0';
  MM.legacyUI = false;                                   // baseline per-frame sidebar DOM writes (off: menus replace them)
  MM.baselineDraw = { damageNumbers: true, labels: true }; // FX/UI may set false to take over canvas text
  const now = () => (window.performance && performance.now ? performance.now() : Date.now());
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  // Baseline bindings live in the shared global lexical scope; before baseline runs they are missing/TDZ.
  const B = {
    world() { try { return world; } catch (e) { return null; } },          // eslint-disable-line no-undef
    game() { try { return game; } catch (e) { return null; } },            // eslint-disable-line no-undef
    enemies() { try { return enemies; } catch (e) { return []; } },        // eslint-disable-line no-undef
    fn(name) { const f = window[name]; return typeof f === 'function' ? f : null; },
    call(name, ...a) { const f = B.fn(name); if (!f) return undefined; try { return f(...a); } catch (e) { console.error('[MM] baseline ' + name + ' failed', e); return undefined; } },
  };
  MM._baseline = B; // internal; used by boot.js diagnostics

  // ------------------------------------------------------------------ storage (localStorage or memory)
  const mem = new Map();
  let storageOK = false;
  try { const k = '__mm_probe__'; window.localStorage.setItem(k, '1'); window.localStorage.removeItem(k); storageOK = true; } catch (e) { storageOK = false; }
  const storage = {
    get available() { return storageOK; },
    get(k) { if (storageOK) { try { return window.localStorage.getItem(k); } catch (e) { /* fall through */ } } return mem.has(k) ? mem.get(k) : null; },
    set(k, v) {
      v = String(v);
      if (storageOK) { try { window.localStorage.setItem(k, v); mem.delete(k); return true; } catch (e) { console.warn('[MM] storage write failed, keeping this session in memory', e); storageOK = false; } }
      mem.set(k, v); return false;
    },
    remove(k) { mem.delete(k); if (storageOK) { try { window.localStorage.removeItem(k); } catch (e) { /* ignore */ } } },
  };
  MM.storage = storage;

  // ------------------------------------------------------------------ bus
  const listeners = new Map();
  const errCounts = new WeakMap();
  function report(where, fn, e) {
    const n = (errCounts.get(fn) || 0) + 1; errCounts.set(fn, n);
    if (n <= 3) console.error('[MM] ' + where + ' listener failed' + (n === 3 ? ' (further errors from it are silenced)' : '') + ':', e);
  }
  const bus = {
    on(name, fn) {
      if (typeof fn !== 'function') return () => {};
      let a = listeners.get(name); if (!a) listeners.set(name, a = []);
      a.push(fn); return () => bus.off(name, fn);
    },
    once(name, fn) { const off = bus.on(name, (d, n) => { off(); fn(d, n); }); return off; },
    off(name, fn) { const a = listeners.get(name); if (!a) return; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); },
    emit(name, data) {
      const a = listeners.get(name);
      if (a && a.length) for (const fn of a.slice()) { try { fn(data, name); } catch (e) { report('bus "' + name + '"', fn, e); } }
      const w = name !== '*' && listeners.get('*');
      if (w && w.length) for (const fn of w.slice()) { try { fn(data, name); } catch (e) { report('bus "*"', fn, e); } }
    },
    count(name) { return (listeners.get(name) || []).length; },
  };
  MM.bus = bus;

  // ------------------------------------------------------------------ settings
  const SETTINGS_KEY = 'moss-moon-settings-v1';
  const prefersReduced = (() => { try { return !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();
  const SCHEMA = {
    quality: { def: 'medium', enum: ['low', 'medium', 'high', 'custom'] },
    softFilter: { def: 'low', enum: ['off', 'low', 'medium'] },
    bloom: { def: 'low', enum: ['off', 'low', 'high'] },
    particles: { def: 'medium', enum: ['low', 'medium', 'high'] },
    shake: { def: 'low', enum: ['off', 'low', 'full'] },
    reducedFlashes: { def: false },
    reducedMotion: { def: prefersReduced },
    subtitles: { def: true },
    damageNumbers: { def: true },
    volMaster: { def: 0.8, min: 0, max: 1 },
    volMusic: { def: 0.6, min: 0, max: 1 },
    volSfx: { def: 0.8, min: 0, max: 1 },
    volCine: { def: 0.8, min: 0, max: 1 },
    autosave: { def: true },
    touchControls: { def: 'auto', enum: ['auto', 'on', 'off'] },
    textScale: { def: 1, min: 0.75, max: 1.75 },
  };
  const PRESETS = {
    low: { softFilter: 'off', bloom: 'off', particles: 'low' },
    medium: { softFilter: 'low', bloom: 'low', particles: 'medium' },
    high: { softFilter: 'medium', bloom: 'high', particles: 'high' },
  };
  const PRESET_KEYS = ['softFilter', 'bloom', 'particles'];
  function coerce(key, v) {
    const s = SCHEMA[key]; if (!s) return undefined;
    if (s.enum) return s.enum.includes(v) ? v : undefined;
    if (typeof s.def === 'boolean') return typeof v === 'boolean' ? v : (v === 'true' || v === 1 ? true : v === 'false' || v === 0 ? false : undefined);
    const n = Number(v); if (v === null || v === '' || !Number.isFinite(n)) return undefined;
    return Math.min(s.max, Math.max(s.min, n));
  }
  const defaults = () => { const o = {}; for (const k in SCHEMA) o[k] = SCHEMA[k].def; return o; };
  let S = defaults();
  try {
    const raw = JSON.parse(storage.get(SETTINGS_KEY) || 'null');
    if (isObj(raw)) for (const k in SCHEMA) { const v = coerce(k, raw[k]); if (v !== undefined) S[k] = v; }
  } catch (e) { console.warn('[MM] settings unreadable, using defaults', e); }
  function matchPreset() { for (const p in PRESETS) if (PRESET_KEYS.every((k) => PRESETS[p][k] === S[k])) return p; return 'custom'; }
  if (S.quality !== 'custom' && PRESETS[S.quality]) Object.assign(S, PRESETS[S.quality]); else S.quality = matchPreset();
  function persistSettings() { storage.set(SETTINGS_KEY, JSON.stringify(S)); }
  function audioView() { return { master: S.volMaster, music: S.volMusic, sfx: S.volSfx, cine: S.volCine }; }
  function broadcast(key, changed) { bus.emit('settings', { key, value: key ? S[key] : undefined, changed, all: { ...S }, audio: audioView() }); }
  const settings = {
    schema: SCHEMA, presets: PRESETS,
    get(key) { return key === undefined ? { ...S } : S[key]; },
    all() { return { ...S }; },
    defaults,
    // set(key, value) or set({key: value, ...}). Returns true when something changed.
    set(key, val) {
      if (isObj(key)) { let any = false; const changed = []; for (const k of Object.keys(key)) if (apply(k, key[k], changed)) any = true; if (any) { persistSettings(); broadcast(changed.length === 1 ? changed[0] : null, changed); } return any; }
      const changed = [];
      if (!apply(key, val, changed)) return false;
      persistSettings(); broadcast(key, changed); return true;
    },
    reset() { S = defaults(); Object.assign(S, PRESETS[S.quality]); persistSettings(); broadcast(null, Object.keys(SCHEMA)); },
    onChange(fn) { return bus.on('settings', fn); },
    // particles low/medium/high -> .35/.7/1; reducedMotion caps it at .35
    particleScale() { const v = { low: 0.35, medium: 0.7, high: 1 }[S.particles] || 0.7; return S.reducedMotion ? Math.min(v, 0.35) : v; },
    // shake off/low/full -> 0/.35/1; reducedMotion -> 0
    shakeScale() { return S.reducedMotion ? 0 : ({ off: 0, low: 0.35, full: 1 }[S.shake] ?? 0.35); },
  };
  function apply(key, val, changed) {
    if (!SCHEMA[key]) { console.warn('[MM.settings] unknown key', key); return false; }
    const v = coerce(key, val);
    if (v === undefined) { console.warn('[MM.settings] invalid value for ' + key + ':', val); return false; }
    if (key === 'quality') {
      let any = S.quality !== v; S.quality = v;
      if (PRESETS[v]) for (const k of PRESET_KEYS) if (S[k] !== PRESETS[v][k]) { S[k] = PRESETS[v][k]; changed.push(k); any = true; }
      if (any) changed.unshift('quality');
      return any;
    }
    if (S[key] === v) return false;
    S[key] = v; changed.push(key);
    if (PRESET_KEYS.includes(key)) { const q = matchPreset(); if (q !== S.quality) { S.quality = q; changed.push('quality'); } }
    return true;
  }
  MM.settings = settings;

  // ------------------------------------------------------------------ state machine + input gate
  const STATES = ['boot', 'title', 'creation', 'play', 'menu', 'dialogue', 'cine', 'defeat', 'ending', 'loading'];
  function clearControlsSafe() {
    B.call('clearControls');
    const g = B.game(); if (g) { g.target = null; }
  }
  const state = {
    list: STATES.slice(), current: 'boot', prev: null, data: null, since: now(),
    go(name, data) {
      if (!STATES.includes(name)) { console.warn('[MM.state] unknown state', name); return false; }
      if (name === state.current) return false;
      const from = state.current;
      state.prev = from; state.current = name; state.data = data === undefined ? null : data; state.since = now();
      if (name !== 'play') clearControlsSafe();
      bus.emit('state', { from, to: name, data: state.data });
      return true;
    },
    is(name) { return state.current === name; },
  };
  MM.state = state;
  MM.isPaused = () => state.current !== 'play';

  let inputBlocked = false;
  const ACTIONS = {
    cast: () => B.call('castSpell'), broom: () => B.call('toggleBroom'), tend: () => B.call('tendPlot'), potion: () => B.call('drink'),
    bomb: () => B.call('throwBomb'), spell1: () => B.call('chooseSpell', 0), spell2: () => B.call('chooseSpell', 1), spell3: () => B.call('chooseSpell', 2),
    spell4: () => B.call('chooseSpell', 3), spell5: () => B.call('chooseSpell', 4),
  };
  MM.input = {
    block(on) { inputBlocked = !!on; if (inputBlocked) clearControlsSafe(); bus.emit('input:block', { blocked: inputBlocked }); },
    get blocked() { return inputBlocked; },
    isBlocked() { return inputBlocked || MM.isPaused(); },
    // On-screen pad: MM.input.touch(pointerId, 'N'|'NE'|...|null) drives baseline's touchDirections.
    touch(id, dir) { try { if (dir) touchDirections.set(id, dir); else touchDirections.delete(id); } catch (e) { /* baseline not loaded */ } }, // eslint-disable-line no-undef
    // One-shot gameplay actions for buttons: cast broom tend potion bomb spell1..spell5. Ignored while blocked.
    action(name) { if (MM.input.isBlocked()) return false; const f = ACTIONS[name]; if (!f) { console.warn('[MM.input] unknown action', name); return false; } return f(); },
    actions: Object.keys(ACTIONS),
  };

  // ------------------------------------------------------------------ hooks
  const HOOK_NAMES = ['preUpdate', 'postUpdate', 'preDraw', 'drawGround', 'drawables', 'light', 'postEffects', 'overlay', 'postDraw'];
  const H = new Map();
  let seq = 0;
  const hooks = {
    names: HOOK_NAMES.slice(),
    // Lower priority runs first (draw hooks: higher priority paints on top). Returns an off() function.
    on(name, fn, priority = 0) {
      if (typeof fn !== 'function') return () => {};
      let a = H.get(name); if (!a) H.set(name, a = []);
      a.push({ fn, priority: Number(priority) || 0, seq: seq++ });
      a.sort((x, y) => x.priority - y.priority || x.seq - y.seq);
      return () => hooks.off(name, fn);
    },
    off(name, fn) { const a = H.get(name); if (!a) return; const i = a.findIndex((h) => h.fn === fn); if (i >= 0) a.splice(i, 1); },
    count(name) { return (H.get(name) || []).length; },
    // Runs every listener; returns true if any returned true (used by 'light': true = lighting handled).
    run(name, ...args) {
      const a = H.get(name); if (!a || !a.length) return undefined;
      let handled = false;
      for (const h of a.slice()) { try { if (h.fn(...args) === true) handled = true; } catch (e) { report('hook "' + name + '"', h.fn, e); } }
      return handled;
    },
  };
  for (const n of HOOK_NAMES) hooks[n] = (...a) => hooks.run(n, ...a);
  MM.hooks = hooks;

  // ------------------------------------------------------------------ camera
  const shakes = [];
  let focus = null;
  const camera = {
    lookAhead: 0.3, follow: 4,
    shake(amount, dur = 0.3) {
      const k = settings.shakeScale(), a = Number(amount) * k;
      if (!(a > 0)) return false;
      shakes.push({ amp: Math.min(a, 16), dur: Math.max(0.05, Number(dur) || 0.3), t0: now(), seed: Math.random() * 1000 });
      if (shakes.length > 8) shakes.shift();
      return true;
    },
    // Current screen offset in px (wall-clock decay, so it also settles while paused). Quadratic falloff.
    offset() {
      if (!shakes.length) return { x: 0, y: 0 };
      if (!settings.shakeScale()) { shakes.length = 0; return { x: 0, y: 0 }; }
      const t = now(); let x = 0, y = 0;
      for (let i = shakes.length - 1; i >= 0; i--) {
        const s = shakes[i], k = (t - s.t0) / 1000 / s.dur;
        if (k >= 1) { shakes.splice(i, 1); continue; }
        const a = s.amp * (1 - k) * (1 - k), p = t * 0.06 + s.seed;
        x += a * (Math.sin(p * 1.7) * 0.65 + Math.sin(p * 4.3) * 0.35);
        y += a * (Math.cos(p * 1.3) * 0.6 + Math.sin(p * 3.7) * 0.4) * 0.7;
      }
      const c = 16; return { x: Math.max(-c, Math.min(c, x)), y: Math.max(-c, Math.min(c, y)) };
    },
    // Gameplay framing target in tile coords, or null to return to the player. hold = seconds (sim time).
    focus(f) {
      if (!f) { if (focus) { focus = null; bus.emit('camera:focus', null); } return; }
      const x = Number(f.x), y = Number(f.y); if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      focus = { x, y, zoomHint: f.zoomHint ?? null, hold: Number.isFinite(f.hold) ? f.hold : null };
      bus.emit('camera:focus', { ...focus });
    },
    get focused() { return focus ? { ...focus } : null; },
    // Called by baseline update() (seam S6): projected-px point to follow instead of the player, or null.
    focusPoint(dt) {
      if (!focus) return null;
      if (focus.hold !== null) { focus.hold -= dt || 0; if (focus.hold <= 0) { camera.focus(null); return null; } }
      const p = B.call('project', focus.x, focus.y); return p || null;
    },
    // Snap the baseline camera onto the player (after teleports).
    snap() { const g = B.game(), p = g && B.call('project', g.x, g.y); if (p) { g.camX = p.x; g.camY = p.y; } },
  };
  MM.camera = camera;

  // ------------------------------------------------------------------ save
  const SAVE_KEY = 'moss-moon-save-v2', BAK_KEY = 'moss-moon-save-v2-bak', CORRUPT_KEY = 'moss-moon-save-v2-corrupt';
  const V1_KEY = 'moss-moon-adventure-v1', LOOK_KEY = 'moss-moon-look';
  const ORDER = ['world', 'player', 'look', 'meta'];
  const sections = new Map();
  let pending = null; // sections of the last loaded envelope not yet applied (late-registering modules)
  const UNSAFE_STATES = ['boot', 'title', 'creation', 'cine', 'loading', 'defeat'];

  function parseEnvelope(str) {
    if (str == null) return { status: 'none' };
    let v; try { v = JSON.parse(str); } catch (e) { return { status: 'corrupt', error: 'parse' }; }
    if (!isObj(v)) return { status: 'corrupt', error: 'shape' };
    if (v.v === 2) return isObj(v.sections) ? { status: 'ok', env: v } : { status: 'corrupt', error: 'sections' };
    if (Number(v.v) > 2) return { status: 'newer', env: v };
    return { status: 'corrupt', error: 'version' };
  }
  function migrateV1() {
    const raw = storage.get(V1_KEY); if (raw == null) return { status: 'none' };
    let w; try { w = JSON.parse(raw); } catch (e) { return { status: 'corrupt', error: 'v1-parse' }; }
    if (!isObj(w)) return { status: 'corrupt', error: 'v1-shape' };
    let look = null; try { look = JSON.parse(storage.get(LOOK_KEY) || 'null'); } catch (e) { look = null; }
    const env = { v: 2, savedAt: null, migratedFrom: 1, sections: { world: w } };
    if (isObj(look)) env.sections.look = look;
    return { status: 'ok', env, migrated: true };
  }
  // Best readable envelope: primary -> backup -> v1 key.
  function readBest() {
    const p = parseEnvelope(storage.get(SAVE_KEY));
    if (p.status === 'ok' || p.status === 'newer') return p;
    if (p.status === 'corrupt') {
      const b = parseEnvelope(storage.get(BAK_KEY));
      if (b.status === 'ok') return { ...b, restored: 'backup', primaryError: p.error };
      const m = migrateV1(); if (m.status === 'ok') return { ...m, restored: 'v1', primaryError: p.error };
      return p;
    }
    return migrateV1();
  }
  function orderedNames(names) {
    return names.slice().sort((a, b) => { const i = ORDER.indexOf(a), j = ORDER.indexOf(b); return (i < 0 ? 99 : i) - (j < 0 ? 99 : j); });
  }
  function applySection(name, data) {
    const s = sections.get(name); if (!s || typeof s.set !== 'function') return true;
    try { s.set(data); return true; } catch (e) {
      console.error('[MM.save] section "' + name + '" failed to load; resetting it', e);
      try { s.reset && s.reset(); } catch (e2) { console.error('[MM.save] section reset failed', e2); }
      bus.emit('save:error', { reason: 'section', section: name, error: String(e && e.message || e) });
      return false;
    }
  }
  function resetSections() { for (const name of orderedNames([...sections.keys()])) { const s = sections.get(name); try { s.reset && s.reset(); } catch (e) { console.error('[MM.save] reset of "' + name + '" failed', e); } } }
  function unsafeReason() {
    if (!api.active) return 'no-game';
    if (UNSAFE_STATES.includes(state.current)) return 'state:' + state.current;
    const w = B.world(), g = B.game();
    if (!w || !g) return 'not-ready';
    if (!(w.hp > 0)) return 'dead';
    for (const e of B.enemies() || []) if (e && e.hp > 0 && !e.dead && Math.hypot(e.x - g.x, e.y - g.y) < 3) return 'danger';
    return '';
  }
  const save = {
    key: SAVE_KEY, lastResult: null, lastError: null,
    get available() { return storageOK; },
    registerSection(name, impl) {
      if (!name || !isObj(impl)) throw new Error('MM.save.registerSection(name, {get,set,reset})');
      sections.set(name, impl);
      if (pending && Object.prototype.hasOwnProperty.call(pending, name)) { const d = pending[name]; delete pending[name]; applySection(name, d); }
      return () => sections.delete(name);
    },
    sections() { return [...sections.keys()]; },
    whyNot: unsafeReason,
    // save({silent, reason, force}) -> bool. Refuses unsafe moments unless force.
    save(opts) {
      opts = opts || {}; const silent = !!opts.silent;
      if (!opts.force) { const why = unsafeReason(); if (why) { save.lastResult = { ok: false, reason: why }; if (!silent) bus.emit('save', { silent, ok: false, reason: why }); return false; } }
      const env = { v: 2, app: 'moss-moon', version: MM.version, savedAt: Date.now(), reason: opts.reason || (silent ? 'auto' : 'manual'), sections: {} };
      for (const name of orderedNames([...sections.keys()])) {
        const s = sections.get(name); if (typeof s.get !== 'function') continue;
        try { const d = s.get(); if (d !== undefined) env.sections[name] = JSON.parse(JSON.stringify(d)); } catch (e) { console.error('[MM.save] section "' + name + '" failed to serialize', e); }
      }
      if (pending) for (const k of Object.keys(pending)) if (!(k in env.sections)) env.sections[k] = pending[k]; // keep data of modules not loaded
      let ok = false, str = '';
      try { str = JSON.stringify(env); } catch (e) { save.lastError = String(e); }
      if (str) {
        const prev = storage.get(SAVE_KEY);
        if (prev && parseEnvelope(prev).status === 'ok') storage.set(BAK_KEY, prev);
        storage.set(SAVE_KEY, str); ok = true; // in-memory fallback still counts as saved for this session
      }
      save.lastResult = { ok, reason: ok ? '' : 'serialize', persisted: ok && storageOK, bytes: str.length };
      bus.emit('save', { silent, ok, persisted: ok && storageOK, reason: env.reason });
      return ok;
    },
    // load() -> {ok, reason?, restored?, migrated?}. Applies every registered section; missing ones reset.
    load() {
      const r = readBest();
      if (r.status === 'none') { save.lastResult = { ok: false, reason: 'none' }; return { ok: false, reason: 'none' }; }
      if (r.status === 'newer') { bus.emit('save:error', { reason: 'newer', v: r.env.v }); return { ok: false, reason: 'newer' }; }
      if (r.status !== 'ok') {
        const bad = storage.get(SAVE_KEY); if (bad != null) storage.set(CORRUPT_KEY, bad);
        resetSections(); save.lastError = r.error;
        bus.emit('save:error', { reason: 'corrupt', error: r.error });
        return { ok: false, reason: 'corrupt' };
      }
      if (r.restored) { const bad = storage.get(SAVE_KEY); if (bad != null) storage.set(CORRUPT_KEY, bad); bus.emit('save:error', { reason: 'corrupt', error: r.primaryError, restored: r.restored }); }
      const data = r.env.sections; let warnings = 0;
      pending = {};
      for (const k of Object.keys(data)) if (!sections.has(k)) pending[k] = data[k];
      for (const name of orderedNames([...sections.keys()])) {
        if (Object.prototype.hasOwnProperty.call(data, name)) { if (!applySection(name, data[name])) warnings++; }
        else { const s = sections.get(name); try { s.reset && s.reset(); } catch (e) { warnings++; } }
      }
      const out = { ok: true, savedAt: r.env.savedAt || null };
      if (r.restored) out.restored = r.restored;
      if (r.migrated || r.restored === 'v1') out.migrated = true;
      if (warnings) out.warnings = warnings;
      save.lastResult = out; bus.emit('save:load', out);
      return out;
    },
    status() { const r = readBest(); return r.status === 'ok' ? (r.migrated ? 'v1' : r.restored ? 'backup' : 'ok') : r.status; },
    hasSave() { return readBest().status === 'ok'; },
    summary() {
      const r = readBest(); if (r.status !== 'ok') return null;
      const s = r.env.sections || {}, w = isObj(s.world) ? s.world : {}, m = isObj(s.meta) ? s.meta : {}, c = isObj(s.campaign) ? s.campaign : {};
      return { name: typeof m.name === 'string' && m.name ? m.name : 'Witch', level: Number(w.level) || 1, day: Number(w.day) || 1,
        chapter: Number.isFinite(Number(c.chapter)) ? Number(c.chapter) : 0, savedAt: r.env.savedAt || null, region: w.region || 'grove',
        playTime: Number(m.playTime) || 0, migrated: !!r.migrated };
    },
    erase() { for (const k of [SAVE_KEY, BAK_KEY, V1_KEY]) storage.remove(k); pending = null; bus.emit('save:erase', {}); return true; },
    exportJSON() {
      const r = readBest();
      if (r.status === 'ok') return JSON.stringify(r.env, null, 1);
      return null;
    },
    // importJSON(str) -> {ok, reason?}: validates and stores (v2 envelope or a raw v1 world). Call MM.game.continueGame() to apply.
    importJSON(str) {
      let v; try { v = typeof str === 'string' ? JSON.parse(str) : str; } catch (e) { return { ok: false, reason: 'parse' }; }
      if (!isObj(v)) return { ok: false, reason: 'shape' };
      let env;
      if (v.v === 2 && isObj(v.sections)) env = v;
      else if (v.v === undefined && (v.cls || v.region || v.plots)) env = { v: 2, savedAt: Date.now(), migratedFrom: 1, sections: { world: v } };
      else return { ok: false, reason: Number(v.v) > 2 ? 'newer' : 'version' };
      const prev = storage.get(SAVE_KEY); if (prev && parseEnvelope(prev).status === 'ok') storage.set(BAK_KEY, prev);
      storage.set(SAVE_KEY, JSON.stringify(env)); bus.emit('save:import', {});
      return { ok: true };
    },
  };
  MM.save = save;

  // ------------------------------------------------------------------ game
  const meta = { name: 'Witch', createdAt: null, playTime: 0 };
  hooks.on('postUpdate', (dt) => { if (api.active) meta.playTime += dt || 0; }, -1000);
  save.registerSection('meta', {
    get: () => ({ name: api.name, createdAt: meta.createdAt, playTime: Math.round(meta.playTime) }),
    set: (d) => { if (!isObj(d)) throw new Error('meta'); api.name = cleanName(d.name); meta.createdAt = d.createdAt || null; meta.playTime = Number(d.playTime) || 0; },
    reset: () => { api.name = 'Witch'; meta.createdAt = null; meta.playTime = 0; },
  });
  function cleanName(n) { n = typeof n === 'string' ? n.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 18) : ''; return n || 'Witch'; }
  const api = {
    name: 'Witch', active: false, flags: {},
    world: B.world, player: B.game,
    // newGame({name, look:{style,skin,hair,outfit}, cls}) -> true. Resets every save section, enters 'play',
    // then calls MM.campaign.start() if present (pass {startCampaign:false} to skip). Saves immediately (forced).
    newGame(opts) {
      opts = opts || {};
      if (!B.fn('newAdventure')) { console.error('[MM.game] baseline not loaded'); return false; }
      pending = null; api.flags = {};
      resetSections();               // world section reset == baseline newAdventure()
      if (opts.cls) B.call('newAdventure', opts.cls);
      api.name = cleanName(opts.name); meta.createdAt = Date.now(); meta.playTime = 0;
      if (isObj(opts.look)) for (const g of ['style', 'skin', 'hair', 'outfit']) if (opts.look[g]) B.call('chooseLook', g, opts.look[g]);
      api.active = true;
      state.go('play', { newGame: true });
      bus.emit('game:new', { name: api.name, look: isObj(opts.look) ? { ...opts.look } : null });
      if (opts.startCampaign !== false && MM.campaign && typeof MM.campaign.start === 'function') {
        try { MM.campaign.start(); } catch (e) { console.error('[MM.game] campaign.start failed', e); }
      }
      save.save({ silent: true, force: true, reason: 'new' });
      return true;
    },
    // continueGame() -> {ok, reason?}. On success enters 'play'.
    continueGame() {
      const r = save.load();
      if (!r.ok) return r;
      api.active = true; api.flags = {};
      state.go('play', { continued: true });
      bus.emit('game:continue', r);
      return r;
    },
    toTitle() {
      if (api.active && !unsafeReason()) save.save({ silent: true, reason: 'title' });
      api.active = false;
      state.go('title');
      bus.emit('game:title', {});
      return true;
    },
    saveNow() { return save.save({ silent: false, reason: 'manual' }); },
    safeToSave() { return !unsafeReason(); },
    // Called by baseline resetPlayer() when the player drops to 0 HP. Enters 'defeat'; recovery via respawnHome().
    handleDeath() {
      const w = B.world(), g = B.game(); if (!w || !g) return false;
      w.hp = 0; g.vx = g.vy = 0; g.target = null;
      const goldLoss = Math.min(25, Math.floor(Math.max(0, w.gold) * 0.15));
      state.go('defeat', { region: w.region, mode: w.mode, floor: w.floor, goldLoss });
      return true;
    },
    // Wake at the homestead: lose 15% gold (max 25, or opts.goldLoss), full HP/mana. opts.resume (default true) -> 'play'.
    respawnHome(opts) {
      opts = opts || {};
      const w = B.world(); if (!w) return null;
      const loss = Number.isFinite(opts.goldLoss) ? Math.max(0, opts.goldLoss) : Math.min(25, Math.floor(Math.max(0, w.gold) * 0.15));
      const lost = Math.min(Math.max(0, w.gold), loss);
      B.call('respawnAtHome', lost);
      camera.focus(null);
      bus.emit('respawn', { goldLost: lost });
      if (opts.resume !== false) state.go('play', { respawned: true });
      save.save({ silent: true, force: true, reason: 'respawn' });
      return { goldLost: lost };
    },
    unsafeReason,
  };
  MM.game = api;
})();
