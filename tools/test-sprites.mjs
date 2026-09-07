#!/usr/bin/env node
// The class art: the baked sheets, the atlas that indexes them, and the layer
// that picks a frame.
//
// Most of this is about the atlas being complete, because the failure it
// guards is silent. A partial bake used to rewrite atlas.json with only the
// classes in that run: the other twelve PNGs stayed on disk, every one of them
// stopped being drawable, and the raid view quietly fell back to shapes with
// nothing in the console to say why.
//
//   node tools/test-sprites.mjs
//
// The browser half needs Playwright and skips without it.

import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { CLASSES } from '../src/data/classes.js';
import { ANIMATIONS, ANIMATION_IDS, poseForFrame } from '../src/art/anim.js';
import { KITS, kitFor } from '../src/art/kits.js';
import * as GEAR from '../src/art/gear.js';
import { animFor } from '../src/ui/sprites.js';
import { restPose } from '../src/art/rig.js';

const ROOT = new URL('..', import.meta.url).pathname;
let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

// ------------------------------------------------------------------- kits --
console.log('=== every class has art ===');

const classIds = Object.keys(CLASSES);
check('a kit for every class',
  classIds.every((id) => KITS[id]),
  classIds.filter((id) => !KITS[id]).join(',') || 'all present');
check('and no kit for a class that does not exist',
  Object.keys(KITS).every((id) => CLASSES[id]),
  Object.keys(KITS).filter((id) => !CLASSES[id]).join(',') || 'none');
check('every kit carries something',
  classIds.every((id) => typeof kitFor(id).weapon === 'function'),
  classIds.filter((id) => typeof kitFor(id).weapon !== 'function').join(',') || 'all armed');
// Thirteen figures have to be told apart at about twenty-six pixels, and the
// only levers that survive that are width, reach and grip. If two classes
// match on all of shoulder width, weapon and offhand they are the same
// silhouette in two colours.
// Name the thing in each hand by which export it is. Comparing the wrapper
// functions directly says every class carries the same weapon, because
// `inHand` returns the same closure shape for all of them.
const gearName = new Map(Object.entries(GEAR).map(([k, v]) => [v, k]));
const heldName = (slot) => (slot ? gearName.get(slot.draws) ?? 'custom' : 'none');
const sig = (id) => {
  const k = kitFor(id);
  return `w${k.shoulder}|${heldName(k.weapon)}|${heldName(k.offhand)}|${k.twoHanded ?? false}`;
};
const sigs = new Map();
for (const id of classIds) {
  const s = sig(id);
  if (!sigs.has(s)) sigs.set(s, []);
  sigs.get(s).push(id);
}
const clashes = [...sigs.values()].filter((g) => g.length > 1);
check('no two classes share a silhouette', clashes.length === 0,
  clashes.map((g) => g.join('/')).join(', ') || 'all distinct');

// ------------------------------------------------------------- animations --
console.log('\n=== the animations are usable ===');

check('every animation has frames and a duration',
  ANIMATION_IDS.every((a) => ANIMATIONS[a].frames > 0 && ANIMATIONS[a].seconds > 0));
// A looping animation whose last frame repeats its first stutters once a cycle.
for (const id of ANIMATION_IDS.filter((a) => ANIMATIONS[a].loop)) {
  const first = JSON.stringify(poseForFrame(id, kitFor('knight'), 0));
  const last = JSON.stringify(poseForFrame(id, kitFor('knight'), ANIMATIONS[id].frames - 1));
  check(`${id} does not end where it starts`, first !== last);
}
// A one-shot has to actually arrive somewhere, or the death pose never lands.
const dieEnd = poseForFrame('die', kitFor('knight'), ANIMATIONS.die.frames - 1);
check('a death animation reaches the ground', dieEnd.fallen > 0.95, dieEnd.fallen.toFixed(2));
check('and rest is not already fallen', restPose().fallen === 0);

// --------------------------------------------------------------- priority --
console.log('\n=== what a hero is doing decides the animation ===');

const hero = (over = {}) => ({
  id: 'h1', kind: 'hero', classId: 'knight', alive: true, facing: 0,
  pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 },
  lastDamageAt: -999, lastSwingAt: -999, lastCastAt: -999, ...over,
});
const at = (e, t = 100) => animFor(e, t).id;

check('a still hero idles', at(hero()) === 'idle');
check('a moving hero walks', at(hero({ vel: { x: 60, y: 0 } })) === 'walk');
check('a swing outranks walking',
  at(hero({ vel: { x: 60, y: 0 }, lastSwingAt: 99.9 })) === 'attack');
check('a cast outranks a swing',
  at(hero({ lastSwingAt: 99.9, lastCastAt: 99.9 })) === 'cast');
check('a flinch outranks both',
  at(hero({ lastSwingAt: 99.9, lastCastAt: 99.9, lastDamageAt: 99.95 })) === 'hurt');
// Without this a hero killed mid-swing keeps swinging on the ground.
check('death outranks everything',
  at(hero({ alive: false, deathTime: 99, lastSwingAt: 99.9, lastDamageAt: 99.95 })) === 'die');
check('a stale swing is not still swinging',
  at(hero({ lastSwingAt: 100 - ANIMATIONS.attack.seconds - 0.1 })) === 'idle');

// Two identical heroes must not breathe in unison.
const a = hero({ id: 'alpha' }), b = hero({ id: 'beta' });
check('identical heroes idle out of phase',
  animFor(a, 100).t !== animFor(b, 100).t,
  `${animFor(a, 100).t.toFixed(2)} vs ${animFor(b, 100).t.toFixed(2)}`);

// A walk is phased by ground covered, so a slowed hero does not moonwalk.
const slow = hero({ id: 'slow', vel: { x: 20, y: 0 } });
const fast = hero({ id: 'fast', vel: { x: 90, y: 0 } });
animFor(slow, 100); animFor(fast, 100);
const slowStep = animFor(slow, 100).t, fastStep = animFor(fast, 100).t;
check('a faster hero cycles its walk faster', fastStep > slowStep,
  `${slowStep.toFixed(3)} vs ${fastStep.toFixed(3)}`);

// ------------------------------------------------------------------ atlas --
console.log('\n=== the baked sheets and their index agree ===');

let atlas = null;
try {
  atlas = JSON.parse(await readFile(join(ROOT, 'assets/sprites/atlas.json'), 'utf8'));
} catch {
  check('assets/sprites/atlas.json exists', false, 'run node tools/bake-sprites.mjs');
}

if (atlas) {
  check('the atlas indexes every class',
    classIds.every((id) => atlas.classes[id]),
    classIds.filter((id) => !atlas.classes[id]).join(',') || 'all thirteen');

  const missingAnim = [];
  const badSize = [];
  for (const [id, meta] of Object.entries(atlas.classes)) {
    for (const animId of ANIMATION_IDS) {
      if (!meta.animations[animId]) missingAnim.push(`${id}:${animId}`);
      else if (meta.animations[animId].frames !== ANIMATIONS[animId].frames) {
        missingAnim.push(`${id}:${animId} frames`);
      }
    }
    // The PNG has to be exactly the grid the atlas claims, or every frame
    // after the first is sampled from the wrong place.
    try {
      const png = await readFile(join(ROOT, 'assets/sprites', meta.file));
      const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
      if (w !== meta.cols * meta.cell || h !== meta.rows * meta.cell) {
        badSize.push(`${id} ${w}x${h} != ${meta.cols * meta.cell}x${meta.rows * meta.cell}`);
      }
    } catch {
      badSize.push(`${id} unreadable`);
    }
  }
  check('every class indexes every animation', missingAnim.length === 0,
    missingAnim.slice(0, 4).join(', ') || 'complete');
  check('every sheet is the size its index claims', badSize.length === 0,
    badSize.slice(0, 3).join(', ') || 'all match');
  check('rows do not collide',
    Object.values(atlas.classes).every((m) => {
      const rows = Object.values(m.animations).map((a) => a.row);
      return new Set(rows).size === rows.length;
    }));
}

// ---------------------------------------------------------------- browser --
console.log('\n=== the raid draws them ===');

let playwright;
try { playwright = await import('playwright'); }
catch {
  try { playwright = await import('/opt/node22/lib/node_modules/playwright/index.mjs'); }
  catch { playwright = null; }
}

if (!playwright) {
  console.log('SKIP  Playwright is not installed — the raid half not run.');
} else {
  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
  const server = createServer(async (req, res) => {
    try {
      const p = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
      const f = join(ROOT, p === '/' ? 'index.html' : p);
      const body = await readFile(f);
      res.writeHead(200, { 'Content-Type': TYPES[extname(f)] ?? 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404).end('not found'); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await playwright.chromium.launch();

  const raid = async (page) => {
    await page.goto(`${base}/index.html`, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    await page.locator('.leader-pick button').first().click();
    await page.getByRole('button', { name: /Deploy to the raid/ }).click();
    await page.waitForTimeout(250);
    await page.getByRole('button', { name: 'Enter the raid' }).click();
    await page.waitForTimeout(2200);
  };

  {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await raid(page);

    const got = await page.evaluate(async () => {
      const sp = await import('/src/ui/sprites.js');
      const m = window.__ashenveil.liveMatch;
      const heroes = m.entities.filter((e) => e.kind === 'hero');
      const ctx = document.createElement('canvas').getContext('2d');
      return {
        ready: sp.spritesReady(),
        heroes: heroes.length,
        drawn: heroes.filter((h) => sp.drawHeroSprite(ctx, h, m.time, 14)).length,
      };
    });
    check('the sheets load in a raid', got.ready);
    check('and every hero on the field draws from one',
      got.heroes > 0 && got.drawn === got.heroes, `${got.drawn}/${got.heroes}`);
    check('no console errors', errors.length === 0, errors.slice(0, 2).join(' | '));
    await page.close();
  }

  // The fallback is the whole reason the sprite path is a conditional. A
  // missing asset has to cost the art and nothing else.
  {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/assets/sprites/**', (route) => route.abort());
    await raid(page);
    const ok = await page.evaluate(async () => {
      const sp = await import('/src/ui/sprites.js');
      const m = window.__ashenveil.liveMatch;
      return { ready: sp.spritesReady(), running: m.phase === 'running', canvas: !!document.querySelector('canvas#stage') };
    });
    check('with the sheets blocked nothing loads', ok.ready === false);
    check('and the raid still runs', ok.running && ok.canvas);
    check('without throwing', errors.length === 0, errors.slice(0, 2).join(' | '));
    await page.close();
  }

  await browser.close();
  await new Promise((r) => server.close(r));
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
