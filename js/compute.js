/**
 * compute.js — the two heavy computations, kept free of any DOM so they can run
 * either inside a worker or (as a fallback) on the main thread.
 */

import {
  HopfieldNetwork, RULES, corrupt, makeRng, overlap, randomPattern,
} from './hopfield.js';

/* ------------------------------------------------------------------ *
 * Energy landscape
 * ------------------------------------------------------------------ */

/*
 * State space has 2^N corners, so any picture of it is a slice. The slice used
 * here is the one the statistical-mechanics literature draws: *overlap space*.
 *
 *   x = m₁ = (1/N) Σ sᵢ ξ¹ᵢ      y = m₂ = (1/N) Σ sᵢ ξ²ᵢ
 *
 * For every (m₁, m₂) there is a whole set of states with those two overlaps;
 * `stateForOverlaps` picks one representative, deterministically, by splitting
 * the neurons into the ones where ξ¹ and ξ² agree and the ones where they
 * disagree and aligning a prefix of each (shuffled once, so the representative
 * is typical rather than spatially biased). The true discrete energy of that
 * state is then evaluated with the full weight matrix — nothing is fitted or
 * approximated.
 *
 * Not every (m₁, m₂) is reachable: the region is the diamond whose four
 * vertices are exactly ξ¹, ξ², −ξ¹ and −ξ². Points outside it are left NaN.
 */

export function planeAnchors(pa, pb, seed = 991) {
  const n = pa.length;
  const agree = [];
  const disagree = [];
  for (let i = 0; i < n; i++) (pa[i] === pb[i] ? agree : disagree).push(i);
  const rng = makeRng(seed);
  for (const arr of [agree, disagree]) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0;
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
  return { pa, n, agree: Int32Array.from(agree), disagree: Int32Array.from(disagree) };
}

/** How many of each group must be aligned to hit the overlaps (m₁, m₂). */
function counts(anchors, m1, m2) {
  const { n, agree, disagree } = anchors;
  const kA = Math.round((agree.length + ((m1 + m2) / 2) * n) / 2);
  const kD = Math.round((disagree.length + ((m1 - m2) / 2) * n) / 2);
  if (kA < 0 || kA > agree.length || kD < 0 || kD > disagree.length) return null;
  return [kA, kD];
}

/** A representative state with the requested overlaps, or null if unreachable. */
export function stateForOverlaps(anchors, m1, m2, out) {
  const k = counts(anchors, m1, m2);
  if (!k) return null;
  const { pa, n, agree, disagree } = anchors;
  const s = out || new Int8Array(n);
  for (let r = 0; r < agree.length; r++) {
    const i = agree[r];
    s[i] = r < k[0] ? pa[i] : -pa[i];
  }
  for (let r = 0; r < disagree.length; r++) {
    const i = disagree[r];
    s[i] = r < k[1] ? pa[i] : -pa[i];
  }
  return s;
}

/**
 * Energy over the overlap plane.
 *
 * Walking left to right along a row only ever aligns more neurons, never fewer,
 * so the energy is carried incrementally: flipping neuron i costs O(N) and
 * changes the energy by exactly 2 sᵢ hᵢ. Each row is rebuilt from scratch, which
 * keeps rounding from accumulating and makes the whole surface ~50× cheaper
 * than evaluating E(s) point by point.
 */
export function computeLandscape({ W, n, pa, pb, res, range }, onProgress) {
  const anchors = planeAnchors(pa, pb);
  const grid = new Float32Array(res * res).fill(NaN);
  const step = (2 * range) / (res - 1);
  const s = new Int8Array(n);
  const h = new Float64Array(n);
  let min = Infinity;
  let max = -Infinity;

  for (let gy = 0; gy < res; gy++) {
    const m2 = -range + gy * step;
    let live = false;
    let curA = 0;
    let curD = 0;
    let E = 0;
    for (let gx = 0; gx < res; gx++) {
      const m1 = -range + gx * step;
      const k = counts(anchors, m1, m2);
      if (!k) { live = false; continue; }

      if (!live) {
        stateForOverlaps(anchors, m1, m2, s);
        E = 0;
        for (let i = 0; i < n; i++) {
          let acc = 0;
          const row = i * n;
          for (let j = 0; j < n; j++) acc += W[row + j] * s[j];
          h[i] = acc;
          E -= 0.5 * s[i] * acc;
        }
        curA = k[0];
        curD = k[1];
        live = true;
      } else {
        for (let r = curA; r < k[0]; r++) E = flip(W, n, s, h, anchors.agree[r], E);
        for (let r = curD; r < k[1]; r++) E = flip(W, n, s, h, anchors.disagree[r], E);
        curA = k[0];
        curD = k[1];
      }

      grid[gy * res + gx] = E;
      if (E < min) min = E;
      if (E > max) max = E;
    }
    if (onProgress) onProgress((gy + 1) / res);
  }
  return { grid, res, min, max };
}

/** Flip neuron i, keeping the field vector and the energy exact. */
function flip(W, n, s, h, i, E) {
  const old = s[i];
  const next = E + 2 * old * h[i];
  const d = -2 * old;
  const row = i * n;
  for (let j = 0; j < n; j++) h[j] += d * W[row + j];
  s[i] = -old;
  return next;
}

/**
 * Basins of attraction: start the network at every point of the overlap plane
 * and record which memory (if any) it falls into. +μ means memory μ, −μ its
 * mirror image, 0 a spurious attractor, and NaN-equivalent −128 unreachable.
 */
export const UNREACHABLE = -128;

export function computeBasins({ W, n, pa, pb, patterns, res, range }, onProgress) {
  const anchors = planeAnchors(pa, pb);
  const labels = new Int16Array(res * res).fill(UNREACHABLE);
  const step = (2 * range) / (res - 1);
  const net = new HopfieldNetwork(n);
  net.W = W;
  net.patterns = patterns;
  const rng = makeRng(4242);
  const s = new Int8Array(n);

  for (let gy = 0; gy < res; gy++) {
    const m2 = -range + gy * step;
    for (let gx = 0; gx < res; gx++) {
      const m1 = -range + gx * step;
      if (!stateForOverlaps(anchors, m1, m2, s)) continue;
      const work = Int8Array.from(s);
      net.settle(work, { rng, maxSweeps: 30 });
      let bestI = -1;
      let bestM = 0;
      for (let k = 0; k < patterns.length; k++) {
        const m = overlap(work, patterns[k]);
        if (Math.abs(m) > Math.abs(bestM)) { bestM = m; bestI = k; }
      }
      labels[gy * res + gx] = Math.abs(bestM) >= 0.99 ? (bestM > 0 ? bestI + 1 : -(bestI + 1)) : 0;
    }
    if (onProgress) onProgress((gy + 1) / res);
  }
  return { labels, res };
}

/* ------------------------------------------------------------------ *
 * Capacity: Monte-Carlo retrieval experiment
 * ------------------------------------------------------------------ */

/**
 * For each rule and each load α = P/N: store P random patterns, corrupt one,
 * let the network settle, and record how often the original comes back.
 */
export function runCapacity({ n, rules, alphas, trials, noise, seed = 12345 }, onProgress) {
  const rng = makeRng(seed);
  const net = new HopfieldNetwork(n);
  const out = rules.map((rule) => ({ rule, points: [], quality: [] }));
  const totalSteps = rules.length * alphas.length * trials;
  let done = 0;

  for (let r = 0; r < rules.length; r++) {
    const rule = rules[r];
    for (const alpha of alphas) {
      const p = Math.max(1, Math.round(alpha * n));
      let hits = 0;
      let mSum = 0;
      for (let t = 0; t < trials; t++) {
        const pats = [];
        for (let k = 0; k < p; k++) pats.push(randomPattern(n, rng));
        net.patterns = pats;
        net.W = RULES[rule].train(n, pats);
        const which = (rng() * p) | 0;
        const s = noise > 0 ? corrupt(pats[which], noise, rng) : Int8Array.from(pats[which]);
        net.settle(s, { rng, maxSweeps: 40 });
        const m = overlap(s, pats[which]);
        mSum += m;
        if (m >= 0.99) hits++;
        done++;
        if (onProgress && (done & 7) === 0) onProgress(done / totalSteps);
      }
      out[r].points.push([alpha, hits / trials]);
      out[r].quality.push([alpha, mSum / trials]);
    }
  }
  if (onProgress) onProgress(1);
  return out;
}

export const DEFAULT_ALPHAS = [
  0.02, 0.05, 0.08, 0.10, 0.12, 0.138, 0.16, 0.20, 0.25,
  0.30, 0.35, 0.40, 0.45, 0.50, 0.60, 0.70,
];
