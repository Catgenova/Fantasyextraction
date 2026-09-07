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
src/art/kits.js     the thirteen classes, as proportions + palette + kit
src/art/beast.js    the top-down creature, which is a different animal
src/art/beastanim.js  four creature animations
src/art/plans.js    seven family body plans, varied per species
src/ui/portrait.js  the same figures, drawn live on the DOM screens
```

Six animations, baked one row per sheet: **idle**, **walk**, **attack**,
**cast**, **hurt**, **die** — 44 frames a class, 13 classes, at 128px a cell.
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

### Telling thirteen apart at twenty-six pixels

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

Fifty species get the same treatment, with a different rig. A person from above
is a wide shallow oval with the head in the middle; a beast is the opposite —
long along its facing, head at one end, tail at the other, legs out to the
sides. That is a separate anatomy, so `src/art/beast.js` is a separate file.

Four animations rather than six: **idle**, **walk**, **attack**, **hurt**,
**die**. A beast has no cast, and fifty species times two extra rows is a great
deal of PNG for something nobody would look at.

Fifty creatures cannot each be drawn by hand and should not be. The **family**
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

The ten solo monsters are hand-shaped instead. There are few enough to be worth
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
world units — and there are fifty of them; at the hero's cell size the creature
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
sprite sheets to show thirteen small pictures. The raid has the opposite
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
node tools/lineup.mjs idle 0 170         # all thirteen classes in one pose
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
node tools/test-bags.mjs        # needs Playwright; skips if absent
node tools/test-navigation.mjs  # needs Playwright; skips if absent
node tools/test-layout.mjs      # needs Playwright; skips if absent
node tools/test-unlocks.mjs     # needs Playwright; skips if absent
node tools/test-forge.mjs       # needs Playwright; skips if absent
node tools/test-huntpad.mjs     # needs Playwright; skips if absent
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

`test-ecology.js` covers how the map allocates its animals and what happens
once they are dead. None of it is a property of a function — it is a property
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
asserts the map invariant the whole system rests on across a hundred maps:
every hunt the map offers resolves to somewhere the squad can walk. Since a
species only falls below two camps on about one map in a hundred, that check
would pass whether or not the filter behind it exists, so the file injects the
bug too — advertise a species off a single camp and the list stops being
answerable.

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
| Farm the ring | 5 | 12 | 8 | 3 | 1 | 31.5 | 0.42 |
| Solo hunt | 5 | 8 | 0 | 1 | 7 | 1.5 | 0.38 |
| Solo hunt | 14 | 8 | 0 | 3 | 5 | 7.0 | 3.25 |
| Squad hunter | 10 | 8 | 7 | 0 | 1 | 41.1 | 1.88 |

That spread is the intent: farming packs is a reliable income, and the solo
monsters are a place you earn the right to visit. A level-5 solo hunt wipes
seven times in eight and brings home under two parts; the same plan at 14 kills
3.25 of them a raid and still wipes five times in eight.

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
