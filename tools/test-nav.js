#!/usr/bin/env node
// Navigation: the clearance field, the flow fields, and the character
// controller that walks them.
//
// The structural half of this file is cheap and the behavioural half is the
// point. A flow field that routes beautifully in a unit test and leaves heroes
// pressed against rocks in a raid is worth nothing, and that is very close to
// what happened: the first version of this work deleted the old steering
// heuristics on the theory that a global field made them redundant, and it
// took heroes from 3.2% of their time making no progress to 16.7%.
//
//   node tools/test-nav.js

import { generateMap, WORLD_SIZE } from '../src/sim/map.js';
import {
  clearanceField, flowField, flowDir, lineIsClear, navStats,
  NAV_CELL, NAV_COLS, NAV_CLASSES, navClassFor, passableAt,
} from '../src/sim/navgrid.js';

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

// A map with a wall across it and a single gap, built by hand so the right
// answer is known rather than inferred.
function walled(gapAt = 100, wallCol = 100) {
  const map = { grid: { cols: 1, cells: new Map() }, obstacles: [{ x: 0, y: 0, r: 1 }] };
  map._clearance = new Float32Array(NAV_COLS * NAV_COLS).fill(300);
  for (let cy = 0; cy < NAV_COLS; cy++) {
    if (cy !== gapAt) map._clearance[cy * NAV_COLS + wallCol] = 0;
  }
  return map;
}
const world = (cell) => cell * NAV_CELL + NAV_CELL / 2;

console.log('=== the grid covers the map ===');
check('the grid spans the world',
  NAV_COLS * NAV_CELL >= WORLD_SIZE, `${NAV_COLS} x ${NAV_CELL} vs ${WORLD_SIZE}`);
// Coarser than a body and the wall/doorway distinction is lost; this is the
// whole reason clearance is computed exactly rather than quantised to a cell.
check('a cell is not larger than a body is wide',
  NAV_CELL <= 100, String(NAV_CELL));
check('a solo monster needs more room than a hero',
  NAV_CLASSES.large > NAV_CLASSES.small, `${NAV_CLASSES.small} vs ${NAV_CLASSES.large}`);
check('body class is picked by radius',
  navClassFor(14) === 'small' && navClassFor(34) === 'large');

console.log('\n=== clearance says what fits ===');
{
  const map = generateMap(900);
  const field = clearanceField(map);
  check('every cell gets a clearance', field.length === NAV_COLS * NAV_COLS);
  check('the field is cached, not rebuilt', clearanceField(map) === field);
}
{
  // The shipped default generates no obstacles, so an empty map has to be the
  // trivial case rather than a special one. Asserted against a map built with
  // nothing in it — writing this as `obstacles.length > 0 || ...` made it
  // short-circuit to true whenever obstacles were switched on, which is
  // exactly when it was being run.
  const empty = { grid: { cols: 1, cells: new Map() }, obstacles: [] };
  const f = clearanceField(empty);
  check('a map with nothing in it is entirely passable',
    [...f].every((c) => c >= NAV_CLASSES.large),
    `${[...f].filter((c) => c < NAV_CLASSES.large).length} cells short`);
  check('and a field over it reaches everywhere',
    Number.isFinite(flowField(empty, { x: 200, y: 200 }, 'large').cost[NAV_COLS * NAV_COLS - 1]));
}
{
  // A single rock, and the clearance around it.
  const map = { grid: { cols: 1, cells: new Map([[0, [{ x: 500, y: 500, r: 120 }]]]) },
    obstacles: [{ x: 500, y: 500, r: 120 }] };
  const f = clearanceField(map);
  const at = (x, y) => f[Math.floor(y / NAV_CELL) * NAV_COLS + Math.floor(x / NAV_CELL)];
  check('inside a rock has no clearance', at(500, 500) < 0, at(500, 500).toFixed(0));
  check('beside it has a little', at(660, 500) > 0 && at(660, 500) < 120, at(660, 500).toFixed(0));
  check('well away from it has plenty', at(1400, 500) > 200, at(1400, 500).toFixed(0));
  check('and a hero cannot stand in it', !passableAt(map, 500, 500, NAV_CLASSES.small));
}

console.log('\n=== a field routes around what is in the way ===');
{
  const map = walled();
  const goal = { x: world(150), y: world(100) };
  const f = flowField(map, goal, 'small');
  check('the goal costs nothing to reach from itself',
    f.cost[100 * NAV_COLS + 150] === 0, String(f.cost[100 * NAV_COLS + 150]));
  // The far side is reachable only through the gap, so it must cost more than
  // the straight-line distance — that is the proof it went round.
  const behind = f.cost[20 * NAV_COLS + 50];
  const throughGap = f.cost[100 * NAV_COLS + 100];
  check('ground behind the wall is reachable', Number.isFinite(behind), String(behind));
  check('and costs more than the gap it must pass through',
    behind > throughGap, `${behind.toFixed(0)} vs ${throughGap.toFixed(0)}`);

  // Walking the field from behind the wall has to arrive, and arrive through
  // the gap rather than at it and stop.
  let x = world(50);
  let y = world(20);
  let steps = 0;
  let usedGap = false;
  for (; steps < 4000; steps++) {
    const d = flowDir(f, x, y);
    if (!d) break;
    x += d.x * 20;
    y += d.y * 20;
    if (Math.abs(x - world(100)) < NAV_CELL && Math.abs(y - world(100)) < NAV_CELL * 2) usedGap = true;
  }
  const arrived = Math.hypot(x - goal.x, y - goal.y) < NAV_CELL * 2;
  check('following the field arrives', arrived,
    `${Math.round(Math.hypot(x - goal.x, y - goal.y))} units short after ${steps} steps`);
  check('and goes through the gap to do it', usedGap);

  check('a field is cached per goal cell', flowField(map, goal, 'small') === f);
  check('and a nearby goal in the same cell reuses it',
    flowField(map, { x: goal.x + 10, y: goal.y + 10 }, 'small') === f);
  check('but a different body class does not',
    flowField(map, goal, 'large') !== f);
}
{
  // A goal walled off entirely is not a crash and not a lie.
  const map = walled(-1);
  const f = flowField(map, { x: world(150), y: world(100) }, 'small');
  check('a route that does not exist reports no direction',
    flowDir(f, world(50), world(20)) === null);
}
{
  // A goal sitting inside geometry still has to be approachable, or a camp
  // that generated against a rock becomes unreachable for the whole raid.
  const map = walled();
  const inWall = { x: world(100), y: world(40) };
  const f = flowField(map, inWall, 'small');
  check('a goal inside geometry seeds from the nearest open ground',
    !f.empty && flowDir(f, world(60), world(40)) !== null);
}

{
  // A diagonal pair of blocked cells is a corner. Stepping between them is a
  // route through solid ground for anything with a radius, and a grid search
  // will happily take it unless told not to — the wall test above cannot catch
  // this, because a straight wall has no corners to cut.
  const map = { grid: { cols: 1, cells: new Map() }, obstacles: [{ x: 0, y: 0, r: 1 }] };
  map._clearance = new Float32Array(NAV_COLS * NAV_COLS).fill(300);
  map._clearance[100 * NAV_COLS + 100] = 0;
  map._clearance[101 * NAV_COLS + 101] = 0;
  const f = flowField(map, { x: world(101), y: world(100) }, 'small');
  // The cell diagonally opposite the goal, whose only direct step is between
  // the two blockers. (Reading the goal's own cell here first time round
  // measured a cost of zero, which is true and says nothing.)
  const acrossCorner = f.cost[101 * NAV_COLS + 100];
  // Going round costs at least two steps; squeezing through the corner is one
  // diagonal, so anything at or below that has cut it.
  check('a route does not squeeze between two diagonal blockers',
    acrossCorner > 1.5, `cost ${acrossCorner.toFixed(1)} to cross the corner`);
}

console.log('\n=== line of sight is the shortcut ===');
{
  const map = walled();
  check('a clear line is clear',
    lineIsClear(map, world(10), world(10), world(60), world(60), NAV_CLASSES.small));
  check('a line through the wall is not',
    !lineIsClear(map, world(60), world(20), world(140), world(20), NAV_CLASSES.small));
  check('a line through the gap is',
    lineIsClear(map, world(60), world(100), world(140), world(100), NAV_CLASSES.small));
  // Sampling must not step over a wall one cell thick.
  check('a one-cell wall is not stepped over',
    !lineIsClear(map, world(99), world(20), world(101), world(20), NAV_CLASSES.small));
}

console.log('\n=== cost ===');
{
  const map = generateMap(901);
  let t = Date.now();
  clearanceField(map);
  const build = Date.now() - t;
  t = Date.now();
  flowField(map, { x: 7000, y: 7000 }, 'small');
  const field = Date.now() - t;
  t = Date.now();
  flowField(map, { x: 7000, y: 7000 }, 'small');
  const cached = Date.now() - t;
  // Both are once-per-map or once-per-goal, but a field is built during a tick
  // and the tick budget allows one — so it has to stay well inside a frame.
  check('the clearance field builds in well under a second', build < 500, `${build}ms`);
  check('a flow field builds inside a frame budget', field < 120, `${field}ms`);
  check('and a repeat costs nothing', cached <= 2, `${cached}ms`);
  check('stats report what was built', navStats(map).cells === NAV_COLS * NAV_COLS);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll navigation checks passed');
process.exit(failures ? 1 : 0);
