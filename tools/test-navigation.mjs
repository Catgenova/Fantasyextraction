#!/usr/bin/env node
// Leader assignment and in-raid navigation.
//
// The leader is required before a raid starts because everything else hangs
// off it: the leader walks the navigation and the squad stays with the leader.
// Deploying without one would leave the whole cohesion model anchored to an
// arbitrary hero.
//
//   node tools/test-navigation.mjs
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
    console.log('SKIP  Playwright is not installed — navigation test not run.');
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
  await page.waitForTimeout(500);

  // --- A leader must be named first --------------------------------------
  const deploy = page.locator('.panel-head button.primary').first();
  check(`${label}: a fresh squad cannot deploy`,
    (await deploy.textContent()).includes('Name a leader') && await deploy.isDisabled());
  check(`${label}: every hero can be made leader`,
    (await page.locator('.leader-pick button').count()) === 3);

  await page.locator('.leader-pick button').nth(1).click();
  await page.waitForTimeout(300);
  const ready = page.locator('.panel-head button.primary').first();
  check(`${label}: naming one unlocks the raid`,
    (await ready.textContent()).includes('Deploy') && !(await ready.isDisabled()));
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('fx.save.v1')));
  check(`${label}: the choice is stored against a real hero`,
    saved.roster.some((h) => h.id === saved.squadTactics.leaderId));

  // --- Navigation ---------------------------------------------------------
  await ready.click();
  await page.waitForTimeout(250);
  await page.getByRole('button', { name: 'Enter the raid' }).click();
  await page.waitForTimeout(1500);

  await page.getByRole('button', { name: 'Navigate', exact: true }).click();
  await page.waitForTimeout(300);
  check(`${label}: navigation opens`, await page.locator('.navpad').isVisible());
  check(`${label}: eight headings around the core`,
    (await page.locator('.navrose button').count()) === 9);

  const order = () => page.locator('.hud-top .small').textContent();

  await page.getByRole('button', { name: 'NW', exact: true }).click();
  await page.waitForTimeout(900);
  check(`${label}: a compass heading is taken`, (await order()).includes('NW'), await order());

  await page.getByRole('button', { name: 'Core', exact: true }).click();
  await page.waitForTimeout(900);
  check(`${label}: the core is a destination`, !(await order()).includes('NW'), await order());

  await page.getByRole('button', { name: /Boss arena|No boss arena/ }).click();
  await page.waitForTimeout(600);

  await page.getByRole('button', { name: 'Resume raid plan' }).click();
  await page.waitForTimeout(900);
  check(`${label}: the raid plan resumes`, !/Heading|arena/.test(await order()), await order());

  // Overlays share the same space on a phone, so only one may be open.
  await page.getByRole('button', { name: 'Bags', exact: true }).click();
  await page.waitForTimeout(300);
  check(`${label}: opening another panel closes navigation`,
    !(await page.locator('.navpad').isVisible()));

  check(`${label}: no console errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
  await ctx.close();
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll navigation checks passed');
process.exit(failures ? 1 : 0);
