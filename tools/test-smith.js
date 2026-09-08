#!/usr/bin/env node
// The blacksmith, and the sets it exists to build toward.
//
// Two rules carry the whole economy and both are asserted here rather than
// trusted: a piece comes out at the grade of the *worst* part that went into
// it, so a single Mythic carve is worth nothing on its own; and forging
// consumes exactly the parts it quoted, so a recipe cannot quietly eat a
// better carve than the one it displayed.
//
//   node tools/test-smith.js

import { newProfile, stashParts, stashGear } from '../src/game/profile.js';
import { availableRecipes, forge, forgeBlocker, resultQuality, costFor, SLOT_COST } from '../src/game/smith.js';
import { makePart, QUALITY_ORDER } from '../src/data/parts.js';
import { craftItem, slotsForPart, SLOTS, canEquip, partsForSlot, pouchSlots, packCapacity, BASE_PACK_SLOTS, itemScore, woodenLoadout, woodenItem } from '../src/data/gear.js';
import { activeSets, setMods, setAuras, setCounts, SET_PARTIAL, SET_FULL } from '../src/data/sets.js';
import { CREATURES } from '../src/data/creatures.js';
import { computeStats } from '../src/sim/stats.js';
import { createHero } from '../src/sim/heroes.js';
import { makeRng } from '../src/core/rng.js';

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const part = (species, type, quality, tier = 1) =>
  makePart({ speciesId: species, speciesName: CREATURES[species].name, partType: type, quality, tier });

console.log('=== what the smith will make ===');

{
  const profile = newProfile(1);
  profile.materials = [];
  // Two plates: enough for a helm or gauntlets, one short of a cuirass, so
  // both sides of the affordability line are on screen.
  for (let i = 0; i < 2; i++) profile.materials.push(part('boulderhide', 'plate', 'fine'));
  const recipes = availableRecipes(stashParts(profile), 'knight');

  check('a pile of one part offers every slot it fits',
    recipes.filter((r) => r.partType === 'plate').map((r) => r.slot).sort().join(',')
    === slotsForPart('plate').slice().sort().join(','),
    recipes.filter((r) => r.partType === 'plate').map((r) => r.slot).join(','));
  check('and says which of them it can afford',
    recipes.some((r) => r.affordable) && recipes.some((r) => !r.affordable),
    recipes.map((r) => `${r.slot}:${r.affordable ? 'yes' : 'no'}`).join(' '));
  check('a recipe it cannot afford says how short it is',
    /Needs \d+ — you have \d+/.test(forgeBlocker(recipes.find((r) => !r.affordable))),
    forgeBlocker(recipes.find((r) => !r.affordable)));
  check('bigger pieces cost more of the same carve',
    costFor('chest') > costFor('hands') && costFor('weapon') === SLOT_COST.weapon,
    Object.entries(SLOT_COST).map(([s, c]) => `${s} ${c}`).join(', '));
}

console.log('\n=== the grade of the worst part ===');

{
  check('a mixed pile comes out at its weakest',
    resultQuality([part('boulderhide', 'plate', 'mythic'), part('boulderhide', 'plate', 'ragged')]) === 'ragged');
  check('a uniform pile comes out at that grade',
    resultQuality([part('boulderhide', 'plate', 'fine'), part('boulderhide', 'plate', 'fine')]) === 'fine');

  // The rule that makes hoarding good carves the actual progression: one
  // Mythic plate among ragged ones buys nothing.
  const profile = newProfile(2);
  profile.materials = [part('boulderhide', 'plate', 'mythic')];
  for (let i = 0; i < 4; i++) profile.materials.push(part('boulderhide', 'plate', 'ragged'));
  const chest = availableRecipes(stashParts(profile)).find((r) => r.slot === 'chest');
  check('one great carve among poor ones does not lift the piece',
    chest.quality === 'ragged', `${chest.quality} from a pile containing a mythic`);

  // But the smith reaches for the best it can, so five Fine parts make Fine.
  const better = newProfile(3);
  better.materials = Array.from({ length: 5 }, () => part('boulderhide', 'plate', 'fine'));
  const good = availableRecipes(stashParts(better)).find((r) => r.slot === 'chest');
  check('and the smith reaches for the best it has', good.quality === 'fine', good.quality);
}

console.log('\n=== forging spends exactly what it quoted ===');

{
  const profile = newProfile(4);
  profile.materials = [
    part('boulderhide', 'plate', 'mythic'),
    ...Array.from({ length: 3 }, () => part('boulderhide', 'plate', 'fine')),
    part('sicklejaw', 'claw', 'sound', 0),
  ];
  const before = stashParts(profile).length;
  const chest = availableRecipes(stashParts(profile)).find((r) => r.slot === 'chest');
  const item = forge(profile, chest, 'knight');

  check('forging returns the finished piece', !!item && item.kind === 'gear', item?.name);
  check('it lands in the stash', stashGear(profile).some((i) => i.id === item.id));
  check('and consumes exactly its cost',
    stashParts(profile).length === before - chest.cost,
    `${before} parts before, ${stashParts(profile).length} after, cost ${chest.cost}`);
  check('taking the best parts it quoted',
    !stashParts(profile).some((p) => p.speciesId === 'boulderhide' && p.quality === 'mythic'),
    stashParts(profile).map((p) => `${p.speciesId}:${p.quality}`).join(','));
  check('and leaving other species alone',
    stashParts(profile).some((p) => p.speciesId === 'sicklejaw'));

  // Forging the same recipe twice must not resurrect spent parts.
  const again = forge(profile, chest, 'knight');
  check('a stale recipe cannot be forged twice', again === null);
}

{
  const profile = newProfile(5);
  profile.materials = Array.from({ length: 3 }, () => part('sicklejaw', 'claw', 'sound', 0));
  const weapon = availableRecipes(stashParts(profile), 'archer').find((r) => r.slot === 'weapon');
  const made = forge(profile, weapon, 'archer');
  check('a weapon is bound to the class it was forged for',
    canEquip(made, 'archer') && !canEquip(made, 'knight'), made.name);

  const armourProfile = newProfile(6);
  armourProfile.materials = Array.from({ length: 3 }, () => part('boulderhide', 'plate', 'sound'));
  const chest = availableRecipes(stashParts(armourProfile), 'archer').find((r) => r.slot === 'chest');
  const plate = forge(armourProfile, chest, 'archer');
  check('armour fits anyone', canEquip(plate, 'knight') && canEquip(plate, 'priest'));
}

console.log('\n=== packs are sewn from sinew, and size decides how much they hold ===');

// A pouch is the one piece where the *size* of what you killed matters more
// than the grade of the carve, so both ladders are asserted directly rather
// than inferred from a crafted item's stats — a pouch's stats are a shrug and
// its capacity is the whole point.
const pouchOf = (speciesId, quality) =>
  craftItem({ speciesId, partType: 'sinew', slot: 'pouch', quality });

check('sinew makes a pouch and nothing else',
  slotsForPart('sinew').join(',') === 'pouch', slotsForPart('sinew').join(','));
check('and a pouch can be made from nothing else',
  partsForSlot('pouch').join(',') === 'sinew', partsForSlot('pouch').join(','));
check('every species yields sinew, so a pack is always a hunt you can take',
  Object.values(CREATURES).every((c) => c.parts.sinew > 0),
  Object.values(CREATURES).filter((c) => !c.parts.sinew).map((c) => c.name).join(','));

// Both ladders climb, or a better carve would be worth nothing.
for (const [speciesId, label] of [['sicklejaw', 'a pack creature'], ['nightfell', 'a solo monster']]) {
  const rungs = QUALITY_ORDER.map((q) => pouchSlots(pouchOf(speciesId, q)));
  check(`${label}'s sinew holds more at every grade`,
    rungs.every((v, i) => i === 0 || v > rungs[i - 1]), rungs.join(' < '));
}

// The point of the split: a solo monster out-carries a pack creature at the
// same grade, every time.
const beaten = QUALITY_ORDER.filter((q) =>
  pouchSlots(pouchOf('nightfell', q)) <= pouchSlots(pouchOf('sicklejaw', q)));
check('a solo monster beats a pack creature grade for grade', beaten.length === 0,
  beaten.join(',') || 'at every grade');

// ...but the ladders overlap, so hunting packs well is never simply behind
// getting lucky once. A check that only asserted the split would pass on a
// design where small sinew is pointless.
check('a great small carve still beats a poor large one',
  pouchSlots(pouchOf('sicklejaw', 'mythic')) > pouchSlots(pouchOf('nightfell', 'ragged')),
  `${pouchSlots(pouchOf('sicklejaw', 'mythic'))} vs ${pouchSlots(pouchOf('nightfell', 'ragged'))}`);

check('the biggest pack in the game carries 28',
  packCapacity({ pouch: pouchOf('nightfell', 'mythic') }) === 28,
  String(packCapacity({ pouch: pouchOf('nightfell', 'mythic') })));
check('and a hero with no pouch at all still carries eight',
  packCapacity({}) === BASE_PACK_SLOTS, String(packCapacity({})));

// The AI has to be able to see a pouch's worth, or squads walk past the best
// item in the game: no stat weight can read capacity.
check('a pouch scores on the room it gives',
  itemScore(pouchOf('nightfell', 'mythic')) > itemScore(pouchOf('sicklejaw', 'ragged')) * 2,
  `${itemScore(pouchOf('nightfell', 'mythic'))} vs ${itemScore(pouchOf('sicklejaw', 'ragged'))}`);

// Every hero starts able to carry something home.
check('the wooden kit includes a satchel',
  !!woodenLoadout().pouch && pouchSlots(woodenLoadout().pouch) > 0,
  `+${pouchSlots(woodenLoadout().pouch)} slots`);

console.log('\n=== wooden gear is the floor ===');

// The whole promise of wooden gear is that anything the smith makes beats it.
// Checked against every species, part and grade rather than against one
// example: a floor that only holds for the piece you happened to compare it
// with is not a floor.
{
  const wooden = woodenLoadout();
  const weakest = {};
  for (const c of Object.values(CREATURES)) {
    for (const partType of Object.keys(c.parts)) {
      for (const slot of slotsForPart(partType)) {
        for (const q of QUALITY_ORDER) {
          const it = craftItem({ speciesId: c.id, partType, slot, quality: q, classId: 'knight' });
          if (!it) continue;
          const score = itemScore(it);
          if (weakest[slot] === undefined || score < weakest[slot].score) {
            weakest[slot] = { score, what: `${c.name} ${partType} ${q}` };
          }
        }
      }
    }
  }
  const beaten = SLOTS.filter((slot) => weakest[slot] && itemScore(wooden[slot]) >= weakest[slot].score);
  check('every craftable piece beats wooden, in every slot',
    beaten.length === 0,
    beaten.map((s) => `${s} (${itemScore(wooden[s])} vs ${weakest[s].score} for ${weakest[s].what})`).join('; ')
      || 'all eight');
  check('and wooden fills every slot',
    SLOTS.every((slot) => wooden[slot]), SLOTS.filter((s) => !wooden[s]).join(','));
  // No species means no set: a wooden kit must not count toward a set bonus,
  // or a naked hero would be wearing an eight-piece one.
  check('wooden gear belongs to no set',
    setCounts(wooden).size === 0, `${setCounts(wooden).size} species counted`);
  check('and a wooden pouch carries less than the poorest sinew',
    pouchSlots(wooden.pouch) < pouchSlots(craftItem({
      speciesId: 'sicklejaw', partType: 'sinew', slot: 'pouch', quality: 'ragged',
    })), `${pouchSlots(wooden.pouch)} vs 4`);
}

console.log('\n=== sets ===');

{
  const rng = makeRng(11);
  const hero = createHero(rng, 'knight', { startingGear: false });
  const wear = (speciesId, n) => {
    for (const slot of SLOTS) hero.equipped[slot] = null;
    const usable = SLOTS.filter((slot) =>
      partsForSlot(slot).some((p) => CREATURES[speciesId].parts[p]));
    for (let i = 0; i < n; i++) {
      const slot = usable[i];
      const partType = partsForSlot(slot).find((p) => CREATURES[speciesId].parts[p]);
      hero.equipped[slot] = craftItem({ speciesId, partType, slot, quality: 'fine' });
    }
  };

  wear('boulderhide', SET_PARTIAL - 1);
  check('below the threshold there is no set', activeSets(hero.equipped).length === 0,
    `${setCounts(hero.equipped).get('boulderhide')} pieces`);

  wear('boulderhide', SET_PARTIAL);
  const partial = activeSets(hero.equipped);
  check('three pieces is half a set', partial[0]?.tier === 'partial', partial[0]?.tier);

  const halfMods = setMods(hero.equipped);
  wear('boulderhide', SET_FULL);
  const full = activeSets(hero.equipped);
  const fullMods = setMods(hero.equipped);
  check('five is the whole thing', full[0]?.tier === 'full', full[0]?.tier);
  check('the full bonus is exactly twice the half',
    Object.keys(fullMods).every((k) => Math.abs(fullMods[k] - halfMods[k] * 2) < 0.01),
    `half ${JSON.stringify(halfMods)} against full ${JSON.stringify(fullMods)}`);

  // The link the whole system rests on: the set does what the creature does.
  check('every set names the behaviour it echoes',
    full[0].echoes === CREATURES.boulderhide.behaviour,
    `${full[0].echoes} against ${CREATURES.boulderhide.behaviour}`);

  // A set that has a squad aura only gives it at full.
  const aurad = Object.values(CREATURES).find((c) => c.set.aura);
  wear(aurad.id, SET_PARTIAL);
  const half = setAuras(hero.equipped);
  wear(aurad.id, SET_FULL);
  const whole = setAuras(hero.equipped);
  check('a squad aura is the reward for the full set',
    Object.keys(half).length === 0 && Object.keys(whole).length > 0,
    `${aurad.name}: half ${JSON.stringify(half)}, full ${JSON.stringify(whole)}`);
}

{
  // And it has to actually reach the stat block, not just the data layer.
  const rng = makeRng(12);
  const hero = createHero(rng, 'knight', { startingGear: false });
  const bare = computeStats(hero);
  for (const slot of ['chest', 'head', 'hands', 'legs', 'offhand']) {
    const partType = partsForSlot(slot).find((p) => CREATURES.boulderhide.parts[p]);
    hero.equipped[slot] = craftItem({ speciesId: 'boulderhide', partType, slot, quality: 'fine' });
  }
  const worn = computeStats(hero);
  const gearOnly = Object.values(hero.equipped).filter(Boolean)
    .reduce((sum, i) => sum + (i.mods.armor ?? 0), 0);
  check('a full set reaches the stat block',
    worn.armor > bare.armor + gearOnly,
    `${Math.round(bare.armor)} bare, ${Math.round(bare.armor + gearOnly)} from gear alone, ${Math.round(worn.armor)} worn`);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
