// Menu screens (DOM): title, campaign rift map, briefing + loadout, Grimoire Upgrade
// Sanctum, settings, credits, challenge trials, pause, dimensional map, results, defeat.
import { INFERNO_COST, ROBE_GLOWS, SECONDARY_SPELLS, SECTORS, SPELLS, UPGRADE_COSTS, UPGRADE_MAX, UPGRADES } from '../config/balance';
import type { LevelData, SecondarySpellId, SpellId } from '../config/types';
import { GAME_TITLE, VERSION } from '../config/version';
import type { SaveData, Settings } from '../core/Save';
import { formatTime } from '../utils/math';
import { paintGround } from '../utils/textures';
import { escapeHtml } from './Hud';
import { ICONS } from './icons';

export interface ScreenHost {
  save: SaveData;
  levels: LevelData[];
  playUi(name: string): void;
  persist(): void;
  go(screen: string, data?: unknown): void;
  action(name: string, data?: unknown): void;
}

export interface ResultsData {
  sector: number;
  name: string;
  victory: boolean;
  reason?: string;
  stats: { label: string; value: string }[];
  rating: string;
  stars: number;
  shards: number;
  unlocked: string | null;
  hasNext: boolean;
  bestTime: boolean;
  challenge?: boolean;
}

function h(html: string): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}

function starsHtml(n: number, max = 3): string {
  let s = '';
  for (let i = 0; i < max; i++) s += i < n ? '★' : '<span class="off">★</span>';
  return `<span class="stars">${s}</span>`;
}

function bind(root: HTMLElement, host: ScreenHost, map: Record<string, () => void>): void {
  root.querySelectorAll<HTMLElement>('[data-act]').forEach((b) => {
    const act = b.dataset.act as string;
    b.addEventListener('click', () => {
      if ((b as HTMLButtonElement).disabled) return;
      host.playUi('uiClick');
      const fn = map[act];
      if (fn) fn();
    });
  });
}

// ------------------------------------------------------------------ title

export function titleScreen(host: ScreenHost): HTMLElement {
  const s = host.save;
  const root = h(`
    <div class="screen" data-back="none">
      <div class="magic-circle"></div>
      <div class="title-logo">
        <div class="t1">RIFTBOUND</div>
        <div class="t2">Spellfire &amp; Steel</div>
        <div class="t3">Chapter One · The Shattered Threshold</div>
      </div>
      <div class="menu" role="menu">
        <button class="btn primary" data-act="play" role="menuitem">Play Campaign</button>
        <button class="btn" data-act="challenges" role="menuitem">Challenge Trials</button>
        <button class="btn" data-act="sanctum" role="menuitem">Spell Grimoire</button>
        <button class="btn" data-act="settings" role="menuitem">Settings</button>
        <button class="btn" data-act="credits" role="menuitem">Credits</button>
      </div>
      <div class="footer-note">v${VERSION} · <span class="shards">${s.shards}</span> Crystal Shards · Progress saves automatically</div>
    </div>`);
  bind(root, host, {
    play: () => host.action('playCampaign'),
    challenges: () => host.go('challenges'),
    sanctum: () => host.go('sanctum', 'title'),
    settings: () => host.go('settings', 'title'),
    credits: () => host.go('credits'),
  });
  return root;
}

// ------------------------------------------------------------------ campaign map

export function campaignScreen(host: ScreenHost): HTMLElement {
  const c = host.save.campaign;
  const cards = SECTORS.map((m, i) => {
    const locked = i >= c.unlocked;
    const best = c.bestTimes[i];
    return `<button class="sector-card${locked ? ' locked' : ''}" data-sector="${i}" ${locked ? 'aria-disabled="true"' : ''}>
      <div class="num">SECTOR ${i + 1}${i === 3 ? ' · BOSS' : ''}</div>
      <div class="name">${m.name}</div>
      <div class="meta">${locked ? 'Sealed — clear the previous sector' : `${starsHtml(c.stars[i])} ${best ? `· Best ${formatTime(best)}` : ''} ${c.bestRatings[i] ? `· Rank ${c.bestRatings[i]}` : ''}`}</div>
    </button>`;
  }).join('');
  const root = h(`
    <div class="screen cosmic" data-back="title">
      <div class="panel" style="width:56em">
        <h2>The Shattered Threshold</h2>
        <p>Four sectors of the fused warzone stand between you and General Vance. Clear each to unseal the next.</p>
        <div class="sector-grid">${cards}</div>
        <div class="btn-row">
          <button class="btn" data-act="intro">Replay Rift Briefing</button>
          <button class="btn" data-act="sanctum">Grimoire Sanctum</button>
          <button class="btn" data-act="back">Back</button>
        </div>
      </div>
    </div>`);
  root.querySelectorAll<HTMLElement>('.sector-card').forEach((b) => {
    b.addEventListener('click', () => {
      const i = Number(b.dataset.sector);
      if (i >= c.unlocked) { host.playUi('uiDeny'); return; }
      host.playUi('uiClick');
      host.go('briefing', i);
    });
  });
  bind(root, host, {
    intro: () => host.action('intro'),
    sanctum: () => host.go('sanctum', 'campaign'),
    back: () => host.go('title'),
  });
  return root;
}

// ------------------------------------------------------------------ briefing & loadout

export function drawRiftMap(canvas: HTMLCanvasElement, level: LevelData, cache: Map<string, HTMLCanvasElement>): void {
  const [W, H] = level.size;
  const scale = 4;
  canvas.width = W * scale;
  canvas.height = H * scale;
  const g = canvas.getContext('2d') as CanvasRenderingContext2D;
  let ground = cache.get(level.id);
  if (!ground) {
    ground = paintGround(level);
    cache.set(level.id, ground);
  }
  g.imageSmoothingEnabled = false;
  g.drawImage(ground, 0, 0, canvas.width, canvas.height);
  g.fillStyle = 'rgba(10,4,24,0.35)';
  g.fillRect(0, 0, canvas.width, canvas.height);
  level.zones.forEach((z, i) => {
    const [x0, z0, x1, z1] = z.rect;
    g.strokeStyle = 'rgba(179,107,255,0.9)';
    g.setLineDash([6, 4]);
    g.lineWidth = 2;
    g.strokeRect(x0 * scale + 2, z0 * scale + 2, (x1 - x0) * scale - 4, (z1 - z0) * scale - 4);
    g.setLineDash([]);
    g.fillStyle = '#ffd84a';
    g.font = `bold ${Math.round(canvas.height / 14)}px Georgia`;
    g.fillText(`${String.fromCharCode(65 + i)}`, x0 * scale + 8, z0 * scale + canvas.height / 12);
    if (z.gate) {
      g.strokeStyle = z.gate.type === 'riftwall' ? '#c04cff' : '#d9b23a';
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(z.gate.a[0] * scale, z.gate.a[1] * scale);
      g.lineTo(z.gate.b[0] * scale, z.gate.b[1] * scale);
      g.stroke();
    }
  });
  for (const p of level.props) {
    const x = (p.x || 0) * scale, y = (p.z || 0) * scale;
    if (['anchor', 'jammer', 'depot', 'generator', 'catalyst', 'goliath', 'cage'].indexOf(p.t) >= 0) {
      g.fillStyle = '#ffd84a';
      g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill();
    } else if (p.t === 'well') {
      g.fillStyle = '#b46bff';
      g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill();
    } else if (p.t === 'portal') {
      g.strokeStyle = '#ffd84a'; g.lineWidth = 3;
      g.beginPath(); g.arc(x, y, 8, 0, Math.PI * 2); g.stroke();
    }
  }
  for (const z of level.zones) for (const e of z.enemies) {
    if (e.wave) continue;
    g.fillStyle = 'rgba(255,64,64,0.85)';
    g.fillRect(e.x * scale - 2, e.z * scale - 2, 4, 4);
  }
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(level.player[0] * scale, level.player[1] * scale, 6, 0, Math.PI * 2); g.fill();
}

export function briefingScreen(host: ScreenHost, sector: number, mapCache: Map<string, HTMLCanvasElement>): HTMLElement {
  const level = host.levels[sector];
  const save = host.save;
  const objs = level.zones.map((z, i) => `<li><b>${String.fromCharCode(65 + i)} · ${z.name}:</b> ${z.objectives.map((o) => `${o.text}${o.optional ? ' (bonus)' : ''}`).join(', ')}</li>`).join('');
  const slotHtml = () => save.spells.loadout.map((id, i) => {
    const unlocked = save.spells.unlocked.indexOf(id) >= 0;
    const icon = id === 'flameBurst' && save.spells.inferno ? 'inferno' : id;
    return `<button class="slot${unlocked ? '' : ' locked'}" data-slot="${i}"><span class="key">${i + 1}</span><span class="spell-icon">${unlocked ? ICONS[icon] : ICONS.lock}</span><span>${unlocked ? SPELLS[id].name : `${SPELLS[id].name} (locked)`}</span></button>`;
  }).join('');
  const root = h(`
    <div class="screen cosmic" data-back="campaign">
      <div class="panel briefing compact">
        <div>
          <h2>Sector ${sector + 1}: ${level.name}</h2>
          <canvas class="rift-map" aria-label="Rift map of ${escapeHtml(level.name)}"></canvas>
          <p class="legend">White: your arrival · Red: known Vanguard positions · Gold: objectives · Violet: mana wells</p>
          <h3>Grimoire Loadout <span class="hint">(slots 1–4 · select to swap)</span></h3>
          <div class="loadout"></div>
        </div>
        <div>
          <h3>Rift Briefing</h3>
          ${level.briefing.map((b) => `<p>${escapeHtml(b)}</p>`).join('')}
          <h3>Objectives</h3>
          <ul class="obj-list">${objs}</ul>
          <div class="btn-row">
            <button class="btn primary" data-act="deploy" data-autofocus>Deploy</button>
            <button class="btn" data-act="sanctum">Upgrade Store <span class="shards">${save.shards}</span></button>
            <button class="btn" data-act="back">Back</button>
          </div>
        </div>
      </div>
    </div>`);
  drawRiftMap(root.querySelector('canvas') as HTMLCanvasElement, level, mapCache);
  const lo = root.querySelector('.loadout') as HTMLElement;
  const refresh = () => {
    lo.innerHTML = slotHtml();
    lo.querySelectorAll<HTMLElement>('.slot').forEach((b) => {
      b.addEventListener('click', () => {
        const i = Number(b.dataset.slot);
        // swap this slot with the next unlocked spell not already earlier in order
        const order = SECONDARY_SPELLS;
        const cur = save.spells.loadout[i];
        const nextId = order[(order.indexOf(cur) + 1) % order.length];
        const j = save.spells.loadout.indexOf(nextId);
        save.spells.loadout[j] = cur;
        save.spells.loadout[i] = nextId;
        host.persist();
        host.playUi('uiClick');
        refresh();
        (lo.querySelector(`[data-slot="${i}"]`) as HTMLElement).focus();
      });
    });
  };
  refresh();
  bind(root, host, {
    sanctum: () => host.go('sanctum', { back: 'briefing', sector }),
    back: () => host.go('campaign'),
    deploy: () => host.action('deploy', sector),
  });
  return root;
}

// ------------------------------------------------------------------ sanctum

export function sanctumScreen(host: ScreenHost, back: unknown): HTMLElement {
  const save = host.save;
  const totalStars = save.campaign.stars.reduce((a, b) => a + b, 0) + Object.keys(save.challenges).reduce((a, k) => a + (save.challenges[k].stars || 0), 0);
  const root = h(`<div class="screen cosmic" data-back="x"><div class="panel sanctum"><h2>Grimoire Upgrade Sanctum</h2><div class="body"></div></div></div>`);
  const body = root.querySelector('.body') as HTMLElement;
  const render = () => {
    const ups = UPGRADES.map((u) => {
      const lvl = save.upgrades[u.id];
      const maxed = lvl >= UPGRADE_MAX;
      const cost = maxed ? 0 : UPGRADE_COSTS[lvl];
      return `<div class="up-row"><div><b>${u.name}</b> <span class="lvl">${'◆'.repeat(lvl)}${'◇'.repeat(UPGRADE_MAX - lvl)}</span><div class="desc">${u.desc} · ${u.per} per rank</div></div>
        <div class="shards">${maxed ? 'MAX' : cost}</div>
        <button class="btn small center" data-up="${u.id}" ${maxed || save.shards < cost ? 'disabled' : ''}>${maxed ? 'Mastered' : 'Inscribe'}</button></div>`;
    }).join('');
    const spells = (['chainLightning', 'vortexSurge', 'meteorStrike'] as SpellId[]).map((id) => {
      const have = save.spells.unlocked.indexOf(id) >= 0;
      const cost = SPELLS[id].unlockCost;
      return `<div class="up-row"><div style="display:flex;align-items:center"><span class="spell-icon">${ICONS[id]}</span><div><b>${SPELLS[id].name}</b><div class="desc">${SPELLS[id].desc}</div></div></div>
        <div class="shards">${have ? '—' : cost}</div>
        <button class="btn small center" data-spell="${id}" ${have || save.shards < cost ? 'disabled' : ''}>${have ? 'Known' : 'Learn'}</button></div>`;
    }).join('');
    const inferno = `<div class="up-row"><div style="display:flex;align-items:center"><span class="spell-icon">${ICONS.inferno}</span><div><b>Inferno Fireball</b><div class="desc">Upgrades Flame Burst: +30% damage, bigger blast radius.</div></div></div>
        <div class="shards">${save.spells.inferno ? '—' : INFERNO_COST}</div>
        <button class="btn small center" data-inferno="1" ${save.spells.inferno || save.shards < INFERNO_COST ? 'disabled' : ''}>${save.spells.inferno ? 'Known' : 'Learn'}</button></div>`;
    const robes = ROBE_GLOWS.map((g) => {
      const ok = totalStars >= g.stars;
      const cur = save.cosmetics.robeGlow === g.id;
      return `<button class="btn small" data-robe="${g.id}" ${ok ? '' : 'disabled'} style="border-color:${g.css}">${cur ? '✔ ' : ''}${g.name}${ok ? '' : ` (${g.stars}★)`}</button>`;
    }).join('');
    body.innerHTML = `
      <p>Crystal Shards: <span class="shards">${save.shards}</span> · Stars earned: ${totalStars}★</p>
      <h3>Permanent Inscriptions</h3>${ups}
      <h3>Spell Scrolls</h3>${spells}${inferno}
      <h3>Robe Glow (cosmetic)</h3><div class="btn-row" style="justify-content:flex-start">${robes}</div>
      <div class="btn-row"><button class="btn primary" data-act="back" data-autofocus>Return</button></div>`;
    body.querySelectorAll<HTMLButtonElement>('[data-up]').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.up as keyof SaveData['upgrades'];
      const lvl = save.upgrades[id];
      const cost = UPGRADE_COSTS[lvl];
      if (lvl >= UPGRADE_MAX || save.shards < cost) { host.playUi('uiDeny'); return; }
      save.shards -= cost;
      save.upgrades[id] = lvl + 1;
      host.persist();
      host.playUi('upgrade');
      render();
    }));
    body.querySelectorAll<HTMLButtonElement>('[data-spell]').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.spell as SecondarySpellId;
      const cost = SPELLS[id].unlockCost;
      if (save.shards < cost) { host.playUi('uiDeny'); return; }
      save.shards -= cost;
      save.spells.unlocked.push(id);
      host.persist();
      host.playUi('upgrade');
      render();
    }));
    body.querySelectorAll<HTMLButtonElement>('[data-inferno]').forEach((b) => b.addEventListener('click', () => {
      if (save.shards < INFERNO_COST) { host.playUi('uiDeny'); return; }
      save.shards -= INFERNO_COST;
      save.spells.inferno = true;
      host.persist();
      host.playUi('upgrade');
      render();
    }));
    body.querySelectorAll<HTMLButtonElement>('[data-robe]').forEach((b) => b.addEventListener('click', () => {
      save.cosmetics.robeGlow = b.dataset.robe as string;
      host.persist();
      host.playUi('uiClick');
      render();
    }));
    bind(body, host, { back: () => goBack(host, back) });
    host.action('refocus');
  };
  render();
  return root;
}

function goBack(host: ScreenHost, back: unknown): void {
  if (back && typeof back === 'object' && (back as { back: string }).back === 'briefing') host.go('briefing', (back as { sector: number }).sector);
  else if (back === 'pause') host.go('pause');
  else if (back === 'campaign') host.go('campaign');
  else host.go('title');
}

// ------------------------------------------------------------------ settings

interface SettingSpec {
  key: keyof Settings;
  label: string;
  type: 'range' | 'check' | 'select';
  min?: number;
  max?: number;
  step?: number;
  options?: [string, string][];
}

const SETTING_SPECS: SettingSpec[] = [
  { key: 'master', label: 'Master volume', type: 'range', min: 0, max: 1, step: 0.05 },
  { key: 'sfx', label: 'SFX volume', type: 'range', min: 0, max: 1, step: 0.05 },
  { key: 'music', label: 'Music volume', type: 'range', min: 0, max: 1, step: 0.05 },
  { key: 'voice', label: 'Voice / radio chatter volume', type: 'range', min: 0, max: 1, step: 0.05 },
  { key: 'controlScheme', label: 'Control mapping', type: 'select', options: [['default', 'Space = Blink · Shift = Ward'], ['swapped', 'Space = Ward · Shift = Blink']] },
  { key: 'aimAssist', label: 'Aim-assist strength', type: 'range', min: 0, max: 1, step: 0.1 },
  { key: 'touchMode', label: 'Touch controls', type: 'select', options: [['auto', 'Automatic'], ['on', 'Always on'], ['off', 'Off']] },
  { key: 'touchOpacity', label: 'Touch control opacity', type: 'range', min: 0.15, max: 1, step: 0.05 },
  { key: 'haptics', label: 'Haptic feedback', type: 'check' },
  { key: 'reducedMotion', label: 'Reduced motion (no shake / flashes / tilt)', type: 'check' },
  { key: 'colorblind', label: 'Colour-blind mode', type: 'select', options: [['none', 'Off'], ['deuteranopia', 'Deuteranopia'], ['protanopia', 'Protanopia'], ['tritanopia', 'Tritanopia']] },
  { key: 'quality', label: 'Graphics quality', type: 'select', options: [['auto', 'Automatic (downscales below 45 FPS)'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']] },
  { key: 'pixelStyle', label: 'Pixel style', type: 'select', options: [['crisp', 'Crisp (fine pixels)'], ['classic', 'Classic'], ['chunky', 'Chunky']] },
  { key: 'subtitles', label: 'Subtitles', type: 'check' },
  { key: 'narration', label: 'Narrated briefings (offline system voice)', type: 'check' },
  { key: 'speedrunTimer', label: 'Speedrun timer', type: 'check' },
  { key: 'showFps', label: 'Show FPS', type: 'check' },
];

export function settingsScreen(host: ScreenHost, back: unknown): HTMLElement {
  const st = host.save.settings;
  const rows = SETTING_SPECS.map((sp, i) => {
    const id = `set-${i}`;
    const v = st[sp.key];
    let ctl = '';
    if (sp.type === 'range') ctl = `<input id="${id}" type="range" min="${sp.min}" max="${sp.max}" step="${sp.step}" value="${v}" data-key="${sp.key}">`;
    else if (sp.type === 'check') ctl = `<input id="${id}" type="checkbox" ${v ? 'checked' : ''} data-key="${sp.key}">`;
    else ctl = `<select id="${id}" data-key="${sp.key}">${(sp.options || []).map(([val, lab]) => `<option value="${val}" ${val === v ? 'selected' : ''}>${lab}</option>`).join('')}</select>`;
    return `<div class="set-row"><label for="${id}">${sp.label}</label>${ctl}</div>`;
  }).join('');
  const root = h(`
    <div class="screen cosmic" data-back="x">
      <div class="panel settings">
        <h2>Settings</h2>
        ${rows}
        <h3>Controls</h3>
        <p style="font-size:0.85em"><b>Keyboard &amp; mouse:</b> WASD / Arrows move · Mouse aims · LMB Arcane Bolt (hold) · RMB secondary spell · 1–4 / wheel select spell · Space Blink · Shift Ward (hold; raise just before a hit to reflect) · E interact / R channel · Q Frost Bomb · F Health / G Mana potion · Esc pause · Tab map · ~ dev console · F8 free camera · F7 orbit camera · F12 / F9 screenshot</p>
        <p style="font-size:0.85em"><b>Gamepad:</b> L-stick move · R-stick aim · R2 Arcane Bolt · R1 secondary · L2 Ward · A Blink · X Channel / interact · B Potion · Y cycle spell · L1 Frost Bomb · D-pad spell slots · Start pause</p>
        <p style="font-size:0.85em"><b>Touch:</b> left stick move · right stick aim + auto-cast · BLINK · WARD (hold) · SPELL · USE · POTION · BOMB · CYCLE</p>
        <div class="btn-row">
          <button class="btn" data-act="reset">Reset Save Data…</button>
          <button class="btn primary" data-act="back" data-autofocus>Done</button>
        </div>
      </div>
    </div>`);
  root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-key]').forEach((inp) => {
    inp.addEventListener('input', () => {
      const key = inp.dataset.key as keyof Settings;
      const rec = st as unknown as Record<string, unknown>;
      if (inp instanceof HTMLInputElement && inp.type === 'checkbox') rec[key] = inp.checked;
      else if (inp instanceof HTMLInputElement && inp.type === 'range') rec[key] = Number(inp.value);
      else rec[key] = inp.value;
      host.persist();
      host.action('applySettings');
    });
  });
  bind(root, host, {
    back: () => goBack(host, back),
    reset: () => {
      if (window.confirm('Erase all campaign progress, shards and upgrades? Settings are kept.')) host.action('resetSave');
    },
  });
  return root;
}

// ------------------------------------------------------------------ credits

export function creditsScreen(host: ScreenHost): HTMLElement {
  const root = h(`
    <div class="screen cosmic" data-back="title">
      <div class="panel" style="width:36em;text-align:center">
        <h2>Credits</h2>
        <p><b>${GAME_TITLE}</b> — v${VERSION}</p>
        <p>Design, code, procedural art &amp; synthesized audio built for this project.</p>
        <p>Rendering: three.js (MIT License) · Everything else is hand-written TypeScript, Web Audio and Canvas.</p>
        <p>All models, textures, music and sound effects are generated procedurally at runtime — no external assets, fully offline.</p>
        <p>Visual direction inspired by pixel-art 3D dioramas; gameplay inspired by Magicka, Helldivers and Alien Swarm.</p>
        <div class="btn-row"><button class="btn primary" data-act="back" data-autofocus>Back</button></div>
      </div>
    </div>`);
  bind(root, host, { back: () => host.go('title') });
  return root;
}

// ------------------------------------------------------------------ challenges (sector speedruns)

export function challengeScreen(host: ScreenHost): HTMLElement {
  const c = host.save.campaign;
  const rows = SECTORS.map((m, i) => {
    const ok = c.completed[i];
    const best = c.bestTimes[i];
    return `<div class="up-row"><div><b>Speedrun · Sector ${i + 1}: ${m.name}</b><div class="desc">${ok ? `Best clear: ${best ? formatTime(best) : '—'}` : 'Complete this sector in the campaign to unlock.'}</div></div><div>${starsHtml(c.stars[i])}</div>
      <button class="btn small center" data-run="${i}" ${ok ? '' : 'disabled'}>Run</button></div>`;
  }).join('');
  const root = h(`
    <div class="screen cosmic" data-back="title">
      <div class="panel sanctum">
        <h2>Challenge Trials</h2>
        <p>Replay any cleared sector against the clock. The speedrun timer is shown on the HUD and best times are saved.</p>
        ${rows}
        <div class="btn-row"><button class="btn primary" data-act="back" data-autofocus>Back</button></div>
      </div>
    </div>`);
  root.querySelectorAll<HTMLButtonElement>('[data-run]').forEach((b) => b.addEventListener('click', () => {
    host.playUi('uiClick');
    host.action('speedrun', Number(b.dataset.run));
  }));
  bind(root, host, { back: () => host.go('title') });
  return root;
}

// ------------------------------------------------------------------ pause & map

export function pauseScreen(host: ScreenHost): HTMLElement {
  const root = h(`
    <div class="screen dim" data-back="resume">
      <div class="magic-circle"></div>
      <div class="panel" style="min-width:20em">
        <h2>Paused</h2>
        <div class="menu">
          <button class="btn primary" data-act="resume" data-autofocus>Resume</button>
          <button class="btn" data-act="map">Dimensional Map &amp; Objectives</button>
          <button class="btn" data-act="settings">Controls / Audio Settings</button>
          <button class="btn" data-act="checkpoint">Restart from Checkpoint</button>
          <button class="btn" data-act="restart">Restart Mission</button>
          <button class="btn" data-act="menu">Main Menu</button>
        </div>
      </div>
    </div>`);
  bind(root, host, {
    resume: () => host.action('resume'),
    map: () => host.go('map'),
    settings: () => host.go('settings', 'pause'),
    checkpoint: () => host.action('restartCheckpoint'),
    restart: () => host.action('restartMission'),
    menu: () => host.action('mainMenu'),
  });
  return root;
}

export function mapScreen(host: ScreenHost, level: LevelData, lines: { text: string; done: boolean }[], mapCache: Map<string, HTMLCanvasElement>, px: number, pz: number): HTMLElement {
  const root = h(`
    <div class="screen dim" data-back="pause">
      <div class="panel briefing">
        <div><h2>${escapeHtml(level.name)}</h2><canvas class="rift-map"></canvas></div>
        <div><h3>Current Objectives</h3><ul class="obj-list">${lines.map((l) => `<li style="${l.done ? 'text-decoration:line-through;opacity:.7' : ''}">${escapeHtml(l.text)}</li>`).join('')}</ul>
        <div class="btn-row"><button class="btn primary" data-act="back" data-autofocus>Back</button></div></div>
      </div>
    </div>`);
  const cv = root.querySelector('canvas') as HTMLCanvasElement;
  drawRiftMap(cv, level, mapCache);
  const g = cv.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#5fd8ff';
  g.beginPath(); g.arc(px * 4, pz * 4, 8, 0, Math.PI * 2); g.fill();
  bind(root, host, { back: () => host.go('pause') });
  return root;
}

// ------------------------------------------------------------------ results / defeat

export function resultsScreen(host: ScreenHost, r: ResultsData): HTMLElement {
  const root = h(`
    <div class="screen cosmic" data-back="none">
      <div class="panel results">
        <h2>${r.victory ? 'Mission Complete' : 'Mission Failed'}</h2>
        <p>${escapeHtml(r.name)}</p>
        <div style="display:flex;justify-content:space-around;align-items:center;margin:0.6em 0">
          <div><div style="color:var(--muted);font-size:0.8em">ARCANE EFFICIENCY</div><div class="rating">${r.rating}</div></div>
          <div><div style="color:var(--muted);font-size:0.8em">CHALLENGE STARS</div><div class="big-stars">${starsHtml(r.stars)}</div></div>
          <div><div style="color:var(--muted);font-size:0.8em">CRYSTAL SHARDS</div><div class="shards" style="font-size:1.8em">+${r.shards}</div></div>
        </div>
        ${r.bestTime ? '<p style="color:var(--ok)">New best clear time!</p>' : ''}
        ${r.unlocked ? `<p style="color:var(--arc);font-size:1.1em">NEW SPELL UNLOCKED: ${escapeHtml(r.unlocked.toUpperCase())}</p>` : ''}
        <div class="stat-grid">${r.stats.map((s) => `<div><span>${escapeHtml(s.label)}</span><b>${escapeHtml(s.value)}</b></div>`).join('')}</div>
        <div class="btn-row">
          ${r.hasNext ? '<button class="btn primary" data-act="next" data-autofocus>Next Level</button>' : ''}
          <button class="btn${r.hasNext ? '' : ' primary'}" data-act="replay" ${r.hasNext ? '' : 'data-autofocus'}>Replay</button>
          <button class="btn" data-act="sanctum">Grimoire Sanctum</button>
          <button class="btn" data-act="menu">Main Menu</button>
        </div>
      </div>
    </div>`);
  bind(root, host, {
    next: () => host.action('nextMission'),
    replay: () => host.action('replay'),
    sanctum: () => host.go('sanctum', 'campaign'),
    menu: () => host.action('mainMenu'),
  });
  return root;
}

export function defeatScreen(host: ScreenHost, reason: string): HTMLElement {
  const title = reason === 'catalyst' ? 'The Catalyst Has Shattered' : 'Fallen in Battle';
  const text = reason === 'catalyst' ? 'The Vanguard destroyed the Rift Crystal Catalyst. The anchor remains open.' : 'Valerius\' mana gutters out beneath the guns of the Vanguard.';
  const root = h(`
    <div class="screen dim" data-back="none">
      <div class="magic-circle"></div>
      <div class="panel" style="text-align:center;min-width:22em">
        <h2 style="color:#ffb0a0">${title}</h2>
        <p>${text}</p>
        <div class="menu" style="margin-top:0.8em">
          <button class="btn primary" data-act="checkpoint" data-autofocus>Retry from Checkpoint</button>
          <button class="btn" data-act="restart">Restart Mission</button>
          <button class="btn" data-act="menu">Main Menu</button>
        </div>
      </div>
    </div>`);
  bind(root, host, {
    checkpoint: () => host.action('restartCheckpoint'),
    restart: () => host.action('restartMission'),
    menu: () => host.action('mainMenu'),
  });
  return root;
}
