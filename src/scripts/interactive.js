// Бургер-меню і попап з формою.
// Плавний скрол до блоків уже працює через CSS (scroll-behavior у global.css).

// Бургер-меню: кнопка [data-burger], меню [data-nav]
const burger = document.querySelector('[data-burger]');
const nav = document.querySelector('[data-nav]');

if (burger && nav) {
  const setOpen = (open) => {
    document.body.classList.toggle('nav-open', open);
    burger.setAttribute('aria-expanded', String(open));
    // поки меню відкрите, сторінка під ним не гортається (і плавний скрол теж)
    if (window.lenis) { if (open) window.lenis.stop(); else window.lenis.start(); }
  };
  burger.addEventListener('click', () => {
    setOpen(!document.body.classList.contains('nav-open'));
  });
  nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => setOpen(false)));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
}

// Слайдер по колу: обгортка [data-slider], стрічка [data-slider-track],
// кнопки [data-slider-prev] і [data-slider-next] гортають на одну картку.
// Працює навіть коли всі картки вміщаються на екрані.
document.querySelectorAll('[data-slider]').forEach((slider) => {
  const track = slider.querySelector('[data-slider-track]');
  if (!track || track.children.length < 2) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Тривалість і плавність гортання — змінні --slide-duration і --ease-slide з variables.css
  const css = getComputedStyle(document.documentElement);
  const timing = {
    duration: reduce ? 0 : parseFloat(css.getPropertyValue('--slide-duration')) * 1000 || 900,
    easing: css.getPropertyValue('--ease-slide').trim() || 'ease-in-out',
  };
  let busy = false;

  const step = () => {
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    return track.firstElementChild.getBoundingClientRect().width + gap;
  };

  // Зсуває всі картки від from до to (px) і чекає завершення
  const slide = (from, to) => Promise.all(
    [...track.children].map((el) => el.animate(
      [{ transform: `translateX(${from}px)` }, { transform: `translateX(${to}px)` }], timing,
    ).finished),
  );

  const go = async (dir) => {
    if (busy) return;
    busy = true;
    const s = step();
    if (dir > 0) {
      const first = track.firstElementChild;
      track.append(first.cloneNode(true));
      await slide(0, -s);
      first.remove();
    } else {
      const last = track.lastElementChild;
      track.prepend(last.cloneNode(true));
      await slide(-s, 0);
      last.remove();
    }
    busy = false;
  };

  slider.querySelector('[data-slider-prev]')?.addEventListener('click', () => go(-1));
  slider.querySelector('[data-slider-next]')?.addEventListener('click', () => go(1));

  // Мобільний: картки гортаються пальцем, активною (помаранчевою) стає та, що зараз зліва
  const mobile = window.matchMedia('(max-width: 900px)');
  let raf = 0;
  const markActive = () => {
    raf = 0;
    const cards = [...track.children];
    if (!mobile.matches) { cards.forEach((c) => c.classList.remove('is-active')); return; }
    const start = track.getBoundingClientRect().left + (parseFloat(getComputedStyle(track).paddingLeft) || 0);
    let best = cards[0], min = Infinity;
    cards.forEach((c) => {
      const d = Math.abs(c.getBoundingClientRect().left - start);
      if (d < min) { min = d; best = c; }
    });
    cards.forEach((c) => c.classList.toggle('is-active', c === best));
  };
  const queue = () => { if (!raf) raf = requestAnimationFrame(markActive); };
  track.addEventListener('scroll', queue, { passive: true });
  mobile.addEventListener('change', queue);
  markActive();
});

// Полоска лише під останнім рядком посилання: [data-underline-last].
// Записує в CSS-змінні, де в «розгорнутій» смузі рядків починається останній рядок і яка його ширина.
document.querySelectorAll('[data-underline-last]').forEach((el) => {
  const measure = () => {
    const rects = [...el.getClientRects()];
    if (!rects.length) return;
    const last = rects[rects.length - 1].width;
    const total = rects.reduce((sum, r) => sum + r.width, 0);
    el.style.setProperty('--line-start', `${total - last}px`);
    el.style.setProperty('--line-width', `${last}px`);
  };
  measure();
  window.addEventListener('resize', measure);
  document.fonts?.ready.then(measure);
});

// Фонове відео: <video data-video-src data-video-src-mob data-poster data-poster-mob>.
// Вантажиться, лише коли блок наближається до екрана; на мобільних — легша версія.
document.querySelectorAll('[data-video-src]').forEach((v) => {
  const mobile = window.matchMedia('(max-width: 900px)');
  const load = () => {
    v.poster = mobile.matches ? v.dataset.posterMob : v.dataset.poster;
    v.src = mobile.matches ? v.dataset.videoSrcMob : v.dataset.videoSrc;
    v.play().catch(() => {});
  };
  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    load();
    mobile.addEventListener('change', load);
  }, { rootMargin: '100% 0px' });
  io.observe(v);
});

// 3D-глобус: [data-globe]. Three.js вантажиться окремим файлом, лише коли блок наближається до екрана.
document.querySelectorAll('[data-globe]').forEach((root) => {
  const io = new IntersectionObserver(async ([e]) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    try {
      const { initGlobe } = await import('./globe.js');
      initGlobe(root);
    } catch (err) { console.error('globe:', err); }
  }, { rootMargin: '100% 0px' });
  io.observe(root);
});
