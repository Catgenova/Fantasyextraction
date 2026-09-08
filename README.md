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

### Knowing which build you are on

The site is plain ES modules on GitHub Pages: no bundler, no content hashes, no
service worker, and no way to set cache headers. Pages serves everything with a
ten-minute max-age, so a tab left open across a deploy keeps running the old
build with nothing to say so. That is not hypothetical — a stash panel from two
commits ago turned up in a screenshot while the deploy log said success.

So every build carries an id, stamped into four places at once by
`tools/stamp-version.mjs`:

| Where | What it is for |
|---|---|
| `src/version.js` | compiled in, so it names the build you are *running* |
| `version.json` | fetched with `no-store`, so it names the build that is *deployed* |
| `index.html` `?v=` on the entry module | a new URL every build, so the entry is never the cached one |
| `index.html` `?v=` on the stylesheet | same, for the one other file loaded by URL |

The id is a UTC timestamp, not a commit SHA, because the stamp runs *before*
the commit it belongs to exists — a SHA there would always name the previous
commit, which is worse than useless on a page whose job is to tell you what you
are running.

The topbar shows the running id. When the deployed one moves past it, that
chip becomes a **New build — reload** button naming both. It checks on boot and
whenever the tab is looked at again, throttled to once a minute, and it never
interrupts a raid — a reload mid-raid throws the run away.

**What this does not do.** It does not hash every module URL, so it cannot
*guarantee* that a reload pulls a completely fresh graph: the entry is a new
URL every build, but its imports are revalidated by ETag rather than renamed,
which on Pages means fresh within the ten-minute window. Closing that last gap
needs content hashing, which needs a build step, which this project does not
have. What it does close is the failure that actually happens — the long-open
tab that has no idea it is out of date.

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
   Anything a dead hero carried *or was wearing* is gone, and they are re-kitted
   in wooden gear so the next raid is still possible.
5. **Forge** — the blacksmith turns parts into equipment. Which species and
   which part decide what the piece does; the grade of the parts decides how
   much of it there is.
6. **Trophies** — the first time your squad takes a solo monster you earn its
   trophy, which unlocks a hero class and recruits someone to play it.

There is no rarity ladder and no random affixes. A piece of gear is a species,
a part and a grade, and all three are things you went and got.

## Wooden gear

Nobody is ever naked. A new account starts in a full set of wooden kit, and a
hero who dies is re-issued one the moment they are back in camp.

It is not carved from anything, which is the point. Wooden gear has no species,
so it belongs to no set and counts toward no set bonus; it never drops when its
wearer is killed, because it is worth nothing to whoever killed them and would
otherwise litter every fight with satchels. It is not loot — it is what you have
instead of loot.

| Slot | Piece |
|---|---|
| Weapon | Wooden Sword |
| Off-hand | Wicker Shield |
| Head | Leather Cap |
| Chest | Padded Jerkin |
| Hands | Cloth Wraps |
| Legs | Rough Breeches |
| Trinket | Carved Token |
| Pouch | Woven Satchel — +2 slots, against +4 for the poorest sinew |

Every number says *replace me*. A wooden piece gets half the budget of a ragged
tier-0 carve, which is already the worst thing the smith can make, so the first
real piece forged in any slot is an obvious upgrade. That is a promise the tests
hold to literally: `test-smith.js` scores every craftable combination — every
species, every part, every grade — and asserts wooden loses to all of them in
all eight slots. A floor that only holds against the example you happened to
compare it with is not a floor.

The reason it exists is that death used to strip a hero to nothing, and a hero
wearing nothing cannot fight their way back to anything. One bad run ended the
account. Losing a raid should cost the raid.

### It is destroyed, never stored

Wooden gear only ever leaves a slot by being replaced, and the piece it
replaces is thrown away on the spot. There is no unequip: the camp row reads
*camp kit* and does nothing, and the in-raid Remove button is disabled.

That is not tidiness. A wooden piece is free, infinite, strictly better than an
empty slot and worth nothing to anyone, so every other destination for it is a
cost with no upside — a pack slot spent for the rest of a raid, a shelf slot
that `STASH_LIMIT` counts, an unequip that can only make a hero worse. And the
shelf was a one-way door: salvage refuses wooden gear, so anything wooden that
got onto it could never be taken off again.

It got onto it constantly. Taking an upgrade mid-raid pushed the wooden piece
it replaced into the pack, the pack came home, and the haul went to the stash.
A real account had seven wooden pieces filling its shelf after a handful of
raids — a satchel, two jerkins, a cap, two shields and a set of wraps, none of
which could be worn, sold or broken down. `addToStash` is the one place every
route out of a slot ends, so that is where the refusal lives, and
`sanitizeProfile` sweeps the wooden gear off shelves that already have it.

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

The two lists differ because a raid draws about a dozen of the sixty-three species,
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
species that live in it, and every camp in that ring is one of them — about
nine species a map, two to eleven camps each.

This is what makes a hunt order answerable at all. Spreading forty species over
eighty camps gave a species three camps if it was lucky and often no large pack
whatsoever, so a third of the list named something that did not exist. The draw
is sized by how many camps a ring can actually seat (`FAUNA_PER_RING` and
`CAMPS_PER_SPECIES` in `src/sim/map.js`) rather than being a flat number.

Seated, not dealt. A ring gets camps in proportion to its area, but the core is
a tenth of the map and has four solo grounds standing in it, each keeping 1500
units of room — 87% of that ring is inside somebody's clearance. Dividing the
raw deal between species there promised two species four camps each and
delivered two each. The budget is discounted by `RING_TAKEN` before it decides
how many species to draw, which is why the core holds one pack species and the
outer ring holds five.

Whatever is left over after that, the map does not advertise. A species that
ends up with one camp has one pack size, so it is dropped from the hunt list
and its camp stays as an outlier den. Across a hundred maps every hunt offered
resolves to somewhere the squad can walk.

It also makes maps differ from each other, which forty-species-everywhere never
did. What lives here is a fact about this raid, and worth knowing.

## Where the animals are

Species hold country. A species' camps are placed in ranges of up to five, and
its ranges are pulled beside each other, so being somewhere on the map means
being in something's territory rather than between two unrelated camps. The
nearest camp to a camp is the same species 81% of the time; chance would be
about 11%, and the old scatter measured 16%.

No two camps are closer than 1200 units. Before that floor existed the nearest
other camp averaged 794 units away, two in three were within 900, and the
closest pair on one map was 41 units apart — two packs in the same clearing.
Half of all gaps between fights ran under ten seconds, and a fifth of the time
a squad was in contact it was in contact with two camps at once. It is now 24%
and 1%, and most of the short gaps that remain are the same species, which is
the point: inside Sicklejaw country you meet Sicklejaws, and between countries
you walk.

The floor is what the world size is for. 80 camps holding 1200 units apart need
about a third more room than 14000×14000 had, which is why the map grew to
16000.

The nine solo grounds are placed by their prey. Each apex names a diet in
`src/data/creatures.js` — families, best-liked first — and a ring draws its
fauna weighted toward the diets of the animals that hunt over it, so the
country a Skyrender hunts is usually holding something a Skyrender eats. Three
grounds in four are placed by a species on their own diet; picking blind would
manage half that. The exception is the core, which seats one pack species and
has four apexes over it, so at best one of those four gets its first choice.

Near, not on top of: a ground keeps 1500 units from every camp. That number has
to clear two different things — a pack's aggro range, which tops out at 420,
and `BOSS_WAKE`, or clearing a camp wakes the animal that hunts the camp. At
1100 it cleared the first and not the second, and squads sent to hunt a mid-ring
pack were meeting a Tyrannoclast three minutes into the raid because the order
routed them past its ground. Half of them died there. Widening the clearance
costs camps — 1100 to 1500 costs five a map, and 1800 costs ten — so
`BOSS_WAKE` came down to 1100 to meet it rather than the clearance going up.

## Nothing respawns

A camp that has been cleared stays cleared. Camps still stream in and out with
the squads near them, but a camp streamed out remembers how many of it were
left, so walking away and coming back is not a way to refill one. The map is a
finite thing that six squads are drawing down.

That is a real balance shift and it is worth being plain about it: a raid used
to end in a wipe six times in ten and now ends clean six times in eight, with
the haul roughly doubled. Almost none of that is the missing respawns — it is
the chain pulls. Being caught by two camps at once was what killed squads, and
spacing the camps removed it. Raising the pack threat budget by half does not
put the difficulty back; measured over eight raids it changes the outcome mix
not at all, which is why `PACK_BUDGET` was left alone rather than tuned to hide
the shift.

### Knowing a camp is finished

Camps stopping coming back was a change to the world, and the squad AI only
half heard it. `findQuarry` learned to skip a cleared camp; `pickRoamGoal` —
which is what a squad follows between hunts, after a hunt is spent, and for the
whole raid when no hunt is set — did not. Measured over ten raids, **92.6% of
the camp goals a plan chose were camps that had already been emptied**, and a
squad spent 86 seconds of every raid standing on ground it had been
deliberately sent to and that had nothing on it. The share climbs as the raid
goes on, because the pool of dead camps only grows.

The fix is not to read `poi.cleared` in more places. That flag is true the
instant *anybody* empties a camp, and a squad on the far side of the map has no
business acting on it — using it for routing hands every squad a live map of
everyone else's kills. So knowledge is a squad-local thing that has to be
earned: `squad.emptied` is the set of camps this squad has stood next to and
found empty, filled by `#observeCamps`, and it is what both the hunt and the
plan consult.

`EYES_ON` is 420 — a camp is 220 across, so this is standing at its edge. It is
well under `CAMP_ACTIVATE` on purpose: inside that range a camp with anything
left in it has already spawned, so nothing at 420 means nothing at all, and the
squad is not guessing. Swept at 350, 900 and 1700 it turns out to be a weak
lever — the share of plan goals that are already cleared moves 42% / 42% / 36%,
because what survives a squad's own kills is camps *rivals* emptied and no
radius short of the whole map tells you about those. What it does change is
pacing, and the haul fell from 14.3 parts to 10.5 across the sweep, so it sits
at the tight end, which is also the only end that matches what it claims to
model.

Standing on ground it was sent to and that had nothing on it: **86 seconds a
raid, now zero**. Around 40% of camp goals are still camps somebody else
cleared, and that is correct — the squad walks over, sees the clearing, crosses
it off, and never picks it again.

**It moved the balance more than the walkers did, and not the way you would
guess.** All six squads route on this, so all six got better at finding fights
at once:

| Same seeds, level 5, farm | Before | After |
|---|---|---|
| Kills (all squads) | 259.8 | 422.0 |
| Parts kept | 22.0 | 9.0 |
| Outcomes | 4 clean / 7 partial / 1 wiped | 0 / 8 / 4 |

More fighting, a smaller haul, and more wipes. The mechanism is worth writing
down because it is not obvious: **there is no out-of-combat health
regeneration.** A squad's health is a finite resource for the whole raid, spent
down and topped up only by a healer's mana and a few potions — and under the
old routing, the minute and a half a raid spent walking to empty clearings was
where that topping up happened. Fixing the routing deleted the recovery window
along with the waste. That is a real gap in the design rather than a number to
tune, so nothing here has been re-tuned to hide it.

## The three that walk

Everything else on the map is somewhere. A camp is a place, a solo ground is a
place, and most of `src/sim/map.js` is about deciding which places. These three
are not placed at all. They arrive on the clock — with twenty, fifteen and ten
minutes left — and then walk, each one starting deeper and ranging wider than
the last, so the danger closes in as the raid runs down instead of waiting
where it was put.

| Arrives | Creature | Health | Band | What it does |
|---|---|---|---|---|
| 20m left | Cairnwalker | 7,000 | 0.27–0.48 | Never stops closing |
| 15m left | Sablemarch | 10,500 | 0.19–0.45 | Corrodes ground and armour |
| 10m left | Duskherald | 14,000 | 0.12–0.42 | Calls escorts, and is not alone |

They are solo hunts by every other measure — one creature, four to six carves,
a trophy and a class — but they are the one kind you cannot order a hunt for. A
quarry is a standing order resolved against the map, and a Duskherald is not
anywhere: an order naming one would resolve to nothing for the first twenty
minutes and then turn the squad into a chase. You do not hunt these. They come.

### Making them arrive at all

Three versions of the route, and the first two were measured to be scenery.

**A circle was wrong.** A walker pinned to one radius only ever meets squads at
that radius, and squads are wherever their plan puts them — which for the
default plan is the outer ring. Over twelve raids the player met the Cairnwalker
on its wide lap three times and the two deeper ones **not once**. Two of the
three trophies were content nobody could reach. A lap now swings between an
inner and an outer radius three times, and every band has to cross the country
raids are actually fought in; `test-walkers.js` fails if one does not.

**Blind was wrong too.** Even sweeping a band, one creature crossing a
16,000-unit map coincides with one squad rarely: the player still met the
Duskherald zero times in twelve. A patrol that investigates is still a patrol,
and it is the honest reading of what these are — the fiction is that they heard
the raid. A walker diverts to anything it notices within 2,600 units, closes,
and picks its lap back up at the nearest waypoint the moment there is nobody in
front of it. Somebody now runs into each of them in three raids out of four,
and the player squad runs into one in two raids out of three.

**The deepest one is still the hardest thing in the game.** The Duskherald
lands at minute twenty, which is exactly when the default extract plan starts
heading for a door — so its trophy is effectively gated behind choosing *Full
timer*. Measured over twenty-four raids by a level-14 squad in pristine gear:
Cairnwalker killed five times, Sablemarch eight, Duskherald once.

### Two bugs worth keeping written down

Both were invisible to reading and obvious to measurement.

A walker's leash is measured from its current waypoint, and both of the things
that move that waypoint were larger than the leash. Legs of the first circuit
ran to 2,441 units against a leash of 2,200, so **every single waypoint advance
tripped the leash**: the walkers spent 99% of the raid in the
give-up-and-go-home state, sprinting between waypoints at 1.5× speed and
healing to full at each one. They were not patrolling; they were fleeing in a
circle. Then noticing a squad makes that squad the waypoint, at up to 2,600
units — so a walker that spotted somebody leashed itself in the same instant
and turned round. The leash is 3,000 now, over both, and `WALKER_LEASH` is
exported so the test asserts against the real number instead of a copy of it.

Subdividing the long legs fixed the first and introduced a third: the straight
line between a waypoint pushed clear of an exit and its neighbour cuts back
across the exit, and midpoints landed 78 units from a door. New points are
cleared too, and the pass repeats until it converges.

### What they did to the balance

They put back the difficulty that spacing the camps out took away, which is the
outcome the previous change explicitly declined to fake by tuning `PACK_BUDGET`.
Same eight seeds, same squads:

| | Before the walkers | After |
|---|---|---|
| Outcomes | 6 clean / 2 partial / 0 wiped | 2 clean / 5 partial / 1 wiped |
| Loot kept | 32.0 | 17.6 |
| Boss kills | 0.50 | 1.13 |

## Carving

A corpse is worth stopping for and stopping is the cost. Carving takes 1.5
seconds a pull on a small creature and 4 on a large one, so a solo monster is
sixteen to twenty-four seconds spent standing still in the place you just made
a lot of noise. Corpses last 100 seconds, which is long enough to finish a
fight first and not long enough to come back later.

What comes out is a **part**: a species, one of eleven types, and a grade.

| Part | Fits |
|---|---|
| Hide | Chest, legs, hands, head |
| Scale | Chest, legs, head, offhand |
| Plate | Chest, head, hands, offhand |
| Claw | Weapon, hands |
| Fang | Weapon, trinket |
| Horn | Head, weapon |
| Tail | Weapon, offhand |
| Membrane | Legs, hands, offhand |
| Gland | Trinket, offhand |
| Marrow | Trinket |
| Sinew | Pouch — and pouches are made from nothing else |

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

## Two stores, and only one of them fills

Carves and forged gear used to share a stash with a single 120-item ceiling.
That does not work, because they arrive at wildly different rates: a raid comes
home with twenty-odd parts and one or two finished pieces. The shared stash
filled with material after about six raids and then started **silently dropping
the haul** — `addToStash` returned false, and `applyMatchResult` reads false as
"not gained", so carves went on the floor without a word.

So they are two stores now:

- **`profile.materials`** — every carve, uncapped. A hunt is meant to reward
  you with a pile of the same species, and a cap on that is a cap on playing
  the game the way it asks you to.
- **`profile.stash`** — the shelf of forged gear and supplies. `STASH_LIMIT`
  counts only the gear on it, which accumulates slowly enough that most players
  will never see the ceiling. That is the point: the ceiling is a backstop, not
  a pressure.

A save from before the split has its parts moved across on load, including for
the journal-reconstruction path that reads held parts to tell a long-standing
profile what it has met.

## Salvage: the smith run backwards

Gear you do not want breaks back down into material. Half the parts, rounded
up, one grade below what the piece was — a chest cost three and gives back two,
a helm cost two and gives back one.

The loss is the design. Nothing about forging is random, so a lossless salvage
would be a plain undo button and the choice of what to make would stop being a
choice. Grade is where most of it lives: three pristine plates make a pristine
chest, and breaking that chest gives two **fine** plates, so the way back to
pristine is another hunt rather than a reshuffle of what you already have. You
cannot re-forge what you just broke.

Wooden gear yields nothing. It was never cut off anything, and the camp hands
out another set the moment a hero dies — which is why it is never allowed onto
the shelf in the first place (see **Wooden gear**), since salvage is the only
way off it.

Salvaging cannot be undone, so a row arms on the first tap and only breaks the
piece on the second — the same two taps the forge takes to spend parts, and the
in-raid Destroy button to throw something away. A "salvage ragged" sweep
handles the usual case of a shelf filling with things nobody will ever wear,
and arms the same way.

The forge checks the shelf before it spends anything: a full stash blocks the
recipe with a reason rather than eating the parts and returning nothing.

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

Forty small species that hunt in packs, and twenty-three large ones that hunt
alone — twenty of them placed in grounds, three that arrive on the clock and
walk.

| Family | Species | What they are |
|---|---|---|
| Raptorial | 9 | Fast, light, and they arrive together |
| Wyverling | 6 | Winged; they open from above and disengage |
| Carapace | 9 | Slow and armoured; they hold ground |
| Venomite | 7 | Little damage up front and a lot afterwards |
| Delver | 8 | Burrowers; they are not where you last saw them |
| Mireborn | 6 | Control — grapples, slows, sticky ground |
| Carrionkin | 5 | They do better against a squad already hurt |
| Wyrm | 4 | Breath and ground denial, on a rhythm you can learn |
| Wyvern | 2 | They arrive from out of reach |
| Elder | 2 | They appear to be choosing |
| Harrow | 4 | They are not anywhere. They arrive, and then they walk |
| Tyrant | 1 | It picks a line and takes it |

Twelve small species are outer-ring, seventeen mid, eleven core. The twenty
placed large creatures run three outer, eight mid and nine core, with Nightfell
at the centre of the map. The three Harrow that walk have no ring of their own —
see **The three that walk**.

**A raid draws nine of the twenty**, one outer and four in each of the other
rings, the same way it draws about a dozen of the forty pack species. That is
not variety for its own sake. Every ground keeps `ARENA_CAMP_CLEAR` of room, so
twenty of them ask for 163 million square units of exclusion against a usable
disk of 142 — more than the whole map — and the ring that pays is the core,
which fell from 4.7 camps a map to 1.9 when all twenty were placed at once.
Growing the world to fit them was measured too, and costs reach instead: at
20000 a mid-ring hunt order came home with something in three raids of eight
against seven, because a thirty-minute raid crosses a fixed distance. Drawing
nine puts the load back exactly where every number on this page was measured.

The thing that makes sixty-three species distinguishable without sixty-three special cases
is `src/data/behaviours.js`: thirty-six behaviour archetypes — swarm, harry,
flank, pounce, spitter, ambusher, burrower, screamer, bulwark, tailwhip, leech,
bomber, stalker, venomous, frenzy, retaliate, grapple, deathcloud, charger,
breath, slam, sunder, roar, divebomb, relentless, constrict, entangle, brood,
pilfer, totemic, riposte, collapse, unmaking, sigil, doom, anchor — each a set
of `hint` fields
the monster AI reads. A species picks one, and the same vocabulary names its
set bonus, so what a creature does in a fight and what its armour does for you
are the same word.

## Classes

Three are yours from the first raid. The other twenty-three are earned — see
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
| **Monk** | Melee DPS | Agility | Spike | Cairnwalker |
| **Alchemist** | Ranged control | Spirit | Disc | Sablemarch |
| **Warlord** | Command | Might | Shield | Duskherald |
| **Druid** | Ground control | Spirit | Disc | Thornmother |
| **Beastmaster** | Ranged DPS | Agility | Chevron | Broodsire |
| **Marauder** | Melee DPS | Might | Spike | Snatchwing |
| **Shaman** | Support | Spirit | Disc | Standhorn |
| **Duelist** | Melee DPS | Agility | Spike | Mirrorscale |
| **Sapper** | Melee DPS | Might | Spike | Sinkjaw |
| **Inquisitor** | Anti-magic | Spirit | Shield | Hexmaw |
| **Runesmith** | Control caster | Spirit | Disc | Sigilborn |
| **Harbinger** | Ranged DPS | Spirit | Disc | Doomcrier |
| **Sentinel** | Frontline | Might | Shield | Everstand |

Each has seven spells and a three-branch, four-tier skill tree whose nodes
grant passives, squad-wide auras, or unlock the five spells that are not
starters. Four spells can be slotted at a time.

None of the twenty-three is a straight upgrade on a starter. The Berserker hits harder
than the Knight and dies faster for it; the Paladin mitigates less but heals
the squad; the Fire Mage does the most damage in the game and has the least
health to protect it. The Warden gives up damage entirely for snares and
grapples, and the Lancer trades armour for reach — it opens at 66 units, which
is further than any other melee class can start a fight.

The three taught by the walkers are each the lesson of a creature that came to
you rather than waited. The **Monk** is momentum: the fastest class in the
game, a 0.9-second swing, and every spell it has is cheap and short — its power
is how many of them land in a minute rather than any one of them. The
**Alchemist** wins fights that have already finished, and half its spells do
nothing at the moment they are cast. The **Warlord** is the only class whose
identity is squad-wide numbers: alone it is a mediocre frontliner, and with two
people to spend it on it is the reason they are still standing.

Silhouettes are shared by role rather than unique per class — twenty-six shapes
would be unreadable at raid zoom — so colour and the name label separate
classes within a role. The Monk is the one figure that carries nothing, which
is the most distinctive read available at that size and cost nothing to draw.

## The art

Every hero on the field is a drawn figure rather than a coloured shape, and
none of it is a painted asset: the art is **code**, in `src/art/`, and
`tools/bake-sprites.mjs` renders it into sprite sheets through headless
Chromium. That means the sheets can never disagree with the game — both sides
call the same `drawFigure` and the same animation curves — and a change to a
silhouette is a number, not a hundred repainted images.

```
src/art/rig.js      the top-down humanoid, and what a pose is
src/art/anim.js     six animations as functions of normalised time
src/art/gear.js     weapons, shields, foci, helms — the held vocabulary
src/art/kits.js     the twenty-six classes, as proportions + palette + kit
src/art/beast.js    the top-down creature, which is a different animal
src/art/beastanim.js  four creature animations
src/art/plans.js    seven family body plans, varied per species
src/ui/portrait.js  the same figures, drawn live on the DOM screens
```

Six animations, baked one row per sheet: **idle**, **walk**, **attack**,
**cast**, **hurt**, **die** — 44 frames a class, 26 classes, at 128px a cell.
Only one facing is baked; the renderer rotates. Eight baked directions would be
eight times the art for something a `ctx.rotate` does for free.

### Drawing a person from directly above

Top-down is a specific problem. There are no faces, no chests, and legs barely
exist — the readable information is the width across the shoulders, the angle
of the arms, and the weapon. Three things had to be got wrong before that
sank in:

- **The head cannot be big.** The first rig gave it half the torso's width and
  the figure read as a beetle. It is now a fifth, and *lighter* than the body
  rather than darker: a dark head disappears into the outline, and the eye
  reads the brightest mass as the top of a form.
- **Depth is a ratio, not a constant.** With torso depth fixed, the narrow
  classes came out circular — a rogue was as deep as it was wide, which is the
  opposite of what a narrow silhouette is for. It is now 0.62 of the shoulder
  width, so every class keeps the same across-to-deep proportion.
- **An axe has a blade on one side.** Drawn symmetrically around the haft it is
  a white balloon on a stick that reads as neither an axe nor a weapon.

### Telling twenty-six apart at twenty-six pixels

That is the size a hero actually is in a raid — smaller than a line of this
text. Only three levers survive it, so each class is built from them
deliberately rather than decorated:

| Lever | What it does |
|---|---|
| **Width** | How far the shoulders and pauldrons spread |
| **Reach** | How far past the body the weapon projects, and in what shape |
| **Grip** | One hand with something in the other, or both on one haft |

So the Knight is wide with a shield, the Berserker is narrow with both hands on
a long axe, the Rogue is the smallest figure with a blade in each hand, and the
Archer is the only one whose weapon *widens* the silhouette instead of
extending it. The four mages would otherwise differ by hue alone — the worst
thing to rely on against a dark map at speed — so each staff carries a
different focus: a plain stone, a skull, a shard, a flame, a bolt.

`tools/test-sprites.mjs` asserts no two classes share a silhouette, comparing
width, what is in each hand, and the grip. Everything else — helms, cloaks,
trim — exists for the camp screens, where the same figure is drawn five times
larger.

### The creatures

Sixty-three species get the same treatment, with a different rig. A person from above
is a wide shallow oval with the head in the middle; a beast is the opposite —
long along its facing, head at one end, tail at the other, legs out to the
sides. That is a separate anatomy, so `src/art/beast.js` is a separate file.

Four animations rather than six: **idle**, **walk**, **attack**, **hurt**,
**die**. A beast has no cast, and sixty-three species times two extra rows is a great
deal of PNG for something nobody would look at.

Sixty-three creatures cannot each be drawn by hand and should not be. The **family**
owns the anatomy and the **species** varies it, and every per-species number is
derived from data that already exists — colour is the creature's colour, size
is its radius, and the small variations are hashed from its own id, so they are
stable, distinct and free. The seven pack families are seven different animals:

| Family | Silhouette |
|---|---|
| Raptorial | Longest and narrowest — a line pointed at you |
| Wyverling | Wider than it is long, which nothing else on the map is |
| Carapace | One low armoured disc; almost no head shows |
| Venomite | Eight legs, and the legs *are* the silhouette |
| Delver | A torpedo with digging claws and nothing sticking out sideways |
| Mireborn | Broad and squat, limbs planted well outside the body |
| Carrionkin | A small body under a half-spread wing, neck reaching |

The twenty-three solo monsters are hand-shaped instead. There are few enough to be worth
it, and each one is a trophy — a player who takes a Nightfell should not find it
was a big Sicklejaw.

Two things the tests caught that the eye had not. Three families — delver,
mireborn, carrionkin — had **no anatomical variation at all**: each was one
animal drawn in four colours, because the plan spent its single variation
number on one measurement. They get two independent numbers now and vary on
several axes. And Skyrender and Stormcrest were the same winged biped; one
never lands and the other is built around the moment it arrives, so now the
first is the longest wingspan in the game on the slightest body and the second
is compact, big-headed and short-tailed.

Creatures bake at 72px a cell against a hero's 128, and the solo monsters at
120. They are drawn smaller than heroes — a pack creature is nine to eighteen
world units — and there are sixty-three of them; at the hero's cell size the creature
sheets alone would be most of the repository.

### On the camp screens

Heroes and creatures are animated in the camp too — a figure on every hero
card, a large one on the hero screen with a control to play each animation, and
the creature itself on every trophy row, because a locked row's whole job is to
say what you have to go and kill and an animal does that faster than a name.

These draw the rig **live** rather than blitting a sheet, which is the opposite
of what the raid does and deliberate. A portrait is 54 to 176px — above the
128px the sheets are baked at — so blitting would upscale and go soft exactly
where the art is most visible, and the camp would have to load sixty-three
sprite sheets to show twenty-six small pictures. The raid has the opposite
problem: two hundred and forty entities, each needing to cost one `drawImage`.
Same `drawFigure`, same curves, different delivery, and the reason each way
round is the reason.

One ticker drives every portrait on the page and drops any whose canvas has
left the document. Screens here are rebuilt by clearing and re-appending, so
that check is the only signal a portrait is gone — without it every visit to
the camp leaves another dozen canvases being painted forever. Four round trips
between camp and hero screen takes it from 13 portraits to 69 if the check is
removed, which is what the test asserts. Camp holds 60fps with all thirteen
running.

### Looking at it

```bash
node tools/bake-sprites.mjs              # rebuild every sheet
node tools/bake-sprites.mjs --class rogue
node tools/lineup.mjs idle 0 170         # all twenty-six classes in one pose
node tools/lineup.mjs walk 2 74          # ...at the size a raid draws them
node tools/lineup.mjs idle 0 155 sicklejaw plateback screelwing   # creatures
node tools/contact-sheet.mjs knight idle:0 attack:5
```
Then open `tools/sprite-lab.html` for the live version, which plays every
animation at its real rate with a row underneath at raid sizes. The lineup is
the view that matters: judging kits one at a time says nothing about whether
you can tell them apart, which is the only question the art has to pass.

Sprites are a progressive enhancement. The renderer draws the old shapes until
the sheets have loaded and falls back to them permanently if an image fails —
`test-sprites.mjs` blocks the whole asset directory and checks the raid still
runs. A missing asset costs the art and nothing else.

## Trophies

Twenty-three solo monsters, twenty-three trophies, one hero class each. It is the only
way to get a class: nothing here is bought, rolled for, or dropped, so a roster
is a readable record of what its owner has actually killed. The camp lists all
twenty-three, and a locked row names the creature and the ring it is in, because a
player who wants a Necromancer needs to know what to go and kill for it.

| Ring | Creature | Trophy | Unlocks |
|---|---|---|---|
| Outer | Thornmother | Where It Decided | Druid |
| Outer | Bastionback | Something That Would Not Fall | Paladin |
| Outer | Broodsire | It Was Never Alone | Beastmaster |
| Mid | Snatchwing | It Only Wanted The One Thing | Marauder |
| Mid | Tyrannoclast | The Line It Chose | Berserker |
| Mid | Standhorn | What It Left Standing | Shaman |
| Mid | Deepdelver | What Was Underneath | Necromancer |
| Mid | Mirrorscale | Everything You Gave It | Duelist |
| Mid | Glaciermaw | The Cold It Kept | Ice Mage |
| Mid | Sinkjaw | It Took The Floor | Sapper |
| Mid | Mirethane | It Would Not Let Go | Warden |
| Core | Hexmaw | What You Brought With You | Inquisitor |
| Core | Pyroclast | The Ground It Ruined | Fire Mage |
| Core | Sigilborn | It Was Already Written | Runesmith |
| Core | Stormcrest | It Never Once Landed | Lightning Mage |
| Core | Doomcrier | The Count, Not The Blow | Harbinger |
| Core | Venomcoil | Patience, Applied | Rogue |
| Core | Everstand | It Did Not Move | Sentinel |
| Core | Skyrender | It Came Back Down | Lancer |
| Centre | Nightfell | The One That Was Choosing | Slayer |
| Walks, 20m left | Cairnwalker | It Did Not Stop | Monk |
| Walks, 15m left | Sablemarch | What It Left Behind | Alchemist |
| Walks, 10m left | Duskherald | Everyone Heard It | Warlord |

The table is ordered outward-in, which is also the order the grounds sit on the
map: `ARENA_SPEC` seats them at fixed fractions of the world radius so the
ladder and the geography are the same list. Each radius carries a margin wider
than the ±11% the placer jitters it by, so a ground is always inside the ring
its trophy claims — the older ladder did not, and Mirethane at 0.186 against a
`RING_CORE` of 0.185 landed in the core on any seed that jittered it inward.

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

## How a hero fights

Deliberation runs five times a second per hero, and until recently each one did
it entirely alone: pick a target, score the spells, pick a destination, with no
reference to what the other two decided that same tick. Ten things came out of
that, and one of them was embarrassing.

**Heroes were drawn a warning they could not see.** Bosses put a circle on the
ground about a second before an ability lands. `match.telegraphs` was read in
exactly one place — the renderer. The player watched a red circle appear under
their squad and watched them stand in it. Heroes now leave, stepping out of the
nearest edge rather than away from the centre, which matters near the rim of a
large circle where the two differ badly.

Once they could see a windup, it became an offensive cue too: an enemy mid-cast
is the one moment in a fight where it is committed, and that is when a stun is
worth more than it will be a second later.

**A squad now has one shared view of a fight** — rebuilt at most once a tick,
deliberately not a planner, just the facts a hero cannot see from inside its own
head. Three things read it:

- **Overkill.** Focus fire made this worse rather than better: it pointed
  everybody at one target, so three heroes and two arrows in flight all
  committed to something with forty health while the rest of the pack went
  unanswered. Damage already on its way now counts, and a target dead in all
  but name is skipped — unless it is the last enemy standing.
- **Peeling.** The Knight's own description promises it "peels for the
  backline, and punishes anyone who walks into melee", and nothing did: the
  tank held the line while the archer died behind it. A frontliner now takes a
  melee attacker off a ranged ally within reach.
- **Surrounding.** Melee heroes walking at `target.pos` all arrive on the same
  arc — the one facing wherever the squad came from — where they queue behind
  each other and share a cleave. They now fan out from the side each is already
  on, so nobody runs the long way round.

**And five smaller things.** Potions are chosen by what they would waste rather
than by belt order, so a hero missing seventy health stops drinking the Greater
Draught. Expensive spells want a target worth spending on, so a Fire Mage no
longer empties its bar into a pack of Skiterlings and meets the Pyroclast on
fumes. A retreating hero falls back *behind* a healthy frontliner instead of
simply away from whichever enemy is nearest. Targets stick briefly, because
deliberation is faster than most attack intervals and a hero oscillating
between two similar targets can approach both and hit neither. And a kiter
backs away from the massed threat rather than from the one thing it is
shooting, far enough to be shooting again and no further.

### What it cost

Both sides run this AI — rival squads are built from the same hero records —
so everybody got better at once. Measured at seed 300 against the same squads
as the table further down:

| Raid plan | Before | After |
|---|---|---|
| Farm the ring, L5 | 6/3/3, 22.0 parts | **8/3/1, 31.5 parts** |
| Solo hunt, L5 | 0/2/6, 0.13 kills | 0/1/7, **0.38 kills** |
| Solo hunt, L14 | 0/5/3, 2.63 kills | 0/3/5, **3.25 kills** |
| Squad hunter, L10 | 8/0/0, 48.0 parts | 7/0/1, 41.1 parts |

Farming got clearly better and the deep content got *harder*, which reads as
one story rather than two: heroes kill more — total kills are up across every
plan — and spend correspondingly longer inside fights they were previously
losing more slowly. Solo kills are up everywhere while survival at depth is
down. That sharpens both ends of the curve the game already wanted, so it has
been left alone rather than tuned back.

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
home.

A pouch is sewn from **sinew**, and from nothing else. Every creature in the
game yields some, and sinew makes nothing but pouches — which means how much
you can carry out is its own hunt rather than something you fall into while
making a cuirass. Hide and membrane used to make pouches too, and the result
was that nobody ever went looking for a bag. A hide pouch on an older save
still works and still holds what it always did; it simply cannot be made
again.

The pouch is also the one piece where the *size* of what you killed matters
more than the grade of the carve. A pack creature has short cord; a solo
monster's sinew runs the length of the thing.

| Grade | Pack creature | Solo monster |
|---|---|---|
| Ragged | +4 (12 carried) | +10 (18) |
| Sound | +6 (14) | +13 (21) |
| Fine | +8 (16) | +16 (24) |
| Pristine | +10 (18) | +18 (26) |
| Mythic | +12 (20) | +20 (28) |

The two ladders overlap on purpose. A mythic sinew off a Sicklejaw (+12) beats
a ragged one off a Nightfell (+10), so a player who hunts packs well is never
simply behind one who got lucky once — but the ceiling belongs to the solo
hunts, and 28 carried slots means you killed something at the centre of the
map.

Every hero starts in a ragged Threshclaw pouch, so nobody is ever left unable
to carve.

Because a pouch's stat block is deliberately a shrug — the pouch slot has the
smallest budget in the game — the AI's item scoring counts its capacity
directly; otherwise the best item in the game would score near zero and squads
would walk straight past it. Swapping down into a smaller pouch than the pack
is holding is refused rather than silently binning the overflow.

Consumables are carried separately, on a three-slot **belt**, and that is the
only place the tactics AI will drink from. So a potion found in a supply cache
goes to the belt first and falls back to the pack only when the belt is full.
Belt stacks are capped per consumable: treating a matching stack as infinite
room made every potion on the map look takeable and pushed squads from 3.2% of
the raid in loot mode to 6.9%, all of it spent detouring for potions they could
not hold.

## The map

16000×16000 units, three concentric danger rings, twelve landing zones on the
outer ring, and three extraction points on staggered windows (opening at 3, 7
and 11 minutes; closing at 26, 28 and 30). Enemy camps stream in around
whichever squads are nearby, each one a named species in a pack of a known
size, and none of them comes back once it is cleared.

Nine solo hunting grounds are fixed, at radii from 5940 units out down to 1140,
and Nightfell wakes at the exact centre at 18 minutes. Every radius is a
fraction of the world size, so resizing the map moves the whole ladder
together. They double as difficulty signposting: Bastionback at 5940 is the one
a fresh squad can take, and Skyrender at 1140 is the end of a long raid.
Grounds are placed clear of the landing zones and of each other, so nobody is
greeted by a large creature on the drop and pulling one is never pulling two —
and near the prey they eat, which is what decides the angle. From 25 minutes
the map collapses inward — the final safe circle still contains every exit, so
it squeezes you toward them rather than deleting them.

A large creature only spawns once a squad comes within 1500 units of its
ground, so a raid you spend in the outer ring never pays for the core's
population.

## Getting somewhere

Movement used to be pure reactive steering: a unit vector at the goal, plus
separation, plus a lean around anything in the way, normalised and multiplied
by speed. That controller cannot see past its own 300-unit bucket, so
everything it did about being stuck was an attempt to reconstruct global
information from local failure — sampling progress, detecting orbits, throwing
a waypoint out to whichever side looked emptier and widening it on each retry.
About a hundred and ten lines of it, and it still left heroes pinned for
minutes at a time.

There is now an actual navigation layer, in `src/sim/navgrid.js`.

**A clearance field.** The obstacles never move, so once per map every cell of
a 70-unit grid records its distance to the nearest obstacle surface. A circle
of radius R fits exactly where clearance ≥ R, which is what makes a gap
narrower than a hero *impassable* rather than something to steer between and
wedge in. Computed exactly rather than by a transform over a rasterised grid:
quantising to a cell would round clearance to 70 units, five times a hero's
radius, and call a wall a doorway. 44ms for the whole map.

**Flow fields, cached per goal.** A breadth-first search backwards from a goal
gives every cell a direction along the shortest passable route to it, so there
is no local minimum to escape — the field is globally correct by construction.
Cached by goal *cell* rather than per entity, which is what makes it
affordable: squads converge on a handful of places, so one field serves every
entity heading there, the player's squad and all five rival squads together.
21ms to build, then free. At most one is built per tick, so a cache miss costs
a straight line for a moment rather than a dropped frame.

**Sliding instead of ejecting.** The old order was move, then push back out of
anything you overlapped, and those two can cancel exactly — walk into a corner
and the ejection returns you precisely as far as you stepped, forever. The
inward component of velocity is now removed *before* the step, twice, so a body
meeting a wall head-on stops against it and one meeting it at an angle carries
on along it.

**A line-of-sight shortcut.** Following a cell field when the direct line is
walkable produces a staircase for no reason, and on this map most lines are
walkable. Asking first is string-pulling, and it is much cheaper than a field.

**Anticipating other bodies.** Separation was purely positional — nothing is
felt until contact, then a shove, then walk back in. Head-on that is a
standoff, and a standoff at exactly the separation distance is the shape of the
worst pin this project ever recorded. Bodies now lean across a *predicted*
collision up to about a second out, each side independently, which is the cheap
half of a reciprocal velocity obstacle.

**Followers route along the leader's trail.** A formation slot is geometry and
geometry does not know about walls; a hero whose slot lands inside a rock
spends the walk pressed against it. A slot that cannot be reached now falls
back to ground the leader has just walked over, which is reachable by
construction.

### What the measurement said

Twenty raids at each of four seed bases, obstacles switched on for both sides:

| Seed base | Worst pin, before → after | Long-pin share, before → after |
|---|---|---|
| 900 | 1197s → **93s** | 0.56% → **0.02%** |
| 2000 | 530s → **112s** | 0.38% → **0.06%** |
| 3000 | 77s → 97s | 0.01% → 0.05% |
| 4000 | 557s → **104s** | 0.73% → **0.06%** |

Long-pin share averages 0.42% → 0.05%, and heroes move no slower for it (62.6
→ 61.9 units per second) — routing around costs a little distance, which is
what routing around is.

### The part that did not work

The plan was to delete the old heuristics outright, on the theory that a global
field made them redundant. It did not. With them gone and the field kept to
long-haul travel, heroes went from 3.2% of their time making no progress to
16.7%, and their average speed fell from 63 units per second to 35. Turning any
single new piece off did not recover it, and turning the *field* off made it
worse still — so the field was helping and the deletion was the damage.

The reason is that the field only engaged beyond 420 units, and heroes do not
get stuck out there. They get stuck at close range: pressed against a rock
beside a camp they are already standing in. The old code's stuck *detection*
was load-bearing; only its response — guess a side, throw a waypoint, widen on
failure — was the weak part.

So the detection stayed and the response was replaced. When a body is judged
stuck, it now asks the field for a route at any range and follows that;
the sideways guess remains only as the fallback for when no route exists. That
recovered everything: 3.2% and 63 units per second, with the pins gone.

**The map still generates no obstacles.** Rocks and ruins are switched off
at `OBSTACLE_CLUSTERS` in `src/sim/map.js` — everything that reads them still
works, there is simply nothing to read — so raids are fought on open ground.
That is now a choice rather than a necessity. It was switched off because
steering could not cope with scenery; with the navigation layer above, it can —
obstacles on, the numbers are 3.2–4.1% of hero-time without progress and a
worst pin around 100 seconds, against 3.9% and 65.5 units/s for the empty map
that ships. Balance is comparable too, and farming is slightly *better* with
scenery back (8 clean runs in 12 against 6, and 29.5 parts against 22),
presumably because rocks break up a charge.

The cost is about 60% more per tick — 413µs against 257µs on a level-5 farming
raid — which is the price of having something to collide with. Set
`OBSTACLE_CLUSTERS` back to 420 in `src/sim/map.js` to bring them back; nothing
else needs changing, and with them off the navigation layer never builds a grid
at all, so it is free until it is wanted.

Landing zones are safe ground for the first 90 seconds; nobody gets
spawn-camped out of a raid.

## Layout

```
src/
  core/      seeded rng, vector maths
  data/      classes, spells, skill trees, consumables, tactics, and the
             hunt: creatures, behaviours, parts, gear, sets, hunt orders —
             all plain data
  sim/       stats, combat, entities, map generation, navigation, the
             tactics AI, hero records, bot squads, and the Match instance
  game/      the persistent player profile and the blacksmith
  art/       the class figures: rig, animations, held gear, per-class kits
  ui/        canvas renderer, sprite blitting, DOM helpers, and the screens
assets/      baked sprite sheets and their atlas
tools/       headless harnesses and the art bakery (see below)
```

The simulation has no dependency on the DOM. `tools/` drives it directly.

## Tools

```bash
node tools/simulate.js 8 --seed 300 --plan farm --level 5
node tools/simulate.js 5 --plan boss --level 14 --verbose
node tools/test-progression.js
node tools/test-loot.js
node tools/test-movement.js
node tools/test-nav.js
node tools/test-heroai.js
node tools/test-bestiary.js
node tools/test-smith.js
node tools/test-hunt.js
node tools/test-extraction.js
node tools/test-achievements.js
node tools/test-salvage.js
node tools/test-version.js
node tools/test-ecology.js
node tools/test-walkers.js
node tools/test-bags.mjs        # needs Playwright; skips if absent
node tools/test-navigation.mjs  # needs Playwright; skips if absent
node tools/test-layout.mjs      # needs Playwright; skips if absent
node tools/test-unlocks.mjs     # needs Playwright; skips if absent
node tools/test-forge.mjs       # needs Playwright; skips if absent
node tools/test-huntpad.mjs     # needs Playwright; skips if absent
node tools/test-salvage.mjs     # needs Playwright; skips if absent
node tools/test-version.mjs     # needs Playwright; skips if absent
node tools/stamp-version.mjs    # stamp a build id before pushing
node tools/test-sprites.mjs     # browser half needs Playwright
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

Its share check was rewritten when the second ten of grounds went in, and not
because the new number was inconvenient. The old check capped the *worst* of
six raids at 25% — and measured over twenty-four raids, the build it was
written against peaks at 29.9%, above its own limit. Six raids had simply never
drawn the tail. Maxima on a heavy tail do not converge, which is the same
lesson as the worst-pin check in `test-movement.js`. So the claim is a rate now
— at most a quarter of raids over 25% — with a genuine ceiling at 35% for a
single raid, and a floor of 34 pickups per loot-minute underneath both. That
floor is the one that actually separates carving from waste, and the one that
does not move when the map simply has more worth carving on it. Pointing the
squad at the farthest reachable pile instead of the nearest fails all three:
20 of 24 raids over a quarter, a worst raid of 85.5%, and productivity down to
14.9.

`test-heroai.js` covers the ten combat behaviours, each against a real match
with the situation built by hand — "does a frontliner peel" is not a property
of a function, it is a property of a knight standing near an archer that is
being bitten. Removing five of the behaviours fails five checks. The dodge test
needs two assertions rather than one, because a hero drifts out of a circle's
centre through ordinary movement; only *clearing the edge* distinguishes
dodging from wandering.

`test-nav.js` covers the navigation layer against maps built by hand, so the
right answer is known rather than inferred: a wall with one gap, a goal walled
off entirely, a goal sitting inside geometry, and a pair of diagonal blockers.
That last one exists because a straight wall has no corners to cut — the
corner-cutting bug it guards passed every other check in the file, and only
showed up once something with an actual corner was put in front of it. The
line-of-sight sampler is checked against a wall one cell thick, which is the
width it is most likely to step over.

`test-movement.js` guards the steering, and carries a lesson about what a test
can measure. Its headline check was once "nobody is pinned for a whole raid",
bounded at 400 seconds — a maximum over roughly three hundred hero-raids, which
on a heavy tail does not converge. Measured over four separate batches of
twenty raids the same build reported 34s, 104s, 208s and 259s; a change that
touched nothing about movement moved it to 24s, 66s, 286s and 450s. The bound
had been passing on the luck of one seed base. It now says what its name says —
half a raid — and the check that actually watches for regressions is a rate,
the share of hero-time spent inside pins over a minute long, which moves
consistently when pinning really gets worse (0.17% to 0.56% and 0.22% to 0.73%
with the map's obstacles switched back on). Heroes used to walk straight at their
destination and let collision resolution push them back out of whatever they
hit, which against a rock is a closed loop — some spent entire raids pinned to
one spot. It measures ground actually covered, because the hardest case looks
fine to any simpler check: a hero wedged in a corner is running at full speed
and going nowhere.

`test-version.js` and `test-version.mjs` cover the build stamp. It is worth a
test for a reason that generalises: nothing in the game *stops working* when
the stamp goes stale, it just stops being true, and a version number that lies
is worse than none at all. The browser half checks the parts that only exist
for a player — the id is on the page, a page whose deployed version has moved
says so, and it stays quiet during a raid.

Writing it turned up a defect in the tool it tests. `stamp-version.mjs` ran its
work at module load, so the test importing `readStamps` from it restamped the
repository as a side effect of being read. It only acts when run as a program
now.

`test-salvage.js` covers the two stores and the way back out of one of them.
The check worth naming is the one that asserts you *cannot* re-forge what you
just broke — that is the whole design of the loss stated as something a player
would notice, rather than as arithmetic about counts and grades. Its browser
half, `test-salvage.mjs`, only guards the rail: that one tap arms and destroys
nothing, that an armed button left unconfirmed keeps its item, and that the
sweep takes exactly the grade it names. Both halves were verified by injecting
the bugs they guard — capping carves again, making salvage lossless, dropping
the save migration, letting the forge ignore a full shelf, firing salvage on
the first tap, and widening the sweep past ragged.

`test-ecology.js` covers how the map allocates its animals, what happens once
they are dead, and what a squad is allowed to know about it. Three of its five
knowledge checks were written wrong first and only found out by injection: two
of them passed with the bug they were meant to guard put back, because they
were asserting the wrong property — "crossed off something not cleared" cannot
detect knowledge taken without looking, when the thing being taken is the
cleared flag itself. They assert provenance now: everywhere the squad has
actually been within `EYES_ON` of is recorded, and nothing outside that set may
appear in `squad.emptied`. None of it is a property of a function — it is a property
of a generated world — so every check is measured over sixty maps rather than
asserted about one. Two of its numbers were chosen the hard way. The clustering
threshold is 0.78, not something safely low, because a loose bound passes on
ranges alone and stops guarding the pull that puts a species' ranges beside
each other: measured over five independent batches the statistic reads 80.0 to
81.1% with the pull and 71.4 to 74.4% without, two bands a point wide that do
not touch. And the finality check counts *deaths* per camp, not spawns — a camp
streamed out with survivors and streamed back in builds fresh entities for the
ones that were left, so counting ids called every camp on the map a respawner
for doing exactly what it is supposed to do.

It also re-measures `RING_TAKEN`, the share of each ring that its solo grounds
take out of circulation, because those are measured numbers baked into a
constant: move a ground or change the clearance without updating them and the
core silently over-promises camps to species that cannot be seated.

`test-walkers.js` covers the three that arrive on the clock: the route, the
gait, and whether anybody ever meets them. Its two headline numbers were both
chosen after being got wrong once. "The player meets every walker" is not a
check — which of six squads a walker runs into swings hard on the seed base,
and the same build measured 0 of 8 and 5 of 24 — so the per-walker claim is
made about *any* squad, which is stable at 71-88%, and the player-specific one
is made in aggregate. And "arrives in every raid" was failing on raids that
ended before the walker was due, so it counts raids that actually reached the
arrival time and asserts against that instead.

The same denominator was still wrong in one last place, and the second ten of
grounds found it. The player claim was made against every run, so when raids
started ending sooner it read 29 of 40 before and 19 of 40 after, which looks
like the routes decaying. They had not: every walker still met somebody at the
old rate, and the player squad is alive for the whole raid in both builds. Only
the clock had moved. Against the raids that reached a walker's hour at all it
is 19 of 25, and it was 29 of 35. `RUNS` went from 16 to 40 at the same time,
for the reason the file already knew about — at 16 the Duskherald's denominator
was six raids, and a rate measured over six trials is not a rate.

Every check in it was verified by injecting the bug it guards: put the leash
back under the notice radius and the walkers spend a tenth of the raid running
home; pin the circuits to one radius and two of the three bands stop reaching
the fought-in country; turn off the investigating and the meet rates halve.

`test-extraction.js` guards the priority order that makes "extract now" mean
it. That order is fragile — putting retreat, regrouping or chasing ahead of it
takes a squad from 77 seconds to reach a door to 306, or leaves them milling
outside one for twenty minutes.

`test-bestiary.js` covers the sixty-three species as data: every one has a behaviour
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
asserts the map invariant the whole system rests on across a hundred maps:
every hunt the map offers resolves to somewhere the squad can walk. Since a
species only falls below two camps on about one map in a hundred, that check
would pass whether or not the filter behind it exists, so the file injects the
bug too — advertise a species off a single camp and the list stops being
answerable.

Those with-and-without comparisons run on twenty-four seeds rather than eight,
and the second ten of grounds is what showed why they had to. Both are ratios
of carves summed over the whole set, and on eight seeds "the total haul
survives the narrowing" read 33% — a failure — against 43% on twenty-four, a
comfortable pass. The build before the grounds went in reads 52% on the same
twenty-four and would itself fail the delivery check on them at 14 of 24. So
the eight seeds were never testing the bound they named; they were the eight
the numbers happened to clear. A ratio of sums needs a sample, and eight raids
is not one.

`test-huntpad.mjs` is the browser half: the camp's picker offers exactly what
the journal remembers and grows as the squad meets things, a pack species
offers both sizes and a solo creature offers neither, and an order given from
the in-raid panel reaches the squad rather than only lighting up a button. It
reads the live squad through `window.__ashenveil`, because a DOM-only check can
tell that a button turned gold and not that anything happened.

`test-sprites.mjs` covers the class art. Most of it is about the atlas being
complete, because the failure it guards is silent and it already happened: a
partial bake rewrote `atlas.json` with only the classes in that run, the other
twelve PNGs stayed on disk, every one of them stopped being drawable, and the
raid quietly fell back to shapes with nothing in the console to explain it. It
also asserts the animation priority — death outranks a swing, or a hero killed
mid-swing keeps swinging on the ground — that no two classes share a
silhouette, and that blocking the asset directory entirely costs the art and
leaves the raid running.

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
| Farm the ring | 5 | 12 | 0 | 8 | 4 | 9.0 | 0.83 |
| Solo hunt | 5 | 8 | 0 | 1 | 7 | 1.5 | 0.38 |
| Solo hunt | 14 | 8 | 0 | 3 | 5 | 7.0 | 3.25 |
| Squad hunter | 10 | 8 | 7 | 0 | 1 | 41.1 | 1.88 |

That spread is the intent: farming packs is a reliable income, and the solo
monsters are a place you earn the right to visit. A level-5 solo hunt wipes
seven times in eight and brings home under two parts; the same plan at 14 kills
3.25 of them a raid and still wipes five times in eight.

The farming row has moved three times and the last move was the largest.
Teaching the plan that camps do not come back (see **Knowing a camp is
finished**) took it from 4 clean / 7 partial / 1 wiped at 22.0 parts to
0 / 8 / 4 at 9.0, because all six squads got better at finding fights on the
same day and nothing in the game restores health between them. The two earlier
moves are worth reading together as well. Spacing the camps out and stopping them respawning made
farming markedly safer — over eight seeds it went from 2 clean / 5 partial / 1
wiped to 6 / 2 / 0 with the haul roughly doubled, because being chain-pulled by
two camps at once was what had been killing squads. Raising `PACK_BUDGET` by
half was measured and does nothing to put that back: the same eight raids came
out with an identical outcome mix, so the difficulty had never been in how big
a pack was. The three walkers put it back through content instead, and the same
eight seeds returned to 2 / 5 / 1. A solo kill a raid is now the norm rather
than the exception, because one of the three usually finds somebody.

Drawing a fauna per map rather than sprinkling forty species over seventy camps
moved this a little too, and not in the direction it looks. Farming at level 5
reads worse than before (6/3/3 against 8/3/1) purely because seed 300 happens
to draw a harsh outer ring — over eight seeds at 500 the same change went 2/3/3
to 5/1/2 and the haul from 16.5 parts to 24.0. A map now has a character, which
means some maps are harder than others; that is the point of the change rather
than a cost of it.

### What the second ten of grounds cost

Doubling the solo grounds — nine to nineteen, plus Nightfell and the three
walkers — is a difficulty change, and it should be read as one rather than as
a content drop with no price. Measured over forty raids against the build
before it:

| | before | after |
|---|---|---|
| Mean raid length | 1033s | 870s |
| Player deaths per raid | 1.48 | 1.63 |
| Solo kills per raid | 3.20 | 3.63 |
| Heroes extracted per raid | 0.50 | 0.38 |
| Loot as a share of the raid | 9.3% | 12.1% |
| Pickups per loot-minute | 53.9 | 45.6 |

The interesting one is the first. The player squad is not dying much more
often — it is alive for the whole raid in both builds — but raids *end* sooner,
because all six squads are resolving faster with twice as many apexes between
them. That has a knock-on nothing was watching: the three walkers arrive on the
clock at minutes ten, fifteen and twenty, so a shorter raid is a raid that
reaches fewer of them. The Duskherald, at minute twenty, is now due in sixteen
raids in forty rather than twenty.

The walkers themselves are unaffected — each still meets somebody in
92%, 86% and 63% of the raids it walks in, against 94%, 84% and 70% before. It
is the clock that moved, not the routes, and `test-walkers.js` says so now
rather than blaming the routes for it.

Looting rose for the plainest possible reason: a squad meets three times as
many apexes (0.29 boss kills a raid to 1.08 at level 5) and an apex is the
biggest carve on the map. That is time well spent, which is why the check that
guards it is now a floor on pickups per loot-minute rather than a ceiling on
the worst raid — see **Tools**.

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
