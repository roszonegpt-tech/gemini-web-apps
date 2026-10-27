// Radar / minimap: the painted ground scaled down, with enemies (red dots, only when
// seen), rift objectives (yellow stars), mana wells (purple dots), allies and the mage.
import { PALETTES } from '../config/balance';
import { VanguardEnemy } from '../entities/VanguardEnemy';
import type { World } from '../scenes/World';

const PX_PER_UNIT = 2;

export class Minimap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement | null = null;
  private bgFor: World | null = null;
  private t = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  }

  private buildBg(w: World): void {
    const [W, H] = w.level.size;
    const c = document.createElement('canvas');
    c.width = W * PX_PER_UNIT;
    c.height = H * PX_PER_UNIT;
    const g = c.getContext('2d') as CanvasRenderingContext2D;
    if (w.groundCanvas) g.drawImage(w.groundCanvas, 0, 0, c.width, c.height);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, 0, c.width, c.height);
    // walls / cover
    for (const col of w.phys.all) {
      if (col.flags & 4) g.fillStyle = 'rgba(230,225,240,0.85)';
      else if (col.flags & 8) g.fillStyle = 'rgba(200,180,140,0.7)';
      else continue;
      if (col.shape === 'box') g.fillRect((col.x - col.hw) * PX_PER_UNIT, (col.z - col.hd) * PX_PER_UNIT, col.hw * 2 * PX_PER_UNIT, col.hd * 2 * PX_PER_UNIT);
      else g.fillRect((col.x - col.r) * PX_PER_UNIT, (col.z - col.r) * PX_PER_UNIT, col.r * 2 * PX_PER_UNIT, col.r * 2 * PX_PER_UNIT);
    }
    this.bg = c;
    this.bgFor = w;
  }

  draw(w: World, palette: string, dt: number): void {
    if (this.bgFor !== w) this.buildBg(w);
    this.t += dt;
    const c = this.ctx;
    const S = this.canvas.width;
    const pal = PALETTES[palette] || PALETTES.none;
    const p = w.cameraFocus || w.player;
    const scale = PX_PER_UNIT * 1.2;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, S, S);
    c.save();
    c.beginPath();
    c.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = '#0a0614';
    c.fillRect(0, 0, S, S);
    const ox = S / 2 - p.x * scale, oz = S / 2 - p.z * scale;
    if (this.bg) c.drawImage(this.bg, ox, oz, this.bg.width * (scale / PX_PER_UNIT), this.bg.height * (scale / PX_PER_UNIT));
    const dot = (x: number, z: number, r: number, col: string) => {
      c.fillStyle = col;
      c.beginPath();
      c.arc(ox + x * scale, oz + z * scale, r, 0, Math.PI * 2);
      c.fill();
    };
    // gates
    for (const g of w.gates) {
      if (g.open) continue;
      c.strokeStyle = g.type === 'riftwall' ? '#c04cff' : '#d9b23a';
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(ox + g.ax * scale, oz + g.az * scale);
      c.lineTo(ox + g.bx * scale, oz + g.bz * scale);
      c.stroke();
    }
    for (const it of w.interactables) {
      if (it.icon === 'well') dot(it.x, it.z, 4, pal.well);
      else if (it.icon === 'chest') dot(it.x, it.z, 3, '#ffc02a');
      else if (it.icon === 'portal') this.star(c, ox + it.x * scale, oz + it.z * scale, 7, '#ffd84a');
      else if (it.icon === 'objective' && it.isObjective()) this.star(c, ox + it.x * scale, oz + it.z * scale, 6, pal.objective);
    }
    for (const a of w.actors) {
      if (!a.alive || a === w.player) continue;
      if (a.faction === 'mage') { dot(a.x, a.z, 3.5, pal.ally); continue; }
      if (a.tag && w.objectiveTagActive(a.tag)) { this.star(c, ox + a.x * scale, oz + a.z * scale, 6, pal.objective); continue; }
      if (a instanceof VanguardEnemy && !a.seen) continue;
      dot(a.x, a.z, a.isBoss ? 5 : 3, pal.enemy);
    }
    c.restore();
    // player arrow
    c.save();
    c.translate(S / 2, S / 2);
    c.rotate(-w.player.facing + Math.PI);
    c.fillStyle = pal.player;
    c.beginPath();
    c.moveTo(0, -7); c.lineTo(5, 5); c.lineTo(0, 2); c.lineTo(-5, 5); c.closePath();
    c.fill();
    c.restore();
    c.strokeStyle = 'rgba(179,107,255,0.6)';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
    c.stroke();
    // sweep
    const sw = (this.t * 1.6) % (Math.PI * 2);
    c.strokeStyle = 'rgba(179,107,255,0.25)';
    c.beginPath();
    c.moveTo(S / 2, S / 2);
    c.lineTo(S / 2 + Math.cos(sw) * S / 2, S / 2 + Math.sin(sw) * S / 2);
    c.stroke();
  }

  private star(c: CanvasRenderingContext2D, x: number, y: number, r: number, col: string): void {
    c.fillStyle = col;
    c.strokeStyle = '#000';
    c.lineWidth = 1;
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 ? r * 0.45 : r;
      if (i === 0) c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      else c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    c.closePath();
    c.fill();
    c.stroke();
  }
}
