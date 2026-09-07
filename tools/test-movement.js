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
// The map currently generates no obstacles at all (see `OBSTACLE_CLUSTERS` in
// src/sim/map.js), so all three failure modes are dormant and the numbers here
// are close to ideal: 1.2% stuck against 8.3% with rocks on the map, and a
// worst pin of 18s against 253s. The checks stay because the rocks are meant
// to come back, and this is what tells us whether the steering is ready.
//
//   node tools/test-movement.js

import { Match, TICK } from '../src/sim/match.js';
import { newProfile, squadHeroes } from '../src/game/profile.js';
import { generateBotSquads } from '../src/sim/bots.js';
import { autoAllocate, sanitizeHero } from '../src/sim/heroes.js';
import { craftItem, SLOTS, slotsForPart, canEquip, packCapacity } from '../src/data/gear.js';
import { QUALITY_ORDER } from '../src/data/parts.js';
import { CREATURES } from '../src/data/creatures.js';
import { makeRng } from '../src/core/rng.js';
import { MATCH_SECONDS } from '../src/data/enemies.js';

// Kit forged from species of the squad's own depth — the tests need a squad
// that has been hunting, not one in its starter rags.
const FORGEABLE = Object.values(CREATURES);
function forgeFor(rng, slot, classId, quality, level) {
  const depth = level >= 12 ? 2 : level >= 7 ? 1 : 0;
  const pool = FORGEABLE.filter((c) => c.tier <= depth
    && Object.keys(c.parts).some((p) => slotsForPart(p).includes(slot)));
  if (!pool.length) return null;
  const species = pool[Math.floor(rng() * pool.length)];
  const options = Object.keys(species.parts).filter((p) => slotsForPart(p).includes(slot));
  const partType = options[Math.floor(rng() * options.length)];
  return craftItem({ speciesId: species.id, partType, slot, quality, classId });
}

// Both knobs are here because the numbers below are only meaningful against a
// stated sample. RUNS=20 SEED0=3000 node tools/test-movement.js re-runs any of
// the measurements quoted in the comments, and comparing two builds means
// comparing them across several seed bases rather than one.
const RUNS = Number(process.env.RUNS ?? 6);
const SAMPLE = 1;         // seconds between position samples
const MOVED_MIN = 12;     // ground covered in a sample, or they went nowhere
const FAR = 60;           // only judge heroes that have somewhere to be

// Ceilings sit well clear of current numbers so ordinary jostling does not
// trip them, while a return of any of the three failures above would.
//
// The third check is the weakest and was twice lowered for reasons that were
// not bugs. It was a floor on total ground covered per hero, which is not a
// movement measurement at all: it falls whenever heroes die sooner. So it now
// measures the rate heroes move at while alive, which is what it was always a
// proxy for and is indifferent to how long anyone survives.
//
// That rate is not constant across content changes either. Adding eight
// classes and five boss arenas took it from 66.0 units/s to 57.4: four of the
// eight new classes are melee, so squads crowd the same spot and jam each
// other more often, and seven arenas put more on the map to stand and fight.
// Both were the content doing what it was added to do. Clearing the obstacles
// took it back to 66.7, which is the ceiling for this squad layout.
//
// Do not mistake this for a sensitive detector of bad steering. Deleting
// obstacle avoidance outright barely moves it — it stays a coarse floor on
// whether squads travel at all, which is all it ever was. The two checks
// above measure stuckness directly and carry the weight.
const MAX_STUCK_SHARE = 0.12;
// Half a raid. See the note above the check that uses it: the longest single
// pin is a maximum on a heavy tail and cannot carry a tighter bound honestly.
const MAX_STUCK_RUN = 900;
const LONG_PIN = 60;             // a pin past this is no longer ordinary jostling
const MAX_LONG_PIN_SHARE = 0.02; // ~4x the worst clean batch measured; see below
const MIN_SPEED = 48; // units covered per second alive, averaged over every hero

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

let stuckSeconds = 0;
let liveSeconds = 0;
let worstRun = 0;
let longPinSeconds = 0;
let totalDistance = 0;

for (let i = 0; i < RUNS; i++) {
  const seed = Number(process.env.SEED0 ?? 900) + i;
  const profile = newProfile(seed);
  const rng = makeRng(seed ^ 0x5bf03635);
  for (const hero of profile.roster) {
    hero.level = 5;
    autoAllocate(rng, hero);
    for (const slot of SLOTS) {
      const item = forgeFor(rng, slot, hero.classId, 'sound', hero.level ?? 5);
      if (item && canEquip(item, hero.classId)) hero.equipped[slot] = item;
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
        // Time spent inside a pin that has already gone on too long. Counted
        // from the moment a run crosses the threshold, so a single bad pin
        // contributes its whole length rather than one sample.
        if (run > LONG_PIN) longPinSeconds += SAMPLE;
      } else {
        runs.set(e.id, 0);
      }
    }
  }

  for (const [, d] of travelled) totalDistance += d;
}

const share = stuckSeconds / Math.max(1, liveSeconds);
const longShare = longPinSeconds / Math.max(1, liveSeconds);
const speed = totalDistance / Math.max(1, liveSeconds);

check(`heroes rarely fail to make progress (${(share * 100).toFixed(1)}%)`,
  share <= MAX_STUCK_SHARE, `limit ${MAX_STUCK_SHARE * 100}%`);

// The longest single pin is a max over roughly three hundred hero-raids, and
// maxima on a heavy tail do not converge — measured over four separate batches
// of twenty raids the same build reported 34s, 104s, 208s and 259s, and a
// change that touched nothing about movement moved it to 24s, 66s, 286s and
// 450s. So this limit is what its name says and nothing tighter: a hero who
// loses half a raid standing still is broken, and anything short of that is
// not something a max can tell you.
check(`nobody loses half a raid to being pinned (worst ${worstRun.toFixed(0)}s)`,
  worstRun <= MAX_STUCK_RUN, `limit ${MAX_STUCK_RUN}s`);

// This is the check that watches for pinning getting worse. It is a rate
// rather than a maximum, so it converges: the share of live hero-time spent
// inside a pin that has already run past LONG_PIN seconds. Turning the map's
// obstacles back on — the one change known to cause real pinning — moved it
// consistently and in the right direction on both bases it was measured on,
// 0.17% to 0.56% and 0.22% to 0.73%, where the maximum on those same runs
// went 450s to 1197s and 286s to 557s.
//
// The limit is loose on purpose and this is what it can honestly claim. Over
// eight seed bases at the default six raids the clean build reads 0.00–0.52%,
// which already overlaps the obstacles-on range, so at this sample size the
// check cannot resolve a mild regression. What 2% catches is a large one,
// without false-failing on an unlucky batch. Raise RUNS to tighten it.
check(`long pins stay rare (${(longShare * 100).toFixed(2)}% of hero-time)`,
  longShare <= MAX_LONG_PIN_SHARE, `limit ${(MAX_LONG_PIN_SHARE * 100).toFixed(2)}%`);
check(`heroes keep moving while they are alive (${speed.toFixed(1)} units/s)`,
  speed >= MIN_SPEED, `floor ${MIN_SPEED}`);

console.log(failures ? `\n${failures} check(s) failed` : '\nAll movement checks passed');
process.exit(failures ? 1 : 0);
