#!/usr/bin/env node
// In-raid pack panel and map key.
//
// Equipment changes mid-raid have to rebuild a hero's stat block — gear feeds
// `baseMods`, which is otherwise computed once at spawn — so this drives the
// real UI against a live match rather than calling the sim functions directly.
//
// The raid clock keeps running while the panel is open, which is deliberate.
// It also means a greedy hero will pick something up between an action and its
// assertion, so the panel's own Pause is used before counting anything.
//
//   node tools/test-bags.mjs
//
// Needs Playwright. Skips rather than fails if it is missing.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml',
};

let playwright;
try {
  playwright = await import('playwright');
} catch {
  try {
    playwright = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
  } catch {
    console.log('SKIP  Playwright is not installed — bag panel test not run.');
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
const { devices } = playwright;

for (const [label, opts] of [
  ['desktop', { viewport: { width: 1600, height: 950 } }],
  ['phone', { ...devices['iPhone 13'] }],
]) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(`${base}/index.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  // A raid cannot start without a leader, so pick one the way a player must.
  await page.locator('.leader-pick button').first().click();
  await page.waitForTimeout(250);
  await page.getByRole('button', { name: /Deploy to the raid/ }).click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: 'Enter the raid' }).click();
  await page.waitForTimeout(1200);

  // --- Map key ------------------------------------------------------------
  await page.getByRole('button', { name: 'Legend', exact: true }).click();
  await page.waitForTimeout(300);
  check(`${label}: map key opens`, await page.locator('.legend').isVisible());
  check(`${label}: it explains rarities and markers`,
    (await page.locator('.legend-row').count()) >= 9);
  const box = await page.locator('.legend').boundingBox();
  const vp = page.viewportSize();
  check(`${label}: map key stays on screen`,
    box.x >= -1 && box.y >= -1 && box.x + box.width <= vp.width + 1 && box.y + box.height <= vp.height + 1);

  // --- Pack panel ---------------------------------------------------------
  await page.getByRole('button', { name: 'Bags', exact: true }).click();
  await page.waitForTimeout(300);
  check(`${label}: opening the pack closes the map key`, !(await page.locator('.legend').isVisible()));
  check(`${label}: pack panel opens`, await page.locator('.bags').isVisible());
  check(`${label}: worn slots are listed`, (await page.locator('.bags .item').count()) >= 7);

  // Run until somebody has loot to manipulate.
  await page.getByRole('button', { name: '1×' }).click();
  await page.getByRole('button', { name: '2×' }).click();
  let found = false;
  for (let i = 0; i < 40 && !found; i++) {
    await page.waitForTimeout(1000);
    for (const tab of await page.locator('.bags-tabs button').all()) {
      const m = ((await tab.textContent()) ?? '').match(/(\d+)\/8/);
      if (m && Number(m[1]) > 0) { await tab.click(); await page.waitForTimeout(250); found = true; break; }
    }
  }
  check(`${label}: a hero collected loot during the raid`, found);

  if (found) {
    await page.locator('.bags-head').getByRole('button', { name: 'Pause' }).click();
    await page.waitForTimeout(300);
    check(`${label}: the panel can stop the clock`,
      (await page.locator('.bags-head').getByRole('button', { name: 'Resume' }).count()) === 1);

    const packCount = async () => {
      const t = (await page.locator('.bags-tabs button.primary').textContent()) ?? '';
      return Number((t.match(/(\d+)\/8/) ?? [0, 0])[1]);
    };

    const equip = page.getByRole('button', { name: 'Equip' }).first();
    if (await equip.count()) {
      const before = await packCount();
      await equip.click();
      await page.waitForTimeout(400);
      // Equipping frees a pack slot and may hand back whatever was worn.
      check(`${label}: equipping never grows the pack`, (await packCount()) <= before,
        `${before} -> ${await packCount()}`);
    }

    const drop = page.getByRole('button', { name: 'Drop' }).first();
    if (await drop.count()) {
      const before = await packCount();
      await drop.click();
      await page.waitForTimeout(400);
      check(`${label}: dropping removes an item`, (await packCount()) === before - 1,
        `${before} -> ${await packCount()}`);
    }

    // Handing an item to a squadmate. Only offered while they are close
    // enough to take it, so an enabled button is the precondition.
    const give = page.locator('.bags-body button:not([disabled])')
      .filter({ hasText: /^→/ }).first();
    if (await give.count()) {
      const before = await packCount();
      const label = (await give.textContent()).replace('→', '').trim();
      await give.click();
      await page.waitForTimeout(400);
      check(`${label ? 'giving an item away' : 'transfer'} leaves the giver's pack`,
        (await packCount()) === before - 1, `${before} -> ${await packCount()}`);

      // And it arrived: the recipient's tab count went up.
      const tabs = await page.locator('.bags-tabs button').all();
      let landed = false;
      for (const tab of tabs) {
        const text = (await tab.textContent()) ?? '';
        if (text.includes(label)) {
          landed = Number((text.match(/(\d+)\/8/) ?? [0, 0])[1]) > 0;
          break;
        }
      }
      check(`${label} actually received it`, landed);
    }

    const remove = page.getByRole('button', { name: 'Remove' }).first();
    if (await remove.count()) {
      const before = await packCount();
      await remove.click();
      await page.waitForTimeout(400);
      check(`${label}: removing worn gear returns it to the pack`, (await packCount()) === before + 1,
        `${before} -> ${await packCount()}`);
    }
  }

  await page.getByRole('button', { name: 'Close' }).click();
  await page.waitForTimeout(250);
  check(`${label}: pack panel closes`, !(await page.locator('.bags').isVisible()));
  check(`${label}: no console errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
  await ctx.close();
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll pack panel checks passed');
process.exit(failures ? 1 : 0);
