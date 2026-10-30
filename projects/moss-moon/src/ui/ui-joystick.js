/* Moss & Moon — on-screen analog joystick + touch action cluster (owner: UI agent).
 * Floating or fixed stick (settings joystickMode/joystickSize/joystickSide/haptics), pointer events for touch, mouse
 * and pen with setPointerCapture, multi-touch safe next to the action buttons, deadzone + smooth return.
 * Output: MM.input.setAxis(x, y, 'joystick') (screen space, |v| ≤ 1); 8-way MM.input.touch FALLBACK until CORE has setAxis.
 * Visible only when touchControls resolves on, the current state simulates (sim !== 'none') and no UI modal is open. */
(function () {
  'use strict';
  const MM = window.MM, ui = MM && MM.ui;
  if (!ui || ui.joystick) return;
  const { h, safe, clamp } = ui;
  const J = ui.joystick = { id: null, active: false, x: 0, y: 0, out: { x: 0, y: 0 } };
  const DEADZONE = 0.14, BASE = 140; // px at joystickSize 1

  const SVG_BASE = '<svg viewBox="0 0 140 140" aria-hidden="true" focusable="false">' +
    '<defs><radialGradient id="mmJoyGlass" cx="50%" cy="42%" r="60%"><stop offset="0" stop-color="#24504f" stop-opacity=".55"/><stop offset=".7" stop-color="#0e2427" stop-opacity=".72"/><stop offset="1" stop-color="#081619" stop-opacity=".82"/></radialGradient></defs>' +
    '<circle cx="70" cy="70" r="66" fill="url(#mmJoyGlass)"/>' +
    '<circle cx="70" cy="70" r="66" fill="none" stroke="#cfaa71" stroke-opacity=".75" stroke-width="2"/>' +
    '<circle cx="70" cy="70" r="60" fill="none" stroke="#cfaa71" stroke-opacity=".28" stroke-width="1"/>' +
    '<circle cx="70" cy="70" r="30" fill="none" stroke="#ecd29b" stroke-opacity=".22" stroke-width="1" stroke-dasharray="3 4"/>' +
    [0, 45, 90, 135, 180, 225, 270, 315].map((a) => '<path transform="rotate(' + a + ' 70 70)" d="' + (a % 90 ? 'M70 8v5' : 'M66 9l4-5 4 5-4 3z') + '" fill="#ecd29b" fill-opacity="' + (a % 90 ? '.45' : '.85') + '" stroke="#ecd29b" stroke-opacity=".5" stroke-width="1"/>').join('') +
    [45, 135, 225, 315].map((a) => '<path transform="rotate(' + a + ' 70 70)" d="M70 17c-4 3-4 7 0 9 4-2 4-6 0-9z" fill="#9fd197" fill-opacity=".45"/>').join('') +
    '<g class="mm-joy-arc"><path d="M38 22a58 58 0 0 1 64 0" fill="none" stroke="#ecd29b" stroke-width="5" stroke-linecap="round"/></g>' +
    '</svg>';
  const SVG_THUMB = '<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">' +
    '<defs><radialGradient id="mmJoyOrb" cx="38%" cy="32%" r="70%"><stop offset="0" stop-color="#fff3d2"/><stop offset=".45" stop-color="#e2c084"/><stop offset="1" stop-color="#94703c"/></radialGradient></defs>' +
    '<circle cx="32" cy="32" r="29" fill="url(#mmJoyOrb)" stroke="#f6e2b2" stroke-width="2"/>' +
    '<circle cx="32" cy="32" r="22" fill="none" stroke="#5b4220" stroke-opacity=".35" stroke-width="1"/>' +
    '<path d="M36.5 20a12.5 12.5 0 1 0 7.5 20.6 10.4 10.4 0 0 1-7.5-20.6z" fill="#3b2a10" fill-opacity=".55"/>' +
    '</svg>';

  // ---------------------------------------------------------------- settings
  const cfg = () => ({
    size: clamp(Number(ui.setting('joystickSize')) || 1, 0.8, 1.4),
    side: ui.setting('joystickSide') === 'right' ? 'right' : 'left',
    mode: ui.setting('joystickMode') === 'fixed' ? 'fixed' : 'floating',
    haptics: ui.setting('haptics') !== false,
  });
  function buzz(ms) { const c = cfg(); if (c.haptics && navigator.vibrate) safe(() => navigator.vibrate(ms)); }
  J.enabled = function () {
    const m = ui.setting('touchControls');
    if (m === 'on') return true;
    if (m === 'off') return false;
    return !!((ui.input && ui.input.touchSeen) || safe(() => matchMedia('(pointer: coarse)').matches, false));
  };
  const shouldShow = () => J.enabled() && ui.inGameplay() && !ui.isOpen() && !['cine', 'loading'].includes(ui.state().current);

  // ---------------------------------------------------------------- DOM
  let E = null;
  J.build = function () {
    const L = ui.layers.touch;
    L.innerHTML = '';
    const base = h('div', { class: 'mm-joy', 'aria-hidden': 'true' });
    base.innerHTML = SVG_BASE;
    const thumb = h('div', { class: 'mm-joy-thumb' });
    thumb.innerHTML = SVG_THUMB;
    base.appendChild(thumb);
    const zone = h('div', { class: 'mm-joyzone', 'aria-hidden': 'true' }, base);
    const btn = (name, icon, label, cls, glyphAction) => {
      const b = h('button', { type: 'button', class: 'mm-tbtn ' + cls, 'aria-label': label, 'data-act': name }, ui.icon(icon), h('span', null, label));
      let pid = null;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        pid = e.pointerId; safe(() => b.setPointerCapture(e.pointerId));
        b.classList.add('mm-pressed'); buzz(10);
        if (ui.input) ui.input.action(name);
      });
      const up = (e) => { if (e.pointerId === pid) { pid = null; b.classList.remove('mm-pressed'); } };
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => b.addEventListener(ev, up));
      b.addEventListener('click', (e) => { if (e.detail === 0 && ui.input) ui.input.action(name); }); // keyboard / assistive activation
      b.dataset.glyph = glyphAction || name;
      return b;
    };
    const cast = btn('cast', 'sparkle', 'Cast', 'mm-tbtn-cast');
    const cluster = h('div', { class: 'mm-tacts', role: 'group', 'aria-label': 'Touch actions' },
      cast, btn('interact', 'hand', 'Use', 'mm-tbtn-use'), btn('broom', 'broom', 'Broom', 'mm-tbtn-broom'), btn('potion', 'potion', 'Potion', 'mm-tbtn-potion'),
      btn('spellNext', 'retry', 'Swap', 'mm-tbtn-swap'), btn('pause', 'pause', 'Pause', 'mm-tbtn-pause'));
    L.append(zone, cluster);
    E = { L, zone, base, thumb, cluster, cast };
    wire();
    J.apply();
  };

  // Rest position (base centre) in viewport px.
  function restCenter() {
    const c = cfg(), r = (BASE * c.size) / 2;
    const st = getComputedStyle(ui.root());
    const sl = parseFloat(st.getPropertyValue('--joy-inset-x')) || 0, sb = parseFloat(st.getPropertyValue('--joy-inset-y')) || 0;
    const mx = 22 + sl + r, my = 22 + sb + r;
    return { x: c.side === 'left' ? mx : window.innerWidth - mx, y: window.innerHeight - my };
  }
  function placeBase(cx, cy) {
    const r = E.base.offsetWidth / 2 || (BASE * cfg().size) / 2;
    E.base.style.left = Math.round(cx - r) + 'px';
    E.base.style.top = Math.round(cy - r) + 'px';
    J.cx = cx; J.cy = cy;
  }
  J.apply = function () {
    if (!E) return;
    const c = cfg();
    const r = ui.root();
    r.style.setProperty('--joy-size', (BASE * c.size).toFixed(0) + 'px');
    E.L.dataset.side = c.side;
    E.L.dataset.mode = c.mode;
    E.cluster.dataset.side = c.side === 'left' ? 'right' : 'left';
    if (!J.active) { const p = restCenter(); placeBase(p.x, p.y); }
    J.update();
  };

  // ---------------------------------------------------------------- stick logic
  function emit(x, y) {
    const rx = Math.round(x * 100) / 100, ry = Math.round(y * 100) / 100;
    if (rx === J.out.x && ry === J.out.y) return;
    J.out = { x: rx, y: ry };
    if (ui.input) ui.input.setAxis(rx, ry, 'joystick');
  }
  function move(e) {
    const c = cfg(), R = (BASE * c.size) / 2;
    let dx = e.clientX - J.cx, dy = e.clientY - J.cy;
    let d = Math.hypot(dx, dy);
    if (c.mode === 'floating' && d > R * 1.3) {
      // drag the base along so the stick never "runs out"
      const k = (d - R * 1.3) / d; placeBase(J.cx + dx * k, J.cy + dy * k);
      dx = e.clientX - J.cx; dy = e.clientY - J.cy; d = Math.hypot(dx, dy);
    }
    let vx = dx / R, vy = dy / R;
    const m = Math.hypot(vx, vy);
    if (m > 1) { vx /= m; vy /= m; }
    const mm = Math.min(1, m);
    const lim = R * 0.6;
    E.thumb.style.transform = 'translate(' + (vx * lim).toFixed(1) + 'px,' + (vy * lim).toFixed(1) + 'px)';
    const out = mm < DEADZONE ? 0 : (mm - DEADZONE) / (1 - DEADZONE);
    const ox = mm > 0 ? (vx / Math.max(mm, 1e-6)) * out : 0, oy = mm > 0 ? (vy / Math.max(mm, 1e-6)) * out : 0;
    E.base.style.setProperty('--joy-ang', (Math.atan2(vy, vx) * 180 / Math.PI + 90).toFixed(1) + 'deg');
    E.base.style.setProperty('--joy-mag', out.toFixed(2));
    J.x = ox; J.y = oy;
    emit(ox, oy);
  }
  J.release = function () {
    const was = J.active;
    J.active = false;
    if (J.id != null && J.cap) { const cap = J.cap, id = J.id; J.id = null; safe(() => cap.releasePointerCapture(id)); }
    J.id = null; J.x = J.y = 0;
    if (E) {
      E.base.classList.remove('mm-active');
      E.thumb.style.transform = '';
      E.base.style.setProperty('--joy-mag', '0');
      const p = restCenter();
      placeBase(p.x, p.y);
    }
    if (was || J.out.x || J.out.y) { J.out = { x: NaN, y: NaN }; emit(0, 0); }
  };
  function wire() {
    const z = E.zone;
    z.addEventListener('pointerdown', (e) => {
      if (J.id != null || !shouldShow()) return;
      const c = cfg(), R = (BASE * c.size) / 2;
      if (c.mode === 'fixed') {
        const p = restCenter();
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > R * 1.35) return;
        placeBase(p.x, p.y);
      } else {
        // floating: the base appears under the finger (kept fully on screen)
        const x = clamp(e.clientX, R + 6, window.innerWidth - R - 6), y = clamp(e.clientY, R + 6, window.innerHeight - R - 6);
        placeBase(x, y);
      }
      e.preventDefault(); e.stopPropagation();
      J.id = e.pointerId; J.active = true;
      J.cap = c.mode === 'fixed' ? E.base : z;
      safe(() => J.cap.setPointerCapture(e.pointerId));
      E.base.classList.add('mm-active');
      if (ui.input) ui.input.touchSeen = ui.input.touchSeen || e.pointerType === 'touch';
      buzz(6);
      move(e);
    });
    z.addEventListener('pointermove', (e) => { if (e.pointerId === J.id) { e.preventDefault(); move(e); } });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => z.addEventListener(ev, (e) => { if (e.pointerId === J.id) J.release(); }));
    z.addEventListener('contextmenu', (e) => e.preventDefault());
    E.cluster.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  window.addEventListener('blur', () => J.release());
  document.addEventListener('visibilitychange', () => { if (document.hidden) J.release(); });
  window.addEventListener('resize', () => { if (!J.active) J.apply(); });

  J.update = function () {
    if (!E) return;
    const on = J.enabled();
    ui.root().classList.toggle('mm-touch', on);
    const show = shouldShow();
    E.L.classList.toggle('mm-hidden', !show);
    if (!show && (J.active || J.out.x || J.out.y)) J.release();
    const sel = ui.data.spells().find((s) => s.selected);
    if (sel) E.cast.style.setProperty('--spell', ui.spellStyle(sel).color);
  };

  ui.on('state', () => { J.release(); J.update(); });
  ui.on('ui:open', () => { J.release(); J.update(); });
  ui.on('ui:close', () => J.update());
  ui.on('settings', () => J.apply());
})();
