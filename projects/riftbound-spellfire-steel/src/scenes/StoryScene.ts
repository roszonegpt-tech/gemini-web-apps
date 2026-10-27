// Narrative sequences drawn on a 2D canvas: the opening briefing (two worlds colliding,
// the rift tearing open, the fused warzone map) with High Priestess Lyra's voice-over,
// and the ending (the Rift Heart sealing, the Vanguard retreating). Subtitles are always
// shown; optional narration uses the offline system speech voice. Hold Space / A or
// press SKIP to bypass.
import type { GameState } from '../core/StateManager';
import type { Services } from '../core/Services';

interface Line {
  who: string;
  text: string;
  dur: number;
}

const INTRO: Line[] = [
  { who: 'High Priestess Lyra', text: 'Valerius… can you hear me? The sky over Elyria has torn open.', dur: 5.5 },
  { who: 'High Priestess Lyra', text: 'Three days ago the Shattering fused our realm with a world called Earth. Our floating isles now drift above their iron airfields.', dur: 6.5 },
  { who: 'High Priestess Lyra', text: 'Their 101st Vanguard Division believes we invaded them. They answered with fire, steel and engines of war.', dur: 6 },
  { who: 'High Priestess Lyra', text: 'General Vance has driven rift anchors into the wound between worlds. With them, his dimensional drill warheads will split both realms apart.', dur: 7 },
  { who: 'High Priestess Lyra', text: 'Cross the Shattered Threshold. Seal the anchors. Stop Vance before the drills are armed.', dur: 5.5 },
  { who: 'High Priestess Lyra', text: 'Go, Archmage. The Arcane Guard is with you.', dur: 4 },
];

const ENDING: Line[] = [
  { who: 'High Priestess Lyra', text: 'The Rift Heart is sealed. The boundary… it\'s holding.', dur: 5 },
  { who: 'High Priestess Lyra', text: 'Vance\'s battalion is falling back through the last open gates. Without the anchors, their drills are useless.', dur: 6.5 },
  { who: 'High Priestess Lyra', text: 'Neither world is whole, Valerius — but both still stand. Perhaps, in time, they will learn we never wanted this war.', dur: 7 },
  { who: '', text: 'Chapter One: The Shattered Threshold — Complete.', dur: 4.5 },
];

export class StoryScene implements GameState {
  readonly name = 'story';
  private svc: Services;
  private el: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private lines: Line[] = INTRO;
  private kind: 'intro' | 'ending' = 'intro';
  private t = 0;
  private lineI = -1;
  private lineT = 0;
  private holdT = 0;
  private subEl: HTMLElement | null = null;
  private ringEl: HTMLElement | null = null;
  private stars: [number, number, number][] = [];
  onDone: (() => void) | null = null;
  private finished = false;

  constructor(svc: Services) {
    this.svc = svc;
    for (let i = 0; i < 220; i++) this.stars.push([Math.random(), Math.random(), Math.random()]);
  }

  enter(params?: unknown): void {
    const p = params as { kind: 'intro' | 'ending'; onDone: () => void };
    this.kind = p.kind;
    this.onDone = p.onDone;
    this.lines = p.kind === 'intro' ? INTRO : ENDING;
    this.t = 0;
    this.lineI = -1;
    this.lineT = 0;
    this.holdT = 0;
    this.finished = false;
    const stage = document.getElementById('stage') as HTMLElement;
    const el = document.createElement('div');
    el.className = 'story ui-interactive';
    el.innerHTML = `<canvas></canvas><button class="btn small skip-btn">SKIP</button><div class="skip-ring">Hold SPACE / A to skip</div><div style="position:absolute;left:8%;right:8%;bottom:9%;text-align:center"><div class="sub-line"></div></div>`;
    stage.appendChild(el);
    this.el = el;
    this.canvas = el.querySelector('canvas');
    this.ctx = (this.canvas as HTMLCanvasElement).getContext('2d');
    this.subEl = el.querySelector('.sub-line');
    this.ringEl = el.querySelector('.skip-ring');
    (el.querySelector('.skip-btn') as HTMLElement).addEventListener('click', () => this.finish());
    this.svc.music.play(p.kind === 'intro' ? 'title' : 'victory');
    this.resize();
  }

  exit(): void {
    if (window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    }
    if (this.el) this.el.remove();
    this.el = null;
  }

  private resize(): void {
    if (!this.canvas) return;
    const eng = this.svc.engine;
    this.canvas.width = Math.round(eng.width / 2);
    this.canvas.height = Math.round(eng.height / 2);
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.svc.audio.play('uiClick');
    const cb = this.onDone;
    if (cb) cb();
  }

  private speak(text: string): void {
    const s = this.svc.settings;
    if (!s.narration || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') return;
    try {
      const synth = window.speechSynthesis;
      synth.cancel();
      const voices = synth.getVoices().filter((v) => v.localService && /^en/i.test(v.lang));
      const voice = voices.find((v) => /female|samantha|zira|karen|moira|serena|victoria|libby|hazel/i.test(v.name)) || voices[0];
      if (!voice) return; // only use offline voices: never trigger a network voice
      const u = new SpeechSynthesisUtterance(text);
      u.voice = voice;
      u.rate = 0.95;
      u.pitch = 1.05;
      u.volume = Math.max(0, Math.min(1, s.master * s.voice));
      synth.speak(u);
    } catch {
      /* narration is optional */
    }
  }

  update(dt: number): void {
    if (this.finished) return;
    this.t += dt;
    this.lineT -= dt;
    if (this.lineT <= 0) {
      this.lineI++;
      if (this.lineI >= this.lines.length) {
        this.finish();
        return;
      }
      const l = this.lines[this.lineI];
      this.lineT = l.dur;
      if (this.subEl) this.subEl.innerHTML = `<span class="sub">${l.who ? `<span class="who">${l.who}:</span>` : ''}${l.text}</span>`;
      if (!this.svc.settings.subtitles && this.subEl && l.who) this.subEl.innerHTML = '';
      this.speak(l.text);
    }
    const inp = this.svc.input;
    if (inp.isDown('skip') || inp.isDown('confirm')) {
      this.holdT += dt;
      if (this.ringEl) this.ringEl.textContent = `Skipping… ${Math.min(100, Math.round((this.holdT / 0.8) * 100))}%`;
      if (this.holdT > 0.8) this.finish();
    } else {
      this.holdT = 0;
      if (this.ringEl) this.ringEl.textContent = 'Hold SPACE / A to skip';
    }
    if (inp.pressed('back')) this.finish();
  }

  render(): void {
    const c = this.ctx, cv = this.canvas;
    if (!c || !cv) return;
    if (cv.width !== Math.round(this.svc.engine.width / 2)) this.resize();
    const W = cv.width, H = cv.height;
    c.fillStyle = '#05020a';
    c.fillRect(0, 0, W, H);
    const t = this.t;
    for (const [x, y, b] of this.stars) {
      c.fillStyle = `rgba(255,255,255,${(0.3 + 0.7 * b * (0.6 + 0.4 * Math.sin(t * 2 + x * 40))).toFixed(2)})`;
      c.fillRect(Math.floor(x * W), Math.floor(y * H), b > 0.8 ? 2 : 1, b > 0.8 ? 2 : 1);
    }
    if (this.kind === 'intro') this.drawIntro(c, W, H, t);
    else this.drawEnding(c, W, H, t);
  }

  private drawIntro(c: CanvasRenderingContext2D, W: number, H: number, t: number): void {
    const cx = W / 2, cy = H * 0.45;
    const R = H * 0.18;
    const meet = Math.min(1, t / 11);
    if (t < 15) {
      // two worlds drifting together
      const off = (1 - meet) * W * 0.28 + R * 0.85;
      this.planet(c, cx - off, cy, R, '#5a2ca0', '#b36bff', true, t);
      this.planet(c, cx + off, cy, R, '#1f5a8a', '#5fae5a', false, t);
      c.fillStyle = '#d9b8ff';
      c.font = `${Math.round(H / 26)}px Georgia`;
      c.textAlign = 'center';
      c.fillText('ELYRIA', cx - off, cy + R + H / 18);
      c.fillStyle = '#b8e0ff';
      c.fillText('EARTH', cx + off, cy + R + H / 18);
      if (meet >= 1) {
        const k = Math.min(1, (t - 11) / 1.5);
        c.fillStyle = `rgba(255,255,255,${(1 - k).toFixed(2)})`;
        c.fillRect(0, 0, W, H);
        this.riftCrack(c, cx, cy, H * 0.5 * k, t);
      }
    } else if (t < 26) {
      // the fused warzone map
      this.riftCrack(c, cx, cy, H * 0.5, t);
      const pts: [number, number, string][] = [[0.22, 0.62, 'I · Rift Arrival'], [0.4, 0.4, 'II · Trenches of Elyria'], [0.6, 0.58, 'III · Supply Outpost'], [0.78, 0.36, 'IV · The Rift Heart']];
      c.strokeStyle = 'rgba(255,216,74,0.6)';
      c.setLineDash([4, 4]);
      c.lineWidth = 2;
      c.beginPath();
      pts.forEach(([x, y], i) => (i ? c.lineTo(x * W, y * H) : c.moveTo(x * W, y * H)));
      c.stroke();
      c.setLineDash([]);
      pts.forEach(([x, y, label], i) => {
        const on = t - 15 > i * 1.6;
        c.fillStyle = on ? (i === 3 ? '#ff4a4a' : '#ffd84a') : '#4a3a60';
        c.beginPath(); c.arc(x * W, y * H, H / 50, 0, Math.PI * 2); c.fill();
        if (on) {
          c.fillStyle = '#fff';
          c.font = `${Math.round(H / 32)}px Trebuchet MS`;
          c.textAlign = 'center';
          c.fillText(label, x * W, y * H - H / 30);
        }
      });
      if (t > 22) {
        c.fillStyle = '#ff6a5a';
        c.font = `${Math.round(H / 28)}px Georgia`;
        c.fillText('GENERAL VANCE · IRON GOLIATH', 0.78 * W, 0.36 * H + H / 14);
      }
    } else {
      // Valerius silhouette before the rift
      this.riftCrack(c, cx, cy, H * 0.55, t);
      const k = Math.min(1, (t - 26) / 2);
      c.globalAlpha = k;
      c.fillStyle = '#120a22';
      const bx = cx, by = H * 0.86;
      c.beginPath();
      c.moveTo(bx - H * 0.08, by); c.lineTo(bx - H * 0.03, by - H * 0.22); c.lineTo(bx + H * 0.03, by - H * 0.22); c.lineTo(bx + H * 0.08, by);
      c.fill();
      c.beginPath();
      c.moveTo(bx - H * 0.07, by - H * 0.22); c.lineTo(bx + H * 0.02, by - H * 0.42); c.lineTo(bx + H * 0.07, by - H * 0.22);
      c.fill();
      c.fillRect(bx + H * 0.09, by - H * 0.36, 3, H * 0.36);
      c.fillStyle = '#b36bff';
      c.beginPath(); c.arc(bx + H * 0.09 + 1, by - H * 0.37, H * 0.015, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 1;
      c.fillStyle = '#fff';
      c.font = `${Math.round(H / 12)}px Georgia`;
      c.textAlign = 'center';
      c.fillText('RIFTBOUND', cx, H * 0.18);
    }
  }

  private drawEnding(c: CanvasRenderingContext2D, W: number, H: number, t: number): void {
    const cx = W / 2, cy = H * 0.42;
    const close = Math.min(1, t / 9);
    this.riftCrack(c, cx, cy, H * 0.5 * (1 - close * 0.9), t);
    // sealing rune circle
    c.strokeStyle = `rgba(127,216,255,${(0.4 + 0.6 * close).toFixed(2)})`;
    c.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.arc(cx, cy, H * (0.12 + i * 0.06) * (0.6 + close * 0.4), t * (i % 2 ? -0.6 : 0.6), t * (i % 2 ? -0.6 : 0.6) + Math.PI * 1.7);
      c.stroke();
    }
    // retreating convoy
    const base = H * 0.8;
    for (let i = 0; i < 6; i++) {
      const x = ((t * 0.07 + i * 0.17) % 1.2) * W - W * 0.1;
      c.fillStyle = '#3e4626';
      c.fillRect(x, base - H * 0.04, H * 0.09, H * 0.04);
      c.fillRect(x + H * 0.06, base - H * 0.06, H * 0.035, H * 0.03);
      c.fillStyle = '#111';
      c.beginPath(); c.arc(x + H * 0.02, base, H * 0.012, 0, Math.PI * 2); c.arc(x + H * 0.07, base, H * 0.012, 0, Math.PI * 2); c.fill();
    }
    if (t > 12) {
      c.fillStyle = '#ffd84a';
      c.font = `${Math.round(H / 14)}px Georgia`;
      c.textAlign = 'center';
      c.fillText('THE THRESHOLD HOLDS', cx, H * 0.16);
    }
  }

  private planet(c: CanvasRenderingContext2D, x: number, y: number, r: number, a: string, b: string, isles: boolean, t: number): void {
    const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    g.addColorStop(0, b);
    g.addColorStop(1, a);
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    c.fillStyle = isles ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.25)';
    for (let i = 0; i < 6; i++) {
      const ang = t * 0.2 + i;
      const px = x + Math.cos(ang) * r * 0.6, py = y + Math.sin(ang * 1.3) * r * 0.5;
      if (isles) { c.beginPath(); c.moveTo(px - 4, py); c.lineTo(px + 4, py); c.lineTo(px, py + 7); c.fill(); }
      else c.fillRect(px - 3, py - 2, 6, 4);
    }
  }

  private riftCrack(c: CanvasRenderingContext2D, cx: number, cy: number, len: number, t: number): void {
    if (len <= 1) return;
    c.save();
    c.shadowColor = '#c04cff';
    c.shadowBlur = 18;
    c.strokeStyle = '#e8b8ff';
    c.lineWidth = 3;
    c.beginPath();
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const k = i / n - 0.5;
      const x = cx + k * len * 0.6 + Math.sin(i * 3.1 + t * 3) * 6;
      const y = cy + k * len + Math.cos(i * 2.3 + t * 2) * 8;
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.stroke();
    c.restore();
  }
}
