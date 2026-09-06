// Turns a hero's class, level, gear, and skill tree into the flat numbers the
// combat sim actually reads. Everything funnels through `computeStats`.

import { CLASSES } from '../data/classes.js';
import { TREES } from '../data/skilltrees.js';
import { STANCES } from '../data/tactics.js';

/** Every additive modifier key the game understands, with its identity value. */
export const MOD_KEYS = [
  'might', 'agility', 'spirit', 'vitality',
  'armor', 'resist', 'maxHpFlat', 'manaRegen', 'weaponDamage', 'armorPen', 'rangeBonus',
  'attackInterval',
  'critChance', 'critDamage', 'attackSpeedPct', 'moveSpeedPct', 'damagePct', 'damageTakenPct',
  'healPower', 'lifesteal', 'cooldownPct', 'dodge', 'blockChance', 'shieldPct', 'dotPct',
  'aoeRadiusPct', 'atonement', 'vulnerability',
];

export function emptyMods() {
  const m = {};
  for (const k of MOD_KEYS) m[k] = 0;
  return m;
}

export function addMods(target, source, times = 1) {
  if (!source) return target;
  for (const [k, v] of Object.entries(source)) {
    if (!(k in target)) target[k] = 0;
    target[k] += v * times;
  }
  return target;
}

/** Passive + aura modifiers contributed by an allocated skill tree. */
export function treeMods(classId, alloc) {
  const passive = emptyMods();
  const aura = emptyMods();
  for (const n of TREES[classId].nodes) {
    const rank = alloc?.[n.id] ?? 0;
    if (rank <= 0) continue;
    if (n.mods) addMods(passive, n.mods, rank);
    if (n.aura) addMods(aura, n.aura, rank);
  }
  return { passive, aura };
}

/** Modifiers from everything the hero has equipped. */
export function gearMods(equipped) {
  const mods = emptyMods();
  for (const item of Object.values(equipped ?? {})) {
    if (item) addMods(mods, item.mods);
  }
  return mods;
}

/**
 * Compute the full stat block.
 * @param hero persisted hero record
 * @param {{extra?: object, stance?: string}} opts `extra` folds in auras and
 *        temporary buffs supplied by the match.
 */
export function computeStats(hero, opts = {}) {
  const cls = CLASSES[hero.classId];
  const level = hero.level ?? 1;

  const mods = emptyMods();

  // Class attributes: base + growth.
  for (const key of ['might', 'agility', 'spirit', 'vitality']) {
    mods[key] += cls.base[key] + cls.growth[key] * (level - 1);
  }
  mods.armor += cls.baseArmor;
  mods.resist += cls.baseResist;

  addMods(mods, gearMods(hero.equipped));
  const { passive } = treeMods(hero.classId, hero.alloc);
  addMods(mods, passive);
  if (opts.extra) addMods(mods, opts.extra);

  const stance = STANCES[opts.stance ?? hero.tactics?.stance ?? 'balanced'];
  if (stance) {
    mods.damagePct += stance.damagePct;
    mods.damageTakenPct += stance.damageTakenPct;
  }

  return deriveStats(cls, level, mods);
}

/** Second half of the pipeline: additive mod bag -> usable stats. */
export function deriveStats(cls, level, mods) {
  const might = Math.max(0, mods.might);
  const agility = Math.max(0, mods.agility);
  const spirit = Math.max(0, mods.spirit);
  const vitality = Math.max(0, mods.vitality);

  const maxHp = Math.round(200 + vitality * 22 + level * 30 + mods.maxHpFlat);
  const maxMana = Math.round(40 + spirit * 3.2);

  // Attack power keys off the class's own attribute, so an Archer's agility
  // gear is offensive gear and a Priest's spirit gear is too.
  const power = { might, agility, spirit }[cls.powerAttr ?? 'might'] ?? might;
  const attackPower = power * 1.25 + mods.weaponDamage * 0.9;
  const spellPower = spirit * 1.35 + mods.weaponDamage * 0.45;

  // Slower base weapons add to the interval before haste divides it out.
  const rawInterval = cls.attack.interval + (mods.attackInterval ?? 0);
  const haste = 1 + mods.attackSpeedPct + agility * 0.005;
  const attackInterval = Math.max(0.25, rawInterval / haste);

  return {
    level,
    might, agility, spirit, vitality,
    maxHp,
    maxMana,
    manaRegen: 1.8 + spirit * 0.11 + mods.manaRegen,
    attackPower,
    spellPower,
    armor: Math.max(0, mods.armor),
    resist: Math.max(0, mods.resist),
    armorPen: Math.max(0, mods.armorPen),
    attackInterval,
    attackRange: cls.attack.range + mods.rangeBonus,
    moveSpeed: cls.moveSpeed * (1 + mods.moveSpeedPct),
    critChance: clamp01(0.03 + agility * 0.0035 + mods.critChance),
    critDamage: 1.5 + mods.critDamage,
    damagePct: mods.damagePct,
    damageTakenPct: Math.max(-0.8, mods.damageTakenPct),
    healPower: mods.healPower,
    lifesteal: Math.min(0.75, mods.lifesteal),
    cooldownPct: Math.min(0.55, mods.cooldownPct),
    dodge: Math.min(0.6, mods.dodge),
    blockChance: Math.min(0.6, mods.blockChance),
    shieldPct: mods.shieldPct,
    dotPct: mods.dotPct,
    aoeRadiusPct: mods.aoeRadiusPct,
    atonement: mods.atonement,
    vulnerability: mods.vulnerability,
    attack: cls.attack,
  };
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Armour / resist to a multiplier. Scales with attacker level so late-game
 * armour keeps meaning something without ever reaching immunity.
 */
export function mitigation(value, attackerLevel = 1, penetration = 0) {
  const effective = Math.max(0, value - penetration);
  const k = 500 + attackerLevel * 45;
  return k / (k + effective);
}

/** Compact preview block for loadout screens. */
export function statSummary(stats) {
  return [
    ['Health', Math.round(stats.maxHp)],
    ['Mana', Math.round(stats.maxMana)],
    ['Attack power', Math.round(stats.attackPower)],
    ['Spell power', Math.round(stats.spellPower)],
    ['Armour', Math.round(stats.armor)],
    ['Resist', Math.round(stats.resist)],
    ['Attacks / s', (1 / stats.attackInterval).toFixed(2)],
    ['Crit', `${Math.round(stats.critChance * 100)}%`],
    ['Crit damage', `${Math.round(stats.critDamage * 100)}%`],
    ['Move speed', Math.round(stats.moveSpeed)],
    ['Dodge', stats.dodge > 0 ? `${Math.round(stats.dodge * 100)}%` : '—'],
    ['Cooldown', stats.cooldownPct > 0 ? `-${Math.round(stats.cooldownPct * 100)}%` : '—'],
  ];
}
