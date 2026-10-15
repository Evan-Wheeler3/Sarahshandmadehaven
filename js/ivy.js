/* Ivy that creeps across the wall as you scroll.

   Drawn on one canvas: vines are generated once per screen size, leaves
   and flowers are pre-drawn images (one per colour) stamped along them,
   and the canvas is only redrawn while the ivy is actually growing or a
   leaf is unfurling. In the felt look the vines are strips of green felt
   sewn on with a running stitch. */
(function () {
  'use strict';

  const canvas = document.getElementById('ivy');
  if (!canvas || !canvas.getContext || !window.HavenStone) return;
  const ctx = canvas.getContext('2d');

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const GREENS = ['#3e6e2c', '#4f8034', '#5f933d', '#47752f', '#6fa548', '#356126'];
  const PETALS = ['#fbf5ea', '#f4bdb8', '#ea9aae', '#c9b0ea', '#f8d66a', '#fbf5ea'];
  const LEAF_D = 'M0 -5 C-3 -3.5 -8 -3.6 -9.6 -6.8 C-10.6 -9 -8.6 -11 -6.4 -10.8 ' +
    'C-9.6 -12.8 -10.4 -17.4 -6.4 -17.6 C-4 -17.8 -2 -20.4 0 -24 ' +
    'C2 -20.4 4 -17.8 6.4 -17.6 C10.4 -17.4 9.6 -12.8 6.4 -10.8 ' +
    'C8.6 -11 10.6 -9 9.6 -6.8 C8 -3.6 3 -3.5 0 -5Z';
  const LEAF_BOX = [-14, -28, 28, 32];
  const FLOWER_BOX = [-12, -12, 24, 24];
  const POP_MS = 480;

  // Felt is the default look; ?tower=sandstone or ?tower=grey keep the painted ivy.
  const asked = new URLSearchParams(location.search).get('tower');
  const FELT = !!window.HavenFelt && asked !== 'sandstone' && asked !== 'grey';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let vines = [], sprites = null, dpr = 1, vw = 0, vh = 0, lastW = 0;

  /* ---------- leaf and flower images ---------- */

  function makeSprites(K) {
    const img = (box, draw) => {
      const [x0, y0, w, h] = box;
      const c = document.createElement('canvas');
      c.width = Math.ceil(w * K); c.height = Math.ceil(h * K);
      const x = c.getContext('2d');
      x.setTransform(K, 0, 0, K, -x0 * K, -y0 * K);
      draw(x);
      return c;
    };
    const out = { leaves: [], flowers: [] };
    if (FELT) {
      const F = window.HavenFelt, R = F.mulberry32;
      const leafPts = F.samplePath(LEAF_D, 0.6);
      GREENS.forEach((g, i) => out.leaves.push(img(LEAF_BOX, (x) => {
        F.thread(x, [[0, 1], [0, -6]], '#4a5a24', { width: 1.6, dash: [], rnd: R(i), shadow: 0.3 });
        F.piece(x, leafPts, g, { rnd: R(10 + i), scale: 0.32, shadowAlpha: 0.35 });
        F.thread(x, F.inset(leafPts, 2.4), '#d3e3a6', { width: 0.6, dash: [1.6, 1.4], closed: true, rnd: R(40 + i), shadow: 0.2 });
        for (const seg of [[[0, -6], [0, -21]], [[0, -10], [-5.5, -15]], [[0, -10], [5.5, -15]]]) {
          F.thread(x, seg, '#e3f0c0', { width: 0.75, dash: [], rnd: R(20 + i), shadow: 0.25 });
        }
      })));
      PETALS.forEach((col, i) => out.flowers.push(img(FLOWER_BOX, (x) => {
        const r = R(30 + i);
        for (let j = 0; j < 5; j++) {
          const a = (j / 5) * Math.PI * 2 - Math.PI / 2;
          F.piece(x, F.ellipsePts(Math.cos(a) * 4.6, Math.sin(a) * 4.6, 3.5, 4.7, 20, a + Math.PI / 2), col,
            { rnd: r, scale: 0.28, shadowAlpha: 0.3, puff: 0.6 });
        }
        F.piece(x, F.ellipsePts(0, 0, 2.5, 2.5, 16), '#f0b43c', { rnd: r, scale: 0.22, shadowAlpha: 0.3 });
        x.fillStyle = '#9a5d14';
        for (let j = 0; j < 6; j++) { x.beginPath(); x.arc(Math.cos(j * 1.05) * 1.1, Math.sin(j * 1.05) * 1.1, 0.42, 0, Math.PI * 2); x.fill(); }
      })));
    } else {
      const leaf = new Path2D(LEAF_D);
      GREENS.forEach((g) => out.leaves.push(img(LEAF_BOX, (x) => {
        x.strokeStyle = '#4a3d22'; x.lineWidth = 1.1; x.lineCap = 'round';
        x.beginPath(); x.moveTo(0, 0); x.lineTo(0, -5); x.stroke();
        x.save(); x.translate(1.2, 1.8); x.fillStyle = 'rgba(10,8,4,.35)'; x.fill(leaf); x.restore();
        x.fillStyle = g; x.fill(leaf);
        x.strokeStyle = 'rgba(235,242,205,.38)'; x.lineWidth = 0.6;
        x.stroke(new Path2D('M0 -5 L0 -21 M0 -8 L-6 -15 M0 -8 L6 -15 M0 -6 L-7.5 -8 M0 -6 L7.5 -8'));
      })));
      PETALS.forEach((col) => out.flowers.push(img(FLOWER_BOX, (x) => {
        for (const [fill, dx, dy] of [['rgba(10,8,4,.3)', 1, 1.6], [col, 0, 0]]) {
          x.fillStyle = fill;
          for (let j = 0; j < 5; j++) {
            x.save(); x.translate(dx, dy); x.rotate((j * 72 * Math.PI) / 180);
            x.beginPath(); x.ellipse(0, -4.4, 3.5, 4.6, 0, 0, Math.PI * 2); x.fill(); x.restore();
          }
        }
        x.fillStyle = '#e2ad3f'; x.beginPath(); x.arc(0, 0, 2.3, 0, Math.PI * 2); x.fill();
      })));
    }
    return out;
  }

  /* ---------- growing the vines ---------- */

  // A smooth polyline through the points (Catmull-Rom), with running lengths.
  function smoothLine(pts) {
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      for (let k = 1; k <= 4; k++) {
        const t = k / 4, t2 = t * t, t3 = t2 * t;
        out.push([0, 1].map((j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
      }
    }
    const cum = [0];
    for (let i = 1; i < out.length; i++) cum.push(cum[i - 1] + Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]));
    return { pts: out, cum, L: cum[cum.length - 1] };
  }

  function grow(spec, depth, g) {
    const { rnd, band, leafScale, blooms } = g;
    const step = 12;
    const n = Math.max(4, Math.round(spec.len / step));
    let x = spec.x, y = spec.y, vx = spec.dx, vy = spec.dy;
    const pm = Math.hypot(vx, vy); vx /= pm; vy /= pm;
    const px = vx, py = vy;
    const homeX = spec.side === 'left' ? band * 0.45 : vw - band * 0.45;
    const pull = depth ? 0.006 : 0.028;
    const pts = [[x, y]], branches = [];

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

    const vine = Object.assign(smoothLine(pts), { depth, s0: spec.s0, s1: spec.s1, leaves: [], flowers: [], f: 0 });

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
      vine.leaves.push({
        x: pts[i][0], y: pts[i][1], rot: phi + Math.PI / 2, sc: (0.55 + rnd() * 0.55) * leafScale * (depth ? 0.85 : 1),
        img: Math.floor(rnd() * GREENS.length), at: acc, on: false, s: 0, t0: 0
      });

      // every few leaves, a little blossom tucked against the vine (never stacked)
      if (--untilFlower <= 0) {
        untilFlower = 3 + Math.floor(rnd() * 4);
        const nx = -ty, ny = tx, nm = Math.hypot(nx, ny) || 1;
        const off = -side * (3 + rnd() * 5);
        const fx = pts[i][0] + (nx / nm) * off, fy = pts[i][1] + (ny / nm) * off;
        const fs = (0.9 + rnd() * 0.6) * leafScale;
        const r = 9.5 * fs;
        const rot = (rnd() * 72 * Math.PI) / 180;
        const img = Math.floor(rnd() * PETALS.length);
        if (!blooms.some((b) => Math.hypot(b.x - fx, b.y - fy) < (b.r + r) * 1.15)) {
          blooms.push({ x: fx, y: fy, r });
          vine.flowers.push({ x: fx, y: fy, rot, sc: fs, img, at: acc + 30, on: false, s: 0, t0: 0 });
        }
      }
    }
    const total = acc || 1;
    vine.leaves.forEach((l) => { l.at /= total; });
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
      }, depth + 1, g);
    }
  }

  function build() {
    vw = canvas.clientWidth || window.innerWidth;
    vh = canvas.clientHeight || window.innerHeight;
    lastW = window.innerWidth;
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    vines = [];

    const leafScale = vw < 700 ? 0.95 : 1.3;
    sprites = makeSprites(dpr * leafScale * 1.6);
    const band = clamp(vw * 0.25, 90, 400);
    const g = { rnd: window.HavenStone.mulberry32(20240607), band, leafScale, blooms: [] };
    const specs = [
      { x: band * 0.2, y: vh + 10, dx: 0.2, dy: -1, side: 'left', len: vh * 1.05, s0: 0.0, s1: 0.7 },
      { x: band * 0.75, y: vh + 10, dx: -0.15, dy: -1, side: 'left', len: vh * 0.75, s0: 0.18, s1: 0.85 },
      { x: vw - band * 0.25, y: vh + 10, dx: -0.2, dy: -1, side: 'right', len: vh * 1.0, s0: 0.05, s1: 0.75 },
      { x: vw - band * 0.8, y: vh + 10, dx: 0.1, dy: -1, side: 'right', len: vh * 0.6, s0: 0.3, s1: 0.9 },
      { x: band * 0.55, y: -10, dx: 0.25, dy: 1, side: 'left', len: vh * 0.45, s0: 0.4, s1: 1 },
      { x: vw - band * 0.45, y: -10, dx: -0.25, dy: 1, side: 'right', len: vh * 0.55, s0: 0.3, s1: 0.95 },
      { x: -10, y: vh * 0.55, dx: 1, dy: -0.3, side: 'left', len: band * 1.6, s0: 0.35, s1: 0.95 },
      { x: vw + 10, y: vh * 0.35, dx: -1, dy: 0.2, side: 'right', len: band * 1.6, s0: 0.4, s1: 1 },
      { x: -10, y: vh * 0.25, dx: 1, dy: 0.25, side: 'left', len: band * 1.3, s0: 0.6, s1: 1 },
      { x: vw + 10, y: vh * 0.75, dx: -1, dy: -0.25, side: 'right', len: band * 1.3, s0: 0.2, s1: 0.8 }
    ];
    specs.forEach((s) => grow(s, 0, g));
    lastG = -1;
    schedule();
  }

  /* ---------- drawing ---------- */

  function traceTo(v, len, ox, oy) {
    const { pts, cum } = v;
    ctx.beginPath();
    ctx.moveTo(pts[0][0] + ox, pts[0][1] + oy);
    for (let i = 1; i < pts.length; i++) {
      if (cum[i] >= len) {
        const k = (len - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
        ctx.lineTo(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k + ox, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k + oy);
        return;
      }
      ctx.lineTo(pts[i][0] + ox, pts[i][1] + oy);
    }
  }

  function drawVine(v) {
    const len = v.L * v.f;
    if (len < 1) return;
    const w = v.depth ? 3.4 : 5.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (FELT) {
      // a strip of green felt, its shadow on the wall, a lighter edge, and a running stitch
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(20,12,4,.38)'; ctx.lineWidth = w + 1.2;
      traceTo(v, len, 1.2, 1.8); ctx.stroke();
      ctx.strokeStyle = '#4f6129'; ctx.lineWidth = w;
      traceTo(v, len, 0, 0); ctx.stroke();
      ctx.strokeStyle = 'rgba(160,184,98,.55)'; ctx.lineWidth = w * 0.32;
      traceTo(v, len, -w * 0.16, -w * 0.2); ctx.stroke();
      ctx.setLineDash([3.2, 2.6]);
      ctx.strokeStyle = 'rgba(20,12,4,.35)'; ctx.lineWidth = 1;
      traceTo(v, len, 0.4, 0.6); ctx.stroke();
      ctx.strokeStyle = '#e1ebb7';
      traceTo(v, len, 0, 0); ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = 'rgba(20,12,5,.3)'; ctx.lineWidth = w * 0.8;
      traceTo(v, len, 1, 2); ctx.stroke();
      ctx.strokeStyle = v.depth ? '#50552a' : '#45491f'; ctx.lineWidth = w * 0.8;
      traceTo(v, len, 0, 0); ctx.stroke();
    }
  }

  const easeOutBack = (t) => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

  function stamp(item, image, box, now) {
    let s;
    if (reduceMotion) s = item.on ? 1 : 0;
    else {
      const t = clamp((now - item.t0) / POP_MS, 0, 1);
      s = item.on ? easeOutBack(t) : 1 - t;
      if (t < 1) animating = true;
    }
    item.s = s;
    if (s <= 0.01) return;
    const k = item.sc * s, c = Math.cos(item.rot) * k, sn = Math.sin(item.rot) * k;
    ctx.setTransform(dpr * c, dpr * sn, -dpr * sn, dpr * c, dpr * item.x, dpr * item.y);
    ctx.drawImage(image, box[0], box[1], box[2], box[3]);
  }

  let animating = false;
  function draw(now) {
    animating = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const v of vines) drawVine(v);
    for (const v of vines) for (const l of v.leaves) stamp(l, sprites.leaves[l.img], LEAF_BOX, now);
    for (const v of vines) for (const fl of v.flowers) stamp(fl, sprites.flowers[fl.img], FLOWER_BOX, now);
  }

  /* ---------- growth from scroll ---------- */

  function growth() {
    const scene = window.HavenScene;
    const zoomEnd = scene ? scene.zoomEnd() : window.innerHeight;
    const start = zoomEnd * 0.95;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    return clamp((window.scrollY - start) / Math.max(1, max - start), 0, 1);
  }

  let lastG = -1, queued = false;
  function frame(now) {
    queued = false;
    if (!vines.length || document.body.classList.contains('is-posting')) return;
    const g = growth();
    const changed = Math.abs(g - lastG) > 0.0004;
    if (changed) {
      lastG = g;
      canvas.classList.toggle('is-growing', g > 0);
      for (const v of vines) {
        v.f = clamp((g - v.s0) / (v.s1 - v.s0), 0, 1);
        for (const list of [v.leaves, v.flowers]) {
          for (const l of list) {
            const on = v.f >= l.at;
            if (on !== l.on) {
              // continue smoothly from wherever a half-finished pop had got to
              const s = l.s;
              l.on = on;
              l.t0 = now - (on ? 0 : (1 - s) * POP_MS);
            }
          }
        }
      }
    }
    if (changed || animating) draw(now);
    if (animating) schedule();
  }
  function schedule() {
    if (!queued) { queued = true; requestAnimationFrame(frame); }
  }

  window.addEventListener('scroll', schedule, { passive: true });
  let rt = 0;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => { if (window.innerWidth !== lastW) build(); else schedule(); }, 150);
  });

  // The ivy only shows once you reach the wall, so build it after the page
  // has appeared rather than holding up the first paint.
  const later = window.requestIdleCallback || ((fn) => setTimeout(fn, 250));
  if (document.readyState === 'complete') later(build, { timeout: 1200 });
  else window.addEventListener('load', () => later(build, { timeout: 1200 }));
})();
