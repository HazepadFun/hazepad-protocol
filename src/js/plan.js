// Route map (hero panel), simulator and draft builder. All figures come from the visitor's own inputs.
import { fmtInt } from './fmt.js';

export const ROUTES = [
  { id: 'pool', name: 'Pool hash', sub: 'RENTED CAPACITY' },
  { id: 'rigs', name: 'Owned rigs', sub: 'HOSTED MACHINES' },
  { id: 'market', name: 'Hash market', sub: 'OPEN SPOT POWER' },
  { id: 'reserve', name: 'Reserve', sub: 'HELD, NOT ROUTED' },
  { id: 'drop', name: 'Holder drop', sub: 'PAID STRAIGHT OUT' },
];
export const MAX_ROUTES = 4, STEP = 5;
const SWATCH = ['--gold', '--flame', '--sky', '--moss', '--mist'];

export const volumeOf = v => Math.round(Math.pow(10, 4 + 3 * v / 100) / 1000) * 1000;
export const cutOf = n => n * 0.25;
export const total = plan => Object.values(plan).reduce((a, b) => a + b, 0);
export const activeRoutes = plan => ROUTES.filter(r => plan[r.id] > 0);

// pure step function so the gates can drive it without a DOM
export function stepPlan(plan, id, delta) {
  const cur = plan[id] || 0, tot = total(plan);
  if (delta > 0) {
    if (tot >= 100) return { plan, warn: 'Take from another route first' };
    if (!cur && activeRoutes(plan).length >= MAX_ROUTES) return { plan, warn: 'Four routes at most' };
    return { plan: { ...plan, [id]: Math.min(100, cur + Math.min(delta, 100 - tot)) } };
  }
  const next = Math.max(0, cur + delta), p = { ...plan, [id]: next };
  if (!next) delete p[id];
  return { plan: p };
}

export function simulate(plan, volume, cutPct) {
  const collected = volume * cutPct / 100;
  const lines = activeRoutes(plan).map(r => ({ id: r.id, name: r.name, share: plan[r.id], amount: collected * plan[r.id] / 100 }));
  const toRigs = lines.filter(l => !['reserve', 'drop'].includes(l.id)).reduce((a, l) => a + l.amount, 0);
  return { collected, lines, toRigs };
}
const usd = n => '$' + fmtInt(n);

export function initPlan(win) {
  const doc = win.document, $ = s => doc.querySelector(s);
  const colour = i => win.getComputedStyle(doc.documentElement).getPropertyValue(SWATCH[i % SWATCH.length]).trim();
  let plan = { pool: 40, rigs: 25, market: 20, reserve: 15 };
  let hintTimer = 0;

  function warn(msg) {
    const h = $('#pHint'); h.textContent = msg; h.classList.add('warn');
    win.clearTimeout(hintTimer);
    hintTimer = win.setTimeout(() => { h.textContent = 'Four routes at most · slices fill the full 100%'; h.classList.remove('warn'); }, 1600);
  }
  function render() {
    const tot = total(plan), act = activeRoutes(plan);
    $('#pTot').textContent = tot + '%'; $('#pTot').classList.toggle('bad', tot !== 100);
    const host = $('#pRows'); host.textContent = '';
    ROUTES.forEach(r => {
      const v = plan[r.id] || 0, row = doc.createElement('div');
      row.className = 'mrow ' + (v ? 'on' : 'off'); row.dataset.id = r.id;
      const nm = doc.createElement('div'); nm.className = 'nm'; nm.textContent = r.name;
      const sub = doc.createElement('small'); sub.textContent = r.sub; nm.appendChild(sub);
      const mk = (label, d, aria) => { const b = doc.createElement('button'); b.type = 'button'; b.dataset.d = d; b.textContent = label; b.setAttribute('aria-label', `${aria} ${r.name}`); return b; };
      const val = doc.createElement('b'); val.textContent = v + '%';
      row.append(nm, mk('−', -STEP, 'Less to'), val, mk('+', STEP, 'More to'));
      host.appendChild(row);
    });
    const bar = $('#pBar'); bar.textContent = '';
    act.forEach((r, i) => { const s = doc.createElement('i'); s.style.width = plan[r.id] + '%'; s.style.background = colour(i); bar.appendChild(s); });
    renderSum(); renderSim();
  }
  $('#pRows').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const r = stepPlan(plan, b.closest('.mrow').dataset.id, +b.dataset.d);
    if (r.warn) warn(r.warn);
    plan = r.plan; render();
  });

  function renderSum() {
    const s = $('#sum'); s.textContent = '';
    const h = doc.createElement('h5'); h.textContent = 'YOUR DRAFT ROUTES'; s.appendChild(h);
    const act = activeRoutes(plan);
    if (!act.length) { const p = doc.createElement('p'); p.className = 'fine'; p.textContent = 'No routes yet. Add shares in the route map.'; s.appendChild(p); }
    act.forEach((r, i) => {
      const ln = doc.createElement('div'); ln.className = 'ln';
      const sw = doc.createElement('span'); sw.className = 'sw'; sw.style.background = colour(i);
      const nm = doc.createElement('span'); nm.textContent = r.name;
      const em = doc.createElement('em'); em.textContent = plan[r.id] + '%';
      ln.append(sw, nm, em); s.appendChild(ln);
    });
  }

  function renderSim() {
    const vol = volumeOf(+$('#vol').value), cut = cutOf(+$('#cut').value);
    $('#cVol').textContent = usd(vol); $('#cCut').textContent = cut.toFixed(2) + '%';
    const sim = simulate(plan, vol, cut), out = $('#simOut'); out.textContent = '';
    const row = (k, v) => { const d = doc.createElement('div'); const s = doc.createElement('span'); s.textContent = k; const b = doc.createElement('b'); b.textContent = v; d.append(s, b); out.appendChild(d); };
    row('Cut collected / day', usd(sim.collected));
    sim.lines.forEach(l => row(`${l.name} · ${l.share}%`, usd(l.amount)));
    row('Reaches the rigs / day', usd(sim.toRigs));
  }
  $('#vol').addEventListener('input', renderSim); $('#cut').addEventListener('input', renderSim);

  // draft form
  $('#draftForm').addEventListener('submit', e => {
    e.preventDefault();
    const name = $('#cName').value.trim(), tick = $('#cTick').value.trim().toUpperCase().replace(/^\$/, ''), err = $('#err'), tkt = $('#tkt');
    err.textContent = ''; tkt.hidden = true;
    if (!name) return void (err.textContent = 'Give the token a name.');
    if (!/^[A-Z0-9]{2,10}$/.test(tick)) return void (err.textContent = 'Symbol: 2 to 10 letters or digits.');
    if (total(plan) !== 100) return void (err.textContent = 'Route shares must total 100%.');
    const lines = activeRoutes(plan).map(r => `  ${r.name}: ${plan[r.id]}%`).join('\n');
    $('#draftText').textContent = `HAZEPAD DRAFT\nName: ${name}\nTicker: $${tick}\nRoutes:\n${lines}`;
    tkt.hidden = false;
  });
  $('#copyDraft').addEventListener('click', async () => {
    const b = $('#copyDraft'), t = $('#draftText').textContent;
    try { await win.navigator.clipboard.writeText(t); b.textContent = 'COPIED'; } catch { b.textContent = 'COPY FAILED'; }
    win.setTimeout(() => { b.textContent = 'COPY DRAFT'; }, 1600);
  });

  render();
}
