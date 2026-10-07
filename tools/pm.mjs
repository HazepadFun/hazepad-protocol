import sharp from 'sharp';

// premultiplied resize: RGB is multiplied by alpha before filtering, divided back after, so the pure-black
// RGB hiding under alpha 0 can never bleed into edge pixels
export async function pmResize(input, size) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pm = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 4) { const a = data[i+3] / 255; pm[i] = data[i] * a; pm[i+1] = data[i+1] * a; pm[i+2] = data[i+2] * a; pm[i+3] = data[i+3]; }
  const r = await sharp(pm, { raw: { width: info.width, height: info.height, channels: 4 } }).resize(size, size, { kernel: 'lanczos3' }).raw().toBuffer();
  for (let i = 0; i < r.length; i += 4) { const a = r[i+3] / 255; if (a > 0) { r[i] = Math.min(255, r[i] / a); r[i+1] = Math.min(255, r[i+1] / a); r[i+2] = Math.min(255, r[i+2] / a); } }
  return r;
}
