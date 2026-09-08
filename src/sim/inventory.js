// Equipment changes during a raid.
//
// Everything here is player-driven: the tactics AI never rearranges a pack. A
// hero's gear contributes to `baseMods`, which is computed at spawn, so every
// change has to rebuild it — otherwise the stat block silently keeps whatever
// they landed with.

import { canEquip, SLOTS, packCapacity, pouchSlots, isWooden } from '../data/gear.js';
import { dist } from '../core/vec.js';
import { rebuildHeroMods } from './entity.js';
import { CONSUMABLE_SLOTS, CONSUMABLES } from '../data/consumables.js';

// Discarding in a raid destroys the item outright rather than dropping it.
// A hero standing on the pile they just made would simply pick it back up,
// and a grace period only delayed that — so "get rid of this" has to mean it.

/** Close enough to hand something over. Loot does not teleport across a raid. */
export const TRANSFER_RANGE = 260;

/** Can this hero use the item at all? */
export function canEquipItem(e, item) {
  return !!item && item.kind === 'gear' && canEquip(item, e.classId) && SLOTS.includes(item.slot);
}

/**
 * Equip a backpack item. Whatever was in the slot goes back into the pack —
 * there is always room, since the incoming item just left it.
 *
 * Unless it is camp kit, which is thrown away instead. A wooden piece is free
 * and the camp reissues it, so carrying one home is a pack slot spent on
 * nothing; every upgrade taken mid-raid used to cost a slot for the rest of
 * the run and then land on the stash shelf, where it could not even be
 * salvaged.
 *
 * @returns {boolean} whether anything changed
 */
export function equipFromBackpack(match, e, index) {
  const item = e.inventory[index];
  if (!canEquipItem(e, item)) return false;

  const previous = e.equipped[item.slot] ?? null;
  const keepsPrevious = !!previous && !isWooden(previous);

  // A pouch decides how much the pack holds, so swapping down into a smaller
  // one can leave a hero over capacity. Refuse rather than silently binning
  // the overflow — the player can destroy or hand over the difference first.
  // The incoming pouch leaves the pack as it is equipped, hence the -1; the
  // one coming off goes back in unless it is wooden.
  if (item.slot === 'pouch'
      && e.inventory.length - 1 + (keepsPrevious ? 1 : 0)
         > packCapacity({ ...e.equipped, pouch: item })) return false;

  e.inventory.splice(index, 1);
  e.equipped[item.slot] = item;
  if (keepsPrevious) e.inventory.push(previous);

  rebuildHeroMods(e);
  match.pushFloat(e.pos, `equipped ${item.name}`, match.rarityColor(item));
  if (previous && !keepsPrevious) {
    match.pushFloat(e.pos, `discarded ${previous.name}`, '#9b9084');
  }
  return true;
}

/**
 * Unequip into the pack. Refuses when the pack is full rather than putting the
 * gear on the floor — silently discarding something a hero was wearing is not
 * a reasonable answer to a full bag.
 *
 * Camp kit cannot come off at all. Wooden gear is strictly better than an
 * empty slot and worth nothing in the pack, so taking it off is a move with
 * no upside; it leaves a slot when something better replaces it, and only
 * then.
 */
export function unequipToBackpack(match, e, slot) {
  const item = e.equipped[slot];
  if (!item) return false;
  if (isWooden(item)) return false;
  if (e.inventory.length >= packCapacity(e.equipped)) return false;

  e.equipped[slot] = null;
  e.inventory.push(item);
  rebuildHeroMods(e);
  return true;
}

/** Destroy a pack item. It is gone — not dropped, not recoverable. */
export function destroyFromBackpack(match, e, index) {
  const item = e.inventory[index];
  if (!item) return false;
  e.inventory.splice(index, 1);
  match.pushFloat(e.pos, `destroyed ${item.name}`, '#9b9084');
  return true;
}

/**
 * Is there anywhere for this found consumable to go?
 *
 * A matching stack merges, but only up to that consumable's cap. Treating any
 * matching stack as room made the belt bottomless: every potion on the map
 * read as takeable, so squads detoured for all of them and spent five times as
 * long in loot mode as they do with the cap honoured.
 */
export function canPackConsumable(e, item) {
  if (!item || item.kind !== 'consumable') return false;
  const existing = e.consumables.find((c) => c.defId === item.defId);
  if (existing) return existing.count < (CONSUMABLES[item.defId]?.stack ?? Infinity);
  return e.consumables.length < CONSUMABLE_SLOTS;
}

/**
 * Put a loose consumable straight onto the belt, wherever it came from.
 *
 * The tactics AI only ever drinks from the belt, so a potion that lands in the
 * pack is dead weight until somebody moves it. Picking one up therefore tries
 * the belt first and only falls back to the pack when the belt is full.
 *
 * @returns {boolean} whether it was taken
 */
export function stowConsumable(e, item) {
  if (!canPackConsumable(e, item)) return false;
  const def = CONSUMABLES[item.defId];
  const existing = e.consumables.find((c) => c.defId === item.defId);
  if (existing) {
    const room = (def?.stack ?? Infinity) - existing.count;
    if (room <= 0) return false;
    existing.count += Math.min(room, item.count);
  } else {
    e.consumables.push(item);
  }
  return true;
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
  // Refuses when the belt stack is already at its cap. The old version capped
  // the merge instead, which quietly destroyed the excess.
  if (!stowConsumable(e, item)) return false;
  e.inventory.splice(index, 1);
  match.pushFloat(e.pos, `packed ${item.name}`, match.rarityColor(item));
  return true;
}

/** Destroy a packed consumable stack. */
export function destroyConsumable(match, e, index) {
  const stack = e.consumables[index];
  if (!stack) return false;
  e.consumables.splice(index, 1);
  match.pushFloat(e.pos, `destroyed ${stack.name}`, '#9b9084');
  return true;
}

/** Why a handover is not possible, or null when it is. */
export function transferBlocker(from, to, item) {
  if (!item || !to || to.id === from.id) return 'No one to give it to';
  if (!to.alive) return `${to.name} is down`;
  if (to.extracted) return `${to.name} has extracted`;
  if (to.inventory.length >= packCapacity(to.equipped)) return `${to.name}'s pack is full`;
  if (dist(from.pos, to.pos) > TRANSFER_RANGE) return `${to.name} is too far away`;
  return null;
}

/**
 * Hand a pack item to a squadmate. Requires them to be nearby and alive, so
 * this is a real handover rather than an inventory teleport — and a hero about
 * to die cannot magic their haul to safety.
 */
export function transferItem(match, from, to, index) {
  const item = from.inventory[index];
  if (transferBlocker(from, to, item)) return false;

  from.inventory.splice(index, 1);
  to.inventory.push(item);
  match.pushFloat(to.pos, `+${item.name}`, match.rarityColor(item));
  return true;
}

