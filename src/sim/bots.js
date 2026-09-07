// Rival squads. They are bots for now, but they are built from the same hero
// records and driven by the same tactics AI as the player's squad — so looting
// one really does mean taking gear a "player" was wearing.

import { makeRng, pick, randInt, chance, shuffle } from '../core/rng.js';
import { STARTER_CLASS_IDS } from '../data/classes.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { BOSSES } from '../data/enemies.js';
import { createHero, sanitizeHero, autoAllocate, availableSpells } from './heroes.js';
import { rollItem, SLOTS, RARITY_ORDER, canEquip } from '../data/gear.js';
import { makeConsumable, CONSUMABLE_LIST } from '../data/consumables.js';
import { defaultSquadTactics, EXTRACT_PLANS, FORMATIONS, STANCES, TARGET_PRIORITIES, READY_FOR_BOSS_TIER } from '../data/tactics.js';
import { SPELL_SLOTS } from '../data/spells.js';

const SQUAD_NAMES = [
  'The Gilded Hand', 'Ashfall Company', 'Crow & Coin', 'The Quiet Ledger',
  'Hollow Lanterns', 'Redbriar Pact', 'The Long Dark', 'Vult Mercenaries',
  'Saltgrave Crew', 'The Third Bell', 'Emberwatch', 'Nine Nails',
];

/**
 * @param seed
 * @param count how many rival squads to field
 * @param playerLevel used to scale their level and gear budget
 */
export function generateBotSquads(seed, count, playerLevel) {
  const rng = makeRng(seed ^ 0x9e3779b9);
  const names = shuffle(rng, SQUAD_NAMES);
  const squads = [];

  for (let i = 0; i < count; i++) {
    // Spread rival power around the player so runs are not uniformly easy.
    const bandRoll = rng();
    const delta = bandRoll < 0.25 ? -2 : bandRoll < 0.75 ? 0 : 2;
    const level = Math.max(1, playerLevel + delta + randInt(rng, -1, 1));

    const classes = shuffle(rng, classPoolFor(level));
    const heroes = classes.slice(0, 3).map((classId) => buildBotHero(rng, classId, level, delta));

    squads.push({
      id: `bot_${i}`,
      name: names[i % names.length],
      isPlayer: false,
      level,
      heroes,
      tactics: {
        ...defaultSquadTactics(),
        // Rival squads name a leader too — cohesion applies to everyone.
        leaderId: pick(rng, heroes).id,
        formation: pick(rng, Object.keys(FORMATIONS)),
        plan: weightedPlan(rng, level - playerLevel),
        extractPlan: pick(rng, Object.keys(EXTRACT_PLANS)),
      },
    });
  }
  return squads;
}

// Rivals stand in for other players, so they field the same classes a player
// of that level plausibly has: the unlockable ones only once they are deep
// enough to have killed the boss that grants them. Seeing a Paladin means
// somebody put the Warden down, which is the point.
function classPoolFor(level) {
  const pool = [...STARTER_CLASS_IDS];
  for (const ach of ACHIEVEMENTS) {
    const tier = BOSSES[ach.bossId]?.tier ?? 2;
    if (level >= READY_FOR_BOSS_TIER[tier]) pool.push(ach.unlocks);
  }
  return pool;
}

function weightedPlan(rng, powerDelta) {
  // Stronger squads push the core and hunt; weaker ones farm the ring.
  if (powerDelta >= 2) return chance(rng, 0.65) ? 'boss' : 'pvp';
  if (powerDelta <= -2) return chance(rng, 0.75) ? 'farm' : 'events';
  return pick(rng, ['farm', 'farm', 'events', 'boss', 'pvp']);
}

function buildBotHero(rng, classId, level, powerDelta = 0) {
  const hero = createHero(rng, classId, { level, startingGear: false });

  // Gear budget tracks level and the squad's power band, so a "weak" rival
  // really is worse equipped than a player of the same level, not just lower.
  const bandBase = Math.max(0, (level >= 12 ? 2 : level >= 7 ? 1 : 0) + (powerDelta >= 2 ? 1 : powerDelta <= -2 ? -1 : 0));
  const ilvl = Math.max(1, level + (powerDelta >= 2 ? 1 : powerDelta <= -2 ? -3 : -1));
  const fillChance = powerDelta <= -2 ? 0.6 : powerDelta >= 2 ? 0.92 : 0.78;
  for (const slot of SLOTS) {
    if (chance(rng, slot === 'weapon' ? 0.98 : fillChance)) {
      const bump = chance(rng, 0.22) ? 1 : 0;
      const rarity = RARITY_ORDER[Math.min(RARITY_ORDER.length - 1, bandBase + bump)];
      const item = rollItem(rng, { slot, classId, rarity, ilvl });
      if (canEquip(item, classId)) hero.equipped[slot] = item;
    }
  }

  autoAllocate(rng, hero, 'random');

  // Spells: fill slots from what the tree unlocked.
  const unlocked = shuffle(rng, availableSpells(hero));
  hero.spells = unlocked.slice(0, SPELL_SLOTS);

  // Consumables.
  const pool = CONSUMABLE_LIST.filter((c) => c.id !== 'phoenix_ash' || chance(rng, 0.15));
  hero.consumables = shuffle(rng, pool).slice(0, randInt(rng, 1, 3))
    .map((c) => makeConsumable(c.id, randInt(rng, 1, c.stack)));

  // Tactics: give bots a personality rather than the class default.
  hero.tactics = {
    ...hero.tactics,
    stance: pick(rng, Object.keys(STANCES)),
    priority: pick(rng, Object.keys(TARGET_PRIORITIES)),
    lootPolicy: pick(rng, ['greedy', 'valuable', 'upgrades']),
    retreatHpPct: 0.15 + rng() * 0.3,
    potionHpPct: 0.35 + rng() * 0.3,
    focusFire: chance(rng, 0.7),
  };

  return sanitizeHero(hero);
}
