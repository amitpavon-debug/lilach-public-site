// Visual effects only for zip-design-preview.
// Does not submit forms, fetch data, change booking state, or override existing handlers.
(() => {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;
  const body = document.body;
  if (!body?.classList.contains('zip-design')) return;

  const revealTargets = [];
  const add = (el, kind = '') => {
    if (!el || el.hasAttribute('data-zip-reveal')) return;
    el.setAttribute('data-zip-reveal', kind);
    revealTargets.push(el);
  };

  // Hero: staggered, matching the exported prototype.
  add(document.querySelector('.hero-card'), 'fade');
  add(document.querySelector('.hero-copy > .eyebrow'));
  add(document.querySelector('.hero-copy > h1'));
  add(document.querySelector('.hero-copy > p'));
  add(document.querySelector('.hero-actions'));
  add(document.querySelector('.trust-row'));

  // Main sections.
  document.querySelectorAll('.section-head').forEach(add);
  document.querySelectorAll('.info-card').forEach((el, i) => {
    el.style.setProperty('--zip-delay', `${(i % 4) * .08}s`);
    add(el);
  });
  add(document.querySelector('.about-visual'), 'img');
  document.querySelectorAll('.about-copy > *').forEach((el, i) => {
    el.style.setProperty('--zip-delay', `${Math.min(i, 5) * .06}s`);
    add(el);
  });
  document.querySelectorAll('.process-card').forEach((el, i) => {
    el.style.setProperty('--zip-delay', `${i * .1}s`);
    add(el);
  });
  document.querySelectorAll('.price-card').forEach((el, i) => {
    el.style.setProperty('--zip-delay', `${i * .1}s`);
    add(el);
  });
  add(document.querySelector('.booking-layout > div:first-child'));
  add(document.querySelector('.booking-card'));

  root.classList.add('zip-effects');

  const show = (el) => el?.classList.add('zip-is-in');
  const showAll = () => revealTargets.forEach(show);

  if (reduce || !('IntersectionObserver' in window)) {
    showAll();
    return;
  }

  let observerWorked = false;
  const hero = document.querySelector('.hero');
  const vh = window.innerHeight;

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observerWorked = true;
      show(entry.target);
      io.unobserve(entry.target);
    }
  }, {
    threshold: 0,
    rootMargin: '0px 0px -10% 0px'
  });

  for (const el of revealTargets) {
    if ((hero && hero.contains(el)) || el.getBoundingClientRect().top < vh) {
      observerWorked = true;
      show(el);
    } else {
      io.observe(el);
    }
  }

  // Count the experience number once when the badge reaches the viewport.
  const experience = document.querySelector('.experience-badge strong');
  const countExperience = () => {
    if (!experience || experience.dataset.zipCounted === '1') return;
    const match = experience.textContent.match(/(\d+)/);
    if (!match) return;
    const target = Number(match[1]);
    if (!target) return;
    experience.dataset.zipCounted = '1';
    const original = experience.textContent;
    const prefix = original.slice(0, match.index);
    const suffix = original.slice((match.index || 0) + match[1].length);
    const start = performance.now();
    const duration = 1300;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      experience.textContent = prefix + Math.round(target * eased) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  if (experience) {
    const cio = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        countExperience();
        cio.disconnect();
      }
    }, { threshold: .2, rootMargin: '0px 0px -30% 0px' });
    cio.observe(experience);
  }

  // Elements at the very bottom may never cross the reveal line.
  const atEnd = () => {
    if (window.scrollY + window.innerHeight < document.documentElement.scrollHeight - 8) return;
    showAll();
    window.removeEventListener('scroll', atEnd);
  };
  window.addEventListener('scroll', atEnd, { passive: true });

  // Safety net: effects must never leave content invisible.
  setTimeout(() => {
    if (!observerWorked) showAll();
  }, 3000);
})();