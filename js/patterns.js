/**
 * patterns.js — the memory bank.
 *
 * Every pattern is a 16×16 bipolar image (256 neurons). Rather than hand-typing
 * bitmaps, each one is drawn as vector art at 8× supersampling and thresholded
 * down, which keeps the shapes crisp and the source readable.
 */

export const SIZE = 16;
export const N = SIZE * SIZE;

const FONT_STACK = '"Inter", "Helvetica Neue", Helvetica, Arial, sans-serif';

export function rasterize(draw, size = SIZE, ss = 8) {
  const c = document.createElement('canvas');
  c.width = c.height = size * ss;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size * ss, size * ss);
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.save();
  ctx.scale(ss, ss);
  draw(ctx, size);
  ctx.restore();

  const data = ctx.getImageData(0, 0, size * ss, size * ss).data;
  const out = new Int8Array(size * size);
  const per = ss * ss * 255;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let acc = 0;
      for (let dy = 0; dy < ss; dy++) {
        const rowOff = (y * ss + dy) * size * ss;
        for (let dx = 0; dx < ss; dx++) acc += data[(rowOff + x * ss + dx) * 4];
      }
      out[y * size + x] = acc / per > 0.5 ? 1 : -1;
    }
  }
  return out;
}

function glyph(ch, weight = 900, scale = 1.0) {
  return (ctx, s) => {
    ctx.font = `${weight} ${s * scale}px ${FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ch, s / 2, s / 2 + s * 0.04);
  };
}

function polygon(points) {
  return (ctx, s) => {
    ctx.beginPath();
    points.forEach(([x, y], i) => {
      const px = x * s;
      const py = y * s;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fill();
  };
}

/*
 * Two families of pattern.
 *
 * The first eight cover roughly half the grid and are close to orthogonal —
 * low-frequency Walsh-like tilings. They behave like the random patterns the
 * theory assumes, so recall on them is crisp.
 *
 * The rest are sparse icons and glyphs. They share a mostly-empty background,
 * which makes them strongly correlated with one another — and that is exactly
 * the failure mode section 02 is about, so they are worth keeping around.
 */
const SHAPES = {
  disk: (ctx, s) => {
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s * 0.399, 0, Math.PI * 2); // πr² = ½s²
    ctx.fill();
  },
  half: (ctx, s) => ctx.fillRect(0, 0, s, s / 2),
  bars: (ctx, s) => {
    for (let k = 0; k < 8; k += 2) ctx.fillRect((k * s) / 8, 0, s / 8, s);
  },
  rows: (ctx, s) => {
    for (let k = 0; k < 8; k += 2) ctx.fillRect(0, (k * s) / 8, s, s / 8);
  },
  checker: (ctx, s) => {
    const t = s / 4;
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) if ((x + y) % 2 === 0) ctx.fillRect(x * t, y * t, t, t);
    }
  },
  wedge: polygon([[0, 0], [1, 0], [0, 1]]),
  quads: (ctx, s) => {
    ctx.fillRect(0, 0, s / 2, s / 2);
    ctx.fillRect(s / 2, s / 2, s / 2, s / 2);
  },
  annuli: (ctx, s) => {
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = s * 0.1;
    for (const r of [0.3, 0.45]) {
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, s * r, 0, Math.PI * 2);
      ctx.stroke();
    }
  },

  heart: (ctx, s) => {
    const u = s / 16;
    ctx.beginPath();
    ctx.moveTo(8 * u, 14 * u);
    ctx.bezierCurveTo(-2 * u, 7.5 * u, 2 * u, 1 * u, 8 * u, 5 * u);
    ctx.bezierCurveTo(14 * u, 1 * u, 18 * u, 7.5 * u, 8 * u, 14 * u);
    ctx.fill();
  },
  star: polygon(
    Array.from({ length: 10 }, (_, k) => {
      const r = k % 2 === 0 ? 0.46 : 0.19;
      const a = (Math.PI * 2 * k) / 10 - Math.PI / 2;
      return [0.5 + r * Math.cos(a), 0.52 + r * Math.sin(a)];
    })
  ),
  ring: (ctx, s) => {
    ctx.lineWidth = s * 0.16;
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s * 0.34, 0, Math.PI * 2);
    ctx.stroke();
  },
  plus: (ctx, s) => {
    const t = s * 0.22;
    ctx.fillRect(s / 2 - t / 2, s * 0.12, t, s * 0.76);
    ctx.fillRect(s * 0.12, s / 2 - t / 2, s * 0.76, t);
  },
  smiley: (ctx, s) => {
    ctx.lineWidth = s * 0.11;
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s * 0.40, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(s * 0.36, s * 0.40, s * 0.055, 0, Math.PI * 2);
    ctx.arc(s * 0.64, s * 0.40, s * 0.055, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(s / 2, s * 0.54, s * 0.20, 0.25 * Math.PI, 0.75 * Math.PI);
    ctx.stroke();
  },
  arrow: polygon([
    [0.5, 0.08], [0.94, 0.52], [0.68, 0.52], [0.68, 0.94],
    [0.32, 0.94], [0.32, 0.52], [0.06, 0.52],
  ]),
  diamond: polygon([[0.5, 0.04], [0.96, 0.5], [0.5, 0.96], [0.04, 0.5]]),
  spiral: (ctx, s) => {
    ctx.lineWidth = s * 0.12;
    ctx.beginPath();
    for (let t = 0; t < Math.PI * 4.2; t += 0.02) {
      const r = (t / (Math.PI * 4.2)) * s * 0.42;
      const x = s / 2 + r * Math.cos(t);
      const y = s / 2 + r * Math.sin(t);
      t === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  },
};

/** The default memory bank offered in the lab. */
export const LIBRARY = [
  { id: 'disk', label: 'Disk', draw: SHAPES.disk },
  { id: 'half', label: 'Half', draw: SHAPES.half },
  { id: 'bars', label: 'Bars', draw: SHAPES.bars },
  { id: 'rows', label: 'Rows', draw: SHAPES.rows },
  { id: 'checker', label: 'Checker', draw: SHAPES.checker },
  { id: 'wedge', label: 'Wedge', draw: SHAPES.wedge },
  { id: 'quads', label: 'Quads', draw: SHAPES.quads },
  { id: 'annuli', label: 'Annuli', draw: SHAPES.annuli },
  { id: 'heart', label: 'Heart', draw: SHAPES.heart },
  { id: 'star', label: 'Star', draw: SHAPES.star },
  { id: 'smiley', label: 'Face', draw: SHAPES.smiley },
  { id: 'ring', label: 'Ring', draw: SHAPES.ring },
  { id: 'plus', label: 'Plus', draw: SHAPES.plus },
  { id: 'arrow', label: 'Arrow', draw: SHAPES.arrow },
  { id: 'diamond', label: 'Diamond', draw: SHAPES.diamond },
  { id: 'spiral', label: 'Spiral', draw: SHAPES.spiral },
  { id: 'A', label: 'A', draw: glyph('A', 900, 1.05) },
  { id: 'E', label: 'E', draw: glyph('E', 900, 1.05) },
  { id: 'S', label: 'S', draw: glyph('S', 900, 1.05) },
  { id: 'Z', label: 'Z', draw: glyph('Z', 900, 1.05) },
];


export function buildLibrary() {
  return LIBRARY.map((item) => ({
    id: item.id,
    label: item.label,
    data: rasterize(item.draw),
  }));
}

/** Rasterise an arbitrary character — used by the "add a glyph" control. */
export function patternFromChar(ch) {
  return rasterize(glyph(ch, 900, ch.length > 1 ? 0.7 : 1.05));
}

export function blank() {
  return new Int8Array(N).fill(-1);
}

/** Mask out one half of a pattern (occlusion test). */
export function occlude(pattern, side = 'bottom') {
  const out = Int8Array.from(pattern);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const hit =
        (side === 'bottom' && y >= SIZE / 2) ||
        (side === 'top' && y < SIZE / 2) ||
        (side === 'left' && x < SIZE / 2) ||
        (side === 'right' && x >= SIZE / 2);
      if (hit) out[y * SIZE + x] = -1;
    }
  }
  return out;
}
