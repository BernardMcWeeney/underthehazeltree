/**
 * Generates the site's illustrations as SVG files in `public/img/`.
 *
 * Everything here is deterministic: each scene is drawn from a seeded PRNG, so
 * regenerating produces byte-identical files and the committed art never drifts.
 * Run with `npm run art`.
 */
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../public/img');

/* ------------------------------------------------------------------ random */

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const seedFrom = (str) => {
  let h = 2166136261;
  for (const ch of str) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/** Coordinates: one decimal is plenty and keeps the files small. */
const n = (v) => Math.round(v * 10) / 10;
/** Opacity: two decimals, leading zero trimmed. */
const o = (v) => String(Math.round(Math.max(0, Math.min(1, v)) * 100) / 100).replace(/^0/, '');

/* ------------------------------------------------------------------ colour */

/** Mixes two hex colours, `t` from 0 (a) to 1 (b). */
function mix(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const out = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return '#' + out.map((v) => v.toString(16).padStart(2, '0')).join('');
}

/**
 * Each palette runs dark → light through `canopy`, which is what gives the
 * foliage its modelling: shadow underneath, sunlit gold on top.
 */
const palettes = {
  goldenHill: {
    skyTop: '#6d8455',
    skyMid: '#b9bd76',
    skyLow: '#f6e0a3',
    sun: '#fff6da',
    hills: ['#4c5c31', '#3b4a25', '#2b371b'],
    ground: '#41541f',
    groundLow: '#1f2c11',
    bark: '#2b2016',
    barkLit: '#7c6034',
    canopy: ['#1e2c12', '#33481c', '#547029', '#87994a', '#c3bb66', '#e9d98a'],
    accent: '#ffefb8',
  },
  wood: {
    skyTop: '#7d9358',
    skyMid: '#bcc47f',
    skyLow: '#eee7b4',
    sun: '#fdf6d8',
    hills: ['#41552b', '#334524', '#25331a'],
    ground: '#3a4c22',
    groundLow: '#1d2810',
    bark: '#2c2418',
    barkLit: '#71583a',
    canopy: ['#1b2810', '#2f421a', '#4d6826', '#7d9044', '#b3b45f', '#ddd08b'],
    accent: '#f5ecc0',
  },
  coast: {
    skyTop: '#5d7383',
    skyMid: '#a9b4ae',
    skyLow: '#f0e2c2',
    sun: '#fdf0d5',
    hills: ['#46553f', '#37432f', '#28311f'],
    ground: '#46592c',
    groundLow: '#232f16',
    bark: '#2f2a1e',
    barkLit: '#6d5c40',
    canopy: ['#1d2814', '#324220', '#51672e', '#84924b', '#b6b06a', '#e0d195'],
    accent: '#f4e6c4',
  },
  water: {
    skyTop: '#5c7a48',
    skyMid: '#a6b76c',
    skyLow: '#ebe4ad',
    sun: '#fbf4cf',
    hills: ['#3a4d26', '#2d3c1e', '#202b15'],
    ground: '#334425',
    groundLow: '#1a2410',
    bark: '#2a2216',
    barkLit: '#6a5334',
    canopy: ['#182410', '#2b3e18', '#496225', '#788c40', '#adaf5c', '#d9cd88'],
    accent: '#f3e7b4',
  },
  bog: {
    skyTop: '#7c8574',
    skyMid: '#c3b98d',
    skyLow: '#f6e2b0',
    sun: '#fff2cf',
    hills: ['#5c5a3b', '#48452c', '#33301e'],
    ground: '#514a2c',
    groundLow: '#2b2715',
    bark: '#2f2718',
    barkLit: '#6f5a37',
    canopy: ['#2a2c14', '#41411d', '#63602c', '#8f8746', '#bcac66', '#e3cf93'],
    accent: '#f9e7b6',
  },
  winter: {
    skyTop: '#93a099',
    skyMid: '#cfcbb4',
    skyLow: '#f4ead3',
    sun: '#fffaec',
    hills: ['#5c6154', '#484c40', '#34382d'],
    ground: '#5a5c45',
    groundLow: '#34351f',
    bark: '#332b1f',
    barkLit: '#7f6a48',
    canopy: ['#4a4630', '#6a6240', '#8b7f52', '#ab9b68', '#c9b98a', '#e8dcbb'],
    accent: '#fbf3de',
  },
  hearth: {
    skyTop: '#2a2318',
    skyMid: '#6d5027',
    skyLow: '#d9a955',
    sun: '#ffdb95',
    hills: ['#3c3122', '#2e261a', '#221c13'],
    ground: '#413221',
    groundLow: '#241b11',
    bark: '#241d14',
    barkLit: '#7a5f33',
    canopy: ['#2c2614', '#43391c', '#63512a', '#8a7040', '#b39159', '#dcb87f'],
    accent: '#ffe3a8',
  },
};

/* --------------------------------------------------------------- primitives */

/** A soft, irregular horizon line drawn as a smooth cubic path. */
function ridge(rng, { w, y, amp, steps = 7, tilt = 0 }) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push({
      x: t * w,
      y: y + tilt * t * w + (rng() - 0.5) * amp * 2 - Math.sin(t * Math.PI) * amp * 0.6,
    });
  }
  let d = `M -20 ${n(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const cx = (a.x + b.x) / 2;
    d += ` C ${n(cx)} ${n(a.y)} ${n(cx)} ${n(b.y)} ${n(b.x)} ${n(b.y)}`;
  }
  return d;
}

/**
 * A mass of leaves, modelled in four passes: a dark base, midtones, sunlit
 * highlights on the side facing the light, and a few bright sparks. Building it
 * this way is what stops the canopy reading as a flat scatter of dots.
 */
function foliageMass(rng, { x, y, r, palette, light = { x: 0.4, y: -0.9 }, density = 1 }) {
  const c = palette.canopy;
  let s = `<g transform="scale(1 .84)">`;
  const yc = y / 0.84;
  const blob = (cx, cy, rr, fill, op) =>
    `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(rr)}" fill="${fill}" opacity="${o(op)}"/>`;

  const pass = (count, radius, spread, tone, opRange, bias) => {
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2;
      const d = Math.sqrt(rng()) * r * spread;
      const cx = x + Math.cos(a) * d + light.x * r * bias;
      const cy = yc + (Math.sin(a) * d * 0.78 + light.y * r * bias) / 0.84;
      s += blob(cx, cy, r * radius * (0.7 + rng() * 0.6), tone, opRange[0] + rng() * (opRange[1] - opRange[0]));
    }
  };

  pass(Math.round(7 * density), 0.5, 0.72, c[1], [0.85, 1], 0);
  pass(Math.round(9 * density), 0.36, 0.86, c[2], [0.7, 0.95], 0.06);
  pass(Math.round(9 * density), 0.26, 0.82, c[3], [0.6, 0.9], 0.16);
  pass(Math.round(7 * density), 0.17, 0.7, c[4], [0.5, 0.85], 0.28);
  pass(Math.round(4 * density), 0.1, 0.6, c[5], [0.4, 0.8], 0.36);
  // Shadowed underside
  pass(Math.round(3 * density), 0.3, 0.6, c[0], [0.3, 0.55], -0.34);
  return s + `</g>`;
}

/** Recursive branch structure; leaves are hung on the outermost tips. */
function limb(rng, { x, y, angle, len, width, depth, palette, leafSize, out, bare = false }) {
  const sway = (rng() - 0.5) * 0.5;
  const x2 = x + Math.cos(angle) * len;
  const y2 = y + Math.sin(angle) * len;
  const cx = x + Math.cos(angle + sway) * len * 0.55;
  const cy = y + Math.sin(angle + sway) * len * 0.55;
  const tone = mix(palette.bark, palette.barkLit, Math.min(0.9, 0.1 + rng() * 0.35 + (5 - depth) * 0.06));
  out.push(
    `<path d="M ${n(x)} ${n(y)} Q ${n(cx)} ${n(cy)} ${n(x2)} ${n(y2)}" stroke="${tone}" stroke-width="${n(
      width,
    )}" stroke-linecap="round" fill="none"/>`,
  );

  if (depth <= 0 || width < 1.2) {
    if (!bare) out.push(foliageMass(rng, { x: x2, y: y2, r: leafSize, palette, density: 0.4 }));
    return;
  }
  const kids = rng() < 0.3 ? 3 : 2;
  for (let i = 0; i < kids; i++) {
    const spread = 0.4 + rng() * 0.45;
    const dir = i === 0 ? -1 : i === 1 ? 1 : (rng() - 0.5) * 0.6;
    limb(rng, {
      x: x2,
      y: y2,
      angle: angle + dir * spread + (rng() - 0.5) * 0.22,
      len: len * (0.62 + rng() * 0.2),
      width: width * 0.62,
      depth: depth - 1,
      palette,
      leafSize: leafSize * (0.82 + rng() * 0.28),
      out,
      bare,
    });
  }
}

/** A full hazel: buttressed trunk, layered canopy, hanging nuts. */
function hazelTree(
  rng,
  { x, y, height, palette, depth = 3, leafSize = 44, nuts = true, masses = 6, bare = false, spread = 1 },
) {
  const out = [];
  const trunkW = height * 0.1;
  const topY = y - height * 0.5;

  // Trunk with a root flare, then a lit edge on the sunward side
  const trunk = (lw, rw) =>
    `M ${n(x - trunkW * lw)} ${n(y)} C ${n(x - trunkW * lw * 0.75)} ${n(y - height * 0.05)} ${n(
      x - trunkW * 0.62,
    )} ${n(y - height * 0.1)} ${n(x - trunkW * 0.46)} ${n(y - height * 0.2)} C ${n(x - trunkW * 0.42)} ${n(
      y - height * 0.32,
    )} ${n(x - trunkW * 0.4)} ${n(y - height * 0.42)} ${n(x - trunkW * 0.4)} ${n(topY)} L ${n(
      x + trunkW * 0.4,
    )} ${n(topY)} C ${n(x + trunkW * 0.4)} ${n(y - height * 0.42)} ${n(x + trunkW * 0.44)} ${n(
      y - height * 0.32,
    )} ${n(x + trunkW * 0.48)} ${n(y - height * 0.2)} C ${n(x + trunkW * 0.66)} ${n(y - height * 0.1)} ${n(
      x + trunkW * rw * 0.78,
    )} ${n(y - height * 0.05)} ${n(x + trunkW * rw)} ${n(y)} Z`;

  out.push(`<path d="${trunk(1.55, 1.65)}" fill="${palette.bark}"/>`);
  // Lit edge on the sunward side
  out.push(
    `<path d="M ${n(x + trunkW * 0.1)} ${n(y)} C ${n(x + trunkW * 0.16)} ${n(y - height * 0.2)} ${n(
      x + trunkW * 0.2,
    )} ${n(y - height * 0.36)} ${n(x + trunkW * 0.18)} ${n(topY)} L ${n(x + trunkW * 0.4)} ${n(topY)} C ${n(
      x + trunkW * 0.4,
    )} ${n(y - height * 0.42)} ${n(x + trunkW * 0.44)} ${n(y - height * 0.32)} ${n(x + trunkW * 0.48)} ${n(
      y - height * 0.2,
    )} C ${n(x + trunkW * 0.66)} ${n(y - height * 0.1)} ${n(x + trunkW * 1.29)} ${n(y - height * 0.05)} ${n(
      x + trunkW * 1.65,
    )} ${n(y)} Z" fill="${mix(palette.bark, palette.barkLit, 0.5)}" opacity=".8"/>`,
  );

  // Bark striations
  for (let i = 0; i < 6; i++) {
    const bx = x + (rng() - 0.5) * trunkW * 1.6;
    out.push(
      `<path d="M ${n(bx)} ${n(y - height * 0.02)} Q ${n(bx + (rng() - 0.5) * 8)} ${n(y - height * 0.26)} ${n(
        bx + (rng() - 0.5) * 12,
      )} ${n(topY)}" stroke="${mix(palette.bark, '#000000', 0.25)}" stroke-width="${n(1 + rng() * 2)}" fill="none" opacity="${o(
        0.25 + rng() * 0.35,
      )}"/>`,
    );
  }

  const limbs = 4 + Math.floor(rng() * 2);
  for (let i = 0; i < limbs; i++) {
    const t = limbs === 1 ? 0.5 : i / (limbs - 1);
    limb(rng, {
      x: x + (t - 0.5) * trunkW * 0.8,
      y: topY + rng() * height * 0.04,
      angle: -Math.PI / 2 + (t - 0.5) * 1.6 * spread + (rng() - 0.5) * 0.25,
      len: height * (0.19 + rng() * 0.1),
      width: trunkW * 0.44,
      depth,
      palette,
      leafSize,
      out,
      bare,
    });
  }

  if (!bare) {
    // Broad canopy masses over the branch tips, so the crown reads as one shape
    const crownY = topY - height * 0.2;
    const crownR = height * 0.34 * spread;
    for (let i = 0; i < masses; i++) {
      const a = (i / masses) * Math.PI * 2 + rng() * 0.8;
      out.push(
        foliageMass(rng, {
          x: x + Math.cos(a) * crownR * (0.4 + rng() * 0.6),
          y: crownY + Math.sin(a) * crownR * (0.34 + rng() * 0.42),
          r: leafSize * 1.75,
          palette,
        }),
      );
    }
    if (nuts) {
      for (let i = 0; i < 10; i++) {
        const nx = x + (rng() - 0.5) * height * 0.6;
        const ny = crownY + (rng() - 0.4) * height * 0.34;
        out.push(
          `<circle cx="${n(nx)}" cy="${n(ny)}" r="${n(2.5 + rng() * 2.5)}" fill="${palette.accent}" opacity="${o(
            0.35 + rng() * 0.35,
          )}"/>`,
        );
      }
    }
  }
  return out.join('');
}

/** Grass, ferns and small growth along a ground line. */
function undergrowth(rng, { w, y, palette, count = 60, scale = 1, dark = false }) {
  let out = '';
  for (let i = 0; i < count; i++) {
    const x = rng() * w;
    const h = (12 + rng() * 40) * scale;
    const lean = (rng() - 0.5) * 16 * scale;
    const tone = dark
      ? mix(palette.groundLow, '#000000', rng() * 0.4)
      : mix(palette.ground, palette.canopy[4], rng() * 0.85);
    out += `<path d="M ${n(x)} ${n(y + rng() * 14)} Q ${n(x + lean * 0.4)} ${n(y - h * 0.6)} ${n(x + lean)} ${n(
      y - h,
    )}" stroke="${tone}" stroke-width="${n(1 + rng() * 1.8)}" fill="none" stroke-linecap="round" opacity="${o(
      0.45 + rng() * 0.5,
    )}"/>`;
  }
  return out;
}

/** Long, soft shafts of light thrown from the sun's position. */
function sunShafts(rng, { w, h, origin, count = 6, spreadTo = 0.9 }) {
  let s = `<g style="mix-blend-mode:screen">`;
  for (let i = 0; i < count; i++) {
    const t = (i + rng() * 0.6) / count;
    const endX = w * (t * spreadTo + (1 - spreadTo) / 2);
    const width = w * (0.02 + rng() * 0.06);
    s += `<path d="M ${n(origin.x - width * 0.2)} ${n(origin.y)} L ${n(origin.x + width * 0.2)} ${n(
      origin.y,
    )} L ${n(endX + width)} ${n(h * 1.05)} L ${n(endX - width)} ${n(h * 1.05)} Z" fill="url(#shaft)" opacity="${o(
      0.07 + rng() * 0.1,
    )}" filter="url(#softenSm)"/>`;
  }
  return s + `</g>`;
}

/** Warm motes hanging in the light. */
function motes(rng, { w, h, origin, count = 16 }) {
  let s = `<g style="mix-blend-mode:screen">`;
  for (let i = 0; i < count; i++) {
    const x = origin.x + (rng() - 0.5) * w * 0.8;
    const y = origin.y + rng() * h * 0.7;
    s += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(2 + rng() * 7)}" fill="url(#glow)" opacity="${o(
      0.15 + rng() * 0.3,
    )}"/>`;
  }
  return s + `</g>`;
}

function defs(palette, { sunX = 0.7, sunY = 0.22 } = {}) {
  return `<defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0.1" y2="1">
      <stop offset="0" stop-color="${palette.skyTop}"/>
      <stop offset="0.45" stop-color="${palette.skyMid}"/>
      <stop offset="1" stop-color="${palette.skyLow}"/>
    </linearGradient>
    <radialGradient id="sunGlow" cx="${sunX}" cy="${sunY}" r="0.7">
      <stop offset="0" stop-color="${palette.sun}" stop-opacity="0.92"/>
      <stop offset="0.3" stop-color="${palette.sun}" stop-opacity="0.42"/>
      <stop offset="0.7" stop-color="${palette.sun}" stop-opacity="0.1"/>
      <stop offset="1" stop-color="${palette.sun}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${palette.sun}" stop-opacity="0.85"/>
      <stop offset="1" stop-color="${palette.sun}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="shaft" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${palette.sun}" stop-opacity="0.55"/>
      <stop offset="1" stop-color="${palette.sun}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${palette.ground}"/>
      <stop offset="1" stop-color="${palette.groundLow}"/>
    </linearGradient>
    <radialGradient id="vignette" cx="0.5" cy="0.42" r="0.8">
      <stop offset="0.5" stop-color="#000000" stop-opacity="0"/>
      <stop offset="1" stop-color="#12160a" stop-opacity="0.5"/>
    </radialGradient>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="11" result="noise"/>
      <feColorMatrix in="noise" type="saturate" values="0"/>
    </filter>
    <filter id="soften" x="-15%" y="-15%" width="130%" height="130%">
      <feGaussianBlur stdDeviation="9"/>
    </filter>
    <filter id="softenSm" x="-15%" y="-15%" width="130%" height="130%">
      <feGaussianBlur stdDeviation="3"/>
    </filter>
  </defs>`;
}

const frame = (w, h, body, viewBox) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox ?? `0 0 ${w} ${h}`}" width="${w}" height="${h}" role="img">${body}</svg>\n`;

/** A whisper of film grain — enough to break up the flat vector fills. */
const grainLayer = (w, h) =>
  `<rect width="${w}" height="${h}" filter="url(#grain)" opacity=".09" style="mix-blend-mode:overlay"/>`;
const vignetteLayer = (w, h) => `<rect width="${w}" height="${h}" fill="url(#vignette)"/>`;

/* ------------------------------------------------------------------ scenes */

/** Rolling hills with a single great hazel — the hero scene. */
function sceneHill(rng, w, h, palette, { hero = false } = {}) {
  const sunX = 0.66;
  const sunY = 0.2;
  let s = defs(palette, { sunX, sunY });
  s += `<rect width="${w}" height="${h}" fill="url(#sky)"/>`;
  s += `<circle cx="${n(w * sunX)}" cy="${n(h * sunY)}" r="${n(h * 0.07)}" fill="${palette.sun}" filter="url(#soften)"/>`;
  s += `<rect width="${w}" height="${h}" fill="url(#sunGlow)"/>`;

  const horizon = h * 0.66;
  palette.hills.forEach((c, i) => {
    const y = horizon - (palette.hills.length - i) * h * 0.05;
    s += `<path d="${ridge(rng, { w, y, amp: h * 0.04, steps: 6, tilt: i % 2 ? 0.018 : -0.012 })} L ${w + 20} ${
      h + 20
    } L -20 ${h + 20} Z" fill="${c}" opacity="${o(0.8 + i * 0.07)}"/>`;
  });

  s += `<path d="${ridge(rng, { w, y: horizon + h * 0.03, amp: h * 0.018, steps: 8 })} L ${w + 20} ${h + 20} L -20 ${
    h + 20
  } Z" fill="url(#floor)"/>`;

  // Dry-stone wall running away to the right
  const wallY = horizon + h * 0.14;
  for (let i = 0; i < 46; i++) {
    const t = i / 46;
    const x = w * 0.52 + t * w * 0.56;
    const yy = wallY + t * t * h * 0.2;
    const sw = 24 - t * 11;
    for (let r = 0; r < 3; r++) {
      s += `<rect x="${n(x)}" y="${n(yy - r * sw * 0.34)}" width="${n(sw * 0.92)}" height="${n(sw * 0.32)}" rx="${n(
        sw * 0.13,
      )}" fill="${mix('#8e8468', palette.groundLow, 0.35 + rng() * 0.45)}" opacity="${o(0.6 + rng() * 0.3)}"/>`;
    }
  }

  // Hedgerow trees in the middle distance
  for (let i = 0; i < 5; i++) {
    const x = w * (0.04 + rng() * 0.42);
    s += `<g opacity="${o(0.5 + rng() * 0.28)}">${hazelTree(rng, {
      x,
      y: horizon + h * 0.04,
      height: h * (0.13 + rng() * 0.07),
      palette,
      depth: 2,
      leafSize: 15,
      masses: 3,
      nuts: false,
    })}</g>`;
  }

  s += hazelTree(rng, {
    x: w * (hero ? 0.66 : 0.56),
    y: h * 0.98,
    height: h * (hero ? 1.06 : 0.9),
    palette,
    depth: 3,
    leafSize: hero ? 66 : 40,
    masses: hero ? 10 : 6,
    spread: hero ? 1.15 : 1,
  });

  // Warm haze sitting on the horizon line
  s += `<rect x="0" y="${n(horizon - h * 0.1)}" width="${w}" height="${n(h * 0.16)}" fill="${
    palette.skyLow
  }" opacity=".22" filter="url(#soften)"/>`;
  s += sunShafts(rng, { w, h, origin: { x: w * sunX, y: h * sunY }, count: hero ? 6 : 4 });
  s += motes(rng, { w, h, origin: { x: w * 0.6, y: h * 0.15 }, count: hero ? 18 : 10 });
  s += undergrowth(rng, { w, y: h * 0.99, palette, count: hero ? 120 : 70, scale: 1.25 });
  s += undergrowth(rng, { w, y: h * 1.03, palette, count: hero ? 60 : 30, scale: 1.9, dark: true });
  s += vignetteLayer(w, h);
  s += grainLayer(w, h);
  return s;
}

/** A path going in under trees, with light coming through the canopy. */
function sceneWood(rng, w, h, palette) {
  let s = defs(palette, { sunX: 0.5, sunY: 0.08 });
  s += `<rect width="${w}" height="${h}" fill="url(#sky)"/>`;
  s += `<rect width="${w}" height="${h}" fill="url(#sunGlow)"/>`;

  const horizon = h * 0.6;
  s += `<path d="${ridge(rng, { w, y: horizon, amp: h * 0.025, steps: 5 })} L ${w + 20} ${h + 20} L -20 ${h + 20} Z" fill="url(#floor)"/>`;

  // The path, winding out of the trees toward the viewer
  s += `<path d="M ${n(w * 0.52)} ${n(horizon - h * 0.01)} C ${n(w * 0.47)} ${n(h * 0.76)} ${n(w * 0.66)} ${n(
    h * 0.86,
  )} ${n(w * 0.56)} ${n(h + 10)} L ${n(w * 0.16)} ${n(h + 10)} C ${n(w * 0.32)} ${n(h * 0.84)} ${n(w * 0.43)} ${n(
    h * 0.72,
  )} ${n(w * 0.48)} ${n(horizon - h * 0.01)} Z" fill="${mix('#cbb98c', palette.groundLow, 0.32)}" opacity=".9"/>`;

  // Trunks, nearer ones larger and darker
  for (let i = 0; i < 5; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const t = rng();
    const x = w * 0.5 + side * (w * 0.12 + t * w * 0.44);
    s += `<g opacity="${o(0.6 + rng() * 0.4)}">${hazelTree(rng, {
      x,
      y: horizon + h * (0.05 + rng() * 0.3),
      height: h * (0.6 + rng() * 0.5),
      palette,
      depth: 2,
      leafSize: 40 + rng() * 16,
      masses: 5,
      nuts: false,
    })}</g>`;
  }

  s += sunShafts(rng, { w, h, origin: { x: w * 0.5, y: 0 }, count: 6, spreadTo: 1.1 });
  s += motes(rng, { w, h, origin: { x: w * 0.5, y: h * 0.1 }, count: 14 });
  s += undergrowth(rng, { w, y: h * 0.99, palette, count: 80 });
  s += vignetteLayer(w, h);
  s += grainLayer(w, h);
  return s;
}

/** A road going up over the headland, with the sea beyond it. */
function sceneCoast(rng, w, h, palette) {
  let s = defs(palette, { sunX: 0.34, sunY: 0.15 });
  s += `<rect width="${w}" height="${h}" fill="url(#sky)"/>`;
  s += `<circle cx="${n(w * 0.34)}" cy="${n(h * 0.15)}" r="${n(h * 0.05)}" fill="${palette.sun}" filter="url(#soften)"/>`;
  s += `<rect width="${w}" height="${h}" fill="url(#sunGlow)"/>`;

  for (let i = 0; i < 9; i++) {
    s += `<ellipse cx="${n(rng() * w)}" cy="${n(h * (0.05 + rng() * 0.3))}" rx="${n(w * (0.1 + rng() * 0.2))}" ry="${n(
      h * (0.015 + rng() * 0.04),
    )}" fill="${mix('#ffffff', palette.skyMid, 0.3)}" opacity="${o(0.2 + rng() * 0.4)}" filter="url(#soften)"/>`;
  }

  // The sea, showing in the dip between the headlands
  const horizon = h * 0.52;
  s += `<rect x="0" y="${n(horizon)}" width="${w}" height="${n(h * 0.16)}" fill="${mix(
    '#5b7683',
    palette.hills[0],
    0.3,
  )}"/>`;
  s += `<ellipse cx="${n(w * 0.34)}" cy="${n(horizon + h * 0.03)}" rx="${n(w * 0.12)}" ry="${n(
    h * 0.03,
  )}" fill="${palette.sun}" opacity=".35" filter="url(#soften)"/>`;
  for (let i = 0; i < 18; i++) {
    const y = horizon + rng() * h * 0.1;
    const x = rng() * w;
    s += `<path d="M ${n(x)} ${n(y)} q ${n(18 + rng() * 20)} ${n(-1.5 - rng() * 2)} ${n(36 + rng() * 44)} 0" stroke="${
      palette.accent
    }" stroke-width="1.2" fill="none" opacity="${o(0.12 + rng() * 0.28)}"/>`;
  }

  // Headlands closing in from both sides
  s += `<path d="M -20 ${n(horizon - h * 0.06)} C ${n(w * 0.1)} ${n(horizon - h * 0.09)} ${n(w * 0.2)} ${n(
    horizon + h * 0.02,
  )} ${n(w * 0.3)} ${n(horizon + h * 0.09)} L -20 ${n(horizon + h * 0.09)} Z" fill="${palette.hills[1]}"/>`;
  s += `<path d="M ${n(w + 20)} ${n(horizon - h * 0.04)} C ${n(w * 0.86)} ${n(horizon - h * 0.05)} ${n(
    w * 0.75,
  )} ${n(horizon + h * 0.03)} ${n(w * 0.66)} ${n(horizon + h * 0.1)} L ${n(w + 20)} ${n(
    horizon + h * 0.1,
  )} Z" fill="${palette.hills[1]}"/>`;

  // The near land, rising to meet the road
  s += `<path d="${ridge(rng, { w, y: horizon + h * 0.08, amp: h * 0.02, steps: 6 })} L ${w + 20} ${h + 20} L -20 ${
    h + 20
  } Z" fill="url(#floor)"/>`;

  // The road: a pale ribbon narrowing to a bend near the top
  const topX = w * 0.52;
  const topY = horizon + h * 0.07;
  const left = [];
  const right = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    const ease = t * t;
    const cx = w * 0.42 + (topX - w * 0.42) * ease + Math.sin(t * Math.PI) * w * 0.09;
    const cy = h + 10 + (topY - h - 10) * (0.35 * t + 0.65 * ease);
    const half = (w * 0.19) * (1 - t) ** 1.7 + 1.5;
    left.push([cx - half, cy]);
    right.push([cx + half, cy]);
  }
  const poly = [...left, ...right.reverse()].map(([x, y]) => `${n(x)} ${n(y)}`).join(' L ');
  s += `<path d="M ${poly} Z" fill="${mix('#cdbf9c', palette.groundLow, 0.28)}"/>`;
  // Worn centre and darker edges
  s += `<path d="M ${left
    .map(([x, y], i) => `${n(x + (right[right.length - 1 - i][0] - x) * 0.5)} ${n(y)}`)
    .join(' L ')}" stroke="${mix('#e0d4b2', palette.groundLow, 0.2)}" stroke-width="2" fill="none" opacity=".35"/>`;

  // Dry-stone wall following the road up the rise
  for (let i = 0; i < 13; i++) {
    const t = i / 13;
    const [x, y] = right[right.length - 1 - i] ?? right[0];
    const sw = 26 * (1 - t) + 4;
    for (let r = 0; r < 3; r++) {
      s += `<rect x="${n(x + 2)}" y="${n(y - r * sw * 0.34 - sw * 0.3)}" width="${n(sw * 0.9)}" height="${n(
        sw * 0.32,
      )}" rx="${n(sw * 0.12)}" fill="${mix('#948a6d', palette.groundLow, 0.3 + rng() * 0.45)}" opacity="${o(
        0.6 + rng() * 0.3,
      )}"/>`;
    }
  }

  // A wind-shaped hazel by the wall, and the verge
  s += hazelTree(rng, {
    x: w * 0.78,
    y: h * 0.86,
    height: h * 0.5,
    palette,
    depth: 3,
    leafSize: 26,
    masses: 5,
    spread: 0.85,
  });
  for (let i = 0; i < 90; i++) {
    const x = rng() * w;
    const y = h * (0.78 + rng() * 0.22);
    const c = rng() < 0.45 ? '#f6ecca' : rng() < 0.5 ? '#dcb6cb' : '#ecd77f';
    s += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(1.6 + rng() * 2.6)}" fill="${c}" opacity="${o(0.45 + rng() * 0.5)}"/>`;
  }
  s += undergrowth(rng, { w, y: h * 1.01, palette, count: 90, scale: 1.1 });
  s += motes(rng, { w, h, origin: { x: w * 0.34, y: h * 0.06 }, count: 8 });
  s += vignetteLayer(w, h);
  s += grainLayer(w, h);
  return s;
}

/** A still pool with hazels leaning over it. */
function sceneWater(rng, w, h, palette) {
  let s = defs(palette, { sunX: 0.58, sunY: 0.14 });
  s += `<rect width="${w}" height="${h}" fill="url(#sky)"/>`;
  s += `<rect width="${w}" height="${h}" fill="url(#sunGlow)"/>`;

  const bank = h * 0.58;
  s += `<path d="${ridge(rng, { w, y: bank, amp: h * 0.02, steps: 6 })} L ${w + 20} ${h + 20} L -20 ${h + 20} Z" fill="${
    palette.hills[1]
  }"/>`;

  s += `<ellipse cx="${n(w * 0.5)}" cy="${n(h * 0.84)}" rx="${n(w * 0.48)}" ry="${n(h * 0.19)}" fill="${mix(
    '#33505c',
    palette.groundLow,
    0.42,
  )}"/>`;
  // Break the rim with grass and mud so the pool sits in the ground
  for (let i = 0; i < 40; i++) {
    const a = Math.PI * (1 + rng());
    const rx = w * 0.48 * Math.cos(a) * (0.92 + rng() * 0.12);
    const ry = h * 0.19 * Math.sin(a) * (0.92 + rng() * 0.12);
    s += `<ellipse cx="${n(w * 0.5 + rx)}" cy="${n(h * 0.84 + ry)}" rx="${n(14 + rng() * 40)}" ry="${n(
      4 + rng() * 9,
    )}" fill="${mix(palette.ground, palette.groundLow, rng())}" opacity="${o(0.45 + rng() * 0.45)}"/>`;
  }
  // Reflected sky and ripples
  s += `<ellipse cx="${n(w * 0.55)}" cy="${n(h * 0.8)}" rx="${n(w * 0.22)}" ry="${n(h * 0.07)}" fill="${
    palette.sun
  }" opacity=".22" filter="url(#soften)"/>`;
  for (let i = 0; i < 20; i++) {
    s += `<ellipse cx="${n(w * (0.3 + rng() * 0.42))}" cy="${n(h * (0.72 + rng() * 0.22))}" rx="${n(
      w * (0.08 + rng() * 0.3),
    )}" ry="${n(1.5 + rng() * 3)}" fill="${palette.accent}" opacity="${o(0.1 + rng() * 0.25)}"/>`;
  }

  s += hazelTree(rng, { x: w * 0.12, y: bank + h * 0.05, height: h * 0.78, palette, depth: 3, leafSize: 34, masses: 6 });
  s += hazelTree(rng, { x: w * 0.88, y: bank + h * 0.08, height: h * 0.66, palette, depth: 3, leafSize: 30, masses: 5 });

  for (let i = 0; i < 50; i++) {
    const x = rng() < 0.5 ? rng() * w * 0.32 : w * 0.68 + rng() * w * 0.32;
    const y = h * (0.68 + rng() * 0.2);
    const hh = 30 + rng() * 64;
    s += `<path d="M ${n(x)} ${n(y)} q ${n((rng() - 0.5) * 18)} ${n(-hh * 0.6)} ${n((rng() - 0.5) * 28)} ${n(
      -hh,
    )}" stroke="${mix(palette.canopy[2], palette.groundLow, rng() * 0.6)}" stroke-width="${n(
      1.2 + rng(),
    )}" fill="none" stroke-linecap="round" opacity="${o(0.5 + rng() * 0.5)}"/>`;
  }

  s += motes(rng, { w, h, origin: { x: w * 0.55, y: h * 0.1 }, count: 14 });
  s += vignetteLayer(w, h);
  s += grainLayer(w, h);
  return s;
}

/** Flat bog under a very big sky, turf stacked in the middle distance. */
function sceneBog(rng, w, h, palette) {
  let s = defs(palette, { sunX: 0.22, sunY: 0.24 });
  s += `<rect width="${w}" height="${h}" fill="url(#sky)"/>`;
  s += `<rect width="${w}" height="${h}" fill="url(#sunGlow)"/>`;
  for (let i = 0; i < 10; i++) {
    s += `<ellipse cx="${n(rng() * w)}" cy="${n(h * (0.08 + rng() * 0.42))}" rx="${n(w * (0.1 + rng() * 0.22))}" ry="${n(
      h * (0.015 + rng() * 0.038),
    )}" fill="${mix('#ffffff', palette.skyLow, 0.45)}" opacity="${o(0.22 + rng() * 0.35)}" filter="url(#soften)"/>`;
  }

  const horizon = h * 0.74;
  s += `<path d="${ridge(rng, { w, y: horizon, amp: h * 0.01, steps: 9 })} L ${w + 20} ${h + 20} L -20 ${h + 20} Z" fill="url(#floor)"/>`;

  for (let i = 0; i < 8; i++) {
    const x = rng() * w;
    const y = horizon + h * (0.02 + rng() * 0.14);
    const bw = 26 + rng() * 42;
    s += `<path d="M ${n(x)} ${n(y)} l ${n(bw)} 0 l ${n(-bw * 0.14)} ${n(-14 - rng() * 24)} l ${n(
      -bw * 0.72,
    )} 0 Z" fill="${mix('#41301e', palette.groundLow, 0.35)}" opacity="${o(0.7 + rng() * 0.3)}"/>`;
  }
  for (let i = 0; i < 7; i++) {
    s += `<ellipse cx="${n(rng() * w)}" cy="${n(horizon + h * (0.05 + rng() * 0.2))}" rx="${n(24 + rng() * 90)}" ry="${n(
      4 + rng() * 9,
    )}" fill="${palette.accent}" opacity="${o(0.18 + rng() * 0.3)}"/>`;
  }

  s += hazelTree(rng, {
    x: w * 0.84,
    y: horizon + h * 0.1,
    height: h * 0.46,
    palette,
    depth: 3,
    leafSize: 22,
    masses: 4,
  });
  s += undergrowth(rng, { w, y: h * 0.99, palette, count: 90, scale: 0.9 });
  s += vignetteLayer(w, h);
  s += grainLayer(w, h);
  return s;
}

/** Bare branches, low light, the year turned. */
function sceneWinter(rng, w, h, palette) {
  let s = defs(palette, { sunX: 0.4, sunY: 0.3 });
  s += `<rect width="${w}" height="${h}" fill="url(#sky)"/>`;
  s += `<circle cx="${n(w * 0.4)}" cy="${n(h * 0.3)}" r="${n(h * 0.05)}" fill="${palette.sun}" filter="url(#soften)"/>`;
  s += `<rect width="${w}" height="${h}" fill="url(#sunGlow)"/>`;

  const horizon = h * 0.7;
  palette.hills.forEach((c, i) => {
    s += `<path d="${ridge(rng, { w, y: horizon - i * h * 0.045, amp: h * 0.025, steps: 5 })} L ${w + 20} ${h + 20} L -20 ${
      h + 20
    } Z" fill="${c}" opacity="${o(0.65 + i * 0.12)}"/>`;
  });

  s += hazelTree(rng, {
    x: w * 0.46,
    y: h * 1.0,
    height: h * 0.95,
    palette,
    depth: 5,
    leafSize: 6,
    bare: true,
    spread: 1.1,
  });

  // A few leaves still hanging on
  for (let i = 0; i < 26; i++) {
    s += `<circle cx="${n(w * (0.2 + rng() * 0.6))}" cy="${n(h * (0.1 + rng() * 0.6))}" r="${n(
      1.5 + rng() * 3,
    )}" fill="${palette.canopy[4]}" opacity="${o(0.3 + rng() * 0.4)}"/>`;
  }
  s += undergrowth(rng, { w, y: h * 0.99, palette, count: 60, scale: 0.75 });
  s += vignetteLayer(w, h);
  s += grainLayer(w, h);
  return s;
}

/** A desk by a window: notebook, cup, and a jar of cuttings. */
function sceneDesk(rng, w, h, palette) {
  let s = defs(palette, { sunX: 0.26, sunY: 0.22 });
  s += `<rect width="${w}" height="${h}" fill="${mix(palette.skyTop, '#191309', 0.45)}"/>`;

  const wx = w * 0.08;
  const wy = h * 0.08;
  const ww = w * 0.42;
  const wh = h * 0.46;
  s += `<rect x="${n(wx)}" y="${n(wy)}" width="${n(ww)}" height="${n(wh)}" rx="4" fill="${mix(
    '#9fae7a',
    palette.skyLow,
    0.35,
  )}"/>`;
  // What is outside: soft hills, and the sun
  s += `<rect x="${n(wx)}" y="${n(wy + wh * 0.62)}" width="${n(ww)}" height="${n(wh * 0.38)}" fill="${mix(
    '#5e6f42',
    palette.hills[0],
    0.4,
  )}"/>`;
  s += `<circle cx="${n(wx + ww * 0.66)}" cy="${n(wy + wh * 0.42)}" r="${n(wh * 0.14)}" fill="${
    palette.sun
  }" filter="url(#softenSm)" opacity=".85"/>`;
  s += `<rect x="${n(wx + ww / 2 - 3)}" y="${n(wy)}" width="6" height="${n(wh)}" fill="${palette.bark}"/>`;
  s += `<rect x="${n(wx)}" y="${n(wy + wh / 2 - 3)}" width="${n(ww)}" height="6" fill="${palette.bark}"/>`;
  s += `<rect x="${n(wx - 9)}" y="${n(wy - 9)}" width="${n(ww + 18)}" height="${n(wh + 18)}" rx="6" fill="none" stroke="${
    palette.bark
  }" stroke-width="11"/>`;

  // Light falling into the room
  s += `<path d="M ${n(wx)} ${n(wy + wh)} L ${n(wx + ww)} ${n(wy + wh)} L ${n(w * 0.95)} ${n(h)} L ${n(w * 0.02)} ${n(
    h,
  )} Z" fill="${palette.sun}" opacity=".12"/>`;

  const tableY = h * 0.66;
  s += `<rect x="0" y="${n(tableY)}" width="${w}" height="${n(h - tableY)}" fill="${mix(
    '#6b4a2a',
    palette.bark,
    0.4,
  )}"/>`;
  s += `<rect x="0" y="${n(tableY)}" width="${w}" height="7" fill="${palette.barkLit}" opacity=".55"/>`;
  for (let i = 0; i < 14; i++) {
    const y = tableY + 10 + rng() * (h - tableY);
    s += `<path d="M ${n(rng() * w * 0.4)} ${n(y)} h ${n(w * (0.15 + rng() * 0.45))}" stroke="${
      palette.barkLit
    }" stroke-width="1" opacity="${o(0.08 + rng() * 0.14)}"/>`;
  }

  // Open notebook, catching the window light
  s += `<g transform="rotate(-4 ${n(w * 0.42)} ${n(tableY + h * 0.1)})">
    <rect x="${n(w * 0.18)}" y="${n(tableY + h * 0.05)}" width="${n(w * 0.48)}" height="${n(
      h * 0.21,
    )}" rx="3" fill="#f2e9d2"/>
    <rect x="${n(w * 0.18)}" y="${n(tableY + h * 0.05)}" width="${n(w * 0.24)}" height="${n(
      h * 0.21,
    )}" rx="3" fill="#e3d7b8"/>
    <line x1="${n(w * 0.42)}" y1="${n(tableY + h * 0.05)}" x2="${n(w * 0.42)}" y2="${n(
      tableY + h * 0.26,
    )}" stroke="${palette.bark}" stroke-width="1.4" opacity=".45"/>`;
  for (let i = 0; i < 8; i++) {
    const ly = tableY + h * 0.08 + i * h * 0.021;
    s += `<line x1="${n(w * 0.45)}" y1="${n(ly)}" x2="${n(w * 0.45 + w * (0.08 + rng() * 0.12))}" y2="${n(
      ly,
    )}" stroke="${palette.bark}" stroke-width="1.5" opacity="${o(0.3 + rng() * 0.3)}" stroke-linecap="round"/>`;
  }
  s += `</g>`;

  // Pen
  s += `<path d="M ${n(w * 0.3)} ${n(h * 0.93)} l ${n(w * 0.16)} ${n(-h * 0.03)}" stroke="${mix(
    '#3a2a1a',
    palette.bark,
    0.2,
  )}" stroke-width="5" stroke-linecap="round"/>`;

  // Cup of tea
  const cupX = w * 0.78;
  const cupY = tableY + h * 0.13;
  s += `<path d="M ${n(cupX - 27)} ${n(cupY - 27)} h 54 v 31 a 27 27 0 0 1 -54 0 Z" fill="#ddd0b4"/>`;
  s += `<path d="M ${n(cupX + 27)} ${n(cupY - 18)} a 15 15 0 0 1 0 28" fill="none" stroke="#ddd0b4" stroke-width="6"/>`;
  s += `<ellipse cx="${n(cupX)}" cy="${n(cupY - 27)}" rx="27" ry="7" fill="${mix('#4a3018', palette.bark, 0.25)}"/>`;
  for (let i = 0; i < 3; i++) {
    s += `<path d="M ${n(cupX - 10 + i * 10)} ${n(cupY - 36)} q 7 -15 0 -28" stroke="${
      palette.accent
    }" stroke-width="2" fill="none" opacity=".22"/>`;
  }

  // Jar of cuttings on the sill
  const jarX = wx + ww * 0.82;
  const jarY = wy + wh;
  const cut = [];
  limb(rng, {
    x: jarX,
    y: jarY - 42,
    angle: -Math.PI / 2,
    len: h * 0.075,
    width: 3,
    depth: 3,
    palette,
    leafSize: 13,
    out: cut,
  });
  s += cut.join('');
  s += `<path d="M ${n(jarX - 15)} ${n(jarY - 42)} h 30 v 34 a 6 6 0 0 1 -6 6 h -18 a 6 6 0 0 1 -6 -6 Z" fill="${
    palette.accent
  }" opacity=".38"/>`;

  s += motes(rng, { w, h, origin: { x: wx + ww * 0.5, y: wy + wh * 0.5 }, count: 10 });
  s += vignetteLayer(w, h);
  s += grainLayer(w, h);
  return s;
}

/* --------------------------------------------------------------- ornaments */

/** A botanical branch with alternating leaves — the section divider. */
function branchOrnament({ w = 900, h = 120, seed = 'branch', color = '#b9a367', mirrored = true } = {}) {
  const rng = mulberry32(seedFrom(seed));
  const midY = h * 0.62;
  let s = `<g fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round">`;

  for (const dir of mirrored ? [1, -1] : [1]) {
    const x0 = w / 2;
    const x1 = x0 + dir * w * 0.46;
    s += `<path d="M ${n(x0)} ${n(midY)} C ${n(x0 + dir * w * 0.16)} ${n(midY - h * 0.15)} ${n(
      x0 + dir * w * 0.32,
    )} ${n(midY - h * 0.2)} ${n(x1)} ${n(midY - h * 0.12)}"/>`;

    const leaves = 7;
    for (let i = 1; i <= leaves; i++) {
      const t = i / (leaves + 1);
      const bx = x0 + dir * w * 0.46 * t;
      const by = midY - h * 0.2 * Math.sin(t * Math.PI * 0.9) - h * 0.02;
      const up = i % 2 === 0 ? -1 : 1;
      const len = h * (0.28 + rng() * 0.14) * (1 - t * 0.4);
      const tipX = bx + dir * len * 0.6;
      const tipY = by + up * len;
      const c1x = bx + dir * len * 0.04;
      const c1y = by + up * len * 0.74;
      const c2x = bx + dir * len * 0.74;
      const c2y = by + up * len * 0.16;
      s += `<path d="M ${n(bx)} ${n(by)} C ${n(c1x)} ${n(c1y)} ${n(c2x)} ${n(c2y)} ${n(tipX)} ${n(tipY)} C ${n(
        c2x - dir * len * 0.34,
      )} ${n(c2y + up * len * 0.44)} ${n(c1x + dir * len * 0.36)} ${n(c1y - up * len * 0.52)} ${n(bx)} ${n(
        by,
      )} Z" stroke-width="1.5"/>`;
      s += `<path d="M ${n(bx)} ${n(by)} Q ${n((bx + tipX) / 2)} ${n((by + tipY) / 2 + up * 2)} ${n(tipX)} ${n(
        tipY,
      )}" stroke-width=".9"/>`;
    }

    // A cluster of hazelnuts in their husks near the tip
    const nx = x0 + dir * w * 0.43;
    const ny = midY - h * 0.12;
    for (let i = 0; i < 3; i++) {
      s += `<circle cx="${n(nx + dir * i * 10)}" cy="${n(ny + (i % 2 ? 8 : 0))}" r="${n(6 - i * 0.7)}" stroke-width="1.3"/>`;
    }
  }
  s += `<circle cx="${n(w / 2)}" cy="${n(midY)}" r="3.2" fill="${color}" stroke="none"/></g>`;
  return frame(w, h, s);
}

/** A small three-leaf sprig, for section headings. */
function sprigOrnament({ w = 120, h = 40, color = '#b9a367' } = {}) {
  const cx = w / 2;
  const cy = h / 2;
  const s = `<g fill="none" stroke="${color}" stroke-width="1.4" stroke-linecap="round">
    <path d="M 8 ${cy} H ${w - 8}"/>
    <path d="M ${cx} ${cy} C ${cx - 15} ${cy - 3} ${cx - 19} ${cy - 13} ${cx - 6} ${cy - 16} C ${cx + 3} ${
      cy - 13
    } ${cx + 3} ${cy - 3} ${cx} ${cy} Z"/>
    <path d="M ${cx} ${cy} C ${cx + 15} ${cy + 3} ${cx + 19} ${cy + 13} ${cx + 6} ${cy + 16} C ${cx - 3} ${
      cy + 13
    } ${cx - 3} ${cy + 3} ${cx} ${cy} Z"/>
    <circle cx="${cx}" cy="${cy}" r="2" fill="${color}" stroke="none"/>
  </g>`;
  return frame(w, h, s);
}

/** Torn-paper edge, used where one cream section meets the next. */
function tornEdge({ w = 1440, h = 40, seed = 'torn', color = '#f4f1e8' } = {}) {
  const rng = mulberry32(seedFrom(seed));
  let d = `M 0 ${h} L 0 ${n(h * 0.5)}`;
  const steps = 70;
  for (let i = 1; i <= steps; i++) {
    d += ` L ${n((i / steps) * w)} ${n(h * (0.26 + rng() * 0.48))}`;
  }
  d += ` L ${w} ${h} Z`;
  return frame(w, h, `<path d="${d}" fill="${color}"/>`);
}

/* ------------------------------------------------------------------ output */

const scenes = {
  hill: (rng, w, h, p) => sceneHill(rng, w, h, p),
  hero: (rng, w, h, p) => sceneHill(rng, w, h, p, { hero: true }),
  wood: sceneWood,
  coast: sceneCoast,
  water: sceneWater,
  bog: sceneBog,
  winter: sceneWinter,
  desk: sceneDesk,
};

/** name → [scene, palette, width, height] */
const artwork = {
  'hero-hazel': ['hero', 'goldenHill', 1600, 1000],
  'wood-path': ['wood', 'wood', 800, 800],
  'coast-road': ['coast', 'coast', 800, 800],
  'desk-window': ['desk', 'hearth', 800, 800],
  'well-pool': ['water', 'water', 800, 800],
  bogland: ['bog', 'bog', 800, 800],
  'winter-hazel': ['winter', 'winter', 800, 800],
  'hill-meadow': ['hill', 'goldenHill', 800, 800],
  'river-light': ['water', 'wood', 800, 800],
  lamplight: ['desk', 'hearth', 800, 800],
  'banner-poems': ['wood', 'wood', 1600, 560],
  'banner-stories': ['coast', 'coast', 1600, 560],
  'banner-journal': ['desk', 'hearth', 1600, 560, { square: true, cropY: 0.2 }],
  'banner-about': ['hill', 'goldenHill', 1600, 560],
};

mkdirSync(OUT, { recursive: true });

const written = [];
for (const [name, [scene, palette, w, h, opts]] of Object.entries(artwork)) {
  const rng = mulberry32(seedFrom(name));
  // `square` scenes are composed for a 1:1 frame; for wide uses we draw the
  // square and crop to a band with the viewBox rather than stretching it.
  const drawW = opts?.square ? w : w;
  const drawH = opts?.square ? w : h;
  const body = scenes[scene](rng, drawW, drawH, palettes[palette]);
  const viewBox = opts?.square ? `0 ${n(drawH * opts.cropY)} ${drawW} ${n((h / w) * drawW)}` : undefined;
  writeFileSync(resolve(OUT, `${name}.svg`), frame(w, h, body, viewBox));
  written.push(name);
}

writeFileSync(resolve(OUT, 'ornament-branch.svg'), branchOrnament({}));
writeFileSync(resolve(OUT, 'ornament-branch-light.svg'), branchOrnament({ color: '#d9c893' }));
writeFileSync(resolve(OUT, 'ornament-sprig.svg'), sprigOrnament({}));
writeFileSync(resolve(OUT, 'ornament-sprig-light.svg'), sprigOrnament({ color: '#e8dcb8' }));
writeFileSync(resolve(OUT, 'torn-edge.svg'), tornEdge({}));
written.push('ornament-branch', 'ornament-branch-light', 'ornament-sprig', 'ornament-sprig-light', 'torn-edge');

const heavy = written
  .map((name) => [name, statSync(resolve(OUT, `${name}.svg`)).size])
  .filter(([, size]) => size > 220_000);

console.log(`Wrote ${written.length} illustrations to public/img/`);
for (const [name, size] of heavy) {
  console.warn(`  heads up: ${name}.svg is ${Math.round(size / 1024)} KB`);
}
