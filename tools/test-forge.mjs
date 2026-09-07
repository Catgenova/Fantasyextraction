#!/usr/bin/env node
// The blacksmith, in a browser.
//
// The arithmetic is covered by tools/test-smith.js. What can only be checked
// here is that the screen a player actually uses is honest about it: a recipe
// quotes the grade before anything is spent, forging costs exactly the parts
// it said it would, the piece lands in the stash, and the two-tap guard means
// an armed button that is never confirmed destroys nothing.
//
//   node tools/test-forge.mjs
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
    console.log('SKIP  Playwright is not installed — forge test not run.');
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

// Seed a stash the same way a raid would: through makePart and addToStash, so
// the test breaks if the shape of a carve changes.
//
// A fresh profile already holds three parts — one Threshclaw hide, one
// Threshclaw claw, one ragged Plateback plate — so nothing here starts from
// zero. On top of those: three sound plates, which with the starting ragged
// one makes four, enough for a chest (cost 3) with one to spare; and two
// Sicklejaw claws, one short of a weapon (cost 3). That asymmetry is the
// point — it gives the screen both an affordable row and a short one. Two
// Sicklejaw sinews buys a pouch, which is the one piece whose worth is a
// number no stat line carries.
const seedStash = (page, spec) => page.evaluate(async (rows) => {
  const parts = await import('/src/data/parts.js');
  const creatures = await import('/src/data/creatures.js');
  const p = await import('/src/game/profile.js');
  const profile = JSON.parse(localStorage.getItem('fx.save.v1'));
  p.sanitizeProfile(profile);
  for (const [speciesId, partType, quality, n] of rows) {
    for (let i = 0; i < n; i++) {
      p.addToStash(profile, parts.makePart({
        speciesId,
        speciesName: creatures.CREATURES[speciesId].name,
        partType,
        quality,
        tier: creatures.CREATURES[speciesId].tier,
      }));
    }
  }
  localStorage.setItem('fx.save.v1', JSON.stringify(profile));
}, spec);

const stashCounts = (page) => page.evaluate(() => {
  const profile = JSON.parse(localStorage.getItem('fx.save.v1'));
  return {
    parts: profile.stash.filter((i) => i.kind === 'part').length,
    gear: profile.stash.filter((i) => i.kind === 'gear').length,
    last: profile.stash.filter((i) => i.kind === 'gear').at(-1) ?? null,
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

  // --- An empty stash forges nothing, and says so --------------------------
  await page.getByRole('button', { name: 'Blacksmith' }).click();
  await page.waitForTimeout(400);
  check(`${label}: the blacksmith opens from camp`,
    (await page.locator('.smith').count()) === 1);
  // A fresh profile carries three parts, but one each of three things, so no
  // pile is deep enough to buy anything. Nothing forgeable is the honest
  // answer and the screen has to say so rather than show empty rows.
  check(`${label}: a stash with no matching pile offers nothing`,
    (await page.locator('.recipe:not(.short)').count()) === 0
    && (await page.getByText(/Nothing can be forged yet/).count()) === 1);

  // --- Seeded ---------------------------------------------------------------
  await seedStash(page, [
    ['plateback', 'plate', 'sound', 3],
    ['sicklejaw', 'claw', 'fine', 2],
    ['sicklejaw', 'sinew', 'sound', 2],
  ]);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Blacksmith' }).click();
  await page.waitForTimeout(400);

  const forgeable = page.locator('.recipe:not(.short)');
  // Read the real stash rather than asserting a number the fixture happens to
  // add up to — the header is only useful if it agrees with what is there.
  const held = (await stashCounts(page)).parts;
  const header = (await page.locator('.smith').innerText()).match(/\d+ parts? in the stash/)?.[0] ?? '';
  check(`${label}: the panel counts the parts actually held`,
    header === `${held} parts in the stash`, `${header} vs ${held} in the stash`);
  check(`${label}: affordable recipes are offered`, (await forgeable.count()) > 0,
    `${await forgeable.count()} rows`);
  check(`${label}: and ones short of material are listed apart`,
    (await page.locator('.recipe.short').count()) > 0,
    `${await page.locator('.recipe.short').count()} rows`);

  // A quoted grade is a promise made before the parts are gone, so it is the
  // one thing on the row that has to be right. Four Plateback plates, one of
  // them ragged: a chest eats three and the smith reaches for the best it has,
  // so it comes out sound rather than dragged down to ragged.
  const chest = forgeable.filter({ hasText: /Plateback Plate Chest/ }).first();
  check(`${label}: a recipe quotes its grade up front`,
    /Sound/.test(await chest.innerText()), (await chest.innerText()).replace(/\n/g, ' · '));
  check(`${label}: and what it will eat`,
    /3× Plateback Plate/.test(await chest.innerText()));

  // A pouch is worn for what it holds, so the row has to lead with the
  // capacity. Its stat block is deliberately a shrug and a player reading only
  // that would never make one.
  const pouch = forgeable.filter({ hasText: /Sicklejaw Sinew Pouch/ }).first();
  check(`${label}: a pouch recipe leads with the room it gives`,
    /\+6 pack slots/.test(await pouch.innerText()),
    (await pouch.innerText()).replace(/\n/g, ' · '));

  // --- Armed but not confirmed destroys nothing -----------------------------
  const before = await stashCounts(page);
  await chest.getByRole('button').click();
  await page.waitForTimeout(250);
  check(`${label}: one tap only arms the button`,
    /Spend the parts\?/.test(await chest.innerText()),
    (await chest.getByRole('button').innerText()));
  const armed = await stashCounts(page);
  check(`${label}: an armed forge has spent nothing`,
    armed.parts === before.parts && armed.gear === before.gear,
    `${armed.parts} parts, ${armed.gear} gear`);

  // Walking away has to leave the pile intact — this is the guard the whole
  // two-tap pattern exists for.
  await page.getByRole('button', { name: 'Back to camp' }).click();
  await page.waitForTimeout(300);
  const walked = await stashCounts(page);
  check(`${label}: leaving the screen armed keeps the parts`,
    walked.parts === before.parts && walked.gear === before.gear,
    `${walked.parts} parts, ${walked.gear} gear`);

  // --- Confirmed ------------------------------------------------------------
  await page.getByRole('button', { name: 'Blacksmith' }).click();
  await page.waitForTimeout(400);
  const chest2 = page.locator('.recipe:not(.short)').filter({ hasText: /Plateback Plate Chest/ }).first();
  await chest2.getByRole('button').click();
  await page.waitForTimeout(200);
  await chest2.getByRole('button').click();
  await page.waitForTimeout(400);

  const after = await stashCounts(page);
  check(`${label}: forging costs exactly the parts it quoted`,
    after.parts === before.parts - 3, `${before.parts} -> ${after.parts}`);
  check(`${label}: and the piece lands in the stash`,
    after.gear === before.gear + 1 && after.last?.slot === 'chest',
    `${after.last?.name ?? 'nothing'} (${after.last?.quality})`);
  check(`${label}: at the grade the row promised`, after.last?.quality === 'sound',
    String(after.last?.quality));

  // Three sound plates are gone and only the ragged one is left, so the chest
  // recipe is now short of material and has to move out of the forgeable list
  // rather than keep offering something it cannot make.
  check(`${label}: a recipe it can no longer afford stops being offered`,
    (await page.locator('.recipe:not(.short)').filter({ hasText: /Plateback Plate Chest/ }).count()) === 0);

  // --- Set progress ---------------------------------------------------------
  check(`${label}: the screen tracks set progress per hero`,
    (await page.locator('.species-lot').count()) === 3,
    `${await page.locator('.species-lot').count()} heroes`);

  // --- It survives the fold on a phone --------------------------------------
  // Everything above can pass on a screen whose bottom half is unreachable.
  const reach = await page.evaluate(() => {
    const el = document.scrollingElement;
    const doc = el.scrollHeight - el.clientHeight;
    return { doc, overflow: getComputedStyle(document.documentElement).overflowY };
  });
  check(`${label}: the smith is scrollable when it overflows`,
    reach.doc <= 0 || reach.overflow !== 'hidden',
    `${reach.doc}px below the fold, html overflow-y: ${reach.overflow}`);

  check(`${label}: no console errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
  await ctx.close();
}

await browser.close();
await new Promise((r) => server.close(r));

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
