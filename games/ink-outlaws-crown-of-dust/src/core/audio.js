/* Crown of Dust - sound (src/core/audio.js). Every effect is synthesised with WebAudio, so there are no audio files to ship. */
(function () {
'use strict';
const CD = window.CD;
const A = CD.Sfx = {ctx: null, on: true, vol: 0.5, last: {}};
let noiseBuf = null;
A.unlock = function () {
  if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  try { A.ctx = new AC(); A.master = A.ctx.createGain(); A.master.gain.value = A.vol; A.master.connect(A.ctx.destination);
    noiseBuf = A.ctx.createBuffer(1, A.ctx.sampleRate * 0.5, A.ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; } catch (e) { A.ctx = null; }
};
function tone(type, f0, f1, dur, vol, delay) {
  const c = A.ctx, t = c.currentTime + (delay || 0), o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g); g.connect(A.master); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol, freq, q, delay) {
  const c = A.ctx, t = c.currentTime + (delay || 0), s = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter(); s.buffer = noiseBuf; f.type = q ? 'bandpass' : 'lowpass'; f.frequency.value = freq; if (q) f.Q.value = q;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(f); f.connect(g); g.connect(A.master); s.start(t); s.stop(t + dur + 0.02);
}
const S = {
  click: () => tone('square', 520, 380, 0.05, 0.12),
  shot: () => { noise(0.12, 0.5, 2400); tone('square', 320, 60, 0.09, 0.25); },
  rifle: () => { noise(0.22, 0.6, 1800); tone('sawtooth', 240, 40, 0.16, 0.3); },
  shotgun: () => { noise(0.3, 0.75, 1100); tone('square', 150, 35, 0.2, 0.35); },
  bow: () => { tone('triangle', 520, 180, 0.12, 0.25); noise(0.06, 0.15, 3000, 2); },
  magic: () => { tone('sine', 420, 980, 0.2, 0.22); tone('triangle', 840, 520, 0.24, 0.12, 0.04); },
  swing: () => noise(0.13, 0.22, 1500, 1.4),
  hit: () => { noise(0.07, 0.4, 900); tone('square', 190, 70, 0.07, 0.2); },
  hurt: () => { tone('sawtooth', 260, 110, 0.16, 0.28); noise(0.08, 0.25, 700); },
  die: () => { tone('sawtooth', 200, 50, 0.3, 0.22); noise(0.2, 0.2, 500); },
  coin: () => { tone('square', 990, 990, 0.05, 0.14); tone('square', 1480, 1480, 0.1, 0.14, 0.05); },
  build: () => { noise(0.05, 0.35, 1400); noise(0.05, 0.35, 1100, 0, 0.12); tone('square', 140, 90, 0.06, 0.2, 0.24); },
  boom: () => { noise(0.6, 0.9, 500); tone('sine', 110, 28, 0.5, 0.6); },
  roll: () => noise(0.16, 0.16, 700, 1),
  horn: () => { tone('sawtooth', 196, 196, 0.5, 0.2); tone('sawtooth', 294, 294, 0.6, 0.18, 0.18); },
  win: () => [392, 494, 587, 784].forEach((f, i) => tone('square', f, f, 0.22, 0.16, i * 0.13)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone('sawtooth', f, f * 0.97, 0.3, 0.16, i * 0.2)),
  heal: () => { tone('sine', 520, 780, 0.25, 0.2); tone('sine', 780, 1040, 0.25, 0.14, 0.1); },
  roar: () => { tone('sawtooth', 120, 55, 0.7, 0.4); noise(0.7, 0.35, 300); },
  page: () => noise(0.09, 0.2, 2600, 0.8)
};
A.play = function (name) {
  if (!A.on || !A.ctx || !S[name]) return; const now = A.ctx.currentTime;
  if (A.last[name] && now - A.last[name] < 0.045) return; A.last[name] = now;
  try { S[name](); } catch (e) { /* audio is never worth a crash */ }
};
A.setOn = v => { A.on = v; };
window.addEventListener('pointerdown', A.unlock, {passive: true}); window.addEventListener('keydown', A.unlock);
})();
