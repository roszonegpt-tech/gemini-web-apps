// Full-resolution 2D overlay drawn over the pixel-art 3D view: magic reticle with spread
// ring, lock-on ring, gold interact cursor, floating damage numbers, enemy health pips,
// directional damage indicators, channel progress and objective markers / edge arrows.
import { PALETTES } from '../config/balance';
import type { Input } from '../core/Input';
import type { Settings } from '../core/Save';
import type { World } from '../scenes/World';
import { VanguardEnemy } from '../entities/VanguardEnemy';
import { dist } from '../utils/math';

interface HitInd {
  dir: number;
  t: number;
  amt: number;
}

export class Overlay2D {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  w = 1;
  h = 1;
  dpr = 1;
  /** v1.4: HUD rectangles (stage px) that labels must not cover — set by UISystem. */
  keepOut: { x: number; y: number; w: number; h: number }[] = [];
  hits: HitInd[] = [];
  private spin = 0;
  private pt = { x: 0, y: 0 };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  }

  resize(w: number, h: number): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
  }

  clear(): void {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  addHit(dir: number, amt: number): void {
    this.hits.push({ dir, t: 0, amt });
    if (this.hits.length > 8) this.hits.shift();
  }

  private proj(w: World, x: number, y: number, z: number): boolean {
    return w.camRig.worldToScreen(x, y, z, this.w, this.h, this.pt);
  }

  draw(w: World, input: Input, s: Settings, dt: number, gameplay: boolean): void {
    const c = this.ctx;
    this.clear();
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.spin += dt;
    const fs = Math.max(14, this.h / 46);
    const pal = PALETTES[s.colorblind] || PALETTES.none;
    const p = w.player;

    // enemy health pips
    for (const a of w.actors) {
      if (!(a instanceof VanguardEnemy) || !a.alive || !a.seen || a.isBoss || a.hp >= a.maxHp) continue;
      if (!this.proj(w, a.x, a.y + (a.flying ? 1.2 : 2.3) * (a.ek === 'heavy' ? 1.2 : 1), a.z)) continue;
      const bw = a.ek === 'helicopter' ? 60 : 32;
      c.fillStyle = 'rgba(0,0,0,0.6)';
      c.fillRect(this.pt.x - bw / 2 - 1, this.pt.y - 1, bw + 2, 5);
      c.fillStyle = pal.enemy;
      c.fillRect(this.pt.x - bw / 2, this.pt.y, bw * (a.hp / a.maxHp), 3);
    }

    // damage numbers & floating text
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const t of w.fx.texts) {
      if (!this.proj(w, t.x, t.y, t.z)) continue;
      const a = 1 - t.t / t.life;
      c.globalAlpha = Math.max(0, Math.min(1, a * 1.5));
      c.font = `bold ${Math.round(t.big ? fs * 1.0 : fs * 0.9)}px Trebuchet MS, sans-serif`;
      c.lineWidth = 3;
      c.strokeStyle = 'rgba(0,0,0,0.85)';
      c.strokeText(t.text, this.pt.x, this.pt.y);
      c.fillStyle = t.color;
      c.fillText(t.text, this.pt.x, this.pt.y);
    }
    c.globalAlpha = 1;
    if (!gameplay) return;

    // objective marker label / edge arrow
    const m = w.objectives.marker();
    if (m) {
      const d = Math.round(dist(p.x, p.z, m.x, m.z));
      const on = this.proj(w, m.x, 5.4, m.z);
      const margin = 40;
      const inside = on && this.pt.x > margin && this.pt.x < this.w - margin && this.pt.y > margin && this.pt.y < this.h - margin;
      const label = `${m.label} – ${d}m`;
      c.font = `${Math.round(fs * 0.85)}px Trebuchet MS, sans-serif`;
      if (inside) {
        if (d > 4) this.labelBox(label, this.pt.x, this.pt.y - fs, pal.objective);
      } else {
        const cx = this.w / 2, cy = this.h / 2;
        let dx = this.pt.x - cx, dy = this.pt.y - cy;
        if (!on) { dx = -dx; dy = -dy; }
        const ang = Math.atan2(dy, dx);
        const rx = this.w / 2 - margin, ry = this.h / 2 - margin;
        const k = Math.min(Math.abs(rx / Math.cos(ang)), Math.abs(ry / Math.sin(ang)));
        const ax = cx + Math.cos(ang) * k, ay = cy + Math.sin(ang) * k;
        c.save();
        c.translate(ax, ay);
        c.rotate(ang);
        c.fillStyle = pal.objective;
        c.beginPath();
        c.moveTo(14, 0); c.lineTo(-8, -10); c.lineTo(-4, 0); c.lineTo(-8, 10); c.closePath();
        c.fill();
        c.restore();
        this.labelBox(label, ax - Math.cos(ang) * 40, ay - Math.sin(ang) * 26, pal.objective);
      }
    }

    // channel progress ring
    if (p.channelTarget && this.proj(w, p.x, 1.0, p.z)) {
      const hold = p.channelTarget.holdTime(w) || 1;
      const prog = Math.min(1, p.channelT / hold);
      c.lineWidth = 4;
      c.strokeStyle = 'rgba(0,0,0,0.5)';
      c.beginPath(); c.arc(this.pt.x, this.pt.y, 34, 0, Math.PI * 2); c.stroke();
      c.strokeStyle = '#ffd84a';
      c.beginPath(); c.arc(this.pt.x, this.pt.y, 34, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2); c.stroke();
    }

    // lock-on ring
    const tgt = p.lockTarget;
    if (tgt && tgt.alive && this.proj(w, tgt.x, tgt.y + (tgt.flying ? 0 : 1.0), tgt.z)) {
      const r = 18 + tgt.radius * 10;
      c.strokeStyle = pal.enemy;
      c.lineWidth = 2;
      c.save();
      c.translate(this.pt.x, this.pt.y);
      c.rotate(this.spin * 2);
      for (let i = 0; i < 4; i++) {
        c.rotate(Math.PI / 2);
        c.beginPath(); c.arc(0, 0, r, -0.5, 0.5); c.stroke();
        c.beginPath(); c.moveTo(r + 3, 0); c.lineTo(r + 9, 0); c.stroke();
      }
      c.restore();
    }

    // reticle
    if (input.lastDevice === 'kbm' && input.pointerActive && p.alive) {
      let col = '#d9b8ff';
      if (p.focus) col = '#ffd84a';
      else {
        for (const it of w.interactables) {
          if (it.prompt(w) && dist(it.x, it.z, w.aimX, w.aimZ) < 1.8) { col = '#ffd84a'; break; }
        }
      }
      if (tgt) col = pal.enemy;
      const x = input.pointerX, y = input.pointerY;
      const spread = 10 + (p.firing ? 6 : 0) + Math.min(10, Math.hypot(p.vx, p.vz));
      c.strokeStyle = col;
      c.lineWidth = 1.5;
      c.save();
      c.translate(x, y);
      c.rotate(-this.spin);
      c.beginPath(); c.arc(0, 0, spread, 0, Math.PI * 2); c.stroke();
      for (let i = 0; i < 6; i++) {
        c.rotate(Math.PI / 3);
        c.fillStyle = col;
        c.fillRect(spread - 1, -1, 4, 2);
      }
      c.restore();
      c.fillStyle = col;
      c.fillRect(x - 1.5, y - 1.5, 3, 3);
    } else if (p.alive && input.lastDevice !== 'kbm' && this.proj(w, w.aimX, 0.2, w.aimZ)) {
      c.strokeStyle = 'rgba(217,184,255,0.7)';
      c.lineWidth = 2;
      c.beginPath(); c.arc(this.pt.x, this.pt.y, 12, 0, Math.PI * 2); c.stroke();
    }

    // directional damage indicators
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i];
      h.t += dt;
      if (h.t > 0.9) { this.hits.splice(i, 1); continue; }
      const a = (1 - h.t / 0.9) * Math.min(1, 0.4 + h.amt / 20);
      const cx = this.w / 2, cy = this.h / 2;
      const r = Math.min(this.w, this.h) * 0.38;
      const ang = h.dir - Math.PI / 2;
      c.strokeStyle = `rgba(255,40,40,${a.toFixed(3)})`;
      c.lineWidth = 8;
      c.beginPath();
      c.arc(cx, cy, r, ang - 0.32, ang + 0.32);
      c.stroke();
    }
  }

  private labelBox(text: string, x: number, y: number, color: string): void {
    const c = this.ctx;
    const tw = c.measureText(text).width;
    // keep clear of the HUD: top band (bars / slots / tracker) and bottom corners
    x = Math.max(tw / 2 + this.w * 0.17, Math.min(this.w - tw / 2 - this.w * 0.17, x));
    y = Math.max(this.h * 0.2, Math.min(this.h * 0.8, y));
    // v1.4: step out of any HUD box (moved touch-mode objectives, gauges, buttons)
    for (let i = 0; i < 4; i++) {
      const bx = x - tw / 2 - 6, by = y - 11, bw = tw + 12, bh = 22;
      const r = this.keepOut.find((k) => bx < k.x + k.w && bx + bw > k.x && by < k.y + k.h && by + bh > k.y);
      if (!r) break;
      const below = r.y + r.h + 14;
      if (below < this.h * 0.85) y = below;
      else x = r.x + r.w / 2 < this.w / 2 ? r.x + r.w + tw / 2 + 10 : r.x - tw / 2 - 10;
    }
    c.fillStyle = 'rgba(10,6,20,0.75)';
    c.fillRect(x - tw / 2 - 6, y - 11, tw + 12, 22);
    c.strokeStyle = color;
    c.lineWidth = 1;
    c.strokeRect(x - tw / 2 - 6, y - 11, tw + 12, 22);
    c.fillStyle = color;
    c.fillText(text, x, y + 1);
  }
}
