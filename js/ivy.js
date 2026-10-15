/* Ivy that creeps across the stone wall as you scroll.
   Vines are generated once per screen size; scroll position decides how
   far each one has grown and which leaves have unfurled. */
(function () {
  'use strict';

  const svg = document.getElementById('ivy');
  if (!svg || !window.HavenStone) return;

  const NS = 'http://www.w3.org/2000/svg';
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const GREENS = ['#3e6e2c', '#4f8034', '#5f933d', '#47752f', '#6fa548', '#356126'];
  const PETALS = ['#fbf5ea', '#f4bdb8', '#ea9aae', '#c9b0ea', '#f8d66a', '#fbf5ea'];

  let vines = [];
  let lastW = 0;

  // Felt is the default look; ?tower=sandstone or ?tower=grey keep the painted ivy.
  const asked = new URLSearchParams(location.search).get('tower');
  const FELT = !!window.HavenFelt && asked !== 'sandstone' && asked !== 'grey';

  // Felt leaves and flowers are drawn once into images, one per colour, and
  // reused for every leaf, so growing ivy costs no more than before.
  function feltSymbols() {
    const F = window.HavenFelt, R = F.mulberry32;
    const K = 5;  // pixels per unit in the images
    const img = (box, draw) => {
      const [x0, y0, w, h] = box;
      const c = document.createElement('canvas');
      c.width = Math.ceil(w * K); c.height = Math.ceil(h * K);
      const x = c.getContext('2d');
      x.setTransform(K, 0, 0, K, -x0 * K, -y0 * K);
      draw(x);
      return `<image href="${c.toDataURL('image/png')}" x="${x0}" y="${y0}" width="${w}" height="${h}"/>`;
    };
    const leafPts = F.samplePath(leafD(), 0.6);
    let out = '';
    GREENS.forEach((g, i) => {
      out += `<symbol id="ivy-leaf-${i}" overflow="visible">` + img([-14, -28, 28, 32], (x) => {
        F.thread(x, [[0, 1], [0, -6]], '#4a5a24', { width: 1.6, dash: [], rnd: R(i), shadow: 0.3 });
        F.piece(x, leafPts, g, { rnd: R(10 + i), scale: 0.32, shadowAlpha: 0.35 });
        for (const seg of [[[0, -6], [0, -21]], [[0, -10], [-5.5, -15]], [[0, -10], [5.5, -15]]]) {
          F.thread(x, seg, '#e3f0c0', { width: 0.75, dash: [], rnd: R(20 + i), shadow: 0.25 });
        }
      }) + '</symbol>';
    });
    PETALS.forEach((col, i) => {
      out += `<symbol id="ivy-flower-${i}" overflow="visible">` + img([-12, -12, 24, 24], (x) => {
        const r = R(30 + i);
        for (let j = 0; j < 5; j++) {
          const a = (j / 5) * Math.PI * 2 - Math.PI / 2;
          F.piece(x, F.ellipsePts(Math.cos(a) * 4.6, Math.sin(a) * 4.6, 3.5, 4.7, 20, a + Math.PI / 2), col,
            { rnd: r, scale: 0.28, shadowAlpha: 0.3, puff: 0.6 });
        }
        F.piece(x, F.ellipsePts(0, 0, 2.5, 2.5, 16), '#f0b43c', { rnd: r, scale: 0.22, shadowAlpha: 0.3 });
        x.fillStyle = '#9a5d14';
        for (let j = 0; j < 6; j++) { x.beginPath(); x.arc(Math.cos(j * 1.05) * 1.1, Math.sin(j * 1.05) * 1.1, 0.42, 0, Math.PI * 2); x.fill(); }
      }) + '</symbol>';
    });
    return out;
  }
  let FELT_DEFS = null;

  const LEAF = `
    <symbol id="ivy-leaf" overflow="visible">
      <path d="M0 0 L0 -5" stroke="#4a3d22" stroke-width="1.1" stroke-linecap="round"/>
      <path transform="translate(1.2 1.8)" fill="rgba(10,8,4,.35)" d="${leafD()}"/>
      <path fill="currentColor" d="${leafD()}"/>
      <path fill="none" stroke="rgba(235,242,205,.38)" stroke-width=".6" stroke-linecap="round"
        d="M0 -5 L0 -21 M0 -8 L-6 -15 M0 -8 L6 -15 M0 -6 L-7.5 -8 M0 -6 L7.5 -8"/>
    </symbol>`;

  const FLOWER = `
    <symbol id="ivy-flower" overflow="visible">
      <g fill="rgba(10,8,4,.3)" transform="translate(1 1.6)">${petals(0)}</g>
      <g fill="currentColor" stroke="rgba(90,40,30,.18)" stroke-width=".5">${petals(0)}</g>
      <g fill="rgba(255,255,255,.45)">${petals(1)}</g>
      <circle r="2.3" fill="#e2ad3f"/>
      <circle r="1.1" cx="-.5" cy="-.5" fill="#f6dc8a"/>
      <g fill="#8a5a1c"><circle cx="1.2" cy=".9" r=".35"/><circle cx="-1.1" cy="1.1" r=".35"/><circle cx=".9" cy="-1.3" r=".35"/></g>
    </symbol>`;

  function petals(inner) {
    let out = '';
    for (let i = 0; i < 5; i++) {
      const a = i * 72;
      out += inner
        ? `<ellipse cx="0" cy="-3.6" rx="1.3" ry="2" transform="rotate(${a})"/>`
        : `<ellipse cx="0" cy="-4.4" rx="3.5" ry="4.6" transform="rotate(${a})"/>`;
    }
    return out;
  }

  function leafD() {
    return 'M0 -5 C-3 -3.5 -8 -3.6 -9.6 -6.8 C-10.6 -9 -8.6 -11 -6.4 -10.8 ' +
      'C-9.6 -12.8 -10.4 -17.4 -6.4 -17.6 C-4 -17.8 -2 -20.4 0 -24 ' +
      'C2 -20.4 4 -17.8 6.4 -17.6 C10.4 -17.4 9.6 -12.8 6.4 -10.8 ' +
      'C8.6 -11 10.6 -9 9.6 -6.8 C8 -3.6 3 -3.5 0 -5Z';
  }

  function smoothPath(pts) {
    let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    return d;
  }

  function el(name, attrs, parent) {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function grow(spec, depth, ctx) {
    const { rnd, band, vw, vh, gVines, gLeaves, gFlowers, leafScale, blooms } = ctx;
    const step = 12;
    const n = Math.max(4, Math.round(spec.len / step));
    let x = spec.x, y = spec.y;
    let vx = spec.dx, vy = spec.dy;
    const pm = Math.hypot(vx, vy); vx /= pm; vy /= pm;
    const px = vx, py = vy;
    const homeX = spec.side === 'left' ? band * 0.45 : vw - band * 0.45;
    const pull = depth ? 0.006 : 0.028;
    const pts = [[x, y]];
    const branches = [];

    for (let i = 0; i < n; i++) {
      const a = (rnd() - 0.5) * 0.7;
      const ca = Math.cos(a), sa = Math.sin(a);
      [vx, vy] = [vx * ca - vy * sa, vx * sa + vy * ca];
      vx += clamp((homeX - x) / band, -1.2, 1.2) * pull + px * 0.05;
      vy += py * 0.1;
      const m = Math.hypot(vx, vy); vx /= m; vy /= m;
      x += vx * step; y += vy * step;
      pts.push([x, y]);
      if (depth < 1 && i > 3 && i < n - 3 && rnd() < 0.08) branches.push(i);
      if (y < -60 || y > vh + 60) break;
    }

    const d = smoothPath(pts);
    const path = el('path', { d, class: depth ? 'vine vine--twig' : 'vine' }, gVines);
    const L = path.getTotalLength();
    path.style.strokeDasharray = `${L} ${L}`;
    path.style.strokeDashoffset = L;
    // felt: a lighter strand twisted along the vine, like a felted cord
    let hi = null;
    if (FELT) {
      hi = el('path', { d, class: 'vine-hi', transform: 'translate(-.7 -.9)' }, gVines);
      hi.style.strokeDasharray = `${L} ${L}`;
      hi.style.strokeDashoffset = L;
    }

    const vine = { path, hi, L, s0: spec.s0, s1: spec.s1, leaves: [], flowers: [], f: -1 };

    // leaves along the vine, alternating sides
    let acc = 0, next = 6 + rnd() * 10, side = rnd() < 0.5 ? 1 : -1;
    let untilFlower = 3 + Math.floor(rnd() * 3);
    for (let i = 1; i < pts.length - 1; i++) {
      acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (acc < next) continue;
      next = acc + 16 + rnd() * 16;
      const tx = pts[i + 1][0] - pts[i - 1][0], ty = pts[i + 1][1] - pts[i - 1][1];
      const phi = Math.atan2(ty, tx) + side * (0.8 + rnd() * 0.7);
      side = -side;
      const sc = (0.55 + rnd() * 0.55) * leafScale * (depth ? 0.85 : 1);
      const g = el('g', {
        class: 'leaf',
        transform: `translate(${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)}) rotate(${((phi * 180) / Math.PI + 90).toFixed(1)}) scale(${sc.toFixed(2)})`
      }, gLeaves);
      const inner = el('g', { class: 'leaf__in' }, g);
      const gi = Math.floor(rnd() * GREENS.length);
      el('use', FELT ? { href: `#ivy-leaf-${gi}` } : { href: '#ivy-leaf', color: GREENS[gi] }, inner);
      vine.leaves.push({ g, at: acc, on: false });

      // every few leaves, a little blossom tucked against the vine
      if (--untilFlower <= 0) {
        untilFlower = 3 + Math.floor(rnd() * 4);
        const nx = -ty, ny = tx, nm = Math.hypot(nx, ny) || 1;
        const off = -side * (3 + rnd() * 5);
        const fx = pts[i][0] + (nx / nm) * off;
        const fy = pts[i][1] + (ny / nm) * off;
        const fs = (0.9 + rnd() * 0.6) * leafScale;
        const r = 9.5 * fs; // the flower's radius on screen
        // never stack: skip this spot if it would touch a flower already placed
        const crowded = blooms.some((b) => Math.hypot(b.x - fx, b.y - fy) < (b.r + r) * 1.15);
        if (!crowded) {
          blooms.push({ x: fx, y: fy, r });
          const fg = el('g', {
            class: 'flower',
            transform: `translate(${fx.toFixed(1)} ${fy.toFixed(1)}) rotate(${(rnd() * 72).toFixed(0)}) scale(${fs.toFixed(2)})`
          }, gFlowers);
          const fin = el('g', { class: 'flower__in' }, fg);
          const pi = Math.floor(rnd() * PETALS.length);
          el('use', FELT ? { href: `#ivy-flower-${pi}` } : { href: '#ivy-flower', color: PETALS[pi] }, fin);
          // bloom a beat after the leaves around it
          vine.flowers.push({ g: fg, at: acc + 30, on: false });
        }
      }
    }
    const total = acc || 1;
    vine.leaves.forEach((l) => { l.at = l.at / total; });
    vine.flowers.forEach((l) => { l.at = Math.min(1, l.at / total); });
    vines.push(vine);

    for (const bi of branches) {
      const sign = rnd() < 0.5 ? 1 : -1;
      const ang = Math.atan2(py, px) + sign * (0.9 + rnd() * 0.6);
      const span = spec.s1 - spec.s0;
      const s0 = spec.s0 + (bi / n) * span;
      const len = spec.len * (0.3 + rnd() * 0.35);
      grow({
        x: pts[bi][0], y: pts[bi][1], dx: Math.cos(ang), dy: Math.sin(ang), side: spec.side, len,
        s0, s1: Math.min(1, s0 + (len / spec.len) * span * 1.4)
      }, depth + 1, ctx);
    }
  }

  function build() {
    const vw = window.innerWidth;
    const vh = svg.clientHeight || window.innerHeight;
    lastW = vw;
    vines = [];
    svg.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
    if (FELT && !FELT_DEFS) FELT_DEFS = feltSymbols();
    svg.classList.toggle('is-felt', FELT);
    svg.innerHTML = `<defs>${FELT ? FELT_DEFS : LEAF + FLOWER}</defs>`;
    const gVines = el('g', { class: 'vines' }, svg);
    const gLeaves = el('g', { class: 'leaves' }, svg);
    const gFlowers = el('g', { class: 'flowers' }, svg);

    const rnd = window.HavenStone.mulberry32(20240607);
    const band = clamp(vw * 0.25, 90, 400);
    const leafScale = vw < 700 ? 0.95 : 1.3;
    const ctx = { rnd, band, vw, vh, gVines, gLeaves, gFlowers, leafScale, blooms: [] };

    const specs = [
      { x: band * 0.2, y: vh + 10, dx: 0.2, dy: -1, side: 'left', len: vh * 1.05, s0: 0.0, s1: 0.7 },
      { x: band * 0.75, y: vh + 10, dx: -0.15, dy: -1, side: 'left', len: vh * 0.75, s0: 0.18, s1: 0.85 },
      { x: vw - band * 0.25, y: vh + 10, dx: -0.2, dy: -1, side: 'right', len: vh * 1.0, s0: 0.05, s1: 0.75 },
      { x: vw - band * 0.8, y: vh + 10, dx: 0.1, dy: -1, side: 'right', len: vh * 0.6, s0: 0.3, s1: 0.9 },
      { x: band * 0.55, y: -10, dx: 0.25, dy: 1, side: 'left', len: vh * 0.45, s0: 0.4, s1: 1 },
      { x: vw - band * 0.45, y: -10, dx: -0.25, dy: 1, side: 'right', len: vh * 0.55, s0: 0.3, s1: 0.95 }
    ];
    specs.push({ x: -10, y: vh * 0.55, dx: 1, dy: -0.3, side: 'left', len: band * 1.6, s0: 0.35, s1: 0.95 });
    specs.push({ x: vw + 10, y: vh * 0.35, dx: -1, dy: 0.2, side: 'right', len: band * 1.6, s0: 0.4, s1: 1 });
    specs.push({ x: -10, y: vh * 0.25, dx: 1, dy: 0.25, side: 'left', len: band * 1.3, s0: 0.6, s1: 1 });
    specs.push({ x: vw + 10, y: vh * 0.75, dx: -1, dy: -0.25, side: 'right', len: band * 1.3, s0: 0.2, s1: 0.8 });
    specs.forEach((s) => grow(s, 0, ctx));
    update(true);
  }

  function growth() {
    const scene = window.HavenScene;
    const zoomEnd = scene ? scene.zoomEnd() : window.innerHeight;
    const start = zoomEnd * 0.95;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    return clamp((window.scrollY - start) / Math.max(1, max - start), 0, 1);
  }

  let lastG = -1;
  function update(force) {
    const g = growth();
    if (!force && Math.abs(g - lastG) < 0.0005) return;
    lastG = g;
    svg.classList.toggle('is-growing', g > 0);
    for (const v of vines) {
      const f = clamp((g - v.s0) / (v.s1 - v.s0), 0, 1);
      if (f === v.f) continue;
      v.f = f;
      v.path.style.strokeDashoffset = v.L * (1 - f);
      if (v.hi) v.hi.style.strokeDashoffset = v.L * (1 - f);
      for (const list of [v.leaves, v.flowers]) {
        for (const l of list) {
          const on = f >= l.at;
          if (on !== l.on) { l.on = on; l.g.classList.toggle('on', on); }
        }
      }
    }
  }

  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; update(false); });
  }, { passive: true });

  let t = 0;
  window.addEventListener('resize', () => {
    clearTimeout(t);
    t = setTimeout(() => { if (window.innerWidth !== lastW) build(); else update(true); }, 150);
  });

  build();
})();
