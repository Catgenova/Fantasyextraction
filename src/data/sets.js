// Armour sets.
//
// Wear enough of one creature and you start fighting like it. Every species
// carries the set made from it (see `set` on each entry in creatures.js) and
// the bonus echoes its behaviour — a Sicklejaw set is speed and attack speed
// because a Sicklejaw hits and leaves; a Thornback set is block and mitigation
// because a Thornback punishes contact.
//
// Two thresholds, so a set is a ladder rather than a cliff: three pieces gets
// you half of it, five gets the whole thing plus whatever squad aura it has.
// Eight slots means a full set still leaves room for three pieces of something
// else, which is where mixed builds live.

import { CREATURES } from './creatures.js';

export const SET_PARTIAL = 3;
export const SET_FULL = 5;

/** How many pieces of each species a hero is wearing. */
export function setCounts(equipped) {
  const counts = new Map();
  for (const item of Object.values(equipped ?? {})) {
    if (!item || item.kind !== 'gear' || !item.speciesId) continue;
    counts.set(item.speciesId, (counts.get(item.speciesId) ?? 0) + 1);
  }
  return counts;
}

/**
 * Set bonuses currently active, as a list so the UI can explain them and the
 * stat pipeline can fold them in.
 *
 * @returns {Array<{speciesId, name, count, tier: 'partial'|'full', mods, aura, desc, echoes}>}
 */
export function activeSets(equipped) {
  const out = [];
  for (const [speciesId, count] of setCounts(equipped)) {
    if (count < SET_PARTIAL) continue;
    const species = CREATURES[speciesId];
    if (!species?.set) continue;

    const full = count >= SET_FULL;
    const scale = full ? 1 : 0.5;
    const mods = {};
    for (const [stat, value] of Object.entries(species.set.mods ?? {})) {
      mods[stat] = roundish(value * scale);
    }
    // A squad aura is the whole point of the sets that have one, so it is the
    // reward for the full five rather than something half of a set leaks.
    const aura = full ? { ...(species.set.aura ?? {}) } : {};

    out.push({
      speciesId,
      name: species.set.name,
      colour: species.color,
      count,
      tier: full ? 'full' : 'partial',
      need: full ? null : SET_FULL,
      echoes: species.set.echoes ?? species.behaviour,
      desc: species.set.desc,
      mods,
      aura,
    });
  }
  return out.sort((a, b) => b.count - a.count);
}

/** Flat modifiers from every active set, ready to fold into a mod bag. */
export function setMods(equipped) {
  const total = {};
  for (const set of activeSets(equipped)) {
    for (const [stat, value] of Object.entries(set.mods)) {
      total[stat] = (total[stat] ?? 0) + value;
    }
  }
  return total;
}

/** Squad auras from every active full set. */
export function setAuras(equipped) {
  const total = {};
  for (const set of activeSets(equipped)) {
    for (const [stat, value] of Object.entries(set.aura)) {
      total[stat] = (total[stat] ?? 0) + value;
    }
  }
  return total;
}

// Halving a set bonus should not produce 0.045% of anything.
const roundish = (v) => (Math.abs(v) >= 1 ? Math.round(v) : Math.round(v * 1000) / 1000);
