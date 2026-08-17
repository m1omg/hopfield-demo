/**
 * charts.js — a few purpose-built canvas charts. No dependencies.
 */

const CSS = getComputedStyle(document.documentElement);
const color = (name, fallback) => (CSS.getPropertyValue(name) || fallback).trim();

export function fitCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const w = Math.max(1, Math.round(rect.width * dpr));
  const h = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return { ctx: canvas.getContext('2d'), w, h, dpr };
}

/** Energy-vs-time trace. */
export function drawEnergyTrace(canvas, values, opts = {}) {
  const { ctx, w, h, dpr } = fitCanvas(canvas);
  ctx.clearRect(0, 0, w, h);
  const padL = 6 * dpr;
  const padR = 6 * dpr;
  const padT = 8 * dpr;
  const padB = 8 * dpr;
  const grid = color('--line', '#1e2532');

  ctx.strokeStyle = grid;
  ctx.lineWidth = 1 * dpr;
  for (let k = 0; k <= 3; k++) {
    const y = padT + ((h - padT - padB) * k) / 3;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();
  }
  if (values.length < 2) return;

  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
  const pad = (hi - lo) * 0.12;
  lo -= pad; hi += pad;

  const X = (i) => padL + ((w - padL - padR) * i) / Math.max(1, values.length - 1);
  const Y = (v) => padT + (h - padT - padB) * (1 - (v - lo) / (hi - lo));

  const accent = opts.color || color('--accent', '#5eead4');
  const gradient = ctx.createLinearGradient(0, padT, 0, h - padB);
  gradient.addColorStop(0, hexA(accent, 0.28));
  gradient.addColorStop(1, hexA(accent, 0));

  ctx.beginPath();
  ctx.moveTo(X(0), Y(values[0]));
  for (let i = 1; i < values.length; i++) ctx.lineTo(X(i), Y(values[i]));
  ctx.lineTo(X(values.length - 1), h - padB);
  ctx.lineTo(X(0), h - padB);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(X(0), Y(values[0]));
  for (let i = 1; i < values.length; i++) ctx.lineTo(X(i), Y(values[i]));
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2 * dpr;
  ctx.lineJoin = 'round';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(X(values.length - 1), Y(values[values.length - 1]), 3 * dpr, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();
}

/** Signed horizontal bars — used for overlaps with each stored memory. */
export function drawOverlapBars(canvas, items) {
  const { ctx, w, h, dpr } = fitCanvas(canvas);
  ctx.clearRect(0, 0, w, h);
  if (!items.length) return;
  const rowH = h / items.length;
  const labelW = 62 * dpr;
  const valueW = 44 * dpr;
  const trackW = w - labelW - valueW;
  const mid = labelW + trackW / 2;
  const half = trackW / 2 - 4 * dpr;

  ctx.font = `${11 * dpr}px ui-monospace, "JetBrains Mono", monospace`;
  ctx.textBaseline = 'middle';

  for (let i = 0; i < items.length; i++) {
    const { label, value, highlight } = items[i];
    const cy = rowH * (i + 0.5);
    const bh = Math.min(rowH * 0.52, 15 * dpr);

    ctx.fillStyle = color('--muted', '#8c97ab');
    ctx.textAlign = 'right';
    ctx.fillText(label, labelW - 8 * dpr, cy);

    ctx.fillStyle = color('--line', '#1e2532');
    ctx.fillRect(labelW, cy - bh / 2, trackW, bh);

    const len = Math.abs(value) * half;
    ctx.fillStyle = highlight
      ? color('--accent', '#5eead4')
      : value >= 0
        ? hexA(color('--accent', '#5eead4'), 0.45)
        : hexA(color('--danger', '#ff5d73'), 0.6);
    if (value >= 0) ctx.fillRect(mid, cy - bh / 2, len, bh);
    else ctx.fillRect(mid - len, cy - bh / 2, len, bh);

    ctx.strokeStyle = color('--line-strong', '#2b3547');
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.moveTo(mid, cy - bh / 2 - 2 * dpr);
    ctx.lineTo(mid, cy + bh / 2 + 2 * dpr);
    ctx.stroke();

    ctx.fillStyle = highlight ? color('--text', '#e6ebf5') : color('--muted', '#8c97ab');
    ctx.textAlign = 'right';
    ctx.fillText(value.toFixed(2), w - 4 * dpr, cy);
  }
}

/** Multi-series line chart with axes — used by the capacity experiment. */
export function drawLineChart(canvas, series, opts = {}) {
  const { ctx, w, h, dpr } = fitCanvas(canvas);
  ctx.clearRect(0, 0, w, h);
  const padL = 46 * dpr;
  const padR = 14 * dpr;
  const padT = 14 * dpr;
  const padB = 34 * dpr;
  const xMin = opts.xMin ?? 0;
  const xMax = opts.xMax ?? 1;
  const yMin = opts.yMin ?? 0;
  const yMax = opts.yMax ?? 1;
  const X = (v) => padL + ((w - padL - padR) * (v - xMin)) / (xMax - xMin);
  const Y = (v) => padT + (h - padT - padB) * (1 - (v - yMin) / (yMax - yMin));

  ctx.font = `${11 * dpr}px ui-monospace, "JetBrains Mono", monospace`;
  ctx.fillStyle = color('--muted', '#8c97ab');
  ctx.strokeStyle = color('--line', '#1e2532');
  ctx.lineWidth = 1 * dpr;

  for (let k = 0; k <= 5; k++) {
    const v = yMin + ((yMax - yMin) * k) / 5;
    const y = Y(v);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(v.toFixed(1), padL - 8 * dpr, y);
  }
  for (let k = 0; k <= 6; k++) {
    const v = xMin + ((xMax - xMin) * k) / 6;
    const x = X(v);
    ctx.beginPath();
    ctx.moveTo(x, padT);
    ctx.lineTo(x, h - padB);
    ctx.strokeStyle = color('--line', '#1e2532');
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(v.toFixed(2), x, h - padB + 8 * dpr);
  }

  if (opts.marker != null && opts.marker >= xMin && opts.marker <= xMax) {
    const x = X(opts.marker);
    ctx.save();
    ctx.setLineDash([5 * dpr, 5 * dpr]);
    ctx.strokeStyle = color('--accent-2', '#ffb454');
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    ctx.moveTo(x, padT);
    ctx.lineTo(x, h - padB);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = color('--accent-2', '#ffb454');
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(opts.markerLabel || '', x + 6 * dpr, padT + 2 * dpr);
  }

  for (const s of series) {
    if (!s.points.length) continue;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2.2 * dpr;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    s.points.forEach((p, i) => (i === 0 ? ctx.moveTo(X(p[0]), Y(p[1])) : ctx.lineTo(X(p[0]), Y(p[1]))));
    ctx.stroke();
    ctx.fillStyle = s.color;
    for (const p of s.points) {
      ctx.beginPath();
      ctx.arc(X(p[0]), Y(p[1]), 2.6 * dpr, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (opts.xLabel) {
    ctx.fillStyle = color('--muted', '#8c97ab');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(opts.xLabel, padL + (w - padL - padR) / 2, h - 2 * dpr);
  }
}

/** Diverging heat map for a square matrix. */
export function drawMatrix(canvas, mat, n, opts = {}) {
  const { ctx, w, h } = fitCanvas(canvas);
  const side = Math.min(w, h);
  const cell = side / n;
  const ox = (w - side) / 2;
  const oy = (h - side) / 2;
  let peak = opts.peak;
  if (peak == null) {
    peak = 0;
    for (let i = 0; i < mat.length; i++) peak = Math.max(peak, Math.abs(mat[i]));
  }
  if (peak === 0) peak = 1;
  ctx.clearRect(0, 0, w, h);
  const img = ctx.createImageData(Math.max(1, Math.round(side)), Math.max(1, Math.round(side)));
  const S = img.width;
  for (let y = 0; y < S; y++) {
    const my = Math.min(n - 1, Math.floor((y / S) * n));
    for (let x = 0; x < S; x++) {
      const mx = Math.min(n - 1, Math.floor((x / S) * n));
      const v = mat[my * n + mx] / peak;
      const [r, g, b] = diverging(v);
      const o = (y * S + x) * 4;
      img.data[o] = r;
      img.data[o + 1] = g;
      img.data[o + 2] = b;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, Math.round(ox), Math.round(oy));
  if (opts.gridLines && cell > 6) {
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    for (let k = 0; k <= n; k++) {
      const p = k * cell;
      ctx.beginPath();
      ctx.moveTo(ox + p, oy);
      ctx.lineTo(ox + p, oy + side);
      ctx.moveTo(ox, oy + p);
      ctx.lineTo(ox + side, oy + p);
      ctx.stroke();
    }
  }
  return { peak };
}

/** Blue → dark → amber diverging ramp, v ∈ [−1, 1]. */
export function diverging(v) {
  const t = Math.max(-1, Math.min(1, v));
  if (t >= 0) {
    return [
      Math.round(18 + t * 237),
      Math.round(22 + t * 158),
      Math.round(32 + t * 52),
    ];
  }
  const a = -t;
  return [
    Math.round(18 + a * 40),
    Math.round(22 + a * 190),
    Math.round(32 + a * 200),
  ];
}

/** Perceptual-ish ramp for the energy landscape: deep violet → teal → cream. */
export function energyRamp(t) {
  const stops = [
    [0.0, [12, 10, 32]],
    [0.25, [48, 24, 96]],
    [0.5, [24, 96, 128]],
    [0.72, [46, 176, 156]],
    [0.88, [176, 220, 170]],
    [1.0, [252, 246, 214]],
  ];
  const x = Math.max(0, Math.min(1, t));
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) {
      const [x0, c0] = stops[i - 1];
      const [x1, c1] = stops[i];
      const f = (x - x0) / (x1 - x0);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * f),
        Math.round(c0[1] + (c1[1] - c0[1]) * f),
        Math.round(c0[2] + (c1[2] - c0[2]) * f),
      ];
    }
  }
  return stops[stops.length - 1][1];
}

function hexA(hex, alpha) {
  const m = hex.replace('#', '').trim();
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${alpha})`;
}
