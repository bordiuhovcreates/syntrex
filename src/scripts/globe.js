// Блок 7 — інтерактивний 3D-глобус (Three.js) у темному «кінематографічному» стилі:
// планета з рельєфом суші, легкими хмарами, світлом зверху зліва і м'яким світінням атмосфери.
// Повільно обертається, крутиться мишею/пальцем з інерцією.
// Локації (data-hubs) з'являються по черзі: маркер із логотипом + назва міста з ефектом «перебору літер».
// Локації не накладаються: видно лише ті, що повернуті до глядача і мають вільне місце
// (підпис праворуч або ліворуч від маркера); решта з'являються, коли глобус повертається.
//
// Розмітка: <div data-globe data-hubs='[{"city","country","lat","lon"}]' data-logo="/images/logo.svg">
// Модуль вантажиться лише коли блок наближається до екрана (див. interactive.js).
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, SphereGeometry, ShaderMaterial,
  CanvasTexture, DataTexture, RGBAFormat, RepeatWrapping, LinearFilter, Vector3, Clock, MathUtils,
} from 'three';
import { feature } from 'topojson-client';
import landTopo from 'world-atlas/land-110m.json';
import { gsap } from 'gsap';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';

gsap.registerPlugin(ScrambleTextPlugin);

const rad = (d) => (d * Math.PI) / 180;
const toXYZ = (lat, lon, r = 1) => new Vector3(
  r * Math.cos(rad(lat)) * Math.sin(rad(lon)), r * Math.sin(rad(lat)), r * Math.cos(rad(lat)) * Math.cos(rad(lon)),
);

// Суша: контури світу малюються в рівнопроміжну карту (2048×1024) і стають текстурою
function landTexture() {
  const land = feature(landTopo, landTopo.objects.land);
  const W = 2048, H = 1024;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#fff';
  for (const f of land.features) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of polys) for (const shift of [-360, 0, 360]) {
      g.beginPath();
      for (const ring of poly) {
        let prev = null, off = 0;
        ring.forEach(([lon, lat], i) => {
          if (prev !== null && Math.abs(lon - prev) > 180) off += lon > prev ? -360 : 360;
          prev = lon;
          g[i ? 'lineTo' : 'moveTo'](((lon + off + shift + 180) / 360) * W, ((90 - lat) / 180) * H);
        });
        // Антарктида йде по колу: замикаємо її через південний полюс
        const a = ring[0][0], b = ring[ring.length - 1][0] + off;
        if (Math.abs(b - a) > 300) { g.lineTo(((b + shift + 180) / 360) * W, H); g.lineTo(((a + shift + 180) / 360) * W, H); }
        g.closePath();
      }
      g.fill('evenodd');
    }
  }
  const tex = new CanvasTexture(c);
  tex.minFilter = LinearFilter; tex.generateMipmaps = false; // без шва на 180°
  return tex;
}

// Безшовна текстура шуму 512×512 (3 октави). Рахується один раз — шейдер лише читає з неї,
// тож планета малюється швидко навіть на слабких ноутбуках
function noiseTexture(size = 512) {
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const octaves = [[16, 0.55], [32, 0.3], [64, 0.15]].map(([n, amp]) => {
    const grid = new Float32Array(n * n).map(() => rnd());
    return { n, amp, grid };
  });
  const smooth = (t) => t * t * (3 - 2 * t);
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      for (const { n, amp, grid } of octaves) {
        const fx = (x / size) * n, fy = (y / size) * n;
        const ix = Math.floor(fx), iy = Math.floor(fy);
        const tx = smooth(fx - ix), ty = smooth(fy - iy);
        const x1 = (ix + 1) % n, y1 = (iy + 1) % n;
        const a = grid[iy * n + ix], b = grid[iy * n + x1], c = grid[y1 * n + ix], d = grid[y1 * n + x1];
        v += amp * (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty);
      }
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = Math.round(v * 255); data[i + 3] = 255;
    }
  }
  const tex = new DataTexture(data, size, size, RGBAFormat);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.minFilter = tex.magFilter = LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

// Зоряне небо: дрібне зерно + рідкісні зірки різного розміру
function stars(root) {
  const c = document.createElement('canvas');
  c.className = 'globe__stars';
  root.prepend(c);
  const draw = () => {
    const dpr = Math.min(devicePixelRatio, 2), w = root.clientWidth, h = root.clientHeight;
    c.width = w * dpr; c.height = h * dpr;
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647); // те саме небо при кожному resize
    for (let i = 0; i < (w * h) / 120; i++) { g.fillStyle = `rgba(255,255,255,${rnd() * 0.05})`; g.fillRect(rnd() * w, rnd() * h, 1, 1); }
    for (let i = 0; i < (w * h) / 2600; i++) {
      const r = Math.pow(rnd(), 4) * 1.2 + 0.3;
      g.fillStyle = `rgba(255,255,255,${0.15 + rnd() * 0.6})`;
      g.beginPath(); g.arc(rnd() * w, rnd() * h, r, 0, Math.PI * 2); g.fill();
    }
  };
  new ResizeObserver(draw).observe(root);
  return c;
}

const overlaps = (a, b, pad) => a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;

export function initGlobe(root) {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hubs = JSON.parse(root.dataset.hubs || '[]');
  const logo = root.dataset.logo || '';

  const sky = stars(root);
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.domElement.className = 'globe__canvas';
  sky.after(renderer.domElement);

  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.z = 5.2;

  // tilt — нахил, spin — обертання. Старт: Атлантика і Європа, як у Figma
  const tilt = new Group(), spin = new Group();
  tilt.rotation.x = rad(14); spin.rotation.y = rad(20);
  tilt.add(spin); scene.add(tilt);

  const light = new Vector3(-0.65, 0.55, 0.55).normalize(); // світло зверху зліва (у просторі камери)

  // Планета
  const planet = new Mesh(new SphereGeometry(1, 128, 128), new ShaderMaterial({
    uniforms: { uLand: { value: landTexture() }, uNoise: { value: noiseTexture() }, uTime: { value: 0 }, uLight: { value: light } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ vP = position; vec4 p = modelViewMatrix * vec4(position, 1.);
        vN = normalize(normalMatrix * normal); vV = normalize(-p.xyz); gl_Position = projectionMatrix * p; }`,
    fragmentShader: `uniform sampler2D uLand; uniform sampler2D uNoise; uniform float uTime; uniform vec3 uLight;
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      float tri(vec3 p, float k){
        vec3 w = pow(abs(normalize(p)), vec3(4.)); w /= w.x + w.y + w.z;
        return texture2D(uNoise, p.yz * k).r * w.x + texture2D(uNoise, p.zx * k).r * w.y + texture2D(uNoise, p.xy * k).r * w.z;
      }
      void main(){
        vec3 p = normalize(vP);
        vec2 uv = vec2(atan(p.x, p.z) / 6.2831853 + .5, asin(clamp(p.y, -1., 1.)) / 3.1415926 + .5);
        float raw = texture2D(uLand, uv).r;
        float land = smoothstep(.35, .65, raw);
        float coast = 1. - abs(raw * 2. - 1.); // тонка смуга вздовж узбережжя
        // шум береться з трьох проєкцій (а не з широти/довготи) — без «променів» на полюсах
        float t1 = tri(p, 1.6);
        float t2 = tri(p, 7.);
        float lat = asin(clamp(p.y, -1., 1.)), lon = atan(p.x, p.z);

        // океан — майже чорний з легкою глибиною; суша — темний графіт з рельєфом
        vec3 ocean = vec3(.006, .008, .012) + vec3(.008, .011, .016) * t1;
        vec3 ground = mix(vec3(.07, .072, .078), vec3(.16, .16, .165), t1) * (.8 + .4 * t2);
        vec3 col = mix(ocean, ground, land);

        // точкова сітка на суші: рівномірні точки (крок ~0.9°), м'яко згладжені
        vec2 g = vec2(lon * cos(lat), lat) * (180. / 3.1415926 / .9);
        float d = length(fract(g) - .5);
        float aa = fwidth(d);
        float dots = smoothstep(.24 + aa, .24 - aa, d) * land;
        col += dots * vec3(.5, .52, .56) * (.55 + .45 * t2);

        // світлий контур узбережжя
        col += coast * vec3(.45, .5, .6) * .55;

        // ледь помітні меридіани й паралелі кожні 20°
        vec2 gl = abs(fract(vec2(lon, lat) * (180. / 3.1415926 / 20.)) - .5);
        vec2 gw = fwidth(vec2(lon, lat) * (180. / 3.1415926 / 20.));
        float grid = max(smoothstep(gw.x * 1.2, 0., .5 - gl.x), smoothstep(gw.y * 1.2, 0., .5 - gl.y));
        col += grid * vec3(.35, .4, .5) * .06;

        // тонкі хмари, що повільно пливуть
        float cl = tri(p + vec3(uTime * .006, 0., 0.), 1.1) * .65 + tri(p - vec3(0., 0., uTime * .009), 2.8) * .35;
        col = mix(col, vec3(.7, .72, .76), smoothstep(.62, .82, cl) * .12);
        // світло і нічна сторона
        float nl = dot(vN, uLight);
        col *= .035 + 1.3 * smoothstep(-.25, .85, nl);
        // відблиск на океані
        vec3 hv = normalize(uLight + vV);
        col += pow(max(dot(vN, hv), 0.), 60.) * (1. - land) * .4 * vec3(.85, .9, 1.);
        gl_FragColor = vec4(col, 1.);
      }`,
  }));
  spin.add(planet);


  // Маркери локацій (HTML поверх canvas, позиція рахується щокадру)
  const layer = document.createElement('div');
  layer.className = 'globe__layer';
  root.append(layer);
  let hovered = false;
  const pins = hubs.map((hub) => {
    const el = document.createElement('div');
    el.className = 'globe-pin is-hidden';
    el.innerHTML = `<span class="globe-pin__dot">${logo ? `<img src="${logo}" alt="" />` : ''}</span>
      <span class="globe-pin__tag"><span class="globe-pin__label">
        <span class="globe-pin__city"></span><span class="globe-pin__country">${hub.country || ''}</span>
      </span></span>`;
    el.setAttribute('aria-label', `${hub.city}, ${hub.country || ''}`);
    layer.append(el);
    const dot = el.querySelector('.globe-pin__dot');
    dot.addEventListener('pointerenter', () => { el.classList.add('is-hover'); hovered = true; });
    dot.addEventListener('pointerleave', () => { el.classList.remove('is-hover'); hovered = false; });
    dot.addEventListener('pointerdown', (e) => e.stopPropagation());
    return {
      el, hub, v: toXYZ(hub.lat, hub.lon, 1.01), z: 0, x: 0, y: 0, vis: 0, side: null, shown: false,
      city: el.querySelector('.globe-pin__city'), tag: el.querySelector('.globe-pin__tag'),
    };
  });

  // Розміри маркера і підписів (для розстановки без накладань) — міряємо з фінальним текстом
  let M = 50, GAP = 10, introDone = false;
  const measure = () => {
    M = pins[0] ? pins[0].el.querySelector('.globe-pin__dot').offsetWidth || M : M;
    GAP = M * 0.2;
    for (const p of pins) {
      const cur = p.city.textContent;
      p.city.textContent = p.hub.city;
      p.w = p.tag.offsetWidth; p.h = p.tag.offsetHeight;
      if (!introDone) p.city.textContent = cur;
    }
  };

  // Перетягування з інерцією
  let vx = 0, vy = 0, drag = null;
  root.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY };
    root.setPointerCapture(e.pointerId);
    root.classList.add('is-drag');
  });
  root.addEventListener('pointermove', (e) => {
    if (!drag) return;
    vx = (e.clientX - drag.x) * 0.005; vy = (e.clientY - drag.y) * 0.005;
    spin.rotation.y += vx;
    tilt.rotation.x = MathUtils.clamp(tilt.rotation.x + vy, -0.9, 0.9);
    drag = { x: e.clientX, y: e.clientY };
  });
  const end = () => { drag = null; root.classList.remove('is-drag'); };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);

  // Розмір: глобус 760 px на макеті 970×1080, центр трохи нижче середини (під текстом зверху)
  let W = 0, H = 0;
  const size = () => {
    W = root.clientWidth; H = root.clientHeight;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    // телефон/планшет: планета майже на всю ширину, трохи нижче тексту зверху
    const phone = matchMedia('(max-width: 900px)').matches;
    const d = phone ? Math.min(W * 0.9, H * 0.78) : 760 * Math.min(W / 970, H / 1080);
    camera.fov = (2 * Math.atan((H / d) / Math.sqrt(camera.position.z ** 2 - 1)) * 180) / Math.PI;
    camera.setViewOffset(W, H, 0, -H * (phone ? 0.09 : 0.07), W, H);
    camera.updateProjectionMatrix();
    measure();
  };
  new ResizeObserver(size).observe(root);
  size();
  document.fonts.ready.then(measure); // ширина підписів — з фінальним шрифтом

  // Поява: планета «випливає» знизу і докручується, потім по черзі з'являються локації
  const intro = { y: still ? 0 : -0.3, s: still ? 1 : 0.88, r: still ? 0 : -0.9 };
  renderer.domElement.style.opacity = still ? '1' : '0';
  let introStarted = false;
  const startIntro = () => {
    if (introStarted) return;
    introStarted = true;
    const tl = gsap.timeline({ onComplete: () => { introDone = true; } });
    if (!still) {
      tl.to(renderer.domElement, { opacity: 1, duration: 1.6, ease: 'power2.out' }, 0)
        .to(intro, { y: 0, s: 1, r: 0, duration: 2.6, ease: 'expo.out' }, 0);
    }
    // спершу ті, що будуть спереду, коли планета докрутиться
    const order = [...pins].sort((a, b) => b.z - a.z);
    order.forEach((p, i) => {
      const at = still ? 0 : 1.2 + i * 0.18;
      tl.call(() => { p.shown = true; p.el.classList.add('is-in'); }, null, at);
      tl.fromTo(p.el.querySelector('.globe-pin__dot'), { scale: 0 }, { scale: 1, duration: still ? 0 : 0.8, ease: 'back.out(1.8)' }, at);
      tl.fromTo(p.el.querySelector('.globe-pin__label'), { autoAlpha: 0, x: -8 }, { autoAlpha: 1, x: 0, duration: still ? 0 : 0.6, ease: 'power3.out' }, at + 0.12);
      if (still) p.city.textContent = p.hub.city;
      else tl.to(p.city, { duration: 1, ease: 'none', scrambleText: { text: p.hub.city, chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', speed: 0.5, revealDelay: 0.2 } }, at + 0.12);
    });
  };

  let visible = false;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0 }).observe(root);
  new IntersectionObserver(([e]) => { if (e.isIntersecting) startIntro(); }, { threshold: 0.35 }).observe(root);

  // Розстановка: показуємо лише локації, повернуті до глядача. Найближчі до центру — першими.
  // Маркер з підписом (праворуч, інакше ліворуч) ставиться, тільки якщо ні з чим не перетинається;
  // інакше локація плавно ховається і з'явиться, коли глобус повернеться і місце звільниться.
  const layout = () => {
    const front = pins.filter((p) => p.shown && p.vis > 0.5).sort((a, b) => b.z - a.z);
    const placed = [];
    const inside = (r) => r.x >= 8 && r.x + r.w <= W - 8 && r.y >= 8 && r.y + r.h <= H - 8;
    for (const p of front) {
      const pad = p.side ? 6 : 16; // гістерезис: щоб локації не «блимали» на межі
      const free = (r) => !placed.some((q) => overlaps(r, q, pad));
      const dot = { x: p.x - M / 2, y: p.y - M / 2, w: M, h: M };
      const right = { x: p.x + M / 2 + GAP, y: p.y - p.h / 2, w: p.w, h: p.h };
      const left = { x: p.x - M / 2 - GAP - p.w, y: right.y, w: p.w, h: p.h };
      p.next = null;
      if (!free(dot)) continue;
      const tries = p.side === 'left' ? [['left', left], ['right', right]] : [['right', right], ['left', left]];
      const ok = tries.find(([, r]) => inside(r) && free(r));
      if (!ok) continue;
      p.next = ok[0];
      placed.push(dot, ok[1]);
    }
    for (const p of pins) {
      const next = front.includes(p) ? p.next : null;
      if (next === p.side) continue;
      p.side = next;
      p.el.classList.toggle('is-left', next === 'left');
      p.el.classList.toggle('is-hidden', next === null);
    }
  };

  const tmp = new Vector3();
  const clock = new Clock();
  const frame = () => {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!visible) return;
    if (!drag) {
      vx *= 0.93; vy *= 0.93;
      spin.rotation.y += vx + (still || hovered ? 0 : dt * 0.045);
      tilt.rotation.x = MathUtils.clamp(tilt.rotation.x + vy, -0.9, 0.9);
    }
    // інтро: зсув вниз, масштаб і докручування поверх поточного обертання
    tilt.position.y = intro.y; tilt.scale.setScalar(intro.s);    const spinY = spin.rotation.y; spin.rotation.y = spinY + intro.r;
    planet.material.uniforms.uTime.value = still ? 0 : clock.elapsedTime;
    renderer.render(scene, camera);

    for (const p of pins) {
      tmp.copy(p.v); spin.localToWorld(tmp);
      p.z = tmp.z / intro.s;
      tmp.project(camera);
      p.x = ((tmp.x + 1) / 2) * W; p.y = ((1 - tmp.y) / 2) * H;
      // показуємо лише ту частину планети, що повернута до глядача; біля краю — плавно ховаємо
      p.vis = MathUtils.smoothstep(p.z, 0.3, 0.5);
      p.el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
      p.el.style.opacity = p.vis.toFixed(3);
      p.el.classList.toggle('is-back', p.vis < 0.02);
    }
    spin.rotation.y = spinY;
    layout();
  };
  frame();
}
