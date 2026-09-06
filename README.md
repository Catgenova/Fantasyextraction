# Ashenveil

A browser-based **PvPvE extraction looter autobattler**.

You do not control heroes in a fight. Between raids you pick three of them,
gear them, spend their skill points, slot their spells, and write the tactics
they will fight by. Then you drop into a 30-minute raid you can steer but not
micromanage — and everything they are wearing is at risk until they extract.

## Running it

There is no build step and no dependencies. Any static file server works:

```bash
npm start          # http-server on :8080
# or
python3 -m http.server 8080
```

Then open <http://localhost:8080>. Progress is saved to `localStorage`.

## The loop

1. **Camp** — choose a squad of three, move gear between the stash and your
   heroes, allocate skill points, slot spells, and set tactics.
2. **Raid** — land at one of twelve zones, fight through a very large map, and
   reach one of three extraction points before the 30-minute timer runs out.
3. **After-action** — anything an extracted hero carried goes into the stash.
   Anything a dead hero carried *or was wearing* is gone, and drops on the
   field for whoever killed them.

## Classes

| Class | Role | Power attribute | Shape |
|---|---|---|---|
| **Knight** | Frontline | Might | Shield |
| **Archer** | Ranged DPS | Agility | Chevron |
| **Priest** | Support | Spirit | Disc |

Each has a three-branch, four-tier skill tree whose nodes grant passives,
squad-wide auras, or unlock spells. Four spells can be slotted at a time.

## Tactics are the game

Your input during a raid is deliberately narrow: a move order, an extract
order, and the speed control. Everything else was decided in camp.

**Per hero:** stance (aggressive / balanced / defensive / evasive), target
priority, loot filter, retreat threshold, potion threshold, focus fire, and a
per-spell policy (auto / emergency / hold).

**Per squad:** formation, raid plan (farm, boss hunt, event chaser, squad
hunter), extraction plan, leader, and whether to engage rival squads.

Those settings are read directly by `src/sim/ai.js`, which is the interpreter
for them — there is no second, hidden set of rules.

## The map

14000×14000 units, three concentric danger rings, twelve landing zones on the
outer ring, and three extraction points on staggered windows (opening at 3, 7
and 11 minutes; closing at 26, 28 and 30). Enemy camps stream in around
whichever squads are nearby. Two boss arenas are fixed; an apex boss wakes at
the centre at 18 minutes. From 25 minutes the map collapses inward — the final
safe circle still contains every exit, so it squeezes you toward them rather
than deleting them.

Landing zones are safe ground for the first 90 seconds; nobody gets
spawn-camped out of a raid.

## Layout

```
src/
  core/      seeded rng, vector maths
  data/      classes, gear, spells, skill trees, consumables, enemies,
             loot tables, tactics — all plain data
  sim/       stats, combat, entities, map generation, the tactics AI,
             hero records, bot squads, and the Match instance
  game/      the persistent player profile
  ui/        canvas renderer, DOM helpers, and the screens
tools/       headless harnesses (see below)
```

The simulation has no dependency on the DOM. `tools/` drives it directly.

## Tools

```bash
node tools/simulate.js 8 --seed 300 --plan farm --level 5
node tools/simulate.js 5 --plan boss --level 14 --verbose
node tools/test-progression.js
node tools/test-loot.js
node tools/test-layout.mjs      # needs Playwright; skips if absent
```

`simulate.js` runs whole raids headless and reports outcomes — the fastest way
to check a balance change. It gives the player level-appropriate gear and a
spent skill tree by default, so a run is a fair comparison against the rival
squads rather than a half-built squad against fully-built ones; pass
`--starter-gear` to test the level-1 kit instead. `test-progression.js` asserts the parts that tie a
raid back to the profile: determinism, XP and levelling, loot reaching the
stash, and gear actually being lost on death.

`test-loot.js` guards the squad's loot behaviour. A squad could once commit to
a pile it was physically unable to lift — the squad-level filter asked whether
a hero's policy *wanted* an item but never whether they had room — and then
stand on it for the rest of the raid. Nothing crashed; the squad just stopped
playing. So the test measures behaviour: how long is spent in loot mode, and
whether that time produces pickups.

`test-layout.mjs` serves the game and checks it at eleven viewport sizes, from
a small phone up to a desktop. The game runs a fixed-height shell on desktop
(panels scroll inside themselves) and an ordinary scrolling document
everywhere else; putting the boundary between those in the wrong place makes
the bottom of a screen silently unreachable, which no unit test would catch.
It also asserts the raid stays pinned and that no two HUD panels overlap.

Raids are deterministic from their seed, so any run the harness reports can be
reproduced exactly.

## Current balance

Measured with `tools/simulate.js`, both sides fully built — level-appropriate
gear and a spent skill tree — against five rival squads:

| Raid plan | Level | Runs | Clean | Partial | Wiped | Avg items kept |
|---|---|---|---|---|---|---|
| Farm the ring | 5 | 12 | 8 | 2 | 2 | 8.8 |
| Boss hunt | 5 | 8 | 1 | 1 | 6 | 3.6 |
| Boss hunt | 14 | 8 | 4 | 2 | 2 | 12.1 |
| Squad hunter | 10 | 8 | 3 | 2 | 3 | 9.4 |

That spread is the intent: farming is a reliable income, and the core is a
place you earn the right to visit. Boss hunting at level 5 wipes three quarters
of the time and turns into the best haul in the game once you are geared for
it.

Known soft spot: actual boss kills are still rare (0.1–0.6 per raid even on the
boss plan) because squads tend to die to the core trash on the way in. The
plans differentiate well; the bosses themselves could stand to be more
reachable.

## Status

Everything above is implemented and playable. Rival squads are bots built from
the same hero records and driven by the same tactics AI as the player's squad,
which is what makes looting one meaningful — they are wearing real gear.
