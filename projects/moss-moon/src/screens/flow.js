// Moss & Moon — application flow (owner: SCREENS). MM.flow drives the out-of-game states:
//   boot → logo → intro (first run) → title (main menu) → New Game → creation → [tutorial] → play
// plus MM.flow.kit: small shared helpers for the screen modules (logo.js, title.js, intro.js).
// Classic script, loaded after src/ui/*.js and before boot.js. Every cross-module call is guarded.
// Contract: notes/PHASE3_CONTRACT.md "SCREENS". Docs: notes/SCREENS.md.
(function () {
  'use strict';
  const MM = window.MM = window.MM || {};
  if (MM.flow && MM.flow._v) return;
  const FLAGS_KEY = 'moss-moon-flow-v1';
  const safe = (fn, fb) => { try { return fn(); } catch (e) { console.warn('[MM.flow]', e); return fb; } };

  // ================================================================== kit (shared by the screen modules)
  const kit = {};
  kit.safe = safe;
  kit.clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  kit.lerp = (a, b, t) => a + (b - a) * t;
  kit.seg = (t, a, b) => kit.clamp((t - a) / (b - a));                 // 0..1 progress of t through [a,b]
  kit.sm = (x) => { x = kit.clamp(x); return x * x * (3 - 2 * x); };    // smoothstep
  kit.ease = {
    out: (x) => 1 - (1 - x) * (1 - x),
    outCubic: (x) => 1 - Math.pow(1 - x, 3),
    inOut: (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2),
    outBack: (x) => { const c = 1.6; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); },
  };
  kit.rng = (seed) => { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
  kit.hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  kit.rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  kit.mix = (a, b, t) => { const A = kit.rgb(a), B = kit.rgb(b); return 'rgb(' + A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',') + ')'; };
  kit.canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; return [c, g]; };
  kit.reduced = () => !!safe(() => (MM.settings && MM.settings.get ? MM.settings.get('reducedMotion') : matchMedia('(prefers-reduced-motion: reduce)').matches), false);
  kit.reducedFlashes = () => !!safe(() => MM.settings && MM.settings.get && MM.settings.get('reducedFlashes'), false);
  kit.uiBusy = () => !!safe(() => MM.ui && typeof MM.ui.top === 'function' && MM.ui.top(), false);
  kit.sfx = (id, o) => safe(() => MM.audio && MM.audio.ready && MM.audio.sfx && MM.audio.sfx(id, o || {}));
  kit.el = function (tag, attrs, ...kids) {
    const ns = /^(svg|g|path|text|tspan|defs|linearGradient|radialGradient|stop|filter|feGaussianBlur|feMerge|feMergeNode|feDropShadow|feColorMatrix|mask|rect|circle|ellipse|use|clipPath)$/.test(tag);
    const e = ns ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k]; if (v == null || v === false) continue;
      if (k === 'text') e.textContent = v; else if (k === 'html') e.innerHTML = v; else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat(3)) if (c != null && c !== false) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    return e;
  };
  // Cached radial glow sprite (smooth falloff), drawn with 'lighter' for light pools.
  const glowCache = new Map();
  kit.glow = function (r, color, k = 1) {
    r = Math.max(2, Math.round(r)); const key = r + color + k;
    let c = glowCache.get(key); if (c) return c;
    const [cv, g] = kit.canvas(r * 2, r * 2), [R, G, B] = kit.rgb(color);
    const gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, 'rgba(' + R + ',' + G + ',' + B + ',' + (0.55 * k) + ')');
    gr.addColorStop(0.35, 'rgba(' + R + ',' + G + ',' + B + ',' + (0.22 * k) + ')');
    gr.addColorStop(1, 'rgba(' + R + ',' + G + ',' + B + ',0)');
    g.fillStyle = gr; g.fillRect(0, 0, r * 2, r * 2);
    if (glowCache.size > 64) glowCache.clear();
    glowCache.set(key, cv); return cv;
  };
  // Night version of an MM.art sprite frame: albedo darkened toward moonlit blue, emissive palette colours
  // (Y O z L i — see notes/ART_DIRECTION.md) kept bright, plus a soft bloom canvas of the emissive pixels.
  const EMISSIVE = new Set(['#fff3c4', '#eac979', '#8ff0d0', '#ebe1f7', '#a5d6d8']);
  const nightCache = new Map();
  kit.night = function (name, frame = 0, tint) {
    const A = MM.art; if (!A || !A.ready || !A.has || !A.has(name)) return null;
    const f = A.get(name); if (!f || !f.img || !f.img.complete || !f.img.naturalWidth) return null;
    const key = name + '#' + frame + (tint || ''); let out = nightCache.get(key); if (out) return out;
    const [c, g] = kit.canvas(f.w, f.h), [gc, gg] = kit.canvas(f.w, f.h);
    g.drawImage(f.img, f.x + (frame % (f.frames || 1)) * f.w, f.y, f.w, f.h, 0, 0, f.w, f.h);
    const t = tint || [0.40, 0.46, 0.66], add = [6, 10, 26];
    let lit = 0;
    const d = safe(() => g.getImageData(0, 0, f.w, f.h), null);
    if (d) {
      const p = d.data, ge = gg.createImageData(f.w, f.h), q = ge.data;
      for (let i = 0; i < p.length; i += 4) {
        if (!p[i + 3]) continue;
        const hex = '#' + ((1 << 24) | (p[i] << 16) | (p[i + 1] << 8) | p[i + 2]).toString(16).slice(1);
        if (EMISSIVE.has(hex)) { q[i] = p[i]; q[i + 1] = p[i + 1]; q[i + 2] = p[i + 2]; q[i + 3] = 255; lit++; continue; }
        p[i] = Math.min(255, p[i] * t[0] + add[0]); p[i + 1] = Math.min(255, p[i + 1] * t[1] + add[1]); p[i + 2] = Math.min(255, p[i + 2] * t[2] + add[2]);
      }
      g.putImageData(d, 0, 0); gg.putImageData(ge, 0, 0);
    }
    out = { c, glow: lit ? gc : null, w: f.w, h: f.h, ax: f.ax, ay: f.ay, frames: f.frames || 1, fps: f.fps || 6 };
    if (nightCache.size > 80) nightCache.clear();
    nightCache.set(key, out); return out;
  };
  kit.drawNight = function (g, name, x, y, o) {
    o = o || {}; const A = MM.art; if (!A || !A.has || !A.has(name)) return false;
    const f = A.get(name), fr = o.t != null && f.frames > 1 ? A.frameAt(name, o.t) : (o.frame || 0);
    const n = kit.night(name, fr, o.tint); if (!n) return false;
    const s = o.scale || 1, flip = !!o.flip, dx = Math.round(x - (flip ? n.w - 1 - n.ax : n.ax) * s), dy = Math.round(y - n.ay * s);
    g.save();
    if (o.alpha != null) g.globalAlpha *= o.alpha;
    if (flip) { g.translate(dx + n.w * s, dy); g.scale(-1, 1); g.drawImage(n.c, 0, 0, n.w * s, n.h * s); } else g.drawImage(n.c, dx, dy, n.w * s, n.h * s);
    g.restore();
    if (n.glow && o.bloom !== false) {
      g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha *= (o.bloom == null ? 0.55 : o.bloom) * (o.alpha == null ? 1 : o.alpha);
      g.imageSmoothingEnabled = true;
      const pad = 6 * s;
      if (flip) { g.translate(dx + n.w * s, dy); g.scale(-1, 1); g.drawImage(n.glow, -pad, -pad, n.w * s + pad * 2, n.h * s + pad * 2); } else g.drawImage(n.glow, dx - pad, dy - pad, n.w * s + pad * 2, n.h * s + pad * 2);
      g.restore(); g.imageSmoothingEnabled = false;
    }
    return true;
  };

  // ------------------------------------------------------------------ per-screen session (resources released on exit)
  // kit.session(name) -> {on, timeout, el(root), mount, track, dispose}. Uses MM.screens.listen/timeout when CORE provides them,
  // and also tracks everything itself so a missing/partial CORE never leaks.
  kit.session = function (name) {
    const S = { name, alive: true, offs: [], nodes: [], mounts: [], timers: [] };
    S.on = function (target, type, fn, opts) {
      if (!target) return () => {};
      const wrapped = function (e) { if (S.alive) return fn.call(this, e); return undefined; };
      let off = null;
      const scr = MM.screens;
      if (scr && typeof scr.listen === 'function' && scr.current === name) {
        const r = safe(() => scr.listen(target, type, wrapped, opts), null);
        off = typeof r === 'function' ? r : () => target.removeEventListener(type, wrapped, opts);
        if (typeof r !== 'function') { /* CORE returned nothing: we still remove it ourselves (double remove is harmless) */ }
      } else target.addEventListener(type, wrapped, opts);
      const rm = () => { safe(() => target.removeEventListener(type, wrapped, opts)); if (off) safe(off); };
      S.offs.push(rm); return rm;
    };
    // Timers are only used for non-animation chores (never for animation: that runs in update(dt)).
    S.timeout = function (fn, ms) {
      const scr = MM.screens, cb = () => { if (S.alive) fn(); };
      if (scr && typeof scr.timeout === 'function' && scr.current === name) { const id = safe(() => scr.timeout(cb, ms), null); if (id != null) { S.timers.push(() => safe(() => clearTimeout(id))); return id; } }
      const id = setTimeout(cb, ms); S.timers.push(() => clearTimeout(id)); return id;
    };
    S.track = (node) => { if (node) S.nodes.push(node); return node; };
    S.mount = function (opts) {
      opts = Object.assign({ w: 512, h: 320, pixelated: true, layer: 'screens' }, opts || {});
      const scr = MM.screens; let m = null;
      if (scr && typeof scr.mount === 'function') m = safe(() => scr.mount(name, opts), null);
      if (!m || !m.canvas) {
        // CORE without mount(): own canvas in #mm-screens (or the stage). Removed in dispose().
        const host = document.getElementById('mm-screens') || document.getElementById('mm-stage') || document.body;
        const [c, g] = kit.canvas(opts.w, opts.h);
        c.className = 'mm-scr-canvas'; host.appendChild(c);
        m = { canvas: c, ctx: g, destroy() { c.remove(); }, own: true };
      }
      m.ctx = m.ctx || m.canvas.getContext('2d'); m.ctx.imageSmoothingEnabled = false;
      m.canvas.classList.add('mm-scr-canvas', 'mm-scr-canvas-' + name);
      S.mounts.push(m); return m;
    };
    // DOM root for this screen's crisp text/buttons: sibling of the mounted canvas inside #mm-screens.
    S.root = function (cls, parent) {
      const host = parent || (S.mounts[0] && S.mounts[0].canvas.parentNode) || document.getElementById('mm-screens') || document.getElementById('mm-stage') || document.body;
      const r = kit.el('div', { class: 'mm-scr ' + (cls || ''), 'data-screen': name });
      host.appendChild(r); return S.track(r);
    };
    // Full-viewport "ambient" fill behind the 8:5 stage (letterbox areas): CSS gradient + a tiny blurred copy of the screen canvas.
    S.ambient = function (kind, src) {
      const app = document.getElementById('mm-app'), stage = document.getElementById('mm-stage');
      if (!app) return null;
      const amb = kit.el('div', { class: 'mm-scr-ambient mm-amb-' + kind, 'aria-hidden': 'true' });
      let mini = null, mg = null;
      if (src) { [mini, mg] = kit.canvas(48, 30); mg.imageSmoothingEnabled = true; amb.appendChild(mini); }
      if (stage && stage.parentNode === app) app.insertBefore(amb, stage); else app.insertBefore(amb, app.firstChild);
      S.track(amb);
      let acc = 1;
      return { el: amb, update(dt) { if (!mini || !src) return; acc += dt; if (acc < 0.12) return; acc = 0; safe(() => mg.drawImage(src, 0, 0, 48, 30)); } };
    };
    S.htmlClass = function (cls) { document.documentElement.classList.add(cls); S.offs.push(() => document.documentElement.classList.remove(cls)); };
    S.dispose = function () {
      if (!S.alive) return; S.alive = false;
      for (const f of S.offs.splice(0)) safe(f);
      for (const f of S.timers.splice(0)) safe(f);
      for (const m of S.mounts.splice(0)) safe(() => (m.destroy ? m.destroy() : m.canvas.remove()));
      for (const n of S.nodes.splice(0)) safe(() => n.remove());
    };
    return S;
  };

  // Focus helpers for screen menus (roving focus over a list of buttons).
  kit.focus = (el) => { if (el && el.focus) safe(() => el.focus({ preventScroll: true })); };

  // Small accessible modal (only used when MM.ui.confirm/alert are missing).
  kit.confirm = function (opts) {
    opts = opts || {};
    if (MM.ui && typeof MM.ui.confirm === 'function') { const p = safe(() => MM.ui.confirm(opts), null); if (p && typeof p.then === 'function') return p; }
    return new Promise((resolve) => {
      const host = document.getElementById('mm-ui') || document.body, prev = document.activeElement;
      const yes = kit.el('button', { type: 'button', class: 'mm-scr-btn mm-scr-btn-primary' + (opts.danger ? ' mm-scr-btn-danger' : ''), text: opts.yes || 'OK' });
      const no = opts.no === null ? null : kit.el('button', { type: 'button', class: 'mm-scr-btn', text: opts.no || 'Cancel' });
      const id = 'mm-scr-dlg-' + Math.floor(Math.random() * 1e6);
      const box = kit.el('div', { class: 'mm-scr-modal', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': id + 't', 'aria-describedby': id + 'b' },
        kit.el('div', { class: 'mm-scr-modal-card' }, kit.el('h2', { id: id + 't', text: opts.title || 'Are you sure?' }), opts.body ? kit.el('p', { id: id + 'b', text: opts.body }) : null, kit.el('div', { class: 'mm-scr-modal-row' }, no, yes)));
      const done = (v) => { document.removeEventListener('keydown', key, true); box.remove(); kit.focus(prev); resolve(v); };
      const key = (e) => {
        e.stopPropagation();
        if (e.key === 'Escape') { e.preventDefault(); done(false); }
        else if (e.key === 'Tab' || /^Arrow/.test(e.key)) { e.preventDefault(); kit.focus(document.activeElement === yes && no ? no : yes); }
      };
      yes.addEventListener('click', () => done(true)); if (no) no.addEventListener('click', () => done(false));
      document.addEventListener('keydown', key, true);
      host.appendChild(box); kit.focus(opts.danger && no ? no : yes);
    });
  };
  kit.alert = (opts) => (MM.ui && typeof MM.ui.alert === 'function' ? safe(() => MM.ui.alert(opts), Promise.resolve()) : kit.confirm(Object.assign({ yes: 'OK', no: null }, opts)));
  kit.toast = (text, kind) => safe(() => (MM.ui && MM.ui.toast ? MM.ui.toast(text, kind) : MM.boot && MM.boot.toast ? MM.boot.toast(text, kind) : null));

  // ================================================================== persistent first-run flags
  const store = {
    get() { const s = MM.storage; return s && s.get ? s.get(FLAGS_KEY) : safe(() => localStorage.getItem(FLAGS_KEY), null); },
    set(v) { const s = MM.storage; if (s && s.set) s.set(FLAGS_KEY, v); else safe(() => localStorage.setItem(FLAGS_KEY, v)); },
    remove() { const s = MM.storage; if (s && s.remove) s.remove(FLAGS_KEY); else safe(() => localStorage.removeItem(FLAGS_KEY)); },
  };
  let flags = null;
  function readFlags() {
    const d = { introSeen: false, tutorialDone: false };
    const raw = safe(() => JSON.parse(store.get() || 'null'), null);
    if (raw && typeof raw === 'object') { d.introSeen = raw.introSeen === true; d.tutorialDone = raw.tutorialDone === true; }
    return d;
  }
  function getFlags() { if (!flags) flags = readFlags(); return flags; }
  function setFlag(k, v) { const f = getFlags(); if (f[k] === v) return; f[k] = v; store.set(JSON.stringify(f)); emit('flow:flags', Object.assign({}, f)); }

  // ================================================================== helpers
  const emit = (n, d) => safe(() => MM.bus && MM.bus.emit && MM.bus.emit(n, d));
  const cur = () => (MM.state ? MM.state.current : null);
  const hasScreen = (n) => !!safe(() => MM.screens && typeof MM.screens.def === 'function' && MM.screens.def(n), false);
  const stateOk = (n) => !!safe(() => !MM.state.list || MM.state.list.includes(n), true);
  function go(name, data) {
    if (!MM.state || typeof MM.state.go !== 'function') return false;
    if (MM.state.current === name) return true;
    const ok = safe(() => MM.state.go(name, data), false);
    if (ok !== false) emit('flow', { to: name, data: data || null });
    return ok !== false;
  }
  // Save slot info for the title: {valid, status, summary, reason}
  function saveInfo() {
    const S = MM.save;
    if (!S || typeof S.hasSave !== 'function') return { valid: false, status: 'none', summary: null, reason: 'Saving is not available.' };
    const status = safe(() => (S.status ? S.status() : S.hasSave() ? 'ok' : 'none'), 'corrupt');
    const valid = !!safe(() => S.hasSave(), false) && status !== 'corrupt' && status !== 'newer';
    const summary = valid ? safe(() => S.summary(), null) : null;
    let reason = '';
    if (!valid) reason = status === 'corrupt' ? 'Your saved journey could not be read (the data is damaged). Start a new journey, or erase it in Settings.'
      : status === 'newer' ? 'This saved journey was made by a newer version of Moss & Moon.' : 'No saved journey yet — begin one with New Game.';
    return { valid: valid && !!summary, status, summary, reason: valid && !summary ? 'Your saved journey could not be read.' : reason };
  }

  // ================================================================== MM.flow
  let started = false, tutorialOrigin = 'title', campaignPending = false, busy = false;
  const flow = {
    _v: 1, kit, FLAGS_KEY,
    flags: () => Object.assign({}, getFlags()),
    setFlag, saveInfo,
    resetFlags() { flags = { introSeen: false, tutorialDone: false }; store.remove(); emit('flow:flags', Object.assign({}, flags)); },
    // Called by boot.js once everything is loaded.
    start() {
      if (started) return false; started = true;
      flags = readFlags();
      const h = safe(() => (location.hash || '').toLowerCase(), '');
      if (!hasScreen('logo') || !hasScreen('title')) { console.warn('[MM.flow] MM.screens not available — falling back to the legacy title'); return go('title'); }
      if (h === '#mm-title') return flow.toTitle();
      if (h === '#mm-intro') return flow.toIntro({ replay: false });
      if (h === '#mm-new' || h === '#mm-continue' || h === '#mm-play') return flow.toTitle(); // boot's shortcuts take over right after
      return flow.toLogo();
    },
    toLogo() { return go('logo'); },
    // Logo finished/skipped: first run → intro, else → title.
    afterLogo() { if (!getFlags().introSeen && MM.cine && typeof MM.cine.play === 'function' && hasScreen('intro')) return flow.toIntro({ replay: false }); return flow.toTitle(); },
    toIntro(opts) {
      opts = opts || {};
      if (!hasScreen('intro') || !MM.cine || typeof MM.cine.play !== 'function') { kit.toast('The intro cannot be played right now.', 'warn'); return flow.toTitle(); }
      return go('intro', { replay: !!opts.replay });
    },
    // Intro ended or skipped (the intro screen calls this).
    afterIntro(result) { setFlag('introSeen', true); emit('flow:intro', result || {}); return flow.toTitle(); },
    toTitle() {
      if (MM.game && MM.game.active && typeof MM.game.toTitle === 'function' && cur() !== 'title') return safe(() => MM.game.toTitle(), false) !== false;
      return go('title');
    },
    // New Game from the title: confirm before an existing save is overwritten, then character creation.
    async newGame(opts) {
      opts = opts || {};
      if (busy) return false;
      busy = true;
      try {
        const info = saveInfo();
        if (info.valid && !opts.confirmed) {
          const s = info.summary || {};
          const ok = await kit.confirm({ title: 'Begin a new journey?', body: 'Your saved journey' + (s.name ? ' with ' + s.name : '') + (s.level ? ' (Lv ' + s.level + ', Day ' + (s.day || 1) + ')' : '') + ' will be replaced once the new one is saved. This cannot be undone.', yes: 'Start fresh', no: 'Keep my save', danger: true, icon: 'sprout' });
          if (!ok) return false;
        }
        emit('flow:newGame', {});
        if (stateOk('creation') && go('creation', { from: 'title' })) return true;
        return flow.afterCreation('Witch', null);
      } finally { busy = false; }
    },
    // Character creation confirmed (UI calls this). Starts the game; first time → tutorial, else play.
    afterCreation(name, look) {
      if (!MM.game || typeof MM.game.newGame !== 'function') { console.error('[MM.flow] MM.game missing'); return false; }
      const ok = safe(() => MM.game.newGame({ name: name || 'Witch', look: look || undefined }), false);
      if (ok === false) return false;
      if (!getFlags().tutorialDone && tutorialAvailable()) { campaignPending = true; return flow.startTutorial({ replay: false, from: 'new' }); }
      startCampaign();
      return true;
    },
    continueGame() {
      const info = saveInfo();
      if (!info.valid) { kit.alert({ title: 'Can’t continue', body: info.reason, icon: 'warn' }); return { ok: false, reason: info.status }; }
      const r = safe(() => MM.game.continueGame(), { ok: false, reason: 'error' }) || { ok: false, reason: 'error' };
      if (!r.ok) {
        kit.alert({ title: 'Couldn’t continue', body: 'The save could not be loaded' + (r.reason ? ' (' + r.reason + ')' : '') + '. You can start a new journey instead.', icon: 'warn' });
        emit('flow:continueFailed', r);
        if (cur() !== 'title') go('title');
        return r;
      }
      return r;
    },
    tutorialAvailable: () => tutorialAvailable(),
    startTutorial(opts) {
      opts = opts || {};
      const c = cur();
      tutorialOrigin = opts.from || (c === 'title' || c === 'logo' || c === 'intro' ? 'title' : MM.game && MM.game.active ? 'play' : 'title');
      if (tutorialOrigin !== 'new') campaignPending = false;
      if (!tutorialAvailable()) { kit.toast('The tutorial is not available in this build.', 'warn'); return flow.finishTutorial({ aborted: true }); }
      return go('tutorial', { replay: !!opts.replay, from: tutorialOrigin, firstRun: !getFlags().tutorialDone });
    },
    // TUTORIAL calls this on completion or a deliberate (confirmed) skip. {aborted:true} leaves without marking it done.
    finishTutorial(opts) {
      opts = opts || {};
      if (!opts.aborted) setFlag('tutorialDone', true);
      emit('flow:tutorial', { skipped: !!opts.skipped, aborted: !!opts.aborted });
      const from = tutorialOrigin; tutorialOrigin = 'title';
      if (from === 'title') return flow.toTitle();
      const r = flow.toGame();
      if (campaignPending) { campaignPending = false; startCampaign(); }
      return r;
    },
    toGame() {
      if (MM.game && MM.game.active) return go('play');
      return flow.toTitle();
    },
    get started() { return started; },
  };
  function tutorialAvailable() { return hasScreen('tutorial') || !!(MM.tutorial && stateOk('tutorial') && safe(() => MM.state.list.includes('tutorial'), false)); }
  function startCampaign() { if (MM.campaign && typeof MM.campaign.start === 'function') safe(() => MM.campaign.start()); }
  MM.flow = flow;
})();
