/* Procedural, seamlessly tiling stone-wall texture.
   The same tile is used for the tower in the hero and for the wall it
   zooms into, so the hand-off between the two is seamless. */
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

  // An irregular, softly rounded quad for one stone.
  function makeStone(x, y, w, h, rnd) {
    const j = () => (rnd() - 0.5) * Math.min(w, h) * 0.2;
    return {
      pts: [[x + j(), y + j()], [x + w + j(), y + j()], [x + w + j(), y + h + j()], [x + j(), y + h + j()]],
      r: Math.min(w, h) * (0.07 + rnd() * 0.13),
      x, y, w, h
    };
  }

  function trace(ctx, s, ox, oy) {
    const p = s.pts, n = p.length;
    const mid = (a, b) => [(a[0] + b[0]) / 2 + ox, (a[1] + b[1]) / 2 + oy];
    const m = mid(p[n - 1], p[0]);
    ctx.beginPath();
    ctx.moveTo(m[0], m[1]);
    for (let i = 0; i < n; i++) {
      const c = p[i], mm = mid(c, p[(i + 1) % n]);
      ctx.arcTo(c[0] + ox, c[1] + oy, mm[0], mm[1], s.r);
    }
    ctx.closePath();
  }

  // Each style tunes colour, mortar and lighting; geometry is shared.
  const STYLES = {
    grey: {
      mortar: '#3d362f', grit: [200, 185, 160], highlight: 'rgba(255,250,238,.22)', grain: 30,
      color(rnd) {
        const roll = rnd();
        let h = 30 + rnd() * 14, s = 4 + rnd() * 8, l = 41 + rnd() * 17;
        if (roll < 0.1) { h = 70 + rnd() * 25; s = 4 + rnd() * 5; }          // lichen-grey
        else if (roll < 0.22) { h = 20 + rnd() * 10; s = 10 + rnd() * 8; l -= 3; } // warm sandstone
        return { h, s, l };
      }
    },
    sandstone: {
      mortar: '#6b5238', grit: [255, 230, 190], highlight: 'rgba(255,246,215,.42)', grain: 22, strata: true,
      color(rnd) {
        const roll = rnd();
        let h = 32 + rnd() * 9, s = 38 + rnd() * 18, l = 60 + rnd() * 12;
        if (roll < 0.16) { h = 18 + rnd() * 8; s = 38 + rnd() * 14; l = 58 + rnd() * 8; }  // rosy
        else if (roll < 0.3) { h = 40 + rnd() * 6; s = 30 + rnd() * 12; l = 72 + rnd() * 7; } // pale cream
        else if (roll < 0.38) { h = 26 + rnd() * 6; s = 42 + rnd() * 10; l = 50 + rnd() * 6; } // deeper ochre
        return { h, s, l };
      }
    }
  };


  function renderStone(ctx, st, style) {
    const { x, y, w, h } = st.shape;
    const c = st.color;

    // shadow cast into the mortar
    ctx.fillStyle = 'rgba(18,13,9,.5)';
    trace(ctx, st.shape, 1.4, 2.2); ctx.fill();

    trace(ctx, st.shape, 0, 0);
    ctx.fillStyle = `hsl(${c.h} ${c.s}% ${c.l}%)`;
    ctx.fill();

    ctx.save();
    ctx.clip();

    // light from the upper left
    const g = ctx.createLinearGradient(x, y, x + w * 0.5, y + h);
    g.addColorStop(0, 'rgba(255,247,230,.20)');
    g.addColorStop(1, 'rgba(30,20,10,.26)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 4, y - 4, w + 8, h + 8);

    for (const m of st.mottles) {
      ctx.fillStyle = m.c;
      ctx.beginPath();
      ctx.ellipse(m.x, m.y, m.rx, m.ry, m.a, 0, Math.PI * 2);
      ctx.fill();
    }

    // sedimentary bands running through sandstone
    for (const b of st.strata) {
      ctx.strokeStyle = b.c;
      ctx.lineWidth = b.w;
      ctx.beginPath();
      for (let i = 0; i <= 8; i++) {
        const px = x - 4 + ((w + 8) * i) / 8;
        const py = b.y + Math.sin(i * b.f + b.ph) * b.amp;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.stroke();
    }

    if (st.moss) {
      const mg = ctx.createRadialGradient(st.moss.x, y + h, 0, st.moss.x, y + h, st.moss.r);
      mg.addColorStop(0, 'rgba(84,100,46,.45)');
      mg.addColorStop(1, 'rgba(92,112,48,0)');
      ctx.fillStyle = mg;
      ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
    }

    for (const d of st.pits) {
      ctx.fillStyle = d.c;
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill();
    }

    if (st.crack) {
      ctx.strokeStyle = 'rgba(25,18,12,.45)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(st.crack[0][0], st.crack[0][1]);
      for (let i = 1; i < st.crack.length; i++) ctx.lineTo(st.crack[i][0], st.crack[i][1]);
      ctx.stroke();
    }

    // bevel: highlight top-left, shade bottom-right
    ctx.lineWidth = 3.2;
    ctx.strokeStyle = style.highlight;
    trace(ctx, st.shape, 1.6, 1.6); ctx.stroke();
    ctx.strokeStyle = 'rgba(15,10,6,.32)';
    trace(ctx, st.shape, -1.6, -1.6); ctx.stroke();

    ctx.restore();
  }

  function buildStones(size, rnd, style) {
    const stones = [];
    const rows = 10;
    const hs = [];
    for (let i = 0; i < rows; i++) hs.push(0.75 + rnd() * 0.5);
    const hsum = hs.reduce((a, b) => a + b, 0);

    let y = 0;
    for (let r = 0; r < rows; r++) {
      const rowH = (hs[r] / hsum) * size;
      const ws = [];
      let wsum = 0;
      while (wsum < size) { const w = rowH * (1.15 + rnd() * 1.45); ws.push(w); wsum += w; }
      const k = size / wsum;
      let x = rnd() * size;
      for (const w0 of ws) {
        const w = w0 * k;
        const gap = 2.6 + rnd() * 1.8;
        const split = w > rowH * 1.2 && rnd() < 0.16;
        const parts = split
          ? [[y, rowH * (0.4 + rnd() * 0.2)], null]
          : [[y, rowH]];
        if (split) parts[1] = [y + parts[0][1], rowH - parts[0][1]];
        for (const [py, ph] of parts) {
          const shape = makeStone(x + gap / 2, py + gap / 2, w - gap, ph - gap, rnd);
          const color = style.color(rnd);
          const mottles = [];
          const nm = 10 + Math.floor(rnd() * 10);
          for (let i = 0; i < nm; i++) {
            const dl = (rnd() - 0.5) * 22;
            mottles.push({
              x: shape.x + rnd() * shape.w, y: shape.y + rnd() * shape.h,
              rx: shape.w * (0.08 + rnd() * 0.3), ry: shape.h * (0.08 + rnd() * 0.3), a: rnd() * Math.PI,
              c: rnd() < 0.12
                ? `hsla(${80 + rnd() * 20} 18% ${color.l}% / ${0.12 + rnd() * 0.12})`
                : `hsla(${color.h + (rnd() - 0.5) * 16} ${color.s + 3}% ${color.l + dl}% / ${0.14 + rnd() * 0.2})`
            });
          }
          const pits = [];
          const np = 10 + Math.floor(rnd() * 20);
          for (let i = 0; i < np; i++) {
            pits.push({
              x: shape.x + rnd() * shape.w, y: shape.y + rnd() * shape.h, r: 0.4 + rnd() * 1.1,
              c: rnd() < 0.7 ? `rgba(30,22,15,${0.2 + rnd() * 0.3})` : `rgba(255,250,235,${0.15 + rnd() * 0.2})`
            });
          }
          let crack = null;
          if (rnd() < 0.18) {
            let cx = shape.x + shape.w * (0.2 + rnd() * 0.6), cy = shape.y;
            crack = [[cx, cy]];
            const steps = 4 + Math.floor(rnd() * 4);
            for (let i = 0; i < steps; i++) {
              cx += (rnd() - 0.5) * shape.w * 0.12; cy += shape.h / steps * (0.6 + rnd() * 0.5);
              crack.push([cx, cy]);
            }
          }
          const strata = [];
          if (style.strata) {
            const nb = 3 + Math.floor(rnd() * 6);
            for (let i = 0; i < nb; i++) {
              const dark = rnd() < 0.55;
              strata.push({
                y: shape.y + rnd() * shape.h, w: 0.8 + rnd() * shape.h * 0.12,
                amp: 0.5 + rnd() * 2.5, f: 0.4 + rnd() * 0.8, ph: rnd() * 6,
                c: dark
                  ? `hsla(${color.h - 6} ${color.s + 10}% ${color.l - 12}% / ${0.12 + rnd() * 0.16})`
                  : `hsla(${color.h + 4} ${color.s}% ${Math.min(92, color.l + 12)}% / ${0.14 + rnd() * 0.16})`
              });
            }
          }
          const sparks = [];
          if (style.strata) {
            const ns = 2 + Math.floor(rnd() * 4);
            for (let i = 0; i < ns; i++) {
              // favour the sunlit upper part of each stone
              sparks.push([shape.x + shape.w * (0.12 + rnd() * 0.76), shape.y + shape.h * (0.12 + rnd() * rnd() * 0.76)]);
            }
          }
          const moss = !style.strata && rnd() < 0.14 ? { x: shape.x + rnd() * shape.w, r: shape.w * (0.25 + rnd() * 0.35) } : null;
          stones.push({ shape, color, mottles, pits, crack, moss, strata, sparks });
        }
        x += w;
      }
      y += rowH;
    }
    return stones;
  }

  function makeTile(size, dpr, seed, styleName) {
    const style = STYLES[styleName] || STYLES.sandstone;
    const rnd = mulberry32(seed || 1871);
    const c = document.createElement('canvas');
    c.width = c.height = Math.round(size * dpr);
    const ctx = c.getContext('2d');
    ctx.scale(c.width / size, c.height / size);

    // mortar bed
    ctx.fillStyle = style.mortar;
    ctx.fillRect(0, 0, size, size);
    const gr = style.grit.join(',');
    for (let i = 0; i < size * 4; i++) {
      ctx.fillStyle = rnd() < 0.5 ? `rgba(20,15,10,${rnd() * 0.25})` : `rgba(${gr},${rnd() * 0.18})`;
      ctx.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 2, 1 + rnd() * 2);
    }

    const stones = buildStones(size, rnd, style);
    // draw every stone at each wrapped offset so the tile repeats seamlessly
    const offs = [-size, 0, size];
    for (const st of stones) {
      const s = st.shape;
      for (const ox of offs) {
        if (s.x + ox > size + 6 || s.x + s.w + ox < -6) continue;
        for (const oy of offs) {
          if (s.y + oy > size + 6 || s.y + s.h + oy < -6) continue;
          ctx.save(); ctx.translate(ox, oy); renderStone(ctx, st, style); ctx.restore();
        }
      }
    }

    // fine grain over everything
    const img = ctx.getImageData(0, 0, c.width, c.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (rnd() - 0.5) * style.grain;
      d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.9;
    }
    ctx.putImageData(img, 0, 0);

    // glint points (tile CSS px), only within the tile so each appears once per repeat
    c.sparkles = [];
    for (const st of stones) {
      for (const [sx, sy] of st.sparks) {
        const x = ((sx % size) + size) % size, y = ((sy % size) + size) % size;
        c.sparkles.push({ x, y, ph: rnd() * 100, speed: 0.25 + rnd() * 0.5, size: 0.6 + rnd() * 0.8 });
      }
    }
    return c;
  }

  // Successively halved copies, so the zoomed-out tower doesn't shimmer.
  function makeMips(base) {
    const levels = [base];
    let prev = base;
    while (prev.width > 24) {
      const c = document.createElement('canvas');
      c.width = c.height = Math.max(1, Math.round(prev.width / 2));
      const cx = c.getContext('2d');
      cx.imageSmoothingQuality = 'high';
      cx.drawImage(prev, 0, 0, c.width, c.height);
      levels.push(c);
      prev = c;
    }
    return levels;
  }

  window.HavenStone = { makeTile, makeMips, mulberry32 };
})();
