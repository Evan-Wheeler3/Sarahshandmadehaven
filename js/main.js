/* Page wiring: Instagram links, the title flying out of the tower window,
   the product gallery and the nav that appears once you reach the wall. */
(function () {
  'use strict';

  // Set in js/config.js
  const INSTAGRAM = (window.HAVEN_CONFIG || {}).instagram || '__sarahshandmadehaven__';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Start at the top on every load (see the note in index.html) */
  const toTop = () => window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  toTop();
  window.addEventListener('load', toTop);

  /* Instagram links */
  document.querySelectorAll('[data-ig]').forEach((a) => {
    a.href = a.dataset.ig === 'dm'
      ? `https://ig.me/m/${INSTAGRAM}`
      : `https://www.instagram.com/${INSTAGRAM}/`;
    a.target = '_blank';
    a.rel = 'noopener';
  });
  document.querySelectorAll('[data-ig-handle]').forEach((e) => { e.textContent = '@' + INSTAGRAM; });
  document.querySelectorAll('[data-year]').forEach((e) => { e.textContent = new Date().getFullYear(); });

  /* Gallery */
  const main = document.getElementById('product-main');
  const thumbs = document.querySelectorAll('.thumb');
  thumbs.forEach((btn) => {
    btn.addEventListener('click', () => {
      thumbs.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      const img = btn.querySelector('img');
      main.classList.add('is-swapping');
      setTimeout(() => {
        main.src = img.src;
        main.alt = img.alt;
        main.classList.remove('is-swapping');
      }, 160);
    });
  });

  /* Nav + hero state follow the zoom */
  const body = document.body;
  function onScroll() {
    const scene = window.HavenScene;
    const end = scene ? scene.zoomEnd() : window.innerHeight;
    body.classList.toggle('past-title', window.scrollY > end * 0.3);
    body.classList.toggle('on-wall', window.scrollY > end * 0.92);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* Title: letters stream out of the tower window and settle into place */
  const title = document.querySelector('.title');
  const letters = [];
  title.querySelectorAll('[data-split]').forEach((line) => {
    const text = line.textContent;
    line.textContent = '';
    for (const ch of text) {
      const s = document.createElement('span');
      s.className = 'ch';
      s.textContent = ch;
      s.setAttribute('aria-hidden', 'true');
      line.appendChild(s);
      letters.push(s);
    }
  });

  function reveal() {
    title.classList.add('is-ready');
    const scene = window.HavenScene;
    if (reduceMotion || !scene || window.scrollY > 40 || !letters[0].animate) {
      body.classList.add('title-done');
      return;
    }
    const win = scene.windowPoint();
    const stagger = 55, dur = 1500, delay = 350;
    scene.pulse(delay + letters.length * stagger + 300);

    letters.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const dx = win.x - (r.left + r.width / 2);
      const dy = win.y - (r.top + r.height / 2);
      const spin = (Math.random() - 0.5) * 120;
      const lift = 50 + Math.random() * 70;
      el.animate([
        { transform: `translate(${dx}px, ${dy}px) scale(.08) rotate(${spin}deg)`, opacity: 0, filter: 'blur(3px)' },
        { transform: `translate(${dx * 0.55}px, ${dy * 0.55 - lift}px) scale(.55) rotate(${spin * 0.4}deg)`, opacity: 1, filter: 'blur(0)', offset: 0.42 },
        { transform: 'none', opacity: 1, filter: 'blur(0)' }
      ], { duration: dur, delay: delay + i * stagger, easing: 'cubic-bezier(.3,.6,.25,1)', fill: 'backwards' });
    });
    setTimeout(() => body.classList.add('title-done'), delay + letters.length * stagger + dur * 0.6);
  }

  const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  Promise.race([fontsReady, new Promise((r) => setTimeout(r, 1500))]).then(() => requestAnimationFrame(reveal));
})();
