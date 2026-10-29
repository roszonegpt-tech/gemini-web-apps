/* Moss Moon — MM.fx (FX agent): pooled particles / decals / rings / text / telegraphs,
 * signature spell VFX (Moonbolt, Ember Bloom, Thornbind, Frostbell, Starfall), combat feedback,
 * farming + broom + ambient effects, restoration wave, screen flash, slow-mo, sound hookup.
 *
 * Layers (MM.hooks):  postUpdate(dt) simulate · drawGround(ctx) ground decals under entities ·
 *   drawEffect wrapper (signature spells, mid layer) · postEffects(ctx) world particles (before
 *   the soft filter, so they bloom) · overlay(ctx) telegraphs, damage numbers, text, flashes
 *   (after the filter: always crisp and readable).
 * API (all coordinates are tile coords unless noted):
 *   MM.fx.burst(kind, x, y, opts)      kinds: dust soil water wet growth harvest pickup broom trail sparks
 *        hit shield heal crit burn chill root poison shock levelup kill bloom ember frost star moon
 *   MM.fx.telegraph({shape:'circle'|'cone'|'line'|'rect', x, y, r, w, h, dir, arc, dur, kind:'danger'|'ally',
 *        follow, iso, onEnd}) -> id   (r/w/h in screen px — the baseline measures distances in screen px)
 *   MM.fx.cancelTelegraph(id) ; MM.fx.zone(kind, x, y, r, dur) ('thorn'|'frost'|'ember'|'star')
 *   MM.fx.restorationWave(region, {x,y}?) ; MM.fx.flash(color, ms, alpha?) ; MM.fx.slowmo(sec, scale)
 *   MM.fx.text(str, x, y, {color, scale, life, z}) ; MM.fx.shake(px, sec) ; MM.fx.stats() ; MM.fx.clear()
 * Emits on MM.bus (for the HUD): 'spell:cast' {id,name,sig,school,color,cost,cooldown,actor},
 *   'spell:impact' {id,sig,x,y,index}, 'spell:fail' {id,reason,text}.
 */
window.MM = window.MM || {};
(function () {
  'use strict';
  const MM = window.MM;
  const W = 512, H = 320, TAU = Math.PI * 2;
  const FX = MM.fx = { enabled: true, autoTelegraph: true, version: 1 };

  // ------------------------------------------------------------------ guards / settings / services
  function base() { try { return typeof world === 'object' && !!world && typeof game === 'object' && !!game; } catch (e) { return false; } }
  function setting(k, d) { try { const s = MM.settings; if (s && s.get) { const v = s.get(k); return v === undefined || v === null ? d : v; } } catch (e) { /* */ } return d; }
  const S = { pScale: 0.7, rFlash: false, rMotion: false, numbers: true, quality: 'medium' };
  function readSettings() {
    let ps = 0.7; try { if (MM.settings && MM.settings.particleScale) ps = MM.settings.particleScale(); } catch (e) { /* */ }
    S.rMotion = !!setting('reducedMotion', false); S.rFlash = !!setting('reducedFlashes', false);
    S.pScale = ps > 0 ? ps : 0.35; if (S.rMotion) S.pScale = Math.min(S.pScale, 0.35);
    S.numbers = setting('damageNumbers', true) !== false; S.quality = setting('quality', 'medium');
    cap = Math.max(140, Math.round(PMAX * S.pScale));
    aCap = Math.max(24, Math.round(AMAX * S.pScale));
    if (pn > cap) pn = cap;
  }
  let sfxMute = 0;
  function sfx(id, o) { if (sfxMute) return; try { const a = MM.audio; if (a && a.sfx) a.sfx(id, o); } catch (e) { /* */ } }
  function emit(n, d) { try { if (MM.bus && MM.bus.emit) MM.bus.emit(n, d); } catch (e) { /* */ } }
  function shake(a, d) { try { if (MM.camera && MM.camera.shake) MM.camera.shake(a, d); } catch (e) { /* */ } }
  FX.shake = shake;
  function pulse(x, y, r, c, i, l) { try { if (MM.lighting && MM.lighting.pulse) MM.lighting.pulse(x, y, r, c, i, l); } catch (e) { /* */ } }
  function pulseW(wx, wy, r, c, i, l) { pulse((wx / 16 + wy / 8) / 2, (wy / 8 - wx / 16) / 2, r, c, i, l); } // projected px -> tile
  const rnd = Math.random, clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const PJX = (x, y) => (x - y) * 16, PJY = (x, y) => (x + y) * 8; // tile -> projected world px
  let camX = 0, camY = 0;
  const SX = (wx) => (wx - camX + 256) | 0, SY = (wy, z) => (wy - camY + 160 - z) | 0;
  function panOf(wx) { return clamp((wx - (base() ? game.camX : 0)) / 300, -0.8, 0.8); }
  function isNightNow() { try { return MM.lighting && MM.lighting.darkness ? MM.lighting.darkness() : (isNight() ? 1 : 0); } catch (e) { return 0; } }

  // ------------------------------------------------------------------ tiny sprites
  const glowC = new Map();
  function glow(color) {
    let c = glowC.get(color); if (c) return c;
    c = document.createElement('canvas'); c.width = c.height = 9;
    const x = c.getContext('2d'), g = x.createRadialGradient(4.5, 4.5, 0, 4.5, 4.5, 4.5);
    g.addColorStop(0, color); g.addColorStop(0.35, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 9, 9);
    if (glowC.size > 64) glowC.delete(glowC.keys().next().value);
    glowC.set(color, c); return c;
  }
  // moonbolt crescents, 16 headings (convex side forward)
  const CRES = [];
  (function makeCrescents() {
    const b = document.createElement('canvas'); b.width = b.height = 15;
    const x = b.getContext('2d');
    x.fillStyle = '#c4d6ff'; x.beginPath(); x.arc(7.5, 7.5, 5.5, 0, TAU); x.fill();
    x.globalCompositeOperation = 'destination-out'; x.beginPath(); x.arc(4.6, 7.5, 5.0, 0, TAU); x.fill();
    x.globalCompositeOperation = 'source-atop'; x.fillStyle = '#ffffff'; x.beginPath(); x.arc(10.4, 7.5, 2.6, 0, TAU); x.fill();
    for (let i = 0; i < 16; i++) {
      const c = document.createElement('canvas'); c.width = c.height = 15;
      const y = c.getContext('2d'); y.imageSmoothingEnabled = false;
      y.translate(7.5, 7.5); y.rotate(i / 16 * TAU); y.drawImage(b, -7.5, -7.5);
      CRES.push(c);
    }
  })();
  // hazard hatch pattern + red edge vignette
  const hatch = document.createElement('canvas'); hatch.width = hatch.height = 8;
  (function () {
    const x = hatch.getContext('2d');
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
      const d = (i + j) % 8;
      if (d < 2) { x.fillStyle = 'rgba(255,196,84,.9)'; x.fillRect(i, j, 1, 1); } else if (d >= 4 && d < 6) { x.fillStyle = 'rgba(70,18,10,.75)'; x.fillRect(i, j, 1, 1); }
    }
  })();
  let hatchPat = null;
  const hurtV = document.createElement('canvas'); hurtV.width = 256; hurtV.height = 160;
  (function () {
    const x = hurtV.getContext('2d'), g = x.createRadialGradient(128, 80, 50, 128, 80, 150);
    g.addColorStop(0, 'rgba(160,20,20,0)'); g.addColorStop(0.6, 'rgba(170,30,26,.25)'); g.addColorStop(1, 'rgba(120,10,16,.85)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 160);
  })();

  // ------------------------------------------------------------------ pixel font (3x5, 1px outline)
  const FONT = {
    '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001011001111', '4': '101101111001001',
    '5': '111100111001111', '6': '111100111101111', '7': '111001010010010', '8': '111101111101111', '9': '111101111001111',
    A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100',
    G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
    M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100', Q: '010101101110011', R: '110101110101101',
    S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
    Y: '101101010010010', Z: '111001010100111', '+': '000010111010000', '-': '000000111000000', '!': '010010010000010', '.': '000000000000010',
    ':': '000010000010000', '%': '101001010100101', '/': '001001010100100', '?': '110001010000010', "'": '010010000000000', 'x': '000101010101000', ' ': '000000000000000',
  };
  const GLYPHS = Object.keys(FONT), GI = new Int16Array(128).fill(-1);
  GLYPHS.forEach((g, i) => { GI[g.charCodeAt(0)] = i; });
  for (let c = 97; c <= 122; c++) if (c !== 120) GI[c] = GI[c - 32];
  const atlasC = new Map();
  function atlas(color) {
    let c = atlasC.get(color); if (c) return c;
    c = document.createElement('canvas'); c.width = GLYPHS.length * 5; c.height = 7;
    const x = c.getContext('2d');
    for (let pass = 0; pass < 2; pass++) {
      x.fillStyle = pass ? color : 'rgba(22,24,30,.92)';
      GLYPHS.forEach((g, i) => {
        const bits = FONT[g];
        for (let k = 0; k < 15; k++) if (bits.charCodeAt(k) === 49) {
          const gx = k % 3, gy = (k / 3) | 0;
          if (pass) x.fillRect(i * 5 + 1 + gx, 1 + gy, 1, 1); else x.fillRect(i * 5 + gx, gy, 3, 3);
        }
      });
    }
    if (atlasC.size > 48) atlasC.delete(atlasC.keys().next().value);
    atlasC.set(color, c); return c;
  }
  function textWidth(str, s) { return str.length * 4 * s + s; }
  function drawText(ctx, str, x, y, color, s) {
    const a = atlas(color);
    x = x | 0; y = y | 0;
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i), g = code < 128 ? GI[code] : -1;
      if (g >= 0) ctx.drawImage(a, g * 5, 0, 5, 7, x + i * 4 * s, y, 5 * s, 7 * s);
    }
  }
  FX.drawText = drawText; FX.textWidth = textWidth;

  // ------------------------------------------------------------------ particle pool (SoA)
  const PMAX = 900;
  const X = new Float32Array(PMAX), Y = new Float32Array(PMAX), Z = new Float32Array(PMAX), VX = new Float32Array(PMAX), VY = new Float32Array(PMAX), VZ = new Float32Array(PMAX);
  const G = new Float32Array(PMAX), DR = new Float32Array(PMAX), LF = new Float32Array(PMAX), TT = new Float32Array(PMAX);
  const SZ = new Uint8Array(PMAX), SH = new Uint8Array(PMAX), AD = new Uint8Array(PMAX), HM = new Uint8Array(PMAX);
  const C = new Array(PMAX).fill('#fff');
  let pn = 0, cap = 630, dropped = 0;
  const PX = 0, SPK = 1, STR = 2, GLW = 3, PET = 4, FLK = 5, LEAF = 6, BUB = 7, COIN = 8, PLUS = 9;
  function P(wx, wy, z, vx, vy, vz, life, color, shape, size, grav, drag, add) {
    if (pn >= cap) { dropped++; return -1; }
    const i = pn++;
    X[i] = wx; Y[i] = wy; Z[i] = z; VX[i] = vx; VY[i] = vy; VZ[i] = vz; LF[i] = TT[i] = life; C[i] = color;
    SH[i] = shape; SZ[i] = size || 1; G[i] = grav || 0; DR[i] = drag || 0; AD[i] = add ? 1 : 0; HM[i] = 0;
    return i;
  }
  function killP(i) {
    const j = --pn; if (i === j) return;
    X[i] = X[j]; Y[i] = Y[j]; Z[i] = Z[j]; VX[i] = VX[j]; VY[i] = VY[j]; VZ[i] = VZ[j]; G[i] = G[j]; DR[i] = DR[j]; LF[i] = LF[j]; TT[i] = TT[j];
    SZ[i] = SZ[j]; SH[i] = SH[j]; AD[i] = AD[j]; HM[i] = HM[j]; C[i] = C[j];
  }
  // n scaled by particle setting (never below 1 when n>0)
  const N = (n) => n <= 0 ? 0 : Math.max(1, Math.round(n * S.pScale));
  // radial spray helper
  function spray(wx, wy, z, n, speed, life, colors, shape, size, grav, drag, add, up) {
    n = N(n);
    for (let k = 0; k < n; k++) {
      const a = rnd() * TAU, s = speed * (0.4 + rnd() * 0.6);
      P(wx, wy, z, Math.cos(a) * s, Math.sin(a) * s * 0.5, (up || 0) * (0.5 + rnd()), life * (0.6 + rnd() * 0.5), colors[k % colors.length], shape, size, grav, drag, add);
    }
  }

  // ------------------------------------------------------------------ decals / rings (object pool)
  const DMAX = 72, D = [];
  for (let i = 0; i < DMAX; i++) D.push({ on: false, kind: '', wx: 0, wy: 0, z: 0, life: 0, ttl: 1, r: 0, r2: 0, c1: '#fff', c2: '#fff', rot: 0, n: 0, layer: 2, seed: 0, ref: null, a: 1 });
  let dn = 0;
  const L_GROUND = 1, L_WORLD = 2, L_OVER = 4;
  function decal(kind, wx, wy, life, layer, r, r2, c1, c2) {
    let d = null;
    for (let i = 0; i < DMAX; i++) if (!D[i].on) { d = D[i]; break; }
    if (!d) { let m = 1e9; for (let i = 0; i < DMAX; i++) if (D[i].life < m && D[i].kind !== 'thorn') { m = D[i].life; d = D[i]; } if (!d) return null; dn--; }
    d.on = true; d.kind = kind; d.wx = wx; d.wy = wy; d.z = 0; d.life = d.ttl = life; d.layer = layer; d.r = r || 8; d.r2 = r2 == null ? d.r : r2;
    d.c1 = c1 || '#fff'; d.c2 = c2 || d.c1; d.rot = rnd() * TAU; d.n = 0; d.seed = (rnd() * 1000) | 0; d.ref = null; d.a = 1;
    dn++; return d;
  }
  function ring(wx, wy, z, r, r2, life, c1, c2) { const d = decal('ring', wx, wy, life, L_WORLD, r, r2, c1, c2); if (d) d.z = z; return d; }

  // ------------------------------------------------------------------ floating text pool
  const TMAX = 48, T = [];
  for (let i = 0; i < TMAX; i++) T.push({ on: false, str: '', wx: 0, wy: 0, z: 0, rise: 14, vx: 0, life: 0, ttl: 1, color: '#fff', s: 1, pop: 0 });
  let tn = 0;
  function text(str, wx, wy, z, color, s, life, rise) {
    let t = null;
    for (let i = 0; i < TMAX; i++) if (!T[i].on) { t = T[i]; break; }
    if (!t) { let m = 1e9; for (let i = 0; i < TMAX; i++) if (T[i].life < m) { m = T[i].life; t = T[i]; } tn--; }
    t.on = true; t.str = str; t.wx = wx; t.wy = wy; t.z = z; t.color = color; t.s = s || 1; t.life = t.ttl = life || 0.9; t.rise = rise == null ? 14 : rise;
    t.vx = (rnd() - 0.5) * 8; t.pop = s > 1 ? 0.08 : 0; tn++; return t;
  }
  FX.text = function (str, x, y, o) { o = o || {}; if (!base()) return; text(String(str).slice(0, 24), PJX(x, y), PJY(x, y), o.z == null ? 44 : o.z, o.color || '#fff4d6', o.scale || 1, o.life || 1.2, o.rise); };

  // ------------------------------------------------------------------ telegraphs
  const GMAX = 24, TG = [];
  for (let i = 0; i < GMAX; i++) TG.push({ on: false, id: 0, shape: 'circle', x: 0, y: 0, r: 20, w: 20, h: 20, dir: 0, arc: 1, dur: 1, t: 0, kind: 'danger', iso: false, follow: null, onEnd: null });
  let gid = 1, gn = 0;
  FX.telegraph = function (o) {
    if (!o) return 0;
    let g = null; for (let i = 0; i < GMAX; i++) if (!TG[i].on) { g = TG[i]; break; }
    if (!g) return 0;
    g.on = true; g.id = gid++; g.shape = o.shape || 'circle'; g.follow = o.follow || null;
    g.x = o.follow ? o.follow.x : (+o.x || 0); g.y = o.follow ? o.follow.y : (+o.y || 0);
    g.r = +o.r || 24; g.w = +o.w || g.r; g.h = +o.h || g.r; g.dir = +o.dir || 0; g.arc = o.arc == null ? 1.0 : +o.arc; g.dur = Math.max(0.05, +o.dur || 1); g.t = 0;
    g.kind = o.kind || 'danger'; g.iso = !!o.iso; g.onEnd = typeof o.onEnd === 'function' ? o.onEnd : null; gn++;
    if (g.kind === 'danger' && o.sound !== false) sfx('enemy_windup', { volume: 0.6, pan: base() ? panOf(PJX(g.x, g.y)) : 0 });
    return g.id;
  };
  FX.cancelTelegraph = function (id) { for (let i = 0; i < GMAX; i++) if (TG[i].on && TG[i].id === id) { TG[i].on = false; TG[i].onEnd = null; gn--; } };

  // ------------------------------------------------------------------ screen-level effects
  const flashS = { t: 0, dur: 0, a: 0, color: '#fff', last: -9 };
  FX.flash = function (color, ms, alpha) {
    const now = performance.now() / 1000;
    let a = alpha == null ? 0.35 : alpha, d = (ms || 120) / 1000;
    if (S.rFlash) { a = Math.min(a, 0.1); d = Math.max(d, 0.3); if (now - flashS.last < 0.4) return; }
    flashS.color = color || '#ffffff'; flashS.t = flashS.dur = d; flashS.a = a; flashS.last = now;
  };
  let hurtT = 0, slow = 0, slowScale = 1;
  FX.slowmo = function (sec, scale) { if (S.rMotion) return; slow = Math.max(slow, sec || 0.15); slowScale = clamp(scale == null ? 0.3 : scale, 0.1, 1); };
  const wave = { on: false, t: 0, dur: 2.6, wx: 0, wy: 0, spawnT: 0 };
  FX.restorationWave = function (region, at) {
    if (!base()) return;
    let x = game.x, y = game.y;
    if (at && Number.isFinite(at.x)) { x = at.x; y = at.y; }
    else { try { const l = MM.world && MM.world.getLights ? MM.world.getLights() : null; if (l) for (let i = 0; i < l.length; i++) if (l[i] && l[i].kind === 'moonwell') { x = l[i].x; y = l[i].y; break; } } catch (e) { /* */ } }
    wave.on = true; wave.t = 0; wave.dur = S.rMotion ? 1.6 : 2.6; wave.wx = PJX(x, y); wave.wy = PJY(x, y); wave.region = region;
    sfx('region_restored'); sfx('moonwell_pulse', { volume: 0.7 });
    pulse(x, y, 140, '#e8ffb0', 1, 1.2);
    FX.flash('#f4ffd0', 260, 0.14);
  };

  // ------------------------------------------------------------------ signature spells
  const SIGS = ['moonbolt', 'emberbloom', 'thornbind', 'frostbell', 'starfall'];
  const SND = { moonbolt: 'moonbolt', emberbloom: 'ember', thornbind: 'thorn', frostbell: 'frost', starfall: 'starfall' };
  const sigCache = new WeakMap();
  function sigOf(s) {
    if (!s || typeof s !== 'object') return null;
    let k = sigCache.get(s); if (k !== undefined) return k;
    k = null;
    const key = ((s.fx || '') + '|' + (s.sig || '') + '|' + (s.id || '') + '|' + (s.name || '')).toLowerCase().replace(/[\s_\-’']/g, '');
    for (let i = 0; i < SIGS.length; i++) if (key.indexOf(SIGS[i]) >= 0) { k = SIGS[i]; break; }
    sigCache.set(s, k); return k;
  }
  FX.sigOf = sigOf;
  let sigPairs = new Set(), sigPairsN = -1;
  function refreshSigPairs() {
    try {
      if (SPELLS.length === sigPairsN) return; sigPairsN = SPELLS.length; sigPairs = new Set();
      for (const s of SPELLS) if (sigOf(s)) sigPairs.add(s.color + '|' + s.core);
    } catch (e) { /* */ }
  }
  const FXS = new WeakMap(); // effect -> state
  function victimOf(fx) { try { return fx.target || dummy; } catch (e) { return fx.target; } }
  function stateOf(fx) {
    let st = FXS.get(fx);
    if (!st) {
      const v = victimOf(fx);
      st = { sig: sigOf(fx.spell), imp: 0, trail: 0, zx: v ? v.x : 0, zy: v ? v.y : 0, lock: false };
      FXS.set(fx, st); onCast(fx, st);
    }
    return st;
  }
  const SCHOOL_SND = { Fire: 'ember', Sun: 'ember', Frost: 'frost', Water: 'frost', Nature: 'thorn', Earth: 'thorn', Moon: 'moonbolt', Astral: 'moonbolt', Arcane: 'moonbolt', Spirit: 'moonbolt' };
  function manaCost(s) { if (Number.isFinite(s.cost)) return s.cost; return s.summon ? 18 : (s.blessing || s.rewind || s.cloak) ? 15 : Math.min(17, 6 + Math.floor((s.damage || 0) / 16)); }
  // hand / staff tip of the caster in projected world px
  function hand(fx, out) {
    const c = fx.from, v = victimOf(fx);
    const ax = PJX(c.x, c.y), ay = PJY(c.x, c.y), bx = v ? PJX(v.x, v.y) : ax + 1, by = v ? PJY(v.x, v.y) : ay;
    let dx = bx - ax, dy = by - ay; const n = Math.hypot(dx, dy) || 1; dx /= n; dy /= n;
    out.x = ax + dx * 8; out.y = ay + dy * 4; out.z = 20 + (c.height || 0); out.dx = dx; out.dy = dy; out.tx = bx; out.ty = by;
    return out;
  }
  const HP = { x: 0, y: 0, z: 0, dx: 0, dy: 0, tx: 0, ty: 0 };
  function onCast(fx, st) {
    const s = fx.spell; if (!s) return;
    let actor = 1; try { actor = fx.caster === game ? 1 : (fx.caster && fx.caster.id) || 2; } catch (e) { /* */ }
    let cd = 0.32; try { cd = Number.isFinite(s.cooldown) ? s.cooldown : castCooldown || 0.32; } catch (e) { /* */ }
    emit('spell:cast', { id: s.id, name: s.name, sig: st.sig, school: s.school, color: s.color, cost: manaCost(s), cooldown: cd, actor });
    hand(fx, HP);
    if (st.sig) { SIG[st.sig].cast(fx, st, HP); sfx('cast_' + SND[st.sig], { pan: panOf(HP.x) }); }
    else { sfx(s.kind === 'summon' ? 'cast_charge' : 'cast_' + (SCHOOL_SND[s.school] || 'moonbolt'), { volume: 0.55, pan: panOf(HP.x) }); }
  }
  function onImpact(fx, st, idx) {
    const s = fx.spell, v = victimOf(fx); if (!v) return;
    const wx = PJX(st.sig === 'starfall' ? st.zx : v.x, st.sig === 'starfall' ? st.zy : v.y), wy = PJY(st.sig === 'starfall' ? st.zx : v.x, st.sig === 'starfall' ? st.zy : v.y);
    emit('spell:impact', { id: s.id, sig: st.sig, x: v.x, y: v.y, index: idx });
    if (st.sig) { SIG[st.sig].impact(fx, st, wx, wy, idx, v); if (idx === 0 || st.sig !== 'thornbind') sfx('impact_' + SND[st.sig], { pan: panOf(wx), volume: idx ? 0.7 : 1 }); }
    else if (s.kind !== 'summon') {
      sfx('impact_' + (SCHOOL_SND[s.school] || 'moonbolt'), { volume: 0.4, pan: panOf(wx) }); impactSnd = 0.1;
      pulse(v.x, v.y, 46, s.color, 0.7, 0.25);
    }
  }
  let impactSnd = 0;

  function sparkle(ctx, x, y, s, c) { ctx.fillStyle = c; ctx.fillRect(x - s, y, 2 * s + 1, 1); ctx.fillRect(x, y - s, 1, 2 * s + 1); }
  function dot(ctx, x, y, s, c) { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, s, s); }
  function glowAt(ctx, x, y, r, c, a) {
    const g = ctx.globalCompositeOperation, al = ctx.globalAlpha;
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; ctx.drawImage(glow(c), (x - r) | 0, (y - r) | 0, r * 2, r * 2);
    ctx.globalCompositeOperation = g; ctx.globalAlpha = al;
  }
  function isoEllipse(ctx, x, y, r, k) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.5, r), Math.max(0.5, r * (k || 0.5)), 0, 0, TAU); }
  const DASH = [3, 3], DASH2 = [2, 2], NODASH = [];
  // flight position helper (with charge pause and arc), projected world px + z
  const FP = { x: 0, y: 0, z: 0, q: 0, a: 0 };
  function flight(fx, h, charge, arcH, out) {
    const s = fx.spell, hit = s.hit[0] || 0.3, t = fx.elapsed;
    const tc = Math.min(charge, hit * 0.35), q = clamp((t - tc) / Math.max(0.01, hit - tc), 0, 1), e = q * q * (1.6 - 0.6 * q);
    out.q = q; out.x = h.x + (h.tx - h.x) * e; out.y = h.y + (h.ty - h.y) * e; out.z = h.z + (21 - h.z) * e + Math.sin(Math.PI * e) * arcH;
    out.a = Math.atan2((h.ty - 21) - (h.y - h.z), h.tx - h.x);
    return out;
  }

  const SIG = {
    moonbolt: {
      cast(fx, st, h) { spray(h.x, h.y, h.z, 5, 14, 0.35, ['#dfe8ff', '#9fbaff'], GLW, 1, 0, 2, true, 6); },
      update(fx, st, dt) {
        if (fx.elapsed >= (fx.spell.hit[0] || 0.3)) return;
        st.trail += dt; hand(fx, HP); flight(fx, HP, 0.08, 5, FP); if (FP.q <= 0) return;
        while (st.trail > 0.018) {
          st.trail -= 0.018;
          P(FP.x + (rnd() - 0.5) * 3, FP.y + (rnd() - 0.5) * 2, FP.z + (rnd() - 0.5) * 3, (rnd() - 0.5) * 6, (rnd() - 0.5) * 4, 4 + rnd() * 4, 0.32 + rnd() * 0.2, rnd() < 0.3 ? '#f4f8ff' : '#93b2ff', rnd() < 0.25 ? SPK : GLW, 1, 0, 3, true);
        }
      },
      impact(fx, st, wx, wy) {
        const night = isNightNow() > 0.5;
        ring(wx, wy, 21, 3, night ? 22 : 17, 0.34, '#bcd2ff', '#ffffff');
        spray(wx, wy, 21, 9, 60, 0.32, ['#e8f0ff', '#a9c4ff'], STR, 1, 30, 4, false, 12);
        spray(wx, wy, 18, night ? 7 : 4, 8, 0.8, ['#c8d8ff', '#ffffff'], GLW, 1, -6, 1.5, true, 5);
        decal('crescentflash', wx, wy, 0.22, L_WORLD, 6, 14, '#e6eeff', '#9fbaff').z = 21;
        pulseW(wx, wy, night ? 62 : 48, '#c6d8ff', 0.9, 0.3);
      },
      draw(ctx, fx, st) {
        const s = fx.spell, t = fx.elapsed, hit = s.hit[0] || 0.3; hand(fx, HP);
        const hx = SX(HP.x), hy = SY(HP.y, HP.z);
        if (t < Math.min(0.08, hit * 0.35) + 0.02) { const k = clamp(t / 0.08, 0, 1); glowAt(ctx, hx, hy, 4 + k * 3, '#bcd0ff', 0.9); sparkle(ctx, hx, hy, 1 + (k * 2.5 | 0), '#f2f6ff'); }
        if (t < hit) {
          flight(fx, HP, 0.08, 5, FP); if (FP.q <= 0) return;
          // trail: thin silver-blue ribbon behind the crescent
          for (let k = 1; k <= 6; k++) {
            const q = clamp(FP.q - k * 0.05, 0, 1), e = q * q * (1.6 - 0.6 * q);
            const x = HP.x + (HP.tx - HP.x) * e, y = HP.y + (HP.ty - HP.y) * e, z = HP.z + (21 - HP.z) * e + Math.sin(Math.PI * e) * 5;
            ctx.globalAlpha = 1 - k / 7; dot(ctx, SX(x), SY(y, z), k < 3 ? 2 : 1, k < 3 ? '#cfdcff' : '#8ea8ef');
          }
          ctx.globalAlpha = 1;
          const sx = SX(FP.x), sy = SY(FP.y, FP.z);
          glowAt(ctx, sx, sy, isNightNow() > 0.5 ? 9 : 7, '#9fbaff', 0.85);
          const idx = (((FP.a / TAU) * 16 + 16.5) | 0) % 16;
          ctx.drawImage(CRES[idx], sx - 7, sy - 7);
        }
      },
    },
    emberbloom: {
      cast(fx, st, h) { spray(h.x, h.y, h.z, 6, 12, 0.4, ['#ffb35c', '#ffe08a', '#f47c46'], STR, 1, -10, 2, true, 4); },
      update(fx, st, dt) {
        if (fx.elapsed >= (fx.spell.hit[0] || 0.3)) return;
        st.trail += dt; hand(fx, HP); flight(fx, HP, 0.09, 10, FP); if (FP.q <= 0) return;
        while (st.trail > 0.022) {
          st.trail -= 0.022;
          P(FP.x, FP.y, FP.z, (rnd() - 0.5) * 16, (rnd() - 0.5) * 8, 6 + rnd() * 10, 0.3 + rnd() * 0.25, rnd() < 0.4 ? '#ffe08a' : '#f6863f', rnd() < 0.5 ? STR : GLW, 1, -12, 2, true);
        }
      },
      impact(fx, st, wx, wy) {
        const r = fx.spell.radius || 24;
        const f = decal('flower', wx, wy, 0.62, L_WORLD, 2, r, '#f47c46', '#ffd36e'); if (f) f.z = 2;
        decal('scorch', wx, wy, 1.9, L_GROUND, r * 0.75, r * 0.75, 'rgba(70,32,18,.34)');
        spray(wx, wy, 8, 16, 70, 0.45, ['#ffcf6a', '#f6863f', '#fff2c0'], STR, 1, 40, 3, true, 30);
        spray(wx, wy, 4, 9, 10, 1.1, ['#ff9a4a', '#ffd36e'], GLW, 1, -14, 1, true, 6);
        pulseW(wx, wy, 78, '#ffad5c', 1, 0.45);
        shake(1.5, 0.12);
      },
      draw(ctx, fx, st) {
        const s = fx.spell, t = fx.elapsed, hit = s.hit[0] || 0.3; hand(fx, HP);
        if (t < 0.11) { const hx = SX(HP.x), hy = SY(HP.y, HP.z); glowAt(ctx, hx, hy, 6, '#ffb060', 0.8); for (let i = 0; i < 3; i++) { const a = t * 18 + i * 2.1; dot(ctx, hx + Math.cos(a) * 4, hy + Math.sin(a) * 2, 1, i ? '#ffd36e' : '#fff2c0'); } }
        if (t < hit) {
          flight(fx, HP, 0.09, 10, FP); if (FP.q <= 0) return;
          const sx = SX(FP.x), sy = SY(FP.y, FP.z);
          glowAt(ctx, sx, sy, 8, '#ff9a4a', 0.9);
          dot(ctx, sx - 2, sy - 1, 4, '#f47c46'); dot(ctx, sx - 1, sy - 2, 2, '#ffd36e'); dot(ctx, sx - 1, sy, 2, '#ffe9a8'); dot(ctx, sx, sy - 1, 1, '#ffffff');
          for (let i = 0; i < 3; i++) { const a = t * 22 + i * 2.09; dot(ctx, sx + Math.cos(a) * 4, sy + Math.sin(a) * 3, 1, '#ffd36e'); }
        }
      },
    },
    thornbind: {
      cast(fx, st, h) { spray(h.x, h.y, h.z, 5, 10, 0.5, ['#9be07a', '#cdeea0'], LEAF, 1, 8, 2, false, 6); },
      update(fx, st, dt) {
        const hit = fx.spell.hit[0] || 0.3; if (fx.elapsed >= hit) return;
        st.trail += dt; const c = fx.from, v = victimOf(fx); if (!v) return;
        while (st.trail > 0.04) {
          st.trail -= 0.04; const q = clamp(fx.elapsed / hit, 0, 1);
          const x = PJX(c.x, c.y) + (PJX(v.x, v.y) - PJX(c.x, c.y)) * q, y = PJY(c.x, c.y) + (PJY(v.x, v.y) - PJY(c.x, c.y)) * q;
          P(x, y, 1, (rnd() - 0.5) * 12, (rnd() - 0.5) * 6, 10 + rnd() * 10, 0.35, rnd() < 0.5 ? '#7a5b3c' : '#6fae5c', rnd() < 0.5 ? PX : LEAF, 1, 50, 2, false);
        }
      },
      impact(fx, st, wx, wy, idx, v) {
        if (idx > 0) return;
        const s = fx.spell, r = s.radius || 22;
        let dur = s.zone || s.rootTime || 0; try { if (!dur && v.status && v.status.root) dur = v.status.root.time; } catch (e) { /* */ }
        zoneThorn(wx, wy, r, dur || 2.5, v);
        spray(wx, wy, 2, 10, 34, 0.45, ['#7a5b3c', '#9a7a52'], PX, 1, 60, 3, false, 22);
        spray(wx, wy, 4, 6, 18, 0.8, ['#8fd36e', '#c7e990'], LEAF, 1, 16, 2, false, 14);
        pulseW(wx, wy, 44, '#9be07a', 0.6, 0.35);
      },
      draw(ctx, fx, st) {
        const s = fx.spell, t = fx.elapsed, hit = s.hit[0] || 0.3, c = fx.from, v = victimOf(fx); if (!v) return;
        hand(fx, HP);
        if (t < 0.12) { const hx = SX(HP.x), hy = SY(HP.y, HP.z); glowAt(ctx, hx, hy, 5, '#9be07a', 0.7); sparkle(ctx, hx, hy, 1 + (t > 0.05 ? 1 : 0), '#e2ffc8'); }
        // a root crawls along the ground from the caster to the target, then sinks
        const fade = t < hit ? 1 : clamp(1 - (t - hit) / 0.35, 0, 1); if (fade <= 0) return;
        const q = clamp(t / hit, 0, 1), ax = PJX(c.x, c.y), ay = PJY(c.x, c.y), bx = PJX(v.x, v.y), by = PJY(v.x, v.y);
        const len = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / len, ny = (bx - ax) / len, steps = Math.max(4, (len * q / 3) | 0);
        ctx.globalAlpha = fade;
        for (let i = 0; i <= steps; i++) {
          const k = (i / steps) * q, w = Math.sin(k * len * 0.12 + t * 4) * 2.5;
          const x = SX(ax + (bx - ax) * k + nx * w), y = SY(ay + (by - ay) * k + ny * w * 0.5, 0);
          dot(ctx, x, y, 2, '#4f7a3e'); dot(ctx, x, y - 1, 1, '#86c46a');
          if (i % 5 === 2) { dot(ctx, x + 1, y - 2, 2, '#9fdc7c'); }
        }
        ctx.globalAlpha = 1;
      },
    },
    frostbell: {
      cast(fx, st, h) { spray(h.x, h.y, h.z, 5, 10, 0.4, ['#e6fbff', '#9fdcf0'], FLK, 1, 0, 2, false, 4); },
      update(fx, st, dt) {
        if (fx.elapsed >= (fx.spell.hit[0] || 0.3)) return;
        st.trail += dt; hand(fx, HP); flight(fx, HP, 0.08, 3, FP); if (FP.q <= 0) return;
        while (st.trail > 0.03) { st.trail -= 0.03; P(FP.x, FP.y, FP.z, (rnd() - 0.5) * 8, (rnd() - 0.5) * 4, -2 - rnd() * 4, 0.42, rnd() < 0.4 ? '#ffffff' : '#a9e4f6', FLK, 1, 6, 2, false); }
      },
      impact(fx, st, wx, wy, idx, v) {
        const r = fx.spell.radius || 30;
        const b = decal('bell', wx, wy, 0.75, L_WORLD, 4, r, '#bfefff', '#ffffff'); if (b) b.n = idx;
        decal('rime', wx, wy, 1.5, L_GROUND, r * 0.7, r * 0.7, 'rgba(214,244,255,.32)', '#ffffff');
        spray(wx, wy, 16, 12, 30, 0.7, ['#ffffff', '#bfefff', '#8fd3ec'], FLK, 1, 18, 2, false, 10);
        pulseW(wx, wy, 58, '#bfe8ff', 0.85, 0.35);
      },
      draw(ctx, fx, st) {
        const s = fx.spell, t = fx.elapsed, hit = s.hit[0] || 0.3; hand(fx, HP);
        if (t < 0.1) { const hx = SX(HP.x), hy = SY(HP.y, HP.z); glowAt(ctx, hx, hy, 5, '#bfefff', 0.7); dot(ctx, hx - 1, hy - 1, 3, '#e6fbff'); }
        if (t < hit) {
          flight(fx, HP, 0.08, 3, FP); if (FP.q <= 0) return;
          const sx = SX(FP.x), sy = SY(FP.y, FP.z), sp = (t * 14) | 0;
          glowAt(ctx, sx, sy, 7, '#a9e4f6', 0.75);
          ctx.fillStyle = '#8fd3ec';
          if (sp & 1) { ctx.fillRect(sx - 3, sy, 7, 1); ctx.fillRect(sx, sy - 3, 1, 7); } else { ctx.fillRect(sx - 2, sy - 2, 1, 1); ctx.fillRect(sx + 2, sy - 2, 1, 1); ctx.fillRect(sx - 2, sy + 2, 1, 1); ctx.fillRect(sx + 2, sy + 2, 1, 1); ctx.fillRect(sx - 3, sy, 7, 1); }
          ctx.fillStyle = '#e9ffff'; ctx.fillRect(sx - 1, sy - 1, 3, 3); ctx.fillStyle = '#ffffff'; ctx.fillRect(sx, sy - 2, 1, 1);
          for (let i = 0; i < 2; i++) { const a = t * 16 + i * Math.PI; dot(ctx, sx + Math.cos(a) * 5, sy + Math.sin(a) * 2.5, 1, '#e6fbff'); }
        }
      },
    },
    starfall: {
      cast(fx, st, h) {
        spray(h.x, h.y, h.z, 6, 8, 0.6, ['#fff3c8', '#c9b8ff'], SPK, 1, -30, 1, true, 8);
        for (let k = 0; k < N(6); k++) P(h.x, h.y, h.z, (rnd() - 0.5) * 6, (rnd() - 0.5) * 4, 70 + rnd() * 40, 0.6, '#fff3c8', GLW, 1, 0, 0, true);
      },
      update(fx, st, dt) {
        const hit = fx.spell.hit[0] || 0.9, t = fx.elapsed, v = victimOf(fx);
        if (!st.lock && v) { st.zx = v.x; st.zy = v.y; if (t >= hit - 0.25) st.lock = true; }
        if (t >= hit) return;
        st.trail += dt;
        const wx = PJX(st.zx, st.zy), wy = PJY(st.zx, st.zy);
        while (st.trail > 0.05) { st.trail -= 0.05; const a = rnd() * TAU; const i = P(wx + Math.cos(a) * 26, wy + Math.sin(a) * 10, 100 + rnd() * 30, -Math.cos(a) * 40, -Math.sin(a) * 16, 6, 0.5, rnd() < 0.5 ? '#fff3c8' : '#d6c8ff', GLW, 1, 0, 1, true); if (i < 0) break; }
      },
      impact(fx, st, wx, wy, idx, v) {
        const r = fx.spell.radius || 34;
        const b = decal('starburst', wx, wy, 0.55, L_WORLD, 6, r * 1.1, '#fff6d6', '#ffd77a'); if (b) b.z = 4;
        ring(wx, wy, 2, 6, r * 1.45, 0.5, '#ffe6a0', '#ffffff');
        decal('stardust', wx, wy, 2.4, L_GROUND, r * 0.85, r * 0.85, 'rgba(255,226,150,.5)', '#fff6d6');
        spray(wx, wy, 6, 26, 46, 0.9, ['#fff6d6', '#ffd77a', '#c9b8ff'], SPK, 1, 22, 2, true, 60);
        spray(wx, wy, 4, 12, 70, 0.4, ['#ffe6a0', '#ffffff'], STR, 1, 50, 3, false, 20);
        pulseW(wx, wy, 110, '#fff0c0', 1, 0.55);
        shake(3.5, 0.3); FX.flash('#fff4d8', 110, 0.16);
      },
      draw(ctx, fx, st) {
        const s = fx.spell, t = fx.elapsed, hit = s.hit[0] || 0.9; hand(fx, HP);
        if (t < 0.16) { const hx = SX(HP.x), hy = SY(HP.y, HP.z); glowAt(ctx, hx, hy, 6, '#fff0c0', 0.9); sparkle(ctx, hx, hy, 2 + (t > 0.08 ? 1 : 0), '#fffbe8'); }
        if (t >= hit) return;
        const wx = PJX(st.zx, st.zy), wy = PJY(st.zx, st.zy), sx = SX(wx), gy = SY(wy, 0), p = t / hit;
        // gathering star high above the zone
        const sky = gy - 110, k = clamp(p * 1.3, 0, 1);
        glowAt(ctx, sx + 30 * (1 - p), sky, 5 + k * 6, '#ffe9b0', 0.5 + 0.5 * k);
        sparkle(ctx, sx + 30 * (1 - p) | 0, sky | 0, 1 + (k * 3 | 0), '#fffbe8');
        const fall = 0.16;
        if (t > hit - fall) {
          const f = (t - (hit - fall)) / fall, fx2 = sx + 30 * (1 - p) * (1 - f), fy = sky + (gy - 4 - sky) * f * f;
          for (let i = 0; i < 9; i++) { const b = i / 9; ctx.globalAlpha = 1 - b; dot(ctx, fx2 + b * 16, fy - b * 40, i < 2 ? 3 : 2, i < 3 ? '#ffffff' : '#ffe39a'); }
          ctx.globalAlpha = 1; glowAt(ctx, fx2, fy, 10, '#fff0c0', 1);
        }
      },
      ground(ctx, fx, st) {
        const s = fx.spell, t = fx.elapsed, hit = s.hit[0] || 0.9; if (t >= hit) return;
        const r = s.radius || 34, sx = SX(PJX(st.zx, st.zy)), sy = SY(PJY(st.zx, st.zy), 0), p = t / hit;
        ctx.fillStyle = 'rgba(255,226,150,' + (0.1 + 0.18 * p).toFixed(2) + ')'; isoEllipse(ctx, sx, sy, r * p); ctx.fill();
        ctx.fillStyle = 'rgba(40,30,70,.18)'; isoEllipse(ctx, sx, sy, r); ctx.fill();
      },
      overlay(ctx, fx, st) {
        const s = fx.spell, t = fx.elapsed, hit = s.hit[0] || 0.9; if (t >= hit) return;
        const r = s.radius || 34, sx = SX(PJX(st.zx, st.zy)), sy = SY(PJY(st.zx, st.zy), 0), p = t / hit;
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(30,20,60,.7)'; isoEllipse(ctx, sx, sy, r); ctx.stroke();
        ctx.lineWidth = 1; ctx.setLineDash(DASH); ctx.lineDashOffset = -t * 18; ctx.strokeStyle = '#ffe9a8'; isoEllipse(ctx, sx, sy, r); ctx.stroke();
        ctx.setLineDash(NODASH); ctx.strokeStyle = '#fff8e0'; ctx.globalAlpha = 0.5 + 0.5 * p; isoEllipse(ctx, sx, sy, Math.max(1, r * p)); ctx.stroke(); ctx.globalAlpha = 1;
        // four star points on the rim + countdown pips (shape cue, not only colour)
        for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + t * 0.8, x = sx + Math.cos(a) * r, y = sy + Math.sin(a) * r * 0.5; sparkle(ctx, x | 0, y | 0, 2, '#fff6d6'); }
      },
    },
  };

  function zoneThorn(wx, wy, r, dur, ref) {
    const d = decal('thorn', wx, wy, dur, L_GROUND | L_WORLD, r, r, '#4f7a3e', '#9fdc7c'); if (d) d.ref = ref || null;
    return d;
  }
  FX.zone = function (kind, x, y, r, dur) {
    const wx = PJX(x, y), wy = PJY(x, y);
    if (kind === 'thorn') return !!zoneThorn(wx, wy, r || 22, dur || 2.5, null);
    if (kind === 'frost') return !!decal('rime', wx, wy, dur || 1.5, L_GROUND, r || 20, r || 20, 'rgba(214,244,255,.32)', '#fff');
    if (kind === 'ember') return !!decal('scorch', wx, wy, dur || 2, L_GROUND, r || 18, r || 18, 'rgba(70,32,18,.34)');
    if (kind === 'star') return !!decal('stardust', wx, wy, dur || 2, L_GROUND, r || 24, r || 24, 'rgba(255,226,150,.5)', '#fff6d6');
    return false;
  };

  // ------------------------------------------------------------------ bursts (public + internal)
  const DUSTC = { grove: ['#cbbf98', '#b9ae88'], village: ['#cbbf98', '#d8cfae'], forest: ['#8d8a6a', '#a59c78'], swamp: ['#6f7f5a', '#8a9a6c'], mountain: ['#f2f8ff', '#d6e6f4'], crypt: ['#9a92a4', '#b6aec0'], sky: ['#d8d0f0', '#efe8ff'] };
  function dustCols() { try { return world.mode !== 'outside' ? DUSTC.crypt : DUSTC[world.region] || DUSTC.grove; } catch (e) { return DUSTC.grove; } }
  FX.burst = function (kind, x, y, o) {
    if (!FX.enabled || !base()) return;
    o = o || {};
    const wx = PJX(x, y), wy = PJY(x, y), z = o.z == null ? 0 : o.z, col = o.color;
    switch (kind) {
      case 'dust': case 'broom': {
        const cs = dustCols();
        spray(wx, wy, 1, o.count || 10, kind === 'broom' ? 34 : 18, 0.55, cs, PX, 2, 8, 3, false, 6);
        const d = ring(wx, wy, 0, 3, kind === 'broom' ? 16 : 10, 0.35, cs[0], cs[1]); if (d) d.a = 0.5;
        break;
      }
      case 'soil': spray(wx, wy, 2, o.count || 9, 22, 0.5, ['#7a5b3c', '#9a7a52', '#5d4630'], PX, 1, 70, 1, false, 24); spray(wx, wy, 2, 3, 10, 0.6, ['#8fbf6a'], LEAF, 1, 20, 1, false, 16); break;
      case 'water': for (let k = 0; k < N(8); k++) P(wx + (rnd() - 0.5) * 14, wy + (rnd() - 0.5) * 6, 26 + rnd() * 10, (rnd() - 0.5) * 6, 0, -10 - rnd() * 10, 0.55, rnd() < 0.5 ? '#9fd6f0' : '#e2f6ff', PX, 1, 60, 0, false);
        FX.burst('wet', x, y); break;
      case 'wet': decal('wet', wx, wy, 1.6, L_GROUND, 11, 11, 'rgba(58,44,40,.28)'); { const d = ring(wx, wy, 0, 2, 12, 0.4, '#bfe6f6', '#ffffff'); if (d) d.a = 0.6; } break;
      case 'growth': P(wx + (rnd() - 0.5) * 8, wy, 6, 0, 0, 10, 0.8, col || '#cfff9a', GLW, 1, 0, 0, true); break;
      case 'harvest': {
        const c = col || '#e8d27c';
        spray(wx, wy, 8, o.count || 12, 36, 0.6, [c, '#fff4c8', '#9cd27a'], PX, 2, 60, 1, false, 34);
        spray(wx, wy, 6, 4, 18, 0.9, ['#8fbf6a', '#b8dc8a'], LEAF, 1, 22, 1, false, 18);
        spray(wx, wy, 10, 5, 12, 0.6, [c], GLW, 1, -10, 1, true, 8);
        trail(wx, wy, 10, 3, c); break;
      }
      case 'pickup': trail(wx, wy, z || 6, o.count || 6, col || '#ffd770'); break;
      case 'trail': spray(wx, wy, z, o.count || 1, 4, 0.5, [col || '#d8c8ff'], GLW, 1, 0, 1, true, 0); break;
      case 'sparks': case 'hit': {
        const dir = o.dir == null ? rnd() * TAU : o.dir, n = N(o.count || 6), c = col || '#fff2c8';
        for (let k = 0; k < n; k++) { const a = dir + (rnd() - 0.5) * 1.3, s = 50 + rnd() * 60; P(wx, wy, z || 18, Math.cos(a) * s, Math.sin(a) * s * 0.6, 10 + rnd() * 20, 0.18 + rnd() * 0.14, k & 1 ? c : '#ffffff', STR, 1, 60, 6, false); }
        const d = ring(wx, wy, z || 18, 2, 8, 0.14, '#ffffff', c); if (d) d.a = 0.8; break;
      }
      case 'shield': { const d = decal('shield', wx, wy, 0.8, L_WORLD, 12, 16, col || '#ffe6a8', '#fff8e0'); if (d) d.ref = o.follow || null; break; }
      case 'heal': for (let k = 0; k < N(9); k++) P(wx + (rnd() - 0.5) * 16, wy + (rnd() - 0.5) * 6, 4 + rnd() * 20, 0, 0, 14 + rnd() * 10, 0.8 + rnd() * 0.3, k & 1 ? '#b6f59a' : '#e8ffd8', PLUS, 1, 0, 0.5, false); break;
      case 'crit': { const d = decal('starburst', wx, wy, 0.3, L_WORLD, 4, 16, '#fff6d6', col || '#ffd77a'); if (d) d.z = z || 22; spray(wx, wy, z || 22, 8, 70, 0.25, ['#ffffff', '#ffd77a'], STR, 1, 0, 6, false, 0); break; }
      case 'burn': P(wx + (rnd() - 0.5) * 10, wy + (rnd() - 0.5) * 4, 8 + rnd() * 16, (rnd() - 0.5) * 4, 0, 16 + rnd() * 10, 0.45, rnd() < 0.5 ? '#ffb35c' : '#ff7a3a', rnd() < 0.5 ? GLW : PX, 1, -8, 1, true); break;
      case 'chill': P(wx + (rnd() - 0.5) * 14, wy + (rnd() - 0.5) * 4, 24 + rnd() * 12, (rnd() - 0.5) * 3, 0, -8, 0.9, rnd() < 0.5 ? '#e6fbff' : '#a9e4f6', FLK, 1, 0, 1, false); break;
      case 'root': P(wx + (rnd() - 0.5) * 12, wy + (rnd() - 0.5) * 4, 2, (rnd() - 0.5) * 6, 0, 8, 0.6, rnd() < 0.5 ? '#8fd36e' : '#5f8f4a', LEAF, 1, 14, 1, false); break;
      case 'poison': P(wx + (rnd() - 0.5) * 10, wy + (rnd() - 0.5) * 4, 10 + rnd() * 14, (rnd() - 0.5) * 3, 0, 10 + rnd() * 6, 0.7, rnd() < 0.5 ? '#b6e07a' : '#86b85a', BUB, 1, 0, 1, false); break;
      case 'shock': { const a = rnd() * TAU; P(wx + Math.cos(a) * 6, wy + Math.sin(a) * 3, 14 + rnd() * 18, Math.cos(a) * 30, Math.sin(a) * 15, (rnd() - 0.5) * 30, 0.12, rnd() < 0.5 ? '#fff7b0' : '#f4de74', STR, 1, 0, 8, true); break; }
      case 'wet-drip': P(wx + (rnd() - 0.5) * 8, wy, 20 + rnd() * 10, 0, 0, -4, 0.5, '#9fd6f0', PX, 1, 60, 0, false); break;
      case 'levelup': {
        const d = decal('column', wx, wy, 1.1, L_WORLD, 9, 9, '#fff0b8', '#ffd77a'); if (d) d.ref = o.follow || null;
        ring(wx, wy, 1, 4, 30, 0.7, '#ffe6a0', '#fff8e0');
        for (let k = 0; k < N(22); k++) { const a = rnd() * TAU, r = rnd() * 12; P(wx + Math.cos(a) * r, wy + Math.sin(a) * r * 0.5, rnd() * 10, 0, 0, 30 + rnd() * 40, 0.9 + rnd() * 0.5, k % 3 ? '#ffe6a0' : '#ffffff', k & 1 ? SPK : GLW, 1, 0, 0.6, true); }
        break;
      }
      case 'kill': {
        const c = col || '#cbbbe6', big = !!o.boss;
        spray(wx, wy, 16, big ? 34 : 14, big ? 70 : 40, 0.55, [c, '#ffffff', '#8f86a8'], PX, 2, 30, 2, false, 24);
        spray(wx, wy, 18, big ? 10 : 4, 6, 1.1, ['#e8e0ff', c], GLW, 1, -10, 0.5, true, 18);
        ring(wx, wy, 2, 4, big ? 44 : 20, big ? 0.6 : 0.36, c, '#ffffff'); break;
      }
      case 'bloom': spray(wx, wy, 2, o.count || 6, 14, 1.0, ['#ffd6e8', '#fff4c8', '#c9f5a0'], PET, 1, 4, 1, false, 18); spray(wx, wy, 4, 3, 6, 0.8, ['#e8ffb0'], GLW, 1, -6, 1, true, 8); break;
      case 'ember': SIG.emberbloom.impact({ spell: { radius: o.r }, target: null }, null, wx, wy); break;
      case 'frost': spray(wx, wy, 14, 10, 26, 0.7, ['#ffffff', '#bfefff'], FLK, 1, 18, 2, false, 10); break;
      case 'star': spray(wx, wy, 10, 14, 30, 0.8, ['#fff6d6', '#ffd77a'], SPK, 1, 10, 2, true, 30); break;
      case 'moon': spray(wx, wy, 18, 10, 30, 0.5, ['#e8f0ff', '#a9c4ff'], GLW, 1, 0, 3, true, 10); break;
      default: spray(wx, wy, z || 10, o.count || 8, 30, 0.5, [col || '#ffffff'], PX, 1, 30, 2, false, 10);
    }
  };
  function trail(wx, wy, z, n, color) {
    n = N(n);
    for (let k = 0; k < n; k++) {
      const a = rnd() * TAU, i = P(wx + (rnd() - 0.5) * 6, wy + (rnd() - 0.5) * 3, z, Math.cos(a) * 30, Math.sin(a) * 15, 40 + rnd() * 30, 1.4, k & 1 ? '#fff6d0' : color, k & 1 ? GLW : COIN, k & 1 ? 1 : 2, 0, 0, false);
      if (i >= 0) HM[i] = 1;
    }
  }

  // ------------------------------------------------------------------ ambient (pooled, world-anchored)
  const AMAX = 160;
  const AX = new Float32Array(AMAX), AY = new Float32Array(AMAX), AZ = new Float32Array(AMAX), AVX = new Float32Array(AMAX), AVY = new Float32Array(AMAX), AVZ = new Float32Array(AMAX), APH = new Float32Array(AMAX), AL = new Float32Array(AMAX);
  const AK = new Uint8Array(AMAX), AC = new Array(AMAX).fill('#fff');
  let an = 0, aCap = 112;
  const FIREFLY = 1, POLLEN = 2, ALEAF = 3, SNOW = 4, SPORE = 5, MOTE = 6, STAR = 7, APET = 8;
  const aTarget = new Uint16Array(9), aCount = new Uint16Array(9);
  let aTick = 0;
  function restorationLevel() {
    try {
      const c = MM.campaign && MM.campaign.state;
      if (world.region === 'grove') { if (c && c.homestead && Number.isFinite(c.homestead.level)) return c.homestead.level / 4; if (MM.world && Number.isFinite(MM.world.restoration)) return MM.world.restoration / 4; return 0.5; }
      if (c && c.restored && c.restored[world.region]) return 1;
    } catch (e) { /* */ }
    return 0;
  }
  function ambientTargets() {
    aTarget.fill(0);
    const out = world.mode === 'outside', reg = world.region, night = isNightNow(), wth = world.weather, rest = restorationLevel();
    let winter = false; try { winter = season() === 'Winter'; } catch (e) { /* */ }
    const sc = S.pScale * (S.quality === 'low' ? 0.6 : S.quality === 'high' ? 1.15 : 1) * (S.rMotion ? 0.6 : 1);
    if (out) {
      const warm = reg === 'grove' || reg === 'village' || reg === 'moonwell';
      if (night > 0.4 && wth !== 'Rain' && wth !== 'Storm') {
        if (warm) aTarget[FIREFLY] = 8 + 12 * rest; else if (reg === 'swamp') aTarget[FIREFLY] = 18; else if (reg === 'forest') aTarget[FIREFLY] = 4 + 10 * rest;
      }
      if (night < 0.35 && warm && wth !== 'Rain' && wth !== 'Storm') aTarget[POLLEN] = 8 + 10 * rest;
      if (reg === 'forest') aTarget[ALEAF] = 7 + (wth === 'Wind' ? 9 : 0); else if (warm && wth === 'Wind') aTarget[ALEAF] = 12;
      if (reg === 'mountain') aTarget[SNOW] = wth === 'Storm' ? 80 : 48; else if (winter && reg !== 'swamp' && wth !== 'Rain') aTarget[SNOW] = 26;
      if (reg === 'swamp') aTarget[SPORE] = 14; else if (reg === 'forest' && rest < 0.5) aTarget[SPORE] = 8;
      if (reg === 'crypt') aTarget[MOTE] = 12;
      if (reg === 'sky' || reg === 'moonwell') aTarget[STAR] = 16;
      if (warm && rest >= 0.75 && night < 0.5 && wth !== 'Rain') aTarget[APET] = 6;
    } else aTarget[MOTE] = 18;
    let total = 0;
    for (let k = 1; k < 9; k++) { aTarget[k] = Math.round(aTarget[k] * sc); total += aTarget[k]; }
    if (total > aCap) { const f = aCap / total; for (let k = 1; k < 9; k++) aTarget[k] = Math.floor(aTarget[k] * f); }
  }
  const ACOL = {
    [FIREFLY]: ['#e6ff9a', '#fff2a0'], [POLLEN]: ['#fff4c8', '#f8f0d8'], [ALEAF]: ['#9a8a4a', '#6f8a4c', '#b07a48', '#8fb86a'], [SNOW]: ['#ffffff', '#e6f2ff'],
    [SPORE]: ['#bfe6a0', '#9fe0c8'], [MOTE]: ['#e0d6c0', '#c8c0d8'], [STAR]: ['#fff6d8', '#d8d0ff'], [APET]: ['#ffd6e8', '#fff0f4'],
  };
  function aSpawn(k, anywhere) {
    if (an >= AMAX) return;
    const i = an++, cs = ACOL[k];
    AK[i] = k; AC[i] = cs[(rnd() * cs.length) | 0]; APH[i] = rnd() * TAU; AL[i] = 0;
    const vx = camX - 256 - 24, vy = camY - 160 - 24;
    AX[i] = vx + rnd() * (W + 48); AY[i] = vy + rnd() * (H + 80);
    AVX[i] = 0; AVY[i] = 0; AVZ[i] = 0; AZ[i] = 8 + rnd() * 24;
    if (k === SNOW || k === ALEAF) { AZ[i] = anywhere ? rnd() * 140 : 120 + rnd() * 40; AVZ[i] = k === SNOW ? -(16 + rnd() * 14) : -(10 + rnd() * 8); AVX[i] = k === SNOW ? -4 - rnd() * 6 : 8 + rnd() * 10; if (!anywhere) AY[i] = vy + rnd() * (H + 140); }
    if (k === FIREFLY && reg() === 'swamp') AC[i] = '#a6ffd8';
    if (k === POLLEN || k === APET) { AVX[i] = 3 + rnd() * 4; AVY[i] = 1 + rnd() * 2; }
    if (k === SPORE) { AZ[i] = rnd() * 10; AVZ[i] = 3 + rnd() * 4; }
  }
  function reg() { try { return world.region; } catch (e) { return ''; } }
  function aKill(i) { const j = --an; if (i === j) return; AX[i] = AX[j]; AY[i] = AY[j]; AZ[i] = AZ[j]; AVX[i] = AVX[j]; AVY[i] = AVY[j]; AVZ[i] = AVZ[j]; APH[i] = APH[j]; AL[i] = AL[j]; AK[i] = AK[j]; AC[i] = AC[j]; }
  function updateAmbient(dt) {
    aTick -= dt; if (aTick <= 0) { aTick = 0.5; ambientTargets(); }
    aCount.fill(0); for (let i = 0; i < an; i++) aCount[AK[i]]++;
    let spawned = 0;
    for (let k = 1; k < 9 && spawned < 4; k++) while (aCount[k] < aTarget[k] && spawned < 4) { aSpawn(k, an < 6 || aCount[k] < aTarget[k] * 0.5); aCount[k]++; spawned++; }
    const wind = world.weather === 'Wind' ? 1 : 0;
    const mo = S.rMotion ? 0.5 : 1;
    const vx0 = camX - 256 - 40, vx1 = camX + 256 + 40, vy0 = camY - 160 - 40, vy1 = camY + 160 + 160;
    for (let i = an - 1; i >= 0; i--) {
      const k = AK[i];
      const over = aCount[k] > aTarget[k];
      AL[i] = over ? AL[i] - dt * 1.5 : Math.min(1, AL[i] + dt * 1.2);
      if (AL[i] <= 0 && over) { aCount[k]--; aKill(i); continue; }
      APH[i] += dt;
      if (k === FIREFLY) { AX[i] += Math.cos(APH[i] * 0.9 + i) * 9 * dt * mo; AY[i] += Math.sin(APH[i] * 0.7 + i * 2) * 5 * dt * mo; AZ[i] = 14 + Math.sin(APH[i] * 0.8 + i) * 10; }
      else if (k === POLLEN || k === APET) { AX[i] += (AVX[i] + wind * 20) * dt * mo; AY[i] += AVY[i] * dt * mo; AZ[i] = 16 + Math.sin(APH[i] * 1.3 + i) * 8; }
      else if (k === SNOW || k === ALEAF) {
        AX[i] += (AVX[i] + Math.sin(APH[i] * 1.7 + i) * (k === ALEAF ? 10 : 5) + wind * 26) * dt * mo; AZ[i] += AVZ[i] * dt * mo;
        if (AZ[i] <= 0) { AZ[i] = 0; AL[i] -= dt * 1.4; if (AL[i] <= 0.05) { AZ[i] = 120 + rnd() * 40; AL[i] = 0; AX[i] = vx0 + rnd() * (vx1 - vx0); AY[i] = vy0 + rnd() * (vy1 - vy0); } }
      } else if (k === SPORE) { AZ[i] += AVZ[i] * dt * mo; AX[i] += Math.sin(APH[i] + i) * 4 * dt; if (AZ[i] > 44) { AZ[i] = 0; AL[i] = 0; } }
      else if (k === MOTE) { AX[i] += Math.cos(APH[i] * 0.4 + i) * 4 * dt * mo; AY[i] += Math.sin(APH[i] * 0.3 + i) * 2 * dt * mo; AZ[i] = 10 + Math.sin(APH[i] * 0.5 + i) * 8; }
      // keep the population inside the view (world-anchored, re-seeded at the far side)
      if (AX[i] < vx0) AX[i] += vx1 - vx0; else if (AX[i] > vx1) AX[i] -= vx1 - vx0;
      if (AY[i] < vy0) AY[i] += vy1 - vy0; else if (AY[i] > vy1) AY[i] -= vy1 - vy0;
    }
  }
  function drawAmbient(ctx) {
    const t = game.elapsed;
    for (let pass = 0; pass < 2; pass++) {
      if (pass) ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < an; i++) {
        const k = AK[i], add = k === FIREFLY || k === STAR;
        if (add !== !!pass) continue;
        const sx = SX(AX[i]), sy = SY(AY[i], AZ[i]); if (sx < -4 || sx > W + 4 || sy < -4 || sy > H + 4) continue;
        let a = AL[i];
        if (k === FIREFLY) { const b = 0.5 + 0.5 * Math.sin(t * 2.6 + i * 1.9); a *= 0.25 + 0.75 * b * b; ctx.globalAlpha = a * 0.8; ctx.drawImage(glow(AC[i]), sx - 4, sy - 4, 9, 9); ctx.globalAlpha = a; ctx.fillStyle = '#fbffd8'; ctx.fillRect(sx, sy, 1, 1); continue; }
        if (k === STAR) { const b = 0.5 + 0.5 * Math.sin(t * 3.3 + i * 2.7); ctx.globalAlpha = a * b; ctx.fillStyle = AC[i]; ctx.fillRect(sx, sy, 1, 1); if (b > 0.85) { ctx.fillRect(sx - 1, sy, 3, 1); ctx.fillRect(sx, sy - 1, 1, 3); } continue; }
        ctx.globalAlpha = a * (k === POLLEN ? 0.6 : k === MOTE ? 0.35 : k === SPORE ? 0.55 : 0.85);
        ctx.fillStyle = AC[i];
        if (k === ALEAF || k === APET) { if (((APH[i] * 6 + i) | 0) & 1) ctx.fillRect(sx, sy, 2, 1); else ctx.fillRect(sx, sy, 1, 2); }
        else if (k === SNOW) { ctx.fillRect(sx, sy, (i & 3) === 0 ? 2 : 1, (i & 3) === 0 ? 2 : 1); }
        else ctx.fillRect(sx, sy, 1, 1);
      }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  // ------------------------------------------------------------------ event handlers (deduped)
  const DOT_COLORS = { '#f69655': 'burn', '#a2cf71': 'poison' };
  let prevHp = -1, prevWard = 0, prevLevel = -1, skipHeal = 0, lastPick = { t: -1, type: '', amount: 0 }, hurtFrom = null;
  let offsIdx = 0; const OFFS = [-4, 3, -1, 5, -6, 1];
  let hitSnd = 0, failT = 0;
  function onNumber(n) {
    let x, y;
    try { x = n.x == null ? dummy.x : n.x; y = n.y == null ? dummy.y : n.y; } catch (e) { return; }
    const wx = PJX(x, y), wy = PJY(x, y), dotKind = DOT_COLORS[n.color], v = parseInt(n.value, 10) || 0;
    if (S.numbers) {
      const crit = !!n.crit, s = crit || v >= 60 ? 2 : 1, color = dotKind ? n.color : n.color || '#fff4d6';
      const tx = text(n.value, wx + OFFS[offsIdx++ % OFFS.length], wy, dotKind ? 34 : 40, color, s, dotKind ? 0.7 : 0.85, dotKind ? 9 : 14);
      if (crit && tx) tx.pop = 0.1;
    }
    if (!dotKind) {
      const px = PJX(game.x, game.y), py = PJY(game.x, game.y), dir = Math.atan2(wy - py, wx - px);
      FX.burst('sparks', x, y, { dir, color: n.color, count: n.crit ? 10 : 5, z: 20 });
      if (n.crit) { FX.burst('crit', x, y, { color: n.color }); sfx('crit', { pan: panOf(wx) }); shake(1.5, 0.1); }
      else if (impactSnd <= 0 && hitSnd <= 0) { sfx('hit_enemy', { volume: 0.4, pan: panOf(wx) }); hitSnd = 0.2; }
    }
  }
  function onKill(e) {
    if (!e || e._mmKilled) return; e._mmKilled = true;
    const colors = { slime: '#a8d890', blight: '#a3a37a', ghost: '#cfe8e6', ice: '#cdeffc', skeleton: '#e6dfc6', spirit: '#d8c8ff' };
    FX.burst('kill', e.x, e.y, { color: colors[e.type] || '#cbbbe6', boss: !!e.boss });
    sfx('enemy_die', { pan: panOf(PJX(e.x, e.y)) });
    if (e.boss) onBoss({ phase: 'defeated', enemy: e });
  }
  function onBoss(d) {
    if (!d || !base()) return;
    const e = d.enemy; const x = e ? e.x : game.x, y = e ? e.y : game.y, wx = PJX(x, y), wy = PJY(x, y);
    if (d.phase === 'spawn') {
      if (e && e._mmBossSeen) return; if (e) e._mmBossSeen = true;
      ring(wx, wy, 0, 6, 60, 0.9, '#c86a8a', '#ffd0d8'); shake(2.5, 0.35); sfx('boss_roar', { pan: panOf(wx) }); pulse(x, y, 90, '#ff9aa8', 0.7, 0.8);
    } else if (d.phase === 'defeated') {
      if (e && e._mmBossDown) return; if (e) e._mmBossDown = true;
      FX.flash('#fff2d0', 180, 0.3); FX.slowmo(0.2, 0.3); shake(4, 0.45); ring(wx, wy, 2, 8, 90, 0.9, '#ffe6a0', '#ffffff'); sfx('boss_phase');
      pulse(x, y, 130, '#fff0c0', 1, 0.8);
    } else {
      // phase transition (number or 'phase'): a controlled pause beat, then a shock ring
      FX.flash('#ffffff', 140, 0.28); FX.slowmo(0.15, 0.25); shake(3, 0.3); ring(wx, wy, 2, 6, 70, 0.7, '#ffb3c6', '#ffffff'); sfx('boss_phase', { pan: panOf(wx) });
      pulse(x, y, 110, '#ffc0d0', 0.9, 0.6);
    }
  }
  function onPickup(drop, actor) {
    if (!drop) return;
    const now = game.elapsed;
    if (drop._mmP) return; drop._mmP = true;
    if (lastPick.t === now && lastPick.type === drop.type && lastPick.amount === drop.amount) return;
    lastPick.t = now; lastPick.type = drop.type; lastPick.amount = drop.amount;
    const c = drop.type === 'gold' ? '#ffd770' : drop.type === 'rune' ? '#9cecf0' : '#f0b8f4';
    FX.burst('pickup', drop.x, drop.y, { color: c, count: drop.type === 'gold' ? 6 : 8 });
    if (drop.type === 'gold' && drop.amount) text('+' + drop.amount, PJX(drop.x, drop.y), PJY(drop.x, drop.y), 18, '#ffe08a', 1, 0.9, 12);
    sfx(drop.type === 'gold' ? 'coin' : 'pickup', { pan: panOf(PJX(drop.x, drop.y)) });
  }
  function onBusPickup(d) { if (!d || !base()) return; const now = game.elapsed; if (lastPick.t === now && lastPick.type === d.type) return; lastPick.t = now; lastPick.type = d.type; lastPick.amount = d.amount; const a = d.actor || game; FX.burst('pickup', a.x + 0.3, a.y - 0.3, { color: d.type === 'gold' ? '#ffd770' : '#9cecf0' }); sfx(d.type === 'gold' ? 'coin' : 'pickup'); }
  function onLevel(level) {
    if (!base() || level === prevLevel) return; prevLevel = level; skipHeal = 2;
    FX.burst('levelup', game.x, game.y, { follow: game });
    text('LEVEL UP', PJX(game.x, game.y) - 14, PJY(game.x, game.y), 56, '#ffe08a', 2, 1.6, 10);
    sfx('level_up'); pulse(game.x, game.y, 90, '#ffe6a0', 0.9, 1);
  }
  function onPlot(kind, p) {
    if (!p || !base()) return;
    const stamp = game.elapsed;
    if (p._mmT === stamp && p._mmK === kind) return; p._mmT = stamp; p._mmK = kind;
    if (kind === 'plant') { FX.burst('soil', p.x, p.y); sfx('plant'); }
    else if (kind === 'water') { FX.burst('water', p.x, p.y); sfx('water'); }
    else if (kind === 'harvest') {
      let c = '#e8d27c'; try { c = SEED_TYPES[p.seedWas || p.seed]?.color || c; } catch (e) { /* */ }
      FX.burst('harvest', p.x, p.y, { color: c }); sfx('harvest');
    }
  }
  let mountT = null;
  function onMount(kind) {
    if (!base()) return;
    const tr = game.transition; if (tr) { if (tr._mm) return; tr._mm = true; }
    if (kind === 'mount') { FX.burst('broom', game.x, game.y); sfx('broom_mount'); }
    else sfx('broom_land');
  }
  function onRegion() {
    pn = 0; an = 0; for (let i = 0; i < DMAX; i++) D[i].on = false; dn = 0;
    for (let i = 0; i < GMAX; i++) { TG[i].on = false; TG[i].onEnd = null; } gn = 0;
    aTick = 0; skipHeal = 3; hurtT = 0; prevHp = -1;
  }
  function onCastFail(spell) {
    if (!base() || failT > 0) return; failT = 0.35;
    let msg = ''; try { msg = combatMessage || ''; } catch (e) { /* */ }
    const reason = /mana/i.test(msg) ? 'mana' : /closer|target|enemy|dummy/i.test(msg) ? 'target' : /mount|land/i.test(msg) ? 'mount' : 'cooldown';
    emit('spell:fail', { id: spell && spell.id, reason, text: msg });
    if (reason === 'cooldown') return;
    const wx = PJX(game.x, game.y), wy = PJY(game.x, game.y);
    spray(wx + 6, wy, 20, 4, 10, 0.4, ['#8e9ab8', '#c8d0e0'], PX, 1, -10, 2, false, 6);
    sfx('ui_error', { volume: 0.5 });
  }

  // ------------------------------------------------------------------ simulation (postUpdate)
  const nb = { prevSeed: new Array(8).fill(null), prevWater: new Uint8Array(8), prevGrowth: new Float32Array(8) };
  let walkT = 0, trailT = 0, growT = 0, prevMounted = false, prevHeight = 0, statusT = 0;
  FX.update = function (dt) {
    if (!FX.enabled || !base()) return;
    camX = game.camX; camY = game.camY;
    if (impactSnd > 0) impactSnd -= dt; if (hitSnd > 0) hitSnd -= dt; if (failT > 0) failT -= dt;
    refreshSigPairs();
    // spells: cast / impact detection + signature trails
    try {
      for (let i = 0; i < effects.length; i++) {
        const fx = effects[i], s = fx.spell; if (!s) continue;
        const st = stateOf(fx);
        while (st.imp < s.hit.length && fx.elapsed >= s.hit[st.imp]) { onImpact(fx, st, st.imp); st.imp++; }
        if (st.sig) SIG[st.sig].update(fx, st, dt);
      }
    } catch (e) { console.error('[MM.fx] spells', e); }
    // damage numbers: take ownership of the baseline queue (crisp pixel font in the overlay)
    try { for (let i = 0; i < numbers.length; i++) onNumber(numbers[i]); numbers.length = 0; } catch (e) { /* */ }
    // player health / ward / level diffs (hurt, heal, shield)
    if (prevHp < 0) { prevHp = world.hp; prevWard = world.ward || 0; prevLevel = world.level; }
    if (world.level > prevLevel) onLevel(world.level);
    if (world.hp < prevHp - 0.5 && skipHeal <= 0) {
      const dmg = Math.round(prevHp - world.hp);
      hurtT = S.rFlash ? 0.25 : 0.4;
      FX.burst('sparks', game.x, game.y, { color: '#ff9a7a', count: 6, z: 22, dir: hurtFrom ? Math.atan2(PJY(game.x, game.y) - PJY(hurtFrom.x, hurtFrom.y), PJX(game.x, game.y) - PJX(hurtFrom.x, hurtFrom.y)) : undefined });
      if (S.numbers) text('-' + dmg, PJX(game.x, game.y) + 6, PJY(game.x, game.y), 46, '#ff8a7a', dmg >= 12 ? 2 : 1, 0.8, 12);
      shake(dmg >= 12 ? 3 : 2, 0.16); sfx('hit_player'); hurtFrom = null;
    } else if (world.hp > prevHp + 0.5 && skipHeal <= 0) {
      const amt = Math.round(world.hp - prevHp);
      FX.burst('heal', game.x, game.y); if (S.numbers) text('+' + amt, PJX(game.x, game.y) + 6, PJY(game.x, game.y), 46, '#b6f59a', 1, 0.9, 12); sfx('heal');
    }
    if ((world.ward || 0) > prevWard + 1) { FX.burst('shield', game.x, game.y, { follow: game }); sfx('shield'); }
    prevHp = world.hp; prevWard = world.ward || 0; if (skipHeal > 0) skipHeal--;
    // boss spawns (fallback when the 'boss' bus seam is absent)
    try { for (let i = 0; i < enemies.length; i++) { const e = enemies[i]; if (e.boss && !e._mmBossSeen && e.hp > 0) onBoss({ phase: 'spawn', enemy: e }); } } catch (e) { /* */ }
    // broom: takeoff / landing dust + magical trail
    const sp = Math.hypot(game.vx, game.vy);
    if (game.transition && !game.transition._mm) onMount(game.transition.kind);
    if (prevHeight > 0.5 && game.height <= 0.05 && !game.mounted) { FX.burst('broom', game.x, game.y, { count: 8 }); }
    prevHeight = game.height; prevMounted = game.mounted;
    if (game.mounted && sp > 14) {
      trailT += dt;
      const nx = game.vx / sp, ny = game.vy / sp, wx = PJX(game.x, game.y) - nx * 9, wy = PJY(game.x, game.y) - ny * 9;
      while (trailT > 0.045) { trailT -= 0.045; P(wx + (rnd() - 0.5) * 3, wy + (rnd() - 0.5) * 2, game.height + 2 + rnd() * 3, -nx * 6, -ny * 6, -2, 0.42, rnd() < 0.5 ? '#d8c8ff' : '#fff2c8', GLW, 1, 0, 1, true); }
    } else trailT = 0;
    if (!game.mounted && !game.transition && sp > 15) {
      walkT += dt; if (walkT > 0.32) { walkT = 0; const cs = dustCols(); P(PJX(game.x, game.y) + (rnd() - 0.5) * 4, PJY(game.x, game.y), 1, -game.vx * 0.15, -game.vy * 0.1, 6, 0.4, cs[0], PX, 1, 20, 2, false); }
    }
    // farming: diff plots (fallback for plant / water / harvest seams) + rare growth sparkles
    try {
      const plots = world.plots;
      if (world.mode === 'outside') {
        growT -= dt;
        if (growT <= 0) {
          growT = 0.7; const p = plots[(rnd() * plots.length) | 0];
          if (p && p.seed && p.watered && p.growth < 100 && rnd() < 0.35) FX.burst('growth', p.x, p.y);
          else if (p && p.seed && p.growth >= 100 && rnd() < 0.5) P(PJX(p.x, p.y) + 5, PJY(p.x, p.y), 13, 0, 0, 0, 0.5, '#fff6c8', SPK, 2, 0, 0, true);
        }
      }
      for (let i = 0; i < plots.length && i < 8; i++) {
        const p = plots[i], ps = nb.prevSeed[i];
        if (ps !== undefined && ps !== null && !p.seed && nb.prevGrowth[i] >= 99.9) { p.seedWas = ps; onPlot('harvest', p); }
        else if (!ps && p.seed) onPlot('plant', p);
        else if (p.seed && p.seed === ps && !nb.prevWater[i] && p.watered && world.weather !== 'Rain') onPlot('water', p);
        nb.prevSeed[i] = p.seed; nb.prevWater[i] = p.watered ? 1 : 0; nb.prevGrowth[i] = p.growth;
      }
    } catch (e) { /* */ }
    // status particles on enemies + dummy
    statusT += dt;
    if (statusT > 0.1) {
      statusT = 0;
      try { for (let i = 0; i < enemies.length; i++) statusFx(enemies[i]); } catch (e) { /* */ }
      try { if (world.region === 'grove' && world.mode === 'outside') statusFx(dummy); } catch (e) { /* */ }
    }
    // particles
    const tx = PJX(game.x, game.y), ty = PJY(game.x, game.y), tz = 20 + game.height;
    for (let i = pn - 1; i >= 0; i--) {
      LF[i] -= dt;
      if (LF[i] <= 0) { killP(i); continue; }
      if (HM[i]) {
        const age = 1 - LF[i] / TT[i], k = Math.min(1, dt * (1.5 + age * 16));
        VX[i] *= 1 - Math.min(1, dt * 3); VY[i] *= 1 - Math.min(1, dt * 3); VZ[i] *= 1 - Math.min(1, dt * 3);
        X[i] += VX[i] * dt + (tx - X[i]) * k; Y[i] += VY[i] * dt + (ty - Y[i]) * k; Z[i] += VZ[i] * dt + (tz - Z[i]) * k;
        if (age > 0.25 && Math.abs(tx - X[i]) + Math.abs(ty - Y[i]) + Math.abs(tz - Z[i]) < 5) { killP(i); continue; }
        continue;
      }
      if (DR[i]) { const d = 1 - Math.min(1, DR[i] * dt); VX[i] *= d; VY[i] *= d; VZ[i] *= d; }
      VZ[i] -= G[i] * dt; X[i] += VX[i] * dt; Y[i] += VY[i] * dt; Z[i] += VZ[i] * dt;
      if (Z[i] < 0) { Z[i] = 0; if (G[i] > 0) { VZ[i] *= -0.25; VX[i] *= 0.5; VY[i] *= 0.5; } }
    }
    // decals
    for (let i = 0; i < DMAX; i++) {
      const d = D[i]; if (!d.on) continue;
      d.life -= dt;
      if (d.kind === 'thorn' && d.ref) {
        let alive = true; try { alive = d.ref.hp > 0 && !d.ref.dead; } catch (e) { /* */ }
        if (!alive && d.life > 0.3) d.life = 0.3;
      }
      if (d.ref && (d.kind === 'shield' || d.kind === 'column')) { d.wx = PJX(d.ref.x, d.ref.y); d.wy = PJY(d.ref.x, d.ref.y); }
      if (d.life <= 0) { d.on = false; d.ref = null; dn--; }
    }
    // texts
    for (let i = 0; i < TMAX; i++) { const t = T[i]; if (!t.on) continue; t.life -= dt; if (t.pop > 0) t.pop -= dt; if (t.life <= 0) { t.on = false; tn--; } }
    // telegraphs
    for (let i = 0; i < GMAX; i++) {
      const g = TG[i]; if (!g.on) continue;
      g.t += dt; if (g.follow) { g.x = g.follow.x; g.y = g.follow.y; }
      if (g.t >= g.dur) { g.on = false; gn--; const f = g.onEnd; g.onEnd = null; if (f) { try { f(g); } catch (e) { console.error('[MM.fx] telegraph onEnd', e); } } }
    }
    // screen effects
    if (flashS.t > 0) flashS.t -= dt;
    if (hurtT > 0) hurtT -= dt;
    if (wave.on) {
      wave.t += dt; if (wave.t >= wave.dur) wave.on = false;
      else {
        wave.spawnT += dt; const R = waveR();
        while (wave.spawnT > 0.05) {
          wave.spawnT -= 0.05;
          for (let k = 0; k < N(4); k++) {
            const a = rnd() * TAU, wx = wave.wx + Math.cos(a) * R, wy = wave.wy + Math.sin(a) * R * 0.5;
            if (Math.abs(wx - camX) > 280 || Math.abs(wy - camY) > 190) continue;
            P(wx, wy, 2, 0, 0, 10 + rnd() * 12, 0.9 + rnd() * 0.6, rnd() < 0.5 ? '#ffd6e8' : rnd() < 0.5 ? '#fff4c8' : '#c9f5a0', rnd() < 0.6 ? PET : GLW, 1, 4, 1, rnd() < 0.4);
          }
        }
      }
    }
    updateAmbient(dt);
  };
  function waveR() { const p = wave.t / wave.dur; return (1 - (1 - p) * (1 - p)) * 640; }
  function statusFx(e) {
    if (!e || e.hp <= 0 || !e.status) return;
    const st = e.status;
    if (st.burn && rnd() < 0.8) FX.burst('burn', e.x, e.y);
    if (st.chill && rnd() < 0.35) FX.burst('chill', e.x, e.y);
    if (st.root && rnd() < 0.2) FX.burst('root', e.x, e.y);
    if (st.poison && rnd() < 0.5) FX.burst('poison', e.x, e.y);
    if (st.shock && rnd() < 0.6) FX.burst('shock', e.x, e.y);
    if (st.wet && rnd() < 0.3) FX.burst('wet-drip', e.x, e.y);
    if (st.vulnerable && rnd() < 0.25) P(PJX(e.x, e.y) + (rnd() - 0.5) * 14, PJY(e.x, e.y), 18 + rnd() * 14, 0, 0, 6, 0.5, '#d8c0ff', SPK, 1, 0, 0, true);
  }

  // ------------------------------------------------------------------ drawing
  function drawDecal(ctx, d, layer) {
    const k = d.life / d.ttl, p = 1 - k, sx = SX(d.wx), sy = SY(d.wy, 0);
    switch (d.kind) {
      case 'ring': {
        const r = d.r + (d.r2 - d.r) * (1 - (1 - p) * (1 - p)), y = sy - d.z;
        ctx.globalAlpha = k * d.a; ctx.lineWidth = 1; ctx.strokeStyle = d.c1; isoEllipse(ctx, sx, y, r, 0.55); ctx.stroke();
        if (r > 6) { ctx.strokeStyle = d.c2; ctx.globalAlpha = k * d.a * 0.7; isoEllipse(ctx, sx, y, r * 0.72, 0.55); ctx.stroke(); }
        break;
      }
      case 'crescentflash': {
        const r = d.r + (d.r2 - d.r) * p, y = sy - d.z; ctx.globalAlpha = k; ctx.lineWidth = 2; ctx.strokeStyle = d.c1;
        ctx.beginPath(); ctx.arc(sx, y, r, -1.1, 1.1); ctx.stroke(); ctx.lineWidth = 1; ctx.strokeStyle = d.c2; ctx.beginPath(); ctx.arc(sx, y, r * 0.7, Math.PI - 1.0, Math.PI + 1.0); ctx.stroke();
        break;
      }
      case 'flower': {
        // Ember Bloom: six petals open fast, then fade while drifting a little
        const g = Math.min(1, p / 0.28), r = d.r2 * (0.35 + 0.65 * (1 - (1 - g) * (1 - g))), y = sy - d.z, rot = d.rot + p * 0.6;
        ctx.save(); ctx.translate(sx, y); ctx.scale(1, 0.55);
        ctx.globalAlpha = Math.min(1, k * 1.6) * 0.85; ctx.fillStyle = d.c1;
        for (let i = 0; i < 6; i++) { const a = rot + i * TAU / 6; ctx.beginPath(); ctx.ellipse(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.48, r * 0.2, a, 0, TAU); ctx.fill(); }
        ctx.fillStyle = d.c2; ctx.globalAlpha = Math.min(1, k * 1.8);
        for (let i = 0; i < 6; i++) { const a = rot + i * TAU / 6 + 0.1; ctx.beginPath(); ctx.ellipse(Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42, r * 0.26, r * 0.1, a, 0, TAU); ctx.fill(); }
        ctx.fillStyle = '#fff2c0'; ctx.beginPath(); ctx.arc(0, 0, Math.max(1, r * 0.16), 0, TAU); ctx.fill();
        ctx.restore();
        break;
      }
      case 'scorch': case 'wet': {
        ctx.globalAlpha = Math.min(1, k * 2); ctx.fillStyle = d.c1; isoEllipse(ctx, sx, sy, d.r); ctx.fill();
        if (d.kind === 'scorch') { ctx.fillStyle = 'rgba(40,20,12,.35)'; isoEllipse(ctx, sx, sy, d.r * 0.5); ctx.fill(); }
        break;
      }
      case 'rime': case 'stardust': {
        ctx.globalAlpha = Math.min(1, k * 2) * 0.9; ctx.fillStyle = d.c1; isoEllipse(ctx, sx, sy, d.r); ctx.fill();
        ctx.fillStyle = d.c2;
        for (let i = 0; i < 9; i++) { const a = d.seed + i * 2.399, rr = d.r * (0.2 + ((i * 37 + d.seed) % 7) / 8.5); ctx.fillRect((sx + Math.cos(a) * rr) | 0, (sy + Math.sin(a) * rr * 0.5) | 0, 1, 1); }
        break;
      }
      case 'thorn': {
        // Thornbind zone: readable ground boundary for as long as the snare lasts
        const g = Math.min(1, (d.ttl - d.life) / 0.25), out = Math.min(1, d.life / 0.3), a = g * out, r = d.r;
        if (layer === L_GROUND) {
          ctx.globalAlpha = 0.24 * a; ctx.fillStyle = '#3d6b30'; isoEllipse(ctx, sx, sy, r * g); ctx.fill();
          ctx.globalAlpha = 0.9 * a; ctx.lineWidth = 2; ctx.strokeStyle = '#2f4f26'; isoEllipse(ctx, sx, sy, r * g); ctx.stroke();
          ctx.lineWidth = 1; ctx.strokeStyle = '#9fdc7c'; ctx.setLineDash(DASH2); isoEllipse(ctx, sx, sy, r * g - 1); ctx.stroke(); ctx.setLineDash(NODASH);
          ctx.fillStyle = '#cdeea0';
          for (let i = 0; i < 10; i++) { const an2 = i * TAU / 10 + d.rot, x = sx + Math.cos(an2) * r * g, y = sy + Math.sin(an2) * r * g * 0.5; ctx.fillRect(x | 0, (y | 0) - 1, 1, 2); ctx.fillRect((x + Math.cos(an2) * 2) | 0, (y + Math.sin(an2)) | 0, 1, 1); }
        } else {
          // curling roots rising around the snared target
          const t = game.elapsed;
          for (let i = 0; i < 6; i++) {
            const an2 = d.rot + i * TAU / 6, bx = sx + Math.cos(an2) * r * 0.8, by = sy + Math.sin(an2) * r * 0.4;
            const hgt = (9 + ((i * 5 + d.seed) % 6)) * a, curl = (i & 1 ? 1 : -1);
            let x = bx, y = by;
            for (let j = 1; j <= 5; j++) {
              const q = j / 5, nx = bx + (sx - bx) * q * 0.45 + Math.sin(q * 3 + t * 2 + i) * 2 * curl, ny = by - hgt * q + (sy - by) * q * 0.3;
              ctx.globalAlpha = a; ctx.fillStyle = j < 3 ? '#3f6a32' : '#5f9a48'; ctx.fillRect(nx | 0, ny | 0, j < 4 ? 2 : 1, 2);
              if (j === 3) { ctx.fillStyle = '#b9e88e'; ctx.fillRect((nx + curl * 2) | 0, (ny - 1) | 0, 1, 1); }
              x = nx; y = ny;
            }
            ctx.fillStyle = '#d8f5b0'; ctx.fillRect(x | 0, (y - 1) | 0, 1, 1);
          }
        }
        break;
      }
      case 'bell': {
        // Frostbell: two restrained ring pulses + a tiny crystal bell that chimes once
        const y = sy;
        for (let j = 0; j < 2; j++) {
          const q = clamp((p - j * 0.18) / 0.7, 0, 1); if (q <= 0 || q >= 1) continue;
          const r = d.r + (d.r2 - d.r) * (1 - (1 - q) * (1 - q));
          ctx.globalAlpha = (1 - q) * 0.9; ctx.lineWidth = 1; ctx.strokeStyle = j ? d.c2 : d.c1; isoEllipse(ctx, sx, y, r); ctx.stroke();
          ctx.fillStyle = '#ffffff';
          for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + j * 0.5; ctx.fillRect((sx + Math.cos(a) * r) | 0, (y + Math.sin(a) * r * 0.5) | 0, 1, 1); }
        }
        if (p < 0.55) {
          const by = y - 44 - p * 6, sw = Math.sin(p * 30) * (1 - p * 1.8);
          ctx.globalAlpha = Math.min(1, (0.55 - p) * 5);
          const bx = (sx + sw * 1.5) | 0, top = by | 0;
          ctx.fillStyle = '#5aa6c8'; ctx.fillRect(bx - 1, top - 1, 3, 1); ctx.fillRect(bx - 2, top, 5, 3); ctx.fillRect(bx - 3, top + 3, 7, 2);
          ctx.fillStyle = '#d8f6ff'; ctx.fillRect(bx - 1, top, 3, 3); ctx.fillRect(bx - 2, top + 3, 5, 1);
          ctx.fillStyle = '#ffffff'; ctx.fillRect(bx, top + 5, 1, 1); ctx.fillRect(bx - 1, top, 1, 2);
        }
        break;
      }
      case 'starburst': {
        const y = sy - d.z, r = d.r + (d.r2 - d.r) * Math.min(1, p * 2.2);
        ctx.globalAlpha = k; ctx.fillStyle = d.c2;
        for (let i = 0; i < 8; i++) {
          const a = i * Math.PI / 4, len = (i & 1 ? 0.55 : 1) * r * (1 - p * 0.6);
          for (let s = 3; s < len; s += 2) ctx.fillRect((sx + Math.cos(a) * s) | 0, (y + Math.sin(a) * s * 0.6) | 0, s < len * 0.5 ? 2 : 1, s < len * 0.5 ? 2 : 1);
        }
        ctx.fillStyle = d.c1; ctx.fillRect(sx - 2, y - 2, 5, 5); ctx.fillStyle = '#ffffff'; ctx.fillRect(sx - 1, y - 1, 3, 3);
        break;
      }
      case 'shield': {
        const y = sy - 18; ctx.globalAlpha = k * 0.85; ctx.lineWidth = 1; ctx.strokeStyle = d.c1; ctx.beginPath(); ctx.ellipse(sx, y, 13 + p * 4, 20 + p * 4, 0, 0, TAU); ctx.stroke();
        ctx.fillStyle = d.c2; for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + p * 3; ctx.fillRect((sx + Math.cos(a) * (13 + p * 4)) | 0, (y + Math.sin(a) * (20 + p * 4)) | 0, 1, 1); }
        break;
      }
      case 'column': {
        const a = Math.min(1, k * 2) * Math.min(1, p * 6), h = 70 * Math.min(1, p * 3);
        ctx.globalAlpha = a * 0.5; ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = d.c2; ctx.fillRect(sx - 5, sy - h, 11, h);
        ctx.globalAlpha = a * 0.8; ctx.fillStyle = d.c1; ctx.fillRect(sx - 2, sy - h, 5, h);
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
    }
  }
  FX.drawGround = function (ctx) {
    if (!FX.enabled || !base()) return;
    camX = game.camX; camY = game.camY;
    ctx.save();
    for (let i = 0; i < DMAX; i++) { const d = D[i]; if (d.on && (d.layer & L_GROUND)) drawDecal(ctx, d, L_GROUND); }
    ctx.globalAlpha = 1;
    try { for (let i = 0; i < effects.length; i++) { const fx = effects[i], st = FXS.get(fx); if (st && st.sig && SIG[st.sig].ground) SIG[st.sig].ground(ctx, fx, st); } } catch (e) { /* */ }
    // status ground marks: roots clamp the feet, chill leaves a frost ring
    try {
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i]; if (e.hp <= 0 || !e.status) continue;
        if (e.status.root || e.status.chill) {
          const sx = SX(PJX(e.x, e.y)), sy = SY(PJY(e.x, e.y), 0);
          ctx.globalAlpha = 0.85; ctx.lineWidth = 1; ctx.strokeStyle = e.status.root ? '#5f9a48' : '#bfefff'; isoEllipse(ctx, sx, sy, e.boss ? 14 : 10); ctx.stroke();
        }
      }
    } catch (e) { /* */ }
    ctx.restore();
  };
  let drawnFrame = -1, frameNo = 0;
  FX.drawWorld = function (ctx) {
    if (drawnFrame === frameNo) return; drawnFrame = frameNo;
    if (!FX.enabled || !base()) return;
    camX = game.camX; camY = game.camY;
    ctx.save();
    for (let i = 0; i < DMAX; i++) { const d = D[i]; if (d.on && (d.layer & L_WORLD)) drawDecal(ctx, d, L_WORLD); }
    ctx.globalAlpha = 1;
    // persistent ward shimmer around the player
    if ((world.ward || 0) > 0) { const sx = SX(PJX(game.x, game.y)), sy = SY(PJY(game.x, game.y), 18 + game.height); ctx.globalAlpha = 0.18 + 0.08 * Math.sin(game.elapsed * 4); ctx.strokeStyle = '#ffe6a8'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(sx, sy, 13, 20, 0, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
    // restoration wave ring (pre-filter so it blooms)
    if (wave.on) {
      const R = waveR(), p = wave.t / wave.dur, sx = SX(wave.wx), sy = SY(wave.wy, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.45 * (1 - p); ctx.lineWidth = 7; ctx.strokeStyle = '#b8e06a'; isoEllipse(ctx, sx, sy, R); ctx.stroke();
      ctx.globalAlpha = 0.8 * (1 - p); ctx.lineWidth = 2; ctx.strokeStyle = '#fff2a8'; isoEllipse(ctx, sx, sy, R); ctx.stroke();
      ctx.globalAlpha = 0.35 * (1 - p); ctx.lineWidth = 1; ctx.strokeStyle = '#e8ffd0'; isoEllipse(ctx, sx, sy, R * 0.86); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.lineWidth = 1;
    }
    drawAmbient(ctx);
    drawParticles(ctx);
    ctx.restore();
  };
  function drawParticles(ctx) {
    for (let pass = 0; pass < 2; pass++) {
      if (pass) ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < pn; i++) {
        if (AD[i] !== pass) continue;
        const sx = SX(X[i]), sy = SY(Y[i], Z[i]); if (sx < -8 || sx > W + 8 || sy < -8 || sy > H + 8) continue;
        const f = LF[i] / TT[i]; ctx.globalAlpha = f < 0.4 ? f * 2.5 : 1;
        const s = SZ[i], c = C[i];
        switch (SH[i]) {
          case GLW: ctx.drawImage(glow(c), sx - 4, sy - 4, 9, 9); ctx.fillStyle = c; ctx.fillRect(sx, sy, 1, 1); break;
          case SPK: ctx.fillStyle = c; if (f > 0.5 && s > 0) { ctx.fillRect(sx - s, sy, 2 * s + 1, 1); ctx.fillRect(sx, sy - s, 1, 2 * s + 1); } else ctx.fillRect(sx, sy, 1, 1); break;
          case STR: ctx.fillStyle = c; ctx.fillRect(sx, sy, s, s); ctx.fillRect((sx - VX[i] * 0.025) | 0, (sy - (VY[i] - VZ[i]) * 0.025) | 0, s, s); break;
          case FLK: ctx.fillStyle = c; ctx.fillRect(sx - 1, sy, 3, 1); ctx.fillRect(sx, sy - 1, 1, 3); break;
          case LEAF: case PET: ctx.fillStyle = c; if (((LF[i] * 9 + i) | 0) & 1) ctx.fillRect(sx, sy, 2, 1); else ctx.fillRect(sx, sy, 1, 2); break;
          case BUB: ctx.fillStyle = c; ctx.fillRect(sx - 1, sy, 1, 1); ctx.fillRect(sx + 1, sy, 1, 1); ctx.fillRect(sx, sy - 1, 1, 1); ctx.fillRect(sx, sy + 1, 1, 1); break;
          case COIN: ctx.fillStyle = c; ctx.fillRect(sx, sy, 2, 2); ctx.fillStyle = '#fff8dc'; ctx.fillRect(sx, sy, 1, 1); break;
          case PLUS: ctx.fillStyle = c; ctx.fillRect(sx - 1, sy, 3, 1); ctx.fillRect(sx, sy - 1, 1, 3); break;
          default: ctx.fillStyle = c; ctx.fillRect(sx, sy, s, s);
        }
      }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  function telegraphShape(ctx, g, sx, sy, scale) {
    const r = g.r * scale;
    ctx.beginPath();
    if (g.shape === 'cone') { ctx.moveTo(sx, sy); ctx.ellipse(sx, sy, r, g.iso ? r * 0.5 : r, 0, g.dir - g.arc / 2, g.dir + g.arc / 2); ctx.closePath(); }
    else if (g.shape === 'line') { const c = Math.cos(g.dir), s = Math.sin(g.dir), len = g.h * scale, hw = g.w / 2; ctx.moveTo(sx - s * hw, sy + c * hw); ctx.lineTo(sx - s * hw + c * len, sy + c * hw + s * len); ctx.lineTo(sx + s * hw + c * len, sy - c * hw + s * len); ctx.lineTo(sx + s * hw, sy - c * hw); ctx.closePath(); }
    else if (g.shape === 'rect') { ctx.rect(sx - g.w * scale / 2, sy - g.h * scale / 2, g.w * scale, g.h * scale); }
    else ctx.ellipse(sx, sy, Math.max(0.5, r), Math.max(0.5, g.iso ? r * 0.5 : r), 0, 0, TAU);
  }
  function drawTelegraph(ctx, g, p, t) {
    const sx = SX(PJX(g.x, g.y)), sy = SY(PJY(g.x, g.y), 0), danger = g.kind === 'danger';
    if (!hatchPat) hatchPat = ctx.createPattern(hatch, 'repeat');
    // 1. faint hatched area (pattern = shape cue, independent of colour)
    telegraphShape(ctx, g, sx, sy, 1);
    ctx.globalAlpha = danger ? 0.22 + 0.12 * p + 0.05 * Math.sin(t * 14) : 0.14;
    ctx.fillStyle = danger ? hatchPat : '#8fe3ff'; ctx.fill();
    // 2. solid inner fill grows to the edge as the attack nears (timing cue)
    telegraphShape(ctx, g, sx, sy, Math.max(0.05, p));
    ctx.globalAlpha = danger ? 0.18 + 0.2 * p : 0.12; ctx.fillStyle = danger ? '#ff6a3d' : '#bff2ff'; ctx.fill();
    // 3. high-contrast double outline (dark under, bright over); final beat thickens
    telegraphShape(ctx, g, sx, sy, 1);
    ctx.globalAlpha = 0.85; ctx.lineWidth = 3; ctx.strokeStyle = danger ? 'rgba(40,8,4,.9)' : 'rgba(10,30,40,.8)'; ctx.stroke();
    const last = p > 0.82;
    ctx.globalAlpha = 1; ctx.lineWidth = last && !S.rFlash && ((t * 20) | 0) & 1 ? 2 : 1;
    ctx.strokeStyle = danger ? (last ? '#fff2c0' : '#ffd25a') : '#8fe3ff';
    if (!danger) ctx.setLineDash(DASH2);
    ctx.stroke(); ctx.setLineDash(NODASH); ctx.lineWidth = 1;
  }
  const AUTO = { on: true, shape: 'circle', x: 0, y: 0, r: 55, w: 0, h: 0, dir: 0, arc: 1.2, dur: 1, t: 0, kind: 'danger', iso: false };
  function drawAutoTelegraphs(ctx, t) {
    if (!FX.autoTelegraph) return;
    let list; try { list = enemies; } catch (e) { return; }
    const gx = PJX(game.x, game.y), gy = PJY(game.x, game.y);
    for (let i = 0; i < list.length; i++) {
      const e = list[i]; if (e.hp <= 0 || e.noAutoTelegraph) continue;
      if (e.boss && e.special < 0.9) {
        AUTO.shape = 'circle'; AUTO.x = e.x; AUTO.y = e.y; AUTO.r = 55; AUTO.iso = false; AUTO.kind = 'danger';
        drawTelegraph(ctx, AUTO, clamp(1 - e.special / 0.9, 0, 1), t);
        if (!e._mmWU) { e._mmWU = true; sfx('enemy_windup', { pan: panOf(PJX(e.x, e.y)) }); }
      } else if (e.boss && e._mmWU && e.special > 0.9) e._mmWU = false;
      const win = e.boss ? 0.5 : 0.4;
      if (e.attack < win) {
        const ex = PJX(e.x, e.y), ey = PJY(e.x, e.y), d = Math.hypot(gx - ex, gy - ey);
        if (d < 32) {
          AUTO.shape = 'cone'; AUTO.x = e.x; AUTO.y = e.y; AUTO.r = e.boss ? 30 : 25; AUTO.dir = Math.atan2(gy - ey, gx - ex); AUTO.arc = 1.3; AUTO.iso = false;
          const p = clamp(1 - e.attack / win, 0, 1); drawTelegraph(ctx, AUTO, p, t);
          // "!" pip above the head: shape cue that a hit is coming
          const top = SY(ey, (typeof CAST_HEIGHT === 'object' && CAST_HEIGHT[e.type]) || 34) - (e.boss ? 20 : 12), sx = SX(ex);
          drawText(ctx, '!', sx - 2, top - 6, p > 0.75 ? '#fff2c0' : '#ffd25a', 1);
        }
      }
    }
  }
  FX.drawOverlay = function (ctx) {
    frameNo++;
    if (!FX.enabled || !base()) return;
    camX = game.camX; camY = game.camY;
    const t = game.elapsed;
    let ox = 0, oy = 0; try { const o = MM.camera && MM.camera.offset ? MM.camera.offset() : null; if (o) { ox = Math.round(o.x) || 0; oy = Math.round(o.y) || 0; } } catch (e) { /* */ }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, ox, oy);
    ctx.imageSmoothingEnabled = false;
    // world-anchored, post-filter: danger zones first, then numbers / text on top
    for (let i = 0; i < GMAX; i++) { const g = TG[i]; if (g.on) drawTelegraph(ctx, g, clamp(g.t / g.dur, 0, 1), t); }
    drawAutoTelegraphs(ctx, t);
    try { for (let i = 0; i < effects.length; i++) { const fx = effects[i], st = FXS.get(fx); if (st && st.sig && SIG[st.sig].overlay) SIG[st.sig].overlay(ctx, fx, st); } } catch (e) { /* */ }
    ctx.globalAlpha = 1;
    for (let i = 0; i < TMAX; i++) {
      const tx = T[i]; if (!tx.on) continue;
      const k = 1 - tx.life / tx.ttl, f = tx.life / tx.ttl, s = tx.pop > 0 ? tx.s + 1 : tx.s;
      const z = tx.z + tx.rise * (1 - (1 - k) * (1 - k));
      const w = textWidth(tx.str, s), sx = SX(tx.wx + tx.vx * k) - (w >> 1), sy = SY(tx.wy, z);
      ctx.globalAlpha = f < 0.3 ? f / 0.3 : 1;
      drawText(ctx, tx.str, sx, sy, tx.color, s);
    }
    ctx.globalAlpha = 1;
    // screen space
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (wave.on) {
      const p = wave.t / wave.dur, a = Math.sin(Math.PI * Math.min(1, p * 1.4)) * (S.rFlash ? 0.08 : 0.2);
      if (a > 0.005) { ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = a; ctx.fillStyle = '#e6f59a'; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over'; }
    }
    if (hurtT > 0) { ctx.globalAlpha = (hurtT / 0.4) * (S.rFlash ? 0.35 : 0.7); ctx.imageSmoothingEnabled = true; ctx.drawImage(hurtV, 0, 0, W, H); ctx.imageSmoothingEnabled = false; }
    if (flashS.t > 0) { ctx.globalAlpha = flashS.a * (flashS.t / flashS.dur); ctx.fillStyle = flashS.color; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
  };
  // MM.lighting asks for extra lights each frame (screen px, pre-shake)
  FX.emitLights = function (cb, night) {
    if (!FX.enabled) return;
    camX = game.camX; camY = game.camY;
    let n = 0;
    if (night > 0.3) for (let i = 0; i < an && n < 14; i++) if (AK[i] === FIREFLY) { const b = 0.5 + 0.5 * Math.sin(game.elapsed * 2.6 + i * 1.9); cb(SX(AX[i]), SY(AY[i], AZ[i]), 14, '#d8ff9a', 0.55 * b * b * AL[i], 0.5); n++; }
    for (let i = 0; i < DMAX; i++) {
      const d = D[i]; if (!d.on) continue;
      const k = d.life / d.ttl;
      if (d.kind === 'thorn') cb(SX(d.wx), SY(d.wy, 4), d.r * 1.6, '#9be07a', 0.35 * Math.min(1, d.life / 0.3), 0.15);
      else if (d.kind === 'flower') cb(SX(d.wx), SY(d.wy, 6), 60, '#ffad5c', 0.8 * k, 0.5);
      else if (d.kind === 'column') cb(SX(d.wx), SY(d.wy, 30), 70, '#ffe6a0', 0.8 * k, 0.4);
      else if (d.kind === 'stardust') cb(SX(d.wx), SY(d.wy, 4), d.r * 1.8, '#ffe6a0', 0.35 * k, 0.1);
    }
    if (wave.on) { const p = wave.t / wave.dur; cb(SX(wave.wx), SY(wave.wy, 0), 60 + waveR() * 0.9, '#e8ffb0', 0.6 * (1 - p), 0.2); }
  };

  // ------------------------------------------------------------------ public helpers
  FX.stats = function () {
    let bp = -1, bb = -1, ef = -1, nu = -1;
    try { bp = particles.length; bb = bursts.length; ef = effects.length; nu = numbers.length; } catch (e) { /* */ }
    return { particles: pn, cap, dropped, ambient: an, ambientCap: aCap, decals: dn, texts: tn, telegraphs: gn, baselineParticles: bp, baselineBursts: bb, effects: ef, numbers: nu, slow, pScale: S.pScale };
  };
  FX.clear = onRegion;
  FX.settings = S;
  FX.readSettings = readSettings;
  FX._sig = SIG;

  // ------------------------------------------------------------------ baseline wrappers (seams)
  function wrap(name, make) {
    try { const f = window[name]; if (typeof f !== 'function' || f.__mmfx) return; const w = make(f); w.__mmfx = true; window[name] = w; } catch (e) { console.warn('[MM.fx] cannot wrap', name, e); }
  }
  function installWrappers() {
    wrap('drawEffect', (orig) => function (fx) {
      if (FX.enabled && fx && fx.spell) {
        const sig = sigOf(fx.spell);
        if (sig) { try { const c = ctx; camX = game.camX; camY = game.camY; c.save(); SIG[sig].draw(c, fx, stateOf(fx)); c.restore(); } catch (e) { console.error('[MM.fx] sig draw', e); } return; }
      }
      return orig.apply(this, arguments);
    });
    wrap('addParticles', (orig) => function (target, color, core) {
      if (FX.enabled && sigPairs.size && sigPairs.has(color + '|' + core)) return; // signature spells use their own FX
      return orig.apply(this, arguments);
    });
    wrap('castSpell', (orig) => function (actor) {
      const r = orig.apply(this, arguments);
      try { if (!r && (actor === undefined || actor === game)) onCastFail(SPELLS[spellIndex]); } catch (e) { /* */ }
      return r;
    });
    wrap('hitEntity', (orig) => function (target) {
      const was = !!(target && target.dead);
      const r = orig.apply(this, arguments);
      try { if (target && !was && target.dead) onKill(target); } catch (e) { /* */ }
      return r;
    });
    wrap('pickup', (orig) => function (drop, actor) { const r = orig.apply(this, arguments); try { onPickup(drop, actor); } catch (e) { /* */ } return r; });
    wrap('awardXP', (orig) => function () { const lv = world.level; const r = orig.apply(this, arguments); try { if (world.level > lv) onLevel(world.level); } catch (e) { /* */ } return r; });
    ['goRegion', 'enterDungeon', 'advanceFloor', 'resetPlayer'].forEach((n) => wrap(n, (orig) => function () { const r = orig.apply(this, arguments); try { onRegion(); } catch (e) { /* */ } return r; }));
    wrap('update', (orig) => function (dt) {
      if (slow > 0) { slow -= dt; dt *= slowScale; if (slow <= 0) slowScale = 1; }
      return orig.call(this, dt);
    });
  }

  // ------------------------------------------------------------------ install
  let installed = false;
  FX.install = function () {
    if (installed) return true;
    const h = MM.hooks; if (!h || !h.on || !base()) return false;
    installed = true;
    installWrappers();
    h.on('postUpdate', FX.update, 0);
    h.on('drawGround', FX.drawGround, 0);
    h.on('postEffects', FX.drawWorld, 10);
    h.on('overlay', FX.drawOverlay, 0);
    const b = MM.bus;
    if (b && b.on) {
      b.on('settings', readSettings);
      b.on('kill', (d) => { try { onKill(d && (d.enemy || d.target)); } catch (e) { /* */ } });
      b.on('boss', (d) => { try { onBoss(d); } catch (e) { /* */ } });
      b.on('pickup', (d) => { try { if (d && d.drop) onPickup(d.drop, d.actor); else onBusPickup(d); } catch (e) { /* */ } });
      b.on('levelup', (d) => { try { onLevel(d && d.level); } catch (e) { /* */ } });
      b.on('plant', (d) => { try { onPlot('plant', d && d.plot); } catch (e) { /* */ } });
      b.on('water', (d) => { try { onPlot('water', d && d.plot); } catch (e) { /* */ } });
      b.on('harvest', (d) => { try { if (d && d.plot) { d.plot.seedWas = d.seed || d.plot.seedWas; onPlot('harvest', d.plot); } } catch (e) { /* */ } });
      b.on('hurt', (d) => { hurtFrom = d && d.from ? d.from : null; });
      b.on('hit', (d) => { try { if (d && d.crit && d.target) FX.burst('crit', d.target.x, d.target.y, { color: d.color }); } catch (e) { /* */ } });
      b.on('mount', (d) => { try { onMount(d && d.kind); } catch (e) { /* */ } });
      b.on('region', onRegion); b.on('dungeon', onRegion); b.on('death', onRegion);
      b.on('restored', (d) => { try { FX.restorationWave(d && (d.region || d.id)); } catch (e) { /* */ } });
    }
    try { if (MM.settings && MM.settings.onChange) MM.settings.onChange(readSettings); } catch (e) { /* */ }
    readSettings();
    return true;
  };
  readSettings();
  if (!FX.install()) document.addEventListener('DOMContentLoaded', () => FX.install());
})();
