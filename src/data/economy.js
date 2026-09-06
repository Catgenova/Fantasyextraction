// Scrap: the salvage currency.
//
// Breaking gear down in the stash yields Scrap, which repair will spend later
// in development. Nothing consumes it yet, so the values here are a starting
// scale rather than a balanced economy — the shape that matters is that a
// legendary is worth many commons, so clearing junk is a trickle and breaking
// something good is a real decision.

import { RARITY_ORDER } from './gear.js';

export const SCRAP_VALUE = {
  common: 5,
  uncommon: 12,
  rare: 30,
  epic: 75,
  legendary: 180,
};

/** Each item level adds 5% on top of the rarity base. */
const ILVL_BONUS = 0.05;

/**
 * What breaking this item down is worth. Only gear can be salvaged —
 * consumables are used, not dismantled.
 */
export function salvageValue(item) {
  if (!item || item.kind !== 'gear') return 0;
  const base = SCRAP_VALUE[item.rarity] ?? SCRAP_VALUE.common;
  return Math.max(1, Math.round(base * (1 + Math.max(0, (item.ilvl ?? 1) - 1) * ILVL_BONUS)));
}

export const canSalvage = (item) => salvageValue(item) > 0;

/** Ordered rarity list with values, for showing the player the scale. */
export const salvageTable = () =>
  RARITY_ORDER.map((rarity) => ({ rarity, scrap: SCRAP_VALUE[rarity] }));
