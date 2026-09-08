// The player's persistent account: roster, stash, squad tactics, run history.

import { makeRng } from '../core/rng.js';
import { createHero, sanitizeHero, addXp } from '../sim/heroes.js';
import { defaultSquadTactics } from '../data/tactics.js';
import { makeConsumable } from '../data/consumables.js';
import { makePart } from '../data/parts.js';
import { craftItem, canEquip, itemScore, woodenLoadout } from '../data/gear.js';
import { QUALITY_ORDER, partValue } from '../data/parts.js';
import { achievementForBoss, ACHIEVEMENT_BY_ID, ACHIEVEMENTS } from '../data/achievements.js';
import { STARTER_CLASS_IDS } from '../data/classes.js';
import { CREATURES } from '../data/creatures.js';
import { sanitizeQuarry } from '../data/hunts.js';

/**
 * How many forged pieces the stash will hold.
 *
 * Only forged pieces. Carves are not counted and never were meant to be: a
 * raid brings home twenty-odd parts and one or two finished items, so a single
 * shared cap of 120 filled with material in about six raids and then started
 * silently dropping carves on the floor — `addToStash` returned false and
 * `applyMatchResult` simply did not add them to the haul. Material is now
 * uncapped (see `profile.materials`) and this counts the shelf of finished
 * gear, which fills slowly enough that most players will never see it.
 */
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
  ];

  // Enough carved material to have something to take to the smith, and
  // nothing that was not cut off something.
  const materials = [
    makePart({ speciesId: 'threshclaw', speciesName: 'Threshclaw', partType: 'hide', quality: 'ragged', tier: 0 }),
    makePart({ speciesId: 'threshclaw', speciesName: 'Threshclaw', partType: 'claw', quality: 'ragged', tier: 0 }),
    makePart({ speciesId: 'plateback', speciesName: 'Plateback', partType: 'plate', quality: 'ragged', tier: 0 }),
  ];

  return {
    version: 1,
    createdAt: Date.now(),
    seed,
    roster,
    squad: roster.slice(0, 3).map((h) => h.id),
    squadTactics: defaultSquadTactics(),
    // Two stores, because they behave nothing alike. `stash` is the shelf of
    // finished gear and supplies and it has a ceiling; `materials` is every
    // carve the player has ever brought home and has none.
    stash,
    materials,
    gold: 0,
    // Boss trophies, by achievement id -> { at, seed }. Each one unlocks a
    // class; the roster hero it granted is created at the same moment.
    achievements: {},
    // What the player has actually met, by species id. This is the memory a
    // hunt order is written against — you cannot go looking for something you
    // have never seen. The three starting parts came off something, so the
    // journal opens with those three rather than empty.
    bestiary: {
      threshclaw: { kills: 0, carves: 1, firstAt: Date.now() },
      plateback: { kills: 0, carves: 1, firstAt: Date.now() },
    },
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
  profile.materials = (profile.materials ?? []).filter(Boolean);
  // Saves from before the split kept parts in the stash. Move them across
  // rather than leaving them where nothing will look for them again.
  const strandedParts = profile.stash.filter((i) => i.kind === 'part');
  if (strandedParts.length) {
    profile.materials.push(...strandedParts);
    profile.stash = profile.stash.filter((i) => i.kind !== 'part');
  }
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

  // The journal, and the standing hunt order written against it. A save from
  // before either existed gets a journal seeded from whatever parts it is
  // holding, so an old profile is not told it has never met anything.
  const journal = profile.bestiary ?? {};
  profile.bestiary = {};
  for (const [id, record] of Object.entries(journal)) {
    if (CREATURES[id]) profile.bestiary[id] = record;
  }
  for (const part of profile.materials) {
    if (part?.kind === 'part' && CREATURES[part.speciesId] && !profile.bestiary[part.speciesId]) {
      profile.bestiary[part.speciesId] = { kills: 0, carves: 1, firstAt: profile.createdAt ?? Date.now() };
    }
  }
  profile.squadTactics.quarry = sanitizeQuarry(profile.squadTactics.quarry);
  // Drop trophies for achievements that no longer exist rather than carrying
  // an id nothing can explain.
  const trophies = profile.achievements ?? {};
  profile.achievements = {};
  for (const [id, record] of Object.entries(trophies)) {
    if (ACHIEVEMENT_BY_ID[id]) profile.achievements[id] = record;
  }
  return profile;
}

/**
 * Put something the player brought home away.
 *
 * Where it goes depends on what it is, and only one of the three has a
 * ceiling. Carves go to `materials` and always fit — a hunt is supposed to
 * reward you with a pile of the same species, and a cap on that is a cap on
 * playing the game the way it asks you to. Consumables stack. Forged gear is
 * the only thing that occupies a shelf.
 */
export function addToStash(profile, item) {
  if (!item) return false;
  if (item.kind === 'part') { profile.materials.push(item); return true; }
  // Consumables of the same type merge into one stack entry per pickup.
  if (item.kind === 'consumable') {
    const existing = profile.stash.find((s) => s.kind === 'consumable' && s.defId === item.defId);
    if (existing) { existing.count += item.count; return true; }
    profile.stash.push(item);
    return true;
  }
  if (stashGear(profile).length >= STASH_LIMIT) return false;
  profile.stash.push(item);
  return true;
}

/** Every carve the player is holding. There is no limit on these. */
export function stashParts(profile) {
  return profile.materials;
}

/** Finished equipment nobody is wearing. This is what STASH_LIMIT counts. */
export function stashGear(profile) {
  return profile.stash.filter((i) => i?.kind === 'gear');
}

/** Is there room on the shelf for another forged piece? */
export const stashHasRoom = (profile) => stashGear(profile).length < STASH_LIMIT;

/** Parts of one species and type, which is the unit the blacksmith works in. */
export function partsOf(profile, speciesId, partType) {
  return stashParts(profile).filter((i) => i.speciesId === speciesId
    && (!partType || i.partType === partType));
}

/** Remove named parts. Used by the smith when it consumes them. */
export function consumeParts(profile, ids) {
  const doomed = new Set(ids);
  const taken = profile.materials.filter((i) => doomed.has(i.id));
  if (taken.length !== doomed.size) return null;
  profile.materials = profile.materials.filter((i) => !doomed.has(i.id));
  return taken;
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
/**
 * Fold a raid's encounters into the journal.
 *
 * @param {Record<string, {kills?: number, carves?: number}>} encountered
 */
export function recordEncounters(profile, encountered) {
  profile.bestiary ??= {};
  const learned = [];
  for (const [speciesId, tally] of Object.entries(encountered)) {
    if (!CREATURES[speciesId]) continue;
    const known = profile.bestiary[speciesId];
    if (!known) learned.push(speciesId);
    const record = known ?? { kills: 0, carves: 0, firstAt: Date.now() };
    record.kills += tally.kills ?? 0;
    record.carves += tally.carves ?? 0;
    profile.bestiary[speciesId] = record;
  }
  return learned;
}

/** Species the player may write a hunt order against. */
export const knownSpecies = (profile) => new Set(Object.keys(profile.bestiary ?? {}));

export function applyMatchResult(profile, result) {
  const summary = { levelUps: [], gained: [], lost: [], unlocked: [], learned: [], rekitted: [] };

  // Trophies first: a boss kill counts even if the squad died on the way out,
  // so the unlock survives a wipe that costs them everything else.
  const rng = makeRng((result.seed ^ 0x5bf03635) >>> 0);
  for (const bossId of result.bossesKilled ?? []) {
    const earned = recordBossKill(profile, bossId, rng, { seed: result.seed });
    if (earned) summary.unlocked.push(earned);
  }

  // The journal. Killing a thing and carving a thing are different kinds of
  // knowing — you can meet a species without ever getting a knife into one —
  // so both are recorded and either is enough to hunt it again.
  summary.learned = recordEncounters(profile, result.encountered ?? {});

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
      // Death costs everything they were carrying and wearing — and then the
      // camp puts them back in wooden gear. Losing a raid should cost the
      // raid, not the ability to take the next one: a hero stripped to nothing
      // cannot fight their way back to anything, which turns one bad run into
      // an account that is over.
      for (const item of h.lost) summary.lost.push(item);
      hero.equipped = woodenLoadout();
      hero.consumables = [];
      summary.rekitted.push(hero.name);
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
