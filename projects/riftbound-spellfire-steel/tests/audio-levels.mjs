// Objective audio level meter (v1.2 audio balance pass).
//   node tests/audio-levels.mjs            → table of every synthesized recipe / loop + live bus levels
//   AUDIO_JSON=1 node tests/audio-levels.mjs → also writes tests/output/audio-levels.json
//   AUDIO_TARGET=<page> node tests/audio-levels.mjs → meters another page (e.g. an archived release)
// Renders each recipe offline (OfflineAudioContext, seeded noise) in headless Chromium and reports
//   peak    – sample peak, dBFS
//   M100    – loudest 100 ms window, approx. K-weighted RMS (BS.1770 pre-filter via biquads), dB
//   phone   – same after a 24 dB/oct high-pass at 350 Hz (rough small phone speaker), dB
//   game    – M100 after the play() context used in-game (vol × distance attenuation), dB
// Then plays the game for a few seconds and meters the live music / sfx / ambient buses.
// Exits 1 if any mix target fails. This replaces nothing a human listener does: it only makes the mix
// measurable and repeatable.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright is not installed. Run: npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  const path = normalize(join(root, url.endsWith('/') ? url + 'index.html' : url));
  try {
    const data = await readFile(path);
    res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end();
  }
});
await new Promise((r) => server.listen(0, r));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
// AUDIO_TARGET=dist/releases/riftbound-v1.1.0-beta.html meters an archived build (before/after comparisons)
await page.goto(`http://localhost:${server.address().port}/${process.env.AUDIO_TARGET || 'index.html'}`);
await page.waitForFunction(() => !!window.riftbound, null, { timeout: 20000 });

// Sector 2 registers the golem recipes; capture the golem loop builders as the game passes them in.
await page.evaluate(() => {
  const g = window.riftbound;
  const a = g.services.audio;
  window.__loopBuilders = {};
  const orig = a.loopVolume.bind(a);
  a.loopVolume = (n, v, b) => { if (b) window.__loopBuilders[n] = b; return orig(n, v, b); };
  g.services.save.campaign.introSeen = true;
  g.services.dev.god = true;
  g.uiAction('deploy', 1);
});
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const w = window.riftbound.currentWorld();
  const golem = w.actors.find((x) => x.kind === 'arcaneGolem');
  golem.mount(w.player);
});
await page.waitForTimeout(800);

const offline = await page.evaluate(async () => {
  const live = window.riftbound.services.audio;
  const Ctor = live.constructor;
  // v1.2 mix trims (dB) applied by Game on top of the recipes / loops
  const mix = window.riftbound.audioMix || { music: 0, recipes: {}, loops: {} };
  const SR = 44100;
  // in-game play() context: [vol, distance m] (distance null = non-positional, e.g. the player's own casts)
  const CTX = {
    bolt: [1, null], boltHit: [0.5, 10], fireCast: [1, null], fireBoom: [1, 10], lightning: [1, null], vortex: [1, 10],
    firestorm: [1, 10], meteorFall: [1, 10], meteorImpact: [1, 12], blink: [1, null], wardUp: [1, null], wardHit: [1, null],
    wardBreak: [1, null], snap: [1, null], freeze: [1, 8], shatter: [1, 8], shockwave: [1, 8], potion: [1, null],
    gunshot: [1, 14], pistol: [1, 14], minigunShot: [0.6, 16], sniper: [1, 22], laserShot: [1, 14], explosion: [1, 12],
    mortarLaunch: [1, 25], cannon: [1, 14], rocket: [1, 16], coverHit: [0.5, 3], impact: [1, 3], enemyHurt: [0.6, 10],
    playerHurt: [1, null], golemLaser: [1, 0], golemDash: [1, 0], golemScrape: [0.8, 0], golemStomp: [1, 0],
    golemCharge: [1, 0], golemOverheat: [1, 0], golemHeatWarn: [1, null], stoneHit: [1, 0], aaLaunch: [1, 14], lockTone: [0.9, null],
    lowMana: [1, null], objective: [1, null], pickup: [1, null], heartbeat: [0.6, null],
  };
  const att = (d) => (d === null ? 1 : 1 / Math.pow(1 + d / 14, 1.3));
  let seed = 1234567;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const makeEngine = (ctx) => {
    const e = new Ctor();
    e.ctx = ctx;
    const len = SR * 2;
    e.noiseBuffer = ctx.createBuffer(1, len, SR);
    const d = e.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = rnd() * 2 - 1;
    return e;
  };
  // out → [raw, K-weighted, phone] on three channels
  const chain = (ctx) => {
    const out = ctx.createGain();
    const merger = ctx.createChannelMerger(3);
    out.connect(merger, 0, 0);
    const hs = ctx.createBiquadFilter(); hs.type = 'highshelf'; hs.frequency.value = 1500; hs.gain.value = 4;
    const rlb = ctx.createBiquadFilter(); rlb.type = 'highpass'; rlb.frequency.value = 38; rlb.Q.value = 0.5;
    out.connect(hs); hs.connect(rlb); rlb.connect(merger, 0, 1);
    const p1 = ctx.createBiquadFilter(); p1.type = 'highpass'; p1.frequency.value = 350;
    const p2 = ctx.createBiquadFilter(); p2.type = 'highpass'; p2.frequency.value = 350;
    rlb.connect(p1); p1.connect(p2); p2.connect(merger, 0, 2);
    merger.connect(ctx.destination);
    return out;
  };
  const meter = (buf, from = 0) => {
    const win = Math.round(SR * 0.1), hop = Math.round(SR * 0.025);
    const db = (v) => (v > 1e-9 ? 20 * Math.log10(v) : -120);
    const ch = [0, 1, 2].map((c) => buf.getChannelData(c));
    let peak = 0;
    for (let i = from; i < ch[0].length; i++) peak = Math.max(peak, Math.abs(ch[0][i]));
    const m = (data) => {
      let best = 0;
      for (let s = from; s + win <= data.length; s += hop) {
        let acc = 0;
        for (let i = s; i < s + win; i++) acc += data[i] * data[i];
        best = Math.max(best, Math.sqrt(acc / win));
      }
      return best;
    };
    return { peak: db(peak), m100: db(m(ch[1])), phone: db(m(ch[2])) };
  };
  const recipes = [];
  const names = [...live.recipes.keys()];
  const origRandom = Math.random;
  Math.random = rnd;
  try {
    for (const name of names) {
      const ctx = new OfflineAudioContext(3, SR * 2.4, SR);
      const e = makeEngine(ctx);
      const out = chain(ctx);
      live.recipes.get(name)(e, out, 1);
      const buf = await ctx.startRendering();
      const r = meter(buf);
      const c = CTX[name];
      const trim = mix.recipes[name] || 0;
      const ctxDb = c ? 20 * Math.log10(c[0] * att(c[1])) + trim : null;
      recipes.push({ name, ...r, trim, game: c ? r.m100 + ctxDb : null, gamePhone: c ? r.phone + ctxDb : null, ctx: c || null });
    }
    // loops at their in-game volumes (the last second, after the fade-in)
    const LOOPS = { rain: 0.32, rift: 0.22, ward: 1, channel: 1, minigun: 1, engine: 1, rotor: 1, portal: 1, golemHum: 0.22, golemBeam: 0.38 };
    var loops = [];
    for (const [name, vol] of Object.entries(LOOPS)) {
      const ctx = new OfflineAudioContext(3, SR * 2, SR);
      const e = makeEngine(ctx);
      const out = chain(ctx);
      e.ambientBus = out;
      const trim = mix.loops[name] || 0;
      e.loopVolume(name, vol * Math.pow(10, trim / 20), window.__loopBuilders[name]);
      const buf = await ctx.startRendering();
      loops.push({ name, vol, trim, ...meter(buf, SR) });
    }
  } finally {
    Math.random = origRandom;
  }
  return { recipes, loops, mixMusic: mix.music, buses: { sfx: live.volumes.sfx, music: live.volumes.music * 0.7, master: live.volumes.master } };
});

// live bus meter: sector 1, calm then forced combat intensity
const liveLv = await page.evaluate(async () => {
  const g = window.riftbound;
  const a = g.services.audio;
  a.unlock();
  if (!a.ctx) return { error: 'no AudioContext' };
  await a.ctx.resume().catch(() => undefined);
  g.uiAction('deploy', 0);
  // K-weighted taps (same biquad approximation as the offline meter)
  const mk = (bus) => {
    const hs = a.ctx.createBiquadFilter(); hs.type = 'highshelf'; hs.frequency.value = 1500; hs.gain.value = 4;
    const hp = a.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 38; hp.Q.value = 0.5;
    const an = a.ctx.createAnalyser(); an.fftSize = 2048;
    bus.connect(hs); hs.connect(hp); hp.connect(an);
    return an;
  };
  const an = { music: mk(a.musicBus), sfx: mk(a.sfxBus), ambient: mk(a.ambientBus), master: mk(a.master) };
  const buf = new Float32Array(2048);
  const rms = (x) => { x.getFloatTimeDomainData(buf); let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i]; return Math.sqrt(s / buf.length); };
  const sample = async (sec) => {
    const acc = { music: 0, sfx: 0, ambient: 0, master: 0 };
    let n = 0;
    const end = performance.now() + sec * 1000;
    while (performance.now() < end) {
      await new Promise((r) => setTimeout(r, 40));
      for (const k of Object.keys(acc)) acc[k] += rms(an[k]) ** 2;
      n++;
    }
    const out = {};
    for (const k of Object.keys(acc)) out[k] = n ? 10 * Math.log10(acc[k] / n + 1e-12) : -120;
    return out;
  };
  await new Promise((r) => setTimeout(r, 2500));
  const calm = await sample(4);
  // the World drives music intensity from combat heat every frame: pin it to full combat while metering
  const m = g.services.music;
  const setI = m.setIntensity;
  m.setIntensity = () => setI.call(m, 1);
  await new Promise((r) => setTimeout(r, 3000));
  const combat = await sample(4);
  m.setIntensity = setI;
  window.__meter = { sample };
  return { state: a.ctx.state, calm, combat };
});

// v1.3: golem engine rumble live, at idle / full speed / bracing, and the beam over it (BUGS #16).
// Measured on the ambient bus (where loops play) as power differences against the parked baseline.
const golemLv = liveLv.error ? null : await page.evaluate(async () => {
  const g = window.riftbound;
  const inp = g.services.input;
  const { sample } = window.__meter;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  g.services.dev.god = true;
  g.uiAction('deploy', 1);
  await wait(1500);
  const w = g.currentWorld();
  const golem = w.actors.find((x) => x.kind === 'arcaneGolem');
  const clear = () => { for (const x of w.actors) if (x.faction === 'army') { x.alive = false; x.removed = true; } };
  const reset = () => { golem.x = 86; golem.z = 70.5; golem.vx = golem.vz = 0; golem.hp = golem.maxHp; golem.heat = 0; golem.overheat = 0; };
  await wait(1500);
  const base = (await sample(2)).ambient;
  golem.mount(w.player);
  await wait(300);
  clear();
  reset();
  await wait(1500);
  const idle = (await sample(1.5)).ambient;
  reset();
  inp.touchMoveX = -1;
  // accelerate until the golem is at (near) top speed — the headless sim can run slower than real time
  for (let i = 0; i < 40 && Math.hypot(golem.vx, golem.vz) < 9; i++) await wait(100);
  const speedV = Math.hypot(golem.vx, golem.vz);
  const speed = (await sample(1.2)).ambient;
  reset();
  inp.setVirtual('fire1', true);
  await wait(1200);
  const firing = (await sample(1.0)).ambient;
  inp.setVirtual('fire1', false);
  reset();
  inp.setVirtual('ward', true);
  await wait(1200);
  const brace = (await sample(1.2)).ambient;
  inp.setVirtual('ward', false);
  inp.touchMoveX = 0;
  const p = (db) => Math.pow(10, db / 10);
  const minus = (a, b) => 10 * Math.log10(Math.max(1e-12, p(a) - p(b)));
  return { base, speedV, hum: { idle: minus(idle, base), speed: minus(speed, base), brace: minus(brace, base) }, beam: minus(firing, speed) };
});

const f = (v) => (v === null || v === undefined ? '   —  ' : (v >= 0 ? ' ' : '') + v.toFixed(1).padStart(5));
const lines = [];
lines.push('recipe              peak   M100  phone   game  trim  (dB; game = M100 with in-game vol/distance + mix trim)');
for (const r of offline.recipes.sort((a, b) => (b.game ?? -99) - (a.game ?? -99))) {
  lines.push(`${r.name.padEnd(18)} ${f(r.peak)} ${f(r.m100)} ${f(r.phone)} ${f(r.game)} ${r.trim ? (r.trim > 0 ? '+' : '') + r.trim : '    '}${r.ctx ? `   vol ${r.ctx[0]}${r.ctx[1] === null ? '' : ` @ ${r.ctx[1]} m`}` : ''}`);
}
lines.push('');
lines.push('loop (in-game vol)  peak   M100  phone  trim');
for (const l of offline.loops) lines.push(`${(l.name + ' ' + l.vol).padEnd(18)} ${f(l.peak)} ${f(l.m100)} ${f(l.phone)} ${l.trim || ''}`);
lines.push('');
lines.push(`bus gains: sfx ${offline.buses.sfx}, music ${offline.buses.music.toFixed(3)}, master ${offline.buses.master}`);
if (liveLv.error) lines.push(`live: ${liveLv.error}`);
else {
  lines.push(`live sector 1 (ctx ${liveLv.state}), K-weighted mean RMS dB   music   sfx  ambient master`);
  for (const k of ['calm', 'combat']) lines.push(`  ${k.padEnd(28)} ${f(liveLv[k].music)} ${f(liveLv[k].sfx)} ${f(liveLv[k].ambient)} ${f(liveLv[k].master)}`);
  if (golemLv) lines.push(`live golem (ambient bus, minus rain/rift baseline): rumble idle ${f(golemLv.hum.idle)} · full speed ${f(golemLv.hum.speed)} · bracing ${f(golemLv.hum.brace)} · beam ${f(golemLv.beam)} dB`);
}
// balance targets (notes/design-notes.md → "Audio mix")
const R = Object.fromEntries(offline.recipes.map((r) => [r.name, r]));
const Lp = Object.fromEntries(offline.loops.map((l) => [l.name, l]));
const checks = [];
const chk = (name, ok, info) => checks.push(`${ok ? 'PASS' : 'FAIL'} ${name}: ${info}`);
for (const sp of ['bolt', 'fireCast', 'lightning', 'blink']) {
  const d = R[sp].game - R.gunshot.game, dp = R[sp].gamePhone - R.gunshot.gamePhone;
  chk(`T1 ${sp} over rifle @14 m`, d >= 6 && dp >= 6, `${d.toFixed(1)} dB (phone ${dp.toFixed(1)} dB), need ≥ 6`);
}
chk('T2 rain bed (sector 2) under Arcane Bolt', Lp.rain.m100 <= R.bolt.game, `rain ${Lp.rain.m100.toFixed(1)} vs bolt ${R.bolt.game.toFixed(1)}`);
if (!liveLv.error) {
  const dc = liveLv.calm.music - liveLv.calm.ambient, dk = liveLv.combat.music - liveLv.combat.ambient;
  chk('T3 calm music vs ambient bed (sector 1)', Math.abs(dc) <= 4, `${dc.toFixed(1)} dB, need within ±4`);
  chk('T3 combat music over ambient bed', dk >= 3, `${dk.toFixed(1)} dB, need ≥ 3`);
  const db = R.bolt.game - liveLv.combat.music;
  chk('T3 Arcane Bolt over combat music', db >= 2, `${db.toFixed(1)} dB, need ≥ 2`);
}
chk('T4 golem beam over engine rumble', Lp.golemBeam.m100 - Lp.golemHum.m100 >= 4, `${(Lp.golemBeam.m100 - Lp.golemHum.m100).toFixed(1)} dB, need ≥ 4`);
if (golemLv) {
  chk('T4 golem beam over engine rumble at full speed (live)', golemLv.beam - golemLv.hum.speed >= 4, `${(golemLv.beam - golemLv.hum.speed).toFixed(1)} dB at ${golemLv.speedV.toFixed(1)} m/s, need ≥ 4`);
}
chk('T4 AA lock warning vs engine rumble', R.lockTone.game - Lp.golemHum.m100 >= -6, `${(R.lockTone.game - Lp.golemHum.m100).toFixed(1)} dB, need ≥ -6`);
const hot = offline.recipes.filter((r) => r.ctx && r.peak + (r.game - r.m100) > -1);
chk('T5 no in-game one-shot peaks above -1 dBFS (pre-compressor)', hot.length === 0, hot.map((r) => r.name).join(', ') || 'none');
lines.push('', `music bus trim ${offline.mixMusic > 0 ? '+' : ''}${offline.mixMusic} dB`, ...checks);
console.log(lines.join('\n'));
if (process.env.AUDIO_JSON) {
  await mkdir(join(root, 'tests/output'), { recursive: true });
  await writeFile(join(root, 'tests/output/audio-levels.json'), JSON.stringify({ offline, live: liveLv, golem: golemLv }, null, 1));
}
if (errors.length) console.log('--- page errors ---\n' + errors.join('\n'));
await browser.close();
server.close();
process.exit(errors.length || checks.some((c) => c.startsWith('FAIL')) ? 1 : 0);
