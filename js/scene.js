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
  // ?tower=grey shows the original grey stone; sandstone is the default
  const STYLE = new URLSearchParams(location.search).get('tower') === 'grey' ? 'grey' : 'sandstone';
  const LOOK = {
    grey: { vignette: 0.62, wash: 0.1, ground: '#556a3b', wall: '#3d362f', sky: '#bfd0cf', glints: false },
    sandstone: { vignette: 0.5, wash: 0.16, ground: '#556a3b', wall: '#6b5238', sky: '#bfd0cf', glints: true }
  }[STYLE];
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

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
    S.tint = makeTint();
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
    S.tileH = Math.round(w * (wide ? 2.4 : 4.5));
    S.tileDpr = wide ? Math.min(S.dpr, 1.5) : S.dpr;
    const rowH = wide ? clamp(S.vw * 0.055, 60, 84) : 50;
    const base = window.HavenStone.makeTile(S.tileW, S.tileH, S.tileDpr, 1871, STYLE, rowH);
    S.sparkles = base.sparkles || [];
    S.mips = window.HavenStone.makeMips(base);
    S.patterns = S.mips.map((c) => ctx.createPattern(c, 'repeat'));
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

  function stonePattern(z) {
    const L = S.L;
    const want = (z / L.Z) * (S.dpr / S.tileDpr); // device px per base-tile px
    let i = Math.floor(Math.log2(1 / Math.max(want, 1e-4)));
    i = clamp(i, 0, S.patterns.length - 1);
    const pat = S.patterns[i];
    const k = (S.mips[0].width / S.mips[i].width) / (L.Z * S.tileDpr);
    pat.setTransform(new DOMMatrix([k, 0, 0, k, L.F.x, L.F.y]));
    return pat;
  }

  /* ---------- painting ---------- */

  function drawSky(cam) {
    const { vw, vh, dpr, L } = S;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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

  function towerBody(c = ctx) {
    const L = S.L;
    const hwT = L.tw * 0.47, hwB = L.tw * 0.53;
    c.beginPath();
    c.moveTo(L.cx - hwT, L.topY);
    c.lineTo(L.cx + hwT, L.topY);
    c.lineTo(L.cx + hwB, L.baseY);
    c.lineTo(L.cx - hwB, L.baseY);
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

  function drawTower(cam, p) {
    const L = S.L, tw = L.tw;
    setCam(cam, 1);
    const pat = stonePattern(cam.z);

    ctx.fillStyle = pat;
    towerBody(); ctx.fill();
    parapet(); ctx.fill();

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

    // cylindrical shading — fades away as we get close
    const shade = 1 - smooth(clamp((p - 0.1) / 0.6, 0, 1));
    if (shade > 0.001) {
      const pw = tw * 0.62;
      const g = ctx.createLinearGradient(L.cx - pw, 0, L.cx + pw, 0);
      g.addColorStop(0, `rgba(30,22,15,${0.55 * shade})`);
      g.addColorStop(0.2, `rgba(255,240,215,${0.16 * shade})`);
      g.addColorStop(0.42, `rgba(255,240,215,${0.06 * shade})`);
      g.addColorStop(0.72, `rgba(30,22,15,${0.22 * shade})`);
      g.addColorStop(1, `rgba(30,22,15,${0.7 * shade})`);
      ctx.fillStyle = g;
      towerBody(); ctx.fill();
      parapet(); ctx.fill();

      // shadow under the parapet
      ctx.save();
      towerBody(); ctx.clip();
      const sg = ctx.createLinearGradient(0, L.topY + tw * 0.25, 0, L.topY + tw * 0.75);
      sg.addColorStop(0, `rgba(20,14,9,${0.5 * shade})`);
      sg.addColorStop(1, 'rgba(20,14,9,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(L.cx - tw, L.topY + tw * 0.25, tw * 2, tw * 0.5);
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

  function drawGround(cam) {
    const { vw, L } = S;
    setCam(cam, 1);
    const base = L.groundY;
    ctx.beginPath();
    ctx.moveTo(-vw, base + S.vh * 3);
    const crest = (x) => base - L.tw * 0.15 * Math.exp(-Math.pow((x - L.cx) / (L.tw * 2.5), 2)) + Math.sin(x * 0.009 + 2) * S.vh * 0.012;
    for (let x = -vw * 0.6; x <= vw * 1.6; x += 8) ctx.lineTo(x, crest(x));
    ctx.lineTo(vw * 1.6, base + S.vh * 3);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, base - 20, 0, base + S.vh * 0.1);
    g.addColorStop(0, '#71864f');
    g.addColorStop(1, '#556a3b');
    ctx.fillStyle = g;
    ctx.fill();

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
      drawGround(cam);
    }
    if (reduceMotion) drawWallFlat(smooth(clamp((p - 0.3) / 0.6, 0, 1)));
    drawWallLight(p);
    S.drawnP = p;
    S.dirty = false;
  }

  /* ---------- sandstone glints ---------- */

  // a four-pointed sparkle, drawn once and stamped wherever a grain catches the light
  const sprite = (() => {
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
    const scale = cam.z / L.Z;           // screen px per tile px
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
          gctx.drawImage(sprite, x - d / 2, y - d / 2, d, d);
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
    const c = phase === 'hero' ? LOOK.sky : LOOK.wall;
    root.style.backgroundColor = c;
    document.body.style.backgroundColor = c;
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
