/**
 * main.js — wire everything together.
 */

import { App } from './app.js';
import { initLab } from './lab.js';
import { initInternals } from './internals.js';
import { initLandscape } from './landscape.js';
import { initCapacity } from './capacity.js';
import { initHero } from './hero.js';

const app = new App();

initHero(app);
initLab(app);
initInternals(app);
initLandscape(app);
initCapacity();

// Nav highlighting.
const links = [...document.querySelectorAll('.site-header nav a')];
const sections = links
  .map((a) => document.querySelector(a.getAttribute('href')))
  .filter(Boolean);
if ('IntersectionObserver' in window && sections.length) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${e.target.id}`));
      }
    },
    { rootMargin: '-45% 0px -50% 0px' }
  );
  sections.forEach((s) => io.observe(s));
}

// Handy for poking at the model from the console.
window.hopfield = app;
