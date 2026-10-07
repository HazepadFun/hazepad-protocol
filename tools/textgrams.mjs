export const STOP = new Set('a an and are as at be but by for from has have in is it its of on or so that the their then these they this to was we were will with you your yours our us can do does not no if into than too up out all any each per via'.split(' '));
export const words = t => String(t).toLowerCase().replace(/[’']/g, '').split(/[^a-z0-9]+/).filter(Boolean);
export const fnv = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); };
// 2-grams made only of stop words ("of the", "to a") are exempt: nobody owns those
export function grams(t) {
  const w = words(t), out = [];
  for (let i = 0; i + 1 < w.length; i++) { if (STOP.has(w[i]) && STOP.has(w[i + 1])) continue; out.push({ g: w[i] + ' ' + w[i + 1], h: fnv(w[i] + ' ' + w[i + 1]) }); }
  return out;
}
