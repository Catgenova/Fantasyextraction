#!/usr/bin/env node
// Pouches, the squad loot filter, and where a found potion goes.
//
// Pack size used to be a constant. It is now whatever pouch a hero is wearing,
// which makes it the one piece of gear that decides how much of a good raid
// you actually keep — so the interesting cases are the edges: no pouch at all,
// swapping down into a smaller one while the pack is full, and the AI valuing
// a pouch it cannot read a stat off.
//
// The loot filter has one rule worth stating: a squad order tightens a greedy
// hero and never loosens a picky one. Consumables sit outside it entirely,
// because a common potion is worth carrying on exactly the runs where a
// legendary-only filter would leave the squad with nothing to drink.
//
//   node tools/test-pouches.js

import { Match, TICK } from '../src/sim/match.js';
import { newProfile, squadHeroes } from '../src/game/profile.js';
import { generateBotSquads } from '../src/sim/bots.js';
import { autoAllocate, sanitizeHero } from '../src/sim/heroes.js';
import {
  rollItem, SLOTS, canEquip, packCapacity, pouchSlots, POUCH_SLOTS,
  BASE_PACK_SLOTS, RARITY_ORDER, itemScore, startingLoadout,
} from '../src/data/gear.js';
import { makeRng } from '../src/core/rng.js';
import { CLASS_IDS } from '../src/data/classes.js';
import { createHero } from '../src/sim/heroes.js';
import { makeHeroEntity } from '../src/sim/entity.js';
import { LOOT_FLOORS, defaultSquadTactics } from '../src/data/tactics.js';
import { canTake, wantsItem } from '../src/sim/ai.js';
import { equipFromBackpack, stowConsumable, canPackConsumable, transferBlocker } from '../src/sim/inventory.js';
import { makeConsumable, CONSUMABLES, CONSUMABLE_SLOTS } from '../src/data/consumables.js';

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const rng = makeRng(2024);
const pouch = (rarity) => rollItem(rng, { slot: 'pouch', rarity, ilvl: 1 });
const gear = (rarity) => rollItem(rng, { slot: 'hands', rarity, ilvl: 5 });

console.log('=== capacity ===');

check('a pouch is worth its rarity in extra slots',
  RARITY_ORDER.every((r) => pouchSlots(pouch(r)) === POUCH_SLOTS[r]),
  RARITY_ORDER.map((r) => `${r} +${POUCH_SLOTS[r]}`).join(', '));
check('an empty pouch slot still carries eight',
  packCapacity({}) === 8, `${packCapacity({})} slots`);
check('a pouch adds to that rather than replacing it',
  RARITY_ORDER.every((r) => packCapacity({ pouch: pouch(r) }) === BASE_PACK_SLOTS + POUCH_SLOTS[r]),
  RARITY_ORDER.map((r) => `${r} ${packCapacity({ pouch: pouch(r) })}`).join(', '));
check('a legendary takes a hero from 8 to 28',
  packCapacity({ pouch: pouch('legendary') }) === 28);
check('wearing one is always an upgrade on wearing none',
  RARITY_ORDER.every((r) => packCapacity({ pouch: pouch(r) }) > packCapacity({})));
check('nothing else counts as a pouch',
  pouchSlots(gear('legendary')) === 0 && pouchSlots(makeConsumable('minor_potion', 1)) === 0);
check('every class starts wearing one',
  CLASS_IDS.every((c) => startingLoadout(rng, c).some((i) => i.slot === 'pouch')));

// A pouch carries no combat stat, so a score built only from stat weights
// would rank the best item in the game at zero and the AI would walk past it.
check('the AI can see what a pouch is worth',
  itemScore(pouch('legendary')) > itemScore(pouch('common'))
  && itemScore(pouch('common')) > 0,
  `common ${itemScore(pouch('common'))}, legendary ${itemScore(pouch('legendary'))}`);
check('and rates a legendary pouch above a legendary piece of armour',
  itemScore(pouch('legendary')) > itemScore(gear('legendary')),
  `${itemScore(pouch('legendary'))} vs ${itemScore(gear('legendary'))}`);

console.log('\n=== swapping pouches mid-raid ===');

{
  // Equipping a smaller pouch than the pack is holding has to be refused, not
  // silently resolved by throwing the overflow away.
  const match = { pushFloat() {}, rarityColor: () => '#fff' };
  const big = pouch('legendary');
  const small = pouch('common');
  // A real entity, because equipping rebuilds the stat block and a hand-rolled
  // object silently skips that.
  const hero = makeHeroEntity(createHero(rng, 'knight', { startingGear: false }), {
    team: 'player', squadId: 'player', isPlayer: true, pos: { x: 0, y: 0 },
  });
  hero.equipped.pouch = big;
  // More than a common pouch could hold, but well within a legendary's.
  const overflowing = BASE_PACK_SLOTS + POUCH_SLOTS.common + 3;
  for (let i = 0; i < overflowing; i++) hero.inventory.push(gear('common'));
  hero.inventory.push(small);

  check('a full pack refuses a smaller pouch',
    equipFromBackpack(match, hero, hero.inventory.length - 1) === false);
  check('and keeps every item it was holding', hero.inventory.length === overflowing + 1,
    `${hero.inventory.length} items`);

  hero.inventory.length = 3;
  hero.inventory.push(small);
  check('with room to spare the swap goes through',
    equipFromBackpack(match, hero, hero.inventory.length - 1) === true);
  check('and capacity follows the new pouch',
    packCapacity(hero.equipped) === BASE_PACK_SLOTS + POUCH_SLOTS.common,
    `${packCapacity(hero.equipped)} slots`);
}

{
  // Capacity is per hero now, so a handover has to ask the recipient's pouch.
  let seq = 0;
  const mk = (rarity, held) => ({
    id: `h${seq++}`, name: rarity, alive: true, pos: { x: 0, y: 0 },
    equipped: { pouch: pouch(rarity) },
    inventory: Array.from({ length: held }, () => gear('common')),
    consumables: [],
  });
  const held = BASE_PACK_SLOTS + POUCH_SLOTS.common;
  const giver = mk('legendary', 5);
  const fullSmall = mk('common', held);
  const roomyBig = mk('legendary', held);
  check("a handover checks the receiver's own pouch, not a fixed number",
    transferBlocker(giver, fullSmall, giver.inventory[0]) !== null
    && transferBlocker(giver, roomyBig, giver.inventory[0]) === null,
    `${held} items is full for a common pouch, roomy for a legendary`);
}

console.log('\n=== the squad loot filter ===');

{
  const hero = (floor, lootPolicy = 'greedy', takeConsumables = true) => ({
    tactics: { lootPolicy },
    equipped: { pouch: pouch('legendary') },
    inventory: [], consumables: [],
    squadTactics: { ...defaultSquadTactics(), lootFloor: floor, takeConsumables },
  });

  const takes = (h) => RARITY_ORDER.filter((r) => wantsItem(h, gear(r)));

  check('the default order takes everything a hero wants',
    takes(hero('any')).length === RARITY_ORDER.length);
  check('a rare floor stops the squad at rare',
    takes(hero('rare')).join(',') === 'rare,epic,legendary', takes(hero('rare')).join(','));
  check('a legendary floor stops it at legendary',
    takes(hero('legendary')).join(',') === 'legendary');

  // The rule that makes the two settings composable rather than contradictory.
  check('a squad order never loosens a picky hero',
    takes(hero('any', 'upgrades')).join(',') === 'rare,epic,legendary',
    takes(hero('any', 'upgrades')).join(','));
  check('and a hero who ignores loot keeps ignoring it',
    takes(hero('any', 'ignore')).length === 0);

  const potion = makeConsumable('minor_potion', 1);
  check('consumables ignore the rarity floor',
    wantsItem(hero('legendary'), potion) === true);
  check('and answer to their own toggle',
    wantsItem(hero('any', 'greedy', false), potion) === false);
  check('turning them off does not affect gear',
    wantsItem(hero('any', 'greedy', false), gear('common')) === true);
  check('a hero ignoring loot still takes potions when the squad says to',
    wantsItem(hero('any', 'ignore'), potion) === true);
}

console.log('\n=== consumables go to the belt ===');

{
  const hero = () => ({
    tactics: { lootPolicy: 'greedy' },
    equipped: { pouch: pouch('common') },
    inventory: [], consumables: [],
    squadTactics: { ...defaultSquadTactics() },
  });

  const h = hero();
  check('a found potion lands on the belt, not in the pack',
    stowConsumable(h, makeConsumable('minor_potion', 1))
    && h.consumables.length === 1 && h.inventory.length === 0);

  const same = makeConsumable('minor_potion', 1);
  stowConsumable(h, same);
  check('a second of the same merges into the stack',
    h.consumables.length === 1 && h.consumables[0].count === 2,
    `${h.consumables[0].count} in one stack`);

  // The belt has to be finite or the squad detours for every potion on the map
  // forever: an uncapped merge took loot-mode time from 3.2% of the raid to 6.9%.
  const cap = CONSUMABLES.minor_potion.stack;
  while (canPackConsumable(h, makeConsumable('minor_potion', 1))) {
    stowConsumable(h, makeConsumable('minor_potion', 1));
  }
  check('a stack fills up and stops accepting more',
    h.consumables[0].count === cap, `${h.consumables[0].count} / ${cap}`);
  check('a potion the belt cannot take falls back to the pack',
    canPackConsumable(h, makeConsumable('minor_potion', 1)) === false
    && canTake(h, makeConsumable('minor_potion', 1)) === true);

  while (h.inventory.length < packCapacity(h.equipped)) h.inventory.push(gear('legendary'));
  check('with belt and pack both full it is finally refused',
    canTake(h, makeConsumable('minor_potion', 1)) === false,
    `belt ${h.consumables[0].count}/${cap}, pack ${h.inventory.length}/${packCapacity(h.equipped)}`);

  // Belt slots run out too, and then the pack is the fallback.
  const full = hero();
  const kinds = Object.keys(CONSUMABLES).slice(0, CONSUMABLE_SLOTS);
  for (const id of kinds) stowConsumable(full, makeConsumable(id, 1));
  check('the belt holds only its slots', full.consumables.length === CONSUMABLE_SLOTS,
    `${full.consumables.length} / ${CONSUMABLE_SLOTS}`);
  const spare = Object.keys(CONSUMABLES).find((id) => !kinds.includes(id));
  check('a full belt refuses a new kind', stowConsumable(full, makeConsumable(spare, 1)) === false);
  check('but the pack can still take it, so it is not lost',
    canTake(full, makeConsumable(spare, 1)) === true);
}

console.log('\n=== orders change mid-raid ===');

{
  // The panel edits the squad's tactics object directly rather than queueing a
  // change for the next raid, so the sim has to be reading the same object the
  // UI writes to. Tightening the floor to legendary mid-raid should stop the
  // squad taking the ordinary drops it was happily taking a moment earlier.
  const seed = 831;
  const profile = newProfile(seed);
  for (const h of profile.roster) h.level = 6;
  profile.squadTactics.leaderId = profile.roster[0].id;
  const match = new Match({
    seed,
    playerSquad: {
      id: 'player', name: 'Yours', isPlayer: true,
      heroes: squadHeroes(profile), tactics: profile.squadTactics,
    },
    botSquads: generateBotSquads(seed, 5, 6),
  });

  const member = match.byId(match.playerSquad.memberIds[0]);
  check('a hero reads the squad order, not a copy of it',
    member.squadTactics === match.playerSquad.tactics);

  const junk = gear('common');
  check('with the order loose they take a common', wantsItem(member, junk) === true);
  match.playerSquad.tactics.lootFloor = 'legendary';
  check('tightening it mid-raid stops them immediately',
    wantsItem(member, junk) === false);
  check('and the good stuff still gets taken',
    wantsItem(member, gear('legendary')) === true);

  const potion = makeConsumable('minor_potion', 1);
  check('a legendary-only order still lets potions through', wantsItem(member, potion) === true);
  match.playerSquad.tactics.takeConsumables = false;
  check('until the potion toggle is turned off too', wantsItem(member, potion) === false);

  // The raid's orders are a copy, so tightening them mid-raid must not quietly
  // rewrite what the player set in camp.
  check('none of it leaks back into the saved squad orders',
    profile.squadTactics.lootFloor === 'any' && profile.squadTactics.takeConsumables === true,
    `${profile.squadTactics.lootFloor}, consumables ${profile.squadTactics.takeConsumables}`);
}

console.log('\n=== in a real raid ===');

{
  // Pouch size has to change what a squad walks out with, or none of it means
  // anything. Same seeds, same everything, only the pouch differs.
  const run = (pouchRarity) => {
    let kept = 0;
    let onBelt = 0;
    for (let seed = 820; seed < 824; seed++) {
      const profile = newProfile(seed);
      const r = makeRng(seed ^ 99);
      for (const h of profile.roster) {
        h.level = 8;
        autoAllocate(r, h);
        for (const slot of SLOTS) {
          const item = rollItem(r, {
            slot, classId: h.classId, ilvl: 8,
            rarity: slot === 'pouch' ? pouchRarity : 'uncommon',
          });
          if (canEquip(item, h.classId)) h.equipped[slot] = item;
        }
        sanitizeHero(h);
      }
      profile.squadTactics.leaderId = profile.roster[0].id;
      const match = new Match({
        seed,
        playerSquad: {
          id: 'player', name: 'Yours', isPlayer: true,
          heroes: squadHeroes(profile), tactics: profile.squadTactics,
        },
        botSquads: generateBotSquads(seed, 5, 8),
      });
      let ticks = 0;
      while (match.phase !== 'ended' && ticks < 1850 / TICK) { match.update(TICK); ticks++; }
      for (const h of match.result.heroes) {
        kept += h.kept.length;
        onBelt += (h.keptConsumables ?? []).reduce((n, c) => n + c.count, 0);
      }
    }
    return { kept, onBelt };
  };

  const small = run('common');
  const big = run('legendary');
  check('a legendary pouch brings back more than a common one',
    big.kept > small.kept, `${small.kept} items on commons, ${big.kept} on legendaries`);
  check('potions came home on the belt', small.onBelt > 0 || big.onBelt > 0,
    `${small.onBelt} / ${big.onBelt} on belts`);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
