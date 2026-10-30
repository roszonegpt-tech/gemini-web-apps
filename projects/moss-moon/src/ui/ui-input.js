/* Moss & Moon — UI input (owner: UI agent): keyboard navigation (spatial arrows/WASD, Enter/Space, Esc, Tab trap),
 * gameplay hotkeys (Esc/P pause, I/K/J/M), gamepad (menus + play), on-screen touch controls that drive the baseline
 * through `touchDirections` (movement) and synthetic key events (actions). Loads last; runs MM.ui init. */
(function () {
  'use strict';
  const MM = window.MM, ui = MM && MM.ui;
  if (!ui || ui.input) return;
  const { h, safe } = ui;
  const input = ui.input = {};

  // ---------------------------------------------------------------- gameplay actions (touch buttons, gamepad, HUD clicks)
  // Prefer CORE's MM.input.action (no fake key events → MM.input.method stays correct); synthetic keys only as FALLBACK.
  input.press = function (key) {
    const opts = { key, code: key === ' ' ? 'Space' : 'Key' + key.toUpperCase(), bubbles: true, cancelable: true };
    window.dispatchEvent(new KeyboardEvent('keydown', opts));
    setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', opts)), 40);
  };
  input.cycleSpell = function (dir) {
    const all = ui.data.spells(), open = all.filter((s) => s.unlocked !== false);
    if (!open.length) return;
    const i = Math.max(0, open.findIndex((s) => s.selected));
    const next = open[(i + (dir || 1) + open.length) % open.length];
    ui.data.selectSpell(next);
    ui.sfx('ui_move');
  };
  const CORE_ACT = { cast: 'cast', broom: 'broom', potion: 'potion' };
  const KEY_ACT = { cast: ' ', interact: 'e', broom: 'b', potion: 'h' };
  input.action = function (name) {
    if (!ui.inGameplay() || ui.isOpen()) return false;
    if (name === 'pause') { ui.openPause(); return true; }
    if (name === 'spellNext' || name === 'spellPrev') { input.cycleSpell(name === 'spellNext' ? 1 : -1); return true; }
    if (name === 'interact') {
      if (MM.world && typeof MM.world.interact === 'function') { const r = safe(() => MM.world.interact(), false); if (r) return true; }
      if (MM.input && typeof MM.input.action === 'function' && (MM.input.actions || []).includes('tend')) return safe(() => MM.input.action('tend'), false) !== false;
      input.press('e'); return true;
    }
    if (CORE_ACT[name] && MM.input && typeof MM.input.action === 'function' && (MM.input.actions || []).includes(CORE_ACT[name])) return safe(() => MM.input.action(CORE_ACT[name]), false) !== false;
    if (KEY_ACT[name]) { input.press(KEY_ACT[name]); return true; }
    return false;
  };

  // ---------------------------------------------------------------- spatial navigation
  const DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  input.navigate = function (dir, scope) {
    const top = ui.top(); scope = scope || (top && top.el);
    if (!scope) return false;
    const items = ui.focusables(scope);
    if (!items.length) return false;
    const cur = document.activeElement;
    if (!cur || !scope.contains(cur) || !items.includes(cur)) { ui.focusFirst(scope); return true; }
    const r = cur.getBoundingClientRect(), [dx, dy] = DIRV[dir];
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let best = null, bs = Infinity;
    for (const el of items) {
      if (el === cur) continue;
      const q = el.getBoundingClientRect();
      // edge-based gap in the travel direction; centres for the cross axis
      const gap = dx > 0 ? q.left - r.right : dx < 0 ? r.left - q.right : dy > 0 ? q.top - r.bottom : r.top - q.bottom;
      const qx = q.left + q.width / 2, qy = q.top + q.height / 2;
      const along = dx ? (qx - cx) * dx : (qy - cy) * dy;
      if (along <= 2 || gap < -Math.min(r.width, r.height, q.width, q.height) * 0.6) continue;
      const overlap = dx ? Math.max(0, Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top)) : Math.max(0, Math.min(r.right, q.right) - Math.max(r.left, q.left));
      const perp = dx ? Math.abs(qy - cy) : Math.abs(qx - cx);
      const score = Math.max(0, gap) + (overlap > 0 ? perp * 0.3 : perp * 2 + 40);
      if (score < bs) { bs = score; best = el; }
    }
    if (!best && dy) {
      // wrap vertically: farthest element on the other side, closest in x
      let far = null, fs = -Infinity;
      for (const el of items) { if (el === cur) continue; const q = el.getBoundingClientRect(); const s = -dy * (q.top + q.height / 2 - cy) * 1 - Math.abs(q.left + q.width / 2 - cx) * 2; if (s > fs) { fs = s; far = el; } }
      best = far;
    }
    if (best) { best.focus(); ui.sfx('ui_move'); return true; }
    return false;
  };
  function focusCycle(back) {
    const top = ui.top(); if (!top) return;
    const items = ui.focusables(top.el);
    if (!items.length) return;
    const i = items.indexOf(document.activeElement);
    const n = i < 0 ? (back ? items.length - 1 : 0) : (i + (back ? -1 : 1) + items.length) % items.length;
    items[n].focus();
  }

  // ---------------------------------------------------------------- keyboard
  const NAV_KEYS = { arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
  function uiOwnsKeys() {
    const st = ui.state().current;
    return !!ui.top() && st !== 'cine' && st !== 'loading';
  }
  input.uiOwnsKeys = uiOwnsKeys;
  function onKeyDown(e) {
    lastInput = 'key';
    const k = (e.key || '').toLowerCase();
    if (!uiOwnsKeys()) {
      if (ui.inGameplay() && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const map = { escape: 'pause', p: 'pause', i: 'inventory', k: 'spellbook', j: 'journal', m: 'map' };
        const act = map[k];
        if (act && !e.repeat) {
          e.stopPropagation(); e.preventDefault();
          if (act === 'pause') ui.openPause(); else { ui.open('pause'); ui.open(act); }
        }
      }
      return;
    }
    // A UI screen owns the keyboard: never leak to the game or other listeners.
    e.stopPropagation();
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const top = ui.top();
    const t = e.target && e.target.nodeType === 1 ? e.target : null;
    const inText = !!(t && t.matches('input[type=text],input:not([type]),input[type=search],textarea'));
    const isRange = !!(t && t.matches('input[type=range]'));
    // Screen-specific keys first (never while typing into a text field).
    if (top.onKey && !(inText && (k.length === 1 || ['backspace', 'delete', 'home', 'end'].includes(k)))) {
      try { if (top.onKey(e)) { e.preventDefault(); return; } } catch (err) { console.error(err); }
    }
    if (k === 'escape') { e.preventDefault(); if (!e.repeat) ui.back(); return; }
    if (k === 'p' && !inText && top.id === 'pause') { e.preventDefault(); ui.resume(); return; }
    if (k === 'tab') { e.preventDefault(); focusCycle(e.shiftKey); return; }
    if (k === 'enter' || k === ' ') {
      if (inText) { if (k === 'enter') { e.preventDefault(); if (top.submit) top.submit(); else input.navigate('down'); } return; }
      e.preventDefault();
      if (e.repeat) return;
      if (t && top.el.contains(t) && (t.matches('button,[role=option],[role=tab],[role=radio],a') )) t.click();
      else if (!t || !top.el.contains(t)) ui.focusFirst(top.el);
      return;
    }
    const dir = NAV_KEYS[k];
    if (dir) {
      if (inText && (k.length === 1 || dir === 'left' || dir === 'right')) return; // typing / caret movement
      if (isRange && (dir === 'left' || dir === 'right')) return; // slider adjusts natively
      e.preventDefault();
      input.navigate(dir);
      return;
    }
    if (!inText && !isRange && k.length === 1) e.preventDefault();
  }
  window.addEventListener('keydown', onKeyDown, true);
  // While the UI owns input, pointer presses on the canvas must not reach the game.
  window.addEventListener('pointerdown', (e) => {
    lastInput = e.pointerType === 'touch' ? 'touch' : 'pointer';
    if (e.pointerType === 'touch' && !input.touchSeen) { input.touchSeen = true; input.updateTouch(); }
    if (uiOwnsKeys() && e.target && e.target.id === 'scene') e.stopPropagation();
  }, true);
  let lastInput = 'pointer';
  input.lastInput = () => lastInput;

  // ---------------------------------------------------------------- movement output
  const DIR8 = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
  input.DIR8 = DIR8;
  const KEYDIR = { N: ['w'], NE: ['w', 'd'], E: ['d'], SE: ['s', 'd'], S: ['s'], SW: ['s', 'a'], W: ['a'], NW: ['w', 'a'] };
  input.dir8 = (x, y) => (Math.hypot(x, y) < 1e-3 ? null : DIR8[((Math.round(Math.atan2(y, x) / (Math.PI / 4)) % 8) + 8) % 8]);
  // 8-way FALLBACK used only when MM.input.setAxis is absent.
  function setMoveDir(id, dir) {
    if (MM.input && typeof MM.input.touch === 'function') { MM.input.touch(id, dir); return; }
    const td = ui.base.touch();
    if (td) { if (dir) td.set(id, dir); else td.delete(id); return; }
    const ks = ui.base.keys(); if (!ks) return;
    ['w', 'a', 's', 'd'].forEach((x) => ks.delete(x));
    if (dir) KEYDIR[dir].forEach((x) => ks.add(x));
  }
  input.setMoveDir = setMoveDir;
  // Analog move vector in screen space (|v| ≤ 1). MM.input.setAxis when present, else snapped 8-way.
  input.setAxis = function (x, y, source) {
    if (MM.input && typeof MM.input.setAxis === 'function') { safe(() => MM.input.setAxis(x, y, source)); return 'axis'; }
    setMoveDir('mm-' + source, Math.hypot(x, y) > 0.15 ? input.dir8(x, y) : null);
    return 'dir';
  };
  input.updateTouch = function () { if (ui.joystick) ui.joystick.update(); };
  input.touchEnabled = function () { return ui.joystick ? ui.joystick.enabled() : false; };
  input.onState = function () { input.updateTouch(); };

  // ---------------------------------------------------------------- gamepad (Standard mapping)
  const pads = { prev: {}, rep: {} };
  function pollPads(now) {
    const list = safe(() => (navigator.getGamepads ? Array.from(navigator.getGamepads()) : []), []).filter(Boolean);
    if (!list.length) { if (pads.moving) { input.setAxis(0, 0, 'gamepad'); pads.moving = false; } return; }
    const gp = list[0];
    const btn = (i) => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5));
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    const state = { up: btn(12) || ay < -0.55, down: btn(13) || ay > 0.55, left: btn(14) || ax < -0.55, right: btn(15) || ax > 0.55, a: btn(0), b: btn(1), x: btn(2), y: btn(3), lb: btn(4), rb: btn(5), back: btn(8), start: btn(9) };
    const edge = (k) => state[k] && !pads.prev[k];
    const repeat = (k) => { if (!state[k]) { pads.rep[k] = 0; return false; } if (!pads.prev[k]) { pads.rep[k] = now + 380; return true; } if (now >= pads.rep[k]) { pads.rep[k] = now + 110; return true; } return false; };
    if (uiOwnsKeys()) {
      lastInput = 'pad';
      ['up', 'down', 'left', 'right'].forEach((d) => { if (repeat(d)) input.navigate(d); });
      if (edge('a')) { const t = document.activeElement, top = ui.top(); if (top && t && top.el.contains(t) && t.click) t.click(); else if (top) { if (top.onKey && top.onKey(new KeyboardEvent('keydown', { key: ' ' }))) { /* handled */ } else ui.focusFirst(top.el); } }
      if (edge('b')) ui.back();
      if (edge('start') && ui.top() && ui.top().id === 'pause') ui.resume();
      if (edge('lb') || edge('rb')) { const top = ui.top(); if (top && top.onKey) top.onKey(new KeyboardEvent('keydown', { key: edge('lb') ? 'q' : 'e' })); }
      if (pads.moving) { input.setAxis(0, 0, 'gamepad'); pads.moving = false; }
    } else if (ui.inGameplay() && !ui.isOpen() && !(MM.input && MM.input.gamepadPolled) && !safe(() => world.coop, false)) { // eslint-disable-line no-undef
      // left stick (analog, 0.2 deadzone) or d-pad → movement
      let mx = Math.abs(ax) > 0.2 ? ax : 0, my = Math.abs(ay) > 0.2 ? ay : 0;
      if (btn(12) || btn(13) || btn(14) || btn(15)) { mx = (btn(15) ? 1 : 0) - (btn(14) ? 1 : 0); my = (btn(13) ? 1 : 0) - (btn(12) ? 1 : 0); }
      const m = Math.hypot(mx, my); if (m > 1) { mx /= m; my /= m; }
      const sig = mx.toFixed(2) + ',' + my.toFixed(2);
      if (sig !== pads.sig) { pads.sig = sig; input.setAxis(mx, my, 'gamepad'); pads.moving = !!(mx || my); }
      if (edge('a')) input.action('cast');
      if (edge('x')) input.action('interact');
      if (edge('y')) input.action('broom');
      if (edge('b')) input.action('potion');
      if (edge('rb')) input.action('spellNext');
      if (edge('lb')) input.action('spellPrev');
      if (edge('start')) ui.openPause();
      if (edge('back')) { ui.open('pause'); ui.open('map'); }
      if (dir || state.a) lastInput = 'pad';
    } else if (pads.moving) { input.setAxis(0, 0, 'gamepad'); pads.moving = false; pads.sig = null; }
    pads.prev = state;
  }


  // ---------------------------------------------------------------- FALLBACK pause gate (only when MM core is absent)
  function installFallbackGate() {
    if (!ui.fallbackCore() || MM.isPaused) return;
    const u = safe(() => window.update, null);
    if (typeof u === 'function' && !u.__mmui) {
      const wrapped = function (dt) { if (ui.isPaused()) return undefined; return u(dt); };
      wrapped.__mmui = true;
      window.update = wrapped; // baseline loop calls update() by name → picks this up
    }
    window.addEventListener('keydown', (e) => { if (ui.isPaused() && !uiOwnsKeys()) e.stopPropagation(); }, true);
  }

  // ---------------------------------------------------------------- init
  function init() {
    if (ui.ready) return;
    ui.root();
    ui.applySettings();
    ui.applyAudio && ui.applyAudio();
    ui.hud.init();
    if (ui.joystick) ui.joystick.build();
    ui.screensInit();
    ui.on('settings', () => { ui.applySettings(); ui.applyAudio && ui.applyAudio(); input.updateTouch(); });
    safe(() => matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => ui.applySettings()));
    ui.on('ui:open', () => input.updateTouch());
    ui.on('ui:close', () => input.updateTouch());
    ui.tick(() => pollPads(performance.now()));
    installFallbackGate();
    // Stage geometry → CSS vars (portrait phones place HUD bands above/below the stage).
    const cv = document.getElementById('scene');
    const measure = () => {
      const r = ui.root(), b = cv ? cv.getBoundingClientRect() : r.getBoundingClientRect();
      r.style.setProperty('--stage-top', Math.round(b.top) + 'px');
      r.style.setProperty('--stage-bottom', Math.round(Math.max(0, window.innerHeight - b.bottom)) + 'px');
      r.style.setProperty('--stage-left', Math.round(b.left) + 'px');
      r.style.setProperty('--stage-w', Math.round(b.width) + 'px');
      r.classList.toggle('mm-portrait', window.innerHeight > window.innerWidth * 1.15);
      // Are fixed layers anchored to the viewport (no transform/contain on an ancestor)? Portrait HUD bands need that.
      const sr = ui.layers.screens.getBoundingClientRect();
      r.classList.toggle('mm-viewport', Math.abs(sr.width - window.innerWidth) < 2 && Math.abs(sr.height - window.innerHeight) < 2);
      r.classList.toggle('mm-compact', b.width < 700 || b.height < 420);
    };
    measure();
    window.addEventListener('resize', measure);
    if (window.ResizeObserver && cv) new ResizeObserver(measure).observe(cv);
    ui.measure = measure;
    ui._markReady();
    const cur = ui.state().current;
    if (ui.fallbackCore()) setTimeout(() => { if (ui.state().current === 'boot') ui.go('title'); }, 0);
    else if (cur && cur !== 'boot') ui.onState({ from: null, to: cur, data: ui.state().data });
  }
  if (document.body && document.getElementById('scene')) init();
  else document.addEventListener('DOMContentLoaded', init);
})();
