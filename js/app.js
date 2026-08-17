/**
 * app.js — shared state: the pattern library, which patterns are stored,
 * the learning rule, the trained network, and the last recall trajectory.
 * Modules listen for 'retrain' and 'recall' instead of talking to each other.
 */

import { HopfieldNetwork, makeRng } from './hopfield.js';
import { buildLibrary, N, SIZE } from './patterns.js';

export class App extends EventTarget {
  constructor() {
    super();
    this.N = N;
    this.SIZE = SIZE;
    this.rng = makeRng(20241008);
    this.library = buildLibrary();
    this.selected = new Set(['disk', 'half', 'bars', 'checker']);
    this.rule = 'hebbian';
    this.net = new HopfieldNetwork(N);
    this.trajectory = [];
    this.retrain();
  }

  get stored() {
    return this.library.filter((p) => this.selected.has(p.id));
  }

  retrain() {
    this.net.train(this.stored.map((p) => p.data), this.rule);
    this.dispatchEvent(new CustomEvent('retrain'));
  }

  setRule(rule) {
    this.rule = rule;
    this.retrain();
  }

  toggle(id) {
    this.selected.has(id) ? this.selected.delete(id) : this.selected.add(id);
    this.retrain();
  }

  clearSelection() {
    this.selected.clear();
    this.retrain();
  }

  addPattern(entry, { select = true } = {}) {
    const existing = this.library.findIndex((p) => p.id === entry.id);
    if (existing >= 0) this.library[existing] = entry;
    else this.library.push(entry);
    if (select) this.selected.add(entry.id);
    this.dispatchEvent(new CustomEvent('library'));
    this.retrain();
    return entry;
  }

  labelFor(index) {
    return this.stored[index]?.label ?? `#${index}`;
  }

  setTrajectory(states) {
    this.trajectory = states;
    this.dispatchEvent(new CustomEvent('recall'));
  }
}
