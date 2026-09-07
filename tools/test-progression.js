#!/usr/bin/env node
// Checks the loop that ties raids back to the profile: XP, levels, loot into
// the stash, and gear actually being lost when a hero does not extract.

import { Match, TICK } from '../src/sim/match.js';
import { newProfile, squadHeroes, applyMatchResult, STASH_LIMIT } from '../src/game/profile.js';
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
  const worn = Object.values(hero.equipped).filter(Boolean);
  const carried = [profile.stash[3], profile.stash[4]].filter(Boolean);
  const stashBefore = profile.stash.length;

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

  check('a hero who did not extract is stripped of everything worn',
    Object.values(hero.equipped).every((i) => !i),
    `${Object.values(hero.equipped).filter(Boolean).length} items still equipped`);
  check('and their belt is emptied', hero.consumables.length === 0);
  check('the report lists what was lost',
    summary.lost.length === worn.length + carried.length,
    `${summary.lost.length} of ${worn.length + carried.length}`);
  check('none of it reaches the stash',
    profile.stash.length === stashBefore
    && !profile.stash.some((i) => worn.some((w) => w.id === i.id)),
    `${stashBefore} -> ${profile.stash.length}`);
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
  const carried = [profile.stash[3], profile.stash[4]].filter(Boolean);
  const stashBefore = profile.stash.length;

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
  check('and what they carried reaches the stash',
    profile.stash.length === stashBefore + carried.length
    && carried.every((c) => profile.stash.some((i) => i.id === c.id)),
    `${stashBefore} -> ${profile.stash.length}, carried ${carried.length}`);
  check('the report lists what was gained',
    summary.gained.length === carried.length, `${summary.gained.length} of ${carried.length}`);
  check('and nothing was reported lost', summary.lost.length === 0, String(summary.lost.length));
}

// --- Progression across several raids --------------------------------------
{
  const profile = newProfile(4242);
  const startLevels = profile.roster.map((h) => h.level);
  let extractedOnce = false;
  let lostGearOnce = false;

  for (let i = 0; i < 6; i++) {
    const before = profile.stash.length;
    const result = runRaid(4242 + i, profile);
    const summary = applyMatchResult(profile, result);

    if (result.heroes.some((h) => h.extracted)) extractedOnce = true;
    for (const h of result.heroes) {
      if (h.extracted) continue;
      const hero = profile.roster.find((x) => x.id === h.heroId);
      const stillWearing = Object.values(hero.equipped).filter(Boolean).length;
      if (h.lost.length > 0) {
        lostGearOnce = true;
        check(`raid ${i}: ${hero.name} died stripped of gear`, stillWearing === 0, `${stillWearing} items still equipped`);
      }
    }
    // This used to read `gained === 0 || stash > before || stash >= before`,
    // whose last clause is true unless the stash shrinks — so it could not
    // fail. What it meant to say is that the stash grew by exactly what the
    // extracted heroes brought back and by nothing else.
    const broughtBack = result.heroes
      .filter((h) => h.extracted)
      .reduce((n, h) => n + h.kept.length, 0);
    check(`raid ${i}: the stash grew by exactly what came home`,
      profile.stash.length === Math.min(STASH_LIMIT, before + summary.gained.length)
      && summary.gained.length <= broughtBack,
      `${before} -> ${profile.stash.length}, ${summary.gained.length} gained of ${broughtBack} carried`);
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
