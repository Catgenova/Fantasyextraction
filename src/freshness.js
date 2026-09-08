// Is the page you are looking at the build that is deployed?
//
// The site is plain ES modules on GitHub Pages: no bundler, no content hashes,
// no service worker, and no way to set cache headers. Pages serves everything
// with a ten-minute max-age, so a tab that has been open longer than that —
// or one left open across a deploy — keeps running the old build with no sign
// that anything has moved. That is not hypothetical; it is how a stash panel
// from two commits ago ended up in a screenshot.
//
// What this does and does not do, plainly:
//
//   It DOES catch the stale tab, which is the failure that actually happens.
//   `version.json` is fetched with no-store, so it is always the deployed
//   build, and comparing it against the VERSION compiled into the running code
//   is exact.
//
//   It does NOT hash every module URL, so it cannot *guarantee* a reload pulls
//   a completely fresh graph. The entry carries ?v= and so is a new URL every
//   build; its imports are revalidated by ETag, which on Pages means they are
//   fresh within the ten-minute window. Closing that last gap needs content
//   hashing, which needs a build step, which this project does not have.
//
// It never throws and never blocks: a version check that breaks the game is
// worse than the staleness it was meant to report.

import { VERSION } from './version.js';

// Enough that a player switching back and forth does not fetch on every
// glance, short enough that a deploy is noticed within a minute of looking.
const RECHECK_AFTER = 60_000;

let lastChecked = 0;
let deployed = null;

/**
 * The deployed build id, or null if it could not be read.
 *
 * Cache-busted twice over — `no-store` and a changing query — because the one
 * file that must never be served from cache is the file that says whether the
 * cache is stale.
 */
export async function deployedVersion(force = false) {
  const now = Date.now();
  if (!force && deployed && now - lastChecked < RECHECK_AFTER) return deployed;
  lastChecked = now;
  try {
    const res = await fetch(`./version.json?t=${now}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const body = await res.json();
    deployed = typeof body?.version === 'string' ? body.version : null;
    return deployed;
  } catch {
    return null;
  }
}

/** The build id this code was stamped with. */
export const runningVersion = () => VERSION;

/**
 * Watch for the running build going stale, and call back when it has.
 *
 * Checks on start and whenever the tab is looked at again, which is when a
 * long-open tab is most likely to be wrong and the moment a player is most
 * likely to act on being told.
 */
export function watchForNewBuild(onStale) {
  let told = false;
  // `force` skips the throttle. Nothing in the game passes it; the browser
  // test does, because otherwise checking that a deploy is noticed means
  // waiting out RECHECK_AFTER in real time.
  const check = async (force = false) => {
    if (told) return;
    const live = await deployedVersion(force);
    if (!live || live === VERSION) return;
    told = true;
    onStale(live);
  };
  check();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
  return check;
}
