#!/usr/bin/env node
// Layout regression test.
//
// The game uses a fixed-height shell on desktop (panels scroll inside
// themselves) and an ordinary scrolling document everywhere else. Getting the
// boundary between those two wrong makes content silently unreachable — the
// page simply refuses to scroll and the bottom of the screen is lost. That is
// invisible to unit tests and easy to miss by eye, so it is checked here
// across the whole size range rather than at a few hand-picked devices.
//
//   node tools/test-layout.mjs
//
// Needs Playwright. If it is not installed the test skips rather than fails.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml',
};

// Every size a player might plausibly hold. The middle band is the one that
// broke before: wide enough that the columns had stacked, but wide enough
// that a naive "mobile" breakpoint had not fired.
const SIZES = [
  [320, 568, 'phone, small'],
  [390, 664, 'phone'],
  [412, 839, 'phone, tall'],
  [664, 390, 'phone, landscape'],
  [768, 1024, 'tablet'],
  [880, 600, 'stacked, mid width'],
  [980, 600, 'phone in desktop mode'],
  [1024, 768, 'tablet, landscape'],
  [1100, 700, 'stacked, upper bound'],
  [1280, 720, 'laptop'],
  [1600, 950, 'desktop'],
];

let playwright;
try {
  playwright = await import('playwright');
} catch {
  try {
    playwright = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
  } catch {
    console.log('SKIP  Playwright is not installed — layout test not run.');
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

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const browser = await playwright.chromium.launch();

for (const [width, height, label] of SIZES) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/index.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(300);

  const menu = await page.evaluate(() => {
    const de = document.documentElement;
    window.scrollTo(0, de.scrollHeight);
    const screen = document.querySelector('.screen');
    if (screen) screen.scrollTop = screen.scrollHeight;
    // scrollIntoView walks every scrollable ancestor, so this asks the only
    // question that matters: can a player actually get to it?
    const items = document.querySelectorAll('.hub .item, .hub .panel');
    const last = items[items.length - 1];
    let lastReachable = true;
    if (last) {
      last.scrollIntoView({ block: 'center' });
      const b = last.getBoundingClientRect();
      lastReachable = b.bottom > 0 && b.top < innerHeight;
    }
    return { lastReachable, hOverflow: de.scrollWidth > de.clientWidth + 2 };
  });

  check(`${width}x${height} (${label}): bottom of the camp is reachable`, menu.lastReachable);
  check(`${width}x${height} (${label}): no horizontal overflow`, !menu.hOverflow);

  // The raid is the one screen that must NOT scroll: it is a pinned canvas.
  await page.getByRole('button', { name: /Deploy to the raid/ }).click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: 'Enter the raid' }).click();
  await page.waitForTimeout(2200);

  const raid = await page.evaluate(() => {
    const de = document.documentElement;
    const canvas = document.getElementById('stage').getBoundingClientRect();
    const boxes = ['.hud-top', '.hud-squad', '.hud-right', '.hud-bottom'].map((sel) => {
      const n = document.querySelector(sel);
      if (!n) return null;
      const b = n.getBoundingClientRect();
      return { sel, l: b.left, t: b.top, r: b.right, b: b.bottom };
    }).filter(Boolean);

    let offScreen = null;
    for (const x of boxes) {
      if (x.r > innerWidth + 2 || x.b > innerHeight + 2 || x.l < -2 || x.t < -2) offScreen = x.sel;
    }
    let overlap = null;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b2 = boxes[j];
        if (a.l < b2.r && b2.l < a.r && a.t < b2.b && b2.t < a.b) overlap = `${a.sel} over ${b2.sel}`;
      }
    }
    return {
      fills: Math.abs(canvas.width - innerWidth) <= 2 && canvas.height > innerHeight * 0.5,
      pageScrolls: de.scrollHeight > de.clientHeight + 2,
      offScreen, overlap,
      clock: document.querySelector('.clock')?.textContent,
    };
  });

  check(`${width}x${height} (${label}): canvas fills the viewport`, raid.fills);
  check(`${width}x${height} (${label}): raid does not scroll the page`, !raid.pageScrolls);
  check(`${width}x${height} (${label}): HUD stays on screen`, !raid.offScreen, raid.offScreen ?? '');
  check(`${width}x${height} (${label}): HUD panels do not overlap`, !raid.overlap, raid.overlap ?? '');
  check(`${width}x${height} (${label}): raid is running`, raid.clock && raid.clock !== '30:00', raid.clock ?? '');
  check(`${width}x${height} (${label}): no console errors`, errors.length === 0, errors[0] ?? '');

  await page.close();
}

await browser.close();
server.close();

console.log(failures ? `\n${failures} check(s) failed` : '\nAll layout checks passed');
process.exit(failures ? 1 : 0);
