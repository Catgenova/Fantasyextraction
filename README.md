# Ashenveil

A browser-based **PvPvE extraction hunting autobattler**.

You do not control heroes in a fight. Between raids you pick three of them,
forge their gear, spend their skill points, slot their spells, and write the
tactics they will fight by. Then you drop into a 30-minute raid you can steer
but not micromanage — hunt the things that live there, carve what you kill, and
get out. Everything they are wearing is at risk until they extract, and so is
every other squad on the map.

## Running it

There is no build step and no dependencies. Any static file server works:

```bash
npm start          # http-server on :8080
# or
python3 -m http.server 8080
```

Then open <http://localhost:8080>. Progress is saved to `localStorage`.

## The loop

1. **Camp** — choose a squad of three, take your carved parts to the
   blacksmith, move forged gear between the stash and your heroes, allocate
   skill points, slot spells, and set tactics.
2. **Raid** — land at one of twelve zones, pick your fights, and reach one of
   three extraction points before the 30-minute timer runs out.
3. **Carve** — nothing on this map drops equipment. Kills leave a corpse, and a
   corpse has to be carved before it rots. What you carve out is what you
   extract with.
4. **After-action** — anything an extracted hero carried goes into the stash.
   Anything a dead hero carried *or was wearing* is gone.
5. **Forge** — the blacksmith turns parts into equipment. Which species and
   which part decide what the piece does; the grade of the parts decides how
   much of it there is.
6. **Trophies** — the first time your squad takes a solo monster you earn its
   trophy, which unlocks a hero class and recruits someone to play it.

There is no rarity ladder and no random affixes. A piece of gear is a species,
a part and a grade, and all three are things you went and got.

## Choosing a fight

Three kinds of fight are on the map, and they are a real choice rather than a
difficulty slider.

| Hunt | What it is | Pays |
|---|---|---|
| **Small pack** | A few of one small species | One or two carves each, at the grade they died at |
| **Large pack** | The same species in greater numbers | The same parts, more of them |
| **Solo monster** | One of the ten large creatures, alone in its ground | Four to six carves, and two grades of bias upward |

Packs are sized by threat rather than headcount — `PACK_BUDGET` in
`src/sim/match.js` spends a points budget per ring, so a camp of Skiterlings is
numerous and a camp of Bonereavers is not. Sizing by headcount instead is what
put nineteen Skiterlings on a starter squad and wiped it in sixty seconds.

Other squads are hunting the same ground. Nothing about picking a fight makes
you safe from them, and a squad that has just finished a solo monster is the
best thing on the map to rob.

## Hunting something in particular

The smith works in fives, so wanting a *specific* species is the normal state
of a player who has decided what to build. A **hunt order** is how you say so:
pick a species and a pack size, and the squad goes and finds one.

It is a standing order, not a destination. Clearing the pack it sent them to is
the order being obeyed once, not finished — the squad moves to the next site of
the same species, and keeps doing that until you call it off.

A hunt order also decides what the squad *ignores*. Anything of the wrong
species further than 260 units away is walked past; anything closer, and
anything that has already drawn blood, is a fight whether the order likes it or
not. That band is the whole feature. Tuned over twelve seeds hunting a mid-ring
species, quarry carves and total carves came to 68/256 at 260 units, 49/213 at
420 and 9/176 at 640 — a squad that stops for everything within sight neither
hunts nor farms, because the fights it picks up on the way are the ones that
get it killed.

Ordered against unordered, at matched seeds, the squad carves its quarry about
four times as often and comes home with roughly 44% of the parts it would have
gathered indiscriminately. That is the trade the order is: depth for breadth.

### Where the order comes from

**In camp**, you pick from the **journal** — every species you have ever killed
or carved, which is what the game remembers you knowing. A new profile knows
the two creatures its starting parts came off and nothing else.

**In the raid**, the **Hunt** panel lists this map's own fauna, grouped by ring
and marked with the distance to the nearest site. Every row on it is a hunt the
squad can actually walk to.

The two lists differ because a raid draws about a dozen of the fifty species,
so a camp order can name something this map does not hold. When that happens it
is dropped as you land, with a line in the raid log saying so, and you pick
again from what is actually out there.

That split is the second design of this system, and the first one is worth
recording because it sounded better. Originally an order could name anything in
the journal and the squad went *looking* — searching the ring that species
lives in, camp by camp, learning the map as it went. It played badly. A journal
remembers everything you have met and a map holds a dozen, so two orders in
three named something that was not there; over twelve seeds a mid-ring order
carved the quarry in three raids of twelve and halved the total haul, 558
carves down to 258. Making the map honest about its own contents fixed it: the
same measurement went to eight raids in twelve and 353% more of the quarry.

## The fauna

A raid has a fauna rather than the whole bestiary. Each ring draws a few of the
species that live in it, and every camp in that ring is one of them — nine to
fourteen species a map, four to eleven camps each.

This is what makes a hunt order answerable at all. Spreading forty species over
seventy camps gave a species three camps if it was lucky and often no large
pack whatsoever, so a third of the list named something that did not exist. The
draw is sized by how many camps a ring actually has (`FAUNA_PER_RING` and
`CAMPS_PER_SPECIES` in `src/sim/map.js`) rather than being a flat number, which
is what guarantees the invariant instead of merely making it likely: an earlier
version insisted on at least three species per ring and one map in forty still
had a species down to a single camp. Across a hundred maps there is now no
species with fewer than four camps and no hunt that cannot be answered.

It also makes maps differ from each other, which forty-species-everywhere never
did. What lives here is a fact about this raid, and worth knowing.

## Carving

A corpse is worth stopping for and stopping is the cost. Carving takes 1.5
seconds a pull on a small creature and 4 on a large one, so a solo monster is
sixteen to twenty-four seconds spent standing still in the place you just made
a lot of noise. Corpses last 100 seconds, which is long enough to finish a
fight first and not long enough to come back later.

What comes out is a **part**: a species, one of ten types, and a grade.

| Part | Fits |
|---|---|
| Hide | Chest, legs, hands, head, pouch |
| Scale | Chest, legs, head, offhand |
| Plate | Chest, head, hands, offhand |
| Claw | Weapon, hands |
| Fang | Weapon, trinket |
| Horn | Head, weapon |
| Tail | Weapon, offhand |
| Membrane | Legs, hands, offhand, pouch |
| Gland | Trinket, offhand |
| Marrow | Trinket |

| Grade | Power |
|---|---|
| Ragged | ×1.00 |
| Sound | ×1.28 |
| Fine | ×1.62 |
| Pristine | ×2.10 |
| Mythic | ×2.80 |

Solo monsters carve at a two-grade bias, which is most of why they are worth
the risk: a pristine part off a pack is luck, off a large creature it is
roughly what you expected.

## The blacksmith

Parts in, equipment out. A recipe is a species, a part type and a slot, and it
costs two or three parts depending on the slot — three for a weapon or chest,
two for everything else.

**A piece comes out at the grade of the worst part that went into it.** That
one rule is what makes a pile of ragged parts worth carrying and a single
mythic claw worth nothing on its own. The smith reaches for the best parts it
has, so a pile of four with one ragged in it still forges sound.

What a piece *does* comes from the creature. `speciesAffinity` in
`src/data/gear.js` reads the creature's own stat block — a heavily armoured
thing makes armoured gear, a fast thing makes gear that grants speed — but
normalises it to a *shape* rather than a magnitude, dividing through by its own
mean and clamping the result. Skipping that step is a bug I shipped and had to
take back out: Nightfell has 16000 health, so unnormalised affinity made every
trinket in the game a vitality trinket.

The weapon slot gets a damage overlay on top of the shape, because a horn is a
piece of armour by every reading of the creature it came off and a horn club
still has to be a weapon. Without it a mythic horn weapon forged with 95 armour
and no damage.

Only weapons are bound to a class. Armour fits anyone — a Plateback cuirass
does not care who is in it.

## Sets

Wear enough of one creature and you start fighting like it. Every species
carries the set made from it, and the bonus echoes its **behaviour**: a
Sicklejaw set is speed and attack speed because a Sicklejaw hits and leaves; a
Thornback set is block and mitigation because a Thornback punishes contact.

| Pieces | You get |
|---|---|
| 3 | Half the set's modifiers |
| 5 | All of them, plus its squad aura |

Two thresholds rather than one make a set a ladder instead of a cliff, and
eight slots means a full set still leaves room for three pieces of something
else — which is where mixed builds live. The aura is the reward for the full
five specifically; leaking it at three would make the last two pieces
pointless.

## The bestiary

Forty small species that hunt in packs, ten large ones that hunt alone.

| Family | Species | What they are |
|---|---|---|
| Raptorial | 8 | Fast, light, and they arrive together |
| Wyverling | 6 | Winged; they open from above and disengage |
| Carapace | 6 | Slow and armoured; they hold ground |
| Venomite | 6 | Little damage up front and a lot afterwards |
| Delver | 6 | Burrowers; they are not where you last saw them |
| Mireborn | 4 | Control — grapples, slows, sticky ground |
| Carrionkin | 4 | They do better against a squad already hurt |

Twelve small species are outer-ring, seventeen mid, eleven core. The ten large
creatures run one outer (Bastionback), four mid, and five core, with Nightfell
at the centre of the map.

The thing that makes fifty species distinguishable without fifty special cases
is `src/data/behaviours.js`: twenty-five behaviour archetypes — swarm, harry,
flank, pounce, spitter, ambusher, burrower, screamer, bulwark, tailwhip, leech,
bomber, stalker, venomous, frenzy, retaliate, grapple, deathcloud, charger,
breath, slam, sunder, roar, divebomb, constrict — each a set of `hint` fields
the monster AI reads. A species picks one, and the same vocabulary names its
set bonus, so what a creature does in a fight and what its armour does for you
are the same word.

## Classes

Three are yours from the first raid. The other ten are earned — see
**Trophies** below.

| Class | Role | Power attribute | Shape | Unlocked by |
|---|---|---|---|---|
| **Knight** | Frontline | Might | Shield | — |
| **Archer** | Ranged DPS | Agility | Chevron | — |
| **Priest** | Support | Spirit | Disc | — |
| **Paladin** | Frontline support | Might | Shield | Bastionback |
| **Berserker** | Melee bruiser | Might | Spike | Tyrannoclast |
| **Necromancer** | Attrition caster | Spirit | Disc | Deepdelver |
| **Ice Mage** | Control caster | Spirit | Disc | Glaciermaw |
| **Warden** | Melee control | Might | Shield | Mirethane |
| **Fire Mage** | Burst caster | Spirit | Disc | Pyroclast |
| **Lightning Mage** | Sustained caster | Spirit | Disc | Stormcrest |
| **Rogue** | Melee burst | Agility | Chevron | Venomcoil |
| **Lancer** | Reach fighter | Might | Spike | Skyrender |
| **Slayer** | Elite hunter | Might | Spike | Nightfell |

Each has seven spells and a three-branch, four-tier skill tree whose nodes
grant passives, squad-wide auras, or unlock the five spells that are not
starters. Four spells can be slotted at a time.

None of the ten is a straight upgrade on a starter. The Berserker hits harder
than the Knight and dies faster for it; the Paladin mitigates less but heals
the squad; the Fire Mage does the most damage in the game and has the least
health to protect it. The Warden gives up damage entirely for snares and
grapples, and the Lancer trades armour for reach — it opens at 66 units, which
is further than any other melee class can start a fight.

Silhouettes are shared by role rather than unique per class — thirteen shapes
would be unreadable at raid zoom — so colour and the name label separate
classes within a role.

## Trophies

Ten solo monsters, ten trophies, one hero class each. It is the only way to get
a class: nothing here is bought, rolled for, or dropped, so a roster is a
readable record of what its owner has actually killed. The camp lists all ten,
and a locked row names the creature and the ring it is in, because a player who
wants a Necromancer needs to know what to go and kill for it.

| Ring | Creature | Trophy | Unlocks |
|---|---|---|---|
| Outer | Bastionback | Something That Would Not Fall | Paladin |
| Mid | Tyrannoclast | The Line It Chose | Berserker |
| Mid | Deepdelver | What Was Underneath | Necromancer |
| Mid | Glaciermaw | The Cold It Kept | Ice Mage |
| Mid | Mirethane | It Would Not Let Go | Warden |
| Core | Pyroclast | The Ground It Ruined | Fire Mage |
| Core | Stormcrest | It Never Once Landed | Lightning Mage |
| Core | Venomcoil | Patience, Applied | Rogue |
| Core | Skyrender | It Came Back Down | Lancer |
| Centre | Nightfell | The One That Was Choosing | Slayer |

The tiering doubles as the progression ladder. Bastionback is the one a fresh
squad can realistically take, and it pays for a fourth class; each deeper kill
opens something built for the ring after it. Each trophy also reads as a lesson
learned from the fight — the Warden comes off the thing that took a hero out of
the fight and dared the rest to hurry.

Two rules decide when a trophy is yours:

- **The kill is the achievement, not the extraction.** These are hard enough
  that dying on the way out with the trophy already earned is a fair trade —
  you still lose everything you were carrying, which is punishment enough.
- **Only your own kills count.** Rival squads kill far more of them than you
  do: across a dozen farming raids roughly ten die and none of them are yours.
  Crediting every death to the player would hand over most of the roster for
  work somebody else did.

Rival squads field the classes a player of their level plausibly has — the
unlockable ones only once they are deep enough to have killed the creature that
grants them. Seeing a Paladin means somebody put a Bastionback down.

## Tactics are the game

Swapping a hero in from the roster asks who they are replacing rather than
guessing. The guess used to be "whoever shares their class, else the last
slot", which with eleven classes meant every newcomer silently evicted
whoever stood in slot three. Replacing the leader clears the role, because who
walks point is a decision rather than something to inherit.

Before a raid you must name one hero **Leader**. It is not a default, because
everything about how the squad moves hangs off it: the leader walks the
navigation and the other two stay with the leader, closing in whenever they
drift. The leader slows to a crawl while anyone is trailing and turns back
outright if they fall a long way behind.

Your input during a raid is deliberately narrow: what to hunt, navigation, an
extract order, the speed control, your squad's packs, and the standing carve
orders. Everything else was decided in camp.

**Navigate** gives eight compass headings plus the core, the nearest hunting
ground, and the nearest extraction. A heading is open-ended — the squad marches
that way until the map runs out — while the landmarks are a single trip, after
which the raid plan resumes. Clicking the map still works too.

Packs are managed from the **Bags** panel mid-raid — equip what you find,
destroy what you don't want, hand something to a squadmate standing nearby,
and move found potions onto a hero's belt so they will actually drink them.
Discarding destroys outright rather than dropping — a hero standing over the
pile would only pick it straight back up — so it takes two taps to confirm. The
clock keeps running while it is open, so the panel carries its own pause.

The same panel carries the squad's **carve orders**: a minimum grade — anything
from *Keep everything* up to *Mythic only* — and a toggle for consumables. Both
are live, so the squad obeys the new order on its next carve rather than the
next raid, which matters because what is worth stopping for changes once bags
are filling and the walk to an exit is what is left. Late in a raid a squad
that will only stop for pristine cuts walks past most of the map. The floor
sits on top of each hero's own carve policy and the stricter of the two wins,
so an order can tighten a greedy hero but never loosens a picky one.

**Extract now** is a committed run. The squad walks through whatever is in the
way and takes the hits rather than stopping to fight, swinging at anything in
reach on the way past. It outranks retreating, regrouping and chasing, all of
which otherwise pull heroes off the door.

Corpses waiting to be carved are drawn in their species' colour, and anything
your squad will refuse — below the grade floor, or simply no room — is drawn
faded, so what still glows is what they are going to stop for. The **Legend**
button explains the map's markings.

**Per hero:** stance (aggressive / balanced / defensive / evasive), target
priority, carve filter, retreat threshold, potion threshold, focus fire, and a
per-spell policy (auto / emergency / hold).

**Per squad:** formation, raid plan (farm the ring, boss hunt, event chaser,
squad hunter), standing hunt order, extraction plan, leader, and whether to
engage rival squads.

Those settings are read directly by `src/sim/ai.js`, which is the interpreter
for them — there is no second, hidden set of rules.

## Carrying it out

An extraction game is decided by how much you can carry, so pack size is a
piece of gear rather than a constant. Every hero carries eight; the **pouch**
slot adds to that, and is worth nothing in a fight and everything on the way
home:

| Pouch grade | Extra slots | Carried |
|---|---|---|
| None | — | 8 |
| Ragged | +4 | 12 |
| Sound | +8 | 16 |
| Fine | +12 | 20 |
| Pristine | +16 | 24 |
| Mythic | +20 | 28 |

Pouches are forged like everything else, from hide or membrane, so a bigger bag
is a hunt rather than a drop. Every hero starts in a ragged one, and nobody is
ever left unable to carve.

Because a pouch has no stat block, the AI's item scoring counts its capacity
directly; otherwise the best item in the game would score zero and squads would
walk straight past it. Swapping down into a smaller pouch than the pack is
holding is refused rather than silently binning the overflow.

Consumables are carried separately, on a three-slot **belt**, and that is the
only place the tactics AI will drink from. So a potion found in a supply cache
goes to the belt first and falls back to the pack only when the belt is full.
Belt stacks are capped per consumable: treating a matching stack as infinite
room made every potion on the map look takeable and pushed squads from 3.2% of
the raid in loot mode to 6.9%, all of it spent detouring for potions they could
not hold.

## The map

14000×14000 units, three concentric danger rings, twelve landing zones on the
outer ring, and three extraction points on staggered windows (opening at 3, 7
and 11 minutes; closing at 26, 28 and 30). Enemy camps stream in around
whichever squads are nearby, each one a named species in a pack of a known
size.

Nine solo hunting grounds are fixed, at radii from 5200 units out down to 1000,
and Nightfell wakes at the exact centre at 18 minutes. The radii double as
difficulty signposting: Bastionback at 5200 is the one a fresh squad can take,
and Skyrender at 1000 is the end of a long raid. Grounds are placed at least
1500 units apart and well clear of every landing zone, so pulling one is never
pulling two and nobody is greeted by a large creature on the drop. From 25
minutes the map collapses inward — the final safe circle still contains every
exit, so it squeezes you toward them rather than deleting them.

A large creature only spawns once a squad comes within 1500 units of its
ground, so a raid you spend in the outer ring never pays for the core's
population.

**The map currently generates no obstacles.** Rocks and ruins are switched off
at `OBSTACLE_CLUSTERS` in `src/sim/map.js` — everything that reads them still
works, there is simply nothing to read — so raids are fought on open ground.
It costs some of the map's character and makes the outer ring safer still, but
it removes the one movement problem this project has never properly solved:
heroes stuck with somewhere to be fall from 8.3% of the time to 1.2%, the
worst pin from 253 seconds to 18, and the sim gets about 30% cheaper per tick.
Set the constant back to 420 to bring them back.

Landing zones are safe ground for the first 90 seconds; nobody gets
spawn-camped out of a raid.

## Layout

```
src/
  core/      seeded rng, vector maths
  data/      classes, spells, skill trees, consumables, tactics, and the
             hunt: creatures, behaviours, parts, gear, sets, hunt orders —
             all plain data
  sim/       stats, combat, entities, map generation, the tactics AI,
             hero records, bot squads, and the Match instance
  game/      the persistent player profile and the blacksmith
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
node tools/test-bestiary.js
node tools/test-smith.js
node tools/test-hunt.js
node tools/test-extraction.js
node tools/test-achievements.js
node tools/test-bags.mjs        # needs Playwright; skips if absent
node tools/test-navigation.mjs  # needs Playwright; skips if absent
node tools/test-layout.mjs      # needs Playwright; skips if absent
node tools/test-unlocks.mjs     # needs Playwright; skips if absent
node tools/test-forge.mjs       # needs Playwright; skips if absent
node tools/test-huntpad.mjs     # needs Playwright; skips if absent
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

`test-bestiary.js` covers the fifty species as data: every one has a behaviour
the AI implements, parts that map to slots, and a set whose modifiers are the
shape its blurb claims. It also checks that threat rises with ring depth, and
it measures threat as health × damage per second rather than damage per hit —
the first version compared damage alone and failed on Thornback, which
deliberately hits for less than a tier-0 Sandlurker and survives far longer.

`test-smith.js` covers the forge arithmetic, and the rule it exists for is that
a piece comes out at the grade of the *worst* part in it. That is the one thing
a player is told before spending something they cannot get back, so the test
asserts it from both ends: a mixed pile comes out at its weakest, and one great
carve among poor ones does not lift the piece. It also proves the two set
thresholds are a ladder — the full bonus is exactly twice the half — and that
the squad aura arrives only at five.

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

`test-hunt.js` covers hunt orders, and the last section of it is the reason the
file exists. Everything structural about the first version of this system
passed — orders resolved, sites matched, the journal recorded — while the
feature delivered almost nothing, so the file ends by running whole raids with
and without an order at matched seeds and comparing what came home. It also
asserts the map invariant the whole system rests on across a hundred maps: no
species with fewer than four camps, and no hunt on the list that has nowhere to
go.

`test-huntpad.mjs` is the browser half: the camp's picker offers exactly what
the journal remembers and grows as the squad meets things, a pack species
offers both sizes and a solo creature offers neither, and an order given from
the in-raid panel reaches the squad rather than only lighting up a button. It
reads the live squad through `window.__ashenveil`, because a DOM-only check can
tell that a button turned gold and not that anything happened.

`test-forge.mjs` is the browser half of the smith. Forging cannot be undone, so
most of what it checks are the guard rails rather than the arithmetic: a recipe
quotes its grade and its cost before anything is spent, the first tap only arms
the button, an armed button that is never confirmed — including one abandoned
by leaving the screen — keeps the parts, and a recipe that can no longer be
afforded stops being offered instead of lying. Both bugs it is written against
were injected and confirmed to fail it.

`test-layout.mjs` serves the game and checks it at eleven viewport sizes, from
a small phone up to a desktop. The game runs a fixed-height shell on desktop
(panels scroll inside themselves) and an ordinary scrolling document
everywhere else; putting the boundary between those in the wrong place makes
the bottom of a screen silently unreachable, which no unit test would catch.
It also asserts the raid stays pinned and that no two HUD panels overlap.

It scrolls with a synthesized touch drag, and that detail is the whole point.
`overflow: hidden` still permits `scrollTo` and `scrollIntoView` — it refuses
only the user — so an earlier version of this test scrolled a camp screen that
no finger could move and reported it healthy three times running. The root
element had kept an `overflow: hidden` from the desktop shell, which meant the
viewport never took the body's `auto` and roughly 2000px of camp sat below an
unreachable fold. Scroll the way a player does, or the check proves nothing.
Playwright has no swipe and its `Input.synthesizeScrollGesture` moved nothing
in this headless build (verified against a plain 5000px page), so the touch
stream is dispatched by hand over CDP.

Raids are deterministic from their seed, so any run the harness reports can be
reproduced exactly.

## Current balance

Measured with `tools/simulate.js` at seed 300, both sides fully built —
level-appropriate gear and a spent skill tree — against five rival squads, and
with no hunt order set:

| Raid plan | Level | Runs | Clean | Partial | Wiped | Avg parts kept | Solo kills |
|---|---|---|---|---|---|---|---|
| Farm the ring | 5 | 12 | 6 | 3 | 3 | 22.0 | 0.17 |
| Solo hunt | 5 | 8 | 0 | 2 | 6 | 3.0 | 0.13 |
| Solo hunt | 14 | 8 | 0 | 5 | 3 | 10.4 | 2.63 |
| Squad hunter | 10 | 8 | 8 | 0 | 0 | 48.0 | 2.13 |

That spread is the intent: farming packs is a reliable income, and the solo
monsters are a place you earn the right to visit. A level-5 solo hunt wipes six
times in eight and brings home three parts; the same plan at 14 kills 2.63 of
them a raid.

Drawing a fauna per map rather than sprinkling forty species over seventy camps
moved this a little, and not in the direction it looks. Farming at level 5
reads worse than before (6/3/3 against 8/3/1) purely because seed 300 happens
to draw a harsh outer ring — over eight seeds at 500 the same change went 2/3/3
to 5/1/2 and the haul from 16.5 parts to 24.0. A map now has a character, which
means some maps are harder than others; that is the point of the change rather
than a cost of it.

The carve economy still reads better than the old loot economy. A farming run
comes home with 22 parts, but those parts are a handful of species — enough to
forge two or three pieces of one set rather than a stash of unrelated singles.
Hunting rival squads pays best of all at 48, because a squad you kill is a
squad that was already carrying.

## Status

Everything above is implemented and playable. Rival squads are bots built from
the same hero records and driven by the same tactics AI as the player's squad,
which is what makes robbing one meaningful — they are wearing gear somebody
forged.

What the hunt loop still owes the player: **sets are easier to talk about than
to assemble.** Five pieces of one species means five parts of the right types
off the same creature, and while the camp now tells you which set you are
closest to, nothing yet helps you see it from inside a raid or plan which
carves you actually still need.

The known weak spot is steering, and it is currently dormant rather than fixed:
the map generates no obstacles, so there is nothing to wedge against. With
rocks on the map heroes still jam — two of them from opposing squads caught in
the same notch, each at the exact separation distance, neither able to leave.
The escape machinery widens its detour on every failed attempt, which took the
worst observed case over ninety raids from 995 seconds pinned to 40, but the
real fix is a proper character controller rather than steering forces plus
collision resolution. That is the work to do before the obstacles come back.
See the note above `obstaclesNear` in `src/sim/map.js`.
