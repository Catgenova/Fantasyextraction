#!/usr/bin/env node
// Boss trophies and the class unlocks they grant.
//
// The unlock rules are easy to state and easy to get subtly wrong, so this
// asserts each one directly rather than inferring it from a raid: only the
// player's own kill counts, the first kill grants and later ones do not, and a
// squad that dies on the way out still keeps the trophy. It also drives a real
// raid to prove the sim reports `bossesKilled` at all — the profile logic is
// worthless if nothing ever populates it.
//
//   node tools/test-achievements.js

import { Match, TICK } from '../src/sim/match.js';
import { generateBotSquads } from '../src/sim/bots.js';
import {
  newProfile, sanitizeProfile, applyMatchResult, unlockedClassIds,
  achievementProgress, recordBossKill, hasAchievement,
} from '../src/game/profile.js';
import { ACHIEVEMENTS, achievementForBoss } from '../src/data/achievements.js';
import { MATCH_SECONDS } from '../src/data/enemies.js';
// Every solo kill that grants a trophy — the ten placed in grounds and the
// three that walk in. Reading LARGE_CREATURES here instead missed the walkers
// and reported thirteen achievements against ten species.
const BOSSES = Object.fromEntries(
  Object.entries(CREATURES).filter(([, c]) => c.hunt === 'solo'));
import { CLASSES, CLASS_IDS, STARTER_CLASS_IDS } from '../src/data/classes.js';
import { TREES, unlockedSpells } from '../src/data/skilltrees.js';
import { spellsForClass, SPELL_SLOTS } from '../src/data/spells.js';
import { computeStats } from '../src/sim/stats.js';
import {
  createHero, autoAllocate, availableSpells, sanitizeHero, availablePoints,
} from '../src/sim/heroes.js';
import { craftItem, SLOTS, slotsForPart, canEquip, packCapacity, woodenLoadout } from '../src/data/gear.js';
import { QUALITY_ORDER } from '../src/data/parts.js';
import { CREATURES } from '../src/data/creatures.js';
import { makeRng } from '../src/core/rng.js';
import {
  defaultSquadTactics, defaultHeroTactics, CLASS_TACTICS,
  STANCES, TARGET_PRIORITIES, LOOT_POLICIES,
} from '../src/data/tactics.js';
import { squadHeroes } from '../src/game/profile.js';

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

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const result = (over = {}) => ({
  seed: 1234, duration: 900, outcome: 'clean', heroes: [],
  stats: { kills: 10, bossKills: 1, heroKills: 0 }, bossesKilled: [], ...over,
});

console.log('=== the mapping ===');

check('every trophy names a real solo hunt',
  ACHIEVEMENTS.every((a) => BOSSES[a.bossId]),
  `${ACHIEVEMENTS.length} achievements against ${Object.keys(BOSSES).length} solo species`);
check('every solo hunt grants a class',
  Object.keys(BOSSES).every((id) => achievementForBoss(id)),
  Object.keys(BOSSES).filter((id) => !achievementForBoss(id)).join(','));

const unlockable = CLASS_IDS.filter((id) => !STARTER_CLASS_IDS.includes(id));
const granted = ACHIEVEMENTS.map((a) => a.unlocks);
check('every non-starter class is behind exactly one boss',
  unlockable.every((id) => granted.filter((g) => g === id).length === 1),
  unlockable.join(', '));
check('no achievement grants a class you already have',
  ACHIEVEMENTS.every((a) => !STARTER_CLASS_IDS.includes(a.unlocks)));

console.log('\n=== earning them ===');

{
  const p = newProfile(1);
  check('a fresh profile has the three starters and nothing else',
    unlockedClassIds(p).join(',') === STARTER_CLASS_IDS.join(','), unlockedClassIds(p).join(','));
  check('and no trophies', achievementProgress(p).every((r) => !r.earned));

  const sum = applyMatchResult(p, result({ bossesKilled: ['deepdelver'] }));
  check('killing a boss earns its trophy', hasAchievement(p, 'deepdelver'));
  check('and unlocks its class', unlockedClassIds(p).includes('necromancer'));
  check('and recruits a hero to play it',
    p.roster.length === 4 && p.roster[3].classId === 'necromancer',
    p.roster.map((h) => h.classId).join(','));
  check('the report names what was earned',
    sum.unlocked.length === 1 && sum.unlocked[0].ach.id === 'deepdelver');

  // The whole point of a one-off unlock: farming the same boss must not pay again.
  const again = applyMatchResult(p, result({ bossesKilled: ['deepdelver'] }));
  check('killing it again grants nothing',
    again.unlocked.length === 0 && p.roster.length === 4, `roster ${p.roster.length}`);
}

{
  // Bosses are hard enough that dying on the way out is common. The kill is
  // the achievement, so the trophy has to survive the wipe that follows it.
  const p = newProfile(2);
  applyMatchResult(p, result({ outcome: 'wiped', bossesKilled: ['nightfell'] }));
  check('a wipe after the kill still keeps the trophy',
    hasAchievement(p, 'nightfell') && unlockedClassIds(p).includes('slayer'));
}

{
  const p = newProfile(3);
  applyMatchResult(p, result({ bossesKilled: [] }));
  check('a raid that killed no boss unlocks nothing',
    p.roster.length === 3 && achievementProgress(p).every((r) => !r.earned));
}

{
  const p = newProfile(4);
  applyMatchResult(p, result({ bossesKilled: ['bastionback', 'tyrannoclast', 'glaciermaw'] }));
  check('three kills in one raid unlock three classes',
    p.roster.length === 6, p.roster.map((h) => h.classId).join(','));
  check('history records the unlocks', p.history[0].unlocked.length === 3);
}

{
  // Saves predate this feature and must not brick or silently gain classes.
  const p = newProfile(5);
  delete p.achievements;
  sanitizeProfile(p);
  check('a save with no trophies at all sanitises to none',
    Object.keys(p.achievements).length === 0 && unlockedClassIds(p).length === 3);

  p.achievements = { deepdelver: { at: 1 }, a_species_that_was_cut: { at: 2 } };
  sanitizeProfile(p);
  check('a trophy for a boss that no longer exists is dropped',
    Object.keys(p.achievements).join(',') === 'deepdelver');
}

console.log('\n=== the unlocked classes are actually playable ===');

{
  const rng = makeRng(77);
  let broken = 0;
  const detail = [];
  for (const classId of CLASS_IDS) {
    const cls = CLASSES[classId];
    const hero = createHero(rng, classId);
    const stats = computeStats(hero);
    // A hero whose kit it cannot wear, or whose tree cannot be spent, is a
    // dead class however good the data file looks.
    const wearable = Object.values(woodenLoadout()).every((i) => canEquip(i, classId));
    const slotsCovered = SLOTS.every((slot) =>
      hero.equipped[slot] !== undefined);
    const maxed = { ...hero, level: 20, alloc: {} };
    autoAllocate(rng, maxed, 'random');
    const spells = availableSpells(maxed);
    const ok = stats.maxHp > 0 && stats.attackPower > 0 && wearable && slotsCovered
      && cls.startingSpells.length >= 2 && spells.length > cls.startingSpells.length
      && TREES[classId].nodes.length === 18
      && spellsForClass(classId).length >= SPELL_SLOTS;
    if (!ok) { broken++; detail.push(classId); }
  }
  check(`all ${CLASS_IDS.length} classes build a usable hero`, broken === 0, detail.join(','));

  // Every per-class table has to grow when the roster does. Three classes
  // shipped with no row in `defaultHeroTactics` at all, so their heroes had
  // no priority and no retreat threshold — and the deploy briefing, which
  // prints the priority, threw and blanked the whole page on the way into a
  // raid. Nothing said so, because the check above passes 'random' to
  // autoAllocate and never reads tactics.
  const FIELDS = {
    stance: STANCES, priority: TARGET_PRIORITIES, lootPolicy: LOOT_POLICIES,
  };
  const valid = (table, value) => (Array.isArray(table)
    ? table.some((o) => (o.id ?? o) === value)
    : Object.prototype.hasOwnProperty.call(table, value));
  // Read the table itself, not `defaultHeroTactics`. The function falls back
  // to a middling row so a gap cannot blank a screen again, which means a
  // check that went through it would pass with all three rows deleted — the
  // exact shape of test this repo has been bitten by before.
  const unlisted = CLASS_IDS.filter((id) => !CLASS_TACTICS[id]);
  check('every class has its own row in the tactics table', unlisted.length === 0,
    unlisted.join(','));

  const gaps = [];
  for (const classId of CLASS_IDS) {
    const t = defaultHeroTactics(classId);
    for (const [field, table] of Object.entries(FIELDS)) {
      if (!valid(table, t[field])) gaps.push(`${classId}.${field}=${t[field]}`);
    }
    for (const field of ['retreatHpPct', 'potionHpPct']) {
      const v = t[field];
      if (!(typeof v === 'number' && v > 0 && v < 1)) gaps.push(`${classId}.${field}=${v}`);
    }
  }
  check('and the row it hands out is complete and valid', gaps.length === 0,
    gaps.join(' '));

  // The same omission one file over: `DEFAULT_BRANCHES` names only the three
  // starters, so an unnamed class handed autoAllocate an undefined branch
  // list. It threw the moment the hero had a point to spend, which is why a
  // level-1 fixture never found it.
  const threw = [];
  for (const classId of CLASS_IDS) {
    const hero = createHero(rng, classId);
    hero.level = 20;
    try {
      autoAllocate(rng, hero);
      if (availablePoints(hero) > 0) threw.push(`${classId}:${availablePoints(hero)} unspent`);
    } catch (e) { threw.push(`${classId}:${e.message}`); }
  }
  check('every class can spend its tree with no branch order given',
    threw.length === 0, threw.join(' '));

  // Every spell in a class's pool must be reachable from its own tree.
  let unreachable = [];
  for (const classId of CLASS_IDS) {
    const all = new Set(spellsForClass(classId).map((s) => s.id));
    const full = {};
    for (const n of TREES[classId].nodes) full[n.id] = n.maxRank;
    const reachable = new Set(unlockedSpells(classId, full, CLASSES[classId].startingSpells));
    for (const id of all) if (!reachable.has(id)) unreachable.push(`${classId}:${id}`);
  }
  check('every spell is reachable from its own skill tree', unreachable.length === 0,
    unreachable.join(','));
}

console.log('\n=== a real raid reports its boss kills ===');

/**
 * Level-appropriate kit. Without it these are level-12 heroes in the common
 * gear they were created with, which does not kill a boss and makes the check
 * below a measurement of the difficulty curve rather than of the reporting.
 */
function equipForRaid(profile, seed, level) {
  const r = makeRng(seed ^ 0x5bf03635);
  for (const hero of profile.roster) {
    hero.level = level;
    autoAllocate(r, hero);
    for (const slot of SLOTS) {
      const item = forgeFor(r, slot, hero.classId, 'fine', level);
      if (item && canEquip(item, hero.classId)) hero.equipped[slot] = item;
    }
    sanitizeHero(hero);
  }
}

{
  // Only the player's kills count. Running raids until a boss dies also proves
  // the arenas are reachable at all — seven arenas nobody walks to would pass
  // every check above and still be broken.
  let sawKill = false;
  let sawAnyBossDie = false;
  const killed = new Set();
  for (let seed = 500; seed < 512 && !sawKill; seed++) {
    const profile = newProfile(seed);
    equipForRaid(profile, seed, 12);
    const heroes = squadHeroes(profile);
    const match = new Match({
      seed,
      playerSquad: {
        id: 'player', name: 'You', isPlayer: true, heroes,
        tactics: { ...defaultSquadTactics(), leaderId: heroes[0].id, plan: 'boss' },
      },
      botSquads: generateBotSquads(seed, 5, 12),
    });
    let ticks = 0;
    // Headroom past the timer: a raid resolves on the tick after the clock
    // runs out, and stopping exactly on it leaves `result` unset.
    while (match.phase !== 'ended' && ticks < MATCH_SECONDS / TICK + 50) { match.update(TICK); ticks++; }
    if (match.stats.bossKills > 0) sawAnyBossDie = true;
    if (match.result?.bossesKilled.length) {
      sawKill = true;
      match.result.bossesKilled.forEach((b) => killed.add(b));
    }
  }
  check('a boss died in a raid', sawAnyBossDie);
  check('the player squad killed one and the result says which', sawKill, [...killed].join(','));
  check('every reported kill is a real boss',
    [...killed].every((id) => BOSSES[id]), [...killed].join(','));

  if (sawKill) {
    const p = newProfile(9);
    applyMatchResult(p, result({ bossesKilled: [...killed] }));
    check('and the profile turns them into classes', p.roster.length === 3 + killed.size,
      `${[...killed].join(',')} -> ${p.roster.map((h) => h.classId).join(',')}`);
  }
}

{
  // Rival squads kill far more bosses than the player does — on a farming run
  // roughly forty die across a dozen raids and about one of them is yours. So
  // crediting every boss death to the player is not a small error: it hands
  // over most of the roster for work somebody else did.
  let credited = 0;
  let died = 0;
  for (let seed = 600; seed < 606; seed++) {
    const profile = newProfile(seed);
    equipForRaid(profile, seed, 12);
    const heroes = squadHeroes(profile);
    const match = new Match({
      seed,
      playerSquad: {
        id: 'player', name: 'You', isPlayer: true, heroes,
        tactics: { ...defaultSquadTactics(), leaderId: heroes[0].id, plan: 'farm' },
      },
      botSquads: generateBotSquads(seed, 5, 12),
    });
    let ticks = 0;
    // Headroom past the timer: a raid resolves on the tick after the clock
    // runs out, and stopping exactly on it leaves `result` unset.
    while (match.phase !== 'ended' && ticks < MATCH_SECONDS / TICK + 50) { match.update(TICK); ticks++; }
    died += match.stats.bossKills;
    credited += match.result?.bossesKilled.length ?? 0;
  }
  check('rival squads kill bosses the player never touches', died > credited,
    `${died} died, ${credited} credited to the player`);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
