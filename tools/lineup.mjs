#!/usr/bin/env node
// Every class in one pose, at a chosen size. The question this answers is the
// only one that matters: can you tell them apart?
//
//   node tools/lineup.mjs                 # idle, large
//   node tools/lineup.mjs walk 2 30       # a walk frame at raid size

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

const [animId = 'idle', frame = '0', cell = '220'] = process.argv.slice(2);

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

const url = await page.evaluate(
  ([a, f, c]) => window.bakeLineup(a, f, c), [animId, Number(frame), Number(cell)],
);
const out = join(ROOT, `contact-lineup-${animId}-${cell}.png`);
await writeFile(out, Buffer.from(url.split(',')[1], 'base64'));
console.log(out);
if (errors.length) console.error(errors.join('\n'));

await browser.close();
await new Promise((r) => server.close(r));
