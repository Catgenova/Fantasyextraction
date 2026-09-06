// The player's persistent account: roster, stash, squad tactics, run history.

import { makeRng } from '../core/rng.js';
import { createHero, sanitizeHero, addXp } from '../sim/heroes.js';
import { defaultSquadTactics } from '../data/tactics.js';
import { makeConsumable } from '../data/consumables.js';
import { rollItem, RARITY_ORDER } from '../data/gear.js';
import { salvageValue } from '../data/economy.js';

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

/** Break down everything in the stash at or below a rarity. Returns the total. */
export function salvageAllUpTo(profile, maxRarity) {
  const limit = RARITY_ORDER.indexOf(maxRarity);
  if (limit < 0) return 0;
  let gained = 0;
  for (let i = profile.stash.length - 1; i >= 0; i--) {
    const item = profile.stash[i];
    if (item.kind !== 'gear') continue;
    if (RARITY_ORDER.indexOf(item.rarity) > limit) continue;
    gained += salvageValue(item);
    profile.stash.splice(i, 1);
  }
  profile.scrap = (profile.scrap ?? 0) + gained;
  return gained;
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
  const summary = { levelUps: [], gained: [], lost: [] };

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
  });
  profile.history = profile.history.slice(0, 25);

  return summary;
}
