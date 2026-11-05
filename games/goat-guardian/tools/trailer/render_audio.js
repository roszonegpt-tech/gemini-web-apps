// Usage: node tools/trailer/render_audio.js [outDir]
// Renders the trailer soundtrack offline (OfflineAudioContext in Chromium), timed to recorded scene marks.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.resolve(process.argv[2] || 'build/trailer');
(async () => {
  const marksAbs = JSON.parse(fs.readFileSync(path.join(OUT, 'trailer_marks.json'), 'utf8'));
  const start = marksAbs[0].t;
  const marks = marksAbs.map(m => ({ id: m.id, t: m.t - start }));
  const total = marks[marks.length - 1].t + 6.2;
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('file://' + path.resolve(__dirname, '../../index.html'));
  await p.waitForTimeout(300);
  const b64 = await p.evaluate(async ({ marks, total }) => {
    const sr = 44100;
    const ctx = new OfflineAudioContext(2, Math.ceil(sr * total), sr);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
    comp.connect(ctx.destination);
    const out = ctx.createGain(); out.gain.value = 0.85; out.connect(comp);
    const nb = ctx.createBuffer(1, sr * 2, sr); const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);
    const pan = (node, v) => { const pn = ctx.createStereoPanner(); pn.pan.value = v || 0; node.connect(pn); pn.connect(out); };
    function env(g, t, a, peak, d) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    }
    function osc(type, f0, f1, t, dur, vol, cutoff, pv) {
      if (t < 0 || t > total) return;
      const o = ctx.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
      const g = ctx.createGain(); env(g, t, 0.006, vol, dur);
      if (cutoff) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; o.connect(f); f.connect(g); } else o.connect(g);
      pan(g, pv); o.start(t); o.stop(t + dur + 0.05);
    }
    function nz(t, dur, type, freq, vol, freq1, q, pv) {
      if (t < 0 || t > total) return;
      const s = ctx.createBufferSource(); s.buffer = nb;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t);
      if (freq1) f.frequency.exponentialRampToValueAtTime(freq1, t + dur);
      f.Q.value = q || 1;
      const g = ctx.createGain(); env(g, t, 0.004, vol, dur);
      s.connect(f); f.connect(g); pan(g, pv); s.start(t, Math.random()); s.stop(t + dur + 0.05);
    }
    const kick = (t, v) => { osc('sine', 160, 42, t, 0.28, v || 0.9); osc('triangle', 90, 50, t, 0.12, 0.3); };
    const snare = (t, v) => { nz(t, 0.18, 'bandpass', 1900, v || 0.4, 900, 0.8); osc('triangle', 230, 170, t, 0.08, 0.22); };
    const hat = (t, v) => nz(t, 0.04, 'highpass', 7500, v || 0.1);
    const crash = (t) => { nz(t, 1.8, 'highpass', 4500, 0.32, 2200); nz(t, 0.5, 'bandpass', 3000, 0.2); };
    const boom = (t) => { osc('sine', 95, 26, t, 1.6, 1.0); nz(t, 1.2, 'lowpass', 500, 0.6, 50); };
    const roar = (t) => { osc('sawtooth', 120, 55, t, 1.3, 0.35, 700); osc('sawtooth', 123, 52, t, 1.3, 0.25, 600); nz(t, 1.2, 'lowpass', 380, 0.55, 90); };
    const thunder = (t) => { nz(t, 2.6, 'lowpass', 260, 0.8, 50); osc('sine', 55, 30, t, 1.8, 0.5); };
    const heart = (t, v) => { osc('sine', 72, 42, t, 0.2, v || 0.8); osc('sine', 72, 42, t + 0.24, 0.17, (v || 0.8) * 0.75); };
    const howl = (t) => { osc('sawtooth', 300, 520, t, 0.7, 0.07, 1200, -0.4); osc('sawtooth', 520, 380, t + 0.7, 0.9, 0.07, 1200, -0.4); };
    const ramHit = (t) => { nz(t, 0.25, 'lowpass', 800, 0.5, 120); osc('sine', 140, 40, t, 0.22, 0.6); };
    function riser(t0, dur, vol) {
      const s = ctx.createBufferSource(); s.buffer = nb; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2;
      f.frequency.setValueAtTime(300, t0); f.frequency.exponentialRampToValueAtTime(7000, t0 + dur);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol || 0.35, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0 + dur + 0.01);
      s.connect(f); f.connect(g); g.connect(out); s.start(t0); s.stop(t0 + dur + 0.05);
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(80, t0); o.frequency.exponentialRampToValueAtTime(900, t0 + dur);
      const g2 = ctx.createGain(); g2.gain.setValueAtTime(0.0001, t0); g2.gain.exponentialRampToValueAtTime(0.08, t0 + dur); g2.gain.setValueAtTime(0.0001, t0 + dur + 0.01);
      const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 2500;
      o.connect(f2); f2.connect(g2); g2.connect(out); o.start(t0); o.stop(t0 + dur + 0.05);
    }
    function drone(t0, dur, root, vol) {
      for (const [n, dt] of [[root, 0], [root + 7, 0.01], [root - 12, 0.02]]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(n); o.detune.value = (dt * 900) - 4;
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(220, t0); f.frequency.linearRampToValueAtTime(520, t0 + dur);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol || 0.05, t0 + Math.min(1, dur * 0.3)); g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
        o.connect(f); f.connect(g); g.connect(out); o.start(t0); o.stop(t0 + dur + 0.05);
      }
    }
    // groove: game themes sped up for the trailer, with full drums
    function groove(t0, t1, theme, opts) {
      const o = opts || {};
      const th = THEMES[theme];
      const bpm = o.bpm || 132, st = 60 / bpm / 4;
      for (let i = 0; ; i++) {
        const t = t0 + i * st;
        if (t >= t1 - 0.01) break;
        const s = i % 32;
        const root = th.chords[Math.floor(s / 8)] + (o.tr || 0);
        const ln = th.lead[s];
        if (ln && !o.noLead) { osc(o.wave || 'square', hz(ln + (o.tr || 0)), hz(ln + (o.tr || 0)), t, st * 1.7, 0.07, 2600, 0.15); if (o.double) osc('square', hz(ln + 12 + (o.tr || 0)), hz(ln + 12 + (o.tr || 0)), t, st * 1.2, 0.025, 3500, -0.2); }
        if (s % 2 === 0) osc('triangle', hz(root - 12), hz(root - 12), t, st * 1.6, 0.2);
        if (s % 4 === 2) osc('square', hz(root - 12 + 7), hz(root - 12 + 7), t, st, 0.04, 900);
        if (o.arp) osc('square', hz(root + 12 + [0, 4, 7, 12][s % 4]), hz(root + 12 + [0, 4, 7, 12][s % 4]), t, st * 0.8, 0.025, 3000, 0.3);
        if (!o.noDrums) {
          const half = o.half;
          if (half ? s % 8 === 0 : s % 4 === 0) kick(t);
          if (o.heavy && s % 8 === 6) kick(t, 0.7);
          if (half ? s % 16 === 8 : s % 8 === 4) snare(t);
          if (s % 2 === 0) hat(t, s % 4 === 2 ? 0.12 : 0.07);
        }
      }
    }
    const M = {}; marks.forEach((m, i) => { M[m.id] = { t: m.t, end: i + 1 < marks.length ? marks[i + 1].t : total }; });
    const seg = (id) => M[id];
    // ---- score ----
    let s = seg('cold'); drone(s.t, s.end - s.t + 0.3, 38, 0.05); for (let t = s.t + 0.3; t < s.end; t += 0.95) heart(t, 0.7); howl(s.t + 1.0);
    s = seg('pack'); drone(s.t, s.end - s.t, 38, 0.06); for (let t = s.t; t < s.end; t += 0.6) heart(t, 0.8);
    for (let t = s.t; t < s.end; t += 60 / 132 / 2) hat(t, 0.05); howl(s.t + 0.4);
    s = seg('need'); riser(s.t, s.end - s.t, 0.4); drone(s.t, s.end - s.t, 41, 0.05); for (let k = 0; k < 8; k++) snare(s.end - 1.0 + k * 0.125, 0.15 + k * 0.03);
    crash(seg('ram').t); boom(seg('ram').t);
    s = seg('ram'); groove(s.t, s.end, 'day', { bpm: 132 }); for (let t = s.t + 0.5; t < s.end; t += 0.9) ramHit(t);
    s = seg('herd'); groove(s.t, s.end, 'day', { bpm: 132, arp: true });
    s = seg('coop'); groove(s.t, s.end, 'day', { bpm: 132, arp: true, double: true, heavy: true }); crash(s.t);
    s = seg('worse'); drone(s.t, s.end - s.t, 37, 0.07); riser(s.t, s.end - s.t, 0.45); heart(s.t + 0.2, 0.9); heart(s.t + 1.0, 0.9);
    s = seg('boss'); roar(s.t); boom(s.t); crash(s.t); groove(s.t, s.end, 'dusk', { bpm: 140, heavy: true, double: true, tr: -2 });
    s = seg('storm'); groove(s.t, s.end, 'dusk', { bpm: 132, arp: true }); thunder(s.t + 0.9); thunder(s.t + 3.4); crash(s.t);
    s = seg('night'); groove(s.t, s.end, 'night', { bpm: 132, half: true, wave: 'triangle' }); drone(s.t, s.end - s.t, 38, 0.04); howl(s.t + 1.5);
    s = seg('wolf'); groove(s.t, s.end, 'dusk', { bpm: 140, heavy: true, tr: 2 }); howl(s.t + 0.3); crash(s.t);
    s = seg('build'); groove(s.t, s.end, 'day', { bpm: 132, arp: true, noLead: false });
    s = seg('count'); riser(s.t, s.end - s.t, 0.45); for (let k = 0; k < 16; k++) snare(s.end - 1.2 + k * 0.075, 0.12 + k * 0.02); for (let k = 0; k < 4; k++) kick(s.t + k * 0.45, 0.6);
    s = seg('title'); crash(s.t); boom(s.t); groove(s.t, s.end - 1.6, 'day', { bpm: 132, arp: true, double: true });
    // final chord
    const fc = s.end - 1.6;
    for (const n of [60, 64, 67, 72, 48]) osc('square', hz(n), hz(n), fc, 1.5, 0.05, 2400, (n % 3 - 1) * 0.3);
    crash(fc); kick(fc);
    const buf = await ctx.startRendering();
    // encode 16-bit stereo WAV
    const L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length;
    const ab = new ArrayBuffer(44 + n * 4); const dv = new DataView(ab);
    const w = (o, str) => { for (let i = 0; i < str.length; i++) dv.setUint8(o + i, str.charCodeAt(i)); };
    w(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true);
    dv.setUint32(24, sr, true); dv.setUint32(28, sr * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n * 4, true);
    let o = 44;
    for (let i = 0; i < n; i++) { dv.setInt16(o, Math.max(-1, Math.min(1, L[i])) * 32767, true); dv.setInt16(o + 2, Math.max(-1, Math.min(1, R[i])) * 32767, true); o += 4; }
    const blob = new Blob([ab], { type: 'audio/wav' });
    return await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result.split(',')[1]); fr.readAsDataURL(blob); });
  }, { marks, total });
  fs.writeFileSync(path.join(OUT, 'trailer_audio.wav'), Buffer.from(b64, 'base64'));
  fs.writeFileSync(path.join(OUT, 'trailer_cut.json'), JSON.stringify({ start, total }));
  console.log('audio ok', total.toFixed(2), 's');
  await b.close();
})();
