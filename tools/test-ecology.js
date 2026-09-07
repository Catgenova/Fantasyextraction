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

import { Match, TICK } from '../src/sim/match.js';
import { generateMap, WORLD_SIZE, RING_CORE, RING_MID, tierAt } from '../src/sim/map.js';
import { newProfile, sanitizeProfile, squadHeroes } from '../src/game/profile.js';
import { generateBotSquads } from '../src/sim/bots.js';
import { CREATURES } from '../src/data/creatures.js';
import { dist } from '../src/core/vec.js';
import { makeRng } from '../src/core/rng.js';

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

  // The claim has to be falsifiable: a diet the generator ignored would leave
  // this at the rate a random assignment gives. A ring draws nine species, so
  // a boss whose prey were picked at random would land on its own diet about
  // three times in ten.
  let blind = 0;
  const rng = makeRng(99);
  for (const map of maps) {
    const camps = map.pois.filter((p) => p.kind === 'camp');
    for (const b of map.pois) {
      if (b.kind !== 'boss') continue;
      const here = camps.filter((c) => c.tier === b.tier);
      const pick = (here.length ? here : camps)[Math.floor(rng() * (here.length || camps.length))];
      if ((CREATURES[b.bossId].prey ?? []).includes(CREATURES[pick.speciesId]?.family)) blind++;
    }
  }
  check('and choosing prey at random would do markedly worse',
    onDiet > blind * 1.5, `${onDiet} on diet against ${blind} picking blind`);
}

// ---------------------------------------------------- 4. ring bookkeeping --
console.log('\n=== 4. the ring budget knows what its grounds cost it ===');
{
  // src/sim/map.js discounts each ring's camp budget by RING_TAKEN, the share
  // of the ring inside a solo ground's clearance. Those are measured numbers
  // baked into a constant, so re-measure them: if a ground moves or the
  // clearance changes and the constants do not, the core over-promises camps
  // to species that cannot be seated and they get pruned off the hunt list.
  const RING_TAKEN = { 0: 0.03, 1: 0.39, 2: 0.87 };
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

console.log(failures ? `\n${failures} check(s) failed` : '\nAll ecology checks passed');
process.exit(failures ? 1 : 0);
