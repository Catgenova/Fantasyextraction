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

// --- The filters themselves ------------------------------------------------
// Asserted in Node rather than read off the buttons: "unusable" and
// "outclassed" are judgements about the whole roster, and a count in the UI
// cannot say whether the right items were counted.
{
  const { newProfile, SALVAGE_FILTERS, salvageCandidates, salvagePreview, salvageAll } =
    await import('../src/game/profile.js');
  const { rollItem, SLOTS, canEquip, RARITY_ORDER } = await import('../src/data/gear.js');
  const { makeRng } = await import('../src/core/rng.js');
  const { makeConsumable } = await import('../src/data/consumables.js');

  const rng = makeRng(4242);
  const profile = newProfile(4242);
  const ids = (list) => list.map((i) => i.id).sort().join(',');

  // No filter may ever offer to destroy a legendary in bulk. Losing one to a
  // mis-tap is exactly the mistake a sweep should not be able to make.
  profile.stash = RARITY_ORDER.map((rarity) => rollItem(rng, { baseId: 'gloves', rarity, ilvl: 5 }));
  const legendary = profile.stash.at(-1);
  check('no bulk sweep can take a legendary',
    Object.keys(SALVAGE_FILTERS).every((id) =>
      !salvageCandidates(profile, id).some((i) => i.id === legendary.id)),
    Object.keys(SALVAGE_FILTERS).join(', '));

  // Rarity tiers nest: each one takes everything the tier below it does.
  const tiers = ['common', 'uncommon', 'rare', 'epic'];
  check('rarity sweeps nest inside each other',
    tiers.every((tier, i) => {
      if (i === 0) return true;
      const wider = new Set(salvageCandidates(profile, tier).map((x) => x.id));
      return salvageCandidates(profile, tiers[i - 1]).every((x) => wider.has(x.id));
    }),
    tiers.map((t) => `${t} ${salvagePreview(profile, t).count}`).join(', '));

  // Unusable: gear no hero on the roster can wear.
  profile.stash = [
    rollItem(rng, { baseId: 'greataxe', rarity: 'epic', ilvl: 9 }),   // berserker only
    rollItem(rng, { baseId: 'runestaff', rarity: 'epic', ilvl: 9 }),  // arcane casters only
    rollItem(rng, { baseId: 'sword', rarity: 'epic', ilvl: 9 }),      // the knight can use this
    rollItem(rng, { baseId: 'gloves', rarity: 'epic', ilvl: 9 }),     // anyone
  ];
  const unusable = salvageCandidates(profile, 'unusable');
  check('unusable takes only what nobody can wear',
    ids(unusable) === ids(profile.stash.slice(0, 2)),
    `${unusable.length} of 4: ${unusable.map((i) => i.name).join(', ')}`);
  check('and it is judged against the whole roster, not the squad',
    unusable.every((i) => !profile.roster.some((h) => canEquip(i, h.classId))));

  // Outclassed: every hero who could wear it already has better in that slot.
  for (const hero of profile.roster) {
    for (const slot of SLOTS) {
      const best = rollItem(rng, { slot, classId: hero.classId, rarity: 'legendary', ilvl: 20 });
      if (canEquip(best, hero.classId)) hero.equipped[slot] = best;
    }
  }
  const junk = rollItem(rng, { baseId: 'gloves', rarity: 'common', ilvl: 1 });
  const prize = rollItem(rng, { baseId: 'gloves', rarity: 'legendary', ilvl: 40 });
  profile.stash = [junk, prize];
  check('outclassed takes gear the roster already beats',
    ids(salvageCandidates(profile, 'outclassed')) === junk.id, junk.name);
  check('and spares anything better than what is worn',
    !salvageCandidates(profile, 'outclassed').some((i) => i.id === prize.id));

  profile.roster[0].equipped.hands = null;
  check('an empty slot means nothing for it is outclassed',
    salvagePreview(profile, 'outclassed').count === 0);

  // Running one returns what it destroyed, and consumables are never touched.
  profile.roster[0].equipped.hands = rollItem(rng, { baseId: 'gloves', rarity: 'legendary', ilvl: 20 });
  profile.stash = [junk, prize, makeConsumable('minor_potion', 2)];
  const before = profile.scrap ?? 0;
  const ran = salvageAll(profile, 'outclassed');
  check('a sweep reports what it took', ran.count === 1 && ran.scrap > 0, JSON.stringify(ran));
  check('the scrap balance moves by exactly that', (profile.scrap ?? 0) - before === ran.scrap);
  check('and the consumable is still there',
    profile.stash.length === 2 && profile.stash.some((i) => i.kind === 'consumable'),
    profile.stash.map((i) => i.kind).join(','));
  check('a sweep with nothing to take is a no-op',
    JSON.stringify(salvageAll(profile, 'common')) === '{"count":0,"scrap":0}');
}

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

  // --- Bulk sweeps ---------------------------------------------------------
  await seedStash(page);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  const sweeps = stash.locator('.salvage-all button');
  const sweep = (name) => sweeps.filter({ hasText: new RegExp(`^${name} \\(`) }).first();

  // One row per way of asking "clear this out", and only the ones that would
  // actually take something: with one item of each rarity there is no
  // Outclassed pile, and the roster's own classes make the rest usable.
  check(`${label}: several sweeps are offered`, (await sweeps.count()) >= 4,
    (await sweeps.allInnerTexts()).join(' | '));
  check(`${label}: each names what it would take`,
    (await sweeps.allInnerTexts()).every((t) => /\(\d+\)$/.test(t)),
    (await sweeps.allInnerTexts()).join(' | '));
  check(`${label}: a wider sweep takes more than a narrower one`,
    Number((await sweep('Rare and below').innerText()).match(/\((\d+)\)/)[1])
    > Number((await sweep('Commons').innerText()).match(/\((\d+)\)/)[1]),
    `${await sweep('Commons').innerText()} vs ${await sweep('Rare and below').innerText()}`);

  // Take the middle option: commons alone would not prove the filter is read.
  const target = sweep('Rare and below');
  const targetCount = Number((await target.innerText()).match(/\((\d+)\)/)[1]);
  const rowsBefore = await rows().count();

  await target.click();
  await page.waitForTimeout(250);
  check(`${label}: the sweep asks first`, (await rows().count()) === rowsBefore,
    `${rowsBefore} -> ${await rows().count()}`);
  const armedText = await stash.locator('.salvage-all button.armed').innerText();
  check(`${label}: and shows the price of confirming`, /\d+ for \d+\?/.test(armedText), armedText);
  const promisedScrap = Number(armedText.match(/for (\d+)/)[1]);

  await stash.locator('.salvage-all button.armed').click();
  await page.waitForTimeout(300);
  check(`${label}: it takes exactly what it said`, (await rows().count()) === rowsBefore - targetCount,
    `${rowsBefore} -> ${await rows().count()}, promised ${targetCount}`);
  check(`${label}: and pays what it said`, (await scrap()) === promisedScrap,
    `${await scrap()} vs ${promisedScrap}`);
  // What is left has to be the epic, the legendary and the consumable — and
  // the only sweep still offering anything at or below epic is the epic.
  check(`${label}: nothing above the chosen tier was taken`,
    Number((await sweep('Epic and below').innerText()).match(/\((\d+)\)/)[1]) === 1,
    (await sweeps.allInnerTexts()).join(' | '));
  check(`${label}: sweeps that would now take nothing are gone`,
    (await sweeps.filter({ hasText: /^Commons/ }).count()) === 0,
    (await sweeps.allInnerTexts()).join(' | '));

  // --- It survives a reload -----------------------------------------------
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  check(`${label}: scrap is saved`, (await scrap()) === promisedScrap,
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
