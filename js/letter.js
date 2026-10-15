/* The order letter: fill in the blanks, seal it, and a carrier pigeon
   flies it away. The site has no server, so the letter is actually sent
   through Instagram (copied, then pasted into a DM) or email (mailto). */
(function () {
  'use strict';

  const form = document.getElementById('order-letter');
  const sent = document.getElementById('letter-sent');
  if (!form || !sent) return;

  const config = window.HAVEN_CONFIG || {};
  const INSTAGRAM = config.instagram || '__sarahshandmadehaven__';
  const EMAIL = (config.email || '').trim();
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DRAFT_KEY = 'haven-letter-draft';

  const errorEl = form.querySelector('.letter__error');
  const sentMsg = sent.querySelector('[data-sent-msg]');
  const sentGo = sent.querySelector('[data-sent-go]');
  const sentText = sent.querySelector('[data-sent-text]');
  const sentCopy = sent.querySelector('[data-sent-copy]');
  const sentDetails = sent.querySelector('details');

  if (!EMAIL) form.querySelectorAll('[data-email-only]').forEach((e) => e.remove());

  form.querySelector('[data-letter-date]').textContent =
    new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  /* ---------- blanks that size themselves to what's written in them ---------- */

  const measure = document.createElement('span');
  measure.className = 'blank-measure';
  measure.setAttribute('aria-hidden', 'true');
  form.appendChild(measure);

  const fitted = form.querySelectorAll('input.blank, select.blank');
  function fit(el) {
    const isSelect = el.tagName === 'SELECT';
    const text = isSelect ? el.options[el.selectedIndex].text : (el.value || el.placeholder);
    measure.style.fontSize = getComputedStyle(el).fontSize;
    measure.textContent = text;
    el.style.width = Math.ceil(measure.getBoundingClientRect().width + (isSelect ? 22 : 8)) + 'px';
  }
  const fitAll = () => fitted.forEach(fit);

  /* ---------- draft kept in this browser, in case they pop over to Instagram ---------- */

  function saveDraft() {
    try {
      const data = {};
      new FormData(form).forEach((v, k) => { data[k] = v; });
      localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
    } catch (e) { /* storage unavailable: no draft, no problem */ }
  }
  function loadDraft() {
    try {
      const data = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (!data) return;
      for (const [k, v] of Object.entries(data)) {
        const fields = form.elements[k];
        if (!fields) continue;
        if (fields instanceof RadioNodeList) {
          fields.forEach((r) => { r.checked = r.value === v; });
        } else {
          fields.value = v;
        }
      }
    } catch (e) { /* ignore */ }
  }
  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ }
  }

  form.addEventListener('input', (e) => {
    if (e.target.matches('input.blank, select.blank')) fit(e.target);
    const missing = e.target.closest('.is-missing');
    if (missing) missing.classList.remove('is-missing');
    if (e.target.classList.contains('is-missing')) e.target.classList.remove('is-missing');
    saveDraft();
  });
  form.addEventListener('change', (e) => {
    const group = e.target.closest('.ticks');
    if (group) group.classList.remove('is-missing');
    saveDraft();
  });

  /* ---------- reading and checking the letter ---------- */

  function read() {
    const f = form.elements;
    const val = (name) => (f[name] && f[name].value ? String(f[name].value).trim() : '');
    return {
      qty: val('qty') || 'one',
      print: val('print'),
      size: val('size'),
      town: val('town'),
      delivery: val('delivery'),
      contact: val('contact'),
      note: val('note'),
      name: val('name'),
      via: val('via') || 'instagram'
    };
  }

  function check(d) {
    const missing = [];
    const need = (ok, el) => { if (!ok) { el.classList.add('is-missing'); missing.push(el); } };
    need(d.print, form.elements.print);
    need(d.size, form.elements.size);
    need(d.town, form.elements.town);
    need(d.delivery, form.querySelector('[data-required="delivery"]'));
    need(d.name, form.elements.name);
    return missing;
  }

  function compose(d) {
    const lines = [
      'Dear Sarah,',
      '',
      `I would love ${d.qty} of your fabric book covers, in the ${d.print}, sized for a ${d.size}.`,
      '',
      `I live in ${d.town}, and I'd like to ${d.delivery}.`
    ];
    if (d.contact) lines.push(`If it's easier, you can also reach me at ${d.contact}.`);
    if (d.note) lines.push('', `P.S. ${d.note}`);
    lines.push('', 'With warm wishes,', d.name, '', "(Written on the Sarah's Handmade Haven website)");
    return lines.join('\n');
  }

  function copyText(text) {
    // must run inside the click, which is what lets browsers allow the copy
    try {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
        return true;
      }
    } catch (e) { /* fall through */ }
    return fallbackCopy(text);
  }
  function fallbackCopy(text) {
    const t = document.createElement('textarea');
    t.value = text;
    t.setAttribute('readonly', '');
    t.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    document.body.appendChild(t);
    t.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    t.remove();
    return ok;
  }

  /* ---------- sending ---------- */

  let busy = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    form.querySelectorAll('.is-missing').forEach((el) => el.classList.remove('is-missing'));

    const d = read();
    const missing = check(d);
    if (missing.length) {
      errorEl.hidden = false;
      form.classList.remove('is-shaking');
      void form.offsetWidth;
      form.classList.add('is-shaking');
      const first = missing[0].matches('.ticks') ? missing[0].querySelector('input') : missing[0];
      first.focus({ preventScroll: false });
      return;
    }
    errorEl.hidden = true;

    const text = compose(d);
    const viaEmail = d.via === 'email' && EMAIL;
    const copied = copyText(text);

    prepareSent(d, text, viaEmail, copied);
    busy = true;
    try {
      await playPigeon();
    } finally {
      busy = false;
    }
    showSent();
  });

  function prepareSent(d, text, viaEmail, copied) {
    sentText.value = text;
    sentDetails.open = !viaEmail && !copied;
    if (viaEmail) {
      const subject = `Book cover order letter from ${d.name}`;
      sentGo.href = `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text.replace(/\n/g, '\r\n'))}`;
      sentGo.removeAttribute('target');
      sentGo.textContent = 'Open my email';
      sentMsg.textContent = 'One last step: tap below and your letter opens in your email, already addressed to Sarah. Just press send.';
    } else {
      sentGo.href = `https://ig.me/m/${INSTAGRAM}`;
      sentGo.target = '_blank';
      sentGo.textContent = 'Open Instagram messages';
      sentMsg.textContent = copied
        ? 'One last step: your letter is copied. Tap below to open Sarah’s Instagram messages, then paste it in and press send.'
        : 'One last step: copy your letter below, then tap to open Sarah’s Instagram messages, paste it in and press send.';
    }
  }

  function showSent() {
    form.hidden = true;
    form.style.clipPath = '';
    sent.hidden = false;
    if (!reduceMotion && sent.animate) {
      sent.animate(
        [{ opacity: 0, transform: 'translateY(16px) scale(.97)' }, { opacity: 1, transform: 'none' }],
        { duration: 600, easing: 'cubic-bezier(.2,.8,.2,1)' }
      );
    }
    sent.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
    sent.focus({ preventScroll: true });
  }

  sentCopy.addEventListener('click', () => {
    const ok = copyText(sentText.value);
    sentCopy.textContent = ok ? 'Copied!' : 'Select the text above to copy';
    setTimeout(() => { sentCopy.textContent = 'Copy letter'; }, 2200);
  });

  sent.querySelector('[data-sent-again]').addEventListener('click', () => {
    form.reset();
    clearDraft();
    sent.hidden = true;
    form.hidden = false;
    form.style.clipPath = '';
    fitAll();
    form.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
  });

  /* ---------- the animation ---------- */

  const PIGEON = `
    <svg viewBox="0 0 160 110" aria-hidden="true">
      <defs>
        <linearGradient id="pg-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#b3bccb"/><stop offset="1" stop-color="#8993a5"/>
        </linearGradient>
        <linearGradient id="pg-neck" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#5f9a7c"/><stop offset=".5" stop-color="#7d6aa0"/><stop offset="1" stop-color="#8f99ab"/>
        </linearGradient>
        <linearGradient id="pg-wing" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stop-color="#9ea8b8"/><stop offset="1" stop-color="#c6cdd8"/>
        </linearGradient>
      </defs>
      <g class="wing wing--far">
        <path d="M72 50C80 22 108 8 136 6c-12 13-20 24-33 34-6 6-17 12-31 16z" fill="#7d8798"/>
      </g>
      <path d="M106 60l46-10 6 9-3 9-3 8-46-6z" fill="#8a93a4"/>
      <path d="M146 51l6-1 6 9-3 9-3 8-6-1z" fill="#4d5462"/>
      <ellipse cx="80" cy="63" rx="35" ry="19" fill="url(#pg-body)"/>
      <path d="M58 70c8 8 26 11 40 6-12 6-30 6-40-6z" fill="#d6dbe3" opacity=".7"/>
      <path d="M52 60c-7-8-9-17-6-25l15-1c1 10 4 18 9 25z" fill="url(#pg-neck)"/>
      <circle cx="45" cy="33" r="11.5" fill="#949eb0"/>
      <path d="M35 32l-11 3.5 11 3z" fill="#d6c3a2"/>
      <circle cx="36" cy="31" r="2.2" fill="#eef0f2"/>
      <circle cx="42" cy="30.5" r="2.8" fill="#e07a2f"/>
      <circle cx="42" cy="30.5" r="1.3" fill="#141414"/>
      <circle cx="42.6" cy="29.8" r=".5" fill="#fff"/>
      <g stroke="#c9776b" stroke-width="2.4" stroke-linecap="round" fill="none">
        <path d="M76 79l-2 11m0 0l-4 2m4-2l1 3"/>
        <path d="M88 80l1 11m0 0l-4 2m4-2l2 3"/>
      </g>
      <g class="wing wing--near">
        <path d="M70 52C84 20 118 3 152 8c-15 12-24 26-38 36-8 8-22 15-42 20z" fill="url(#pg-wing)"/>
        <path d="M86 44c10-6 22-9 32-9M92 52c10-5 20-8 30-8" stroke="#3f4552" stroke-width="3" stroke-linecap="round" fill="none"/>
        <path d="M128 12l20-3M124 20l20-1M118 28l18 1" stroke="#6f7888" stroke-width="1.4" stroke-linecap="round"/>
      </g>
    </svg>`;

  const FEATHER = `<svg viewBox="0 0 20 40" aria-hidden="true">
      <path d="M10 2C17 10 18 24 10 36 2 24 3 10 10 2z" fill="#eef0f3" stroke="#b9c1cd" stroke-width=".8"/>
      <path d="M10 4v36" stroke="#9aa3b2" stroke-width="1"/>
    </svg>`;

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const finished = (a) => a.finished.catch(() => {});

  function make(cls, html) {
    const el = document.createElement('div');
    el.className = cls;
    if (html) el.innerHTML = html;
    document.body.appendChild(el);
    return el;
  }

  async function playPigeon() {
    if (reduceMotion || !form.animate) return;

    const r0 = form.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const narrow = vw < 600;
    const top0 = r0.top + window.scrollY, bottom0 = r0.bottom + window.scrollY;
    const left0 = r0.left + window.scrollX, width0 = r0.width;
    const rollStart = window.scrollY;

    // 1. roll the letter up from the bottom; the page follows the roll so it
    //    stays on screen even when the letter is taller than the screen
    const roll = make('post-roll', '<span class="post-roll__tie"><span class="post-roll__seal"></span></span>');
    const h0 = 16, h1 = 34;
    Object.assign(roll.style, { left: `${left0}px`, width: `${width0}px`, top: `${bottom0 - h0 / 2}px`, height: `${h0}px` });
    const rollDur = narrow ? 1700 : 1400;
    await new Promise((resolve) => {
      const t0 = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - t0) / rollDur);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const y = bottom0 - (bottom0 - top0) * e;
        const h = h0 + (h1 - h0) * e;
        form.style.clipPath = `inset(0 0 ${(e * 100).toFixed(2)}% 0)`;
        roll.style.top = `${y - h / 2}px`;
        roll.style.height = `${h}px`;
        // keep the roll a little below the middle of the screen
        const want = Math.min(rollStart, y - vh * 0.55);
        if (want < window.scrollY) window.scrollTo({ top: Math.max(0, want), behavior: 'instant' });
        if (t < 1) requestAnimationFrame(step); else resolve();
      };
      requestAnimationFrame(step);
    });

    // 2. shrink it into a little scroll, tie and seal it
    const sx = window.scrollX, sy = window.scrollY;
    const r = { left: left0 - sx, top: top0 - sy, width: width0 };
    const cx = r.left + r.width / 2 + sx;
    const cy = Math.min(Math.max(top0 + 40, sy + vh * 0.35), sy + vh * 0.6);
    const sw = narrow ? 130 : 150;
    await finished(roll.animate([
      { left: `${r.left + sx}px`, top: `${r.top + sy - h1 / 2}px`, width: `${r.width}px` },
      { left: `${cx - sw / 2}px`, top: `${cy - h1 / 2}px`, width: `${sw}px` }
    ], { duration: 750, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }));
    Object.assign(roll.style, { left: `${cx - sw / 2}px`, top: `${cy - h1 / 2}px`, width: `${sw}px`, height: `${h1}px` });
    roll.getAnimations().forEach((a) => a.cancel());

    await finished(roll.querySelector('.post-roll__tie').animate(
      [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }],
      { duration: 260, easing: 'ease-out', fill: 'forwards' }));
    await finished(roll.querySelector('.post-roll__seal').animate(
      [{ transform: 'scale(0)' }, { transform: 'scale(1.35)', offset: 0.6 }, { transform: 'scale(1)' }],
      { duration: 380, easing: 'ease-out', fill: 'forwards' }));
    await wait(150);

    // 3. the pigeon swoops in from the upper right and lands on the scroll
    const courier = make('courier', PIGEON);
    const cw = narrow ? 170 : 200;
    courier.style.width = `${cw}px`;
    const footX = (82 * cw) / 160, footY = (90 * cw) / 160;
    const landX = cx - footX, landY = cy - footY - h1 / 2 + 8;
    Object.assign(courier.style, { left: `${landX}px`, top: `${landY}px` });
    const fromX = vw - (cx - sx) + 120, fromY = -(cy - sy) - 140;
    await finished(courier.animate([
      { transform: `translate(${fromX}px, ${fromY}px) scale(.7) rotate(-8deg)` },
      { transform: `translate(${fromX * 0.35}px, ${fromY * 0.15}px) scale(.95) rotate(4deg)`, offset: 0.6 },
      { transform: 'translate(-6px, -26px) rotate(-2deg)', offset: 0.85 },
      { transform: 'translate(0, 0)' }
    ], { duration: 1500, easing: 'cubic-bezier(.25,.6,.3,1)', fill: 'forwards' }));

    // 4. it grabs the scroll (the scroll now travels with the pigeon)
    // tucked under the pigeon, so its feet hold the scroll
    courier.insertBefore(roll, courier.firstChild);
    Object.assign(roll.style, { left: `${cx - sw / 2 - landX}px`, top: `${cy - h1 / 2 - landY}px` });
    for (let i = 0; i < 3; i++) dropFeather(cx + (i - 1) * 30, cy - 30);
    await finished(courier.animate(
      [{ transform: 'translate(0,0)' }, { transform: 'translate(0, 9px)' }, { transform: 'translate(0, -4px)' }],
      { duration: 420, easing: 'ease-in-out', fill: 'forwards' }));

    // 5. and flies off, up and away to the left
    courier.classList.add('is-taking-off');
    const awayX = -(cx - sx) - cw - 60, awayY = -(cy - sy) - 160;
    await finished(courier.animate([
      { transform: 'translate(0, -4px) rotate(0) scale(1)' },
      { transform: `translate(${awayX * 0.22}px, 18px) rotate(-3deg) scale(1)`, offset: 0.25 },
      { transform: `translate(${awayX * 0.6}px, ${awayY * 0.45}px) rotate(-12deg) scale(.8)`, offset: 0.65 },
      { transform: `translate(${awayX}px, ${awayY}px) rotate(-16deg) scale(.55)` }
    ], { duration: 2000, easing: 'cubic-bezier(.4,0,.7,1)', fill: 'forwards' }));
    courier.remove();
  }

  function dropFeather(x, y) {
    const f = make('feather', FEATHER);
    Object.assign(f.style, { left: `${x}px`, top: `${y}px` });
    const drift = (Math.random() - 0.5) * 120, spin = (Math.random() - 0.5) * 200;
    const a = f.animate([
      { transform: 'translate(0,0) rotate(0)', opacity: 0 },
      { transform: `translate(${drift * 0.3}px, 40px) rotate(${spin * 0.3}deg)`, opacity: 1, offset: 0.15 },
      { transform: `translate(${-drift * 0.4}px, 120px) rotate(${-spin * 0.4}deg)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${drift}px, 220px) rotate(${spin}deg)`, opacity: 0 }
    ], { duration: 2600 + Math.random() * 800, easing: 'ease-in-out', fill: 'forwards' });
    a.finished.then(() => f.remove(), () => f.remove());
  }

  /* ---------- start up ---------- */

  loadDraft();
  fitAll();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitAll);
  window.addEventListener('resize', fitAll);
})();
