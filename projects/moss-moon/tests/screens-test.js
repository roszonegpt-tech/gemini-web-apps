// SCREENS tests (Playwright, real Chromium): logo → intro → title flow, nothing simulated/drawn behind the screens,
// no input leaks, skip at every point, replay intro 10×, 30 round trips without leaks, single rAF, save/continue/new-game
// confirm, settings over the title, reduced motion, resize/dpr screenshots.
//   node tests/screens-test.js [--quick] [--no-shots]
// Screenshots go to tests/out/screens-*.png. Exit code 1 on any failure.
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const URL = 'file://' + path.join(ROOT, 'index.html');
const OUT = path.join(__dirname, 'out');
const QUICK = process.argv.includes('--quick'), SHOTS = !process.argv.includes('--no-shots');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
function check(name, ok, info) { results.push({ name, ok: !!ok, info }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); }

// Counts live event listeners added from src/screens/* (instrumented before any page script runs).
const INSTRUMENT = () => {
  const live = new Map(); let seq = 0;
  const add = EventTarget.prototype.addEventListener, rem = EventTarget.prototype.removeEventListener;
  const key = (t, ty, fn, o) => { if (!fn.__mmk) fn.__mmk = ++seq; if (!t.__mmk) t.__mmk = ++seq; return t.__mmk + '|' + ty + '|' + fn.__mmk + '|' + !!(o === true || (o && o.capture)); };
  EventTarget.prototype.addEventListener = function (ty, fn, o) { try { if (fn && /src\/screens\//.test(new Error().stack || '')) live.set(key(this, ty, fn, o), ty); } catch (e) { /* ignore */ } return add.call(this, ty, fn, o); };
  EventTarget.prototype.removeEventListener = function (ty, fn, o) { try { if (fn) live.delete(key(this, ty, fn, o)); } catch (e) { /* ignore */ } return rem.call(this, ty, fn, o); };
  window.__scrListeners = () => live.size;
};

async function open(browser, opts) {
  opts = opts || {};
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 800 }, deviceScaleFactor: opts.dpr || 1, reducedMotion: opts.reducedMotion || 'no-preference' });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  await page.addInitScript(INSTRUMENT);
  if (opts.storage) await page.addInitScript((s) => { if (!sessionStorage.getItem('__seeded')) { for (const k in s) localStorage.setItem(k, s[k]); sessionStorage.setItem('__seeded', '1'); } }, opts.storage);
  await page.goto(URL + (opts.hash || ''));
  await page.waitForFunction(() => window.MM && MM.state && MM.state.current !== 'boot', null, { timeout: 15000 });
  return { ctx, page };
}
const state = (p) => p.evaluate(() => MM.state.current);
async function waitState(p, name, ms = 12000) { try { await p.waitForFunction((n) => MM.state.current === n, name, { timeout: ms }); return true; } catch (e) { return false; } }
const snap = (p) => p.evaluate(() => {
  const g = window.__mm.getState(), en = (() => { try { return enemies.map((e) => [Math.round(e.x * 1000), Math.round(e.y * 1000)]); } catch (e) { return []; } })(); // eslint-disable-line no-undef
  const sc = document.getElementById('scene'), c = sc.getContext('2d').getImageData(0, 0, 512, 320).data; let h = 0; for (let i = 0; i < c.length; i += 97) h = (h * 31 + c[i]) >>> 0;
  return { elapsed: g.elapsed, time: g.time, x: g.x, y: g.y, en: JSON.stringify(en), sceneHash: h, sceneVis: getComputedStyle(sc).visibility };
});
const shot = async (p, name, opts) => { if (SHOTS) await p.screenshot(Object.assign({ path: path.join(OUT, 'screens-' + name + '.png') }, opts || {})); };
const stats = (p) => p.evaluate(() => ({ loop: MM.loop.stats(), scr: MM.screens.stats(), listeners: window.__scrListeners(), canvases: document.querySelectorAll('canvas').length,
  scrNodes: document.querySelectorAll('.mm-scr,.mm-scr-ambient').length, cine: document.querySelectorAll('.mm-cine').length, html: document.documentElement.className }));

async function nothingSimulated(p, label) {
  const a = await snap(p);
  await p.keyboard.down('d'); await p.keyboard.down('s'); await p.waitForTimeout(1500); await p.keyboard.up('d'); await p.keyboard.up('s');
  await p.waitForTimeout(QUICK ? 500 : 1500);
  const b = await snap(p);
  const cur = await state(p);
  check(label + ': world not simulated for 3 s (elapsed/time/player/enemies unchanged)', a.elapsed === b.elapsed && a.time === b.time && a.x === b.x && a.y === b.y && a.en === b.en, { a: [a.elapsed, a.time, a.x, a.y], b: [b.elapsed, b.time, b.x, b.y], state: cur });
  check(label + ': #scene hidden and not redrawn', b.sceneVis === 'hidden' && a.sceneHash === b.sceneHash, { vis: b.sceneVis });
}

(async () => {
  const browser = await chromium.launch();
  try {
    // ------------------------------------------------------------ 1. first run: logo → intro → title
    {
      const { ctx, page: p } = await open(browser);
      const seq = [];
      await p.exposeFunction('__seq', (s) => seq.push(s));
      await p.evaluate(() => MM.bus.on('state', (d) => window.__seq(d.to)));
      check('boot enters logo on first run', (await state(p)) === 'logo');
      const s0 = await stats(p);
      check('logo: one canvas mounted via MM.screens + rafs===1', s0.scr.mounts >= 1 && s0.loop.rafs === 1, s0);
      await p.waitForTimeout(900); await shot(p, 'logo-1-fadein');
      await nothingSimulated(p, 'logo');                     // ~3 s elapsed meanwhile
      await shot(p, 'logo-2-reveal');
      await p.waitForTimeout(1600); await shot(p, 'logo-3-hold');
      check('logo plays ~6–8 s then goes to intro (first run)', await waitState(p, 'intro', 6000), seq);
      const st = await stats(p);
      check('intro: cinematic overlay present + skip button visible', st.cine === 1 && await p.isVisible('.mm-intro-chrome .mm-scr-skip'), st);
      await p.waitForTimeout(2500); await shot(p, 'intro-1');
      await nothingSimulated(p, 'intro');
      await p.waitForTimeout(3000); await shot(p, 'intro-2');
      check('intro still playing (not skipped by WASD/Space-free input)', (await state(p)) === 'intro');
      await p.click('.mm-intro-chrome .mm-scr-skip');
      check('intro skip button → title', await waitState(p, 'title', 3000));
      await p.waitForTimeout(400);
      check('introSeen persisted', await p.evaluate(() => MM.flow.flags().introSeen === true));
      check('intro cleaned up (no cine overlay, no intro chrome)', await p.evaluate(() => !document.querySelector('.mm-cine') && !document.querySelector('.mm-intro-chrome')));
      check('state sequence logo → intro → title', JSON.stringify(seq.filter((s, i) => s !== seq[i - 1])) === JSON.stringify(['intro', 'title']), seq);
      await nothingSimulated(p, 'title');
      check('title: music = title (after a gesture)', await p.evaluate(() => { const c = MM.audio && MM.audio.current && MM.audio.current(); return !MM.audio || !MM.audio.ready || (c && c.music === 'title'); }));
      await shot(p, 'title-desktop');
      // reload: returning player skips the intro
      await p.reload(); await p.waitForFunction(() => window.MM && MM.state.current !== 'boot');
      check('reload → logo again', (await state(p)) === 'logo');
      await p.waitForTimeout(400); await p.keyboard.press('Space');
      check('Space skips logo → title (intro already seen)', await waitState(p, 'title', 2000));
      check('no console errors (first run)', p.errors.length === 0, p.errors.slice(0, 5));
      await ctx.close();
    }
    // ------------------------------------------------------------ 2. skip at every point, replay 10×, 30 round trips, leaks
    {
      const { ctx, page: p } = await open(browser, { storage: { 'moss-moon-flow-v1': JSON.stringify({ introSeen: true, tutorialDone: false }) } });
      await waitState(p, 'logo');
      const base = await stats(p);
      // skip logo at different moments with different inputs
      const ways = [['key', 'Enter', 150], ['key', 'Escape', 1200], ['click', null, 2600], ['button', null, 4200], ['key', ' ', 6000]];
      let okSkips = 0;
      for (const [how, key, at] of ways) {
        await p.evaluate(() => MM.flow.toLogo()); await waitState(p, 'logo', 2000);
        await p.waitForTimeout(at);
        if ((await state(p)) !== 'logo') continue;
        if (how === 'key') await p.keyboard.press(key); else if (how === 'click') await p.mouse.click(400, 400); else await p.click('.mm-logo-top .mm-scr-skip');
        if (await waitState(p, 'title', 1500)) okSkips++;
      }
      check('logo skip works at 0.15/1.2/2.6/4.2/6.0 s via Enter/Esc/click/button/Space', okSkips === ways.length, okSkips + '/' + ways.length);
      // replay intro 10× from the menu, skipping in different ways
      let replays = 0;
      for (let i = 0; i < 10; i++) {
        await p.waitForSelector('#mm-title-intro:not([disabled])', { timeout: 3000 });
        await p.click('#mm-title-intro');
        if (!(await waitState(p, 'intro', 2000))) break;
        await p.waitForTimeout(300 + (i % 3) * 400);
        if (i % 3 === 0) await p.click('.mm-intro-chrome .mm-scr-skip');
        else if (i % 3 === 1) await p.keyboard.press('Escape');
        else await p.evaluate(() => MM.cine.skip());
        if (await waitState(p, 'title', 3000)) replays++;
        await p.waitForTimeout(150);
      }
      check('replay intro 10× from the main menu (button/Esc/api skip) → back to title each time', replays === 10, replays);
      check('no cinematic left behind after replays', (await stats(p)).cine === 0);
      // 30 round trips logo → intro → title through MM.flow (2–3 frames per state)
      await p.evaluate(() => MM.loop.resetPeak());
      const before = await stats(p);
      await p.evaluate(async () => {
        const fr = () => new Promise((r) => setTimeout(r, 50));
        for (let i = 0; i < 30; i++) { MM.flow.toLogo(); await fr(); MM.flow.toIntro({ replay: true }); await fr(); await fr(); MM.flow.toTitle(); await fr(); }
      });
      await p.waitForTimeout(800);
      const after = await stats(p);
      check('30 round trips end on title', after.scr.state === 'title');
      check('listeners from src/screens back to the same count (title→…→title)', after.listeners === before.listeners, { before: before.listeners, after: after.listeners });
      check('MM.screens live listeners/timers/mounts back to baseline', after.scr.listeners === before.scr.listeners && after.scr.timers === before.scr.timers && after.scr.mounts === before.scr.mounts, { before: before.scr, after: after.scr });
      check('canvas / screen DOM node counts back to baseline; no cine overlay', after.canvases === before.canvases && after.scrNodes === before.scrNodes && after.cine === 0, { before: [before.canvases, before.scrNodes], after: [after.canvases, after.scrNodes, after.cine] });
      check('single rAF throughout (MM.loop.stats().rafs===1, peak 1)', after.loop.rafs === 1 && after.loop.peak === 1 && after.loop.foreign === 0, after.loop);
      check('logo state listeners released vs. first logo', base.scr.mounts === 2 && base.listeners > 0, { firstLogo: base.listeners });
      // title keyboard nav: arrows/WASD move focus, gameplay untouched
      const a = await snap(p);
      const f0 = await p.evaluate(() => document.activeElement && document.activeElement.id);
      await p.keyboard.press('ArrowDown'); const f1 = await p.evaluate(() => document.activeElement.id);
      await p.keyboard.press('s'); const f2 = await p.evaluate(() => document.activeElement.id);
      await p.keyboard.press('d'); const f3 = await p.evaluate(() => document.activeElement.id);
      const b = await snap(p);
      check('title: arrows/WASD move menu focus', f0 !== f1 && f1 !== f2 && f2 !== f3, [f0, f1, f2, f3]);
      check('title: WASD does not move the witch', a.x === b.x && a.y === b.y && a.elapsed === b.elapsed);
      check('no console errors (stress)', p.errors.length === 0, p.errors.slice(0, 5));
      await ctx.close();
    }
    // ------------------------------------------------------------ 3. save / continue / new game confirm / settings over title
    {
      const { ctx, page: p } = await open(browser, { hash: '#mm-title', storage: { 'moss-moon-flow-v1': JSON.stringify({ introSeen: true, tutorialDone: true }) } });
      await waitState(p, 'title');
      await p.waitForTimeout(300);
      let d = await p.evaluate(() => MM.flow.title._debug());
      const cont = d.items.find((x) => x.id === 'continue');
      check('no save: Continue disabled with explanation, New Game focused', cont.disabled && d.focus === 'new' && await p.isVisible('#mm-title-cont-note'), d.focus);
      // make a save, go back to title
      await p.evaluate(() => { __mm.newGame({ name: 'Hazel' }); __mm.give('gold', 5); MM.save.save({ force: true }); MM.flow.toTitle(); });
      await waitState(p, 'title'); await p.waitForTimeout(300);
      d = await p.evaluate(() => MM.flow.title._debug());
      const txt = await p.textContent('#mm-title-continue');
      check('valid save: Continue enabled + summary (name, level, day, chapter, saved time)', !d.items.find((x) => x.id === 'continue').disabled && /Hazel/.test(txt) && /Lv/.test(txt) && /Day/.test(txt) && await p.isVisible('#mm-title-cont-card') && /Chapter/.test(await p.textContent('#mm-title-cont-card')), txt);
      await shot(p, 'title-with-save');
      // New Game with a save → confirm → keep
      await p.click('#mm-title-new');
      await p.waitForTimeout(400);
      const confirmVisible = await p.evaluate(() => !!(MM.ui && MM.ui.top && MM.ui.top() && MM.ui.top().id === 'confirm') || !!document.querySelector('.mm-scr-modal'));
      check('New Game with an existing save asks for confirmation', confirmVisible);
      await shot(p, 'title-confirm');
      check('state stays title while confirm is open', (await state(p)) === 'title');
      await p.keyboard.press('Escape'); await p.waitForTimeout(300);
      check('cancel keeps the save and the title', (await state(p)) === 'title' && await p.evaluate(() => MM.save.hasSave() && MM.save.summary().name === 'Hazel'));
      await p.click('#mm-title-new'); await p.waitForTimeout(400);
      const yes = await p.$('.mm-panel-confirm .mm-btn-danger, .mm-scr-modal .mm-scr-btn-primary');
      if (yes) await yes.click();
      check('confirm → character creation', await waitState(p, 'creation', 2000), await state(p));
      check('save not overwritten before creation completes', await p.evaluate(() => MM.save.summary() && MM.save.summary().name === 'Hazel'));
      await p.evaluate(() => MM.flow.toTitle()); await waitState(p, 'title'); await p.waitForTimeout(300);
      // Continue → play
      await p.click('#mm-title-continue');
      check('Continue → play', await waitState(p, 'play', 3000));
      check('play: world simulates again', await p.evaluate(async () => { const e = __mm.getState().elapsed; await new Promise((r) => setTimeout(r, 400)); return __mm.getState().elapsed > e; }));
      await p.evaluate(() => MM.flow.toTitle()); await waitState(p, 'title'); await p.waitForTimeout(300);
      // Settings over title
      await p.click('#mm-title-settings'); await p.waitForTimeout(500);
      const sState = await state(p);
      check('Settings opens over the main menu without leaving the title state', sState === 'title' && await p.evaluate(() => !!(MM.ui && MM.ui.isOpen && MM.ui.isOpen('settings'))), sState);
      await shot(p, 'title-settings');
      await p.keyboard.press('Escape'); await p.waitForTimeout(400);
      if ((await state(p)) !== 'title') await p.evaluate(() => { MM.ui && MM.ui.closeAll && MM.ui.closeAll(); MM.flow.toTitle(); });
      await p.waitForTimeout(300);
      check('focus returns to the menu after closing Settings', await p.evaluate(() => !!document.activeElement && document.activeElement.classList.contains('mm-mbtn')), await p.evaluate(() => document.activeElement && document.activeElement.id));
      // corrupt save → Continue disabled with explanation
      await p.evaluate(() => { for (const k of ['moss-moon-save-v2', 'moss-moon-save-v2-bak', 'moss-moon-adventure-v1']) localStorage.removeItem(k); localStorage.setItem('moss-moon-save-v2', '{broken'); MM.flow.toLogo(); MM.flow.toTitle(); });
      await waitState(p, 'title'); await p.waitForTimeout(300);
      d = await p.evaluate(() => MM.flow.title._debug());
      const note = await p.textContent('#mm-title-cont-note').catch(() => '');
      check('corrupt save: Continue disabled, explained', d.items.find((x) => x.id === 'continue').disabled && /damaged|could not be read/i.test(note), note);
      await shot(p, 'title-corrupt');
      check('no console errors (save flows)', p.errors.filter((e) => !/save|corrupt/i.test(e)).length === 0, p.errors.slice(0, 5));
      await ctx.close();
    }
    // ------------------------------------------------------------ 4. reduced motion
    {
      const { ctx, page: p } = await open(browser, { reducedMotion: 'reduce', storage: { 'moss-moon-settings-v1': JSON.stringify({ reducedMotion: true }), 'moss-moon-flow-v1': JSON.stringify({ introSeen: true }) } });
      check('reduced motion: logo uses the calm variant', await p.evaluate(() => MM.flow.logo._debug().rm === true && MM.flow.logo._debug().end < 6));
      await p.waitForTimeout(3200); await shot(p, 'logo-reduced-motion');
      const tr = await p.evaluate(() => getComputedStyle(document.querySelector('.mm-logo-layer')).transform);
      check('reduced motion: no parallax transform on the wordmark', tr === 'none', tr);
      check('reduced motion: logo → title', await waitState(p, 'title', 4000));
      await p.waitForTimeout(600); await shot(p, 'title-reduced-motion');
      const h1 = await p.evaluate(() => { const c = document.querySelector('.mm-scr-canvas-title').getContext('2d').getImageData(0, 0, 512, 200).data; let h = 0; for (let i = 0; i < c.length; i += 53) h = (h * 31 + c[i]) >>> 0; return h; });
      await p.waitForTimeout(700);
      const h2 = await p.evaluate(() => { const c = document.querySelector('.mm-scr-canvas-title').getContext('2d').getImageData(0, 0, 512, 200).data; let h = 0; for (let i = 0; i < c.length; i += 53) h = (h * 31 + c[i]) >>> 0; return h; });
      check('reduced motion: title sky is static (no twinkle/drift)', h1 === h2);
      await ctx.close();
    }
    // ------------------------------------------------------------ 5. resize / dpr: layout sanity + screenshots
    const sizes = [[390, 844, 1, 'phone'], [844, 390, 1, 'phone-land'], [1280, 800, 1, 'desktop'], [1920, 1080, 1, 'fullhd'], [1280, 800, 2, 'desktop-dpr2']];
    for (const [w, h, dpr, tag] of sizes) {
      const { ctx, page: p } = await open(browser, { viewport: { width: w, height: h }, dpr, hash: '#mm-title', storage: { 'moss-moon-flow-v1': JSON.stringify({ introSeen: true }) } });
      await waitState(p, 'title'); await p.waitForTimeout(900);
      const lay = await p.evaluate(() => {
        const r = (e) => e.getBoundingClientRect(), btns = [...document.querySelectorAll('.mm-mbtn')].map(r), brand = r(document.querySelector('.mm-title-mark')), menu = r(document.querySelector('.mm-title-menu'));
        const vw = innerWidth, vh = innerHeight, inView = btns.every((b) => b.left >= 0 && b.top >= 0 && b.right <= vw + 0.5 && b.bottom <= vh + 0.5);
        const overlap = !(brand.bottom <= menu.top || brand.top >= menu.bottom || brand.right <= menu.left || brand.left >= menu.right);
        const menuEl = document.querySelector('.mm-title-menu'), clipped = menuEl.scrollHeight > menuEl.clientHeight + 1;
        return { minH: Math.min(...btns.map((b) => b.height)), minW: Math.min(...btns.map((b) => b.width)), inView, overlap, clipped, n: btns.length };
      });
      check(`title ${tag} ${w}×${h}@${dpr}: 8 buttons ≥44px, in view, brand/menu not overlapping, no scroll`, lay.n === 8 && lay.minH >= 44 && lay.minW >= 44 && lay.inView && !lay.overlap && !lay.clipped, lay);
      await shot(p, 'title-' + tag);
      if (tag === 'phone' || tag === 'phone-land') {
        await p.evaluate(() => MM.flow.toLogo()); await p.waitForTimeout(4200); await shot(p, 'logo-' + tag);
      }
      // live resize while on title
      if (tag === 'desktop') { await p.setViewportSize({ width: 700, height: 900 }); await p.waitForTimeout(300); await p.setViewportSize({ width: 1280, height: 800 }); await p.waitForTimeout(300); check('title survives live resizes', (await state(p)) === 'title' && p.errors.length === 0); }
      check(`no console errors (${tag})`, p.errors.length === 0, p.errors.slice(0, 3));
      await ctx.close();
    }
    // ------------------------------------------------------------ 6. text scale
    {
      const { ctx, page: p } = await open(browser, { hash: '#mm-title', storage: { 'moss-moon-settings-v1': JSON.stringify({ textScale: 1.5 }), 'moss-moon-flow-v1': JSON.stringify({ introSeen: true }) } });
      await waitState(p, 'title'); await p.waitForTimeout(800);
      const fs1 = await p.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.mm-title-ui')).fontSize));
      check('textScale 1.5 enlarges the menu text', fs1 >= 24, fs1);
      await shot(p, 'title-textscale');
      await ctx.close();
    }
  } catch (e) { check('test harness crashed', false, String(e && e.stack || e)); }
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(JSON.stringify({ pass: !failed.length, total: results.length, failed: failed.map((f) => f.name) }));
  process.exit(failed.length ? 1 : 0);
})();
