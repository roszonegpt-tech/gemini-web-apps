/* Moss & Moon — full screens (owner: UI agent): title, character creation, dialogue, dungeon summary,
 * defeat ("Moonlit Recovery"), campaign complete, loading card, the moonlit sky backdrop, and the
 * MM.state ↔ screen wiring. */
(function () {
  'use strict';
  const MM = window.MM, ui = MM && MM.ui;
  if (!ui || ui._screens) return;
  ui._screens = true;
  const { h, safe, clamp } = ui;
  const D = ui.data;

  // ============================================================ moonlit sky backdrop (title / creation / ending)
  function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  ui.buildSky = function () {
    const L = ui.layers.sky;
    if (L.firstChild) return;
    const r = rng(7);
    const stars = (n, size) => Array.from({ length: n }, () => Math.round(r() * 1600) + 'px ' + Math.round(r() * 520) + 'px 0 ' + (r() < 0.15 ? size + 0.6 : size) + 'px rgba(255,248,226,' + (0.35 + r() * 0.6).toFixed(2) + ')').join(',');
    const flies = Array.from({ length: 18 }, (_, i) => h('i', { style: { left: (4 + r() * 92).toFixed(1) + '%', top: (58 + r() * 36).toFixed(1) + '%', '--d': (6 + r() * 7).toFixed(1) + 's', '--delay': (-r() * 10).toFixed(1) + 's', '--dx': ((r() - 0.5) * 80).toFixed(0) + 'px', '--dy': (-20 - r() * 60).toFixed(0) + 'px' } }));
    const pine = (x, y, s, c) => '<path fill="' + c + '" d="M' + x + ' ' + (y - 70 * s) + ' L' + (x + 16 * s) + ' ' + (y - 30 * s) + ' L' + (x + 9 * s) + ' ' + (y - 30 * s) + ' L' + (x + 24 * s) + ' ' + y + ' L' + (x - 24 * s) + ' ' + y + ' L' + (x - 9 * s) + ' ' + (y - 30 * s) + ' L' + (x - 16 * s) + ' ' + (y - 30 * s) + 'Z"/>';
    const oak = (x, y, s, c) => '<g fill="' + c + '"><rect x="' + (x - 3 * s) + '" y="' + (y - 26 * s) + '" width="' + 6 * s + '" height="' + 26 * s + '"/><circle cx="' + x + '" cy="' + (y - 40 * s) + '" r="' + 22 * s + '"/><circle cx="' + (x - 17 * s) + '" cy="' + (y - 30 * s) + '" r="' + 14 * s + '"/><circle cx="' + (x + 17 * s) + '" cy="' + (y - 31 * s) + '" r="' + 15 * s + '"/></g>';
    let trees = '';
    [[90, 452, 1.1], [150, 448, 0.8], [340, 440, 1.2], [395, 444, 0.9], [610, 430, 1.0], [1310, 430, 1.1], [1370, 436, 0.85], [1500, 444, 1.25], [1555, 448, 0.9]].forEach(([x, y, s]) => { trees += pine(x, y, s, '#14303a'); });
    let near = '';
    [[40, 540, 1.6], [230, 528, 1.3], [1450, 528, 1.5]].forEach(([x, y, s]) => { near += oak(x, y, s, '#0c1d21'); });
    [[1590, 548, 1.7], [700, 540, 1.1]].forEach(([x, y, s]) => { near += pine(x, y, s, '#0c1d21'); });
    const flowers = Array.from({ length: 26 }, () => { const x = Math.round(r() * 1600), y = 556 + Math.round(r() * 36); return '<circle class="mm-bloom" cx="' + x + '" cy="' + y + '" r="' + (1.8 + r() * 2).toFixed(1) + '" style="animation-delay:' + (-r() * 6).toFixed(1) + 's"/>'; }).join('');
    const svg = '<svg class="mm-sky-land" viewBox="0 0 1600 600" preserveAspectRatio="xMidYMax slice" aria-hidden="true">' +
      '<defs><radialGradient id="mmWin" r="0.5"><stop offset="0" stop-color="#ffe2a0" stop-opacity=".95"/><stop offset="1" stop-color="#ffcf7a" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="mmWell" r="0.5"><stop offset="0" stop-color="#cfe6ff" stop-opacity=".55"/><stop offset="1" stop-color="#9cc4ff" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="mmFar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#284f5c"/><stop offset="1" stop-color="#1a3942"/></linearGradient></defs>' +
      '<path fill="url(#mmFar)" d="M0 420 L110 340 L190 380 L320 262 L430 352 L540 300 L690 384 L820 286 L950 366 L1080 276 L1200 356 L1330 296 L1450 366 L1600 318 V600 H0Z"/>' +
      '<path fill="#c9dbe6" opacity=".22" d="M320 262 L350 290 L332 286 L318 298 L300 284 L286 290Z M820 286 L846 310 L828 306 L814 318 L800 304 L790 310Z M1080 276 L1108 302 L1090 298 L1076 310 L1062 296 L1050 300Z"/>' +
      '<path fill="#17343b" d="M0 470 C200 400 380 444 520 424 S860 384 1040 432 S1380 402 1600 440 V600 H0Z"/>' + trees +
      '<ellipse cx="800" cy="470" rx="90" ry="34" fill="url(#mmWell)" class="mm-well-glow"/>' +
      '<g class="mm-cottage"><rect x="1080" y="470" width="120" height="66" fill="#0f2226"/><path d="M1068 474 L1140 420 L1212 474Z" fill="#0d1d21"/><rect x="1170" y="428" width="14" height="30" fill="#0d1d21"/>' +
      '<rect x="1100" y="488" width="22" height="20" fill="#f1c983"/><rect x="1158" y="488" width="22" height="20" fill="#f1c983"/><rect x="1132" y="500" width="18" height="36" fill="#1b2f33"/>' +
      '<circle cx="1111" cy="498" r="34" fill="url(#mmWin)" class="mm-win-glow"/><circle cx="1169" cy="498" r="34" fill="url(#mmWin)" class="mm-win-glow"/></g>' +
      '<path fill="#0f2427" d="M0 524 C260 486 520 514 800 502 S1300 474 1600 512 V600 H0Z"/>' + near +
      '<path fill="#0a181b" d="M0 560 C300 540 600 556 900 550 S1400 540 1600 556 V600 H0Z"/>' +
      '<g fill="#cdb8ff" class="mm-blooms">' + flowers + '</g></svg>';
    L.append(
      h('div', { class: 'mm-sky' },
        h('div', { class: 'mm-sky-stars mm-s1', style: { boxShadow: stars(110, 1) } }),
        h('div', { class: 'mm-sky-stars mm-s2', style: { boxShadow: stars(50, 1.4) } }),
        h('div', { class: 'mm-sky-moon' }, h('i', { class: 'mm-moon-halo' }), h('i', { class: 'mm-moon-disc' })),
        h('div', { class: 'mm-sky-cloud mm-cl1' }), h('div', { class: 'mm-sky-cloud mm-cl2' }),
        (() => { const d = h('div', { class: 'mm-sky-landwrap' }); d.innerHTML = svg; return d; })(),
        h('div', { class: 'mm-sky-mist' }), h('div', { class: 'mm-sky-mist mm-m2' }),
        h('div', { class: 'mm-sky-flies' }, flies)));
  };
  function showSky(on) { ui.buildSky(); ui.layers.sky.classList.toggle('mm-on', !!on); }

  // ============================================================ TITLE
  function saveInfo() {
    const S = MM.save;
    let has = false, sum = null;
    if (S && typeof S.hasSave === 'function') { has = !!safe(() => S.hasSave(), false); sum = has ? safe(() => S.summary(), null) : null; }
    else {
      // FALLBACK: read the baseline v1 key directly.
      const raw = safe(() => localStorage.getItem('moss-moon-adventure-v1'), null);
      if (raw) { has = true; const w = safe(() => JSON.parse(raw), null); sum = w ? { name: safe(() => JSON.parse(localStorage.getItem('moss-moon-name') || 'null'), null) || 'Witch', level: w.level, day: w.day, chapter: null, savedAt: null } : null; }
    }
    return { has, sum, corrupt: has && !sum };
  }
  function ago(ts) {
    if (!ts) return '';
    const s = Math.max(0, (Date.now() - ts) / 1000);
    if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago'; if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    return Math.floor(s / 86400) + ' days ago';
  }
  const CHAPTERS = ['Arrival', 'The Blighted Forest', 'The Whispering Swamp', 'Frostpeak', 'The Moonwell', 'Free Play'];
  ui.saveError = null;
  ui.registerScreen('title', () => {
    const el = h('div', { class: 'mm-title-screen', role: 'main', 'aria-label': 'Title screen' });
    const inst = { el, state: 'title', label: 'Moss and Moon — title', noEscape: true, quiet: true };
    function render() {
      el.innerHTML = '';
      const info = saveInfo();
      const logo = h('header', { class: 'mm-logo' },
        h('p', { class: 'mm-logo-eyebrow' }, 'A cozy witch’s tale'),
        h('h1', { class: 'mm-logo-title' }, h('span', null, 'MOSS'), h('span', { class: 'mm-amp' }, '&'), h('span', null, 'MOON')),
        h('div', { class: 'mm-logo-rule', 'aria-hidden': 'true' }, h('i'), ui.icon('moon'), h('i')),
        h('p', { class: 'mm-logo-tag' }, 'Restore Moonflower Grove after the Moonwell loses its light.'));
      const menu = h('nav', { class: 'mm-title-menu', 'aria-label': 'Main menu' });
      const contSub = info.corrupt ? 'Save data couldn’t be read' : info.has && info.sum ? [info.sum.name, 'Lv ' + (info.sum.level || 1), 'Day ' + (info.sum.day || 1)].filter(Boolean).join(' · ') : 'No saved journey yet';
      const cont = ui.button('Continue', () => continueGame(), { icon: 'play', cls: (info.has && !info.corrupt ? 'mm-btn-primary ' : '') + 'mm-title-btn', sub: contSub, disabled: !info.has || info.corrupt, id: 'continue' });
      cont.setAttribute('aria-describedby', 'mm-cont-note');
      const ng = ui.button('New Game', () => newGame(info), { icon: 'sprout', cls: (!info.has || info.corrupt ? 'mm-btn-primary ' : '') + 'mm-title-btn', id: 'new-game' });
      if (info.has && !info.corrupt) { menu.append(cont, ng); cont.dataset.autofocus = '1'; } else { menu.append(ng, cont); ng.dataset.autofocus = '1'; }
      if (info.has && info.sum) {
        const s = info.sum;
        menu.insertBefore(h('div', { class: 'mm-save-card', id: 'mm-cont-note' }, ui.icon('bookmark'),
          h('div', null, h('strong', null, s.name || 'Your journey'), h('span', null, [s.chapter != null ? 'Chapter ' + s.chapter + (CHAPTERS[s.chapter] ? ' · ' + CHAPTERS[s.chapter] : '') : null, s.savedAt ? 'Saved ' + ago(s.savedAt) : null].filter(Boolean).join(' · ') || 'Ready to continue'))), cont.nextSibling);
      } else {
        menu.appendChild(h('p', { class: 'mm-title-note', id: 'mm-cont-note' }, info.corrupt ? 'Your previous save was damaged. Start a new journey, or erase it in Settings → Game.' : 'Continue unlocks once you have a saved journey.'));
      }
      if (D.memories().length) menu.appendChild(ui.button('Memories', () => ui.open('memories'), { icon: 'film', cls: 'mm-title-btn', id: 'memories' }));
      menu.append(
        ui.button('Settings', () => ui.open('settings'), { icon: 'sliders', cls: 'mm-title-btn', id: 'settings' }),
        ui.button('Controls', () => ui.open('controls'), { icon: 'gamepad', cls: 'mm-title-btn', id: 'controls' }),
        ui.button('Credits', () => ui.open('credits'), { icon: 'quill', cls: 'mm-title-btn', id: 'credits' }));
      const foot = h('footer', { class: 'mm-title-foot' }, h('span', null, 'v' + (MM.version || ui.version)), h('span', { class: 'mm-title-hint' }, h('kbd', { class: 'mm-kbd' }, '↑↓'), ' choose  ', h('kbd', { class: 'mm-kbd' }, 'Enter'), ' select'));
      el.append(h('div', { class: 'mm-title-col' }, logo, menu), foot);
      if (ui.saveError) {
        const msg = ui.saveError; ui.saveError = null;
        setTimeout(() => ui.alert({ title: 'Save data couldn’t be loaded', body: 'Your saved journey appears to be damaged' + (msg && msg.reason ? ' (' + msg.reason + ')' : '') + '. A fresh start is ready; the damaged data was set aside.', icon: 'warn' }), 50);
      }
    }
    inst.refresh = render;
    inst.onOpen = () => { showSky(true); safe(() => MM.audio && MM.audio.music && MM.audio.music('title', { fade: 1.5 })); };
    inst.onClose = () => { if (!ui.isOpen('creation')) showSky(false); };
    render();
    return inst;
  });
  async function newGame(info) {
    if (info.has && !info.corrupt) {
      const s = info.sum || {};
      const ok = await ui.confirm({ title: 'Begin a new journey?', body: 'Your current journey' + (s.name ? ' with ' + s.name : '') + (s.level ? ' (Lv ' + s.level + ', Day ' + (s.day || 1) + ')' : '') + ' will be replaced once the new one is saved.', yes: 'Start fresh', no: 'Keep my save', danger: true, icon: 'sprout' });
      if (!ok) return;
    }
    ui.close('title', { silent: true, noSync: true });
    ui.open('creation');
  }
  async function continueGame() {
    let r;
    if (MM.game && typeof MM.game.continueGame === 'function') r = safe(() => MM.game.continueGame(), { ok: false, reason: 'error' });
    else r = { ok: true }; // FALLBACK: baseline already loaded the v1 save at boot
    if (r && typeof r.then === 'function') r = await r.catch(() => ({ ok: false, reason: 'error' }));
    if (r === false || (r && r.ok === false)) { ui.sfx('ui_error'); await ui.alert({ title: 'Couldn’t continue', body: 'The save could not be loaded' + (r && r.reason ? ' (' + r.reason + ')' : '') + '. You can start a new journey instead.', icon: 'warn' }); const t = ui.get('title'); if (t) t.refresh(); return; }
    ui.closeAll({ noSync: true });
    showSky(false);
    if (['title', 'creation', 'boot'].includes(ui.state().current)) ui.go('play');
  }

  // ============================================================ CHARACTER CREATION
  const LOOK_LABELS = {
    style: [['feminine', 'Feminine'], ['masculine', 'Masculine'], ['neutral', 'Neutral']],
    skin: [['porcelain', 'Porcelain', '#f3d0b9'], ['warm', 'Warm light', '#e7b89c'], ['honey', 'Honey', '#c98f6c'], ['tan', 'Tan', '#aa7052'], ['deep', 'Deep brown', '#85523b'], ['rich', 'Rich brown', '#58392d']],
    hair: [['ink', 'Black', '#272833'], ['brown', 'Brown', '#5b4032'], ['auburn', 'Auburn', '#a2573d'], ['gold', 'Golden', '#c2a271'], ['silver', 'Silver', '#a8abb0']],
    outfit: [['charcoal', 'Charcoal', '#393944'], ['plum', 'Plum', '#66506d'], ['moss', 'Moss', '#4d7058'], ['ocean', 'Ocean', '#426a79'], ['rose', 'Rose', '#925f60'], ['ochre', 'Ochre', '#96784f']],
  };
  const LOOK_DEFAULT = { style: 'feminine', skin: 'warm', hair: 'ink', outfit: 'charcoal' };
  const PREVIEW_DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  ui.validateName = function (raw) {
    const n = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
    if (!n) return { ok: false, name: n, msg: 'Please give your witch a name.' };
    if ([...n].length > 16) return { ok: false, name: n, msg: 'Names can be at most 16 characters.' };
    if (!/^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} '’.-]*$/u.test(n)) return { ok: false, name: n, msg: 'Use letters, numbers, spaces, apostrophes or hyphens.' };
    return { ok: true, name: n, msg: '' };
  };

  // Live preview: recolours the baseline atlas (ATLAS_DATA / PALETTES / COLOR_KEYS) into our own buffer.
  function makePreview(canvas) {
    const ctx = canvas.getContext('2d');
    const imgs = {}, cache = {};
    let look = Object.assign({}, LOOK_DEFAULT), dir = 4, pose = 'cycle', t0 = performance.now(), raf = 0, alive = true;
    const ATL = safe(() => ATLAS_DATA, null), PAL = safe(() => PALETTES, null), CK = safe(() => COLOR_KEYS, null), AN = safe(() => ANIMATIONS, null); // eslint-disable-line no-undef
    const anim = (k) => (AN && AN[k]) || { idle: { row: 0, frames: 8, frameMs: 125 }, walk: { row: 8, frames: 8, frameMs: 100 }, cast: { row: 56, frames: 8, frameMs: 60 } }[k];
    function source(style) {
      if (!ATL || !ATL[style]) return null;
      if (!imgs[style]) { const im = new Image(); im.onload = () => { delete cache[sig()]; }; im.src = ATL[style]; imgs[style] = im; }
      const im = imgs[style];
      return im.complete && im.naturalWidth ? im : null;
    }
    const sig = () => [look.style, look.skin, look.hair, look.outfit].join('|');
    function recolored() {
      const key = sig();
      if (cache[key]) return cache[key];
      const src = source(look.style);
      if (!src) return null;
      // only the rows we animate: idle 0–7, walk 8–15, cast 56–63
      const buf = document.createElement('canvas'); buf.width = src.naturalWidth; buf.height = src.naturalHeight;
      const b = buf.getContext('2d', { willReadFrequently: true }); b.imageSmoothingEnabled = false; b.drawImage(src, 0, 0);
      if (PAL && CK) {
        const map = new Map();
        for (const g of ['skin', 'hair', 'outfit']) { const to = PAL[g] && PAL[g][look[g]]; if (to) CK[g].forEach((from, i) => map.set(parseInt(from, 16), parseInt(to[i], 16))); }
        for (const [y0, rows] of [[0, 16], [56, 8]]) {
          const y = y0 * 56, hgt = Math.min(rows * 56, buf.height - y); if (hgt <= 0) continue;
          const data = b.getImageData(0, y, buf.width, hgt), px = data.data;
          for (let i = 0; i < px.length; i += 4) { if (!px[i + 3]) continue; const k = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2], rep = map.get(k); if (rep !== undefined) { px[i] = rep >> 16; px[i + 1] = (rep >> 8) & 255; px[i + 2] = rep & 255; } }
          b.putImageData(data, 0, y);
        }
      }
      Object.keys(cache).forEach((k) => delete cache[k]);
      cache[key] = buf;
      return buf;
    }
    function frameAt(now) {
      const el = now - t0;
      let k = pose;
      if (pose === 'cycle') { const c = el % 6200; k = c < 2400 ? 'idle' : c < 4800 ? 'walk' : 'cast'; }
      const a = anim(k), ms = a.frameMs || 100;
      return { k, row: a.row, frame: Math.floor(el / ms) % (a.frames || 8) };
    }
    function draw(now) {
      if (!alive) return;
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      ctx.imageSmoothingEnabled = false;
      const sc = Math.floor(Math.min(W / 48, H / 56));
      const x = Math.round((W - 48 * sc) / 2), y = Math.round(H - 56 * sc - sc * 2);
      // contact shadow
      ctx.fillStyle = 'rgba(4,14,16,.45)';
      ctx.beginPath(); ctx.ellipse(W / 2, y + 49 * sc, 13 * sc, 3.6 * sc, 0, 0, Math.PI * 2); ctx.fill();
      const atlas = recolored();
      const f = frameAt(now);
      if (atlas) ctx.drawImage(atlas, f.frame * 48, (f.row + dir) * 56, 48, 56, x, y, 48 * sc, 56 * sc);
      else { ctx.fillStyle = '#e9cf98'; ctx.font = '600 14px Georgia, serif'; ctx.textAlign = 'center'; ctx.fillText('Preview loading…', W / 2, H / 2); }
      if (api.onPose) api.onPose(f.k);
      raf = requestAnimationFrame(draw);
    }
    const api = {
      setLook(l) { look = Object.assign({}, look, l); },
      rotate(d) { dir = (dir + d + 8) % 8; },
      dirName: () => PREVIEW_DIRS[dir],
      setPose(p) { pose = p; t0 = performance.now(); },
      stop() { alive = false; cancelAnimationFrame(raf); },
      start() { alive = true; raf = requestAnimationFrame(draw); },
      ready: () => !!recolored(),
    };
    return api;
  }

  ui.registerScreen('creation', () => {
    const start = Object.assign({}, LOOK_DEFAULT, safe(() => (chosenLook ? Object.assign({}, chosenLook) : {}), {})); // eslint-disable-line no-undef
    let look = Object.assign({}, start), name = '';
    const p = ui.panel({ title: 'Create your witch', subtitle: 'You can’t change this later — but every choice suits the moon.', icon: 'sparkle', cls: 'mm-panel-create', foot: true, onClose: () => back() });
    const cv = h('canvas', { class: 'mm-preview-cv', width: 192, height: 232, role: 'img', 'aria-label': 'Animated preview of your witch' });
    const prev = makePreview(cv);
    const poseLbl = h('span', { class: 'mm-pose-lbl', 'aria-live': 'off' }, 'Idle');
    prev.onPose = (k) => { const t = { idle: 'Idle', walk: 'Walking', cast: 'Casting' }[k]; if (poseLbl.textContent !== t) poseLbl.textContent = t; };
    const dirLbl = h('span', { class: 'mm-dir-lbl' }, 'Facing S');
    const rotL = ui.button('', () => { prev.rotate(1); dirLbl.textContent = 'Facing ' + prev.dirName(); }, { cls: 'mm-btn-icon', icon: 'left', aria: 'Turn left', sound: 'ui_move' });
    const rotR = ui.button('', () => { prev.rotate(-1); dirLbl.textContent = 'Facing ' + prev.dirName(); }, { cls: 'mm-btn-icon', icon: 'right', aria: 'Turn right', sound: 'ui_move' });
    const poseSeg = ui.segmented('Preview animation', [['cycle', 'All'], ['idle', 'Idle'], ['walk', 'Walk'], ['cast', 'Cast']], 'cycle', (v) => prev.setPose(v));
    const preview = h('div', { class: 'mm-preview' }, h('div', { class: 'mm-preview-stage' }, h('i', { class: 'mm-preview-moon', 'aria-hidden': 'true' }), cv, poseLbl), h('div', { class: 'mm-preview-ctl' }, rotL, dirLbl, rotR), poseSeg);

    const nameIn = h('input', { type: 'text', class: 'mm-input', id: 'mm-name', maxlength: '24', autocomplete: 'off', spellcheck: 'false', placeholder: 'e.g. Hazel', 'aria-describedby': 'mm-name-msg', 'aria-required': 'true', 'data-autofocus': '1' });
    const nameMsg = h('small', { class: 'mm-field-msg', id: 'mm-name-msg', 'aria-live': 'polite' }, '1–16 characters');
    const count = h('small', { class: 'mm-field-count' }, '0 / 16');
    let touched = false;
    const checkName = (show) => {
      const v = ui.validateName(nameIn.value);
      count.textContent = [...v.name].length + ' / 16';
      const showErr = (show || touched) && !v.ok;
      nameIn.setAttribute('aria-invalid', String(showErr));
      nameMsg.textContent = showErr ? v.msg : '1–16 characters';
      nameMsg.classList.toggle('mm-bad', showErr);
      return v;
    };
    nameIn.addEventListener('input', () => { name = nameIn.value; checkName(false); });
    nameIn.addEventListener('blur', () => { if (nameIn.value) { touched = true; checkName(false); } });

    const swatchGroups = {};
    const group = (g, label) => {
      const opts = LOOK_LABELS[g];
      const wrap = h('div', { class: g === 'style' ? 'mm-seg mm-style-seg' : 'mm-swatches', role: 'radiogroup', 'aria-label': label });
      opts.forEach(([v, l, col]) => {
        const pal = safe(() => PALETTES[g][v], null); // eslint-disable-line no-undef
        const color = pal ? '#' + (g === 'outfit' ? pal[3] : pal[0]) : col;
        const b = g === 'style'
          ? h('button', { type: 'button', class: 'mm-seg-btn', role: 'radio', 'aria-checked': String(look[g] === v), 'data-value': v }, l)
          : h('button', { type: 'button', class: 'mm-swatch', role: 'radio', 'aria-checked': String(look[g] === v), 'data-value': v, 'aria-label': l + ' ' + (g === 'outfit' ? 'outfit' : g), title: l, style: { '--sw': color } });
        b.addEventListener('click', () => { pick(g, v); ui.sfx('ui_move'); });
        wrap.appendChild(b);
      });
      swatchGroups[g] = wrap;
      return h('div', { class: 'mm-field' }, h('span', { class: 'mm-field-label' }, label), wrap);
    };
    function pick(g, v) {
      look[g] = v;
      swatchGroups[g].querySelectorAll('[role=radio]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.value === v)));
      prev.setLook(look);
    }
    const rand = ui.button('Surprise me', () => {
      for (const g of Object.keys(LOOK_LABELS)) { const o = LOOK_LABELS[g]; pick(g, o[Math.floor(Math.random() * o.length)][0]); }
    }, { icon: 'sparkle', cls: 'mm-btn-ghost mm-btn-small', sound: 'ui_move' });
    const opts = h('div', { class: 'mm-create-opts' },
      h('div', { class: 'mm-field' }, h('label', { class: 'mm-field-label', for: 'mm-name' }, 'Name'), nameIn, h('div', { class: 'mm-field-row' }, nameMsg, count)),
      group('style', 'Body style'), group('skin', 'Skin'), group('hair', 'Hair'), group('outfit', 'Hat & outfit'), rand);
    p.body.appendChild(h('div', { class: 'mm-create' }, preview, opts));
    const backB = ui.button('Back', () => back(), { icon: 'left', cls: 'mm-btn-ghost', silent: true, id: 'creation-back' });
    const goB = ui.button('Begin Journey', () => confirm(), { icon: 'moon', cls: 'mm-btn-primary', id: 'creation-confirm' });
    p.foot.append(backB, goB);
    prev.setLook(look);

    const dirty = () => !!nameIn.value.trim() || Object.keys(look).some((k) => look[k] !== start[k]);
    async function back() {
      if (dirty() && !(await ui.confirm({ title: 'Discard your witch?', body: 'Your name and appearance choices will be lost.', yes: 'Discard', no: 'Keep editing', danger: true }))) return true;
      ui.sfx('ui_back');
      ui.close('creation', { silent: true, noSync: true });
      ui.go('title');
      if (!ui.isOpen('title')) ui.open('title');
      return true;
    }
    function confirm() {
      touched = true;
      const v = checkName(true);
      if (!v.ok) { ui.sfx('ui_error'); nameIn.focus(); nameIn.classList.remove('mm-shake'); void nameIn.offsetWidth; nameIn.classList.add('mm-shake'); return; }
      const finalLook = Object.assign({}, look);
      // apply to the baseline renderer (also persists 'moss-moon-look')
      for (const g of ['style', 'skin', 'hair', 'outfit']) ui.base.call('chooseLook', g, finalLook[g]);
      safe(() => localStorage.setItem('moss-moon-name', JSON.stringify(v.name)));
      prev.stop();
      ui.closeAll({ noSync: true });
      showSky(false);
      if (MM.game && typeof MM.game.newGame === 'function') safe(() => MM.game.newGame({ name: v.name, look: finalLook }));
      else { MM.game = MM.game || {}; MM.game.name = v.name; } // FALLBACK (no core): keep the name for the HUD
      if (['creation', 'title', 'boot'].includes(ui.state().current)) ui.go('play');
      if (MM.campaign && typeof MM.campaign.start === 'function') safe(() => MM.campaign.start());
    }
    const inst = {
      el: p.el, state: 'creation', label: 'Character creation',
      back() { back(); return true; },
      onOpen() { showSky(true); prev.start(); },
      onClose() { prev.stop(); showSky(false); },
      submit: confirm,
      _test: { look: () => Object.assign({}, look), pick },
    };
    return inst;
  });

  // ============================================================ DIALOGUE
  const PORTRAIT_COLORS = { marrow: ['#6c8fb8', '#2c3f5c'], pip: ['#d39a5a', '#5e3b1e'], wren: ['#8cc08a', '#2f5534'] };
  function initials(n) { return String(n || '?').split(/\s+/).filter((w) => /^\p{L}/u.test(w) && !/^(the|of)$/i.test(w)).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?'; }
  function hue(n) { let x = 0; for (const c of String(n)) x = (x * 31 + c.codePointAt(0)) >>> 0; return x % 360; }
  ui.registerScreen('dialogue', (a) => {
    const script = a.script || {};
    const pages = Array.isArray(script) ? script : typeof script === 'string' ? [{ text: script }] : (script.pages || [{ text: script.text || '' }]);
    const el = h('div', { class: 'mm-dialogue-screen' });
    const portrait = h('div', { class: 'mm-portrait', 'aria-hidden': 'true' });
    const nameEl = h('div', { class: 'mm-dlg-name' });
    const textEl = h('p', { class: 'mm-dlg-text', 'aria-live': 'polite' });
    const choicesEl = h('div', { class: 'mm-dlg-choices', role: 'group', 'aria-label': 'Responses' });
    const more = h('button', { type: 'button', class: 'mm-dlg-next', 'aria-label': 'Continue' }, h('span', null, 'Continue'), ui.icon('right'));
    const box = h('section', { class: 'mm-dlg mm-frame' }, h('i', { class: 'mm-corner mm-c1' }), h('i', { class: 'mm-corner mm-c2' }), h('i', { class: 'mm-corner mm-c3' }), h('i', { class: 'mm-corner mm-c4' }), portrait, h('div', { class: 'mm-dlg-main' }, nameEl, textEl, choicesEl, h('div', { class: 'mm-dlg-foot' }, more)));
    el.appendChild(box);
    let i = 0, full = '', shown = 0, timer = 0, done = false, chosen = null;
    const inst = { el, state: 'dialogue', label: 'Dialogue', quiet: true };
    function speakerOf(pg) { return pg.speaker || script.speaker || ''; }
    function setPortrait(pg) {
      const sp = speakerOf(pg), id = String(pg.portrait || script.portrait || script.npcId || sp).toLowerCase();
      portrait.innerHTML = '';
      const art = MM.art;
      const artName = pg.portrait || script.portrait;
      if (artName && art && safe(() => art.has(artName), false)) {
        const c = h('canvas', { width: 96, height: 96 }); const cx = c.getContext('2d'); cx.imageSmoothingEnabled = false;
        const f = art.get(artName); const sc = Math.max(1, Math.floor(Math.min(88 / f.w, 88 / f.h)));
        safe(() => art.draw(cx, artName, 48, 48 + (f.h * sc) / 2, { scale: sc }));
        portrait.appendChild(c);
      } else {
        const key = Object.keys(PORTRAIT_COLORS).find((k) => id.includes(k));
        const [c1, c2] = key ? PORTRAIT_COLORS[key] : ['hsl(' + hue(sp) + ' 35% 55%)', 'hsl(' + hue(sp) + ' 40% 22%)'];
        portrait.style.setProperty('--p1', c1); portrait.style.setProperty('--p2', c2);
        portrait.appendChild(h('span', null, initials(sp)));
      }
      portrait.hidden = !sp;
    }
    function render() {
      const pg = pages[i] || { text: '' };
      nameEl.textContent = speakerOf(pg);
      nameEl.hidden = !speakerOf(pg);
      setPortrait(pg);
      full = String(pg.text || '');
      shown = 0; done = false;
      choicesEl.innerHTML = ''; choicesEl.hidden = true; more.hidden = true;
      clearInterval(timer);
      if (ui.reducedMotion || a.instant) finish();
      else timer = setInterval(() => { shown += 2; if (shown >= full.length) finish(); else textEl.textContent = full.slice(0, shown); }, 30);
      textEl.textContent = ui.reducedMotion ? full : '';
    }
    function finish() {
      clearInterval(timer); done = true; textEl.textContent = full;
      const pg = pages[i] || {};
      if (pg.choices && pg.choices.length) {
        choicesEl.hidden = false;
        pg.choices.forEach((c, n) => {
          const b = ui.button(c.label, () => choose(c), { cls: 'mm-choice', key: String(n + 1) });
          if (n === 0) b.dataset.autofocus = '1';
          choicesEl.appendChild(b);
        });
        requestAnimationFrame(() => ui.focusFirst(choicesEl));
      } else {
        more.hidden = false;
        more.querySelector('span').textContent = i < pages.length - 1 ? 'Continue' : 'Close';
        requestAnimationFrame(() => { if (ui.top() === inst) more.focus(); });
      }
    }
    function advance() {
      if (!done) { finish(); return; }
      const pg = pages[i] || {};
      if (pg.choices && pg.choices.length) return;
      if (i < pages.length - 1) { i++; ui.sfx('ui_move'); render(); } else ui.close();
    }
    function choose(c) { chosen = c.action != null ? c.action : c.label; ui.close(undefined, { silent: true }); }
    more.addEventListener('click', (e) => { e.stopPropagation(); advance(); });
    box.addEventListener('click', (e) => { if (!e.target.closest('button')) advance(); });
    inst.onKey = (e) => {
      const k = e.key;
      if (k === ' ' || k === 'Enter') { if (!done || !e.target.closest('.mm-choice')) { if (!(pages[i] && pages[i].choices && done)) { if (!e.repeat) advance(); return true; } } return false; }
      if (/^[1-9]$/.test(k) && done) { const b = choicesEl.querySelectorAll('button')[Number(k) - 1]; if (b) { b.click(); return true; } }
      return false;
    };
    inst.back = () => { if (!done) { finish(); return true; } if (script.closable === false && pages[i] && pages[i].choices) return true; chosen = null; ui.close(); return true; };
    inst.onOpen = render;
    inst.onClose = () => { clearInterval(timer); a.resolve && a.resolve(chosen); };
    return inst;
  });
  ui.dialogue = function (script) {
    return new Promise((resolve) => {
      const inst = ui.open('dialogue', { script, resolve: (action) => {
        resolve(action);
        if (action != null && script && script.npcId && MM.campaign && typeof MM.campaign.choose === 'function') {
          setTimeout(() => {
            const next = safe(() => MM.campaign.choose(script.npcId, action), null);
            if (next && (next.pages || next.text)) ui.dialogue(Object.assign({ npcId: script.npcId }, next));
          }, 0);
        }
      }, allowDuplicate: true });
      if (!inst) resolve(null);
    });
  };
  ui.talk = function (npcId) { const s = ui.camp('dialogue', npcId); if (s) return ui.dialogue(Object.assign({ npcId }, s)); return Promise.resolve(null); };

  // ============================================================ DUNGEON SUMMARY
  function fmtTime(sec) { sec = Math.max(0, Math.round(sec || 0)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); }
  ui.registerScreen('dungeonSummary', (a) => {
    const d = a.data || a || {};
    const p = ui.panel({ title: d.title || 'Dungeon Cleared', subtitle: [d.regionName || (d.region && D.regionName(d.region)), d.floors ? d.floors + ' floors' : null].filter(Boolean).join(' · ') || 'The darkness lifts', icon: 'crown', cls: 'mm-panel-summary', foot: true });
    const stat = (icon, label, val) => h('div', { class: 'mm-stat' }, ui.icon(icon), h('strong', null, String(val)), h('small', null, label));
    const loot = Array.isArray(d.loot) ? d.loot : [];
    p.body.append(
      h('div', { class: 'mm-stat-grid' }, stat('hourglass', 'Time', fmtTime(d.time)), stat('sword', 'Defeated', d.kills || 0), stat('star', 'Experience', '+' + (d.xp || 0)), stat('coin', 'Gold', '+' + (d.gold || 0))),
      d.boss ? h('p', { class: 'mm-summary-line' }, ui.icon('crown'), (typeof d.boss === 'string' ? d.boss : 'The guardian') + ' has fallen.') : null,
      d.fragment ? h('p', { class: 'mm-summary-line mm-good' }, ui.icon('moon'), 'You recovered a Lunar Fragment!') : null,
      h('h4', { class: 'mm-group-title' }, 'Loot'),
      loot.length ? h('div', { class: 'mm-loot' }, loot.map((it) => h('div', { class: 'mm-loot-item', tabindex: '0', title: it.desc || it.name }, ui.itemIcon(it, 28), h('span', null, it.name || it.id), it.count > 1 ? h('b', null, '×' + it.count) : null))) : h('p', { class: 'mm-note' }, typeof d.loot === 'number' ? d.loot + ' items collected.' : 'No items this time.'));
    const c = ui.button('Continue', () => ui.close(), { cls: 'mm-btn-primary', icon: 'play', silent: true });
    c.dataset.autofocus = '1';
    p.foot.appendChild(c);
    return { el: p.el, label: 'Dungeon summary', onOpen: () => ui.sfx('quest_complete') };
  });

  // ============================================================ DEFEAT — Moonlit Recovery
  ui.registerScreen('defeat', (a) => {
    const d = a.data || a || {};
    const w = ui.base.world();
    const lost = d.goldLost != null ? d.goldLost : null;
    const el = h('div', { class: 'mm-defeat-screen' });
    const p = ui.panel({ title: 'Moonlit Recovery', subtitle: 'The moon would not let you fall alone.', icon: 'moon', cls: 'mm-panel-defeat', close: false, foot: true });
    p.body.append(
      h('p', { class: 'mm-defeat-lead' }, 'Your strength gave out' + (d.region ? ' in ' + D.regionName(d.region) : '') + '. A soft silver light carried you home, and you wake by the cottage hearth.'),
      h('ul', { class: 'mm-penalty' },
        h('li', { class: 'mm-bad' }, ui.icon('coin'), lost != null ? 'You dropped ' + lost + ' gold on the way home.' : 'You lose 15% of your gold (at most 25g).'),
        h('li', { class: 'mm-good' }, ui.icon('check'), 'Story items, fragments, equipment and seeds are all safe.'),
        h('li', { class: 'mm-good' }, ui.icon('heart'), 'Health and mana are restored.')),
      w ? h('p', { class: 'mm-note' }, ui.icon('coin'), 'Gold now: ' + Math.floor(w.gold || 0)) : null);
    const home = ui.button('Wake at the Homestead', () => recover(false), { cls: 'mm-btn-primary', icon: 'home', id: 'defeat-home' });
    home.dataset.autofocus = '1';
    const canRetry = ui.hasCamp('retry') || (d.region && !['grove', 'village'].includes(d.region));
    const retry = canRetry ? ui.button('Retry ' + (d.region ? D.regionName(d.region) : 'encounter'), () => recover(true), { icon: 'retry', id: 'defeat-retry' }) : null;
    p.foot.append(retry, home);
    function recover(again) {
      ui.closeAll({ noSync: true });
      if (MM.game && typeof MM.game.respawnHome === 'function') safe(() => MM.game.respawnHome());
      if (ui.stateIs('defeat')) ui.go('play');
      if (again) { if (ui.hasCamp('retry')) ui.camp('retry', d); else ui.travelTo(d.region); }
    }
    el.appendChild(p.el);
    return { el, state: 'defeat', label: 'Moonlit Recovery', noEscape: true, onOpen: () => ui.sfx('defeat') };
  });

  // ============================================================ CAMPAIGN COMPLETE
  const STAT_LABELS = { playTime: ['hourglass', 'Time played'], days: ['sun', 'Days passed'], kills: ['sword', 'Monsters calmed'], harvested: ['wheat', 'Crops harvested'], potions: ['potion', 'Potions brewed'], brewed: ['potion', 'Potions brewed'], quests: ['scroll', 'Requests fulfilled'], requests: ['scroll', 'Requests fulfilled'], deaths: ['moon', 'Moonlit recoveries'], defeats: ['moon', 'Moonlit recoveries'], gold: ['coin', 'Gold earned'], spells: ['sparkle', 'Spells cast'], casts: ['sparkle', 'Spells cast'] };
  ui.registerScreen('campaignComplete', (a) => {
    const st = Object.assign({}, safe(() => MM.campaign.state.stats, {}) || {}, (a && a.stats) || {});
    const w = ui.base.world();
    if (w) { if (st.kills == null) st.kills = w.kills; if (st.harvested == null) st.harvested = w.harvested; if (st.days == null) st.days = w.day; }
    const p = ui.panel({ title: 'The Moonwell Shines Again', subtitle: 'Moonflower Grove is whole once more — thanks to ' + D.playerName() + '.', icon: 'moon', cls: 'mm-panel-summary mm-panel-ending', close: false, foot: true });
    const grid = h('div', { class: 'mm-stat-grid' });
    Object.entries(st).forEach(([k, v]) => {
      if (typeof v !== 'number') return;
      const [ic, label] = STAT_LABELS[k] || ['star', k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())];
      grid.appendChild(h('div', { class: 'mm-stat' }, ui.icon(ic), h('strong', null, k === 'playTime' ? fmtTime(v) : Math.round(v).toLocaleString()), h('small', null, label)));
    });
    p.body.append(h('p', { class: 'mm-defeat-lead' }, 'The fragments are home, the grove glows at night, and the village sings again. The garden still needs tending, and the old crypt still whispers…'), grid);
    const cont = ui.button('Continue Playing', () => { ui.closeAll({ noSync: true }); showSky(false); ui.go('play'); }, { cls: 'mm-btn-primary', icon: 'play', id: 'ending-continue' });
    cont.dataset.autofocus = '1';
    const mem = D.memories().length ? ui.button('Memories', () => ui.open('memories'), { icon: 'film' }) : null;
    p.foot.append(mem, cont);
    return { el: p.el, state: 'ending', label: 'Campaign complete', noEscape: true, onOpen: () => { showSky(true); ui.sfx('quest_complete'); }, onClose: () => showSky(false) };
  });

  // ============================================================ LOADING card (state 'loading')
  const TIPS = ['Rain waters every plot in the garden.', 'Moonflowers grow faster under the night sky.', 'Frost on a soaked enemy freezes it in place.', 'Potions restore both health and mana.', 'Pip restocks seeds every morning.', 'Thornbind roots block melee attackers.'];
  ui.showLoading = function (on, data) {
    const L = ui.layers.loading;
    if (on) {
      const label = (data && (data.label || data.text)) || (data && data.region ? 'Travelling to ' + D.regionName(data.region) : 'Loading');
      L.innerHTML = '';
      L.appendChild(h('div', { class: 'mm-loading-card mm-frame' }, h('i', { class: 'mm-corner mm-c1' }), h('i', { class: 'mm-corner mm-c2' }), h('i', { class: 'mm-corner mm-c3' }), h('i', { class: 'mm-corner mm-c4' }),
        h('div', { class: 'mm-loader', 'aria-hidden': 'true' }, ui.icon('moon')), h('strong', null, label + '…'), h('small', null, TIPS[Math.floor(Math.random() * TIPS.length)])));
      L.classList.add('mm-on');
    } else L.classList.remove('mm-on');
  };

  // ============================================================ state wiring
  let pendingDefeat = null;
  ui.onState = function (d) {
    const to = d && d.to, from = d && d.from;
    const r = ui.root();
    r.className = r.className.replace(/\bmm-state-\S+/g, '').trim() + ' mm-state-' + to;
    if (from === 'loading' && to !== 'loading') ui.showLoading(false);
    switch (to) {
      case 'title':
        if (!ui.isOpen('title')) { ui.closeAll({ noSync: true }); ui.open('title'); }
        showSky(true);
        break;
      case 'creation':
        if (!ui.isOpen('creation')) { ui.closeAll({ noSync: true }); ui.open('creation'); }
        break;
      case 'play':
        if (ui.stack.length) ui.closeAll({ noSync: true });
        showSky(false);
        if (pendingDefeat && from === 'cine') { /* defeat cine finished and campaign returned to play: nothing to show */ pendingDefeat = null; }
        break;
      case 'menu':
        if (!ui.stack.length) ui.open('pause');
        break;
      case 'loading':
        ui.showLoading(true, d.data);
        break;
      case 'defeat':
        if (!ui.isOpen('defeat')) { ui.closeAll({ noSync: true }); ui.open('defeat', { data: Object.assign({}, pendingDefeat || {}, d.data || {}) }); }
        pendingDefeat = null;
        break;
      case 'ending':
        if (!ui.isOpen('campaignComplete')) { ui.closeAll({ noSync: true }); ui.open('campaignComplete', d.data || {}); }
        break;
      default: break;
    }
    if (from === 'cine' && to !== 'cine') { const t = ui.top(); if (t) setTimeout(() => ui.focusFirst(t.el), 30); }
    if (ui.hud) ui.hud.update(true);
    if (ui.input) ui.input.onState(d);
  };

  ui.screensInit = function () {
    ui.buildSky();
    ui.on('state', ui.onState);
    ui.on('toast', (d) => { if (d) ui.toast(d.text || d, d.kind); });
    ui.on('save:error', (d) => {
      ui.saveError = d || {};
      const t = ui.get('title');
      if (t && ui.top() === t) t.refresh();
      else if (!t) ui.toast('Your save data could not be read — starting fresh.', 'warn');
    });
    ui.on('dungeon:complete', (d) => ui.open('dungeonSummary', { data: d || {} }));
    ui.on('defeat', (d) => {
      pendingDefeat = d || {};
      const cur = ui.state().current;
      if (cur === 'play' || cur === 'menu') ui.open('defeat', { data: pendingDefeat });
    });
    ui.on('ending', (d) => { if (!ui.stateIs('cine') && !ui.isOpen('campaignComplete')) ui.open('campaignComplete', d || {}); });
    ui.on('memory', () => { const t = ui.get('title'); if (t) t.refresh(); });
  };
})();
