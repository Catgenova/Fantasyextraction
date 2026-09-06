#!/usr/bin/env node
// Headless balance harness. Runs full raids with no renderer and reports how
// they went — the fastest way to sanity-check tuning changes.
//
//   node tools/simulate.js [runs] [--seed N] [--plan boss] [--verbose]

import { Match, TICK } from '../src/sim/match.js';
import { newProfile, squadHeroes } from '../src/game/profile.js';
import { generateBotSquads } from '../src/sim/bots.js';
import { MATCH_SECONDS } from '../src/data/enemies.js';
import { rollItem, SLOTS, RARITY_ORDER, canEquip } from '../src/data/gear.js';
import { makeConsumable } from '../src/data/consumables.js';
import { makeRng } from '../src/core/rng.js';

const args = process.argv.slice(2);
const runs = Number(args.find((a) => /^\d+$/.test(a)) ?? 5);
const flag = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const verbose = args.includes('--verbose');
const baseSeed = Number(flag('seed', 1234));
const plan = flag('plan', null);
const level = Number(flag('level', 5));

/** Roll a level-appropriate kit for every hero so tests compare like with like. */
function equipForLevel(profile, seed, level) {
  const rng = makeRng(seed ^ 0x5bf03635);
  const band = level >= 12 ? 2 : level >= 7 ? 1 : 0;
  for (const hero of profile.roster) {
    for (const slot of SLOTS) {
      const item = rollItem(rng, { slot, classId: hero.classId, rarity: RARITY_ORDER[band], ilvl: level });
      if (canEquip(item, hero.classId)) hero.equipped[slot] = item;
    }
    hero.consumables = [makeConsumable('greater_potion', 3), makeConsumable('mana_tonic', 2)];
  }
}

const totals = { clean: 0, partial: 0, wiped: 0, kills: 0, bossKills: 0, heroKills: 0, gained: 0, ticks: 0, ms: 0 };

for (let r = 0; r < runs; r++) {
  const seed = baseSeed + r;
  const profile = newProfile(seed);
  for (const h of profile.roster) h.level = level;
  if (plan) profile.squadTactics.plan = plan;
  // Level-1 starting gear on a level-N hero is not a fair test of balance, so
  // by default give the player kit appropriate to the level being simulated.
  if (!args.includes('--starter-gear')) equipForLevel(profile, seed, level);

  const match = new Match({
    seed,
    playerSquad: {
      id: 'player', name: 'Your Squad', isPlayer: true,
      heroes: squadHeroes(profile), tactics: profile.squadTactics,
    },
    botSquads: generateBotSquads(seed, 5, level),
  });

  const t0 = Date.now();
  let ticks = 0;
  while (match.phase !== 'ended' && ticks < MATCH_SECONDS / TICK + 100) {
    match.update(TICK);
    ticks++;
  }
  const ms = Date.now() - t0;

  const res = match.result ?? match.buildResult();
  totals[res.outcome]++;
  totals.kills += res.stats.kills;
  totals.bossKills += res.stats.bossKills;
  totals.heroKills += res.stats.heroKills;
  totals.gained += res.heroes.reduce((s, h) => s + h.kept.length, 0);
  totals.ticks += ticks;
  totals.ms += ms;

  console.log(
    `seed ${seed}  ${res.outcome.padEnd(7)}  t=${(res.duration / 60).toFixed(1)}m  ` +
    `extracted ${res.heroes.filter((h) => h.extracted).length}/3  ` +
    `kills ${res.stats.kills} boss ${res.stats.bossKills} pvp ${res.stats.heroKills}  ` +
    `loot ${res.heroes.reduce((s, h) => s + h.kept.length, 0)}  ` +
    `entities ${match.entities.length}  ${ms}ms`
  );
  if (verbose) {
    for (const h of res.heroes) {
      console.log(`   ${h.name.padEnd(16)} ${h.classId.padEnd(7)} ${h.extracted ? 'OUT' : 'DEAD'}  dmg ${h.damage} heal ${h.healing} kills ${h.kills} xp ${h.xp}`);
    }
    console.log('   ' + match.feed.slice(-6).map((f) => `[${Math.round(f.t)}s] ${f.text}`).join('\n   '));
  }
}

console.log('\n--- summary over', runs, 'runs ---');
console.log('clean', totals.clean, 'partial', totals.partial, 'wiped', totals.wiped);
console.log('avg kills', (totals.kills / runs).toFixed(1),
  '| avg boss', (totals.bossKills / runs).toFixed(2),
  '| avg pvp kills', (totals.heroKills / runs).toFixed(2),
  '| avg loot kept', (totals.gained / runs).toFixed(1));
console.log('sim cost', (totals.ms / runs).toFixed(0), 'ms per raid,',
  (totals.ms / totals.ticks * 1000).toFixed(1), 'us per tick');
