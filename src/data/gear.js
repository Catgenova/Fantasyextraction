// Equipment, and where it comes from now.
//
// Nothing drops any more. There are no base types, no affix pool and no
// rarity roll: every piece of equipment in the game is made by the blacksmith
// out of parts carved off a corpse, and it is described by the three things
// that carve was — which species, which part, and how good the part was.
//
// What a species' gear is *good at* is not a fourth field to keep in sync. It
// is read off the creature's own stat block, so a Boulderhide plate really is
// heavy armour and a Glasswing membrane really is light, without anyone having
// to remember to say so twice.

import { CREATURES } from './creatures.js';
import { PART_TYPES, QUALITIES, QUALITY_ORDER } from './parts.js';

export const SLOTS = ['weapon', 'offhand', 'head', 'chest', 'hands', 'legs', 'trinket', 'pouch'];

export const SLOT_NAMES = {
  weapon: 'Weapon',
  offhand: 'Off-hand',
  head: 'Head',
  chest: 'Chest',
  hands: 'Hands',
  legs: 'Legs',
  trinket: 'Trinket',
  pouch: 'Pouch',
};

// ---------------------------------------------------------------------------
// Pouches
// ---------------------------------------------------------------------------
// A base pack of eight, plus whatever the pouch adds. A pouch is sewn from
// **sinew** and nothing else — cord and tendon are what a pack is, and giving
// it its own material means the thing that decides how much you can carry out
// is a hunt in its own right rather than a side effect of making armour.
//
// How much it holds is the one place in the game where the *size* of what you
// killed matters more than the grade of the carve. A small pack creature has
// short cord: a mythic one still only makes a decent bag. A solo monster's
// sinew runs the length of the thing, and even a ragged cut off one beats
// anything a raptor can offer.
//
// The two ladders overlap on purpose. A mythic small sinew (+12) is worth more
// than a ragged large one (+10), so a player who hunts packs well is never
// simply behind a player who got lucky once — but the ceiling belongs to the
// solo hunts, and 28 carried slots means a Nightfell.

export const POUCH_SLOTS = {
  small: { ragged: 4, sound: 6, fine: 8, pristine: 10, mythic: 12 },
  large: { ragged: 10, sound: 13, fine: 16, pristine: 18, mythic: 20 },
};
export const BASE_PACK_SLOTS = 8;

/** Which ladder a species' sinew is on. */
export const pouchLadder = (speciesId) =>
  (CREATURES[speciesId]?.hunt === 'solo' ? 'large' : 'small');

export const pouchSlots = (item) => {
  if (item?.slot !== 'pouch' || item.kind !== 'gear') return 0;
  // Wooden is off the ladder entirely — it has no species and no grade, and
  // looking it up returns nothing, which would make a wooden satchel hold as
  // much as no satchel at all.
  if (item.wooden) return WOODEN_POUCH_SLOTS;
  return POUCH_SLOTS[pouchLadder(item.speciesId)]?.[item.quality] ?? 0;
};

export function packCapacity(equipped) {
  return BASE_PACK_SLOTS + pouchSlots(equipped?.pouch);
}

// ---------------------------------------------------------------------------
// What each part can become
// ---------------------------------------------------------------------------
// A carve is not a slot. Three Boulderhide plates is a real decision — a
// cuirass, a helm, or something to hold — and that is most of what makes the
// blacksmith interesting.

export const PART_SLOTS = {
  hide: ['chest', 'legs', 'hands', 'head'],
  scale: ['chest', 'legs', 'head', 'offhand'],
  plate: ['chest', 'head', 'hands', 'offhand'],
  claw: ['weapon', 'hands'],
  fang: ['weapon', 'trinket'],
  horn: ['head', 'weapon'],
  tail: ['weapon', 'offhand'],
  membrane: ['legs', 'hands', 'offhand'],
  gland: ['trinket', 'offhand'],
  marrow: ['trinket'],
  // Sinew makes one thing, and it is the only thing that makes it. A part type
  // with a single slot is a strong claim, and it is the point: how much you
  // can carry home is its own hunt, not something you fall into while making a
  // cuirass. Hide and membrane used to make pouches too, which meant nobody
  // ever went looking for a bag.
  sinew: ['pouch'],
};

export const slotsForPart = (partType) => PART_SLOTS[partType] ?? [];
export const partsForSlot = (slot) =>
  Object.keys(PART_SLOTS).filter((p) => PART_SLOTS[p].includes(slot));

/** How much stat a slot is worth relative to the others. */
const SLOT_BUDGET = {
  weapon: 1.0, chest: 0.95, head: 0.6, legs: 0.6,
  offhand: 0.55, hands: 0.45, trinket: 0.5, pouch: 0.3,
};

/**
 * What a part type contributes, before the species colours it. Weights are
 * relative and get normalised — the numbers only matter against each other.
 */
const PART_SHAPE = {
  hide: { armor: 3, agility: 2, moveSpeedPct: 1 },
  scale: { armor: 2, resist: 2, vitality: 1.5 },
  plate: { armor: 5, vitality: 2, blockChance: 0.6 },
  claw: { weaponDamage: 3, attackSpeedPct: 1.5, critChance: 1 },
  fang: { weaponDamage: 3, armorPen: 2, critDamage: 1.5 },
  horn: { vitality: 2.5, might: 2, armor: 1.5 },
  tail: { weaponDamage: 2, rangeBonus: 2.5, aoeRadiusPct: 1 },
  membrane: { dodge: 1.5, moveSpeedPct: 2, resist: 1.5 },
  gland: { spirit: 3, dotPct: 2, manaRegen: 1.5 },
  marrow: { might: 2, agility: 2, spirit: 2, vitality: 2 },
  // A pack is worn for what it holds, and the pouch slot's budget is the
  // smallest in the game (0.3), so this is deliberately a shrug: a little
  // stamina from carrying the weight, and nothing a player would ever choose a
  // pouch for. Capacity is the stat, and `itemScore` counts it separately
  // because no weight over these numbers can see it.
  sinew: { vitality: 2, maxHpFlat: 2, moveSpeedPct: 1 },
};

/**
 * A species' leaning, read off its own stat block rather than authored twice.
 * A heavily plated creature makes armour; a fast one makes light kit; anything
 * that fights at range or with magic makes gear for casters.
 */
export function speciesAffinity(creature) {
  if (!creature) return {};
  const dps = creature.damage / creature.attackInterval;
  const caster = creature.school === 'magic' || creature.projectile ? 1 : 0;
  const raw = {
    armor: creature.armor,
    resist: creature.resist,
    vitality: creature.hp / 6,
    might: dps * 1.6,
    agility: creature.moveSpeed * 0.5,
    spirit: 12 + caster * 70,
    weaponDamage: dps * 1.8,
    moveSpeedPct: creature.moveSpeed * 0.45,
    dodge: creature.moveSpeed * 0.4,
    rangeBonus: creature.range > 120 ? 90 : 18,
  };

  // Affinity is a *shape*, not a magnitude. Left raw, a Nightfell's sixteen
  // thousand health made every trinket cut from it a vitality trinket; how
  // powerful a species' gear is belongs to its tier and the carve's quality,
  // not to how much health it happened to have.
  const values = Object.values(raw);
  const mean = values.reduce((a, b) => a + b, 0) / values.length || 1;
  const shaped = {};
  for (const [stat, value] of Object.entries(raw)) {
    shaped[stat] = Math.max(0.45, Math.min(1.9, value / mean));
  }
  return shaped;
}

/** Rounding that keeps percentages readable and flat stats whole. */
const PCT = new Set([
  'critChance', 'critDamage', 'attackSpeedPct', 'moveSpeedPct', 'damagePct',
  'healPower', 'lifesteal', 'cooldownPct', 'dodge', 'blockChance', 'dotPct', 'aoeRadiusPct',
]);
const roundStat = (stat, value) =>
  PCT.has(stat) ? Math.round(value * 1000) / 1000
    : stat === 'manaRegen' ? Math.round(value * 10) / 10
      : Math.round(value);

/** Scale of a flat point of each stat, so one budget buys sensible amounts. */
const STAT_SCALE = {
  might: 0.42, agility: 0.42, spirit: 0.42, vitality: 0.38,
  armor: 3.4, resist: 2.8, maxHpFlat: 4, weaponDamage: 0.7, armorPen: 5, rangeBonus: 3,
  manaRegen: 0.08, critChance: 0.0028, critDamage: 0.014, attackSpeedPct: 0.009,
  moveSpeedPct: 0.007, dodge: 0.0034, blockChance: 0.0055, dotPct: 0.014, aoeRadiusPct: 0.014,
};

let itemCounter = 0;
export const nextItemId = () => `it_${(itemCounter++).toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

/**
 * Forge a piece of equipment.
 *
 * @param {{speciesId, partType, slot, quality, classId?}} spec
 *        `classId` restricts a weapon to the hero it was made for; armour is
 *        universal, because a Plateback cuirass does not care who is in it.
 */
export function craftItem({ speciesId, partType, slot, quality, classId = null }) {
  const creature = CREATURES[speciesId];
  const shape = PART_SHAPE[partType];
  if (!creature || !shape) return null;
  if (!slotsForPart(partType).includes(slot)) return null;

  const grade = QUALITIES[quality] ?? QUALITIES.ragged;
  const budget = 26 * (SLOT_BUDGET[slot] ?? 0.5) * grade.power * (1 + creature.tier * 0.45);

  // Blend what the part is with what the creature is, then spend the budget
  // across whatever survives the blend.
  // A weapon has to be a weapon whatever it was cut from, or a Nightfell horn
  // club comes out as the best chest piece in the game.
  const shaped = slot === 'weapon' ? { weaponDamage: 3, ...shape } : shape;

  const affinity = speciesAffinity(creature);
  const blended = {};
  for (const [stat, weight] of Object.entries(shaped)) {
    blended[stat] = weight * (0.55 + 0.45 * (affinity[stat] ?? 0.7));
  }
  const total = Object.values(blended).reduce((a, b) => a + b, 0) || 1;

  const mods = {};
  for (const [stat, weight] of Object.entries(blended)) {
    const share = (weight / total) * budget;
    const value = roundStat(stat, share * (STAT_SCALE[stat] ?? 1));
    if (value) mods[stat] = value;
  }

  return {
    id: nextItemId(),
    kind: 'gear',
    slot,
    quality,
    speciesId,
    speciesName: creature.name,
    partType,
    tier: creature.tier,
    classes: slot === 'weapon' && classId ? [classId] : null,
    name: `${creature.name} ${PART_TYPES[partType]?.name ?? partType} ${SLOT_NAMES[slot]}`,
    mods,
  };
}

/**
 * How good a piece is, for sorting and for the AI deciding what to carry.
 * Pouches are scored by the room they give, which no stat weight can see.
 */
export function itemScore(item) {
  if (!item?.mods) return 0;
  const w = {
    might: 3, agility: 3, spirit: 3, vitality: 2.5, armor: 0.6, resist: 0.6,
    weaponDamage: 4, maxHpFlat: 0.35, manaRegen: 3, armorPen: 0.5, rangeBonus: 0.8,
    critChance: 160, critDamage: 55, attackSpeedPct: 180, moveSpeedPct: 140,
    damagePct: 200, healPower: 120, lifesteal: 200, cooldownPct: 170,
    dodge: 180, blockChance: 120, dotPct: 90, aoeRadiusPct: 90,
  };
  let score = 0;
  for (const [stat, value] of Object.entries(item.mods)) score += (w[stat] ?? 1) * value;
  score += pouchSlots(item) * 26;
  return Math.round(score);
}

export function canEquip(item, classId) {
  if (!item || item.kind !== 'gear') return false;
  return !item.classes || item.classes.includes(classId);
}

// ---------------------------------------------------------------------------
// Wooden gear
// ---------------------------------------------------------------------------
// The floor. Nobody is ever naked: a hero who dies is re-kitted in this, and a
// new account starts in it.
//
// It is not carved from anything, which is the point — it has no species, so it
// belongs to no set and counts toward no set bonus, and it never drops when its
// wearer dies. It is not loot, it is the thing you have instead of loot.
//
// Everything about the numbers says "replace me". A wooden piece is a little
// over half a ragged tier-0 carve, which is itself the worst thing the smith
// can make, so the first real piece a player forges is an obvious upgrade in
// every slot.

export const WOODEN_QUALITY = 'wooden';
/** Share of a ragged tier-0 carve's budget that a wooden piece gets. */
const WOODEN_SHARE = 0.5;
/** Extra pack slots from a wooden pouch — under the +4 of the poorest sinew. */
export const WOODEN_POUCH_SLOTS = 2;

const WOODEN_NAMES = {
  weapon: 'Wooden Sword',
  offhand: 'Wicker Shield',
  head: 'Leather Cap',
  chest: 'Padded Jerkin',
  hands: 'Cloth Wraps',
  legs: 'Rough Breeches',
  trinket: 'Carved Token',
  pouch: 'Woven Satchel',
};

// The same shape vocabulary the carved pieces use, so a wooden chest is
// recognisably a chest and not a differently-flavoured trinket.
const WOODEN_SHAPE = {
  weapon: { weaponDamage: 3, attackSpeedPct: 0.8 },
  offhand: { armor: 2, blockChance: 0.5 },
  head: { armor: 2, vitality: 1 },
  chest: { armor: 3, vitality: 1.2 },
  hands: { armor: 1.5, agility: 1 },
  legs: { armor: 2, moveSpeedPct: 0.8 },
  trinket: { might: 1, agility: 1, spirit: 1 },
  pouch: { vitality: 1 },
};

/** One piece of wooden kit. */
export function woodenItem(slot) {
  const shape = WOODEN_SHAPE[slot];
  if (!shape) return null;
  const budget = 26 * (SLOT_BUDGET[slot] ?? 0.5) * WOODEN_SHARE;
  const total = Object.values(shape).reduce((a, b) => a + b, 0) || 1;

  const mods = {};
  for (const [stat, weight] of Object.entries(shape)) {
    const value = roundStat(stat, (weight / total) * budget * (STAT_SCALE[stat] ?? 1));
    if (value) mods[stat] = value;
  }

  return {
    id: nextItemId(),
    kind: 'gear',
    wooden: true,
    slot,
    quality: WOODEN_QUALITY,
    speciesId: null,
    partType: null,
    tier: 0,
    classes: null,          // anybody can hold a stick
    name: WOODEN_NAMES[slot] ?? 'Wooden Gear',
    mods,
  };
}

/** A full set of it, one piece in every slot. */
export function woodenLoadout() {
  return Object.fromEntries(SLOTS.map((slot) => [slot, woodenItem(slot)]));
}

export const isWooden = (item) => !!item?.wooden;

// Quality is the axis rarity used to be; the UI still wants an ordered list
// and a colour per grade, and both live with the parts.
export { QUALITIES, QUALITY_ORDER };
