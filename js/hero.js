/**
 * hero.js — an autonomous demo loop: corrupt a memory, recall it, pause, repeat.
 * Deliberately its own small network so the lab stays under the visitor's control.
 */

import { HopfieldNetwork, corrupt, makeRng, overlap, shuffledIndices } from './hopfield.js';
import { PatternView } from './grid.js';
import { SIZE, N } from './patterns.js';

export function initHero(app) {
  const canvas = document.querySelector('#hero-canvas');
  const caption = document.querySelector('#hero-caption');
  if (!canvas) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rng = makeRng(7);
  const net = new HopfieldNetwork(N);
  const view = new PatternView(canvas, { size: SIZE, gap: 0.14 });

  let bank = [];
  let phase = 'idle';
  let order = shuffledIndices(N, rng);
  let cursor = 0;
  let sweeps = 0;
  let flipsThisSweep = 0;
  let holdUntil = 0;
  let which = 0;
  let running = true;

  function rebuild() {
    bank = app.stored.length ? app.stored : app.library.slice(0, 4);
    net.train(bank.map((p) => p.data), 'hebbian');
    seedNext();
  }

  function seedNext() {
    if (!bank.length) return;
    which = (which + 1) % bank.length;
    const src = bank[which].data;
    view.setState(corrupt(src, 0.34, rng));
    order = shuffledIndices(N, rng);
    cursor = 0;
    sweeps = 0;
    flipsThisSweep = 0;
    phase = 'settling';
    caption.textContent = `probe: ${bank[which].label} · 34% corrupted`;
  }

  function frame(now) {
    if (!running) return;
    if (phase === 'hold') {
      if (now >= holdUntil) seedNext();
    } else if (phase === 'settling') {
      const s = view.state;
      for (let k = 0; k < 26; k++) {
        const i = order[cursor++];
        if (net.update(s, i)) { flipsThisSweep++; view.markFlip(i); }
        if (cursor >= N) {
          cursor = 0;
          order = shuffledIndices(N, rng);
          sweeps++;
          if (flipsThisSweep === 0 || sweeps > 24) {
            phase = 'hold';
            holdUntil = now + 1400;
            const m = overlap(s, bank[which].data);
            caption.textContent =
              m > 0.999
                ? `recalled ${bank[which].label} in ${sweeps} sweep${sweeps === 1 ? '' : 's'} · E = ${net.energy(s).toFixed(1)}`
                : `settled at overlap ${m.toFixed(2)} with ${bank[which].label} · E = ${net.energy(s).toFixed(1)}`;
            break;
          }
          flipsThisSweep = 0;
        }
      }
      view.draw();
    }
    requestAnimationFrame(frame);
  }

  app.addEventListener('retrain', () => {
    if (phase !== 'settling') rebuild();
  });

  rebuild();
  if (reduced) {
    // Show a settled memory instead of animating.
    const s = Int8Array.from(bank[0].data);
    view.setState(s);
    caption.textContent = `${bank[0].label} · a stored minimum`;
    running = false;
  } else {
    requestAnimationFrame(frame);
  }
}
