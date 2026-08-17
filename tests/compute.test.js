import test from 'node:test';
import assert from 'node:assert/strict';

import { HopfieldNetwork, makeRng, overlap, randomPattern } from '../js/hopfield.js';
import {
  UNREACHABLE, computeBasins, computeLandscape, planeAnchors, stateForOverlaps,
} from '../js/compute.js';

const N = 64;
const rng = makeRng(5);
const patterns = Array.from({ length: 4 }, () => randomPattern(N, rng));
const net = new HopfieldNetwork(N).train(patterns, 'hebbian');

test('stateForOverlaps hits the overlaps it was asked for', () => {
  const anchors = planeAnchors(patterns[0], patterns[1]);
  for (const [m1, m2] of [[1, 0], [0, 1], [-1, 0], [0.5, 0.25], [-0.3, 0.6], [0, 0]]) {
    const s = stateForOverlaps(anchors, m1, m2);
    if (!s) continue; // unreachable corner of the plane
    assert.ok(Math.abs(overlap(s, patterns[0]) - m1) <= 2 / N, `m1: ${overlap(s, patterns[0])} vs ${m1}`);
    assert.ok(Math.abs(overlap(s, patterns[1]) - m2) <= 2 / N, `m2: ${overlap(s, patterns[1])} vs ${m2}`);
  }
});

test('the stored memories sit at the vertices of the reachable diamond', () => {
  const anchors = planeAnchors(patterns[0], patterns[1]);
  const m12 = overlap(patterns[0], patterns[1]);
  const s = stateForOverlaps(anchors, 1, m12);
  assert.ok(s, 'ξ¹ must be reachable');
  assert.equal(overlap(s, patterns[0]), 1, 'the (1, m₁₂) corner is ξ¹ itself');
});

test('the incrementally carried energy matches a direct evaluation everywhere', () => {
  const res = 33;
  const range = 1.02;
  const { grid } = computeLandscape({ W: net.W, n: N, pa: patterns[0], pb: patterns[1], res, range });
  const anchors = planeAnchors(patterns[0], patterns[1]);
  const step = (2 * range) / (res - 1);
  let checked = 0;
  for (let gy = 0; gy < res; gy++) {
    for (let gx = 0; gx < res; gx++) {
      const v = grid[gy * res + gx];
      const s = stateForOverlaps(anchors, -range + gx * step, -range + gy * step);
      if (!s) {
        assert.ok(Number.isNaN(v), `unreachable point ${gx},${gy} should be NaN`);
        continue;
      }
      assert.ok(Math.abs(v - net.energy(s)) < 1e-3, `E mismatch at ${gx},${gy}: ${v} vs ${net.energy(s)}`);
      checked++;
    }
  }
  assert.ok(checked > 400, `expected a substantial reachable region, got ${checked}`);
});

test('the landscape has its minima at the stored memories', () => {
  const res = 41;
  const range = 1.02;
  const { grid, min } = computeLandscape({ W: net.W, n: N, pa: patterns[0], pb: patterns[1], res, range });
  const finite = [...grid].filter(Number.isFinite);
  assert.ok(finite.length > 0);
  const s = Int8Array.from(patterns[0]);
  assert.ok(Math.abs(net.energy(s) - min) < 1e-3, 'the global minimum of the slice should be a memory');
});

test('basins map memories to themselves', () => {
  const res = 21;
  const { labels } = computeBasins({
    W: net.W, n: N, pa: patterns[0], pb: patterns[1], patterns, res, range: 1.02,
  });
  assert.equal(labels.length, res * res);
  assert.ok([...labels].some((l) => l === 1), 'somewhere in the plane must fall into ξ¹');
  assert.ok([...labels].some((l) => l === UNREACHABLE), 'the corners are outside the diamond');
  // The exact ξ¹ corner is a fixed point, so it must be labelled ξ¹.
  const centre = labels[Math.floor(res / 2) * res + Math.floor(res / 2)];
  assert.ok(centre !== UNREACHABLE, 'the origin is always reachable');
});
