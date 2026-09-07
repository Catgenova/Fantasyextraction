// Navigation: a clearance field over the map, and flow fields to goals.
//
// The steering in `ai.js` knows nothing beyond its own 300-unit obstacle
// bucket. Everything it does about being stuck — sampling progress, detecting
// orbits, throwing sideways waypoints and widening them on failure — is an
// attempt to reconstruct global information from local failure, and it cannot
// work in general: no steering force escapes a local minimum while the goal
// keeps pulling back into it.
//
// This file supplies the global information instead. Two structures, both
// built from a map that never changes after generation:
//
//   clearance   per cell, the distance to the nearest obstacle surface. A
//               circle of radius R fits in a cell exactly when clearance >= R,
//               which is what makes a gap narrower than a hero *impassable*
//               rather than something to be steered between and wedged in.
//
//   flow        per goal, a direction in every cell pointing along the
//               shortest passable route to it. Computed by breadth-first
//               search from the goal, so it is globally correct by
//               construction — there is no local minimum to escape.
//
// Fields are cached per goal cell rather than per entity, which is what makes
// this affordable: squads converge on a handful of places — camps, hunting
// grounds, three extractions — so one field serves every entity heading there,
// the player's squad and all five rival squads together.

import { WORLD_SIZE, obstaclesNear } from './map.js';

// 70 units a cell: 200x200 over the world. Fine enough that a gap a hero
// cannot fit through is resolved, coarse enough that a field is 40,000 cells
// and a breadth-first search over one is a few milliseconds.
export const NAV_CELL = 70;
export const NAV_COLS = Math.ceil(WORLD_SIZE / NAV_CELL);

// Clearance is only interesting up to about the widest thing that walks: past
// that, "very open" and "extremely open" are the same answer, and capping lets
// the search stop early.
const MAX_CLEARANCE = 260;

// Two body classes rather than one field per radius. A hero is 14 and a pack
// creature 9 to 18; a solo monster is 30 to 38 and genuinely cannot follow a
// route the small ones can.
export const NAV_CLASSES = { small: 22, large: 44 };
export const navClassFor = (radius) => (radius > 24 ? 'large' : 'small');

// A cap on cached fields. A raid asks for maybe fifteen goals; the cap is
// there so an unusual raid cannot grow this without bound.
const MAX_FIELDS = 32;

const idx = (cx, cy) => cy * NAV_COLS + cx;
export const cellX = (x) => Math.max(0, Math.min(NAV_COLS - 1, Math.floor(x / NAV_CELL)));
export const cellY = (y) => Math.max(0, Math.min(NAV_COLS - 1, Math.floor(y / NAV_CELL)));

/**
 * The clearance field, built once per map and cached on it.
 *
 * Computed exactly rather than by a chamfer transform over a rasterised grid:
 * the obstacles are circles and the map already has them in a spatial grid, so
 * the true distance to the nearest surface is a short loop over the
 * neighbouring buckets. A transform would be faster and would quantise
 * clearance to a whole cell — 70 units — which is five times a hero's radius
 * and would call a wall a doorway.
 */
export function clearanceField(map) {
  if (map._clearance) return map._clearance;

  const field = new Float32Array(NAV_COLS * NAV_COLS);
  for (let cy = 0; cy < NAV_COLS; cy++) {
    const y = cy * NAV_CELL + NAV_CELL / 2;
    for (let cx = 0; cx < NAV_COLS; cx++) {
      const x = cx * NAV_CELL + NAV_CELL / 2;
      let best = MAX_CLEARANCE;
      for (const o of obstaclesNear(map, x, y)) {
        const d = Math.hypot(x - o.x, y - o.y) - o.r;
        if (d < best) best = d;
        if (best <= 0) break;
      }
      field[idx(cx, cy)] = best;
    }
  }
  map._clearance = field;
  return field;
}

/** Can a body of this radius stand at this world position? */
export function passableAt(map, x, y, radius) {
  return clearanceField(map)[idx(cellX(x), cellY(y))] >= radius;
}

/**
 * A flow field to a goal, for one body class.
 *
 * Breadth-first from the goal over cells with enough clearance, storing the
 * step count. The direction out of any cell is toward whichever neighbour has
 * the lower count, which is a shortest route by construction.
 *
 * Diagonals cost more than straights, or the routes come out visibly
 * staircased even after smoothing.
 */
export function flowField(map, goal, bodyClass = 'small') {
  const gx = cellX(goal.x);
  const gy = cellY(goal.y);
  const key = `${gx},${gy},${bodyClass}`;

  map._flows ??= new Map();
  const hit = map._flows.get(key);
  if (hit) {
    // Re-insert so the cap evicts what has not been asked for recently.
    map._flows.delete(key);
    map._flows.set(key, hit);
    return hit;
  }

  const clearance = clearanceField(map);
  const need = NAV_CLASSES[bodyClass] ?? NAV_CLASSES.small;
  const n = NAV_COLS * NAV_COLS;
  const cost = new Float32Array(n).fill(Infinity);

  // If the goal itself is inside geometry — a camp that generated against a
  // rock — seed from the closest passable cell instead, or the field is empty
  // and every entity heading there falls back to steering.
  let start = idx(gx, gy);
  if (clearance[start] < need) {
    const near = nearestPassable(clearance, gx, gy, need);
    if (near < 0) {
      const empty = { cost, cols: NAV_COLS, goal: { x: goal.x, y: goal.y }, empty: true };
      remember(map, key, empty);
      return empty;
    }
    start = near;
  }

  // A binary heap over growable arrays.
  //
  // The first version used a bucket queue on the theory that two step costs
  // sort exactly into a small ring. The theory was fine and the requeue
  // accounting for stale entries was not, and it looped forever. The second
  // sized the heap `new Int32Array(n)` — but decrease-key here is a re-push,
  // so the heap holds more entries than there are cells, and writing past the
  // end of a typed array is a silent no-op rather than an error. It also
  // looped forever, for a completely different reason. Forty thousand cells
  // do not need cleverness.
  const heapCell = [];
  const heapCost = [];
  const settled = new Uint8Array(n);
  let size = 0;

  const swap = (a, b) => {
    const c = heapCell[a]; heapCell[a] = heapCell[b]; heapCell[b] = c;
    const d = heapCost[a]; heapCost[a] = heapCost[b]; heapCost[b] = d;
  };
  const push = (cell, c) => {
    let i = size++;
    heapCell[i] = cell;
    heapCost[i] = c;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heapCost[parent] <= heapCost[i]) break;
      swap(parent, i);
      i = parent;
    }
  };
  const pop = () => {
    const top = heapCell[0];
    size--;
    if (size > 0) {
      heapCell[0] = heapCell[size];
      heapCost[0] = heapCost[size];
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let small = i;
        if (l < size && heapCost[l] < heapCost[small]) small = l;
        if (r < size && heapCost[r] < heapCost[small]) small = r;
        if (small === i) break;
        swap(small, i);
        i = small;
      }
    }
    return top;
  };

  cost[start] = 0;
  push(start, 0);

  while (size > 0) {
    const cell = pop();
    if (settled[cell]) continue;        // stale entry from a decrease-key
    settled[cell] = 1;
    const base = cost[cell];
    const cx = cell % NAV_COLS;
    const cy = (cell - cx) / NAV_COLS;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= NAV_COLS || ny >= NAV_COLS) continue;
        const ni = idx(nx, ny);
        if (settled[ni] || clearance[ni] < need) continue;
        // Cutting a corner diagonally between two blocked cells is a route
        // through a wall as far as a circle is concerned.
        if (dx && dy && (clearance[idx(cx + dx, cy)] < need || clearance[idx(cx, cy + dy)] < need)) continue;
        const next = base + (dx && dy ? 1.4 : 1);
        if (next < cost[ni]) {
          cost[ni] = next;
          push(ni, next);
        }
      }
    }
  }

  const field = { cost, cols: NAV_COLS, goal: { x: goal.x, y: goal.y }, empty: false };
  remember(map, key, field);
  return field;
}

function remember(map, key, field) {
  map._flows.set(key, field);
  while (map._flows.size > MAX_FIELDS) {
    map._flows.delete(map._flows.keys().next().value);
  }
}

/** The nearest cell with room for this body, spiralling out. Returns -1 if none. */
function nearestPassable(clearance, gx, gy, need) {
  for (let r = 1; r <= 12; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = gx + dx;
        const ny = gy + dy;
        if (nx < 0 || ny < 0 || nx >= NAV_COLS || ny >= NAV_COLS) continue;
        if (clearance[idx(nx, ny)] >= need) return idx(nx, ny);
      }
    }
  }
  return -1;
}

/**
 * Which way to walk from here, following a field. Null when there is nothing
 * useful to say — off the field, in unreachable ground, or already at the goal
 * — and the caller should fall back to heading straight at it.
 */
export function flowDir(field, x, y) {
  if (!field || field.empty) return null;
  const cx = cellX(x);
  const cy = cellY(y);
  const here = field.cost[idx(cx, cy)];
  if (!Number.isFinite(here)) return null;
  if (here === 0) return null;

  let bestCost = here;
  let bx = 0;
  let by = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= NAV_COLS || ny >= NAV_COLS) continue;
      const c = field.cost[idx(nx, ny)];
      if (c < bestCost) { bestCost = c; bx = dx; by = dy; }
    }
  }
  if (!bx && !by) return null;
  const len = Math.hypot(bx, by);
  return { x: bx / len, y: by / len };
}

/**
 * Is the straight line from a to b walkable for a body of this radius?
 *
 * This is string-pulling, in the form a flow field can use. A field routes
 * cell to cell, so following it exactly produces a staircase even when the
 * goal is in plain sight; asking this first and going straight when the answer
 * is yes gives back the direct line wherever the map allows one, which is most
 * of the map.
 *
 * Sampled against the clearance field rather than the obstacles themselves —
 * clearance already answers "does a circle of radius R fit here", which is the
 * actual question, and it is one array read per step.
 */
export function lineIsClear(map, ax, ay, bx, by, radius) {
  const clearance = clearanceField(map);
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 1) return true;
  // Half a cell, so no step can skip over a blocked one.
  const steps = Math.ceil(len / (NAV_CELL * 0.5));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = ax + dx * t;
    const y = ay + dy * t;
    if (clearance[idx(cellX(x), cellY(y))] < radius) return false;
  }
  return true;
}

/** For the tests and the debug overlay. */
export function navStats(map) {
  const clearance = clearanceField(map);
  let blocked = 0;
  for (let i = 0; i < clearance.length; i++) if (clearance[i] < NAV_CLASSES.small) blocked++;
  return {
    cells: clearance.length,
    cols: NAV_COLS,
    blockedSmall: blocked,
    fields: map._flows?.size ?? 0,
  };
}
