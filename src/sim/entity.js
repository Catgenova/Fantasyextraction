// Runtime entities. Heroes and monsters share one shape so combat, targeting,
// and rendering never have to branch on what they are looking at.

import { CLASSES } from '../data/classes.js';
import { ENEMIES, BOSSES } from '../data/enemies.js';
import { emptyMods, addMods, gearMods, treeMods, deriveStats } from './stats.js';
import { STANCES } from '../data/tactics.js';

let nextId = 1;
export const freshId = (prefix) => `${prefix}_${nextId++}`;

/** Reset the id counter so a replayed match produces identical ids. */
export function resetIds() { nextId = 1; }

// ---------------------------------------------------------------------------
// Heroes
// ---------------------------------------------------------------------------

export function makeHeroEntity(hero, { team, squadId, isPlayer = false, pos = { x: 0, y: 0 } }) {
  const cls = CLASSES[hero.classId];
  const { passive } = treeMods(hero.classId, hero.alloc);

  const baseMods = emptyMods();
  for (const key of ['might', 'agility', 'spirit', 'vitality']) {
    baseMods[key] += cls.base[key] + cls.growth[key] * ((hero.level ?? 1) - 1);
  }
  baseMods.armor += cls.baseArmor;
  baseMods.resist += cls.baseResist;
  addMods(baseMods, gearMods(hero.equipped));
  addMods(baseMods, passive);

  const stance = STANCES[hero.tactics?.stance ?? 'balanced'];
  if (stance) {
    baseMods.damagePct += stance.damagePct;
    baseMods.damageTakenPct += stance.damageTakenPct;
  }

  const e = {
    id: freshId('h'),
    kind: 'hero',
    heroId: hero.id,
    classId: hero.classId,
    name: hero.name,
    team, squadId, isPlayer,
    level: hero.level ?? 1,
    color: cls.color,
    radius: 14,
    pos: { ...pos },
    vel: { x: 0, y: 0 },
    facing: 0,
    alive: true,
    baseMods,
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

  recomputeStats(e);
  e.hp = e.maxHp;
  e.mana = e.maxMana;
  return e;
}

// ---------------------------------------------------------------------------
// Monsters
// ---------------------------------------------------------------------------

export function makeEnemyEntity(defId, { pos, tierScale = 1, level = 1, isBoss = false, ownerPoi = null, rng = Math.random }) {
  const def = isBoss ? BOSSES[defId] : ENEMIES[defId];
  if (!def) throw new Error(`unknown ${isBoss ? 'boss' : 'enemy'}: ${defId}`);

  const e = {
    id: freshId(isBoss ? 'b' : 'e'),
    kind: isBoss ? 'boss' : 'enemy',
    defId,
    rank: def.rank,
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
    aggroRange: def.aggroRange ?? 300,
    leash: isBoss ? 900 : 700,
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
    lootTable: def.lootTable,
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
export function lootableFrom(e) {
  const out = [];
  for (const item of e.inventory ?? []) out.push(item);
  for (const item of Object.values(e.equipped ?? {})) if (item) out.push(item);
  for (const c of e.consumables ?? []) if (c.count > 0) out.push(c);
  return out;
}
