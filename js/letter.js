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

  // The print choices come straight from the gallery, so they always match it
  const printSelect = form.elements.print;
  const thumbs = document.querySelectorAll('.thumb[data-print]');
  thumbs.forEach((t) => {
    const o = document.createElement('option');
    o.textContent = t.dataset.print;
    printSelect.appendChild(o);
    // looking at a print in the gallery pencils it into the letter, if no print is chosen yet
    t.addEventListener('click', () => {
      if (!printSelect.value) { printSelect.value = t.dataset.print; fit(printSelect); saveDraft(); }
    });
  });

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
  form.addEventListener('change', saveDraft);

  /* ---------- reading and checking the letter ---------- */

  function read() {
    const f = form.elements;
    const val = (name) => (f[name] && f[name].value ? String(f[name].value).trim() : '');
    return {
      print: val('print'),
      city: val('city'),
      email: val('email'),
      note: val('note'),
      name: val('name')
    };
  }

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  function check(d) {
    const missing = [];
    const need = (ok, el) => { if (!ok) { el.classList.add('is-missing'); missing.push(el); } };
    need(d.print, form.elements.print);
    need(d.city, form.elements.city);
    need(EMAIL_RE.test(d.email), form.elements.email);
    need(d.name, form.elements.name);
    errorEl.textContent = d.email && !EMAIL_RE.test(d.email) && missing.length === 1
      ? 'That email doesn’t look quite right.'
      : 'A few blanks still need filling in.';
    return missing;
  }

  function compose(d) {
    const lines = [
      'Dear Sarah,',
      '',
      `I would love a fabric book cover in the ${d.print} print.`,
      '',
      `I live in ${d.city}, and you can write back to me at ${d.email}.`
    ];
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
      missing[0].focus({ preventScroll: false });
      return;
    }
    errorEl.hidden = true;

    const text = compose(d);
    const viaEmail = !!EMAIL; // email when Sarah's address is set, otherwise Instagram
    const copied = copyText(text);

    prepareSent(d, text, viaEmail, copied);
    busy = true;
    try {
      if (!reduceMotion && window.HavenPost) await window.HavenPost.play(form);
    } finally {
      busy = false;
    }
    showSent();
  });

  function prepareSent(d, text, viaEmail, copied) {
    sentText.value = text;
    sentDetails.open = !viaEmail && !copied;
    if (viaEmail) {
      const subject = `Book cover letter from ${d.name}`;
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
    form.style.transform = '';
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
    form.style.transform = '';
    fitAll();
    form.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
  });

  /* ---------- start up ---------- */

  loadDraft();
  fitAll();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitAll);
  window.addEventListener('resize', fitAll);
})();
