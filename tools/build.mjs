// npm run build: assets -> dist/. Deploy output is dist/ and nothing else.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
const P = (...p) => path.join(ROOT, ...p);

export async function build({ register, outDir = 'dist', regen = true } = {}) {
  const out = path.resolve(ROOT, outDir);
  if (regen) {
    fs.mkdirSync(out, { recursive: true });
    for (const e of fs.readdirSync(out)) fs.rmSync(path.join(out, e), { recursive: true, force: true }); // empty it, keep the folder itself
    await import('./analyze.mjs');
    await import('./assets.mjs');
  }
  fs.mkdirSync(out, { recursive: true });
  const { renderPage, cspDirectives } = await import('../src/render.js');
  const reg = register || JSON.parse(fs.readFileSync(P('src/register.json'), 'utf8'));

  const tokens = fs.readFileSync(P('src/css/tokens.css'), 'utf8');
  const deep = /--deep:\s*(#[0-9A-Fa-f]{6})/.exec(tokens)[1];
  const html = renderPage(reg, fs.readFileSync(P('src/index.html'), 'utf8'), { theme: deep });
  fs.writeFileSync(path.join(out, 'index.html'), html);

  const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s*\n\s*/g, '').replace(/\s*([{};,>])\s*/g, '$1').replace(/:\s+/g, ':');
  const css = tokens + '\n' + fs.readFileSync(P('src/css/fonts.css'), 'utf8') + strip(fs.readFileSync(P('src/css/style.css'), 'utf8'));
  fs.mkdirSync(path.join(out, 'css'), { recursive: true });
  fs.writeFileSync(path.join(out, 'css/app.css'), css);

  fs.cpSync(P('src/js'), path.join(out, 'js'), { recursive: true });
  fs.cpSync(P('src/fonts'), path.join(out, 'fonts'), { recursive: true });

  const headers = `/*\n  Content-Security-Policy: ${cspDirectives(reg, { header: true })}\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()\n  Cross-Origin-Opener-Policy: same-origin\n\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n\n/fonts/*\n  Cache-Control: public, max-age=31536000, immutable\n`;
  fs.writeFileSync(path.join(out, '_headers'), headers);
  fs.writeFileSync(path.join(out, 'robots.txt'), `User-agent: *\nAllow: /\n`);
  return { html, out };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { out } = await build();
  const size = d => fs.readdirSync(d, { withFileTypes: true }).reduce((a, e) => a + (e.isDirectory() ? size(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0);
  console.log(`built ${out} (${(size(out) / 1024).toFixed(0)} KiB)`);
}
