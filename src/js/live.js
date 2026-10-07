// Live feeds: Solana slot (RPC getSlot), chain TVL (DefiLlama, matched by slug) and the top pairs board (DexScreener).
// Everything environmental is injected (document, fetch, timers, randomness) so the gates run it on a fast clock.
import { createPoller } from './backoff.js';
import { DASH, fmtInt, fmtPrice, fmtUsdCompact } from './fmt.js';

export const SLOT_MS = 400;               // Solana's target slot time, used to glide between polls
export const LLAMA_CHAINS = 'https://api.llama.fi/v2/chains';
export const DEX_QUERIES = ['solana', 'SOL', 'USDC', 'JUP', 'BONK'];
export const dexUrl = q => 'https://api.dexscreener.com/latest/dex/search?q=' + encodeURIComponent(q);
export const CHAIN_SLUG = 'solana';

export const slugOf = s => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function pickChainTvl(chains, slug = CHAIN_SLUG) {
  if (!Array.isArray(chains)) return null;
  const hit = chains.find(c => slugOf(c.name) === slug) || chains.find(c => slugOf(c.gecko_id) === slug);
  return hit && Number.isFinite(Number(hit.tvl)) ? Number(hit.tvl) : null;
}

// Accepts one search response or several; keeps pairs tagged for the chain, one pair per base token (its busiest), busiest first.
export function pickTopPairs(json, { chain = 'solana', limit = 8 } = {}) {
  const docs = Array.isArray(json) ? json : [json];
  const pairs = docs.flatMap(d => (d && Array.isArray(d.pairs) ? d.pairs : [])).filter(p => p && p.chainId === chain && p.baseToken && p.quoteToken && p.baseToken.address);
  const best = new Map();
  for (const p of pairs) {
    const vol = Number(p.volume && p.volume.h24) || 0, cur = best.get(p.baseToken.address);
    if (!cur || vol > cur.vol) best.set(p.baseToken.address, { id: p.pairAddress || p.baseToken.address, base: p.baseToken, quote: p.quoteToken, dex: p.dexId || '', price: p.priceUsd, vol, img: (p.info && p.info.imageUrl) || `https://dd.dexscreener.com/ds-data/tokens/${chain}/${p.baseToken.address}.png` });
  }
  return [...best.values()].sort((a, b) => b.vol - a.vol).slice(0, limit);
}

export function createLive(opts) {
  const {
    doc, fetch: fx = globalThis.fetch, rpcUrl, set = setTimeout, clear = clearTimeout, random = Math.random, now = () => Date.now(),
    raf = null, motion = true, intervals = {}, timeoutMs = 8000,
  } = opts;
  const iv = { slot: 2000, tvl: 60000, pairs: 45000, ...intervals };
  const state = { health: 'connecting', slot: null, slotAt: 0, tvl: null, pairs: [], slotFails: 0, everLive: false };
  const each = (sel, fn) => doc.querySelectorAll(sel).forEach(fn);
  const text = (name, v) => each(`[data-live="${name}"]`, el => { el.textContent = v; });
  const flash = el => { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); };

  async function getJson(url, init = {}) {
    const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = set(() => ac && ac.abort(), timeoutMs);
    try {
      const r = await fx(url, { ...init, signal: ac ? ac.signal : undefined });
      if (!r.ok) throw new Error('http ' + r.status);
      return await r.json();
    } finally { clear(t); }
  }

  // ---- health pill
  function setHealth(h) {
    if (state.health === h && doc.getElementById('health') && doc.getElementById('health').dataset.state === h) return;
    state.health = h;
    const label = { live: 'Live', connecting: 'Connecting', offline: 'Offline' }[h];
    const pill = doc.getElementById('health');
    if (pill) pill.dataset.state = h;
    each('[data-health-text]', el => { el.textContent = label; });
  }

  // ---- animated number swap (count-up when the page allows motion, straight set otherwise)
  function countTo(el, from, to, fmt, dur = 900) {
    if (!motion || !raf || from == null || from === to) { el.textContent = fmt(to); return; }
    const t0 = now();
    const step = () => {
      const k = Math.min(1, (now() - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(from + (to - from) * e);
      if (k < 1) raf(step);
    };
    raf(step);
  }

  // ---- slot
  async function slotTask() {
    const j = await getJson(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSlot', params: [{ commitment: 'confirmed' }] }) });
    if (!j || !Number.isFinite(j.result)) throw new Error('bad slot');
    state.slot = j.result; state.slotAt = now();
    each('[data-live="slot"]', el => { el.textContent = fmtInt(state.slot); flash(el); });
  }
  const slotPoll = createPoller(slotTask, { interval: iv.slot, base: 1000, max: 30000, doc, set, clear, random,
    onState: ({ ok, fails }) => {
      state.slotFails = fails;
      if (ok) { state.everLive = true; setHealth('live'); }
      else {
        if (fails >= 3) { setHealth('offline'); text('slot', DASH); state.slot = null; }
        else if (state.slot == null) text('slot', DASH);
        if (fails < 3) setHealth('connecting');
      }
    } });
  // glide: estimate the slot between polls so the number moves like the chain does
  let glideTimer = null;
  function glide() {
    glideTimer = null;
    if (state.slot != null && state.health === 'live' && !doc.hidden) {
      const est = state.slot + Math.floor((now() - state.slotAt) / SLOT_MS);
      text('slot', fmtInt(est));
    }
    glideTimer = set(glide, SLOT_MS);
  }

  // ---- tvl
  async function tvlTask() {
    const v = pickChainTvl(await getJson(LLAMA_CHAINS));
    if (v == null) throw new Error('no chain match');
    const prev = state.tvl; state.tvl = v;
    each('[data-live="tvl"]', el => { countTo(el, prev, v, fmtUsdCompact); if (prev != null && prev !== v) flash(el); });
  }
  const tvlPoll = createPoller(tvlTask, { interval: iv.tvl, base: 2000, max: 120000, doc, set, clear, random,
    onState: ({ ok }) => { if (!ok) { state.tvl = null; text('tvl', DASH); } } });

  // ---- pairs board
  const rows = () => doc.getElementById('boardRows');
  function skeletonRows(n = 8) {
    const host = rows(); if (!host) return;
    host.textContent = '';
    for (let i = 0; i < n; i++) {
      const r = doc.createElement('div'); r.className = 'brow';
      const a = doc.createElement('span'); a.className = 'skel'; a.style.width = '44px'; a.style.height = '44px';
      const b = doc.createElement('span'); b.className = 'skel'; b.style.width = '70%';
      const c = doc.createElement('span'); c.className = 'skel price'; const d = doc.createElement('span'); d.className = 'skel vol';
      r.append(a, b, c, d); host.appendChild(r);
    }
  }
  function ph(letter) { const s = doc.createElement('span'); s.className = 'ph'; s.textContent = letter; return s; }
  function paintPairs(list) {
    const host = rows(); if (!host) return;
    host.textContent = '';
    if (!list.length) { // dash fallback
      for (let i = 0; i < 3; i++) {
        const r = doc.createElement('div'); r.className = 'brow';
        const nm = doc.createElement('div'); nm.className = 'nm'; nm.textContent = DASH;
        const p = doc.createElement('span'); p.className = 'price'; p.textContent = DASH;
        const v = doc.createElement('span'); v.className = 'vol'; v.textContent = DASH;
        r.append(ph(DASH), nm, p, v); host.appendChild(r);
      }
      return;
    }
    list.forEach(p => {
      const r = doc.createElement('div'); r.className = 'brow';
      let art;
      if (p.img) { art = doc.createElement('img'); art.alt = ''; art.width = 44; art.height = 44; art.loading = 'lazy'; art.src = p.img; art.addEventListener('error', () => art.replaceWith(ph((p.base.symbol || '?').slice(0, 1).toUpperCase()))); }
      else art = ph((p.base.symbol || '?').slice(0, 1).toUpperCase());
      const nm = doc.createElement('div'); nm.className = 'nm';
      nm.textContent = `${p.base.symbol}/${p.quote.symbol}`;
      const sub = doc.createElement('small'); sub.textContent = p.dex; nm.appendChild(sub);
      const pm = doc.createElement('div'); pm.className = 'pm'; pm.textContent = fmtPrice(p.price); nm.appendChild(pm);
      const price = doc.createElement('span'); price.className = 'price'; price.textContent = fmtPrice(p.price);
      const vol = doc.createElement('span'); vol.className = 'vol'; vol.textContent = fmtUsdCompact(p.vol);
      r.append(art, nm, price, vol); host.appendChild(r);
    });
  }
  async function pairsTask() {
    const got = (await Promise.allSettled(DEX_QUERIES.map(q => getJson(dexUrl(q))))).filter(r => r.status === 'fulfilled').map(r => r.value);
    if (!got.length) throw new Error('dexscreener unreachable');
    const list = pickTopPairs(got);
    if (!list.length) throw new Error('no solana pairs');
    state.pairs = list; paintPairs(list);
    const b = doc.getElementById('board'); if (b) b.setAttribute('aria-busy', 'false');
    text('pairs', String(list.length));
  }
  const pairsPoll = createPoller(pairsTask, { interval: iv.pairs, base: 2000, max: 120000, doc, set, clear, random,
    onState: ({ ok }) => { if (!ok) { state.pairs = []; paintPairs([]); text('pairs', DASH); const b = doc.getElementById('board'); if (b) b.setAttribute('aria-busy', 'false'); } } });

  return {
    state,
    start() { skeletonRows(); slotPoll.start(); tvlPoll.start(); pairsPoll.start(); glide(); },
    stop() { slotPoll.stop(); tvlPoll.stop(); pairsPoll.stop(); if (glideTimer !== null) clear(glideTimer); },
    pollers: { slot: slotPoll, tvl: tvlPoll, pairs: pairsPoll },
    skeletonRows,
  };
}
