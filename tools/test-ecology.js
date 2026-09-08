#!/usr/bin/env node
// How the map allocates its animals, and what happens once they are dead.
//
// Three claims, and none of them is a property of a function — they are
// properties of a generated world, so every one is measured over a batch of
// maps rather than asserted about one.
//
//   1. A species holds country. The nearest camp to a camp is nearly always
//      the same species, because a species is placed in ranges rather than
//      scattered over its ring.
//   2. No two camps are closer than CAMP_SEPARATION, and every solo ground
//      keeps clear of every camp. This is the one the player feels: before it,
//      half the gaps between fights were under ten seconds and the closest
//      pair of camps on a map was 41 units apart.
//   3. Nothing comes back. A camp that has been cleared stays cleared for the
//      rest of the raid, and the hunt list stops offering it.
//
//   node tools/test-ecology.js

import { Match, TICK, EYES_ON } from '../src/sim/match.js';
import { generateMap, WORLD_SIZE, RING_CORE, RING_MID, tierAt } from '../src/sim/map.js';
import { newProfile, sanitizeProfile, squadHeroes } from '../src/game/profile.js';
import { generateBotSquads } from '../src/sim/bots.js';
import { CREATURES } from '../src/data/creatures.js';
import { dist } from '../src/core/vec.js';
import { makeRng } from '../src/core/rng.js';
import { craftItem, SLOTS, slotsForPart, canEquip } from '../src/data/gear.js';
import { autoAllocate, sanitizeHero } from '../src/sim/heroes.js';

/**
 * A squad kitted well enough to actually kill apexes. Section 7 needs dead
 * grounds to exist before it can check that the plan stops walking to them,
 * and an ungeared level-14 squad managed five kills across four raids — too
 * little signal for the check to fail on when the routing is broken.
 */
function equipDeep(profile, seed) {
  const rng = makeRng(seed ^ 0x5bf03635);
  const pool = Object.values(CREATURES);
  for (const hero of profile.roster) {
    hero.level = 14;
    autoAllocate(rng, hero);
    for (const slot of SLOTS) {
      const fits = pool.filter((c) => c.tier <= 2
        && Object.keys(c.parts).some((pt) => slotsForPart(pt).includes(slot)));
      const sp = fits[Math.floor(rng() * fits.length)];
      const opts = Object.keys(sp.parts).filter((pt) => slotsForPart(pt).includes(slot));
      const item = craftItem({
        speciesId: sp.id, partType: opts[Math.floor(rng() * opts.length)],
        slot, quality: 'pristine', classId: hero.classId,
      });
      if (item && canEquip(item, hero.classId)) hero.equipped[slot] = item;
    }
    sanitizeHero(hero);
  }
}

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

// These are `src/sim/map.js`'s own numbers, restated rather than exported. If
// they drift apart the checks below start passing for the wrong reason, so the
// first one is a check in its own right.
const CAMP_SEPARATION = 1500 - 300;   // 1200
const ARENA_CAMP_CLEAR = 1500;
const SEEDS = 60;
const maps = [];
for (let s = 0; s < SEEDS; s++) maps.push(generateMap(4000 + s));

// ------------------------------------------------------------- 1. country --
console.log('=== 1. a species holds country ===');
{
  let same = 0;
  let total = 0;
  let ownSpread = 0;
  let otherSpread = 0;
  for (const map of maps) {
    const camps = map.pois.filter((p) => p.kind === 'camp');
    for (const c of camps) {
      let best = Infinity;
      let bestC = null;
      let bestOther = Infinity;
      for (const o of camps) {
        if (o === c) continue;
        const d = dist(c, o);
        if (d < best) { best = d; bestC = o; }
        if (o.speciesId !== c.speciesId && d < bestOther) bestOther = d;
      }
      if (!bestC) continue;
      total++;
      if (bestC.speciesId === c.speciesId) same++;
      ownSpread += best;
      otherSpread += bestOther;
    }
  }
  const share = same / total;
  // Chance alone would be about one in nine — a map draws nine species — so
  // the floor is not 50%, it is 11%.
  //
  // 0.78 rather than something safely low, because a loose threshold here
  // passes with ranges alone and stops guarding the pull that puts a species'
  // several ranges beside each other. Measured over five independent batches
  // of sixty maps: 80.0 to 81.1% with the pull, 71.4 to 74.4% without. The
  // bands do not touch and each is barely a point wide, so this separates them
  // without being a coin toss on the seed.
  check('the nearest camp to a camp is nearly always the same species',
    share > 0.78, `${(share * 100).toFixed(0)}% (chance would be about 11%)`);
  check('and a different species is markedly further off',
    otherSpread > ownSpread * 1.4,
    `${(ownSpread / total).toFixed(0)} to your own, ${(otherSpread / total).toFixed(0)} to anyone else`);
}

// -------------------------------------------------------------- 2. spacing --
console.log('\n=== 2. nothing is on top of anything else ===');
{
  let closest = Infinity;
  let closestArena = Infinity;
  let campsPerMap = 0;
  for (const map of maps) {
    const camps = map.pois.filter((p) => p.kind === 'camp');
    campsPerMap += camps.length;
    for (let i = 0; i < camps.length; i++) {
      for (let j = i + 1; j < camps.length; j++) {
        closest = Math.min(closest, dist(camps[i], camps[j]));
      }
      for (const a of map.pois) {
        if (a.kind !== 'boss') continue;
        closestArena = Math.min(closestArena, dist(camps[i], a));
      }
    }
  }
  check('no two camps are within CAMP_SEPARATION',
    closest >= CAMP_SEPARATION - 1, `closest pair over ${SEEDS} maps: ${closest.toFixed(0)} units`);
  check('and no solo ground is within ARENA_CAMP_CLEAR of a camp',
    closestArena >= ARENA_CAMP_CLEAR - 1, `closest: ${closestArena.toFixed(0)} units`);
  // The clearance above has to outrun BOSS_WAKE in match.js, or hunting a pack
  // wakes the animal that hunts the pack. That cost half of eight test raids
  // their squad, three minutes in, to a boss they never chose to fight.
  check('and that clearance is wider than the wake radius', ARENA_CAMP_CLEAR > 1100);
  check('the map still holds a raid worth of camps',
    campsPerMap / SEEDS > 70, `${(campsPerMap / SEEDS).toFixed(1)} camps per map`);
}

// ---------------------------------------------------------------- 3. prey --
console.log('\n=== 3. the big ones live near what they eat ===');
{
  let onDiet = 0;
  let total = 0;
  let preyIsNearest = 0;
  for (const map of maps) {
    const camps = map.pois.filter((p) => p.kind === 'camp');
    for (const b of map.pois) {
      if (b.kind !== 'boss') continue;
      total++;
      if ((CREATURES[b.bossId].prey ?? []).includes(CREATURES[b.preyId]?.family)) onDiet++;
      const nearest = camps.reduce((a, c) => (dist(b, c) < dist(b, a) ? c : a));
      if (nearest.speciesId === b.preyId) preyIsNearest++;
    }
  }
  // Not all of them: the core seats one pack species and has four apexes over
  // it, so at best one of those four finds its first choice. Everything
  // outside the core does.
  check('most solo grounds are placed by something on their diet',
    onDiet / total > 0.65, `${(onDiet / total * 100).toFixed(0)}% of ${total} grounds`);
  check('and the nearest camp to a ground is usually its prey',
    preyIsNearest / total > 0.7, `${(preyIsNearest / total * 100).toFixed(0)}%`);

  // The claim has to be falsifiable, and the null it is measured against has
  // to be one the generator cannot accidentally satisfy.
  //
  // The old null picked a random camp in the ring and asked whether it was on
  // the boss's diet. That was contaminated: `drawFauna` weights a ring's
  // species toward the diets of the apexes living in it, so a random camp is
  // already biased toward being edible. As the roster grew from thirteen
  // apexes to twenty-three the null rose on its own — 45% to 54% — with no
  // change to placement at all, and would eventually have swallowed the
  // signal it exists to prove.
  //
  // A permutation instead: same ground, same prey, a different apex standing
  // on it. That breaks the link between placement and diet and leaves
  // everything else — the fauna draw included — exactly as it was, so it sits
  // still while the roster changes. It read 47% on the thirteen-apex map and
  // 49% now.
  let permuted = 0;
  const rng = makeRng(99);
  for (const map of maps) {
    const grounds = map.pois.filter((p) => p.kind === 'boss');
    for (const b of grounds) {
      const others = grounds.filter((o) => o.bossId !== b.bossId);
      if (!others.length) continue;
      const other = others[Math.floor(rng() * others.length)];
      if ((CREATURES[other.bossId].prey ?? []).includes(CREATURES[b.preyId]?.family)) permuted++;
    }
  }
  // Stated as a gap in points rather than a ratio: the ratio moves with the
  // null's denominator, which is the thing that turned out not to hold still.
  // The old map ran 28 points clear; drawing four apexes from eight instead of
  // seating the same complementary four every raid costs some of that, because
  // a ring that draws two raptorial-eaters can only feed one of them.
  const gap = (onDiet - permuted) / total;
  check('and a different apex on the same ground would do markedly worse',
    gap > 0.15,
    `${(onDiet / total * 100).toFixed(0)}% on diet against `
    + `${(permuted / total * 100).toFixed(0)}% permuted, a gap of `
    + `${(gap * 100).toFixed(0)} points`);
}

// --------------------------------------------- 3b. grounds keep their room --
console.log('\n=== 3b. one apex at a time, in the ring it claims ===');
{
  // Two things nothing was watching until the roster went from thirteen
  // grounds to twenty-three, and both broke immediately.
  //
  // The first is crowding. A ground carries an aggro range up to 700, so two
  // of them inside 1400 of each other means a squad that commits to one can
  // have the other arrive. On the thirteen-ground map that happened to 1.9%
  // of grounds; doubling the grounds against the same scorer took it to 14%,
  // which is one in seven and not a rare accident.
  const PULL = 1400;
  let crowded = 0;
  let grounds = 0;
  // The second is the ring a ground says it is in. The placer jitters the
  // radius by +/-11%, so a ground seated within that of a ring boundary lands
  // in the wrong ring on some seeds — and its trophy, its tier scaling and the
  // hunt list all still call it by the ring it was specified in.
  let misringed = 0;
  for (const map of maps) {
    const bosses = map.pois.filter((p) => p.kind === 'boss');
    for (const b of bosses) {
      grounds++;
      if (tierAt(b) !== b.tier) misringed++;
      let nearest = Infinity;
      for (const o of bosses) if (o !== b) nearest = Math.min(nearest, dist(b, o));
      if (nearest < PULL) crowded++;
    }
  }
  check('grounds are rarely close enough to pull each other',
    crowded / grounds < 0.03,
    `${(crowded / grounds * 100).toFixed(1)}% of ${grounds} grounds within ${PULL}`);
  check('and every ground is in the ring its trophy claims',
    misringed === 0, `${misringed} of ${grounds} in the wrong ring`);
}

// ---------------------------------------------------- 4. ring bookkeeping --
console.log('\n=== 4. the ring budget knows what its grounds cost it ===');
{
  // src/sim/map.js discounts each ring's camp budget by RING_TAKEN, the share
  // of the ring inside a solo ground's clearance. Those are measured numbers
  // baked into a constant, so re-measure them: if a ground moves or the
  // clearance changes and the constants do not, the core over-promises camps
  // to species that cannot be seated and they get pruned off the hunt list.
  const RING_TAKEN = { 0: 0.03, 1: 0.44, 2: 0.79 };
  const hit = { 0: 0, 1: 0, 2: 0 };
  const all = { 0: 0, 1: 0, 2: 0 };
  const rng = makeRng(7);
  for (const map of maps.slice(0, 20)) {
    const arenas = map.pois.filter((p) => p.kind === 'boss');
    for (let i = 0; i < 20000; i++) {
      const p = { x: rng() * WORLD_SIZE, y: rng() * WORLD_SIZE };
      const t = tierAt(p);
      all[t]++;
      if (arenas.some((a) => dist(p, a) < ARENA_CAMP_CLEAR)) hit[t]++;
    }
  }
  for (const t of [0, 1, 2]) {
    const measured = hit[t] / all[t];
    check(`RING_TAKEN[${t}] still matches the geometry`,
      Math.abs(measured - RING_TAKEN[t]) < 0.08,
      `constant ${RING_TAKEN[t]}, measured ${measured.toFixed(2)}`);
  }
}

// ------------------------------------------------------------ 5. finality --
console.log('\n=== 5. what is dead stays dead ===');
{
  const seed = 5150;
  const profile = sanitizeProfile(newProfile(seed));
  for (const h of profile.roster) h.level = 8;
  const match = new Match({
    seed,
    playerSquad: {
      id: 'player', name: 'Yours', isPlayer: true,
      heroes: squadHeroes(profile), tactics: profile.squadTactics,
    },
    botSquads: generateBotSquads(seed, 5, 8),
  });

  // Deaths per camp, not spawns. A camp streamed out with survivors and
  // streamed back in builds fresh entities with fresh ids for the ones that
  // were left, so counting ids called a camp a respawner for doing exactly
  // what it is supposed to do. What must not exceed the roster is the number
  // of bodies the camp ever actually yields.
  const died = new Map();
  const seenDead = new Set();
  let clearedThenRefilled = 0;
  let overCrowded = [];
  while (match.phase === 'running') {
    match.update(TICK);
    for (const e of match.entities) {
      if (!e.ownerPoi || e.alive || seenDead.has(e.id)) continue;
      seenDead.add(e.id);
      died.set(e.ownerPoi, (died.get(e.ownerPoi) ?? 0) + 1);
    }
    for (const poi of match.map.pois) {
      if (poi.kind !== 'camp') continue;
      if (poi.cleared && poi.spawnedIds.some((id) => match.byId(id)?.alive)) clearedThenRefilled++;
      if (poi.roster && poi.spawnedIds.length > poi.roster) overCrowded.push(poi.id);
    }
  }

  check('a cleared camp is never repopulated', clearedThenRefilled === 0,
    `${clearedThenRefilled} ticks with something alive in a cleared camp`);

  check('a camp never has more bodies standing in it than its roster',
    overCrowded.length === 0, [...new Set(overCrowded)].join(', ') || 'none over');

  const overYielded = [...died.entries()].filter(([id, n]) => {
    const poi = match.map.pois.find((p) => p.id === id);
    return poi?.kind === 'camp' && poi.roster && n > poi.roster;
  });
  check('and never yields more bodies than its roster over the whole raid',
    overYielded.length === 0,
    overYielded.map(([id, n]) => `${id}: ${n}`).join(', ') || 'none over');

  const cleared = match.map.pois.filter((p) => p.kind === 'camp' && p.cleared);
  check('a raid clears a real share of the map but not all of it',
    cleared.length > 5 && cleared.length < match.map.pois.filter((p) => p.kind === 'camp').length,
    `${cleared.length} camps cleared`);

  // A cleared camp must stop being somewhere a hunt order can send a squad, or
  // the order walks them to an empty clearing and holds them there. It did:
  // the total haul under an order fell to a third of what an unordered raid
  // brought home.
  const done = cleared[0];
  check('and a hunt no longer routes to it',
    match.findQuarry({ x: done.x, y: done.y },
      { speciesId: done.speciesId, kind: done.packKind })?.id !== done.id,
    done.id);
}

// ------------------------------------------------- 6. and squads know it --
console.log('\n=== and a squad stops going back ===');
{
  // A cleared camp is not a worse destination than a live one, it is not a
  // destination — and nothing told the plan that. `findQuarry` had learned to
  // skip cleared camps; `pickRoamGoal`, which is what a squad follows between
  // hunts and after one is spent, had not. Measured over ten raids, 92.6% of
  // the camp goals a plan chose were camps that had already been emptied, and
  // a squad spent 86 seconds of every raid standing on ground it had been
  // deliberately sent to and that had nothing on it.
  const seed = 8207;
  const profile = sanitizeProfile(newProfile(seed));
  for (const h of profile.roster) h.level = 10;
  profile.squadTactics.extractPlan = 'late';
  const match = new Match({
    seed,
    playerSquad: {
      id: 'player', name: 'Yours', isPlayer: true,
      heroes: squadHeroes(profile), tactics: profile.squadTactics,
    },
    botSquads: generateBotSquads(seed, 5, 10),
  });

  let goals = 0;
  let deadGoals = 0;
  let standingOnDead = 0;
  let walkingToDead = 0;
  let lastGoal = null;
  // Everywhere the squad has actually been close enough to look.
  const wentNear = new Set();
  let knownWithoutLooking = 0;
  while (match.phase === 'running') {
    match.update(TICK);
    const squad = match.playerSquad;
    const order = squad.order;
    const centre0 = match.squadCentroid(squad);
    if (centre0) {
      for (const p of match.map.pois) {
        if (p.kind === 'camp' && dist(centre0, p) <= EYES_ON + 1) wentNear.add(p.id);
      }
    }
    // Knowledge has to be earned. A camp crossed off that this squad has never
    // been near is the global `poi.cleared` flag — which is true the instant
    // anybody empties a camp — leaking into what a squad is supposed to have
    // gone and found out.
    for (const id of squad.emptied) if (!wentNear.has(id)) knownWithoutLooking++;

    if (!order || order.mode !== 'travel') { lastGoal = null; continue; }
    const camp = match.map.pois.find((p) => p.kind === 'camp'
      && Math.abs(p.x - order.pos.x) < 1 && Math.abs(p.y - order.pos.y) < 1);
    if (!camp) { lastGoal = null; continue; }
    const key = `${camp.id}`;
    if (key !== lastGoal) { lastGoal = key; goals++; if (camp.cleared) deadGoals++; }
    const centre = match.squadCentroid(squad);
    if (centre && dist(centre, camp) < 300 && camp.cleared) standingOnDead += TICK;
    // Still walking toward something it has already crossed off. Learning a
    // camp is dead and then finishing the trip anyway is the same wasted walk
    // with an extra step in it.
    if (squad.emptied.has(camp.id)) walkingToDead += TICK;
  }

  check('a squad is never sent to a camp it has already found empty',
    standingOnDead < 2,
    `${standingOnDead.toFixed(1)}s standing on a cleared camp it was sent to`);
  // Not zero. What survives is camps a *rival* emptied, which this squad has
  // no way of knowing about until it goes and looks — and going and looking is
  // the whole point. It walks over, sees the clearing, crosses it off, and
  // never picks it again.
  check('and the ones it still walks to are ones somebody else cleared',
    deadGoals / Math.max(1, goals) < 0.55,
    `${deadGoals} of ${goals} camp goals were already cleared`);
  check('nothing is crossed off that the squad never went near',
    knownWithoutLooking === 0, `${knownWithoutLooking} ticks`);
  check('and a goal it crosses off is dropped rather than walked out',
    walkingToDead < 1, `${walkingToDead.toFixed(1)}s still heading for a camp it had written off`);
  check('it does learn as it goes', match.playerSquad.emptied.size > 3,
    `${match.playerSquad.emptied.size} camps crossed off`);
}

// ------------------------------------------------- 7. the boss hunt moves on --
console.log('\n=== 7. a boss hunt does not walk to corpses ===');
{
  // The plan's own filter, which for grounds was never written: the candidate
  // list read `|| p.kind === 'boss'`, short-circuiting with no filter at all,
  // so a defeated arena stayed a destination for the rest of the raid. The
  // squad walked off it, the distance penalty stopped excluding it, and it
  // scored best again.
  //
  // Grounds are read globally rather than squad-locally, unlike camps. A boss
  // death is announced to the feed the moment it happens and `findQuarry` has
  // always read the boss's liveness that way for hunt orders, so the plan
  // agrees with it. That also covers the case squad-local knowledge cannot:
  // rivals kill most of the apexes, and under EYES_ON the squad would have to
  // walk the whole way to a corpse to find out.
  //
  // Two things this check got wrong first, both of which made it unfailable:
  //
  //  - It counted every tick `roamPoi` named a dead ground. `roamPoi` keeps
  //    its value through a fight and a carve, so it was mostly measuring "the
  //    squad is standing on the boss it just killed", which is the reward. On
  //    that metric the fixed build read 10.8% and looked broken. It counts
  //    only ticks spent travelling now.
  //  - It read `poi.cleared`, the flag the fix sets. Break the marking and the
  //    metric goes blind and reports zero, which is exactly what one of the
  //    three injections did. It reads the boss entity's liveness instead, so
  //    it is independent of every part of the mechanism it guards.
  let walkingToCorpse = 0;
  const corpsesWalkedTo = new Set();
  let bossKills = 0;
  for (const seed of [7300, 7301, 7302, 7303, 7304, 7305]) {
    const profile = sanitizeProfile(newProfile(seed));
    equipDeep(profile, seed);
    profile.squadTactics.leaderId = profile.squad[0];
    profile.squadTactics.plan = 'boss';
    profile.squadTactics.extractPlan = 'late';
    const match = new Match({
      seed,
      playerSquad: {
        id: 'player', name: 'Yours', isPlayer: true,
        heroes: squadHeroes(profile), tactics: profile.squadTactics,
      },
      botSquads: generateBotSquads(seed, 5, 14),
    });
    while (match.phase === 'running') {
      match.update(TICK);
      const squad = match.playerSquad;
      if (squad.order?.mode !== 'travel') continue;
      const poi = match.poiById(squad.roamPoi);
      if (poi?.kind !== 'boss' || !poi.spawned) continue;
      const boss = poi.bossEntityId ? match.byId(poi.bossEntityId) : null;
      if (boss?.alive) continue;
      walkingToCorpse += TICK;
      corpsesWalkedTo.add(`${seed}:${poi.id}`);
    }
    bossKills += match.stats.bossKills;
  }

  check('a boss hunt never walks to a ground whose boss is already dead',
    walkingToCorpse < 1,
    `${walkingToCorpse.toFixed(1)}s heading for ${corpsesWalkedTo.size} defeated grounds`);
  // The claim above is worth nothing if the plan never chose a ground at all.
  check('and it did choose grounds to walk to', bossKills >= 8,
    `${bossKills} bosses died across the six raids`);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll ecology checks passed');
process.exit(failures ? 1 : 0);
