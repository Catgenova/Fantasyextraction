// Damage, healing, statuses, and effect resolution. Spells, consumables, and
// monster abilities all funnel through `resolveEffects`.

import { mitigation } from './stats.js';
import { recomputeStats, hpFrac } from './entity.js';
import { dist, dirTo, norm } from '../core/vec.js';
import { chance } from '../core/rng.js';
import { isInsideAnySpawn, SPAWN_PROTECTION_SECONDS } from './map.js';

export const GLOBAL_COOLDOWN = 0.9;

// ---------------------------------------------------------------------------
// Damage
// ---------------------------------------------------------------------------

/**
 * @param spec {base, school, scaling:{attackPower,spellPower,maxHp}, mult,
 *              executeBelow, executeMult, isDot, noCrit, label}
 * @returns {{amount:number, crit:boolean, dodged:boolean, blocked:boolean}}
 */
export function dealDamage(match, attacker, target, spec) {
  if (!target?.alive || !attacker) return { amount: 0, crit: false, dodged: false, blocked: false };

  // Landing zones are safe ground early on: no squad can be spawn-camped out
  // of the raid before it has had a chance to move.
  if (attacker.kind === 'hero' && target.kind === 'hero'
      && match.time < SPAWN_PROTECTION_SECONDS
      && isInsideAnySpawn(match.map, target.pos)) {
    match.pushFloat(target.pos, 'protected', '#8fd6ff');
    return { amount: 0, crit: false, dodged: false, blocked: false };
  }

  const aStats = attacker.stats;
  const tStats = target.stats;

  // Dodge is checked before anything is rolled.
  if (!spec.isDot && chance(match.rng, tStats.dodge)) {
    match.pushFloat(target.pos, 'dodge', '#cfd6e2');
    return { amount: 0, crit: false, dodged: true, blocked: false };
  }

  let amount = spec.base ?? 0;
  const sc = spec.scaling ?? {};
  if (sc.attackPower) amount += aStats.attackPower * sc.attackPower;
  if (sc.spellPower) amount += aStats.spellPower * sc.spellPower;
  if (sc.maxHp) amount += attacker.maxHp * sc.maxHp;

  amount *= 1 + aStats.damagePct;
  if (spec.isDot) amount *= 1 + aStats.dotPct;
  if (spec.mult) amount *= spec.mult;

  // Execute windows.
  if (spec.executeBelow && hpFrac(target) <= spec.executeBelow) amount *= spec.executeMult ?? 2;

  let crit = false;
  if (!spec.isDot && !spec.noCrit && chance(match.rng, aStats.critChance)) {
    crit = true;
    amount *= aStats.critDamage;
  }

  // Mitigation by school.
  const school = spec.school ?? 'physical';
  const defence = school === 'magic' ? tStats.resist : tStats.armor;
  amount *= mitigation(defence, attacker.level ?? 1, school === 'magic' ? 0 : aStats.armorPen);

  // Target-side multipliers.
  amount *= 1 + tStats.damageTakenPct;
  amount *= 1 + (tStats.vulnerability ?? 0);

  let blocked = false;
  if (!spec.isDot && chance(match.rng, tStats.blockChance)) {
    blocked = true;
    amount *= 0.45;
  }

  amount = Math.max(1, Math.round(amount));

  // Shields absorb first.
  if (target.shield > 0) {
    const absorbed = Math.min(target.shield, amount);
    target.shield -= absorbed;
    amount -= absorbed;
    if (absorbed > 0) match.pushFloat(target.pos, `-${absorbed}`, '#8fd6ff');
  }

  if (amount > 0) {
    target.hp -= amount;
    target.lastHitBy = attacker.id;
    target.lastDamageAt = match.time;
    attacker.lastCombatAt = match.time;
    target.lastCombatAt = match.time;
    addThreat(target, attacker, amount);
    match.pushFloat(target.pos, `${amount}`, crit ? '#ffcf5c' : school === 'magic' ? '#b98ef5' : '#ff8a7a', crit);
  }

  attacker.damageDealt = (attacker.damageDealt ?? 0) + amount;
  if (attacker.stats_run) attacker.stats_run.damage += amount;
  if (target.stats_run) target.stats_run.taken += amount;

  // Lifesteal and Atonement.
  if (amount > 0 && aStats.lifesteal > 0) applyHeal(match, attacker, attacker, amount * aStats.lifesteal, { silent: true });
  if (amount > 0 && aStats.atonement > 0 && school === 'magic') {
    const ally = match.lowestAlly(attacker);
    if (ally) applyHeal(match, attacker, ally, amount * aStats.atonement, { silent: true });
  }

  if (target.hp <= 0) match.killEntity(target, attacker);

  return { amount, crit, dodged: false, blocked };
}

export function addThreat(target, attacker, amount) {
  if (!target.threat) return;
  target.threat.set(attacker.id, (target.threat.get(attacker.id) ?? 0) + amount);
}

// ---------------------------------------------------------------------------
// Healing and shields
// ---------------------------------------------------------------------------

export function applyHeal(match, source, target, rawAmount, opts = {}) {
  if (!target?.alive) return 0;
  let amount = rawAmount * (1 + (source?.stats?.healPower ?? 0));
  amount = Math.round(Math.max(0, amount));
  const before = target.hp;
  target.hp = Math.min(target.maxHp, target.hp + amount);
  const healed = Math.round(target.hp - before);
  if (healed > 0 && !opts.silent) match.pushFloat(target.pos, `+${healed}`, '#79e08a');
  if (source?.stats_run) source.stats_run.healing += healed;
  return healed;
}

export function applyShield(match, source, target, rawAmount, duration = 10) {
  if (!target?.alive) return 0;
  const amount = Math.round(rawAmount * (1 + (source?.stats?.shieldPct ?? 0)));
  target.shield = Math.max(target.shield, amount);
  applyStatus(match, source, target, { status: 'shielded', duration, type: 'buff' });
  match.pushFloat(target.pos, `shield ${amount}`, '#8fd6ff');
  return amount;
}

// ---------------------------------------------------------------------------
// Statuses
// ---------------------------------------------------------------------------

export const CONTROL_STATUSES = new Set(['stun', 'root', 'fear']);

/**
 * @param spec {status, duration, mods, type:'buff'|'debuff', tick, effect,
 *              stacks, sourceId}
 */
export function applyStatus(match, source, target, spec) {
  if (!target?.alive) return null;
  const type = spec.type ?? (spec.mods && negative(spec.mods) ? 'debuff' : 'buff');

  const existing = target.statuses.find((s) => s.status === spec.status && s.sourceId === (source?.id ?? null));
  if (existing) {
    existing.duration = Math.max(existing.duration, spec.duration ?? 0);
    existing.remaining = existing.duration;
    return existing;
  }

  const st = {
    status: spec.status,
    type,
    duration: spec.duration ?? 0,
    remaining: spec.duration ?? 0,
    mods: spec.mods ? { ...spec.mods } : null,
    tick: spec.tick ?? null,
    tickTimer: spec.tick ?? 0,
    damage: spec.damage ?? null,
    heal: spec.heal ?? null,
    sourceId: source?.id ?? null,
  };
  target.statuses.push(st);
  if (st.mods) recomputeStats(target);
  return st;
}

function negative(mods) {
  return Object.values(mods).some((v) => v < 0);
}

export function hasStatus(e, status) {
  return e.statuses.some((s) => s.status === status);
}

export function isControlled(e) {
  return e.statuses.some((s) => CONTROL_STATUSES.has(s.status));
}

export function removeDebuffs(match, target, count) {
  let removed = 0;
  for (let i = target.statuses.length - 1; i >= 0 && removed < count; i--) {
    if (target.statuses[i].type === 'debuff') {
      target.statuses.splice(i, 1);
      removed++;
    }
  }
  if (removed) recomputeStats(target);
  return removed;
}

/** Advance every status on an entity; handles dot/hot ticks and expiry. */
export function tickStatuses(match, e, dt) {
  if (!e.statuses.length) return;
  let dirty = false;
  for (let i = e.statuses.length - 1; i >= 0; i--) {
    const st = e.statuses[i];
    st.remaining -= dt;

    if (st.tick) {
      st.tickTimer -= dt;
      while (st.tickTimer <= 0) {
        st.tickTimer += st.tick;
        const source = match.byId(st.sourceId) ?? e;
        if (st.damage) dealDamage(match, source, e, { ...st.damage, isDot: true, noCrit: true });
        if (st.heal) applyHeal(match, source, e, st.heal.base + (source.stats.spellPower * (st.heal.scaling?.spellPower ?? 0)));
        if (!e.alive) break;
      }
    }

    if (st.remaining <= 0) {
      if (st.status === 'shielded') e.shield = 0;
      e.statuses.splice(i, 1);
      if (st.mods) dirty = true;
    }
  }
  if (dirty) recomputeStats(e);
}

// ---------------------------------------------------------------------------
// Effect resolution
// ---------------------------------------------------------------------------

/**
 * Run a spell/consumable/ability effect list.
 * @param targets array of entities the effects land on
 * @param ctx {radiusMult, source spell def}
 */
export function resolveEffects(match, source, targets, effects, ctx = {}) {
  for (const eff of effects) {
    switch (eff.type) {
      case 'damage':
        for (const t of targets) {
          dealDamage(match, source, t, {
            base: eff.base, school: eff.school, scaling: eff.scaling,
            executeBelow: eff.executeBelow, executeMult: eff.executeMult,
          });
        }
        break;

      case 'heal':
        for (const t of targets) {
          const amount = (eff.base ?? 0)
            + (source.stats.spellPower * (eff.scaling?.spellPower ?? 0))
            + (t.maxHp * (eff.scaling?.maxHp ?? 0));
          applyHeal(match, source, t, amount);
        }
        break;

      case 'mana':
        for (const t of targets) t.mana = Math.min(t.maxMana, t.mana + (eff.base ?? 0));
        break;

      case 'shield':
        for (const t of targets) {
          const amount = (eff.base ?? 0)
            + (source.stats.spellPower * (eff.scaling?.spellPower ?? 0))
            + (t.maxHp * (eff.scaling?.maxHp ?? 0));
          applyShield(match, source, t, amount, eff.duration ?? 8);
        }
        break;

      case 'dot':
        for (const t of targets) {
          applyStatus(match, source, t, {
            status: eff.status ?? 'bleed', type: 'debuff', duration: eff.duration, tick: eff.tick ?? 1,
            damage: { base: eff.base, school: eff.school, scaling: eff.scaling },
          });
        }
        break;

      case 'hot':
        for (const t of targets) {
          applyStatus(match, source, t, {
            status: eff.status ?? 'renew', type: 'buff', duration: eff.duration, tick: eff.tick ?? 1,
            heal: { base: eff.base, scaling: eff.scaling },
          });
        }
        break;

      case 'buff':
        for (const t of targets) {
          applyStatus(match, source, t, { status: eff.status, type: 'buff', duration: eff.duration, mods: eff.mods });
        }
        break;

      case 'debuff':
        for (const t of targets) {
          applyStatus(match, source, t, { status: eff.status, type: 'debuff', duration: eff.duration, mods: eff.mods });
        }
        break;

      case 'taunt':
        for (const t of targets) {
          applyStatus(match, source, t, { status: 'taunted', type: 'debuff', duration: eff.duration });
          t.tauntedBy = source.id;
          t.target = source.id;
          addThreat(t, source, t.maxHp * 0.5);
        }
        break;

      case 'cleanse':
        for (const t of targets) removeDebuffs(match, t, eff.count ?? 1);
        break;

      case 'dash': {
        const dir = ctx.dashDir ?? { x: 0, y: 0 };
        source.pos.x += dir.x * eff.distance;
        source.pos.y += dir.y * eff.distance;
        match.clampToMap(source);
        break;
      }

      default:
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// Projectiles
// ---------------------------------------------------------------------------

export function spawnProjectile(match, source, target, spec) {
  match.projectiles.push({
    id: `p_${match.projectileSeq++}`,
    sourceId: source.id,
    targetId: target.id,
    team: source.team,
    pos: { ...source.pos },
    speed: spec.speed ?? 420,
    spec,
    color: spec.color ?? (spec.school === 'magic' ? '#b98ef5' : '#ffe6a8'),
    radius: spec.radius ?? 4,
    life: 3.5,
  });
}

export function updateProjectiles(match, dt) {
  for (let i = match.projectiles.length - 1; i >= 0; i--) {
    const p = match.projectiles[i];
    const target = match.byId(p.targetId);
    p.life -= dt;
    if (!target || !target.alive || p.life <= 0) { match.projectiles.splice(i, 1); continue; }

    const d = dirTo(p.pos, target.pos);
    const step = p.speed * dt;
    const remaining = dist(p.pos, target.pos);
    if (remaining <= step + target.radius) {
      const source = match.byId(p.sourceId);
      if (source) {
        if (p.spec.effects) resolveEffects(match, source, [target], p.spec.effects);
        else dealDamage(match, source, target, p.spec);
      }
      match.projectiles.splice(i, 1);
      continue;
    }
    p.pos.x += d.x * step;
    p.pos.y += d.y * step;
  }
}
