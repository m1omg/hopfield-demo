# Hopfield network — an interactive demonstration

A from-scratch, dependency-free implementation of the classical (binary, symmetric)
Hopfield network, wrapped in an interactive site that lets you store patterns,
corrupt them, and watch the network roll downhill into a memory.

**→ [Open the demo](https://m1omg.github.io/hopfield-demo/)**

No ML libraries, no build step, no server. Every number on the page — every energy,
every capacity curve, every point of the energy landscape — is computed live in the
browser from the model itself.

## What's in it

| Section | What it does |
| --- | --- |
| **Memory lab** | Store up to 20 patterns in a 256-neuron network. Corrupt, occlude, invert or hand-paint a probe and watch the asynchronous dynamics settle, neuron by neuron, with a live energy trace and per-memory overlap bars. |
| **Internals** | The full 256×256 weight matrix as a heat map, next to the overlap (Gram) matrix of the stored memories — the thing that actually determines whether recall works. |
| **Energy landscape** | A real two-dimensional slice through the 2²⁵⁶-corner state space, drawn in *overlap space*, with the last recall trajectory on top. A second mode colours every starting point by which memory it converges to, giving a map of the basins of attraction. |
| **Capacity** | A Monte-Carlo experiment run in a Web Worker: store P random patterns in an N-neuron network, corrupt one, settle, measure whether it came back. The Hebbian curve collapses at α = P/N ≈ 0.138, exactly where Amit, Gutfreund and Sompolinsky said it would. |
| **Theory** | The whole model — state, storage, dynamics, energy, capacity, spurious states — on one page. |

Three learning rules are implemented and directly comparable in the UI:

- **Hebbian** (Hopfield, 1982) — `w_ij = (1/N) Σ_μ ξ^μ_i ξ^μ_j`, capacity ≈ 0.138 N
- **Storkey** (1997) — Hebbian plus a local-field correction, capacity ≈ N/√(2 ln N)
- **Pseudo-inverse / projection** (Personnaz et al., 1986) — `W = (1/N) Ξ C⁻¹ Ξᵀ`, exact
  fixed points up to P = N, at the cost of a non-local rule and narrower basins

Plus asynchronous vs. synchronous dynamics (watch the synchronous mode fall into a
two-cycle), Glauber updates at finite temperature, and a button that drops the probe
straight into a spurious mixture state.

## Things worth trying

1. Store the four default patterns, corrupt a probe by 40 % and recall it. Exact.
2. Clear the bank and store **A, E, S, Z** instead. Their overlap matrix lights up —
   they are ~0.77 correlated — and Hebbian recall now lands *next to* the memory
   rather than on it. Switch to the pseudo-inverse rule and it is exact again.
3. Switch to synchronous dynamics and recall from a random state: the energy argument
   does not cover it, and the network can oscillate forever.
4. Press **Mixture**, then **Recall**. The network confidently "remembers" something
   that was never stored.
5. Raise the temperature above ~1.0 and watch the state refuse to freeze.
6. In the landscape section, switch to *basins of attraction* — the coloured regions
   are the memories' basins, and the grey filaments between them are the states that
   fall into nothing at all.

## Running it locally

The site is static, but it uses ES modules and a module worker, so it needs to be
served over HTTP rather than opened from the filesystem:

```sh
npm run serve      # http://localhost:8080
```

## Tests

The engine is covered by a suite that checks the mathematics rather than the pixels —
symmetry and zero diagonal for every rule, stored patterns being fixed points, the
energy never increasing under asynchronous updates, recall from a 20 % corrupted probe,
Hebbian breakdown past α = 0.138, and the landscape's incrementally-carried energy
matching a direct evaluation at every point of the grid.

```sh
npm test
```

## Layout

```
index.html            markup for all five sections
css/style.css         the whole theme
js/hopfield.js        the network: learning rules, dynamics, energy
js/compute.js         the two heavy jobs (energy landscape, capacity experiment)
js/workers/           module worker wrapper for the above
js/patterns.js        the pattern library, drawn as vector art and thresholded
js/grid.js            canvas renderer for a bipolar pattern, with painting
js/charts.js          the traces, bars, line charts and heat maps
js/lab.js             the interactive lab
js/internals.js       weight and overlap matrices
js/landscape.js       energy surface and basins of attraction
js/capacity.js        the capacity experiment UI
js/hero.js            the self-running demo at the top of the page
tests/                node:test suite for the engine and the compute kernels
```

## References

- J. J. Hopfield (1982), *Neural networks and physical systems with emergent collective
  computational abilities*, PNAS **79**(8), 2554–2558.
- D. J. Amit, H. Gutfreund, H. Sompolinsky (1985), *Storing infinite numbers of patterns
  in a spin-glass model of neural networks*, Phys. Rev. Lett. **55**, 1530.
- L. Personnaz, I. Guyon, G. Dreyfus (1986), *Collective computational properties of
  neural networks: new learning mechanisms*, Phys. Rev. A **34**, 4217.
- A. Storkey (1997), *Increasing the capacity of a Hopfield network without sacrificing
  functionality*, ICANN'97.

## Licence

MIT — see [LICENSE](LICENSE).
