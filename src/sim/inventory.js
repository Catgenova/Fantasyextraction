// Equipment changes during a raid.
//
// Everything here is player-driven: the tactics AI never rearranges a pack. A
// hero's gear contributes to `baseMods`, which is computed at spawn, so every
// change has to rebuild it — otherwise the stat block silently keeps whatever
// they landed with.

import { canEquip, SLOTS } from '../data/gear.js';
import { rebuildHeroMods } from './entity.js';
import { BACKPACK_SLOTS } from '../data/tactics.js';
import { CONSUMABLE_SLOTS, CONSUMABLES } from '../data/consumables.js';

// A hero who just dropped something is standing on it, and their loot policy
// would pick it straight back up. Give the pile a moment to be genuinely
// discarded.
export const DROP_GRACE = 10;

/** Can this hero use the item at all? */
export function canEquipItem(e, item) {
  return !!item && item.kind === 'gear' && canEquip(item, e.classId) && SLOTS.includes(item.slot);
}

/**
 * Equip a backpack item. Whatever was in the slot goes back into the pack —
 * there is always room, since the incoming item just left it.
 * @returns {boolean} whether anything changed
 */
export function equipFromBackpack(match, e, index) {
  const item = e.inventory[index];
  if (!canEquipItem(e, item)) return false;

  const previous = e.equipped[item.slot] ?? null;
  e.inventory.splice(index, 1);
  e.equipped[item.slot] = item;
  if (previous) e.inventory.push(previous);

  rebuildHeroMods(e);
  match.pushFloat(e.pos, `equipped ${item.name}`, match.rarityColor(item));
  return true;
}

/** Unequip to the pack, or onto the ground when the pack is full. */
export function unequipToBackpack(match, e, slot) {
  const item = e.equipped[slot];
  if (!item) return false;

  e.equipped[slot] = null;
  if (e.inventory.length < BACKPACK_SLOTS) {
    e.inventory.push(item);
  } else {
    dropItem(match, e, item);
  }

  rebuildHeroMods(e);
  return true;
}

/** Drop a backpack item on the ground where the hero stands. */
export function dropFromBackpack(match, e, index) {
  const item = e.inventory[index];
  if (!item) return false;
  e.inventory.splice(index, 1);
  dropItem(match, e, item);
  return true;
}

/** Is there anywhere for this found consumable to go? */
export function canPackConsumable(e, item) {
  if (!item || item.kind !== 'consumable') return false;
  if (e.consumables.some((c) => c.defId === item.defId)) return true;  // merges
  return e.consumables.length < CONSUMABLE_SLOTS;
}

/**
 * Move a consumable out of the pack and into the belt.
 *
 * Anything looted mid-raid lands in the pack, and the tactics AI only ever
 * drinks from the belt — so a potion found on the floor is dead weight until
 * it is moved across.
 */
export function packConsumable(match, e, index) {
  const item = e.inventory[index];
  if (!canPackConsumable(e, item)) return false;

  const def = CONSUMABLES[item.defId];
  const existing = e.consumables.find((c) => c.defId === item.defId);
  e.inventory.splice(index, 1);
  if (existing) {
    existing.count = Math.min(def?.stack ?? existing.count + item.count, existing.count + item.count);
  } else {
    e.consumables.push(item);
  }
  match.pushFloat(e.pos, `packed ${item.name}`, match.rarityColor(item));
  return true;
}

/** Drop a packed consumable stack. */
export function dropConsumable(match, e, index) {
  const stack = e.consumables[index];
  if (!stack) return false;
  e.consumables.splice(index, 1);
  dropItem(match, e, stack);
  return true;
}

function dropItem(match, e, item) {
  const pile = match.dropLoot(e.pos, [item], {});
  if (pile) pile.noPickupUntil = match.time + DROP_GRACE;
  match.pushFloat(e.pos, `dropped ${item.name}`, '#9b9084');
  return pile;
}
