// Hero records: the persisted shape a player configures between raids.

import { CLASSES, XP_PER_LEVEL, MAX_LEVEL, skillPointsForLevel } from '../data/classes.js';
import { SPELL_SLOTS } from '../data/spells.js';
import { CONSUMABLE_SLOTS } from '../data/consumables.js';
import { unlockedSpells, totalPointsSpent, TREES } from '../data/skilltrees.js';
import { defaultHeroTactics } from '../data/tactics.js';
import { SLOTS, canEquip, woodenLoadout } from '../data/gear.js';
import { pick, shuffle, chance } from '../core/rng.js';

const NAMES = {
  knight: ['Ser Alden', 'Ser Brannoc', 'Dame Ysolde', 'Ser Kestrel', 'Dame Ravenna', 'Ser Corvin'],
  archer: ['Wren', 'Fenn', 'Sable', 'Ilka', 'Tarran', 'Nyx'],
  priest: ['Sister Ovid', 'Brother Casimir', 'Mother Vaile', 'Brother Elian', 'Sister Anwen', 'Father Roth'],
  rogue: ['Quill', 'Marrow', 'Vesper', 'Sixpence', 'Thistle', 'Grey Jenn'],
  berserker: ['Hakon', 'Brynja', 'Ulf Redhand', 'Sigrid', 'Torvald', 'Gudrun'],
  slayer: ['Vargen', 'Alraune', 'Kord the Late', 'Miral', 'Bastion Vey', 'Ottoline'],
  paladin: ['Ser Aurelian', 'Dame Sofira', 'Ser Halloran', 'Dame Perrine', 'Ser Ambrose', 'Dame Livia'],
  necromancer: ['Ashfell', 'Mirek', 'Cavill Ordo', 'Nessa Gaunt', 'Doctor Wier', 'Yara Slow'],
  ice_mage: ['Isolde Frey', 'Kaneth', 'Silvia Nim', 'Halvard', 'Orenna', 'Petrel'],
  fire_mage: ['Cinder Vex', 'Maro Kell', 'Zaine', 'Ember Okonkwo', 'Halix', 'Roseau'],
  lightning_mage: ['Volt Ashby', 'Ianthe', 'Sparrow Kade', 'Delphine', 'Auric', 'Mirren Fyfe'],
  warden: ['Holt', 'Bryn Ashgrove', 'Serel', 'Marchand', 'Quill Vantry', 'Ossa'],
  lancer: ['Cass Verrin', 'Idris', 'Perrault', 'Solveig', 'Tam Redlance', 'Aurel'],
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
    // Wooden gear, in every slot. A hero is never naked: this is what they
    // start in, and what they are re-kitted in when they die.
    for (const item of Object.values(woodenLoadout())) equipItem(hero, item);
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

/**
 * The branch each class leans on when nobody is choosing for it. A Priest that
 * randomly dumps everything into Wrath has no heals, which is a legitimate
 * rival build but useless as a baseline.
 */
export const DEFAULT_BRANCHES = {
  knight: ['bulwark', 'arms', 'banner'],
  archer: ['marksman', 'skirmish', 'trapper'],
  priest: ['light', 'ward', 'wrath'],
};

/**
 * Spend every available point, committing hard to one branch and spilling the
 * remainder into a second. Used to build rival squads, and by the headless
 * harness so the player's tree is not left empty in a balance comparison.
 *
 * @param branchOrder pass `'random'` for a rival squad's own idea of a build,
 *        an explicit array to force one, or omit for the class default.
 */
export function autoAllocate(rng, hero, branchOrder = null) {
  const branches = branchOrder === 'random'
    ? shuffle(rng, TREES[hero.classId].branches).map((b) => b.id)
    : (branchOrder ?? DEFAULT_BRANCHES[hero.classId]);
  let guard = 0;
  while (availablePoints(hero) > 0 && guard++ < 400) {
    const branch = chance(rng, 0.7) ? branches[0] : branches[1 % branches.length];
    const options = shuffle(rng, TREES[hero.classId].nodes.filter((n) => n.branch === branch));
    if (options.some((n) => allocatePoint(hero, n.id))) continue;
    // That branch is gated or maxed — take anything still legal.
    if (!shuffle(rng, TREES[hero.classId].nodes).some((n) => allocatePoint(hero, n.id))) break;
  }
  return hero;
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
