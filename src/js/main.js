import { initCopy } from './ca.js';
import { createLive } from './live.js';
import { initIcons, initRain, initReveal, initScroll, initStack, initTabs, reducedMotion } from './fx.js';
import { initPlan } from './plan.js';

const doc = document;
let reg = {};
try { reg = JSON.parse(doc.getElementById('register').textContent); } catch { /* the page still works without it */ }

initStack(window);
initIcons(window);
initReveal(window);
initScroll(window);
initTabs(doc);
initCopy(doc);
initPlan(window);
initRain(window);

const rpcUrl = reg.rpc && reg.rpc.state === 'stated' ? reg.rpc.url : null;
if (rpcUrl) {
  createLive({ doc, fetch: window.fetch.bind(window), rpcUrl, raf: window.requestAnimationFrame.bind(window), motion: !reducedMotion(window), set: window.setTimeout.bind(window), clear: window.clearTimeout.bind(window) }).start();
} else {
  doc.querySelectorAll('[data-health-text]').forEach(el => { el.textContent = 'Offline'; });
  const pill = doc.getElementById('health'); if (pill) pill.dataset.state = 'offline';
}
