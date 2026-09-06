// Hero records: the persisted shape a player configures between raids.

import { CLASSES, XP_PER_LEVEL, MAX_LEVEL, skillPointsForLevel } from '../data/classes.js';
import { SPELL_SLOTS } from '../data/spells.js';
import { CONSUMABLE_SLOTS } from '../data/consumables.js';
import { unlockedSpells, totalPointsSpent, TREES } from '../data/skilltrees.js';
import { defaultHeroTactics } from '../data/tactics.js';
import { SLOTS, canEquip, startingLoadout } from '../data/gear.js';
import { pick } from '../core/rng.js';

const NAMES = {
  knight: ['Ser Alden', 'Ser Brannoc', 'Dame Ysolde', 'Ser Kestrel', 'Dame Ravenna', 'Ser Corvin'],
  archer: ['Wren', 'Fenn', 'Sable', 'Ilka', 'Tarran', 'Nyx'],
  priest: ['Sister Ovid', 'Brother Casimir', 'Mother Vaile', 'Brother Elian', 'Sister Anwen', 'Father Roth'],
};

let seq = 0;

export function createHero(rng, classId, opts = {}) {
  const cls = CLASSES[classId];
  const hero = {
    id: opts.id ?? `hero_${classId}_${seq++}_${Math.random().toString(36).slice(2, 7)}`,
    classId,
    name: opts.name ?? pick(rng, NAMES[classId]),
    level: opts.level ?? 1,
    xp: 0,
    alloc: {},
    equipped: Object.fromEntries(SLOTS.map((s) => [s, null])),
    spells: [...cls.startingSpells].slice(0, SPELL_SLOTS),
    consumables: [],
    tactics: defaultHeroTactics(classId),
  };

  if (opts.startingGear !== false) {
    for (const item of startingLoadout(rng, classId)) equipItem(hero, item);
  }
  return hero;
}

export function equipItem(hero, item) {
  if (!canEquip(item, hero.classId)) return false;
  hero.equipped[item.slot] = item;
  return true;
}

export function unequipSlot(hero, slot) {
  const item = hero.equipped[slot];
  hero.equipped[slot] = null;
  return item;
}

export const availablePoints = (hero) =>
  skillPointsForLevel(hero.level) - totalPointsSpent(hero.classId, hero.alloc);

export const availableSpells = (hero) =>
  unlockedSpells(hero.classId, hero.alloc, CLASSES[hero.classId].startingSpells);

/**
 * Award XP and level up. Returns the number of levels gained.
 * Levelling never auto-spends points — that is the player's call.
 */
export function addXp(hero, amount) {
  if (hero.level >= MAX_LEVEL) return 0;
  hero.xp += amount;
  let gained = 0;
  while (hero.level < MAX_LEVEL && hero.xp >= XP_PER_LEVEL(hero.level)) {
    hero.xp -= XP_PER_LEVEL(hero.level);
    hero.level++;
    gained++;
  }
  if (hero.level >= MAX_LEVEL) hero.xp = 0;
  return gained;
}

/**
 * Drop anything the hero can no longer legally have: over-spent skill points,
 * locked spells, gear for the wrong class. Runs after every load and respec.
 */
export function sanitizeHero(hero) {
  const cls = CLASSES[hero.classId];
  const budget = skillPointsForLevel(hero.level);
  if (totalPointsSpent(hero.classId, hero.alloc) > budget) hero.alloc = {};

  const unlocked = new Set(availableSpells(hero));
  hero.spells = (hero.spells ?? []).filter((s) => s && unlocked.has(s)).slice(0, SPELL_SLOTS);
  if (!hero.spells.length) hero.spells = [...cls.startingSpells].slice(0, SPELL_SLOTS);

  for (const slot of SLOTS) {
    if (hero.equipped[slot] && !canEquip(hero.equipped[slot], hero.classId)) hero.equipped[slot] = null;
    if (!(slot in hero.equipped)) hero.equipped[slot] = null;
  }
  hero.consumables = (hero.consumables ?? []).filter((c) => c && c.count > 0).slice(0, CONSUMABLE_SLOTS);
  hero.tactics = { ...defaultHeroTactics(hero.classId), ...(hero.tactics ?? {}) };
  return hero;
}

/** Clear the tree and hand the points back. */
export function respec(hero) {
  hero.alloc = {};
  sanitizeHero(hero);
}

/** Spend one point on a node if the tree rules allow it. */
export function allocatePoint(hero, nodeId) {
  const node = TREES[hero.classId].nodes.find((n) => n.id === nodeId);
  if (!node) return false;
  const rank = hero.alloc[nodeId] ?? 0;
  if (rank >= node.maxRank) return false;
  if (availablePoints(hero) < node.cost) return false;

  let inBranch = 0;
  for (const n of TREES[hero.classId].nodes) {
    if (n.branch === node.branch) inBranch += (hero.alloc[n.id] ?? 0) * n.cost;
  }
  if (inBranch < node.tierReq) return false;

  hero.alloc[nodeId] = rank + 1;
  return true;
}
