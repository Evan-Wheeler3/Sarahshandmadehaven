/* The send animation: the letter rolls into a scroll, is tied with twine
   and sealed with wax, and a carrier pigeon lands, grabs it and flies off.

   Everything after the roll-up happens on a fixed SVG stage and is driven
   frame by frame from one loop. The pigeon is a jointed rig (shoulder,
   wrist, individual feathers, tail fan, legs, head) posed procedurally,
   so its flight can blend smoothly between flapping, gliding, landing,
   perching and take-off. Tap anywhere to skip. */
(function () {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1); // 0..1 progress of t within [a, b]
  const ease = {
    inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    inOutQ: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    out: (t) => 1 - Math.pow(1 - t, 3),
    in: (t) => t * t * t,
    sine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    outBack: (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
  };
  const bump = (t) => Math.sin(Math.PI * clamp(t, 0, 1)); // 0 → 1 → 0

  function el(name, attrs, parent) {
    const e = document.createElementNS(NS, name);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  const f1 = (n) => (Math.round(n * 10) / 10).toString();
  const f3 = (n) => (Math.round(n * 1000) / 1000).toString();

  function bezier(p0, p1, p2, p3, u) {
    const v = 1 - u;
    return [
      v * v * v * p0[0] + 3 * v * v * u * p1[0] + 3 * v * u * u * p2[0] + u * u * u * p3[0],
      v * v * v * p0[1] + 3 * v * v * u * p1[1] + 3 * v * u * u * p2[1] + u * u * u * p3[1]
    ];
  }

  /* ---------- shapes ---------- */

  // A feather pointing up (−y) from its quill at the origin; a, b crop it to a band.
  function featherD(len, w, a = 0, b = 1) {
    const N = 8, L = [], R = [];
    for (let i = 0; i <= N; i++) {
      const f = a + ((b - a) * i) / N;
      const hw = w * (0.3 + 0.75 * f - 0.95 * f * f);
      L.push([-hw, -len * f]);
      R.push([hw * 0.92, -len * f]);
    }
    let d = `M${f1(L[0][0])} ${f1(L[0][1])}`;
    for (let i = 1; i <= N; i++) d += `L${f1(L[i][0])} ${f1(L[i][1])}`;
    if (b >= 1) d += `L0 ${f1(-len * 1.04)}`;
    for (let i = N; i >= 0; i--) d += `L${f1(R[i][0])} ${f1(R[i][1])}`;
    return d + 'Z';
  }

  const BODY_D = 'M-84 -4C-86 -36 -58 -54 -18 -52C24 -50 68 -36 102 -12C112 -4 110 8 96 13C58 26 8 44 -38 40C-68 37 -82 22 -84 -4Z';
  const BELLY_D = 'M-70 22C-40 40 10 40 60 22C30 36 -20 46 -70 22Z';
  const BREAST_D = 'M-84 -4C-84 -28 -70 -42 -50 -44C-38 -20 -38 10 -48 36C-70 32 -82 18 -84 -4Z';
  const NECK_D = 'M-82 -6C-88 -34 -82 -60 -68 -72L-42 -70C-42 -52 -38 -36 -26 -26C-42 -14 -62 -6 -82 -6Z';
  const ARM_D = 'M-8 8C-20 -14 -18 -48 -6 -74C2 -84 16 -80 22 -66C30 -46 34 -22 30 0C26 12 2 16 -8 8Z';
  const ARM_DETAIL_D = 'M-4 -18q12 5 26 0M-6 -36q12 5 28 0M-4 -54q10 4 22 0';
  const ALULA_D = 'M-10 6C-16 -10 -12 -30 -2 -40C8 -32 12 -12 8 6Z';
  const SHOULDER = [-22, -34];
  const WRIST = [4, -70];
  const HIPS = [[4, 30], [19, 33]];
  const PRIM_LEN = [86, 92, 92, 89, 86, 82, 78, 74, 70, 66];

  /* ---------- the pigeon rig ---------- */

  function buildWing(parent, kind) {
    const g = el('g', { class: `pg-wing pg-wing--${kind}` }, parent);
    const secs = [];
    for (let i = 7; i >= 0; i--) {
      const fg = el('g', null, g);
      el('path', { d: featherD(56, 19), class: 'f-sec' }, fg);
      el('path', { d: featherD(56, 19, 0.4, 0.5), class: 'f-bar' }, fg);
      el('path', { d: featherD(56, 19, 0.64, 0.74), class: 'f-bar' }, fg);
      secs[i] = { g: fg, x: 12 + i * 0.4, y: -6 - i * 8.4 };
    }
    const hand = el('g', null, g);
    const prims = [];
    for (let j = 9; j >= 0; j--) {
      const fg = el('g', null, hand);
      const len = PRIM_LEN[j];
      el('path', { d: featherD(len, 16), class: 'f-prim' }, fg);
      el('path', { d: featherD(len, 16, 0.56, 1), class: 'f-tip' }, fg);
      el('path', { d: `M0 -4L0 ${f1(-len * 0.93)}`, class: 'f-rachis' }, fg);
      prims[j] = { g: fg, base: -12 + j * 7, x: 1 + j * 0.9, y: -3 - j * 1.4 };
    }
    el('path', { d: ALULA_D, class: 'f-cov' }, hand);
    // the rounded leading edge of the outermost feather: a wing has thickness
    el('path', { d: `M-3 -2C-6 -30 -5 -62 -1 ${f1(-PRIM_LEN[0] * 0.98)}`, class: 'f-edge' }, prims[0].g);
    el('path', { d: ARM_D, class: 'f-cov' }, g);
    el('path', { d: ARM_DETAIL_D, class: 'f-detail' }, g);
    // ...and of the arm, so the wing never vanishes to a hairline edge-on
    el('path', { d: 'M-4 6C-16 -14 -16 -48 -6 -74C-2 -79 2 -80 6 -78', class: 'f-edge' }, g);
    return { g, secs, hand, prims, under: false };
  }

  function buildTail(parent) {
    const g = el('g', { class: 'pg-tail' }, parent);
    const feathers = [];
    for (const k of [0, 8, 1, 7, 2, 6, 3, 5, 4]) {
      const fg = el('g', null, g);
      el('path', { d: featherD(76, 22), class: 'f-tail' }, fg);
      el('path', { d: featherD(76, 22, 0.76, 1), class: 'f-tailtip' }, fg);
      feathers.push({ g: fg, k });
    }
    return { g, feathers };
  }

  function buildPigeon(parent) {
    const root = el('g', { class: 'pg' }, parent);
    const far = buildWing(root, 'far');
    const tail = buildTail(root);
    const legs = HIPS.map(() => el('path', { class: 'pg-leg' }, root));
    el('path', { d: BODY_D, fill: 'url(#pg-body)', class: 'pg-outline' }, root);
    el('path', { d: BREAST_D, fill: 'url(#pg-breast)' }, root);
    el('path', { d: BELLY_D, fill: 'rgba(255,255,255,.18)' }, root);
    const head = el('g', null, root);
    const neck = el('path', { d: NECK_D, fill: 'url(#pg-neck)', class: 'pg-outline' }, head);
    el('ellipse', { cx: -60, cy: -84, rx: 19.5, ry: 16.5, fill: 'url(#pg-head)', class: 'pg-outline' }, head);
    el('path', { d: 'M-78 -89L-101 -82.5Q-97 -79 -78 -78Z', fill: '#3f3838' }, head);
    el('ellipse', { cx: -79, cy: -88.5, rx: 5.2, ry: 3.3, fill: '#efece4' }, head);
    el('circle', { cx: -66, cy: -89, r: 4.6, fill: '#e98a2c' }, head);
    el('circle', { cx: -66.4, cy: -89, r: 2.2, fill: '#141414' }, head);
    el('circle', { cx: -67.6, cy: -90.4, r: 0.95, fill: '#fff' }, head);
    const lid = el('ellipse', { cx: -66, cy: -89, rx: 5.4, ry: 5.4, fill: '#9ba4b5' }, head);
    const near = buildWing(root, 'near');
    return { root, far, near, tail, legs, head, neck, lid };
  }

  // The powerful downstroke takes longer than the quick recovery upstroke.
  function strokePhase(ph) {
    const d = 0.58;
    return ph < d ? (0.5 * ph) / d : 0.5 + (0.5 * (ph - d)) / (1 - d);
  }

  function wingPose(P) {
    const q = strokePhase(P.ph);
    const s = Math.sin(TAU * q), c = Math.cos(TAU * q);
    const up0 = Math.max(0, -s);
    const up = up0 * up0 * (3 - 2 * up0);           // eased strength of the upstroke
    const a = P.amp;
    // elevation of the wing above horizontal, in degrees: up at the top of
    // the stroke, down at the bottom, held in a shallow V when gliding
    const lift = (c + 1) / 2;
    let beta = lerp(28, lerp(-48, 78, lift), a);
    beta = lerp(beta, lerp(10, 82, lift), P.hLift || 0);   // braking: beats stay high
    let sweep = P.sweepBase - 18 * s * a;           // forward on the downstroke
    let fold = P.foldBase + 64 * up * a;            // wrist folds back on the upstroke
    let spread = 1 - 0.62 * up * a;                 // feathers fan on the way down, close on the way up
    let secA = 104 - 26 * up * a;
    const t = P.tuck;                               // blend toward folded at rest
    sweep = lerp(sweep, 98, t);
    fold = lerp(fold, 18, t);
    spread = lerp(spread, 0.1, t);
    secA = lerp(secA, 12, t);
    return { beta, tuck: t, sweep, fold, spread, secA };
  }

  // The bird is seen from the side and a little above. A wing at elevation
  // beta points partly toward the camera (near wing) or away from it (far
  // wing): that sets how high it appears, how big it looks, and which of its
  // surfaces faces us.
  const VIEW = (20 * Math.PI) / 180;
  function poseWing(w, p, kind) {
    const far = kind === 'far';
    const b = (p.beta * Math.PI) / 180;
    const toward = far ? -Math.cos(b) : Math.cos(b);           // + when the wingtip comes toward us
    let h = Math.sin(b) * Math.cos(VIEW) - toward * Math.sin(VIEW);
    let k = (far ? 0.86 : 1) * (1 + 0.16 * toward);
    h = lerp(h, 1, p.tuck);
    k = lerp(k, far ? 0.9 : 1, p.tuck);
    let hk = h * k;
    if (Math.abs(hk) < 0.03) hk = hk < 0 ? -0.03 : 0.03;
    const sx = SHOULDER[0] + (far ? 14 : 0), sy = SHOULDER[1] - (far ? 8 : 0);
    w.g.setAttribute('transform', `translate(${sx} ${sy}) scale(${f3(k)} ${f3(hk)}) rotate(${f1(p.sweep)})`);
    // a raised near wing shows its pale underside, a lowered one its top with
    // the wing bars; the far wing shows its top when raised
    const under = p.tuck < 0.5 && (far ? h < 0 : h > 0.05);
    if (under !== w.under) { w.under = under; w.g.classList.toggle('is-under', under); }
    w.hand.setAttribute('transform', `translate(${WRIST[0]} ${WRIST[1]}) rotate(${f1(p.fold)})`);
    for (const pr of w.prims) pr.g.setAttribute('transform', `translate(${f1(pr.x)} ${f1(pr.y)}) rotate(${f1(pr.base * p.spread)})`);
    w.secs.forEach((sc, i) => sc.g.setAttribute('transform', `translate(${f1(sc.x)} ${f1(sc.y)}) rotate(${f1(p.secA - i * 2)})`));
  }

  function legPath(hip, ext, grip, crouch) {
    const ang = (lerp(80, -8, ext) * Math.PI) / 180;
    const len = lerp(14, 23, ext) * (1 - crouch * 0.3);
    const ax = hip[0] + Math.sin(ang) * len, ay = hip[1] + Math.cos(ang) * len;
    const toe = (dir, l, curl) => {
      const a = ((dir + curl) * Math.PI) / 180;
      const mx = ax + Math.cos(a) * l * 0.55, my = ay + Math.sin(a) * l * 0.55;
      const a2 = a + (curl * 0.9 * Math.PI) / 180;
      return `M${f1(ax)} ${f1(ay)}Q${f1(mx)} ${f1(my)} ${f1(mx + Math.cos(a2) * l * 0.5)} ${f1(my + Math.sin(a2) * l * 0.5)}`;
    };
    const curl = lerp(8, 62, grip);
    return `M${f1(hip[0])} ${f1(hip[1])}L${f1(ax)} ${f1(ay)}` +
      toe(180 - 12, 14, -curl) + toe(180, 15, -curl) + toe(180 + 14, 13, -curl) + toe(8, 9, curl);
  }

  /* ---------- the scroll ---------- */

  function blobD(R, n, rnd) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const r = R * (0.9 + rnd() * 0.18);
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    let d = '';
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      d += (i ? '' : `M${f1((pts[n - 1][0] + p[0]) / 2)} ${f1((pts[n - 1][1] + p[1]) / 2)}`) + `Q${f1(p[0])} ${f1(p[1])} ${f1(m[0])} ${f1(m[1])}`;
    }
    return d + 'Z';
  }

  function buildScroll(parent) {
    const g = el('g', { class: 'sc' }, parent);
    // the paper darkening as it curls into the roll (only while rolling)
    const lip = el('rect', { fill: 'url(#sc-lip)', opacity: 0 }, g);
    // Seen from slightly to the left: the spiral face shows on the left end
    // only, and the right end is just the rounded outside of the roll.
    const farEnd = el('ellipse', { fill: 'url(#sc-body)' }, g);
    const body = el('rect', { fill: 'url(#sc-body)' }, g);
    const clip = el('clipPath', { id: 'sc-clip' }, g);
    const clipRect = el('rect', null, clip);
    const skinWrap = el('g', { 'clip-path': 'url(#sc-clip)' }, g);
    const skin = el('g', null, skinWrap);
    // faint lines of writing on the paper, three bands deep so they can turn with the roll
    const inkRnd = (window.HavenStone && window.HavenStone.mulberry32(9)) || Math.random;
    for (let band = -1; band <= 1; band++) {
      for (let i = 0; i < 14; i++) {
        const x = -92 + inkRnd() * 170, y = -14 + inkRnd() * 28 + band * 44, w = 6 + inkRnd() * 22;
        el('path', { d: `M${f1(x)} ${f1(y)}h${f1(w)}`, class: 'sc-ink' }, skin);
      }
    }
    el('path', { d: 'M-100 -9C-50 -11 50 -6 100 -10', class: 'sc-edge' }, skin);
    const shine = el('rect', { fill: 'url(#sc-shine)' }, g);
    const end = el('g', null, g);
    el('ellipse', { cx: 0, cy: 0, rx: 0.36, ry: 1, class: 'sc-cap' }, end);
    el('path', { d: spiralD(), class: 'sc-spiral' }, end);
    const twine = el('g', null, g);
    const wraps = ['M-11 -23C-9 -10 -7 10 -4 23', 'M3 -23C5 -10 7 10 10 23'].map((d) =>
      el('path', { d, class: 'sc-twine', pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-dashoffset': 1 }, twine));
    const tails = [0, 1].map(() => el('path', { class: 'sc-twine sc-twine--tail', opacity: 0 }, twine));
    const wax = el('g', { class: 'sc-wax', opacity: 0 }, g);
    const rnd = (window.HavenStone && window.HavenStone.mulberry32(5)) || Math.random;
    const drips = el('g', null, wax);
    el('path', { d: 'M-8 12q-2 9 1 13q4 -2 3 -13z', fill: '#8e3a2b' }, drips);
    el('path', { d: 'M7 13q1 6 4 8q2 -3 -1 -9z', fill: '#8e3a2b' }, drips);
    const blob = el('path', { d: blobD(17, 13, rnd), fill: 'url(#sc-wax)' }, wax);
    const emboss = el('g', { opacity: 0 }, wax);
    el('circle', { r: 11.5, fill: 'none', stroke: 'rgba(70,15,8,.45)', 'stroke-width': 1.6 }, emboss);
    el('circle', { r: 11.5, cy: 0.9, fill: 'none', stroke: 'rgba(255,190,170,.35)', 'stroke-width': 0.8 }, emboss);
    el('text', { y: 6.2, 'text-anchor': 'middle', class: 'sc-mono sc-mono--hi' }, emboss).textContent = 'S';
    el('text', { y: 5.4, 'text-anchor': 'middle', class: 'sc-mono' }, emboss).textContent = 'S';
    return { g, lip, farEnd, body, clipRect, skin, shine, end, twine, wraps, tails, wax, drips, blob, emboss };
  }

  function spiralD() {
    let d = '';
    for (let i = 0; i <= 60; i++) {
      const a = (i / 60) * TAU * 3.2;
      const r = 0.92 * (1 - i / 66);
      d += `${i ? 'L' : 'M'}${f3(Math.cos(a) * r * 0.36)} ${f3(Math.sin(a) * r)}`;
    }
    return d;
  }

  function buildStamp(parent) {
    const g = el('g', { class: 'stamp', opacity: 0 }, parent);
    el('ellipse', { cx: 0, cy: -46, rx: 15, ry: 22, fill: 'url(#st-wood)' }, g);
    el('ellipse', { cx: -5, cy: -54, rx: 4, ry: 8, fill: 'rgba(255,230,200,.25)' }, g);
    el('rect', { x: -7, y: -28, width: 14, height: 18, rx: 3, fill: 'url(#st-brass)' }, g);
    el('rect', { x: -16, y: -12, width: 32, height: 12, rx: 3.5, fill: 'url(#st-brass)' }, g);
    el('rect', { x: -16, y: -3, width: 32, height: 3, rx: 1.5, fill: 'rgba(60,40,10,.35)' }, g);
    return g;
  }

  /* ---------- the stage ---------- */

  const DEFS = `
    <defs>
      <linearGradient id="pg-body" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#b6bfcd"/><stop offset=".55" stop-color="#9aa3b4"/><stop offset="1" stop-color="#848da0"/>
      </linearGradient>
      <radialGradient id="pg-breast" cx=".25" cy=".45" r=".8">
        <stop offset="0" stop-color="#c7b6c9" stop-opacity=".95"/><stop offset="1" stop-color="#9aa3b4" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="pg-neck" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#5fa585" data-n="0"/><stop offset=".5" stop-color="#8a6fb0" data-n="1"/><stop offset="1" stop-color="#97a0b2"/>
      </linearGradient>
      <radialGradient id="pg-head" cx=".4" cy=".35" r=".75">
        <stop offset="0" stop-color="#aeb6c5"/><stop offset="1" stop-color="#8790a2"/>
      </radialGradient>
      <linearGradient id="sc-body" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#a98d5f"/><stop offset=".16" stop-color="#e2d2ae"/><stop offset=".4" stop-color="#fffaf0"/>
        <stop offset=".6" stop-color="#f1e4c7"/><stop offset=".86" stop-color="#c4a879"/><stop offset="1" stop-color="#977b50"/>
      </linearGradient>
      <linearGradient id="sc-lip" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#46301a" stop-opacity="0"/><stop offset=".55" stop-color="#46301a" stop-opacity=".14"/>
        <stop offset=".75" stop-color="#46301a" stop-opacity=".32"/><stop offset=".76" stop-color="#46301a" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="sc-shine" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".3" stop-color="#fff" stop-opacity=".35"/>
        <stop offset=".38" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0"/>
      </linearGradient>
      <radialGradient id="sc-wax" cx=".36" cy=".3" r=".8">
        <stop offset="0" stop-color="#e08870"/><stop offset=".45" stop-color="#a94f3b"/><stop offset="1" stop-color="#5e2218"/>
      </radialGradient>
      <linearGradient id="st-brass" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#7d5a1c"/><stop offset=".35" stop-color="#f3d48a"/><stop offset=".6" stop-color="#c39a45"/><stop offset="1" stop-color="#6e4e16"/>
      </linearGradient>
      <linearGradient id="st-wood" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#4a2d17"/><stop offset=".4" stop-color="#9a6a3e"/><stop offset="1" stop-color="#3f2613"/>
      </linearGradient>
      <filter id="pg-shadow" x="-60%" y="-60%" width="220%" height="220%">
        <feDropShadow dx="20" dy="30" stdDeviation="7" flood-color="#1b1008" flood-opacity=".3"/>
      </filter>
    </defs>`;

  const SPARK_D = 'M0 -7L1.3 -1.3L7 0L1.3 1.3L0 7L-1.3 1.3L-7 0L-1.3 -1.3Z';
  const DOWN_D = featherD(24, 10);

  async function play(form) {
    if (!form.animate) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const narrow = vw < 600;

    // ---- stage + engine ----
    const stage = document.createElement('div');
    stage.className = 'post-stage';
    stage.innerHTML = `<svg viewBox="0 0 ${vw} ${vh}" width="${vw}" height="${vh}" aria-hidden="true">${DEFS}<g class="post-shadowed" filter="url(#pg-shadow)"></g><g class="post-fx"></g></svg>
      <p class="post-skip">tap to skip</p>`;
    document.body.appendChild(stage);
    const svg = stage.querySelector('svg');
    const layer = svg.querySelector('.post-shadowed');
    const fx = svg.querySelector('.post-fx');
    const shadowFx = svg.querySelector('feDropShadow');
    const neckStops = svg.querySelectorAll('#pg-neck stop[data-n]');

    let aborted = false;
    const skip = () => { aborted = true; };
    stage.addEventListener('pointerdown', skip);
    const skipHint = setTimeout(() => stage.classList.add('show-skip'), 1400);

    const tasks = [];
    let now = performance.now(), dt = 0, clock = 0, rafId = 0;
    const anim = (ms, fn) => new Promise((resolve) => {
      if (aborted) { resolve(); return; }
      tasks.push({ t0: clock, ms, fn, resolve });
    });
    const wait = (ms) => anim(ms, () => {});

    // ---- actors ----
    const S = {
      x: 0, y: 0, len: 200, T: 34, rot: 0, s: 1, squash: 0, visible: false, spin: 0, lip: 0,
      carried: false, theta: 0, omega: 0, swing: 0, tie: 0, tails: 0, wax: 0, emboss: 0, drip: 0
    };
    const scroll = buildScroll(layer);
    scroll.g.style.display = 'none';
    const stamp = buildStamp(fx);
    const pig = buildPigeon(layer);
    pig.root.style.display = 'none';

    const sLand = clamp(vw / 1050, 0.72, 1.3);
    const P = {
      x: 0, y: 0, s: sLand, pitch: 0, ph: 0, freq: 6.5, amp: 1, tuck: 0, sweepBase: 0, foldBase: 0,
      tailFan: 0, tailTilt: 0, ext: 0, grip: 1, crouch: 0, hx: 0, hy: 0, tilt: 0, blink: 0, puff: 0,
      lift: 1, visible: false, pitchFromVel: 0
    };
    const particles = [];

    function footPoint() {
      // midpoint of the two feet, in screen space
      const ang = (lerp(80, -8, P.ext) * Math.PI) / 180;
      const len = lerp(14, 23, P.ext) * (1 - P.crouch * 0.3);
      const lx = (HIPS[0][0] + HIPS[1][0]) / 2 + Math.sin(ang) * len - 4;
      const ly = (HIPS[0][1] + HIPS[1][1]) / 2 + Math.cos(ang) * len + 4 + P.bob;
      const a = (P.pitch * Math.PI) / 180;
      return [P.x + (lx * Math.cos(a) - ly * Math.sin(a)) * P.s, P.y + (lx * Math.sin(a) + ly * Math.cos(a)) * P.s];
    }

    function renderPigeon() {
      if (!P.visible) return;
      P.ph = (P.ph + dt * P.freq) % 1;
      P.bob = -P.amp * (1 - P.tuck) * 6 * Math.sin(TAU * (strokePhase(P.ph) - 0.12)) + P.crouch * 9;
      pig.root.setAttribute('transform', `translate(${f1(P.x)} ${f1(P.y)}) rotate(${f1(P.pitch)}) scale(${f3(P.s)}) translate(0 ${f1(P.bob)})`);
      const wp = wingPose(P);
      poseWing(pig.near, wp, 'near');
      const P2 = Object.assign({}, P, { ph: (P.ph + 0.97) % 1 });
      poseWing(pig.far, wingPose(P2), 'far');
      const tt = P.tailTilt + 5 * Math.sin(TAU * P.ph) * P.amp * (1 - P.tuck);
      pig.tail.g.setAttribute('transform', `translate(98 4) rotate(${f1(tt)})`);
      const spread = lerp(2.2, 9.5, P.tailFan);
      for (const f of pig.tail.feathers) f.g.setAttribute('transform', `rotate(${f1(90 + (f.k - 4) * spread)})`);
      pig.legs.forEach((leg, i) => leg.setAttribute('d', legPath(HIPS[i], P.ext, P.grip, P.crouch)));
      const hy = P.hy - P.bob * 0.75;
      pig.head.setAttribute('transform', `translate(${f1(P.hx)} ${f1(hy)}) rotate(${f1(P.tilt)} -46 -40)`);
      pig.neck.setAttribute('transform', `translate(-50 -30) scale(${f3(1 + P.puff * 0.16)} ${f3(1 + P.puff * 0.1)}) translate(50 30)`);
      pig.lid.setAttribute('transform', `translate(-66 -89) scale(1 ${f3(clamp(P.blink, 0.001, 1))}) translate(66 89)`);
      // iridescent neck shimmer
      const sh = 0.5 + 0.5 * Math.sin(clock * 0.0021 + P.tilt * 0.08 + P.puff * 2);
      neckStops[0].setAttribute('stop-color', `hsl(${150 + sh * 40} 32% ${44 + sh * 8}%)`);
      neckStops[1].setAttribute('stop-color', `hsl(${270 + sh * 30} 30% ${48 + (1 - sh) * 8}%)`);
    }

    let lastFoot = null, lastFootV = [0, 0];
    function renderScroll() {
      if (!S.visible) return;
      if (S.carried) {
        // hangs from the feet and swings like a pendulum
        const fp = footPoint();
        if (lastFoot && dt > 0) {
          const v = [(fp[0] - lastFoot[0]) / dt, (fp[1] - lastFoot[1]) / dt];
          const ax = (v[0] - lastFootV[0]) / dt, ay = (v[1] - lastFootV[1]) / dt;
          lastFootV = v;
          const Lp = 46, G = 1900 + ay * 0.2;
          const alpha = -(G / Lp) * Math.sin(S.theta) - 3.2 * S.omega - (clamp(ax, -6000, 6000) / Lp) * Math.cos(S.theta);
          S.omega += alpha * dt;
          S.theta = clamp(S.theta + S.omega * dt, -0.9, 0.9);
        }
        lastFoot = fp;
        S.s = P.s / sLand;
        const d = (S.T / 2) * S.s * 0.95;
        S.x = fp[0] - Math.sin(S.theta) * d;
        S.y = fp[1] + Math.cos(S.theta) * d;
        S.rot = (S.theta * 180) / Math.PI * 0.85;
      }
      S.swing += (S.theta * 1.6 - S.swing) * Math.min(1, dt * 6);
      const T = S.T, L = S.len;
      scroll.g.setAttribute('transform', `translate(${f1(S.x)} ${f1(S.y)}) rotate(${f1(S.rot)}) scale(${f3(S.s * (1 + S.squash * 0.06))} ${f3(S.s * (1 - S.squash * 0.08))})`);
      for (const r of [scroll.body, scroll.clipRect, scroll.shine]) {
        r.setAttribute('x', f1(-L / 2));
        r.setAttribute('y', f1(-T / 2));
        r.setAttribute('width', f1(L));
        r.setAttribute('height', f1(T));
      }
      scroll.farEnd.setAttribute('cx', f1(L / 2));
      scroll.farEnd.setAttribute('rx', f1(T * 0.18));
      scroll.farEnd.setAttribute('ry', f1(T / 2));
      const spin = ((S.spin % 44) + 44) % 44 - 22;
      scroll.skin.setAttribute('transform', `scale(${f3(L / 200)} ${f3(T / 44)}) translate(0 ${f1(-spin)})`);
      scroll.lip.setAttribute('opacity', f3(S.lip));
      if (S.lip > 0.01) {
        scroll.lip.setAttribute('x', f1(-L / 2 + T * 0.35));
        scroll.lip.setAttribute('width', f1(Math.max(0, L - T * 0.7)));
        scroll.lip.setAttribute('y', f1(-T / 2 - T * 0.9));
        scroll.lip.setAttribute('height', f1(T * 1.2));
      }
      scroll.end.setAttribute('transform', `translate(${f1(-L / 2)} 0) scale(${f1(T / 2)})`);
      const k = T / 44;
      scroll.twine.setAttribute('transform', `scale(${f3(k)})`);
      scroll.wraps.forEach((w, i) => w.setAttribute('stroke-dashoffset', f3(1 - clamp(S.tie * 2 - i, 0, 1))));
      scroll.tails.forEach((t, i) => {
        const x0 = i ? 9 : -4, len = 16 * S.tails;
        const a = S.swing + (i ? 0.25 : -0.2);
        const ex = x0 - Math.sin(a) * len, ey = 22 + Math.cos(a) * len;
        t.setAttribute('d', `M${x0} 22Q${f1(x0 + (i ? 3 : -3))} ${f1(22 + len * 0.5)} ${f1(ex)} ${f1(ey)}`);
        t.setAttribute('opacity', S.tails > 0.02 ? 1 : 0);
      });
      scroll.wax.setAttribute('opacity', S.wax > 0.01 ? 1 : 0);
      scroll.wax.setAttribute('transform', `scale(${f3(k)}) scale(${f3(S.wax * (1 + S.squash * 0.25))} ${f3(S.wax * (1 - S.squash * 0.18))})`);
      scroll.drips.setAttribute('transform', `scale(1 ${f3(S.drip)})`);
      scroll.emboss.setAttribute('opacity', f3(S.emboss));
    }

    function spawn(kind, x, y, opts = {}) {
      let node;
      if (kind === 'spark') node = el('path', { d: SPARK_D, class: 'fx-spark' }, fx);
      else if (kind === 'speck') node = el('circle', { r: 1.6 + Math.random() * 1.6, class: 'fx-speck' }, fx);
      else node = el('path', { d: DOWN_D, class: 'fx-down' }, fx);
      particles.push(Object.assign({
        node, kind, x, y, vx: 0, vy: 0, rot: Math.random() * 360, vr: (Math.random() - 0.5) * 200,
        life: 0, max: 1, ph: Math.random() * 6, scale: 1
      }, opts));
    }

    function renderParticles() {
      for (const p of particles) {
        p.life += dt;
        const t = p.life / p.max;
        if (p.kind === 'down') {
          // drifts like a real feather: falls slowly, sways and flips
          p.vy = lerp(p.vy, 46, dt * 1.6);
          p.vx *= 1 - dt * 2.2;
          p.x += (p.vx + Math.sin(p.life * 3 + p.ph) * 34) * dt;
          p.y += p.vy * dt;
          p.rot = Math.sin(p.life * 3 + p.ph) * 40 + 20;
          const flip = Math.cos(p.life * 2.2 + p.ph);
          p.node.setAttribute('transform', `translate(${f1(p.x)} ${f1(p.y)}) rotate(${f1(p.rot)}) scale(${f3(flip * p.scale)} ${f3(p.scale)})`);
          p.node.setAttribute('opacity', f3(Math.min(1, (1 - t) * 3)));
        } else {
          p.vy += (p.kind === 'speck' ? 900 : 0) * dt;
          p.vx *= 1 - dt * (p.kind === 'spark' ? 3 : 0.5);
          p.vy *= p.kind === 'spark' ? 1 - dt * 3 : 1;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.rot += p.vr * dt;
          const sc = p.kind === 'spark' ? p.scale * bump(t) : p.scale;
          p.node.setAttribute('transform', `translate(${f1(p.x)} ${f1(p.y)}) rotate(${f1(p.rot)}) scale(${f3(Math.max(0.001, sc))})`);
          p.node.setAttribute('opacity', f3(p.kind === 'spark' ? 1 : 1 - t));
        }
      }
      for (let i = particles.length - 1; i >= 0; i--) {
        if (particles[i].life >= particles[i].max) { particles[i].node.remove(); particles.splice(i, 1); }
      }
    }

    function loop(t) {
      dt = Math.min(0.05, (t - now) / 1000);
      now = t;
      clock += dt * 1000;
      for (let i = 0; i < tasks.length; i++) {
        const k = tasks[i];
        const p = aborted ? 1 : Math.min(1, (clock - k.t0) / k.ms);
        k.fn(p);
        if (p >= 1) { tasks.splice(i--, 1); k.resolve(); }
      }
      if (!aborted) {
        renderScroll();
        renderPigeon();
        renderParticles();
        const lift = P.visible ? P.lift : 0.15;
        shadowFx.setAttribute('dx', f1((6 + 18 * lift) * (narrow ? 0.7 : 1)));
        shadowFx.setAttribute('dy', f1((8 + 30 * lift) * (narrow ? 0.7 : 1)));
        shadowFx.setAttribute('stdDeviation', f1(2.5 + 7 * lift));
      }
      rafId = requestAnimationFrame(loop);
    }
    rafId = requestAnimationFrame((t) => { now = t; loop(t); });

    try {
      await sequence();
    } finally {
      cancelAnimationFrame(rafId);
      clearTimeout(skipHint);
      tasks.splice(0).forEach((k) => k.resolve());
      stage.remove();
      form.style.clipPath = 'inset(0 0 100% 0)';
    }

    /* ======================= the story ======================= */

    async function sequence() {
      /* 1. the letter rolls up from the bottom; the page follows the roll */
      // The letter sits at a slight tilt, so the roll follows the letter's own
      // (tilted) edge rather than a level line, and leans to match it.
      const r0 = form.getBoundingClientRect();
      const W = form.offsetWidth, Hh = form.offsetHeight;
      const m = new DOMMatrixReadOnly(getComputedStyle(form).transform);
      const tilt = Math.atan2(m.b, m.a);
      const pcx = r0.left + r0.width / 2 + window.scrollX, pcy = r0.top + r0.height / 2 + window.scrollY;
      const rollStart = window.scrollY;
      Object.assign(S, { visible: true, len: W, T: 14, lip: 1, spin: 0, rot: (tilt * 180) / Math.PI });
      scroll.g.style.display = '';
      const place = (e) => {
        const ly = Hh / 2 - Hh * e;                    // roll line, in the letter's own frame from its centre
        const x = pcx - Math.sin(tilt) * ly, y = pcy + Math.cos(tilt) * ly;
        form.style.clipPath = `inset(0 0 ${(e * 100).toFixed(2)}% 0)`;
        const want = Math.min(rollStart, y - vh * 0.55);
        if (want < window.scrollY) window.scrollTo({ top: Math.max(0, want), behavior: 'instant' });
        S.T = lerp(14, 36, Math.sqrt(e));
        S.x = x - window.scrollX;
        S.y = y - window.scrollY;
        S.spin = Hh * e * 0.55;   // the paper's surface turns as it rolls
      };
      place(0);
      await anim(narrow ? 1350 : 1150, (t) => place(ease.inOutQ(t)));
      if (aborted) return;

      /* 2. it lifts off the wall, shrinks into a scroll and floats to the middle */
      const cx = vw / 2, cy = vh * (narrow ? 0.64 : 0.62);
      const L1 = narrow ? 170 : 220, T1 = narrow ? 40 : 46;
      const from = { x: S.x, y: S.y, len: S.len, T: S.T, rot: S.rot };
      await anim(700, (t) => {
        const e = ease.inOut(t);
        S.lip = 1 - ease.out(Math.min(1, t * 3));
        S.len = lerp(from.len, L1, ease.out(Math.min(1, t * 1.3)));
        S.T = lerp(from.T, T1, e);
        S.x = lerp(from.x, cx, e);
        S.y = lerp(from.y, cy, e) - bump(t) * 50;
        S.rot = from.rot * (1 - e) + Math.sin(t * Math.PI * 2) * 7 * (1 - t);
      });
      S.rot = 0;
      await anim(160, (t) => { S.squash = bump(t) * 0.6; });

      /* 3. twine wraps round it */
      await anim(420, (t) => { S.tie = ease.inOut(t); });
      await anim(180, (t) => { S.tails = ease.outBack(t); });

      /* 4. a blob of wax, then the brass seal stamp presses into it */
      await anim(240, (t) => { S.wax = ease.outBack(t); S.drip = ease.out(seg(t, 0.4, 1)); });
      const sealY = S.y;
      stamp.setAttribute('opacity', 1);
      const stampSize = narrow ? 1.25 : 1.6;
      const stampAt = (y, sc, rot) => stamp.setAttribute('transform', `translate(${f1(cx)} ${f1(y)}) rotate(${f1(rot)}) scale(${f3(sc * stampSize)})`);
      await anim(300, (t) => {
        const e = ease.in(t);
        stampAt(lerp(sealY - 190, sealY + 2, e), lerp(1.35, 0.95, e) * (narrow ? 0.85 : 1), lerp(-14, 0, e));
        stamp.setAttribute('opacity', f3(Math.min(1, t * 3)));
      });
      await anim(110, (t) => { S.squash = ease.out(t); stampAt(sealY + 2 + 3 * t, 0.95 * (narrow ? 0.85 : 1), 0); });
      S.emboss = 1;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU + Math.random() * 0.3;
        const sp = 140 + Math.random() * 160;
        spawn('spark', cx, sealY, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, max: 0.55 + Math.random() * 0.3, scale: 0.6 + Math.random() * 0.8 });
      }
      for (let i = 0; i < 5; i++) {
        spawn('speck', cx + (Math.random() - 0.5) * 20, sealY, { vx: (Math.random() - 0.5) * 260, vy: -120 - Math.random() * 160, max: 0.7 });
      }
      await anim(300, (t) => {
        const e = ease.out(t);
        S.squash = 1 - ease.out(t) * 0.75;
        stampAt(lerp(sealY + 5, sealY - 210, e), lerp(0.95, 1.4, e) * (narrow ? 0.85 : 1), lerp(0, 10, e));
        stamp.setAttribute('opacity', f3(1 - seg(t, 0.5, 1)));
      });
      await anim(120, (t) => { S.squash = 0.25 * (1 - t); });
      if (aborted) return;

      /* 5. the pigeon swoops in from the upper right and lands on the scroll */
      const s = sLand;
      const T = S.T;
      const tx = cx - 6 * s, ty = cy - T / 2 - 55 * s;
      const P0 = [vw + 240 * s, vh * 0.1], P1 = [vw * 0.86, vh * 0.78];
      const P2 = [tx + 260 * s, ty + 30], P3 = [tx, ty - 34];
      Object.assign(P, { visible: true, x: P0[0], y: P0[1], s: s * 0.45, ph: 0.1, freq: 3.2, amp: 1, tuck: 0, ext: 0, grip: 1, lift: 1 });
      pig.root.style.display = '';
      let prev = P0.slice();
      await anim(1600, (t) => {
        const u = 1 - Math.pow(1 - t, 2.1);
        const [x, y] = bezier(P0, P1, P2, P3, u);
        const vx = x - prev[0], vy = y - prev[1];
        prev = [x, y];
        P.x = x; P.y = y;
        P.s = s * lerp(0.45, 1, ease.out(t));
        const sp = Math.hypot(vx, vy) || 1;
        const velPitch = clamp((-Math.asin(clamp(vy / sp, -1, 1)) * 180) / Math.PI * 0.55, -30, 30);
        const flare = ease.inOut(seg(t, 0.68, 1));
        P.pitch = lerp(velPitch, 26, flare);
        const glide = bump(seg(t, 0.3, 0.7));
        P.amp = lerp(1, 0.12, glide);
        P.freq = lerp(lerp(3.2, 2.6, glide), 4.2, flare);
        P.sweepBase = -10 * flare;
        P.hLift = 0.75 * flare;
        P.tailFan = flare;
        P.tailTilt = -14 * flare;
        P.ext = ease.out(seg(t, 0.72, 1));
        P.grip = lerp(1, 0.15, seg(t, 0.72, 0.9));
        P.hx = -4 * flare;
      });
      // touchdown
      for (let i = 0; i < 2; i++) spawn('down', P.x + 20 * s, P.y + 20 * s, { vx: 60 + Math.random() * 40, vy: -40, max: 2.6, scale: s * 0.8 });
      await anim(440, (t) => {
        P.y = lerp(ty - 34, ty, ease.out(seg(t, 0, 0.45)));
        P.crouch = bump(seg(t, 0.25, 1)) * 0.9;
        P.pitch = lerp(26, 0, ease.out(seg(t, 0.2, 0.8)));
        P.amp = 1 - ease.out(seg(t, 0, 0.45));
        P.freq = lerp(4.2, 3, t);
        P.tuck = ease.inOut(seg(t, 0.3, 1));
        P.sweepBase = lerp(-10, 0, t);
        P.hLift = lerp(0.75, 0, seg(t, 0, 0.4));
        P.tailFan = lerp(1, 0.2, t);
        P.tailTilt = lerp(-14, 6, ease.out(t)) * (1 - seg(t, 0.7, 1));
        P.grip = lerp(0.15, 1, seg(t, 0.3, 0.6));
        P.hx = lerp(-4, 0, t);
        P.lift = lerp(1, 0.18, ease.out(t));
        S.squash = bump(seg(t, 0.35, 0.8)) * 0.7;
      });
      P.amp = 0;

      /* 6. a brief pause on the scroll: a head bob, a glance and a blink */
      await anim(650, (t) => {
        const bob = bump(seg(t, 0.02, 0.38));
        P.hx = -7 * bob;
        P.hy = 2 * bob;
        P.tilt = -10 * bump(seg(t, 0.32, 0.98));
        P.blink = bump(seg(t, 0.55, 0.68));
        P.tailFan = 0.2 + 0.4 * bump(seg(t, 0.4, 0.6));
      });

      /* 7. crouch, raise the wings, and leap away carrying the scroll */
      await anim(200, (t) => {
        P.crouch = ease.out(t);
        P.pitch = 8 * ease.out(t);
        P.hy = 4 * t;
        P.tuck = 1 - 0.3 * t;
      });
      P.ph = 0; P.freq = 0; P.amp = 1;
      await anim(150, (t) => { P.tuck = 0.7 * (1 - ease.out(t)); P.tailFan = 0.6 * t; });
      P.tuck = 0;
      P.freq = 4.4;
      S.carried = true; lastFoot = null; lastFootV = [0, 0]; S.theta = 0; S.omega = 0;
      for (let i = 0; i < 5; i++) {
        spawn('down', P.x + (Math.random() * 60 - 10) * s, P.y + (Math.random() * 30 + 10) * s, {
          vx: (Math.random() - 0.3) * 160, vy: -60 - Math.random() * 60, max: 3 + Math.random(), scale: s * (0.6 + Math.random() * 0.5)
        });
      }
      const L0 = [P.x, P.y];
      const Q1 = [P.x - 60 * s, P.y - 190 * s], Q2 = [vw * 0.4, vh * 0.2], Q3 = [-380 * s, vh * 0.04];
      prev = L0.slice();
      await anim(2000, (t) => {
        const u = Math.pow(t, 1.45);
        const [x, y] = bezier(L0, Q1, Q2, Q3, u);
        const vx = x - prev[0], vy = y - prev[1];
        prev = [x, y];
        P.x = x; P.y = y;
        const sp = Math.hypot(vx, vy) || 1;
        const velPitch = clamp((-Math.asin(clamp(vy / sp, -1, 1)) * 180) / Math.PI * 0.45, -30, 30);
        P.pitch = lerp(8, velPitch, ease.out(seg(t, 0, 0.25)));
        P.crouch = 1 - ease.out(seg(t, 0, 0.12));
        P.hy = 4 * (1 - seg(t, 0, 0.2));
        P.freq = lerp(4.4, 3.4, seg(t, 0.3, 1));
        P.tailFan = lerp(0.6, 0.1, seg(t, 0.1, 0.5));
        P.tailTilt = lerp(-8, 0, seg(t, 0, 0.5));
        P.s = s * lerp(1, 0.42, ease.inOut(seg(t, 0.2, 1)));
        P.lift = lerp(0.18, 1, ease.out(seg(t, 0, 0.3)));
      });
    }
  }

  window.HavenPost = { play };
})();
