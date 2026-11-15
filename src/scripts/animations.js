// Анімації появи на GSAP. Вмикаються атрибутами в розмітці, без нового коду:
//
//   data-anim="fade-up"   — елемент з'являється знизу при скролі
//   data-anim="fade"      — плавна поява без зсуву
//   data-anim="stagger"   — дочірні елементи з'являються по черзі (картки в сітці)
//   data-count="350"      — лічильник цифр від 0 до числа (data-suffix="+" — знак після)
//   data-roll             — разом з data-count: замість лічильника «барабан» — кожна цифра
//                           прокручується стрічкою 0–9 і зупиняється на своєму місці, праві довше
//   data-reveal           — текст розбивається на слова, вони сірі й при скролі по черзі стають
//                           кольору тексту (колір «сірого» — у стилях блоку, селектор [data-reveal] .word)
//   data-anim="hang"      — підвішений контейнер на першому екрані: троси до верху екрана,
//                           на ПК при скролі опускається під блок (спуск при завантаженні — у CSS)
//
// Для користувачів з увімкненим reduced motion анімації вимкнені.

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

gsap.registerPlugin(ScrollTrigger);

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Плавний скрол усього сайту (Lenis): колесо миші й тачпад гортають м'яко,
// а посилання на блоки (#block-7 тощо) плавно доїжджають до потрібного місця.
// Синхронізовано з ScrollTrigger, щоб анімації появи спрацьовували вчасно.
// Для reduced motion вимкнено — працює звичайний скрол браузера.
if (!reduce) {
  const lenis = new Lenis({
    duration: 1.2,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    anchors: { duration: 1.6 },
  });
  window.lenis = lenis;
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

function initAnimations() {
  if (reduce) return;

  const start = 'top 85%';

  // Елементи, які вже видно на екрані при завантаженні (перший екран),
  // з'являються одразу, а не чекають прокрутки.
  const onScreen = (el) => el.getBoundingClientRect().top < window.innerHeight;
  const trigger = (el) => (onScreen(el) ? undefined : { trigger: el, start, once: true });

  gsap.utils.toArray('[data-anim="fade-up"]').forEach((el) => {
    gsap.from(el, {
      y: 30, opacity: 0, duration: 0.6, ease: 'power2.out',
      scrollTrigger: trigger(el),
    });
  });

  gsap.utils.toArray('[data-anim="fade"]').forEach((el) => {
    gsap.from(el, {
      opacity: 0, duration: 0.8, ease: 'power1.out',
      scrollTrigger: trigger(el),
    });
  });

  gsap.utils.toArray('[data-anim="stagger"]').forEach((el) => {
    gsap.from(el.children, {
      y: 30, opacity: 0, duration: 0.6, ease: 'power2.out', stagger: 0.1,
      scrollTrigger: { trigger: el, start, once: true },
    });
  });

  gsap.utils.toArray('[data-count]').forEach((el) => {
    if (el.hasAttribute('data-roll')) { roll(el, start); return; }
    const target = Number(el.dataset.count) || 0;
    const suffix = el.dataset.suffix || '';
    // data-separator — розділяти тисячі комою: 12,000
    const format = (n) => (el.dataset.separator !== undefined ? n.toLocaleString('en-US') : String(n));
    const counter = { value: 0 };
    el.textContent = `0${suffix}`;
    gsap.to(counter, {
      value: target, duration: 1.6, ease: 'power2.out',
      scrollTrigger: { trigger: el, start, once: true },
      onUpdate: () => { el.textContent = `${format(Math.round(counter.value))}${suffix}`; },
    });
  });
}

// Підвішений контейнер на першому екрані (як на vladlen240.github.io/syntrex).
// Спуск згори з відскоками — CSS-анімація в Block1.astro. Тут:
// 1) троси: у картинки зрізана верхня частина з тросами, а над нею розтягнуто вгору один рядок пікселів
//    «голого» троса (рядок 100 з 1080) — контейнер висить на довших тросах і ніколи від них не відривається;
// 2) лише на ПК: при скролі контейнер відстає від сторінки й опускається під нижній край першого екрана,
//    обрізаючись над текстом блоку 2 (лінія зрізу — clip-path секції), а трохи раніше плавно зникає.
function initHang() {
  const box = document.querySelector('[data-anim="hang"]');
  if (!box) return;
  const img = box.querySelector('img');
  const cables = box.querySelector('[data-hang-cables]');
  const section = box.closest('section');
  const next = section && section.nextElementSibling;

  // Рядок читається з копії файлу (справжні пікселі) і зберігається картинкою, а не живим canvas:
  // canvas браузер може очистити
  const addCables = () => {
    const src = new Image();
    src.onload = () => {
      const c = document.createElement('canvas');
      c.width = src.naturalWidth; c.height = 1;
      const row = Math.round((src.naturalHeight * 100) / 1080);
      c.getContext('2d').drawImage(src, 0, row, c.width, 1, 0, 0, c.width, 1);
      cables.style.backgroundImage = `url(${c.toDataURL()})`;
    };
    src.src = img.currentSrc || img.src;
  };
  if (img && cables) {
    if (img.complete && img.naturalWidth) addCables();
    else img.addEventListener('load', addCables, { once: true });
  }

  if (reduce || !section || !next) return;
  const SPEED = 1.2; // контейнер опускається на 1,2 px за кожен px скролу
  const desktop = window.matchMedia('(min-width: 901px)');
  const update = () => {
    if (!desktop.matches) { box.style.translate = ''; box.classList.remove('is-gone'); return; }
    // відстань від тексту блоку 2 до лінії зрізу — у scroll-margin-top контейнера (змінна --hero-cut)
    const cut = parseFloat(getComputedStyle(box).scrollMarginTop) || 0;
    const pad = parseFloat(getComputedStyle(next).paddingTop) || 0;
    // контейнер повністю обрізаний, коли опустився на висоту екрана + відступ блоку 2 − зріз
    const end = (section.offsetHeight + pad - cut) / SPEED;
    const y = Math.min(Math.max(0, window.scrollY - section.offsetTop), end);
    box.style.translate = y ? `0 ${Math.round(y * SPEED)}px` : ''; // цілі px — без мерехтіння на стику з тросом
    // коли блок (рядок 217 з 1080, вище — лише трос) підходить до лінії зрізу, лишились би самі троси:
    // картинка зникає трохи раніше і з'являється знову при скролі вгору
    const r = img.getBoundingClientRect();
    const line = next.getBoundingClientRect().top + pad - cut;
    box.classList.toggle('is-gone', r.top + (r.height * 217) / 1080 + cut >= line);
  };
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  desktop.addEventListener('change', update);
  update();
}

// Проявлення тексту при скролі: слова з сірого стають кольору тексту, у такт прокрутці
function initReveal() {
  if (reduce) return; // без анімації текст одразу звичайного кольору
  document.querySelectorAll('[data-reveal]').forEach((el) => {
    const color = getComputedStyle(el).color; // кінцевий колір — звичайний колір тексту
    const parts = el.textContent.split(/(\s+)/);
    el.textContent = '';
    parts.forEach((p) => {
      if (!p) return;
      if (/^\s+$/.test(p)) { el.append(p); return; }
      const w = document.createElement('span');
      w.className = 'word';
      w.textContent = p;
      el.append(w);
    });
    gsap.to(el.querySelectorAll('.word'), {
      color, ease: 'none', stagger: 0.1,
      scrollTrigger: { trigger: el, start: 'top 85%', end: 'bottom 45%', scrub: 0.6 },
    });
  });
}

// «Барабан» для цифр: кожна цифра — віконце, в якому прокручується стрічка 0–9 кілька кіл
// і зупиняється на потрібній цифрі. Кожна наступна цифра справа крутиться на коло більше і довше.
// Ширину й висоту віконця задає невидима кінцева цифра, тож верстка не зсувається.
function roll(el, start) {
  const target = Number(el.dataset.count) || 0;
  const text = (el.dataset.separator !== undefined ? target.toLocaleString('en-US') : String(target)) + (el.dataset.suffix || '');
  el.setAttribute('aria-label', text);
  el.textContent = '';
  const strips = [];
  [...text].forEach((ch) => {
    if (!/\d/.test(ch)) {
      const s = document.createElement('span');
      s.setAttribute('aria-hidden', 'true');
      s.textContent = ch;
      el.append(s);
      return;
    }
    const col = document.createElement('span');
    col.className = 'roll-col';
    col.setAttribute('aria-hidden', 'true');
    const sizer = document.createElement('span');
    sizer.className = 'roll-sizer';
    sizer.textContent = ch;
    const strip = document.createElement('span');
    strip.className = 'roll-strip';
    const loops = 1 + strips.length; // зліва направо: 1, 2, 3… кола
    const digits = [];
    for (let l = 0; l < loops; l++) for (let d = 0; d < 10; d++) digits.push(d);
    for (let d = 0; d <= Number(ch); d++) digits.push(d);
    strip.innerHTML = digits.map((d) => `<span>${d}</span>`).join('');
    col.append(sizer, strip);
    el.append(col);
    strips.push({ col, strip, total: digits.length });
  });
  const tl = gsap.timeline({ scrollTrigger: { trigger: el, start, once: true } });
  strips.forEach(({ strip, total }, i) => {
    tl.to(strip, {
      yPercent: (-(total - 1) / total) * 100,
      duration: 1.4 + i * 0.25, ease: 'power3.out',
    }, i * 0.05);
  });
}

initAnimations();
initReveal();
initHang();
