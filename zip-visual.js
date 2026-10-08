const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/* ── ספירת שנות ניסיון: פעם אחת, כשהמספר נחשף ─────────────────────────── */
function countUp(el) {
  const to = Number(el.dataset.to);
  if (reduce || !to) return;
  const t0 = performance.now();
  const dur = 1300;
  const tick = (t) => {
    const k = Math.min(1, (t - t0) / dur);
    el.textContent = String(Math.round(to * (1 - Math.pow(1 - k, 3))));
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ── חשיפה בגלילה ───────────────────────────────────────────────────────
   נקודת הייחוס היא המיקום בעמוד, לא שעון.
   - בטעינה: ההירו כולו, וכל אלמנט שכבר בתוך המסך, נחשפים מיד (עם ההשהיות שב-HTML).
   - בגלילה: אלמנט נחשף כשהקצה העליון שלו עובר את קו ההפעלה. קו נמוך מדי (78%)
     השאיר רבע מסך ריק בזמן גלילה; קו בתחתית ממש (100%) גרם לאלמנטים להיגמר לפני
     שמגיעים אליהם. REVEAL_LINE הוא האחוז מגובה המסך, מלמעלה.
   - המספר 13 סופר רק כשהוא עובר את COUNT_LINE, כדי שיראו אותו סופר.
   רשת הביטחון מותנית: אם ולו אלמנט אחד נחשף, המשקיף עובד ואסור לגעת בשאר. */
const REVEAL_LINE = 0.9;
const COUNT_LINE = 0.7;
const targets = $$('[data-reveal]');
const reveal = (el) => el.classList.add('is-in');
const revealAll = () => targets.forEach(reveal);
const counters = $$('.count');

if (reduce || !('IntersectionObserver' in window)) {
  revealAll();
} else {
  let observerWorks = false;
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        observerWorks = true;
        reveal(e.target);
        io.unobserve(e.target);
      });
    },
    { threshold: 0, rootMargin: `0px 0px -${Math.round((1 - REVEAL_LINE) * 100)}% 0px` }
  );
  const hero = $('.hero');
  const vh = window.innerHeight;
  targets.forEach((el) => {
    if ((hero && hero.contains(el)) || el.getBoundingClientRect().top < vh) {
      observerWorks = true;
      reveal(el);
    } else {
      io.observe(el);
    }
  });

  const cio = new IntersectionObserver(
    (entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      countUp(e.target);
      cio.unobserve(e.target);
    }),
    { threshold: 0, rootMargin: `0px 0px -${Math.round((1 - COUNT_LINE) * 100)}% 0px` }
  );
  counters.forEach((c) => cio.observe(c));

  // אלמנטים בתחתית העמוד לעולם לא יעברו את הקו; בהגעה לסוף העמוד נחשפים הנותרים.
  const atEnd = () => {
    if (window.scrollY + window.innerHeight < document.documentElement.scrollHeight - 6) return;
    observerWorks = true;
    targets.forEach((el) => { if (!el.classList.contains('is-in')) { reveal(el); io.unobserve(el); } });
    window.removeEventListener('scroll', atEnd);
  };
  window.addEventListener('scroll', atEnd, { passive: true });
  setTimeout(() => {
    if (!observerWorks) revealAll();
  }, 3000);
}

/* סגירת התפריט בנייד אחרי בחירה */
$$('.menu__panel a').forEach((a) => a.addEventListener('click', () => $('.menu')?.removeAttribute('open')));