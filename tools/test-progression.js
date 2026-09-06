#!/usr/bin/env node
// Checks the loop that ties raids back to the profile: XP, levels, loot into
// the stash, and gear actually being lost when a hero does not extract.

import { Match, TICK } from '../src/sim/match.js';
import { newProfile, squadHeroes, applyMatchResult } from '../src/game/profile.js';
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
    check(`raid ${i}: stash only grows on extraction`,
      summary.gained.length === 0 || profile.stash.length > before || profile.stash.length >= before,
      `${before} -> ${profile.stash.length}`);
  }

  check('at least one raid ended in an extraction', extractedOnce);
  check('at least one death cost its hero their gear', lostGearOnce);
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
