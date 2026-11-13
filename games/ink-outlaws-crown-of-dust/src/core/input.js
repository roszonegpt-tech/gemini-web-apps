/* Crown of Dust - input (src/core/input.js). Keyboard, mouse and the touch pad all feed the same action names. */
(function () {
'use strict';
const CD = window.CD, U = CD.U;
const I = CD.Input = {keys: {}, edge: {}, mouse: {x: 0, y: 0, down: false, seen: false}, stick: {x: 0, y: 0}, lastWasMouse: false, enabled: true};
const MAP = {KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  KeyJ: 'attack', Space: 'roll', KeyK: 'roll', KeyF: 'special', KeyL: 'special', KeyQ: 'swap', KeyE: 'use', KeyB: 'use',
  Digit1: 'order1', Digit2: 'order2', Digit3: 'order3', Digit4: 'order4', Escape: 'pause', KeyP: 'pause', KeyM: 'mute'};
I.press = n => { I.edge[n] = true; };
I.hold = (n, v) => { if (v && !I.keys[n]) I.edge[n] = true; I.keys[n] = v; };
I.hit = n => { const v = !!I.edge[n]; I.edge[n] = false; return v; };
I.held = n => !!I.keys[n];
I.flush = () => { I.edge = {}; };
I.reset = () => { I.keys = {}; I.edge = {}; I.mouse.down = false; I.stick.x = I.stick.y = 0; };
/* movement vector: keys first, then the stick. returns [x, y, magnitude 0..1] */
I.axis = function () {
  const k = I.keys; let x = (k.right ? 1 : 0) - (k.left ? 1 : 0), y = (k.down ? 1 : 0) - (k.up ? 1 : 0);
  if (x || y) { const m = Math.hypot(x, y); return [x / m, y / m, 1]; }
  const m = Math.hypot(I.stick.x, I.stick.y); if (m > 0.2) return [I.stick.x / m, I.stick.y / m, Math.min(1, m)];
  return [0, 0, 0];
};
I.init = function (cv) {
  window.addEventListener('keydown', e => {
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
    const a = MAP[e.code]; if (!a) return;
    if (e.code.indexOf('Arrow') === 0 || e.code === 'Space') e.preventDefault();
    if (!e.repeat) I.edge[a] = true; I.keys[a] = true; if (a === 'attack') I.lastWasMouse = false;
  });
  window.addEventListener('keyup', e => { const a = MAP[e.code]; if (a) I.keys[a] = false; });
  window.addEventListener('blur', I.reset);
  const pos = e => { const r = cv.getBoundingClientRect(); I.mouse.x = e.clientX - r.left; I.mouse.y = e.clientY - r.top; };
  cv.addEventListener('pointerdown', e => { pos(e); if (e.pointerType === 'mouse') { I.mouse.seen = true; if (e.button === 2) I.edge.roll = true; else { I.hold('attack', true); I.lastWasMouse = true; } } I.edge.tap = true; I.tapX = I.mouse.x; I.tapY = I.mouse.y; e.preventDefault(); });
  cv.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') { pos(e); I.mouse.seen = true; } });
  window.addEventListener('pointerup', e => { if (e.pointerType === 'mouse' && e.button !== 2) I.keys.attack = false; });
  cv.addEventListener('contextmenu', e => e.preventDefault());
};
/* a held button on the touch pad */
I.bindHold = function (el, name) {
  el.addEventListener('pointerdown', e => { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (x) { /* synthetic pointer */ } I.hold(name, true); I.lastWasMouse = false; el.classList.add('dn'); });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(t, () => { I.keys[name] = false; el.classList.remove('dn'); });
  el.addEventListener('contextmenu', e => e.preventDefault());
};
I.bindStick = function (st, knob) {
  let sid = null;
  const move = e => { const r = st.getBoundingClientRect(), R = r.width / 2 - 18; let x = (e.clientX - r.left - r.width / 2) / R, y = (e.clientY - r.top - r.height / 2) / R;
    const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; } I.stick.x = x; I.stick.y = y; knob.style.transform = 'translate(' + x * R + 'px,' + y * R + 'px)'; };
  const end = e => { if (e.pointerId !== sid) return; sid = null; I.stick.x = I.stick.y = 0; knob.style.transform = ''; };
  st.addEventListener('pointerdown', e => { e.preventDefault(); sid = e.pointerId; try { st.setPointerCapture(sid); } catch (x) { /* synthetic pointer */ } move(e); });
  st.addEventListener('pointermove', e => { if (e.pointerId === sid) move(e); });
  st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);
};
})();
