/**
 * grid.js — canvas renderer for a bipolar pattern, with optional painting.
 */

const CSS = getComputedStyle(document.documentElement);
const color = (name, fallback) => (CSS.getPropertyValue(name) || fallback).trim();

export class PatternView {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.size = opts.size || 16;
    this.state = opts.state || new Int8Array(this.size * this.size).fill(-1);
    this.editable = !!opts.editable;
    this.onEdit = opts.onEdit || null;
    this.gap = opts.gap ?? 0.1;
    this.flash = new Float64Array(this.size * this.size);
    this.ghost = null;        // reference pattern: mismatches get outlined
    this.showGhost = false;
    this.dpr = 1;
    this._paintValue = 1;

    this._resize = this._resize.bind(this);
    this._resize();
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(this._resize);
      this._ro.observe(canvas);
    }
    if (this.editable) this._bindPainting();
  }

  _resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.dpr = dpr;
    this.draw();
  }

  setState(state, { flashChanges = false } = {}) {
    if (flashChanges && state.length === this.state.length) {
      const now = performance.now();
      for (let i = 0; i < state.length; i++) {
        if (state[i] !== this.state[i]) this.flash[i] = now;
      }
    }
    this.state = state;
    this.draw();
  }

  markFlip(i) {
    this.flash[i] = performance.now();
  }

  _cellFromEvent(ev) {
    const rect = this.canvas.getBoundingClientRect();
    const x = Math.floor(((ev.clientX - rect.left) / rect.width) * this.size);
    const y = Math.floor(((ev.clientY - rect.top) / rect.height) * this.size);
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return -1;
    return y * this.size + x;
  }

  _bindPainting() {
    const paint = (ev) => {
      const i = this._cellFromEvent(ev);
      if (i < 0 || this.state[i] === this._paintValue) return;
      this.state[i] = this._paintValue;
      this.flash[i] = performance.now();
      this.draw();
      if (this.onEdit) this.onEdit(this.state, i);
    };
    this.canvas.addEventListener('pointerdown', (ev) => {
      const i = this._cellFromEvent(ev);
      if (i < 0) return;
      ev.preventDefault();
      this.canvas.setPointerCapture(ev.pointerId);
      this._painting = true;
      this._paintValue = -this.state[i];
      paint(ev);
    });
    this.canvas.addEventListener('pointermove', (ev) => {
      if (this._painting) paint(ev);
    });
    const stop = (ev) => {
      if (!this._painting) return;
      this._painting = false;
      try { this.canvas.releasePointerCapture(ev.pointerId); } catch { /* ignore */ }
    };
    this.canvas.addEventListener('pointerup', stop);
    this.canvas.addEventListener('pointercancel', stop);
    this.canvas.style.touchAction = 'none';
  }

  draw() {
    const { ctx, canvas, size } = this;
    const W = canvas.width;
    const H = canvas.height;
    if (!W || !H) return;
    const cell = Math.min(W, H) / size;
    const ox = (W - cell * size) / 2;
    const oy = (H - cell * size) / 2;
    const pad = cell * this.gap * 0.5;
    const r = Math.max(1, cell * 0.16);
    const now = performance.now();

    const on = color('--cell-on', '#5eead4');
    const off = color('--cell-off', '#141a26');
    const hot = color('--cell-flash', '#ffb454');

    ctx.clearRect(0, 0, W, H);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const px = ox + x * cell + pad;
        const py = oy + y * cell + pad;
        const s = cell - pad * 2;
        const age = now - this.flash[i];
        const lit = this.state[i] === 1;

        ctx.beginPath();
        roundRect(ctx, px, py, s, s, r);
        ctx.fillStyle = lit ? on : off;
        ctx.fill();

        if (age < 520) {
          const a = 1 - age / 520;
          ctx.save();
          ctx.globalAlpha = a * 0.9;
          ctx.strokeStyle = hot;
          ctx.lineWidth = Math.max(1, cell * 0.12);
          ctx.beginPath();
          roundRect(ctx, px, py, s, s, r);
          ctx.stroke();
          ctx.restore();
        }

        if (this.showGhost && this.ghost && this.ghost[i] !== this.state[i]) {
          ctx.save();
          ctx.globalAlpha = 0.85;
          ctx.strokeStyle = color('--danger', '#ff5d73');
          ctx.lineWidth = Math.max(1, cell * 0.09);
          ctx.beginPath();
          roundRect(ctx, px, py, s, s, r);
          ctx.stroke();
          ctx.restore();
        }
      }
    }
  }

  destroy() {
    if (this._ro) this._ro.disconnect();
  }
}

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Small static thumbnail used by the memory-bank cards. */
export function drawThumb(canvas, pattern, size = 16) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round((rect.width || 64) * dpr));
  canvas.height = Math.max(1, Math.round((rect.height || 64) * dpr));
  const ctx = canvas.getContext('2d');
  const cell = Math.min(canvas.width, canvas.height) / size;
  const ox = (canvas.width - cell * size) / 2;
  const oy = (canvas.height - cell * size) / 2;
  const on = color('--cell-on', '#5eead4');
  const off = color('--cell-off', '#141a26');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      ctx.fillStyle = pattern[y * size + x] === 1 ? on : off;
      ctx.fillRect(ox + x * cell, oy + y * cell, cell * 0.86, cell * 0.86);
    }
  }
}
