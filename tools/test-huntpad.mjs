#!/usr/bin/env node
// The hunt order, in a browser: the camp's standing order and the mid-raid
// panel that changes it.
//
// The sim side is covered by tools/test-hunt.js. What can only be checked here
// is that the two places a player writes the order agree with each other and
// with the map — the camp offers what the journal remembers, the raid offers
// what this map actually holds, and an order given mid-raid reaches the squad.
//
//   node tools/test-huntpad.mjs
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
    console.log('SKIP  Playwright is not installed — hunt panel test not run.');
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

// Teach the journal a few species the way a raid would, so the camp picker has
// something to offer.
const learn = (page, ids) => page.evaluate(async (speciesIds) => {
  const p = await import('/src/game/profile.js');
  const profile = JSON.parse(localStorage.getItem('fx.save.v1'));
  p.sanitizeProfile(profile);
  p.recordEncounters(profile, Object.fromEntries(speciesIds.map((id) => [id, { kills: 4, carves: 2 }])));
  localStorage.setItem('fx.save.v1', JSON.stringify(profile));
}, ids);

const savedQuarry = (page) => page.evaluate(() =>
  JSON.parse(localStorage.getItem('fx.save.v1')).squadTactics.quarry);

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

  // --- The camp's standing order -------------------------------------------
  const orders = page.locator('.panel').filter({ has: page.getByRole('heading', { name: 'Squad orders' }) });
  // Match the field's own label exactly. Filtering on the text "Hunt" picks up
  // the raid-plan field instead, because one of its options is "Boss hunt".
  const huntField = orders.locator('.field')
    .filter({ has: page.locator('label', { hasText: /^Hunt$/ }) }).first();
  const huntSelect = huntField.locator('select');

  check(`${label}: the camp offers a standing hunt order`,
    (await huntSelect.count()) === 1);
  // A new profile has met exactly what its starting parts came off, so the
  // list is those two and the "no order" row — not all fifty.
  const startOptions = await huntSelect.locator('option').allInnerTexts();
  check(`${label}: it offers only what the journal remembers`,
    startOptions.length === 3
    && startOptions.some((t) => /Threshclaw/.test(t))
    && startOptions.some((t) => /Plateback/.test(t)),
    startOptions.join(' | '));
  check(`${label}: and defaults to no order`, (await savedQuarry(page)) === null);

  await learn(page, ['sicklejaw', 'nightfell', 'boulderhide']);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const grown = await huntSelect.locator('option').allInnerTexts();
  check(`${label}: the list grows with what the squad has met`,
    grown.length === 6 && grown.some((t) => /Sicklejaw/.test(t)),
    `${grown.length} options`);
  check(`${label}: each names the ring it lives in`,
    grown.filter((t) => /outer ring|mid ring|core/.test(t)).length === 5,
    grown.join(' | '));

  await huntSelect.selectOption('sicklejaw');
  await page.waitForTimeout(300);
  check(`${label}: choosing one saves it`,
    (await savedQuarry(page))?.speciesId === 'sicklejaw',
    JSON.stringify(await savedQuarry(page)));
  // A pack species can be hunted two ways and the choice has to be offered.
  const kindBtns = huntField.locator('button');
  check(`${label}: a pack species offers both pack sizes`,
    (await kindBtns.count()) === 2, `${await kindBtns.count()} buttons`);
  await kindBtns.nth(1).click();
  await page.waitForTimeout(300);
  check(`${label}: and the size sticks`, (await savedQuarry(page))?.kind === 'large',
    JSON.stringify(await savedQuarry(page)));

  // A solo creature can only be hunted one way, so no choice is offered.
  await huntSelect.selectOption('nightfell');
  await page.waitForTimeout(300);
  check(`${label}: a solo creature offers no pack size`,
    (await huntField.locator('button').count()) === 0
    && (await savedQuarry(page))?.kind === 'solo',
    JSON.stringify(await savedQuarry(page)));

  // --- Mid-raid -------------------------------------------------------------
  await page.locator('.leader-pick button').first().click();
  await page.waitForTimeout(250);
  await page.getByRole('button', { name: /Deploy to the raid/ }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Enter the raid' }).click();
  await page.waitForTimeout(1500);
  check(`${label}: the raid starts`, await page.locator('canvas#stage').isVisible());

  await page.getByRole('button', { name: 'Hunt', exact: true }).click();
  await page.waitForTimeout(500);
  const pad = page.locator('.huntpad');
  check(`${label}: the hunt panel opens`, await pad.isVisible());

  const rows = pad.locator('.hunt-row');
  const rowCount = await rows.count();
  check(`${label}: it lists this raid's fauna, not the whole bestiary`,
    rowCount >= 10 && rowCount <= 30, `${rowCount} species`);
  check(`${label}: grouped by ring`,
    (await pad.locator('.hunt-ring').count()) >= 2,
    `${await pad.locator('.hunt-ring').count()} rings`);

  // Every offered hunt has to be one the squad can walk to. A button that
  // cannot be pressed is the bug this whole system was rebuilt around.
  const enabled = await pad.locator('.hunt-row button:not([disabled])').count();
  const all = await pad.locator('.hunt-row button').count();
  check(`${label}: every hunt offered has somewhere to go`, enabled === all,
    `${enabled}/${all} answerable`);

  const live = () => page.evaluate(() => {
    const s = window.__ashenveil?.liveMatch?.playerSquad;
    return s ? s.tactics.quarry : 'no match';
  });

  await pad.locator('.hunt-row button:not([disabled])').first().click();
  await page.waitForTimeout(400);
  const ordered = await live();
  check(`${label}: ordering a hunt reaches the squad`,
    !!ordered && ordered !== 'no match' && !!ordered.speciesId,
    JSON.stringify(ordered));
  check(`${label}: and the panel says what is being hunted`,
    /STANDING ORDER/.test(await pad.innerText()));

  // Tapping the same hunt again is how you call it off.
  await pad.locator('.hunt-row button.primary').first().click();
  await page.waitForTimeout(400);
  check(`${label}: tapping it again calls it off`, (await live()) === null,
    JSON.stringify(await live()));

  check(`${label}: no console errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
  await ctx.close();
}

await browser.close();
await new Promise((r) => server.close(r));

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
