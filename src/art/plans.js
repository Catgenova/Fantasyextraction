// Body plans: one per family, varied per species.
//
// Fifty creatures cannot each be drawn by hand, and they should not be. What
// makes a Sicklejaw a Sicklejaw and not a Skiterling is mostly that it is a
// different size of the same kind of animal — so the family owns the anatomy
// and the species varies it.
//
// Every per-species number is derived from data that already exists, so the
// art cannot drift from the creature: colour is the creature's colour, size is
// its radius, and the small variations are hashed from its own id so they are
// stable, distinct, and free.

import { CREATURES } from '../data/creatures.js';

const INK = '#15120e';

const shade = (hex, amount) => mixTo(hex, 21, amount);
const tint = (hex, amount) => mixTo(hex, 255, amount);
function mixTo(hex, target, amount) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    .map((c) => Math.round(c * (1 - amount) + target * amount));
  return `#${((ch[0] << 16) | (ch[1] << 8) | ch[2]).toString(16).padStart(6, '0')}`;
}

/** A stable number in 0..1 from a species id, for the small variations. */
function hashOf(id, salt = 0) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

/**
 * The seven pack families and the ten solo monsters, as anatomy.
 *
 * Each entry gets the species and a 0..1 variation number, and returns the
 * parts of the plan that are its own. Read them as silhouettes: long and
 * narrow, wide and low, wider than it is long.
 */
const FAMILIES = {
  // Fast, light, all head and tail. The longest bodies in the game and the
  // narrowest — a raptorial is a line pointed at you.
  raptorial: (c, v, w) => ({
    bodyLen: 0.6 + v * 0.2, bodyWide: 0.23 + w * 0.09,
    headLen: 0.28 + w * 0.1, headWide: 0.19, neck: 0.06 + v * 0.1,
    tailLen: 0.5 + w * 0.42, legs: 2, legReach: 0.26 + v * 0.12, stride: 0.36,
    teeth: true, spines: 3 + Math.round(v * 4), restless: 1.6,
  }),

  // Wider than they are long, which nothing else on the map is. A wyverling
  // read at any size is "the one shaped like a kite".
  wyverling: (c, v, w) => ({
    bodyLen: 0.36 + v * 0.14, bodyWide: 0.17 + w * 0.08,
    headLen: 0.24 + w * 0.08, headWide: 0.16, neck: 0.06 + v * 0.08,
    tailLen: 0.4 + w * 0.34, legs: 2, legReach: 0.14, stride: 0.16,
    wingSpan: 0.72 + v * 0.34, teeth: true, restless: 1.3,
  }),

  // Low, round and shelled. Almost no head shows and the legs barely clear the
  // rim, so the whole silhouette is one armoured disc.
  carapace: (c, v, w) => ({
    bodyLen: 0.44 + w * 0.14, bodyWide: 0.38 + v * 0.12,
    headLen: 0.18 + w * 0.08, headWide: 0.15, neck: 0.02,
    tailLen: 0.12 + w * 0.2, legs: 6, legReach: 0.13 + v * 0.08, stride: 0.14,
    shell: true, horns: 0.25 + v * 0.5, restless: 0.35,
  }),

  // Segmented and many-legged, with a swollen abdomen behind. The legs are the
  // silhouette here — more of them than anything else has.
  venomite: (c, v, w) => ({
    bodyLen: 0.48 + v * 0.18, bodyWide: 0.24 + w * 0.12,
    headLen: 0.2 + w * 0.06, headWide: 0.18, neck: 0.1 + v * 0.1,
    tailLen: 0.26 + w * 0.3, legs: 8, legReach: 0.3 + v * 0.12, stride: 0.2,
    spines: 2 + Math.round(w * 2), restless: 1.1,
  }),

  // Torpedoes with digging claws. Short tails, heavy fronts, and nothing
  // sticking out sideways — built to go through things rather than around.
  delver: (c, v, w) => ({
    bodyLen: 0.52 + v * 0.2, bodyWide: 0.27 + w * 0.12,
    headLen: 0.3 + w * 0.14, headWide: 0.22 + v * 0.06, neck: 0.02,
    tailLen: 0.14 + w * 0.22, legs: 4, legReach: 0.3 + v * 0.14, stride: 0.3,
    teeth: true, horns: 0.3 + v * 0.45, restless: 0.7,
  }),

  // Broad, squat and heavy-limbed. The widest legs of anything small, planted
  // well outside the body.
  mireborn: (c, v, w) => ({
    bodyLen: 0.46 + w * 0.18, bodyWide: 0.33 + v * 0.14,
    headLen: 0.26 + v * 0.1, headWide: 0.24 + w * 0.06, neck: 0.02 + w * 0.08,
    tailLen: 0.2 + v * 0.26, legs: 4, legReach: 0.36 + w * 0.14, stride: 0.24,
    teeth: true, frill: 0.4 + v * 0.5, restless: 0.5,
  }),

  // Hunched and ragged: a small body under a half-spread wing, with a long
  // reaching neck. They read as something already stooping over a corpse.
  carrionkin: (c, v, w) => ({
    bodyLen: 0.38 + w * 0.16, bodyWide: 0.2 + v * 0.1,
    headLen: 0.24 + v * 0.1, headWide: 0.15, neck: 0.2 + w * 0.18,
    tailLen: 0.26 + v * 0.28, legs: 2, legReach: 0.2 + w * 0.1, stride: 0.24,
    wingSpan: 0.44 + w * 0.28, teeth: true, restless: 0.9,
  }),
};

/**
 * The thirteen solo monsters, hand-shaped rather than family-derived. There
 * are few enough of them to be worth it, and each one is a trophy — a player
 * who takes a Nightfell should not find it was a big Sicklejaw.
 *
 * The three at the bottom are the walkers, and they share a build the others
 * do not: many legs, a long low body and almost no tail. Everything else on
 * this list is shaped around a moment — a dive, a charge, a coil. These are
 * shaped around a gait, because walking is the only thing they always do.
 */
const SOLO = {
  bastionback: { bodyLen: 0.62, bodyWide: 0.5, headLen: 0.24, headWide: 0.2, neck: 0.02, tailLen: 0.28, legs: 6, legReach: 0.2, stride: 0.16, shell: true, horns: 0.6, restless: 0.25 },
  tyrannoclast: { bodyLen: 0.72, bodyWide: 0.34, headLen: 0.44, headWide: 0.28, neck: 0.08, tailLen: 0.7, legs: 2, legReach: 0.34, stride: 0.42, teeth: true, spines: 5, restless: 1.2 },
  deepdelver: { bodyLen: 0.68, bodyWide: 0.36, headLen: 0.42, headWide: 0.3, neck: 0.0, tailLen: 0.24, legs: 4, legReach: 0.44, stride: 0.32, teeth: true, horns: 0.7, restless: 0.6 },
  glaciermaw: { bodyLen: 0.66, bodyWide: 0.42, headLen: 0.4, headWide: 0.3, neck: 0.06, tailLen: 0.44, legs: 4, legReach: 0.34, stride: 0.22, teeth: true, spines: 7, restless: 0.3 },
  mirethane: { bodyLen: 0.6, bodyWide: 0.46, headLen: 0.34, headWide: 0.3, neck: 0.06, tailLen: 0.56, legs: 4, legReach: 0.5, stride: 0.26, teeth: true, frill: 0.7, restless: 0.5 },
  pyroclast: { bodyLen: 0.64, bodyWide: 0.36, headLen: 0.4, headWide: 0.26, neck: 0.12, tailLen: 0.6, legs: 4, legReach: 0.32, stride: 0.3, teeth: true, spines: 6, horns: 0.5, restless: 1.4 },
  // Never lands: the longest wingspan in the game on the slightest body, with
  // a long trailing tail. Nothing about it is built for the ground.
  stormcrest: { bodyLen: 0.44, bodyWide: 0.17, headLen: 0.28, headWide: 0.17, neck: 0.22, tailLen: 0.92, legs: 2, legReach: 0.14, stride: 0.14, wingSpan: 1.32, teeth: true, spines: 3, restless: 1.5 },
  venomcoil: { bodyLen: 0.7, bodyWide: 0.3, headLen: 0.32, headWide: 0.24, neck: 0.2, tailLen: 0.88, legs: 8, legReach: 0.42, stride: 0.2, spines: 4, restless: 0.8 },
  // Arrives rather than flies: compact and heavy for a flier, big-headed, with
  // a short tail and horns. Built around the moment it lands on you.
  skyrender: { bodyLen: 0.58, bodyWide: 0.36, headLen: 0.46, headWide: 0.3, neck: 0.06, tailLen: 0.4, legs: 4, legReach: 0.3, stride: 0.28, wingSpan: 0.98, teeth: true, horns: 0.7, restless: 1.3 },
  // Long, six-legged and ridged down the back: a slab that goes forward. The
  // shortest tail of anything this size, because a tail is for turning and
  // this does not, and the longest stride on the list.
  //
  // No shell, which it had at first and which was wrong: a shell plus six legs
  // is the Bastionback, and side by side the two were the same animal in two
  // colours. Stones stacked along the spine instead — which is what a cairn
  // is — and a narrower body, so the round one and the long one read apart.
  cairnwalker: { bodyLen: 0.78, bodyWide: 0.36, headLen: 0.28, headWide: 0.24, neck: 0.04, tailLen: 0.16, legs: 6, legReach: 0.38, stride: 0.5, horns: 0.55, spines: 8, restless: 0.7 },
  // The longest walker and the thinnest, on eight legs — it does not stride so
  // much as flow. Frilled rather than horned: the parts of it that matter are
  // the soft ones.
  sablemarch: { bodyLen: 0.8, bodyWide: 0.3, headLen: 0.34, headWide: 0.22, neck: 0.14, tailLen: 0.34, legs: 8, legReach: 0.4, stride: 0.34, frill: 0.8, spines: 6, teeth: true, restless: 0.55 },
  // Crowned and upright. The tallest head on the list and the widest horns,
  // and the only walker with wings — half-open, held rather than used.
  duskherald: { bodyLen: 0.68, bodyWide: 0.4, headLen: 0.46, headWide: 0.32, neck: 0.18, tailLen: 0.48, legs: 4, legReach: 0.42, stride: 0.4, wingSpan: 0.66, horns: 0.95, spines: 5, teeth: true, restless: 0.85 },
  nightfell: { bodyLen: 0.7, bodyWide: 0.38, headLen: 0.44, headWide: 0.3, neck: 0.14, tailLen: 0.8, legs: 4, legReach: 0.4, stride: 0.34, wingSpan: 0.95, teeth: true, spines: 8, horns: 0.8, restless: 1.0 },
};

/** The full plan for one species. */
export function planFor(speciesId) {
  const c = CREATURES[speciesId];
  if (!c) return null;
  // Two independent variation numbers rather than one. With a single value
  // every dimension moved together, so a family whose plan only spent it on
  // one measurement produced six species with identical anatomy — delver,
  // mireborn and carrionkin were each one animal drawn in four colours.
  const v = hashOf(speciesId);
  const w = hashOf(speciesId, 0x9e37);
  const shape = c.hunt === 'solo'
    ? SOLO[speciesId] ?? FAMILIES.raptorial(c, v, w)
    : (FAMILIES[c.family] ?? FAMILIES.raptorial)(c, v, w);

  const colour = c.color ?? '#8a8578';
  return {
    id: speciesId,
    name: c.name,
    ink: INK,
    body: colour,
    head: tint(colour, 0.22),
    limb: shade(colour, 0.42),
    tailColour: shade(colour, 0.28),
    trim: shade(colour, 0.62),
    shell: shape.shell ? shade(colour, 0.3) : null,
    membrane: tint(colour, 0.2),
    spineColour: tint(colour, 0.42),
    hornColour: tint(colour, 0.55),
    frillColour: tint(colour, 0.3),
    eye: c.hunt === 'solo' ? '#ffd98a' : '#f2e6c8',
    // Much lighter than the class rig's. A beast has thin parts — a tail tip,
    // a leg, a wing edge — and at 0.075 the outline was wider than the shape
    // it was outlining, so every one of them filled in solid black.
    lineWidth: c.hunt === 'solo' ? 0.038 : 0.045,
    restless: 1,
    ...shape,
    shellColour: shade(colour, 0.3),
  };
}

export const PLAN_IDS = Object.keys(CREATURES);
export const FAMILY_IDS = Object.keys(FAMILIES);
