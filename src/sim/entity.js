// Runtime entities. Heroes and monsters share one shape so combat, targeting,
// and rendering never have to branch on what they are looking at.

import { CLASSES } from '../data/classes.js';
import { CREATURES } from '../data/creatures.js';
import { CARVE_PROFILE } from '../data/parts.js';
import { emptyMods, addMods, gearMods, treeMods, deriveStats } from './stats.js';
import { STANCES } from '../data/tactics.js';

let nextId = 1;
export const freshId = (prefix) => `${prefix}_${nextId++}`;

/** Reset the id counter so a replayed match produces identical ids. */
export function resetIds() { nextId = 1; }

// ---------------------------------------------------------------------------
// Heroes
// ---------------------------------------------------------------------------

/**
 * Rebuild everything a hero's stats derive from except auras and statuses:
 * class growth, gear, and skill-tree passives. Gear can change mid-raid now,
 * so this has to be re-runnable rather than computed once at spawn.
 */
export function rebuildHeroMods(e) {
  const cls = CLASSES[e.classId];
  const { passive } = treeMods(e.classId, e.alloc ?? {});

  const mods = emptyMods();
  for (const key of ['might', 'agility', 'spirit', 'vitality']) {
    mods[key] += cls.base[key] + cls.growth[key] * ((e.level ?? 1) - 1);
  }
  mods.armor += cls.baseArmor;
  mods.resist += cls.baseResist;
  addMods(mods, gearMods(e.equipped));
  addMods(mods, passive);

  const stance = STANCES[e.tactics?.stance ?? 'balanced'];
  if (stance) {
    mods.damagePct += stance.damagePct;
    mods.damageTakenPct += stance.damageTakenPct;
  }

  e.baseMods = mods;
  return recomputeStats(e);
}

export function makeHeroEntity(hero, { team, squadId, isPlayer = false, pos = { x: 0, y: 0 } }) {
  const cls = CLASSES[hero.classId];

  const e = {
    id: freshId('h'),
    kind: 'hero',
    heroId: hero.id,
    classId: hero.classId,
    name: hero.name,
    team, squadId, isPlayer,
    level: hero.level ?? 1,
    color: cls.color,
    radius: 16,
    pos: { ...pos },
    vel: { x: 0, y: 0 },
    facing: 0,
    alive: true,
    // Kept so gear changes during the raid can rebuild the tree passives too.
    alloc: { ...(hero.alloc ?? {}) },
    baseMods: emptyMods(),
    auraMods: emptyMods(),
    statuses: [],
    stats: null,
    hp: 0, maxHp: 0, mana: 0, maxMana: 0, shield: 0,
    attackTimer: 0,
    globalCooldown: 0,
    cooldowns: {},
    itemCooldowns: {},
    target: null,
    threat: new Map(),
    lastHitBy: null,
    lastDamageAt: -999,
    lastCombatAt: -999,
    // What this hero brought in and what they have picked up. Both are lost
    // to the killer if they die before extracting.
    equipped: { ...(hero.equipped ?? {}) },
    inventory: [],
    consumables: (hero.consumables ?? []).map((c) => ({ ...c })),
    spells: (hero.spells ?? []).filter(Boolean),
    tactics: { ...(hero.tactics ?? {}) },
    stats_run: { damage: 0, healing: 0, kills: 0, taken: 0 },
    extracted: false,
  };

  rebuildHeroMods(e);
  e.hp = e.maxHp;
  e.mana = e.maxMana;
  return e;
}

// ---------------------------------------------------------------------------
// Monsters
// ---------------------------------------------------------------------------

/**
 * Spawn a creature. There is no longer an enemy table and a boss table — there
 * is one bestiary, and whether something is a solo hunt is a property of the
 * species rather than of how it was asked for.
 */
export function makeEnemyEntity(defId, { pos, tierScale = 1, level = 1, ownerPoi = null, rng = Math.random }) {
  const def = CREATURES[defId];
  if (!def) throw new Error(`unknown species: ${defId}`);
  const solo = def.hunt === 'solo';

  const e = {
    id: freshId(solo ? 'b' : 'e'),
    kind: solo ? 'boss' : 'enemy',
    defId,
    rank: solo ? 'boss' : 'pack',
    behaviour: def.behaviour,
    name: def.name,
    team: 'pve',
    squadId: null,
    level,
    color: def.color,
    radius: def.radius ?? 14,
    pos: { ...pos },
    vel: { x: 0, y: 0 },
    facing: 0,
    alive: true,
    homePos: { ...pos },
    ownerPoi,
    // Set once dragged past the leash; cleared only on reaching home again.
    evading: false,
    aggroRange: def.aggroRange ?? 300,
    leash: solo ? 900 : 700,
    statuses: [],
    baseMods: emptyMods(),
    auraMods: emptyMods(),
    def,
    tierScale,
    stats: null,
    hp: 0, maxHp: 0, mana: 0, maxMana: 0, shield: 0,
    attackTimer: 0,
    cooldowns: {},
    abilityTimers: {},
    target: null,
    threat: new Map(),
    lastHitBy: null,
    lastDamageAt: -999,
    // A corpse is carved, not looted. `carvesLeft` is set the moment it dies.
    carve: CARVE_PROFILE[solo ? 'large' : 'small'],
    carvesLeft: 0,
    carvedBy: null,
    xp: Math.round((def.xp ?? 10) * tierScale),
  };

  for (const ab of def.abilities ?? []) e.abilityTimers[ab.id] = ab.cooldown * (0.4 + rng() * 0.4);

  recomputeStats(e);
  e.hp = e.maxHp;
  return e;
}

// ---------------------------------------------------------------------------
// Stat recomputation
// ---------------------------------------------------------------------------

/** Sum base + auras + active statuses, then derive. Call on any status change. */
export function recomputeStats(e) {
  const mods = emptyMods();
  addMods(mods, e.baseMods);
  addMods(mods, e.auraMods);
  for (const st of e.statuses) if (st.mods) addMods(mods, st.mods);

  const hpBefore = e.maxHp;

  if (e.kind === 'hero') {
    e.stats = deriveStats(CLASSES[e.classId], e.level, mods);
  } else {
    e.stats = deriveEnemyStats(e.def, e.tierScale, mods);
  }

  e.maxHp = e.stats.maxHp;
  e.maxMana = e.stats.maxMana;
  // Growing max HP grants the difference so buffs feel like buffs.
  if (hpBefore > 0 && e.maxHp > hpBefore) e.hp += e.maxHp - hpBefore;
  e.hp = Math.min(e.hp, e.maxHp);
  e.mana = Math.min(e.mana, e.maxMana);
  return e;
}

function deriveEnemyStats(def, tierScale, mods) {
  const haste = 1 + mods.attackSpeedPct;
  return {
    level: 1,
    maxHp: Math.round(def.hp * tierScale + mods.maxHpFlat),
    maxMana: 0,
    manaRegen: 0,
    attackPower: def.damage * tierScale,
    spellPower: def.damage * tierScale,
    armor: Math.max(0, def.armor * tierScale + mods.armor),
    resist: Math.max(0, def.resist * tierScale + mods.resist),
    armorPen: mods.armorPen,
    attackInterval: Math.max(0.3, def.attackInterval / haste),
    attackRange: def.range + mods.rangeBonus,
    moveSpeed: def.moveSpeed * (1 + mods.moveSpeedPct),
    critChance: Math.min(1, 0.05 + mods.critChance),
    critDamage: 1.5 + mods.critDamage,
    damagePct: mods.damagePct,
    damageTakenPct: Math.max(-0.8, mods.damageTakenPct),
    healPower: 0,
    lifesteal: mods.lifesteal,
    cooldownPct: Math.min(0.5, mods.cooldownPct),
    dodge: Math.min(0.5, mods.dodge),
    blockChance: 0,
    shieldPct: 0,
    dotPct: 0,
    aoeRadiusPct: 0,
    atonement: 0,
    vulnerability: mods.vulnerability,
    attack: {
      kind: def.projectile ? 'projectile' : 'melee',
      range: def.range,
      school: def.school ?? 'physical',
      projectileSpeed: def.projectileSpeed ?? 400,
      scaling: { attackPower: 1 },
      damage: 0,
    },
  };
}

export const hpFrac = (e) => (e.maxHp > 0 ? e.hp / e.maxHp : 0);
export const manaFrac = (e) => (e.maxMana > 0 ? e.mana / e.maxMana : 1);
export const isHostile = (a, b) => a.team !== b.team;
export const isAlly = (a, b) => a.team === b.team && a.id !== b.id;

/** Everything a corpse leaves behind — bags AND what they were wearing. */
/**
 * What a downed hero leaves on the ground. Creatures leave a corpse to carve
 * instead — this is only ever a rival squad's, which is the whole reason to
 * take the fight.
 */
export function lootableFrom(e) {
  const out = [];
  for (const item of e.inventory ?? []) out.push(item);
  for (const item of Object.values(e.equipped ?? {})) if (item) out.push(item);
  for (const c of e.consumables ?? []) if (c.count > 0) out.push(c);
  return out;
}
