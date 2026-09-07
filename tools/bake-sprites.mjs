#!/usr/bin/env node
// Bake the class art into sprite sheets.
//
// The art is drawn by code — src/art/ — and this renders it through headless
// Chromium so the sheets can never disagree with what the game draws: both
// sides call the same `drawFigure` and the same animation curves.
//
// One sheet per class, one row per animation, frames left to right. Written to
// assets/sprites/<class>.png with assets/sprites/atlas.json describing them.
//
//   node tools/bake-sprites.mjs [--cell 128] [--class knight]
//
// Needs Playwright. Skips rather than fails if it is missing.

import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = join(ROOT, 'assets/sprites');
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png',
};

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const CELL = Number(flag('cell', 128));
const ONLY = flag('class', null);

let playwright;
try {
  playwright = await import('playwright');
} catch {
  try {
    playwright = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
  } catch {
    console.log('SKIP  Playwright is not installed — sprites not baked.');
    process.exit(0);
  }
}

const server = createServer(async (req, res) => {
  try {
    const path = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
    const file = join(ROOT, path === '/' ? 'index.html' : path);
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await playwright.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${base}/tools/sprite-lab.html`, { waitUntil: 'networkidle' });
if (errors.length) {
  console.error('The sprite lab did not load cleanly:\n  ' + errors.join('\n  '));
  await browser.close();
  await new Promise((r) => server.close(r));
  process.exit(1);
}

await mkdir(OUT, { recursive: true });
const ids = (await page.evaluate(() => window.KIT_IDS)).filter((id) => !ONLY || id === ONLY);

// Merge into whatever is already there rather than starting empty. Rebuilding
// the atlas from only the classes in this run means `--class knight` silently
// deletes the other twelve from it — the PNGs stay on disk and every one of
// them stops being drawable, which looks like the renderer being broken.
let atlas = { cell: CELL, classes: {} };
try {
  const existing = JSON.parse(await readFile(join(OUT, 'atlas.json'), 'utf8'));
  if (existing?.classes) atlas = { ...existing, cell: CELL, classes: { ...existing.classes } };
} catch { /* no atlas yet */ }

for (const classId of ids) {
  const sheet = await page.evaluate(
    ([id, cell]) => window.bakeClass(id, cell), [classId, CELL],
  );
  const png = Buffer.from(sheet.png.split(',')[1], 'base64');
  const file = `${classId}.png`;
  await writeFile(join(OUT, file), png);
  atlas.classes[classId] = {
    file, cell: sheet.cell, cols: sheet.cols, rows: sheet.rows,
    animations: sheet.animations,
  };
  const kb = (png.length / 1024).toFixed(1);
  const total = Object.values(sheet.animations).reduce((n, a) => n + a.frames, 0);
  console.log(`  ${classId.padEnd(16)} ${sheet.cols}x${sheet.rows} cells, ${total} frames, ${kb} kB`);
}

await writeFile(join(OUT, 'atlas.json'), JSON.stringify(atlas, null, 2));
console.log(`\nBaked ${ids.length} class${ids.length === 1 ? '' : 'es'} to assets/sprites/ at ${CELL}px.`);

if (errors.length) console.error(`\n${errors.length} console error(s):\n  ` + errors.join('\n  '));
await browser.close();
await new Promise((r) => server.close(r));
process.exit(errors.length ? 1 : 0);
