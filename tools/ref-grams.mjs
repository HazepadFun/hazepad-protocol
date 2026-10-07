// One-off: turns the reference page copy into hashed 2-grams (no reference wording is stored in this repo).
// usage: node tools/ref-grams.mjs <saved-reference.html>
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { grams } from './textgrams.mjs';
const html = fs.readFileSync(process.argv[2], 'utf8');
const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, m => m)); // keep scripts for string harvesting
const doc = dom.window.document;
const texts = [];
doc.querySelectorAll('script').forEach(s => { for (const m of s.textContent.matchAll(/(["'`])((?:\.|(?!\1)[^\\n]){12,})\1/g)) if (/[a-z]+ [a-z]+/i.test(m[2]) && !/[{};=<]|=>|function/.test(m[2].replace(/\$\{[^}]*\}/g, ''))) texts.push(m[2].replace(/\$\{[^}]*\}/g, ' ')); });
doc.querySelectorAll('script,style').forEach(s => s.remove());
texts.push(doc.body.textContent, doc.title, ...[...doc.querySelectorAll('meta[content]')].map(m => m.content), ...[...doc.querySelectorAll('[placeholder]')].map(e => e.placeholder));
const set = new Set();
for (const t of texts) for (const g of grams(t)) set.add(g.h);
fs.writeFileSync(new URL('./fixtures/ref-2grams.json', import.meta.url), JSON.stringify([...set].sort()));
console.log('reference 2-gram hashes:', set.size);
