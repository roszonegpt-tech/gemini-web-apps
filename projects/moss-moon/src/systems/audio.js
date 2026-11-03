/* Moss Moon — MM.audio: fully procedural Web Audio engine (music, ambience, sfx, loops).
 * Classic script, no assets, no libraries. Every call is a safe no-op before init() or when
 * Web Audio is missing. API + notes: notes/handoff/audio.md. Owner: audio agent. */
(function () {
  'use strict';
  var MM = window.MM = window.MM || {};
  if (MM.audio && MM.audio.__mm) return;
  var AC = window.AudioContext || window.webkitAudioContext;
  var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  var LOOK = 0.12, LOOK_HIDDEN = 1.5, TICK_MS = 25, NODE_CAP = 900;
  var SFX_GAIN = 2.2, AMB_GAIN = 2.5, CINE_TRACK_GAIN = 0.7; // gain staging between layers

  // ===================================================================== 1. Utilities
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function perf() { return window.performance && performance.now ? performance.now() : Date.now(); }
  function rng(seed) {
    var s = seed >>> 0;
    return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  var R = rng((Date.now() ^ 0x5eed) >>> 0);
  function rr(a, b) { return a + (b - a) * R(); }
  function M(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; for (k in b) o[k] = b[k]; return o; }
  var warned = {};
  function warnOnce(k, msg) { if (!warned[k]) { warned[k] = 1; try { console.warn('[MM.audio] ' + msg); } catch (e) { /* ignore */ } } }

  // ===================================================================== 2. Engine + node helpers
  // X = engine currently being written to (the realtime one, or an offline one during preview.render).
  var X = null, RT = null, timer = null;
  function T(x, d) { if (typeof x === 'number' && isFinite(x)) return x; if (X) X.bad++; return d; }
  function G(v) { var g = X.ctx.createGain(); g.gain.value = v == null ? 1 : v; X.nc++; return g; }
  function O(type, f) { var o = X.ctx.createOscillator(); o.type = type || 'sine'; o.frequency.value = f; X.nc++; return o; }
  function F(type, f, q) { var b = X.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q == null ? 0.7 : q; X.nc++; return b; }
  function N() { var s = X.ctx.createBufferSource(); s.buffer = X.noise; s.loop = true; X.nc++; return s; }
  function P(pan) { if (!X.ctx.createStereoPanner) return null; var p = X.ctx.createStereoPanner(); p.pan.value = clamp(T(pan, 0), -1, 1); X.nc++; return p; }
  function route(node, d, pan) { var p = pan != null ? P(pan) : null; if (p) { node.connect(p); p.connect(d); } else node.connect(d); }
  function glide(p, v, tc, at) {
    var t = at != null ? at : X.ctx.currentTime; v = T(v, 0);
    if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t); else { var c = p.value; p.cancelScheduledValues(t); p.setValueAtTime(c, t); }
    p.setTargetAtTime(v, t, Math.max(0.005, tc));
  }
  function reg(E, end, n, k) { E.live.push({ e: end, n: n, k: k }); E.liveN += n; }
  function lfo(param, rate, depth, t, end, list) {
    var o = O('sine', rate), g = G(depth); o.connect(g); g.connect(param); o.start(t);
    if (end != null) o.stop(end); if (list) list.push(o); return o;
  }
  function noiseBuffer(ctx) {
    var n = Math.floor(ctx.sampleRate * 4), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = R() * 2 - 1;
    return b;
  }
  function makeIR(ctx, sec) { // stereo, darkening exponential tail with a short pre-delay
    var sr = ctx.sampleRate, n = Math.floor(sr * sec), b = ctx.createBuffer(2, n, sr), pre = Math.floor(sr * 0.012);
    for (var c = 0; c < 2; c++) {
      var d = b.getChannelData(c), lp = 0;
      for (var i = pre; i < n; i++) { var x = i / n; lp += ((R() * 2 - 1) - lp) * (0.5 - 0.38 * x); d[i] = lp * Math.pow(1 - x, 2.4); }
    }
    return b;
  }
  function softCurve() { // input pre-scaled by 0.5: linear to 0.7, soft knee asymptote 0.97 (never reaches 1.0)
    var n = 4096, c = new Float32Array(n);
    for (var i = 0; i < n; i++) { var s = (i / (n - 1) * 2 - 1) * 2, a = Math.abs(s); c[i] = (a < 0.7 ? a : 0.7 + 0.27 * Math.tanh((a - 0.7) / 0.27)) * (s < 0 ? -1 : 1); }
    return c;
  }
  function Bus(dD, dW) { // two parallel paths (dry, reverb send) sharing one volume
    var b = { inD: G(1), inW: G(1), vD: G(0), vW: G(0) };
    b.inD.connect(b.vD); b.vD.connect(dD); b.inW.connect(b.vW); b.vW.connect(dW); return b;
  }
  function analyser(ctx) { var a = ctx.createAnalyser(); a.fftSize = 2048; return a; }
  function buildEngine(ctx, opt) {
    var prev = X, E = { ctx: ctx, nc: 0, bad: 0, errors: 0, live: [], liveN: 0, tracks: [], ambs: [], cur: null, curAmb: null,
      voices: {}, last: {}, loops: {}, dropped: 0, stolen: 0, skips: 0, maxTick: 0, duckAmt: 0, duckUntil: 0,
      offline: !!opt.offline, rk: 1, vend: 0, srcs: null, intenOffAt: 0 };
    X = E;
    try {
      E.noise = noiseBuffer(ctx);
      E.master = G(0);
      E.tone = F('lowpass', 9000, 0.5);
      var c = E.comp = ctx.createDynamicsCompressor();
      c.threshold.value = -14; c.knee.value = 10; c.ratio.value = 4; c.attack.value = 0.004; c.release.value = 0.25;
      E.master.connect(E.tone); E.tone.connect(c);
      E.anPre = analyser(ctx); c.connect(E.anPre);
      var last = c;
      if (opt.safety !== false) { var pre = G(0.5), sh = ctx.createWaveShaper(); sh.curve = softCurve(); c.connect(pre); pre.connect(sh); last = sh; }
      last.connect(ctx.destination); E.an = analyser(ctx); last.connect(E.an);
      E.rvIn = F('highpass', 180, 0.5); E.rv = ctx.createConvolver(); E.rv.buffer = makeIR(ctx, 2.8); E.rvOut = G(0.6);
      E.rvIn.connect(E.rv); E.rv.connect(E.rvOut); E.rvOut.connect(E.master);
      E.B = { music: Bus(E.master, E.rvIn), sfx: Bus(E.master, E.rvIn), cine: Bus(E.master, E.rvIn) };
      E.B.amb = Bus(E.B.sfx.inD, E.B.sfx.inW);
      E.base = E.nc;
    } finally { X = prev; }
    return E;
  }

  // ===================================================================== 3. Synthesis helpers
  function sweep(p, a, b, t, d) { p.setValueAtTime(a, t); p.exponentialRampToValueAtTime(Math.max(1, b), t + Math.max(0.01, d)); }
  function filt(src, o, t, dur) {
    var n = src, f;
    if (o.lp) { f = F('lowpass', o.lp, o.q); if (o.lp2) sweep(f.frequency, o.lp, o.lp2, t, o.lt || dur); n.connect(f); n = f; }
    if (o.bp) { f = F('bandpass', o.bp, o.bq || 1); if (o.bp2) sweep(f.frequency, o.bp, o.bp2, t, o.bt || dur); n.connect(f); n = f; }
    if (o.hp) { f = F('highpass', o.hp, 0.7); n.connect(f); n = f; }
    if (o.trem) { f = G(1 - o.trem[1] / 2); lfo(f.gain, o.trem[0], o.trem[1] / 2, t, t + dur + (o.rel || 0) + 0.3); n.connect(f); n = f; }
    return n;
  }
  function shape(p, t, o, v, dur) { // attack + exp decay, or attack/hold/release when o.hold; returns end time
    var a = Math.max(0.002, o.a || 0.004);
    p.setValueAtTime(0, t); p.linearRampToValueAtTime(v, t + a);
    if (o.hold) { var e = t + Math.max(a, dur), rel = o.rel || 0.3; p.setValueAtTime(v, e); p.setTargetAtTime(0, e, rel / 5); return e + rel * 1.2; }
    p.setTargetAtTime(0, t + a, Math.max(0.004, (dur - a) / 6)); return t + Math.max(a, dur);
  }
  function voiceEnd(src, end) { src.stop(end + 0.05); if (end > X.vend) X.vend = end; if (X.srcs) X.srcs.push({ s: src, end: end }); return end; }
  function tone(d, t, o) {
    var k = X.rk, f = T(o.f * k, 440), dur = T(o.dur, 0.3), v = T(o.v == null ? 0.2 : o.v, 0);
    t = T(t, X.ctx.currentTime);
    var os = O(o.w, f); if (o.det) os.detune.value = o.det;
    if (o.f2) sweep(os.frequency, f, T(o.f2 * k, f), t, o.ft || dur);
    if (o.vib) lfo(os.detune, o.vib[0], o.vib[1], t + (o.vib[2] || 0), t + dur + (o.rel || 0) + 0.4);
    var g = G(0); filt(os, o, t, dur).connect(g); route(g, d, o.pan);
    var end = shape(g.gain, t, o, v, dur); os.start(t); return voiceEnd(os, end);
  }
  function noise(d, t, o) {
    var dur = T(o.dur, 0.3), v = T(o.v == null ? 0.2 : o.v, 0); t = T(t, X.ctx.currentTime);
    var s = N(), g = G(0); filt(s, o, t, dur).connect(g); route(g, d, o.pan);
    var end = shape(g.gain, t, o, v, dur); s.start(t, R() * 3); return voiceEnd(s, end);
  }
  function bell(d, t, f, v, dur, pan) { // music-box / glockenspiel partials
    tone(d, t, { f: f, dur: dur, v: v, a: 0.003, pan: pan });
    tone(d, t, { f: f * 2.76, dur: dur * 0.45, v: v * 0.2, a: 0.002, pan: pan });
    return tone(d, t, { f: f * 5.4, dur: dur * 0.2, v: v * 0.06, a: 0.002, pan: pan });
  }
  function chime(d, t, notes, step, v, dur) { for (var i = 0; i < notes.length; i++) bell(d, t + i * step, mtof(notes[i]), v, dur); }
  function chord(d, t, notes, o) { for (var i = 0; i < notes.length; i++) tone(d, t, M(o, { f: mtof(notes[i]) })); }
  function seq(d, t, notes, o) { for (var i = 0; i < notes.length; i++) tone(d, t + notes[i][0], M(o, { f: mtof(notes[i][1]), dur: notes[i][2] || o.dur })); }

  // ===================================================================== 4. Music instruments  (d, t, freq, dur, vel, extra)
  var INS = {
    pad: function (d, t, f, dur, v, c) {
      tone(d, t, { w: 'triangle', f: f, dur: dur, v: v, a: 1.2, hold: 1, rel: 1.8, lp: c || 1400, det: -6 });
      tone(d, t, { w: 'sawtooth', f: f, dur: dur, v: v * 0.3, a: 1.5, hold: 1, rel: 1.8, lp: (c || 1400) * 0.7, det: 7 });
    },
    str: function (d, t, f, dur, v, c) {
      tone(d, t, { w: 'sawtooth', f: f, dur: dur, v: v, a: 0.45, hold: 1, rel: 0.9, lp: c || 1800, det: -8 });
      tone(d, t, { w: 'sawtooth', f: f, dur: dur, v: v * 0.8, a: 0.55, hold: 1, rel: 0.9, lp: (c || 1800) * 0.8, det: 9 });
    },
    drone: function (d, t, f, dur, v) {
      tone(d, t, { f: f, dur: dur, v: v, a: 2, hold: 1, rel: 2.5 });
      tone(d, t, { f: f * 1.5, dur: dur, v: v * 0.35, a: 2.5, hold: 1, rel: 2.5, det: 4 });
    },
    bass: function (d, t, f, dur, v) {
      tone(d, t, { f: f, dur: dur, v: v, a: 0.025, hold: 1, rel: 0.25 });
      tone(d, t, { w: 'triangle', f: f, dur: dur, v: v * 0.3, a: 0.02, hold: 1, rel: 0.2, lp: 700 });
    },
    pluck: function (d, t, f, dur, v) {
      tone(d, t, { w: 'triangle', f: f, dur: Math.max(0.5, dur), v: v, a: 0.004, lp: 3000, lp2: 700, lt: 0.3 });
      tone(d, t, { f: f * 2, dur: 0.2, v: v * 0.25, a: 0.003 });
    },
    bell: function (d, t, f, dur, v) { bell(d, t, f, v, Math.max(1.2, dur)); },
    flute: function (d, t, f, dur, v) {
      tone(d, t, { f: f, dur: dur, v: v, a: 0.1, hold: 1, rel: 0.45, vib: [5, 9, 0.25] });
      tone(d, t, { w: 'triangle', f: f, dur: dur, v: v * 0.18, a: 0.12, hold: 1, rel: 0.4, lp: 1800 });
    },
    brass: function (d, t, f, dur, v) { tone(d, t, { w: 'sawtooth', f: f, dur: dur, v: v, a: 0.08, hold: 1, rel: 0.3, lp: 450, lp2: 1600, lt: 0.2, q: 1 }); },
    kick: function (d, t, f, dur, v) { tone(d, t, { f: 120, f2: 45, ft: 0.1, dur: 0.32, v: v, a: 0.002 }); },
    snare: function (d, t, f, dur, v) { noise(d, t, { dur: 0.16, v: v * 0.55, bp: 1800, bq: 0.8 }); tone(d, t, { w: 'triangle', f: 200, f2: 150, dur: 0.08, v: v * 0.45 }); },
    hat: function (d, t, f, dur, v) { noise(d, t, { dur: 0.045, v: v * 0.3, lp: 8500, hp: 5000 }); },
    tom: function (d, t, f, dur, v) { tone(d, t, { f: 180, f2: 100, dur: 0.28, v: v, a: 0.003 }); },
    tap: function (d, t, f, dur, v) { tone(d, t, { f: 250, f2: 180, dur: 0.12, v: v }); noise(d, t, { dur: 0.025, v: v * 0.25, bp: 1600 }); },
    timp: function (d, t, f, dur, v) { tone(d, t, { f: 98, f2: 86, dur: 1.1, v: v, a: 0.004 }); noise(d, t, { dur: 0.3, v: v * 0.4, lp: 260 }); }
  };

  // ===================================================================== 5. Track definitions
  var MODES = { ionian: [0, 2, 4, 5, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10], lydian: [0, 2, 4, 6, 7, 9, 11],
    mixo: [0, 2, 4, 5, 7, 9, 10], aeolian: [0, 2, 3, 5, 7, 8, 10], harm: [0, 2, 3, 5, 7, 8, 11] };
  // root = MIDI note, prog = chord scale-degrees, bpc = bars per chord, sev = add 7ths, L = layers.
  // perc patterns: 16 steps per bar, x = full, o = soft, ? = 50% soft.
  var TRACKS = {
    title: { bpm: 68, root: 53, mode: 'lydian', prog: [0, 1, 5, 4], bpc: 2, sev: 1, L: { pad: { v: 0.05 }, bass: { v: 0.16, pat: 'root' },
      arp: { v: 0.05, grid: 2, prob: 0.9, pat: 'updown' }, bell: { v: 0.045, grid: 2, prob: 0.16 }, lead: { v: 0.05, grid: 4, prob: 0.45 } } },
    homestead_day: { bpm: 88, root: 55, mode: 'ionian', prog: [0, 4, 5, 3], bpc: 1, sev: 1, L: { pad: { v: 0.035 }, bass: { v: 0.15, pat: 'walk' },
      pluck: { v: 0.06, pat: 'x.xx.xx.' }, bell: { v: 0.04, grid: 2, prob: 0.12 }, lead: { v: 0.04, grid: 4, prob: 0.25 },
      perc: { v: 0.06, hat: '..o...o...o...o.', tap: 'x.......o.......' } } },
    homestead_night: { bpm: 56, root: 49, mode: 'lydian', prog: [0, 1, 0, 5], bpc: 2, sev: 1, L: { pad: { v: 0.05, c: 1100 }, bass: { v: 0.13, pat: 'root' },
      arp: { ins: 'bell', v: 0.035, grid: 2, prob: 0.7, pat: 'up', oct: 2, wet: 0.7 }, bell: { v: 0.03, grid: 4, prob: 0.08 } } },
    village: { bpm: 100, root: 48, mode: 'mixo', prog: [0, 6, 3, 0], bpc: 1, L: { pad: { v: 0.03 }, bass: { v: 0.15, pat: 'walk' },
      pluck: { v: 0.06, pat: 'x.x.xx.x' }, lead: { v: 0.045, grid: 2, prob: 0.35 }, bell: { v: 0.035, grid: 2, prob: 0.08 },
      perc: { v: 0.07, kick: 'x.......x.......', tap: '....o.......o..?', hat: 'o.o.o.o.o.o.o.o.' } } },
    forest: { bpm: 62, root: 45, mode: 'aeolian', prog: [0, 5, 3, 6], bpc: 2, sev: 1, L: { pad: { v: 0.05, c: 700 }, drone: { v: 0.05 },
      bass: { v: 0.12, pat: 'root' }, arp: { v: 0.045, grid: 4, prob: 0.55, pat: 'rand' }, bell: { v: 0.03, grid: 2, prob: 0.07, oct: 1 } } },
    swamp: { bpm: 56, root: 40, mode: 'phrygian', prog: [0, 1, 0, 6], bpc: 2, L: { pad: { v: 0.05, c: 900 }, drone: { v: 0.03 },
      bass: { v: 0.13, pat: 'root' }, pluck: { v: 0.05, pat: 'x..?..x.' }, bell: { v: 0.03, grid: 4, prob: 0.1 } } },
    mountain: { bpm: 60, root: 50, mode: 'dorian', prog: [0, 3, 6, 4], bpc: 2, sev: 1, L: { pad: { v: 0.045, c: 2200, lo: 12 },
      bass: { v: 0.12, pat: 'root' }, bell: { v: 0.04, grid: 2, prob: 0.25 }, lead: { v: 0.045, grid: 8, prob: 0.5 } } },
    dungeon: { bpm: 70, root: 49, mode: 'harm', prog: [0, 5, 4, 0], bpc: 2, L: { pad: { v: 0.045, c: 650 }, drone: { v: 0.05 },
      bass: { v: 0.13, pat: 'root' }, arp: { v: 0.04, grid: 4, prob: 0.45, pat: 'rand', oct: 0 }, bell: { v: 0.03, grid: 4, prob: 0.08 },
      perc: { v: 0.07, kick: 'x..o............' } } },
    combat: { bpm: 118, root: 45, mode: 'aeolian', prog: [0, 5, 6, 4], bpc: 1, L: { pad: { v: 0.035, c: 1200 }, bass: { v: 0.14, pat: 'pulse' },
      arp: { v: 0.045, grid: 1, prob: 0.85, pat: 'updown' }, bell: { v: 0.03, grid: 4, prob: 0.06 },
      perc: { v: 0.1, kick: 'x.....x.x.......', snare: '....o.......o...', hat: '..o...o...o...o.', tom: '..............o?' } } },
    boss: { bpm: 136, root: 50, mode: 'harm', prog: [0, 5, 3, 4], bpc: 1, L: { pad: { ins: 'str', v: 0.035, c: 1800 }, bass: { v: 0.15, pat: 'pulse' },
      arp: { v: 0.045, grid: 1, prob: 0.9, pat: 'updown' }, lead: { ins: 'brass', v: 0.04, grid: 4, prob: 0.3, oct: 0 },
      perc: { v: 0.12, kick: 'x...x...x...x.x.', snare: '....x.......x...', hat: 'o.o.o.o.o.o.o.o.', tom: '............o.oo' } } },
    cine_intro: { bpm: 60, root: 53, mode: 'lydian', prog: [0, 1, 4, 0], bpc: 2, sev: 1, L: { pad: { v: 0.05 }, bass: { v: 0.12, pat: 'root' },
      bell: { v: 0.04, grid: 2, prob: 0.25 }, lead: { v: 0.05, grid: 4, prob: 0.55 } } },
    cine_sorrow: { bpm: 52, root: 50, mode: 'aeolian', prog: [0, 5, 3, 4], bpc: 2, sev: 1, L: { pad: { v: 0.05, c: 1000 }, bass: { v: 0.11, pat: 'root' },
      lead: { v: 0.05, grid: 4, prob: 0.6 }, bell: { v: 0.03, grid: 4, prob: 0.06 } } },
    cine_triumph: { bpm: 84, root: 48, mode: 'ionian', prog: [0, 3, 5, 4], bpc: 1, L: { pad: { ins: 'str', v: 0.03 }, bass: { v: 0.15, pat: 'walk' },
      arp: { v: 0.045, grid: 2, prob: 0.9, pat: 'up' }, lead: { v: 0.05, grid: 4, prob: 0.7 },
      perc: { v: 0.1, timp: 'x.......x.......', hat: '....o.......o...' } } },
    ending: { bpm: 64, root: 46, mode: 'ionian', prog: [0, 5, 3, 4], bpc: 2, sev: 1, L: { pad: { v: 0.05 }, bass: { v: 0.13, pat: 'root' },
      arp: { ins: 'bell', v: 0.03, grid: 2, prob: 0.5, pat: 'up', oct: 2, wet: 0.7 }, lead: { v: 0.05, grid: 4, prob: 0.5 } } },
    defeat: { bpm: 50, root: 48, mode: 'aeolian', prog: [0, 3, 0, 4], bpc: 2, L: { pad: { v: 0.05, c: 800 }, bass: { v: 0.1, pat: 'root' },
      bell: { v: 0.035, grid: 4, prob: 0.3 }, lead: { v: 0.04, grid: 8, prob: 0.4 } } }
  };
  var INTEN = { v: 0.09, kick: 'x.......x.......', snare: '....o.......o...', hat: '..o...o...o...o.', tom: '..............o?' };
  var WET = { pad: 0.5, bass: 0.04, arp: 0.35, bell: 0.7, lead: 0.45, pluck: 0.3, perc: 0.1, drone: 0.4, inten: 0.1 };

  // ===================================================================== 6. Track player (lookahead step sequencer)
  var seedN = 1;
  function fold(n, lo) { while (n < lo) n += 12; while (n >= lo + 12) n -= 12; return n; }
  function semi(sc, j) { return sc[((j % 7) + 7) % 7] + 12 * Math.floor(j / 7); }
  function chordOf(d, i) { var sc = MODES[d.mode], deg = d.prog[i], out = []; for (var k = 0; k < (d.sev ? 4 : 3); k++) out.push(semi(sc, deg + k * 2)); return out; }
  function bassN(root, n) { return fold(root + n, Math.max(36, root - 12)); }
  function nearestChordDeg(j, deg) {
    var best = j, bd = 99;
    for (var x = j - 3; x <= j + 3; x++) { var m = ((x - deg) % 7 + 7) % 7; if ((m === 0 || m === 2 || m === 4) && x >= 0 && x <= 11 && Math.abs(x - j) < bd) { bd = Math.abs(x - j); best = x; } }
    return best;
  }
  function play(ins, d, t, f, dur, v, c) {
    var E = X, n0 = E.nc; E.vend = t; E.srcs = [];
    try { INS[ins](d, t, T(f, 220), T(dur, 0.5), T(v, 0), c); } finally { var s = E.srcs; E.srcs = null; reg(E, E.vend + 0.05, E.nc - n0, 'm'); }
    return s;
  }
  function held(inst, list) {
    for (var i = 0; i < list.length; i++) inst.held.push(list[i]);
    if (inst.held.length > 48) { var now = X.ctx.currentTime; inst.held = inst.held.filter(function (h) { return h.end > now; }); }
  }
  function fadeInst(inst, v, tc) { glide(inst.tg.gain, v, tc); glide(inst.tw.gain, v, tc); }
  function stopInst(inst, fade) {
    if (inst.stopped) return; inst.stopped = true; fade = Math.max(0.02, fade);
    fadeInst(inst, 0, fade / 4); inst.dieAt = X.ctx.currentTime + fade * 2 + 0.4;
    var hs = (inst.held || []).concat(inst.beds || []);
    for (var i = 0; i < hs.length; i++) if (hs[i].end > inst.dieAt) { try { hs[i].s.stop(inst.dieAt); } catch (e) { /* already stopped */ } }
  }
  function killInst(inst) { try { inst.tg.disconnect(); inst.tw.disconnect(); } catch (e) { /* ignore */ } }
  function limitFading(list) { // never let more than two old instances linger
    var old = list.filter(function (i) { return i.stopped && !i.killed; });
    while (old.length > 2) { var o = old.shift(); o.killed = true; o.stopped = false; stopInst(o, 0.05); }
  }
  function mkInst(bus, wetFor, names, extra) {
    var inst = M({ tg: G(0), tw: G(0), g: {}, held: [], stopped: false }, extra);
    inst.tg.connect(bus.inD); inst.tw.connect(bus.inW);
    names.forEach(function (k) { var lg = G(k === 'inten' ? A.intensity : k === 'in' ? AMB_GAIN : 1), w = wetFor(k); lg.connect(inst.tg); if (w) { var wg = G(w); lg.connect(wg); wg.connect(inst.tw); } inst.g[k] = lg; });
    return inst;
  }
  function startTrack(id, fade) {
    var E = X, d = TRACKS[id], now = E.ctx.currentTime, n0 = E.nc, names = Object.keys(d.L);
    if (!d.L.perc) names.push('inten');
    var tr = mkInst(E.B[id.indexOf('cine_') === 0 ? 'cine' : 'music'], function (k) { return d.L[k] && d.L[k].wet != null ? d.L[k].wet : WET[k]; }, names,
      { id: id, d: d, sd: 60 / d.bpm / 4, step: 0, next: now + 0.06, r: rng(Date.now() + 7919 * seedN++), ai: 0, pi: 0, lj: 4 });
    tr.n = E.nc - n0; tr.lvl = id.indexOf('cine_') === 0 ? CINE_TRACK_GAIN : 1; fadeInst(tr, tr.lvl, Math.max(0.05, fade) / 3);
    E.tracks.push(tr); return tr;
  }
  function schedTrack(tr, h, now) {
    var c = 0, lim = X.offline ? 1e7 : 48;
    if (tr.next < now - 0.03) { // fell behind (hidden tab / stalled main thread): skip missed steps, never burst
      var skip = Math.ceil((now + 0.02 - tr.next) / tr.sd); tr.step += skip; tr.next += skip * tr.sd; tr.needPad = true; X.skips++;
    }
    while (tr.next < h && c < lim) { playStep(tr, tr.step, tr.next); tr.step++; tr.next += tr.sd; c++; }
    return c;
  }
  function perc(pat, d, ib, t, r) {
    for (var k in pat) {
      if (k === 'v' || k === 'wet') continue;
      var c = pat[k][ib], vel = c === 'x' ? 1 : c === 'o' ? 0.55 : c === '?' && r() < 0.5 ? 0.45 : 0;
      if (vel) play(k, d, t, 0, 0, pat.v * vel);
    }
  }
  function playStep(tr, s, t) {
    var E = X, d = tr.d, L = d.L, r = tr.r, sd = tr.sd, cs = 16 * (d.bpc || 1), ci = Math.floor(s / cs) % d.prog.length, ic = s % cs, ib = s % 16;
    var ch = chordOf(d, ci), root = d.root, sc = MODES[d.mode], l, i, c;
    function hum() { return 0.85 + 0.3 * r(); }
    if (ic === 0 || tr.needPad) {
      var len = (cs - ic) * sd; tr.needPad = false;
      if ((l = L.pad)) for (i = 0; i < ch.length; i++) held(tr, play(l.ins || 'pad', tr.g.pad, t, mtof(fold(root + ch[i], root + (l.lo || 7))), len, l.v, l.c));
      if ((l = L.drone)) held(tr, play('drone', tr.g.drone, t, mtof(fold(root + ch[0], root - 12)), len, l.v));
      if ((l = L.bass) && l.pat === 'root') held(tr, play('bass', tr.g.bass, t, mtof(bassN(root, ch[0])), len * 0.96, l.v));
    }
    if (!E.offline && E.liveN > NODE_CAP) return; // CPU guard: keep pads, drop decoration
    if ((l = L.bass) && l.pat !== 'root') {
      var bn = bassN(root, ch[0]);
      if (l.pat === 'walk' && ib % 4 === 0) play('bass', tr.g.bass, t, mtof(bn + [0, 7, 12, 7][ib / 4]), sd * 3.6, l.v * hum());
      else if (l.pat === 'pulse' && ib % 2 === 0) play('bass', tr.g.bass, t, mtof(bn + (ib === 14 ? 12 : 0)), sd * 1.6, l.v * (ib % 8 === 0 ? 1 : 0.7));
    }
    if ((l = L.arp) && s % l.grid === 0 && r() < l.prob) {
      var tones = ch.concat([ch[0] + 12]), m = tones.length, k = tr.ai++, p = k % (2 * m - 2);
      var idx = l.pat === 'rand' ? (r() * m) | 0 : l.pat === 'up' ? k % m : (p < m ? p : 2 * m - 2 - p);
      play(l.ins || 'pluck', tr.g.arp, t, mtof(root + 12 * (l.oct == null ? 1 : l.oct) + tones[idx]), sd * l.grid * 1.6, l.v * hum());
    }
    if ((l = L.bell) && s % (l.grid || 2) === 0 && r() < l.prob)
      play('bell', tr.g.bell, t, mtof(root + 12 * (l.oct == null ? 2 : l.oct) + ch[(r() * ch.length) | 0]), 1.8, l.v * hum());
    if ((l = L.lead) && s % l.grid === 0 && r() < l.prob) {
      tr.lj = clamp(tr.lj + [-2, -1, -1, 0, 1, 1, 2][(r() * 7) | 0], 0, 11);
      if (ib === 0 || r() < 0.4) tr.lj = nearestChordDeg(tr.lj, d.prog[ci]);
      play(l.ins || 'flute', tr.g.lead, t, mtof(root + 12 * (l.oct == null ? 1 : l.oct) + semi(sc, tr.lj)), sd * l.grid * (0.9 + r()), l.v * hum());
    }
    if ((l = L.pluck) && ib % 2 === 0) {
      c = l.pat[(ib / 2) % l.pat.length];
      if (c === 'x' || (c === '?' && r() < 0.5)) play('pluck', tr.g.pluck, t, mtof(root + 12 * (l.oct == null ? 1 : l.oct) + ch[tr.pi++ % ch.length]), sd * 3, l.v * hum());
    }
    if (L.perc) perc(L.perc, tr.g.perc, ib, t, r);
    else if (A.intensity > 0.01 || E.ctx.currentTime < E.intenOffAt) perc(INTEN, tr.g.inten, ib, t, r);
  }

  // ===================================================================== 7. Ambience (continuous beds + random events)
  var BEDS = { // each returns [{s, end}] of continuous sources
    wind: function (d, t, o) {
      var L = [], s = N(), lp = F('lowpass', (o.lo + o.hi) / 2, 0.9), g = G(o.v), p = P(0), rt = o.rate || 0.07;
      s.connect(lp); lp.connect(g); if (p) { g.connect(p); p.connect(d); lfo(p.pan, rt * 0.7, 0.45, t, null, L); } else g.connect(d);
      lfo(lp.frequency, rt, (o.hi - o.lo) / 2, t, null, L); lfo(g.gain, rt * 1.6, o.v * 0.5, t, null, L);
      s.start(t, R() * 3); L.push(s); return L;
    },
    rain: function (d, t, o) {
      var s = N(), hp = F('highpass', 400), lp = F('lowpass', 5000), g = G(o.v), s2 = N(), lp2 = F('lowpass', 800), g2 = G(o.v * 0.8);
      s.connect(hp); hp.connect(lp); lp.connect(g); g.connect(d); s2.connect(lp2); lp2.connect(g2); g2.connect(d);
      s.start(t, R() * 3); s2.start(t, R() * 3); return [s, s2];
    },
    drone: function (d, t, o) {
      var L = [], o1 = O('sine', o.f), o2 = O('sine', o.f * 1.498), lp = F('lowpass', 500), g = G(o.v);
      o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(d); lfo(g.gain, 0.05, o.v * 0.4, t, null, L);
      o1.start(t); o2.start(t); L.push(o1, o2); return L;
    },
    hum: function (d, t, o) {
      var L = [], s = N(), bp = F('bandpass', 3400, 10), g = G(o.v); s.connect(bp); bp.connect(g); g.connect(d);
      lfo(g.gain, 0.15, o.v * 0.6, t, null, L); s.start(t, R() * 3); L.push(s); return L;
    }
  };
  var EV = { // one-shot ambient events (d, t)
    cricket: function (d, t) {
      var o = O('sine', rr(3900, 4700)), g = G(0), n = 3 + ((R() * 3) | 0), v = rr(0.01, 0.022), s;
      for (var i = 0; i < n; i++) { s = t + i * 0.05; g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(v, s + 0.01); g.gain.linearRampToValueAtTime(0, s + 0.032); }
      o.connect(g); route(g, d, rr(-0.8, 0.8)); o.start(t); voiceEnd(o, t + n * 0.05 + 0.03);
    },
    owl: function (d, t) { var f = rr(360, 400), p = rr(-0.7, 0.7); for (var i = 0; i < 2 + (R() < 0.4 ? 1 : 0); i++) tone(d, t + i * 0.55, { f: f, f2: f * 0.93, dur: 0.42, a: 0.08, v: 0.035, lp: 900, pan: p }); },
    firefly: function (d, t) { bell(d, t, rr(1800, 2600), 0.008, 1.2, rr(-1, 1)); },
    rustle: function (d, t) { noise(d, t, { dur: rr(0.3, 0.7), a: 0.15, v: rr(0.015, 0.03), bp: rr(1800, 3200), bq: 0.7, pan: rr(-0.9, 0.9) }); },
    bird: function (d, t) {
      var f = rr(2200, 3000), p = rr(-0.8, 0.8), n = 2 + ((R() * 3) | 0), tt = t;
      for (var i = 0; i < n; i++) { tone(d, tt, { f: f * rr(0.9, 1.1), f2: f * rr(1.2, 1.5), dur: 0.07, a: 0.01, v: 0.018, pan: p }); tt += rr(0.08, 0.14); }
    },
    creak: function (d, t) { tone(d, t, { w: 'sawtooth', f: rr(70, 110), f2: rr(60, 90), dur: rr(0.5, 1), a: 0.15, v: 0.02, bp: rr(400, 700), bq: 6, pan: rr(-0.8, 0.8), vib: [7, 40] }); },
    crow: function (d, t) { var p = rr(-0.9, 0.9); for (var i = 0, n = 1 + ((R() * 3) | 0); i < n; i++) tone(d, t + i * 0.32, { w: 'sawtooth', f: rr(500, 620), f2: 420, dur: 0.22, a: 0.02, v: 0.012, bp: 1100, bq: 3, pan: p }); },
    frog: function (d, t) { var f = rr(100, 170), p = rr(-0.8, 0.8); for (var i = 0, n = 1 + ((R() * 3) | 0); i < n; i++) tone(d, t + i * 0.16, { w: 'sawtooth', f: f, f2: f * 1.4, dur: 0.09, a: 0.01, v: 0.035, bp: rr(500, 800), bq: 5, pan: p }); },
    bubble: function (d, t) { tone(d, t, { f: rr(180, 320), f2: rr(500, 800), dur: 0.06, a: 0.005, v: 0.03, pan: rr(-0.7, 0.7) }); },
    drip: function (d, t) { tone(d, t, { f: rr(1200, 1800), f2: rr(400, 600), dur: 0.07, a: 0.002, v: 0.035, pan: rr(-0.8, 0.8) }); },
    gust: function (d, t) { noise(d, t, { dur: rr(2, 4), a: 1.2, v: rr(0.03, 0.06), bp: rr(300, 500), bp2: rr(900, 1500), bq: 1.2, pan: rr(-0.6, 0.6) }); },
    moan: function (d, t) { var f = rr(100, 120); tone(d, t, { f: f, f2: f * 0.82, dur: 3, a: 1.2, v: 0.03, lp: 400, vib: [4, 15] }); tone(d, t + 0.2, { f: f * 1.5, f2: f * 1.2, dur: 2.6, a: 1.2, v: 0.012, lp: 500 }); },
    patter: function (d, t) { noise(d, t, { dur: 0.015, a: 0.002, v: rr(0.01, 0.03), lp: 6000, hp: 2000, pan: rr(-1, 1) }); },
    thunder: function (d, t) { noise(d, t, { dur: rr(2.5, 4), a: 0.4, v: 0.09, lp: 220, lp2: 90 }); tone(d, t + 0.1, { f: 48, f2: 36, dur: 2.5, a: 0.4, v: 0.06 }); }
  };
  // ev: [eventName, mean seconds between occurrences]
  var AMB = {
    grove_night: { wet: 0.35, beds: [['wind', { lo: 250, hi: 650, v: 0.035 }]], ev: [['cricket', 0.6], ['owl', 20], ['firefly', 5], ['rustle', 8]] },
    grove_day: { wet: 0.3, beds: [['wind', { lo: 400, hi: 1100, v: 0.03 }]], ev: [['bird', 2.2], ['rustle', 4]] },
    forest: { wet: 0.45, beds: [['wind', { lo: 180, hi: 500, v: 0.045 }], ['drone', { f: 55, v: 0.018 }]], ev: [['creak', 6], ['crow', 12], ['rustle', 6]] },
    swamp: { wet: 0.35, beds: [['hum', { v: 0.012 }], ['wind', { lo: 150, hi: 380, v: 0.03 }]], ev: [['frog', 1.4], ['bubble', 0.9], ['drip', 4]] },
    mountain_wind: { wet: 0.3, beds: [['wind', { lo: 300, hi: 1400, v: 0.06, rate: 0.11 }], ['wind', { lo: 900, hi: 2200, v: 0.018, rate: 0.17 }]], ev: [['gust', 5]] },
    crypt: { wet: 0.75, beds: [['drone', { f: 46, v: 0.03 }], ['wind', { lo: 120, hi: 300, v: 0.025 }]], ev: [['drip', 1.8], ['moan', 14]] },
    rain: { wet: 0.25, beds: [['rain', { v: 0.06 }]], ev: [['patter', 0.2], ['thunder', 24], ['drip', 2]] }
  };
  function startAmb(id, fade) {
    var E = X, def = AMB[id], now = E.ctx.currentTime, n0 = E.nc;
    var a = mkInst(E.B.amb, function () { return def.wet; }, ['in'], { id: id, beds: [], ev: [] });
    def.beds.forEach(function (b) { BEDS[b[0]](a.g['in'], now, b[1]).forEach(function (s) { a.beds.push({ s: s, end: Infinity }); }); });
    def.ev.forEach(function (e) { a.ev.push({ fn: EV[e[0]], mean: e[1], next: now + 0.3 + R() * e[1] }); });
    a.n = E.nc - n0; fadeInst(a, 1, Math.max(0.05, fade) / 3); E.ambs.push(a); return a;
  }
  function schedAmb(a, h, now) {
    var c = 0, lim = X.offline ? 1e6 : 12;
    a.ev.forEach(function (e) {
      if (e.next < now - 0.1) { e.next = now + R() * e.mean; X.skips++; }
      while (e.next < h && c < lim) {
        var n0 = X.nc; X.vend = e.next;
        if (X.offline || X.liveN < NODE_CAP) e.fn(a.g['in'], e.next);
        reg(X, X.vend + 0.05, X.nc - n0, 'a'); e.next += Math.max(0.08, -Math.log(1 - R()) * e.mean); c++;
      }
    });
    return c;
  }

  // ===================================================================== 8. Sound effects
  // S(id, {n: max voices, gap: min retrigger ms, wet: reverb send, bus, vary: random pitch spread}, fn(d, t))
  var SFX = {};
  function S(id, o, fn) { SFX[id] = { n: o.n || 3, gap: (o.gap == null ? 40 : o.gap) / 1000, wet: o.wet || 0, bus: o.bus || 'sfx', vary: o.vary || 0, fn: fn }; }
  function crackle(d, t, n, v) { for (var i = 0; i < n; i++) noise(d, t + R() * 0.25, { dur: 0.03, v: v, bp: rr(1500, 3000), bq: 2 }); }
  function bubbles(d, t, n, lo, hi, span, v) { for (var i = 0; i < n; i++) { var f = rr(lo, hi); tone(d, t + R() * span, { f: f, f2: f * 1.9, dur: 0.06, v: v }); } }
  function coin(d, t) { tone(d, t, { w: 'triangle', f: 988, dur: 0.08, v: 0.1, lp: 4000 }); tone(d, t + 0.07, { w: 'triangle', f: 1318, dur: 0.35, v: 0.1, lp: 4000 }); }
  function hitE(d, t) { noise(d, t, { dur: 0.09, v: 0.16, bp: 1300 }); tone(d, t, { f: 240, f2: 110, dur: 0.12, v: 0.2 }); }
  // --- UI
  S('ui_move', { n: 2, gap: 35, wet: 0.05 }, function (d, t) { tone(d, t, { w: 'triangle', f: 1046, dur: 0.06, v: 0.12, lp: 3000 }); });
  S('ui_select', { n: 2, gap: 60, wet: 0.15 }, function (d, t) { tone(d, t, { w: 'triangle', f: 784, dur: 0.12, v: 0.12, lp: 3500 }); bell(d, t + 0.07, 1175, 0.1, 0.35); });
  S('ui_back', { n: 2, gap: 60, wet: 0.1 }, function (d, t) { tone(d, t, { w: 'triangle', f: 880, dur: 0.1, v: 0.11, lp: 3000 }); tone(d, t + 0.07, { w: 'triangle', f: 587, dur: 0.16, v: 0.11, lp: 2500 }); });
  S('ui_open', { n: 2, gap: 80, wet: 0.2 }, function (d, t) { noise(d, t, { dur: 0.2, a: 0.06, v: 0.05, bp: 900, bp2: 2400, bq: 0.8 }); tone(d, t, { f: 523, f2: 1046, dur: 0.22, a: 0.02, v: 0.12 }); });
  S('ui_close', { n: 2, gap: 80, wet: 0.2 }, function (d, t) { noise(d, t, { dur: 0.2, a: 0.03, v: 0.05, bp: 2400, bp2: 800, bq: 0.8 }); tone(d, t, { f: 1046, f2: 523, dur: 0.2, a: 0.01, v: 0.11 }); });
  S('ui_error', { n: 1, gap: 150, wet: 0.05 }, function (d, t) { tone(d, t, { w: 'triangle', f: 233, dur: 0.12, v: 0.16, lp: 900 }); tone(d, t + 0.12, { w: 'triangle', f: 196, dur: 0.2, v: 0.16, lp: 800 }); });
  S('save', { n: 1, gap: 400, wet: 0.4 }, function (d, t) { chime(d, t, [84, 88, 91, 96], 0.08, 0.09, 0.9); });
  // --- Spells
  S('cast_charge', { n: 2, gap: 150, wet: 0.4 }, function (d, t) { noise(d, t, { dur: 0.7, a: 0.5, v: 0.07, bp: 500, bp2: 2500, bq: 3 }); tone(d, t, { f: 330, f2: 990, dur: 0.7, a: 0.4, v: 0.06, trem: [12, 0.5] }); });
  S('cast_moonbolt', { n: 3, gap: 70, wet: 0.35, vary: 0.03 }, function (d, t) {
    tone(d, t, { f: 660, f2: 1320, ft: 0.12, dur: 0.25, v: 0.14 }); tone(d, t, { w: 'triangle', f: 1320, dur: 0.3, v: 0.05, lp: 4000 });
    noise(d, t, { dur: 0.18, v: 0.04, lp: 6000, hp: 2000 }); bell(d, t + 0.03, 1568, 0.06, 0.5);
  });
  S('cast_ember', { n: 3, gap: 80, wet: 0.2, vary: 0.04 }, function (d, t) { noise(d, t, { dur: 0.35, a: 0.03, v: 0.16, lp: 400, lp2: 2600, lt: 0.2 }); tone(d, t, { w: 'triangle', f: 160, f2: 80, dur: 0.3, v: 0.12, lp: 600 }); crackle(d, t + 0.05, 4, 0.06); });
  S('cast_thorn', { n: 3, gap: 80, wet: 0.2, vary: 0.04 }, function (d, t) { noise(d, t, { dur: 0.2, a: 0.04, v: 0.08, bp: 1200, bq: 1.5 }); tone(d, t, { w: 'triangle', f: 392, f2: 196, dur: 0.18, v: 0.14, lp: 1800 }); tone(d, t + 0.06, { w: 'triangle', f: 587, dur: 0.15, v: 0.08, lp: 2000 }); });
  S('cast_frost', { n: 3, gap: 80, wet: 0.5, vary: 0.03 }, function (d, t) { noise(d, t, { dur: 0.35, a: 0.02, v: 0.05, lp: 7000, hp: 2500 }); chime(d, t, [91, 95, 98], 0.04, 0.06, 0.5); });
  S('cast_starfall', { n: 2, gap: 200, wet: 0.55 }, function (d, t) { chime(d, t, [72, 76, 79, 84, 88, 91], 0.06, 0.07, 0.8); noise(d, t, { dur: 0.6, a: 0.3, v: 0.06, bp: 600, bp2: 3500, bq: 2 }); tone(d, t, { f: 220, f2: 440, dur: 0.6, a: 0.2, v: 0.08 }); });
  S('impact_moonbolt', { n: 4, gap: 40, wet: 0.35, vary: 0.05 }, function (d, t) { noise(d, t, { dur: 0.3, v: 0.14, lp: 2500, lp2: 300 }); tone(d, t, { f: 784, f2: 392, dur: 0.2, v: 0.12 }); bell(d, t, 1318, 0.05, 0.4); });
  S('impact_ember', { n: 4, gap: 40, wet: 0.2, vary: 0.05 }, function (d, t) { noise(d, t, { dur: 0.45, v: 0.2, lp: 1800, lp2: 150 }); tone(d, t, { f: 130, f2: 45, dur: 0.35, v: 0.25 }); crackle(d, t + 0.05, 3, 0.05); });
  S('impact_thorn', { n: 4, gap: 40, wet: 0.15, vary: 0.05 }, function (d, t) { noise(d, t, { dur: 0.1, v: 0.16, bp: 900, bq: 1.2 }); tone(d, t, { w: 'triangle', f: 220, f2: 110, dur: 0.15, v: 0.16, lp: 1200 }); tone(d, t, { w: 'triangle', f: 165, dur: 0.2, v: 0.07, lp: 900 }); });
  S('impact_frost', { n: 4, gap: 40, wet: 0.45, vary: 0.04 }, function (d, t) {
    noise(d, t, { dur: 0.3, v: 0.08, lp: 6500, hp: 2000 }); for (var i = 0; i < 4; i++) bell(d, t + i * 0.025, rr(1700, 2500), 0.045, 0.35, rr(-0.5, 0.5));
    tone(d, t, { f: 440, f2: 220, dur: 0.15, v: 0.06 });
  });
  S('impact_starfall', { n: 2, gap: 120, wet: 0.45 }, function (d, t) { tone(d, t, { f: 100, f2: 38, dur: 0.7, v: 0.32 }); noise(d, t, { dur: 0.9, v: 0.18, lp: 3000, lp2: 150 }); chime(d, t, [96, 91, 88, 84, 79], 0.05, 0.05, 0.6); });
  // --- Combat
  S('hit_player', { n: 2, gap: 90, wet: 0.1, vary: 0.04 }, function (d, t) { tone(d, t, { f: 180, f2: 70, dur: 0.2, v: 0.28 }); noise(d, t, { dur: 0.12, v: 0.12, lp: 1400 }); tone(d, t, { w: 'triangle', f: 392, f2: 262, dur: 0.18, v: 0.07, lp: 1500 }); });
  S('hit_enemy', { n: 4, gap: 30, wet: 0.1, vary: 0.06 }, hitE);
  S('crit', { n: 2, gap: 60, wet: 0.3 }, function (d, t) { hitE(d, t); bell(d, t, 1760, 0.08, 0.4); bell(d, t + 0.04, 2093, 0.05, 0.4); noise(d, t, { dur: 0.15, v: 0.05, lp: 7000, hp: 3000 }); });
  S('enemy_windup', { n: 3, gap: 120, wet: 0.2 }, function (d, t) { tone(d, t, { w: 'triangle', f: 180, f2: 420, dur: 0.45, a: 0.3, v: 0.1, lp: 1400, trem: [10, 0.6] }); });
  S('enemy_die', { n: 4, gap: 50, wet: 0.35, vary: 0.05 }, function (d, t) { tone(d, t, { f: 520, f2: 130, dur: 0.45, v: 0.14 }); noise(d, t, { dur: 0.4, a: 0.02, v: 0.08, lp: 2000, lp2: 300 }); bell(d, t + 0.2, 1046, 0.05, 0.6); });
  S('boss_roar', { n: 1, gap: 600, wet: 0.3 }, function (d, t) {
    tone(d, t, { w: 'sawtooth', f: 95, f2: 62, dur: 1.4, a: 0.12, v: 0.1, lp: 700, lp2: 300, trem: [17, 0.4] });
    tone(d, t, { w: 'sawtooth', f: 97, f2: 60, dur: 1.4, a: 0.15, v: 0.08, lp: 650, lp2: 280, det: 12 });
    noise(d, t, { dur: 1.3, a: 0.15, v: 0.12, bp: 450, bq: 2, trem: [17, 0.5] }); tone(d, t, { f: 55, f2: 42, dur: 1.4, a: 0.2, v: 0.2 });
  });
  S('boss_phase', { n: 1, gap: 800, wet: 0.5 }, function (d, t) { tone(d, t, { f: 80, f2: 35, dur: 1.2, v: 0.3 }); chord(d, t, [57, 60, 64, 65], { w: 'triangle', a: 0.8, dur: 1.8, v: 0.045, lp: 1500 }); noise(d, t, { dur: 1.5, a: 1, v: 0.06, bp: 300, bp2: 3000, bq: 2 }); });
  S('shield', { n: 2, gap: 150, wet: 0.45 }, function (d, t) { chord(d, t, [72, 79, 84, 88], { a: 0.06, dur: 0.7, v: 0.05, trem: [9, 0.5] }); noise(d, t, { dur: 0.4, a: 0.05, v: 0.03, lp: 5000, hp: 1800 }); });
  S('heal', { n: 2, gap: 150, wet: 0.55 }, function (d, t) { chime(d, t, [72, 76, 79, 84], 0.08, 0.07, 0.9); tone(d, t, { f: 392, a: 0.25, dur: 0.9, v: 0.06 }); });
  // --- Homestead
  S('plant', { n: 3, gap: 80, wet: 0.1, vary: 0.05 }, function (d, t) { noise(d, t, { dur: 0.14, a: 0.01, v: 0.14, lp: 700 }); tone(d, t + 0.08, { f: 300, f2: 520, dur: 0.09, v: 0.1 }); });
  S('water', { n: 2, gap: 120, wet: 0.25 }, function (d, t) { noise(d, t, { dur: 0.35, a: 0.03, v: 0.07, bp: 1800, bq: 0.7 }); bubbles(d, t, 5, 350, 600, 0.35, 0.05); });
  S('harvest', { n: 3, gap: 70, wet: 0.25, vary: 0.04 }, function (d, t) { tone(d, t, { f: 330, f2: 740, dur: 0.09, v: 0.14 }); noise(d, t, { dur: 0.12, v: 0.05, bp: 2500 }); bell(d, t + 0.06, 1046, 0.07, 0.5); });
  S('pickup', { n: 3, gap: 50, wet: 0.3, vary: 0.02 }, function (d, t) { bell(d, t, 1318, 0.08, 0.3); bell(d, t + 0.06, 1760, 0.08, 0.45); });
  S('coin', { n: 3, gap: 50, wet: 0.25 }, coin);
  S('craft', { n: 2, gap: 100, wet: 0.2 }, function (d, t) { tone(d, t, { w: 'triangle', f: 660, dur: 0.05, v: 0.12, bp: 900 }); tone(d, t + 0.12, { w: 'triangle', f: 700, dur: 0.05, v: 0.12, bp: 900 }); bell(d, t + 0.24, 1568, 0.06, 0.6); });
  S('brew', { n: 2, gap: 200, wet: 0.3 }, function (d, t) { bubbles(d, t, 7, 180, 320, 0.5, 0.07); bell(d, t + 0.45, 1175, 0.05, 0.7); });
  S('potion', { n: 2, gap: 200, wet: 0.3 }, function (d, t) { for (var i = 0; i < 3; i++) tone(d, t + i * 0.13, { f: 320, f2: 200, dur: 0.1, v: 0.12, lp: 1200 }); chime(d, t + 0.4, [84, 88, 91], 0.05, 0.05, 0.6); });
  S('broom_mount', { n: 1, gap: 300, wet: 0.3 }, function (d, t) { noise(d, t, { dur: 0.5, a: 0.2, v: 0.1, bp: 400, bp2: 1800, bq: 1.5 }); bell(d, t + 0.3, 1175, 0.06, 0.6); });
  S('broom_land', { n: 1, gap: 300, wet: 0.2 }, function (d, t) { noise(d, t, { dur: 0.45, a: 0.05, v: 0.1, bp: 1800, bp2: 400, bq: 1.5 }); tone(d, t + 0.35, { f: 150, f2: 70, dur: 0.15, v: 0.16 }); });
  S('broom_whoosh', { n: 2, gap: 150, wet: 0.2, vary: 0.08 }, function (d, t) { noise(d, t, { dur: 0.55, a: 0.25, v: 0.2, bp: 600, bp2: 2000, bq: 1.8 }); });
  S('footstep_grass', { n: 2, gap: 70, wet: 0.05, vary: 0.1 }, function (d, t) { noise(d, t, { dur: 0.07, v: 0.11, lp: 1800, hp: 300 }); noise(d, t + 0.01, { dur: 0.05, v: 0.035, bp: 3000 }); });
  S('footstep_stone', { n: 2, gap: 70, wet: 0.08, vary: 0.1 }, function (d, t) { noise(d, t, { dur: 0.03, v: 0.1, bp: 2200, bq: 2 }); tone(d, t, { f: 140, f2: 90, dur: 0.05, v: 0.12 }); });
  S('footstep_snow', { n: 2, gap: 70, wet: 0.05, vary: 0.1 }, function (d, t) { for (var i = 0; i < 4; i++) noise(d, t + i * 0.018, { dur: 0.025, v: 0.09, bp: rr(1500, 3000), bq: 1.5 }); });
  S('footstep_mud', { n: 2, gap: 70, wet: 0.05, vary: 0.1 }, function (d, t) { noise(d, t, { dur: 0.12, a: 0.02, v: 0.14, lp: 300, lp2: 1200, q: 4 }); tone(d, t, { f: 90, f2: 60, dur: 0.08, v: 0.1 }); });
  // --- Progress / world
  S('level_up', { n: 1, gap: 500, wet: 0.5 }, function (d, t) { chime(d, t, [67, 72, 76, 79, 84, 88], 0.07, 0.08, 1); chord(d, t, [60, 64, 67, 72], { w: 'triangle', a: 0.3, dur: 1.6, v: 0.04, lp: 2000 }); noise(d, t, { dur: 1, a: 0.5, v: 0.03, bp: 800, bp2: 4000 }); });
  S('quest_complete', { n: 1, gap: 500, wet: 0.45 }, function (d, t) { seq(d, t, [[0, 72], [0.12, 76], [0.24, 79], [0.36, 84]], { w: 'triangle', dur: 0.22, v: 0.1, lp: 3000 }); chord(d, t + 0.48, [72, 76, 79, 84], { w: 'triangle', a: 0.02, dur: 1.2, v: 0.045, lp: 2500 }); bell(d, t + 0.48, 1568, 0.06, 1.2); });
  S('region_restored', { n: 1, gap: 1500, wet: 0.6 }, function (d, t) {
    noise(d, t, { dur: 3, a: 2, v: 0.05, bp: 300, bp2: 4000, bq: 2 });
    chord(d, t, [53, 60, 65, 69, 72, 76], { w: 'triangle', a: 1.2, dur: 3.2, v: 0.03, lp: 2200, trem: [6, 0.3] });
    chime(d, t + 0.6, [72, 74, 76, 79, 81, 84, 86, 88, 91, 93], 0.2, 0.05, 1.2);
  });
  S('door', { n: 1, gap: 300, wet: 0.2 }, function (d, t) { tone(d, t, { w: 'sawtooth', f: 140, f2: 95, dur: 0.5, a: 0.05, v: 0.06, bp: 900, bq: 4, vib: [9, 30] }); tone(d, t + 0.45, { f: 110, f2: 60, dur: 0.2, v: 0.2 }); noise(d, t + 0.45, { dur: 0.12, v: 0.1, lp: 500 }); });
  S('shop_buy', { n: 2, gap: 150, wet: 0.3 }, function (d, t) { coin(d, t); chime(d, t + 0.1, [84, 91], 0.08, 0.06, 0.7); });
  S('cine_whoosh', { n: 2, gap: 200, wet: 0.4, bus: 'cine' }, function (d, t) {
    var p = P(-0.8), dd = d; if (p) { p.pan.setValueAtTime(-0.8, t); p.pan.linearRampToValueAtTime(0.8, t + 1.2); p.connect(d); dd = p; }
    noise(dd, t, { dur: 1.3, a: 0.6, v: 0.14, bp: 250, bp2: 2600, bq: 1.2 }); noise(dd, t + 0.1, { dur: 1.1, a: 0.5, v: 0.06, lp: 600, lp2: 3000 });
  });
  S('cine_sting', { n: 1, gap: 400, wet: 0.6, bus: 'cine' }, function (d, t) { tone(d, t, { f: 70, f2: 40, dur: 1.5, v: 0.3 }); chord(d, t, [57, 64, 69, 72, 76], { w: 'triangle', a: 0.01, dur: 2, v: 0.04, lp: 2500 }); bell(d, t, 1760, 0.06, 2); noise(d, t, { dur: 1, v: 0.1, lp: 4000, lp2: 200 }); });
  S('moonwell_pulse', { n: 1, gap: 500, wet: 0.6 }, function (d, t) { tone(d, t, { f: 110, a: 0.5, dur: 1.6, v: 0.12 }); tone(d, t, { f: 1760, a: 0.4, dur: 1.4, v: 0.025, trem: [5, 0.5] }); tone(d, t, { f: 1318, a: 0.5, dur: 1.5, v: 0.025, det: 5 }); noise(d, t, { dur: 1.4, a: 0.6, v: 0.02, bp: 1200, bq: 4 }); });
  S('defeat', { n: 1, gap: 800, wet: 0.5 }, function (d, t) { seq(d, t, [[0, 76], [0.25, 72], [0.5, 69], [0.75, 64], [1, 60, 1]], { dur: 0.5, v: 0.09 }); chord(d, t, [57, 60, 64], { w: 'triangle', a: 0.3, dur: 2.2, v: 0.04, lp: 1200 }); });
  S('victory', { n: 1, gap: 800, wet: 0.45 }, function (d, t) { seq(d, t, [[0, 67], [0.14, 72], [0.28, 76], [0.42, 79, 0.5]], { w: 'triangle', dur: 0.2, v: 0.1, lp: 3000 }); chord(d, t + 0.56, [60, 64, 67, 72, 76], { w: 'triangle', a: 0.03, dur: 1.4, v: 0.04, lp: 2500 }); chime(d, t + 0.56, [84, 88, 91, 96], 0.06, 0.05, 0.9); });

  function playSfx(E, id, o, at, force) {
    var d = SFX[id], w = perf(), now = E.ctx.currentTime;
    if (!force && w - (E.last[id] == null ? -1e9 : E.last[id]) < d.gap * 1000) { E.dropped++; return false; }
    if (!force && E.liveN > NODE_CAP) { E.dropped++; return false; }
    var vs = E.voices[id] = (E.voices[id] || []).filter(function (v) { return v.end > now; });
    while (vs.length >= d.n) { var old = vs.shift(); glide(old.g.gain, 0, 0.012); E.stolen++; }
    E.last[id] = w;
    var t = at != null ? at : now + 0.008, n0 = E.nc, bus = E.B[d.bus], g = G(SFX_GAIN * clamp(T(o.volume == null ? 1 : o.volume, 1), 0, 2));
    var p = o.pan != null ? P(o.pan) : null, out = p || g; if (p) g.connect(p);
    out.connect(bus.inD); if (d.wet) { var wg = G(d.wet); out.connect(wg); wg.connect(bus.inW); }
    E.rk = clamp(T(o.rate == null ? 1 : o.rate, 1), 0.25, 4) * (d.vary ? rr(1 - d.vary, 1 + d.vary) : 1); E.vend = t;
    try { d.fn(g, t); } finally { E.rk = 1; }
    var end = E.vend + 0.1; vs.push({ g: g, end: end }); reg(E, end, E.nc - n0, 's'); return true;
  }

  // ===================================================================== 9. Continuous loops
  var LOOPS = {
    broom: function (E) { // airy rushing wind; update({speed:0..1})
      var now = E.ctx.currentTime, L = [], g = G(0), s = N(), bp = F('bandpass', 900, 1.4), lp = F('lowpass', 2600), tr = G(0.75);
      s.connect(bp); bp.connect(lp); lp.connect(tr); tr.connect(g); g.connect(E.B.sfx.inD);
      var w = G(0.2); g.connect(w); w.connect(E.B.sfx.inW);
      lfo(bp.frequency, 0.4, 350, now, null, L); lfo(tr.gain, 0.23, 0.25, now, null, L); s.start(now, R() * 3); L.push(s);
      return { update: function (o) { var sp = clamp(T(o && o.speed != null ? o.speed : 0.6, 0.6), 0, 1); glide(g.gain, 0.05 + 0.11 * sp, 0.3); glide(bp.frequency, 600 + 900 * sp, 0.3); },
        stop: function () { glide(g.gain, 0, 0.15); var t = E.ctx.currentTime + 1; L.forEach(function (x) { try { x.stop(t); } catch (e) { /* ignore */ } }); } };
    },
    charge: function (E) { // held spell charge hum
      var now = E.ctx.currentTime, L = [], g = G(0), o1 = O('sine', 330), o2 = O('triangle', 495), lp = F('lowpass', 1600), tr = G(0.7);
      o1.connect(lp); o2.connect(lp); lp.connect(tr); tr.connect(g); g.connect(E.B.sfx.inD); var w = G(0.4); g.connect(w); w.connect(E.B.sfx.inW);
      lfo(tr.gain, 7, 0.3, now, null, L); lfo(o1.detune, 0.5, 15, now, null, L); o1.start(now); o2.start(now); L.push(o1, o2);
      return { update: function (o) { var sp = clamp(T(o && o.speed != null ? o.speed : 0.5, 0.5), 0, 1); glide(g.gain, 0.03 + 0.05 * sp, 0.2); glide(o1.frequency, 330 + 330 * sp, 0.4); glide(o2.frequency, 495 + 495 * sp, 0.4); },
        stop: function () { glide(g.gain, 0, 0.08); var t = E.ctx.currentTime + 0.6; L.forEach(function (x) { try { x.stop(t); } catch (e) { /* ignore */ } }); } };
    }
  };
  function loopOn(E, name, o) {
    var L = E.loops[name]; if (L) { L.update(o); return true; }
    var n0 = E.nc; L = E.loops[name] = LOOPS[name](E); L.n = E.nc - n0; L.update(o); return true;
  }

  // ===================================================================== 10. Scheduler
  function prune(E, now) {
    var keep = [], n = 0, i, l;
    for (i = 0; i < E.live.length; i++) { l = E.live[i]; if (l.e > now) { keep.push(l); n += l.n; } }
    E.live = keep; E.liveN = n;
    for (var k in E.voices) if (E.voices[k].length) E.voices[k] = E.voices[k].filter(function (v) { return v.end > now; });
  }
  function sweepList(list, h, now, fn) {
    var n = 0;
    for (var i = list.length - 1; i >= 0; i--) {
      var it = list[i];
      if (it.stopped && now > it.dieAt) { killInst(it); list.splice(i, 1); continue; }
      if (!it.stopped) n += fn(it, h, now);
    }
    return n;
  }
  function tick(E, h) {
    var prev = X; X = E;
    try {
      var now = E.ctx.currentTime, n = sweepList(E.tracks, h, now, schedTrack) + sweepList(E.ambs, h, now, schedAmb);
      if (!E.offline && n > E.maxTick) E.maxTick = n;
      prune(E, now);
    } catch (e) { E.errors++; warnOnce('tick' + e.message, 'scheduler error: ' + e.message); } finally { X = prev; }
  }
  function pump() { if (RT && RT.ctx.state === 'running') tick(RT, RT.ctx.currentTime + (document.hidden ? LOOK_HIDDEN : LOOK)); }

  // ===================================================================== 11. Public API
  var A = MM.audio = { __mm: 1, intensity: 0, muted: false, vol: { master: 0.8, music: 0.6, sfx: 0.8, cine: 0.85, ambience: 0.7 } };
  var want = { music: null, amb: null }, BUSK = { music: 'music', sfx: 'sfx', cine: 'cine', ambience: 'amb' };
  Object.defineProperty(A, 'ready', { enumerable: true, get: function () { return !!RT && RT.ctx.state === 'running'; } });
  function withRT(fn) { if (!RT) return false; var prev = X; X = RT; try { return fn(RT); } catch (e) { RT.errors++; warnOnce('api' + e.message, e.message); return false; } finally { X = prev; } }
  function applyVol(E, name, tc) {
    var prev = X; X = E;
    try {
      var now = E.ctx.currentTime; tc = tc == null ? 0.08 : tc;
      if (name === 'master') { glide(E.master.gain, A.muted ? 0 : A.vol.master, tc); return; }
      var b = E.B[BUSK[name]], v = A.vol[name], ducked = (name === 'music' || name === 'ambience') && E.duckUntil > now;
      var dk = ducked ? E.duckAmt * (name === 'music' ? 1 : 0.6) : 0;
      [b.vD, b.vW].forEach(function (g) { glide(g.gain, v * (1 - dk), ducked ? 0.06 : tc); if (ducked && isFinite(E.duckUntil)) g.gain.setTargetAtTime(v, E.duckUntil, 0.3); });
    } finally { X = prev; }
  }
  function applyAll(E, tc) { ['master', 'music', 'sfx', 'cine', 'ambience'].forEach(function (k) { applyVol(E, k, tc); }); }

  A.init = function () {
    if (RT) { A.resume(); return true; }
    if (!AC) { warnOnce('noac', 'Web Audio not available; audio disabled.'); return false; }
    var ctx;
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { try { ctx = new AC(); } catch (e2) { warnOnce('ctx', 'AudioContext failed: ' + e2.message); return false; } }
    try { RT = X = buildEngine(ctx, {}); } catch (e) { warnOnce('build', 'audio graph failed: ' + e.message); try { ctx.close(); } catch (e3) { /* ignore */ } RT = X = null; return false; }
    applyAll(RT, 0.15);
    timer = setInterval(pump, TICK_MS);
    A.resume(); hookBus();
    if (want.music) A.music(want.music, { fade: 1 });
    if (want.amb) A.ambience(want.amb, { fade: 1.5 });
    return true;
  };
  A.resume = function () { if (RT && RT.ctx.state !== 'running' && RT.ctx.state !== 'closed' && RT.ctx.resume) { try { RT.ctx.resume().then(pump, function () {}); } catch (e) { /* ignore */ } } };
  A.music = function (id, o) {
    id = id === 'none' ? null : id || null;
    if (id && !TRACKS[id]) { warnOnce('m' + id, 'unknown music track "' + id + '"'); return false; }
    want.music = id;
    return withRT(function (E) {
      var fade = o && o.fade != null ? Math.max(0, T(o.fade, 1.5)) : 1.5, c = E.cur;
      if ((c && c.id === id) || (!c && !id)) return true;
      if (c) stopInst(c, fade);
      E.cur = id ? startTrack(id, fade) : null; limitFading(E.tracks); pump(); return true;
    }) || !RT;
  };
  A.ambience = function (id, o) {
    id = id === 'none' ? null : id || null;
    if (id && !AMB[id]) { warnOnce('a' + id, 'unknown ambience "' + id + '"'); return false; }
    want.amb = id;
    return withRT(function (E) {
      var fade = o && o.fade != null ? Math.max(0, T(o.fade, 2)) : 2, c = E.curAmb;
      if ((c && c.id === id) || (!c && !id)) return true;
      if (c) stopInst(c, fade);
      E.curAmb = id ? startAmb(id, fade) : null; limitFading(E.ambs); pump(); return true;
    }) || !RT;
  };
  A.sfx = function (id, o) {
    if (!RT || RT.ctx.state !== 'running') return false;
    if (!SFX[id]) { warnOnce('s' + id, 'unknown sfx "' + id + '"'); return false; }
    return withRT(function (E) { return playSfx(E, id, o || {}, null, false); });
  };
  A.loop = function (name, on, o) {
    if (name === 'broom_whoosh') name = 'broom';
    if (!LOOPS[name]) { warnOnce('l' + name, 'unknown loop "' + name + '"'); return false; }
    return withRT(function (E) {
      if (on) return loopOn(E, name, o || {});
      if (E.loops[name]) { E.loops[name].stop(); delete E.loops[name]; }
      return true;
    });
  };
  A.setIntensity = function (v) {
    var prevI = A.intensity; A.intensity = clamp(T(+v, 0), 0, 1);
    withRT(function (E) {
      if (A.intensity <= 0.01 && prevI > 0.01) E.intenOffAt = E.ctx.currentTime + 2;
      E.tracks.forEach(function (tr) { if (tr.g.inten) glide(tr.g.inten.gain, A.intensity, 0.4); });
    });
    return A.intensity;
  };
  A.duck = function (amount, ms) {
    return withRT(function (E) {
      var now = E.ctx.currentTime; E.duckAmt = clamp(T(amount == null ? 0.6 : +amount, 0.6), 0, 1);
      E.duckUntil = E.duckAmt > 0 ? now + (ms === Infinity ? Infinity : Math.max(0, T(ms == null ? 1500 : +ms, 1500)) / 1000) : 0;
      applyVol(E, 'music'); applyVol(E, 'ambience'); return true;
    });
  };
  A.setVolume = function (bus, v) {
    if (bus === 'amb') bus = 'ambience';
    if (!(bus in A.vol)) { warnOnce('b' + bus, 'unknown bus "' + bus + '"'); return false; }
    A.vol[bus] = clamp(T(+v, A.vol[bus]), 0, 1); if (RT) applyVol(RT, bus); return true;
  };
  A.getVolumes = function () { var o = M(A.vol, {}); o.muted = A.muted; return o; };
  A.setMuted = A.mute = function (m) { A.muted = m == null ? true : !!m; if (RT) applyVol(RT, 'master', 0.05); return A.muted; };
  A.toggleMute = function () { return A.setMuted(!A.muted); };
  A.applySettings = function (s) {
    if (!s || typeof s !== 'object') return;
    ['master', 'music', 'sfx', 'cine', 'ambience'].forEach(function (k) {
      var v = s[k] != null ? s[k] : s[k + 'Volume'];
      if (typeof v === 'number' && isFinite(v)) A.setVolume(k, v > 1 ? v / 100 : v);
    });
    if (typeof s.muted === 'boolean') A.setMuted(s.muted);
  };
  A.stopAll = function (o) {
    var fade = o && o.fade != null ? o.fade : 0.4;
    A.music(null, { fade: fade }); A.ambience(null, { fade: fade }); want.music = want.amb = null;
    withRT(function (E) {
      for (var k in E.loops) { E.loops[k].stop(); delete E.loops[k]; }
      for (var id in E.voices) E.voices[id].forEach(function (v) { glide(v.g.gain, 0, 0.03); });
      return true;
    });
  };
  A.current = function () { return { music: want.music, ambience: want.amb, intensity: A.intensity }; };
  A.list = function () { return { music: Object.keys(TRACKS), ambience: Object.keys(AMB).concat(['none']), sfx: Object.keys(SFX), loops: Object.keys(LOOPS) }; };
  A.limits = function (id) { var d = SFX[id]; return d ? { voices: d.n, gapMs: d.gap * 1000, bus: d.bus } : null; };
  A.stats = function () {
    if (!RT) return { ready: false, state: AC ? 'uninitialized' : 'unsupported', voices: 0, byId: {}, nodes: 0, tracks: 0, music: want.music, ambience: want.amb, bad: 0, errors: 0 };
    var E = RT, now = E.ctx.currentTime, by = {}, tot = 0, kinds = { m: 0, a: 0, s: 0 }, pers = 0, k;
    prune(E, now);
    for (k in E.voices) if (E.voices[k].length) { by[k] = E.voices[k].length; tot += E.voices[k].length; }
    E.live.forEach(function (l) { kinds[l.k] += l.n; });
    E.tracks.concat(E.ambs).forEach(function (i) { pers += i.n || 0; }); for (k in E.loops) pers += E.loops[k].n || 0;
    return { ready: A.ready, state: E.ctx.state, time: now, voices: tot, byId: by, nodes: E.liveN + pers, transient: E.liveN,
      musicNodes: kinds.m, ambNodes: kinds.a, sfxNodes: kinds.s, persistent: pers, graph: E.base, tracks: E.tracks.length, ambiences: E.ambs.length,
      loops: Object.keys(E.loops), music: E.cur ? E.cur.id : null, ambience: E.curAmb ? E.curAmb.id : null, intensity: A.intensity,
      dropped: E.dropped, stolen: E.stolen, skips: E.skips, maxStepsPerTick: E.maxTick, bad: E.bad, errors: E.errors };
  };
  function peakOf(an) { var b = an._b || (an._b = new Float32Array(an.fftSize)), m = 0; an.getFloatTimeDomainData(b); for (var i = 0; i < b.length; i++) { var a = Math.abs(b[i]); if (a > m) m = a; } return m; }
  A.meter = function () { return RT && RT.an.getFloatTimeDomainData ? { pre: peakOf(RT.anPre), post: peakOf(RT.an) } : { pre: 0, post: 0 }; };

  // ===================================================================== 12. Preview / offline render
  function render(spec) {
    spec = spec || {};
    if (!OAC) return Promise.resolve(null);
    var sec = clamp(T(spec.seconds, 3), 0.2, 60), sr = spec.sampleRate || 44100, oc, E, prev = X, saveI = A.intensity;
    try { oc = new OAC(2, Math.ceil(sr * sec), sr); } catch (e) { return Promise.reject(e); }
    try {
      E = X = buildEngine(oc, { offline: true, safety: spec.safety !== false });
      applyAll(E, 0.005); X = E;
      if (spec.intensity != null) A.intensity = clamp(spec.intensity, 0, 1);
      if (spec.music) E.cur = startTrack(spec.music, 0.05);
      if (spec.ambience) E.curAmb = startAmb(spec.ambience, 0.05);
      (spec.sfx || []).forEach(function (s) { playSfx(E, s[1], s[2] || {}, 0.02 + s[0], true); });
      if (spec.loop) loopOn(E, spec.loop, {});
      tick(E, sec);
    } finally { A.intensity = saveI; X = prev; }
    return oc.startRendering().then(function (buf) {
      var peak = 0, sum = 0, clip = 0, n = 0;
      for (var c = 0; c < buf.numberOfChannels; c++) {
        var d = buf.getChannelData(c);
        for (var i = 0; i < d.length; i++) { var a = Math.abs(d[i]); if (a > peak) peak = a; if (a >= 0.999) clip++; sum += d[i] * d[i]; n++; }
      }
      return { peak: peak, rms: Math.sqrt(sum / n), clipped: clip, seconds: sec, bad: E.bad, nodes: E.nc };
    });
  }
  A.preview = {
    tracks: Object.keys(TRACKS), ambiences: Object.keys(AMB), sfx: Object.keys(SFX), loops: Object.keys(LOOPS), render: render,
    track: function (id) { A.init(); A.music(id, { fade: 0.8 }); },
    amb: function (id) { A.init(); A.ambience(id, { fade: 1 }); },
    playAll: function (gapMs) { A.init(); var ids = Object.keys(SFX), i = 0, h = setInterval(function () { if (i >= ids.length) return clearInterval(h); A.sfx(ids[i++]); }, gapMs || 400); return h; }
  };

  // ===================================================================== 13. Auto-unlock + integration hooks
  var hooked = false;
  function hookBus() {
    if (MM.settings && typeof MM.settings.get === 'function') { // core keeps volMaster/volMusic/volSfx/volCine (0..1)
      try { var g = MM.settings.get() || {}; A.applySettings({ master: g.volMaster, music: g.volMusic, sfx: g.volSfx, cine: g.volCine }); } catch (e) { /* ignore */ }
    }
    if (hooked || !MM.bus || typeof MM.bus.on !== 'function') return; hooked = true;
    MM.bus.on('settings', function (s) { s = s && (s.audio || s); if (s && typeof s === 'object') A.applySettings(s); });
  }
  hookBus();
  function onGesture() { if (!RT) A.init(); else if (RT.ctx.state !== 'running') A.resume(); }
  ['pointerdown', 'keydown', 'touchend', 'mousedown'].forEach(function (ev) { window.addEventListener(ev, onGesture, { capture: true, passive: true }); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) pump(); });
})();
