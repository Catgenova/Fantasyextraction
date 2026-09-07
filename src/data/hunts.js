// Hunts: what a squad is out here to kill.
//
// The map already knows the answer — every camp is one named species in a
// pack of a known size, and every solo ground holds one large creature — but
// until now nothing let a player *ask* for one. A raid was somewhere you went
// and a fight was something that happened to you.
//
// A quarry turns that around. It is a standing order rather than a
// destination: "hunt small packs of Sicklejaw" holds after the first camp is
// cleared and sends the squad looking for the next one. That matters because
// the smith works in fives — a full set is five pieces off the same creature —
// so wanting a specific species is the normal state of a player who has
// decided what to build.
//
// What a squad may hunt is limited by what it knows, and knowledge comes from
// two places: the profile's journal of things it has killed before, and camps
// it can see right now. Neither is a menu of all fifty.

import { CREATURES } from './creatures.js';

export const HUNT_KINDS = {
  small: {
    id: 'small',
    name: 'Small pack',
    short: 'Small',
    desc: 'A handful of them. The steady way to fill a set.',
    hunt: 'small',
  },
  large: {
    id: 'large',
    name: 'Large pack',
    short: 'Large',
    desc: 'The same creature, deeper in and in greater numbers.',
    hunt: 'small',
  },
  solo: {
    id: 'solo',
    name: 'Solo monster',
    short: 'Solo',
    desc: 'One of the ten, alone in its ground. Four to six carves and a trophy.',
    hunt: 'solo',
  },
};

export const HUNT_KIND_IDS = Object.keys(HUNT_KINDS);

/** The only hunt kind a species can be the subject of. */
export const kindsForSpecies = (speciesId) => {
  const c = CREATURES[speciesId];
  if (!c) return [];
  return c.hunt === 'solo' ? ['solo'] : ['small', 'large'];
};

/** Does this POI satisfy a quarry? */
export function poiMatchesQuarry(poi, quarry) {
  if (!poi || !quarry?.speciesId) return false;
  if (quarry.kind === 'solo') {
    return (poi.kind === 'boss' || poi.kind === 'boss_event') && poi.bossId === quarry.speciesId;
  }
  return poi.kind === 'camp'
    && poi.speciesId === quarry.speciesId
    && poi.packKind === (quarry.kind === 'large' ? 'large' : 'small');
}

/** "Small pack of Sicklejaw", for the log and the button. */
export function quarryLabel(quarry) {
  if (!quarry?.speciesId) return 'No quarry';
  const name = CREATURES[quarry.speciesId]?.name ?? quarry.speciesId;
  if (quarry.kind === 'solo') return `${name}, alone`;
  return `${HUNT_KINDS[quarry.kind]?.name ?? 'Pack'} of ${name}`;
}

/**
 * Normalise a quarry, dropping one that names a species that cannot be hunted
 * that way. A saved order naming a creature that no longer exists — or a small
 * species asked for as a solo hunt — has to become "no quarry" rather than an
 * order the squad can never satisfy.
 */
export function sanitizeQuarry(quarry) {
  if (!quarry?.speciesId) return null;
  const kinds = kindsForSpecies(quarry.speciesId);
  if (!kinds.length) return null;
  const kind = kinds.includes(quarry.kind) ? quarry.kind : kinds[0];
  return { speciesId: quarry.speciesId, kind };
}

/**
 * Everything a player could order a hunt for, given what they know.
 *
 * `known` is a set of species ids. Both sources of knowledge feed the same
 * list, but they are not worth the same thing and the caller is told which is
 * which: a species you can see is one you can be routed to, and a species you
 * only remember is one the squad has to go and search its ring for.
 */
export function huntOptions(known, visible = new Set()) {
  const out = [];
  for (const speciesId of known) {
    const c = CREATURES[speciesId];
    if (!c) continue;
    for (const kind of kindsForSpecies(speciesId)) {
      out.push({
        id: `${speciesId}:${kind}`,
        speciesId,
        kind,
        name: c.name,
        tier: c.tier,
        colour: c.color,
        behaviour: c.behaviour,
        visible: visible.has(speciesId),
        label: quarryLabel({ speciesId, kind }),
      });
    }
  }
  // Things you can see first — they are the orders that pay off soonest —
  // then by ring, so the list reads outer to core the way the map does.
  return out.sort((a, b) =>
    (b.visible - a.visible) || (a.tier - b.tier) || a.name.localeCompare(b.name)
    || HUNT_KIND_IDS.indexOf(a.kind) - HUNT_KIND_IDS.indexOf(b.kind));
}
