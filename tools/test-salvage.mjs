#!/usr/bin/env node
// Salvage, in a browser.
//
// The arithmetic is covered by tools/test-salvage.js. What can only be checked
// here is the rail: salvaging cannot be undone, so the button arms on the
// first tap and only breaks the piece on the second, and an armed button that
// is never confirmed has to destroy nothing at all.
//
//   node tools/test-salvage.mjs
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
    console.log('SKIP  Playwright is not installed — salvage test not run.');
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

// A shelf with one piece of each grade on it, put there through craftItem so
// the test breaks if the shape of a forged piece changes.
const seedShelf = (page) => page.evaluate(async () => {
  const gear = await import('/src/data/gear.js');
  const p = await import('/src/game/profile.js');
  const profile = JSON.parse(localStorage.getItem('fx.save.v1'));
  p.sanitizeProfile(profile);
  for (const quality of ['ragged', 'ragged', 'sound', 'fine', 'pristine']) {
    profile.stash.push(gear.craftItem({
      speciesId: 'boulderhide', partType: 'plate', slot: 'chest', quality,
    }));
  }
  localStorage.setItem('fx.save.v1', JSON.stringify(profile));
});

const counts = (page) => page.evaluate(() => {
  const profile = JSON.parse(localStorage.getItem('fx.save.v1'));
  return {
    gear: profile.stash.filter((i) => i.kind === 'gear').length,
    parts: (profile.materials ?? []).length,
  };
});

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

  // --- Nothing to salvage on a fresh profile -------------------------------
  check(`${label}: a fresh camp offers nothing to salvage`,
    (await page.getByRole('button', { name: 'Salvage' }).count()) === 0);
  // The carve count has to say out loud that it is not capped, because the
  // whole reason this exists is that it used to be.
  check(`${label}: and says carves are unlimited`,
    (await page.getByText(/there is no limit on these/).count()) === 1);

  await seedShelf(page);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  const start = await counts(page);
  check(`${label}: the shelf shows what is forged, out of the cap`,
    /5 \/ \d+ forged/.test(await page.locator('.panel-head').filter({ hasText: 'Stash' }).innerText()),
    await page.locator('.panel-head').filter({ hasText: 'Stash' }).innerText());

  // --- One tap arms and destroys nothing -----------------------------------
  const firstRow = page.getByRole('button', { name: 'Salvage', exact: true }).first();
  await firstRow.click();
  await page.waitForTimeout(250);
  check(`${label}: one tap arms the row rather than breaking the piece`,
    (await page.getByRole('button', { name: 'Break it?' }).count()) === 1);
  const armed = await counts(page);
  check(`${label}: and nothing has been destroyed yet`,
    armed.gear === start.gear && armed.parts === start.parts,
    `${start.gear} -> ${armed.gear} gear, ${start.parts} -> ${armed.parts} parts`);

  // --- The second tap does the deed ----------------------------------------
  await page.getByRole('button', { name: 'Break it?' }).click();
  await page.waitForTimeout(300);
  const after = await counts(page);
  check(`${label}: the second tap breaks exactly one piece`,
    after.gear === start.gear - 1, `${start.gear} -> ${after.gear}`);
  // A chest costs three parts and gives back two, so this is the loss made
  // visible: the shelf is one lighter and materials two heavier.
  check(`${label}: and returns the two parts it promised`,
    after.parts === start.parts + 2, `${start.parts} -> ${after.parts}`);

  // --- An armed sweep left alone destroys nothing --------------------------
  const sweep = page.getByRole('button', { name: /Salvage ragged/ });
  check(`${label}: the sweep offers only the ragged ones`,
    /Salvage ragged \(1\)/.test(await sweep.innerText()), await sweep.innerText());
  await sweep.click();
  await page.waitForTimeout(250);
  check(`${label}: it arms rather than sweeping`,
    (await page.getByRole('button', { name: /Break all/ }).count()) === 1);
  // Walk away from an armed sweep by arming something else instead. The piece
  // it was pointed at has to survive that.
  await page.getByRole('button', { name: 'Salvage', exact: true }).first().click();
  await page.waitForTimeout(250);
  const abandoned = await counts(page);
  check(`${label}: an armed sweep that is never confirmed sweeps nothing`,
    abandoned.gear === after.gear, `${after.gear} -> ${abandoned.gear}`);

  check(`${label}: no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
  await ctx.close();
}

await browser.close();
await new Promise((r) => server.close(r));
console.log(failures ? `\n${failures} check(s) failed` : '\nAll salvage UI checks passed');
process.exit(failures ? 1 : 0);
