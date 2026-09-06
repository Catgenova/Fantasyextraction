// Consumables. Heroes carry them into the raid and the tactics AI drinks them
// on its own — `hint` says when.

export const CONSUMABLES = {
  minor_potion: {
    id: 'minor_potion', kind: 'consumable', name: 'Minor Healing Draught', rarity: 'common',
    stack: 5, cooldown: 12,
    effects: [{ type: 'heal', base: 60 }],
    hint: { selfHpBelow: 0.5 },
    desc: 'Restores 60 health.',
  },
  greater_potion: {
    id: 'greater_potion', kind: 'consumable', name: 'Greater Healing Draught', rarity: 'uncommon',
    stack: 5, cooldown: 12,
    effects: [{ type: 'heal', base: 160 }],
    hint: { selfHpBelow: 0.45 },
    desc: 'Restores 160 health.',
  },
  mana_tonic: {
    id: 'mana_tonic', kind: 'consumable', name: 'Mana Tonic', rarity: 'common',
    stack: 5, cooldown: 15,
    effects: [{ type: 'mana', base: 70 }],
    hint: { selfManaBelow: 0.25 },
    desc: 'Restores 70 mana.',
  },
  whetstone: {
    id: 'whetstone', kind: 'consumable', name: 'Whetstone', rarity: 'common',
    stack: 3, cooldown: 30,
    effects: [{ type: 'buff', status: 'whetstone', duration: 45, mods: { damagePct: 0.12 } }],
    hint: { combatStart: true },
    desc: '+12% damage for 45s.',
  },
  ironskin_salve: {
    id: 'ironskin_salve', kind: 'consumable', name: 'Ironskin Salve', rarity: 'uncommon',
    stack: 3, cooldown: 30,
    effects: [{ type: 'buff', status: 'ironskin', duration: 45, mods: { armor: 80, resist: 60 } }],
    hint: { combatStart: true },
    desc: '+80 armour and +60 resist for 45s.',
  },
  swiftfoot_draught: {
    id: 'swiftfoot_draught', kind: 'consumable', name: 'Swiftfoot Draught', rarity: 'uncommon',
    stack: 3, cooldown: 25,
    effects: [{ type: 'buff', status: 'swiftfoot', duration: 20, mods: { moveSpeedPct: 0.3 } }],
    hint: { extracting: true },
    desc: '+30% move speed for 20s.',
  },
  bandage: {
    id: 'bandage', kind: 'consumable', name: 'Field Bandage', rarity: 'common',
    stack: 5, cooldown: 8,
    effects: [{ type: 'hot', base: 12, duration: 8, tick: 1 }],
    hint: { selfHpBelow: 0.7, outOfCombat: true },
    desc: 'Heals 12/s for 8s.',
  },
  phoenix_ash: {
    id: 'phoenix_ash', kind: 'consumable', name: 'Phoenix Ash', rarity: 'epic',
    stack: 1, cooldown: 0, passive: true,
    effects: [{ type: 'revive', hpFraction: 0.5 }],
    hint: { onDeath: true },
    desc: 'Consumed automatically on death: revive at 50% health. One use.',
  },
};

export const CONSUMABLE_LIST = Object.values(CONSUMABLES);
export const CONSUMABLE_SLOTS = 3;

let uid = 0;
export function makeConsumable(id, count = 1) {
  const def = CONSUMABLES[id];
  if (!def) throw new Error(`unknown consumable: ${id}`);
  return {
    id: `cn_${uid++}_${Math.random().toString(36).slice(2, 6)}`,
    kind: 'consumable',
    defId: def.id,
    name: def.name,
    rarity: def.rarity,
    count: Math.min(count, def.stack),
  };
}
