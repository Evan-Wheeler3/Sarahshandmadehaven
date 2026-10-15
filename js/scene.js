/* The hero scene: a misty sky, a tall stone tower with a glowing window,
   and a scroll-driven zoom that dives into the tower until its stones
   become the wall behind the rest of the site. */
(function () {
  'use strict';

  const canvas = document.getElementById('scene');
  const hero = document.getElementById('top');
  if (!canvas || !canvas.getContext || !window.HavenStone) return;

  const ctx = canvas.getContext('2d');
  const glintCanvas = document.getElementById('glint');
  const gctx = glintCanvas ? glintCanvas.getContext('2d') : null;
  // Felt and stitching is the default. ?tower=sandstone or ?tower=grey show
  // the earlier painted-stone looks.
  const asked = new URLSearchParams(location.search).get('tower');
  const STYLE = asked === 'grey' || asked === 'sandstone' || !window.HavenFelt ? (asked === 'grey' ? 'grey' : 'sandstone') : 'felt';
  const LOOK = {
    grey: { vignette: 0.62, wash: 0.1, calm: 0.12, ground: '#556a3b', wall: '#3d362f', sky: '#bfd0cf', glints: false },
    sandstone: { vignette: 0.5, wash: 0.16, calm: 0.2, ground: '#556a3b', wall: '#6b5238', sky: '#bfd0cf', glints: true },
    felt: { vignette: 0.42, wash: 0.1, calm: 0.14, ground: '#5f7a3c', wall: '#4e3522', sky: '#d6ded7', glints: false, felt: true }
  }[STYLE];
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;
  root.classList.toggle('is-felt', !!LOOK.felt);

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  const TOWER_STONE = LOOK.felt ? 5 : 2.2;   // tower stones are this much bigger than the wall's
  const FADE = [0.55, 0.75];  // stretch of the zoom where tower stones dissolve into the wall's

  const S = {
    dpr: 1, vw: 0, vh: 0, L: null,
    mips: [], patterns: [], tileW: 0, tileH: 0, tint: null,
    p: 0, target: 0, t: 0, pulseUntil: 0,
    zoomEnd: 1, motes: [], drawnP: -1, dirty: true
  };

  /* ---------- layout ---------- */

  function layout() {
    const vw = S.vw, vh = S.vh;
    const narrow = vw < 700;
    const tw = clamp(vw * 0.085, 54, 128);
    const cx = narrow ? vw * 0.85 : vw * 0.8;
    const groundY = vh * 0.93;
    const topY = Math.max(vh * 0.12, tw * 0.75 + vh * 0.04);
    const winW = tw * 0.42;
    const winTop = topY + tw * 0.8;
    const winH = tw * 1.05;
    const winBottom = winTop + winH;
    const slitY = winBottom + tw * 0.9;
    const F = { x: cx, y: lerp(slitY + tw * 0.6, groundY, 0.5) };
    const baseY = groundY + tw * 0.8;

    // zoom factor: big enough that the tower face covers the whole screen
    const hwAtF = (tw / 2) * lerp(0.94, 1.06, (F.y - topY) / (baseY - topY));
    const Z = Math.max(
      8,
      (vw * 0.62) / hwAtF,
      (vh * 0.62) / (F.y - topY),
      (vh * 0.62) / (groundY - F.y - tw * 0.4)
    );

    const rnd = window.HavenStone.mulberry32(42);
    const tufts = [];
    for (let x = -vw * 0.6; x < vw * 1.6; x += 6 + rnd() * 10) {
      tufts.push({ x, h: 4 + rnd() * 9, lean: (rnd() - 0.5) * 6, flower: rnd() < 0.08 ? (rnd() < 0.5 ? '#e9c9c1' : '#f3e7c4') : null });
    }
    const clouds = [];
    for (let i = 0; i < 5; i++) {
      const blobs = [];
      const n = 4 + Math.floor(rnd() * 4);
      for (let b = 0; b < n; b++) blobs.push({ dx: (b - n / 2) * 38 + rnd() * 20, dy: (rnd() - 0.5) * 16, r: 30 + rnd() * 34 });
      clouds.push({ x: rnd() * vw * 1.3, y: vh * (0.08 + rnd() * 0.4), s: 0.6 + rnd() * 0.8, speed: 4 + rnd() * 6, blobs });
    }

    S.L = { narrow, tw, cx, groundY, topY, winW, winTop, winH, winBottom, slitY, F, baseY, Z, tufts, clouds };
    S.L.edge = makeEdge(S.L, rnd);
    S.tint = makeTint();
    if (LOOK.felt) S.felt = buildFelt(S.L);
  }

  /* ---------- felt pieces, drawn once per layout ---------- */

  // A sprite covers a world-space box at `res` device pixels per unit.
  function sprite(x0, y0, w, h, res, draw) {
    res = Math.min(res, 4096 / w, 4096 / h);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w * res));
    c.height = Math.max(1, Math.ceil(h * res));
    const x = c.getContext('2d');
    x.setTransform(res, 0, 0, res, -x0 * res, -y0 * res);
    draw(x);
    return { c, x0, y0, w: c.width / res, h: c.height / res };
  }
  function blit(sp) { if (sp) ctx.drawImage(sp.c, sp.x0, sp.y0, sp.w, sp.h); }

  function hillPts(baseY, amp, f1, f2, phase, x0, x1, bottom) {
    const pts = [[x0, bottom]];
    for (let x = x0; x <= x1; x += 10) pts.push([x, baseY + Math.sin(x * f1 + phase) * amp + Math.sin(x * f2 + phase * 2.3) * amp * 0.5]);
    pts.push([x1, bottom]);
    return pts;
  }
  const groundCrest = (L, x) => L.groundY - L.tw * 0.15 * Math.exp(-Math.pow((x - L.cx) / (L.tw * 2.5), 2)) + Math.sin(x * 0.009 + 2) * S.vh * 0.012;

  function parapetPts(L) {
    const tw = L.tw, cx = L.cx, top = L.topY;
    const pw = tw * 0.62, hwT = tw * 0.47, pTop = top - tw * 0.32, mh = tw * 0.3;
    const n = 4, a = (2 * pw) / (n + (n - 1) * 0.75), gap = a * 0.75;
    const pts = [[cx - hwT, top + tw * 0.32], [cx - pw, top + tw * 0.08], [cx - pw, pTop - mh]];
    let x = cx - pw;
    for (let i = 0; i < n; i++) {
      x += a;
      pts.push([x, pTop - mh]);
      if (i < n - 1) { pts.push([x, pTop], [x + gap, pTop], [x + gap, pTop - mh]); x += gap; }
    }
    pts.push([cx + pw, top + tw * 0.08], [cx + hwT, top + tw * 0.32]);
    return { pts, pw, pTop, mh, a, gap, n };
  }

  function archPts(cx, top, w, bottom, n = 16) {
    const r = w / 2, pts = [[cx - r, bottom], [cx - r, top + r]];
    for (let i = 1; i < n; i++) { const a = Math.PI + (Math.PI * i) / n; pts.push([cx + Math.cos(a) * r, top + r + Math.sin(a) * r]); }
    pts.push([cx + r, top + r], [cx + r, bottom]);
    return pts;
  }

  const LEAF_D = 'M0 -5 C-3 -3.5 -8 -3.6 -9.6 -6.8 C-10.6 -9 -8.6 -11 -6.4 -10.8 C-9.6 -12.8 -10.4 -17.4 -6.4 -17.6 C-4 -17.8 -2 -20.4 0 -24 C2 -20.4 4 -17.8 6.4 -17.6 C10.4 -17.4 9.6 -12.8 6.4 -10.8 C8.6 -11 10.6 -9 9.6 -6.8 C8 -3.6 3 -3.5 0 -5Z';
  function feltLeaf(x, F, px, py, rot, sc, color, rnd) {
    const base = F.samplePath(LEAF_D, 1.2);
    const pts = base.map(([a, b]) => {
      const X = a * sc, Y = b * sc;
      return [px + X * Math.cos(rot) - Y * Math.sin(rot), py + X * Math.sin(rot) + Y * Math.cos(rot)];
    });
    F.piece(x, pts, color, { rnd, scale: sc * 0.35, shadowAlpha: 0.35 });
    const vein = [[0, -5], [0, -21]].map(([a, b]) => [px + a * sc * Math.cos(rot) - b * sc * Math.sin(rot), py + a * sc * Math.sin(rot) + b * sc * Math.cos(rot)]);
    F.thread(x, vein, '#e3f0c0', { width: 0.9 * sc * 0.6, dash: [], rnd, shadow: 0.25 });
  }
  function feltFlower(x, F, px, py, sc, color, rnd) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      F.piece(x, F.ellipsePts(px + Math.cos(a) * 4.4 * sc, py + Math.sin(a) * 4.4 * sc, 3.4 * sc, 4.6 * sc, 18, a + Math.PI / 2), color,
        { rnd, scale: sc * 0.3, shadowAlpha: 0.3, puff: 0.6 });
    }
    F.piece(x, F.ellipsePts(px, py, 2.4 * sc, 2.4 * sc, 14), '#f0b43c', { rnd, scale: sc * 0.25, shadowAlpha: 0.3 });
    x.fillStyle = '#9a5d14';
    for (let i = 0; i < 5; i++) { x.beginPath(); x.arc(px + Math.cos(i * 1.26) * sc, py + Math.sin(i * 1.26) * sc, 0.5 * sc, 0, Math.PI * 2); x.fill(); }
  }

  function buildFelt(L) {
    const F = window.HavenFelt, { vw, vh, dpr } = S, tw = L.tw;
    const R = window.HavenStone.mulberry32;
    const out = {};
    const k = clamp(tw / 128, 0.45, 1);   // felt detail scale for the tower pieces

    // sky: a pale blue felt sheet with a cream band of distant fields
    out.sky = sprite(0, 0, vw, vh, Math.min(dpr, 1.5), (x) => {
      x.fillStyle = '#d6ded7';
      x.fillRect(0, 0, vw, vh);
      F.grainOver(x, 0, 0, vw, vh, 1.2, 1, 11);
      const band = [[-20, vh + 20], [-20, vh * 0.3]];
      for (let px = -20; px <= vw + 20; px += 12) band.push([px, vh * 0.3 + Math.sin(px * 0.004 + 1) * vh * 0.03 + Math.sin(px * 0.011) * vh * 0.012]);
      band.push([vw + 20, vh + 20]);
      F.piece(x, band, '#efe2c6', { rnd: R(3), scale: 1.2, puff: 0.6, heather: 1.4 });
    });

    // the sun, stitched round with blanket stitch
    const sr = Math.min(vw, vh) * 0.075, sx = vw * 0.5, sy = vh * 0.17;
    out.sun = sprite(sx - sr - 12, sy - sr - 12, sr * 2 + 30, sr * 2 + 30, dpr, (x) => {
      const pts = F.ellipsePts(sx, sy, sr, sr, 64);
      F.piece(x, pts, '#f8e7b5', { rnd: R(5), scale: 1, puff: 0.8 });
      F.blanket(x, pts, '#d8a743', { width: clamp(sr * 0.03, 1.4, 2.2), every: Math.max(9, sr * 0.26), depth: Math.max(4, sr * 0.13), rnd: R(6) });
    });

    // clouds
    const CLOUD = 'M0 40 C-6 14 26 4 40 18 C48 -6 92 -8 100 16 C116 2 150 10 146 38 C160 44 156 64 138 64 H6 C-12 64 -14 46 0 40Z';
    const cloudPts = F.samplePath(CLOUD, 2);
    out.clouds = L.clouds.slice(0, 4).map((cl, i) => {
      const s2 = (vw < 700 ? 0.6 : 1) * (0.7 + (i % 3) * 0.25);
      return Object.assign({}, cl, {
        sp: sprite(-14, -14, 175 * s2 + 20, 80 * s2 + 20, dpr, (x) => {
          x.save(); x.scale(s2, s2);
          F.piece(x, cloudPts, '#fbf8f1', { rnd: R(20 + i), scale: 1 / s2 * 0.9, puff: 1, stitch: '#b9c6cc', stitchWidth: 2.2 / s2, stitchInset: 8, stitchDash: [7, 6] });
          x.restore();
        })
      });
    });

    // two layers of distant hills
    const hillRes = Math.min(dpr, 1.5);
    out.far = sprite(-vw * 0.6, vh * 0.6, vw * 2.2, vh * 0.7, hillRes, (x) => {
      const pts = hillPts(vh * 0.74, vh * 0.03, 0.004, 0.011, 1.2, -vw * 0.6, vw * 1.6, vh * 1.3);
      F.piece(x, pts, '#a9b89c', { rnd: R(30), scale: 1.2, puff: 0.7 });
      F.thread(x, F.inset(pts, 10).slice(1, -1), '#e8eccf', { width: 2.6, dash: [11, 8], rnd: R(31) });
    });
    out.mid = sprite(-vw * 0.6, vh * 0.7, vw * 2.2, vh * 0.65, hillRes, (x) => {
      const pts = hillPts(vh * 0.82, vh * 0.025, 0.006, 0.017, 4.1, -vw * 0.6, vw * 1.6, vh * 1.35);
      F.piece(x, pts, '#93a96f', { rnd: R(32), scale: 1.2, puff: 0.7 });
      F.thread(x, F.inset(pts, 10).slice(1, -1), '#dfe6b8', { width: 2.6, dash: [11, 8], rnd: R(33) });
    });

    // the ground the tower stands on: green felt, blanket-stitched edge, thread grass, felt flowers
    const gx0 = -vw * 0.6, gx1 = vw * 1.6, gTop = L.groundY - tw * 0.3 - 30, gBot = L.groundY + vh * 0.3;
    out.groundBottom = gBot;
    out.ground = sprite(gx0, gTop, gx1 - gx0, gBot - gTop, Math.min(dpr * 1.5, 3), (x) => {
      const pts = [[gx0, gBot + 40]];
      for (let px = gx0; px <= gx1; px += 8) pts.push([px, groundCrest(L, px)]);
      pts.push([gx1, gBot + 40]);
      F.piece(x, pts, '#6f8a48', { rnd: R(40), scale: 1, puff: 0.8 });
      F.blanket(x, pts.slice(1, -1).concat([[gx1, gBot + 40], [gx0, gBot + 40]]), '#c7d68c', { width: 2.2, every: 24, depth: 10, rnd: R(41) });
      const r = R(42);
      for (let px = gx0 + 10; px < gx1; px += 14 + r() * 20) {
        const py = groundCrest(L, px) + 4;
        F.thread(x, [[px, py], [px - 3, py - 11]], '#3f5a24', { width: 2, dash: [], rnd: r, shadow: 0.3 });
        F.thread(x, [[px + 4, py], [px + 7, py - 13]], '#3f5a24', { width: 2, dash: [], rnd: r, shadow: 0.3 });
        if (r() < 0.06) feltFlower(x, F, px + 2, py - 14, 0.8, ['#f3b9c0', '#fbf5ea', '#f8d66a'][Math.floor(r() * 3)], r);
      }
    });

    // battlements and the overhanging parapet, built from felt stones
    const pp = parapetPts(L);
    const pBox = [L.cx - pp.pw - 14, pp.pTop - pp.mh - 14, pp.pw * 2 + 28, tw * 0.75 + pp.mh + 30];
    out.parapet = sprite(pBox[0], pBox[1], pBox[2], pBox[3], dpr * 3, (x) => {
      const r = R(50);
      F.piece(x, pp.pts, '#5d4129', { rnd: r, scale: k, puff: 0.8 });
      const cols = ['#e3bf87', '#d9ab6c', '#ecd3a2', '#d39a6a', '#e8c48f', '#dcb57b'];
      const stone = (sx2, sy2, w, h) => F.piece(x, F.cutQuad(sx2, sy2, w, h, r, 0.14, 0.3), cols[Math.floor(r() * cols.length)],
        { rnd: r, scale: k * 0.8, stitch: r() < 0.6 ? '#fff3d6' : '#6e4322', stitchWidth: 2 * k, stitchInset: 5.5 * k, stitchDash: [5 * k, 4 * k] });
      for (let i = 0, bx = L.cx - pp.pw; i < pp.n; i++, bx += pp.a + pp.gap) stone(bx + 2 * k, pp.pTop - pp.mh + 2 * k, pp.a - 4 * k, pp.mh + 2 * k);
      const rowY = pp.pTop + 4 * k, rowH = L.topY + tw * 0.06 - rowY;
      let bx = L.cx - pp.pw + 2 * k;
      while (bx < L.cx + pp.pw - 10 * k) {
        const w = Math.min(L.cx + pp.pw - 2 * k - bx, (0.3 + r() * 0.2) * tw);
        stone(bx, rowY, w - 3 * k, rowH);
        bx += w;
      }
      const trim = [[L.cx - pp.pw, L.topY + tw * 0.08], [L.cx + pp.pw, L.topY + tw * 0.08], [L.cx + tw * 0.47, L.topY + tw * 0.32], [L.cx - tw * 0.47, L.topY + tw * 0.32]];
      F.piece(x, trim, '#b98a5a', { rnd: r, scale: k, puff: 0.8 });
      F.thread(x, [[L.cx - pp.pw + 10 * k, L.topY + tw * 0.15], [L.cx + pp.pw - 10 * k, L.topY + tw * 0.15]], '#fff1d6', { width: 2.2 * k, dash: [6 * k, 5 * k], rnd: r });
      // round-tower light and shade, baked in
      x.save();
      x.globalCompositeOperation = 'source-atop';
      const g = x.createLinearGradient(L.cx - pp.pw, 0, L.cx + pp.pw, 0);
      g.addColorStop(0, 'rgba(42,23,8,.4)'); g.addColorStop(0.22, 'rgba(255,242,216,.1)');
      g.addColorStop(0.45, 'rgba(42,23,8,0)'); g.addColorStop(1, 'rgba(42,23,8,.55)');
      x.fillStyle = g;
      x.fillRect(pBox[0], pBox[1], pBox[2], pBox[3]);
      x.restore();
    });

    // the glowing window
    const w = L.winW, wb = [L.cx - w - 10, L.winTop - w * 0.5, w * 2 + 20, L.winH + w + 10];
    out.window = sprite(wb[0], wb[1], wb[2], wb[3], dpr * 3, (x) => {
      const r = R(60);
      const fr = archPts(L.cx, L.winTop - tw * 0.1, w + tw * 0.2, L.winBottom + tw * 0.03);
      F.piece(x, fr, '#f2e4c4', { rnd: r, scale: k, puff: 1 });
      F.thread(x, F.inset(fr, 5 * k).slice(0, -1), '#b48a52', { width: 2 * k, dash: [5 * k, 4 * k], rnd: r });
      F.piece(x, archPts(L.cx, L.winTop, w, L.winBottom), '#2e1c10', { rnd: r, scale: k, puff: 0.6 });
      const glow = archPts(L.cx, L.winTop + w * 0.35, w * 0.62, L.winBottom - w * 0.12);
      F.piece(x, glow, '#f0a54a', { rnd: r, scale: k * 0.8, puff: 0.6 });
      x.save();
      x.beginPath(); F.polyPath(x, glow); x.clip();
      const gg = x.createRadialGradient(L.cx, L.winBottom, 0, L.cx, L.winBottom, L.winH * 0.9);
      gg.addColorStop(0, 'rgba(255,224,150,.85)'); gg.addColorStop(1, 'rgba(255,224,150,0)');
      x.fillStyle = gg; x.fillRect(wb[0], wb[1], wb[2], wb[3]);
      x.restore();
      F.piece(x, F.cutQuad(L.cx - w * 0.8, L.winBottom, w * 1.6, tw * 0.09, r, 0.05, 0.4), '#e9d6ae', { rnd: r, scale: k * 0.7, puff: 0.8 });
    });

    // the arrow slit
    out.slit = sprite(L.cx - tw * 0.12, L.slitY - 8, tw * 0.24, tw * 0.42 + 16, dpr * 3, (x) => {
      F.piece(x, archPts(L.cx, L.slitY, tw * 0.09, L.slitY + tw * 0.42), '#2e1c10', { rnd: R(70), scale: k * 0.6, puff: 0.5 });
    });

    // the door: planks of brown felt stitched together, in a cream arch
    const dw = tw * 0.4, dTop = L.groundY - tw * 0.72;
    out.door = sprite(L.cx - dw, dTop - dw * 0.4, dw * 2, L.groundY - dTop + dw * 0.6, dpr * 3, (x) => {
      const r = R(80);
      F.piece(x, archPts(L.cx, dTop - tw * 0.08, dw + tw * 0.16, L.groundY + tw * 0.2), '#f2e4c4', { rnd: r, scale: k, puff: 1 });
      F.piece(x, archPts(L.cx, dTop, dw, L.groundY + tw * 0.2), '#7a4b2a', { rnd: r, scale: k, puff: 0.8 });
      for (let i = 1; i < 4; i++) {
        const px = L.cx - dw / 2 + (dw * i) / 4;
        F.thread(x, [[px, dTop + dw * 0.2], [px, L.groundY + 4]], '#e6c18f', { width: 2 * k, dash: [5 * k, 4 * k], rnd: r });
      }
      F.piece(x, F.ellipsePts(L.cx + dw * 0.28, dTop + dw * 0.95, 3.5 * k + 1, 3.5 * k + 1, 12), '#d9b46a', { rnd: r, scale: k * 0.4, puff: 0.6 });
    });

    // ivy climbing the foot of the tower
    const ib = [L.cx - tw * 0.95, L.groundY - tw * 2.6, tw * 1.9, tw * 2.7];
    out.ivy = sprite(ib[0], ib[1], ib[2], ib[3], dpr * 2, (x) => {
      const r = R(90), sc = tw / 120 * 1.3;
      const greens = ['#4f8a38', '#5f9a43', '#447a31', '#6aa64c'];
      const vine = (pts) => {
        x.save(); x.lineCap = 'round'; x.lineJoin = 'round';
        x.strokeStyle = '#4c5a28'; x.lineWidth = 4 * sc;
        x.beginPath(); x.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1], b = pts[i];
          x.quadraticCurveTo(a[0] + (b[0] - a[0]) * 0.2 + 8 * sc, (a[1] + b[1]) / 2, b[0], b[1]);
        }
        x.stroke(); x.restore();
      };
      const gy = L.groundY + 6;
      const v1 = [[L.cx - tw * 0.52, gy], [L.cx - tw * 0.44, gy - tw * 0.55], [L.cx - tw * 0.3, gy - tw * 1.1], [L.cx - tw * 0.38, gy - tw * 1.6], [L.cx - tw * 0.22, gy - tw * 2.1]];
      const v2 = [[L.cx + tw * 0.48, gy], [L.cx + tw * 0.38, gy - tw * 0.48], [L.cx + tw * 0.44, gy - tw * 0.95]];
      vine(v1); vine(v2);
      const leaves = [[-0.48, 0.32, -50], [-0.38, 0.72, 40], [-0.33, 1.15, -40], [-0.42, 1.45, 50], [-0.31, 1.82, -30], [-0.22, 2.12, 20],
        [0.44, 0.24, 40], [0.35, 0.62, -40], [0.46, 0.92, 30]];
      for (const [fx, fy, rot] of leaves) feltLeaf(x, F, L.cx + fx * tw, gy - fy * tw, (rot * Math.PI) / 180, sc * (1.25 + r() * 0.35), greens[Math.floor(r() * greens.length)], r);
      feltFlower(x, F, L.cx - tw * 0.26, gy - tw * 0.9, sc * 1.2, '#f3b9c0', r);
      feltFlower(x, F, L.cx - tw * 0.45, gy - tw * 1.75, sc * 1.05, '#fbf5ea', r);
      feltFlower(x, F, L.cx + tw * 0.31, gy - tw * 0.4, sc * 1.1, '#c9b0ea', r);
    });

    // fringe: short loose fibres for the tower's fuzzy outline
    const fr = document.createElement('canvas');
    fr.width = fr.height = 48;
    const fx = fr.getContext('2d'), rr = R(99);
    fx.lineCap = 'round';
    for (let i = 0; i < 260; i++) {
      const a = rr() * Math.PI * 2, px = rr() * 48, py = rr() * 48, len = 1 + rr() * 3;
      fx.strokeStyle = rr() < 0.5 ? 'rgba(88,62,40,.75)' : 'rgba(200,160,110,.55)';
      fx.lineWidth = 0.7;
      fx.beginPath(); fx.moveTo(px, py); fx.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len); fx.stroke();
    }
    out.fringe = ctx.createPattern(fr, 'repeat');
    return out;
  }

  // The tower's outline follows its stone courses: each course pokes out a
  // little, and the mortar between them dips in, so the silhouette reads as
  // stacked stone rather than a cut-out.
  function makeEdge(L, rnd) {
    const ys = [];
    if (S.rows && S.rows.length > 1 && S.tileH) {
      const sc = TOWER_STONE / L.Z;
      const n0 = Math.floor((L.topY - L.tw - L.F.y) / (S.tileH * sc)) - 1;
      const n1 = Math.ceil((L.baseY - L.F.y) / (S.tileH * sc)) + 1;
      for (let n = n0; n <= n1; n++) {
        for (let r = 0; r < S.rows.length - 1; r++) ys.push(L.F.y + (S.rows[r] + n * S.tileH) * sc);
      }
    }
    const rowsIn = ys.filter((y) => y > L.topY - 1 && y < L.baseY + 1);
    const rh = rowsIn.length > 1 ? (rowsIn[rowsIn.length - 1] - rowsIn[0]) / (rowsIn.length - 1) : 5;
    const amp = clamp(rh * 0.3, 0.4, 3);
    const bump = () => (rnd() < 0.12 ? 0 : amp * (0.35 + rnd() * 0.65));
    const yy = [L.topY, ...rowsIn, L.baseY];
    return { ys: yy, left: yy.map(bump), right: yy.map(bump), amp };
  }

  // Broad, soft patches of lighter and darker stone laid over the tower in
  // world space. They never repeat, which hides the texture's repetition,
  // and once zoomed in they become gentle weathering across the wall.
  function makeTint() {
    const rnd = window.HavenStone.mulberry32(77);
    const c = document.createElement('canvas');
    c.width = 9; c.height = 70;
    const x = c.getContext('2d');
    for (let j = 0; j < c.height; j++) {
      for (let i = 0; i < c.width; i++) {
        const v = 0.5 + (rnd() - 0.5) * 0.55;
        x.fillStyle = `rgb(${Math.round(v * 255)},${Math.round(v * 236)},${Math.round(v * 205)})`;
        x.fillRect(i, j, 1, 1);
      }
    }
    return c;
  }

  function buildTexture() {
    // Phones: a 440px-wide tile is already wider than the screen. Wide
    // screens: make the tile as wide as the screen so the wall never repeats
    // side to side, at a slightly lower resolution to stay within Safari's
    // canvas size limit.
    const wide = S.vw > 700;
    const w = wide ? Math.round(clamp(S.vw * 1.02, 720, 1600)) : 440;
    if (w === S.tileW && S.mips.length) return;
    S.tileW = w;
    // felt stones are big on the tower, so a shorter tile still never repeats there
    S.tileH = Math.round(w * (LOOK.felt ? (wide ? 1.45 : 3.2) : (wide ? 2.4 : 4.5)));
    S.tileDpr = wide ? Math.min(S.dpr, 1.5) : S.dpr;
    const rowH = wide ? clamp(S.vw * 0.055, 60, 84) : 50;
    const base = window.HavenStone.makeTile(S.tileW, S.tileH, S.tileDpr, 1871, STYLE, rowH);
    S.sparkles = base.sparkles || [];
    S.mips = window.HavenStone.makeMips(base);
    // the wall's average colour, for the strip just below the screen edge
    try {
      const px = document.createElement('canvas').getContext('2d');
      px.drawImage(S.mips[S.mips.length - 1], 0, 0, 1, 1);
      const [r, g, b] = px.getImageData(0, 0, 1, 1).data;
      S.wallAvg = `rgb(${r},${g},${b})`;
    } catch (e) {
      S.wallAvg = LOOK.wall;
    }
    S.patterns = S.mips.map((c) => ctx.createPattern(c, 'repeat'));
    S.rows = base.rows || [];
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const vw = window.innerWidth;
    const vh = canvas.clientHeight || window.innerHeight;
    const dprChanged = dpr !== S.dpr;
    S.dpr = dpr; S.vw = vw; S.vh = vh;
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    if (glintCanvas) {
      glintCanvas.width = canvas.width;
      glintCanvas.height = canvas.height;
    }
    if (dprChanged) S.mips = [];
    buildTexture();
    layout();
    S.zoomEnd = Math.max(1, hero ? hero.offsetHeight - window.innerHeight : vh);
    S.dirty = true;
  }

  /* ---------- camera ---------- */

  function camera(p) {
    const L = S.L;
    if (reduceMotion) return { z: 1, fx: L.F.x, fy: L.F.y };
    const e = easeInOut(p);
    const z = Math.exp(Math.log(L.Z) * e);
    const m = smooth(clamp(p * 1.15, 0, 1));
    return { z, fx: lerp(L.F.x, S.vw / 2, m), fy: lerp(L.F.y, S.vh / 2, m) };
  }

  // world -> device transform, with optional parallax (0 = static, 1 = full zoom)
  function setCam(cam, parallax) {
    const L = S.L, d = S.dpr;
    const z = 1 + (cam.z - 1) * parallax;
    const fx = lerp(L.F.x, cam.fx, parallax), fy = lerp(L.F.y, cam.fy, parallax);
    ctx.setTransform(d * z, 0, 0, d * z, d * (fx - L.F.x * z), d * (fy - L.F.y * z));
  }

  function stonePattern(z, m = 1) {
    const L = S.L;
    const want = ((z * m) / L.Z) * (S.dpr / S.tileDpr); // device px per base-tile px
    let i = Math.floor(Math.log2(1 / Math.max(want, 1e-4)));
    i = clamp(i, 0, S.patterns.length - 1);
    const pat = S.patterns[i];
    const k = ((S.mips[0].width / S.mips[i].width) * m) / (L.Z * S.tileDpr);
    pat.setTransform(new DOMMatrix([k, 0, 0, k, L.F.x, L.F.y]));
    return pat;
  }

  /* ---------- painting ---------- */

  function drawSky(cam) {
    const { vw, vh, dpr, L } = S;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (LOOK.felt && S.felt) {
      blit(S.felt.sky);
      setCam(cam, 0.03);
      blit(S.felt.sun);
      for (const c of S.felt.clouds) {
        const span = vw * 1.6;
        const x = ((c.x + S.t * c.speed) % span) - vw * 0.3;
        ctx.drawImage(c.sp.c, x + c.sp.x0, c.y + c.sp.y0, c.sp.w, c.sp.h);
      }
      return;
    }
    const g = ctx.createLinearGradient(0, 0, 0, vh);
    g.addColorStop(0, '#bfd0cf');
    g.addColorStop(0.5, '#e6d9c0');
    g.addColorStop(1, '#f1d9b3');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, vw, vh);

    const sx = vw * 0.32, sy = vh * 0.3;
    const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.max(vw, vh) * 0.55);
    sg.addColorStop(0, 'rgba(255,246,222,.85)');
    sg.addColorStop(0.4, 'rgba(255,240,210,.35)');
    sg.addColorStop(1, 'rgba(255,240,210,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, vw, vh);

    // drifting clouds, barely affected by the zoom (they're far away)
    setCam(cam, 0.03);
    for (const c of L.clouds) {
      const span = vw * 1.6;
      const x = ((c.x + S.t * c.speed) % span) - vw * 0.3;
      for (const b of c.blobs) {
        const bx = x + b.dx * c.s, by = c.y + b.dy * c.s, r = b.r * c.s;
        const cg = ctx.createRadialGradient(bx, by, 0, bx, by, r);
        cg.addColorStop(0, 'rgba(255,252,244,.55)');
        cg.addColorStop(1, 'rgba(255,252,244,0)');
        ctx.fillStyle = cg;
        ctx.fillRect(bx - r, by - r, r * 2, r * 2);
      }
    }
  }

  function hillPath(baseY, amp, f1, f2, phase, x0, x1) {
    ctx.beginPath();
    ctx.moveTo(x0, S.vh * 3);
    for (let x = x0; x <= x1; x += 12) {
      ctx.lineTo(x, baseY + Math.sin(x * f1 + phase) * amp + Math.sin(x * f2 + phase * 2.3) * amp * 0.5);
    }
    ctx.lineTo(x1, S.vh * 3);
    ctx.closePath();
  }

  function drawHills(cam) {
    const { vw, vh } = S;
    if (LOOK.felt && S.felt) {
      setCam(cam, 0.05); blit(S.felt.far);
      setCam(cam, 0.14); blit(S.felt.mid);
      return;
    }
    setCam(cam, 0.05);
    hillPath(vh * 0.74, vh * 0.03, 0.004, 0.011, 1.2, -vw, vw * 2);
    ctx.fillStyle = 'rgba(146,166,150,.55)';
    ctx.fill();

    setCam(cam, 0.14);
    hillPath(vh * 0.82, vh * 0.025, 0.006, 0.017, 4.1, -vw, vw * 2);
    const g = ctx.createLinearGradient(0, vh * 0.78, 0, vh);
    g.addColorStop(0, '#a3b18a');
    g.addColorStop(1, '#8c9c72');
    ctx.fillStyle = g;
    ctx.fill();
  }

  const halfWidth = (y) => { const L = S.L; return S.L.tw * lerp(0.47, 0.53, (y - L.topY) / (L.baseY - L.topY)); };

  function towerBody(c = ctx) {
    const L = S.L, E = L.edge;
    c.beginPath();
    if (!E) {
      c.moveTo(L.cx - halfWidth(L.topY), L.topY);
      c.lineTo(L.cx + halfWidth(L.topY), L.topY);
      c.lineTo(L.cx + halfWidth(L.baseY), L.baseY);
      c.lineTo(L.cx - halfWidth(L.baseY), L.baseY);
      c.closePath();
      return;
    }
    const n = E.ys.length, dip = E.amp * 0.55;
    // left side, top to bottom
    c.moveTo(L.cx - halfWidth(E.ys[0]), E.ys[0]);
    for (let i = 0; i < n - 1; i++) {
      const ya = E.ys[i], yb = E.ys[i + 1], hgt = yb - ya, r = Math.min(hgt * 0.22, E.amp);
      const x = L.cx - halfWidth((ya + yb) / 2) - E.left[i];
      c.lineTo(L.cx - halfWidth(ya) + dip, ya);
      c.lineTo(x + r * 0.5, ya + r * 0.6);
      c.lineTo(x, ya + r);
      c.lineTo(x, yb - r);
      c.lineTo(x + r * 0.5, yb - r * 0.4);
    }
    c.lineTo(L.cx - halfWidth(L.baseY), L.baseY);
    c.lineTo(L.cx + halfWidth(L.baseY), L.baseY);
    // right side, bottom to top
    for (let i = n - 2; i >= 0; i--) {
      const ya = E.ys[i], yb = E.ys[i + 1], hgt = yb - ya, r = Math.min(hgt * 0.22, E.amp);
      const x = L.cx + halfWidth((ya + yb) / 2) + E.right[i];
      c.lineTo(L.cx + halfWidth(yb) - dip, yb);
      c.lineTo(x - r * 0.5, yb - r * 0.4);
      c.lineTo(x, yb - r);
      c.lineTo(x, ya + r);
      c.lineTo(x - r * 0.5, ya + r * 0.6);
    }
    c.lineTo(L.cx + halfWidth(L.topY), L.topY);
    c.closePath();
  }

  function parapet(c = ctx, add = false) {
    const L = S.L, tw = L.tw, cx = L.cx, top = L.topY;
    const pw = tw * 0.62, hwT = tw * 0.47;
    const pTop = top - tw * 0.32, mh = tw * 0.3;
    const n = 4, a = (2 * pw) / (n + (n - 1) * 0.75), gap = a * 0.75;
    if (!add) c.beginPath();
    c.moveTo(cx - hwT, top + tw * 0.32);
    c.lineTo(cx - pw, top + tw * 0.08);
    c.lineTo(cx - pw, pTop - mh);
    let x = cx - pw;
    for (let i = 0; i < n; i++) {
      x += a;
      c.lineTo(x, pTop - mh);
      if (i < n - 1) {
        c.lineTo(x, pTop);
        x += gap;
        c.lineTo(x, pTop);
        c.lineTo(x, pTop - mh);
      }
    }
    c.lineTo(cx + pw, top + tw * 0.08);
    c.lineTo(cx + hwT, top + tw * 0.32);
    c.closePath();
  }

  function archPath(cx, top, w, bottom) {
    const r = w / 2;
    ctx.beginPath();
    ctx.moveTo(cx - r, bottom);
    ctx.lineTo(cx - r, top + r);
    ctx.arc(cx, top + r, r, Math.PI, 0);
    ctx.lineTo(cx + r, bottom);
    ctx.closePath();
  }

  function flicker() {
    const t = S.t;
    const pulse = S.t < S.pulseUntil ? 0.6 : 0;
    return 0.86 + 0.08 * Math.sin(t * 7.3) * Math.sin(t * 2.1 + 1) + 0.04 * Math.sin(t * 23.7) + pulse;
  }

  function drawFeltTower(cam, p) {
    const L = S.L, tw = L.tw, FL = S.felt;
    setCam(cam, 1);
    const shade = 1 - smooth(clamp((p - 0.1) / 0.6, 0, 1));
    const fade = reduceMotion ? 0 : smooth(clamp((p - FADE[0]) / (FADE[1] - FADE[0]), 0, 1));

    ctx.fillStyle = stonePattern(cam.z, TOWER_STONE);
    towerBody(); ctx.fill();
    if (fade > 0.001) {
      ctx.globalAlpha = fade;
      ctx.fillStyle = stonePattern(cam.z, 1);
      towerBody(); ctx.fill();
      ctx.globalAlpha = 1;
    }

    if (shade > 0.001) {
      // light from the upper left on a round tower
      const g = ctx.createLinearGradient(L.cx - tw * 0.54, 0, L.cx + tw * 0.54, 0);
      g.addColorStop(0, `rgba(42,23,8,${0.42 * shade})`);
      g.addColorStop(0.22, `rgba(255,242,216,${0.1 * shade})`);
      g.addColorStop(0.45, 'rgba(42,23,8,0)');
      g.addColorStop(1, `rgba(42,23,8,${0.58 * shade})`);
      ctx.fillStyle = g;
      towerBody(); ctx.fill();

      // shadow under the parapet, haze toward the ground
      ctx.save();
      towerBody(); ctx.clip();
      const sg = ctx.createLinearGradient(0, L.topY + tw * 0.25, 0, L.topY + tw * 0.8);
      sg.addColorStop(0, `rgba(20,12,4,${0.55 * shade})`);
      sg.addColorStop(1, 'rgba(20,12,4,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(L.cx - tw, L.topY + tw * 0.25, tw * 2, tw * 0.55);
      const hg = ctx.createLinearGradient(0, L.groundY - tw * 2, 0, L.groundY);
      hg.addColorStop(0, 'rgba(50,40,24,0)');
      hg.addColorStop(1, `rgba(50,40,24,${0.3 * shade})`);
      ctx.fillStyle = hg;
      ctx.fillRect(L.cx - tw, L.groundY - tw * 2, tw * 2, tw * 2.5);
      ctx.restore();

      // a fuzzy fibre outline, and a seam stitched down each side
      ctx.save();
      ctx.globalAlpha = shade;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = FL.fringe;
      ctx.lineWidth = Math.max(2, tw * 0.03);
      towerBody(); ctx.stroke();
      ctx.lineCap = 'round';
      ctx.setLineDash([tw * 0.075, tw * 0.055]);
      const seam = (side, color) => {
        const y0 = L.topY + tw * 0.42, y1 = L.groundY - tw * 0.05;
        const xAt = (y) => L.cx + side * (halfWidth(y) - tw * 0.07);
        for (const [c, ox, oy] of [['rgba(20,10,2,.45)', tw * 0.008, tw * 0.011], [color, 0, 0]]) {
          ctx.strokeStyle = c;
          ctx.lineWidth = tw * 0.019;
          ctx.beginPath(); ctx.moveTo(xAt(y0) + ox, y0 + oy); ctx.lineTo(xAt(y1) + ox, y1 + oy); ctx.stroke();
        }
      };
      seam(-1, '#fff1d6');
      seam(1, '#3b2614');
      ctx.restore();
    }

    blit(FL.slit);
    blit(FL.door);
    blit(FL.parapet);
    blit(FL.window);

    // the window's warm glow, flickering
    const f = flicker();
    const gx = L.cx, gy = L.winTop + L.winH * 0.6, gr = tw * (1.9 + (f - 0.86) * 2);
    const og = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
    og.addColorStop(0, `rgba(255,214,150,${0.36 * f})`);
    og.addColorStop(1, 'rgba(255,214,150,0)');
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = og;
    ctx.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawTower(cam, p) {
    if (LOOK.felt && S.felt) { drawFeltTower(cam, p); return; }
    const L = S.L, tw = L.tw;
    setCam(cam, 1);
    const shade = 1 - smooth(clamp((p - 0.1) / 0.6, 0, 1));
    const fade = reduceMotion ? 0 : smooth(clamp((p - FADE[0]) / (FADE[1] - FADE[0]), 0, 1));
    const pat = stonePattern(cam.z, TOWER_STONE);
    const pw = tw * 0.62, pTop = L.topY - tw * 0.32, mh = tw * 0.3;

    // the far side of the parapet, seen through the gaps in the battlements
    if (shade > 0.001) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(L.cx - pw * 0.9, pTop - mh * 0.62, pw * 1.8, mh * 0.62 + 1);
      ctx.fillStyle = pat;
      ctx.fill();
      const bg = ctx.createLinearGradient(L.cx - pw, 0, L.cx + pw, 0);
      bg.addColorStop(0, 'rgba(40,26,16,.25)');
      bg.addColorStop(1, 'rgba(40,26,16,.6)');
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.restore();
    }

    ctx.fillStyle = pat;
    towerBody(); ctx.fill();
    parapet(); ctx.fill();
    if (fade > 0.001) {
      // the wall's own stones fade in, so the zoom lands exactly on the wall
      ctx.globalAlpha = fade;
      ctx.fillStyle = stonePattern(cam.z, 1);
      towerBody(); ctx.fill();
      parapet(); ctx.fill();
      ctx.globalAlpha = 1;
    }

    if (S.tint) {
      ctx.save();
      towerBody(); parapet(ctx, true); ctx.clip();
      ctx.globalCompositeOperation = 'soft-light';
      ctx.globalAlpha = 0.7;
      ctx.imageSmoothingEnabled = true;
      const top = L.topY - tw * 0.7;
      ctx.drawImage(S.tint, L.cx - tw * 0.7, top, tw * 1.4, L.baseY - top);
      ctx.restore();
    }

    if (shade > 0.001) {
      // light from the upper left falling on a round tower
      const litGradient = (hw) => {
        const g = ctx.createLinearGradient(L.cx - hw, 0, L.cx + hw, 0);
        for (let i = 0; i <= 12; i++) {
          const X = -1 + (2 * i) / 12;
          const th = Math.asin(clamp(X * 0.97, -1, 1));
          const lam = Math.max(0, -Math.sin(th) * 0.62 + Math.cos(th) * 0.78);
          const col = lam > 0.66
            ? `rgba(255,238,205,${(Math.min(0.3, (lam - 0.66) * 1.1) * shade).toFixed(3)})`
            : `rgba(26,16,9,${(Math.min(0.85, (0.66 - lam) * 1.35) * shade).toFixed(3)})`;
          g.addColorStop(i / 12, col);
        }
        return g;
      };
      ctx.fillStyle = litGradient(tw * 0.54);
      towerBody(); ctx.fill();
      ctx.fillStyle = litGradient(pw * 1.02);
      parapet(); ctx.fill();

      // rim light on the sunny edge, a dark edge on the shady one
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.save();
      ctx.beginPath(); ctx.rect(L.cx - tw * 2, pTop - tw, tw * 1.65, L.baseY); ctx.clip();
      towerBody(); parapet(ctx, true);
      ctx.strokeStyle = `rgba(255,236,200,${0.55 * shade})`;
      ctx.lineWidth = Math.max(0.6, tw * 0.012);
      ctx.stroke();
      ctx.restore();
      ctx.beginPath(); ctx.rect(L.cx + tw * 0.35, pTop - tw, tw * 2, L.baseY); ctx.clip();
      towerBody(); parapet(ctx, true);
      ctx.strokeStyle = `rgba(20,12,6,${0.5 * shade})`;
      ctx.lineWidth = Math.max(0.8, tw * 0.018);
      ctx.stroke();
      ctx.restore();

      // sunlit tops of the battlements and the corbels under the parapet
      const n = 4, a = (2 * pw) / (n + (n - 1) * 0.75), gap = a * 0.75;
      ctx.fillStyle = `rgba(255,240,210,${0.55 * shade})`;
      for (let i = 0, x = L.cx - pw; i < n; i++, x += a + gap) ctx.fillRect(x, pTop - mh, a, Math.max(0.6, tw * 0.025));
      ctx.save();
      parapet(); ctx.clip();
      ctx.fillStyle = `rgba(22,14,8,${0.3 * shade})`;
      for (let i = 0; i < 9; i++) {
        const x = L.cx - pw * 0.9 + (pw * 1.8 * (i + 0.5)) / 9;
        ctx.fillRect(x - tw * 0.012, L.topY + tw * 0.1, tw * 0.024, tw * 0.2);
      }
      ctx.restore();

      // shadow under the parapet
      ctx.save();
      towerBody(); ctx.clip();
      const sg = ctx.createLinearGradient(0, L.topY + tw * 0.25, 0, L.topY + tw * 0.8);
      sg.addColorStop(0, `rgba(20,14,9,${0.6 * shade})`);
      sg.addColorStop(1, 'rgba(20,14,9,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(L.cx - tw, L.topY + tw * 0.25, tw * 2, tw * 0.55);
      ctx.restore();

      // haze toward the ground
      const hg = ctx.createLinearGradient(0, L.groundY - tw * 2, 0, L.groundY);
      hg.addColorStop(0, 'rgba(60,50,35,0)');
      hg.addColorStop(1, `rgba(60,50,35,${0.35 * shade})`);
      ctx.fillStyle = hg;
      towerBody(); ctx.fill();
    }

    // arrow slit
    ctx.fillStyle = '#1b130d';
    const sw = tw * 0.07, sh = tw * 0.42;
    archPath(L.cx, L.slitY, sw, L.slitY + sh); ctx.fill();
    ctx.strokeStyle = 'rgba(214,202,180,.5)';
    ctx.lineWidth = tw * 0.03;
    ctx.stroke();

    // door at the foot of the tower
    const dw = tw * 0.36, dTop = L.groundY - tw * 0.62;
    archPath(L.cx, dTop, dw, L.groundY + tw * 0.2);
    ctx.fillStyle = '#4b3322'; ctx.fill();
    ctx.save(); ctx.clip();
    const ds = ctx.createLinearGradient(0, dTop, 0, dTop + dw * 0.8);
    ds.addColorStop(0, 'rgba(10,5,2,.6)');
    ds.addColorStop(1, 'rgba(10,5,2,0)');
    ctx.fillStyle = ds;
    ctx.fillRect(L.cx - dw, dTop, dw * 2, dw * 0.8);
    ctx.strokeStyle = 'rgba(20,12,6,.6)'; ctx.lineWidth = tw * 0.012;
    for (let i = 1; i < 4; i++) {
      const x = L.cx - dw / 2 + (dw / 4) * i;
      ctx.beginPath(); ctx.moveTo(x, dTop); ctx.lineTo(x, L.groundY + tw); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(30,24,20,.8)';
    ctx.fillRect(L.cx - dw / 2, dTop + tw * 0.22, dw * 0.6, tw * 0.035);
    ctx.fillRect(L.cx - dw / 2, dTop + tw * 0.45, dw * 0.6, tw * 0.035);
    ctx.restore();
    ctx.lineWidth = tw * 0.06;
    ctx.setLineDash([tw * 0.055, tw * 0.012]);
    ctx.strokeStyle = 'rgba(205,193,170,.8)';
    archPath(L.cx, dTop - tw * 0.03, dw + tw * 0.06, L.groundY + tw * 0.2); ctx.stroke();
    ctx.setLineDash([]);

    drawWindow();
  }

  function drawWindow() {
    const L = S.L, tw = L.tw;
    const f = flicker();
    const cx = L.cx, top = L.winTop, w = L.winW, bottom = L.winBottom;

    // interior
    archPath(cx, top, w, bottom);
    ctx.fillStyle = '#120b07';
    ctx.fill();
    const ig = ctx.createRadialGradient(cx, bottom, 0, cx, bottom, L.winH * 1.05);
    ig.addColorStop(0, `rgba(255,214,140,${clamp(0.95 * f, 0, 1)})`);
    ig.addColorStop(0.45, `rgba(214,130,60,${0.55 * f})`);
    ig.addColorStop(1, 'rgba(60,30,12,0)');
    ctx.fillStyle = ig;
    ctx.fill();
    // depth: the arch shades the top of the opening, and the inner right
    // jamb catches the light
    ctx.save();
    archPath(cx, top, w, bottom); ctx.clip();
    const ts = ctx.createLinearGradient(0, top, 0, top + w * 0.9);
    ts.addColorStop(0, 'rgba(8,4,2,.75)');
    ts.addColorStop(1, 'rgba(8,4,2,0)');
    ctx.fillStyle = ts;
    ctx.fillRect(cx - w, top, w * 2, w * 0.9);
    const jamb = ctx.createLinearGradient(cx + w * 0.5, 0, cx + w * 0.3, 0);
    jamb.addColorStop(0, 'rgba(214,184,140,.85)');
    jamb.addColorStop(1, 'rgba(150,110,70,0)');
    ctx.fillStyle = jamb;
    ctx.fillRect(cx + w * 0.3, top, w * 0.2, bottom - top);
    const lj = ctx.createLinearGradient(cx - w * 0.5, 0, cx - w * 0.36, 0);
    lj.addColorStop(0, 'rgba(0,0,0,.55)');
    lj.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lj;
    ctx.fillRect(cx - w * 0.5, top, w * 0.14, bottom - top);
    ctx.restore();

    // stone arch (voussoirs)
    ctx.lineWidth = tw * 0.085;
    ctx.setLineDash([tw * 0.07, tw * 0.014]);
    ctx.strokeStyle = 'rgba(220,208,186,.9)';
    archPath(cx, top - tw * 0.04, w + tw * 0.08, bottom);
    ctx.stroke();
    ctx.setLineDash([]);

    // sill
    ctx.fillStyle = '#cbbd9f';
    ctx.fillRect(cx - w * 0.75, bottom, w * 1.5, tw * 0.07);
    ctx.fillStyle = 'rgba(25,18,12,.45)';
    ctx.fillRect(cx - w * 0.75, bottom + tw * 0.07, w * 1.5, tw * 0.03);

    // glow spilling out of the window
    const gx = cx, gy = top + L.winH * 0.6, gr = tw * (1.9 + (f - 0.86) * 2);
    const og = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
    og.addColorStop(0, `rgba(255,214,150,${0.42 * f})`);
    og.addColorStop(1, 'rgba(255,214,150,0)');
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = og;
    ctx.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
    ctx.globalCompositeOperation = 'source-over';
  }

  function updateMotes(dt, p) {
    const L = S.L;
    const emitting = S.t < S.pulseUntil;
    const rate = emitting ? 26 : 3;
    if (p < 0.5 && Math.random() < rate * dt) {
      S.motes.push({
        x: L.cx + (Math.random() - 0.5) * L.winW * 0.6,
        y: L.winTop + L.winH * (0.4 + Math.random() * 0.5),
        vx: -(8 + Math.random() * 22), vy: -4 + Math.random() * 6,
        life: 0, max: 3 + Math.random() * 4, r: 0.6 + Math.random() * 1.4, ph: Math.random() * 6
      });
    }
    for (const m of S.motes) {
      m.life += dt;
      m.x += m.vx * dt;
      m.y += (m.vy + Math.sin(S.t * 1.7 + m.ph) * 6) * dt;
      m.vx *= 0.995;
    }
    S.motes = S.motes.filter((m) => m.life < m.max);
  }

  function drawMotes(cam, p) {
    if (!S.motes.length) return;
    setCam(cam, 1);
    const fade = 1 - clamp(p * 3, 0, 1);
    for (const m of S.motes) {
      const a = Math.sin((m.life / m.max) * Math.PI) * 0.85 * fade;
      if (a <= 0.01) continue;
      ctx.fillStyle = `rgba(255,226,160,${a})`;
      ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawGround(cam, p) {
    const { vw, L } = S;
    setCam(cam, 1);
    const base = L.groundY;
    ctx.beginPath();
    ctx.moveTo(-vw, base + S.vh * 3);
    const crest = (x) => groundCrest(L, x);
    const felt = LOOK.felt && S.felt;
    if (felt) {
      ctx.fillStyle = '#5c7a3a';
      ctx.fillRect(-vw, S.felt.groundBottom - 4, vw * 3.2, S.vh * 4);
      blit(S.felt.ground);
    } else {
      for (let x = -vw * 0.6; x <= vw * 1.6; x += 8) ctx.lineTo(x, crest(x));
      ctx.lineTo(vw * 1.6, base + S.vh * 3);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, base - 20, 0, base + S.vh * 0.1);
      g.addColorStop(0, '#71864f');
      g.addColorStop(1, '#556a3b');
      ctx.fillStyle = g;
      ctx.fill();
    }

    // the tower's shadow, cast down-right across the hill, and a dark contact line at its foot
    const shade = 1 - smooth(clamp((p - 0.1) / 0.6, 0, 1));
    if (shade > 0.001) {
      const tw = L.tw, hw = tw * 0.53, gy = crest(L.cx);
      // a long, soft shadow: a feathered ellipse stretched down the slope
      ctx.save();
      ctx.translate(L.cx + tw * 1.6, gy + tw * 0.16);
      ctx.transform(1, 0.07, 0, 1, 0, 0);
      ctx.scale(tw * 2.4, tw * 0.3);
      const sh = ctx.createRadialGradient(-0.35, 0, 0, -0.35, 0, 1.25);
      sh.addColorStop(0, `rgba(26,34,14,${0.42 * shade})`);
      sh.addColorStop(0.55, `rgba(26,34,14,${0.22 * shade})`);
      sh.addColorStop(1, 'rgba(26,34,14,0)');
      ctx.fillStyle = sh;
      ctx.beginPath(); ctx.ellipse(0, 0, 1.25, 1.25, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // where the stone meets the grass
      ctx.save();
      ctx.translate(L.cx, gy + 1);
      ctx.scale(hw * 1.5, hw * 0.28);
      const ao = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      ao.addColorStop(0, `rgba(20,24,10,${0.5 * shade})`);
      ao.addColorStop(1, 'rgba(20,24,10,0)');
      ctx.fillStyle = ao;
      ctx.beginPath(); ctx.ellipse(0, 0, 1, 1, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    if (felt) { blit(S.felt.ivy); return; }

    ctx.lineCap = 'round';
    ctx.lineWidth = 1.4;
    for (const t of L.tufts) {
      const y = crest(t.x) + 2;
      ctx.strokeStyle = '#4c6232';
      ctx.beginPath();
      ctx.moveTo(t.x, y); ctx.quadraticCurveTo(t.x + t.lean * 0.3, y - t.h * 0.6, t.x + t.lean, y - t.h);
      ctx.moveTo(t.x + 2, y); ctx.quadraticCurveTo(t.x + 2 - t.lean * 0.2, y - t.h * 0.5, t.x + 2 - t.lean * 0.6, y - t.h * 0.8);
      ctx.stroke();
      if (t.flower) {
        ctx.fillStyle = t.flower;
        ctx.beginPath(); ctx.arc(t.x + t.lean, y - t.h, 1.8, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function drawWallLight(p) {
    const { vw, vh, dpr } = S;
    const a = smooth(clamp((p - 0.35) / 0.65, 0, 1));
    if (a <= 0.001) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const r = Math.max(vw, vh);
    const g = ctx.createRadialGradient(vw / 2, vh * 0.42, r * 0.15, vw / 2, vh * 0.5, r * 0.8);
    g.addColorStop(0, 'rgba(255,226,180,0)');
    g.addColorStop(1, `rgba(16,11,7,${LOOK.vignette * a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, vw, vh);
    // a gentle dim so the cards on the wall stand out from the stone
    ctx.fillStyle = `rgba(32,22,14,${LOOK.calm * a})`;
    ctx.fillRect(0, 0, vw, vh);
    // a warm wash from above, like lamplight
    const w = ctx.createLinearGradient(0, 0, 0, vh);
    w.addColorStop(0, `rgba(255,214,160,${LOOK.wash * a})`);
    w.addColorStop(1, `rgba(20,14,9,${0.2 * a})`);
    ctx.fillStyle = w;
    ctx.fillRect(0, 0, vw, vh);
  }

  function drawWallFlat(alpha) {
    // reduced-motion: crossfade to the wall instead of zooming
    const { vw, vh, dpr } = S;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pat = S.patterns[0];
    pat.setTransform(new DOMMatrix([1 / S.tileDpr, 0, 0, 1 / S.tileDpr, 0, 0]));
    ctx.globalAlpha = alpha;
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, vw, vh);
    ctx.globalAlpha = 1;
  }

  function draw() {
    const p = S.p;
    const cam = camera(p);
    const covered = !reduceMotion && p > 0.985;

    if (!covered) {
      drawSky(cam);
      drawHills(cam);
    }
    drawTower(cam, p);
    if (!covered) {
      drawMotes(cam, p);
      drawGround(cam, p);
    }
    if (reduceMotion) drawWallFlat(smooth(clamp((p - 0.3) / 0.6, 0, 1)));
    drawWallLight(p);
    S.drawnP = p;
    S.dirty = false;
  }

  /* ---------- sandstone glints ---------- */

  // a four-pointed sparkle, drawn once and stamped wherever a grain catches the light
  const glintSprite = (() => {
    const c = document.createElement('canvas');
    const n = 64, h = n / 2;
    c.width = c.height = n;
    const x = c.getContext('2d');
    const core = x.createRadialGradient(h, h, 0, h, h, h * 0.45);
    core.addColorStop(0, 'rgba(255,255,250,1)');
    core.addColorStop(0.3, 'rgba(255,242,205,.7)');
    core.addColorStop(1, 'rgba(255,225,160,0)');
    x.fillStyle = core;
    x.fillRect(0, 0, n, n);
    for (const [w, l] of [[1.6, h], [1.1, h * 0.55]]) {
      for (const rot of l === h ? [0, Math.PI / 2] : [Math.PI / 4, -Math.PI / 4]) {
        x.save();
        x.translate(h, h); x.rotate(rot);
        const g = x.createLinearGradient(-l, 0, l, 0);
        g.addColorStop(0, 'rgba(255,240,200,0)');
        g.addColorStop(0.5, 'rgba(255,255,245,.95)');
        g.addColorStop(1, 'rgba(255,240,200,0)');
        x.fillStyle = g;
        x.fillRect(-l, -w / 2, l * 2, w);
        x.restore();
      }
    }
    return c;
  })();

  function drawGlints() {
    if (!gctx) return;
    const { vw, vh, dpr, L } = S;
    gctx.setTransform(1, 0, 0, 1, 0, 0);
    gctx.clearRect(0, 0, glintCanvas.width, glintCanvas.height);
    if (!LOOK.glints || reduceMotion || !S.sparkles || !S.sparkles.length) return;

    const p = S.p;
    const cam = camera(p);
    // screen px per tile px: the tower's bigger stones until they dissolve into the wall's
    const towerPhase = !reduceMotion && p < (FADE[0] + FADE[1]) / 2;
    const scale = (cam.z / L.Z) * (towerPhase ? TOWER_STONE : 1);
    const tileW = S.tileW * scale, tileH = S.tileH * scale;
    const covered = p > 0.985;

    gctx.save();
    if (!covered) {
      // only the tower's face sparkles while it stands in the landscape
      gctx.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * (cam.fx - L.F.x * cam.z), dpr * (cam.fy - L.F.y * cam.z));
      towerBody(gctx); parapet(gctx, true);
      gctx.clip();
      // nothing below the grass line
      gctx.beginPath();
      gctx.rect(L.cx - L.tw * 2, -S.vh * 4, L.tw * 4, L.groundY - L.tw * 0.3 + S.vh * 4);
      gctx.clip();
    }
    gctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // sunlight that slowly sweeps across the stone
    const sweep = ((S.t * 0.018) % 1.6 - 0.3) * vw;
    const sheenA = smooth(clamp((p - 0.5) / 0.5, 0, 1));
    if (sheenA > 0) {
      const sy = vh * (0.3 + 0.15 * Math.sin(S.t * 0.13));
      const r = Math.max(vw, vh) * 0.45;
      const g = gctx.createRadialGradient(sweep, sy, 0, sweep, sy, r);
      g.addColorStop(0, `rgba(255,226,170,${0.16 * sheenA})`);
      g.addColorStop(1, 'rgba(255,226,170,0)');
      gctx.fillStyle = g;
      gctx.fillRect(0, 0, vw, vh);
    }

    gctx.globalCompositeOperation = 'lighter';
    // when far away, show only some grains so the tower doesn't fizz
    const every = Math.max(2, Math.round(0.8 / Math.max(scale, 0.01)));
    const size = (11 + 24 * Math.min(1, scale)) * (L.narrow ? 0.85 : 1);
    const x0 = Math.floor(-cam.fx / tileW) - 1, x1 = Math.ceil((vw - cam.fx) / tileW);
    const y0 = Math.floor(-cam.fy / tileH) - 1, y1 = Math.ceil((vh - cam.fy) / tileH);
    const sw = Math.max(vw * 0.28, 160);
    // the window opening is a hole in the stone, so no glints there
    const wx0 = (L.cx - L.winW * 0.6 - L.F.x) * cam.z + cam.fx, wx1 = (L.cx + L.winW * 0.6 - L.F.x) * cam.z + cam.fx;
    const wy0 = (L.winTop - L.F.y) * cam.z + cam.fy, wy1 = (L.winBottom - L.F.y) * cam.z + cam.fy;
    const dx0 = (L.cx - L.tw * 0.25 - L.F.x) * cam.z + cam.fx, dx1 = (L.cx + L.tw * 0.25 - L.F.x) * cam.z + cam.fx;
    const dy0 = (L.groundY - L.tw * 0.7 - L.F.y) * cam.z + cam.fy;
    const list = S.sparkles;
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const bx = cam.fx + tx * tileW, by = cam.fy + ty * tileH;
        const start = (((tx * 7 + ty * 13) % every) + every) % every;
        for (let i = start; i < list.length; i += every) {
          const sp = list[i];
          const x = bx + sp.x * scale, y = by + sp.y * scale;
          if (x < -10 || y < -10 || x > vw + 10 || y > vh + 10) continue;
          if (!covered && x > wx0 && x < wx1 && y > wy0 && y < wy1) continue;
          if (!covered && x > dx0 && x < dx1 && y > dy0) continue;
          // slow, gentle twinkle: each grain flashes for about a second every few seconds
          const tw = Math.sin(S.t * sp.speed * 0.9 + sp.ph + tx * 1.7 + ty * 2.3);
          if (tw < 0.9) continue;
          const light = 0.3 + 0.7 * Math.exp(-Math.pow((x - sweep) / sw, 2));
          const a = Math.pow((tw - 0.9) / 0.1, 1.5) * light;
          if (a < 0.03) continue;
          const d = size * sp.size * (0.5 + a * 0.6);
          gctx.globalAlpha = Math.min(1, a * 1.1);
          gctx.drawImage(glintSprite, x - d / 2, y - d / 2, d, d);
        }
      }
    }
    gctx.globalAlpha = 1;
    gctx.globalCompositeOperation = 'source-over';
    gctx.restore();
  }

  // keep the browser's own background (seen during overscroll and behind
  // mobile toolbars) matching whatever is at the edge of the scene
  let lastPhase = '';
  function syncChrome(p) {
    const phase = p < 0.45 ? 'hero' : 'wall';
    if (phase === lastPhase) return;
    lastPhase = phase;
    const c = phase === 'hero' ? LOOK.sky : (S.wallAvg || LOOK.wall);
    root.style.backgroundColor = c;
    document.body.style.backgroundColor = c;
    // what shows if the browser ever reveals a sliver below the scene
    root.style.setProperty('--edge', phase === 'hero' ? LOOK.ground : (S.wallAvg || LOOK.wall));
    if (themeMeta) themeMeta.setAttribute('content', phase === 'hero' ? LOOK.sky : LOOK.wall);
  }

  /* ---------- loop ---------- */

  function readScroll() {
    S.target = clamp(window.scrollY / S.zoomEnd, 0, 1);
  }

  let last = performance.now();
  let lastCssP = -1;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    S.t += dt;
    readScroll();

    if (reduceMotion) S.p = S.target;
    else {
      S.p += (S.target - S.p) * (1 - Math.exp(-dt * 9));
      if (Math.abs(S.target - S.p) < 0.0005) S.p = S.target;
    }

    const live = S.p < 0.6; // window flicker, clouds and motes only matter while the tower is visible
    if (live) updateMotes(dt, S.p);
    if (live || S.dirty || S.p !== S.drawnP) draw();
    drawGlints();
    syncChrome(S.p);

    const cssP = Math.round(S.p * 1000) / 1000;
    if (cssP !== lastCssP) {
      root.style.setProperty('--p', cssP);
      lastCssP = cssP;
    }
    requestAnimationFrame(frame);
  }

  let resizeTimer = 0, lastW = 0, lastH = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      // ignore the small height changes from mobile browser toolbars
      const h = canvas.clientHeight;
      if (window.innerWidth === lastW && Math.abs(h - lastH) < 120) {
        S.zoomEnd = Math.max(1, hero ? hero.offsetHeight - window.innerHeight : S.vh);
        return;
      }
      lastW = window.innerWidth; lastH = h;
      resize();
    }, 120);
  });

  resize();
  lastW = window.innerWidth; lastH = canvas.clientHeight;
  readScroll();
  S.p = S.target;
  draw();
  requestAnimationFrame(frame);

  window.HavenScene = {
    // where the tower window sits on screen, for the title animation
    windowPoint() {
      const L = S.L, cam = camera(S.p);
      return {
        x: (L.cx - L.F.x) * cam.z + cam.fx,
        y: (L.winTop + L.winH * 0.6 - L.F.y) * cam.z + cam.fy
      };
    },
    pulse(ms) { S.pulseUntil = S.t + ms / 1000; },
    progress() { return S.p; },
    zoomEnd() { return S.zoomEnd; }
  };
})();
