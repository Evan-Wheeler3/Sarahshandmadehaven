/* The hero scene: a misty sky, a tall stone tower with a glowing window,
   and a scroll-driven zoom that dives into the tower until its stones
   become the wall behind the rest of the site. */
(function () {
  'use strict';

  const canvas = document.getElementById('scene');
  const hero = document.getElementById('top');
  if (!canvas || !canvas.getContext || !window.HavenStone) return;

  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  const S = {
    dpr: 1, vw: 0, vh: 0, L: null,
    mips: [], patterns: [], tileSize: 0,
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
  }

  function buildTexture() {
    const size = Math.round(clamp(S.vw * 0.6, 520, 900));
    if (size === S.tileSize && S.mips.length) return;
    S.tileSize = size;
    const base = window.HavenStone.makeTile(size, S.dpr, 1871);
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
    const want = z / L.Z; // device px per base-tile px
    let i = Math.floor(Math.log2(1 / Math.max(want, 1e-4)));
    i = clamp(i, 0, S.patterns.length - 1);
    const pat = S.patterns[i];
    const k = (S.mips[0].width / S.mips[i].width) / (L.Z * S.dpr);
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

  function towerBody() {
    const L = S.L;
    const hwT = L.tw * 0.47, hwB = L.tw * 0.53;
    ctx.beginPath();
    ctx.moveTo(L.cx - hwT, L.topY);
    ctx.lineTo(L.cx + hwT, L.topY);
    ctx.lineTo(L.cx + hwB, L.baseY);
    ctx.lineTo(L.cx - hwB, L.baseY);
    ctx.closePath();
  }

  function parapet() {
    const L = S.L, tw = L.tw, cx = L.cx, top = L.topY;
    const pw = tw * 0.62, hwT = tw * 0.47;
    const pTop = top - tw * 0.32, mh = tw * 0.3;
    const n = 4, a = (2 * pw) / (n + (n - 1) * 0.75), gap = a * 0.75;
    ctx.beginPath();
    ctx.moveTo(cx - hwT, top + tw * 0.32);
    ctx.lineTo(cx - pw, top + tw * 0.08);
    ctx.lineTo(cx - pw, pTop - mh);
    let x = cx - pw;
    for (let i = 0; i < n; i++) {
      x += a;
      ctx.lineTo(x, pTop - mh);
      if (i < n - 1) {
        ctx.lineTo(x, pTop);
        x += gap;
        ctx.lineTo(x, pTop);
        ctx.lineTo(x, pTop - mh);
      }
    }
    ctx.lineTo(cx + pw, top + tw * 0.08);
    ctx.lineTo(cx + hwT, top + tw * 0.32);
    ctx.closePath();
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
    g.addColorStop(1, `rgba(16,11,7,${0.62 * a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, vw, vh);
    // a warm wash from above, like lamplight
    const w = ctx.createLinearGradient(0, 0, 0, vh);
    w.addColorStop(0, `rgba(255,214,160,${0.1 * a})`);
    w.addColorStop(1, `rgba(20,14,9,${0.2 * a})`);
    ctx.fillStyle = w;
    ctx.fillRect(0, 0, vw, vh);
  }

  function drawWallFlat(alpha) {
    // reduced-motion: crossfade to the wall instead of zooming
    const { vw, vh, dpr } = S;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pat = S.patterns[0];
    pat.setTransform(new DOMMatrix([1 / dpr, 0, 0, 1 / dpr, 0, 0]));
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
