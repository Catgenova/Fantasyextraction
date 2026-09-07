#!/usr/bin/env node
// Trophies in the camp, and the screens an unlocked class has to survive.
//
// The sim-side rules are covered by tools/test-achievements.js. What can only
// be checked in a browser is that an unlocked class is genuinely playable: its
// hero screen renders eighteen tree nodes and seven spells like any other, it
// can be put in the squad and named leader, and it deploys. A class that
// unlocks and then cannot be equipped is worse than one that stays locked.
//
//   node tools/test-unlocks.mjs
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
    console.log('SKIP  Playwright is not installed — unlock test not run.');
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

// Grant trophies through the real profile code rather than hand-writing a
// save, so the test breaks if the unlock path changes shape.
const grant = (page, bosses) => page.evaluate(async (bossIds) => {
  const p = await import('/src/game/profile.js');
  const profile = JSON.parse(localStorage.getItem('fx.save.v1'));
  p.sanitizeProfile(profile);
  p.applyMatchResult(profile, {
    seed: 4242, duration: 900, outcome: 'clean', heroes: [],
    stats: { kills: 40, bossKills: bossIds.length, heroKills: 0 },
    bossesKilled: bossIds,
  });
  localStorage.setItem('fx.save.v1', JSON.stringify(profile));
}, bosses);

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

  const trophies = page.locator('.panel').filter({ has: page.getByRole('heading', { name: 'Trophies' }) });
  const rows = () => trophies.locator('.trophy');
  const lockedPills = () => trophies.locator('.pill').filter({ hasText: /^Locked$/ });

  // --- Locked ---------------------------------------------------------------
  check(`${label}: the camp lists every trophy`, (await rows().count()) === 8,
    String(await rows().count()));
  check(`${label}: all eight start locked`,
    (await lockedPills().count()) === 8, String(await lockedPills().count()));
  check(`${label}: the count agrees`,
    /0 \/ 8 classes unlocked/.test(await trophies.locator('.panel-head').innerText()));
  // A locked row has to say what to kill and what it pays, or it is just a
  // greyed-out box the player cannot act on.
  const lockedText = await rows().first().innerText();
  check(`${label}: a locked row names its boss and its reward`,
    /The Quiet Knife/.test(lockedText) && /Rogue/.test(lockedText),
    lockedText.replace(/\n/g, ' · '));
  check(`${label}: the roster is only the three starters`,
    (await page.locator('.hero-card').count()) === 3, String(await page.locator('.hero-card').count()));

  // --- Earned ---------------------------------------------------------------
  await grant(page, ['quiet_knife', 'the_warden']);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  check(`${label}: earned trophies read as earned`,
    (await trophies.locator('.trophy.got').count()) === 2,
    String(await trophies.locator('.trophy.got').count()));
  check(`${label}: and the rest stay locked`,
    (await lockedPills().count()) === 6, String(await lockedPills().count()));
  check(`${label}: the count follows`,
    /2 \/ 8 classes unlocked/.test(await trophies.locator('.panel-head').innerText()));
  check(`${label}: an earned row is titled by the trophy, not the boss`,
    /The Knife Goes Quiet/.test(await rows().first().innerText()));
  check(`${label}: the unlocked heroes joined the roster`,
    (await page.locator('.hero-card').count()) === 5, String(await page.locator('.hero-card').count()));
  check(`${label}: and they are the right classes`,
    (await page.getByText('Rogue · Melee burst').count()) === 1
    && (await page.getByText('Paladin · Frontline support').count()) === 1);

  // --- An unlocked class is a real, configurable hero -----------------------
  const rogueCard = page.locator('.hero-card').filter({ hasText: 'Rogue' }).first();
  await rogueCard.click();
  await page.waitForTimeout(400);
  check(`${label}: its hero screen opens`, (await page.locator('.screen').count()) > 0);

  await page.getByRole('button', { name: 'Skill tree' }).click();
  await page.waitForTimeout(300);
  const nodes = await page.locator('.node').count();
  check(`${label}: its skill tree is fully built`, nodes === 18, `${nodes} nodes`);
  check(`${label}: with three branches`,
    (await page.getByText('Assassination').count()) >= 1
    && (await page.getByText('Subtlety').count()) >= 1
    && (await page.getByText('Venom').count()) >= 1);

  await page.getByRole('button', { name: 'Spells' }).click();
  await page.waitForTimeout(300);
  check(`${label}: it has its own starting spells`,
    (await page.getByText('Eviscerate').count()) >= 1
    && (await page.getByText('Shadowstep').count()) >= 1);

  await page.getByRole('button', { name: 'Gear' }).click();
  await page.waitForTimeout(300);
  // Count filled slots, not rows: an empty slot renders as an `.item` too, so
  // a class with no gear it can equip would sail past a row count.
  const worn = await page.locator('.item:not(.empty) .slot-label').count();
  check(`${label}: it starts wearing gear it can equip`, worn >= 4, `${worn} slots filled`);

  // --- It can actually be deployed -----------------------------------------
  await page.getByRole('button', { name: 'Camp', exact: true }).click();
  await page.waitForTimeout(400);
  await page.locator('.hero-card').filter({ hasText: 'Rogue' }).first()
    .locator('xpath=following-sibling::button').first().click();
  await page.waitForTimeout(400);
  const squadPanel = page.locator('.panel').filter({ has: page.getByRole('heading', { name: 'Your squad' }) });
  check(`${label}: it can be added to the squad`,
    (await squadPanel.locator('.hero-card').filter({ hasText: 'Rogue' }).count()) === 1);

  await page.locator('.leader-pick button').first().click();
  await page.waitForTimeout(250);
  await page.getByRole('button', { name: /Deploy to the raid/ }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Enter the raid' }).click();
  await page.waitForTimeout(1500);
  check(`${label}: a squad containing it deploys`, await page.locator('canvas#stage').isVisible());
  const clock = await page.locator('.hud-top').innerText();
  check(`${label}: and the raid is running`, /\d+:\d\d/.test(clock), clock.split('\n')[0]);

  check(`${label}: no console errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
  await ctx.close();
}

await browser.close();
await new Promise((r) => server.close(r));
console.log(failures ? `\n${failures} check(s) failed` : '\nAll unlock checks passed');
process.exit(failures ? 1 : 0);
