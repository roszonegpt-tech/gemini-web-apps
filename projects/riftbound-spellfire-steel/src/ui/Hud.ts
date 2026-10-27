// In-mission HUD: portrait + health / mana / ward bars (top-left), spell slots with
// cooldowns and potion counters (top-right), objective tracker (top-centre), boss bar,
// minimap (bottom-left) and contextual action prompt (bottom-right).
import { SPELLS } from '../config/balance';
import type { Device } from '../core/Input';
import { GoliathTank } from '../entities/Boss';
import type { World } from '../scenes/World';
import { formatTime } from '../utils/math';
import { ICONS } from './icons';

const KEYS: Record<Device, Record<string, string>> = {
  kbm: { interact: 'E', bolt: 'LMB', sec: 'RMB', blink: 'SPACE', ward: 'SHIFT', bomb: 'Q', hp: 'F', mp: 'G' },
  pad: { interact: 'X', bolt: 'R2', sec: 'R1', blink: 'A', ward: 'L2', bomb: 'L1', hp: 'B', mp: 'B' },
  touch: { interact: 'USE', bolt: 'AIM', sec: 'SPELL', blink: 'BLINK', ward: 'WARD', bomb: 'BOMB', hp: 'POT', mp: 'POT' },
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
}

export class Hud {
  root: HTMLElement;
  minimap: HTMLCanvasElement;
  private hp!: { bar: HTMLElement; fill: HTMLElement; lag: HTMLElement; txt: HTMLElement };
  private mana!: { bar: HTMLElement; fill: HTMLElement; lag: HTMLElement; txt: HTMLElement };
  private ward!: { bar: HTMLElement; fill: HTMLElement; lag: HTMLElement; txt: HTMLElement };
  private status!: HTMLElement;
  private slots: { el: HTMLElement; cd: HTMLElement; id: string }[] = [];
  private spellName!: HTMLElement;
  private cons!: HTMLElement;
  private obj!: HTMLElement;
  private timer!: HTMLElement;
  private prompt!: HTMLElement;
  private boss!: HTMLElement;
  private bossName!: HTMLElement;
  private bossFill!: HTMLElement;
  private fps!: HTMLElement;
  private cache = new Map<HTMLElement, string>();
  private objT = 0;

  constructor(root: HTMLElement) {
    this.root = root;
    root.innerHTML = '';
    const tl = el('div', 'hud-tl', root);
    el('div', 'portrait', tl, ICONS.portrait);
    const bars = el('div', 'bars', tl);
    const mk = (cls: string) => {
      const bar = el('div', `bar ${cls}`, bars);
      const lag = el('div', 'lag', bar);
      const fill = el('div', 'fill', bar);
      const txt = el('div', 'txt', bar);
      return { bar, fill, lag, txt };
    };
    this.hp = mk('hp');
    this.mana = mk('mana');
    this.ward = mk('ward');
    this.status = el('div', 'status-row', bars);

    const tr = el('div', 'hud-tr', root);
    const slotsRow = el('div', 'spell-slots', tr);
    const addSlot = (id: string, key: string, extra = '') => {
      const s = el('div', `sp-slot ${extra}`, slotsRow, ICONS[id] || '');
      const cd = el('div', 'cd', s);
      el('div', 'k', s, key);
      this.slots.push({ el: s, cd, id });
    };
    addSlot('arcaneBolt', 'LMB', 'primary');
    for (let i = 0; i < 4; i++) addSlot(`slot${i}`, String(i + 1));
    addSlot('blink', '␣');
    this.spellName = el('div', 'spell-name', tr);
    this.cons = el('div', 'consumables', tr);

    const tc = el('div', 'hud-tc', root);
    this.obj = el('div', 'objectives', tc);
    this.timer = el('div', 'timer hidden', tc);

    this.boss = el('div', 'boss-bar hidden', root);
    this.bossName = el('div', 'name', this.boss);
    const bb = el('div', 'bar', this.boss);
    this.bossFill = el('div', 'fill', bb);

    const bl = el('div', 'hud-bl', root);
    this.minimap = el('canvas', '', bl);
    this.minimap.id = 'minimap';
    this.minimap.width = 180;
    this.minimap.height = 180;

    const br = el('div', 'hud-br', root);
    this.prompt = el('div', 'prompt hidden', br);
    this.fps = el('div', 'fps hidden', root);
  }

  private setText(e: HTMLElement, t: string): void {
    if (this.cache.get(e) !== t) {
      this.cache.set(e, t);
      e.textContent = t;
    }
  }

  private setHtml(e: HTMLElement, t: string): void {
    if (this.cache.get(e) !== t) {
      this.cache.set(e, t);
      e.innerHTML = t;
    }
  }

  private setBar(b: { fill: HTMLElement; lag: HTMLElement; txt: HTMLElement }, v: number, max: number, label: string): void {
    const pct = `${Math.max(0, Math.min(100, (v / max) * 100)).toFixed(1)}%`;
    b.fill.style.width = pct;
    b.lag.style.width = pct;
    this.setText(b.txt, `${label} ${Math.ceil(Math.max(0, v))} / ${Math.round(max)}`);
  }

  update(w: World, dt: number, device: Device, timer: number | null, fpsText: string | null): void {
    const p = w.player;
    const keys = KEYS[device];
    this.setBar(this.hp, p.hp, p.maxHp, 'HEALTH');
    this.hp.bar.classList.toggle('low', p.hp / p.maxHp < 0.3);
    this.setBar(this.mana, p.mana, p.maxMana, 'MANA');
    this.setBar(this.ward, p.ward, p.wardMax, p.wardBroken > 0 ? 'WARD BROKEN' : p.wardUp ? 'WARD ▲' : 'WARD');
    this.ward.bar.classList.toggle('broken', p.wardBroken > 0);
    const st: string[] = [];
    if (p.inSmoke) st.push('<span style="color:#c9c3d9">Anti-magic smoke · spells cost more</span>');
    if (p.inPool) st.push('<span style="color:#c08aff">Mana pool · regen ×3 · wet</span>');
    if (p.burnT > 0) st.push('<span style="color:#ffa04a">Burning</span>');
    if (p.slowT > 0) st.push('<span style="color:#ddd">Slowed</span>');
    this.setHtml(this.status, st.join(''));

    // spell slots
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      let id = s.id;
      if (id.indexOf('slot') === 0) {
        const n = Number(id.slice(4));
        id = p.loadout[n];
        const icon = id === 'flameBurst' && w.services.save.spells.inferno ? 'inferno' : id;
        if (s.el.dataset.icon !== icon) {
          s.el.dataset.icon = icon;
          s.el.innerHTML = `${ICONS[icon] || ''}<div class="cd"></div><div class="k">${n + 1}</div>`;
          s.cd = s.el.querySelector('.cd') as HTMLElement;
        }
        s.el.classList.toggle('active', n === p.slot);
        s.el.classList.toggle('locked', !p.isUnlocked(id as never));
      }
      const frac = p.cooldownFrac(id);
      s.cd.style.transform = `scaleY(${frac})`;
      s.cd.style.display = frac > 0.01 ? 'block' : 'none';
    }
    const sec = p.secondary;
    const secName = sec === 'flameBurst' && w.services.save.spells.inferno ? 'Inferno Fireball' : SPELLS[sec].name;
    this.setText(this.spellName, `${keys.sec}: ${secName} (${SPELLS[sec].mana} mana)`);
    this.setHtml(this.cons,
      `<div><span class="k">${keys.hp}</span> ${p.hpPotions}x Health Potion</div>` +
      `<div><span class="k">${keys.mp}</span> ${p.manaPotions}x Mana Potion</div>` +
      `<div><span class="k">${keys.bomb}</span> ${p.bombs}x Frost Bomb</div>`);

    // objectives
    this.objT -= dt;
    if (w.objectives.dirty || this.objT <= 0) {
      w.objectives.dirty = false;
      this.objT = 0.3;
      const zone = w.level.zones[w.activeZone];
      const lines = w.objectives.hudLines();
      this.setHtml(this.obj, `<div class="zone">${w.level.name} · ${zone ? zone.name : ''}</div>` +
        lines.map((l) => `<div class="o${l.done ? ' done' : ''}${l.optional ? ' opt' : ''}">${l.optional ? '(Bonus) ' : ''}${escapeHtml(l.text)}</div>`).join(''));
    }
    if (timer !== null) {
      this.timer.classList.remove('hidden');
      this.setText(this.timer, `⏱ ${formatTime(timer)}`);
    } else this.timer.classList.add('hidden');

    // prompt
    const f = p.focus;
    if (f && p.alive && !w.cinematicLock) {
      const text = f.prompt(w);
      if (text) {
        this.prompt.classList.remove('hidden');
        const hold = f.holdTime(w);
        const prog = p.channelTarget === f && hold > 0 ? Math.min(1, p.channelT / hold) : 0;
        this.setHtml(this.prompt, `<span class="key">${keys.interact}</span><span>${hold > 0 ? 'Hold · ' : ''}${escapeHtml(text)}</span>`);
        this.prompt.style.boxShadow = prog > 0 ? `inset ${(prog * 16).toFixed(1)}em 0 0 rgba(255,216,74,0.35)` : '';
      } else this.prompt.classList.add('hidden');
    } else this.prompt.classList.add('hidden');

    // boss
    const b = w.bossActor;
    if (b && (b.alive || (b instanceof GoliathTank && b.phase !== 'wrecked')) && !(b instanceof GoliathTank && b.phase === 'dormant')) {
      this.boss.classList.remove('hidden');
      const shielded = b instanceof GoliathTank && b.shielded;
      this.boss.classList.toggle('shielded', shielded);
      this.setText(this.bossName, `${b.name.toUpperCase()}${shielded ? '  —  SHIELDED' : ''}`);
      this.bossFill.style.width = `${Math.max(0, (b.hp / b.maxHp) * 100).toFixed(1)}%`;
    } else this.boss.classList.add('hidden');

    if (fpsText) {
      this.fps.classList.remove('hidden');
      this.setText(this.fps, fpsText);
    } else this.fps.classList.add('hidden');
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
}
