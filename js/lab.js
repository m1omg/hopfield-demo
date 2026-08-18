/**
 * lab.js — the interactive memory lab: bank, probe, transport and readouts.
 */

import { corrupt, mixture, overlap, shuffledIndices, RULES } from './hopfield.js';
import { blank, occlude, patternFromChar, SIZE, N } from './patterns.js';
import { PatternView, drawThumb } from './grid.js';
import { drawEnergyTrace, drawOverlapBars } from './charts.js';

const $ = (sel) => document.querySelector(sel);
const MAX_TRACE = 420;
const MAX_SWEEPS = 80;

export function initLab(app) {
  const els = {
    bank: $('#bank'),
    bankCount: $('#bank-count'),
    bankHint: $('#bank-hint'),
    probeStatus: $('#probe-status'),
    loadSelect: $('#load-select'),
    noiseRange: $('#noise-range'),
    noiseVal: $('#noise-val'),
    ruleSelect: $('#rule-select'),
    ruleBadge: $('#rule-badge'),
    modeSelect: $('#mode-select'),
    tempRange: $('#temp-range'),
    tempVal: $('#temp-val'),
    speedRange: $('#speed-range'),
    speedVal: $('#speed-val'),
    diffToggle: $('#diff-toggle'),
    energyVal: $('#energy-val'),
    trace: $('#energy-trace'),
    bars: $('#overlap-bars'),
    sweeps: $('#stat-sweeps'),
    flips: $('#stat-flips'),
    updates: $('#stat-updates'),
    verdict: $('#verdict'),
    verdictTitle: $('#verdict-title'),
    verdictBody: $('#verdict-body'),
    runBtn: $('#act-run'),
  };

  const run = {
    active: false,
    order: null,
    cursor: 0,
    sweeps: 0,
    flips: 0,
    flipsThisSweep: 0,
    updates: 0,
    history: [],
    trajectory: [],
    prev: null,
    prev2: null,
    raf: 0,
  };

  let target = null;   // the stored pattern the probe was seeded from, if any
  let seed = null;     // probe state captured before the last run, for Reset

  const state = app.stored[0] ? Int8Array.from(app.stored[0].data) : blank();
  target = app.stored[0] ? Int8Array.from(app.stored[0].data) : null;

  const probe = new PatternView($('#probe'), {
    size: SIZE,
    state,
    editable: true,
    onEdit: () => {
      if (run.active) stop();
      refreshReadout();
    },
  });

  /* ── memory bank ──────────────────────────────────────────────── */

  function renderBank() {
    els.bank.textContent = '';
    for (const item of app.library) {
      const card = document.createElement('button');
      card.className = 'bank-card';
      card.type = 'button';
      card.setAttribute('aria-pressed', String(app.selected.has(item.id)));
      card.title = `${item.label} — click to ${app.selected.has(item.id) ? 'remove from' : 'add to'} the network`;
      const c = document.createElement('canvas');
      const label = document.createElement('span');
      label.textContent = item.label;
      card.append(c, label);
      card.addEventListener('click', () => app.toggle(item.id));
      els.bank.append(card);
      requestAnimationFrame(() => drawThumb(c, item.data, SIZE));
    }
  }

  function renderBankState() {
    const cards = els.bank.querySelectorAll('.bank-card');
    app.library.forEach((item, i) => {
      cards[i]?.setAttribute('aria-pressed', String(app.selected.has(item.id)));
    });
    const p = app.stored.length;
    els.bankCount.textContent = `${p} stored`;
    const alpha = p / N;
    els.bankHint.innerHTML =
      p === 0
        ? 'Nothing stored — the weight matrix is empty and every state is a fixed point.'
        : `Load α = P/N = <b class="mono">${alpha.toFixed(3)}</b>. ` +
          (app.rule === 'hebbian'
            ? alpha > 0.138
              ? '<b style="color:var(--danger)">Past the Hebbian limit of 0.138</b> — expect failures.'
              : 'Comfortably inside the Hebbian limit of 0.138.'
            : 'This rule tolerates far more than the Hebbian 0.138.');
  }

  /**
   * Every pattern in the bank can be used as a probe, stored or not — showing the
   * network something it has never learned is one of the more revealing things to
   * try. The two groups make it obvious which is which.
   */
  function renderLoadOptions() {
    const prev = els.loadSelect.value;
    els.loadSelect.textContent = '';

    const groups = [
      ['Stored in the network', app.library.filter((p) => app.selected.has(p.id))],
      ['Never stored — the network has not seen these', app.library.filter((p) => !app.selected.has(p.id))],
    ];
    for (const [label, items] of groups) {
      if (!items.length) continue;
      const group = document.createElement('optgroup');
      group.label = label;
      for (const item of items) {
        const o = document.createElement('option');
        o.value = item.id;
        o.textContent = item.label;
        group.append(o);
      }
      els.loadSelect.append(group);
    }

    const custom = document.createElement('option');
    custom.value = '__free';
    custom.textContent = '— free drawing —';
    els.loadSelect.append(custom);
    if ([...els.loadSelect.options].some((o) => o.value === prev)) els.loadSelect.value = prev;
  }

  /* ── probe helpers ────────────────────────────────────────────── */

  function setProbe(next, { newTarget = undefined, flash = true } = {}) {
    if (newTarget !== undefined) target = newTarget ? Int8Array.from(newTarget) : null;
    probe.ghost = target;
    probe.showGhost = els.diffToggle.checked && !!target;
    probe.setState(Int8Array.from(next), { flashChanges: flash });
    refreshReadout();
  }

  function currentTargetPattern() {
    const id = els.loadSelect.value;
    return app.library.find((p) => p.id === id) || null;
  }

  function noiseFrac() {
    return Number(els.noiseRange.value) / 100;
  }

  function temperature() {
    return Number(els.tempRange.value) / 40;
  }

  function updatesPerFrame() {
    const v = Number(els.speedRange.value);
    return Math.max(1, Math.round(N * Math.pow(v / 100, 2.2)));
  }

  /* ── readouts ─────────────────────────────────────────────────── */

  function best(overlaps) {
    let bi = -1;
    let bv = 0;
    overlaps.forEach((m, i) => {
      if (Math.abs(m) > Math.abs(bv)) { bv = m; bi = i; }
    });
    return { index: bi, value: bv };
  }

  function refreshReadout() {
    const s = probe.state;
    const e = app.net.energy(s);
    els.energyVal.textContent = app.stored.length ? e.toFixed(2) : '—';
    const ov = app.net.overlaps(s);
    const b = best(ov);
    drawOverlapBars(
      els.bars,
      ov.map((m, i) => ({ label: app.labelFor(i), value: m, highlight: i === b.index }))
    );
    drawEnergyTrace(els.trace, run.history);
    els.sweeps.textContent = String(run.sweeps);
    els.flips.textContent = String(run.flips);
    els.updates.textContent = String(run.updates);
    els.ruleBadge.textContent = RULES[app.rule].label;
    return { e, ov, best: b };
  }

  function setVerdict(kind, title, body) {
    els.verdict.dataset.kind = kind;
    els.verdictTitle.textContent = title;
    els.verdictBody.innerHTML = body;
  }

  function judge(reason) {
    const { ov, best: b } = refreshReadout();
    if (!app.stored.length) {
      setVerdict('bad', 'No memories stored', 'Select at least one pattern in the memory bank.');
      return;
    }
    const label = app.labelFor(b.index);
    const m = b.value;
    const bits = Math.round(((1 - Math.abs(m)) * N) / 2);

    if (reason === 'cycle') {
      setVerdict(
        'warn',
        'Locked into a two-cycle',
        `Synchronous updates can oscillate forever between two states — the energy argument only covers
         one-neuron-at-a-time updates. Switch back to asynchronous dynamics and it will settle.`
      );
      return;
    }
    if (reason === 'thermal') {
      setVerdict(
        'busy',
        `Still jittering at T = ${temperature().toFixed(2)}`,
        `At non-zero temperature neurons sometimes flip <em>uphill</em>, so the state never freezes.
         Closest memory is <b>${label}</b> (m = ${m.toFixed(3)}). Drop T to 0 to let it settle.`
      );
      return;
    }
    if (m >= 0.999) {
      setVerdict('good', `Recalled ${label}`, `Exact fixed point — every one of the ${N} neurons agrees with the stored memory.`);
    } else if (m <= -0.999) {
      setVerdict(
        'warn',
        `Recalled ${label}, inverted`,
        `It landed on −ξ. The energy is even, so the mirror image of every memory is a minimum too —
         an unavoidable feature of the model, not a bug.`
      );
    } else if (Math.abs(m) > 0.9) {
      setVerdict(
        'warn',
        `Almost ${label}`,
        `A fixed point ${bits} bit${bits === 1 ? '' : 's'} away from the memory (m = ${m.toFixed(3)}).
         Crosstalk from the other stored patterns dug a small dent next to the real minimum.`
      );
    } else {
      setVerdict(
        'bad',
        'Spurious attractor',
        `This is a genuine fixed point, but it is nothing you stored — best overlap is only
         ${m.toFixed(3)} with <b>${label}</b>. Mixtures of memories and glassy states outnumber the
         real ones once the network is loaded.`
      );
    }
  }

  /* ── the recall loop ──────────────────────────────────────────── */

  function beginRun() {
    if (!app.stored.length) {
      setVerdict('bad', 'No memories stored', 'Select at least one pattern in the memory bank first.');
      return;
    }
    seed = Int8Array.from(probe.state);
    run.active = true;
    run.sweeps = 0;
    run.flips = 0;
    run.flipsThisSweep = 0;
    run.updates = 0;
    run.cursor = 0;
    run.order = shuffledIndices(N, app.rng);
    run.history = [app.net.energy(probe.state)];
    run.trajectory = [Int8Array.from(probe.state)];
    run.prev = null;
    run.prev2 = null;
    els.runBtn.textContent = 'Pause';
    els.probeStatus.textContent = 'settling';
    setVerdict('busy', 'Settling…', 'Flipping whichever neuron disagrees with its local field.');
    tick();
  }

  function stop(reason = null) {
    run.active = false;
    cancelAnimationFrame(run.raf);
    els.runBtn.textContent = 'Recall';
    els.probeStatus.textContent = reason || 'paused';
    app.setTrajectory(run.trajectory);
  }

  function finish(reason) {
    stop(reason === 'cycle' ? 'two-cycle' : reason === 'thermal' ? 'thermal' : 'converged');
    judge(reason);
  }

  function tick() {
    if (!run.active) return;
    const T = temperature();
    const sync = els.modeSelect.value === 'sync';
    const s = probe.state;

    if (sync) {
      run.prev2 = run.prev;
      run.prev = Int8Array.from(s);
      const flips = app.net.syncStep(s);
      run.flips += flips;
      run.updates += N;
      run.sweeps += 1;
      run.trajectory.push(Int8Array.from(s));
      pushEnergy();
      probe.setState(s, { flashChanges: false });
      for (let i = 0; i < N; i++) if (run.prev[i] !== s[i]) probe.markFlip(i);
      probe.draw();
      if (flips === 0) return finish('fixed');
      if (run.prev2 && sameState(run.prev2, s)) return finish('cycle');
      if (run.sweeps >= MAX_SWEEPS) return finish('thermal');
      run.raf = requestAnimationFrame(() => setTimeout(tick, 90));
      refreshReadout();
      return;
    }

    const sampleEvery = Math.max(1, N >> 4);
    let budget = updatesPerFrame();
    while (budget-- > 0) {
      const i = run.order[run.cursor++];
      const flipped = T > 0 ? app.net.glauber(s, i, T, app.rng) : app.net.update(s, i);
      run.updates++;
      if (flipped) {
        run.flips++;
        run.flipsThisSweep++;
        probe.markFlip(i);
      }
      if (run.updates % sampleEvery === 0) {
        run.history.push(app.net.energy(s));
        if (run.history.length > MAX_TRACE) run.history.shift();
      }
      if (run.cursor >= N) {
        run.cursor = 0;
        run.order = shuffledIndices(N, app.rng);
        run.sweeps++;
        run.trajectory.push(Int8Array.from(s));
        if (run.trajectory.length > 240) run.trajectory.shift();
        const settled = run.flipsThisSweep === 0;
        run.flipsThisSweep = 0;
        if (settled && T === 0) { probe.draw(); refreshReadout(); return finish('fixed'); }
        if (run.sweeps >= MAX_SWEEPS) { probe.draw(); refreshReadout(); return finish(T > 0 ? 'thermal' : 'fixed'); }
      }
    }
    probe.draw();
    refreshReadout();
    run.raf = requestAnimationFrame(tick);
  }

  function pushEnergy() {
    run.history.push(app.net.energy(probe.state));
    if (run.history.length > MAX_TRACE) run.history.shift();
    if (run.trajectory.length > 240) run.trajectory.shift();
  }

  /** Sub-sweep energy sampling keeps the trace a curve rather than three dots. */

  function sameState(a, b) {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  /* ── wiring ───────────────────────────────────────────────────── */

  els.runBtn.addEventListener('click', () => (run.active ? stop() : beginRun()));

  $('#act-step').addEventListener('click', () => {
    if (!app.stored.length) return;
    if (run.active) stop();
    const s = probe.state;
    const before = Int8Array.from(s);
    if (els.modeSelect.value === 'sync') app.net.syncStep(s);
    else app.net.asyncSweep(s, { rng: app.rng, T: temperature() });
    let flips = 0;
    for (let i = 0; i < N; i++) if (before[i] !== s[i]) { flips++; probe.markFlip(i); }
    run.sweeps++;
    run.flips += flips;
    run.updates += N;
    run.history.push(app.net.energy(s));
    if (run.history.length > MAX_TRACE) run.history.shift();
    run.trajectory.push(Int8Array.from(s));
    probe.draw();
    refreshReadout();
    els.probeStatus.textContent = flips === 0 ? 'fixed point' : `${flips} flips`;
    if (flips === 0) judge('fixed');
    app.setTrajectory(run.trajectory);
  });

  $('#act-reset').addEventListener('click', () => {
    if (run.active) stop();
    run.sweeps = run.flips = run.updates = 0;
    run.history = [];
    run.trajectory = [];
    els.probeStatus.textContent = 'idle';
    setVerdict('idle', 'Reset', 'Probe restored. Press <em>Recall</em> to let it settle again.');
    setProbe(seed || target || blank());
  });

  $('#act-noise').addEventListener('click', () => {
    if (run.active) stop();
    const base = currentTargetPattern();
    const src = base ? base.data : probe.state;
    setProbe(corrupt(src, noiseFrac(), app.rng), { newTarget: base ? base.data : target });
    els.probeStatus.textContent = `${Math.round(noiseFrac() * 100)}% corrupted`;
    setVerdict('idle', 'Probe corrupted', `${Math.round(noiseFrac() * N)} of ${N} neurons flipped at random.`);
  });

  $('#act-occlude').addEventListener('click', () => {
    if (run.active) stop();
    const base = currentTargetPattern();
    const src = base ? base.data : probe.state;
    setProbe(occlude(src, 'bottom'), { newTarget: base ? base.data : target });
    els.probeStatus.textContent = 'half erased';
    setVerdict('idle', 'Bottom half erased', 'Associative recall should rebuild the missing half from the top.');
  });

  $('#act-invert').addEventListener('click', () => {
    if (run.active) stop();
    const s = Int8Array.from(probe.state);
    for (let i = 0; i < s.length; i++) s[i] = -s[i];
    setProbe(s);
  });

  $('#act-random').addEventListener('click', () => {
    if (run.active) stop();
    const s = new Int8Array(N);
    for (let i = 0; i < N; i++) s[i] = app.rng() < 0.5 ? -1 : 1;
    setProbe(s, { newTarget: null });
    els.loadSelect.value = '__free';
    els.probeStatus.textContent = 'random';
    setVerdict('idle', 'Random state', 'From pure noise the network usually falls into a spurious minimum.');
  });

  $('#act-clear').addEventListener('click', () => {
    if (run.active) stop();
    setProbe(blank(), { newTarget: null });
    els.loadSelect.value = '__free';
  });

  $('#act-mix').addEventListener('click', () => {
    if (run.active) stop();
    const pats = app.stored.slice(0, 3).map((p) => p.data);
    if (pats.length < 3) {
      setVerdict('warn', 'Need three memories', 'Odd mixture states are built from three stored patterns.');
      return;
    }
    setProbe(mixture(pats, app.rng), { newTarget: null });
    els.loadSelect.value = '__free';
    els.probeStatus.textContent = 'mixture';
    setVerdict(
      'warn',
      'Dropped into a mixture state',
      `sgn(ξ¹+ξ²+ξ³) built from ${app.stored.slice(0, 3).map((p) => p.label).join(', ')}. It is usually a
       stable fixed point that the network will happily "recall" even though it was never stored.`
    );
  });

  els.loadSelect.addEventListener('change', () => {
    if (run.active) stop();
    const item = currentTargetPattern();
    if (!item) return;
    setProbe(item.data, { newTarget: item.data });
    const stored = app.selected.has(item.id);
    els.probeStatus.textContent = stored ? 'clean' : 'not stored';
    setVerdict(
      'idle',
      `Loaded ${item.label}`,
      stored
        ? 'Corrupt it, occlude it, or paint on it — then recall.'
        : `<b>${item.label}</b> is not one of the stored memories, so it is not a fixed point. Recall it
           as-is and the network will drag it into whichever basin it happens to be sitting in — often a
           memory it merely resembles, sometimes a spurious state. Click its card in the bank to store it.`
    );
  });

  els.noiseRange.addEventListener('input', () => {
    els.noiseVal.textContent = `${els.noiseRange.value}%`;
  });
  els.tempRange.addEventListener('input', () => {
    els.tempVal.textContent = temperature().toFixed(2);
  });
  els.speedRange.addEventListener('input', () => {
    els.speedVal.textContent = `${updatesPerFrame()} / frame`;
  });
  els.ruleSelect.addEventListener('change', () => app.setRule(els.ruleSelect.value));
  els.modeSelect.addEventListener('change', () => {
    if (run.active) stop();
  });
  els.diffToggle.addEventListener('change', () => {
    probe.showGhost = els.diffToggle.checked && !!target;
    probe.ghost = target;
    probe.draw();
  });

  $('#glyph-add').addEventListener('click', () => {
    const raw = $('#glyph-input').value.trim();
    if (!raw) return;
    const id = `glyph:${raw}`;
    app.addPattern({ id, label: raw.toUpperCase(), data: patternFromChar(raw.toUpperCase()) });
    $('#glyph-input').value = '';
  });
  $('#glyph-input').addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') $('#glyph-add').click();
  });

  $('#bank-capture').addEventListener('click', () => {
    const n = app.library.filter((p) => p.id.startsWith('custom:')).length + 1;
    app.addPattern({ id: `custom:${n}`, label: `mine ${n}`, data: Int8Array.from(probe.state) });
  });

  $('#bank-none').addEventListener('click', () => app.clearSelection());

  app.addEventListener('library', renderBank);
  app.addEventListener('retrain', () => {
    renderBankState();
    renderLoadOptions();
    refreshReadout();
  });

  window.addEventListener('resize', () => {
    drawEnergyTrace(els.trace, run.history);
    refreshReadout();
  });

  // initial paint
  els.ruleSelect.value = app.rule;
  els.noiseVal.textContent = `${els.noiseRange.value}%`;
  els.tempVal.textContent = temperature().toFixed(2);
  els.speedVal.textContent = `${updatesPerFrame()} / frame`;
  renderBank();
  renderBankState();
  renderLoadOptions();
  probe.ghost = target;
  refreshReadout();
  setVerdict(
    'idle',
    'Ready',
    'Four memories are already stored. Hit <em>Corrupt</em>, then <em>Recall</em>.'
  );

  return { probe, refreshReadout };
}
