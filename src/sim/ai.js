// The autobattler brain. Players never issue attack commands — they write
// tactics, and this file is the interpreter for them.
//
// Each hero runs, in order: survive (retreat/consumables) -> cast -> position
// -> auto-attack. Squad-level intent (where to go, when to leave) comes from
// `squadObjective` and is fed in as `squad.order`.

import { SPELLS } from '../data/spells.js';
import { CONSUMABLES } from '../data/consumables.js';
import { STANCES, TARGET_PRIORITIES, LOOT_POLICIES, LOOT_FLOORS, FORMATIONS, SQUAD_PLANS, EXTRACT_PLANS, COHESION, HEADINGS, HEADING_REACH } from '../data/tactics.js';
import { dealDamage, spawnProjectile, resolveEffects, isControlled, hasStatus, applyStatus, GLOBAL_COOLDOWN } from './combat.js';
import { hpFrac, manaFrac, recomputeStats } from './entity.js';
import { dist, dist2, dirTo, norm, add, scale, sub } from '../core/vec.js';
import { resolveCollisions, obstaclesNear, bestExtract, extractIsOpen } from './map.js';
import { flowField, flowDir, navClassFor, lineIsClear, NAV_CLASSES } from './navgrid.js';
import { itemScore, packCapacity } from '../data/gear.js';
import { QUALITY_ORDER, partValue } from '../data/parts.js';
import { CREATURES } from '../data/creatures.js';
import { quarryLabel } from '../data/hunts.js';

// Inside this range a creature is a fight regardless of what the squad came
// here for. Outside it, a hunt order lets them keep walking.
//
// Tuned, and the narrow band wins on both halves of the trade at once. Over
// twelve seeds hunting a mid-ring species, quarry carves and total carves
// went 68/256 at 260 units, 49/213 at 420 and 9/176 at 640 — a squad that
// stops for everything within sight neither hunts nor farms, because the
// fights it picks up on the way are the ones that get it killed.
const HUNT_IGNORE_RANGE = 260;
import { stowConsumable, canPackConsumable } from './inventory.js';

const OUT_OF_COMBAT_AFTER = 5;
const THINK_HERO = 0.2;      // seconds between hero decisions
const THINK_MONSTER = 0.3;   // monsters are dumber, so they think less often
const EVADE_HOME = 45;       // how close to home ends an evade
const EVADE_SPEED = 1.5;     // monsters give up and go home briskly
const CHASE_PATIENCE = 9;    // seconds chasing one target without landing a hit
const UNREACHABLE_FOR = 20;  // how long a hero ignores a target it cannot catch
const PERCEPTION = 820;      // how far a hero looks for targets
const PICKUP_RANGE = 110;    // must exceed the widest formation spacing
const LOOT_SEARCH_RADIUS = 900;
export const LOOT_PATIENCE = 5;      // seconds standing on a pile before writing it off
export const LOOT_TRAVEL_LIMIT = 25; // seconds pursuing one pile, arrived or not

// Steering around scenery. Without these a hero walks straight into a rock,
// gets pushed back out by collision resolution, and walks into it again —
// making no progress at all for the rest of the raid.
const AVOID_LOOKAHEAD = 95;  // how far ahead to notice something in the way
const AVOID_WEIGHT = 2.1;    // how hard to lean around it

// Beyond this, walk the flow field; inside it, head straight at the goal.
// A field is a global route and a route is only worth having when there is
// something to route around — within a couple of body lengths the straight
// line is the answer, and it keeps combat and formation movement direct
// rather than snapping to a 70-unit grid.
const NAV_MIN_DISTANCE = 420;
// New fields cost about 20ms to build, so a tick that asked for six would drop
// a frame. Whoever asks first gets one; everybody else steers straight this
// tick and picks the field up on a later one, by which time it is cached.
const NAV_BUILDS_PER_TICK = 1;

// Anticipating other *bodies* — AVOID_LOOKAHEAD above is about scenery.
// The horizon is short on purpose: looking further
// ahead than about a second makes a squad swerve around each other constantly
// on courses that were never going to meet.
const STUCK_SAMPLE = 0.4;    // seconds between progress checks
const MIN_PROGRESS = 8;      // metres closer to the goal per sample, or it is not progress
const STUCK_TRIGGER = 1.2;   // seconds of no progress before forcing a way out
const DETOUR_DISTANCE = 300; // how far to the side a detour waypoint is placed
const DETOUR_WIDEN = 0.8;    // extra detour distance per consecutive failure
const DETOUR_MAX_WIDEN = 3;  // cap, so a detour never becomes a march
const DETOUR_TIME = 5;       // give up on a detour after this long
const ORBIT_WINDOW = 6;      // seconds over which to check for real displacement
const ORBIT_DISTANCE = 90;   // net ground covered in that window, or it is a loop
const ORBIT_MIN_GOAL = 150;  // only applies when the hero has somewhere to be
const DETOUR_GIVE_UP = 3;    // failed detours before giving the idea a rest
const DETOUR_COOLDOWN = 12;  // seconds of heading straight at the goal instead

// Telegraph avoidance. The lookahead is generous — a hero should start moving
// when the circle appears, not when it is about to land — and the margin puts
// them clear of the edge rather than exactly on it.
// Mana discipline. A spell costing less than this share of the pool is not
// worth agonising over; above this much mana in reserve, neither is holding
// anything back.
const CHEAP_SPELL_SHARE = 0.12;
const MANA_SPEND_FREELY = 0.75;
const CROWD_WORTH_IT = 3;      // enemies an area spell needs to justify itself

// Target stickiness. Below this, a hero keeps what it has; above it, a
// challenger still has to be meaningfully better to take the slot.
// How recently an ally must have been hit to count as being harried.
const HARRIED_WINDOW = 2.0;
// How far a frontliner will go out of its way to take an attacker off someone.
const PEEL_RANGE = 320;
// How far apart to fan melee attackers around one target, per extra attacker.
const MELEE_ARC = 0.85;
// Retreating: how far to look for somebody to hide behind, and how far behind
// them to stand.
const RETREAT_SEEK = 460;
const RETREAT_BEHIND = 70;
// Reacting to a windup: how late is still worth acting on, and what a stun or
// a burst is worth in that window.
const WINDUP_WINDOW = 1.6;
const WINDUP_INTERRUPT_BONUS = 26;
// What counts as stopping something mid-windup.
const INTERRUPTS = new Set(['stun', 'snare', 'frozen', 'deep_freeze', 'dazed', 'iron_web']);
const WINDUP_BURST_BONUS = 8;
// A kiter steps back far enough to be shooting again, and no further.
const KITE_MAX_STEP = 190;

const TARGET_STICK = 0.8;          // seconds
// The margin has to be read against the scale `scoreTarget` works on. Distance
// contributes `-d * 0.01`, so the whole perception range is worth about nine
// points; the priority bonuses are 40 to 80. Set at 12 — which looked like a
// small number — this made distance incapable of ever winning a switch, so a
// hero would ignore something that walked up to it while it plodded toward
// something eighty units further away. At 0.6 a target has to be roughly sixty
// units closer to take the slot, and two enemies a few units apart cannot make
// a hero oscillate between them.
const TARGET_SWITCH_MARGIN = 0.6;

const DODGE_LOOKAHEAD = 2.2;   // seconds before impact worth reacting to
const DODGE_MARGIN = 26;       // units of daylight to leave

const AGENT_LOOKAHEAD = 130;  // how far out to consider another body at all
const AGENT_HORIZON = 1.1;    // seconds of prediction
const AGENT_AVOID = 0.9;      // how hard to lean out of a predicted collision
// Each failed detour reaches further out. A hero pinned in a notch between two
// rocks by another hero standing on the only way out is not helped by being
// sent 300 units sideways again — it walks back into the same pocket. Widening
// the escape is what eventually clears it.
const ARRIVED_DISTANCE = 24;  // genuinely standing on the spot

// ---------------------------------------------------------------------------
// Hero update
// ---------------------------------------------------------------------------

export function updateHero(match, e, dt) {
  if (!e.alive || e.extracted) return;

  // Resource and timer bookkeeping — every tick, it is cheap.
  e.mana = Math.min(e.maxMana, e.mana + e.stats.manaRegen * dt);
  e.attackTimer -= dt;
  e.globalCooldown -= dt;
  for (const k in e.cooldowns) e.cooldowns[k] -= dt;
  for (const k in e.itemCooldowns) e.itemCooldowns[k] -= dt;

  const inCombat = match.time - e.lastCombatAt < OUT_OF_COMBAT_AFTER;
  e.inCombat = inCombat;

  if (isControlled(e)) { e.vel.x = 0; e.vel.y = 0; return; }

  // Deliberation runs at ~5Hz, staggered per entity. Movement and attacks
  // still run every tick so nothing looks choppy.
  e.thinkTimer = (e.thinkTimer ?? match.rng() * THINK_HERO) - dt;
  if (e.thinkTimer <= 0) {
    e.thinkTimer += THINK_HERO;
    think(match, e, inCombat);
  }

  const target = match.byId(e.target);
  if (target && !target.alive) e.target = null;

  if (e._desired) steer(match, e, e._desired.pos, dt, e._desired.speedMult ?? 1);
  else { e.vel.x *= 0.8; e.vel.y *= 0.8; }

  // A stopwatch, so it runs every tick rather than on the think cadence.
  tryCarve(match, e, dt);

  if (target?.alive && e.attackTimer <= 0) {
    const range = e.stats.attackRange + e.radius + target.radius;
    if (dist(e.pos, target.pos) <= range) autoAttack(match, e, target);
  }
}

/** The expensive half of a hero's turn: perception, decisions, intent. */
function think(match, e, inCombat) {
  const squad = match.squads.get(e.squadId);
  const stance = STANCES[e.tactics.stance] ?? STANCES.balanced;

  tryConsumables(match, e, squad, inCombat);

  const enemies = match.hostilesNear(e, PERCEPTION);
  const target = pickTarget(match, e, squad, enemies);
  e.target = target?.id ?? null;
  trackChase(match, e, target);

  if (e.globalCooldown <= 0) tryCast(match, e, squad, target, enemies);

  e._desired = detourAround(match, e, desiredPosition(match, e, squad, target, enemies, stance));

  // Grab anything underfoot. Heroes fight over camps and the drops land where
  // they are already standing, so gating this on being out of combat meant
  // squads walked away from everything they earned.
  tryPickup(match, e);
}

/**
 * Somewhere safer than here.
 *
 * In order of preference: behind the healthiest frontliner who is not this
 * hero, behind the leader, or — with nobody to hide behind — directly away
 * from the massed threat rather than from whichever single enemy is closest.
 */
function retreatTo(match, e, squad, enemies, leader, order) {
  // The direction the danger is in, weighted by how close each one is: two
  // enemies flanking should send a hero backwards, not between them.
  let tx = 0;
  let ty = 0;
  for (const t of enemies) {
    const d = Math.max(60, dist(e.pos, t.pos));
    tx += (t.pos.x - e.pos.x) / d / d;
    ty += (t.pos.y - e.pos.y) / d / d;
  }
  const threat = Math.hypot(tx, ty) > 1e-6
    ? { x: tx / Math.hypot(tx, ty), y: ty / Math.hypot(tx, ty) }
    : { x: 0, y: 0 };

  const board = combatBoard(match, squad);
  let shield = null;
  if (board) {
    for (const m of board.members) {
      if (m === e || m.stats.attack.kind === 'projectile') continue;
      if (hpFrac(m) < 0.45) continue;                 // no use hiding behind the dying
      if (dist(e.pos, m.pos) > RETREAT_SEEK) continue;
      if (!shield || hpFrac(m) > hpFrac(shield)) shield = m;
    }
  }
  const cover = shield ?? (leader?.alive && leader.id !== e.id ? leader : null);

  if (cover) {
    // Stand behind them, on the far side from the threat.
    return {
      x: cover.pos.x - threat.x * RETREAT_BEHIND,
      y: cover.pos.y - threat.y * RETREAT_BEHIND,
    };
  }
  const fallback = order?.pos ?? e.pos;
  const blend = norm(add(scale({ x: -threat.x, y: -threat.y }, 1.4),
    scale(dirTo(e.pos, fallback), 0.6)));
  return add(e.pos, scale(blend, 260));
}

/**
 * Where to stand to hit this target.
 *
 * Walking at `target.pos` puts everyone who wants it on the same arc — the one
 * facing wherever the squad came from. Three melee heroes then queue up behind
 * each other, shove each other out of position, and sit inside the same cleave.
 *
 * Each attacker gets its own angle around the target instead, spread over the
 * side it is already on so nobody runs the long way round. Ranged heroes are
 * left alone: they have no reason to close and every reason not to.
 */
function approachSlot(match, e, squad, target, idealRange) {
  if (e.stats.attack.kind === 'projectile') return { ...target.pos };
  const board = combatBoard(match, squad);
  const melee = board
    ? board.members.filter((m) => m.stats.attack.kind !== 'projectile' && m.target === target.id)
    : [e];
  if (melee.length < 2) return { ...target.pos };

  const slot = Math.max(0, melee.findIndex((m) => m.id === e.id));
  // Fan out from the direction this hero is already approaching from, so the
  // assignment does not send anybody across the target to reach their place.
  const from = Math.atan2(e.pos.y - target.pos.y, e.pos.x - target.pos.x);
  const spread = Math.min(Math.PI * 0.7, (melee.length - 1) * MELEE_ARC);
  const offset = -spread / 2 + (slot / Math.max(1, melee.length - 1)) * spread;
  const a = from + offset;
  const reach = target.radius + e.radius + idealRange * 0.55;
  return { x: target.pos.x + Math.cos(a) * reach, y: target.pos.y + Math.sin(a) * reach };
}

// ---------------------------------------------------------------------------
// The squad's shared view of a fight
// ---------------------------------------------------------------------------
//
// Every hero deliberates alone, five times a second, with no idea what the
// other two decided that tick. That is fine for most of what they do and
// hopeless for three things: nobody knows a target is already dead in all but
// name, nobody notices an ally is being chewed on, and three melee heroes all
// walk to the same side of the same monster.
//
// So the squad keeps one small board, rebuilt at most once per tick and shared
// by everyone on it. It is deliberately not a planner — no assignments, no
// negotiation — just the facts a hero cannot see from inside its own head.

/** Rebuild the board if this tick has not built it yet. */
function combatBoard(match, squad) {
  if (!squad) return null;
  if (squad._boardAt === match.time && squad._board) return squad._board;

  const members = squad.memberIds.map((id) => match.byId(id))
    .filter((m) => m?.alive && !m.extracted);

  // Damage already on its way to each target: what allies are hitting it for,
  // plus anything in flight. Without this, focus fire actively wastes itself —
  // three heroes and two arrows all commit to something with forty health.
  const committed = new Map();
  const attackers = new Map();
  for (const m of members) {
    if (!m.target) continue;
    attackers.set(m.target, (attackers.get(m.target) ?? 0) + 1);
    // One swing's worth, as a rough claim on the target.
    committed.set(m.target, (committed.get(m.target) ?? 0) + expectedHit(m));
  }
  for (const p of match.projectiles) {
    if (!p.targetId || p.team !== squad.team) continue;
    committed.set(p.targetId, (committed.get(p.targetId) ?? 0) + (p.spec?.base ?? 0));
  }

  // Who is being hit in melee, and by what. `lastHitBy` is already recorded on
  // every hero for the after-action report; this is the first thing that reads
  // it during the fight.
  const harried = [];
  for (const m of members) {
    if (match.time - (m.lastDamageAt ?? -999) > HARRIED_WINDOW) continue;
    const by = m.lastHitBy ? match.byId(m.lastHitBy) : null;
    if (!by?.alive || by.team === squad.team) continue;
    harried.push({ ally: m, threat: by, ranged: m.stats.attack.kind === 'projectile' });
  }

  const board = { members, committed, attackers, harried };
  squad._board = board;
  squad._boardAt = match.time;
  return board;
}

/** Roughly what one hero's next swing takes off, ignoring mitigation. */
function expectedHit(m) {
  return (m.stats.attack?.damage ?? 0) + m.stats.attackPower * 0.6;
}

/** Is this target already dead, counting what the squad has committed to it? */
function alreadyDying(board, t) {
  if (!board) return false;
  const claimed = board.committed.get(t.id) ?? 0;
  return claimed >= t.hp + (t.shield ?? 0);
}

// ---------------------------------------------------------------------------
// Targeting
// ---------------------------------------------------------------------------

export function pickTarget(match, e, squad, enemies) {
  // A monster running home has dropped aggro and cannot be caught before it
  // resets, and anything already proven uncatchable is not worth a second
  // attempt. Chasing either is how a hero ends up jogging on the spot.
  enemies = enemies.filter((t) => !t.evading && !isUnreachable(e, match, t));
  if (!enemies.length) return null;

  const board = combatBoard(match, squad);

  // Skip anything the squad has already killed but not yet buried. Focus fire
  // makes this worse rather than better: it points everybody at one target, so
  // three heroes and two arrows in flight all commit to something with forty
  // health left and the rest of the pack goes unanswered.
  //
  // Only if there is somewhere else to go — the last enemy standing is still
  // the target however much is already aimed at it.
  const live = enemies.filter((t) => !alreadyDying(board, t));
  if (live.length) enemies = live;

  // A taunt overrides everything the player configured.
  if (e.tauntedBy && hasStatus(e, 'taunted')) {
    const forced = match.byId(e.tauntedBy);
    if (forced?.alive) return forced;
  }

  // Peeling. A frontliner whose ranged ally has something in melee on them
  // goes and takes it. The Knight's own description promises this — "peels for
  // the backline, and punishes anyone who walks into melee" — and nothing in
  // the game did it: the tank held the line and the archer died behind it.
  //
  // Only melee heroes peel, only for ranged allies, and only within reach:
  // a frontliner crossing the battlefield to help is a frontliner who has
  // abandoned the front.
  if (e.stats.attack.kind !== 'projectile' && board?.harried.length) {
    let closest = null;
    let closestD = PEEL_RANGE;
    for (const h of board.harried) {
      if (h.ally === e || !h.ranged) continue;
      if (h.threat.stats.attack.kind === 'projectile') continue;   // not a melee problem
      const d = dist(e.pos, h.threat.pos);
      if (d < closestD && !isUnreachable(e, match, h.threat)) { closestD = d; closest = h.threat; }
    }
    if (closest) return closest;
  }

  // Focus fire: stick to the squad's called target while it is reachable.
  if (e.tactics.focusFire && squad?.focusTargetId) {
    const focus = match.byId(squad.focusTargetId);
    if (focus?.alive && !focus.evading && !isUnreachable(e, match, focus)
        && dist(e.pos, focus.pos) < 800) return focus;
  }

  const priority = TARGET_PRIORITIES[e.tactics.priority] ? e.tactics.priority : 'closest';
  let best = null;
  let bestScore = -Infinity;
  for (const t of enemies) {
    const score = scoreTarget(e, t, priority);
    if (score > bestScore) { bestScore = score; best = t; }
  }

  // Sticking. Deliberation runs five times a second and many attack intervals
  // are longer than that, so a hero oscillating between two similarly-scored
  // targets can walk at both and hit neither. A new target has to be clearly
  // better, or the old one has to have stopped being valid.
  const current = e.target ? match.byId(e.target) : null;
  if (current?.alive && current !== best && enemies.includes(current)) {
    const held = match.time - (e._targetSince ?? 0);
    const currentScore = scoreTarget(e, current, priority);
    if (held < TARGET_STICK || bestScore < currentScore + TARGET_SWITCH_MARGIN) {
      return current;
    }
  }
  if (best && best.id !== e.target) e._targetSince = match.time;
  return best;
}

/** The same scoring the loop above does, for one candidate. */
function scoreTarget(e, t, priority) {
  const d = dist(e.pos, t.pos);
  let score = -d * 0.01;
  switch (priority) {
    case 'lowest_hp': score += (1 - hpFrac(t)) * 60; break;
    case 'highest_threat': score += Math.min(60, (t.damageDealt ?? 0) / 60); break;
    case 'ranged_first': score += t.stats.attack.kind === 'projectile' ? 40 : 0; break;
    case 'elites_first': score += t.rank === 'boss' ? 80 : t.rank === 'elite' ? 45 : 0; break;
    case 'players_first': score += t.kind === 'hero' ? 70 : 0; break;
    default: break;
  }
  if (d > e.stats.attackRange + 420) score -= 40;
  return score;
}

// ---------------------------------------------------------------------------
// Spellcasting
// ---------------------------------------------------------------------------

function tryCast(match, e, squad, target, enemies) {
  const allies = match.alliesOf(e, true);
  const ctx = buildContext(match, e, squad, target, enemies, allies);

  let bestSpell = null;
  let bestScore = 0;
  let bestTargets = null;

  for (const spellId of e.spells) {
    const spell = SPELLS[spellId];
    if (!spell) continue;
    const policy = e.tactics.spellPolicy?.[spellId] ?? 'auto';
    if (policy === 'never') continue;
    if ((e.cooldowns[spellId] ?? 0) > 0) continue;
    if (e.mana < spell.manaCost) continue;
    if (policy === 'emergency' && !ctx.emergency) continue;

    if (!worthTheMana(e, spell, ctx)) continue;

    const targets = spellTargets(match, e, spell, target, allies, enemies);
    if (!targets || !targets.length) continue;

    const score = scoreHint(spell.hint ?? {}, ctx, spell, targets);
    if (score > bestScore) { bestScore = score; bestSpell = spell; bestTargets = targets; }
  }

  if (bestSpell) castSpell(match, e, bestSpell, bestTargets, ctx);
}

/**
 * Is this spell worth its mana against what is actually in front of us?
 *
 * Casting was "the best-scoring thing that is off cooldown and affordable",
 * which empties a Fire Mage's bar into a pack of Skiterlings and meets the
 * Pyroclast on fumes. An expensive spell now wants a target worth spending it
 * on — an elite, a boss, a rival hero, or a crowd — unless the bar is full
 * enough that holding it back saves nothing.
 *
 * Emergencies are exempt: a heal that would save somebody is worth any price,
 * and that is what `emergency` already means.
 */
function worthTheMana(e, spell, ctx) {
  const cost = spell.manaCost ?? 0;
  if (cost <= 0 || ctx.emergency) return true;

  // Cheap relative to the pool, or the pool is nearly full: nothing is being
  // saved by holding it.
  const share = cost / Math.max(1, e.maxMana);
  if (share < CHEAP_SPELL_SHARE || ctx.selfMana > MANA_SPEND_FREELY) return true;

  // Healing and defence are judged by need, not by what they are aimed at.
  const hint = spell.hint ?? {};
  if (hint.allyHpBelow !== undefined || hint.alliesHpBelow !== undefined
      || hint.selfHpBelow !== undefined) return true;

  // Otherwise it wants a target worth it, or enough of them at once.
  if (ctx.targetIsElite) return true;
  if ((spell.radius ?? 0) > 0 && ctx.enemies.length >= CROWD_WORTH_IT) return true;
  return false;
}

function buildContext(match, e, squad, target, enemies, allies) {
  const group = [e, ...allies];
  const living = group.filter((a) => a.alive);
  const lowest = living.reduce((a, b) => (hpFrac(a) <= hpFrac(b) ? a : b), living[0] ?? e);
  const avgHp = living.length ? living.reduce((s, a) => s + hpFrac(a), 0) / living.length : 1;
  const nearestEnemyDist = enemies.length ? Math.min(...enemies.map((t) => dist(e.pos, t.pos))) : Infinity;

  return {
    self: e,
    selfHp: hpFrac(e),
    selfMana: manaFrac(e),
    lowestAlly: lowest,
    lowestAllyHp: lowest ? hpFrac(lowest) : 1,
    avgHp,
    alliesHurt: living.filter((a) => hpFrac(a) < 0.75).length,
    alliesDebuffed: living.some((a) => a.statuses.some((s) => s.type === 'debuff')),
    enemies,
    nearestEnemyDist,
    target,
    targetHp: target ? hpFrac(target) : 1,
    targetIsElite: target ? target.rank === 'elite' || target.rank === 'boss' || target.kind === 'hero' : false,
    // "Emergency" is the gate for spells the player set to hold in reserve.
    emergency: hpFrac(e) < 0.4 || avgHp < 0.5 || (lowest && hpFrac(lowest) < 0.35),
    extracting: squad?.order?.mode === 'extract',
    // Something nearby is winding up. Once heroes could see telegraphs at all
    // this fell out for free: a circle on the ground is not only a place to
    // leave, it is the one moment in a fight where the enemy is committed and
    // a stun or a burst is worth more than it will be a second later.
    winding: windingUp(match, e, enemies),
  };
}

/** The enemy currently telegraphing at us, if any is close enough to matter. */
function windingUp(match, e, enemies) {
  for (const t of match.telegraphs) {
    if (t.remaining > WINDUP_WINDOW) continue;
    const source = match.byId(t.sourceId);
    if (!source?.alive || source.team === e.team) continue;
    if (dist(e.pos, source.pos) > PERCEPTION) continue;
    if (enemies.length && !enemies.includes(source)) continue;
    return source;
  }
  return null;
}

/** Has this hero already given up on catching that target? */
function isUnreachable(e, match, t) {
  const until = e._unreachable?.get(t.id);
  if (until === undefined) return false;
  if (match.time > until) { e._unreachable.delete(t.id); return false; }
  return true;
}

/**
 * Give up on a target that never comes within reach. The leash reset handles
 * monsters fleeing home; this covers everything else that outruns a hero,
 * so no one spends the raid jogging after something they will never touch.
 */
function trackChase(match, e, target) {
  if (!target) { e._chaseId = null; return; }
  if (e._chaseId !== target.id) {
    e._chaseId = target.id;
    e._chaseSince = match.time;
    return;
  }
  const reach = e.stats.attackRange + e.radius + target.radius;
  if (dist(e.pos, target.pos) <= reach) {
    e._chaseSince = match.time;          // landed within reach; still worth it
    return;
  }
  if (match.time - e._chaseSince > CHASE_PATIENCE) {
    (e._unreachable ??= new Map()).set(target.id, match.time + UNREACHABLE_FOR);
    e._chaseId = null;
    e.target = null;
  }
}

/** Translate a spell's `hint` into a desirability score. 0 = do not cast. */
function scoreHint(hint, ctx, spell, targets) {
  let score = hint.priority ?? 1;

  // An enemy mid-windup is the best moment this fight will offer for anything
  // that stops it or spends a cooldown. Weighted rather than absolute, so it
  // tips a close decision instead of overriding a heal.
  if (ctx.winding && targets.includes(ctx.winding)) {
    // The vocabulary is `debuff` with a `status`, not a `status` effect — the
    // first version of this check looked for a type that does not exist in
    // spells.js, so the interrupt bonus was dead code that scored nothing.
    if (spell.effects?.some((f) => f.type === 'debuff' && INTERRUPTS.has(f.status))) {
      score += WINDUP_INTERRUPT_BONUS;
    } else if ((spell.manaCost ?? 0) > 0 && !hint.allyHpBelow && !hint.selfHpBelow) {
      score += WINDUP_BURST_BONUS;
    }
  }

  if (hint.allyHpBelow !== undefined) {
    if (ctx.lowestAllyHp > hint.allyHpBelow) return 0;
    score += (hint.allyHpBelow - ctx.lowestAllyHp) * 12;
  }
  if (hint.alliesHpBelow !== undefined) {
    if (ctx.avgHp > hint.alliesHpBelow) return 0;
    score += (hint.alliesHpBelow - ctx.avgHp) * 16;
  }
  if (hint.selfHpBelow !== undefined) {
    if (ctx.selfHp > hint.selfHpBelow) return 0;
    score += (hint.selfHpBelow - ctx.selfHp) * 14;
  }
  if (hint.alliesHurt !== undefined) {
    if (ctx.alliesHurt < hint.alliesHurt) return 0;
    score += ctx.alliesHurt * 2;
  }
  if (hint.allyDebuffed && !ctx.alliesDebuffed) return 0;
  if (hint.enemyWithin !== undefined && ctx.nearestEnemyDist > hint.enemyWithin) return 0;
  if (hint.enemiesWithin !== undefined) {
    const radius = spell.radius ?? 120;
    const anchor = targets[0]?.pos ?? ctx.self.pos;
    const hits = ctx.enemies.filter((t) => dist(anchor, t.pos) <= radius).length;
    if (hits < hint.enemiesWithin) return 0;
    score += hits * 1.5;
  }
  if (hint.targetHpBelow !== undefined) {
    if (!ctx.target || ctx.targetHp > hint.targetHpBelow) return 0;
    score += (hint.targetHpBelow - ctx.targetHp) * 10;
  }
  if (hint.targetHpAbove !== undefined) {
    if (!ctx.target || ctx.targetHp < hint.targetHpAbove) return 0;
  }
  if (hint.targetIsElite && !ctx.targetIsElite) return 0;
  if (hint.targetClosingIn) {
    if (!ctx.target) return 0;
    const melee = ctx.target.stats.attack.kind === 'melee';
    if (!melee || dist(ctx.self.pos, ctx.target.pos) > 420) return 0;
    score += 3;
  }
  if (hint.alliesThreatened !== undefined) {
    const squadIds = new Set([ctx.self.id, ...ctx.self._allyIds ?? []]);
    const threatened = ctx.enemies.filter((t) => t.target && t.target !== ctx.self.id && squadIds.has(t.target)).length;
    if (threatened < hint.alliesThreatened) return 0;
    score += threatened;
  }
  return score;
}

function spellTargets(match, e, spell, target, allies, enemies) {
  switch (spell.target) {
    case 'self':
      return [e];
    case 'lowestAlly': {
      const pool = [e, ...allies].filter((a) => a.alive && dist(e.pos, a.pos) <= (spell.range ?? 9999));
      if (!pool.length) return null;
      return [pool.reduce((a, b) => (hpFrac(a) <= hpFrac(b) ? a : b))];
    }
    case 'allAllies': {
      const radius = (spell.radius ?? 200) * (1 + e.stats.aoeRadiusPct);
      return [e, ...allies].filter((a) => a.alive && dist(e.pos, a.pos) <= radius);
    }
    case 'areaEnemy': {
      const radius = (spell.radius ?? 120) * (1 + e.stats.aoeRadiusPct);
      const range = spell.range ?? spell.radius ?? 120;
      // Centre on whichever reachable enemy has the most neighbours.
      let bestAnchor = null;
      let bestCount = 0;
      for (const t of enemies) {
        if (dist(e.pos, t.pos) > range + radius) continue;
        const count = enemies.filter((o) => dist(t.pos, o.pos) <= radius).length;
        if (count > bestCount) { bestCount = count; bestAnchor = t; }
      }
      if (!bestAnchor) return null;
      return enemies.filter((t) => dist(bestAnchor.pos, t.pos) <= radius);
    }
    case 'enemy':
    default: {
      if (!target) return null;
      if (dist(e.pos, target.pos) > (spell.range ?? 9999) + target.radius) return null;
      return [target];
    }
  }
}

function castSpell(match, e, spell, targets, ctx) {
  e.mana -= spell.manaCost;
  e.cooldowns[spell.id] = spell.cooldown * (1 - e.stats.cooldownPct);
  e.globalCooldown = GLOBAL_COOLDOWN * (1 - e.stats.cooldownPct * 0.5);
  e.lastCombatAt = match.time;
  match.pushCast(e, spell);

  const dashDir = spell.effects.some((f) => f.type === 'dash')
    ? (ctx.target ? scale(dirTo(ctx.target.pos, e.pos), 1) : { x: 0, y: 0 })
    : null;

  // Single-target projectile spells travel; everything else lands instantly.
  const single = targets.length === 1 && spell.target === 'enemy';
  if (single && spell.projectileSpeed) {
    spawnProjectile(match, e, targets[0], {
      speed: spell.projectileSpeed,
      school: spell.effects[0]?.school,
      effects: spell.effects,
      radius: 5,
    });
  } else {
    if (spell.radius && spell.target === 'areaEnemy') {
      match.pushBlast(targets[0]?.pos ?? e.pos, (spell.radius) * (1 + e.stats.aoeRadiusPct), '#ffd08a');
    }
    resolveEffects(match, e, targets, spell.effects, { dashDir });
  }
}

// ---------------------------------------------------------------------------
// Consumables
// ---------------------------------------------------------------------------

function tryConsumables(match, e, squad, inCombat) {
  // Gather everything usable, then choose. Walking the belt and stopping at
  // the first match meant a hero at 35% drank whatever happened to sit in slot
  // one — often the Greater Healing Draught, with a Minor beside it that would
  // have done, and nothing left when it mattered.
  let best = null;
  let bestWaste = Infinity;

  for (const stack of e.consumables) {
    if (!stack || stack.count <= 0) continue;
    const def = CONSUMABLES[stack.defId];
    if (!def || def.passive) continue;
    if ((e.itemCooldowns[def.id] ?? 0) > 0) continue;

    const h = def.hint ?? {};
    let want = false;
    if (h.selfHpBelow !== undefined && hpFrac(e) <= Math.max(h.selfHpBelow, e.tactics.potionHpPct ?? 0)) want = true;
    if (h.selfManaBelow !== undefined && manaFrac(e) <= h.selfManaBelow) want = true;
    if (h.combatStart && inCombat && match.time - e.lastCombatAt < 1.5 && !hasStatus(e, def.effects[0]?.status)) want = true;
    if (h.extracting && squad?.order?.mode === 'extract' && !hasStatus(e, def.effects[0]?.status)) want = true;
    if (h.outOfCombat && !inCombat && hpFrac(e) < (h.selfHpBelow ?? 0.7)) want = true;
    if (!want) continue;

    // How much of it would be thrown away. A restorative that overshoots the
    // missing amount is waste; one that undershoots is not — it is simply not
    // the whole answer, and there may be nothing better.
    const waste = overheal(e, def);
    if (waste < bestWaste) { bestWaste = waste; best = { stack, def }; }
  }

  if (!best) return;
  best.stack.count -= 1;
  e.itemCooldowns[best.def.id] = best.def.cooldown;
  resolveEffects(match, e, [e], best.def.effects);
  match.pushFloat(e.pos, best.def.name, '#9fd7ff');
}

/**
 * How much of a consumable's restoration would be wasted on this hero now.
 *
 * The arithmetic mirrors `resolveEffects` in combat.js — same fields, same
 * scaling — so a potion's worth is judged by what it will actually restore
 * rather than by a second guess at it. A consumable that restores nothing
 * relevant (a buff, a cleanse) wastes nothing and sorts on its own merits.
 */
function overheal(e, def) {
  let waste = 0;
  for (const fx of def.effects ?? []) {
    if (fx.type === 'heal') {
      const amount = (fx.base ?? 0)
        + e.stats.spellPower * (fx.scaling?.spellPower ?? 0)
        + e.maxHp * (fx.scaling?.maxHp ?? 0);
      waste += Math.max(0, amount - (e.maxHp - e.hp));
    } else if (fx.type === 'mana') {
      waste += Math.max(0, (fx.base ?? 0) - (e.maxMana - e.mana));
    }
  }
  return waste;
}

/** Phoenix Ash and friends: a last-gasp check run by the match on death. */
export function tryDeathSave(match, e) {
  for (const stack of e.consumables ?? []) {
    if (!stack || stack.count <= 0) continue;
    const def = CONSUMABLES[stack.defId];
    if (!def?.passive) continue;
    const revive = def.effects.find((f) => f.type === 'revive');
    if (!revive) continue;
    stack.count -= 1;
    e.hp = Math.round(e.maxHp * revive.hpFraction);
    e.statuses.length = 0;
    recomputeStats(e);
    match.pushFloat(e.pos, def.name, '#ffb347', true);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------

function desiredPosition(match, e, squad, target, enemies, stance) {
  const want = pickDestination(match, e, squad, target, enemies, stance);
  return paceForSquad(match, e, squad, want);
}

/**
 * Hold the leader back while the squad is strung out.
 *
 * Slowing rather than stopping, and only as a speed change rather than a new
 * destination, is deliberate. Every version of this that re-targeted the
 * leader produced a standoff: the leader decided someone was trailing, the
 * follower decided it was already close enough, and neither moved again.
 * Pacing cannot deadlock — the leader still advances, and followers close at
 * full speed.
 */
function paceForSquad(match, e, squad, want) {
  if (!want || !squad || squad.leaderId !== e.id || e.extractingAt) return want;
  if (!squad.regrouping) return want;
  // Not during an extraction: the whole squad is converging on one point, so
  // they close up without the leader dawdling, and dawdling gets them killed.
  if (squad.order?.mode === 'extract') return want;
  return { ...want, speedMult: (want.speedMult ?? 1) * COHESION.slowPace };
}

/**
 * The way out of an area about to be hit, or null when standing still is fine.
 *
 * Telegraphs were being drawn for the player and read by nothing else: a boss
 * put a circle on the ground with a second or so of warning, the renderer drew
 * it, and the squad stood in it. Every other part of this file was reasoning
 * about a fight while ignoring the one piece of information the fight was
 * handing it for free.
 *
 * The step is out of the *nearest edge*, not away from the centre — those
 * differ badly when a hero is near the rim of a large circle, and the second
 * one walks them across the middle of it.
 */
function dodgeTelegraph(match, e) {
  let worst = null;
  let worstUrgency = 0;
  for (const t of match.telegraphs) {
    // Not our problem: our own side put it there.
    const source = match.byId(t.sourceId);
    if (source && source.team === e.team) continue;
    const d = dist(e.pos, t.pos);
    if (d > t.radius + e.radius) continue;
    // Too far out to reach the edge before it lands, or so far off it is not
    // worth abandoning what we were doing.
    const need = (t.radius + e.radius + DODGE_MARGIN - d) / Math.max(1, e.stats.moveSpeed);
    if (t.remaining > DODGE_LOOKAHEAD || need > t.remaining * 1.35) continue;
    const urgency = 1 / Math.max(0.05, t.remaining);
    if (urgency > worstUrgency) { worstUrgency = urgency; worst = t; }
  }
  if (!worst) return null;

  const away = d0(e.pos, worst.pos);
  const out = worst.radius + e.radius + DODGE_MARGIN;
  return {
    pos: { x: worst.pos.x + away.x * out, y: worst.pos.y + away.y * out },
    speedMult: 1.2,
  };
}

/** Direction from b to a, with a stable answer when they coincide. */
function d0(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-3) return { x: 1, y: 0 };
  return { x: dx / len, y: dy / len };
}

function pickDestination(match, e, squad, target, enemies, stance) {
  const order = squad?.order ?? { mode: 'hold', pos: e.pos };
  const leader = squad ? match.byId(squad.leaderId) : null;
  // A dead or extracted leader leaves whoever is left walking point for
  // themselves until the match hands the role on.
  const isLeader = !leader || !leader.alive || leader.extracted || leader.id === e.id;
  const anchor = isLeader ? null : leader.pos;

  // Extraction is a committed run and comes before everything else, cohesion
  // included. Every check below pulls heroes off the exit: retreating runs
  // away from the enemy rather than toward the door, rejoining chases a
  // leader who is themselves running, and the leader turning back stops the
  // dash dead. Tried keeping the rejoin here — it quadrupled the time to get
  // out. The squad converges at the door anyway, because they are all walking
  // to the same point.
  if (order.mode === 'extract') return { pos: order.pos, speedMult: 1 };

  // Getting out of the way beats everything that is not a committed
  // extraction. Standing in it to finish a cast is never the better trade —
  // the damage on these is sized to be avoided.
  const dodge = dodgeTelegraph(match, e);
  if (dodge) return dodge;

  // Retreat: below the configured floor, get behind somebody.
  //
  // This used to blend "away from the nearest enemy" with "toward the leader",
  // which sends a hurt hero into open ground as often as into cover — the
  // leader may be past the enemy, and away-from-nearest ignores the other
  // four. Falling back behind a frontliner is what a retreat is *for*: it puts
  // a body between the wounded hero and the fight.
  if (hpFrac(e) < (e.tactics.retreatHpPct ?? 0.2) + stance.retreatBias) {
    return { pos: retreatTo(match, e, squad, enemies, leader, order), speedMult: 1.15 };
  }

  // A follower who has fallen behind rejoins before doing anything else. The
  // squad being together is worth more than any single fight or pickup.
  if (!isLeader && dist(e.pos, anchor) > COHESION.followMax) {
    return { pos: { ...anchor }, speedMult: 1.12 };
  }

  // Badly strung out: the leader actually turns around. Followers past
  // `followMax` are already sprinting back, so both ends close the gap and
  // this always resolves. Milder gaps are handled by pacing instead, in
  // `paceForSquad`.
  //
  // Not while standing in an extraction zone — stepping out cancels the
  // channel and costs more than the wait.
  if (isLeader && squad?.regrouping && !e.extractingAt
      && (squad.spread ?? 0) > COHESION.returnAt) {
    // Toward the middle of the followers, not the furthest one: with two on
    // opposite sides, chasing whoever is furthest swaps target each time the
    // leader moves and the spread never closes.
    const rally = followerCentroid(match, squad, e);
    if (rally) return { pos: rally, speedMult: 1.05 };
  }

  if (target) {
    const d = dist(e.pos, target.pos);
    const idealRange = Math.max(30, e.stats.attackRange + stance.engageBonus);

    // Kiters back off when anything gets close — but backwards into a second
    // pack is not an escape. Retreat along the direction that puts the most
    // distance between this hero and *everything* hostile, not just the one
    // being shot at, and only as far as it takes to get back to range so the
    // hero is shooting again next tick rather than jogging.
    if (stance.kite && d < idealRange * 0.72) {
      let ax = 0;
      let ay = 0;
      for (const t of enemies) {
        const td = Math.max(50, dist(e.pos, t.pos));
        ax += (e.pos.x - t.pos.x) / td / td;
        ay += (e.pos.y - t.pos.y) / td / td;
      }
      const len = Math.hypot(ax, ay);
      const away = len > 1e-6 ? { x: ax / len, y: ay / len } : dirTo(target.pos, e.pos);
      const back = Math.min(KITE_MAX_STEP, idealRange - d + 40);
      return { pos: add(e.pos, scale(away, back)), speedMult: 1.05 };
    }
    if (d > idealRange * 0.95) {
      // Followers chase on a short leash from the leader; the leader keeps to
      // the squad's objective. Either way nobody wanders off after something.
      const leashAnchor = isLeader ? order.pos : anchor;
      const leashRange = isLeader ? 900 : COHESION.chaseLeash;
      if (dist(target.pos, leashAnchor) > leashRange) return { pos: { ...leashAnchor } };
      return { pos: approachSlot(match, e, squad, target, idealRange) };
    }
    // In range: hold, with a little drift to avoid stacking on allies.
    return null;
  }

  // Looting means standing on the pile, not holding formation around it —
  // but once within arm's reach, stop. Three heroes steering at one exact
  // point spend their time shoving each other off it instead of picking
  // anything up.
  if (order.mode === 'loot') {
    if (dist(e.pos, order.pos) <= PICKUP_RANGE * 0.75) return null;
    return { pos: order.pos };
  }

  // Nothing pressing: the leader walks the navigation, everyone else forms up
  // on the leader rather than on the distant objective.
  if (!isLeader) {
    // Near enough counts. Driving at an exact slot pins a follower against
    // scenery whenever the slot happens to land inside it, and the anchor is
    // now a leader who may be standing still — so the bad slot never moves.
    if (dist(e.pos, anchor) <= settleRadius(squad)) return null;
    return { pos: formationSlot(match, e, squad, anchor) };
  }
  return { pos: order.pos };
}

/**
 * Track how strung out the squad is. Hysteresis on purpose: starting to wait
 * at one distance and resuming at a shorter one stops the leader stuttering
 * forward and back across a single threshold.
 */
function updateCohesion(match, squad, members) {
  const leader = match.byId(squad.leaderId);
  if (!leader?.alive || leader.extracted) {
    squad.regrouping = false;
    squad.spread = 0;
    return;
  }
  let worst = 0;
  for (const m of members) {
    if (m.id === leader.id) continue;
    worst = Math.max(worst, dist(leader.pos, m.pos));
  }
  squad.spread = worst;
  if (!squad.regrouping && worst > COHESION.waitAt) {
    squad.regrouping = true;
    squad.regroupSince = match.time;
  } else if (squad.regrouping && worst < COHESION.resumeAt) {
    squad.regrouping = false;
  }
}

function clampToMap(match, pos) {
  const edge = 220;
  const size = match.map.size;
  return {
    x: Math.max(edge, Math.min(size - edge, pos.x)),
    y: Math.max(edge, Math.min(size - edge, pos.y)),
  };
}

/** Middle of the living followers — the point that closes the squad up. */
function followerCentroid(match, squad, leaderEntity) {
  let x = 0;
  let y = 0;
  let n = 0;
  for (const id of squad.memberIds) {
    const m = match.byId(id);
    if (!m?.alive || m.extracted || m.id === leaderEntity.id) continue;
    x += m.pos.x;
    y += m.pos.y;
    n++;
  }
  return n ? { x: x / n, y: y / n } : null;
}

/**
 * How close a follower needs to be before it stops closing in.
 *
 * Held under the leader's `resumeAt` on purpose. If a follower can consider
 * itself settled at a distance the leader still counts as trailing, the two
 * disagree forever: the follower stands, the leader keeps regrouping, and the
 * squad stops moving for the rest of the raid.
 */
function settleRadius(squad) {
  const form = FORMATIONS[squad.tactics.formation] ?? FORMATIONS.tight;
  return Math.min(form.spacing + 30, COHESION.resumeAt - 25);
}

/**
 * Where a follower should stand.
 *
 * The slot is geometry — an offset from the leader — and geometry does not
 * know about walls. A hero whose slot lands inside a rock cluster, or on the
 * far side of one, spends the walk pressed against it: the formation asks for
 * a place that cannot be stood in and the steering cannot argue.
 *
 * So the slot is checked, and a slot that cannot be occupied falls back to the
 * leader's own trail — ground the leader has just walked over, which is
 * reachable by construction. Following where somebody went is a better answer
 * than holding a shape they could not have held either.
 */
function formationSlot(match, e, squad, anchor) {
  if (!squad) return anchor;
  const wanted = rawFormationSlot(match, e, squad, anchor);

  if (!match.map.obstacles?.length) return wanted;
  const need = NAV_CLASSES[navClassFor(e.radius)];
  if (lineIsClear(match.map, anchor.x, anchor.y, wanted.x, wanted.y, need)) return wanted;

  const trail = squad.trail;
  if (trail?.length) {
    // The most recent trail point that is actually reachable from here.
    for (let i = trail.length - 1; i >= 0; i--) {
      if (lineIsClear(match.map, e.pos.x, e.pos.y, trail[i].x, trail[i].y, need)) return trail[i];
    }
  }
  return anchor;
}

function rawFormationSlot(match, e, squad, anchor) {
  const form = FORMATIONS[squad.tactics.formation] ?? FORMATIONS.tight;
  const members = squad.memberIds.map((id) => match.byId(id)).filter((m) => m?.alive);
  const idx = Math.max(0, members.findIndex((m) => m.id === e.id));

  if (form.frontline) {
    // Vanguard: melee ahead of the anchor, ranged behind it.
    const heading = squad.heading ?? { x: 1, y: 0 };
    const melee = e.stats.attack.kind === 'melee';
    const along = melee ? form.spacing : -form.spacing;
    const across = (idx - (members.length - 1) / 2) * form.spacing * 0.8;
    return {
      x: anchor.x + heading.x * along - heading.y * across,
      y: anchor.y + heading.y * along + heading.x * across,
    };
  }

  const a = (idx / Math.max(1, members.length)) * Math.PI * 2;
  return { x: anchor.x + Math.cos(a) * form.spacing, y: anchor.y + Math.sin(a) * form.spacing };
}

export function steer(match, e, dest, dt, speedMult = 1) {
  const to = sub(dest, e.pos);
  const d = Math.hypot(to.x, to.y);
  if (d < 6) { e.vel.x *= 0.6; e.vel.y *= 0.6; return; }


  // The route, if there is one worth having. Everything below — separation,
  // obstacle lean, escape — still applies on top: the field says which way the
  // world goes, the steering says how to get through the next few metres of it.
  const dir = navHeading(match, e, dest, d) ?? { x: to.x / d, y: to.y / d };

  // Separation, in two parts.
  //
  // The first is positional: already overlapping, push apart. That alone is
  // what this used to be, and it is purely reactive — two bodies walking into
  // each other feel nothing until they touch, then get shoved apart, then walk
  // back in. Head-on that is a standoff, and a standoff at exactly the
  // separation distance is the shape of the worst pin this project has
  // recorded: two heroes from opposing squads, neither able to leave.
  //
  // The second part anticipates. If we are closing on somebody and would
  // overlap them soon, lean *across* their approach now, while the correction
  // is still small. Each side does it independently and the corrections
  // compose, which is the cheap half of a reciprocal velocity obstacle.
  const sep = { x: 0, y: 0 };
  for (const other of match.neighbours(e.pos, AGENT_LOOKAHEAD)) {
    if (other === e || !other.alive) continue;
    const rx = other.pos.x - e.pos.x;
    const ry = other.pos.y - e.pos.y;
    const dd = Math.hypot(rx, ry);
    const min = e.radius + other.radius + 6;

    if (dd < min && dd > 1e-3) {
      sep.x -= (rx / dd) * (min - dd) * 0.12;
      sep.y -= (ry / dd) * (min - dd) * 0.12;
      continue;                      // already touching; anticipation is moot
    }

    const rvx = e.vel.x - (other.vel?.x ?? 0);
    const rvy = e.vel.y - (other.vel?.y ?? 0);
    const closing = rx * rvx + ry * rvy;
    if (closing <= 0) continue;      // drifting apart
    const relSpeed2 = rvx * rvx + rvy * rvy;
    if (relSpeed2 < 1) continue;

    const t = closing / relSpeed2;   // time of closest approach
    if (t <= 0 || t > AGENT_HORIZON) continue;
    const px = rx - rvx * t;
    const py = ry - rvy * t;
    const gap = Math.hypot(px, py);
    if (gap >= min) continue;        // we miss each other anyway

    // Sideways, away from where they will be. Urgency rises as the moment
    // approaches, so a distant convergence is a nudge and an imminent one is
    // a swerve.
    const urgency = (1 - t / AGENT_HORIZON) * (1 - gap / min);
    const nx = gap > 1e-3 ? -px / gap : -ry / (dd || 1);
    const ny = gap > 1e-3 ? -py / gap : rx / (dd || 1);
    sep.x += nx * urgency * AGENT_AVOID;
    sep.y += ny * urgency * AGENT_AVOID;
  }

  const avoid = avoidObstacles(match, e, dir);
  const escape = stuckEscape(match, e, dir);

  const heading = norm({
    x: dir.x + sep.x + avoid.x * AVOID_WEIGHT + escape.x * 1.6,
    y: dir.y + sep.y + avoid.y * AVOID_WEIGHT + escape.y * 1.6,
  });

  const speed = e.stats.moveSpeed * speedMult;
  e.vel.x = heading.x * speed;
  e.vel.y = heading.y * speed;

  slideMove(match.map, e, dt);
  e.facing = Math.atan2(heading.y, heading.x);
  // Still here as a safety net: sliding stops a body reaching a surface, but
  // spawning or being shoved can still leave one overlapping.
  resolveCollisions(match.map, e.pos, e.radius);

}

const slideScratch = [];

/**
 * Move a body a tick, sliding along anything it would run into.
 *
 * The old order was move first, then push back out. Those two can cancel
 * exactly — walk into a corner and the ejection returns you precisely as far
 * as you stepped, landing on the same point every tick forever. That is the
 * failure the old code detected after the fact with a blocked-tick counter and
 * backed out of along a collision normal, which is the wrong place to solve it.
 *
 * Removing the inward component of velocity *before* stepping means the
 * contact can never push back more than it has to: a body meeting a wall
 * head-on stops against it, and one meeting it at an angle carries on along
 * it. Corners resolve because each surface removes only its own normal.
 */
function slideMove(map, e, dt) {
  let vx = e.vel.x;
  let vy = e.vel.y;
  const r = e.radius;

  // Nothing to slide against. The shipped map generates no obstacles, so this
  // is the common case and it should cost a branch, not two grid queries.
  if (!map.obstacles?.length) {
    e.pos.x += vx * dt;
    e.pos.y += vy * dt;
    return;
  }

  // Two passes. One is enough for a single surface; a corner is two surfaces,
  // and the second normal has to be removed from what the first left behind.
  for (let pass = 0; pass < 2; pass++) {
    const nx = e.pos.x + vx * dt;
    const ny = e.pos.y + vy * dt;
    let touched = false;
    for (const o of obstaclesNear(map, nx, ny, slideScratch)) {
      const dx = nx - o.x;
      const dy = ny - o.y;
      const d = Math.hypot(dx, dy);
      if (d >= o.r + r || d <= 1e-4) continue;
      const inx = dx / d;
      const iny = dy / d;
      const into = vx * inx + vy * iny;
      if (into < 0) {          // moving into the surface, not away from it
        vx -= inx * into;
        vy -= iny * into;
        touched = true;
      }
    }
    if (!touched) break;
  }

  e.vel.x = vx;
  e.vel.y = vy;
  e.pos.x += vx * dt;
  e.pos.y += vy * dt;
}

/**
 * A field direction regardless of range, for a body that has already proved
 * it cannot get there on its own. Unlike `navHeading` this skips both the
 * distance gate and the line-of-sight shortcut: being stuck is evidence that
 * the straight line does not work, whatever the samples say about it.
 */
function navRoute(match, e, dest) {
  if (!match.map.obstacles?.length) return null;
  const bodyClass = navClassFor(e.radius);
  const key = `${Math.floor(dest.x / 70)},${Math.floor(dest.y / 70)},${bodyClass}`;
  const cached = match.map._flows?.get(key);
  if (!cached) {
    if ((match._navBuilds ?? 0) >= NAV_BUILDS_PER_TICK) return null;
    match._navBuilds = (match._navBuilds ?? 0) + 1;
  }
  return flowDir(cached ?? flowField(match.map, dest, bodyClass), e.pos.x, e.pos.y);
}

/**
 * Which way the flow field says to go, or null to head straight at the goal.
 *
 * This is the piece that makes the difference between steering and pathing.
 * A steering force cannot escape a local minimum while the goal pulls back
 * into it — a hundred lines of progress sampling, orbit detection and widening
 * sideways waypoints used to live here because of that — and a field has no
 * local minima at all, because it was computed backwards from the goal over
 * the whole map.
 */
function navHeading(match, e, dest, distance) {
  if (!match.map.obstacles?.length) return null;   // nothing to route around

  // Normally the field is for the long haul and the straight line does the
  // rest. But a body that has stopped getting anywhere needs a route whatever
  // the range — that is the job the deleted detour heuristics were really
  // doing, and the reason deleting them cost more than the field gave back.
  //
  // Measured: with the heuristics gone and the field kept to long distances,
  // heroes spent 16.7% of their time making no progress against 3.2% with
  // both. The field was never engaging where they were getting stuck, because
  // they get stuck at close range — pressed against a rock beside a camp they
  // are already standing in, not halfway across the map.
  if (distance < NAV_MIN_DISTANCE) return null;

  const bodyClass = navClassFor(e.radius);
  // If the goal is in plain sight, go straight at it. Following a cell field
  // when the direct line is walkable produces a staircase for no reason, and
  // on this map most lines are walkable — this is the string-pull, and it is
  // also much cheaper than a field. A body that is stuck has already proved
  // the straight line is not working, whatever the samples say.
  if (lineIsClear(match.map, e.pos.x, e.pos.y, dest.x, dest.y, NAV_CLASSES[bodyClass])) {
    return null;
  }
  const cached = match.map._flows?.get(
    `${Math.floor(dest.x / 70)},${Math.floor(dest.y / 70)},${bodyClass}`,
  );
  if (!cached) {
    // Building one costs about twenty milliseconds. Spend at most one a tick
    // and let everyone else walk straight until it exists.
    if ((match._navBuilds ?? 0) >= NAV_BUILDS_PER_TICK) return null;
    match._navBuilds = (match._navBuilds ?? 0) + 1;
  }
  const field = cached ?? flowField(match.map, dest, bodyClass);
  return flowDir(field, e.pos.x, e.pos.y);
}

/**
 * A lateral nudge around anything blocking the path ahead. Only obstacles in
 * front of us and close enough to the line of travel to actually be hit
 * contribute, so open ground costs nothing.
 */
const avoidScratch = [];
function avoidObstacles(match, e, dir) {
  let ax = 0;
  let ay = 0;
  for (const o of obstaclesNear(match.map, e.pos.x, e.pos.y, avoidScratch)) {
    const ox = o.x - e.pos.x;
    const oy = o.y - e.pos.y;

    const along = ox * dir.x + oy * dir.y;
    if (along <= 0) continue;                       // already behind us

    const clearance = o.r + e.radius + 8;
    if (along > clearance + AVOID_LOOKAHEAD) continue;

    // Distance from the obstacle centre to our line of travel.
    const perpX = ox - dir.x * along;
    const perpY = oy - dir.y * along;
    const perp = Math.hypot(perpX, perpY);
    if (perp > clearance) continue;                 // we will pass it cleanly

    // Lean away from the side the obstacle sits on. Dead ahead has no side,
    // so pick one consistently rather than stalling head-on.
    let awayX;
    let awayY;
    if (perp < 1e-3) { awayX = -dir.y; awayY = dir.x; }
    else { awayX = -perpX / perp; awayY = -perpY / perp; }

    const centred = 1 - perp / clearance;                          // 1 = head-on
    const near = 1 - along / (clearance + AVOID_LOOKAHEAD);        // 1 = right here
    ax += awayX * centred * near;
    ay += awayY * centred * near;
  }
  return { x: ax, y: ay };
}

/** Average level of a squad's living members — how deep they can safely go. */
function squadLevel(match, squad) {
  let sum = 0;
  let n = 0;
  for (const id of squad.memberIds) {
    const m = match.byId(id);
    if (m?.alive) { sum += m.level ?? 1; n++; }
  }
  return n ? sum / n : 1;
}

/**
 * The nearest body the squad still wants to cut up.
 *
 * "Wants" is the squad's carve filter applied to what the species can yield:
 * a squad set to keep only Fine carves should not walk across a field for a
 * Threshclaw, whose carves are almost never that good. Judging it on the best
 * grade the species can plausibly give avoids both walking for nothing and
 * ignoring a Nightfell because the filter is strict.
 */
function nearestCarcass(match, squad, members, centroid) {
  let best = null;
  let bestD = LOOT_SEARCH_RADIUS;
  const anyoneHasRoom = members.some((m) => m.inventory.length < packCapacity(m.equipped));
  if (!anyoneHasRoom) return null;

  for (const e of match.entities) {
    if (e.alive || e.kind === 'hero' || !(e.carvesLeft > 0)) continue;
    if (squad.ignoredPiles?.has(e.id)) continue;
    const d = dist(centroid, e.pos);
    if (d >= bestD) continue;
    // A solo carcass is always worth the walk; a pack body has to clear the filter.
    const species = CREATURES[e.defId];
    if (species && species.hunt === 'small' && !members.some((m) => wantsGrade(m, species))) continue;
    best = e;
    bestD = d;
  }
  return best;
}

/** Could this species plausibly yield something this hero would keep? */
function wantsGrade(e, species) {
  const reach = Math.min(QUALITY_ORDER.length - 1, 1 + species.tier);
  return wantsItem(e, { kind: 'part', quality: QUALITY_ORDER[reach] });
}

function nearest(e, list) {
  let best = list[0];
  let bd = Infinity;
  for (const t of list) {
    const d = dist2(e.pos, t.pos);
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Attacks
// ---------------------------------------------------------------------------

export function autoAttack(match, e, target) {
  e.attackTimer = e.stats.attackInterval;
  e.lastCombatAt = match.time;
  e.facing = Math.atan2(target.pos.y - e.pos.y, target.pos.x - e.pos.x);
  const atk = e.stats.attack;
  const spec = {
    base: atk.damage ?? 0,
    school: atk.school ?? 'physical',
    scaling: atk.scaling ?? { attackPower: 1 },
  };

  if (atk.kind === 'projectile') {
    spawnProjectile(match, e, target, { ...spec, speed: atk.projectileSpeed ?? 420 });
  } else {
    match.pushSwing(e, target);
    dealDamage(match, e, target, spec);
    // Cleave for monsters that have it.
    const cleave = e.def?.cleave;
    if (cleave) {
      for (const other of match.hostilesNear(e, cleave)) {
        if (other.id !== target.id) dealDamage(match, e, other, { ...spec, mult: 0.5 });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Looting
// ---------------------------------------------------------------------------

/**
 * Would this hero's loot policy accept this item? Ignores bag space.
 *
 * Two filters apply. The hero's own policy is what the player set on that
 * hero; the squad's floor is the standing order for the whole raid, and the
 * stricter of the two wins — a squad order can tighten a greedy hero without
 * ever loosening a picky one. Consumables answer to neither: they are governed
 * by their own toggle, because a common potion is worth carrying on exactly
 * the runs where a legendary-only filter would leave the squad with nothing to
 * drink.
 */
export function wantsItem(e, item) {
  if (!item) return false;
  const squad = e.squadTactics;
  if (item.kind === 'consumable') return squad ? squad.takeConsumables !== false : true;

  const policy = LOOT_POLICIES[e.tactics.lootPolicy] ?? LOOT_POLICIES.greedy;
  if (!policy.minQuality) return false;
  const floor = LOOT_FLOORS[squad?.lootFloor ?? 'any'] ?? LOOT_FLOORS.any;
  const need = Math.max(gradeRank(policy.minQuality), gradeRank(floor.minQuality));
  return gradeRank(item.quality) >= need;
}

/**
 * Could this hero actually end up holding the item? Wanting it is not enough:
 * with a full pack the only way to take something is to drop something worse,
 * and a squad that walks to loot it cannot lift stands there forever.
 */
export function canTake(e, item) {
  if (!wantsItem(e, item)) return false;
  // A consumable with belt room needs no pack space at all.
  if (item.kind === 'consumable' && canPackConsumable(e, item)) return true;
  if (e.inventory.length < packCapacity(e.equipped)) return true;
  let worst = Infinity;
  for (const held of e.inventory) worst = Math.min(worst, valueOf(held));
  return valueOf(item) > worst * SWAP_MARGIN;
}

/** Corpses within reach that still have carves left and are worth taking. */
export function carvableNear(match, e, radius = PICKUP_RANGE) {
  const out = [];
  for (const other of match.entities) {
    if (other.alive || other.kind === 'hero' || !(other.carvesLeft > 0)) continue;
    if (dist(e.pos, other.pos) > radius) continue;
    out.push(other);
  }
  return out;
}

/**
 * Cut up whatever is dead underfoot.
 *
 * Carving is the only way anything enters a pack now, and it is deliberately
 * not instant: a corpse takes `carve.seconds` per cut and a solo monster takes
 * four to six of them, which is the tension at the end of every fight. A hero
 * who wanders off mid-carve simply loses the progress — the corpse keeps its
 * remaining cuts for whoever comes back to it.
 */
export function tryCarve(match, e, dt) {
  const target = e.carvingId ? match.byId(e.carvingId) : null;
  if (target && (!(target.carvesLeft > 0) || dist(e.pos, target.pos) > PICKUP_RANGE)) {
    e.carvingId = null;
    e.carveProgress = 0;
  }

  if (!e.carvingId) {
    const corpse = carvableNear(match, e)[0];
    if (!corpse) return;
    // No point starting if the pack is full and the squad refuses poor cuts —
    // the AI would stand over a body producing nothing.
    if (e.inventory.length >= packCapacity(e.equipped)) return;
    e.carvingId = corpse.id;
    e.carveProgress = 0;
  }

  const corpse = match.byId(e.carvingId);
  if (!corpse) { e.carvingId = null; return; }

  e.carveProgress = (e.carveProgress ?? 0) + dt;
  const perCut = corpse.carve?.seconds ?? 1.5;
  if (e.carveProgress < perCut) return;

  e.carveProgress = 0;
  corpse.carvesLeft -= 1;
  corpse.carvedBy = e.squadId;

  const species = CREATURES[corpse.defId];
  if (!species) return;
  if (e.isPlayer) match.notice(species.id, { carves: 1 });
  const part = match.rollPart(species, corpse.carve?.qualityBias ?? 0);

  if (!wantsItem(e, part)) {
    match.pushFloat(e.pos, `left ${part.name}`, '#8c8578');
    return;
  }
  if (e.inventory.length < packCapacity(e.equipped)) {
    e.inventory.push(part);
    match.pushFloat(e.pos, part.name, match.rarityColor(part));
    match.onLooted?.(e, part);
  } else {
    match.pushFloat(e.pos, 'pack full', '#c86b5a');
  }
}

export function tryPickup(match, e) {
  const policy = LOOT_POLICIES[e.tactics.lootPolicy] ?? LOOT_POLICIES.greedy;
  const wantsConsumables = e.squadTactics ? e.squadTactics.takeConsumables !== false : true;
  if (!policy.minQuality && !wantsConsumables) return;

  const capacity = packCapacity(e.equipped);

  for (const pile of match.lootPiles) {
    if (pile.dead || !pile.items.length) continue;
    if (dist(e.pos, pile.pos) > PICKUP_RANGE) continue;

    for (let i = pile.items.length - 1; i >= 0; i--) {
      const item = pile.items[i];
      if (!canTake(e, item)) continue;

      // A found potion goes on the belt if there is room, because that is the
      // only place the AI will ever drink it from. The pack is the fallback.
      if (item.kind === 'consumable' && stowConsumable(e, item)) {
        pile.items.splice(i, 1);
        match.pushFloat(e.pos, item.name, match.rarityColor(item));
        match.onLooted?.(e, item);
        continue;
      }

      if (e.inventory.length < capacity) {
        pile.items.splice(i, 1);
        e.inventory.push(item);
        match.pushFloat(e.pos, item.name, match.rarityColor(item));
        match.onLooted?.(e, item);
        continue;
      }

      // Bags are full: trade up if this beats the worst thing we are carrying.
      // Without this a squad fills up on trash early and walks past boss loot.
      let worstIdx = -1;
      let worstScore = Infinity;
      for (let j = 0; j < e.inventory.length; j++) {
        const score = valueOf(e.inventory[j]);
        if (score < worstScore) { worstScore = score; worstIdx = j; }
      }
      if (worstIdx >= 0 && valueOf(item) > worstScore * SWAP_MARGIN) {
        const dropped = e.inventory[worstIdx];
        e.inventory[worstIdx] = item;
        pile.items[i] = dropped;
        match.pushFloat(e.pos, item.name, match.rarityColor(item));
        match.onLooted?.(e, item);
      }
    }
    if (!pile.items.length) pile.dead = true;
  }
}

/** How much better a find must be before it is worth dropping something. */
const SWAP_MARGIN = 1.15;

/** Rough desirability, used only for full-bag swaps. */
function valueOf(item) {
  if (item.kind === 'consumable') return 120 + gradeRank(item.rarity) * 90;
  if (item.kind === 'part') return partValue(item) + gradeRank(item.quality) * 110;
  return itemScore(item) + gradeRank(item.quality) * 110;
}

/**
 * Where something sits on the five-step ladder. Parts and crafted gear are
 * graded by carve quality; consumables still carry a rarity, and the two
 * ladders are the same length, so one comparison serves both.
 */
const gradeRank = (grade) => {
  const q = QUALITY_ORDER.indexOf(grade);
  if (q >= 0) return q;
  return Math.max(0, ['common', 'uncommon', 'rare', 'epic', 'legendary'].indexOf(grade ?? 'common'));
};

// ---------------------------------------------------------------------------
// Monsters
// ---------------------------------------------------------------------------

export function updateMonster(match, e, dt) {
  if (!e.alive) return;
  e.attackTimer -= dt;
  for (const k in e.abilityTimers) e.abilityTimers[k] -= dt;

  if (isControlled(e)) return;

  e.thinkTimer = (e.thinkTimer ?? match.rng() * THINK_MONSTER) - dt;
  if (e.thinkTimer <= 0) {
    e.thinkTimer += THINK_MONSTER;
    monsterThink(match, e);
  }

  let target = match.byId(e.target);
  if (target && !target.alive) { target = null; e.target = null; }

  // Abilities need something to use them on. Left ungated, a walker crossing
  // an empty quarter of the map dropped a telegraphed slam every ten seconds
  // on its own feet, and a boss standing alone in its ground burned its
  // cooldowns before anyone arrived. One per call, so a creature that has been
  // walking for two minutes does not open with everything at once.
  if (e.kind === 'boss' && target) updateBossAbilities(match, e, target);

  // Evading monsters are going home and nothing else — no target, no attacks.
  if (e.evading) {
    if (dist(e.pos, e.homePos) > EVADE_HOME) {
      steer(match, e, e.homePos, dt, EVADE_SPEED);
    } else {
      e.vel.x = 0;
      e.vel.y = 0;
      e.evading = false;
      // Reset on arrival, the way a leash is meant to work: whoever pulled it
      // out of its camp does not get to keep the damage they did on the way.
      e.hp = e.maxHp;
      e.shield = 0;
      e.threat.clear();
      // A walker that has given up rejoins its lap rather than standing at the
      // waypoint it happened to be nearest when the chase ended.
      if (e.patrol) advancePatrol(match, e);
    }
    return;
  }

  if (!target) {
    // Nothing to fight: walk home and forget who annoyed us. For a walker,
    // home is the next point on its circuit, so "go home" and "carry on
    // patrolling" are the same instruction and the leash below still means
    // something — it is measured against wherever the lap has reached, not
    // against a spawn point it left twenty minutes ago.
    if (e.patrol) advancePatrol(match, e);
    if (dist(e.pos, e.homePos) > 24) steer(match, e, e.homePos, dt);
    else { e.vel.x = 0; e.vel.y = 0; }
    return;
  }

  const range = e.stats.attackRange + e.radius + target.radius;
  const d = dist(e.pos, target.pos);
  if (d > range * 0.9) steer(match, e, target.pos, dt);
  else { e.vel.x = 0; e.vel.y = 0; }

  if (e.attackTimer <= 0 && d <= range) autoAttack(match, e, target);
}

// How close is close enough to call a waypoint reached. Wider than it looks
// necessary: a walker with a 30-unit radius steering around a rock can circle
// a tight waypoint forever without ever being inside it.
const PATROL_ARRIVE = 90;
// How far off its route a walker will go to look at something.
//
// This is what makes the walkers a threat rather than scenery. Blind circuits
// were measured and they do not work: one creature crossing a 16000-unit map
// coincides with one squad rarely enough that over twelve raids the player met
// the Duskherald zero times, and its trophy was content nobody could reach.
// A patrol that investigates is still a patrol, and it is the honest reading
// of what these are for — the fiction is that they heard the raid.
//
// Bounded on purpose. 2600 is roughly four times the widest aggro range on the
// map: near enough that the walker was going to arrive anyway, far enough that
// it closes with intent instead of drifting past. It does not track across the
// map, it does not follow you to the door, and it goes back to its lap the
// moment there is nobody in front of it.
//
// It must stay under the leash a walker is given in `Match#releaseWalker`,
// because noticing somebody makes them the waypoint the leash is measured
// from. Larger than the leash and a walker leashes itself the moment it sees
// anything.
const PATROL_DRAWN_TO = 2600;

/**
 * Move a walker's home along: to whatever it has noticed, or failing that to
 * the next point on its circuit once it arrives at this one.
 */
function advancePatrol(match, e) {
  const route = e.patrol.points;

  // Something worth looking at overrides the route. Squads make noise.
  let seen = null;
  let bestD = PATROL_DRAWN_TO;
  for (const h of match.neighbours(e.pos, PATROL_DRAWN_TO)) {
    if (h.team === e.team || !h.alive || h.extracted || h.kind !== 'hero') continue;
    const d = dist(e.pos, h.pos);
    if (d < bestD) { bestD = d; seen = h; }
  }
  if (seen) {
    e.patrol.chasing = seen.id;
    e.homePos = { ...seen.pos };
    return;
  }
  // Nothing in front of it any more: pick up the lap at the nearest waypoint
  // rather than walking back to the one it left, which on a wide band can be
  // most of a minute in the wrong direction.
  if (e.patrol.chasing) {
    e.patrol.chasing = null;
    let near = 0;
    let nearD = Infinity;
    for (let i = 0; i < route.length; i++) {
      const d = dist(e.pos, route[i]);
      if (d < nearD) { nearD = d; near = i; }
    }
    e.patrol.index = near;
    e.homePos = { ...route[near] };
    return;
  }

  if (dist(e.pos, e.homePos) > PATROL_ARRIVE) return;
  e.patrol.index = (e.patrol.index + 1) % route.length;
  e.homePos = { ...route[e.patrol.index] };
  e.patrol.laps += e.patrol.index === 0 ? 1 : 0;
}

function monsterThink(match, e) {
  // Dragged too far from its camp: give up and go home. This is a state
  // rather than a distance test — testing the line each think meant a monster
  // re-aggroed the moment it stepped back inside it, turned around, got
  // pulled out again, and never actually got home.
  if (e.evading) return;
  if (dist(e.pos, e.homePos) > e.leash) {
    e.evading = true;
    e.target = null;
    e.threat.clear();
    return;
  }

  if (e.tauntedBy && hasStatus(e, 'taunted')) {
    const forced = match.byId(e.tauntedBy);
    if (forced?.alive) { e.target = forced.id; return; }
  }

  const hostiles = match.hostilesNear(e, e.aggroRange + 220);
  let best = null;
  let bestThreat = -1;
  for (const h of hostiles) {
    const d = dist(e.pos, h.pos);
    const threat = e.threat.get(h.id) ?? 0;
    if (d > e.aggroRange && threat === 0) continue;
    const score = threat + Math.max(0, 400 - d);
    if (score > bestThreat) { bestThreat = score; best = h; }
  }
  e.target = best?.id ?? null;
  if (!best) e.threat.clear();
}

/**
 * Fire at most one of a large creature's abilities.
 *
 * One, not all of them. The timers all tick whether or not the creature has
 * anyone to use them on, so anything that has been walking or waiting for a
 * minute has every ability off cooldown at the moment a squad arrives — and
 * before this fired all three in the same tick, which is not an opening, it is
 * an execution. Taking one leaves the rest hot for the next think a third of a
 * second later, so the burst spreads over a second instead of landing at once.
 *
 * Kinds the sim has not caught up with yet cost nothing: the cooldown is set
 * where the ability is actually used, so an inert `cone` or `dive` in the data
 * does not silently eat a creature's turn every time it comes up.
 */
function updateBossAbilities(match, e, target) {
  for (const ab of e.def.abilities ?? []) {
    if ((e.abilityTimers[ab.id] ?? 0) > 0) continue;

    if (ab.kind === 'ground') {
      match.pushTelegraph({
        pos: { ...target.pos }, radius: ab.radius,
        delay: ab.telegraph ?? 1.2, sourceId: e.id,
        damage: { base: ab.damage, school: ab.school ?? 'physical', scaling: {} },
      });
    } else if (ab.kind === 'summon') {
      match.summonAdds(e, ab.spawn, ab.count, { maxAlive: ab.maxAlive, lifespan: ab.lifespan });
      match.pushFloat(e.pos, 'Summons!', '#ffb347', true);
    } else if (ab.kind === 'buff') {
      applyStatus(match, e, e, { status: ab.id, type: 'buff', duration: ab.duration, mods: ab.mods });
      match.pushFloat(e.pos, 'Enraged!', '#ff6b5c', true);
    } else {
      continue;
    }

    e.abilityTimers[ab.id] = ab.cooldown;
    return;
  }
}

// ---------------------------------------------------------------------------
// Squad-level intent
// ---------------------------------------------------------------------------

/**
 * Decide where a squad is trying to be. Returns `{mode, pos, label}`.
 * `mode` is one of travel | fight | loot | extract | hold.
 */
// How much of the leader's route to remember, and how far apart the
// breadcrumbs are. Six points at 90 units is about a formation's depth of
// history — enough for a follower to find reachable ground behind the leader,
// short enough that it is never following a route the squad has left.
const TRAIL_POINTS = 6;
const TRAIL_SPACING = 90;

/** Remember where the leader has been, for followers whose slot is blocked. */
function recordTrail(match, squad) {
  const leader = squad.leaderId ? match.byId(squad.leaderId) : null;
  if (!leader?.alive) return;
  squad.trail ??= [];
  const last = squad.trail[squad.trail.length - 1];
  if (last && dist(last, leader.pos) < TRAIL_SPACING) return;
  squad.trail.push({ x: leader.pos.x, y: leader.pos.y });
  if (squad.trail.length > TRAIL_POINTS) squad.trail.shift();
}

export function squadObjective(match, squad) {
  const members = squad.memberIds.map((id) => match.byId(id)).filter((m) => m?.alive && !m.extracted);
  if (!members.length) return { mode: 'hold', pos: squad.order?.pos ?? { x: 0, y: 0 }, label: 'Wiped' };

  const centroid = members.reduce((a, m) => ({ x: a.x + m.pos.x / members.length, y: a.y + m.pos.y / members.length }), { x: 0, y: 0 });
  const plan = SQUAD_PLANS[squad.tactics.plan] ?? SQUAD_PLANS.farm;
  const extractPlan = EXTRACT_PLANS[squad.tactics.extractPlan] ?? EXTRACT_PLANS.half;

  updateCohesion(match, squad, members);
  recordTrail(match, squad);

  // 1. Manual override from the player always wins.
  if (squad.manualOrder) {
    const mo = squad.manualOrder;
    if (mo.mode === 'extract') {
      // Re-resolve if the chosen exit has since shut. Holding the original
      // choice left squads waiting at a closed door for the rest of the raid.
      let ex = mo.extract;
      if (!ex || !extractIsOpen(ex, match.time)) {
        ex = bestExtract(match.map, centroid, match.time);
        mo.extract = ex;
      }
      return { mode: 'extract', pos: { x: ex.x, y: ex.y }, label: `Extract: ${ex.name}`, extract: ex };
    }
    // A heading is open-ended: keep projecting a point out ahead of the squad
    // so they march that way until the map runs out or the player says stop.
    if (mo.mode === 'heading') {
      const h = HEADINGS[mo.heading];
      if (h) {
        const pos = clampToMap(match, {
          x: centroid.x + h.dir.x * HEADING_REACH,
          y: centroid.y + h.dir.y * HEADING_REACH,
        });
        return { mode: 'travel', pos, label: `Heading ${h.short}` };
      }
    }
    if (mo.pos && dist(centroid, mo.pos) > 90) {
      return { mode: 'travel', pos: mo.pos, label: mo.label ?? 'Moving' };
    }
    squad.manualOrder = null;
  }

  // 2. Extraction triggers.
  const bagsFull = members.every((m) => m.inventory.length >= packCapacity(m.equipped));
  const timeUp = match.time >= extractPlan.triggerAt;
  const collapsing = match.collapseActive;
  const squadBroken = members.length === 1 && squad.memberIds.length > 1;
  if (timeUp || collapsing || (extractPlan.onFull && bagsFull) || squadBroken) {
    const ex = bestExtract(match.map, centroid, match.time);
    return { mode: 'extract', pos: { x: ex.x, y: ex.y }, label: `Extract: ${ex.name}`, extract: ex };
  }

  // 3. Contact. PvE contact is always worth fighting; a rival squad is not.
  // Committing to every squad you bump into turns a raid into a deathmatch,
  // so PvP is a decision: your plan wants it, they are on top of you, or they
  // already shot first.
  const quarry = squad.tactics.quarry;

  const contact = match.neighbours(centroid, 640)
    .filter((t) => t.alive && t.team !== squad.team && !t.evading);
  if (contact.length) {
    let pve = contact.filter((t) => t.team === 'pve');

    // A hunt order is as much about what the squad walks past as where it
    // goes. Without this the order barely steered anything: on a map of
    // seventy camps a squad is in contact with something almost permanently,
    // so the hunt step below hardly ever ran and half the raids never reached
    // a species that had eight camps on the map.
    //
    // Only the wide band is filtered. Anything already on top of the squad,
    // and anything that has drawn blood, is a fight whether the order likes
    // it or not — walking away from those is how a squad dies with an order
    // still pending.
    if (quarry?.speciesId && pve.length) {
      const committed = pve.filter((t) => t.defId === quarry.speciesId
        || dist(centroid, t.pos) < HUNT_IGNORE_RANGE
        || members.some((m) => m.lastHitBy === t.id && match.time - m.lastDamageAt < 5));
      pve = committed;
    }
    const rivals = contact.filter((t) => t.kind === 'hero');

    const shotFirst = members.some((m) => match.time - m.lastDamageAt < 4
      && match.byId(m.lastHitBy)?.kind === 'hero');
    const onTopOfUs = rivals.some((t) => dist(centroid, t.pos) < 340);
    const wantPvp = plan.huntPlayers || shotFirst || onTopOfUs;

    const pool = wantPvp && rivals.length ? [...rivals, ...pve] : pve;
    if (pool.length) {
      const focus = pool.reduce((a, b) => (rankWeight(b) > rankWeight(a) ? b : a));
      squad.focusTargetId = focus.id;
      return { mode: 'fight', pos: { x: focus.pos.x, y: focus.pos.y }, label: `Engaging ${focus.name}` };
    }

    // Rivals we would rather not fight: break off toward the objective.
    if (rivals.length && squad.tactics.avoidPlayers) {
      squad.focusTargetId = null;
      const away = norm(sub(centroid, rivals[0].pos));
      return { mode: 'travel', pos: { x: centroid.x + away.x * 900, y: centroid.y + away.y * 900 }, label: 'Breaking off' };
    }
  }
  squad.focusTargetId = null;

  // 4. Carve what the squad just killed. A carcass outranks a dropped pile
  // because it is the whole reason the fight happened, and because it has a
  // clock on it — a body waits, but not forever.
  const carcass = nearestCarcass(match, squad, members, centroid);
  if (carcass) {
    if (squad.carveTargetId !== carcass.id) {
      squad.carveTargetId = carcass.id;
      squad.carveSince = match.time;
    }
    // The same two patience guards a pile gets: a body the squad cannot reach
    // must not hold them for the rest of the raid.
    if (match.time - squad.carveSince > LOOT_TRAVEL_LIMIT) {
      (squad.ignoredPiles ??= new Set()).add(carcass.id);
      squad.carveTargetId = null;
    } else {
      return { mode: 'loot', pos: { ...carcass.pos }, label: 'Carving', pileId: carcass.id };
    }
  } else {
    squad.carveTargetId = null;
  }

  // 5. Sweep up a rival squad's dropped kit — but only a pile somebody can lift.
  const pile = nearestTakeablePile(match, squad, members, centroid);
  if (pile) {
    // Two patience guards, because a squad can fail to clear a pile in two
    // different ways.
    //
    // Standing on one and taking nothing is timed from arrival: crossing the
    // search radius takes about as long as that budget, so timing the walk on
    // the same clock would write off every distant pile before anyone got
    // there.
    //
    // Never arriving at all needs its own, longer limit. Without it a pile the
    // squad cannot reach — behind scenery, or across a fight — holds them in
    // loot mode for the rest of the raid.
    if (squad.lootTargetId !== pile.id) {
      squad.lootTargetId = pile.id;
      squad.lootSince = null;
      squad.lootTargetSince = match.time;
    }
    const arrived = dist(centroid, pile.pos) <= PICKUP_RANGE;
    if (arrived && squad.lootSince == null) squad.lootSince = match.time;

    const stoodTooLong = arrived && match.time - squad.lootSince > LOOT_PATIENCE;
    const chasedTooLong = match.time - squad.lootTargetSince > LOOT_TRAVEL_LIMIT;
    if (stoodTooLong || chasedTooLong) {
      (squad.ignoredPiles ??= new Set()).add(pile.id);
      squad.lootTargetId = null;
    }
    if (squad.lootTargetId) {
      return { mode: 'loot', pos: { ...pile.pos }, label: 'Looting', pileId: pile.id };
    }
  } else {
    squad.lootTargetId = null;
  }

  // 6. A standing hunt order. This sits below contact and carving on purpose:
  // a quarry says where to *go*, not what to ignore when something is already
  // chewing on you, and walking past a body to keep hunting would throw away
  // the reason the order exists.
  //
  // Unlike a landmark trip it does not clear itself on arrival. Clearing a
  // camp of Sicklejaw is the order being obeyed once, not finished — the squad
  // moves to the next one, which is what "hunt Sicklejaw" means to a player
  // five parts short of a set.
  if (quarry?.speciesId) {
    const found = match.findQuarry(centroid, quarry, squad);
    if (found) {
      return { mode: 'travel', pos: { x: found.x, y: found.y }, label: `Hunting ${quarryLabel(quarry)}` };
    }
    // Nothing on this map satisfies it any more: a solo hunt whose creature is
    // dead, or a pack hunt whose every camp has been cleared. That second case
    // is new — camps used to respawn, so a pack hunt could not run out, and
    // now a species is a finite thing that can be hunted out of a raid. Say so
    // once and fall through to the plan rather than leaving a squad steered by
    // an order that can no longer mean anything.
    if (!squad.huntSpent) {
      squad.huntSpent = true;
      match.log(`Nothing left to hunt: ${quarryLabel(quarry)}.`, 'info');
    }
  } else if (squad.huntSpent) {
    squad.huntSpent = false;
  }

  // 7. Follow the plan.
  if (plan.chaseEvents) {
    const ev = match.activeEvents.find((v) => v.pos);
    if (ev) return { mode: 'travel', pos: { ...ev.pos }, label: `Event: ${ev.name}` };
  }
  if (plan.huntPlayers) {
    const rival = match.nearestRivalSquadPos(squad, centroid);
    if (rival) return { mode: 'travel', pos: rival, label: 'Hunting squads' };
  }

  // Repick on arrival, or the moment the squad writes off the place it was
  // heading for. The second half is worth about two seconds a raid on its own —
  // the squad can only cross a camp off from EYES_ON, which is barely outside
  // the range it would repick at anyway — but it costs nothing now that the
  // goal remembers which point of interest it is.
  const goal = squad.roamGoal;
  if (!goal || squad.emptied?.has(squad.roamPoi) || dist(centroid, goal) < 220) {
    const poi = match.pickRoamGoal(centroid, plan.zoneBias, squadLevel(match, squad), squad);
    squad.roamPoi = poi?.id ?? null;
    squad.roamGoal = poi ? { x: poi.x, y: poi.y } : { ...centroid };
  }
  return { mode: 'travel', pos: squad.roamGoal ?? centroid, label: planLabel(plan) };
}

/**
 * The closest pile holding something a living member could actually carry.
 * Nearest rather than first-found: array order shifts as piles are created and
 * retired, and picking off that made the squad flip between two piles.
 */
function nearestTakeablePile(match, squad, members, centroid) {
  let best = null;
  let bestD = LOOT_SEARCH_RADIUS;
  for (const pile of match.lootPiles) {
    if (pile.dead || !pile.items.length) continue;
    if (squad.ignoredPiles?.has(pile.id)) continue;
    const d = dist(centroid, pile.pos);
    if (d >= bestD) continue;
    if (!members.some((m) => pile.items.some((it) => canTake(m, it)))) continue;
    bestD = d;
    best = pile;
  }
  return best;
}

function planLabel(plan) {
  return { farm: 'Farming', boss: 'Pushing the core', events: 'Roaming', pvp: 'Hunting' }[plan.id] ?? 'Roaming';
}

function rankWeight(t) {
  if (t.kind === 'hero') return 4;
  if (t.rank === 'boss') return 5;
  if (t.rank === 'elite') return 3;
  return 1;
}

/**
 * A lean toward open ground while a hero is being slowed by scenery. Purely
 * a steering force — it cannot escape a local minimum on its own, which is
 * what `detourAround` is for.
 */
function stuckEscape(match, e, dir) {
  if ((e._stuckTime ?? 0) <= STUCK_SAMPLE) return { x: 0, y: 0 };
  const side = preferredSide(match, e, dir);
  return { x: -dir.y * side, y: dir.x * side };
}

/** Which way around has more open ground: +1 for left, -1 for right. */
function preferredSide(match, e, dir) {
  let left = 0;
  let right = 0;
  for (const o of obstaclesNear(match.map, e.pos.x, e.pos.y)) {
    const ox = o.x - e.pos.x;
    const oy = o.y - e.pos.y;
    const along = ox * dir.x + oy * dir.y;
    if (along <= 0 || along > 280) continue;
    const weight = o.r / Math.max(40, along);
    // Cross product sign says which side of our heading it lies on.
    if (dir.x * oy - dir.y * ox > 0) left += weight;
    else right += weight;
  }
  return left > right ? -1 : 1;
}

/**
 * Detects a hero who is not getting anywhere and moves their destination to
 * break the deadlock.
 *
 * Progress is measured as ground gained *toward the goal*, not ground
 * covered. A hero pinned against a rock cluster orbits it at full walking
 * speed, so any test based on how far they moved says they are fine while
 * they sit at the same spot for the rest of the raid.
 *
 * Once detected, the destination is replaced with a waypoint off to the
 * clearer side and committed to. Moving the goal is the part that matters:
 * no steering force escapes a local minimum while the goal pulls back into
 * it.
 */
function detourAround(match, e, desired) {
  if (!desired) {
    e._detour = null;
    e._stuckTime = 0;
    e._progressGoal = null;
    return desired;
  }

  if (e._detour) {
    if (dist(e.pos, e._detour) < 45) {
      e._detour = null;              // made it round; resume the real goal
      e._detourFailed = false;
      e._detourFails = 0;
    } else if (match.time > e._detour.until) {
      e._detour = null;              // that way was no good either
      e._detourFailed = true;
      e._detourFails = (e._detourFails ?? 0) + 1;
      // Detouring is not working. Stop generating fresh ones for a while and
      // head straight at the goal, so the collision escape in `steer` gets a
      // clear run at it instead of being reset by a new waypoint every few
      // seconds.
      if (e._detourFails >= DETOUR_GIVE_UP) {
        e._detourBlockedUntil = match.time + DETOUR_COOLDOWN;
        e._detourFails = 0;
      }
    } else {
      return { pos: { x: e._detour.x, y: e._detour.y }, speedMult: desired.speedMult };
    }
  }

  const goalDist = dist(e.pos, desired.pos);

  // Holding position can be the objective rather than a failure to move.
  // Extraction is exactly that: stand inside the zone for eight seconds.
  // Counting it as lack of progress detoured heroes straight back out of the
  // zone and stopped them ever getting off the map. Judge it by what they are
  // doing, not by distance alone — a wide distance exemption also excused
  // heroes genuinely wedged just short of their destination.
  if (e.extractingAt || goalDist < ARRIVED_DISTANCE) {
    e._stuckTime = 0;
    e._orbitAt = undefined;
    e._progressGoal = { x: desired.pos.x, y: desired.pos.y };
    e._progressAt = match.time;
    e._progressDist = goalDist;
    return desired;
  }

  // A destination that jumped is a new plan, not a failure to reach the old
  // one, so restart the measurement rather than blaming the hero for it.
  const goalMoved = !e._progressGoal || dist(desired.pos, e._progressGoal) > 150;
  if (goalMoved || e._progressAt === undefined) {
    e._progressGoal = { x: desired.pos.x, y: desired.pos.y };
    e._progressAt = match.time;
    e._progressDist = goalDist;
    e._stuckTime = 0;
    e._orbitAt = undefined;
    return desired;
  }

  if (match.time - e._progressAt >= STUCK_SAMPLE) {
    const gained = e._progressDist - goalDist;
    e._stuckTime = gained < MIN_PROGRESS ? (e._stuckTime ?? 0) + (match.time - e._progressAt) : 0;
    e._progressAt = match.time;
    e._progressDist = goalDist;
  }

  // Second, slower check. The per-sample test above compares distance to the
  // goal, which a hero circling an obstacle can satisfy over and over while
  // ending up exactly where it started. This one asks whether they are
  // anywhere new after several seconds.
  let orbiting = false;
  if (goalDist > ORBIT_MIN_GOAL) {
    if (e._orbitAt === undefined) {
      e._orbitAt = match.time;
      e._orbitAnchor = { x: e.pos.x, y: e.pos.y };
    } else if (match.time - e._orbitAt >= ORBIT_WINDOW) {
      orbiting = dist(e.pos, e._orbitAnchor) < ORBIT_DISTANCE;
      e._orbitAt = match.time;
      e._orbitAnchor = { x: e.pos.x, y: e.pos.y };
    }
  } else {
    e._orbitAt = undefined;
  }

  if (e._detourBlockedUntil > match.time) return desired;

  if (orbiting || (e._stuckTime ?? 0) > STUCK_TRIGGER) {
    const dir = norm(sub(desired.pos, e.pos));

    // Ask the navigation field first. This detection is the part of the old
    // machinery that measurement says is load-bearing — deleting it cost more
    // than the field gave back, 3.2% of hero-time making no progress against
    // 16.7% — but the *response* was always a guess: throw a waypoint out to
    // whichever side looks emptier and hope. The field knows the actual route,
    // so where there is one, follow it and skip the guessing.
    const routed = navRoute(match, e, desired.pos);
    if (routed) {
      e._detour = {
        x: e.pos.x + routed.x * DETOUR_DISTANCE,
        y: e.pos.y + routed.y * DETOUR_DISTANCE,
        until: match.time + DETOUR_TIME,
      };
      e._stuckTime = 0;
      e._orbitAt = undefined;
      return { pos: { x: e._detour.x, y: e._detour.y }, speedMult: desired.speedMult };
    }

    // If the last detour timed out, that side was wrong — try the other.
    const side = e._detourFailed ? -preferredSide(match, e, dir) : preferredSide(match, e, dir);
    const reach = DETOUR_DISTANCE
      * (1 + Math.min(DETOUR_MAX_WIDEN, (e._detourFails ?? 0) * DETOUR_WIDEN));
    e._detour = {
      // Mostly sideways, with a little forward bias so the detour still makes
      // progress rather than simply retreating.
      x: e.pos.x - dir.y * side * reach + dir.x * 70,
      y: e.pos.y + dir.x * side * reach + dir.y * 70,
      // A longer detour needs longer to walk, or it expires before arriving
      // and is scored a failure for being far rather than for being wrong.
      until: match.time + DETOUR_TIME * (reach / DETOUR_DISTANCE),
    };
    e._stuckTime = 0;
    e._orbitAt = undefined;
    return { pos: { x: e._detour.x, y: e._detour.y }, speedMult: desired.speedMult };
  }

  return desired;
}
