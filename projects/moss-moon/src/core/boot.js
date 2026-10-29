// Moss & Moon boot (CORE). Loaded LAST. On DOMContentLoaded: lays out the stage, applies settings to the page,
// wires autosave / tab-hide pause / error toasts, then enters 'boot' -> 'title'. When the UI module (MM.ui) is
// missing it shows tiny built-in fallbacks (title, pause, defeat, toasts) so the page is never blank or stuck.
// Test/automation diagnostics: window.__mm (documented in notes/handoff/core.md).
(function () {
  'use strict';
  const MM = window.MM = window.MM || {};
  if (!MM.bus || !MM.state || !MM.game) { console.error('[MM boot] src/core/mm.js is not loaded'); return; }
  const B = MM._baseline;
  const AUTOSAVE_SEC = 30, DIRTY_SAVE_SEC = 6, RETRY_SEC = 2;
  const $ = (id) => document.getElementById(id);
  const errors = [];
  const events = [];
  let layoutInfo = { scale: 1, width: 512, height: 320, integer: false };

  // ------------------------------------------------------------ event log (diagnostics)
  MM.bus.on('*', (d, name) => { events.push({ t: Math.round(performance.now()), name }); if (events.length > 400) events.splice(0, events.length - 400); });

  // ------------------------------------------------------------ error toasts
  let lastErrToast = 0, errToasts = 0;
  function onError(msg) {
    errors.push(String(msg)); if (errors.length > 50) errors.shift();
    const t = performance.now();
    if (t - lastErrToast < 3000 || errToasts >= 5) return;
    lastErrToast = t; errToasts++;
    toast('Something went wrong: ' + String(msg).slice(0, 120), 'error');
  }
  window.addEventListener('error', (e) => onError(e.message || (e.error && e.error.message) || 'script error'));
  window.addEventListener('unhandledrejection', (e) => onError((e.reason && (e.reason.message || e.reason)) || 'unhandled rejection'));

  function toast(text, kind) {
    if (MM.ui && typeof MM.ui.toast === 'function') { try { MM.ui.toast(text, kind); return; } catch (e) { /* fall back */ } }
    const ui = $('mm-ui'); if (!ui) return;
    let box = ui.querySelector('.mm-toasts');
    if (!box) { box = document.createElement('div'); box.className = 'mm-toasts'; box.setAttribute('role', 'status'); ui.appendChild(box); }
    const el = document.createElement('div'); el.className = 'mm-toast' + (kind ? ' ' + kind : ''); el.textContent = text;
    box.appendChild(el); while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => el.remove(), kind === 'error' ? 6000 : 3000);
  }
  MM.boot = { toast, layout: () => ({ ...layoutInfo }) };

  // ------------------------------------------------------------ stage layout (8:5, integer device-pixel scale when >=2x fits)
  function layout() {
    const app = $('mm-app'), stage = $('mm-stage'); if (!app || !stage) return;
    const cs = getComputedStyle(app);
    const w = app.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const h = app.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    if (!(w > 0 && h > 0)) return;
    const dpr = window.devicePixelRatio || 1;
    let s = Math.min(w / 512, h / 320), integer = false;
    if (s * dpr >= 2) { s = Math.floor(s * dpr + 1e-6) / dpr; integer = true; }
    const pw = Math.max(1, Math.round(512 * s * dpr)) / dpr, ph = Math.max(1, Math.round(320 * s * dpr)) / dpr;
    stage.style.width = pw + 'px'; stage.style.height = ph + 'px';
    document.documentElement.style.setProperty('--mm-scale', String(+s.toFixed(4)));
    const changed = layoutInfo.width !== pw || layoutInfo.height !== ph;
    layoutInfo = { scale: s, width: pw, height: ph, integer, dpr };
    if (changed) MM.bus.emit('layout', { ...layoutInfo });
  }

  // ------------------------------------------------------------ settings -> page
  function applyDocSettings() {
    const r = document.documentElement, s = MM.settings;
    r.style.setProperty('--mm-text-scale', String(s.get('textScale')));
    r.toggleAttribute('data-reduced-motion', !!s.get('reducedMotion'));
    r.toggleAttribute('data-reduced-flashes', !!s.get('reducedFlashes'));
    r.setAttribute('data-quality', s.get('quality'));
  }

  // ------------------------------------------------------------ autosave (sim time, safe moments only)
  let sinceSave = 0, dirty = false, retry = 0;
  MM.hooks.on('postUpdate', (dt) => {
    if (!MM.game.active || !MM.settings.get('autosave')) return;
    sinceSave += dt; retry -= dt;
    const due = sinceSave >= AUTOSAVE_SEC || (dirty && sinceSave >= DIRTY_SAVE_SEC);
    if (!due || retry > 0) return;
    if (MM.game.safeToSave() && MM.save.save({ silent: true, reason: 'auto' })) { sinceSave = 0; dirty = false; } else retry = RETRY_SEC;
  }, 1000);
  MM.bus.on('save', (d) => { if (d && d.ok) { sinceSave = 0; dirty = false; } });
  ['levelup', 'quest', 'region', 'dungeon', 'day', 'fragment', 'restored', 'chapter'].forEach((n) => MM.bus.on(n, () => { dirty = true; }));
  function saveIfSafe(reason) { if (MM.game.active && MM.settings.get('autosave') && MM.game.safeToSave()) MM.save.save({ silent: true, reason }); }

  // ------------------------------------------------------------ fallbacks (only without MM.ui)
  const hasUI = () => !!(MM.ui && (typeof MM.ui.open === 'function' || typeof MM.ui.toast === 'function'));
  let overlay = null, overlayKind = '', defeatTimer = 0;
  function showOverlay(kind) {
    hideOverlay(); if (hasUI()) return;
    const ui = $('mm-ui'); if (!ui) return;
    overlay = document.createElement('div'); overlay.className = 'mm-fallback'; overlay.dataset.kind = kind; overlayKind = kind;
    overlay.setAttribute('role', 'dialog');
    if (kind === 'title') {
      const sum = MM.save.summary();
      overlay.innerHTML = '<h1>MOSS &amp; MOON</h1><p>A young witch restores Moonflower Grove after the Moonwell loses its light.</p>' +
        (sum ? '<p>Press <kbd>Enter</kbd> to continue — ' + esc(sum.name) + ', level ' + sum.level + ', day ' + sum.day + '</p><p><kbd>N</kbd> new game</p>'
          : '<p>Press <kbd>Enter</kbd> to begin</p>');
      overlay.setAttribute('aria-label', 'Moss and Moon title');
    } else if (kind === 'pause') {
      overlay.innerHTML = '<h1>Paused</h1><p>Press <kbd>Esc</kbd> or <kbd>Enter</kbd> to resume</p>';
    } else if (kind === 'defeat') {
      overlay.innerHTML = '<h1>Moonlit Recovery</h1><p>The moon carries you home. You wake at the homestead.</p><p>Press <kbd>Enter</kbd></p>';
    }
    overlay.addEventListener('click', () => fallbackConfirm());
    ui.appendChild(overlay);
  }
  function hideOverlay() { if (overlay) overlay.remove(); overlay = null; overlayKind = ''; clearTimeout(defeatTimer); }
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function fallbackConfirm(forceNew) {
    if (overlayKind === 'title') {
      if (!forceNew && MM.save.hasSave()) { const r = MM.game.continueGame(); if (r.ok) return; toast('Save could not be loaded (' + r.reason + '); starting fresh', 'error'); }
      MM.game.newGame({ name: 'Witch' });
    } else if (overlayKind === 'pause') MM.state.go('play');
    else if (overlayKind === 'defeat') MM.game.respawnHome();
  }
  window.addEventListener('keydown', (e) => {
    if (hasUI()) return;
    const k = e.key;
    if (overlay && !e.repeat && (k === 'Enter' || k === ' ' || (overlayKind === 'title' && (k === 'n' || k === 'N')) || (overlayKind === 'pause' && k === 'Escape'))) {
      e.preventDefault(); e.stopPropagation(); fallbackConfirm(k === 'n' || k === 'N'); return;
    }
    if (!overlay && k === 'Escape' && MM.state.is('play')) { e.preventDefault(); MM.state.go('menu', { screen: 'pause', reason: 'key' }); }
  }, true);
  MM.bus.on('state', ({ to }) => {
    if (hasUI()) { hideOverlay(); return; }
    if (to === 'title') showOverlay('title');
    else if (to === 'menu') showOverlay('pause');
    else if (to === 'defeat') { showOverlay('defeat'); defeatTimer = setTimeout(() => { if (MM.state.is('defeat')) MM.game.respawnHome(); }, 2500); }
    else hideOverlay();
  });

  // ------------------------------------------------------------ state side effects
  MM.bus.on('state', ({ to }) => {
    if (to === 'play') {
      const a = document.activeElement, c = $('scene');
      if (c && (!a || a === document.body || (a.closest && a.closest('#mm-ui') && !a.offsetParent))) { try { c.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    }
  });
  function pauseForHide() {
    if (!MM.state.is('play')) return;
    MM.state.go('menu', { screen: 'pause', reason: 'hidden' });
    if (hasUI() && typeof MM.ui.open === 'function') { try { MM.ui.open('pause'); } catch (e) { console.error(e); } }
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) { saveIfSafe('hidden'); pauseForHide(); } });
  window.addEventListener('pagehide', () => saveIfSafe('pagehide'));

  // ------------------------------------------------------------ diagnostics for tests / automation
  const W = () => B.world(), G = () => B.game();
  const diag = {
    version: MM.version,
    getState() {
      const w = W(), g = G(), en = B.enemies() || [];
      return { state: MM.state.current, prev: MM.state.prev, paused: MM.isPaused(), active: MM.game.active, name: MM.game.name,
        elapsed: g ? g.elapsed : 0, x: g ? g.x : null, y: g ? g.y : null, mounted: g ? g.mounted : false, camX: g ? g.camX : 0, camY: g ? g.camY : 0,
        anim: g ? g.animation : null, target: g && g.target ? { ...g.target } : null,
        region: w && w.region, mode: w && w.mode, floor: w && w.floor, day: w && w.day, time: w && w.time, hp: w && w.hp, mana: w && w.mana,
        gold: w && w.gold, level: w && w.level, xp: w && w.xp, enemies: en.length, boss: en.some((e) => e.boss && e.hp > 0),
        saveStatus: MM.save.status(), storage: MM.save.available, layout: { ...layoutInfo } };
    },
    setState: (name, data) => MM.state.go(name, data),
    newGame: (o) => MM.game.newGame(o || { name: 'Tester' }),
    continueGame: () => MM.game.continueGame(),
    toTitle: () => MM.game.toTitle(),
    world: W, game: G,
    setWorld(patch) { const w = W(); if (w && patch) Object.assign(w, patch); return w; },
    teleport(x, y) { const g = G(); if (!g) return false; g.x = Math.min(19.4, Math.max(0.6, +x)); g.y = Math.min(19.4, Math.max(0.6, +y)); g.vx = g.vy = 0; g.target = null; MM.camera.snap(); return true; },
    // give('gold'|'potions'|'bombs'|'runes'|'points'|'stars'|'hp'|'mana'|'xp'|'seed:<id>'|'harvest:<id>'|<cropId>, n)
    give(item, n = 1) {
      const w = W(); if (!w) return null; n = Number(n) || 0;
      if (item === 'xp') { B.call('awardXP', n); return w.xp; }
      const [a, b] = String(item).split(':');
      if ((a === 'seed' || a === 'seeds') && b) { w.seeds[b] = (w.seeds[b] || 0) + n; return w.seeds[b]; }
      if (a === 'harvest' && b) { w.harvest[b] = (w.harvest[b] || 0) + n; return w.harvest[b]; }
      if (w.harvest && Object.prototype.hasOwnProperty.call(w.harvest, a) && !b) { w.harvest[a] += n; return w.harvest[a]; }
      if (typeof w[a] === 'number') { w[a] += n; return w[a]; }
      if (MM.campaign && typeof MM.campaign.give === 'function') return MM.campaign.give(item, n);
      return null;
    },
    heal() { const w = W(); if (w) { w.hp = B.call('heroMaxHP') || 100; w.mana = 100; } return w && w.hp; },
    killAll() { const en = B.enemies() || []; for (const e of en) if (e.hp > 0) B.call('hitEntity', e, e.hp + 999, '#fff'); return en.length; },
    spawn(type = 'slime', n = 1, boss = false) { B.call('spawnGroup', type, n, boss); return (B.enemies() || []).length; },
    region: (id) => B.call('goRegion', id),
    dungeon: (rift) => B.call('enterDungeon', !!rift),
    nextFloor: () => B.call('advanceFloor'),
    // Run the baseline simulation synchronously (n substeps of dt). Respects pause unless force.
    step(n = 1, dt = 1 / 60, force = false) { for (let i = 0; i < n; i++) { if (!force && MM.isPaused()) break; B.call('update', dt); } return G() && G().elapsed; },
    events: (name) => (name ? events.filter((e) => e.name === name) : events.slice()),
    clearEvents() { events.length = 0; },
    errors: () => errors.slice(),
    save: (force) => MM.save.save({ silent: true, force: !!force, reason: 'test' }),
    load: () => MM.save.load(),
    layout: () => ({ ...layoutInfo }),
    // Distinct colours in a coarse sample of the scene canvas (painted-ness check).
    canvasColors() {
      const c = $('scene'); if (!c) return 0;
      const x = c.getContext('2d'), d = x.getImageData(0, 0, c.width, c.height).data, set = new Set();
      for (let i = 0; i < d.length; i += 4 * 37) set.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
      return set.size;
    },
  };
  window.__mm = diag;

  // ------------------------------------------------------------ boot
  let booted = false;
  function boot() {
    if (booted) return; booted = true;
    layout();
    window.addEventListener('resize', layout);
    window.addEventListener('orientationchange', () => setTimeout(layout, 120));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', layout);
    applyDocSettings(); MM.settings.onChange(applyDocSettings);
    if (MM.audio && typeof MM.audio.applySettings === 'function') {
      const s = MM.settings.all(); try { MM.audio.applySettings({ master: s.volMaster, music: s.volMusic, sfx: s.volSfx, cine: s.volCine }); } catch (e) { console.error(e); }
    }
    if (!MM.save.available) setTimeout(() => toast('Saving is unavailable in this browser mode — progress lasts until you close the tab.', 'warn'), 600);
    MM.bus.on('save:error', (d) => { if (d && d.reason === 'corrupt') toast(d.restored ? 'Your latest save was damaged; restored the previous one.' : 'Your save was damaged and could not be loaded.', 'error'); });
    MM.bus.emit('boot', { version: MM.version });
    if (MM.state.current === 'boot') MM.state.go('title');
    const h = (location.hash || '').toLowerCase();
    if (h === '#mm-new') MM.game.newGame({ name: 'Witch' });
    else if (h === '#mm-continue' || h === '#mm-play') { const r = MM.save.hasSave() ? MM.game.continueGame() : { ok: false }; if (!r.ok) MM.game.newGame({ name: 'Witch' }); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
