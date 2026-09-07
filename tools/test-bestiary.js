#!/usr/bin/env node
// The bestiary is data, and fifty hand-written species is where typos live.
//
// None of this tests behaviour in the sim — nothing is wired yet. It tests that
// the data says what it claims to: that every species names a behaviour that
// exists, yields parts that exist, and that the two hunt kinds are actually
// different propositions rather than the same numbers twice.
//
//   node tools/test-bestiary.js

import { SMALL_CREATURES, LARGE_CREATURES, WALKING_CREATURES, CREATURES, speciesFor } from '../src/data/creatures.js';
import { BEHAVIOURS } from '../src/data/behaviours.js';
import { PART_TYPES, QUALITIES, QUALITY_ORDER, CARVE_PROFILE, makePart, partValue } from '../src/data/parts.js';
import { MOD_KEYS } from '../src/sim/stats.js';

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const small = Object.values(SMALL_CREATURES);
const large = Object.values(LARGE_CREATURES);
const walking = Object.values(WALKING_CREATURES);
const all = Object.values(CREATURES);
// Every solo hunt, whichever table it lives in. The split between the two is
// about how a creature gets onto the map — placed in a ground, or arriving on
// the clock — and nothing below cares which except where it says so.
const solo = all.filter((c) => c.hunt === 'solo');

console.log('=== the roster ===');

check('forty pack species', small.length === 40, String(small.length));
check('ten solo species in grounds', large.length === 10, String(large.length));
check('and three that walk', walking.length === 3, String(walking.length));
check('no id collides across the three tables',
  Object.keys(CREATURES).length === small.length + large.length + walking.length,
  String(Object.keys(CREATURES).length));
check('every key matches its own id', all.every((c) => CREATURES[c.id] === c));
check('every name is distinct',
  new Set(all.map((c) => c.name)).size === all.length,
  `${new Set(all.map((c) => c.name)).size} names for ${all.length} species`);
check('pack species are marked as pack hunts', small.every((c) => c.hunt === 'small'));
check('solo species are marked as solo hunts', solo.length === large.length + walking.length);
check('and only the walkers say they walk',
  all.filter((c) => c.walks).length === walking.length
  && walking.every((c) => c.walks && c.arrivesAt > 0 && c.ringTo > c.ringFrom),
  walking.map((c) => `${c.name}@${c.arrivesAt}s`).join(', '));
check('the walkers arrive in the order they get harder',
  walking.every((c, i) => i === 0
    || (c.arrivesAt > walking[i - 1].arrivesAt && c.hp > walking[i - 1].hp)),
  walking.map((c) => `${(c.arrivesAt / 60)}m ${c.hp}hp`).join(' -> '));
// Deeper and wider each time, and every band has to reach the country a raid
// is actually fought in or the trophy is unreachable content.
check('and each one starts deeper and ranges wider than the last',
  walking.every((c, i) => i === 0
    || (c.ringFrom < walking[i - 1].ringFrom
      && (c.ringTo - c.ringFrom) > (walking[i - 1].ringTo - walking[i - 1].ringFrom))),
  walking.map((c) => `${c.ringFrom}-${c.ringTo}`).join(' -> '));
check('and every band crosses the ring raids are fought in',
  walking.every((c) => c.ringFrom < 0.33 && c.ringTo > 0.4),
  walking.map((c) => `${c.name} ${c.ringFrom}-${c.ringTo}`).join(', '));
check('exactly one apex', all.filter((c) => c.apex).length === 1,
  all.filter((c) => c.apex).map((c) => c.name).join(','));

console.log('\n=== each species fights differently ===');

check('every behaviour named exists',
  all.every((c) => BEHAVIOURS[c.behaviour]),
  all.filter((c) => !BEHAVIOURS[c.behaviour]).map((c) => `${c.name}:${c.behaviour}`).join(','));

const used = new Set(all.map((c) => c.behaviour));
check('the pack roster spreads across many behaviours',
  new Set(small.map((c) => c.behaviour)).size >= 15,
  `${new Set(small.map((c) => c.behaviour)).size} distinct`);
check('no behaviour dominates the pack roster',
  Object.values(small.reduce((acc, c) => {
    acc[c.behaviour] = (acc[c.behaviour] ?? 0) + 1; return acc;
  }, {})).every((n) => n <= 5));
check('every solo monster has its own move set',
  solo.every((c) => (c.abilities ?? []).length >= 2),
  solo.filter((c) => (c.abilities ?? []).length < 2).map((c) => c.name).join(','));
check('no solo monster repeats an ability id',
  solo.every((c) => new Set(c.abilities.map((a) => a.id)).size === c.abilities.length));
check('every summon names a real species',
  solo.flatMap((c) => c.abilities ?? [])
    .filter((a) => a.kind === 'summon')
    .every((a) => CREATURES[a.spawn]),
  solo.flatMap((c) => (c.abilities ?? []).filter((a) => a.kind === 'summon').map((a) => a.spawn)).join(','));

console.log('\n=== a solo hunt is a different proposition ===');

// If a solo monster were just a big pack member the hunt choice would be
// meaningless. It has to be worth the risk on carves, not only on health.
const toughestPack = Math.max(...small.map((c) => c.hp));
check('every solo monster outweighs the toughest pack species',
  solo.every((c) => c.hp > toughestPack * 4),
  `toughest pack ${toughestPack}hp, weakest solo ${Math.min(...solo.map((c) => c.hp))}hp`);
check('a solo corpse is worth several carves',
  CARVE_PROFILE.large.carves[0] > CARVE_PROFILE.small.carves[1],
  `${CARVE_PROFILE.small.carves.join('-')} against ${CARVE_PROFILE.large.carves.join('-')}`);
check('and better ones', CARVE_PROFILE.large.qualityBias > CARVE_PROFILE.small.qualityBias);
check('but it takes longer to cut up',
  CARVE_PROFILE.large.seconds > CARVE_PROFILE.small.seconds,
  `${CARVE_PROFILE.small.seconds}s against ${CARVE_PROFILE.large.seconds}s`);
check('there is a solo hunt a new squad can attempt',
  large.some((c) => c.tier === 0),
  large.filter((c) => c.tier === 0).map((c) => c.name).join(','));

console.log('\n=== carving ===');

check('every species yields at least two kinds of part',
  all.every((c) => Object.keys(c.parts ?? {}).length >= 2),
  all.filter((c) => Object.keys(c.parts ?? {}).length < 2).map((c) => c.name).join(','));
check('every part type named exists',
  all.every((c) => Object.keys(c.parts).every((t) => PART_TYPES[t])),
  all.flatMap((c) => Object.keys(c.parts).filter((t) => !PART_TYPES[t])).join(','));
check('every part weight is positive',
  all.every((c) => Object.values(c.parts).every((w) => w > 0)));
check('every part type is yielded by something',
  Object.keys(PART_TYPES).every((t) => all.some((c) => c.parts[t])),
  Object.keys(PART_TYPES).filter((t) => !all.some((c) => c.parts[t])).join(','));
check('quality is a strict ladder',
  QUALITY_ORDER.every((q, i) => i === 0 || QUALITIES[q].power > QUALITIES[QUALITY_ORDER[i - 1]].power),
  QUALITY_ORDER.map((q) => QUALITIES[q].power).join(' < '));
check('better parts are worth more',
  partValue(makePart({ speciesId: 'x', speciesName: 'X', partType: 'claw', quality: 'mythic', tier: 2 }))
  > partValue(makePart({ speciesId: 'x', speciesName: 'X', partType: 'claw', quality: 'ragged', tier: 2 })));
check('a part carries its species so a bag stays readable',
  (() => {
    const p = makePart({ speciesId: 'sicklejaw', speciesName: 'Sicklejaw', partType: 'claw', quality: 'fine', tier: 0 });
    return p.speciesId === 'sicklejaw' && p.name === 'Sicklejaw Claw' && p.kind === 'part';
  })());

console.log('\n=== armour sets echo the creature ===');

check('every species has a set', all.every((c) => c.set?.name));
check('every set says which behaviour it echoes',
  all.every((c) => BEHAVIOURS[c.set.echoes ?? c.behaviour]),
  all.filter((c) => !BEHAVIOURS[c.set.echoes ?? c.behaviour]).map((c) => c.name).join(','));
check("and echoes its own creature's behaviour",
  all.every((c) => (c.set.echoes ?? c.behaviour) === c.behaviour),
  all.filter((c) => (c.set.echoes ?? c.behaviour) !== c.behaviour).map((c) => c.name).join(','));

const modKeys = new Set(MOD_KEYS);
const badMods = all.flatMap((c) => [
  ...Object.keys(c.set.mods ?? {}),
  ...Object.keys(c.set.aura ?? {}),
].filter((k) => !modKeys.has(k)).map((k) => `${c.name}:${k}`));
check('every set bonus uses a stat the sim understands', badMods.length === 0, badMods.join(','));
check('every set does something',
  all.every((c) => Object.keys(c.set.mods ?? {}).length + Object.keys(c.set.aura ?? {}).length > 0),
  all.filter((c) => !Object.keys(c.set.mods ?? {}).length && !Object.keys(c.set.aura ?? {}).length)
    .map((c) => c.name).join(','));
check('solo sets are worth more than pack sets',
  Math.min(...large.map((c) => Object.keys(c.set.mods).length))
  >= Math.max(...small.map((c) => Object.keys(c.set.mods ?? {}).length)) - 1);

console.log('\n=== stats are sane and tiered ===');

const numeric = ['hp', 'armor', 'resist', 'damage', 'attackInterval', 'range', 'moveSpeed', 'radius', 'aggroRange', 'xp'];
const missing = all.flatMap((c) => numeric.filter((k) => typeof c[k] !== 'number' || c[k] <= 0)
  .map((k) => `${c.name}.${k}`));
check('every species has a complete stat block', missing.length === 0, missing.slice(0, 6).join(','));
check('every pack species declares a pack size',
  small.every((c) => Array.isArray(c.packSize) && c.packSize[0] >= 2 && c.packSize[1] >= c.packSize[0]),
  small.filter((c) => !Array.isArray(c.packSize)).map((c) => c.name).join(','));
check('solo species do not come in packs', large.every((c) => !c.packSize));
check('every ranged species has a projectile speed',
  all.filter((c) => c.projectile).every((c) => c.projectileSpeed > 0),
  all.filter((c) => c.projectile).map((c) => c.name).join(','));

for (const tier of [0, 1, 2]) {
  const band = small.filter((c) => c.tier === tier);
  check(`tier ${tier} has enough pack species to build a hunt from`, band.length >= 8,
    `${band.length} species`);
}
// Damage per hit is the wrong measure of how dangerous something is: a
// Thornback deliberately hits for less than a tier-0 Sandlurker because its
// whole identity is surviving and punishing, not swinging. Threat has to
// account for the trade, so it is health against sustained output.
const threat = (c) => Math.round(c.hp * (c.damage / c.attackInterval));
const band = (t) => small.filter((c) => c.tier === t).map(threat).sort((a, b) => a - b);
const median = (xs) => xs[Math.floor(xs.length / 2)];

check('tier bands get more dangerous',
  median(band(0)) < median(band(1)) && median(band(1)) < median(band(2)),
  `medians ${median(band(0))} / ${median(band(1))} / ${median(band(2))}`);
check('nothing in the core is as harmless as the outer ring',
  Math.min(...band(2)) > Math.max(...band(0)),
  `outer peaks at ${Math.max(...band(0))}, core starts at ${Math.min(...band(2))}`);
// Adjacent bands are allowed to overlap — a heavy tier-1 species outweighing a
// light tier-2 one is a roster with variety in it, not a mistake.
check('adjacent bands overlap rather than stepping',
  Math.max(...band(1)) > Math.min(...band(2)),
  `tier 1 peaks at ${Math.max(...band(1))}, tier 2 starts at ${Math.min(...band(2))}`);

check('speciesFor finds hunts by kind and depth',
  speciesFor('small', 0).length >= 8 && speciesFor('solo', 0).length === 1
  && speciesFor('solo', 2).length === large.length + walking.length,
  `${speciesFor('small', 0).length} shallow packs, ${speciesFor('solo', 0).length} shallow solo, ` +
  `${speciesFor('solo', 2).length} solo in all`);

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
