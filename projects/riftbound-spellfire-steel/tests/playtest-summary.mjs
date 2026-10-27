// v1.4: summarises exported playtest records (notes/playtest/*.json) for the balance pass.
//   node tests/playtest-summary.mjs [dir]
// Accepts the export format { game, version, runs: [...] } or a bare array of runs.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = process.argv[2] || join(root, 'notes/playtest');

/** Current thresholds — keep in sync with gradeTrial() in src/scenes/ChallengeScene.ts. */
const CURRENT = {
  targetRun: '2★ time ≤ 60 s · 3★ time ≤ 45 s and damage ≤ 30',
  barrierSurvival: '2★ damage ≤ 150 · 3★ damage ≤ 70',
  riftOnslaught: '2★ time ≤ 330 s · 3★ time ≤ 260 s and damage ≤ 200',
};

export function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function loadRuns(folder) {
  if (!existsSync(folder)) return [];
  const runs = [];
  for (const f of readdirSync(folder)) {
    if (!f.endsWith('.json')) continue;
    try {
      const data = JSON.parse(readFileSync(join(folder, f), 'utf8'));
      const list = Array.isArray(data) ? data : Array.isArray(data.runs) ? data.runs : [];
      for (const r of list) if (r && (r.kind === 'trial' || r.kind === 'golem')) runs.push({ ...r, file: f });
    } catch (e) {
      console.warn(`skipping ${f}: ${e.message}`);
    }
  }
  return runs;
}

export function summarise(runs) {
  const groups = new Map();
  for (const r of runs) {
    const key = r.kind === 'trial' ? r.id : 'golem';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const out = {};
  for (const [key, list] of groups) {
    const done = list.filter((r) => (key === 'golem' ? r.outcome === 'aa-destroyed' : r.outcome === 'complete'));
    const times = done.map((r) => Number(r.time)).sort((a, b) => a - b);
    const dmg = done.map((r) => Number(r.damage)).sort((a, b) => a - b);
    const s = {
      runs: list.length, completed: done.length, players: new Set(list.map((r) => r.file)).size,
      versions: [...new Set(list.map((r) => r.version))],
      time: { q25: quantile(times, 0.25), median: quantile(times, 0.5), q75: quantile(times, 0.75) },
      damage: { q25: quantile(dmg, 0.25), median: quantile(dmg, 0.5), q75: quantile(dmg, 0.75) },
    };
    if (key === 'golem') {
      const m = (k) => quantile(list.map((r) => Number(r[k] || 0)).sort((a, b) => a - b), 0.5);
      s.medians = { crashes: m('crashes'), impacts: m('impacts'), overheats: m('overheats'), missilesDown: m('missilesDown') };
    }
    out[key] = s;
  }
  return out;
}

const runs = loadRuns(dir);
if (!runs.length) {
  console.log(`No playtest records in ${dir}. Balance stays as it is (see notes/playtest/README.md).`);
  process.exit(0);
}
const sum = summarise(runs);
const r1 = (v) => (v === null ? '—' : Math.round(v * 10) / 10);
for (const [key, s] of Object.entries(sum)) {
  console.log(`\n${key}: ${s.runs} runs from ${s.players} file(s), ${s.completed} completed · builds ${s.versions.join(', ')}`);
  console.log(`  time   q25 ${r1(s.time.q25)} · median ${r1(s.time.median)} · q75 ${r1(s.time.q75)}`);
  console.log(`  damage q25 ${r1(s.damage.q25)} · median ${r1(s.damage.median)} · q75 ${r1(s.damage.q75)}`);
  if (CURRENT[key]) {
    console.log(`  current: ${CURRENT[key]}`);
    if (s.completed >= 10 && s.players >= 3) console.log(`  suggest: 2★ ≈ median, 3★ ≈ best quartile (time ${r1(s.time.q25)}, damage ${r1(s.damage.q25)})`);
    else console.log('  not enough data to suggest thresholds (need ≥ 10 completed runs from ≥ 3 players)');
  }
  if (s.medians) console.log(`  medians: ${JSON.stringify(s.medians)}`);
}
