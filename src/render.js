// Pure render helpers shared by the build and by the gates. No file or DOM access in here.
import { contractBranch, parseLink, publicRegister } from './js/gate.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Official marks: X (24 grid) and GitHub Octicon mark-github (16 grid)
const ICONS = {
  x: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
  github: '<svg viewBox="0 0 16 16" width="22" height="22" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>',
};
const NAMES = { x: 'X', github: 'GitHub' };

export function socialIcon(kind, rec) {
  const l = parseLink(kind, rec);
  if (l.href) return `<a class="soc" data-soc="${kind}" data-state="stated" href="${esc(l.href)}" target="_blank" rel="noopener noreferrer" aria-label="${NAMES[kind]}, ${esc(l.handle)}">${ICONS[kind]}</a>`;
  const why = l.state === 'unconfirmed' ? 'unconfirmed' : 'not stated yet';
  return `<span class="soc is-inert" data-soc="${kind}" data-state="${l.state}" role="img" aria-disabled="true" aria-label="${NAMES[kind]}, ${why}">${ICONS[kind]}</span>`;
}
export const socialBlock = reg => socialIcon('x', reg.x) + socialIcon('github', reg.github);

export function caSlot(rec) {
  const g = contractBranch(rec);
  if (g.branch === 'stated') {
    return `<div class="ca" data-ca data-branch="stated"><span class="ca-k">CA</span><code class="ca-v" data-ca-value>${esc(g.address)}</code><button class="ca-btn" type="button" data-ca-copy="${esc(g.address)}" aria-label="Copy contract address"><span data-ca-label>COPY</span></button></div>`;
  }
  const msg = g.branch === 'unconfirmed' ? 'Address unconfirmed' : 'Not stated yet';
  return `<div class="ca is-inert" data-ca data-branch="${g.branch}" aria-disabled="true"><span class="ca-k">CA</span><code class="ca-v ca-empty" data-ca-value>${msg}</code><span class="ca-pending" aria-hidden="true"><i></i><i></i><i></i></span></div>`;
}

const short = a => a.slice(0, 5) + '…' + a.slice(-5);
export function infoTiles(reg) {
  const g = contractBranch(reg.contract);
  let host = 'Not stated yet';
  try { if (reg.rpc.state === 'stated' && reg.rpc.url) host = new URL(reg.rpc.url).host; } catch { /* leave default */ }
  const chain = reg.chain.state === 'stated' ? reg.chain.value : 'Not stated yet';
  const contract = g.branch === 'stated' ? short(g.address) : (g.branch === 'unconfirmed' ? 'Unconfirmed' : 'Not stated yet');
  const tile = (k, v, extra = '') => `<div class="tile"${extra}><small>${k}</small><b>${esc(v)}</b></div>`;
  return tile('Chain', chain) + tile('Contract', contract, ` data-branch="${g.branch}"`) + tile('RPC', host);
}

export function cspDirectives(reg, { header = false } = {}) {
  let rpc = '';
  try { if (reg.rpc.state === 'stated' && reg.rpc.url) rpc = new URL(reg.rpc.url).origin; } catch { /* no rpc origin */ }
  const d = [
    ["default-src", "'none'"],
    ["script-src", "'self'"],
    ["style-src", "'self'"],
    ["img-src", "'self' data: https://dd.dexscreener.com https://cdn.dexscreener.com"],
    ["font-src", "'self'"],
    ["connect-src", ["'self'", rpc, 'https://api.llama.fi', 'https://api.dexscreener.com'].filter(Boolean).join(' ')],
    ["base-uri", "'none'"],
    ["form-action", "'none'"],
  ];
  if (header) d.push(["frame-ancestors", "'none'"], ["object-src", "'none'"]);
  return d.map(([k, v]) => `${k} ${v}`).join('; ');
}

export function renderPage(reg, template, extra = {}) {
  const pub = JSON.stringify(publicRegister(reg)).replace(/</g, '\u003c');
  const map = {
    CSP: esc(cspDirectives(reg)),
    REGISTER_JSON: pub,
    CA_TOP: caSlot(reg.contract),
    CA_COIN: caSlot(reg.contract),
    SOCIAL: socialBlock(reg),
    TILES: infoTiles(reg),
    DOMAIN: esc(reg.domain.value),
    THEME: esc(extra.theme || ''),
  };
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => { if (!(k in map)) throw new Error('unknown template slot ' + k); return map[k]; });
}
