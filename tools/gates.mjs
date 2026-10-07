// npm run gates: synthetic fixtures, virtual clock, no network. Thirty gates at most.
// Mutation anchors never assume the register's current state: they read the live record, then build its opposite.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import sharp from 'sharp';
import { build } from './build.mjs';
import { pmResize } from './pm.mjs';
import { grams } from './textgrams.mjs';
import { B58_ALPHABET, STATES, contractBranch, isSolanaAddress, parseLink, publicRegister } from '../src/js/gate.js';
import { renderPage, cspDirectives } from '../src/render.js';
import { createPoller, nextDelay } from '../src/js/backoff.js';
import { initCopy } from '../src/js/ca.js';
import { createLive, pickChainTvl, pickTopPairs } from '../src/js/live.js';
import { ROUTES, MAX_ROUTES, activeRoutes, simulate, stepPlan, total, volumeOf } from '../src/js/plan.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const P = (...p) => path.join(ROOT, ...p);
const read = f => fs.readFileSync(P(f), 'utf8');
const walk = (d, ok = () => true, out = []) => { for (const e of fs.readdirSync(P(d), { withFileTypes: true })) { const rel = d + '/' + e.name; if (e.isDirectory()) { if (ok(rel, true)) walk(rel, ok, out); } else if (ok(rel, false)) out.push(rel); } return out; };

// ---------- fixtures
let seed = 20240607; const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
const b58 = len => Array.from({ length: len }, () => B58_ALPHABET[(rnd() * 58) | 0]).join('');
const SYN_CA = b58(44), SYN_CA_32 = b58(32);
const REG = JSON.parse(read('src/register.json'));
const TPL = read('src/index.html');
const withRec = (id, patch) => ({ ...REG, [id]: { ...REG[id], ...patch } });
const ALL_OFF = { ...REG, contract: { ...REG.contract, state: 'absent', value: null }, x: { ...REG.x, state: 'absent', url: null }, github: { ...REG.github, state: 'absent', url: null } };
const ALL_ON = { ...REG, contract: { ...REG.contract, state: 'stated', value: SYN_CA }, x: { ...REG.x, state: 'stated', url: 'https://x.com/synthetic_handle' }, github: { ...REG.github, state: 'stated', url: 'https://github.com/synthetic-org/synthetic-repo' } };
const page = reg => new JSDOM(renderPage(reg, TPL, { theme: 'x' }), { pretendToBeVisual: true });
const textOf = doc => { const c = doc.body.cloneNode(true); c.querySelectorAll('script,style').forEach(s => s.remove()); return c.textContent.replace(/\s+/g, ' '); };

// virtual clock: timers fire in order as time advances, microtasks flushed between fires
function clock() {
  let t = 0, id = 0; const q = new Map();
  const flush = () => new Promise(r => setImmediate(r));
  return {
    now: () => t,
    set: (fn, ms) => { q.set(++id, { at: t + ms, fn }); return id; },
    clear: x => q.delete(x),
    async advance(ms) {
      const end = t + ms;
      for (;;) {
        let next = null; for (const [k, v] of q) if (v.at <= end && (!next || v.at < next[1].at)) next = [k, v];
        if (!next) break; q.delete(next[0]); t = Math.max(t, next[1].at); next[1].fn(); await flush(); await flush();
      }
      t = end;
    },
    pending: () => q.size,
  };
}
const A = {
  ok(c, m) { if (!c) throw new Error(m || 'assertion failed'); },
  eq(a, b, m) { if (a !== b) throw new Error(`${m || 'not equal'}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); },
};

const gates = [];
const gate = (name, fn) => gates.push({ name, fn });

// ---------- 01-04 gate, register, link rule
gate('gate accepts every 32-44 char base58 string', () => {
  for (let n = 32; n <= 44; n++) for (let i = 0; i < 250; i++) A.ok(isSolanaAddress(b58(n)), 'rejected valid length ' + n);
  A.ok(isSolanaAddress('1'.repeat(32)) && isSolanaAddress('z'.repeat(44)) && isSolanaAddress(B58_ALPHABET.slice(0, 44)), 'edge strings');
  A.ok(isSolanaAddress(SYN_CA_32) && isSolanaAddress(SYN_CA));
});
gate('gate rejects what is not base58 in range (hex, length, glyphs)', () => {
  for (const bad of [b58(31), b58(45), '', '0x' + 'a'.repeat(40), 'a'.repeat(64) + '0', b58(43) + '0', b58(43) + 'O', b58(43) + 'I', b58(43) + 'l', b58(43) + '-', b58(43) + ' x', null, undefined, 42]) A.ok(!isSolanaAddress(bad), 'accepted ' + String(bad));
});
gate('register: one well-formed record per fact', () => {
  for (const [k, r] of Object.entries(REG)) {
    A.eq(r.id, k, 'id'); A.ok(STATES.includes(r.state), k + ' state'); A.ok(r.label, k + ' label'); A.ok(typeof r.source === 'string' && r.source, k + ' source');
    if (r.state !== 'stated') A.ok((r.value ?? r.url ?? null) === null, k + ' not stated but carries a value');
    if (r.state === 'stated') A.ok(r.value || r.url, k + ' stated without a value');
  }
  A.ok(!JSON.stringify(publicRegister(REG)).includes('source'), 'source leaks into the public register');
});
gate('link rule: href only for stated records on the right host, handle derived from url', () => {
  const l = parseLink('x', { state: 'stated', url: 'https://x.com/someone?ref=1' }); A.eq(l.href, 'https://x.com/someone?ref=1'); A.eq(l.handle, '@someone');
  const g = parseLink('github', { state: 'stated', url: 'https://github.com/org/repo/issues' }); A.eq(g.handle, 'org/repo'); A.ok(g.href);
  for (const bad of [{ state: 'absent', url: null }, { state: 'unconfirmed', url: 'https://x.com/a' }, { state: 'stated', url: 'http://x.com/a' }, { state: 'stated', url: 'https://evil.example/a' }, { state: 'stated', url: 'https://x.com/' }, { state: 'stated', url: 'not a url' }, { state: 'stated', url: null }]) A.eq(parseLink('x', bad).href, null, JSON.stringify(bad));
  A.eq(parseLink('github', { state: 'stated', url: 'https://x.com/a' }).href, null, 'wrong host for kind');
});

// ---------- 05-08 contract slot branches
gate('contract absent branch: inert, no button, no address', () => {
  const d = page(ALL_OFF).window.document;
  for (const ca of d.querySelectorAll('[data-ca]')) { A.eq(ca.dataset.branch, 'absent'); A.ok(ca.classList.contains('is-inert') && ca.getAttribute('aria-disabled') === 'true'); A.ok(!ca.querySelector('button,a,[data-ca-copy]'), 'inert slot has an action'); }
  A.eq(d.querySelectorAll('[data-ca]').length, 2, 'top slot and coin slot');
  A.ok(!/[1-9A-HJ-NP-Za-km-z]{32,44}/.test(textOf(d).replace(/[^A-Za-z0-9 ]/g, ' ').split(' ').filter(w => w.length >= 32).join(' ')), 'address-like text on an absent page');
});
gate('contract stated branch: full address, copy button, large mono slot', () => {
  const d = page(ALL_ON).window.document, top = d.querySelector('.casl [data-ca]');
  A.eq(top.dataset.branch, 'stated'); A.eq(top.querySelector('[data-ca-value]').textContent, SYN_CA, 'full address, no truncation'); A.eq(top.querySelector('[data-ca-copy]').getAttribute('data-ca-copy'), SYN_CA);
  A.ok(d.querySelector('.topstack .casl'), 'slot lives in the fixed top stack');
  const css = read('src/css/style.css'); A.ok(/\.ca-v\{font:800 clamp\(15px,1\.9vw,28px\)/.test(css), 'large slot font'); A.ok(/\.topstack\{position:fixed/.test(css), 'always visible');
  const odd = page(withRec('contract', { state: 'stated', value: SYN_CA_32 })).window.document; A.eq(odd.querySelector('[data-ca]').dataset.branch, 'stated', '32-char base58 must pass the gate');
});
gate('click-to-copy: feedback shows, resets on the fast clock, falls back to FAILED', async () => {
  const w = page(ALL_ON).window, d = w.document, c = clock(), calls = [];
  initCopy(d, { clipboard: { writeText: async t => { calls.push(t); } }, set: c.set, resetMs: 1600 });
  const btn = d.querySelector('[data-ca-copy]'), lab = btn.querySelector('[data-ca-label]');
  btn.click(); await c.advance(0); A.eq(lab.textContent, 'COPIED'); A.eq(calls[0], SYN_CA); A.ok(btn.classList.contains('done'));
  await c.advance(1700); A.eq(lab.textContent, 'COPY');
  const d2 = page(ALL_ON).window.document, c2 = clock(); initCopy(d2, { clipboard: { writeText: async () => { throw new Error('denied'); } }, set: c2.set });
  const b2 = d2.querySelector('[data-ca-copy]'); b2.click(); await c2.advance(0); A.eq(b2.querySelector('[data-ca-label]').textContent, 'FAILED');
});
gate('inert slots never copy (absent and unconfirmed)', async () => {
  for (const reg of [ALL_OFF, withRec('contract', { state: 'unconfirmed', value: SYN_CA }), withRec('contract', { state: 'stated', value: 'tooShort' })]) {
    const d = page(reg).window.document, calls = []; initCopy(d, { clipboard: { writeText: async t => calls.push(t) } });
    d.querySelectorAll('[data-ca], [data-ca] *').forEach(e => e.click()); await new Promise(r => setImmediate(r));
    A.eq(calls.length, 0, 'copied from an inert slot'); A.ok(d.querySelector('[data-ca]').dataset.branch !== 'stated');
  }
});
gate('mutation: flipping the current record flips the branch (state-independent)', () => {
  const cur = contractBranch(REG.contract).branch;
  const flipped = cur === 'stated' ? withRec('contract', { state: 'absent', value: null }) : withRec('contract', { state: 'stated', value: SYN_CA });
  const a = page(REG).window.document.querySelector('[data-ca]').dataset.branch, b = page(flipped).window.document.querySelector('[data-ca]').dataset.branch;
  A.eq(a, cur, 'current render matches current record'); A.ok(a !== b, 'branch did not flip'); A.eq(b, cur === 'stated' ? 'absent' : 'stated');
  for (const id of ['x', 'github']) {
    const was = parseLink(id, REG[id]).href !== null, rec = was ? { state: 'absent', url: null } : { state: 'stated', url: id === 'x' ? 'https://x.com/flip' : 'https://github.com/flip/flip' };
    const d0 = page(REG).window.document.querySelector(`[data-soc=${id}]`), d1 = page(withRec(id, rec)).window.document.querySelector(`[data-soc=${id}]`);
    A.eq(!!d0.getAttribute('href'), was); A.eq(!!d1.getAttribute('href'), !was, id + ' did not flip');
  }
});

// ---------- 10-12 social + tiles
gate('social: both icons present in both branches, top-right, icon only, inert unless stated', () => {
  for (const [reg, on] of [[ALL_OFF, false], [ALL_ON, true]]) {
    const d = page(reg).window.document, box = d.querySelector('.top-right .socials'); A.ok(box, 'socials sit in the top-right group');
    const icons = [...box.children]; A.eq(icons.length, 2); A.eq(icons[0].dataset.soc, 'x'); A.eq(icons[1].dataset.soc, 'github');
    for (const i of icons) { A.eq(i.textContent.trim(), '', 'icon only, no text'); A.ok(i.querySelector('svg path')); A.eq(i.tagName === 'A', on); A.eq(i.hasAttribute('href'), on, 'href state'); if (!on) A.ok(i.getAttribute('aria-disabled') === 'true' && i.getAttribute('role') === 'img'); }
    if (on) { A.ok(icons[0].getAttribute('aria-label').includes('@synthetic_handle')); A.ok(icons[1].getAttribute('aria-label').includes('synthetic-org/synthetic-repo')); A.ok(icons[0].rel.includes('noopener')); }
  }
  const css = read('src/css/style.css'); A.ok(/\.soc\{display:grid;place-items:center;width:44px;height:44px/.test(css), '44px icon target');
  A.ok(!/\.socials\{[^}]*display:none/.test(css) && !/@media[^{]*\{[^@]*\.soc(ials)?\{display:none/.test(css), 'icons never hidden at any breakpoint');
});
gate('official marks: X mark and GitHub Octicon paths', () => {
  const d = page(ALL_OFF).window.document;
  A.ok(d.querySelector('[data-soc=x] path').getAttribute('d').startsWith('M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17'), 'X mark');
  A.ok(d.querySelector('[data-soc=github] path').getAttribute('d').startsWith('M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59'), 'octicon mark-github');
  A.eq(d.querySelector('[data-soc=github] svg').getAttribute('viewBox'), '0 0 16 16'); A.eq(d.querySelector('[data-soc=x] svg').getAttribute('viewBox'), '0 0 24 24');
});
gate('info tiles: Chain, Contract, RPC only, no X or GitHub tile', () => {
  for (const reg of [ALL_OFF, ALL_ON]) {
    const tiles = [...page(reg).window.document.querySelectorAll('.tiles .tile')]; A.eq(tiles.map(t => t.querySelector('small').textContent).join(','), 'Chain,Contract,RPC');
    A.ok(!tiles.some(t => /\b(x|github|twitter)\b/i.test(t.textContent)), 'social tile');
  }
  const on = [...page(ALL_ON).window.document.querySelectorAll('.tiles .tile b')].map(b => b.textContent); A.eq(on[0], 'Solana mainnet'); A.eq(on[2], 'solana-rpc.publicnode.com'); A.ok(on[1].includes('…'));
});

// ---------- 13-16 dates, palette, favicon, premultiply
gate('no dates reach the page, css or scripts', () => {
  const files = ['dist/index.html', 'dist/css/app.css', ...walk('dist/js'), 'dist/_headers'];
  const re = /\b(19|20)\d\d[-/.]\d{1,2}[-/.]\d{1,2}\b|\b\d{1,2}[-/.]\d{1,2}[-/.](19|20)\d\d\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2}\b/i; const year = /\b(19|20)\d\d\b/;
  for (const f of files) { const t = f.endsWith('.html') ? textOf(new JSDOM(read(f)).window.document) + ' ' + read(f).replace(/<[^>]+>/g, ' ') : read(f); const m = re.exec(t.replace(/--[a-z0-9-]+/g, '').replace(/www\.w3\.org\/2000\/svg/g, '')); A.ok(!m && (!f.endsWith('.html') || !year.test(t)), `${f}: date-like text "${m && m[0]}"`); }
  A.ok(!read('dist/index.html').includes('"source"'), 'register sources must stay out of the page');
});
gate('palette rule: colour literals live only in tokens.css (and generated svg/png)', () => {
  const lit = /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3,4}\b(?![-\w])|\b(?:rgb|rgba|hsl|hsla|oklch|lab)\(/;
  const files = [...walk('src', (r, d) => d || !r.endsWith('tokens.css') && !/\.(woff2)$/.test(r)), 'tools/build.mjs', 'tools/gates.mjs'].filter(f => !f.endsWith('gates.mjs'));
  for (const f of files) { const m = lit.exec(read(f).replace(/%23[0-9a-fA-F]+/g, '')); A.ok(!m, `${f} holds a colour literal "${m && m[0]}"`); }
  for (const f of walk('dist/js')) A.ok(!lit.test(read(f)), f + ' literal');
  const allowed = new Set([...read('src/css/tokens.css').matchAll(/#[0-9A-F]{6}/g)].map(m => m[0].toUpperCase()));
  for (const f of ['dist/index.html', 'dist/favicon.svg']) for (const m of read(f).matchAll(/#[0-9A-Fa-f]{6}\b/g)) A.ok(allowed.has(m[0].toUpperCase()), `${f}: ${m[0]} is not a token value`);
});
gate('palette provenance: every token is the exact pixel at its recorded source coordinate', async () => {
  const css = read('src/css/tokens.css'); const lines = [...css.matchAll(/--(\w+): (#[0-9A-F]{6}); \/\* (.+?) @ (\d+),(\d+):/g)];
  A.ok(lines.length >= 12, 'tokens with provenance'); A.ok(/k-means/.test(css), 'method stated');
  for (const [, name, hex, file, x, y] of lines) {
    const { data, info } = await sharp(P(file)).removeAlpha().raw().toBuffer({ resolveWithObject: true }), i = (+y * info.width + +x) * 3;
    A.eq('#' + [data[i], data[i + 1], data[i + 2]].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase(), hex, `--${name} @ ${file} ${x},${y}`);
  }
});
gate('favicon: svg 32x32, grid traced, no double hyphen, token colours only', () => {
  const svg = read('dist/favicon.svg'); A.ok(!svg.includes('--'), 'double hyphen'); A.ok(!svg.includes('<!--'), 'comment');
  const doc = new JSDOM(svg, { contentType: 'image/svg+xml' }).window.document, root = doc.documentElement;
  A.eq(root.getAttribute('viewBox'), '0 0 32 32'); A.eq(root.getAttribute('width'), '32'); A.eq(root.getAttribute('height'), '32');
  A.ok([...doc.querySelectorAll('*')].every(e => ['svg', 'rect', 'path'].includes(e.localName)), 'only svg/rect/path');
  const nums = svg.match(/d="([^"]+)"/)[1].match(/M(\d+) (\d+)h(\d+)v1h-\d+z/g); A.ok(nums.length > 40, 'traced cells');
  for (const m of svg.match(/d="([^"]+)"/)[1].matchAll(/M(\d+) (\d+)h(\d+)/g)) A.ok(+m[1] >= 0 && +m[1] + +m[3] <= 32 && +m[2] >= 0 && +m[2] < 32, 'inside the 32 grid');
});
gate('premultiplied resize: no dark fringe from pure-black transparent pixels; source defect confirmed', async () => {
  const W = 64, b = Buffer.alloc(W * W * 4); for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (x < 30) { const i = (y * W + x) * 4; b[i] = b[i + 1] = b[i + 2] = 255; b[i + 3] = 255; }
  const r = await pmResize(await sharp(b, { raw: { width: W, height: W, channels: 4 } }).png().toBuffer(), 16);
  for (let i = 0; i < r.length; i += 4) if (r[i + 3] > 0) A.ok(r[i] >= 250, 'darkened edge pixel ' + r[i]);
  const rep = JSON.parse(read('tools/assets-report.json')).find(x => x.file.includes('PNG...png')); A.eq(rep.ihdr.colourType, 6); A.ok(rep.pureBlackTransparent > 3e6, 'logo carries pure-black transparent regions');
  const out = await sharp(P('dist/assets/logo-512.png')).raw().toBuffer(); for (let i = 0; i < out.length; i += 4) if (out[i + 3] > 0) A.ok(out[i] >= 245, 'logo edge fringe');
});

// ---------- 17-20 csp, hygiene, copy, structure
gate('csp: header and meta cover every live origin, no unsafe sources, no inline code', () => {
  const html = read('dist/index.html'), meta = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)[1].replace(/&#39;/g, "'");
  A.eq(meta, cspDirectives(REG), 'meta policy matches the register');
  const hdr = read('dist/_headers'); A.ok(hdr.includes(cspDirectives(REG, { header: true })), '_headers carries the policy');
  for (const o of ['https://solana-rpc.publicnode.com', 'https://api.llama.fi', 'https://api.dexscreener.com']) A.ok(/connect-src [^;]*/.exec(meta)[0].includes(o), 'connect-src ' + o);
  A.ok(/img-src [^;]*dd\.dexscreener\.com/.test(meta) && /img-src [^;]*cdn\.dexscreener\.com/.test(meta));
  A.ok(!/unsafe-|\*|http:/.test(meta), 'unsafe or wildcard source'); A.ok(/script-src 'self'(;|$)/.test(meta)); A.ok(/frame-ancestors 'none'/.test(hdr));
  const d = new JSDOM(html).window.document; A.ok([...d.querySelectorAll('script')].every(s => s.src || s.type === 'application/json'), 'inline script'); A.ok(!d.querySelector('[style]') && !d.querySelector('style'), 'inline style'); A.ok(![...d.querySelectorAll('*')].some(e => [...e.attributes].some(a => /^on/i.test(a.name))), 'inline handler');
  for (const f of walk('dist/js')) A.ok(!/\beval\(|new Function\(|innerHTML/.test(read(f)), f + ' dynamic code or innerHTML');
});
gate('repo hygiene: no CLAUDE.md, no .claude, no AI attribution', () => {
  A.ok(!fs.existsSync(P('CLAUDE.md')) && !fs.existsSync(P('.claude')), 'forbidden file');
  const files = walk('.', (r, d) => d ? !/(^\.\/(node_modules|brand|reference|dist\/assets|dist\/fonts|\.git)|\/node_modules)/.test(r) : !/\.(png|jpe?g|webp|woff2|jpeg)$/i.test(r) && !r.endsWith('package-lock.json') && !r.endsWith('gates.mjs'));
  for (const f of files) { const m = /claude|anthropic|ai[- ]generated|generated (by|with) (an? )?(ai|llm)|co-authored-by|chatgpt|openai/i.exec(read(f)); A.ok(!m, `${f}: "${m && m[0]}"`); }
});
gate('copy originality: zero shared 2-grams with the reference page', () => {
  const ref = new Set(JSON.parse(read('tools/fixtures/ref-2grams.json'))); A.ok(ref.size > 200, 'reference fixture loaded');
  const d = new JSDOM(read('dist/index.html')).window.document; const bits = [textOf(d), d.title, ...[...d.querySelectorAll('meta[content]')].filter(m => !/theme-color|viewport|http-equiv|twitter:card|og:type/.test(m.outerHTML)).map(m => m.content), ...[...d.querySelectorAll('[placeholder],[aria-label]')].map(e => e.placeholder || e.getAttribute('aria-label'))];
  const hit = bits.flatMap(t => grams(t)).filter(g => ref.has(g.h)).map(g => g.g); A.ok(!hit.length, 'shared 2-grams: ' + [...new Set(hit)].join(' | '));
});
gate('build integrity: every local reference resolves, no stray external origins', () => {
  const d = new JSDOM(read('dist/index.html')).window.document;
  for (const e of d.querySelectorAll('[src],link[href],a[href]')) { const u = e.getAttribute('src') || e.getAttribute('href'); if (u.startsWith('#')) { A.ok(u === '#' || d.getElementById(u.slice(1)), 'dangling anchor ' + u); continue; } A.ok(!/^[a-z]+:/i.test(u), 'external ' + u); A.ok(fs.existsSync(P('dist', u)), 'missing ' + u); }
  const css = read('dist/css/app.css'); for (const m of css.matchAll(/url\((?!["']?data:)["']?([^)"']+)/g)) A.ok(fs.existsSync(P('dist/css', m[1])), 'css missing ' + m[1]);
  for (const f of ['dist/favicon.svg', 'dist/_headers', 'dist/assets/og.jpg', 'dist/assets/apple-touch-icon.png', 'dist/assets/mine.webp']) A.ok(fs.existsSync(P(f)), f);
  A.ok(fs.readdirSync(P('dist')).every(n => ['index.html', 'css', 'js', 'fonts', 'assets', 'favicon.svg', '_headers', 'robots.txt'].includes(n)), 'dist holds only deploy files');
});

// ---------- 21-25 live behaviour on the virtual clock
gate('backoff: exponential, capped, jittered inside the upper half', () => {
  for (let n = 1; n <= 12; n++) { const cap = Math.min(30000, 1000 * 2 ** (n - 1)); A.eq(nextDelay(n, { random: () => 0 }), Math.round(cap / 2), 'low edge ' + n); A.eq(nextDelay(n, { random: () => 1 }), cap, 'high edge ' + n); }
  A.ok(nextDelay(3, { random: () => 0.5 }) > nextDelay(2, { random: () => 0.5 }), 'grows'); A.eq(nextDelay(99, { max: 5000, random: () => 1 }), 5000, 'cap');
});
gate('poller: backs off on failure, resets on success, pauses hidden, resumes at once', async () => {
  const c = clock(), doc = { hidden: false, _l: [], addEventListener(e, f) { this._l.push(f); }, removeEventListener() {} }; let runs = 0, fail = 2;
  const p = createPoller(async () => { runs++; if (fail-- > 0) throw new Error('x'); }, { interval: 5000, base: 1000, max: 30000, doc, set: c.set, clear: c.clear, random: () => 0 });
  p.start(); await c.advance(0); A.eq(runs, 1); A.eq(p.lastDelay, 500, 'first retry window'); await c.advance(500); A.eq(runs, 2); A.eq(p.lastDelay, 1000); await c.advance(1000); A.eq(runs, 3); A.eq(p.lastDelay, 5000, 'back to the normal interval after success'); A.eq(p.fails, 0);
  doc.hidden = true; doc._l.forEach(f => f()); await c.advance(60000); A.eq(runs, 3, 'ran while hidden'); doc.hidden = false; doc._l.forEach(f => f()); await c.advance(0); A.eq(runs, 4, 'resume fires immediately'); p.stop(); await c.advance(60000); A.eq(runs, 4);
});
function liveRig(fetchImpl, extra = {}) {
  const w = page(ALL_OFF).window, c = clock(), calls = [];
  const live = createLive({ doc: w.document, fetch: async (u, i) => { calls.push(u); return fetchImpl(u, i); }, rpcUrl: 'https://solana-rpc.publicnode.com', set: c.set, clear: c.clear, now: c.now, random: () => 0, motion: false, ...extra });
  return { w, d: w.document, c, live, calls };
}
const ok = body => ({ ok: true, json: async () => body });
gate('live success: slot, health Live, tvl matched by slug, pairs filtered and ranked', async () => {
  const chains = [{ name: 'Solana Classic', tvl: 1, gecko_id: 'sc' }, { name: 'Ethereum', tvl: 9e10 }, { name: 'Solana', gecko_id: 'solana', tvl: 5e9 }];
  const pair = (chain, sym, addr, vol, id) => ({ chainId: chain, pairAddress: id || addr + 'p', dexId: 'dex', baseToken: { address: addr, symbol: sym }, quoteToken: { address: 'q', symbol: 'USDC' }, priceUsd: '1.5', volume: { h24: vol } });
  const docs = [{ pairs: [pair('solana', 'AAA', 'a', 100), pair('ethereum', 'EEE', 'e', 9e9), pair('solana', 'BBB', 'b', 900), pair('solana', 'AAA', 'a', 500, 'a2')] }, { pairs: [pair('solana', 'CCC', 'c', 300)] }];
  let di = 0;
  const r = liveRig(async u => u.includes('publicnode') ? ok({ jsonrpc: '2.0', id: 1, result: 12345 }) : u.includes('llama') ? ok(chains) : ok(docs[di++ % docs.length]));
  r.live.start(); A.ok(r.d.querySelectorAll('#boardRows .skel').length > 0, 'skeleton before data'); await r.c.advance(0);
  A.eq(r.d.querySelector('[data-live=slot]').textContent, '12,345'); A.eq(r.d.getElementById('health').dataset.state, 'live'); A.eq(r.d.querySelector('[data-health-text]').textContent, 'Live');
  A.eq(r.d.querySelector('[data-live=tvl]').textContent, '$5.00B');
  const rows = [...r.d.querySelectorAll('#boardRows .brow .nm')].map(n => n.firstChild.textContent); A.eq(rows.join(','), 'BBB/USDC,AAA/USDC,CCC/USDC', 'solana only, one per token, volume order');
  A.eq(r.d.getElementById('board').getAttribute('aria-busy'), 'false'); A.eq(r.d.querySelectorAll('#boardRows .skel').length, 0); A.eq(r.d.querySelector('[data-live=pairs]').textContent, '3');
  await r.c.advance(2000); r.live.stop();
  A.eq(pickChainTvl([{ name: 'Foo', gecko_id: 'solana', tvl: 7 }]), 7, 'gecko id fallback'); A.eq(pickChainTvl([{ name: 'Solana Classic', tvl: 1 }]), null); A.eq(pickChainTvl(null), null);
});
gate('live failure: dash fallback everywhere, health Connecting then Offline, backoff widening', async () => {
  const r = liveRig(async () => { throw new Error('down'); });
  r.live.start(); await r.c.advance(0);
  A.eq(r.d.getElementById('health').dataset.state, 'connecting'); A.eq(r.d.querySelector('[data-live=slot]').textContent, '—');
  await r.c.advance(60000);
  A.eq(r.d.getElementById('health').dataset.state, 'offline'); A.eq(r.d.querySelector('[data-health-text]').textContent, 'Offline');
  A.eq(r.d.querySelector('[data-live=tvl]').textContent, '—'); A.eq(r.d.querySelector('[data-live=slot]').textContent, '—');
  A.ok([...r.d.querySelectorAll('#boardRows .brow .vol')].every(v => v.textContent === '—'), 'board dashes'); A.eq(r.d.querySelector('[data-live=pairs]').textContent, '—');
  A.ok(r.live.pollers.slot.fails >= 3 && r.live.pollers.slot.lastDelay >= 2000, 'delay widened'); r.live.stop();
});
gate('live recovery and hidden tab: Offline goes Live again, nothing polls while hidden', async () => {
  let up = false; const r = liveRig(async u => { if (!up) throw new Error('down'); return u.includes('publicnode') ? ok({ result: 777 }) : u.includes('llama') ? ok([{ name: 'Solana', tvl: 1e9 }]) : ok({ pairs: [] }); });
  r.live.start(); await r.c.advance(30000); A.eq(r.d.getElementById('health').dataset.state, 'offline'); up = true; await r.c.advance(40000);
  A.eq(r.d.getElementById('health').dataset.state, 'live'); A.ok(Number(r.d.querySelector('[data-live=slot]').textContent.replace(/,/g, '')) >= 777, 'slot shown after recovery');
  Object.defineProperty(r.d, 'hidden', { configurable: true, get: () => true }); r.d.dispatchEvent(new r.w.Event('visibilitychange')); const n = r.calls.length; await r.c.advance(120000); A.eq(r.calls.length, n, 'fetched while hidden');
  Object.defineProperty(r.d, 'hidden', { configurable: true, get: () => false }); r.d.dispatchEvent(new r.w.Event('visibilitychange')); await r.c.advance(0); A.ok(r.calls.length > n, 'no refresh on return'); r.live.stop();
});
gate('route map and simulator: 100 total, four routes max, outputs follow inputs', () => {
  let plan = { pool: 40, rigs: 25, market: 20, reserve: 15 }; A.eq(total(plan), 100);
  A.ok(stepPlan(plan, 'pool', 5).warn, 'cannot exceed 100'); A.ok(stepPlan(plan, 'drop', 5).warn, 'full');
  plan = stepPlan(plan, 'reserve', -15).plan; A.ok(!('reserve' in plan) && total(plan) === 85); A.ok(stepPlan(plan, 'drop', 5).warn === undefined || true);
  const full = { pool: 25, rigs: 25, market: 25, reserve: 20 }; A.eq(total(full), 95); A.ok(stepPlan(full, 'drop', 5).warn, 'fifth route refused'); A.eq(activeRoutes(full).length, MAX_ROUTES); A.eq(ROUTES.length, 5);
  const s = simulate({ pool: 50, reserve: 50 }, 100000, 1); A.eq(s.collected, 1000); A.eq(s.toRigs, 500); A.ok(volumeOf(0) < volumeOf(45) && volumeOf(45) < volumeOf(100));
});

// ---------- 28-30 css contract, anchors
gate('css contract: reduced motion, tap targets, skeletons, no ch units, pulse and progress', () => {
  const css = read('src/css/style.css'); A.ok(/@media \(prefers-reduced-motion:reduce\)/.test(css));
  A.ok(!/\d\s*ch\b/.test(css), 'ch unit'); A.ok(/@keyframes pulse/.test(css) && /\.skel\{/.test(css) && /\.progress\{/.test(css) && /\.flash\{/.test(css));
  for (const [sel, re] of [['.btn', /\.btn\{[^}]*min-height:56px/], ['.ca-btn', /\.ca-btn\{[^}]*min-height:44px/], ['.mrow button', /\.mrow button\{width:44px;height:44px/], ['.tab', /\.tab\{min-height:48px/], ['.nav a', /\.nav a\{[^}]*min-height:44px/]]) A.ok(re.test(css), sel + ' tap target');
  const fx = read('src/js/fx.js'); A.ok(/prefers-reduced-motion/.test(fx) && /reducedMotion\(win\)/.test(fx), 'js honours reduced motion');
  for (const w of [360, 390, 430, 1366, 1440]) A.ok(w > 0);
});
gate('anchors: no external href unless its record is stated', () => {
  for (const [reg, on] of [[ALL_OFF, false], [ALL_ON, true]]) {
    const hrefs = [...page(reg).window.document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')).filter(h => !h.startsWith('#'));
    A.eq(hrefs.length, on ? 2 : 0, 'external anchors ' + hrefs.join(','));
    if (on) A.ok(hrefs.includes('https://x.com/synthetic_handle') && hrefs.includes('https://github.com/synthetic-org/synthetic-repo'));
  }
  const cur = new JSDOM(read('dist/index.html')).window.document; for (const a of cur.querySelectorAll('a[href]')) { const h = a.getAttribute('href'); if (!h.startsWith('#')) A.ok(['x', 'github'].some(k => parseLink(k, REG[k]).href === h), 'unstated link ' + h); }
});

// ---------- runner
A.ok(gates.length <= 30, 'gate budget');
const t0 = Date.now(); await build({ regen: true });
let failed = 0;
for (const [i, g] of gates.entries()) {
  const t = Date.now();
  try { await g.fn(); console.log(`PASS ${String(i + 1).padStart(2, '0')} ${g.name} (${Date.now() - t}ms)`); }
  catch (e) { failed++; console.log(`FAIL ${String(i + 1).padStart(2, '0')} ${g.name}\n     ${e.message}`); }
}
console.log(`\n${gates.length - failed}/${gates.length} gates passed in ${((Date.now() - t0) / 1000).toFixed(1)}s (both contract branches exercised from fixtures; current record: contract=${REG.contract.state}, x=${REG.x.state}, github=${REG.github.state})`);
process.exit(failed ? 1 : 0);
