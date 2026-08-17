/**
 * jobs.js — thin wrapper that runs a job in a module worker when the browser
 * allows it, and falls back to the main thread when it does not.
 */

import { computeBasins, computeLandscape, runCapacity } from './compute.js';

let worker = null;
let workerBroken = false;
let nextId = 1;

function getWorker() {
  if (workerBroken) return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./workers/lab-worker.js', import.meta.url), { type: 'module' });
    worker.addEventListener('error', () => { workerBroken = true; worker = null; });
    return worker;
  } catch {
    workerBroken = true;
    return null;
  }
}

export function runJob(kind, params, onProgress) {
  const w = getWorker();
  if (!w) {
    // Synchronous fallback — slower and blocking, but always correct.
    return Promise.resolve().then(() => {
      if (kind === 'landscape') return computeLandscape(params, onProgress);
      if (kind === 'basins') return computeBasins(params, onProgress);
      return { results: runCapacity(params, onProgress) };
    });
  }
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const onMessage = (ev) => {
      if (ev.data.id !== id) return;
      if (ev.data.type === 'progress') { onProgress?.(ev.data.value); return; }
      w.removeEventListener('message', onMessage);
      resolve(ev.data);
    };
    const onError = (err) => {
      w.removeEventListener('message', onMessage);
      reject(err);
    };
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError, { once: true });
    w.postMessage({ id, kind, params });
  });
}
