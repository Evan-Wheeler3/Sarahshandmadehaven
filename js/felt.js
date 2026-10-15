/* Felt-and-stitch painting helpers.

   Everything here is drawn once into canvases (when the page loads or the
   screen changes size) and then reused, so the felt look costs nothing per
   frame. A "piece" is a closed polygon of felt: heathered colour, a matted
   fibre surface, stray fibres fuzzing past its cut edge, a puffed edge and
   a shadow on whatever it sits on, plus optional hand-sewn stitching. */
(function () {
  'use strict';

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const shade = (c, k) => c.map((v) => Math.max(0, Math.min(255, Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k)))));

  /* ---------- fibre grain: a tile of short, curly, light and dark fibres ---------- */

  const grainCache = {};
  function grain(size = 160, seed = 7, strength = 1) {
    const key = size + ':' + seed + ':' + strength;
    if (grainCache[key]) return grainCache[key];
    const rnd = mulberry32(seed);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d');
    x.lineCap = 'round';
    const n = size * size * 0.16;
    for (const [col, a] of [['20,12,4', 0.085 * strength], ['255,250,238', 0.085 * strength]]) {
      x.strokeStyle = `rgba(${col},${a})`;
      x.lineWidth = 0.6;
      x.beginPath();
      for (let i = 0; i < n / 2; i++) {
        const px = rnd() * size, py = rnd() * size;
        const ang = rnd() * Math.PI * 2, len = 1 + rnd() * 2.6, bend = (rnd() - 0.5) * 1.6;
        const ex = px + Math.cos(ang) * len, ey = py + Math.sin(ang) * len;
        // draw wrapped so the tile repeats seamlessly
        for (const ox of [0, -size, size]) {
          for (const oy of [0, -size, size]) {
            if (Math.max(px, ex) + ox < -2 || Math.min(px, ex) + ox > size + 2) continue;
            if (Math.max(py, ey) + oy < -2 || Math.min(py, ey) + oy > size + 2) continue;
            x.moveTo(px + ox, py + oy);
            x.quadraticCurveTo((px + ex) / 2 + ox - Math.sin(ang) * bend, (py + ey) / 2 + oy + Math.cos(ang) * bend, ex + ox, ey + oy);
          }
        }
      }
      x.stroke();
    }
    // fine speckle
    for (let i = 0; i < size * size * 0.12; i++) {
      x.fillStyle = rnd() < 0.5 ? `rgba(20,12,4,${0.07 * strength})` : `rgba(255,250,238,${0.07 * strength})`;
      x.fillRect(rnd() * size, rnd() * size, 1, 1);
    }
    grainCache[key] = c;
    return c;
  }

  /* ---------- geometry ---------- */

  function polyPath(ctx, pts, ox = 0, oy = 0) {
    ctx.moveTo(pts[0][0] + ox, pts[0][1] + oy);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] + ox, pts[i][1] + oy);
    ctx.closePath();
  }

  // Signed area > 0 means clockwise in screen coordinates.
  function area(pts) {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return a / 2;
  }

  // Move every point of a closed polygon inward by d (negative d: outward).
  function inset(pts, d) {
    const n = pts.length, sgn = area(pts) > 0 ? 1 : -1, out = [];
    for (let i = 0; i < n; i++) {
      const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n];
      const t1x = b[0] - a[0], t1y = b[1] - a[1], t2x = c[0] - b[0], t2y = c[1] - b[1];
      const l1 = Math.hypot(t1x, t1y) || 1, l2 = Math.hypot(t2x, t2y) || 1;
      let nx = -(t1y / l1 + t2y / l2), ny = t1x / l1 + t2x / l2;
      const nl = Math.hypot(nx, ny) || 1;
      nx /= nl; ny /= nl;
      out.push([b[0] + nx * d * sgn, b[1] + ny * d * sgn]);
    }
    return out;
  }

  // Resample a closed polygon so its points are about `step` apart.
  function resample(pts, step) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const k = Math.max(1, Math.round(len / step));
      for (let j = 0; j < k; j++) out.push([a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k]);
    }
    return out;
  }

  // A rounded, slightly wonky hand-cut quad.
  function cutQuad(x, y, w, h, rnd, wob = 0.18, round = 0.32) {
    const j = () => (rnd() - 0.5) * Math.min(w, h) * wob;
    const p = [[x + j(), y + j()], [x + w + j(), y + j()], [x + w + j(), y + h + j()], [x + j(), y + h + j()]];
    const r = Math.min(w, h) * round, out = [];
    for (let i = 0; i < 4; i++) {
      const c = p[i], nx = p[(i + 1) % 4], pv = p[(i + 3) % 4];
      const da = Math.hypot(pv[0] - c[0], pv[1] - c[1]), db = Math.hypot(nx[0] - c[0], nx[1] - c[1]);
      const a = [c[0] + ((pv[0] - c[0]) * r) / da, c[1] + ((pv[1] - c[1]) * r) / da];
      const b = [c[0] + ((nx[0] - c[0]) * r) / db, c[1] + ((nx[1] - c[1]) * r) / db];
      for (let k = 0; k <= 5; k++) {
        const t = k / 5, u = 1 - t;
        out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
      }
    }
    return out;
  }

  function ellipsePts(cx, cy, rx, ry, n = 36, rot = 0, rnd = null, wob = 0) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, r = 1 + (rnd ? (rnd() - 0.5) * wob : 0);
      const x = Math.cos(a) * rx * r, y = Math.sin(a) * ry * r;
      out.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
    }
    return out;
  }

  // Sample an SVG path string into polygon points (uses a detached SVG path).
  let probe = null;
  function samplePath(d, step = 1.5) {
    if (!probe) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', 0); svg.setAttribute('height', 0);
      svg.style.position = 'absolute';
      probe = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      svg.appendChild(probe);
      document.body.appendChild(svg);
    }
    probe.setAttribute('d', d);
    const L = probe.getTotalLength(), out = [];
    for (let s = 0; s < L; s += step) { const p = probe.getPointAtLength(s); out.push([p.x, p.y]); }
    return out;
  }

  /* ---------- thread ---------- */

  // Hand-sewn thread along an open or closed polyline: a shadow where the
  // thread dips into the felt, then the thread itself, slightly wobbly.
  function thread(ctx, pts, color, opts = {}) {
    const { width = 2, dash = [7, 5], closed = false, rnd = Math.random, shadow = 0.45 } = opts;
    if (pts.length < 2) return;
    const wob = width * 0.35;
    const path = pts.map((p) => [p[0] + (rnd() - 0.5) * wob, p[1] + (rnd() - 0.5) * wob]);
    const trace = (ox, oy) => {
      ctx.beginPath();
      ctx.moveTo(path[0][0] + ox, path[0][1] + oy);
      for (let i = 1; i < path.length; i++) ctx.lineTo(path[i][0] + ox, path[i][1] + oy);
      if (closed) ctx.closePath();
    };
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash(dash);
    ctx.lineWidth = width;
    ctx.strokeStyle = `rgba(20,10,2,${shadow})`;
    trace(width * 0.45, width * 0.6); ctx.stroke();
    ctx.strokeStyle = color;
    trace(0, 0); ctx.stroke();
    ctx.lineWidth = width * 0.35;
    ctx.strokeStyle = 'rgba(255,255,255,.28)';
    trace(-width * 0.15, -width * 0.2); ctx.stroke();
    ctx.restore();
  }

  // Blanket stitch: a running line just inside the edge with little ticks out to it.
  function blanket(ctx, pts, color, opts = {}) {
    const { width = 2, every = 10, depth = 7, rnd = Math.random } = opts;
    const inner = inset(pts, depth);
    const pts2 = resample(inner, every);
    const outer = inset(pts2, -depth);
    thread(ctx, pts2, color, { width, dash: [], closed: true, rnd });
    ctx.save();
    for (let i = 0; i < pts2.length; i++) {
      thread(ctx, [pts2[i], outer[i]], color, { width, dash: [], rnd });
    }
    ctx.restore();
  }

  /* ---------- a felt piece ---------- */

  function piece(ctx, pts, color, opts = {}) {
    const {
      rnd = Math.random, scale = 1, shadowAlpha = 0.4, fuzz = 1, puff = 1, heather = 1, grainAlpha = 1,
      stitch = null, stitchWidth = 2 * scale, stitchInset = 6 * scale, stitchDash = [7 * scale, 5 * scale]
    } = opts;
    const col = hexToRgb(color);
    const bb = pts.reduce((b, p) => [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])], [1e9, 1e9, -1e9, -1e9]);
    const bw = bb[2] - bb[0], bh = bb[3] - bb[1];

    // shadow on whatever is underneath
    if (shadowAlpha > 0) {
      ctx.beginPath(); polyPath(ctx, pts, 2.6 * scale, 3.6 * scale);
      ctx.fillStyle = `rgba(22,12,4,${shadowAlpha * 0.45})`; ctx.fill();
      ctx.beginPath(); polyPath(ctx, pts, 1.3 * scale, 1.8 * scale);
      ctx.fillStyle = `rgba(22,12,4,${shadowAlpha * 0.55})`; ctx.fill();
    }

    // stray fibres past the cut edge: a soft halo of short, tangled fibres
    if (fuzz > 0) {
      const edge = resample(pts, 1.5 * scale);
      const out = inset(edge, -1);
      ctx.save();
      ctx.lineCap = 'round';
      ctx.beginPath(); polyPath(ctx, inset(pts, -1.2 * scale));
      ctx.lineWidth = 2.2 * scale;
      ctx.strokeStyle = rgba(col, 0.28 * fuzz);
      ctx.stroke();
      for (const [cl, a] of [[shade(col, -0.08), 0.6], [shade(col, 0.08), 0.5]]) {
        ctx.strokeStyle = rgba(cl, a * fuzz);
        ctx.lineWidth = 0.6 * scale;
        ctx.beginPath();
        for (let i = 0; i < edge.length; i++) {
          const p = edge[i], q = out[i];
          const nx = q[0] - p[0], ny = q[1] - p[1];
          const off = (rnd() * 2.2 - 0.6) * scale;            // start just inside or outside the edge
          const sx = p[0] + nx * off, sy = p[1] + ny * off;
          const ang = Math.atan2(ny, nx) + (rnd() - 0.5) * 2.6;  // mostly outward, but tangled
          const len = (0.8 + rnd() * 1.9) * scale;
          ctx.moveTo(sx, sy);
          ctx.quadraticCurveTo(sx + Math.cos(ang + 0.6) * len * 0.5, sy + Math.sin(ang + 0.6) * len * 0.5, sx + Math.cos(ang) * len, sy + Math.sin(ang) * len);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    // the felt itself
    ctx.beginPath(); polyPath(ctx, pts);
    ctx.fillStyle = color;
    ctx.fill();

    ctx.save();
    ctx.beginPath(); polyPath(ctx, pts); ctx.clip();

    // heathered colour: soft lighter and darker patches
    if (heather > 0) {
      const n = 3 + Math.floor(rnd() * 4);
      for (let i = 0; i < n; i++) {
        const hx = bb[0] + rnd() * bw, hy = bb[1] + rnd() * bh, r = Math.max(bw, bh) * (0.25 + rnd() * 0.4);
        const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, r);
        const lighter = rnd() < 0.5;
        g.addColorStop(0, lighter ? `rgba(255,248,232,${0.12 * heather})` : `rgba(40,20,6,${0.1 * heather})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(hx - r, hy - r, r * 2, r * 2);
      }
    }

    // matted fibre surface
    if (grainAlpha > 0) {
      const pat = ctx.createPattern(grain(160, 7), 'repeat');
      if (pat.setTransform) pat.setTransform(new DOMMatrix([scale, 0, 0, scale, rnd() * 160, rnd() * 160]));
      ctx.globalAlpha = grainAlpha;
      ctx.fillStyle = pat;
      ctx.fillRect(bb[0] - 2, bb[1] - 2, bw + 4, bh + 4);
      ctx.globalAlpha = 1;
    }

    // puffed edge: a soft inner shadow low-right and a soft inner light
    // high-left, so the piece looks stuffed rather than bevelled
    if (puff > 0) {
      const rim = Math.min(bw, bh, 40 * scale) * 0.22;
      // only a margin around the piece matters (the blur reach), so keep it tight
      const m = rim * 3 + 4;
      const hole = (dx, dy) => {
        ctx.beginPath();
        ctx.rect(bb[0] - m, bb[1] - m, bw + m * 2, bh + m * 2);
        polyPath(ctx, pts.slice().reverse(), dx, dy);
      };
      ctx.shadowBlur = rim * 1.6;
      ctx.shadowColor = `rgba(34,18,6,${0.42 * puff})`;
      ctx.shadowOffsetX = -rim * 0.45; ctx.shadowOffsetY = -rim * 0.6;
      ctx.fillStyle = '#000';
      hole(0, 0); ctx.fill('evenodd');
      ctx.shadowColor = `rgba(255,248,232,${0.24 * puff})`;
      ctx.shadowOffsetX = rim * 0.4; ctx.shadowOffsetY = rim * 0.5;
      hole(0, 0); ctx.fill('evenodd');
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    }
    ctx.restore();

    // running stitch just inside the edge
    if (stitch && Math.min(bw, bh) > stitchInset * 3) {
      thread(ctx, inset(pts, stitchInset), stitch, { width: stitchWidth, dash: stitchDash, closed: true, rnd });
    }
  }

  // Lay fibre grain over a whole canvas region (used for big felt sheets).
  function grainOver(ctx, x, y, w, h, alpha = 1, scale = 1, seed = 7) {
    const pat = ctx.createPattern(grain(160, seed), 'repeat');
    if (pat.setTransform) pat.setTransform(new DOMMatrix([scale, 0, 0, scale, 0, 0]));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = pat;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }

  window.HavenFelt = {
    mulberry32, hexToRgb, grain, grainOver, piece, thread, blanket,
    polyPath, inset, resample, cutQuad, ellipsePts, samplePath
  };
})();
