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
// It is scrolled with a synthesized touch drag, and that detail is the whole
// point of this file. `overflow: hidden` on a scroll container still permits
// `scrollTo` and `scrollIntoView`; it refuses only the user. An earlier
// version of this test scrolled with `scrollIntoView` and passed for three
// rounds against a camp screen that no finger could move at all — the root
// element kept an `overflow: hidden` from the desktop shell, so the viewport
// never took the body's `auto` and ~2000px of camp sat below an unreachable
// fold. Scroll the way a player does, or the check proves nothing.
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

/**
 * A finger dragging the page. Playwright has no swipe, and its
 * `Input.synthesizeScrollGesture` moved nothing in this headless build — it
 * was verified against a plain 5000px page before being abandoned — so the
 * touch stream is dispatched by hand.
 */
async function touchDrag(cdp, x, y, dy) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x, y: y + (dy * i) / 10 }],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

for (const [width, height, label] of SIZES) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: true });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/index.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(300);

  const overflows = await page.evaluate(() => {
    const de = document.scrollingElement;
    return de.scrollHeight > de.clientHeight + 2;
  });

  // Drag the page up the way a thumb does, then ask where we actually got to.
  await page.evaluate(() => document.scrollingElement.scrollTo(0, 0));
  for (let i = 0; i < 12; i++) {
    await touchDrag(cdp, Math.round(width / 2), Math.round(height * 0.8), -500);
  }
  await page.waitForTimeout(200);

  const menu = await page.evaluate(() => {
    const de = document.scrollingElement;
    // Panels may also scroll inside themselves on the desktop shell.
    const screen = document.querySelector('.screen');
    if (screen) screen.scrollTop = screen.scrollHeight;
    const items = document.querySelectorAll('.hub .item, .hub .panel');
    const last = items[items.length - 1];
    let lastReachable = true;
    if (last) {
      const b = last.getBoundingClientRect();
      lastReachable = b.bottom > 0 && b.top < innerHeight;
    }
    return {
      lastReachable,
      scrolled: de.scrollTop,
      scrollable: de.scrollHeight - de.clientHeight,
      hOverflow: de.scrollWidth > de.clientWidth + 2,
    };
  });

  // The camp is taller than a phone by design; what matters is that a drag
  // moves it. A page that cannot be dragged at all is the bug this file exists
  // for, and it looks perfectly healthy to any scripted scroll.
  if (overflows) {
    check(`${width}x${height} (${label}): a touch drag scrolls the camp`,
      menu.scrolled > 0, `reached ${menu.scrolled} of ${menu.scrollable}px`);
    check(`${width}x${height} (${label}): dragging reaches the very bottom`,
      menu.scrolled >= menu.scrollable - 2,
      `reached ${menu.scrolled} of ${menu.scrollable}px`);
  }
  check(`${width}x${height} (${label}): bottom of the camp is reachable`, menu.lastReachable);
  check(`${width}x${height} (${label}): no horizontal overflow`, !menu.hOverflow);

  // The raid is the one screen that must NOT scroll: it is a pinned canvas.
  // A raid cannot start without a leader, so pick one the way a player must.
  await page.locator('.leader-pick button').first().click();
  await page.waitForTimeout(250);
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

  await context.close();
}

await browser.close();
server.close();

console.log(failures ? `\n${failures} check(s) failed` : '\nAll layout checks passed');
process.exit(failures ? 1 : 0);
