// Procedural raid map. One big square world divided into three concentric
// danger rings; the deeper you go the better the spawns and the loot.

import { makeRng, rand, randInt, chance, pick, shuffle, randomInCircle } from '../core/rng.js';
import { dist, clamp } from '../core/vec.js';
import { CREATURES } from '../data/creatures.js';

const PACK_SPECIES = Object.values(CREATURES).filter((c) => c.hunt === 'small');

// How many small species each ring draws. Five is the smallest number that
// still gives every species on the map both pack sizes and enough camps to
// keep hunting one all raid; going higher thins each species back out until a
// hunt order is a search again.
const FAUNA_PER_RING = 5;
const CAMPS_PER_SPECIES = 4;

// The raid map is deliberately huge: crossing it corner to corner takes a
// third of the 30-minute timer on foot before you have fought anything, so
// where you land and where you extract are real decisions rather than
// formalities.
//
// It grew from 14000 when the camps were spread out. Nothing about the old
// size was wrong for the number of camps on it; it was wrong for eighty camps
// that have to keep 1200 units apart, which needs about a third more room. See
// CAMP_SEPARATION.
//
export const WORLD_SIZE = 16000;
export const CENTER = { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2 };

// Danger rings, measured from the centre, at the same fractions of the world
// they have always been. The spawn ring sits at 0.42 of the world — 6720, well
// outside RING_MID — so a fresh squad is never dropped next to core spawns.
export const RING_CORE = Math.round(WORLD_SIZE * 0.185); // tier 2
export const RING_MID = Math.round(WORLD_SIZE * 0.33);   // tier 1, outside that is tier 0

// --- Where the animals go ---------------------------------------------------

// No two camps sit closer than this.
//
// The old generator threw camps down uniformly and let them land where they
// fell. Measured over forty maps the nearest other camp averaged 794 units
// away, two in three were within 900, and the closest pair on one map was 41
// units apart — two packs occupying the same clearing. What that felt like
// was the complaint: half of all gaps between fights ran under ten seconds,
// and a fifth of the time a squad was in contact it was in contact with two
// camps at once.
//
// With the floor in, short gaps are down to a quarter of all gaps and two
// camps at once to one per cent, and most of the short gaps left are the same
// species — which is the point. Inside Sicklejaw country you meet Sicklejaws;
// between countries you walk.
//
// 1200 rather than more because the floor is paid for in room: eighty camps
// holding this far apart is already most of what a 16000 world will take
// without the placement starting to fail, and every hundred units on top of it
// is another slice of the world. See WORLD_SIZE.
const CAMP_SEPARATION = 1200;

// How many camps a map holds, and how many of a species share one range.
//
// The count is not free to raise: camps no longer respawn, so this is the
// whole of a raid's pack content, split between six squads. It is not free to
// lower either, for the same reason.
//
const CAMP_COUNT = 88;
const RANGE_CAMPS = 5;

// A range wants to be the smallest disk that comfortably holds its camps at
// CAMP_SEPARATION. Dart-throwing stalls well short of a packed disk, so a
// range that is full spills into the species' other ranges and then grows,
// rather than dropping the camp — see `placeCamp`. Widening this instead was
// tried and is the wrong trade: 0.62 to 0.95 buys 1.3 camps a map and costs
// twenty-five points of clustering (80% to 55%), because the binding
// constraint is the density of the whole country, not of one range in it.
const rangeRadius = (n) => CAMP_SEPARATION * 0.62 * Math.sqrt(n);

// Daylight between one species' range and the next. Soft: ranges are scored
// against it, not rejected, so a crowded ring gives ground gracefully instead
// of failing to place anything.
const RANGE_GAP = 900;

// The share of each ring that its solo grounds take out of circulation:
// everything within ARENA_CAMP_CLEAR of a ground is ground no camp can use.
// Measured by sampling maps, and re-measured by tools/test-ecology.js so that
// moving a ground or changing the clearance fails a check rather than quietly
// over-promising camps.
//
// The core is the striking one. Four grounds, each keeping fifteen hundred
// units of room, inside a disk of radius 2960 leaves an eighth of it — which
// is why the core holds one pack species and not five. Splitting that eighth
// between two species gave both of them two camps and then pruned one off the
// hunt list for having one.
//
// Re-measured after the roster went to twenty-three grounds and the map
// started drawing nine of them: 0.03 / 0.44 / 0.79. The core takes less than
// it did, because four core grounds drawn from eight land at eight different
// radii across raids instead of always the same four — the same count, spread
// over more of the ring, overlapping each other less.
const RING_TAKEN = { 0: 0.03, 1: 0.44, 2: 0.79 };

const MAP_MARGIN = 420;
// Fractions of the world, like the ring radii and the grounds themselves.
// Left as the absolute numbers they were tuned at, these two swallowed the
// whole score on a smaller map — four core grounds trying to hold 2140 apart
// inside a core of radius 2960 have no freedom left to spend on anything else,
// and the innermost one sat 300 units from a camp because separation had
// already decided where it was going.
const ARENA_SEPARATION = WORLD_SIZE * 0.107;
const ARENA_SPAWN_CLEAR = WORLD_SIZE * 0.1855;
// Near its prey, not on top of it. This has to clear two different things: a
// pack's aggro range, which tops out at 420, and BOSS_WAKE in `match.js`, so
// that clearing a camp does not wake the animal that hunts the camp. At 1100
// it cleared the first and not the second, and squads under a mid-ring hunt
// order were meeting a Tyrannoclast three minutes in because the order routed
// them past its ground. Half of them died there.
//
// It is paid for in camps — every ground's exclusion disk is ground the ring
// cannot use, and 1100 to 1500 costs five camps a map while 1800 costs ten —
// which is why BOSS_WAKE came down to meet this rather than this going up to
// meet BOSS_WAKE.
//
// It is a hard constraint on the camps rather than on the grounds, because the
// grounds are the side with no room to manoeuvre: a ground has an angle and a
// ninth of its radius to play with, a camp has a whole country. Placed the
// other way round the innermost ground ended up 300 units from a pack.
const ARENA_CAMP_CLEAR = 1500;
// What a ground will trade for being nearer its prey, against the three
// clearances above. At even weight it paid thousands of units to close on a
// camp and two thirds of all grounds ended up inside ARENA_CAMP_CLEAR of one;
// at a half it still crosses the ring to find the right country but will not
// buy the last fifteen hundred units with a pack in its lap.
const PREY_PULL = 0.5;

// The solo grounds, at fixed fractions of the world radius. The radii are
// difficulty signposting — each ground grants a class on its first kill (see
// `src/data/achievements.js`), so the outer-ring animal is the one a fresh
// squad can take and the core three are the end of a long raid — and they are
// fractions so that resizing the world moves the whole ladder together.
// Radii carry a margin wider than the +/-11% the placer jitters them by, so a
// ground is always inside the ring whose difficulty its trophy claims. The old
// ladder did not: Mirethane sat at 0.186 against a RING_CORE of 0.185 and
// landed in the core on any seed that jittered it inward, and Bastionback at
// 0.371 straddled RING_MID the same way. With twenty-three of them the odds of
// at least one being mislabelled every map were no longer worth carrying.
//
//   tier 0 needs r * 0.89 > 0.33   ->  r > 0.371
//   tier 1 needs r * 1.11 < 0.33   ->  r < 0.297,  and r * 0.89 > 0.185 -> r > 0.208
//   tier 2 needs r * 1.11 < 0.185  ->  r < 0.166
const ARENA_SPEC = [
  // Outer ring: outside RING_MID, inside the spawn ring at 0.42.
  { id: 'ground_thornmother', bossId: 'thornmother', at: 0.403, tier: 0 },
  { id: 'ground_bastionback', bossId: 'bastionback', at: 0.388, tier: 0 },
  { id: 'ground_broodsire', bossId: 'broodsire', at: 0.374, tier: 0 },

  // Mid ring.
  { id: 'ground_snatchwing', bossId: 'snatchwing', at: 0.297, tier: 1 },
  { id: 'ground_tyrannoclast', bossId: 'tyrannoclast', at: 0.284, tier: 1 },
  { id: 'ground_standhorn', bossId: 'standhorn', at: 0.272, tier: 1 },
  { id: 'ground_deepdelver', bossId: 'deepdelver', at: 0.259, tier: 1 },
  { id: 'ground_mirrorscale', bossId: 'mirrorscale', at: 0.246, tier: 1 },
  { id: 'ground_glaciermaw', bossId: 'glaciermaw', at: 0.234, tier: 1 },
  { id: 'ground_sinkjaw', bossId: 'sinkjaw', at: 0.221, tier: 1 },
  { id: 'ground_mirethane', bossId: 'mirethane', at: 0.208, tier: 1 },

  // Core.
  { id: 'ground_hexmaw', bossId: 'hexmaw', at: 0.164, tier: 2 },
  { id: 'ground_pyroclast', bossId: 'pyroclast', at: 0.151, tier: 2 },
  { id: 'ground_sigilborn', bossId: 'sigilborn', at: 0.135, tier: 2 },
  { id: 'ground_stormcrest', bossId: 'stormcrest', at: 0.119, tier: 2 },
  { id: 'ground_doomcrier', bossId: 'doomcrier', at: 0.103, tier: 2 },
  { id: 'ground_venomcoil', bossId: 'venomcoil', at: 0.087, tier: 2 },
  { id: 'ground_everstand', bossId: 'everstand', at: 0.071, tier: 2 },
  { id: 'ground_skyrender', bossId: 'skyrender', at: 0.055, tier: 2 },
];

// How many solo grounds a raid puts out, per ring.
//
// One, four and four: what the map carried when this ladder and every number
// around it were measured. The outer ring gets one because a fresh squad
// should meet an apex it can take rather than choose between three.
const GROUNDS_PER_RING = { 0: 1, 1: 4, 2: 4 };

/**
 * Which grounds are out this raid. Drawn per ring, then ordered outward-in.
 *
 * The order matters as much as the draw: the placer seats them in sequence and
 * each one scores against the ones already down, so going outward-in leaves the
 * leftovers to the roomy ring rather than to the core.
 */
function drawGrounds(rng) {
  const out = [];
  for (const tier of [0, 1, 2]) {
    const OLD = new Set(['bastionback','tyrannoclast','deepdelver','glaciermaw','mirethane','pyroclast','stormcrest','venomcoil','skyrender']);
    const pool = ARENA_SPEC.filter((s) => s.tier === tier && OLD.has(s.bossId));
    const want = Math.min(GROUNDS_PER_RING[tier] ?? 0, pool.length);
    out.push(...shuffle(rng, pool.slice()).slice(0, want));
  }
  return out.sort((a, b) => b.at - a.at);
}

// A flat draw, and deliberately. Drawing four mid apexes from eight sometimes
// puts out four that eat the same families, and a ring seats about nine
// species — so the later ones settle for prey off their diet, which is why
// on-diet placement sits at 69% against the 75% the old fixed, hand
// complementary set of four managed.
//
// Choosing greedily for diet spread instead was written and measured and is
// worse on both counts: on-diet fell to 66%, because the apex with the most
// unusual diet is not the apex the ring drew food for, and it skewed which
// grounds a player sees — Snatchwing on 73% of maps against Standhorn on 36%,
// when the whole point of drawing them is that each is roughly as findable as
// the next.

export const SPAWN_COUNT = 12;
export const EXTRACT_COUNT = 3;
export const SPAWN_SAFE_RADIUS = 340;
export const EXTRACT_RADIUS = 150;

/** Danger tier at a world position: 0 outer, 1 mid, 2 core. */
export function tierAt(pos) {
  const d = dist(pos, CENTER);
  if (d < RING_CORE) return 2;
  if (d < RING_MID) return 1;
  return 0;
}

export const BIOMES = {
  fields: { id: 'fields', name: 'Ashen Fields', ground: '#48503c', accent: '#5d6650' },
  forest: { id: 'forest', name: 'Blackwood', ground: '#34432f', accent: '#46583f' },
  ruins: { id: 'ruins', name: 'Sunken Ruins', ground: '#464350', accent: '#585469' },
  waste: { id: 'waste', name: 'The Waste', ground: '#584b3b', accent: '#6d5d49' },
  sanctum: { id: 'sanctum', name: 'Inner Sanctum', ground: '#413456', accent: '#54446e' },
};

/**
 * Build a full map instance.
 * @param {number} seed
 */
export function generateMap(seed) {
  const rng = makeRng(seed);
  const map = {
    seed,
    size: WORLD_SIZE,
    center: { ...CENTER },
    spawns: [],
    extracts: [],
    obstacles: [],
    pois: [],
    regions: [],
  };

  // --- Regions: a coarse Voronoi-ish grid used only for ground colour. ------
  // Scaled with the world so biomes stay about the size they were rather than
  // stretching to half a map each.
  const regionCount = 150;
  for (let i = 0; i < regionCount; i++) {
    const p = { x: rand(rng, 200, WORLD_SIZE - 200), y: rand(rng, 200, WORLD_SIZE - 200) };
    const t = tierAt(p);
    const biome = t === 2 ? BIOMES.sanctum : pick(rng, [BIOMES.fields, BIOMES.forest, BIOMES.ruins, BIOMES.waste]);
    map.regions.push({ ...p, biome: biome.id });
  }

  // --- Spawn points: 12 evenly spaced around the outer ring ----------------
  const spawnRadius = WORLD_SIZE * 0.42;
  const spawnJitter = rng() * Math.PI * 2;
  for (let i = 0; i < SPAWN_COUNT; i++) {
    const a = spawnJitter + (i / SPAWN_COUNT) * Math.PI * 2;
    map.spawns.push({
      id: `spawn_${i}`,
      index: i,
      x: CENTER.x + Math.cos(a) * spawnRadius,
      y: CENTER.y + Math.sin(a) * spawnRadius,
      radius: SPAWN_SAFE_RADIUS,
      name: `Landing ${romanize(i + 1)}`,
    });
  }

  // --- Extraction points ---------------------------------------------------
  // Placed between the rings and offset from the spawn arc so nobody lands on
  // top of an exit. Windows are staggered so the map has a rhythm.
  const extractRadius = WORLD_SIZE * 0.28;
  const extractJitter = spawnJitter + Math.PI / SPAWN_COUNT;
  const windows = [
    { opensAt: 180, closesAt: 1560 },
    { opensAt: 420, closesAt: 1680 },
    { opensAt: 660, closesAt: 1800 },
  ];
  const names = ['Old Mill Crossing', 'Riverwatch Ferry', 'Cliffside Signal'];
  for (let i = 0; i < EXTRACT_COUNT; i++) {
    const a = extractJitter + (i / EXTRACT_COUNT) * Math.PI * 2;
    map.extracts.push({
      id: `extract_${i}`,
      index: i,
      x: CENTER.x + Math.cos(a) * extractRadius,
      y: CENTER.y + Math.sin(a) * extractRadius,
      radius: EXTRACT_RADIUS,
      name: names[i],
      channelSeconds: 8,
      ...windows[i],
    });
  }

  // --- Points of interest --------------------------------------------------
  // Camps hold pack species; the solo grounds hold one large creature each.

  // Camps per ring, in proportion to the ring's area, so the country is no
  // denser in the core than out at the edge. The old generator got this for
  // free by scattering camps uniformly and reading the tier off where they
  // landed; placing them ring by ring means saying it out loud.
  const ringArea = {
    2: Math.PI * RING_CORE ** 2,
    1: Math.PI * (RING_MID ** 2 - RING_CORE ** 2),
    0: WORLD_SIZE ** 2 - Math.PI * RING_MID ** 2,
  };
  const totalArea = ringArea[0] + ringArea[1] + ringArea[2];
  const ringCamps = {};
  for (const t of [0, 1, 2]) ringCamps[t] = Math.round(CAMP_COUNT * ringArea[t] / totalArea);

  // A raid has a fauna rather than the whole bestiary. Each ring draws a few
  // of the species that live in it, and every camp in that ring is one of
  // them.
  //
  // This is what makes a hunt order answerable. Spreading forty species over
  // seventy camps gave a species three camps if it was lucky and none of the
  // larger packs at all, so "hunt a large pack of Sicklejaw" named something
  // that did not exist on the map — an order the squad could search for until
  // the timer ran out. Dividing the ring's camps by CAMPS_PER_SPECIES keeps a
  // species' deal well clear of the two camps it needs for both pack sizes,
  // rather than leaving it to luck: a flat number does not, and an earlier
  // version that insisted on three species a ring put the bug straight back.
  //
  // The deal is not the guarantee, though. A crowded ring can take a camp back
  // off a species after it is dealt, so what actually holds the invariant is
  // downstream: `dealPackSizes` gives both sizes to anything with two camps,
  // and anything left under two is dropped from this list below.
  //
  // It also makes maps differ from each other, which forty-species-everywhere
  // never did: what lives here is a fact about this raid, and worth knowing.
  // The grounds are drawn per raid too, and for the same reason the packs are.
  //
  // Twenty specified grounds will not fit on a map alongside the packs. Each
  // keeps ARENA_CAMP_CLEAR of room, so twenty ask for 163 million square units
  // of exclusion against a usable disk of 142 million — more than the whole
  // map — and the ring that pays is the core, which fell from 4.7 camps to 1.9
  // when this was tried. Growing the world does fit them and costs reach
  // instead: at 20000 a mid-ring hunt order came home with something in three
  // raids of eight against seven, because a thirty-minute raid crosses a fixed
  // distance and the map had grown a quarter.
  //
  // So a raid gets GROUNDS_PER_RING of them rather than all of them. That puts
  // the load back exactly where every number here was measured — nine placed
  // grounds and Nightfell — and makes which apexes are out a fact about this
  // raid rather than a constant. The hunt pad already lists only what is here,
  // and the three walkers arrive whichever grounds were drawn.
  const drawnSpecs = drawGrounds(rng);
  const bossesInRing = { 0: [], 1: [], 2: [] };
  for (const spec of drawnSpecs) bossesInRing[spec.tier].push(CREATURES[spec.bossId]);
  const fauna = {};
  for (const tier of [0, 1, 2]) {
    const pool = PACK_SPECIES.filter((c) => c.tier === tier);
    // How many species the ring can seat, not how many camps it was dealt.
    // A ring gets its camps in proportion to its area, but a ring most of
    // which is inside a solo ground's clearance cannot put them down, so
    // dividing the raw deal between species promised four camps each and
    // delivered two.
    const seats = ringCamps[tier] * (1 - RING_TAKEN[tier]);
    const want = clamp(Math.floor(seats / CAMPS_PER_SPECIES), 1, FAUNA_PER_RING);
    fauna[tier] = drawFauna(rng, pool, Math.min(want, pool.length), bossesInRing[tier]);
  }
  map.fauna = Object.fromEntries(Object.entries(fauna).map(([t, list]) => [t, list.map((c) => c.id)]));

  planRanges(map, rng, fauna, ringCamps);

  // Solo hunting grounds keep their fixed radius from the centre. The angle is
  // ecology: each apex names a diet in `src/data/creatures.js`, picks the
  // best-liked pack species its ring actually drew, and sits on that species'
  // country. They are placed before the camps because the ground is the one
  // with no room to manoeuvre — see `fillRanges`.
  const placedArenas = [];
  const claimedPrey = new Set();
  for (const spec of drawnSpecs) {
    const def = CREATURES[spec.bossId];
    const radius = WORLD_SIZE * spec.at;
    const preyId = choosePrey(def, map.ranges, spec.tier, radius, claimedPrey);
    if (preyId) claimedPrey.add(preyId);
    const preyRanges = map.ranges.filter((r) => r.speciesId === preyId);

    // Score rather than reject. Four things compete for the angle — clear of
    // the landing zones, clear of the other grounds, clear of anyone's
    // country, close to the prey's — and on a crowded ring something has to
    // give. Penalising a shortfall in proportion to how short it is picks the
    // least bad angle; the old first-past-the-post version kept whatever the
    // last attempt happened to be whenever nothing satisfied it.
    let best = null;
    let bestScore = -Infinity;
    // Angle and a little radius. Pinned to one exact circle the search is
    // one-dimensional, and the innermost ground threads a circle seven
    // thousand units around through the most crowded ring on the map. A ninth
    // either way keeps the ladder's order intact and gives the scorer
    // somewhere to go.
    for (let attempt = 0; attempt < 640; attempt++) {
      const a = rng() * Math.PI * 2;
      const r = radius * (1 + rand(rng, -0.11, 0.11));
      const p = { x: CENTER.x + Math.cos(a) * r, y: CENTER.y + Math.sin(a) * r };
      const fromSpawns = Math.min(...map.spawns.map((sp) => dist(p, sp)));
      const fromArenas = placedArenas.length ? Math.min(...placedArenas.map((q) => dist(p, q))) : Infinity;
      // Distance to the country's centre, not to its edge. Measured to the
      // edge this pushed every ground a full range-radius clear of the herd it
      // came for — a Tyrannoclast ended up 4700 units from its prey, which is
      // not "near" by any reading. It does not need that much room: the real
      // clearance is enforced on the camps, by `placeCamp`, so measuring to
      // the centre leaves the ground sitting on the edge of the country rather
      // than a range's width outside it.
      const fromRanges = map.ranges.length
        ? Math.min(...map.ranges.map((c) => dist(p, c))) : Infinity;
      const toPrey = preyRanges.length ? Math.min(...preyRanges.map((c) => dist(p, c))) : 0;
      const score = -12 * short(fromSpawns, ARENA_SPAWN_CLEAR)
        - 12 * short(fromArenas, ARENA_SEPARATION)
        - 12 * short(fromRanges, ARENA_CAMP_CLEAR)
        - PREY_PULL * toPrey;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    placedArenas.push(best);
    map.pois.push({
      id: spec.id, kind: 'boss', bossId: spec.bossId, radius: 380,
      x: best.x, y: best.y, tier: spec.tier, preyId,
    });
  }

  const camps = fillRanges(map, rng);
  for (const c of camps) map.pois.push(c);

  // Advertise only what the map can deliver. A species is dealt at least four
  // camps, but a crowded ring can take one or two of them back, and a species
  // left with a single camp has a single pack size — so a hunt naming its
  // other one would send the squad looking for something that is not here,
  // which is the exact failure the fauna draw exists to prevent. The camp
  // stays on the map as an outlier den; it is just not offered as a hunt.
  const dealt = new Map();
  for (const c of camps) dealt.set(c.speciesId, (dealt.get(c.speciesId) ?? 0) + 1);
  for (const tier of Object.keys(map.fauna)) {
    map.fauna[tier] = map.fauna[tier].filter((id) => (dealt.get(id) ?? 0) >= 2);
  }

  // The apex boss wakes at the exact centre when its event fires.
  map.pois.push({ id: 'ground_nightfell', kind: 'boss_event', bossId: 'nightfell', x: CENTER.x, y: CENTER.y, radius: 520, tier: 2 });

  // Event sites: fixed anchors the scheduled world events attach to.
  const eventAnchors = shuffle(rng, map.pois.filter((p) => p.kind === 'camp')).slice(0, 6);
  map.eventSites = eventAnchors.map((p, i) => ({ id: `site_${i}`, x: p.x, y: p.y }));

  // --- Obstacles: clustered rocks and ruins that block movement ------------
  // Temporarily switched off. Everything below still works — the grid, the
  // collision resolution, the steering that avoids and detours around
  // scenery — it simply has nothing to act on, so raids are fought on open
  // ground. Set this back to 420 to bring the rocks back.
  //
  // They are the source of the one movement problem this project has never
  // properly solved: a hero wedged between two rocks that steering forces plus
  // collision resolution cannot free. With none on the map, heroes stuck with
  // somewhere to be fall from 8.3% of the time to effectively zero.
  const OBSTACLE_CLUSTERS = 0;
  for (let c = 0; c < OBSTACLE_CLUSTERS; c++) {
    const cx = rand(rng, 150, WORLD_SIZE - 150);
    const cy = rand(rng, 150, WORLD_SIZE - 150);
    const n = randInt(rng, 2, 6);
    for (let i = 0; i < n; i++) {
      const p = { x: cx + rand(rng, -200, 200), y: cy + rand(rng, -200, 200) };
      if (p.x < 60 || p.y < 60 || p.x > WORLD_SIZE - 60 || p.y > WORLD_SIZE - 60) continue;
      if (!clearOfSpawnsAndExits(map, p, 200)) continue;
      map.obstacles.push({ x: p.x, y: p.y, r: rand(rng, 22, 62), kind: chance(rng, 0.5) ? 'rock' : 'ruin' });
    }
  }

  map.grid = buildObstacleGrid(map);
  return map;
}

// --- Placing the fauna ------------------------------------------------------

const short = (value, want) => Math.max(0, want - value);

/**
 * Draw a ring's fauna, weighted toward what its apexes eat.
 *
 * A ring holds two to five of the dozen-odd species that live at its depth, so
 * an unweighted draw leaves a core Stormcrest with nothing on its diet about
 * half the time — and a predator placed next to prey it does not eat is not
 * ecology, it is a coincidence. Weighting by the diets of the animals that
 * hunt over the ring makes the food chain hold on most maps without making
 * every map the same: a family no apex here eats still has a weight of one and
 * still gets drawn.
 *
 * A family's weight is spent once it is drawn. One species of delver feeds
 * every delver-eater on the ring, and draining the weight keeps the rest of
 * the draw varied instead of filling a ring with four kinds of the same
 * animal.
 */
function drawFauna(rng, pool, want, bosses) {
  const appetite = new Map();
  for (const boss of bosses) {
    (boss.prey ?? []).forEach((family, i) => {
      appetite.set(family, (appetite.get(family) ?? 0) + Math.max(1, 4 - i));
    });
  }
  // Draw a family, then a species from it. Weighting the species directly
  // hands the bias straight back to whichever family happens to have the most
  // members: the core's three venomites outvoted its one wyverling six to one,
  // so the ring an apex wyvern hunts over drew what an apex wyvern does not
  // eat. Families are what a diet names, so families are what gets weighted.
  const families = new Map();
  for (const c of pool) {
    if (!families.has(c.family)) families.set(c.family, []);
    families.get(c.family).push(c);
  }
  const out = [];
  while (out.length < want && families.size) {
    const keys = [...families.keys()];
    const weights = keys.map((k) => 1 + (appetite.get(k) ?? 0));
    let roll = rng() * weights.reduce((a, b) => a + b, 0);
    let i = 0;
    while (i < keys.length - 1 && (roll -= weights[i]) > 0) i++;
    const family = families.get(keys[i]);
    out.push(family[Math.floor(rng() * family.length)]);
    // One species of delver feeds every delver-eater on the ring, so a family
    // is spent once it is drawn. That keeps the rest of the draw varied
    // instead of filling a ring with four kinds of the same animal.
    families.delete(keys[i]);
  }
  return out.length ? out : pool.slice(0, 1);
}

/** A point drawn uniformly by area from a ring, or null if it fell off the map. */
function sampleInRing(rng, tier) {
  const [lo, hi] = tier === 2 ? [MAP_MARGIN, RING_CORE]
    : tier === 1 ? [RING_CORE, RING_MID]
      : [RING_MID, WORLD_SIZE * 0.72];
  // Uniform in area, not in radius, or the outer ring piles everything it has
  // against its inner edge. Beyond RING_MID the ring is a square with a hole
  // in it rather than an annulus, so the corners are reached by sampling out
  // to the diagonal and dropping what lands outside the world.
  const r = Math.sqrt(rand(rng, lo * lo, hi * hi));
  const a = rng() * Math.PI * 2;
  const p = { x: CENTER.x + Math.cos(a) * r, y: CENTER.y + Math.sin(a) * r };
  if (p.x < MAP_MARGIN || p.y < MAP_MARGIN
      || p.x > WORLD_SIZE - MAP_MARGIN || p.y > WORLD_SIZE - MAP_MARGIN) return null;
  return p;
}

/**
 * Somewhere in `tier` with room for a range of `n` camps.
 *
 * Everything here is scored rather than rejected, and the best of a hundred
 * and sixty samples wins. Hard rejection was tried and it loses whole ranges:
 * a constraint that nothing on a crowded ring can satisfy returns nothing at
 * all, and four camps go with it.
 *
 * Three pulls, in descending strength. Keep the range's disk on the map — a
 * centre a thousand units from the edge spends most of its camps' attempts
 * throwing darts into the sea, which is where the outer ring was losing three
 * camps a map. Keep RANGE_GAP from another species' range. And sit next to
 * this species' other ranges, because a species holds one country made of
 * several ranges rather than several unrelated patches: without that pull the
 * nearest camp to a camp was its own species 69% of the time, with it, 84%.
 */
function placeRangeCentre(map, rng, tier, n, own) {
  const radius = rangeRadius(n);
  let best = null;
  let bestScore = -Infinity;
  for (let attempt = 0; attempt < 160; attempt++) {
    const p = sampleInRing(rng, tier);
    if (!p) continue;
    if (!clearOfSpawnsAndExits(map, p, radius)) continue;
    const wall = Math.min(p.x, p.y, WORLD_SIZE - p.x, WORLD_SIZE - p.y) - MAP_MARGIN;
    let gap = Infinity;
    for (const o of map.ranges) {
      if (own.includes(o)) continue;
      gap = Math.min(gap, dist(p, o) - o.radius - radius);
    }
    let mine = Infinity;
    for (const o of own) mine = Math.min(mine, dist(p, o));
    const score = Math.min(gap, RANGE_GAP)
      - 3 * short(wall, radius * 0.7)
      - (own.length ? 0.35 * mine + 2 * short(mine, radius * 1.6) : 0);
    if (score > bestScore) { bestScore = score; best = { ...p, radius }; }
  }
  return best;
}

/**
 * A camp site inside `range`, CAMP_SEPARATION clear of every camp so far.
 *
 * Two ways out when the range is full. Spill into the species' other ranges
 * first — a country is contiguous, so a camp that will not fit in one part of
 * it belongs in another part of it rather than nowhere. Only then grow the
 * search outward.
 *
 * Giving up costs the species a camp, and a species that ends up under four
 * camps loses one of its two pack sizes, which loses the player a hunt they
 * were told on the drop that they could take. Left to give up, the outer ring
 * came up seven camps short of its budget every map and two species a batch
 * fell under the four.
 */
function placeCamp(map, rng, camps, arenas, range, own, tier) {
  const order = [range, ...own.filter((o) => o !== range)];
  for (let round = 0; round < 6; round++) {
    for (const r of order) {
      const reach = r.radius * (1 + round * 0.25);
      for (let attempt = 0; attempt < 30; attempt++) {
        const off = randomInCircle(rng, reach);
        const p = { x: r.x + off.x, y: r.y + off.y };
        if (p.x < MAP_MARGIN || p.y < MAP_MARGIN
            || p.x > WORLD_SIZE - MAP_MARGIN || p.y > WORLD_SIZE - MAP_MARGIN) continue;
        // A camp outside its own ring would be holding a species from another
        // ring's fauna, which is exactly what `Match#fauna` promises the
        // player it is not.
        if (tierAt(p) !== tier) continue;
        if (!clearOfSpawnsAndExits(map, p, 520)) continue;
        let clear = true;
        for (const c of camps) if (dist(p, c) < CAMP_SEPARATION) { clear = false; break; }
        if (clear) for (const a of arenas) if (dist(p, a) < ARENA_CAMP_CLEAR) { clear = false; break; }
        if (clear) return { p, range: r };
      }
    }
  }
  return null;
}

/**
 * Deal each ring's camps to its fauna and choose the country each species
 * holds. Camps go down later, in `fillRanges`.
 *
 * A species holds ranges rather than a scatter. The old generator dealt camps
 * round-robin over sites thrown down anywhere, which put a species' five camps
 * an average of 3600 units from their own centre — across a third of the map,
 * interleaved with every other species. Country did not mean anything: you
 * could not be in Sicklejaw country, only near a Sicklejaw camp. Now the
 * nearest camp to a camp is its own species four times in five.
 *
 * Ranges are capped at RANGE_CAMPS so a species dealt eleven camps holds two
 * or three of them rather than one enormous one. That is both truer — an
 * animal occupies several ranges, not one giant territory — and tighter,
 * because the disk that holds five camps is half the radius of the disk that
 * holds twenty.
 *
 * Rings are planned tightest-first. The core is a tenth of the map's area and
 * has four solo grounds in it as well, so it chooses its ground before the
 * outer ring, which has room to spare, starts taking any.
 */
function planRanges(map, rng, fauna, ringCamps) {
  map.ranges = [];
  for (const tier of [2, 1, 0]) {
    const list = fauna[tier];
    const budget = ringCamps[tier];
    for (let si = 0; si < list.length; si++) {
      const species = list[si];
      // Round-robin, so nobody is left short of the camps that guarantee a
      // species both pack sizes.
      const mine = Math.floor(budget / list.length) + (si < budget % list.length ? 1 : 0);
      // Split into even ranges rather than filling each to RANGE_CAMPS and
      // leaving the remainder its own. Eleven camps is three ranges of four,
      // four and three, not five, five and a lone den.
      const groups = Math.max(1, Math.ceil(mine / RANGE_CAMPS));
      const own = [];
      for (let g = 0; g < groups; g++) {
        const n = Math.floor(mine / groups) + (g < mine % groups ? 1 : 0);
        const centre = placeRangeCentre(map, rng, tier, n, own);
        if (!centre) continue;
        const range = {
          id: `range_${map.ranges.length}`, speciesId: species.id, tier,
          x: centre.x, y: centre.y, radius: centre.radius, want: n, camps: 0,
        };
        map.ranges.push(range);
        own.push(range);
      }
    }
  }
}

/**
 * Put the camps down inside the country planned above.
 *
 * This runs after the solo grounds are placed, and that order is the whole
 * point of splitting the two apart. A ground sits on a fixed radius from the
 * centre and has only an angle to give; a camp can go anywhere in its species'
 * country and has a spill and a growing search to find it. Camps placed first,
 * the innermost ground was left threading a circle through country that was
 * already full and ended up three hundred units from a pack. Grounds first,
 * the constraint lands on the side of the map that can afford it.
 */
function fillRanges(map, rng) {
  const camps = [];
  const arenas = map.pois.filter((p) => p.kind === 'boss');
  let campSeq = 0;
  for (const tier of [2, 1, 0]) {
    for (const range of map.ranges) {
      if (range.tier !== tier) continue;
      const own = map.ranges.filter((r) => r.speciesId === range.speciesId && r.tier === tier);
      for (let k = 0; k < range.want; k++) {
        const site = placeCamp(map, rng, camps, arenas, range, own, tier);
        if (!site) continue;
        camps.push({
          id: `camp_${campSeq++}`, kind: 'camp', x: site.p.x, y: site.p.y,
          tier, radius: 220, cleared: false,
          speciesId: range.speciesId, rangeId: site.range.id,
          packKind: 'small',   // dealt below, once the map knows what it has
        });
        site.range.camps++;
      }
    }
  }
  map.ranges = map.ranges.filter((r) => r.camps > 0);
  dealPackSizes(camps);
  return camps;
}

/**
 * Give every species on the map both a small pack and a large one.
 *
 * Deal the sizes rather than rolling them: a roll at roughly a third leaves a
 * species with three camps holding no large pack about a third of the time,
 * and "hunt a large pack of Sicklejaw" is then an order the squad can search
 * for until the timer runs out.
 *
 * Dealing has to happen after placement, not during it. Dealt as the camps go
 * down, a species that loses its second camp to a crowded ring loses its large
 * pack with it — which is how one species a map ended up with a single pack
 * size again, quietly, while the rule that was supposed to prevent it was
 * still right there in the code.
 */
function dealPackSizes(camps) {
  const bySpecies = new Map();
  for (const c of camps) {
    if (!bySpecies.has(c.speciesId)) bySpecies.set(c.speciesId, []);
    bySpecies.get(c.speciesId).push(c);
  }
  for (const list of bySpecies.values()) {
    // Second camp large, then every third, so a species with two camps has one
    // of each and a species with nine has three large.
    list.forEach((c, i) => { c.packKind = i % 3 === 1 ? 'large' : 'small'; });
  }
}

/**
 * Which species this apex is here for.
 *
 * Diet order decides, then whether another apex on this ring has already
 * claimed the species — two predators over one herd is perfectly good ecology,
 * but spreading them puts more of the map's animals next to something that
 * hunts them. Ties break on which prey the ground can actually get close to:
 * a solo keeps its fixed radius from the centre, so a species whose ranges sit
 * at that radius is one it can share ground with, and a species pressed
 * against the far edge of the ring is not.
 */
function choosePrey(def, ranges, tier, radius, claimed) {
  const here = ranges.filter((c) => c.tier === tier);
  const pool = here.length ? here : ranges;
  const species = [...new Set(pool.map((c) => c.speciesId))];
  if (!species.length) return null;
  const rank = (id) => {
    const i = (def.prey ?? []).indexOf(CREATURES[id]?.family);
    return i < 0 ? 99 : i;
  };
  const reach = (id) => {
    let best = Infinity;
    for (const c of pool) {
      if (c.speciesId !== id) continue;
      best = Math.min(best, Math.abs(dist(c, CENTER) - radius));
    }
    return best;
  };
  return species.sort((a, b) => rank(a) - rank(b)
    || (claimed.has(a) ? 1 : 0) - (claimed.has(b) ? 1 : 0)
    || reach(a) - reach(b))[0];
}

function clearOfSpawnsAndExits(map, p, pad) {
  for (const s of map.spawns) if (dist(p, s) < s.radius + pad) return false;
  for (const e of map.extracts) if (dist(p, e) < e.radius + pad) return false;
  return true;
}

// --- Broadphase -------------------------------------------------------------
// Obstacles never move, so bucket them once at generation time.

export const GRID_CELL = 300;

function buildObstacleGrid(map) {
  const cols = Math.ceil(WORLD_SIZE / GRID_CELL);
  const cells = new Map();
  for (const o of map.obstacles) {
    const minX = Math.max(0, Math.floor((o.x - o.r) / GRID_CELL));
    const maxX = Math.min(cols - 1, Math.floor((o.x + o.r) / GRID_CELL));
    const minY = Math.max(0, Math.floor((o.y - o.r) / GRID_CELL));
    const maxY = Math.min(cols - 1, Math.floor((o.y + o.r) / GRID_CELL));
    for (let gx = minX; gx <= maxX; gx++) {
      for (let gy = minY; gy <= maxY; gy++) {
        const key = gy * cols + gx;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(o);
      }
    }
  }
  return { cols, cells };
}

/**
 * Obstacles in the 3x3 cell neighbourhood of a point.
 *
 * KNOWN ISSUE: a rock wider than one cell is filed in every cell it covers,
 * so this can return the same obstacle several times, and `resolveCollisions`
 * below then pushes once per copy — flinging a hero out two to four times
 * harder than intended.
 *
 * De-duplicating it is correct and was tried. It makes movement measurably
 * worse: the over-strong push is currently acting as the main thing that
 * frees a hero wedged into a corner, and removing it took the worst pinned
 * stretch from 164s to 649s. Neither a terrain-normal escape nor wall sliding
 * compensated (661s and 1019s respectively). Fixing this properly means
 * giving `steer` a real character controller rather than move-then-unpenetrate,
 * so the de-duplication should land together with that, not before it.
 */
/**
 * Obstacles in the nine buckets around a point.
 *
 * `out` is filled and returned rather than a fresh array being built, because
 * this is the hottest function in the sim: three calls per entity per tick —
 * the obstacle lean, the stuck escape, the collision resolve — is sixty-five
 * thousand array allocations a second at two hundred and forty entities. Pass
 * a scratch array you own; the default exists for callers outside the tick,
 * like building the navigation grid.
 *
 * Callers must finish iterating before calling again with the same scratch.
 */
export function obstaclesNear(map, x, y, out = []) {
  const { cols, cells } = map.grid;
  const gx = Math.max(0, Math.min(cols - 1, Math.floor(x / GRID_CELL)));
  const gy = Math.max(0, Math.min(cols - 1, Math.floor(y / GRID_CELL)));
  out.length = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = gx + dx;
      const cy = gy + dy;
      if (cx < 0 || cy < 0 || cx >= cols || cy >= cols) continue;
      const bucket = cells.get(cy * cols + cx);
      if (!bucket) continue;
      for (let i = 0; i < bucket.length; i++) out.push(bucket[i]);
    }
  }
  return out;
}

/**
 * Push a circle out of any obstacle it overlaps. Cheap and stable — good
 * enough for a top-down sim where nothing moves fast enough to tunnel.
 */
const collideScratch = [];

export function resolveCollisions(map, pos, radius) {
  for (const o of obstaclesNear(map, pos.x, pos.y, collideScratch)) {
    const dx = pos.x - o.x;
    const dy = pos.y - o.y;
    const d = Math.hypot(dx, dy);
    const min = o.r + radius;
    if (d < min && d > 1e-4) {
      const push = (min - d) / d;
      pos.x += dx * push;
      pos.y += dy * push;
    } else if (d <= 1e-4) {
      pos.x += min;
    }
  }
  pos.x = Math.max(radius, Math.min(WORLD_SIZE - radius, pos.x));
  pos.y = Math.max(radius, Math.min(WORLD_SIZE - radius, pos.y));
  return pos;
}

/**
 * A circuit for one of the walkers.
 *
 * A ring of waypoints at a fraction of the world radius, jittered so two
 * raids do not run the same lap, and pushed off anything a squad has to be
 * able to stand on. Landing zones get the widest berth of the three: a
 * creature that walks a circle through the drop is a creature that eventually
 * spawn-camps somebody, and nothing else on this map is allowed to do that.
 * Exits get a berth too, but a smaller one — an extraction under pressure is
 * a good raid, an extraction that is impossible is not.
 *
 * The route is a loop, so the last point leads back to the first and the
 * walker never runs out of anywhere to be.
 */
// Waypoints are spaced by arc length rather than counted, so a leg is the same
// length whatever ring the circuit is on. That matters more than it sounds:
// a walker's leash is measured from its current waypoint, and the first
// version cut every circuit into fourteen points — which on the outer ring is
// a leg of 2441 units against a leash of 2200. Every single advance tripped
// the leash, so the walkers spent 99% of the raid in the give-up-and-go-home
// state, sprinting between waypoints at 1.5x speed and healing to full at
// each one. They were not patrolling. They were fleeing in a circle.
const PATROL_SPACING = 900;
// How many times a lap swings between its inner and outer radius.
const PATROL_PETALS = 3;
const PATROL_SPAWN_CLEAR = 600;
const PATROL_EXTRACT_CLEAR = 700;

/**
 * A circuit for one of the walkers.
 *
 * Not a circle. A circle was the first version and it was measured to be
 * nearly useless: a walker pinned to one radius only ever meets squads that
 * happen to be at that radius, and squads are wherever their plan puts them —
 * which for the default plan is the outer ring. Over ten raids the player
 * squad met the Cairnwalker on its wide lap three times and the two deeper
 * ones not once. Two of the three trophies were unreachable content.
 *
 * So a lap swings between an inner and an outer radius three times, and each
 * walker's band is deeper *and* wider than the last. That keeps the escalation
 * — the Duskherald starts in the core, where a squad has no business being at
 * twenty minutes — while guaranteeing all three cross the band where raids are
 * actually fought.
 *
 * The waypoints are then pushed off anything a squad has to be able to stand
 * on. Landing zones need less room than you would think: spawn protection
 * lasts 90 seconds and the earliest walker sets off at ten minutes, so by the
 * time one passes a landing there has been nobody in it for eight minutes —
 * that clearance is legibility, not safety. Exits are the opposite case, in
 * use from three minutes to thirty; 700 keeps a walker off the door without
 * keeping it away from the approach, which is the pressure these are for.
 */
/**
 * Shove one waypoint clear of the exits and landing zones, along its own
 * radius.
 *
 * The direction is whichever way is actually away from the thing being
 * cleared. Always pushing outward looks right and is wrong half the time: a
 * waypoint inside the landing ring pushed outward moves *toward* the landings,
 * and the outer circuit ended up shoved from 5400 units out to 8100 — through
 * the ring it was supposed to stay inside.
 */
function clearWaypoint(map, p) {
  let r = dist(p, CENTER);
  const a = Math.atan2(p.y - CENTER.y, p.x - CENTER.x);
  let out = { ...p };
  for (let pass = 0; pass < 12; pass++) {
    let worst = 0;
    let sign = 1;
    const consider = (o, clear) => {
      const short = clear - dist(out, o);
      if (short <= worst) return;
      worst = short;
      sign = dist(out, CENTER) >= dist(o, CENTER) ? 1 : -1;
    };
    for (const sp of map.spawns) consider(sp, PATROL_SPAWN_CLEAR);
    for (const ex of map.extracts) consider(ex, PATROL_EXTRACT_CLEAR);
    if (worst <= 0) break;
    r = Math.max(400, r + sign * worst * 0.7);
    out = { x: CENTER.x + Math.cos(a) * r, y: CENTER.y + Math.sin(a) * r };
  }
  return {
    x: clamp(out.x, MAP_MARGIN, WORLD_SIZE - MAP_MARGIN),
    y: clamp(out.y, MAP_MARGIN, WORLD_SIZE - MAP_MARGIN),
  };
}

export function patrolRoute(map, rng, from, to) {
  const inner = WORLD_SIZE * from;
  const outer = WORLD_SIZE * to;
  const mid = (inner + outer) / 2;
  const swing = (outer - inner) / 2;
  const count = Math.max(12, Math.round((2 * Math.PI * mid) / PATROL_SPACING));
  const turn = rng() * Math.PI * 2;
  const phase = rng() * Math.PI * 2;

  let points = [];
  for (let i = 0; i < count; i++) {
    const a = turn + (i / count) * Math.PI * 2;
    // Jitter the radius rather than the angle: even angular spacing is what
    // keeps the pace steady, and a wobbling radius is what stops the lap
    // reading as a drawn circle.
    const r = (mid + swing * Math.sin(PATROL_PETALS * (a - turn) + phase))
      * (0.94 + rng() * 0.12);
    points.push(clearWaypoint(map, { x: CENTER.x + Math.cos(a) * r, y: CENTER.y + Math.sin(a) * r }));
  }

  // Split any leg the clearance left over-long, and clear the new points too.
  //
  // Waypoints start evenly spaced, but shoving one radially clear of an exit
  // stretches the legs either side of it — measured at up to 2251 units
  // against a nominal 900 — and a leg is how far a walker is from its own
  // leash anchor the moment it advances. Subdividing without re-clearing does
  // not work either: the straight line between a pushed waypoint and its
  // neighbour cuts back across the exit it was pushed off, and midpoints
  // landed 78 units from a door. So it is both, twice, which converges.
  const LONG_LEG = PATROL_SPACING * 1.5;
  for (let pass = 0; pass < 3; pass++) {
    const next = [];
    let split = false;
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      next.push(a);
      const legs = Math.ceil(dist(a, b) / LONG_LEG);
      if (legs <= 1) continue;
      split = true;
      for (let k = 1; k < legs; k++) {
        next.push(clearWaypoint(map, {
          x: a.x + (b.x - a.x) * (k / legs),
          y: a.y + (b.y - a.y) * (k / legs),
        }));
      }
    }
    points = next;
    if (!split) break;
  }
  return points;
}

/** How long a landing zone protects the squads that dropped there. */
export const SPAWN_PROTECTION_SECONDS = 90;

export function isInsideAnySpawn(map, pos) {
  return map.spawns.some((s) => dist(pos, s) < s.radius);
}

export function extractIsOpen(extract, elapsed) {
  return elapsed >= extract.opensAt && elapsed <= extract.closesAt;
}

/** Nearest extract that is open now (or will be, if none are). */
export function bestExtract(map, pos, elapsed) {
  const open = map.extracts.filter((e) => extractIsOpen(e, elapsed));
  const pool = open.length ? open : map.extracts;
  let best = pool[0];
  let bestD = Infinity;
  for (const e of pool) {
    const d = dist(pos, e);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

function romanize(n) {
  const map = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of map) {
    while (n >= v) { out += s; n -= v; }
  }
  return out;
}
