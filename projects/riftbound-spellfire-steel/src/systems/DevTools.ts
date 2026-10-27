// Developer console (~ / backquote): inspectors (colliders, nav grid, LOS cones),
// cheats (god mode, infinite mana, no cooldowns), spawn / kill / teleport tools, save
// reset + JSON import/export, and a performance readout.
import type { Services } from '../core/Services';

export interface DevHost {
  services: Services;
  devAction(name: string, arg?: unknown): void;
  perfText(): string;
}

export class DevTools {
  el: HTMLElement;
  open = false;
  private host: DevHost;
  private perfEl: HTMLElement | null = null;
  private logEl: HTMLElement | null = null;
  private t = 0;

  constructor(host: DevHost) {
    this.host = host;
    this.el = document.getElementById('dev') as HTMLElement;
  }

  toggle(): void {
    this.open = !this.open;
    this.el.classList.toggle('hidden', !this.open);
    if (this.open) this.render();
  }

  private render(): void {
    const d = this.host.services.dev;
    const flags: [keyof typeof d, string][] = [
      ['god', 'God mode'], ['infiniteMana', 'Infinite mana / bombs'], ['noCooldowns', 'No spell cooldowns'], ['allSpells', 'All spells unlocked'],
      ['colliders', 'Render collision boxes + cover points'], ['nav', 'Pathfinding grid overlay'], ['los', 'Enemy line-of-sight cones + paths'],
    ];
    this.el.innerHTML = `
      <b>RIFTBOUND DEV CONSOLE</b> <button data-a="close">close ~</button>
      <h4>Cheats &amp; inspectors</h4>
      ${flags.map(([k, l]) => `<label><input type="checkbox" data-flag="${k}" ${d[k] ? 'checked' : ''}> ${l}</label>`).join('')}
      <h4>Spawn &amp; reset</h4>
      <button data-a="squad">Spawn soldier squad</button><button data-a="heli">Spawn helicopter</button><button data-a="killAll">Instant kill all</button>
      <button data-a="completeZone">Complete zone objectives</button><button data-a="well">Spawn mana well</button><button data-a="golem">Spawn ally golem</button>
      <h4>Fast travel</h4>
      <button data-a="sector" data-n="0">Sector 1</button><button data-a="sector" data-n="1">Sector 2</button><button data-a="sector" data-n="2">Sector 3</button><button data-a="sector" data-n="3">Sector 4</button>
      <h4>Cameras &amp; capture</h4>
      <button data-a="freecam">Free camera (F8)</button><button data-a="orbit">Orbit camera (F7)</button><button data-a="shot">Screenshot PNG (F12/F9)</button>
      <h4>Data</h4>
      <button data-a="exportStats">Export level stats JSON</button><button data-a="exportSave">Export save JSON</button>
      <button data-a="importSave">Import save JSON</button><button data-a="resetSave">Reset save data</button>
      <h4>Performance</h4><div class="perf" style="white-space:pre"></div>
      <h4>Recovered errors</h4><div class="log"></div>`;
    this.perfEl = this.el.querySelector('.perf');
    this.logEl = this.el.querySelector('.log');
    this.el.querySelectorAll<HTMLInputElement>('[data-flag]').forEach((cb) => cb.addEventListener('change', () => {
      (d as unknown as Record<string, boolean>)[cb.dataset.flag as string] = cb.checked;
    }));
    this.el.querySelectorAll<HTMLButtonElement>('[data-a]').forEach((b) => b.addEventListener('click', () => {
      const a = b.dataset.a as string;
      if (a === 'close') { this.toggle(); return; }
      this.host.devAction(a, b.dataset.n !== undefined ? Number(b.dataset.n) : undefined);
    }));
  }

  update(dt: number): void {
    if (!this.open) return;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.5;
    if (this.perfEl) this.perfEl.textContent = this.host.perfText();
    if (this.logEl) this.logEl.textContent = this.host.services.engine.errorLog.slice(-8).join('\n') || 'none';
  }
}

export function downloadText(name: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

export function pickFile(accept: string, cb: (text: string) => void): void {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = accept;
  inp.addEventListener('change', () => {
    const f = inp.files && inp.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => cb(String(r.result || ''));
    r.readAsText(f);
  });
  inp.click();
}
