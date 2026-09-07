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
4. **Trophies** — the first time your squad kills a boss you earn its trophy,
   which unlocks a hero class and recruits someone to play it.
5. **Salvage** — stash space is finite, so gear you do not want breaks down
   into **Scrap**. What a piece is worth scales with its rarity, from 5 for a
   common to 180 for a legendary, plus 5% per item level. Scrap is the
   currency repairs will be paid in.

## Classes

Three are yours from the first raid. The other eight are earned — see
**Trophies** below.

| Class | Role | Power attribute | Shape | Unlocked by |
|---|---|---|---|---|
| **Knight** | Frontline | Might | Shield | — |
| **Archer** | Ranged DPS | Agility | Chevron | — |
| **Priest** | Support | Spirit | Disc | — |
| **Rogue** | Melee burst | Agility | Chevron | The Quiet Knife |
| **Berserker** | Melee bruiser | Might | Spike | Grendrak the Unbroken |
| **Necromancer** | Attrition caster | Spirit | Disc | Gravemaw, the Bonefather |
| **Ice Mage** | Control caster | Spirit | Disc | Hoarfrost, the Still Winter |
| **Fire Mage** | Burst caster | Spirit | Disc | Emberjaw, the Kiln Wyrm |
| **Lightning Mage** | Sustained caster | Spirit | Disc | Ashenveil, the Hollow Choir |
| **Slayer** | Elite hunter | Might | Spike | Malgareth, the Rent Veil |
| **Paladin** | Frontline support | Might | Shield | The Warden of the Seal |

Each has seven spells and a three-branch, four-tier skill tree whose nodes
grant passives, squad-wide auras, or unlock the five spells that are not
starters. Four spells can be slotted at a time.

None of the eight is a straight upgrade on a starter. The Berserker hits
harder than the Knight and dies faster for it; the Paladin mitigates less but
heals the squad; the Fire Mage does the most damage in the game and has the
least health to protect it. Silhouettes are shared by role rather than unique
per class — eleven shapes would be unreadable at raid zoom — so colour and the
name label separate classes within a role.

## Trophies

Eight bosses, eight trophies, one hero class each. It is the only way to get a
class: nothing here is bought, rolled for, or dropped, so a roster is a
readable record of what its owner has actually killed. The camp lists all
eight, and a locked row names the boss and the ring it is in, because a player
who wants a Necromancer needs to know what to go and kill for it.

| Ring | Boss | Unlocks |
|---|---|---|
| Outer | The Quiet Knife | Rogue |
| Mid | Grendrak the Unbroken | Berserker |
| Mid | Gravemaw, the Bonefather | Necromancer |
| Mid | Hoarfrost, the Still Winter | Ice Mage |
| Core | Emberjaw, the Kiln Wyrm | Fire Mage |
| Core | Ashenveil, the Hollow Choir | Lightning Mage |
| Core | Malgareth, the Rent Veil | Slayer |
| Centre | The Warden of the Seal | Paladin |

The tiering doubles as the progression ladder. The outer-ring boss is the one
a fresh squad can realistically take, and it pays for a fourth class; each
deeper kill opens something built for the ring after it.

Two rules decide when a trophy is yours:

- **The kill is the achievement, not the extraction.** Bosses are hard enough
  that dying on the way out with the trophy already earned is a fair trade —
  you still lose everything you were carrying, which is punishment enough.
- **Only your own kills count.** Rival squads kill far more bosses than you
  do: across a dozen farming raids roughly forty die and about one of them is
  yours. Crediting every boss death to the player would hand over most of the
  roster for work somebody else did.

Rival squads field the classes a player of their level plausibly has — the
unlockable ones only once they are deep enough to have killed the boss that
grants them. Seeing a Paladin means somebody put the Warden down.

## Tactics are the game

Before a raid you must name one hero **Leader**. It is not a default, because
everything about how the squad moves hangs off it: the leader walks the
navigation and the other two stay with the leader, closing in whenever they
drift. The leader slows to a crawl while anyone is trailing and turns back
outright if they fall a long way behind.

Your input during a raid is deliberately narrow: navigation, an extract order,
the speed control, your squad's packs, and the standing loot orders. Everything
else was decided in camp.

**Navigate** gives eight compass headings plus the core, the nearest boss
arena, and the nearest extraction. A heading is open-ended — the squad marches
that way until the map runs out — while the landmarks are a single trip, after
which the raid plan resumes. Clicking the map still works too.

Packs are managed from the **Bags** panel mid-raid — equip what you find,
destroy what you don't want, hand something to a squadmate standing nearby,
and move looted potions onto a hero's belt so they will actually drink them.
Discarding destroys outright rather than dropping — a hero standing over the
pile would only pick it straight back up — so it takes two taps to confirm. The
clock keeps running while it is open, so the panel carries its own pause.

The same panel carries the squad's **loot orders**: a minimum rarity and a
toggle for consumables. Both are live — the squad obeys the new order on its
next pickup, not the next raid — because what is worth stopping for changes
once bags are filling and the walk to an exit is what is left. The floor sits
on top of each hero's own loot policy and the stricter of the two wins, so an
order can tighten a greedy hero but never loosens a picky one.

**Extract now** is a committed run. The squad walks through whatever is in the
way and takes the hits rather than stopping to fight, swinging at anything in
reach on the way past. It outranks retreating, regrouping and chasing, all of
which otherwise pull heroes off the door.

Loot on the ground is colour-coded by rarity, and anything your squad will
refuse — filtered out by policy, or simply no room — is drawn faded, so what
still glows is what they are going to collect. The **Legend** button explains
the map's markings.

**Per hero:** stance (aggressive / balanced / defensive / evasive), target
priority, loot filter, retreat threshold, potion threshold, focus fire, and a
per-spell policy (auto / emergency / hold).

**Per squad:** formation, raid plan (farm, boss hunt, event chaser, squad
hunter), extraction plan, leader, and whether to engage rival squads.

Those settings are read directly by `src/sim/ai.js`, which is the interpreter
for them — there is no second, hidden set of rules.

## Carrying it out

An extraction game is decided by how much you can carry, so pack size is a
piece of gear rather than a constant. The **pouch** slot is worth nothing in a
fight and everything on the way home:

| Pouch | Pack slots |
|---|---|
| None | 2 |
| Common | 4 |
| Uncommon | 8 |
| Rare | 12 |
| Epic | 16 |
| Legendary | 20 |

Every hero starts in a common pouch. A legendary one is five times the haul,
which makes it the single most valuable drop in the game and the most painful
thing to die wearing — the sim bears that out, with a level-14 boss hunt
bringing home 5.0 items on the old fixed pack and 9.0 on a rare pouch.

Because a pouch has no stat block, the AI's item scoring counts its capacity
directly; otherwise the best item in the game would score zero and squads would
walk straight past it. Swapping down into a smaller pouch than the pack is
holding is refused rather than silently binning the overflow.

Consumables are carried separately, on a three-slot **belt**, and that is the
only place the tactics AI will drink from. So a potion picked up off the floor
goes to the belt first and falls back to the pack only when the belt is full.
Belt stacks are capped per consumable: treating a matching stack as infinite
room made every potion on the map look takeable and pushed squads from 3.2% of
the raid in loot mode to 6.9%, all of it spent detouring for potions they could
not hold.

## The map

14000×14000 units, three concentric danger rings, twelve landing zones on the
outer ring, and three extraction points on staggered windows (opening at 3, 7
and 11 minutes; closing at 26, 28 and 30). Enemy camps stream in around
whichever squads are nearby. Seven boss arenas are fixed, one per ring band
from 5200 units out down to 1200; an apex boss wakes at the centre at 18
minutes. Arenas are placed at least 1500 units apart and well clear of every
landing zone, so pulling one is never pulling two and nobody is greeted by a
boss on the drop. From 25 minutes the map collapses inward — the final safe
circle still contains every exit, so it squeezes you toward them rather than
deleting them.

A boss only spawns once a squad comes within 1500 units of its arena, so a
raid you spend in the outer ring never pays for the core's population.

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
node tools/test-movement.js
node tools/test-bags.mjs        # needs Playwright; skips if absent
node tools/test-navigation.mjs  # needs Playwright; skips if absent
node tools/test-extraction.js
node tools/test-layout.mjs      # needs Playwright; skips if absent
node tools/test-salvage.mjs     # needs Playwright; skips if absent
node tools/test-achievements.js
node tools/test-unlocks.mjs     # needs Playwright; skips if absent
node tools/test-pouches.js
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

`test-movement.js` guards the steering. Heroes used to walk straight at their
destination and let collision resolution push them back out of whatever they
hit, which against a rock is a closed loop — some spent entire raids pinned to
one spot. It measures ground actually covered, because the hardest case looks
fine to any simpler check: a hero wedged in a corner is running at full speed
and going nowhere.

`test-extraction.js` guards the priority order that makes "extract now" mean
it. That order is fragile — putting retreat, regrouping or chasing ahead of it
takes a squad from 77 seconds to reach a door to 306, or leaves them milling
outside one for twenty minutes.

`test-pouches.js` covers pack capacity, the squad loot filter and where a
found potion ends up. Most of it is edges: no pouch at all, swapping down into
a smaller one with a full pack, a handover that has to ask the *receiver's*
pouch, and the belt-then-pack fallback chain. It also proves the mid-raid loot
orders are a live reference — tightening the floor stops the squad on the next
pickup — and that doing so does not write back into what you set in camp.

`test-bags.mjs` drives the in-raid pack panel against a live match, because
equipping mid-raid has to rebuild a hero's stat block — gear feeds `baseMods`,
which is otherwise computed once at spawn.

`test-achievements.js` covers the trophy rules directly rather than inferring
them from a raid: only your own kill counts, the first kill grants and later
ones do not, a wipe after the kill keeps the trophy, and a save that predates
the feature neither bricks nor silently gains classes. It also builds a hero
of every class and spends its whole tree, because a class that unlocks and
then cannot be equipped is worse than one that stays locked.

`test-unlocks.mjs` is the browser half: the camp's trophy list, and an
unlocked class surviving the screens — eighteen tree nodes, its own starting
spells, gear it can actually wear, added to the squad, deployed.

`test-salvage.mjs` drives stash salvaging against a seeded stash holding one
piece of every rarity. Salvaging cannot be undone, so most of what it checks
are the guard rails rather than the arithmetic: the first tap only arms a
button, an armed button that is never confirmed keeps the item, consumables
are not offered at all, and the balance moves by exactly the number the row
promised.

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

| Raid plan | Level | Runs | Clean | Partial | Wiped | Avg items kept | Boss kills |
|---|---|---|---|---|---|---|---|
| Farm the ring | 5 | 12 | 7 | 4 | 1 | 7.9 | 0.75 |
| Boss hunt | 5 | 8 | 0 | 4 | 4 | 1.6 | 0.13 |
| Boss hunt | 14 | 8 | 1 | 3 | 4 | 9.0 | 4.63 |
| Squad hunter | 10 | 8 | 4 | 2 | 2 | 15.0 | 3.00 |

That spread is the intent: farming is a reliable income, and the core is a
place you earn the right to visit. Boss hunting at level 5 is close to
hopeless and turns into the best source of trophies in the game once you are
geared for it.

The old known soft spot — boss kills were rare, 0.1–0.6 a raid even on the
boss plan, because squads died to core trash on the way in — is fixed, and by
the class unlocks rather than by tuning. Seven arenas instead of two put a boss
within reach of the ring you are actually in, and a boss hunt now walks to the
deepest arena the squad is *ready* for rather than the deepest arena there is.
A geared boss hunt kills 4.4 a raid, up from 1.6 at the same seeds.

Adding five bosses and eight classes made the whole game harder, and the
numbers above are against a squad of the three starters — the classes you are
meant to be replacing by the time you can reach the core. At matched seeds
farming went from 10/1/1 to 7/4/1 and level-14 boss hunting from 0/5/3 to
1/3/4. Heroes also travel slower, 66.0 units per second alive to 57.4: four of
the eight new classes are melee, so squads crowd and jam each other more, and
there is more on the map worth stopping to fight.

Items kept now tracks the pouch rather than a fixed pack, which is the point of
the slot: the level-5 squad on a common pouch brings home 7.9, the level-10
squad on an uncommon one 15.0, and the level-14 boss hunt on a rare one 9.0
against the 5.0 it managed on the old fixed pack of eight.

## Status

Everything above is implemented and playable. Rival squads are bots built from
the same hero records and driven by the same tactics AI as the player's squad,
which is what makes looting one meaningful — they are wearing real gear.

Scrap accumulates but has nothing to spend it on yet: item repair is the next
thing to build on it.

The known weak spot is steering, not content. Heroes still occasionally jam —
two of them from opposing squads wedged in the same rock notch, each at the
exact separation distance, neither able to leave. The escape machinery now
widens its detour on every failed attempt, which took the worst observed case
over ninety raids from 995 seconds pinned to 40, but the real fix is a proper
character controller rather than steering forces plus collision resolution.
See the note above `obstaclesNear` in `src/sim/map.js`.
