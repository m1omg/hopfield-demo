/**
 * internals.js — the weight matrix and the memory-overlap (Gram) matrix.
 */

import { drawMatrix } from './charts.js';
import { overlap } from './hopfield.js';

export function initInternals(app) {
  const wCanvas = document.querySelector('#weight-canvas');
  const gCanvas = document.querySelector('#gram-canvas');
  const wPeak = document.querySelector('#w-peak');
  const gWorst = document.querySelector('#gram-worst');
  const gCaption = document.querySelector('#gram-caption');

  function render() {
    const { peak } = drawMatrix(wCanvas, app.net.W, app.N);
    wPeak.textContent = `max |w| = ${peak.toFixed(3)}`;

    const pats = app.stored;
    const p = pats.length;
    if (p === 0) {
      const ctx = gCanvas.getContext('2d');
      ctx.clearRect(0, 0, gCanvas.width, gCanvas.height);
      gWorst.textContent = 'no memories';
      return;
    }
    const G = new Float32Array(p * p);
    let worst = 0;
    let worstPair = null;
    for (let a = 0; a < p; a++) {
      for (let b = 0; b < p; b++) {
        const m = a === b ? 1 : overlap(pats[a].data, pats[b].data);
        G[a * p + b] = m;
        if (a !== b && (!worstPair || Math.abs(m) > Math.abs(worst))) {
          worst = m;
          worstPair = [pats[a].label, pats[b].label];
        }
      }
    }
    drawMatrix(gCanvas, G, p, { peak: 1, gridLines: true });
    gWorst.textContent = p > 1 ? `worst pair ${worst.toFixed(2)}` : 'single memory';
    if (p < 2) {
      gCaption.textContent = 'Store more than one memory to see how similar they are to each other.';
    } else if (Math.abs(worst) < 0.02) {
      gCaption.innerHTML =
        `These memories are <b>mutually orthogonal</b> — every off-diagonal overlap is
         <b class="mono">${worst.toFixed(2)}</b>. This is the ideal case the capacity theory assumes,
         and recall should be exact. Add a few of the sparse icons or letters and watch this matrix
         light up.`;
    } else {
      gCaption.innerHTML =
        `Most similar pair: <b>${worstPair[0]}</b> and <b>${worstPair[1]}</b> at overlap
         <b class="mono">${worst.toFixed(2)}</b>. Random patterns sit near 0 — anything above about
         0.3 means the two memories are fighting over the same basin, which is the usual reason a
         recall lands on the wrong one.`;
    }
  }

  app.addEventListener('retrain', render);
  window.addEventListener('resize', render);
  render();
}
