#!/usr/bin/env node
// Two stores and the way back out of one of them.
//
// The stash is a shelf of forged gear with a ceiling. Materials are every
// carve the player has ever brought home and have none. Salvage is the smith
// run backwards: it turns a piece on the shelf back into material, at a price.
//
// The price is the part worth testing. Forging is deterministic — the same
// parts always make the same piece — so a lossless salvage would be an undo
// button, and choosing what to make would stop being a choice.
//
// Camp kit is the other half of the same rule. It is free, infinite, worse
// than anything the smith makes, and salvage cannot touch it — so it is
// destroyed at every point where a real piece would be stored, and the checks
// for that live here because "what the shelf will hold" is one rule.
//
//   node tools/test-salvage.js

import {
  newProfile, sanitizeProfile, addToStash, stashParts, stashGear,
  stashHasRoom, STASH_LIMIT,
} from '../src/game/profile.js';
import {
  salvage, salvageYield, salvageLabel, salvageAllUpTo, canSalvage,
  forge, forgeBlocker, availableRecipes, costFor,
} from '../src/game/smith.js';
import { craftItem, woodenItem, woodenLoadout, SLOTS, packCapacity } from '../src/data/gear.js';
import { makePart, QUALITY_ORDER } from '../src/data/parts.js';
import { makeHeroEntity } from '../src/sim/entity.js';
import { equipFromBackpack, unequipToBackpack } from '../src/sim/inventory.js';

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const part = (speciesId, partType, quality, tier = 1) =>
  makePart({ speciesId, speciesName: speciesId, partType, quality, tier });

// ------------------------------------------------------------- two stores --
console.log('=== carves and forged gear live apart ===');
{
  const p = sanitizeProfile(newProfile(11));
  check('a new profile starts with material and supplies, not gear',
    stashParts(p).length === 3 && stashGear(p).length === 0 && p.stash.length === 3,
    `${stashParts(p).length} carves, ${stashGear(p).length} gear, ${p.stash.length} on the shelf`);

  // The thing this whole split exists for. A raid brings home twenty-odd
  // carves; a shared 120-slot stash filled with them in about six raids and
  // then `addToStash` started returning false, which `applyMatchResult` reads
  // as "not gained" — the haul was dropped on the floor without a word.
  for (let i = 0; i < 400; i++) {
    addToStash(p, part('boulderhide', 'plate', 'ragged'));
  }
  check('carves have no ceiling', stashParts(p).length === 403, String(stashParts(p).length));
  check('and every one of them was accepted',
    Array.from({ length: 50 }, () => addToStash(p, part('sicklejaw', 'claw', 'ragged')))
      .every(Boolean));

  const shelf = sanitizeProfile(newProfile(12));
  for (let i = 0; i < STASH_LIMIT; i++) {
    shelf.stash.push(craftItem({ speciesId: 'boulderhide', partType: 'plate', slot: 'head', quality: 'ragged' }));
  }
  check('forged gear does', !stashHasRoom(shelf) && !addToStash(shelf,
    craftItem({ speciesId: 'boulderhide', partType: 'plate', slot: 'head', quality: 'ragged' })),
  `${stashGear(shelf).length} / ${STASH_LIMIT}`);
  check('and a full shelf still takes carves',
    addToStash(shelf, part('boulderhide', 'plate', 'fine')));
}

// ------------------------------------------------------------- migration --
console.log('\n=== a save from before the split is moved across ===');
{
  const old = newProfile(13);
  // What an old save looks like: everything in one array.
  old.stash = [...old.stash, ...old.materials];
  delete old.materials;
  const parts = old.stash.filter((i) => i.kind === 'part').length;
  sanitizeProfile(old);
  check('its parts end up in materials', stashParts(old).length === parts, String(parts));
  check('and none are left on the shelf',
    !old.stash.some((i) => i.kind === 'part'), String(old.stash.length));
  check('while its supplies stay put', old.stash.length === 3, String(old.stash.length));
  // The journal is rebuilt from held parts for saves older than the journal
  // itself, and it reads materials now. Losing that would tell a long-standing
  // profile it has never met anything.
  check('and the journal it is reconstructed from still finds them',
    Object.keys(old.bestiary).length >= 2, Object.keys(old.bestiary).join(','));
}

// ---------------------------------------------------------------- salvage --
console.log('\n=== salvage gives back less than it took ===');
{
  const chest = craftItem({ speciesId: 'boulderhide', partType: 'plate', slot: 'chest', quality: 'pristine' });
  const y = salvageYield(chest);
  check('a three-part piece gives back two', y.count === 2 && costFor('chest') === 3,
    `${y.count} of ${costFor('chest')}`);
  check('a two-part piece gives back one',
    salvageYield(craftItem({ speciesId: 'boulderhide', partType: 'plate', slot: 'head', quality: 'pristine' })).count === 1);
  check('one grade below what the piece was', y.quality === 'fine', `pristine -> ${y.quality}`);
  check('of the species and part it was made from',
    y.speciesId === 'boulderhide' && y.partType === 'plate');
  check('and it says so before you press it',
    salvageLabel(chest) === '2× Fine Boulderhide Plate', salvageLabel(chest));

  // The floor. Ragged is the bottom of QUALITY_ORDER, so a ragged piece must
  // give back ragged rather than falling off the end into undefined.
  const rag = craftItem({ speciesId: 'boulderhide', partType: 'plate', slot: 'chest', quality: 'ragged' });
  check('a ragged piece does not fall off the bottom',
    salvageYield(rag).quality === 'ragged', String(salvageYield(rag).quality));

  check('wooden gear yields nothing', SLOTS.every((slot) => !canSalvage(woodenItem(slot))));
  check('and neither does a carve', !canSalvage(part('boulderhide', 'plate', 'fine')));
}

// ------------------------------------------------------------ round trip --
console.log('\n=== the round trip is a loss, which is the point ===');
{
  const p = sanitizeProfile(newProfile(14));
  p.materials = Array.from({ length: 3 }, () => part('boulderhide', 'plate', 'pristine'));
  const recipe = availableRecipes(stashParts(p)).find((r) => r.slot === 'chest');
  const made = forge(p, recipe, 'knight');
  check('three pristine plates make a pristine chest',
    made?.quality === 'pristine' && stashParts(p).length === 0, made?.quality);

  const got = salvage(p, made.id);
  check('breaking it returns two fine plates',
    got.parts.length === 2 && got.parts.every((x) => x.quality === 'fine'),
    got.parts.map((x) => x.quality).join(','));
  check('the piece is off the shelf', stashGear(p).length === 0);
  check('and the parts are in materials',
    stashParts(p).length === 2 && got.parts.every((x) => p.materials.includes(x)));

  // The loss, stated as the thing a player would notice: you cannot get back
  // to where you started by breaking down and re-forging.
  const again = availableRecipes(stashParts(p)).find((r) => r.slot === 'chest');
  check('and you cannot re-forge what you had', !again?.affordable,
    again ? `${again.have} of ${again.cost} needed` : 'no recipe at all');

  check('salvaging something that is not there does nothing',
    salvage(p, 'nope') === null && salvage(p, made.id) === null);
}

// ---------------------------------------------------------------- sweeps --
console.log('\n=== and the sweep only takes what it says ===');
{
  const p = sanitizeProfile(newProfile(15));
  const grades = ['ragged', 'sound', 'fine', 'pristine', 'mythic'];
  for (const q of grades) {
    p.stash.push(craftItem({ speciesId: 'boulderhide', partType: 'plate', slot: 'chest', quality: q }));
  }
  const before = stashGear(p).length;
  const got = salvageAllUpTo(p, 'sound');
  check('a sweep to Sound takes the ragged and the sound and stops',
    got.items === 2 && stashGear(p).length === before - 2,
    `${got.items} broken, ${stashGear(p).length} left of ${before}`);
  check('and leaves everything better alone',
    stashGear(p).every((i) => QUALITY_ORDER.indexOf(i.quality) > QUALITY_ORDER.indexOf('sound')),
    stashGear(p).map((i) => i.quality).join(','));
  check('the parts it returns are the ones it promised',
    got.parts.length === 4 && got.parts.every((x) => x.speciesId === 'boulderhide'),
    `${got.parts.length} parts`);
  check('a sweep naming no real grade does nothing',
    salvageAllUpTo(p, 'nonsense').items === 0 && stashGear(p).length === before - 2);
}

// ------------------------------------------------------- the forge blocks --
console.log('\n=== a full shelf stops the forge rather than eating the parts ===');
{
  const p = sanitizeProfile(newProfile(16));
  p.materials = Array.from({ length: 3 }, () => part('boulderhide', 'plate', 'fine'));
  for (let i = 0; i < STASH_LIMIT; i++) {
    p.stash.push(craftItem({ speciesId: 'sicklejaw', partType: 'claw', slot: 'hands', quality: 'ragged' }));
  }
  const recipe = availableRecipes(stashParts(p)).find((r) => r.slot === 'chest');
  check('the recipe says why it cannot be made',
    /full/i.test(forgeBlocker(recipe, p) ?? ''), forgeBlocker(recipe, p));
  const before = stashParts(p).length;
  check('forging is refused', forge(p, recipe, 'knight') === null);
  check('and the parts are still there', stashParts(p).length === before, String(stashParts(p).length));

  // Make room the way the player would, and it goes through.
  salvageAllUpTo(p, 'ragged');
  check('salvaging makes room', stashHasRoom(p) && !forgeBlocker(recipe, p));
  check('and then it forges', forge(p, recipe, 'knight')?.kind === 'gear');
}

// ------------------------------------------------------------- camp kit ---
console.log('\n=== camp kit is destroyed, never stored ===');
{
  const p = sanitizeProfile(newProfile(17));
  const before = stashGear(p).length;
  const taken = SLOTS.map((slot) => addToStash(p, woodenItem(slot)));
  check('the shelf turns every wooden piece away',
    taken.every((ok) => ok === false), taken.filter(Boolean).length + ' accepted');
  check('and none of them landed on it',
    stashGear(p).length === before, `${stashGear(p).length} gear`);
  check('nor did any land in materials',
    !p.materials.some((i) => i?.wooden), String(p.materials.filter((i) => i?.wooden).length));

  // Salvage is not the way out either — a wooden piece was never carved off
  // anything, so there is nothing to give back. That is exactly why the shelf
  // must refuse it: an accepted one could never be removed.
  check('and salvage cannot clear one either',
    !canSalvage(woodenItem('chest')) && salvageYield(woodenItem('weapon')) === null);
}

// A real account reached seven wooden pieces on the shelf before this rule
// existed. Loading that save has to clean it up, or the shelf stays clogged
// with items nothing in the game can remove.
{
  const p = sanitizeProfile(newProfile(18));
  const real = craftItem({ speciesId: 'sicklejaw', partType: 'claw', slot: 'hands', quality: 'fine' });
  p.stash.push(...SLOTS.map((slot) => woodenItem(slot)), real);
  const clogged = stashGear(p).length;
  sanitizeProfile(p);
  check('loading an old save sweeps the wooden gear off the shelf',
    stashGear(p).length === 1 && stashGear(p)[0].id === real.id,
    `${clogged} before, ${stashGear(p).length} after`);
  check('and leaves the supplies alone',
    p.stash.filter((i) => i.kind === 'consumable').length === 3,
    String(p.stash.filter((i) => i.kind === 'consumable').length));
}

// --------------------------------------------------------- and in a raid ---
console.log('\n=== a raid throws camp kit away rather than carrying it home ===');
{
  const match = { pushFloat() {}, rarityColor: () => '#fff' };
  const p = sanitizeProfile(newProfile(19));
  const hero = p.roster.find((h) => h.classId === 'knight');
  hero.equipped = woodenLoadout();
  const e = makeHeroEntity(hero, { team: 0, squadId: 's' });

  const found = craftItem({ speciesId: 'sicklejaw', partType: 'claw', slot: 'hands', quality: 'fine' });
  e.inventory = [found];
  const wooden = e.equipped.hands;
  check('the fixture starts in camp kit', !!wooden?.wooden);
  check('equipping over it works', equipFromBackpack(match, e, 0) === true);
  check('the upgrade is worn', e.equipped.hands?.id === found.id);
  // This is the bug the player hit: the displaced wooden piece took a pack
  // slot for the rest of the raid and then came home to the shelf.
  check('and the wooden piece is gone, not in the pack',
    e.inventory.length === 0, `${e.inventory.length} in the pack`);

  check('camp kit cannot be taken off into the pack',
    unequipToBackpack(match, e, 'chest') === false && !!e.equipped.chest?.wooden);
  check('but a real piece still can',
    unequipToBackpack(match, e, 'hands') === true && e.inventory.length === 1
    && e.equipped.hands === null);
}

// The pouch refusal is the one place the pack maths changes: the wooden pouch
// coming off no longer needs a slot to come back to.
{
  const match = { pushFloat() {}, rarityColor: () => '#fff' };
  const p = sanitizeProfile(newProfile(20));
  const hero = p.roster.find((h) => h.classId === 'knight');
  hero.equipped = woodenLoadout();
  const e = makeHeroEntity(hero, { team: 0, squadId: 's' });

  const pouch = craftItem({ speciesId: 'sicklejaw', partType: 'sinew', slot: 'pouch', quality: 'ragged' });
  const filler = () => craftItem({ speciesId: 'sicklejaw', partType: 'claw', slot: 'hands', quality: 'ragged' });
  const room = packCapacity({ ...e.equipped, pouch });
  e.inventory = [pouch, ...Array.from({ length: room + 1 }, filler)];
  check('a pack that would overflow the new pouch refuses the swap',
    equipFromBackpack(match, e, 0) === false, `${e.inventory.length - 1} carried, ${room} slots`);

  e.inventory.pop();
  check('and one slot under, it goes through',
    equipFromBackpack(match, e, 0) === true && e.equipped.pouch?.id === pouch.id);
  // The old maths had to leave a slot for the wooden pouch to come back to.
  // Now it does not come back, so a pack that fills the new pouch exactly is
  // legal — and nothing wooden is left holding a slot.
  check('and the pack sits exactly at capacity with nothing wooden in it',
    e.inventory.length === room && !e.inventory.some((i) => i.wooden),
    `${e.inventory.length} carried, ${packCapacity(e.equipped)} slots`);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll salvage checks passed');
process.exit(failures ? 1 : 0);
