/**
 * capacity.js — the Monte-Carlo capacity experiment and its chart.
 */

import { runJob } from './jobs.js';
import { DEFAULT_ALPHAS } from './compute.js';
import { drawLineChart } from './charts.js';

const COLORS = {
  hebbian: '#5eead4',
  storkey: '#a78bfa',
  pseudo: '#ffb454',
};
const NAMES = {
  hebbian: 'Hebbian',
  storkey: 'Storkey',
  pseudo: 'Pseudo-inverse',
};

export function initCapacity() {
  const canvas = document.querySelector('#capacity-canvas');
  const runBtn = document.querySelector('#cap-run');
  const nSel = document.querySelector('#cap-n');
  const trials = document.querySelector('#cap-trials');
  const trialsVal = document.querySelector('#cap-trials-val');
  const noise = document.querySelector('#cap-noise');
  const noiseVal = document.querySelector('#cap-noise-val');
  const progress = document.querySelector('#cap-progress');
  const bar = document.querySelector('#cap-bar');
  const legend = document.querySelector('#cap-legend');
  const hint = document.querySelector('#cap-hint');
  const boxes = [...document.querySelectorAll('.rules-set input')];

  let results = null;

  function render() {
    drawLineChart(
      canvas,
      (results || []).map((r) => ({ color: COLORS[r.rule], points: r.points })),
      {
        xMin: 0,
        xMax: 0.72,
        yMin: 0,
        yMax: 1,
        marker: 0.138,
        markerLabel: 'α_c = 0.138',
        xLabel: 'memory load  α = P / N',
      }
    );
    legend.innerHTML = (results || [])
      .map((r) => `<span><i style="background:${COLORS[r.rule]}"></i>${NAMES[r.rule]}</span>`)
      .join('');
  }

  /** Linear interpolation of the load at which retrieval drops through 50 %. */
  function halfPoint(points) {
    for (let i = 1; i < points.length; i++) {
      const [a0, y0] = points[i - 1];
      const [a1, y1] = points[i];
      if (y0 >= 0.5 && y1 < 0.5) return a0 + ((0.5 - y0) / (y1 - y0)) * (a1 - a0);
    }
    return points[points.length - 1][1] >= 0.5 ? null : points[0][0];
  }

  async function run() {
    const rules = boxes.filter((b) => b.checked).map((b) => b.value);
    if (!rules.length) {
      hint.textContent = 'Tick at least one learning rule.';
      return;
    }
    const n = Number(nSel.value);
    runBtn.disabled = true;
    runBtn.textContent = 'Running…';
    progress.hidden = false;
    bar.style.width = '0%';
    hint.innerHTML =
      `Storing up to ${Math.round(0.7 * n)} random patterns in a ${n}-neuron network, ` +
      `${trials.value} trials per point. This is a real simulation, not a fitted curve.`;

    const started = performance.now();
    try {
      const res = await runJob(
        'capacity',
        {
          n,
          rules,
          alphas: DEFAULT_ALPHAS,
          trials: Number(trials.value),
          noise: Number(noise.value) / 100,
          seed: 20241008,
        },
        (t) => { bar.style.width = `${Math.round(t * 100)}%`; }
      );
      results = res.results;
      render();
      const secs = ((performance.now() - started) / 1000).toFixed(1);
      const lines = results.map((r) => {
        const h = halfPoint(r.points);
        return h == null
          ? `<b style="color:${COLORS[r.rule]}">${NAMES[r.rule]}</b> never fell below 50 % in this range`
          : `<b style="color:${COLORS[r.rule]}">${NAMES[r.rule]}</b> broke down at α ≈ <b class="mono">${h.toFixed(3)}</b> (P ≈ ${Math.round(h * n)})`;
      });
      hint.innerHTML =
        `${lines.join(' · ')}. Measured in ${secs}s across ` +
        `${results.length * DEFAULT_ALPHAS.length * Number(trials.value)} independent networks. ` +
        `Theory puts the Hebbian collapse at α<sub>c</sub> = 0.138 as N → ∞; small networks blur the ` +
        `transition, so try N = 256 to sharpen it.`;
    } catch (err) {
      hint.textContent = `The experiment failed to run: ${err.message || err}`;
    } finally {
      runBtn.disabled = false;
      runBtn.textContent = 'Run experiment';
      progress.hidden = true;
    }
  }

  trials.addEventListener('input', () => { trialsVal.textContent = trials.value; });
  noise.addEventListener('input', () => { noiseVal.textContent = `${noise.value}%`; });
  runBtn.addEventListener('click', run);
  window.addEventListener('resize', render);

  trialsVal.textContent = trials.value;
  noiseVal.textContent = `${noise.value}%`;
  render();
}
