// Engine core: WebGL renderer, 16:9 letterboxed stage, low-resolution pixel-art
// render scaling, the fixed-substep main loop, FPS tracking, automatic quality
// downscaling and catch-all error handling (errors are logged, the loop keeps running).
import * as THREE from 'three';

export interface EngineHooks {
  update(dt: number): void;
  render(dt: number): void;
}

export type QualityLevel = 0 | 1 | 2;
export type PixelStyle = 'crisp' | 'classic' | 'chunky';

const PIXEL_TARGET: Record<PixelStyle, number> = { crisp: 540, classic: 360, chunky: 270 };
const MAX_STEP = 1 / 60;

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  readonly stage: HTMLElement;
  /** Stage size in CSS pixels (always 16:9). */
  width = 1280;
  height = 720;
  pixelRatio = 1;
  pixelStyle: PixelStyle = 'classic';
  quality: QualityLevel = 2;
  autoQuality = true;
  fps = 60;
  frameMs = 16;
  drawCalls = 0;
  triangles = 0;
  timeScale = 1;
  isMobile: boolean;
  onResize: (() => void) | null = null;
  onQualityChange: ((q: QualityLevel, auto: boolean) => void) | null = null;
  readonly errorLog: string[] = [];

  private hooks: EngineHooks | null = null;
  private last = 0;
  private running = false;
  private lowFpsTime = 0;
  private warmup = 4;
  private errorCounts = new Map<string, number>();

  constructor(stage: HTMLElement, canvas: HTMLCanvasElement) {
    this.stage = stage;
    this.canvas = canvas;
    this.isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
      (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.info.autoReset = false;
    this.quality = this.isMobile ? 1 : 2;
    window.addEventListener('resize', () => this.layout());
    window.addEventListener('orientationchange', () => setTimeout(() => this.layout(), 200));
    this.layout();
  }

  /** Fit the stage to the window at 16:9 and size the canvas to the pixel-art internal resolution. */
  layout(): void {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let w = vw;
    let h = Math.round((vw * 9) / 16);
    if (h > vh) {
      h = vh;
      w = Math.round((vh * 16) / 9);
    }
    this.width = Math.max(320, w);
    this.height = Math.max(180, h);
    this.stage.style.width = `${this.width}px`;
    this.stage.style.height = `${this.height}px`;
    this.stage.style.left = `${Math.round((vw - this.width) / 2)}px`;
    this.stage.style.top = `${Math.round((vh - this.height) / 2)}px`;
    this.stage.style.fontSize = `${Math.max(16, Math.round(this.height / 42))}px`;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const target = PIXEL_TARGET[this.pixelStyle] * (this.quality === 0 ? 0.8 : 1);
    const scale = Math.max(1, Math.round((this.height * dpr) / target));
    this.pixelRatio = dpr / scale;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(this.width, this.height, true);
    if (this.onResize) this.onResize();
  }

  setPixelStyle(style: PixelStyle): void {
    this.pixelStyle = style;
    this.layout();
  }

  setQuality(q: QualityLevel, auto: boolean): void {
    this.autoQuality = auto;
    if (q !== this.quality) {
      this.quality = q;
      this.layout();
      if (this.onQualityChange) this.onQualityChange(q, false);
    }
  }

  start(hooks: EngineHooks): void {
    this.hooks = hooks;
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  private frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!(dt > 0)) dt = MAX_STEP;
    if (dt > 0.1) dt = 0.1;
    const t0 = performance.now();
    this.renderer.info.reset();
    const hooks = this.hooks;
    if (hooks) {
      const scaled = dt * this.timeScale;
      const steps = Math.max(1, Math.ceil(scaled / MAX_STEP - 1e-6));
      const step = scaled / steps;
      for (let i = 0; i < steps; i++) this.guard('update', () => hooks.update(step));
      this.guard('render', () => hooks.render(dt));
    }
    this.drawCalls = this.renderer.info.render.calls;
    this.triangles = this.renderer.info.render.triangles;
    const ms = performance.now() - t0;
    this.frameMs = this.frameMs * 0.9 + ms * 0.1;
    this.fps = this.fps * 0.95 + (1 / dt) * 0.05;
    this.trackQuality(dt);
  };

  private trackQuality(dt: number): void {
    if (this.warmup > 0) {
      this.warmup -= dt;
      return;
    }
    if (!this.autoQuality || document.hidden) return;
    if (this.fps < 45) this.lowFpsTime += dt;
    else this.lowFpsTime = Math.max(0, this.lowFpsTime - dt * 0.5);
    if (this.lowFpsTime > 3 && this.quality > 0) {
      this.quality = (this.quality - 1) as QualityLevel;
      this.lowFpsTime = 0;
      this.warmup = 3;
      this.layout();
      if (this.onQualityChange) this.onQualityChange(this.quality, true);
    }
  }

  /** Runs a callback, logging (throttled) instead of freezing the loop on exceptions. */
  guard(label: string, fn: () => void): void {
    try {
      fn();
    } catch (err) {
      const msg = `[${label}] ${err instanceof Error ? err.message : String(err)}`;
      const n = (this.errorCounts.get(msg) || 0) + 1;
      this.errorCounts.set(msg, n);
      if (n <= 3) {
        console.error('Riftbound recovered from error', msg, err);
        this.errorLog.push(msg);
        if (this.errorLog.length > 50) this.errorLog.shift();
      }
    }
  }

  resetWarmup(): void {
    this.warmup = 3;
    this.lowFpsTime = 0;
  }
}
