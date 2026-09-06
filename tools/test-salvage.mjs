#!/usr/bin/env node
// Stash salvaging: breaking gear down into Scrap.
//
// Salvaging destroys an item, so the interesting behaviour is all in the
// guard rails: the first tap only arms the button, consumables are not
// offered at all, and the balance must move by exactly what the row
// promised. Those are properties of the rendered stash rather than of
// `salvageValue`, so this drives the real hub against a seeded save.
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

// One of every rarity plus a consumable, so every branch of the row is on
// screen at once.
const seedStash = (page) => page.evaluate(async () => {
  const { makeRng } = await import('/src/core/rng.js');
  const { rollItem, RARITY_ORDER } = await import('/src/data/gear.js');
  const { makeConsumable, CONSUMABLE_LIST } = await import('/src/data/consumables.js');
  const rng = makeRng(20260906);
  const profile = JSON.parse(localStorage.getItem('fx.save.v1'));
  profile.stash = RARITY_ORDER.map((rarity, i) => rollItem(rng, { rarity, ilvl: 1 + i * 4 }));
  profile.stash.push(makeConsumable(CONSUMABLE_LIST[0].id, 1));
  profile.scrap = 0;
  localStorage.setItem('fx.save.v1', JSON.stringify(profile));
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
  await seedStash(page);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  const stash = page.locator('.panel').filter({ has: page.getByRole('heading', { name: 'Stash' }) });
  const scrap = async () => Number(await stash.locator('.scrap').innerText());
  const rows = () => stash.locator('.panel-body .item');
  const salvageButtons = () => stash.locator('.panel-body .item button');

  check(`${label}: the stash shows a scrap balance`, (await stash.locator('.scrap').count()) === 1);
  check(`${label}: it starts at zero`, (await scrap()) === 0);
  check(`${label}: every stashed item is listed`, (await rows().count()) === 6,
    String(await rows().count()));
  // Five pieces of gear offer a salvage; the consumable does not.
  check(`${label}: consumables cannot be salvaged`, (await salvageButtons().count()) === 5,
    `${await salvageButtons().count()} buttons for 6 rows`);
  check(`${label}: the used-not-salvaged note is shown instead`,
    (await stash.getByText('used, not salvaged').count()) === 1);

  // --- One item ------------------------------------------------------------
  const first = salvageButtons().first();
  const promised = Number((await first.innerText()).match(/(\d+)/)[1]);
  check(`${label}: the row quotes what it is worth`, promised > 0, `${promised} scrap`);

  const beforeRows = await rows().count();
  await first.click();
  await page.waitForTimeout(250);
  check(`${label}: one tap only arms the salvage`, (await rows().count()) === beforeRows,
    `${beforeRows} -> ${await rows().count()}`);
  check(`${label}: it asks for confirmation`,
    (await stash.getByRole('button', { name: 'Sure?' }).count()) === 1);

  await stash.getByRole('button', { name: 'Sure?' }).click();
  await page.waitForTimeout(300);
  check(`${label}: confirming consumes the item`, (await rows().count()) === beforeRows - 1,
    `${beforeRows} -> ${await rows().count()}`);
  check(`${label}: the balance rises by exactly what was quoted`, (await scrap()) === promised,
    `${await scrap()} vs ${promised}`);

  // Arming a second row and walking away must not salvage anything.
  const other = salvageButtons().first();
  await other.click();
  await page.waitForTimeout(200);
  const parked = { rows: await rows().count(), scrap: await scrap() };
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  check(`${label}: an armed but unconfirmed salvage does not persist`,
    (await rows().count()) === parked.rows && (await scrap()) === parked.scrap,
    `${parked.rows} rows / ${parked.scrap} scrap`);

  // --- Bulk commons --------------------------------------------------------
  // Rarer gear is worth keeping, so the sweep only ever takes commons.
  await seedStash(page);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  const bulk = stash.locator('.panel-body > button').first();
  check(`${label}: a bulk sweep is offered`, (await bulk.count()) === 1);
  const bulkText = await bulk.innerText();
  const [, count, worth] = bulkText.match(/\((\d+)\)\s*—\s*(\d+)/) ?? [];
  check(`${label}: it names the count and the payout`, Number(count) === 1 && Number(worth) > 0,
    bulkText);

  await bulk.click();
  await page.waitForTimeout(250);
  check(`${label}: the sweep asks first`, /Break down/.test(await bulk.innerText()));
  await bulk.click();
  await page.waitForTimeout(300);
  check(`${label}: the sweep clears the commons`, (await rows().count()) === 5,
    String(await rows().count()));
  check(`${label}: and pays for them`, (await scrap()) === Number(worth),
    `${await scrap()} vs ${worth}`);
  check(`${label}: with nothing left to sweep, the button is gone`,
    (await stash.locator('.panel-body > button').count()) === 0);

  // --- It survives a reload -----------------------------------------------
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  check(`${label}: scrap is saved`, (await scrap()) === Number(worth),
    `${await scrap()} after reload`);

  // A full stash is taller than the fold — the menu scrolls as a document —
  // so what matters is that the bottom row, salvage button and all, can be
  // reached rather than that the panel fits.
  await seedStash(page);
  await page.evaluate(() => {
    const profile = JSON.parse(localStorage.getItem('fx.save.v1'));
    profile.stash = Array.from({ length: 8 }, () => profile.stash).flat();
    profile.stash.forEach((item, i) => { item.id = `bulk-${i}`; });
    localStorage.setItem('fx.save.v1', JSON.stringify(profile));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.evaluate(() => document.scrollingElement.scrollTo(0, 1e6));
  await page.waitForTimeout(250);
  const tail = await rows().last().boundingBox();
  check(`${label}: a long stash scrolls down to its last row`,
    tail.y >= -1 && tail.y + tail.height <= page.viewportSize().height + 1,
    `row bottom ${Math.round(tail.y + tail.height)} of ${page.viewportSize().height}`);

  check(`${label}: no console errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
  await ctx.close();
}

await browser.close();
await new Promise((r) => server.close(r));
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
