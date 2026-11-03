// Usage: node tests/audio-test.js [--quick]
// Headless Chromium checks for src/systems/audio.js via tests/audio-demo.html:
//  - safe no-op before init and with Web Audio missing
//  - every sfx / track / ambience plays with no console errors, no NaN scheduling, bounded node counts
//  - voice limits hold under spam; scheduler does not burst after a stalled main thread
//  - OfflineAudioContext renders (with the safety clipper BYPASSED) of every sfx, every track and
//    dense mixes stay below peak 1.0 and are not silent.
const { chromium } = require('playwright');
const path = require('path');
const QUICK = process.argv.includes('--quick');
const page = 'file://' + path.resolve(__dirname, 'audio-demo.html');
const fails = [], info = {};
function check(cond, msg) { if (!cond) fails.push(msg); }

(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });

  // ---- 1. No Web Audio at all: everything must no-op
  {
    const p = await b.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.addInitScript(() => { delete window.AudioContext; delete window.webkitAudioContext; delete window.OfflineAudioContext; delete window.webkitOfflineAudioContext; });
    await p.goto(page);
    const r = await p.evaluate(async () => {
      const A = MM.audio, out = { init: A.init() };
      A.music('title'); A.ambience('rain'); A.sfx('ui_move'); A.loop('broom', true); A.duck(0.5, 100); A.setVolume('music', 0.3);
      A.setIntensity(1); A.stopAll(); out.stats = A.stats(); out.ready = A.ready; out.render = await A.preview.render({ seconds: 1, music: 'title' });
      return out;
    });
    await p.click('#init');
    check(r.init === false && r.ready === false && r.render === null, 'no-WebAudio: init should return false and calls no-op ' + JSON.stringify(r));
    check(errs.length === 0, 'no-WebAudio errors: ' + errs.join(' | '));
    await p.close();
  }

  // ---- 2. Real-time engine
  const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto(page);
  const pre = await p.evaluate(() => { const A = MM.audio; A.sfx('cast_moonbolt'); A.music('village'); A.ambience('grove_night'); A.setIntensity(0); return { ready: A.ready, stats: A.stats() }; });
  check(pre.ready === false && pre.stats.state === 'uninitialized', 'pre-init state wrong ' + JSON.stringify(pre));
  await p.click('#init'); // real user gesture
  await p.waitForFunction(() => MM.audio.ready, null, { timeout: 5000 });
  await p.waitForTimeout(800);
  const st0 = await p.evaluate(() => MM.audio.stats());
  check(st0.music === 'village' && st0.ambience === 'grove_night', 'queued music/ambience should start on init ' + JSON.stringify(st0));

  let maxNodes = 0, maxPre = 0, maxPost = 0;
  async function sample() {
    const r = await p.evaluate(() => ({ s: MM.audio.stats(), m: MM.audio.meter() }));
    maxNodes = Math.max(maxNodes, r.s.nodes); maxPre = Math.max(maxPre, r.m.pre); maxPost = Math.max(maxPost, r.m.post); return r.s;
  }
  const L = await p.evaluate(() => MM.audio.list());
  info.counts = { music: L.music.length, ambience: L.ambience.length, sfx: L.sfx.length };

  // every track ~1s (with an ambience under it), every ambience, every sfx
  for (const id of L.music) {
    await p.evaluate(id => MM.audio.music(id, { fade: 0.4 }), id);
    for (let i = 0; i < (QUICK ? 3 : 5); i++) { await p.waitForTimeout(200); await sample(); }
    const s = await sample(); check(s.music === id, 'music did not switch to ' + id); check(s.tracks <= 3, 'too many track instances ' + s.tracks);
  }
  await p.evaluate(() => MM.audio.music('village', { fade: 0.4 }));
  await p.evaluate(() => MM.audio.music('village', { fade: 0.4 })); // same id: no-op
  check((await sample()).tracks <= 3, 'same-id music call stacked');
  for (const id of L.ambience) { await p.evaluate(id => MM.audio.ambience(id, { fade: 0.3 }), id); await p.waitForTimeout(QUICK ? 300 : 700); await sample(); }
  await p.evaluate(() => MM.audio.ambience('grove_night'));
  for (const id of L.sfx) { await p.evaluate(id => MM.audio.sfx(id, { pan: Math.random() * 2 - 1, rate: 0.8 + Math.random() * 0.4 }), id); await p.waitForTimeout(QUICK ? 40 : 90); await sample(); }

  // intensity layer, duck, loops, mute/volumes
  await p.evaluate(() => { const A = MM.audio; A.setIntensity(1); A.duck(0.7, 500); A.loop('broom', true, { speed: 0.9 }); A.loop('charge', true); A.setVolume('sfx', 0.5); A.applySettings({ master: 70, music: 0.5 }); });
  for (let i = 0; i < 6; i++) { await p.waitForTimeout(200); await sample(); }
  const vols = await p.evaluate(() => { const A = MM.audio; A.loop('broom', false); A.loop('charge', false); A.setIntensity(0); A.mute(true); const v = A.getVolumes(); A.mute(false); return v; });
  check(vols.master === 0.7 && vols.music === 0.5 && vols.sfx === 0.5 && vols.muted === true, 'volume API wrong ' + JSON.stringify(vols));

  // spam: 200 calls in one tick
  const spam = await p.evaluate(() => { const A = MM.audio; for (let i = 0; i < 200; i++) A.sfx('cast_moonbolt'); return { s: A.stats(), lim: A.limits('cast_moonbolt') }; });
  check((spam.s.byId.cast_moonbolt || 0) <= spam.lim.voices, 'voice limit broken (single tick): ' + JSON.stringify(spam.s.byId));
  info.spamSingleTick = spam.s.byId.cast_moonbolt;
  // sustained spam over 1.5s for several ids
  const spam2 = await p.evaluate(() => new Promise(res => {
    const A = MM.audio, ids = ['hit_enemy', 'cast_moonbolt', 'impact_ember', 'coin', 'footstep_grass'], over = [];
    let maxV = 0, maxN = 0;
    const h = setInterval(() => {
      ids.forEach(id => { for (let i = 0; i < 5; i++) A.sfx(id, { pan: Math.random() * 2 - 1 }); });
      const s = A.stats(); maxV = Math.max(maxV, s.voices); maxN = Math.max(maxN, s.nodes);
      ids.forEach(id => { if ((s.byId[id] || 0) > A.limits(id).voices) over.push(id + ':' + s.byId[id]); });
    }, 4);
    setTimeout(() => { clearInterval(h); const s = A.stats(); res({ over, maxV, maxN, stolen: s.stolen, dropped: s.dropped }); }, 1500);
  }));
  check(spam2.over.length === 0, 'voice limit broken under sustained spam: ' + spam2.over.slice(0, 5).join(','));
  check(spam2.maxN < 1400, 'node count unbounded under spam: ' + spam2.maxN);
  info.spam = spam2; maxNodes = Math.max(maxNodes, spam2.maxN);

  // stalled main thread (like a background tab waking up): no burst of catch-up notes
  await p.evaluate(() => MM.audio.music('boss', { fade: 0.2 }));
  await p.waitForTimeout(600);
  const stall = await p.evaluate(() => new Promise(res => {
    const t0 = performance.now(); while (performance.now() - t0 < 2500) { /* block */ }
    setTimeout(() => res(MM.audio.stats()), 300);
  }));
  check(stall.maxStepsPerTick <= 16, 'scheduler burst after stall: ' + stall.maxStepsPerTick + ' steps in one tick');
  check(stall.skips > 0, 'stall was not detected/skipped');
  info.stall = { maxStepsPerTick: stall.maxStepsPerTick, skips: stall.skips };

  // tidy up: stopAll fades everything
  await p.evaluate(() => MM.audio.stopAll({ fade: 0.3 }));
  await p.waitForTimeout(1800);
  const end = await sample();
  check(end.tracks === 0 && end.ambiences === 0, 'stopAll left instances: ' + JSON.stringify(end));
  check(end.bad === 0 && end.errors === 0, 'non-finite values or engine errors: bad=' + end.bad + ' errors=' + end.errors);
  check(maxNodes < 1400, 'max live nodes too high: ' + maxNodes);
  check(maxPre < 1.0 && maxPost < 1.0, 'realtime meter peak >= 1: pre ' + maxPre + ' post ' + maxPost);
  info.realtime = { maxNodes, maxPre: +maxPre.toFixed(3), maxPost: +maxPost.toFixed(3), dropped: end.dropped, stolen: end.stolen };

  // ---- 3. Offline renders with the safety clipper bypassed (honest headroom check)
  const off = await p.evaluate(async (quick) => {
    const A = MM.audio, L = A.list(), out = { sfx: {}, music: {}, mixes: {} };
    for (const id of L.sfx) out.sfx[id] = await A.preview.render({ seconds: 2.5, safety: false, sfx: [[0, id]] });
    for (const id of L.music) out.music[id] = await A.preview.render({ seconds: quick ? 6 : 10, safety: false, music: id, intensity: 1 });
    for (const id of L.ambience.filter(a => a !== 'none')) out.mixes['amb_' + id] = await A.preview.render({ seconds: 8, safety: false, ambience: id });
    const heavy = [[0, 'impact_starfall'], [0.05, 'boss_roar'], [0.1, 'hit_player'], [0.12, 'crit'], [0.2, 'impact_ember'], [0.25, 'boss_phase'], [0.3, 'cine_sting'], [0.4, 'level_up'], [0.5, 'impact_frost'], [0.6, 'victory']];
    out.mixes.boss_fight = await A.preview.render({ seconds: 6, safety: false, music: 'boss', ambience: 'crypt', loop: 'broom', sfx: heavy });
    out.mixes.combat_spam = await A.preview.render({ seconds: 4, safety: false, music: 'combat', ambience: 'rain', sfx: Array.from({ length: 40 }, (_, i) => [i * 0.08, ['hit_enemy', 'cast_moonbolt', 'impact_moonbolt', 'impact_thorn'][i % 4]]) });
    out.mixes.with_safety = await A.preview.render({ seconds: 4, music: 'boss', sfx: heavy });
    return out;
  }, QUICK);
  const summ = {};
  for (const grp of ['sfx', 'music', 'mixes']) {
    for (const [id, r] of Object.entries(off[grp])) {
      check(r && r.peak < 1.0, `${grp}/${id} peak ${r && r.peak} >= 1.0`);
      check(r && r.peak > 0.003, `${grp}/${id} is silent (peak ${r && r.peak})`);
      check(r && r.bad === 0 && r.clipped === 0, `${grp}/${id} bad=${r && r.bad} clipped=${r && r.clipped}`);
      summ[grp] = summ[grp] || { maxPeak: 0, minPeak: 9, loudest: '', quietest: '' };
      if (r.peak > summ[grp].maxPeak) { summ[grp].maxPeak = +r.peak.toFixed(3); summ[grp].loudest = id; }
      if (r.peak < summ[grp].minPeak) { summ[grp].minPeak = +r.peak.toFixed(4); summ[grp].quietest = id; }
    }
  }
  info.offline = summ;
  if (process.argv.includes('--verbose')) {
    const fmt = o => Object.entries(o).map(([k, r]) => `${k}:${r.peak.toFixed(3)}/${r.rms.toFixed(3)}`).join('  ');
    console.log('SFX peak/rms', fmt(off.sfx)); console.log('MUSIC', fmt(off.music)); console.log('MIX', fmt(off.mixes));
  }

  check(errs.length === 0, 'console errors: ' + errs.slice(0, 5).join(' | '));
  await b.close();
  console.log(JSON.stringify({ ok: fails.length === 0, fails, info }, null, 1));
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
