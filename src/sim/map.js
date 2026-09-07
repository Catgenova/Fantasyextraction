// Procedural raid map. One big square world divided into three concentric
// danger rings; the deeper you go the better the spawns and the loot.

import { makeRng, rand, randInt, chance, pick, shuffle } from '../core/rng.js';
import { dist } from '../core/vec.js';

// The raid map is deliberately huge: crossing it corner to corner takes most
// of the 30-minute timer on foot, so where you land and where you extract are
// real decisions rather than formalities.
export const WORLD_SIZE = 14000;
export const CENTER = { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2 };

// Danger rings, measured from the centre. The spawn ring sits at ~5880, well
// outside RING_MID, so a fresh squad is never dropped next to core spawns.
export const RING_CORE = 2600; // tier 2
export const RING_MID = 4600;  // tier 1, outside that is tier 0

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
  const regionCount = 110;
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
  // Camps seed persistent enemy groups; arenas hold the two scheduled bosses.
  const campCount = 72;
  for (let i = 0; i < campCount; i++) {
    let p = null;
    for (let attempt = 0; attempt < 40; attempt++) {
      const c = { x: rand(rng, 400, WORLD_SIZE - 400), y: rand(rng, 400, WORLD_SIZE - 400) };
      if (clearOfSpawnsAndExits(map, c, 480)) { p = c; break; }
    }
    if (!p) continue;
    map.pois.push({ id: `camp_${i}`, kind: 'camp', x: p.x, y: p.y, tier: tierAt(p), radius: 220, cleared: false });
  }

  // Boss arenas sit at fixed radii but pick an angle that keeps them away from
  // any landing zone — nobody should be greeted by a boss on the drop — and
  // away from each other, so pulling one is never pulling two. Each grants a
  // class on its first kill (see `src/data/achievements.js`), so the radii
  // double as difficulty signposting: the outer-ring boss is the one a fresh
  // squad can take, and the core three are the end of a long raid.
  const arenaSpec = [
    { id: 'arena_knife', bossId: 'quiet_knife', radius: 5200, tier: 0 },
    { id: 'arena_grendrak', bossId: 'grendrak', radius: 3900, tier: 1 },
    { id: 'arena_gravemaw', bossId: 'gravemaw', radius: 3400, tier: 1 },
    { id: 'arena_hoarfrost', bossId: 'hoarfrost', radius: 3000, tier: 1 },
    { id: 'arena_emberjaw', bossId: 'emberjaw', radius: 1900, tier: 2 },
    { id: 'arena_ashenveil', bossId: 'ashenveil', radius: 1500, tier: 2 },
    { id: 'arena_malgareth', bossId: 'malgareth', radius: 1200, tier: 2 },
  ];
  const ARENA_SEPARATION = 1500;
  const placedArenas = [];
  for (const spec of arenaSpec) {
    let best = null;
    let bestScore = -Infinity;
    for (let attempt = 0; attempt < 64; attempt++) {
      const a = rng() * Math.PI * 2;
      const p = { x: CENTER.x + Math.cos(a) * spec.radius, y: CENTER.y + Math.sin(a) * spec.radius };
      const fromSpawns = Math.min(...map.spawns.map((sp) => dist(p, sp)));
      // Crowding another arena is the worse failure, so it dominates the score
      // until the gap is comfortable; after that the spawn distance decides.
      const fromArenas = placedArenas.length
        ? Math.min(...placedArenas.map((q) => dist(p, q)))
        : Infinity;
      const score = Math.min(fromSpawns, 2600) + Math.min(fromArenas, ARENA_SEPARATION) * 2;
      if (score > bestScore) { bestScore = score; best = p; }
      if (fromSpawns > 2600 && fromArenas > ARENA_SEPARATION) break;
    }
    placedArenas.push(best);
    map.pois.push({ id: spec.id, kind: 'boss', bossId: spec.bossId, radius: 380, x: best.x, y: best.y, tier: spec.tier });
  }

  // The apex boss wakes at the exact centre when its event fires.
  map.pois.push({ id: 'arena_apex', kind: 'boss_event', bossId: 'the_warden', x: CENTER.x, y: CENTER.y, radius: 520, tier: 2 });

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
export function obstaclesNear(map, x, y) {
  const { cols, cells } = map.grid;
  const gx = Math.max(0, Math.min(cols - 1, Math.floor(x / GRID_CELL)));
  const gy = Math.max(0, Math.min(cols - 1, Math.floor(y / GRID_CELL)));
  const out = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = gx + dx;
      const cy = gy + dy;
      if (cx < 0 || cy < 0 || cx >= cols || cy >= cols) continue;
      const bucket = cells.get(cy * cols + cx);
      if (bucket) out.push(...bucket);
    }
  }
  return out;
}

/**
 * Push a circle out of any obstacle it overlaps. Cheap and stable — good
 * enough for a top-down sim where nothing moves fast enough to tunnel.
 */
export function resolveCollisions(map, pos, radius) {
  for (const o of obstaclesNear(map, pos.x, pos.y)) {
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
