/**
 * landscape.js — the energy surface and the basins of attraction, both drawn
 * in overlap space (see compute.js for how the slice is constructed).
 */

import { runJob } from './jobs.js';
import { UNREACHABLE } from './compute.js';
import { overlap } from './hopfield.js';
import { energyRamp, fitCanvas } from './charts.js';

const RANGE = 1.02;
const RES_ENERGY = 121;
const RES_BASINS = 61;
const BASIN_COLORS = [
  [94, 234, 212], [167, 139, 250], [255, 180, 84], [255, 93, 115],
  [96, 165, 250], [244, 114, 182], [163, 230, 53], [251, 191, 36],
];

export function initLandscape(app) {
  const canvas = document.querySelector('#landscape-canvas');
  const axisA = document.querySelector('#axis-a');
  const axisB = document.querySelector('#axis-b');
  const modeSel = document.querySelector('#proj-select');
  const runBtn = document.querySelector('#landscape-run');
  const legend = document.querySelector('#landscape-legend');
  const hint = document.querySelector('#landscape-hint');

  let surface = null;

  function fillAxisOptions() {
    for (const [sel, fallback] of [[axisA, 0], [axisB, 1]]) {
      const prev = sel.value;
      sel.textContent = '';
      app.stored.forEach((p, i) => {
        const o = document.createElement('option');
        o.value = String(i);
        o.textContent = p.label;
        sel.append(o);
      });
      if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
      else sel.value = String(Math.min(fallback, Math.max(0, app.stored.length - 1)));
    }
    // Restoring both axes can land them on the same memory (e.g. after the bank
    // was emptied and refilled); a plane needs two distinct directions.
    if (app.stored.length > 1 && axisA.value === axisB.value) {
      axisB.value = String((Number(axisA.value) + 1) % app.stored.length);
    }
    runBtn.disabled = app.stored.length < 2;
  }

  async function compute() {
    const pats = app.stored;
    if (pats.length < 2) return;
    const ia = Number(axisA.value);
    const ib = Number(axisB.value);
    if (ia === ib) {
      hint.textContent = 'Pick two different memories — a plane needs two directions.';
      return;
    }
    const basins = modeSel.value === 'basins';
    runBtn.disabled = true;
    runBtn.textContent = 'Computing…';

    try {
      const res = await runJob(
        basins ? 'basins' : 'landscape',
        {
          W: app.net.W,
          n: app.N,
          pa: pats[ia].data,
          pb: pats[ib].data,
          patterns: basins ? pats.map((p) => p.data) : undefined,
          res: basins ? RES_BASINS : RES_ENERGY,
          range: RANGE,
        },
        (t) => { runBtn.textContent = `Computing… ${Math.round(t * 100)}%`; }
      );
      surface = { ...res, basins, ia, ib };
      draw();
      renderLegend();
      describe();
    } catch (err) {
      hint.textContent = `Could not compute the surface: ${err.message || err}`;
    } finally {
      runBtn.disabled = false;
      runBtn.textContent = 'Compute surface';
    }
  }

  function describe() {
    if (!surface) return;
    const a = app.stored[surface.ia]?.label ?? '?';
    const b = app.stored[surface.ib]?.label ?? '?';
    if (surface.basins) {
      const counts = new Map();
      let total = 0;
      for (const l of surface.labels) {
        if (l === UNREACHABLE) continue;
        counts.set(l, (counts.get(l) || 0) + 1);
        total++;
      }
      const spurious = ((counts.get(0) || 0) / total) * 100;
      hint.innerHTML =
        `Every point of the <b>${a}</b>–<b>${b}</b> plane was used as a starting state and run to
         convergence. <b class="mono">${spurious.toFixed(0)}%</b> of them ended somewhere that is not a
         stored memory. The basins are the coloured regions; the boundaries between them are where an
         arbitrarily small change to the probe sends the recall somewhere else entirely.`;
    } else {
      hint.innerHTML =
        `Energy across the <b>${a}</b>–<b>${b}</b> plane, from
         <b class="mono">${surface.min.toFixed(1)}</b> to <b class="mono">${surface.max.toFixed(1)}</b>.
         The diamond is the reachable region — its four vertices are ${a}, ${b} and their two mirror
         images, each sitting at the bottom of its own valley. Run a recall in the lab and its
         trajectory is drawn on top.`;
    }
  }

  function renderLegend() {
    if (!surface || !surface.basins) {
      legend.innerHTML =
        '<span>low energy</span><span class="ramp"></span><span>high</span>';
      return;
    }
    const seen = new Set(surface.labels);
    const chips = [];
    app.stored.forEach((p, i) => {
      if (!seen.has(i + 1) && !seen.has(-(i + 1))) return;
      const c = BASIN_COLORS[i % BASIN_COLORS.length];
      chips.push(`<span><i style="background:rgb(${c})"></i>${p.label}</span>`);
      if (seen.has(-(i + 1))) {
        chips.push(`<span><i style="background:rgb(${c.map((v) => Math.round(v * 0.45))})"></i>−${p.label}</span>`);
      }
    });
    if (seen.has(0)) chips.push('<span><i style="background:#39425a"></i>spurious</span>');
    legend.innerHTML = chips.join('');
  }

  function colorAt(i) {
    if (surface.basins) {
      const l = surface.labels[i];
      if (l === UNREACHABLE) return null;
      if (l === 0) return [57, 66, 90];
      const c = BASIN_COLORS[(Math.abs(l) - 1) % BASIN_COLORS.length];
      return l > 0 ? c : c.map((v) => Math.round(v * 0.45));
    }
    const v = surface.grid[i];
    if (!Number.isFinite(v)) return null;
    const span = surface.max - surface.min || 1;
    return energyRamp((v - surface.min) / span);
  }

  function draw() {
    const { ctx, w, h, dpr } = fitCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    if (!surface) return;
    const res = surface.res;

    const padL = 40 * dpr;
    const padB = 38 * dpr;
    const padT = 16 * dpr;
    const padR = 16 * dpr;
    const side = Math.min(w - padL - padR, h - padT - padB);
    const ox = padL + (w - padL - padR - side) / 2;
    const oy = padT + (h - padT - padB - side) / 2;

    const X = (m) => ox + ((m + RANGE) / (2 * RANGE)) * side;
    const Y = (m) => oy + side - ((m + RANGE) / (2 * RANGE)) * side;

    // Surface
    const off = document.createElement('canvas');
    off.width = res;
    off.height = res;
    const octx = off.getContext('2d');
    const img = octx.createImageData(res, res);
    for (let gy = 0; gy < res; gy++) {
      for (let gx = 0; gx < res; gx++) {
        const src = gy * res + gx;
        const dst = ((res - 1 - gy) * res + gx) * 4; // flip: +m₂ is up
        const c = colorAt(src);
        if (!c) { img.data[dst + 3] = 0; continue; }
        img.data[dst] = c[0];
        img.data[dst + 1] = c[1];
        img.data[dst + 2] = c[2];
        img.data[dst + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = !surface.basins;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(off, ox, oy, side, side);
    ctx.imageSmoothingEnabled = true;

    // Contours (energy mode only)
    if (!surface.basins) {
      const span = surface.max - surface.min || 1;
      const levels = 16;
      const cell = side / res;
      const lvl = (i) => {
        const v = surface.grid[i];
        return Number.isFinite(v) ? Math.floor(((v - surface.min) / span) * levels) : null;
      };
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = Math.max(1, dpr * 0.7);
      ctx.beginPath();
      for (let gy = 1; gy < res; gy++) {
        for (let gx = 1; gx < res; gx++) {
          const i = gy * res + gx;
          const a = lvl(i);
          if (a === null) continue;
          const px = ox + gx * cell;
          const py = oy + side - (gy + 1) * cell;
          if (lvl(i - 1) !== null && lvl(i - 1) !== a) {
            ctx.moveTo(px, py);
            ctx.lineTo(px, py + cell);
          }
          if (lvl(i - res) !== null && lvl(i - res) !== a) {
            ctx.moveTo(px, py + cell);
            ctx.lineTo(px + cell, py + cell);
          }
        }
      }
      ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1 * dpr;
    ctx.strokeRect(ox, oy, side, side);
    ctx.save();
    ctx.setLineDash([3 * dpr, 4 * dpr]);
    ctx.beginPath();
    ctx.moveTo(ox, Y(0));
    ctx.lineTo(ox + side, Y(0));
    ctx.moveTo(X(0), oy);
    ctx.lineTo(X(0), oy + side);
    ctx.stroke();
    ctx.restore();

    ctx.font = `${11 * dpr}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.fillStyle = 'rgba(139,150,172,1)';
    for (const t of [-1, -0.5, 0, 0.5, 1]) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(String(t), X(t), oy + side + 6 * dpr);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(t), ox - 7 * dpr, Y(t));
    }
    const la = app.stored[surface.ia]?.label ?? '';
    const lb = app.stored[surface.ib]?.label ?? '';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(200,210,228,1)';
    ctx.fillText(`m₁ — overlap with ${la}`, ox + side / 2, h - 6 * dpr);
    ctx.save();
    ctx.translate(12 * dpr, oy + side / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textBaseline = 'top';
    ctx.fillText(`m₂ — overlap with ${lb}`, 0, 0);
    ctx.restore();

    // Recall trajectory
    const pa = app.stored[surface.ia]?.data;
    const pb = app.stored[surface.ib]?.data;
    const traj = app.trajectory;
    if (pa && pb && traj && traj.length > 1) {
      const pts = traj.map((s) => [overlap(s, pa), overlap(s, pb)]);
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 2.4 * dpr;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(X(x), Y(y)) : ctx.lineTo(X(x), Y(y))));
      ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 1 * dpr;
      ctx.stroke();
      dot(ctx, X(pts[0][0]), Y(pts[0][1]), 4.5 * dpr, '#0b0f18', '#ffffff');
      dot(ctx, X(pts.at(-1)[0]), Y(pts.at(-1)[1]), 4.5 * dpr, '#ffffff', '#0b0f18');
    }

    // Stored memories and their mirror images. The two axis memories are placed
    // first so they keep their labels; anything colliding gets a bare dot, which
    // matters because unrelated memories all project onto the origin.
    if (pa && pb) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const placed = [];
      const order = [surface.ia, surface.ib, ...app.stored.keys()].filter(
        (v, i, arr) => arr.indexOf(v) === i
      );
      for (const idx of order) {
        const p = app.stored[idx];
        if (!p) continue;
        const x = overlap(p.data, pa);
        const y = overlap(p.data, pb);
        for (const sgn of [1, -1]) {
          const cx = X(sgn * x);
          const cy = Y(sgn * y);
          dot(ctx, cx, cy, 4.5 * dpr, sgn > 0 ? '#ffffff' : 'rgba(255,255,255,0.35)', 'rgba(0,0,0,0.7)');
          const text = sgn > 0 ? p.label : `−${p.label}`;
          const tw = ctx.measureText(text).width;
          const box = [cx - tw / 2, cy - 22 * dpr, tw, 14 * dpr];
          if (placed.some((b) => overlapsBox(b, box))) continue;
          placed.push(box);
          ctx.lineWidth = 3 * dpr;
          ctx.strokeStyle = 'rgba(0,0,0,0.85)';
          ctx.fillStyle = sgn > 0 ? '#ffffff' : 'rgba(255,255,255,0.6)';
          ctx.strokeText(text, cx, cy - 8 * dpr);
          ctx.fillText(text, cx, cy - 8 * dpr);
        }
      }
    }
  }

  function overlapsBox(a, b) {
    return a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
  }

  function dot(ctx, x, y, r, fill, stroke) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.6 * (window.devicePixelRatio || 1);
    ctx.stroke();
  }

  runBtn.addEventListener('click', compute);
  modeSel.addEventListener('change', () => { if (surface) compute(); });
  app.addEventListener('retrain', () => {
    fillAxisOptions();
    surface = null;
    const { ctx, w, h } = fitCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
  });
  app.addEventListener('recall', draw);
  window.addEventListener('resize', draw);

  fillAxisOptions();
  renderLegend();
}
