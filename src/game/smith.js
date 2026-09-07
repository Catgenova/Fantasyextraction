// The blacksmith.
//
// The only way equipment enters the game. You bring parts; the smith turns
// them into something you can wear, and what it becomes is decided entirely by
// what you brought — the species, the part type, and the grade of the worst
// piece in the pile.
//
// That last rule is the whole economy. A Mythic carve is worth nothing on its
// own, because the piece comes out at the grade of the weakest part that went
// into it, so hoarding good carves of one species is the game's real
// progression rather than a currency balance.

import { craftItem, slotsForPart, SLOT_NAMES } from '../data/gear.js';
import { QUALITIES, QUALITY_ORDER, PART_TYPES } from '../data/parts.js';
import { CREATURES } from '../data/creatures.js';

/** How many parts a slot swallows. Bigger pieces cost more of the same carve. */
export const SLOT_COST = {
  weapon: 3, chest: 3, head: 2, legs: 2, offhand: 2, hands: 2, trinket: 2, pouch: 2,
};

export const costFor = (slot) => SLOT_COST[slot] ?? 2;

/** Grade of a finished piece: the worst part that went into it, and no better. */
export function resultQuality(parts) {
  if (!parts.length) return null;
  let worst = QUALITY_ORDER.length - 1;
  for (const part of parts) {
    worst = Math.min(worst, Math.max(0, QUALITY_ORDER.indexOf(part.quality)));
  }
  return QUALITY_ORDER[worst];
}

/**
 * Everything the smith could make right now, given a pile of parts.
 *
 * Grouped by species and part type because that is how the material actually
 * arrives — a hunt gives you four Boulderhide plates, and the question is
 * which of the four things a plate can become you want.
 */
export function availableRecipes(parts, classId = null) {
  const groups = new Map();
  for (const part of parts) {
    const key = `${part.speciesId}:${part.partType}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(part);
  }

  const out = [];
  for (const [key, list] of groups) {
    const [speciesId, partType] = key.split(':');
    const species = CREATURES[speciesId];
    if (!species) continue;
    // Best parts first, so the quoted grade is the best the pile can manage.
    const sorted = list.slice().sort((a, b) =>
      QUALITY_ORDER.indexOf(b.quality) - QUALITY_ORDER.indexOf(a.quality));

    for (const slot of slotsForPart(partType)) {
      const cost = costFor(slot);
      const use = sorted.slice(0, cost);
      const affordable = use.length === cost;
      const quality = affordable ? resultQuality(use) : null;
      out.push({
        id: `${speciesId}:${partType}:${slot}`,
        speciesId,
        speciesName: species.name,
        partType,
        slot,
        cost,
        have: sorted.length,
        affordable,
        quality,
        parts: affordable ? use : [],
        preview: affordable
          ? craftItem({ speciesId, partType, slot, quality, classId })
          : null,
      });
    }
  }

  // Things you can make first, best grade first, then by species so one
  // creature's options sit together.
  const rank = (r) => (r.affordable ? QUALITY_ORDER.indexOf(r.quality) : -1);
  return out.sort((a, b) =>
    (b.affordable - a.affordable) || (rank(b) - rank(a))
    || a.speciesName.localeCompare(b.speciesName)
    || a.slot.localeCompare(b.slot));
}

/** A one-line description of what a recipe eats. */
export function recipeCost(recipe) {
  const part = PART_TYPES[recipe.partType]?.name ?? recipe.partType;
  return `${recipe.cost}× ${recipe.speciesName} ${part}`;
}

/** What the piece would be called. */
export function recipeLabel(recipe) {
  return `${recipe.speciesName} ${PART_TYPES[recipe.partType]?.name ?? recipe.partType} `
    + `${SLOT_NAMES[recipe.slot] ?? recipe.slot}`;
}

/** Why a recipe cannot be made, or null when it can. */
export function forgeBlocker(recipe) {
  if (!recipe) return 'Nothing selected';
  if (!recipe.affordable) {
    return `Needs ${recipe.cost} — you have ${recipe.have}`;
  }
  return null;
}

/**
 * Forge it. Consumes the parts and returns the finished piece, or null if the
 * stash no longer holds what the recipe expected.
 */
export function forge(profile, recipe, classId = null) {
  if (forgeBlocker(recipe)) return null;
  const doomed = new Set(recipe.parts.map((p) => p.id));
  const held = profile.stash.filter((i) => doomed.has(i.id));
  if (held.length !== doomed.size) return null;

  const item = craftItem({
    speciesId: recipe.speciesId,
    partType: recipe.partType,
    slot: recipe.slot,
    quality: recipe.quality,
    classId,
  });
  if (!item) return null;

  profile.stash = profile.stash.filter((i) => !doomed.has(i.id));
  profile.stash.push(item);
  return item;
}

/** Quality colour, for the smith's own UI. */
export const qualityColor = (q) => QUALITIES[q]?.color ?? '#b9bfc9';
