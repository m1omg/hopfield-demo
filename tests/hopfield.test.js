import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HopfieldNetwork, RULES, corrupt, invertMatrix, makeRng, mixture,
  overlap, randomPattern, trainHebbian, trainPseudoInverse, trainStorkey,
} from '../js/hopfield.js';

const N = 120;

function bank(count, seed = 1) {
  const rng = makeRng(seed);
  return Array.from({ length: count }, () => randomPattern(N, rng));
}

test('overlap is 1 with itself and −1 with its inverse', () => {
  const [p] = bank(1);
  const neg = Int8Array.from(p, (v) => -v);
  assert.equal(overlap(p, p), 1);
  assert.equal(overlap(p, neg), -1);
});

for (const [name, train] of Object.entries({ trainHebbian, trainStorkey, trainPseudoInverse })) {
  test(`${name} produces a symmetric matrix with a zero diagonal`, () => {
    const W = train(N, bank(6));
    for (let i = 0; i < N; i++) {
      assert.equal(W[i * N + i], 0, `diagonal ${i} must be zero`);
      for (let j = i + 1; j < N; j++) {
        assert.ok(Math.abs(W[i * N + j] - W[j * N + i]) < 1e-6, `w[${i}][${j}] must be symmetric`);
      }
    }
  });
}

test('stored patterns are fixed points at low load (all rules)', () => {
  const patterns = bank(5, 42);
  for (const rule of Object.keys(RULES)) {
    const net = new HopfieldNetwork(N).train(patterns, rule);
    for (const p of patterns) {
      const s = Int8Array.from(p);
      assert.equal(net.asyncSweep(s, { rng: makeRng(3) }), 0, `${rule}: ${p} moved`);
      assert.equal(net.syncStep(s), 0, `${rule}: synchronous step moved a stored pattern`);
    }
  }
});

test('asynchronous updates never increase the energy', () => {
  const rng = makeRng(9);
  const net = new HopfieldNetwork(N).train(bank(8, 5), 'hebbian');
  const s = randomPattern(N, rng);
  let e = net.energy(s);
  for (let sweep = 0; sweep < 30; sweep++) {
    for (let k = 0; k < N; k++) {
      net.update(s, (rng() * N) | 0);
      const next = net.energy(s);
      assert.ok(next <= e + 1e-4, `energy rose from ${e} to ${next}`);
      e = next;
    }
  }
});

test('the network converges to a fixed point and stays there', () => {
  const rng = makeRng(11);
  const net = new HopfieldNetwork(N).train(bank(8, 5), 'hebbian');
  const s = randomPattern(N, rng);
  net.settle(s, { rng, maxSweeps: 200 });
  assert.equal(net.asyncSweep(s, { rng }), 0, 'settled state should not move again');
});

test('a 20% corrupted probe is restored exactly', () => {
  const rng = makeRng(23);
  const patterns = bank(8, 77);
  for (const rule of Object.keys(RULES)) {
    const net = new HopfieldNetwork(N).train(patterns, rule);
    let recovered = 0;
    for (const p of patterns) {
      const s = corrupt(p, 0.2, rng);
      net.settle(s, { rng });
      if (overlap(s, p) > 0.999) recovered++;
    }
    assert.equal(recovered, patterns.length, `${rule} recovered only ${recovered}/${patterns.length}`);
  }
});

test('Hebbian storage breaks down past α ≈ 0.138 while Storkey does not', () => {
  const rng = makeRng(31);
  const patterns = bank(Math.round(0.25 * N), 99); // α = 0.25, well past the Hebbian limit
  const score = (rule) => {
    const net = new HopfieldNetwork(N).train(patterns, rule);
    let hits = 0;
    for (const p of patterns) {
      const s = Int8Array.from(p);
      net.settle(s, { rng });
      if (overlap(s, p) > 0.999) hits++;
    }
    return hits / patterns.length;
  };
  const hebbian = score('hebbian');
  const storkey = score('storkey');
  assert.ok(hebbian < 0.6, `Hebbian should be failing at α = 0.25, got ${hebbian}`);
  assert.ok(storkey > hebbian, `Storkey (${storkey}) should beat Hebbian (${hebbian})`);
});

test('the pseudo-inverse rule stores far more than the Hebbian limit exactly', () => {
  const patterns = bank(Math.round(0.4 * N), 5);
  const net = new HopfieldNetwork(N).train(patterns, 'pseudo');
  for (const p of patterns) {
    const s = Int8Array.from(p);
    assert.equal(net.asyncSweep(s, { rng: makeRng(1) }), 0, 'every pattern must be an exact fixed point');
  }
});

test('the energy of a state equals the energy of its inverse', () => {
  const net = new HopfieldNetwork(N).train(bank(4, 8), 'hebbian');
  const s = randomPattern(N, makeRng(4));
  const neg = Int8Array.from(s, (v) => -v);
  assert.ok(Math.abs(net.energy(s) - net.energy(neg)) < 1e-3);
});

test('an odd mixture sits at overlap ≈ 0.5 with each of its three parents', () => {
  const rng = makeRng(17);
  const patterns = bank(3, 61);
  const m = mixture(patterns, rng);
  for (const p of patterns) {
    const o = overlap(m, p);
    assert.ok(o > 0.35 && o < 0.65, `expected ≈0.5, got ${o}`);
  }
});

test('matrix inversion round-trips', () => {
  const p = 5;
  const rng = makeRng(2);
  const A = new Float64Array(p * p);
  for (let i = 0; i < p * p; i++) A[i] = rng() * 2 - 1;
  for (let i = 0; i < p; i++) A[i * p + i] += p; // keep it well conditioned
  const Ai = invertMatrix(A, p);
  assert.ok(Ai, 'matrix should be invertible');
  for (let i = 0; i < p; i++) {
    for (let j = 0; j < p; j++) {
      let acc = 0;
      for (let k = 0; k < p; k++) acc += A[i * p + k] * Ai[k * p + j];
      assert.ok(Math.abs(acc - (i === j ? 1 : 0)) < 1e-9, `A·A⁻¹ wrong at ${i},${j}: ${acc}`);
    }
  }
});

test('a singular Gram matrix does not crash the pseudo-inverse rule', () => {
  const [p] = bank(1, 3);
  const dup = [p, Int8Array.from(p), Int8Array.from(p)];
  const W = trainPseudoInverse(N, dup);
  assert.ok(W.every(Number.isFinite), 'weights must stay finite');
});
