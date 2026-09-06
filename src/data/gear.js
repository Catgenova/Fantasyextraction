// Gear: slots, base item types, affix pool, rarity, and the roller that turns
// a loot-table entry into a concrete item instance.

import { rand, pick, weightedPick, shuffle } from '../core/rng.js';

export const SLOTS = ['weapon', 'offhand', 'head', 'chest', 'hands', 'legs', 'trinket'];

export const SLOT_NAMES = {
  weapon: 'Weapon',
  offhand: 'Off-hand',
  head: 'Head',
  chest: 'Chest',
  hands: 'Hands',
  legs: 'Legs',
  trinket: 'Trinket',
};

export const RARITIES = {
  common: { id: 'common', name: 'Common', color: '#b9bfc9', affixes: 1, power: 1.0, weight: 100 },
  uncommon: { id: 'uncommon', name: 'Uncommon', color: '#6fd08c', affixes: 2, power: 1.25, weight: 45 },
  rare: { id: 'rare', name: 'Rare', color: '#5aa9f7', affixes: 3, power: 1.6, weight: 16 },
  epic: { id: 'epic', name: 'Epic', color: '#b57af3', affixes: 4, power: 2.1, weight: 5 },
  legendary: { id: 'legendary', name: 'Legendary', color: '#f0a33c', affixes: 5, power: 2.8, weight: 1 },
};

export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

// ---------------------------------------------------------------------------
// Base item types
// ---------------------------------------------------------------------------
// `implicit` is the guaranteed stat block scaled by item level; affixes roll on
// top of it. `classes: null` means anyone can equip it.

export const BASES = [
  // --- Weapons -------------------------------------------------------------
  { id: 'sword', name: 'Longsword', slot: 'weapon', classes: ['knight'], implicit: { weaponDamage: 9, might: 2 } },
  { id: 'mace', name: 'War Mace', slot: 'weapon', classes: ['knight'], implicit: { weaponDamage: 11, attackInterval: 0.15 } },
  { id: 'bow', name: 'Recurve Bow', slot: 'weapon', classes: ['archer'], implicit: { weaponDamage: 8, agility: 2 } },
  { id: 'staff', name: 'Oaken Staff', slot: 'weapon', classes: ['priest'], implicit: { weaponDamage: 5, spirit: 3, healPower: 0.04 } },

  // --- Off-hands -----------------------------------------------------------
  { id: 'kite_shield', name: 'Kite Shield', slot: 'offhand', classes: ['knight'], implicit: { armor: 34, blockChance: 0.08 } },
  { id: 'quiver', name: 'Quiver', slot: 'offhand', classes: ['archer'], implicit: { critChance: 0.03, attackSpeedPct: 0.05 } },
  { id: 'tome', name: 'Prayer Tome', slot: 'offhand', classes: ['priest'], implicit: { spirit: 3, manaRegen: 0.8 } },

  // --- Armour (shared, but weight class gates who wants it) ----------------
  { id: 'plate_helm', name: 'Plate Helm', slot: 'head', classes: ['knight'], implicit: { armor: 26, vitality: 3 } },
  { id: 'hood', name: 'Ranger Hood', slot: 'head', classes: ['archer'], implicit: { armor: 12, agility: 3 } },
  { id: 'circlet', name: 'Silver Circlet', slot: 'head', classes: ['priest'], implicit: { resist: 18, spirit: 3 } },

  { id: 'plate_chest', name: 'Plate Cuirass', slot: 'chest', classes: ['knight'], implicit: { armor: 44, vitality: 5 } },
  { id: 'leather_chest', name: 'Leather Jerkin', slot: 'chest', classes: ['archer'], implicit: { armor: 22, agility: 4 } },
  { id: 'robe', name: 'Woven Robe', slot: 'chest', classes: ['priest'], implicit: { resist: 28, spirit: 4 } },

  { id: 'gauntlets', name: 'Gauntlets', slot: 'hands', classes: null, implicit: { armor: 14, might: 2 } },
  { id: 'gloves', name: 'Supple Gloves', slot: 'hands', classes: null, implicit: { armor: 8, attackSpeedPct: 0.04 } },

  { id: 'greaves', name: 'Greaves', slot: 'legs', classes: null, implicit: { armor: 20, vitality: 2 } },
  { id: 'trousers', name: 'Padded Trousers', slot: 'legs', classes: null, implicit: { armor: 10, moveSpeedPct: 0.04 } },

  { id: 'ring', name: 'Signet Ring', slot: 'trinket', classes: null, implicit: { critChance: 0.02 } },
  { id: 'amulet', name: 'Amulet', slot: 'trinket', classes: null, implicit: { resist: 12, manaRegen: 0.5 } },
  { id: 'charm', name: 'Bone Charm', slot: 'trinket', classes: null, implicit: { vitality: 3, lifesteal: 0.02 } },
];

export const BASES_BY_ID = Object.fromEntries(BASES.map((b) => [b.id, b]));

// ---------------------------------------------------------------------------
// Affixes
// ---------------------------------------------------------------------------
// `roll` is the value range at item level 1; it scales with ilvl and rarity.
// `slots: null` means the affix can appear on any slot.

export const AFFIXES = [
  { id: 'of_might', name: 'of Might', stat: 'might', roll: [2, 5], slots: null, weight: 10 },
  { id: 'of_agility', name: 'of the Hawk', stat: 'agility', roll: [2, 5], slots: null, weight: 10 },
  { id: 'of_spirit', name: 'of Spirit', stat: 'spirit', roll: [2, 5], slots: null, weight: 10 },
  { id: 'of_vitality', name: 'of the Bear', stat: 'vitality', roll: [2, 6], slots: null, weight: 10 },
  { id: 'plated', name: 'Plated', stat: 'armor', roll: [8, 20], slots: ['head', 'chest', 'hands', 'legs', 'offhand'], weight: 9 },
  { id: 'warded', name: 'Warded', stat: 'resist', roll: [8, 18], slots: ['head', 'chest', 'hands', 'legs', 'trinket'], weight: 8 },
  { id: 'keen', name: 'Keen', stat: 'critChance', roll: [0.015, 0.04], slots: ['weapon', 'hands', 'trinket'], weight: 7, pct: true },
  { id: 'brutal', name: 'Brutal', stat: 'critDamage', roll: [0.08, 0.22], slots: ['weapon', 'trinket'], weight: 6, pct: true },
  { id: 'swift', name: 'Swift', stat: 'attackSpeedPct', roll: [0.03, 0.08], slots: ['weapon', 'hands', 'offhand'], weight: 7, pct: true },
  { id: 'fleet', name: 'Fleet', stat: 'moveSpeedPct', roll: [0.03, 0.07], slots: ['legs', 'trinket'], weight: 6, pct: true },
  { id: 'cruel', name: 'Cruel', stat: 'damagePct', roll: [0.04, 0.10], slots: ['weapon', 'trinket'], weight: 5, pct: true },
  { id: 'hallowed', name: 'Hallowed', stat: 'healPower', roll: [0.04, 0.12], slots: ['weapon', 'offhand', 'trinket'], weight: 5, pct: true },
  { id: 'vampiric', name: 'Vampiric', stat: 'lifesteal', roll: [0.015, 0.045], slots: ['weapon', 'trinket'], weight: 4, pct: true },
  { id: 'attuned', name: 'Attuned', stat: 'manaRegen', roll: [0.4, 1.2], slots: ['offhand', 'trinket', 'head'], weight: 6 },
  { id: 'hasty', name: 'Hasty', stat: 'cooldownPct', roll: [0.03, 0.08], slots: ['head', 'trinket', 'offhand'], weight: 5, pct: true },
  { id: 'evasive', name: 'Evasive', stat: 'dodge', roll: [0.015, 0.04], slots: ['legs', 'hands', 'trinket'], weight: 5, pct: true },
  { id: 'thickset', name: 'Thickset', stat: 'maxHpFlat', roll: [14, 40], slots: ['chest', 'legs', 'trinket'], weight: 8 },
];

const PREFIXES = new Set(['plated', 'warded', 'keen', 'brutal', 'swift', 'fleet', 'cruel', 'hallowed', 'vampiric', 'attuned', 'hasty', 'evasive', 'thickset']);

let itemCounter = 0;
export const nextItemId = () => `it_${(itemCounter++).toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

/** Item level scales every rolled number; ~1 + 6% per level. */
const ilvlScale = (ilvl) => 1 + (ilvl - 1) * 0.06;

/**
 * Roll a concrete item.
 * @param rng seeded rng
 * @param {{slot?, baseId?, classId?, rarity?, ilvl?}} opts
 */
export function rollItem(rng, opts = {}) {
  const ilvl = Math.max(1, opts.ilvl ?? 1);
  const scale = ilvlScale(ilvl);

  let base;
  if (opts.baseId) {
    base = BASES_BY_ID[opts.baseId];
  } else {
    let pool = BASES;
    if (opts.slot) pool = pool.filter((b) => b.slot === opts.slot);
    if (opts.classId) pool = pool.filter((b) => !b.classes || b.classes.includes(opts.classId));
    if (!pool.length) pool = BASES;
    base = pick(rng, pool);
  }

  const rarityId = opts.rarity ?? weightedPick(rng, RARITY_ORDER.map((id) => RARITIES[id])).id;
  const rarity = RARITIES[rarityId];

  // Implicit stats scale with ilvl and rarity power.
  const mods = {};
  for (const [stat, value] of Object.entries(base.implicit)) {
    // attackInterval is a malus (slower weapon) — it must not scale up with power.
    if (stat === 'attackInterval') mods[stat] = value;
    else mods[stat] = roundStat(stat, value * scale * (1 + (rarity.power - 1) * 0.35));
  }

  // Affixes.
  const legal = AFFIXES.filter((a) => !a.slots || a.slots.includes(base.slot));
  const chosen = shuffle(rng, legal).slice(0, Math.min(rarity.affixes, legal.length));
  const affixes = [];
  for (const affix of chosen) {
    const raw = rand(rng, affix.roll[0], affix.roll[1]) * scale * rarity.power;
    const value = roundStat(affix.stat, raw);
    mods[affix.stat] = roundStat(affix.stat, (mods[affix.stat] ?? 0) + value);
    affixes.push({ id: affix.id, name: affix.name, stat: affix.stat, value, pct: !!affix.pct });
  }

  return {
    id: nextItemId(),
    kind: 'gear',
    baseId: base.id,
    name: buildName(base, affixes),
    slot: base.slot,
    classes: base.classes,
    rarity: rarityId,
    ilvl,
    mods,
    affixes,
  };
}

function buildName(base, affixes) {
  const prefix = affixes.find((a) => PREFIXES.has(a.id));
  const suffix = affixes.find((a) => !PREFIXES.has(a.id));
  let name = base.name;
  if (prefix) name = `${prefix.name} ${name}`;
  if (suffix) name = `${name} ${suffix.name}`;
  return name;
}

/** Percent-ish stats keep 3 decimals; flat stats are integers. */
function roundStat(stat, v) {
  const fractional = [
    'critChance', 'critDamage', 'attackSpeedPct', 'moveSpeedPct', 'damagePct',
    'healPower', 'lifesteal', 'cooldownPct', 'dodge', 'blockChance', 'manaRegen', 'attackInterval',
  ];
  return fractional.includes(stat) ? Math.round(v * 1000) / 1000 : Math.round(v);
}

/** Rough single number for "is this an upgrade" sorting and bot budgets. */
export function itemScore(item) {
  // Consumables and anything without a stat block score zero rather than
  // throwing — callers sort mixed stash contents through here.
  if (!item?.mods) return 0;
  const w = {
    might: 3, agility: 3, spirit: 3, vitality: 2.5, armor: 0.6, resist: 0.6,
    weaponDamage: 4, maxHpFlat: 0.35, manaRegen: 3,
    critChance: 160, critDamage: 55, attackSpeedPct: 180, moveSpeedPct: 140,
    damagePct: 200, healPower: 120, lifesteal: 200, cooldownPct: 170,
    dodge: 180, blockChance: 120, attackInterval: -120,
  };
  let score = 0;
  for (const [stat, value] of Object.entries(item.mods)) score += (w[stat] ?? 1) * value;
  return Math.round(score);
}

export function canEquip(item, classId) {
  if (!item) return false;
  if (item.kind !== 'gear') return false;
  return !item.classes || item.classes.includes(classId);
}

/** Starter kit so a fresh hero is not naked. */
export function startingLoadout(rng, classId) {
  const wanted = {
    knight: ['sword', 'kite_shield', 'plate_helm', 'plate_chest'],
    archer: ['bow', 'quiver', 'hood', 'leather_chest'],
    priest: ['staff', 'tome', 'circlet', 'robe'],
  }[classId];
  return wanted.map((baseId) => rollItem(rng, { baseId, rarity: 'common', ilvl: 1 }));
}
