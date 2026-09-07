// The player's persistent account: roster, stash, squad tactics, run history.

import { makeRng } from '../core/rng.js';
import { createHero, sanitizeHero, addXp } from '../sim/heroes.js';
import { defaultSquadTactics } from '../data/tactics.js';
import { makeConsumable } from '../data/consumables.js';
import { rollItem, RARITY_ORDER, canEquip, itemScore } from '../data/gear.js';
import { salvageValue } from '../data/economy.js';
import { achievementForBoss, ACHIEVEMENT_BY_ID, ACHIEVEMENTS } from '../data/achievements.js';
import { STARTER_CLASS_IDS } from '../data/classes.js';

export const STASH_LIMIT = 120;

export function newProfile(seed = Date.now() >>> 0) {
  const rng = makeRng(seed);
  const roster = [
    createHero(rng, 'knight'),
    createHero(rng, 'archer'),
    createHero(rng, 'priest'),
  ];

  const stash = [
    makeConsumable('minor_potion', 3),
    makeConsumable('bandage', 3),
    makeConsumable('mana_tonic', 2),
    rollItem(rng, { slot: 'hands', rarity: 'common', ilvl: 1 }),
    rollItem(rng, { slot: 'legs', rarity: 'common', ilvl: 1 }),
    rollItem(rng, { slot: 'trinket', rarity: 'common', ilvl: 1 }),
  ];

  return {
    version: 1,
    createdAt: Date.now(),
    seed,
    roster,
    squad: roster.slice(0, 3).map((h) => h.id),
    squadTactics: defaultSquadTactics(),
    stash,
    gold: 0,
    // Salvage currency. Repair will spend it; nothing does yet.
    scrap: 0,
    // Boss trophies, by achievement id -> { at, seed }. Each one unlocks a
    // class; the roster hero it granted is created at the same moment.
    achievements: {},
    history: [],
  };
}

export function heroById(profile, id) {
  return profile.roster.find((h) => h.id === id) ?? null;
}

export function squadHeroes(profile) {
  return profile.squad.map((id) => heroById(profile, id)).filter(Boolean);
}

/** Repair a loaded profile so a schema change can never brick a save. */
export function sanitizeProfile(profile) {
  profile.roster = (profile.roster ?? []).map(sanitizeHero);
  profile.stash = (profile.stash ?? []).filter(Boolean);
  profile.squadTactics = { ...defaultSquadTactics(), ...(profile.squadTactics ?? {}) };
  profile.squad = (profile.squad ?? []).filter((id) => heroById(profile, id));
  while (profile.squad.length < 3 && profile.roster.length > profile.squad.length) {
    const next = profile.roster.find((h) => !profile.squad.includes(h.id));
    if (!next) break;
    profile.squad.push(next.id);
  }
  // A leader must be one of the three actually deploying; swapping the squad
  // clears a stale choice rather than quietly promoting somebody.
  if (!profile.squad.includes(profile.squadTactics.leaderId)) {
    profile.squadTactics.leaderId = null;
  }
  profile.history = profile.history ?? [];
  profile.gold = profile.gold ?? 0;
  profile.scrap = profile.scrap ?? 0;
  // Drop trophies for achievements that no longer exist rather than carrying
  // an id nothing can explain.
  const trophies = profile.achievements ?? {};
  profile.achievements = {};
  for (const [id, record] of Object.entries(trophies)) {
    if (ACHIEVEMENT_BY_ID[id]) profile.achievements[id] = record;
  }
  return profile;
}

export function addToStash(profile, item) {
  if (!item) return false;
  // Consumables of the same type merge into one stack entry per pickup.
  if (item.kind === 'consumable') {
    const existing = profile.stash.find((s) => s.kind === 'consumable' && s.defId === item.defId);
    if (existing) { existing.count += item.count; return true; }
  }
  if (profile.stash.length >= STASH_LIMIT) return false;
  profile.stash.push(item);
  return true;
}

/**
 * Break a stashed item down for Scrap. Gear only — consumables get used, not
 * dismantled — and it is gone afterwards, so callers should confirm first.
 * @returns {number} scrap gained, or 0 if nothing was salvaged
 */
export function salvageFromStash(profile, itemId) {
  const idx = profile.stash.findIndex((i) => i.id === itemId);
  if (idx < 0) return 0;
  const value = salvageValue(profile.stash[idx]);
  if (value <= 0) return 0;
  profile.stash.splice(idx, 1);
  profile.scrap = (profile.scrap ?? 0) + value;
  return value;
}

// ---------------------------------------------------------------------------
// Bulk salvage
// ---------------------------------------------------------------------------
// A stash of 120 fills in a handful of farming runs, so clearing it one row at
// a time is not a real option. Each filter answers a different question the
// player is actually asking — "everything below this tier", "everything for a
// class I do not own", "everything worse than what we already wear" — and
// every one of them is destructive, so the UI confirms before running it.

const rarityAtOrBelow = (limit) => (item) =>
  RARITY_ORDER.indexOf(item.rarity) <= RARITY_ORDER.indexOf(limit);

/** Heroes who could wear this at all. */
const wearers = (profile, item) =>
  profile.roster.filter((h) => canEquip(item, h.classId));

export const SALVAGE_FILTERS = {
  common: {
    id: 'common', name: 'Commons', desc: 'Every common piece of gear.',
    match: rarityAtOrBelow('common'),
  },
  uncommon: {
    id: 'uncommon', name: 'Uncommon and below', desc: 'Commons and uncommons.',
    match: rarityAtOrBelow('uncommon'),
  },
  rare: {
    id: 'rare', name: 'Rare and below', desc: 'Everything short of epic.',
    match: rarityAtOrBelow('rare'),
  },
  epic: {
    id: 'epic', name: 'Epic and below', desc: 'Everything but legendaries.',
    match: rarityAtOrBelow('epic'),
  },
  unusable: {
    id: 'unusable',
    name: 'Unusable',
    desc: 'Gear locked to a class nobody on your roster has. Unlocking that class later would make it wearable again.',
    match: (item, profile) => wearers(profile, item).length === 0,
  },
  outclassed: {
    id: 'outclassed',
    name: 'Outclassed',
    desc: 'Gear that every hero who could wear it already beats in that slot. Ignores what is in anyone else\u2019s stash plans — it only compares against what is currently worn.',
    match: (item, profile) => {
      const fits = wearers(profile, item);
      if (!fits.length) return false;   // that is "unusable", not "outclassed"
      const worth = itemScore(item);
      return fits.every((h) => {
        const worn = h.equipped?.[item.slot];
        return worn && itemScore(worn) >= worth;
      });
    },
  },
};

/** Stash items a filter would destroy. Gear only — consumables are used, not broken down. */
export function salvageCandidates(profile, filterId) {
  const filter = SALVAGE_FILTERS[filterId];
  if (!filter) return [];
  return profile.stash.filter((item) =>
    item.kind === 'gear' && salvageValue(item) > 0 && filter.match(item, profile));
}

/** What a filter is worth right now, without running it. */
export function salvagePreview(profile, filterId) {
  const items = salvageCandidates(profile, filterId);
  return { count: items.length, scrap: items.reduce((sum, i) => sum + salvageValue(i), 0) };
}

/**
 * Run a bulk salvage. Returns what it actually destroyed, so a caller can
 * report it rather than recomputing.
 */
export function salvageAll(profile, filterId) {
  const doomed = new Set(salvageCandidates(profile, filterId).map((i) => i.id));
  if (!doomed.size) return { count: 0, scrap: 0 };
  let scrap = 0;
  profile.stash = profile.stash.filter((item) => {
    if (!doomed.has(item.id)) return true;
    scrap += salvageValue(item);
    return false;
  });
  profile.scrap = (profile.scrap ?? 0) + scrap;
  return { count: doomed.size, scrap };
}

// ---------------------------------------------------------------------------
// Trophies and class unlocks
// ---------------------------------------------------------------------------

export const hasAchievement = (profile, id) => !!profile.achievements?.[id];

/** Class ids this profile may field: the starters plus everything it has earned. */
export function unlockedClassIds(profile) {
  const ids = [...STARTER_CLASS_IDS];
  for (const ach of ACHIEVEMENTS) {
    if (hasAchievement(profile, ach.id) && !ids.includes(ach.unlocks)) ids.push(ach.unlocks);
  }
  return ids;
}

/** Every achievement with whether this profile has earned it, in fixed order. */
export function achievementProgress(profile) {
  return ACHIEVEMENTS.map((ach) => ({ ach, earned: profile.achievements?.[ach.id] ?? null }));
}

/**
 * Record a boss kill. The first kill of a boss earns its trophy and recruits a
 * hero of the class it unlocks — the unlock is worthless without someone to
 * play it, and making the player then find a recruit would be a second gate on
 * one achievement. Repeat kills are a no-op.
 *
 * @returns {{ach, hero}|null} what was earned, or null if it already was
 */
export function recordBossKill(profile, bossId, rng, meta = {}) {
  const ach = achievementForBoss(bossId);
  if (!ach || hasAchievement(profile, ach.id)) return null;

  profile.achievements[ach.id] = { at: meta.at ?? Date.now(), seed: meta.seed ?? null };
  const hero = createHero(rng, ach.unlocks);
  profile.roster.push(hero);
  return { ach, hero };
}

export function removeFromStash(profile, itemId) {
  const idx = profile.stash.findIndex((i) => i.id === itemId);
  if (idx < 0) return null;
  return profile.stash.splice(idx, 1)[0];
}

/**
 * Fold a finished match into the profile: XP for everyone, kept loot into the
 * stash, and equipment wiped from any hero who did not make it out.
 */
export function applyMatchResult(profile, result) {
  const summary = { levelUps: [], gained: [], lost: [], unlocked: [] };

  // Trophies first: a boss kill counts even if the squad died on the way out,
  // so the unlock survives a wipe that costs them everything else.
  const rng = makeRng((result.seed ^ 0x5bf03635) >>> 0);
  for (const bossId of result.bossesKilled ?? []) {
    const earned = recordBossKill(profile, bossId, rng, { seed: result.seed });
    if (earned) summary.unlocked.push(earned);
  }

  for (const h of result.heroes) {
    const hero = heroById(profile, h.heroId);
    if (!hero) continue;

    const levels = addXp(hero, h.xp);
    if (levels > 0) summary.levelUps.push({ name: hero.name, levels, level: hero.level });

    if (h.extracted) {
      // Equipment survived — keep whatever it became during the raid.
      hero.equipped = { ...h.keptEquipped };
      hero.consumables = h.keptConsumables.map((c) => ({ ...c }));
      for (const item of h.kept) {
        if (addToStash(profile, item)) summary.gained.push(item);
      }
    } else {
      // Death costs everything they were carrying and wearing.
      for (const item of h.lost) summary.lost.push(item);
      for (const slot of Object.keys(hero.equipped)) hero.equipped[slot] = null;
      hero.consumables = [];
    }
    sanitizeHero(hero);
  }

  profile.history.unshift({
    at: Date.now(),
    seed: result.seed,
    outcome: result.outcome,
    duration: Math.round(result.duration),
    extracted: result.heroes.filter((h) => h.extracted).length,
    kills: result.stats.kills,
    bossKills: result.stats.bossKills,
    heroKills: result.stats.heroKills,
    gained: summary.gained.length,
    lost: summary.lost.length,
    unlocked: summary.unlocked.map((u) => u.ach.id),
  });
  profile.history = profile.history.slice(0, 25);

  return summary;
}
