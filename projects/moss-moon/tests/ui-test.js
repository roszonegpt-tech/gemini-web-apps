// UI agent tests — node tests/ui-test.js [index.html] [--no-shots]
// Flows: creation (look change, name validation, back-confirm) → play HUD → keyboard-only pause + every submenu →
// settings persistence → pause freezes game.elapsed → no key leakage → touch joystick (390×844 portrait, 844×390 landscape)
// moves the player → screenshots of every screen (desktop 1280×800, phone 390×844) into tests/out/ui-*.png.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const FILE = 'file://' + path.resolve(ROOT, process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'index.html');
const SHOTS = !process.argv.includes('--no-shots');
const OUT = path.join(ROOT, 'tests/out');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, info) => { results.push({ name, ok: !!ok, info }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function boot(browser, opts) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 800 } }, opts || {}));
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push('console: ' + m.text()); });
  await page.goto(FILE);
  await page.waitForFunction(() => window.MM && MM.ui && MM.ui.ready && MM.state && MM.state.current !== 'boot', null, { timeout: 15000 });
  await sleep(400);
  return { ctx, page };
}
const st = (page) => page.evaluate(() => MM.state.current);
const top = (page) => page.evaluate(() => (MM.ui.top() ? MM.ui.top().id : null));
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(OUT, 'ui-' + name + '.png') }); };
const elapsed = (page) => page.evaluate(() => window.__mm ? __mm.getState().elapsed : MM.game.player().elapsed);
// Focus a control in the top screen by visible text using only Tab presses.
async function tabTo(page, text, max = 40) {
  for (let i = 0; i < max; i++) {
    const t = await page.evaluate(() => { const a = document.activeElement; return a ? (a.getAttribute('aria-label') || a.textContent || '').trim() : ''; });
    if (t.toLowerCase().startsWith(text.toLowerCase())) return true;
    await page.keyboard.press('Tab');
  }
  return false;
}
async function startNewGame(page, name) {
  await page.evaluate((n) => {
    MM.ui.closeAll({ noSync: true });
    if (window.__mm && __mm.newGame) __mm.newGame({ name: n }); else MM.game.newGame({ name: n });
  }, name || 'Hazel');
  await page.waitForFunction(() => ['play', 'tutorial', 'cine', 'interior'].includes(MM.state.current), null, { timeout: 8000 });
  // skip any opening cinematic so we are in control
  for (let i = 0; i < 20 && (await st(page)) === 'cine'; i++) { await page.evaluate(() => MM.cine && MM.cine.skip && MM.cine.skip()); await sleep(250); }
  if ((await st(page)) !== 'play') await page.evaluate(() => MM.state.go('play'));
  await sleep(300);
}

(async () => {
  const browser = await chromium.launch();
  // ------------------------------------------------------------------ desktop flows
  const { ctx, page } = await boot(browser);
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* ignore */ } });
  check('ui ready, API present', await page.evaluate(() => ['toast', 'confirm', 'dialogue', 'open', 'close', 'isOpen', 'registerScreen', 'focusFirst', 'openSettings', 'openControls', 'openCredits'].every((k) => typeof MM.ui[k] === 'function') && MM.ui.ready === true));
  check('title screen not owned by UI (SCREENS agent)', await page.evaluate(() => !MM.ui.screens.title));
  if (await page.evaluate(() => !!(MM.loop && MM.loop.stats))) check('single rAF loop (MM.loop)', await page.evaluate(() => MM.loop.stats().rafs === 1 && MM.ui.tickDriver() === 'loop'), await page.evaluate(() => MM.loop.stats()));

  // creation
  await page.evaluate(() => (MM.flow && MM.flow.newGame ? MM.flow.newGame() : MM.ui.open('creation')));
  await page.waitForFunction(() => MM.ui.isOpen('creation'), null, { timeout: 5000 });
  check('creation opens, state creation', (await st(page)) === 'creation');
  await sleep(500);
  const previewInk = await page.evaluate(() => { const c = document.querySelector('.mm-preview-cv'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });
  check('live preview draws the witch', previewInk > 2000, previewInk);
  await page.click('.mm-swatches[aria-label="Hair"] [data-value="auburn"]');
  await page.click('.mm-style-seg [data-value="neutral"]');
  check('look change applied in creation', await page.evaluate(() => { const l = MM.ui.top()._test.look(); return l.hair === 'auburn' && l.style === 'neutral'; }));
  await page.focus('#mm-name');
  await page.keyboard.press('Enter');
  check('empty name rejected', await page.evaluate(() => document.querySelector('#mm-name').getAttribute('aria-invalid') === 'true' && MM.ui.isOpen('creation')));
  await page.keyboard.type('Abcdefghijklmnopq');
  await page.keyboard.press('Enter');
  check('17-char name rejected', await page.evaluate(() => /16/.test(document.querySelector('#mm-name-msg').textContent) && MM.ui.isOpen('creation')));
  await page.fill('#mm-name', '');
  await page.keyboard.type('Hazel Moss');
  await shot(page, 'creation-desktop');
  await page.keyboard.press('Escape');
  await sleep(200);
  check('Back with changes asks to confirm', (await top(page)) === 'confirm');
  await shot(page, 'confirm-desktop');
  await page.keyboard.press('Escape');
  await sleep(150);
  check('cancel keeps creation', (await top(page)) === 'creation');
  await page.click('[data-action="creation-confirm"]');
  await page.waitForFunction(() => ['play', 'tutorial', 'cine'].includes(MM.state.current), null, { timeout: 8000 });
  check('confirm starts the game', true, await st(page));
  check('name + look reached the game', await page.evaluate(() => MM.game.name === 'Hazel Moss' && (typeof chosenLook === 'undefined' || chosenLook.hair === 'auburn')));
  for (let i = 0; i < 20 && (await st(page)) === 'cine'; i++) { await page.evaluate(() => MM.cine && MM.cine.skip && MM.cine.skip()); await sleep(250); }
  if ((await st(page)) !== 'play') await page.evaluate(() => MM.state.go('play'));
  await sleep(500);
  check('HUD visible in play', await page.evaluate(() => !document.querySelector('.mm-layer-hud').classList.contains('mm-hidden') && !!document.querySelector('.mm-bar-hp .mm-bar-fill') && document.querySelectorAll('.mm-hotbar .mm-slot').length === 5));
  await shot(page, 'hud-desktop');

  // pause + freeze + no leakage (keyboard only)
  await page.keyboard.press('Escape');
  await sleep(200);
  check('Esc opens pause, state menu', (await top(page)) === 'pause' && (await st(page)) === 'menu');
  check('HUD hidden under menus', await page.evaluate(() => document.querySelector('.mm-layer-hud').classList.contains('mm-hidden')));
  const e0 = await elapsed(page); await sleep(500); const e1 = await elapsed(page);
  check('pause freezes game.elapsed', e0 === e1, [e0, e1]);
  const before = await page.evaluate(() => ({ x: MM.game.player().x, y: MM.game.player().y, potions: MM.game.world().potions, mounted: MM.game.player().mounted }));
  for (const k of ['d', 'h', 'b', 'e', 'ArrowRight', '1']) { await page.keyboard.down(k); await sleep(60); await page.keyboard.up(k); }
  await page.keyboard.down('a'); await sleep(300);
  const after = await page.evaluate(() => ({ x: MM.game.player().x, y: MM.game.player().y, potions: MM.game.world().potions, mounted: MM.game.player().mounted, keys: (typeof keys !== 'undefined' ? keys.size : 0) }));
  await page.keyboard.up('a');
  check('no key leakage into the game while paused', before.x === after.x && before.y === after.y && before.potions === after.potions && before.mounted === after.mounted && after.keys === 0, after);
  // every pause submenu, keyboard only
  for (const [label, id] of [['Inventory', 'inventory'], ['Equipment', 'equipment'], ['Spellbook', 'spellbook'], ['Crafting', 'crafting'], ['Quest Journal', 'journal'], ['Map', 'map'], ['Settings', 'settings'], ['Controls', 'controls']]) {
    const found = await tabTo(page, label);
    await page.keyboard.press('Enter');
    await sleep(250);
    const ok = found && (await top(page)) === id;
    await shot(page, id + '-desktop');
    // arrow navigation moves focus inside the screen
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowRight');
    const inside = await page.evaluate(() => MM.ui.top().el.contains(document.activeElement));
    await page.keyboard.press('Escape');
    await sleep(200);
    check('keyboard open/close ' + id, ok && inside && (await top(page)) === 'pause', { found, inside });
  }
  // book tabs cycle with Q/E
  await tabTo(page, 'Inventory'); await page.keyboard.press('Enter'); await sleep(150);
  await page.keyboard.press('e'); await sleep(150);
  check('E cycles book tab inventory → equipment', (await top(page)) === 'equipment');
  await page.keyboard.press('Escape'); await sleep(150);
  // Tab focus trap stays inside pause
  let trapped = true;
  for (let i = 0; i < 25; i++) { await page.keyboard.press('Tab'); if (!(await page.evaluate(() => MM.ui.top().el.contains(document.activeElement)))) trapped = false; }
  check('Tab focus is trapped in the modal', trapped);
  check('visible focus ring', await page.evaluate(() => { const a = document.activeElement; const cs = getComputedStyle(a); return cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2; }));

  // settings change persists (keyboard): Accessibility tab → Text size Large
  await tabTo(page, 'Settings'); await page.keyboard.press('Enter'); await sleep(200);
  await page.keyboard.press('e'); await page.keyboard.press('e'); await sleep(150); // audio → graphics → access
  const foundLarge = await tabTo(page, 'Large');
  await page.keyboard.press('Enter'); await sleep(150);
  check('text scale applied live', foundLarge && (await page.evaluate(() => getComputedStyle(document.getElementById('mm-ui')).getPropertyValue('--mm-ts').trim())) === '1.15');
  await shot(page, 'settings-access-desktop');
  await page.keyboard.press('e'); await sleep(150);
  await shot(page, 'settings-game-desktop');
  await page.keyboard.press('Escape'); await sleep(100);
  // resume restores sim + input
  await page.keyboard.press('Escape'); await sleep(250);
  check('Esc resumes to play', (await st(page)) === 'play' && !(await page.evaluate(() => MM.ui.isOpen())));
  const r0 = await elapsed(page); await sleep(400); const r1 = await elapsed(page);
  check('resume restores sim', r1 > r0, [r0, r1]);
  const x0 = await page.evaluate(() => MM.game.player().x + MM.game.player().y);
  await page.keyboard.down('d'); await sleep(500); await page.keyboard.up('d');
  const x1 = await page.evaluate(() => MM.game.player().x + MM.game.player().y);
  check('gameplay keys restored after resume', Math.abs(x1 - x0) > 0.05, [x0, x1]);
  // other screens via API (screenshots)
  await page.evaluate(() => MM.ui.open('travel')); await sleep(250); await shot(page, 'travel-desktop'); await page.keyboard.press('Escape');
  await page.evaluate(() => MM.ui.open('shop', { npc: 'pip' })); await sleep(250); await shot(page, 'shop-desktop');
  check('shop opens with stock', await page.evaluate(() => document.querySelectorAll('[data-screen="shop"] .mm-row').length > 0));
  await page.keyboard.press('Escape'); await sleep(150);
  const dlg = page.evaluate(() => MM.ui.dialogue({ speaker: 'Elder Marrow', pages: [{ text: 'The Moonwell remembers your grandmother. It will remember you, too.' }, { text: 'Will you help?', choices: [{ label: 'Of course.', action: 'yes' }, { label: 'Tell me more first.', action: 'more' }] }] }));
  await sleep(1200); await shot(page, 'dialogue-desktop');
  await page.keyboard.press('Space'); await sleep(150); await page.keyboard.press('Space'); await sleep(900);
  await page.keyboard.press('Enter');
  check('dialogue: typewriter skip, pages, choice resolves', (await dlg) === 'yes');
  await page.evaluate(() => MM.ui.open('dungeonSummary', { data: { region: 'forest', time: 312, kills: 14, xp: 120, gold: 64, boss: 'Bramble Warden', fragment: true, loot: [{ id: 'potion', name: 'Moon Tonic', count: 2 }, { id: 'rune', name: 'Rune Stone', count: 1 }] } })); await sleep(250); await shot(page, 'dungeon-summary-desktop'); await page.keyboard.press('Enter'); await sleep(150);
  await page.evaluate(() => MM.ui.open('memories')); await sleep(200); await shot(page, 'memories-desktop'); await page.keyboard.press('Escape'); await sleep(100);
  await page.evaluate(() => MM.ui.open('credits')); await sleep(200); await shot(page, 'credits-desktop'); await page.keyboard.press('Escape'); await sleep(100);
  await page.evaluate(() => MM.ui.toast('Lunar Fragment recovered!', 'story')); await sleep(200);
  await page.evaluate(() => MM.ui.showLoading(true, { region: 'swamp' })); await sleep(300); await shot(page, 'loading-desktop'); await page.evaluate(() => MM.ui.showLoading(false));
  await page.evaluate(() => MM.state.go('defeat', { region: 'forest', goldLoss: 12 })); await sleep(300);
  check('defeat screen on state defeat', (await top(page)) === 'defeat');
  await shot(page, 'defeat-desktop');
  await page.click('[data-action="defeat-home"]'); await sleep(400);
  check('defeat → wake at homestead returns to play', (await st(page)) === 'play');
  await page.evaluate(() => MM.state.go('ending')); await sleep(400);
  check('campaign complete on state ending', (await top(page)) === 'campaignComplete');
  await shot(page, 'ending-desktop');
  await page.click('[data-action="ending-continue"]'); await sleep(300);
  check('Continue Playing returns to play', (await st(page)) === 'play');
  // persisted setting survives reload
  await page.reload();
  await page.waitForFunction(() => window.MM && MM.ui && MM.ui.ready, null, { timeout: 15000 });
  check('settings persist across reload', await page.evaluate(() => Number(MM.settings.get('textScale')) === 1.15));
  check('no console errors (desktop)', page.errors.length === 0, page.errors.slice(0, 5));
  await ctx.close();

  // ------------------------------------------------------------------ touch: joystick drives the player
  async function touchRun(vp, tag) {
    const { ctx: c2, page: p2 } = await boot(browser, { viewport: vp, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await p2.evaluate(() => MM.settings.set('textScale', 1));
    await p2.evaluate(() => (MM.flow && MM.flow.newGame ? MM.flow.newGame() : MM.ui.open('creation')));
    await sleep(600);
    await shot(p2, 'creation-' + tag);
    await startNewGame(p2, 'Wren');
    await sleep(400);
    const vis = await p2.evaluate(() => { const L = document.querySelector('.mm-layer-touch'); return !!L && getComputedStyle(L).display !== 'none' && !L.classList.contains('mm-hidden'); });
    check(tag + ': joystick + action cluster visible on touch', vis);
    check(tag + ': no d-pad buttons', await p2.evaluate(() => document.querySelectorAll('#mm-ui [data-dir]').length === 0));
    const btnSizes = await p2.evaluate(() => Array.from(document.querySelectorAll('.mm-tbtn')).map((b) => Math.min(b.getBoundingClientRect().width, b.getBoundingClientRect().height)));
    check(tag + ': touch buttons ≥ 44px', btnSizes.length >= 6 && btnSizes.every((s) => s >= 44), btnSizes);
    await shot(p2, 'hud-' + tag);
    const pos0 = await p2.evaluate(() => ({ x: MM.game.player().x, y: MM.game.player().y }));
    const zone = await p2.evaluate(() => { const r = document.querySelector('.mm-joy').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 }; });
    const cdp = await c2.newCDPSession(p2);
    const tp = (x, y) => [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(zone.x, zone.y) });
    for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(zone.x + (zone.r * 0.9 * i) / 8, zone.y) }); await sleep(30); }
    // a second finger taps Cast while the stick is held (multi-touch)
    const cast = await p2.evaluate(() => { const r = document.querySelector('.mm-tbtn-cast').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [...tp(zone.x + zone.r * 0.9, zone.y), { x: cast.x, y: cast.y, id: 2, radiusX: 4, radiusY: 4, force: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: tp(zone.x + zone.r * 0.9, zone.y) });
    await sleep(700);
    await shot(p2, 'joystick-' + tag);
    const held = await p2.evaluate(() => ({ active: MM.ui.joystick.active, out: MM.ui.joystick.out, axis: MM.input.axis || null }));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(300);
    const pos1 = await p2.evaluate(() => ({ x: MM.game.player().x, y: MM.game.player().y }));
    const moved = Math.hypot(pos1.x - pos0.x, pos1.y - pos0.y);
    check(tag + ': joystick drag moves the player (screen-right)', held.active && held.out.x > 0.6 && moved > 0.3 && (pos1.x - pos0.x) > 0, { moved: +moved.toFixed(2), held });
    const rel = await p2.evaluate(() => ({ active: MM.ui.joystick.active, out: MM.ui.joystick.out }));
    check(tag + ': release recentres the stick', !rel.active && rel.out.x === 0 && rel.out.y === 0, rel);
    // touch pause button opens the pause menu, joystick hides
    const pb = await p2.evaluate(() => { const r = document.querySelector('.mm-tbtn-pause').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await p2.touchscreen.tap(pb.x, pb.y); await sleep(300);
    check(tag + ': touch Pause opens menu and hides joystick', (await top(p2)) === 'pause' && (await p2.evaluate(() => document.querySelector('.mm-layer-touch').classList.contains('mm-hidden'))));
    await shot(p2, 'pause-' + tag);
    for (const id of ['inventory', 'equipment', 'spellbook', 'crafting', 'journal', 'map', 'settings', 'controls', 'shop', 'travel']) {
      await p2.evaluate((i) => MM.ui.open(i, { npc: 'pip' }), id); await sleep(250); await shot(p2, id + '-' + tag);
      await p2.evaluate(() => MM.ui.close()); await sleep(80);
    }
    await p2.evaluate(() => { MM.ui.open('settings'); }); await sleep(120);
    await p2.evaluate(() => { const t = document.querySelector('[data-screen="settings"] [data-tab="game"]'); t && t.click(); }); await sleep(200); await shot(p2, 'settings-game-' + tag);
    await p2.evaluate(() => MM.ui.closeAll()); await sleep(150);
    const d = p2.evaluate(() => MM.ui.dialogue({ speaker: 'Pip', pages: [{ text: 'Seeds, tonics and shiny things! What can I get you?', choices: [{ label: 'Show me your wares', action: 'shop' }, { label: 'Just looking', action: 'bye' }] }] }));
    await sleep(1600); await shot(p2, 'dialogue-' + tag); await p2.evaluate(() => MM.ui.close()); await d;
    await p2.evaluate(() => MM.state.go('defeat', { region: 'swamp', goldLoss: 9 })); await sleep(300); await shot(p2, 'defeat-' + tag);
    await p2.evaluate(() => MM.game.respawnHome && MM.game.respawnHome()); await sleep(300);
    await p2.evaluate(() => MM.state.go('ending')); await sleep(300); await shot(p2, 'ending-' + tag);
    check(tag + ': no console errors', p2.errors.length === 0, p2.errors.slice(0, 5));
    await c2.close();
  }
  await touchRun({ width: 390, height: 844 }, 'phone');
  await touchRun({ width: 844, height: 390 }, 'landscape');

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(JSON.stringify({ pass: !failed.length, total: results.length, failed: failed.map((f) => f.name) }));
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
