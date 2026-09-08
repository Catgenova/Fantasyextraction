#!/usr/bin/env node
// The build stamp, and the three places that have to agree about it.
//
// `main` is what GitHub Pages serves, so pushing is publishing — and a player
// whose browser is holding half of the last build has no way to tell. The
// stamp is how they tell. It is worth a test because it is the kind of thing
// that rots silently: nothing in the game stops working when the stamp is
// stale, it just stops being true, and a version number that lies is worse
// than none at all.
//
//   node tools/test-version.js

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { VERSION, BUILT_AT } from '../src/version.js';

const ROOT = new URL('..', import.meta.url).pathname;

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const html = await readFile(join(ROOT, 'index.html'), 'utf8');
const json = JSON.parse(await readFile(join(ROOT, 'version.json'), 'utf8'));

console.log('=== the stamp is a real build id ===');
check('it looks like a build id and not a placeholder',
  /^\d{4}\.\d{2}\.\d{2}-\d{6}$/.test(VERSION), VERSION);
check('and carries the moment it was made',
  !Number.isNaN(Date.parse(BUILT_AT)), BUILT_AT);

console.log('\n=== every copy of it agrees ===');
// Four copies, because there is no build step to derive them from one another.
// They are written together by tools/stamp-version.mjs and this is what stops
// three of them being right and one being from last week.
check('version.json matches the compiled-in version',
  json.version === VERSION, `${json.version} against ${VERSION}`);
check('and so does the moment', json.builtAt === BUILT_AT);

const entry = html.match(/src="\.\/src\/main\.js\?v=([^"]+)"/)?.[1] ?? null;
const styles = html.match(/href="\.\/styles\.css\?v=([^"]+)"/)?.[1] ?? null;
check('the entry module is loaded at this version', entry === VERSION, String(entry));
check('and so is the stylesheet', styles === VERSION, String(styles));

console.log('\n=== and it is actually used ===');
// A stamp nothing reads is a stamp nobody notices going stale.
const main = await readFile(join(ROOT, 'src/main.js'), 'utf8');
const fresh = await readFile(join(ROOT, 'src/freshness.js'), 'utf8');
check('the running build is shown in the topbar',
  /VERSION/.test(main) && /watchForNewBuild/.test(main));
check('and the freshness check reads the deployed one',
  /version\.json/.test(fresh) && /no-store/.test(fresh));
// The one file that must never come from cache is the file that says whether
// the cache is stale, so it is busted twice: no-store and a changing query.
check('with the cache defeated twice over',
  /cache: 'no-store'/.test(fresh) && /\?t=\$\{now\}/.test(fresh));
check('and it never breaks the game when it fails',
  /catch \{\s*return null;\s*\}/.test(fresh));

console.log('\n=== the stamper agrees with itself ===');
const stamper = await import('./stamp-version.mjs').catch(() => null);
if (stamper?.readStamps) {
  const s = await stamper.readStamps();
  const all = [s.js, s.json, s.entry, s.styles];
  check('--check reads all four and finds them equal',
    all.every((v) => v === VERSION), JSON.stringify(s));
} else {
  check('the stamper exposes what it wrote', false, 'readStamps not exported');
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll version checks passed');
process.exit(failures ? 1 : 0);
