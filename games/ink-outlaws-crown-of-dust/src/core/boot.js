/* Crown of Dust - boot, loop and scene switch (src/core/boot.js). Loaded last. */
(function () {
'use strict';
const CD = window.CD, U = CD.U, $ = U.$;
const V = CD.View = {cv: $('game'), ctx: null, w: 1, h: 1, dpr: 1};
V.ctx = V.cv.getContext('2d');
function fit() {
  const dpr = Math.min(window.devicePixelRatio || 1, U.COARSE ? 2.5 : 2), w = window.innerWidth, h = window.innerHeight;
  V.dpr = dpr; V.w = w; V.h = h; const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
  if (V.cv.width !== pw || V.cv.height !== ph) { V.cv.width = pw; V.cv.height = ph; }
  if (CD.Mission) CD.Mission.layout(); if (CD.scene && CD.scene.resize) CD.scene.resize();
}
window.addEventListener('resize', fit); window.addEventListener('orientationchange', () => setTimeout(fit, 200));

CD.go = function (name, arg) {
  if (CD.scene && CD.scene.leave) CD.scene.leave();
  CD.sceneName = name; CD.scene = CD.scenes[name]; CD.Input.reset();
  if (CD.scene.enter) CD.scene.enter(arg);
};
CD.scenes.mission = {enter: () => { CD.UI.hide(); }, leave: () => { CD.HUD.hide(); }, update: dt => CD.Mission.update(dt), draw: () => CD.Mission.draw()};
let last = 0;
function tick(ts) {
  requestAnimationFrame(tick);
  const dt = U.clamp((ts - last) / 1000, 0, 0.05); last = ts;
  if (document.hidden || !CD.scene) return;
  CD.time = (CD.time || 0) + dt;
  const t0 = performance.now();
  try { const n = CD.steps || 1; for (let i = 0; i < n; i++) CD.scene.update(dt * (CD.speed || 1)); CD.scene.draw(); CD.frameMs = (CD.frameMs || 0) * 0.95 + (performance.now() - t0) * 0.05; } catch (e) { if (!tick.err) { tick.err = true; console.error(e && e.stack || e); } }
}
CD.Input.init(V.cv); CD.Sfx.setOn(CD.Save.settings.sound); fit();
CD.go('title');
requestAnimationFrame(tick);
})();
