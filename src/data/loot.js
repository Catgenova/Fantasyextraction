// Loot tables. Every table is a list of weighted outcomes; `rollLoot` turns one
// into concrete items. Bosses roll several times and skew rare.

import { weightedPick, chance, randInt, pick } from '../core/rng.js';
import { rollItem, RARITY_ORDER } from './gear.js';
import { makeConsumable } from './consumables.js';

export const TABLES = {
  trash_low: {
    rolls: 1,
    entries: [
      { weight: 48, type: 'nothing' },
      { weight: 22, type: 'consumable', pool: ['minor_potion', 'bandage', 'mana_tonic'] },
      { weight: 24, type: 'gear', rarity: 'common' },
      { weight: 6, type: 'gear', rarity: 'uncommon' },
    ],
  },
  trash_mid: {
    rolls: 1,
    entries: [
      { weight: 38, type: 'nothing' },
      { weight: 22, type: 'consumable', pool: ['minor_potion', 'greater_potion', 'bandage', 'whetstone'] },
      { weight: 24, type: 'gear', rarity: 'common' },
      { weight: 13, type: 'gear', rarity: 'uncommon' },
      { weight: 3, type: 'gear', rarity: 'rare' },
    ],
  },
  trash_high: {
    rolls: 1,
    entries: [
      { weight: 30, type: 'nothing' },
      { weight: 22, type: 'consumable', pool: ['greater_potion', 'ironskin_salve', 'swiftfoot_draught', 'whetstone'] },
      { weight: 22, type: 'gear', rarity: 'common' },
      { weight: 19, type: 'gear', rarity: 'uncommon' },
      { weight: 7, type: 'gear', rarity: 'rare' },
    ],
  },
  elite: {
    rolls: 2,
    entries: [
      { weight: 18, type: 'nothing' },
      { weight: 24, type: 'consumable', pool: ['greater_potion', 'ironskin_salve', 'whetstone', 'swiftfoot_draught'] },
      { weight: 30, type: 'gear', rarity: 'uncommon' },
      { weight: 22, type: 'gear', rarity: 'rare' },
      { weight: 6, type: 'gear', rarity: 'epic' },
    ],
  },
  event_cache: {
    rolls: 3,
    entries: [
      { weight: 28, type: 'consumable', pool: ['greater_potion', 'ironskin_salve', 'swiftfoot_draught'] },
      { weight: 34, type: 'gear', rarity: 'uncommon' },
      { weight: 28, type: 'gear', rarity: 'rare' },
      { weight: 10, type: 'gear', rarity: 'epic' },
    ],
  },
  event_ritual: {
    rolls: 4,
    entries: [
      { weight: 20, type: 'consumable', pool: ['greater_potion', 'ironskin_salve', 'phoenix_ash'] },
      { weight: 30, type: 'gear', rarity: 'rare' },
      { weight: 38, type: 'gear', rarity: 'epic' },
      { weight: 12, type: 'gear', rarity: 'legendary' },
    ],
  },
  // Bosses are the best loot in the raid, by a wide margin.
  boss: {
    rolls: 5,
    entries: [
      { weight: 14, type: 'consumable', pool: ['greater_potion', 'ironskin_salve', 'phoenix_ash'] },
      { weight: 26, type: 'gear', rarity: 'rare' },
      { weight: 44, type: 'gear', rarity: 'epic' },
      { weight: 16, type: 'gear', rarity: 'legendary' },
    ],
  },
  boss_apex: {
    rolls: 7,
    entries: [
      { weight: 8, type: 'consumable', pool: ['phoenix_ash', 'ironskin_salve'] },
      { weight: 14, type: 'gear', rarity: 'rare' },
      { weight: 46, type: 'gear', rarity: 'epic' },
      { weight: 32, type: 'gear', rarity: 'legendary' },
    ],
  },
};

/**
 * @param rng seeded rng
 * @param tableId key of TABLES
 * @param {{ilvl?: number, luck?: number}} opts  `luck` shifts rarity up.
 * @returns {Array} item instances
 */
export function rollLoot(rng, tableId, opts = {}) {
  const table = TABLES[tableId];
  if (!table) return [];
  const ilvl = opts.ilvl ?? 1;
  const out = [];
  for (let i = 0; i < table.rolls; i++) {
    const entry = weightedPick(rng, table.entries);
    if (entry.type === 'nothing') continue;
    if (entry.type === 'consumable') {
      out.push(makeConsumable(pick(rng, entry.pool), randInt(rng, 1, 2)));
      continue;
    }
    let rarity = entry.rarity;
    // Luck can promote a drop one rarity step.
    if (opts.luck && chance(rng, Math.min(0.5, opts.luck))) {
      const idx = RARITY_ORDER.indexOf(rarity);
      rarity = RARITY_ORDER[Math.min(RARITY_ORDER.length - 1, idx + 1)];
    }
    out.push(rollItem(rng, { rarity, ilvl }));
  }
  return out;
}
