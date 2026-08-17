/**
 * lab-worker.js — runs the heavy jobs off the main thread.
 */

import { computeBasins, computeLandscape, runCapacity } from '../compute.js';

self.onmessage = (ev) => {
  const msg = ev.data;
  const progress = (t) => self.postMessage({ id: msg.id, type: 'progress', value: t });

  if (msg.kind === 'landscape') {
    const { grid, res, min, max } = computeLandscape(msg.params, progress);
    self.postMessage({ id: msg.id, type: 'done', grid, res, min, max }, [grid.buffer]);
    return;
  }

  if (msg.kind === 'basins') {
    const { labels, res } = computeBasins(msg.params, progress);
    self.postMessage({ id: msg.id, type: 'done', labels, res }, [labels.buffer]);
    return;
  }

  if (msg.kind === 'capacity') {
    const results = runCapacity(msg.params, progress);
    self.postMessage({ id: msg.id, type: 'done', results });
  }
};
