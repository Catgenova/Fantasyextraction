#!/usr/bin/env node
// Render a few frames large, for looking at. Not part of the suite — this is
// the thing you use while the art is still wrong.
//
//   node tools/contact-sheet.mjs knight
//   node tools/contact-sheet.mjs knight idle:0 attack:4 die:6

import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

let playwright;
try { playwright = await import('playwright'); }
catch {
  try { playwright = await import('/opt/node22/lib/node_modules/playwright/index.mjs'); }
  catch { console.log('SKIP  Playwright is not installed.'); process.exit(0); }
}

const [classId = 'knight', ...rest] = process.argv.slice(2);
const picks = (rest.length ? rest : ['idle:0', 'walk:2', 'attack:5', 'cast:4', 'die:6'])
  .map((s) => { const [a, f] = s.split(':'); return [a, Number(f ?? 0)]; });

const server = createServer(async (req, res) => {
  try {
    const path = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
    const file = join(ROOT, path === '/' ? 'index.html' : path);
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await playwright.chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}/tools/sprite-lab.html`, { waitUntil: 'networkidle' });

const url = await page.evaluate(([id, p]) => window.bakeContact(id, p), [classId, picks]);
const out = join(ROOT, `contact-${classId}.png`);
await writeFile(out, Buffer.from(url.split(',')[1], 'base64'));
console.log(`${out}  (${picks.map((p) => p.join(':')).join(' ')})`);
if (errors.length) console.error(errors.join('\n'));

await browser.close();
await new Promise((r) => server.close(r));
