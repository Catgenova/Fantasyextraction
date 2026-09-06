#!/usr/bin/env node
// Movement regression test.
//
// Steering used to walk a hero straight at their destination and let collision
// resolution push them back out of whatever they hit. Against a rock that is a
// closed loop — step in, get pushed out, step in again — and heroes spent
// whole raids pinned to one spot. Three distinct failures had to be handled:
//
//   * walking into scenery          -> look ahead and lean around it
//   * orbiting an obstacle cluster  -> a detour waypoint to the clearer side
//   * wedged in a corner            -> back out along the collision normal
//
// The last one is the reason this is measured rather than eyeballed: a wedged
// hero is running at full speed and a naive "are they moving?" check passes.
//
//   node tools/test-movement.js

import { Match, TICK } from '../src/sim/match.js';
import { newProfile, squadHeroes } from '../src/game/profile.js';
import { generateBotSquads } from '../src/sim/bots.js';
import { autoAllocate, sanitizeHero } from '../src/sim/heroes.js';
import { rollItem, SLOTS, canEquip } from '../src/data/gear.js';
import { makeRng } from '../src/core/rng.js';
import { MATCH_SECONDS } from '../src/data/enemies.js';

const RUNS = 6;
const SAMPLE = 1;         // seconds between position samples
const MOVED_MIN = 12;     // ground covered in a sample, or they went nowhere
const FAR = 60;           // only judge heroes that have somewhere to be

// Ceilings sit well clear of current numbers so ordinary jostling does not
// trip them, while a return of any of the three failures above would.
//
// The distance floor is set against the broken baseline of ~48k units per
// hero, not against the ~91k a draft of the fix produced — that draft was
// detouring heroes back out of extraction zones, so most of the extra ground
// was wandering rather than progress.
const MAX_STUCK_SHARE = 0.12;
const MAX_STUCK_RUN = 400;
const MIN_DISTANCE = 56000;

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

let stuckSeconds = 0;
let liveSeconds = 0;
let worstRun = 0;
let totalDistance = 0;
let heroCount = 0;

for (let i = 0; i < RUNS; i++) {
  const seed = 900 + i;
  const profile = newProfile(seed);
  const rng = makeRng(seed ^ 0x5bf03635);
  for (const hero of profile.roster) {
    hero.level = 5;
    autoAllocate(rng, hero);
    for (const slot of SLOTS) {
      const item = rollItem(rng, { slot, classId: hero.classId, rarity: 'common', ilvl: 5 });
      if (canEquip(item, hero.classId)) hero.equipped[slot] = item;
    }
    sanitizeHero(hero);
  }

  const match = new Match({
    seed,
    playerSquad: { id: 'player', name: 'Yours', isPlayer: true, heroes: squadHeroes(profile), tactics: profile.squadTactics },
    botSquads: generateBotSquads(seed, 5, 5),
  });

  const anchors = new Map();
  const runs = new Map();
  const travelled = new Map();
  let next = SAMPLE;
  let ticks = 0;

  while (match.phase !== 'ended' && ticks < MATCH_SECONDS / TICK + 50) {
    match.update(TICK);
    ticks++;
    if (match.time < next) continue;
    next += SAMPLE;

    for (const e of match.entities) {
      if (e.kind !== 'hero') continue;
      if (!e.alive || e.extracted) { anchors.delete(e.id); runs.set(e.id, 0); continue; }
      const previous = anchors.get(e.id);
      anchors.set(e.id, { x: e.pos.x, y: e.pos.y });
      if (!previous) continue;

      const moved = Math.hypot(e.pos.x - previous.x, e.pos.y - previous.y);
      travelled.set(e.id, (travelled.get(e.id) ?? 0) + moved);

      const wantsToTravel = e._desired
        && Math.hypot(e._desired.pos.x - e.pos.x, e._desired.pos.y - e.pos.y) > FAR;
      liveSeconds += SAMPLE;
      if (wantsToTravel && moved < MOVED_MIN) {
        stuckSeconds += SAMPLE;
        const run = (runs.get(e.id) ?? 0) + SAMPLE;
        runs.set(e.id, run);
        worstRun = Math.max(worstRun, run);
      } else {
        runs.set(e.id, 0);
      }
    }
  }

  for (const [, d] of travelled) { totalDistance += d; heroCount++; }
}

const share = stuckSeconds / Math.max(1, liveSeconds);
const perHero = Math.round(totalDistance / Math.max(1, heroCount));

check(`heroes rarely fail to make progress (${(share * 100).toFixed(1)}%)`,
  share <= MAX_STUCK_SHARE, `limit ${MAX_STUCK_SHARE * 100}%`);
check(`nobody is pinned for a whole raid (worst ${worstRun.toFixed(0)}s)`,
  worstRun <= MAX_STUCK_RUN, `limit ${MAX_STUCK_RUN}s`);
check(`heroes cover ground (${perHero} units each)`,
  perHero >= MIN_DISTANCE, `floor ${MIN_DISTANCE}`);

console.log(failures ? `\n${failures} check(s) failed` : '\nAll movement checks passed');
process.exit(failures ? 1 : 0);
