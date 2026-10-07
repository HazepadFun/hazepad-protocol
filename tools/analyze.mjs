// Reads every byte of every brand/ and reference/ asset: container header, alpha histogram, dominant pixels, k-means palette.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const dirs = ['brand', 'reference'];
const hex = (r, g, b) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();

function kmeans(px, k, iters = 14) {
  const n = px.length / 3;
  const cs = [];
  for (let i = 0; i < k; i++) { const j = Math.floor((i + .5) / k * n) * 3; cs.push([px[j], px[j + 1], px[j + 2]]); }
  const asg = new Uint8Array(n);
  for (let it = 0; it < iters; it++) {
    const sum = cs.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < n; i++) {
      let b = 0, bd = 1e9;
      for (let c = 0; c < k; c++) { const d = (px[i*3]-cs[c][0])**2 + (px[i*3+1]-cs[c][1])**2 + (px[i*3+2]-cs[c][2])**2; if (d < bd) { bd = d; b = c; } }
      asg[i] = b; const s = sum[b]; s[0] += px[i*3]; s[1] += px[i*3+1]; s[2] += px[i*3+2]; s[3]++;
    }
    sum.forEach((s, c) => { if (s[3]) cs[c] = [s[0]/s[3], s[1]/s[3], s[2]/s[3]]; });
  }
  const cnt = cs.map(() => 0); asg.forEach(a => cnt[a]++);
  // snap every centroid to the nearest real pixel in its cluster
  return cs.map((c, ci) => {
    let bi = -1, bd = 1e9;
    for (let i = 0; i < n; i++) if (asg[i] === ci) { const d = (px[i*3]-c[0])**2 + (px[i*3+1]-c[1])**2 + (px[i*3+2]-c[2])**2; if (d < bd) { bd = d; bi = i; } }
    return { share: cnt[ci] / n, i: bi, rgb: [px[bi*3], px[bi*3+1], px[bi*3+2]] };
  }).sort((a, b) => b.share - a.share);
}

const out = [];
for (const d of dirs) for (const f of fs.readdirSync(d)) {
  const p = path.join(d, f), buf = fs.readFileSync(p);
  const rec = { file: p, bytes: buf.length };
  if (buf.slice(1, 4).toString() === 'PNG') {
    rec.container = 'PNG';
    rec.ihdr = { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), bitDepth: buf[24], colourType: buf[25], interlace: buf[28] };
  } else if (buf[0] === 0xff && buf[1] === 0xd8) rec.container = 'JPEG';
  else rec.container = 'unknown';
  const meta = await sharp(buf).metadata();
  rec.meta = { w: meta.width, h: meta.height, channels: meta.channels, hasAlpha: meta.hasAlpha, space: meta.space };
  const raw = await sharp(buf).ensureAlpha().raw().toBuffer();
  const n = meta.width * meta.height, hist = new Array(8).fill(0); let pureBlackTransparent = 0;
  const opaque = [];
  const step = Math.max(1, Math.floor(n / 120000));
  for (let i = 0; i < n; i++) {
    const a = raw[i*4+3]; hist[a >> 5]++;
    if (a < 8 && raw[i*4] + raw[i*4+1] + raw[i*4+2] === 0) pureBlackTransparent++;
    if (a >= 8 && i % step === 0) opaque.push(raw[i*4], raw[i*4+1], raw[i*4+2]);
  }
  rec.alphaHist8 = hist; rec.pureBlackTransparent = pureBlackTransparent;
  rec.kmeans = kmeans(Uint8Array.from(opaque), 6).map(c => ({ hex: hex(...c.rgb), share: +c.share.toFixed(3), srcPixelIndex: c.i, xy: [(c.i * step) % meta.width, Math.floor(c.i * step / meta.width)] }));
  out.push(rec);
}
fs.writeFileSync('tools/assets-report.json', JSON.stringify(out, null, 1));
for (const r of out) console.log(r.file, r.container, JSON.stringify(r.ihdr || ''), JSON.stringify(r.meta), 'alpha', r.alphaHist8.join(','), 'blackTransp', r.pureBlackTransparent, '\n   ', r.kmeans.map(c => `${c.hex}@${c.share}`).join(' '));
