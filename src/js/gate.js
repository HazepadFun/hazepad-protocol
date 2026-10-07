// Gate for the contract-address slot. Solana addresses are base58, 32 to 44 characters.
// Any string in that alphabet and length passes; nothing is rejected on a guess about checksum or byte length.
export const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export const isSolanaAddress = s => typeof s === 'string' && B58.test(s.trim());

export const STATES = ['stated', 'absent', 'unconfirmed'];

// Which branch of the slot a record puts us in.
//   stated      -> address renders in full and can be copied
//   unconfirmed -> a value exists but is not usable (state says so, or it fails the format): inert, flagged
//   absent      -> nothing stated: inert
export function contractBranch(rec) {
  if (!rec || rec.state === 'absent' || rec.value == null || rec.value === '') return { branch: 'absent' };
  if (rec.state === 'stated' && isSolanaAddress(rec.value)) return { branch: 'stated', address: rec.value.trim() };
  return { branch: 'unconfirmed' };
}

// Link rule: the record stores the URL, the handle is derived from it, and an href exists only for stated records
// whose URL is https on the expected host.
const HOSTS = { x: ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'], github: ['github.com', 'www.github.com'] };
export function parseLink(kind, rec) {
  if (!rec || rec.state !== 'stated' || !rec.url) return { href: null, handle: null, state: rec && rec.state === 'stated' ? 'unconfirmed' : (rec ? rec.state : 'absent') };
  let u; try { u = new URL(rec.url); } catch { return { href: null, handle: null, state: 'unconfirmed' }; }
  if (u.protocol !== 'https:' || !(HOSTS[kind] || []).includes(u.hostname)) return { href: null, handle: null, state: 'unconfirmed' };
  const seg = u.pathname.split('/').filter(Boolean);
  if (!seg.length) return { href: null, handle: null, state: 'unconfirmed' };
  const handle = kind === 'x' ? '@' + seg[0] : seg.slice(0, 2).join('/');
  return { href: u.href, handle, state: 'stated' };
}

// The register as the page may see it: sources (and the dates inside them) stay behind.
export function publicRegister(reg) {
  const out = {};
  for (const [k, v] of Object.entries(reg)) { const { source, ...rest } = v; out[k] = rest; }
  return out;
}
