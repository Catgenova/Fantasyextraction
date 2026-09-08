#!/usr/bin/env node
// The build stamp and the stale-build notice, in a browser.
//
// tools/test-version.js checks the four stamps agree. What can only be checked
// here is that any of it reaches a player: that the running build is on the
// page, that a page whose deployed version has moved on says so, and that it
// does not say so during a raid — a reload mid-raid throws the run away.
//
//   node tools/test-version.mjs
//
// Needs Playwright. Skips rather than fails if it is missing.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
};

let playwright;
try {
  playwright = await import('playwright');
} catch {
  try {
    playwright = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
  } catch {
    console.log('SKIP  Playwright is not installed — version test not run.');
    process.exit(0);
  }
}

// The deployed version the server reports. Tests move it to fake a deploy
// landing while the page is open, which is exactly the case that bit us.
let served = JSON.parse(await readFile(join(ROOT, 'version.json'), 'utf8'));

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  if (path === '/version.json') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(served));
    return;
  }
  try {
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

const { VERSION } = await import('../src/version.js');
const browser = await playwright.chromium.launch();

for (const [label, opts] of [
  ['desktop', { viewport: { width: 1600, height: 950 } }],
  ['phone', { ...playwright.devices['iPhone 13'] }],
]) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // --- Up to date -----------------------------------------------------------
  served = { version: VERSION, builtAt: new Date().toISOString() };
  await page.goto(`${base}/index.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  check(`${label}: the topbar names the build it is running`,
    (await page.locator('.topbar .build').innerText()).trim() === VERSION,
    (await page.locator('.topbar .build').innerText()).trim());
  check(`${label}: and says nothing about reloading`,
    (await page.getByRole('button', { name: /New build/ }).count()) === 0);

  // The entry has to be loaded at a versioned URL, or a new deploy hands the
  // browser the same URL it already has cached.
  check(`${label}: the entry module is requested at this version`,
    await page.evaluate((v) => [...document.querySelectorAll('script[type=module]')]
      .some((s) => s.getAttribute('src')?.endsWith(`?v=${v}`)), VERSION));

  // --- A deploy lands while the tab is open ---------------------------------
  served = { version: '9999.01.01-000000', builtAt: new Date().toISOString() };
  // Forced, because the real check throttles to once a minute and waiting out
  // a minute per assertion is not a test anybody runs.
  await page.evaluate(() => window.__ashenveil.checkBuild(true));
  await page.waitForTimeout(700);
  check(`${label}: a stale page offers a reload`,
    (await page.getByRole('button', { name: /New build/ }).count()) === 1);
  check(`${label}: and names both builds when asked`,
    /9999\.01\.01/.test(await page.getByRole('button', { name: /New build/ }).getAttribute('title') ?? ''),
    await page.getByRole('button', { name: /New build/ }).getAttribute('title'));

  check(`${label}: no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
  await ctx.close();
}

// --- Never mid-raid ---------------------------------------------------------
// A reload during a raid throws the run away, so the notice waits for camp.
{
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  const page = await ctx.newPage();
  served = { version: VERSION, builtAt: new Date().toISOString() };
  await page.goto(`${base}/index.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  // A fresh squad cannot deploy until somebody is named leader.
  await page.evaluate(() => {
    const a = window.__ashenveil;
    a.profile.squadTactics.leaderId = a.profile.squad[0];
    a.save();
    a.go('hub');
  });
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Deploy to the raid' }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Enter the raid' }).click();
  await page.waitForTimeout(600);
  check('a raid is running', (await page.locator('canvas').count()) >= 1);

  served = { version: '9999.01.01-000000', builtAt: new Date().toISOString() };
  await page.evaluate(() => window.__ashenveil.checkBuild(true));
  await page.waitForTimeout(700);
  check('a stale build does not interrupt a raid',
    (await page.getByRole('button', { name: /New build/ }).count()) === 0);
  await ctx.close();
}

await browser.close();
await new Promise((r) => server.close(r));
console.log(failures ? `\n${failures} check(s) failed` : '\nAll version UI checks passed');
process.exit(failures ? 1 : 0);
