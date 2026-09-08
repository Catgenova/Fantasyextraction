#!/usr/bin/env node
// Checks the loop that ties raids back to the profile: XP, levels, loot into
// the stash, and gear actually being lost when a hero does not extract.

import { Match, TICK } from '../src/sim/match.js';
import { newProfile, squadHeroes, applyMatchResult, STASH_LIMIT } from '../src/game/profile.js';
import { SLOTS, craftItem } from '../src/data/gear.js';
import { makeConsumable } from '../src/data/consumables.js';
import { generateBotSquads } from '../src/sim/bots.js';
import { MATCH_SECONDS } from '../src/data/enemies.js';

let failures = 0;
function check(name, cond, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!cond) failures++;
}

function runRaid(seed, profile) {
  const match = new Match({
    seed,
    playerSquad: { id: 'player', name: 'Yours', isPlayer: true, heroes: squadHeroes(profile), tactics: profile.squadTactics },
    botSquads: generateBotSquads(seed, 5, 3),
  });
  let ticks = 0;
  while (match.phase !== 'ended' && ticks < MATCH_SECONDS / TICK + 100) { match.update(TICK); ticks++; }
  return match.result ?? match.buildResult();
}

// --- Determinism -----------------------------------------------------------
{
  const a = runRaid(777, newProfile(777));
  const b = runRaid(777, newProfile(777));
  check('same seed produces the same raid',
    a.outcome === b.outcome && Math.abs(a.duration - b.duration) < 1e-6 && a.stats.kills === b.stats.kills,
    `${a.outcome}/${a.stats.kills} vs ${b.outcome}/${b.stats.kills}`);
}

// --- Death costs everything ------------------------------------------------
// Asserted against `applyMatchResult` rather than by waiting for a raid to
// kill somebody: it is a rule of the game, so it should hold whether or not
// the current balance happens to produce a corpse.
{
  const profile = newProfile(31);
  const hero = profile.roster[0];
  const worn = Object.values(hero.equipped).filter(Boolean).map((i) => ({ ...i }));
  // Carves, which is what a hero actually carries home. They live in
  // `materials` now rather than in the stash, and there is no limit on them.
  const carried = profile.materials.slice(0, 2);
  const heldBefore = profile.materials.length + profile.stash.length;

  const summary = applyMatchResult(profile, {
    seed: 31, duration: 600, outcome: 'partial', bossesKilled: [],
    stats: { kills: 10, bossKills: 0, heroKills: 0 },
    heroes: [{
      entityId: 'e1', heroId: hero.id, name: hero.name, classId: hero.classId,
      extracted: false, alive: false, xp: 100, kills: 3, damage: 0, healing: 0, taken: 0,
      kept: [], keptEquipped: {}, keptConsumables: [],
      lost: [...worn, ...carried],
    }],
  });

  // The rule changed: a dead hero loses what they were wearing and the camp
  // puts them straight back into wooden gear. Losing everything used to mean
  // losing the ability to take the next raid, which turns one bad run into an
  // account that is over.
  check('a hero who did not extract loses what they were wearing',
    Object.values(hero.equipped).every((i) => !worn.some((w) => w && w.id === i?.id)),
    `${Object.values(hero.equipped).filter((i) => worn.some((w) => w && w.id === i?.id)).length} of the old pieces kept`);
  check('and is re-kitted in wooden gear, every slot',
    Object.values(hero.equipped).length === SLOTS.length
    && Object.values(hero.equipped).every((i) => i?.wooden),
    `${Object.values(hero.equipped).filter((i) => i?.wooden).length}/${SLOTS.length} wooden`);
  check('the report names who was re-kitted', summary.rekitted.includes(hero.name),
    summary.rekitted.join(',') || 'nobody');
  check('and their belt is emptied', hero.consumables.length === 0);
  check('the report lists what was lost',
    summary.lost.length === worn.length + carried.length,
    `${summary.lost.length} of ${worn.length + carried.length}`);
  // Nothing was added. The carried parts are the profile's own starting
  // material rather than something this fake raid moved, so what is asserted
  // is that neither store grew and that no worn piece turned up in either.
  const heldAfter = profile.materials.length + profile.stash.length;
  check('none of it reaches the stash',
    heldAfter === heldBefore
    && ![...profile.stash, ...profile.materials].some((i) => worn.some((w) => w.id === i.id)),
    `${heldBefore} held -> ${heldAfter}`);
}

// --- Extraction keeps everything -------------------------------------------
// The mirror of the rule above, and asserted the same way and for the same
// reason. Whether a starter squad survives six seeded raids is a property of
// the difficulty curve; that an extracted hero keeps what they carried is a
// rule, and it should hold whichever way the curve happens to fall.
{
  const profile = newProfile(32);
  const hero = profile.roster[0];
  const worn = { ...hero.equipped };
  const carried = profile.materials.slice(0, 2);
  const materialsBefore = profile.materials.length;

  const summary = applyMatchResult(profile, {
    seed: 32, duration: 600, outcome: 'clean', bossesKilled: [],
    stats: { kills: 10, bossKills: 0, heroKills: 0 },
    heroes: [{
      entityId: 'e1', heroId: hero.id, name: hero.name, classId: hero.classId,
      extracted: true, alive: true, xp: 100, kills: 3, damage: 0, healing: 0, taken: 0,
      kept: carried, keptEquipped: worn, keptConsumables: [],
      lost: [],
    }],
  });

  check('an extracted hero keeps what they were wearing',
    Object.entries(worn).every(([slot, item]) => !item || hero.equipped[slot]?.id === item.id),
    `${Object.values(hero.equipped).filter(Boolean).length} items still equipped`);
  check('and what they carried is put away',
    profile.materials.length === materialsBefore + carried.length
    && carried.every((c) => profile.materials.some((i) => i.id === c.id)),
    `${materialsBefore} -> ${profile.materials.length}, carried ${carried.length}`);
  check('the report lists what was gained',
    summary.gained.length === carried.length, `${summary.gained.length} of ${carried.length}`);
  check('and nothing was reported lost', summary.lost.length === 0, String(summary.lost.length));
}

// --- What "lost" means for a hero who simply ran out of clock ---------------
// A hero who is killed has their loss recorded when the corpse is stripped,
// and that path has always excluded the wooden kit. A hero still standing
// when the clock stops was going through a second, hand-written copy of the
// same rule that had drifted: it listed the camp kit — which the camp hands
// straight back, so a squad that timed out read as having lost eight things
// each — and it left out the belt, which they do lose.
//
// The report is built on a raid stopped early rather than one run to the
// clock. Whether a seeded squad is alive at 30:00 is the difficulty curve
// talking, and the first version of this check drew a seed where all three
// died: `stranded` came out empty and every assertion under it passed on an
// empty list. Stopping the raid while everyone is standing exercises the
// path on purpose.
{
  const profile = newProfile(2026);
  const carved = [];
  for (const hero of profile.roster) {
    hero.level = 8;
    // One real piece each, so the check is that wooden is filtered rather
    // than that the list came out empty.
    const item = craftItem({
      speciesId: 'threshclaw', partType: 'hide', slot: 'chest', quality: 'sound',
    });
    hero.equipped.chest = item;
    carved.push(item.id);
    hero.consumables = [makeConsumable('minor_potion', 2)];
  }

  const match = new Match({
    seed: 2026,
    playerSquad: {
      id: 'player', name: 'Yours', isPlayer: true,
      heroes: squadHeroes(profile), tactics: profile.squadTactics,
    },
    botSquads: generateBotSquads(2026, 5, 3),
  });
  for (let i = 0; i < 60; i++) match.update(TICK);
  const result = match.buildResult();

  const stranded = result.heroes.filter((h) => !h.extracted && h.alive);
  check('the fixture leaves heroes on the field, not corpses',
    stranded.length === 3, `${stranded.length} of ${result.heroes.length} still standing`);

  const wooden = stranded.flatMap((h) => h.lost.filter((i) => i?.wooden));
  check('a hero who never reached an exit does not "lose" their camp kit',
    stranded.length > 0 && wooden.length === 0,
    wooden.map((i) => i.name).join(', ') || 'none listed');
  check('but the carved piece they were wearing is lost',
    stranded.length > 0 && stranded.every((h) => h.lost.some((i) => carved.includes(i.id))),
    stranded.map((h) => `${h.lost.length} items`).join(', '));
  check('and so is the belt, which the camp does not hand back',
    stranded.length > 0 && stranded.every((h) => h.lost.some((i) => i?.kind === 'consumable')),
    stranded.map((h) => h.lost.filter((i) => i?.kind === 'consumable').length).join(','));
}

// --- Progression across several raids --------------------------------------
{
  const profile = newProfile(4242);
  const startLevels = profile.roster.map((h) => h.level);
  let extractedOnce = false;
  let lostGearOnce = false;

  for (let i = 0; i < 6; i++) {
    const before = profile.materials.length + profile.stash.length;
    const result = runRaid(4242 + i, profile);
    const summary = applyMatchResult(profile, result);

    if (result.heroes.some((h) => h.extracted)) extractedOnce = true;
    for (const h of result.heroes) {
      if (h.extracted) continue;
      const hero = profile.roster.find((x) => x.id === h.heroId);
      const kept = Object.values(hero.equipped).filter((it) => it && !it.wooden).length;
      if (h.lost.length > 0) {
        lostGearOnce = true;
        check(`raid ${i}: ${hero.name} died and came back in wooden gear`,
          kept === 0 && Object.values(hero.equipped).every((it) => it?.wooden),
          `${kept} carved pieces still worn`);
      }
    }
    // This used to read `gained === 0 || stash > before || stash >= before`,
    // whose last clause is true unless the stash shrinks — so it could not
    // fail. What it meant to say is that what the player holds grew by exactly
    // what the extracted heroes brought back and by nothing else.
    //
    // It is an equality now rather than a `Math.min` against STASH_LIMIT.
    // Carves are uncapped, so a hunt's haul cannot be silently dropped on the
    // floor any more — which it was, once a shared 120-item stash filled with
    // material after about six raids.
    const broughtBack = result.heroes
      .filter((h) => h.extracted)
      .reduce((n, h) => n + h.kept.length, 0);
    const held = profile.materials.length + profile.stash.length;
    check(`raid ${i}: everything that came home was kept`,
      held === before + summary.gained.length && summary.gained.length === broughtBack,
      `${before} -> ${held}, ${summary.gained.length} gained of ${broughtBack} carried`);
  }

  // Reported, not asserted, for the same reason as the line below it: whether
  // a starter squad gets anybody out in six seeded raids is the difficulty
  // curve talking, not these rules. Measured across five seed bases it came
  // out at 1, 2, 3, 4 and 5 raids in six, so a build that never extracts on
  // one base is inside the ordinary spread rather than a regression. The rule
  // itself is asserted directly against `applyMatchResult` above, and that a
  // squad *can* be got out on demand is what `test-extraction.js` measures.
  console.log(`      (a raid ended in an extraction: ${extractedOnce ? 'yes' : 'no'})`);
  // Reported for interest, not asserted. Whether anybody dies in six seeded
  // raids is a property of the difficulty curve, not of this rule — removing
  // the map's obstacles was enough to make every squad come home — so the
  // rule itself is tested directly below.
  console.log(`      (a death cost somebody their gear in these raids: ${lostGearOnce ? 'yes' : 'no'})`);
  check('heroes gained levels over six raids',
    profile.roster.some((h, i) => h.level > startLevels[i]),
    profile.roster.map((h) => `${h.name} L${h.level}`).join(', '));
  check('history recorded every raid', profile.history.length === 6, `${profile.history.length} entries`);
  check('no hero holds skill points it did not earn',
    profile.roster.every((h) => {
      const spent = Object.entries(h.alloc).reduce((s, [, r]) => s + r, 0);
      return spent <= h.level;
    }));
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
