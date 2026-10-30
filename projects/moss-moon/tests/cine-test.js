// Cinematics test: node tests/cine-test.js  (Playwright/Chromium headless)
// Plays every scene at accelerated speed, checks skip/queue/force/video-fallback paths, DOM/listener cleanup,
// layering, subtitles, reduced motion, and writes 3 screenshots per scene to tests/out/cine-<id>-{start,mid,end}.png.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
const PAGE = 'file://' + path.join(__dirname, 'cine-demo.html');
let fails = 0; const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };

(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1100, height: 760 } });
  const errors = [];
  p.on('pageerror', e => errors.push('pageerror: ' + e.message));
  // the deliberately missing test video logs a resource 404; that one is expected
  p.on('console', m => { if (m.type() === 'error' && !String(m.location().url).includes('__does_not_exist__')) errors.push('console: ' + m.text() + ' @ ' + m.location().url); });
  await p.goto(PAGE); await p.waitForTimeout(500);

  // stub bus + audio so we can observe calls
  await p.evaluate(() => {
    const ev = window.__events = [], calls = window.__audio = [];
    MM.bus = { on() { }, emit(n, d) { ev.push([n, d]); } };
    MM.audio = { music: (...a) => calls.push(['music', ...a]), sfx: (...a) => calls.push(['sfx', ...a]), duck: (...a) => calls.push(['duck', ...a]), getVolumes: () => ({ master: 1, cine: .8 }) };
    window.__snap = () => ({ listeners: __listenerCount(), nodes: document.getElementsByTagName('*').length, overlay: !!document.querySelector('.mm-cine'), style: !!document.querySelector('style[data-mm-cine]') });
  });
  const base = await p.evaluate(() => __snap());
  const clean = async label => { const s = await p.evaluate(() => __snap()); ok(!s.overlay && !s.style && s.nodes === base.nodes && s.listeners === base.listeners, `${label}: cleaned up (nodes ${s.nodes}/${base.nodes}, listeners ${s.listeners}/${base.listeners})`); if (s.listeners !== base.listeners) console.log(JSON.stringify(await p.evaluate(() => __listenerTypes()))); };

  const scenes = await p.evaluate(() => MM.cine.list());
  ok(scenes.length >= 8 && ['intro', 'first_restoration', 'boss_forest_intro', 'boss_swamp_intro', 'boss_frost_intro', 'final_fragment', 'ending', 'defeat_recover'].every(id => scenes.some(s => s.id === id)), `manifest lists ${scenes.length} scenes`);
  ok(scenes.every(s => s.engine && !s.hasVideo && s.rewardKey), 'every shipped scene has an engine scene, no listed videos, a rewardKey');

  // 1) every scene: 3 screenshots, then play to the end at accelerated speed
  for (const s of scenes) {
    await p.evaluate(id => { window.__res = null; MM.cine.setTimeScale(1); MM.cine.play(id).then(r => window.__res = r); MM.cine.pause(); }, s.id);
    await p.waitForTimeout(200);
    if (s.id === 'intro') {
      const lay = await p.evaluate(() => { const r = document.querySelector('.mm-cine-stage').getBoundingClientRect(), w = document.querySelector('.canvas-wrap').getBoundingClientRect(), root = document.querySelector('.mm-cine'); return { ratio: r.width / r.height, inside: r.left >= w.left - 1 && r.right <= w.right + 1, z: getComputedStyle(root).zIndex, parent: root.parentElement.className, hudOnTop: document.elementFromPoint(w.left + 30, w.top + 18)?.id === 'hud' }; });
      ok(Math.abs(lay.ratio - 1.6) < .01 && lay.inside && lay.parent === 'canvas-wrap', `overlay is 8:5 inside .canvas-wrap (ratio ${lay.ratio.toFixed(3)})`);
      ok(+lay.z < 100 && lay.hudOnTop, `overlay z-index ${lay.z} stays below DOM UI (z>=100 element still on top)`);
    }
    const d = s.duration;
    for (const [tag, f] of [['start', .12], ['mid', .5], ['end', .88]]) {
      await p.evaluate(t => MM.cine.seek(t), d * f); await p.waitForTimeout(100);
      await (await p.$('.canvas-wrap')).screenshot({ path: path.join(OUT, `cine-${s.id}-${tag}.png`) });
    }
    const t0 = Date.now();
    await p.evaluate(() => { MM.cine.seek(0); MM.cine.setTimeScale(12); MM.cine.resume(); });
    await p.waitForFunction(() => window.__res, null, { timeout: 20000 }).catch(() => { });
    const r = await p.evaluate(() => window.__res);
    ok(r && r.id === s.id && r.skipped === false && r.completed === true && r.usedFallback === false && r.playback === 'engine', `${s.id}: completed (skipped:false) in ${Date.now() - t0}ms → ${JSON.stringify(r)}`);
    await clean(s.id);
  }
  await p.evaluate(() => MM.cine.setTimeScale(1));

  // 2) skip paths resolve skipped:true within 1s
  for (const how of ['escape', 'space-twice', 'button', 'hold-space', 'api']) {
    await p.evaluate(() => { window.__res = null; window.__t = 0; MM.cine.play('intro', { onEnd: r => window.__onEnd = r }).then(r => { window.__res = r; window.__t = performance.now(); }); });
    await p.waitForTimeout(600);
    const t0 = await p.evaluate(() => performance.now());
    if (how === 'escape') await p.keyboard.press('Escape');
    if (how === 'space-twice') { await p.keyboard.press('Space'); await p.waitForTimeout(250); ok(await p.evaluate(() => document.querySelector('.mm-cine-skip').classList.contains('on')), 'first Space reveals "Skip ▸"'); await p.keyboard.press('Space'); }
    if (how === 'button') { await p.mouse.move(400, 300); await p.mouse.move(420, 310); await p.waitForTimeout(150); await p.click('.mm-cine-skip'); }
    if (how === 'hold-space') { await p.keyboard.down('Space'); await p.waitForTimeout(950); await p.keyboard.up('Space'); }
    if (how === 'api') await p.evaluate(() => MM.cine.skip());
    await p.waitForFunction(() => window.__res, null, { timeout: 3000 }).catch(() => { });
    const { r, t, onEnd } = await p.evaluate(() => ({ r: window.__res, t: window.__t, onEnd: window.__onEnd }));
    const ms = t - t0 - (how === 'hold-space' ? 700 : 0) - (how === 'space-twice' ? 250 : 0);
    ok(r && r.skipped === true && r.completed === true && r.rewardKey === 'cine.intro.seen' && onEnd && onEnd.skipped, `skip via ${how}: skipped:true, onEnd called, resolved ${Math.round(ms)}ms after input`);
    ok(ms < 1000, `skip via ${how} within 1s`);
    await clean('skip ' + how);
  }

  // 3) queueing, rejection, force-interrupt, unknown id
  const q = await p.evaluate(async () => {
    MM.cine.setTimeScale(20); const order = [];
    const a = MM.cine.play('boss_forest_intro').then(r => (order.push('a'), r));
    const bq = MM.cine.play('boss_swamp_intro').then(r => (order.push('b'), r));
    const rej = await MM.cine.play('defeat_recover', { queue: false });
    const unk = await MM.cine.play('nope');
    const [ra, rb] = await Promise.all([a, bq]); MM.cine.setTimeScale(1);
    return { order, ra, rb, rej, unk };
  });
  ok(q.order.join() === 'a,b' && !q.ra.skipped && !q.rb.skipped, 'second play() while playing is queued and runs after the first');
  ok(q.rej.completed === false && q.rej.reason === 'busy', 'play(..., {queue:false}) while busy resolves cleanly with reason "busy"');
  ok(q.unk.completed === false && q.unk.reason === 'unknown-scene', 'unknown scene resolves (no throw)');
  const f = await p.evaluate(async () => { const a = MM.cine.play('ending'); await new Promise(r => setTimeout(r, 300)); MM.cine.setTimeScale(20); const bb = MM.cine.play('defeat_recover', { force: true }); const ra = await a, rb = await bb; MM.cine.setTimeScale(1); return { ra, rb }; });
  ok(f.ra.skipped === true && f.ra.reason === 'interrupted' && f.rb.completed && !f.rb.skipped, 'force:true interrupts the current scene (skipped:true, reason interrupted) then plays');
  await clean('queue/force');

  // 4) video paths (test-only manifest entries; never shipped)
  const vid = await p.evaluate(async () => {
    const M = MM.CINE_MANIFEST, base = Object.assign({}, M.first_restoration, { playback: 'video', fallback: 'first_restoration' });
    M.__test_missing = Object.assign({}, base, { id: '__test_missing', video: { webm: 'assets/video/__does_not_exist__.webm', mp4: 'assets/video/__does_not_exist__.mp4' } });
    MM.cine.setTimeScale(20);
    const missing = await MM.cine.play('__test_missing');
    // autoplay blocked
    const realPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () { return Promise.reject(new DOMException('blocked', 'NotAllowedError')); };
    M.__test_blocked = Object.assign({}, base, { id: '__test_blocked', video: { webm: 'data:video/webm;base64,AAAA' } });
    const blocked = await MM.cine.play('__test_blocked');
    HTMLMediaElement.prototype.play = realPlay;
    // a real (generated) webm: record 1.2s of an animated canvas
    let real = null, audioCalls = null;
    try {
      const c = document.createElement('canvas'); c.width = 160; c.height = 100; const g = c.getContext('2d');
      const rec = new MediaRecorder(c.captureStream(30), { mimeType: 'video/webm' }), chunks = []; rec.ondataavailable = e => chunks.push(e.data);
      let k = 0; const iv = setInterval(() => { g.fillStyle = `hsl(${k++ * 9},60%,40%)`; g.fillRect(0, 0, 160, 100); }, 33);
      rec.start(); await new Promise(r => setTimeout(r, 1200)); rec.stop(); await new Promise(r => rec.onstop = r); clearInterval(iv);
      const url = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }));
      M.__test_real = Object.assign({}, base, { id: '__test_real', video: { webm: url } });
      MM.cine.setTimeScale(1); __audio.length = 0;
      real = await MM.cine.play('__test_real'); audioCalls = __audio.slice();
    } catch (e) { real = { error: String(e) }; }
    MM.cine.setTimeScale(1); delete M.__test_missing; delete M.__test_blocked; delete M.__test_real;
    return { missing, blocked, real, audioCalls };
  });
  ok(vid.missing.usedFallback === true && vid.missing.skipped === false && vid.missing.completed && vid.missing.playback === 'engine', `missing video file → engine fallback (${vid.missing.fallbackReason})`);
  ok(vid.blocked.usedFallback === true && vid.blocked.fallbackReason === 'autoplay-blocked', 'autoplay-blocked video → engine fallback');
  ok(vid.real && vid.real.playback === 'video' && vid.real.usedFallback === false && vid.real.skipped === false, `real webm plays as video → ${JSON.stringify(vid.real)}`);
  ok(vid.audioCalls && vid.audioCalls.some(c => c[0] === 'duck' && c[1] > 0) && vid.audioCalls.some(c => c[0] === 'duck' && c[1] === 0 && c[2] === 0), 'video ducks game audio and releases the duck on end');
  await clean('video');

  // 5) bus events, audio cues, subtitles toggle, reduced motion, body fallback host
  const misc = await p.evaluate(async () => {
    __events.length = 0; __audio.length = 0; MM.cine.setTimeScale(20);
    await MM.cine.play('boss_frost_intro');
    const ev = __events.map(e => e[0]), au = __audio.map(a => a[0] + ':' + a[1]);
    MM.cine.setSubtitles(false); MM.cine.setTimeScale(1); MM.cine.play('first_restoration'); await new Promise(r => setTimeout(r, 1500));
    const subHidden = document.querySelector('.mm-cine-sub').hidden; MM.cine.skip(); await new Promise(r => setTimeout(r, 400)); MM.cine.setSubtitles(true);
    const wrap = document.querySelector('.canvas-wrap'); wrap.className = 'x-wrap';
    MM.cine.play('defeat_recover'); await new Promise(r => setTimeout(r, 300));
    const st = document.querySelector('.mm-cine-stage').getBoundingClientRect(), root = document.querySelector('.mm-cine');
    const body = { fixed: root.classList.contains('mm-fixed') && root.parentElement === document.body, ratio: st.width / st.height, w: st.width, h: st.height };
    MM.cine.skip(); await new Promise(r => setTimeout(r, 400)); wrap.className = 'canvas-wrap';
    return { ev, au, subHidden, body };
  });
  ok(misc.ev[0] === 'cine:start' && misc.ev.includes('cine:end'), `bus events: ${misc.ev.join(', ')}`);
  ok(misc.au.includes('music:cine_sorrow') && misc.au.includes('sfx:boss_roar') && misc.au.includes('sfx:cine_sting'), `audio cues fired: ${misc.au.join(', ')}`);
  ok(misc.subHidden === true, 'setSubtitles(false) hides the subtitle layer');
  ok(misc.body.fixed && Math.abs(misc.body.ratio - 1.6) < .01, `no .canvas-wrap → fixed overlay on body, letterboxed 8:5 (${Math.round(misc.body.w)}×${Math.round(misc.body.h)})`);
  await p.evaluate(async () => { MM.cine.setReducedMotion(true); MM.cine.setTimeScale(1); MM.cine.play('boss_forest_intro'); MM.cine.pause(); MM.cine.seek(5); });
  await p.waitForTimeout(150); await (await p.$('.canvas-wrap')).screenshot({ path: path.join(OUT, 'cine-reduced-motion-boss_forest_intro.png') });
  const rm = await p.evaluate(async () => { const c = MM.cine.current(); MM.cine.setTimeScale(30); MM.cine.resume(); const r = await new Promise(res => { const iv = setInterval(() => { if (!MM.cine.isPlaying()) { clearInterval(iv); res(true); } }, 50); }); MM.cine.setReducedMotion(false); MM.cine.setTimeScale(1); return { c, r }; });
  ok(rm.c && rm.c.paused && rm.r, 'reduced-motion playback + pause/current()/resume work');
  await p.waitForTimeout(400); await clean('misc');
  ok(await p.evaluate(() => MM.cine.lastError === null), 'no internal render errors (MM.cine.lastError null)');
  ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await b.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
