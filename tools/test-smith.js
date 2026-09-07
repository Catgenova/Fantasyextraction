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
import { craftItem, slotsForPart, SLOTS, canEquip, partsForSlot } from '../src/data/gear.js';
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
  profile.stash = [];
  // Two plates: enough for a helm or gauntlets, one short of a cuirass, so
  // both sides of the affordability line are on screen.
  for (let i = 0; i < 2; i++) profile.stash.push(part('boulderhide', 'plate', 'fine'));
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
  profile.stash = [part('boulderhide', 'plate', 'mythic')];
  for (let i = 0; i < 4; i++) profile.stash.push(part('boulderhide', 'plate', 'ragged'));
  const chest = availableRecipes(stashParts(profile)).find((r) => r.slot === 'chest');
  check('one great carve among poor ones does not lift the piece',
    chest.quality === 'ragged', `${chest.quality} from a pile containing a mythic`);

  // But the smith reaches for the best it can, so five Fine parts make Fine.
  const better = newProfile(3);
  better.stash = Array.from({ length: 5 }, () => part('boulderhide', 'plate', 'fine'));
  const good = availableRecipes(stashParts(better)).find((r) => r.slot === 'chest');
  check('and the smith reaches for the best it has', good.quality === 'fine', good.quality);
}

console.log('\n=== forging spends exactly what it quoted ===');

{
  const profile = newProfile(4);
  profile.stash = [
    part('boulderhide', 'plate', 'mythic'),
    ...Array.from({ length: 3 }, () => part('boulderhide', 'plate', 'fine')),
    part('sicklejaw', 'claw', 'sound', 0),
  ];
  const before = profile.stash.length;
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
  profile.stash = Array.from({ length: 3 }, () => part('sicklejaw', 'claw', 'sound', 0));
  const weapon = availableRecipes(stashParts(profile), 'archer').find((r) => r.slot === 'weapon');
  const made = forge(profile, weapon, 'archer');
  check('a weapon is bound to the class it was forged for',
    canEquip(made, 'archer') && !canEquip(made, 'knight'), made.name);

  const armourProfile = newProfile(6);
  armourProfile.stash = Array.from({ length: 3 }, () => part('boulderhide', 'plate', 'sound'));
  const chest = availableRecipes(stashParts(armourProfile), 'archer').find((r) => r.slot === 'chest');
  const plate = forge(armourProfile, chest, 'archer');
  check('armour fits anyone', canEquip(plate, 'knight') && canEquip(plate, 'priest'));
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
