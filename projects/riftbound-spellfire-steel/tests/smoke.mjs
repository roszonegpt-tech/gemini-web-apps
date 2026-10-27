// Headless smoke test (Playwright + Chromium/SwiftShader).
//   node tests/smoke.mjs            → serves the project, loads index.html, drives the game
//   SMOKE_TARGET=dist node tests/smoke.mjs → tests the standalone dist/index.html instead
// Fails (exit 1) on any console error / page error. Screenshots go to tests/output/.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
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
const out = join(root, 'tests/output');
await mkdir(out, { recursive: true });
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
const port = server.address().port;
const target = process.env.SMOKE_TARGET === 'dist' ? 'dist/index.html' : 'index.html';
const only = process.env.SMOKE_ONLY || '';

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
const warnings = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
  else if (m.type() === 'warning') warnings.push(m.text());
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

const results = [];
const step = async (name, fn) => {
  if (only && !name.includes(only)) return;
  const t0 = Date.now();
  try {
    await fn();
    results.push(`PASS ${name} (${Date.now() - t0} ms)`);
  } catch (err) {
    results.push(`FAIL ${name}: ${err.message}`);
    errors.push(`${name}: ${err.message}`);
  }
};
const wait = (ms) => page.waitForTimeout(ms);
const shot = (name) => page.screenshot({ path: join(out, `${name}.png`) });
const game = (fn, arg) => page.evaluate(fn, arg);

await page.goto(`http://localhost:${port}/${target}`);
await page.waitForFunction(() => !!window.riftbound, null, { timeout: 20000 });

await step('title screen renders', async () => {
  await wait(2500);
  const ok = await page.isVisible('text=Play Campaign');
  if (!ok) throw new Error('title menu missing');
  await shot('01-title');
});

await step('keyboard menu navigation', async () => {
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  const focused = await game(() => document.activeElement && document.activeElement.textContent);
  if (!/Grimoire/.test(focused || '')) throw new Error(`focus landed on ${focused}`);
  await page.keyboard.press('Enter');
  await wait(400);
  if (!(await page.isVisible('text=Grimoire Upgrade Sanctum'))) throw new Error('sanctum not shown');
  await shot('02-sanctum');
  await page.keyboard.press('Escape');
  await wait(300);
});

await step('settings screen', async () => {
  await game(() => window.riftbound.ui.go('settings', 'title'));
  await wait(300);
  await shot('03-settings');
  await game(() => window.riftbound.ui.go('title'));
});

await step('campaign → briefing', async () => {
  await game(() => { window.riftbound.services.save.campaign.introSeen = true; window.riftbound.uiAction('playCampaign'); });
  await wait(400);
  await shot('04-campaign');
  await game(() => window.riftbound.ui.go('briefing', 0));
  await wait(500);
  await shot('05-briefing');
});

for (let s = 0; s < 4; s++) {
  await step(`sector ${s + 1} loads and plays`, async () => {
    await game((n) => window.riftbound.uiAction('deploy', n), s);
    await wait(2500);
    await shot(`1${s}-sector${s + 1}-start`);
    // walk right while firing for a few seconds
    await page.mouse.move(900, 330);
    await page.keyboard.down('KeyD');
    await page.mouse.down();
    await wait(1800);
    await page.mouse.up();
    await page.keyboard.up('KeyD');
    await page.mouse.click(900, 330, { button: 'right' });
    await page.keyboard.press('Space');
    await page.keyboard.down('ShiftLeft');
    await wait(500);
    await page.keyboard.up('ShiftLeft');
    await page.keyboard.press('KeyQ');
    await wait(1200);
    await shot(`1${s}-sector${s + 1}-combat`);
    const st = await game(() => {
      const w = window.riftbound.currentWorld();
      return w ? { actors: w.actors.length, shots: w.stats.shotsFired, zone: w.activeZone, hp: w.player.hp } : null;
    });
    if (!st) throw new Error('no world');
    if (st.shots < 1) throw new Error('casting did not fire');
  });
}

await step('dev console + complete zones to victory (sector 1)', async () => {
  await game(() => window.riftbound.uiAction('deploy', 0));
  await wait(1500);
  for (let z = 0; z < 3; z++) {
    await game(() => { window.riftbound.services.dev.god = true; window.riftbound.devAction('completeZone'); });
    await wait(800);
    // teleport to the next checkpoint
    await game(() => {
      const w = window.riftbound.currentWorld();
      const next = w.level.zones[w.activeZone + 1];
      if (next) { w.player.x = next.checkpoint[0]; w.player.z = next.checkpoint[1]; }
      else if (w.exitPortal) { w.player.x = w.exitPortal.x; w.player.z = w.exitPortal.z + 0.6; }
    });
    await wait(700);
  }
  await wait(3500);
  const scr = await game(() => window.riftbound.ui.current);
  await shot('20-results');
  if (scr !== 'results') throw new Error(`expected results screen, got ${scr}`);
  const save = await game(() => window.riftbound.services.save.campaign);
  if (!save.completed[0] || save.unlocked < 2) throw new Error('save not updated');
});

await step('ward absorbs 80% of bullet damage + save persists', async () => {
  const r = await game(() => {
    const g = window.riftbound;
    g.services.dev.god = false;
    g.uiAction('deploy', 0);
    const w = g.currentWorld();
    const p = w.player;
    p.invuln = 0;
    const hp0 = p.hp;
    p.wardUp = true; p.wardUpT = 1; p.ward = p.wardMax;
    p.damage({ amount: 10, type: 'bullet' });
    const warded = hp0 - p.hp;
    const ward = p.ward;
    p.wardUp = false;
    const hp1 = p.hp;
    p.damage({ amount: 10, type: 'bullet' });
    return { warded, open: hp1 - p.hp, ward, stored: !!localStorage.getItem('riftbound.save.v1') };
  });
  if (Math.abs(r.warded - 2) > 0.01) throw new Error(`ward let through ${r.warded}`);
  if (Math.abs(r.open - 10) > 0.01) throw new Error(`unwarded hit ${r.open}`);
  if (!(r.ward < 100)) throw new Error('ward gauge did not drain');
  if (!r.stored) throw new Error('save not in localStorage');
});

await step('pause menu + checkpoint restart', async () => {
  await game(() => window.riftbound.uiAction('deploy', 1));
  await wait(1500);
  await page.keyboard.press('Escape');
  await wait(400);
  if (!(await page.isVisible('text=Restart from Checkpoint'))) throw new Error('pause menu missing');
  await shot('21-pause');
  await page.click('text=Restart from Checkpoint');
  await wait(1200);
});

await step('boss fight completes (sector 4)', async () => {
  await game(() => window.riftbound.uiAction('deploy', 3));
  await wait(1200);
  await game(() => { window.riftbound.services.dev.god = true; window.riftbound.devAction('completeZone'); });
  await wait(600);
  await game(() => { const w = window.riftbound.currentWorld(); const n = w.level.zones[1]; w.player.x = n.checkpoint[0]; w.player.z = n.checkpoint[1]; });
  await wait(3000);
  await shot('30-boss-intro');
  await page.keyboard.down('Space');
  await wait(900);
  await page.keyboard.up('Space');
  await wait(2500);
  await shot('31-boss-fight');
  await game(() => window.riftbound.devAction('killAll'));
  await wait(2600);
  await shot('32-vance');
  await game(() => window.riftbound.devAction('killAll'));
  await wait(4000);
  await shot('33-ending');
  await page.keyboard.down('Space');
  await wait(1200);
  await page.keyboard.up('Space');
  await wait(800);
  const scr = await game(() => window.riftbound.ui.current);
  await shot('34-final-results');
  if (scr !== 'results') throw new Error(`expected results after boss, got ${scr}`);
});

await step('v1.1: golem flight segment installed in sector 2 + mount works', async () => {
  await game(() => { window.riftbound.services.dev.god = true; window.riftbound.uiAction('deploy', 1); });
  await wait(1500);
  const r = await game(() => {
    const w = window.riftbound.currentWorld();
    const golem = w.actors.find((a) => a.kind === 'arcaneGolem');
    const shrine = w.interactables.find((i) => i.kind === 'golemShrine');
    golem.mount(w.player);
    return { towers: w.actors.filter((a) => a.kind === 'aaTower').length, obj: w.objectives.zones[1].objs.some((o) => o.data.id === 'aa'), shrine: !!shrine, mounted: w.player.mounted, focus: w.cameraFocus === golem };
  });
  if (!(r.towers === 4 && r.obj && r.shrine && r.mounted && r.focus)) throw new Error(JSON.stringify(r));
  await page.keyboard.down('KeyS');
  await wait(1500);
  await page.keyboard.up('KeyS');
  await shot('50-golem');
});

await step('v1.2: golem swept collision at dash speed (corridor + tall geometry)', async () => {
  const r = await game(() => {
    const w = window.riftbound.currentWorld();
    const g = w.mountTarget;
    for (const a of w.actors) if (a.faction === 'army') { a.alive = false; a.removed = true; }
    const R = g.radius;
    const rects = [[3, 62, 86.5, 79], [45.5, 2, 86.5, 62]];
    const outside = (x, z) => Math.min(...rects.map(([x0, z0, x1, z1]) => Math.hypot(Math.max(x0, Math.min(x1, x)) - x, Math.max(z0, Math.min(z1, z)) - z)));
    const cols = new Set();
    for (const cell of w.phys.grid) if (cell) for (const c of cell) if ((c.flags & 16) && c.active) cols.add(c);
    const pen = (x, z) => {
      let worst = 0;
      for (const c of cols) {
        let d;
        if (c.shape === 'circle') d = Math.hypot(x - c.x, z - c.z) - c.r;
        else if (Math.abs(x - c.x) <= c.hw && Math.abs(z - c.z) <= c.hd) d = -Math.min(c.hw - Math.abs(x - c.x), c.hd - Math.abs(z - c.z));
        else d = Math.hypot(x - Math.max(c.x - c.hw, Math.min(x, c.x + c.hw)), z - Math.max(c.z - c.hd, Math.min(z, c.z + c.hd)));
        worst = Math.max(worst, R - d);
      }
      return worst;
    };
    let frames = 0, bad = 0, runs = 0;
    const imp0 = g.impacts;
    const run = (x, z, dx, dz, n) => {
      if (outside(x, z) > 0 || pen(x, z) > 0) return;
      const l = Math.hypot(dx, dz);
      g.x = x; g.z = z; runs++;
      for (let i = 0; i < n; i++) {
        g.vx = (dx / l) * 22; g.vz = (dz / l) * 22; g.dashT = 0.35; g.hp = g.maxHp;
        g.update(1 / 60);
        frames++;
        if (pen(g.x, g.z) > 0.05 || outside(g.x, g.z) > 0.05) bad++;
      }
    };
    const D = Math.SQRT1_2;
    for (const [x, z, dx, dz] of [[30, 72, 0, 1], [20, 66, 0, -1], [8, 70, -1, 0], [80, 70, 1, 0], [65, 8, 0, -1], [50, 29, -1, 0], [82, 33, 1, 0], [40, 67, D, -D], [50, 57, -D, D], [8, 74, -D, D]]) run(x, z, dx, dz, 60);
    let seed = 7;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 1500 && runs < 120; i++) { const a = rnd() * Math.PI * 2; run(3 + rnd() * 83.5, 2 + rnd() * 77, Math.sin(a), Math.cos(a), 30); }
    // one undriven dash into the north edge: bounces back, chips the golem, shakes the camera
    w.camRig.trauma = 0;
    g.impactCd = 0;
    g.x = 30; g.z = 76; g.vx = 0; g.vz = 22; g.dashT = 0.35; g.hp = g.maxHp;
    for (let i = 0; i < 20; i++) g.update(1 / 60);
    return { frames, bad, runs, impacts: g.impacts - imp0, vz: g.vz, hp: g.hp, maxHp: g.maxHp, trauma: w.camRig.trauma };
  });
  if (r.bad) throw new Error(`${r.bad}/${r.frames} frames clipped or left the corridor`);
  if (r.runs < 100 || r.impacts < 20) throw new Error(`stress too small: ${JSON.stringify(r)}`);
  if (!(r.vz < 0 && r.hp < r.maxHp && r.hp > r.maxHp * 0.9 && r.trauma > 0.1)) throw new Error(`impact response: ${JSON.stringify(r)}`);
});

await step('v1.2: golem audio recipes, landing stomp + audio mix table', async () => {
  const r = await game(() => {
    const g = window.riftbound;
    const a = g.services.audio;
    const w = g.currentWorld();
    const golem = w.mountTarget;
    golem.x = 52; golem.z = 29; golem.vx = golem.vz = 0; // zone-B checkpoint area (walkable)
    const recipes = ['golemScrape', 'golemStomp', 'golemCharge', 'golemOverheat', 'golemHeatWarn', 'golemLaser', 'lockTone'].every((n) => a.hasRecipe(n));
    const canLand = golem.canDismount();
    golem.dismount();
    return { recipes, canLand, landing: golem.landing, mix: !!g.audioMix && g.audioMix.loops.rain < 0 && g.audioMix.recipes.bolt > 0 };
  });
  if (!(r.recipes && r.canLand && r.landing && r.mix)) throw new Error(JSON.stringify(r));
  await page.waitForFunction(() => { const w = window.riftbound.currentWorld(); const gl = w.actors.find((x) => x.kind === 'arcaneGolem'); return gl && !gl.landing && gl.y < 0.6; }, null, { timeout: 15000 });
  await shot('53-golem-landed');
});

await step('v1.1: challenge trials menu + trial start', async () => {
  await game(() => window.riftbound.uiAction('mainMenu'));
  await wait(600);
  await page.click('text=Challenge Trials');
  await wait(400);
  if (!(await page.isVisible('text=Barrier Survival'))) throw new Error('trials menu missing');
  await shot('51-trials-menu');
  for (const id of ['targetRun', 'barrierSurvival', 'riftOnslaught']) {
    await game((t) => window.riftbound.uiAction('trial', t), id);
    await wait(2000);
    const ok = await game(() => window.riftbound.states.is('challenge') && !!window.riftbound.currentWorld());
    if (!ok) throw new Error(`trial ${id} did not start`);
  }
  await shot('52-trial');
});

await step('touch layout renders', async () => {
  await game(() => { window.riftbound.services.save.settings.touchMode = 'on'; window.riftbound.uiAction('deploy', 0); });
  await wait(1500);
  await shot('40-touch');
  await game(() => { window.riftbound.services.save.settings.touchMode = 'auto'; });
});

await step('v1.3: touch controls follow the context (on foot / golem / trial rules / left-handed)', async () => {
  const labels = () => game(() => {
    const t = window.riftbound.ui.touch;
    return { visible: t.visible, mode: t.mode, aim: t.aimAction, lefty: t.lefty, size: document.getElementById('touch').style.fontSize, l: Object.fromEntries(['blink', 'ward', 'fire2', 'interact', 'potion', 'bomb', 'cycle'].map((a) => [a, t.labelOf(a)])) };
  });
  await game(() => { const g = window.riftbound; g.services.save.settings.touchMode = 'on'; g.services.dev.god = true; g.uiAction('deploy', 1); });
  await wait(1500);
  const foot = await labels();
  if (!(foot.visible && foot.mode === 'foot' && foot.aim === 'fire1' && foot.l.blink === 'BLINK' && foot.l.fire2 === 'FLAME' && foot.l.bomb === 'BOMB')) throw new Error(`foot ${JSON.stringify(foot)}`);
  // a pointer press on BLINK drives the 'blink' action
  const blinked = await game(async () => {
    const w = window.riftbound.currentWorld();
    const b = document.querySelector('.tbtn[data-action="blink"]');
    const x0 = w.player.x, z0 = w.player.z;
    b.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 9, bubbles: true }));
    await new Promise((r) => setTimeout(r, 700));
    b.dispatchEvent(new PointerEvent('pointerup', { pointerId: 9, bubbles: true }));
    return Math.hypot(w.player.x - x0, w.player.z - z0) > 1 || w.player.cooldownFrac('blink') > 0;
  });
  if (!blinked) throw new Error('BLINK button did not blink');
  await game(() => { const w = window.riftbound.currentWorld(); w.actors.find((a) => a.kind === 'arcaneGolem').mount(w.player); });
  await wait(600);
  const golem = await labels();
  if (!(golem.mode === 'golem' && golem.l.blink === 'DASH' && golem.l.ward === 'BRACE' && golem.l.fire2 === 'VOLLEY' && golem.l.potion === '' && golem.l.cycle === '')) throw new Error(`golem ${JSON.stringify(golem)}`);
  await game(() => window.riftbound.uiAction('trial', 'barrierSurvival'));
  await wait(1500);
  const barrier = await labels();
  if (!(barrier.aim === null && barrier.l.fire2 === '' && barrier.l.bomb === '' && barrier.l.potion === '' && barrier.l.ward === 'WARD')) throw new Error(`barrier ${JSON.stringify(barrier)}`);
  await game(() => window.riftbound.uiAction('trial', 'targetRun'));
  await wait(1500);
  await game(() => { const s = window.riftbound.services.save.settings; s.touchHanded = 'left'; s.touchSize = 'large'; });
  await wait(500);
  const lefty = await labels();
  if (!(lefty.aim === 'fire2' && lefty.l.fire2 === 'FLAME' && lefty.l.bomb === '' && lefty.lefty && lefty.size === '1.2em')) throw new Error(`targetRun/lefty ${JSON.stringify(lefty)}`);
  await shot('60-touch-lefty-trial');
  await game(() => { const s = window.riftbound.services.save.settings; s.touchHanded = 'right'; s.touchSize = 'medium'; s.touchMode = 'auto'; });
});

await step('v1.3: phone-landscape title menu fits (844×390)', async () => {
  await page.setViewportSize({ width: 844, height: 390 });
  await game(() => window.riftbound.uiAction('mainMenu'));
  await wait(800);
  const r = await game(() => {
    const btns = [...document.querySelectorAll('.screen.title .menu .btn')].map((b) => b.getBoundingClientRect());
    const foot = document.querySelector('.screen.title .footer-note').getBoundingClientRect();
    const stage = document.getElementById('stage').getBoundingClientRect();
    return { last: btns[btns.length - 1].bottom, first: btns[0].top, foot: foot.top, stageTop: stage.top, stageBottom: stage.bottom };
  });
  await shot('61-title-phone');
  await page.setViewportSize({ width: 1280, height: 720 });
  await wait(400);
  if (!(r.last <= r.foot && r.first >= r.stageTop)) throw new Error(JSON.stringify(r));
});

await step('v1.3: checkpoint survives a page reload → Continue', async () => {
  await game(() => { const g = window.riftbound; g.services.dev.god = true; g.uiAction('deploy', 0); });
  await wait(1200);
  await game(() => { const w = window.riftbound.currentWorld(); w.stats.kills = 5; window.riftbound.devAction('completeZone'); });
  await wait(800);
  await game(() => { const w = window.riftbound.currentWorld(); const n = w.level.zones[1]; w.player.x = n.checkpoint[0]; w.player.z = n.checkpoint[1]; });
  await page.waitForFunction(() => { try { const s = JSON.parse(localStorage.getItem('riftbound.save.v1')); return s.campaign.checkpoint && s.campaign.checkpoint.zone === 1; } catch { return false; } }, null, { timeout: 15000 });
  await page.reload();
  await page.waitForFunction(() => !!window.riftbound, null, { timeout: 20000 });
  await wait(1500);
  if (!(await page.isVisible('text=Continue · Sector 1'))) throw new Error('no Continue button on the title screen');
  await page.click('text=Continue · Sector 1');
  await wait(1500);
  const r = await game(() => { const w = window.riftbound.currentWorld(); return w ? { sector: w.level.id, zone: w.activeZone, kills: w.stats.kills } : null; });
  if (!(r && r.sector === 'sector1' && r.zone === 1 && r.kills >= 5)) throw new Error(JSON.stringify(r));
  // a fresh deploy replaces the saved checkpoint
  await game(() => window.riftbound.uiAction('deploy', 2));
  await wait(800);
  const cp = await game(() => window.riftbound.services.save.campaign.checkpoint);
  if (cp !== null) throw new Error(`checkpoint not cleared: ${JSON.stringify(cp)}`);
});

await step('v1.3: opt-in playtest records (trial + golem segment)', async () => {
  const trialTime = (sec) => page.waitForFunction((t) => window.riftbound.challenge.t > t, sec, { timeout: 30000 });
  await game(() => { const s = window.riftbound.services.save; s.settings.playtestRecords = false; s.stats.playtest = []; window.riftbound.uiAction('trial', 'targetRun'); });
  await trialTime(1.5);
  await game(() => window.riftbound.uiAction('mainMenu'));
  await wait(500);
  const off = await game(() => window.riftbound.services.save.stats.playtest.length);
  if (off !== 0) throw new Error('recorded while disabled');
  await game(() => { window.riftbound.services.save.settings.playtestRecords = true; window.riftbound.uiAction('trial', 'targetRun'); });
  await trialTime(1.5);
  await game(() => window.riftbound.uiAction('mainMenu'));
  await wait(500);
  await game(() => { const g = window.riftbound; g.services.dev.god = true; g.uiAction('deploy', 1); });
  await wait(1200);
  const t0 = await game(() => { const w = window.riftbound.currentWorld(); w.actors.find((a) => a.kind === 'arcaneGolem').mount(w.player); return w.time; });
  await page.waitForFunction((t) => window.riftbound.currentWorld().time > t + 1.6, t0, { timeout: 30000 });
  await game(() => window.riftbound.uiAction('mainMenu'));
  await wait(800);
  const runs = await game(() => window.riftbound.services.save.stats.playtest);
  const kinds = runs.map((r) => `${r.kind}:${r.id}:${r.outcome}`);
  if (!(runs.length === 2 && kinds[0] === 'trial:targetRun:quit' && kinds[1].startsWith('golem:sector2-golem:') && runs[1].time >= 1)) throw new Error(JSON.stringify(kinds));
  await game(() => { const s = window.riftbound.services.save; s.settings.playtestRecords = false; });
});

await step('v1.3: settings reset confirms inside the page', async () => {
  await game(() => { window.riftbound.services.save.shards = 99; window.riftbound.ui.go('settings', 'title'); });
  await wait(400);
  await page.click('[data-act="reset"]');
  await wait(200);
  const mid = await game(() => ({ shards: window.riftbound.services.save.shards, label: document.querySelector('[data-act="reset"]').textContent }));
  if (!(mid.shards === 99 && /Tap again/.test(mid.label))) throw new Error(JSON.stringify(mid));
  await page.click('[data-act="reset"]');
  await wait(400);
  const after = await game(() => window.riftbound.services.save.shards);
  if (after !== 0) throw new Error(`reset did not run (${after})`);
});

await step('v1.4: portrait phone layout (390×844): view on top, status + controls below, menus full screen', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await wait(600);
  await game(() => { const g = window.riftbound; g.services.save.campaign.introSeen = true; g.services.save.settings.touchMode = 'on'; g.services.dev.god = true; g.uiAction('deploy', 0); });
  await wait(1500);
  const r = await game(() => {
    const box = (q) => { const e = document.querySelector(q); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
    return {
      portrait: window.riftbound.ui.portrait, stage: box('#stage'), pad: box('#portrait-pad'),
      touchIn: document.getElementById('touch').parentElement.className, bars: box('.pp-top .hud-tl'), blink: box('.tbtn[data-action="blink"]'),
      scrollW: document.documentElement.scrollWidth,
    };
  });
  await shot('70-portrait-game');
  const ok = r.portrait && r.stage.t === 0 && Math.abs(r.pad.t - r.stage.b) < 2 && r.touchIn === 'pp-controls'
    && r.bars && r.bars.t >= r.stage.b && r.blink && r.blink.t > r.stage.b && r.blink.b <= 844 && r.scrollW <= 390;
  if (!ok) throw new Error(JSON.stringify(r));
  await game(() => window.riftbound.uiAction('pause'));
  await wait(500);
  const menu = await game(() => { const e = document.querySelector('.screen .panel'); const b = e.getBoundingClientRect(); return { inBody: document.getElementById('screens').parentElement === document.body, t: b.top, b: b.bottom }; });
  await shot('71-portrait-pause');
  await page.setViewportSize({ width: 1280, height: 720 });
  await wait(600);
  const back = await game(() => ({ portrait: window.riftbound.ui.portrait, touch: document.getElementById('touch').parentElement.id, screens: document.getElementById('screens').parentElement.id }));
  await game(() => { window.riftbound.services.save.settings.touchMode = 'auto'; window.riftbound.uiAction('mainMenu'); });
  if (!(menu.inBody && menu.t >= 0 && menu.b <= 844)) throw new Error(`pause ${JSON.stringify(menu)}`);
  if (!(back.portrait === false && back.touch === 'stage' && back.screens === 'stage')) throw new Error(`landscape restore ${JSON.stringify(back)}`);
});

await step('v1.4: export panel (copyable text + download) for playtest records', async () => {
  await game(() => { const s = window.riftbound.services.save; s.stats.playtest = [{ kind: 'trial', id: 'targetRun', at: 1, version: 'smoke', outcome: 'complete', time: 50, damage: 3 }]; window.riftbound.ui.go('settings', 'title'); });
  await wait(400);
  await page.click('[data-act="ptexport"]');
  await wait(400);
  const r = await game(() => ({ cur: window.riftbound.ui.current, text: document.getElementById('export-text').value }));
  const parsed = JSON.parse(r.text);
  if (!(r.cur === 'export' && parsed.runs.length === 1 && parsed.runs[0].version === 'smoke')) throw new Error(JSON.stringify(r).slice(0, 200));
  await page.click('[data-act="back"]');
  await wait(300);
  const cur = await game(() => window.riftbound.ui.current);
  if (cur !== 'settings') throw new Error(`Back went to ${cur}`);
  await game(() => { window.riftbound.services.save.stats.playtest = []; });
});

const perf = await game(() => window.riftbound.perfText());
console.log(results.join('\n'));
console.log('--- perf (headless SwiftShader, not representative of real GPUs) ---\n' + perf);
if (warnings.length) console.log(`--- ${warnings.length} console warnings (first 5) ---\n` + warnings.slice(0, 5).join('\n'));
if (errors.length) console.log('--- ERRORS ---\n' + errors.join('\n'));
await browser.close();
server.close();
process.exit(errors.length ? 1 : 0);
