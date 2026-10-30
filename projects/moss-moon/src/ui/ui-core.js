/* Moss & Moon — MM.ui core (owner: UI agent). Classic script, loads first of src/ui/*.js.
 * Screen stack, state sync, toasts, confirm, icons, data adapters over MM.campaign / baseline globals.
 * Everything visible lives inside #mm-ui. See notes/UI.md for the API. */
window.MM = window.MM || {};
(function () {
  'use strict';
  const MM = window.MM;
  if (MM.ui && MM.ui.__mm) return;
  const ui = MM.ui = { __mm: true, ready: false, version: '0.2.0', screens: {}, stack: [], _readyFns: [] };

  // ------------------------------------------------------------------ tiny DOM helpers
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; } }
      else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.appendChild(typeof kid === 'string' || typeof kid === 'number' ? document.createTextNode(String(kid)) : kid);
    }
    return el;
  }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const safe = (fn, fallback) => { try { const r = fn(); return r === undefined ? fallback : r; } catch (e) { return fallback; } };
  ui.h = h; ui.esc = esc; ui.clamp = clamp; ui.safe = safe;

  // Button helper: always type=button, optional icon, label, hint (sub text) and keyboard hint.
  ui.button = function (label, onClick, opts) {
    opts = opts || {};
    const b = h('button', {
      type: 'button', class: 'mm-btn ' + (opts.cls || ''), 'aria-label': opts.aria || null,
      disabled: opts.disabled || null, title: opts.title || null, 'data-action': opts.id || null,
    },
      opts.icon ? ui.icon(opts.icon) : null,
      h('span', { class: 'mm-btn-label' }, label, opts.sub ? h('small', { class: 'mm-btn-sub' }, opts.sub) : null),
      opts.key ? h('kbd', { class: 'mm-kbd' }, opts.key) : null);
    b.addEventListener('click', (e) => {
      if (b.disabled) return;
      if (!opts.silent) ui.sfx(opts.sound || 'ui_select');
      try { onClick && onClick(e); } catch (err) { console.error('[MM.ui] action failed', err); ui.toast('Something went wrong: ' + (err && err.message || err), 'warn'); }
    });
    return b;
  };

  // ------------------------------------------------------------------ fallbacks (used ONLY when MM core is missing)
  // FALLBACK: local bus/settings/state so the UI is testable before src/core/mm.js exists. Never used when MM core is loaded.
  const localBus = (() => {
    const m = {};
    return {
      on(n, f) { (m[n] = m[n] || []).push(f); return () => this.off(n, f); },
      off(n, f) { m[n] = (m[n] || []).filter((x) => x !== f); },
      emit(n, d) { (m[n] || []).slice().forEach((f) => { try { f(d); } catch (e) { console.error('[MM.ui bus]', n, e); } }); },
    };
  })();
  ui.bus = () => (MM.bus && MM.bus.on ? MM.bus : localBus);
  ui.on = (name, fn) => ui.bus().on(name, fn);
  ui.emit = (name, data) => { try { ui.bus().emit(name, data); } catch (e) { console.error(e); } };

  ui.SETTING_DEFAULTS = {
    quality: 'medium', softFilter: 'low', bloom: 'low', particles: 'medium', shake: 'low', reducedFlashes: false, reducedMotion: false,
    subtitles: true, damageNumbers: true, volMaster: 0.8, volMusic: 0.6, volSfx: 0.8, volCine: 0.8, autosave: true, touchControls: 'auto', textScale: 1,
    joystickSize: 1, joystickSide: 'left', joystickMode: 'floating', haptics: true, fxIntensity: 1,
  };
  const localSettings = (() => {
    const KEY = 'moss-moon-settings-v1';
    let s = Object.assign({}, ui.SETTING_DEFAULTS);
    try { Object.assign(s, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* private mode */ }
    const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } };
    return {
      get: (k) => s[k], all: () => Object.assign({}, s),
      set(k, v) { s[k] = v; persist(); localBus.emit('settings', Object.assign({ key: k, value: v }, s)); },
      reset() { s = Object.assign({}, ui.SETTING_DEFAULTS); persist(); localBus.emit('settings', Object.assign({ key: '*' }, s)); },
    };
  })();
  ui.settings = () => (MM.settings && MM.settings.get ? MM.settings : localSettings);
  // Keys the core schema does not know yet (phase-3 additions) are kept in the local store so they still work.
  ui.setting = (k) => {
    let v = safe(() => ui.settings().get(k));
    if ((v === undefined || v === null) && ui.settings() !== localSettings) v = localSettings.get(k);
    return v === undefined || v === null ? ui.SETTING_DEFAULTS[k] : v;
  };
  ui.setSetting = (k, v) => {
    const S = ui.settings();
    const known = S === localSettings || !S.schema || Object.prototype.hasOwnProperty.call(S.schema, k);
    const r = known ? safe(() => S.set(k, v), false) : false;
    if (S !== localSettings && (!known || r === false)) { localSettings.set(k, v); ui.emit('settings', { key: k, value: v, local: true }); }
    return r !== false;
  };

  const localState = {
    current: 'boot', prev: null, data: null,
    go(name, data) {
      if (name === this.current) return;
      const from = this.current; this.prev = from; this.current = name; this.data = data || null;
      if (!ui.GAME_STATES.includes(name)) ui.base.call('clearControls');
      localBus.emit('state', { from, to: name, data });
    },
    is(n) { return this.current === n; },
  };
  ui.resetSettings = () => { safe(() => ui.settings().reset()); if (ui.settings() !== localSettings) localSettings.reset(); };
  ui.fallbackCore = () => !(MM.state && MM.state.go);
  ui.state = () => (MM.state && MM.state.go ? MM.state : localState);
  ui.stateIs = (n) => ui.state().current === n;
  ui.go = (name, data) => { if (ui.state().current !== name) safe(() => ui.state().go(name, data)); };
  // Gameplay states (phase 3): HUD, joystick and hotkeys only exist while the current screen simulates (sim !== 'none').
  ui.GAME_STATES = ['play', 'interior', 'tutorial'];
  ui.simOf = function (name) {
    const d = safe(() => MM.screens && MM.screens.def && MM.screens.def(name), null);
    if (d && d.sim) return d.sim;
    return ui.GAME_STATES.includes(name) ? (name === 'play' || name === 'tutorial' ? 'world' : 'player') : 'none';
  };
  ui.inGameplay = () => ui.simOf(ui.state().current) !== 'none';
  ui.lastGameState = 'play';
  ui.isPaused = () => (MM.isPaused ? !!MM.isPaused() : !ui.inGameplay());

  // Input method + control glyphs (MM.input.method / MM.input.glyph from CORE; local fallback until it lands).
  const GLYPHS = {
    keyboard: { interact: 'E', cast: 'Space', broom: 'B', potion: 'H', pause: 'Esc', inventory: 'I', journal: 'J', map: 'M', spellbook: 'K', spellNext: '1–5', move: 'WASD' },
    gamepad: { interact: 'X', cast: 'A', broom: 'Y', potion: 'B', pause: 'Start', inventory: 'Start', journal: 'Start', map: 'Back', spellbook: 'Start', spellNext: 'RB', move: 'L-stick' },
    touch: { interact: 'Use', cast: 'Cast', broom: 'Broom', potion: 'Potion', pause: '❚❚', inventory: '❚❚', journal: '❚❚', map: '❚❚', spellbook: '❚❚', spellNext: 'Swap', move: 'Stick' },
  };
  ui.method = function () {
    const m = safe(() => MM.input && MM.input.method, null);
    if (m === 'keyboard' || m === 'touch' || m === 'gamepad') return m;
    const l = ui.input && ui.input.lastInput ? ui.input.lastInput() : 'key';
    return l === 'touch' ? 'touch' : l === 'pad' ? 'gamepad' : 'keyboard';
  };
  ui.glyph = function (action) {
    const g = safe(() => MM.input && typeof MM.input.glyph === 'function' && MM.input.glyph(action), null);
    if (g) return String(g);
    const t = GLYPHS[ui.method()] || GLYPHS.keyboard;
    return t[action] || GLYPHS.keyboard[action] || action;
  };

  // One per-frame driver for all UI work: MM.loop.onTick when CORE provides it (single rAF rule), else one local rAF.
  const tickFns = new Set();
  let tickDriver = null, lastTs = 0;
  function runTicks(dt) { tickFns.forEach((f) => { try { f(dt); } catch (e) { if (!f.__warned) { f.__warned = true; console.error('[MM.ui] tick failed', e); } } }); }
  function ensureDriver() {
    if (tickDriver) return;
    if (MM.loop && typeof MM.loop.onTick === 'function') { tickDriver = 'loop'; MM.loop.onTick((dt) => runTicks(dt || 0)); return; }
    tickDriver = 'raf'; // FALLBACK: only when MM.loop is absent
    const f = (ts) => { const dt = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 0; lastTs = ts; runTicks(dt); requestAnimationFrame(f); };
    requestAnimationFrame(f);
  }
  ui.tick = function (fn) { tickFns.add(fn); ensureDriver(); return () => tickFns.delete(fn); };
  ui.tickDriver = () => tickDriver;

  // ------------------------------------------------------------------ baseline access (bare global names; guarded)
  // Baseline `let/const` bindings (world, game, SPELLS, spellIndex …) are reachable by bare name from classic scripts.
  ui.base = {
    world: () => safe(() => (MM.game && MM.game.world && MM.game.world()) || world, null), // eslint-disable-line no-undef
    player: () => safe(() => (MM.game && MM.game.player && MM.game.player()) || game, null), // eslint-disable-line no-undef
    spells: () => safe(() => SPELLS, []), // eslint-disable-line no-undef
    spellIndex: () => safe(() => spellIndex, 0), // eslint-disable-line no-undef
    castCooldown: () => safe(() => castCooldown, 0), // eslint-disable-line no-undef
    message: () => safe(() => (combatMessageTime > 0 ? combatMessage : ''), ''), // eslint-disable-line no-undef
    regions: () => safe(() => REGIONS, {}), // eslint-disable-line no-undef
    seeds: () => safe(() => SEED_TYPES, {}), // eslint-disable-line no-undef
    enemies: () => safe(() => enemies, []), // eslint-disable-line no-undef
    touch: () => safe(() => touchDirections, null), // eslint-disable-line no-undef
    keys: () => safe(() => keys, null), // eslint-disable-line no-undef
    has: (fn) => typeof window[fn] === 'function',
    call(fn, ...args) { if (typeof window[fn] !== 'function') return undefined; try { return window[fn](...args); } catch (e) { console.error('[MM.ui] baseline ' + fn + ' failed', e); return undefined; } },
  };

  // Campaign accessor helper: call MM.campaign[fn](...) if present, else undefined.
  ui.camp = function (fn, ...args) {
    const c = MM.campaign;
    if (!c || typeof c[fn] !== 'function') return undefined;
    try { return c[fn](...args); } catch (e) { console.error('[MM.ui] campaign.' + fn + ' failed', e); return undefined; }
  };
  ui.hasCamp = (fn) => !!(MM.campaign && typeof MM.campaign[fn] === 'function');

  ui.sfx = (id, o) => safe(() => MM.audio && MM.audio.sfx && MM.audio.sfx(id, o));

  // ------------------------------------------------------------------ icons (inline SVG, stroke = currentColor)
  const P = {
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
    moon: '<path d="M15.5 3.5a8.5 8.5 0 1 0 5 13.6A7 7 0 0 1 15.5 3.5z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
    cloud: '<path d="M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.3 1.6A3.3 3.3 0 0 0 7 18z"/>',
    rain: '<path d="M7 15h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.3 1.6A3.3 3.3 0 0 0 7 15z"/><path d="M8 18l-1 2.5M12 18l-1 2.5M16 18l-1 2.5"/>',
    wind: '<path d="M3 9h11a3 3 0 1 0-3-3M3 15h14a3 3 0 1 1-3 3M3 12h8"/>',
    coin: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5v9M9.5 9.5c0-1 1-1.6 2.5-1.6s2.5.6 2.5 1.6-1 1.5-2.5 1.9-2.5 1-2.5 2 1 1.6 2.5 1.6 2.5-.6 2.5-1.6"/>',
    star: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.6 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
    sparkle: '<path d="M12 2.5l1.8 7.7 7.7 1.8-7.7 1.8-1.8 7.7-1.8-7.7L2.5 12l7.7-1.8z"/>',
    potion: '<path d="M9.5 3h5M10.5 3v5.2L5.8 16a3.5 3.5 0 0 0 3 5.3h6.4a3.5 3.5 0 0 0 3-5.3l-4.7-7.8V3"/><path d="M7.4 14h9.2"/>',
    bomb: '<circle cx="11" cy="14" r="6.5"/><path d="M15.5 9.5l2-2M17.5 7.5c.6-1.8 2.2-2.4 3.5-1.6"/><path d="M8.5 12a3 3 0 0 1 2-2"/>',
    rune: '<path d="M7 3.5h10l2.5 8.5-2.5 8.5H7L4.5 12z"/><path d="M12 7v10M9.5 9.5l5 5"/>',
    seed: '<path d="M12 4c4 4 5.3 8 3.6 11.4a4 4 0 0 1-7.2 0C6.7 12 8 8 12 4z"/><path d="M12 9v7"/>',
    wheat: '<path d="M12 21V8"/><path d="M12 9c-2-1-3-3-3-5 2 0 3 2 3 5zM12 9c2-1 3-3 3-5-2 0-3 2-3 5zM12 14c-2-1-3.5-3-3.5-5 2 .5 3.5 2 3.5 5zM12 14c2-1 3.5-3 3.5-5-2 .5-3.5 2-3.5 5z"/>',
    pepper: '<path d="M9 8.5c-2.5 4-1.5 10 4.5 11.8 2.8.9 5.6-.8 4.8-2.8-3 0-5.3-3-6.3-7"/><path d="M9 8.5c1.2-.9 2.6-.8 3.5 1.9M11 8c.2-2 1.4-3.6 3.2-4.3"/>',
    berry: '<circle cx="8.5" cy="14.5" r="3.5"/><circle cx="15.5" cy="14.5" r="3.5"/><circle cx="12" cy="9" r="3.5"/><path d="M12 5.5c0-1.5 1-2.5 2.5-2.5"/>',
    flower: '<circle cx="12" cy="12" r="2.2"/><path d="M12 9.8C10 6 10.5 3.5 12 3.5s2 2.5 0 6.3zM12 14.2c-2 3.8-1.5 6.3 0 6.3s2-2.5 0-6.3zM9.8 12C6 10 3.5 10.5 3.5 12s2.5 2 6.3 0zM14.2 12c3.8-2 6.3-1.5 6.3 0s-2.5 2-6.3 0z"/>',
    mushroom: '<path d="M4 12.5a8 7.5 0 0 1 16 0z"/><path d="M10 12.5v6a2 2 0 0 0 4 0v-6"/><circle cx="9" cy="9" r=".8"/><circle cx="14.5" cy="8" r=".8"/>',
    herb: '<path d="M5 19C5 10 11 5 19 5c0 8-5 14-14 14z"/><path d="M5 19l8-8"/>',
    wand: '<path d="M4.5 19.5L15 9"/><path d="M17.5 2.5v3M16 4h3M20 8.5l1.5.5M19.5 11l1 1"/><path d="M14 8l2 2"/>',
    robe: '<path d="M9 3.5h6l2.2 4.3-1.2 2 2 10.7H6l2-10.7-1.2-2z"/><path d="M12 7v13"/>',
    ring: '<circle cx="12" cy="14.5" r="5.5"/><path d="M10 6.5l2-3 2 3-2 2.2z"/>',
    charm: '<path d="M12 2.5v4"/><circle cx="12" cy="13.5" r="6.5"/><path d="M14.2 9.6a4.2 4.2 0 1 0 0 7.8 3.4 3.4 0 0 1 0-7.8z"/>',
    book: '<path d="M4 5c3-1 6-1 8 1 2-2 5-2 8-1v14c-3-1-6-1-8 1-2-2-5-2-8-1z"/><path d="M12 6v14"/>',
    scroll: '<path d="M7 4h11v13a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3h11"/><path d="M7 4a2 2 0 0 0-2 2v11"/><path d="M9 8h6M9 12h6"/>',
    map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
    cauldron: '<path d="M5 10h14v2.5a7 7 0 0 1-14 0z"/><path d="M3.5 10h17"/><path d="M8 20.5l1-1.6M16 20.5l-1-1.6"/><path d="M10 6.5c0-1 1-1.5 1-2.5M14 7c0-1 1-1.5 1-2.5"/>',
    bag: '<path d="M6 9h12l-1 11.5H7z"/><path d="M9 9V7a3 3 0 0 1 6 0v2"/>',
    shield: '<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/>',
    sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    gamepad: '<path d="M7 8.5h10a4 4 0 0 1 4 4l-1 3.5a2.5 2.5 0 0 1-4.3.8L14 15h-4l-1.7 1.8A2.5 2.5 0 0 1 4 16l-1-3.5a4 4 0 0 1 4-4z"/><path d="M8 10.5v3.5M6.25 12.25h3.5"/><path d="M15.5 11.5h.01M17.5 13.5h.01"/>',
    bookmark: '<path d="M6 3.5h12v17l-6-4-6 4z"/>',
    home: '<path d="M4 11l8-7 8 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>',
    play: '<path d="M8 5v14l11-7z"/>',
    pause: '<path d="M8.5 5v14M15.5 5v14"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    lock: '<rect x="5" y="11" width="14" height="9.5" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    check: '<path d="M5 12.5l4.2 4.2L19 7"/>',
    left: '<path d="M15 5l-7 7 7 7"/>',
    right: '<path d="M9 5l7 7-7 7"/>',
    broom: '<path d="M20.5 3.5L10.5 13.5"/><path d="M10.5 13.5c-3 0-5.3 1.4-6.5 7 5.6-1.2 7-3.5 6.5-7z"/><path d="M6.5 17.5l-1.5 2"/>',
    hand: '<path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12"/><path d="M11 11V4.5a1.5 1.5 0 0 1 3 0V11"/><path d="M14 11V6a1.5 1.5 0 0 1 3 0v7c0 4-2.5 7.5-6 7.5-2.4 0-3.6-1-5-3l-2.4-3.8a1.5 1.5 0 0 1 2.4-1.8L8 13"/>',
    crown: '<path d="M4 18h16l-1-9.5-4.2 4L12 6.5l-2.8 6L5 8.5z"/><path d="M4.5 21h15"/>',
    sword: '<path d="M14.5 3.5h6v6L9.5 20.5l-2-2-2-2z"/><path d="M4 14.5l5.5 5.5M3.5 20.5l2-2"/>',
    film: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9l5 3-5 3z"/>',
    quill: '<path d="M20 4C12 4 6.5 9.5 5 19.5l2-2c2-6.5 6-9.5 10.5-10.5"/><path d="M4 20.5h7"/>',
    sprout: '<path d="M12 21v-8"/><path d="M12 13c-5 0-7-3-7-7 4 0 7 2 7 7zM12 13c0-4 2-7 7-7 0 4-2 7-7 7z"/>',
    exit: '<path d="M14 4H6v16h8"/><path d="M10 12h10.5M17.5 9l3 3-3 3"/>',
    signpost: '<path d="M12 3v18"/><path d="M5 5.5h11l2.2 2.2L16 10H5zM19 12.5H8l-2.2 2.2L8 17h11z"/>',
    shop: '<path d="M4 9l2-5h12l2 5"/><path d="M4 9c0 2.2 4 2.2 4 0 0 2.2 4 2.2 4 0 0 2.2 4 2.2 4 0 0 2.2 4 2.2 4 0"/><path d="M5 11v9h14v-9"/><path d="M10 20v-4h4v4"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
    retry: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 3.5v5h-5"/>',
    sort: '<path d="M7 4v16M4 17l3 3 3-3M17 20V4M14 7l3-3 3 3"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    speaker: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/>',
    access: '<circle cx="12" cy="4.5" r="1.8"/><path d="M5 8.5l7 1.5 7-1.5M12 10v4.5l-3 6M12 14.5l3 6"/>',
    warn: '<path d="M12 3.5L2.5 20h19z"/><path d="M12 10v4.5M12 17.2v.1"/>',
    hourglass: '<path d="M6.5 3h11M6.5 21h11M8 3c0 5.5 8 5.5 8 9s-8 3.5-8 9M16 3c0 5.5-8 5.5-8 9s8 3.5 8 9"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.1"/>',
    flag: '<path d="M5 21V4M5 4.5h12l-2.5 4 2.5 4H5"/>',
    pin: '<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
    touch: '<rect x="7" y="2.5" width="10" height="19" rx="2.2"/><path d="M11 18.5h2"/>',
    keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M9 10h.01M12 10h.01M15 10h.01M18 10h.01M7.5 14h9"/>',
    // signature spells
    moonbolt: '<path d="M14.5 4.5a7.5 7.5 0 1 0 4.8 12.4 6.2 6.2 0 0 1-4.8-12.4z"/><path d="M2.5 8h4M2 12h3M2.5 16h4"/>',
    emberbloom: '<path d="M12 21c-4 0-6.5-3-6.5-6.2 0-4 4-5.3 3-10.3 3 2 4.2 4.2 4.2 6.3 1-.9 1.4-2.1 1.4-3.3 2.4 2.1 4.4 4.7 4.4 7.3 0 3.2-2.5 6.2-6.5 6.2z"/><path d="M12 21c-1.7 0-2.8-1.3-2.8-2.8 0-1.8 1.8-2.6 2.8-4.4 1 1.8 2.8 2.6 2.8 4.4 0 1.5-1.1 2.8-2.8 2.8z"/>',
    thornbind: '<path d="M3.5 20.5c4-1 5-5.5 8-8.5s6-3.5 9-8.5"/><path d="M7.5 16.5l-2.5-1M10.5 12.5l.5-3M13.5 10.5l3 .8M17 7l-.5-3"/><path d="M5.5 21c1-2.5 3-3 4.5-2.5"/>',
    frostbell: '<path d="M6 16.5h12l-1.5-2.2V11a4.5 4.5 0 0 0-9 0v3.3z"/><path d="M10.5 19a1.5 1.5 0 0 0 3 0"/><path d="M12 2.5v4M10.3 3.5l3.4 2M13.7 3.5l-3.4 2"/>',
    starfall: '<path d="M15 9l1.5 3.3 3.5.4-2.6 2.4.7 3.5-3.1-1.7-3.1 1.7.7-3.5-2.6-2.4 3.5-.4z"/><path d="M3.5 3.5l6 6M7 2.5l4.5 4.5M2.5 7L7 11.5"/>',
  };
  ui.ICONS = P;
  ui.icon = function (name, opts) {
    const s = h('span', { class: 'mm-ic ' + ((opts && opts.cls) || ''), 'aria-hidden': 'true' });
    s.innerHTML = '<svg viewBox="0 0 24 24" focusable="false" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + (P[name] || P.sparkle) + '</svg>';
    return s;
  };

  // Map item / spell ids to an icon name (used when MM.art has no sprite for the id).
  const ICON_RULES = [
    [/potion|tonic|elixir|draught/, 'potion'], [/bomb/, 'bomb'], [/rune/, 'rune'], [/seed/, 'seed'],
    [/wheat|grain/, 'wheat'], [/ember|pepper/, 'pepper'], [/frost.?berry|^frost$|berry/, 'berry'], [/moon.?flower|^moon$|flower|petal/, 'flower'],
    [/glowcap|mushroom|cap$/, 'mushroom'], [/starmint|mint|herb|leaf/, 'herb'], [/gold|coin/, 'coin'], [/wand|staff/, 'wand'],
    [/robe|cloak|hat|dress/, 'robe'], [/ring/, 'ring'], [/charm|amulet|pendant|keepsake/, 'charm'], [/fragment|shard|lunar/, 'moon'],
    [/broom/, 'broom'], [/book|tome|recipe/, 'book'], [/letter|note|scroll/, 'scroll'],
    [/moonbolt|moonbeam/, 'moonbolt'], [/emberbloom|ember_bloom|fireball|bloom/, 'emberbloom'], [/thorn|vine/, 'thornbind'], [/frostbell|bell|blizzard/, 'frostbell'], [/starfall|meteor|star/, 'starfall'],
  ];
  ui.iconFor = function (id, kind) {
    const k = String(id || '').toLowerCase();
    for (const [re, name] of ICON_RULES) if (re.test(k)) return name;
    if (kind && P[kind]) return kind;
    return { gear: 'wand', equipment: 'shield', crop: 'wheat', harvest: 'wheat', consumable: 'potion', key: 'sparkle', quest: 'scroll' }[kind] || 'sparkle';
  };
  // Crop art from MM.art (crop_<id>_ripe / _seed) for baseline crop ids.
  const CROP_ART = { wheat: 'wheat', ember: 'ember_pepper', ember_pepper: 'ember_pepper', frost: 'frost_berry', frost_berry: 'frost_berry', moon: 'moonflower', moonflower: 'moonflower', glowcap: 'glowcap', starmint: 'starmint' };
  // Item icon: MM.art sprite (if the icon/id names one) drawn into a crisp canvas, else SVG glyph.
  ui.itemIcon = function (item, size) {
    size = size || 32;
    const art = MM.art;
    const id = String((item && (item.icon || item.id)) || '');
    let sprite = null;
    if (art && art.has) {
      const raw = String(item && item.id || '').replace(/^(seed|seeds|harvest|crop)[_:-]/, '');
      const crop = CROP_ART[raw];
      const isSeed = /seed/.test(String(item && (item.id || '')) + ' ' + String(item && item.kind || ''));
      const cands = [item && item.icon, item && item.art, crop && ('crop_' + crop + (isSeed ? '_seed' : '_ripe'))];
      for (const c of cands) if (c && safe(() => art.has(c), false)) { sprite = c; break; }
    }
    if (sprite) {
      const f = art.get(sprite);
      const cv = h('canvas', { class: 'mm-item-art', width: size, height: size, 'aria-hidden': 'true' });
      const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
      let sc = Math.min((size - 4) / f.w, (size - 4) / f.h);
      if (sc >= 1) sc = Math.floor(sc);
      safe(() => art.draw(c, sprite, size / 2, Math.round(size / 2 + (f.h * sc) / 2), { scale: sc, frame: 0 }));
      return cv;
    }
    if (id && /^\p{Extended_Pictographic}/u.test(id)) return h('span', { class: 'mm-ic mm-ic-emoji', 'aria-hidden': 'true' }, id);
    return ui.icon(P[id] ? id : ui.iconFor(item && item.id || id, item && item.kind));
  };

  // ------------------------------------------------------------------ data adapters (campaign first, baseline fallback)
  const D = ui.data = {};
  D.playerName = () => safe(() => MM.game.name, null) || safe(() => MM.campaign.state.playerName, null) || 'Witch';
  D.vitals = function () {
    const w = ui.base.world();
    if (!w) return null;
    const maxHp = safe(() => (MM.campaign && MM.campaign.maxHP ? MM.campaign.maxHP() : heroMaxHP()), 100); // eslint-disable-line no-undef
    const maxMana = safe(() => (MM.campaign && MM.campaign.maxMana ? MM.campaign.maxMana() : 100), 100);
    return {
      hp: Math.max(0, w.hp || 0), maxHp: maxHp || 100, mana: Math.max(0, w.mana || 0), maxMana: maxMana || 100,
      gold: Math.floor(w.gold || 0), level: w.level || 1, xp: w.xp || 0, xpNext: (w.level || 1) * 45,
      potions: w.potions || 0, ward: w.ward || 0,
    };
  };
  D.time = function () {
    const w = ui.base.world();
    if (!w) return null;
    const t = (w.time || 0) % 1, mins = Math.floor(t * 24 * 60);
    const hh = Math.floor(mins / 60), mm = mins % 60;
    const night = safe(() => isNight(), t >= 0.68 || t < 0.1); // eslint-disable-line no-undef
    return { day: w.day || 1, hh, mm, label: String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0'), season: safe(() => season(), 'Spring'), weather: w.weather || 'Clear', night, // eslint-disable-line no-undef
      phase: t < 0.1 ? 'Night' : t < 0.25 ? 'Dawn' : t < 0.6 ? 'Day' : t < 0.68 ? 'Dusk' : 'Night' };
  };
  D.regionName = function (id) {
    const list = safe(() => ui.camp('regions'), null);
    const r = Array.isArray(list) && list.find((x) => x && x.id === id);
    if (r && r.name) return r.name;
    const R = ui.base.regions();
    if (R[id]) return R[id].name;
    return id === 'village' ? 'Moonflower Village' : String(id || '');
  };
  D.region = function () {
    const w = ui.base.world();
    if (!w) return null;
    let sub = w.mode === 'dungeon' ? 'Dungeon · Floor ' + w.floor : w.mode === 'rift' ? 'Rift · Floor ' + w.floor + (w.modifier ? ' · ' + w.modifier : '') : '';
    return { id: w.region, mode: w.mode, floor: w.floor, name: D.regionName(w.region), sub, key: w.region + '|' + w.mode + '|' + w.floor };
  };
  // Signature spells. FALLBACK (no MM.campaign.spells): first five baseline SPELLS, which keys 1–5 select.
  D.spells = function () {
    const list = ui.camp('spells');
    const SP = ui.base.spells(), cur = SP[ui.base.spellIndex()];
    if (Array.isArray(list) && list.length) {
      return list.map((s, i) => Object.assign({ key: String(i + 1) }, s, { selected: s.selected != null ? !!s.selected : !!(cur && cur.id === s.id) }));
    }
    return SP.slice(0, 5).map((s, i) => ({
      id: s.id, name: s.name, desc: s.description, school: s.school, color: s.color, key: String(i + 1), unlocked: true,
      cost: s.summon ? 18 : (s.blessing || s.rewind || s.cloak) ? 15 : Math.min(17, 6 + Math.floor(s.damage / 16)), cooldown: 0.32, selected: cur === s, fallback: true,
    }));
  };
  // Cooldown fraction 0..1 remaining for a spell entry.
  D.cooldown = function (s) {
    if (!s) return 0;
    const v = ui.camp('spellCooldown', s.id);
    if (v && typeof v === 'object' && v.total > 0) return clamp(v.left / v.total, 0, 1);
    if (typeof v === 'number') return clamp(v, 0, 1);
    if (typeof s.cooldownLeft === 'number' && s.cooldown > 0) return clamp(s.cooldownLeft / s.cooldown, 0, 1);
    if (s.selected) return clamp(ui.base.castCooldown() / 0.32, 0, 1);
    return 0;
  };
  D.selectSpell = function (s) {
    if (!s || s.unlocked === false) return false;
    if (ui.hasCamp('selectSpell')) { ui.camp('selectSpell', s.id); return true; }
    const i = ui.base.spells().findIndex((x) => x.id === s.id);
    if (i >= 0) ui.base.call('chooseSpell', i);
    return i >= 0;
  };
  D.objective = function () {
    const o = ui.camp('objective');
    if (o && o.title) return o;
    const w = ui.base.world();
    if (!w) return null;
    // FALLBACK objective derived from the baseline farm (until MM.campaign lands).
    const ready = (w.plots || []).filter((p) => p.seed && p.growth >= 100).length;
    const empty = (w.plots || []).filter((p) => !p.seed).length;
    if (ready) return { title: 'Harvest your crops', hint: ready + ' plot' + (ready > 1 ? 's are' : ' is') + ' ready — press E nearby.' };
    if (empty) return { title: 'Tend the garden', hint: 'Plant seeds in the empty plots (E).' };
    return { title: 'Explore Moonflower Grove', hint: 'Crops grow while watered. Practice spells on the dummy.' };
  };
  D.memories = function () {
    const m = ui.camp('memories');
    if (Array.isArray(m)) return m;
    const st = safe(() => MM.campaign.state.memories, null);
    if (Array.isArray(st)) return st;
    return safe(() => JSON.parse(localStorage.getItem('moss-moon-memories') || '[]'), []) || [];
  };
  D.cineList = function () {
    const man = MM.CINE_MANIFEST || {};
    return Object.values(man).filter((c) => c && c.replay && c.replay.allowed !== false && c.replay.unlockMemory !== false);
  };

  // ------------------------------------------------------------------ root & layers
  let root = null;
  ui.root = function () {
    if (root && root.isConnected) return root;
    root = document.getElementById('mm-ui');
    if (!root) {
      // FALLBACK: page without CORE's shell — create the overlay next to the canvas.
      root = h('div', { id: 'mm-ui' });
      const stage = document.getElementById('mm-stage') || (document.getElementById('scene') && document.getElementById('scene').parentElement) || document.body;
      stage.appendChild(root);
      root.classList.add('mm-ui-fallback');
    }
    root.classList.add('mm-root');
    if (!root.querySelector(':scope > .mm-layer-screens')) {
      ui.layers = {
        sky: h('div', { class: 'mm-layer mm-layer-sky', 'aria-hidden': 'true' }),
        hud: h('div', { class: 'mm-layer mm-layer-hud', role: 'region', 'aria-label': 'Game status' }),
        touch: h('div', { class: 'mm-layer mm-layer-touch', 'aria-hidden': 'true' }),
        screens: h('div', { class: 'mm-layer mm-layer-screens' }),
        loading: h('div', { class: 'mm-layer mm-layer-loading', 'aria-live': 'polite' }),
        toasts: h('div', { class: 'mm-layer mm-layer-toasts', role: 'status', 'aria-live': 'polite' }),
      };
      Object.values(ui.layers).forEach((l) => root.appendChild(l));
    }
    return root;
  };

  // ------------------------------------------------------------------ focus helpers
  const FOCUSABLE = 'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  ui.focusables = function (scope) {
    scope = scope || (ui.top() && ui.top().el) || ui.root();
    return Array.from(scope.querySelectorAll(FOCUSABLE)).filter((el) => {
      if (el.closest('[inert],[hidden],.mm-hidden')) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
    });
  };
  ui.focusFirst = function (scope) {
    scope = scope || (ui.top() && ui.top().el);
    if (!scope) return null;
    const pref = scope.querySelector('[data-autofocus]:not([disabled])');
    const el = pref && ui.focusables(scope).includes(pref) ? pref : ui.focusables(scope)[0];
    if (el) { try { el.focus({ preventScroll: false }); } catch (e) { el.focus(); } }
    return el || null;
  };

  // ------------------------------------------------------------------ screen stack
  ui.registerScreen = function (id, factory) { ui.screens[id] = factory; return ui; };
  ui.top = () => ui.stack[ui.stack.length - 1] || null;
  ui.isOpen = (id) => (id ? ui.stack.some((s) => s.id === id) : ui.stack.some((s) => !s.passive));
  ui.get = (id) => ui.stack.find((s) => s.id === id) || null;

  function mount(inst) {
    const el = inst.el;
    el.classList.add('mm-screen');
    el.dataset.screen = inst.id;
    if (!el.hasAttribute('role')) el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    if (inst.label) el.setAttribute('aria-label', inst.label);
    ui.layers.screens.appendChild(el);
  }
  function relayer() {
    const top = ui.top();
    ui.stack.forEach((s, i) => {
      const isTop = s === top;
      s.el.toggleAttribute('inert', !isTop);
      // Lower screens stay visible only under overlays (confirm dialogs).
      const showUnder = top && top.overlay && i === ui.stack.length - 2;
      s.el.classList.toggle('mm-under', !isTop && !showUnder);
    });
    ui.root().classList.toggle('mm-has-screen', ui.stack.length > 0);
  }
  let syncing = false;
  ui.syncState = function () {
    if (syncing) return;
    syncing = true;
    try {
      const cur = ui.state().current;
      if (['cine', 'loading'].includes(cur)) return;
      let want = null;
      for (let i = ui.stack.length - 1; i >= 0; i--) if (ui.stack[i].state) { want = ui.stack[i].state; break; }
      if (!want && ui.stack.length && !ui.stack.every((s) => s.passive)) want = 'menu';
      if (want === 'keep') return;
      if (want && want !== cur) ui.go(want);
      else if (!want && ['menu', 'dialogue'].includes(cur)) ui.go(ui.lastGameState || 'play');
    } finally { syncing = false; }
  };

  ui.open = function (id, args) {
    ui.root();
    const factory = ui.screens[id];
    if (!factory) { console.warn('[MM.ui] unknown screen', id); return null; }
    const existing = ui.get(id);
    if (existing && !(args && args.allowDuplicate)) {
      // bring to top
      while (ui.top() && ui.top() !== existing) ui.close(undefined, { silent: true });
      if (existing.refresh) existing.refresh(args);
      return existing;
    }
    let inst;
    try { inst = factory(args || {}) || {}; } catch (e) { console.error('[MM.ui] screen build failed', id, e); return null; }
    inst.id = id; inst.args = args || {};
    if (!inst.el) inst.el = h('div');
    inst.returnFocus = document.activeElement;
    mount(inst);
    ui.stack.push(inst);
    relayer();
    if (!inst.quiet) ui.sfx(inst.overlay ? 'ui_open' : 'ui_open');
    try { inst.onOpen && inst.onOpen(); } catch (e) { console.error(e); }
    ui.syncState();
    setTimeout(() => { if (ui.top() === inst && !inst.el.contains(document.activeElement)) ui.focusFirst(inst.el); }, 0);
    ui.emit('ui:open', { id });
    return inst;
  };
  ui.replace = function (id, args) {
    const top = ui.top();
    if (top && top.id === id) { if (top.refresh) top.refresh(args); return top; }
    const rf = top && top.returnFocus;
    if (top) ui.close(undefined, { silent: true, noSync: true, keepFocus: true });
    const inst = ui.open(id, args);
    if (inst && rf) inst.returnFocus = rf;
    return inst;
  };
  ui.close = function (id, opts) {
    opts = opts || {};
    let idx = id ? ui.stack.findIndex((s) => s.id === id) : ui.stack.length - 1;
    if (idx < 0) return false;
    const removed = ui.stack.splice(idx);
    removed.reverse().forEach((inst) => {
      try { inst.onClose && inst.onClose(); } catch (e) { console.error(e); }
      inst.el.remove();
      ui.emit('ui:close', { id: inst.id });
    });
    relayer();
    if (!opts.silent) ui.sfx('ui_back');
    if (!opts.noSync) ui.syncState();
    if (!opts.keepFocus) {
      const top = ui.top(), rf = removed[removed.length - 1] && removed[removed.length - 1].returnFocus;
      if (top) {
        if (rf && top.el.contains(rf) && rf.isConnected) rf.focus(); else ui.focusFirst(top.el);
        if (top.refresh) safe(() => top.refresh());
      } else if (document.activeElement && root && root.contains(document.activeElement)) {
        document.activeElement.blur();
        const cv = document.getElementById('scene'); if (cv && cv.focus && ui.inGameplay()) cv.focus({ preventScroll: true });
      }
    }
    return true;
  };
  ui.closeAll = function (opts) {
    if (!ui.stack.length) return;
    ui.close(ui.stack[0].id, Object.assign({ silent: true }, opts || {}));
  };
  ui.back = function () {
    const top = ui.top();
    if (!top) return false;
    if (top.back && top.back() === true) return true;
    if (top.noEscape) return true;
    ui.close();
    return true;
  };

  // ------------------------------------------------------------------ panel template (gold-filigree frame)
  ui.panel = function (opts) {
    opts = opts || {};
    const head = h('header', { class: 'mm-panel-head' },
      opts.icon ? ui.icon(opts.icon, { cls: 'mm-panel-icon' }) : null,
      h('div', { class: 'mm-panel-titles' }, h('h2', { class: 'mm-panel-title', id: opts.titleId || null }, opts.title || ''), opts.subtitle ? h('p', { class: 'mm-panel-sub' }, opts.subtitle) : null),
      opts.close === false ? null : ui.button('', () => (opts.onClose ? opts.onClose() : ui.back()), { cls: 'mm-btn-icon mm-close', icon: 'close', aria: 'Close', silent: true }));
    const body = h('div', { class: 'mm-panel-body' });
    const foot = opts.foot ? h('footer', { class: 'mm-panel-foot' }) : null;
    const panel = h('section', { class: 'mm-panel mm-frame ' + (opts.cls || '') }, h('i', { class: 'mm-corner mm-c1' }), h('i', { class: 'mm-corner mm-c2' }), h('i', { class: 'mm-corner mm-c3' }), h('i', { class: 'mm-corner mm-c4' }), head, body, foot);
    const el = h('div', { class: 'mm-scrim ' + (opts.scrimCls || '') }, panel);
    return { el, panel, head, body, foot };
  };
  ui.empty = (icon, title, text) => h('div', { class: 'mm-empty' }, ui.icon(icon || 'sparkle'), h('strong', null, title), text ? h('p', null, text) : null);

  // Segmented control (radio-group semantics). options: [[value,label],…]
  ui.segmented = function (label, options, value, onChange, opts) {
    opts = opts || {};
    const group = h('div', { class: 'mm-seg', role: 'radiogroup', 'aria-label': label });
    const btns = options.map(([v, l]) => {
      const b = h('button', { type: 'button', class: 'mm-seg-btn', role: 'radio', 'aria-checked': String(v === value), 'data-value': String(v) }, l);
      b.addEventListener('click', () => {
        if (b.getAttribute('aria-checked') === 'true') return;
        btns.forEach((x) => x.setAttribute('aria-checked', String(x === b)));
        ui.sfx('ui_move');
        onChange(v);
      });
      return b;
    });
    btns.forEach((b) => group.appendChild(b));
    group.setValue = (v) => btns.forEach((x) => x.setAttribute('aria-checked', String(x.dataset.value === String(v))));
    return group;
  };
  ui.toggle = function (label, value, onChange) {
    const b = h('button', { type: 'button', class: 'mm-toggle', role: 'switch', 'aria-checked': String(!!value), 'aria-label': label }, h('span', { class: 'mm-toggle-knob' }), h('span', { class: 'mm-toggle-text' }, value ? 'On' : 'Off'));
    b.addEventListener('click', () => {
      const v = b.getAttribute('aria-checked') !== 'true';
      b.setAttribute('aria-checked', String(v)); b.lastChild.textContent = v ? 'On' : 'Off';
      ui.sfx('ui_move'); onChange(v);
    });
    b.setValue = (v) => { b.setAttribute('aria-checked', String(!!v)); b.lastChild.textContent = v ? 'On' : 'Off'; };
    return b;
  };

  // ------------------------------------------------------------------ toasts
  ui.toast = function (text, kind, opts) {
    if (!text) return null;
    ui.root();
    opts = opts || {};
    const nowT = Date.now();
    if (ui._lastToast && ui._lastToast.text === String(text) && nowT - ui._lastToast.t < 600) return null; // bus 'toast' + direct call dedupe
    ui._lastToast = { text: String(text), t: nowT };
    kind = kind || 'info';
    const iconName = opts.icon || { good: 'check', warn: 'warn', quest: 'scroll', item: 'bag', save: 'bookmark', level: 'star', story: 'moon', info: 'sparkle' }[kind] || 'sparkle';
    const t = h('div', { class: 'mm-toast mm-toast-' + kind }, ui.icon(iconName), h('span', null, String(text)));
    const L = ui.layers.toasts;
    L.appendChild(t);
    while (L.children.length > 4) L.firstChild.remove();
    const ms = opts.ms || clamp(2400 + String(text).length * 40, 2600, 6000);
    setTimeout(() => { t.classList.add('mm-out'); setTimeout(() => t.remove(), 400); }, ms);
    return t;
  };

  // ------------------------------------------------------------------ confirm / alert (overlay screens)
  ui.registerScreen('confirm', (a) => {
    const p = ui.panel({ title: a.title || 'Are you sure?', icon: a.icon || (a.danger ? 'warn' : 'info'), cls: 'mm-panel-confirm', close: false, foot: true });
    if (a.body) p.body.appendChild(h('p', { class: 'mm-confirm-body' }, a.body));
    let result = false;
    const inst = { el: p.el, overlay: true, label: a.title || 'Confirm', back() { result = false; ui.close(); return true; } };
    const noB = a.no === null ? null : ui.button(a.no || 'Cancel', () => { result = false; ui.close(); }, { cls: 'mm-btn-ghost', sound: 'ui_back', silent: true });
    const yesB = ui.button(a.yes || 'Confirm', () => { result = true; ui.close(undefined, { silent: true }); }, { cls: a.danger ? 'mm-btn-danger' : 'mm-btn-primary' });
    if (a.danger && noB) noB.dataset.autofocus = '1'; else yesB.dataset.autofocus = '1';
    if (noB) p.foot.appendChild(noB);
    p.foot.appendChild(yesB);
    inst.onClose = () => a.resolve && a.resolve(result);
    return inst;
  });
  ui.confirm = function (opts) {
    return new Promise((resolve) => { ui.open('confirm', Object.assign({}, opts || {}, { resolve, allowDuplicate: true })); });
  };
  ui.alert = function (opts) {
    return ui.confirm(Object.assign({ yes: 'OK', no: null }, opts || {})).then(() => undefined);
  };

  // ------------------------------------------------------------------ settings application (text scale, motion)
  ui.applySettings = function () {
    const r = ui.root();
    const ts = clamp(Number(ui.setting('textScale')) || 1, 0.8, 1.6);
    r.style.setProperty('--mm-ts', String(ts));
    const rm = !!ui.setting('reducedMotion') || safe(() => matchMedia('(prefers-reduced-motion: reduce)').matches, false);
    r.classList.toggle('mm-reduced-motion', rm);
    ui.reducedMotion = rm;
  };

  // ------------------------------------------------------------------ init plumbing
  ui.onReady = function (fn) { if (ui.ready) { try { fn(ui); } catch (e) { console.error(e); } } else ui._readyFns.push(fn); };
  ui._markReady = function () {
    ui.ready = true;
    const fns = ui._readyFns.splice(0);
    fns.forEach((f) => { try { f(ui); } catch (e) { console.error('[MM.ui] ready callback failed', e); } });
    ui.emit('ui:ready', {});
  };
})();
