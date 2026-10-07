// Poller: runs an async task on an interval, backs off exponentially with jitter after failures,
// stops while the tab is hidden and fires straight away when it comes back.
// All time and randomness is injected so the gates can run it on a fast clock.
export function nextDelay(fails, { base = 1000, max = 30000, random = Math.random } = {}) {
  const cap = Math.min(max, base * 2 ** Math.max(0, fails - 1));
  return Math.round(cap / 2 + random() * cap / 2); // jitter keeps the upper half of the window
}

export function createPoller(task, opts = {}) {
  const { interval = 5000, base = 1000, max = 30000, doc = globalThis.document, set = setTimeout, clear = clearTimeout, random = Math.random, onState = () => {} } = opts;
  let timer = null, fails = 0, running = false, stopped = true;
  const hidden = () => !!(doc && doc.hidden);

  async function tick() {
    timer = null;
    if (stopped || hidden()) return;
    running = true;
    let ok = true;
    try { await task(); } catch { ok = false; }
    running = false;
    fails = ok ? 0 : fails + 1;
    onState({ ok, fails });
    schedule();
  }
  function schedule() {
    if (stopped || hidden() || timer !== null) return;
    const d = fails ? nextDelay(fails, { base, max, random }) : interval;
    timer = set(tick, d);
    api.lastDelay = d;
  }
  function onVis() {
    if (stopped) return;
    if (hidden()) { if (timer !== null) { clear(timer); timer = null; } }
    else if (timer === null && !running) { timer = set(tick, 0); api.lastDelay = 0; }
  }
  const api = {
    lastDelay: 0,
    get fails() { return fails; },
    start() { if (!stopped) return; stopped = false; if (doc && doc.addEventListener) doc.addEventListener('visibilitychange', onVis); if (!hidden()) { timer = set(tick, 0); api.lastDelay = 0; } },
    stop() { stopped = true; if (timer !== null) { clear(timer); timer = null; } if (doc && doc.removeEventListener) doc.removeEventListener('visibilitychange', onVis); },
  };
  return api;
}
