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

const perf = await game(() => window.riftbound.perfText());
console.log(results.join('\n'));
console.log('--- perf (headless SwiftShader, not representative of real GPUs) ---\n' + perf);
if (warnings.length) console.log(`--- ${warnings.length} console warnings (first 5) ---\n` + warnings.slice(0, 5).join('\n'));
if (errors.length) console.log('--- ERRORS ---\n' + errors.join('\n'));
await browser.close();
server.close();
process.exit(errors.length ? 1 : 0);
