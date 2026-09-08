#!/usr/bin/env node
// Hunt orders: the raid's fauna, the order written against it, and whether
// asking for a species actually brings more of it home.
//
// The behavioural half of this file is the point. A hunt order that routes
// correctly and changes nothing about the haul is a button, not a feature, so
// the last section runs whole raids with and without the order at matched
// seeds and compares what the squad carved. The first version of this system
// passed every structural check here and delivered almost nothing.
//
//   node tools/test-hunt.js

import { Match } from '../src/sim/match.js';
import { generateMap } from '../src/sim/map.js';
import { newProfile, sanitizeProfile, squadHeroes, knownSpecies, recordEncounters, applyMatchResult } from '../src/game/profile.js';
import { generateBotSquads } from '../src/sim/bots.js';
import { CREATURES } from '../src/data/creatures.js';
import { sanitizeQuarry, poiMatchesQuarry, quarryLabel, kindsForSpecies, huntOptions } from '../src/data/hunts.js';
import { craftItem, SLOTS, slotsForPart, canEquip } from '../src/data/gear.js';
import { autoAllocate, sanitizeHero } from '../src/sim/heroes.js';
import { makeRng } from '../src/core/rng.js';

// Kit forged from species of the squad's own depth — the behavioural half
// needs a squad that has been hunting, not one in its wooden rags.
//
// It used to run in whatever a new profile came with, and every one of the
// eight seeds wiped inside three and a half minutes. That passed for a while
// by luck: camps were scattered, so wherever a doomed squad died there had
// usually been a camp of the quarry nearby to trip over first. Once a species
// held one country the walk got real, the squad died on the way, and a check
// that was supposed to be about hunting started reporting how far a level-8
// squad in starter gear can get. Gear it properly and it measures hunting.
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

const TICK = 1 / 30;
let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

// ---------------------------------------------------------------- the data --
console.log('=== a quarry is a species and a way of hunting it ===');

check('a pack species can be hunted two ways',
  kindsForSpecies('sicklejaw').join(',') === 'small,large', kindsForSpecies('sicklejaw').join(','));
check('a solo species only one', kindsForSpecies('nightfell').join(',') === 'solo');
check('an unknown species none', kindsForSpecies('wyvern').length === 0);

// A saved order naming an impossible hunt has to become no order rather than
// one the squad can never satisfy.
check('a small species asked for as a solo hunt is corrected',
  sanitizeQuarry({ speciesId: 'sicklejaw', kind: 'solo' })?.kind === 'small');
check('a solo species asked for as a pack is corrected',
  sanitizeQuarry({ speciesId: 'nightfell', kind: 'small' })?.kind === 'solo');
check('an order naming nothing is dropped', sanitizeQuarry({ speciesId: 'gone', kind: 'small' }) === null);
check('and so is an empty one', sanitizeQuarry(null) === null);

check('an order reads as a sentence',
  quarryLabel({ speciesId: 'sicklejaw', kind: 'large' }) === 'Large pack of Sicklejaw',
  quarryLabel({ speciesId: 'sicklejaw', kind: 'large' }));

const opts = huntOptions(new Set(['sicklejaw', 'nightfell']), new Set(['sicklejaw']));
check('a pack species offers two hunts and a solo species one',
  opts.length === 3, String(opts.length));
check('what you can see is listed first', opts[0].visible === true && opts.at(-1).visible === false);

// ---------------------------------------------------------------- the map --
console.log('\n=== every map holds a fauna it can be hunted for ===');

// The order list is built from the map, so an entry that names a hunt with no
// site behind it is a button that cannot be pressed. This was the bug the
// whole first version rested on: a species got three camps if it was lucky and
// often no large pack at all, so a third of the list was unanswerable.
let missingKind = 0;
let thinSpecies = 0;
let unadvertised = 0;
let faunaSizes = [];
for (let seed = 900; seed < 1000; seed++) {
  const map = generateMap(seed);
  const camps = map.pois.filter((p) => p.kind === 'camp');
  const counts = new Map();
  for (const c of camps) counts.set(c.speciesId, (counts.get(c.speciesId) ?? 0) + 1);
  // What the map offers, which is not the same as what is standing on it. A
  // crowded ring can take a camp back off a species, and a species down to one
  // camp has one pack size — so it is dropped from the fauna and its camp
  // stays as an outlier den. That is the contract this checks: the list is
  // honest, not that the placement is perfect.
  const advertised = Object.values(map.fauna ?? {}).flat();
  faunaSizes.push(advertised.length);
  for (const speciesId of advertised) {
    for (const kind of ['small', 'large']) {
      if (!camps.some((c) => poiMatchesQuarry(c, { speciesId, kind }))) missingKind++;
    }
    if ((counts.get(speciesId) ?? 0) < 2) thinSpecies++;
  }
  for (const id of counts.keys()) if (!advertised.includes(id)) unadvertised++;
}
check('every hunt a map offers can be hunted both ways', missingKind === 0,
  `${missingKind} unanswerable hunts over 100 maps`);
check('and none of them is down to a single camp', thinSpecies === 0, `${thinSpecies} species`);

// The two checks above pass whether or not the filter exists, because a
// species only falls to a single camp on about one map in a hundred — over
// this seed range it happens ${unadvertised} time(s) in all. A check that cannot
// fail is how three others in this repo came to be worthless, so inject the
// bug the filter is for: advertise a species the map holds one camp of, and
// the list has to stop being answerable.
const rigged = generateMap(900);
const advertisedHere = Object.values(rigged.fauna).flat();
const stranger = Object.values(CREATURES)
  .find((c) => c.hunt === 'small' && !advertisedHere.includes(c.id));
rigged.pois.push({
  id: 'camp_rigged', kind: 'camp', x: 800, y: 800, tier: 0, radius: 220,
  cleared: false, speciesId: stranger.id, packKind: 'small',
});
rigged.fauna[0] = [...rigged.fauna[0], stranger.id];
const riggedCamps = rigged.pois.filter((p) => p.kind === 'camp');
const answerable = Object.values(rigged.fauna).flat().every((speciesId) =>
  ['small', 'large'].every((kind) =>
    riggedCamps.some((c) => poiMatchesQuarry(c, { speciesId, kind }))));
check('a one-camp species on the list would make the list unanswerable',
  !answerable, `${stranger.name} advertised off a single camp`);

// Maps have to differ from each other, or a fauna is just a smaller constant.
const faunaOf = (seed) => [...new Set(generateMap(seed).pois
  .filter((p) => p.kind === 'camp').map((p) => p.speciesId))].sort().join(',');
check('and a different raid draws a different one', faunaOf(900) !== faunaOf(901));

// ------------------------------------------------------------- the routing --
console.log('\n=== an order resolves to somewhere the squad can walk ===');

function startRaid(seed, quarry, level = 6, gear = false) {
  const profile = newProfile(seed);
  sanitizeProfile(profile);
  const rng = makeRng(seed ^ 0x5bf03635);
  for (const h of profile.roster) {
    h.level = level;
    if (!gear) continue;
    autoAllocate(rng, h);
    for (const slot of SLOTS) {
      const item = forgeFor(rng, slot, h.classId, 'sound', level);
      if (item && canEquip(item, h.classId)) h.equipped[slot] = item;
    }
    sanitizeHero(h);
  }
  profile.squadTactics.quarry = quarry;
  return new Match({
    seed,
    playerSquad: {
      id: 'player', name: 'Your Squad', isPlayer: true,
      heroes: squadHeroes(profile), tactics: profile.squadTactics,
    },
    knownSpecies: knownSpecies(profile),
    botSquads: generateBotSquads(seed, 5, level),
  });
}

const probe = startRaid(900, null);
const fauna = probe.fauna();
check('the raid reports its own fauna', fauna.length > 0, `${fauna.length} entries`);
// One per ground in ARENA_SPEC. The walkers are deliberately not on this
// list — there is nowhere to send a squad to find one.
check('including the solo grounds',
  fauna.filter((f) => f.hunt === 'solo').length === 10,
  String(fauna.filter((f) => f.hunt === 'solo').length));
check('and every entry names a real creature', fauna.every((f) => CREATURES[f.speciesId]));

const here = probe.map.pois.find((p) => p.kind === 'camp');
const quarry = { speciesId: here.speciesId, kind: here.packKind };
const found = probe.findQuarry({ x: here.x, y: here.y }, quarry);
check('an order resolves to a site of the right species',
  found?.speciesId === quarry.speciesId && found?.packKind === quarry.kind,
  `${found?.speciesId} ${found?.packKind}`);
check('and to the nearest one',
  found.id === probe.map.pois
    .filter((p) => poiMatchesQuarry(p, quarry))
    .sort((a, b) => Math.hypot(a.x - here.x, a.y - here.y) - Math.hypot(b.x - here.x, b.y - here.y))[0].id);

// A standing order outlives the site it sent the squad to. Clearing one camp
// is the order being obeyed, not finished.
const sites = probe.map.pois.filter((p) => poiMatchesQuarry(p, quarry));
check('a species has more than one site, so an order can stand',
  sites.length > 1, `${sites.length} sites`);

const absent = Object.values(CREATURES).find((c) => c.hunt === 'small' && !probe.faunaSpecies().has(c.id));
check('an order this raid cannot answer resolves to nothing',
  probe.findQuarry({ x: here.x, y: here.y }, { speciesId: absent.id, kind: 'small' }) === null,
  absent.name);

// ...and is dropped at the drop rather than steering the squad at a ghost.
const ghost = startRaid(900, { speciesId: absent.id, kind: 'small' });
check('a camp order the raid cannot answer is dropped when they land',
  ghost.playerSquad.tactics.quarry === null && ghost.droppedQuarry?.speciesId === absent.id);
check('and the squad is told why',
  ghost.feed.some((f) => f.text.includes(absent.name)),
  ghost.feed.map((f) => f.text)[0] ?? 'nothing logged');

const kept = startRaid(900, quarry);
check('an order the raid can answer survives the drop',
  kept.playerSquad.tactics.quarry?.speciesId === quarry.speciesId);

// ------------------------------------------------------------- the journal --
console.log('\n=== the journal remembers what the squad has met ===');

const profile = sanitizeProfile(newProfile(7));
check('a new profile knows what its starting parts came off',
  knownSpecies(profile).has('threshclaw') && knownSpecies(profile).has('plateback'),
  [...knownSpecies(profile)].join(','));
check('and nothing else', knownSpecies(profile).size === 2);

recordEncounters(profile, { sicklejaw: { kills: 3, carves: 2 }, notacreature: { kills: 9 } });
check('a raid adds what it met', knownSpecies(profile).has('sicklejaw'));
check('and refuses an id that names no creature', !knownSpecies(profile).has('notacreature'));
recordEncounters(profile, { sicklejaw: { kills: 2, carves: 1 } });
check('a second raid adds to the tally rather than replacing it',
  profile.bestiary.sicklejaw.kills === 5 && profile.bestiary.sicklejaw.carves === 3,
  `${profile.bestiary.sicklejaw.kills} kills, ${profile.bestiary.sicklejaw.carves} carves`);

// A save that predates the journal must not report an empty bestiary — the
// parts in its stash are proof of what it has met.
const old = newProfile(9);
delete old.bestiary;
sanitizeProfile(old);
check('a save from before the journal is reconstructed from its stash',
  knownSpecies(old).size === 2, [...knownSpecies(old)].join(','));

// ----------------------------------------------------------- the behaviour --
console.log('\n=== ordering a hunt brings more of it home ===');

function raid(seed, q) {
  const match = startRaid(seed, q, 8, true);
  while (match.phase === 'running') match.update(TICK);
  return match;
}

// Twenty-four, not eight. Both claims below are ratios of summed carves across
// the whole set, and eight raids is not enough of a sample for one: the same
// build measured "the total haul survives the narrowing" at 33% on these first
// eight seeds and 43% on all twenty-four, which is the difference between
// failing and passing by a comfortable margin. The build before the second ten
// of grounds went in reads 52% on twenty-four and would itself fail the
// delivery check on them at 14/24, so this was never a bound the eight seeds
// were testing — they were just the eight it happened to pass on.
const seeds = [
  11, 22, 33, 44, 55, 66, 77, 88, 99, 110, 121, 132,
  143, 154, 165, 176, 187, 198, 209, 220, 231, 242, 253, 264,
];
let without = 0, with_ = 0, withoutAll = 0, withAll = 0, delivered = 0;
for (const seed of seeds) {
  // Ask for something in the mid ring: the outer ring is where a farming plan
  // already goes, so ordering a hunt there proves much less.
  const camps = generateMap(seed).pois.filter((p) => p.kind === 'camp' && p.tier === 1);
  if (!camps.length) continue;
  const q = { speciesId: camps[0].speciesId, kind: 'small' };

  const off = raid(seed, null).encountered;
  const on = raid(seed, q).encountered;
  without += off[q.speciesId]?.carves ?? 0;
  with_ += on[q.speciesId]?.carves ?? 0;
  withoutAll += Object.values(off).reduce((a, b) => a + b.carves, 0);
  withAll += Object.values(on).reduce((a, b) => a + b.carves, 0);
  if ((on[q.speciesId]?.carves ?? 0) > 0) delivered++;
}

// Both halves are needed. The ratio alone cannot fail when the unordered
// baseline is zero — which it often is, since a mid-ring species is not what a
// farming plan walks into — so a floor in absolute carves is what actually
// asserts the order did something.
check('ordering a hunt carves much more of the quarry',
  with_ >= Math.max(without * 2, 20),
  `${without} carves unordered -> ${with_} ordered`);
check('and most raids come home with some of it',
  delivered >= seeds.length * 0.6, `${delivered}/${seeds.length} raids`);
// The order costs breadth, and should: the squad walks past what it did not
// come for. It must not cost so much that hunting is never worth it.
check('the total haul survives the narrowing',
  withAll >= withoutAll * 0.35,
  `${withoutAll} carves unordered -> ${withAll} ordered (${(withAll / withoutAll * 100).toFixed(0)}%)`);

// The raid has to hand the journal back what it met, or none of the above
// reaches the profile.
const reported = raid(900, null).buildResult();
check('a raid reports what it encountered',
  Object.keys(reported.encountered ?? {}).length > 0,
  `${Object.keys(reported.encountered ?? {}).length} species`);
const after = sanitizeProfile(newProfile(3));
const before = knownSpecies(after).size;
applyMatchResult(after, reported);
check('and the profile learns from it', knownSpecies(after).size > before,
  `${before} -> ${knownSpecies(after).size} species known`);

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
