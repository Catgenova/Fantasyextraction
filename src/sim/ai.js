// The autobattler brain. Players never issue attack commands — they write
// tactics, and this file is the interpreter for them.
//
// Each hero runs, in order: survive (retreat/consumables) -> cast -> position
// -> auto-attack. Squad-level intent (where to go, when to leave) comes from
// `squadObjective` and is fed in as `squad.order`.

import { SPELLS } from '../data/spells.js';
import { CONSUMABLES } from '../data/consumables.js';
import { STANCES, TARGET_PRIORITIES, LOOT_POLICIES, FORMATIONS, SQUAD_PLANS, EXTRACT_PLANS, BACKPACK_SLOTS, COHESION, HEADINGS, HEADING_REACH } from '../data/tactics.js';
import { dealDamage, spawnProjectile, resolveEffects, isControlled, hasStatus, applyStatus, GLOBAL_COOLDOWN } from './combat.js';
import { hpFrac, manaFrac, recomputeStats } from './entity.js';
import { dist, dist2, dirTo, norm, add, scale, sub } from '../core/vec.js';
import { resolveCollisions, obstaclesNear, bestExtract } from './map.js';
import { itemScore } from '../data/gear.js';

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
const LOOT_PATIENCE = 5;      // seconds standing on a pile before writing it off
const LOOT_TRAVEL_LIMIT = 25; // seconds pursuing one pile, arrived or not

// Steering around scenery. Without these a hero walks straight into a rock,
// gets pushed back out by collision resolution, and walks into it again —
// making no progress at all for the rest of the raid.
const AVOID_LOOKAHEAD = 95;  // how far ahead to notice something in the way
const AVOID_WEIGHT = 2.1;    // how hard to lean around it
const STUCK_SAMPLE = 0.4;    // seconds between progress checks
const MIN_PROGRESS = 8;      // metres closer to the goal per sample, or it is not progress
const STUCK_TRIGGER = 1.2;   // seconds of no progress before forcing a way out
const DETOUR_DISTANCE = 300; // how far to the side a detour waypoint is placed
const DETOUR_TIME = 5;       // give up on a detour after this long
const ORBIT_WINDOW = 6;      // seconds over which to check for real displacement
const ORBIT_DISTANCE = 90;   // net ground covered in that window, or it is a loop
const ORBIT_MIN_GOAL = 150;  // only applies when the hero has somewhere to be
const DETOUR_GIVE_UP = 3;    // failed detours before giving the idea a rest
const DETOUR_COOLDOWN = 12;  // seconds of heading straight at the goal instead
const ARRIVED_DISTANCE = 24;  // genuinely standing on the spot
const BLOCKED_TICKS = 8;     // ticks of cancelled movement before backing out
const BLOCKED_RATIO = 0.25;  // fraction of intended movement that counts as moving

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

// ---------------------------------------------------------------------------
// Targeting
// ---------------------------------------------------------------------------

export function pickTarget(match, e, squad, enemies) {
  // A monster running home has dropped aggro and cannot be caught before it
  // resets, and anything already proven uncatchable is not worth a second
  // attempt. Chasing either is how a hero ends up jogging on the spot.
  enemies = enemies.filter((t) => !t.evading && !isUnreachable(e, match, t));
  if (!enemies.length) return null;

  // A taunt overrides everything the player configured.
  if (e.tauntedBy && hasStatus(e, 'taunted')) {
    const forced = match.byId(e.tauntedBy);
    if (forced?.alive) return forced;
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
    // Never walk across the map for a marginally better target.
    if (d > e.stats.attackRange + 420) score -= 40;
    if (score > bestScore) { bestScore = score; best = t; }
  }
  return best;
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

    const targets = spellTargets(match, e, spell, target, allies, enemies);
    if (!targets || !targets.length) continue;

    const score = scoreHint(spell.hint ?? {}, ctx, spell, targets);
    if (score > bestScore) { bestScore = score; bestSpell = spell; bestTargets = targets; }
  }

  if (bestSpell) castSpell(match, e, bestSpell, bestTargets, ctx);
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
  };
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

    stack.count -= 1;
    e.itemCooldowns[def.id] = def.cooldown;
    resolveEffects(match, e, [e], def.effects);
    match.pushFloat(e.pos, def.name, '#9fd7ff');
    break;
  }
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
  return { ...want, speedMult: (want.speedMult ?? 1) * COHESION.slowPace };
}

function pickDestination(match, e, squad, target, enemies, stance) {
  const order = squad?.order ?? { mode: 'hold', pos: e.pos };
  const leader = squad ? match.byId(squad.leaderId) : null;
  // A dead or extracted leader leaves whoever is left walking point for
  // themselves until the match hands the role on.
  const isLeader = !leader || !leader.alive || leader.extracted || leader.id === e.id;
  const anchor = isLeader ? null : leader.pos;

  // Retreat: below the configured floor, break for the leader / exit.
  if (hpFrac(e) < (e.tactics.retreatHpPct ?? 0.2) + stance.retreatBias) {
    const away = enemies.length ? dirTo(nearest(e, enemies).pos, e.pos) : { x: 0, y: 0 };
    const fallback = leader && leader.alive ? leader.pos : order.pos;
    const blend = norm(add(scale(away, 1.4), scale(dirTo(e.pos, fallback), 0.6)));
    return { pos: add(e.pos, scale(blend, 260)), speedMult: 1.15 };
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

  // Extraction overrides combat positioning once the squad has committed.
  if (order.mode === 'extract') return { pos: order.pos, speedMult: 1 };

  if (target) {
    const d = dist(e.pos, target.pos);
    const idealRange = Math.max(30, e.stats.attackRange + stance.engageBonus);

    // Kiters back off when anything gets close.
    if (stance.kite && d < idealRange * 0.72) {
      const away = dirTo(target.pos, e.pos);
      return { pos: add(e.pos, scale(away, 200)), speedMult: 1.05 };
    }
    if (d > idealRange * 0.95) {
      // Followers chase on a short leash from the leader; the leader keeps to
      // the squad's objective. Either way nobody wanders off after something.
      const leashAnchor = isLeader ? order.pos : anchor;
      const leashRange = isLeader ? 900 : COHESION.chaseLeash;
      if (dist(target.pos, leashAnchor) > leashRange) return { pos: { ...leashAnchor } };
      return { pos: target.pos };
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

function formationSlot(match, e, squad, anchor) {
  if (!squad) return anchor;
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

  const dir = { x: to.x / d, y: to.y / d };

  // Separation so a squad does not collapse into one pixel.
  const sep = { x: 0, y: 0 };
  for (const other of match.neighbours(e.pos, 60)) {
    if (other === e || !other.alive) continue;
    const dd = dist(e.pos, other.pos);
    const min = e.radius + other.radius + 6;
    if (dd < min && dd > 1e-3) {
      sep.x += (e.pos.x - other.pos.x) / dd * (min - dd) * 0.12;
      sep.y += (e.pos.y - other.pos.y) / dd * (min - dd) * 0.12;
    }
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

  const fromX = e.pos.x;
  const fromY = e.pos.y;
  e.pos.x += e.vel.x * dt;
  e.pos.y += e.vel.y * dt;
  e.facing = Math.atan2(heading.y, heading.x);
  resolveCollisions(match.map, e.pos, e.radius);

  // Wedged in a corner, collision resolution pushes a hero back exactly as
  // far as they stepped, landing them on the same point every tick forever.
  // No steering fixes that — the way out is along the collision normal, so
  // once the cancellation is obvious, back straight out and ignore the goal.
  const intended = speed * dt;
  const actual = Math.hypot(e.pos.x - fromX, e.pos.y - fromY);
  e._blocked = actual < intended * BLOCKED_RATIO ? (e._blocked ?? 0) + 1 : 0;

  if (e._blocked > BLOCKED_TICKS) {
    const out = escapeVector(match, e);
    if (out) {
      e.pos.x += out.x * intended * 1.6;
      e.pos.y += out.y * intended * 1.6;
      resolveCollisions(match.map, e.pos, e.radius);
      e.facing = Math.atan2(out.y, out.x);
    }
  }
}

/**
 * Direction straight out of whatever scenery is pinning a hero: the sum of
 * the push-out normals, weighted by how deeply each one has them. Returns
 * null in open ground.
 */
function escapeVector(match, e) {
  let x = 0;
  let y = 0;
  for (const o of obstaclesNear(match.map, e.pos.x, e.pos.y)) {
    const dx = e.pos.x - o.x;
    const dy = e.pos.y - o.y;
    const d = Math.hypot(dx, dy);
    const contact = o.r + e.radius + 4;
    if (d > contact || d < 1e-4) continue;
    const depth = (contact - d) / contact;
    x += (dx / d) * (0.35 + depth);
    y += (dy / d) * (0.35 + depth);
  }
  const len = Math.hypot(x, y);
  return len < 1e-4 ? null : { x: x / len, y: y / len };
}

/**
 * A lateral nudge around anything blocking the path ahead. Only obstacles in
 * front of us and close enough to the line of travel to actually be hit
 * contribute, so open ground costs nothing.
 */
function avoidObstacles(match, e, dir) {
  let ax = 0;
  let ay = 0;
  for (const o of obstaclesNear(match.map, e.pos.x, e.pos.y)) {
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

    // If the last detour timed out, that side was wrong — try the other.
    const side = e._detourFailed ? -preferredSide(match, e, dir) : preferredSide(match, e, dir);
    e._detour = {
      // Mostly sideways, with a little forward bias so the detour still makes
      // progress rather than simply retreating.
      x: e.pos.x - dir.y * side * DETOUR_DISTANCE + dir.x * 70,
      y: e.pos.y + dir.x * side * DETOUR_DISTANCE + dir.y * 70,
      until: match.time + DETOUR_TIME,
    };
    e._stuckTime = 0;
    e._orbitAt = undefined;
    return { pos: { x: e._detour.x, y: e._detour.y }, speedMult: desired.speedMult };
  }

  return desired;
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

/** Would this hero's loot policy accept this item? Ignores bag space. */
export function wantsItem(e, item) {
  const policy = LOOT_POLICIES[e.tactics.lootPolicy] ?? LOOT_POLICIES.greedy;
  if (!policy.minRarity) return false;
  return rarityRank(item.rarity) >= rarityRank(policy.minRarity);
}

/**
 * Could this hero actually end up holding the item? Wanting it is not enough:
 * with a full pack the only way to take something is to drop something worse,
 * and a squad that walks to loot it cannot lift stands there forever.
 */
export function canTake(e, item) {
  if (!wantsItem(e, item)) return false;
  if (e.inventory.length < BACKPACK_SLOTS) return true;
  let worst = Infinity;
  for (const held of e.inventory) worst = Math.min(worst, valueOf(held));
  return valueOf(item) > worst * SWAP_MARGIN;
}

export function tryPickup(match, e) {
  const policy = LOOT_POLICIES[e.tactics.lootPolicy] ?? LOOT_POLICIES.greedy;
  if (!policy.minRarity) return;

  for (const pile of match.lootPiles) {
    if (pile.dead || !pile.items.length) continue;
    // Something the player just threw away, still underfoot.
    if (pile.noPickupUntil > match.time) continue;
    if (dist(e.pos, pile.pos) > PICKUP_RANGE) continue;

    for (let i = pile.items.length - 1; i >= 0; i--) {
      const item = pile.items[i];
      if (!canTake(e, item)) continue;

      if (e.inventory.length < BACKPACK_SLOTS) {
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
  if (item.kind === 'consumable') return 120 + rarityRank(item.rarity) * 90;
  return itemScore(item) + rarityRank(item.rarity) * 110;
}

const RARITY_RANKS = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const rarityRank = (r) => Math.max(0, RARITY_RANKS.indexOf(r ?? 'common'));

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

  if (e.kind === 'boss') updateBossAbilities(match, e, target, dt);

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
    }
    return;
  }

  if (!target) {
    // Nothing to fight: walk home and forget who annoyed us.
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

function updateBossAbilities(match, e, target, dt) {
  for (const ab of e.def.abilities ?? []) {
    if ((e.abilityTimers[ab.id] ?? 0) > 0) continue;
    e.abilityTimers[ab.id] = ab.cooldown;

    if (ab.kind === 'ground') {
      const at = { ...(target?.pos ?? e.pos) };
      const radius = ab.radius;
      match.pushTelegraph({
        pos: at, radius, delay: ab.telegraph ?? 1.2, sourceId: e.id,
        damage: { base: ab.damage, school: ab.school ?? 'physical', scaling: {} },
      });
    } else if (ab.kind === 'summon') {
      match.summonAdds(e, ab.spawn, ab.count, { maxAlive: ab.maxAlive, lifespan: ab.lifespan });
      match.pushFloat(e.pos, 'Summons!', '#ffb347', true);
    } else if (ab.kind === 'buff') {
      applyStatus(match, e, e, { status: ab.id, type: 'buff', duration: ab.duration, mods: ab.mods });
      match.pushFloat(e.pos, 'Enraged!', '#ff6b5c', true);
    }
  }
}

// ---------------------------------------------------------------------------
// Squad-level intent
// ---------------------------------------------------------------------------

/**
 * Decide where a squad is trying to be. Returns `{mode, pos, label}`.
 * `mode` is one of travel | fight | loot | extract | hold.
 */
export function squadObjective(match, squad) {
  const members = squad.memberIds.map((id) => match.byId(id)).filter((m) => m?.alive && !m.extracted);
  if (!members.length) return { mode: 'hold', pos: squad.order?.pos ?? { x: 0, y: 0 }, label: 'Wiped' };

  const centroid = members.reduce((a, m) => ({ x: a.x + m.pos.x / members.length, y: a.y + m.pos.y / members.length }), { x: 0, y: 0 });
  const plan = SQUAD_PLANS[squad.tactics.plan] ?? SQUAD_PLANS.farm;
  const extractPlan = EXTRACT_PLANS[squad.tactics.extractPlan] ?? EXTRACT_PLANS.half;

  updateCohesion(match, squad, members);

  // 1. Manual override from the player always wins.
  if (squad.manualOrder) {
    const mo = squad.manualOrder;
    if (mo.mode === 'extract') {
      const ex = mo.extract ?? bestExtract(match.map, centroid, match.time);
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
  const bagsFull = members.every((m) => m.inventory.length >= BACKPACK_SLOTS);
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
  const contact = match.neighbours(centroid, 640)
    .filter((t) => t.alive && t.team !== squad.team && !t.evading);
  if (contact.length) {
    const pve = contact.filter((t) => t.team === 'pve');
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

  // 4. Sweep up nearby loot — but only a pile somebody can actually lift.
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

  // 5. Follow the plan.
  if (plan.chaseEvents) {
    const ev = match.activeEvents.find((v) => v.pos);
    if (ev) return { mode: 'travel', pos: { ...ev.pos }, label: `Event: ${ev.name}` };
  }
  if (plan.huntPlayers) {
    const rival = match.nearestRivalSquadPos(squad, centroid);
    if (rival) return { mode: 'travel', pos: rival, label: 'Hunting squads' };
  }

  const goal = squad.roamGoal;
  if (!goal || dist(centroid, goal) < 220) {
    squad.roamGoal = match.pickRoamGoal(centroid, plan.zoneBias);
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
    if (pile.noPickupUntil > match.time) continue;
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
