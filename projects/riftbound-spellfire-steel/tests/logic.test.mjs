// Fast logic tests (no browser): bundles pure modules with esbuild and checks collision,
// raycasting with the low-cover rule, A* pathfinding, save defaults/migration, maths and
// (v1.2) that the asset manifest registers every synthesized sound / v1.1 asset.
//   node tests/logic.test.mjs
import * as esbuild from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const entry = `
export * from './src/core/Physics';
export * as math from './src/utils/math';
export { defaultSave, importSave, recordPlaytest, PLAYTEST_CAP } from './src/core/Save';
`;
const res = await esbuild.build({ stdin: { contents: entry, resolveDir: root, loader: 'ts' }, bundle: true, format: 'esm', write: false, platform: 'node' });
const mod = await import(`data:text/javascript;base64,${Buffer.from(res.outputFiles[0].text).toString('base64')}`);
const { CollisionWorld, NavGrid, CF, math, defaultSave, importSave, recordPlaytest, PLAYTEST_CAP } = mod;

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log(`PASS ${name}`); } catch (e) { console.log(`FAIL ${name}: ${e.message}`); process.exitCode = 1; }
};

test('circle push-out from box', () => {
  const w = new CollisionWorld(0, 0, 40, 40);
  w.addBox(10, 10, 2, 2, CF.MOVE);
  const out = w.resolveCircle(11.5, 10, 0.5, CF.MOVE, { x: 0, z: 0 });
  assert.ok(out.x >= 12.49, `x=${out.x}`);
});

test('raycast hits nearest collider', () => {
  const w = new CollisionWorld(0, 0, 40, 40);
  w.addCircle(10, 5, 1, CF.SHOT);
  w.addCircle(20, 5, 1, CF.SHOT);
  const h = w.raycast(0, 5, 30, 5, CF.SHOT);
  assert.ok(h && Math.abs(h.x - 9) < 0.01, JSON.stringify(h));
});

test('low cover next to the shooter is ignored, next to the target protects', () => {
  const w = new CollisionWorld(0, 0, 40, 40);
  w.addCircle(5, 10, 0.5, CF.SHOT | CF.LOW);
  // shooter hugging the sandbag fires over it
  assert.equal(w.raycast(4, 10, 20, 10, CF.SHOT, { sx: 4, sz: 10 }), null);
  // a shot from far away at someone hiding behind it is blocked
  assert.ok(w.raycast(20, 10, 4, 10, CF.SHOT, { sx: 20, sz: 10, tx: 4, tz: 10, targetExposed: false }));
  // …unless the target is peeking (exposed)
  assert.equal(w.raycast(20, 10, 4, 10, CF.SHOT, { sx: 20, sz: 10, tx: 4, tz: 10, targetExposed: true }), null);
});

test('tall walls block line of sight, low cover does not', () => {
  const w = new CollisionWorld(0, 0, 40, 40);
  w.addBox(10, 10, 0.4, 5, CF.MOVE | CF.SHOT | CF.SIGHT);
  w.addCircle(20, 30, 0.5, CF.MOVE | CF.SHOT | CF.LOW);
  assert.equal(w.lineOfSight(5, 10, 15, 10), false);
  assert.equal(w.lineOfSight(15, 30, 25, 30), true);
});

test('A* routes around a wall', () => {
  const w = new CollisionWorld(0, 0, 40, 40);
  w.addBox(20, 15, 0.5, 14, CF.MOVE);
  const nav = new NavGrid(0, 0, 40, 40);
  nav.rebuild(w);
  const path = nav.findPath(10, 15, 30, 15, w);
  assert.ok(path && path.length >= 2, 'no path');
  // every waypoint is walkable and the route goes around the end of the wall
  for (let i = 0; i < path.length; i += 2) assert.ok(nav.walkable(path[i], path[i + 1]));
  assert.ok(path.some((v, i) => i % 2 === 1 && (v > 29 || v < 1.5)), JSON.stringify(path));
});

test('nav grid updates when cover is destroyed', () => {
  const w = new CollisionWorld(0, 0, 20, 20);
  const c = w.addCircle(10, 10, 1, CF.MOVE);
  const nav = new NavGrid(0, 0, 20, 20);
  nav.rebuild(w);
  assert.equal(nav.walkable(10, 10), false);
  w.remove(c);
  nav.updateRect(w, 8, 8, 12, 12);
  assert.equal(nav.walkable(10, 10), true);
});

test('segment maths', () => {
  assert.ok(Math.abs(math.segCircle(0, 0, 10, 0, 5, 0, 1) - 0.4) < 1e-6);
  assert.equal(math.segAABB(0, 5, 10, 5, 2, 0, 3, 4), -1);
  assert.ok(Math.abs(math.wrapAngle(Math.PI * 3) - Math.PI) < 1e-9);
  assert.equal(math.formatTime(75.25), '1:15.3');
});

test('save defaults use the frozen schema keys', () => {
  const s = defaultSave();
  for (const k of ['schema', 'campaign', 'shards', 'shardsEarnedTotal', 'upgrades', 'spells', 'cosmetics', 'challenges', 'settings', 'stats']) assert.ok(k in s, k);
  assert.deepEqual(Object.keys(s.upgrades).sort(), ['blink', 'elemDuration', 'manaRegen', 'maxHealth', 'maxMana', 'spellPower', 'wardResist']);
});

test('old / partial saves are merged with defaults', () => {
  const s = importSave(JSON.stringify({ schema: 1, shards: 42, campaign: { unlocked: 3 }, upgrades: { spellPower: 2 } }));
  assert.equal(s.shards, 42);
  assert.equal(s.campaign.unlocked, 3);
  assert.equal(s.campaign.completed.length, 4);
  assert.equal(s.upgrades.spellPower, 2);
  assert.equal(s.upgrades.maxMana, 0);
  assert.ok(s.spells.unlocked.includes('arcaneBolt'));
  assert.equal(importSave('not json'), null);
});

test('v1.3 save keys: old saves gain touch / playtest defaults; malformed checkpoints are dropped', () => {
  const s = importSave(JSON.stringify({ schema: 1, campaign: { unlocked: 2, checkpoint: { sector: 1, zone: 2, stats: { kills: 7 } } }, stats: { kills: 3 } }));
  assert.equal(s.settings.touchSize, 'medium');
  assert.equal(s.settings.touchHanded, 'right');
  assert.equal(s.settings.playtestRecords, false);
  assert.deepEqual(s.stats.playtest, []);
  assert.equal(s.campaign.checkpoint.zone, 2);
  assert.equal(s.campaign.checkpoint.stats.kills, 7);
  const bad = importSave(JSON.stringify({ schema: 1, campaign: { checkpoint: { sector: 9, zone: 'x' } } }));
  assert.equal(bad.campaign.checkpoint, null);
});

test('v1.3 playtest records are opt-in and capped', () => {
  const s = defaultSave();
  const run = (i) => ({ kind: 'trial', id: 'targetRun', at: i, version: 'test', outcome: 'complete', time: i, damage: 0 });
  assert.equal(recordPlaytest(s, run(0)), false);
  assert.equal(s.stats.playtest.length, 0);
  s.settings.playtestRecords = true;
  for (let i = 0; i < PLAYTEST_CAP + 7; i++) recordPlaytest(s, run(i));
  assert.equal(s.stats.playtest.length, PLAYTEST_CAP);
  assert.equal(s.stats.playtest[0].at, 7);
  assert.equal(s.stats.playtest[PLAYTEST_CAP - 1].at, PLAYTEST_CAP + 6);
});

test('asset manifest: unique IDs in the <category>/<name> convention, v1.1 assets registered', () => {
  const m = JSON.parse(readFileSync(join(root, 'assets_manifest.json'), 'utf8'));
  const ids = m.assets.map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate IDs');
  const cats = ['model', 'prop', 'texture', 'groundMaterial', 'sfx', 'loop', 'music', 'level', 'icon'];
  for (const id of ids) assert.ok(cats.includes(id.split('/')[0]) && /^[a-zA-Z]+\/[a-zA-Z0-9-]+$/.test(id), `bad id ${id}`);
  const v11 = ['model/arcaneGolemFlyer', 'model/aaTower', 'model/radarMine', 'model/barrierPylon', 'model/emplacement', 'model/golemShrine',
    'model/targetDummy', 'model/minigunNest', 'sfx/golemLaser', 'sfx/golemAwaken', 'sfx/golemDash', 'sfx/aaLaunch', 'sfx/lockTone', 'sfx/stoneHit',
    'loop/golemHum', 'loop/golemBeam', 'level/trial-targetRun', 'level/trial-barrierSurvival', 'level/trial-riftOnslaught'];
  for (const id of v11) assert.ok(ids.includes(id), `missing ${id}`);
  // every synthesized recipe in the codebase has an sfx/ entry
  const src = readFileSync(join(root, 'src/audio/AudioEngine.ts'), 'utf8') + readFileSync(join(root, 'src/entities/ArcaneGolem.ts'), 'utf8');
  const names = [...src.matchAll(/(?:\br|registerRecipe)\('([a-zA-Z]+)'/g)].map((x) => x[1]);
  assert.ok(names.length > 60, `only ${names.length} recipes found`);
  for (const n of names) assert.ok(ids.includes(`sfx/${n}`), `recipe ${n} not in manifest`);
});

console.log(`${passed} logic tests passed`);
