/**
 * hopfield.js — the classical Hopfield network.
 *
 * States are bipolar vectors s ∈ {−1,+1}^N stored in Int8Array.
 * Weights are a dense symmetric matrix W (Float32Array, row-major, N×N) with a
 * zero diagonal. Zeroing the diagonal is what guarantees that asynchronous
 * updates can never increase the energy
 *
 *     E(s) = −½ Σ_ij w_ij s_i s_j
 *
 * so the network is a descent process on a fixed landscape, and every
 * trajectory ends in a fixed point.
 */

/** Deterministic PRNG (mulberry32) — experiments here are reproducible. */
export function makeRng(seed = 1) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomPattern(n, rng = Math.random) {
  const p = new Int8Array(n);
  for (let i = 0; i < n; i++) p[i] = rng() < 0.5 ? -1 : 1;
  return p;
}

/** Copy of `pattern` with a `frac` fraction of its bits flipped. */
export function corrupt(pattern, frac, rng = Math.random) {
  const n = pattern.length;
  const out = Int8Array.from(pattern);
  const idx = new Int32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  for (let i = n - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    const t = idx[i]; idx[i] = idx[j]; idx[j] = t;
  }
  const k = Math.round(frac * n);
  for (let i = 0; i < k; i++) out[idx[i]] = -out[idx[i]];
  return out;
}

/** Normalised overlap m = (1/N) Σ a_i b_i ∈ [−1, 1]. */
export function overlap(a, b) {
  let acc = 0;
  for (let i = 0; i < a.length; i++) acc += a[i] * b[i];
  return acc / a.length;
}

/* ------------------------------------------------------------------ *
 * Learning rules
 * ------------------------------------------------------------------ */

/**
 * Hebb's rule, as in Hopfield (1982): w_ij = (1/N) Σ_μ ξ^μ_i ξ^μ_j.
 * Dead simple, one shot, local — and it saturates at α ≈ 0.138.
 */
export function trainHebbian(n, patterns) {
  const W = new Float32Array(n * n);
  for (const xi of patterns) {
    for (let i = 0; i < n; i++) {
      const row = i * n;
      const xii = xi[i];
      for (let j = i + 1; j < n; j++) {
        const v = W[row + j] + (xii * xi[j]) / n;
        W[row + j] = v;
        W[j * n + i] = v;
      }
    }
  }
  return W;
}

/**
 * Storkey (1997). Hebbian term minus a "local field" correction that cancels
 * the crosstalk each new pattern would otherwise inject. Still incremental and
 * still local-ish, but capacity rises to ≈ N/√(2 ln N).
 */
export function trainStorkey(n, patterns) {
  const W = new Float32Array(n * n);
  const next = new Float32Array(n * n);
  const h = new Float32Array(n);
  for (const xi of patterns) {
    for (let i = 0; i < n; i++) {
      let acc = 0;
      const row = i * n;
      for (let k = 0; k < n; k++) acc += W[row + k] * xi[k];
      h[i] = acc;
    }
    for (let i = 0; i < n; i++) {
      const row = i * n;
      const xii = xi[i];
      for (let j = i + 1; j < n; j++) {
        const wij = W[row + j];
        // h_ij excludes the i and j terms; the diagonal is already zero.
        const hij = h[i] - wij * xi[j];
        const hji = h[j] - wij * xii;
        const v = wij + (xii * xi[j] - xii * hji - xi[j] * hij) / n;
        next[row + j] = v;
        next[j * n + i] = v;
      }
    }
    W.set(next);
  }
  return W;
}

/** Gauss–Jordan inverse of a p×p Float64Array. Returns null if singular. */
export function invertMatrix(A, p) {
  const M = Float64Array.from(A);
  const I = new Float64Array(p * p);
  for (let i = 0; i < p; i++) I[i * p + i] = 1;
  for (let col = 0; col < p; col++) {
    let piv = col;
    for (let r = col + 1; r < p; r++) {
      if (Math.abs(M[r * p + col]) > Math.abs(M[piv * p + col])) piv = r;
    }
    if (Math.abs(M[piv * p + col]) < 1e-12) return null;
    if (piv !== col) {
      for (let c = 0; c < p; c++) {
        let t = M[col * p + c]; M[col * p + c] = M[piv * p + c]; M[piv * p + c] = t;
        t = I[col * p + c]; I[col * p + c] = I[piv * p + c]; I[piv * p + c] = t;
      }
    }
    const d = M[col * p + col];
    for (let c = 0; c < p; c++) { M[col * p + c] /= d; I[col * p + c] /= d; }
    for (let r = 0; r < p; r++) {
      if (r === col) continue;
      const f = M[r * p + col];
      if (f === 0) continue;
      for (let c = 0; c < p; c++) {
        M[r * p + c] -= f * M[col * p + c];
        I[r * p + c] -= f * I[col * p + c];
      }
    }
  }
  return I;
}

/**
 * Projection / pseudo-inverse rule (Personnaz et al., 1986):
 * W = (1/N) Ξ C⁻¹ Ξᵀ with C_μν = (1/N) ξ^μ·ξ^ν.
 * Every stored pattern becomes an exact fixed point for as long as the
 * patterns stay linearly independent (up to P = N), at the price of a
 * non-local learning rule and shrinking basins of attraction.
 */
export function trainPseudoInverse(n, patterns, ridge = 1e-6) {
  const p = patterns.length;
  const W = new Float32Array(n * n);
  if (p === 0) return W;

  const C = new Float64Array(p * p);
  for (let a = 0; a < p; a++) {
    for (let b = a; b < p; b++) {
      let acc = 0;
      const A = patterns[a], B = patterns[b];
      for (let i = 0; i < n; i++) acc += A[i] * B[i];
      const v = acc / n + (a === b ? ridge : 0);
      C[a * p + b] = v;
      C[b * p + a] = v;
    }
  }
  let Ci = invertMatrix(C, p);
  if (!Ci) {
    // Linearly dependent patterns: nudge the ridge until it inverts.
    for (let attempt = 0, r = 1e-3; attempt < 8 && !Ci; attempt++, r *= 10) {
      const C2 = Float64Array.from(C);
      for (let a = 0; a < p; a++) C2[a * p + a] += r;
      Ci = invertMatrix(C2, p);
    }
    if (!Ci) return trainHebbian(n, patterns);
  }

  // M[i][b] = Σ_a ξ^a_i (C⁻¹)_ab
  const M = new Float64Array(n * p);
  for (let i = 0; i < n; i++) {
    for (let b = 0; b < p; b++) {
      let acc = 0;
      for (let a = 0; a < p; a++) acc += patterns[a][i] * Ci[a * p + b];
      M[i * p + b] = acc;
    }
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let acc = 0;
      for (let b = 0; b < p; b++) acc += M[i * p + b] * patterns[b][j];
      const v = acc / n;
      W[i * n + j] = v;
      W[j * n + i] = v;
    }
  }
  return W;
}

export const RULES = {
  hebbian: { label: 'Hebbian', train: trainHebbian },
  storkey: { label: 'Storkey', train: trainStorkey },
  pseudo: { label: 'Pseudo-inverse', train: trainPseudoInverse },
};

/* ------------------------------------------------------------------ *
 * The network
 * ------------------------------------------------------------------ */

export class HopfieldNetwork {
  constructor(n) {
    this.n = n;
    this.W = new Float32Array(n * n);
    this.patterns = [];
    this.rule = 'hebbian';
    this._h = new Float32Array(n);
  }

  train(patterns, rule = 'hebbian') {
    this.patterns = patterns.map((p) => Int8Array.from(p));
    this.rule = rule in RULES ? rule : 'hebbian';
    this.W = RULES[this.rule].train(this.n, this.patterns);
    return this;
  }

  /** h_i = Σ_j w_ij s_j for every i. */
  field(s, out = this._h) {
    const { n, W } = this;
    for (let i = 0; i < n; i++) {
      let acc = 0;
      const row = i * n;
      for (let j = 0; j < n; j++) acc += W[row + j] * s[j];
      out[i] = acc;
    }
    return out;
  }

  localField(s, i) {
    const { n, W } = this;
    let acc = 0;
    const row = i * n;
    for (let j = 0; j < n; j++) acc += W[row + j] * s[j];
    return acc;
  }

  energy(s) {
    const { n, W } = this;
    let e = 0;
    for (let i = 0; i < n; i++) {
      let acc = 0;
      const row = i * n;
      for (let j = 0; j < n; j++) acc += W[row + j] * s[j];
      e += s[i] * acc;
    }
    return -0.5 * e;
  }

  /** Deterministic update of one unit. Returns true if the unit flipped. */
  update(s, i) {
    const h = this.localField(s, i);
    if (h === 0) return false;
    const v = h > 0 ? 1 : -1;
    if (s[i] === v) return false;
    s[i] = v;
    return true;
  }

  /** Glauber (finite temperature) update of one unit. */
  glauber(s, i, T, rng = Math.random) {
    if (T <= 0) return this.update(s, i);
    const h = this.localField(s, i);
    const p = 1 / (1 + Math.exp((-2 * h) / T));
    const v = rng() < p ? 1 : -1;
    if (s[i] === v) return false;
    s[i] = v;
    return true;
  }

  /** One asynchronous sweep: every unit updated once, in random order. */
  asyncSweep(s, { rng = Math.random, T = 0, order = null } = {}) {
    const n = this.n;
    const idx = order || shuffledIndices(n, rng);
    let flips = 0;
    for (let k = 0; k < n; k++) {
      flips += (T > 0 ? this.glauber(s, idx[k], T, rng) : this.update(s, idx[k])) ? 1 : 0;
    }
    return flips;
  }

  /** One synchronous (Little model) step: all units update from the same field. */
  syncStep(s) {
    const h = this.field(s);
    let flips = 0;
    for (let i = 0; i < this.n; i++) {
      if (h[i] === 0) continue;
      const v = h[i] > 0 ? 1 : -1;
      if (s[i] !== v) { s[i] = v; flips++; }
    }
    return flips;
  }

  overlaps(s) {
    return this.patterns.map((p) => overlap(s, p));
  }

  /** Run until the state stops changing (or `maxSweeps` is spent). */
  settle(s, { rng = Math.random, maxSweeps = 60 } = {}) {
    for (let k = 0; k < maxSweeps; k++) {
      if (this.asyncSweep(s, { rng }) === 0) return k + 1;
    }
    return maxSweeps;
  }
}

export function shuffledIndices(n, rng = Math.random) {
  const idx = new Int32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  for (let i = n - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    const t = idx[i]; idx[i] = idx[j]; idx[j] = t;
  }
  return idx;
}

/** sign(ξ^a + ξ^b + ξ^c …) — the classic odd mixture (spurious) states. */
export function mixture(patterns, rng = Math.random) {
  const n = patterns[0].length;
  const out = new Int8Array(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (const p of patterns) acc += p[i];
    out[i] = acc > 0 ? 1 : acc < 0 ? -1 : rng() < 0.5 ? -1 : 1;
  }
  return out;
}
