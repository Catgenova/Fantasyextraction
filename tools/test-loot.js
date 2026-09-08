#!/usr/bin/env node
// Loot behaviour regression test.
//
// A squad used to be able to commit to a pile it could not physically lift —
// the squad-level filter asked only whether a hero's loot policy *wanted* an
// item, never whether they had room for it. A full-bagged Knight set to take
// everything would target a pile of commons, fail the full-bag swap check,
// and stand on it for the rest of the raid. Nothing crashed and nothing
// errored; the squad simply stopped playing.
//
// So this measures behaviour rather than correctness: how long the squad
// spends in loot mode, and whether that time actually produces pickups.
//
//   node tools/test-loot.js

import { Match, TICK } from '../src/sim/match.js';
import { newProfile, squadHeroes } from '../src/game/profile.js';
import { generateBotSquads } from '../src/sim/bots.js';
import { autoAllocate, sanitizeHero } from '../src/sim/heroes.js';
import { craftItem, SLOTS, slotsForPart, canEquip, packCapacity } from '../src/data/gear.js';
import { QUALITY_ORDER } from '../src/data/parts.js';
import { CREATURES } from '../src/data/creatures.js';
import { makeRng } from '../src/core/rng.js';
import { MATCH_SECONDS } from '../src/data/enemies.js';
import { canTake, wantsItem } from '../src/sim/ai.js';

import { LOOT_PATIENCE, LOOT_TRAVEL_LIMIT } from '../src/sim/ai.js';

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

const RUNS = 24;
// Generous ceilings: these catch a squad that has stopped playing, not a
// squad that is merely being thorough.
//
// The stall is measured per pile. It used to run until the squad left loot
// mode entirely, so consecutive failed piles chained into one number with no
// ceiling the sim could justify — and a fixed 30s guard was one abandoned
// pile away from firing at any time. A squad moving briskly between piles is
// not parked; a squad stuck on one is, and that is what the AI's own two
// limits bound. Thrashing between piles is still caught, by the share below.
const MAX_STALL = LOOT_TRAVEL_LIMIT + LOOT_PATIENCE + 4;
// What "looting is a small share of the raid" is allowed to mean.
//
// This was a ceiling on the worst single raid of six, and it could not survive
// being looked at: measured over twenty-four raids the build it was written
// against peaks at 29.9%, above its own 25% limit. Six raids simply never drew
// the tail. A maximum on a heavy tail does not converge — the same mistake as
// the worst-pin check in test-movement.js — so the claim is now made as a rate
// over enough raids to be one, plus a ceiling loose enough to catch a squad
// that has genuinely stopped playing.
const MAX_LOOT_SHARE = 0.35;      // no single raid may pass this
const LOOT_SHARE_TYPICAL = 0.25;  // and few raids may pass this
const MAX_OVER_TYPICAL = 0.25;    // "few" being a quarter of them

// Loot time has to buy something. This is the check that actually guards
// against waste, and it is the one that does not move when the map gets more
// to carve: with twenty-three grounds a squad meets three times as many apexes
// (0.29 boss kills a raid to 1.08) and carving them is time well spent, but a
// squad thrashing between piles it cannot clear would show up here and nowhere
// else. Measured at 53.9 pickups per loot-minute before the second ten and
// 45.6 after — the fall is real and is the cost of corpses being further
// apart on a map with more of them on it.
const MIN_PICKUPS_PER_LOOT_MINUTE = 34;

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

// --- Unit level: the predicate the whole thing hinges on -------------------
{
  const rng = makeRng(1);
  // The pack holds copies of one item and is offered another exactly like it,
  // so "cannot take it" is a statement about the swap rule rather than about
  // which base types happened to roll — rolling distinct commons made this
  // fixture quietly depend on the size of the base-item pool.
  const common = craftItem({ speciesId: 'threshclaw', partType: 'hide', slot: 'hands', quality: 'ragged' });
  // Pack size comes from the pouch now, so the fixture has to wear one to have
  // a capacity to fill at all.
  const pouch = craftItem({ speciesId: 'threshclaw', partType: 'sinew', slot: 'pouch', quality: 'ragged' });
  const hero = {
    tactics: { lootPolicy: 'greedy' },
    equipped: { pouch },
    consumables: [],
    inventory: Array.from({ length: packCapacity({ pouch }) }, () => ({ ...common })),
  };
  const legendary = craftItem({ speciesId: 'nightfell', partType: 'marrow', slot: 'trinket', quality: 'mythic' });

  check('a full pack still *wants* a common', wantsItem(hero, common));
  check('but cannot take it', !canTake(hero, common));
  check('a full pack can take a clear upgrade', canTake(hero, legendary));

  hero.inventory.pop();
  check('room in the pack means anything wanted can be taken', canTake(hero, common));

  const picky = { tactics: { lootPolicy: 'ignore' }, equipped: {}, consumables: [], inventory: [] };
  check('an ignoring hero takes nothing', !canTake(picky, legendary));
}

// --- Whole raids ----------------------------------------------------------
let worstStall = 0;
let worstShare = 0;
let totalPickups = 0;
let totalLootTime = 0;
const shares = [];

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

  const match = new Match({
    seed,
    playerSquad: { id: 'player', name: 'Yours', isPlayer: true, heroes: squadHeroes(profile), tactics: profile.squadTactics },
    botSquads: generateBotSquads(seed, 5, 5),
  });

  const squad = match.playerSquad;
  const members = () => squad.memberIds.map((id) => match.byId(id)).filter(Boolean);
  let pickups = 0;
  match.onLooted = (e) => { if (e.squadId === 'player') pickups++; };

  let stall = 0;
  let lootTime = 0;
  let lastSig = '';
  let lastPile = null;
  let ticks = 0;
  while (match.phase !== 'ended' && ticks < MATCH_SECONDS / TICK + 50) {
    match.update(TICK);
    ticks++;
    const sig = members().map((m) => m.inventory.length).join(',');
    if (squad.order?.mode === 'loot') {
      lootTime += TICK;
      // Reset on a pickup or on committing to a different pile: this measures
      // time sunk into one pile that yielded nothing.
      const samePile = squad.order.pileId === lastPile;
      stall = sig === lastSig && samePile ? stall + TICK : 0;
      lastPile = squad.order.pileId;
      worstStall = Math.max(worstStall, stall);
    } else {
      stall = 0;
      lastPile = null;
    }
    lastSig = sig;
  }

  worstShare = Math.max(worstShare, lootTime / Math.max(1, match.time));
  shares.push(lootTime / Math.max(1, match.time));
  totalLootTime += lootTime;
  totalPickups += pickups;
}

check(`squad never parks on loot (worst unproductive stretch ${worstStall.toFixed(1)}s)`,
  worstStall <= MAX_STALL, `limit ${MAX_STALL}s`);
const overTypical = shares.filter((s) => s > LOOT_SHARE_TYPICAL).length;
check(`looting is a small share of most raids (${overTypical}/${RUNS} over ${LOOT_SHARE_TYPICAL * 100}%)`,
  overTypical <= RUNS * MAX_OVER_TYPICAL,
  `limit ${Math.floor(RUNS * MAX_OVER_TYPICAL)} of ${RUNS}`);
check(`and no raid is mostly looting (worst ${(worstShare * 100).toFixed(1)}%)`,
  worstShare <= MAX_LOOT_SHARE, `limit ${MAX_LOOT_SHARE * 100}%`);
// The productivity floor. Time carving is not waste; time spent reaching
// nothing is, and only this separates them.
const perLootMinute = totalLootTime > 0 ? totalPickups / totalLootTime * 60 : 0;
check(`loot time buys carves (${perLootMinute.toFixed(1)} pickups per loot-minute)`,
  perLootMinute >= MIN_PICKUPS_PER_LOOT_MINUTE,
  `floor ${MIN_PICKUPS_PER_LOOT_MINUTE}`);
check(`squads actually collect loot (avg ${(totalPickups / RUNS).toFixed(1)} pickups/raid)`,
  totalPickups / RUNS >= 5);

console.log(failures ? `\n${failures} check(s) failed` : '\nAll loot checks passed');
process.exit(failures ? 1 : 0);
