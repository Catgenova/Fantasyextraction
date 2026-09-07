#!/usr/bin/env node
// "Extract now" has to actually leave.
//
// This is entirely a question of priority order inside `pickDestination`.
// Retreating runs a wounded hero away from the enemy rather than toward the
// door; rejoining sends a follower chasing a leader who is themselves
// running; the leader turning back for stragglers stops the dash dead. With
// any of those ahead of the extract check, a squad ordered out mills around
// the fight instead — 306 seconds to reach a door, against 77 with the order
// correct.
//
// The channel matters as much as the walk. Damage pauses it rather than
// wiping it: on an eight second channel, a reset meant anything landing one
// hit every eight seconds kept a hero at the door forever, and being chased
// to an exit is the normal way to arrive at one.
//
//   node tools/test-extraction.js

import { Match, TICK } from '../src/sim/match.js';
import { newProfile, squadHeroes } from '../src/game/profile.js';
import { generateBotSquads } from '../src/sim/bots.js';
import { autoAllocate, sanitizeHero } from '../src/sim/heroes.js';
import { craftItem, SLOTS, slotsForPart, canEquip, packCapacity } from '../src/data/gear.js';
import { QUALITY_ORDER } from '../src/data/parts.js';
import { CREATURES } from '../src/data/creatures.js';
import { makeRng } from '../src/core/rng.js';
import { bestExtract } from '../src/sim/map.js';
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

const RUNS = 10;
const ORDER_AT = 260;        // after the first exit opens at 180
const MAX_TIME_TO_EXIT = 180; // generous: a door is well under a minute away
const MIN_SUCCESS = 5;        // of RUNS; the rest are squads that died trying

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

let succeeded = 0;
let sumFirst = 0;
let worstStall = 0;

for (let i = 0; i < RUNS; i++) {
  const seed = 900 + i;
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
  profile.squadTactics.leaderId = profile.roster[0].id;

  const match = new Match({
    seed,
    playerSquad: { id: 'player', name: 'Yours', isPlayer: true, heroes: squadHeroes(profile), tactics: profile.squadTactics },
    botSquads: generateBotSquads(seed, 5, 5),
  });
  const squad = match.playerSquad;

  let ordered = false;
  let orderedAt = 0;
  let lastDist = Infinity;
  let stall = 0;
  let ticks = 0;
  let nextSample = 0;

  while (match.phase !== 'ended' && ticks < MATCH_SECONDS / TICK + 50) {
    match.update(TICK);
    ticks++;

    if (!ordered && match.time >= ORDER_AT) {
      const centre = match.squadCentroid(squad);
      if (centre) {
        squad.manualOrder = { mode: 'extract', extract: bestExtract(match.map, centre, match.time) };
        ordered = true;
        orderedAt = match.time;
      }
    }
    if (!ordered || match.time < nextSample) continue;
    nextSample = match.time + 1;

    const live = squad.memberIds.map((id) => match.byId(id)).filter((m) => m?.alive && !m.extracted);
    if (!live.length) break;
    const exit = squad.order?.extract;
    if (!exit) continue;

    const centre = match.squadCentroid(squad);
    const d = Math.hypot(centre.x - exit.x, centre.y - exit.y);
    // A second without closing on the door counts against the dash.
    if (d > lastDist - 5) { stall++; worstStall = Math.max(worstStall, stall); } else stall = 0;
    lastDist = d;
  }

  const out = squad.memberIds.map((id) => match.byId(id)).filter((m) => m?.extracted);
  if (out.length) {
    succeeded++;
    sumFirst += Math.min(...out.map((m) => m.extractedAt)) - orderedAt;
  }
}

const avgFirst = succeeded ? sumFirst / succeeded : Infinity;

check(`ordering an extraction gets someone out (${succeeded}/${RUNS})`,
  succeeded >= MIN_SUCCESS, `floor ${MIN_SUCCESS}`);
check(`squads reach a door promptly (${Math.round(avgFirst)}s to the first exit)`,
  avgFirst <= MAX_TIME_TO_EXIT, `limit ${MAX_TIME_TO_EXIT}s`);
check(`the dash keeps closing on the door (worst ${worstStall}s without progress)`,
  worstStall <= 60, 'limit 60s');

console.log(failures ? `\n${failures} check(s) failed` : '\nAll extraction checks passed');
process.exit(failures ? 1 : 0);
