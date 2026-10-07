// Page motion: scroll reveal, progress bar, layered parallax, hero rain canvas, pixel icons, tabs.
// Colours are read from the CSS tokens at runtime; nothing here carries a colour literal.
export const reducedMotion = win => !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
const token = (win, name) => win.getComputedStyle(win.document.documentElement).getPropertyValue(name).trim();

export function initReveal(win) {
  const els = [...win.document.querySelectorAll('.rv')];
  if (reducedMotion(win) || !('IntersectionObserver' in win)) { els.forEach(e => e.classList.add('vis')); return; }
  const io = new win.IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('vis'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
  els.forEach(e => io.observe(e));
}

export function initStack(win) {
  const stack = win.document.querySelector('.topstack'); if (!stack) return;
  const set = () => win.document.documentElement.style.setProperty('--stack', Math.ceil(stack.getBoundingClientRect().height + 14) + 'px');
  set();
  if ('ResizeObserver' in win) new win.ResizeObserver(set).observe(stack); else win.addEventListener('resize', set);
}

export function initScroll(win) {
  const doc = win.document, bar = doc.getElementById('progress'), layers = [...doc.querySelectorAll('[data-depth]')];
  const still = reducedMotion(win);
  let queued = false;
  const paint = () => {
    queued = false;
    const y = win.scrollY, max = Math.max(1, doc.documentElement.scrollHeight - win.innerHeight);
    if (bar) bar.style.transform = `scaleX(${Math.min(1, y / max).toFixed(4)})`;
    if (!still && y < win.innerHeight * 1.3) layers.forEach(l => { l.style.transform = `translate3d(0,${(y * parseFloat(l.dataset.depth)).toFixed(1)}px,0)`; });
  };
  const on = () => { if (!queued) { queued = true; win.requestAnimationFrame(paint); } };
  win.addEventListener('scroll', on, { passive: true });
  win.addEventListener('resize', on);
  paint();
}

// Hero background: columns of base58 glyphs falling at three depths, glow on the lead glyph, pointer nudges the layers.
const GLYPHS = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function initRain(win) {
  const cv = win.document.getElementById('rain'); if (!cv) return;
  const ctx = cv.getContext('2d'); if (!ctx) return;
  const still = reducedMotion(win);
  const cols = { far: token(win, '--clay'), mid: token(win, '--amber'), near: token(win, '--gold'), head: token(win, '--white') };
  const defs = [
    { size: 13, gap: 1.7, speed: 38, alpha: .32, color: cols.far, glow: 0, depth: 10 },
    { size: 17, gap: 2.1, speed: 62, alpha: .55, color: cols.mid, glow: 0, depth: 22 },
    { size: 23, gap: 2.8, speed: 96, alpha: .95, color: cols.near, glow: 14, depth: 40 },
  ];
  let w = 0, h = 0, dpr = 1, layers = [], px = 0, last = 0, acc = 0, running = false, visible = true;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const glyph = () => GLYPHS[(Math.random() * GLYPHS.length) | 0];
  function build() {
    const r = cv.getBoundingClientRect(); w = r.width; h = r.height; dpr = Math.min(2, win.devicePixelRatio || 1);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    layers = defs.map(d => {
      const n = Math.ceil(w / (d.size * d.gap)), list = [];
      for (let i = 0; i < n; i++) list.push({ x: i * d.size * d.gap + rnd(0, d.size), y: rnd(-h, h), v: d.speed * rnd(.6, 1.4), len: Math.round(rnd(7, 18)), g: Array.from({ length: 18 }, glyph) });
      return { ...d, list };
    });
  }
  function draw(dt) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.textBaseline = 'top';
    for (const L of layers) {
      ctx.font = `700 ${L.size}px "JetBrains Mono", monospace`;
      ctx.shadowBlur = L.glow; ctx.shadowColor = L.color;
      const ox = px * L.depth;
      for (const c of L.list) {
        c.y += c.v * dt;
        if (c.y - c.len * L.size > h) { c.y = rnd(-h * .4, 0); c.v = L.speed * rnd(.6, 1.4); }
        if (Math.random() < dt * 6) c.g[0] = glyph();
        for (let i = 0; i < c.len; i++) {
          const y = c.y - i * L.size; if (y < -L.size || y > h) continue;
          ctx.globalAlpha = L.alpha * (1 - i / c.len) * (i === 0 ? 1 : .8);
          ctx.fillStyle = i === 0 ? cols.head : L.color;
          ctx.fillText(c.g[i], c.x + ox, y);
        }
      }
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  }
  function frame(t) {
    if (!running) return;
    const dt = Math.min(.05, (t - last) / 1000); last = t; acc += dt;
    if (acc >= 1 / 40) { draw(acc); acc = 0; }
    win.requestAnimationFrame(frame);
  }
  function go() { if (still || running || !visible || win.document.hidden) return; running = true; last = win.performance.now(); win.requestAnimationFrame(frame); }
  function halt() { running = false; }
  build(); draw(0.016);
  if (still) { for (let i = 0; i < 30; i++) draw(.1); return; }
  win.addEventListener('resize', () => { build(); draw(.016); });
  win.addEventListener('pointermove', e => { px = (e.clientX / win.innerWidth - .5) * 2; }, { passive: true });
  if ('IntersectionObserver' in win) new win.IntersectionObserver(es => { visible = es[0].isIntersecting; visible ? go() : halt(); }).observe(cv);
  win.document.addEventListener('visibilitychange', () => (win.document.hidden ? halt() : go()));
  go();
}

// 11x11 pixel icons, drawn in the canvas element's own CSS colour
const BITS = {
  gate: ['###########', '.#########.', '..#######..', '...#####...', '....###....', '....###....', '....###....', '....###....', '...#####...', '...#####...', '...........'],
  map: ['.....#.....', '.....#.....', '.....#.....', '...#####...', '..#..#..#..', '.#...#...#.', '#....#....#', '#....#....#', '#....#....#', '###.###.###', '###.###.###'],
  rig: ['###########', '#.........#', '#.#######.#', '#.#.....#.#', '#.#..#..#.#', '#.#.###.#.#', '#.#..#..#.#', '#.#.....#.#', '#.#######.#', '#.........#', '###########'],
  ledger: ['.#########.', '#.........#', '#.#######.#', '.#########.', '#.........#', '#.#######.#', '.#########.', '#.........#', '#.#######.#', '.#########.', '...........'],
  weights: ['...........', '.......##..', '.......##..', '...##..##..', '...##..##..', '##.##..##..', '##.##..##..', '##.##.###..', '##.##.###..', '###########', '...........'],
  swap: ['...#.......', '...##......', '#########..', '...##......', '...#.......', '...........', '.......#...', '......##...', '..#########', '......##...', '.......#...'],
};
export function initIcons(win) {
  win.document.querySelectorAll('canvas[data-icon]').forEach(cv => {
    const rows = BITS[cv.dataset.icon]; if (!rows) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    ctx.fillStyle = win.getComputedStyle(cv).color;
    rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === '#') ctx.fillRect(x, y, 1, 1); }));
  });
}

export function initTabs(doc) {
  const tabs = [...doc.querySelectorAll('[role=tab]')];
  const pick = t => tabs.forEach(o => {
    const on = o === t; o.setAttribute('aria-selected', String(on)); o.tabIndex = on ? 0 : -1;
    doc.getElementById(o.getAttribute('aria-controls')).hidden = !on;
  });
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => pick(t));
    t.addEventListener('keydown', e => {
      const k = { ArrowRight: 1, ArrowLeft: -1 }[e.key]; if (!k) return;
      const n = tabs[(i + k + tabs.length) % tabs.length]; n.focus(); pick(n); e.preventDefault();
    });
  });
}
