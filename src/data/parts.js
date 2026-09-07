// Carved parts: the only thing worth carrying out of a hunt.
//
// There is no loot on the ground any more. A creature dies, you carve it, and
// what comes off the corpse is what the blacksmith can work with. That makes
// the question at the end of a fight "do we have time to carve this?" rather
// than "did it drop anything", which is the whole point of the change.
//
// A part is identified by three things: the species it came off, the part type,
// and its quality. The blacksmith reads all three — species decides what the
// piece can become and what set it belongs to, part type decides which slot,
// quality decides how good it is.

/** What can come off a corpse. Which of these a species yields is its own business. */
export const PART_TYPES = {
  hide: { id: 'hide', name: 'Hide', desc: 'Flexible plating. The backbone of light armour.' },
  scale: { id: 'scale', name: 'Scale', desc: 'Overlapping and hard to cut. Medium armour.' },
  plate: { id: 'plate', name: 'Plate', desc: 'Fused bone armour. Heavy, and worth the weight.' },
  claw: { id: 'claw', name: 'Claw', desc: 'Edged. Becomes weapons that cut.' },
  fang: { id: 'fang', name: 'Fang', desc: 'Pointed. Becomes weapons that pierce.' },
  horn: { id: 'horn', name: 'Horn', desc: 'Dense and shock-absorbing. Helms and hafts.' },
  tail: { id: 'tail', name: 'Tail', desc: 'Long segments of muscle and bone. Reach.' },
  membrane: { id: 'membrane', name: 'Membrane', desc: 'Wing skin. Almost weightless.' },
  gland: { id: 'gland', name: 'Gland', desc: 'Still full of whatever it made. Handle carefully.' },
  marrow: { id: 'marrow', name: 'Marrow', desc: 'Taken from deep inside. Rare off anything small.' },
  sinew: { id: 'sinew', name: 'Sinew', desc: 'Cord and tendon. The only thing a pack can be sewn from.' },
};

export const PART_TYPE_IDS = Object.keys(PART_TYPES);

/**
 * How good a carve came out. Quality is the axis rarity used to be: it decides
 * what the blacksmith can make and how well it performs.
 *
 * `power` multiplies crafted stats; `weight` is how often a carve lands here
 * before the species' own quality bias is applied.
 */
export const QUALITIES = {
  ragged: { id: 'ragged', name: 'Ragged', power: 1.0, weight: 100, color: '#b9bfc9' },
  sound: { id: 'sound', name: 'Sound', power: 1.28, weight: 46, color: '#6fd08c' },
  fine: { id: 'fine', name: 'Fine', power: 1.62, weight: 17, color: '#5aa9f7' },
  pristine: { id: 'pristine', name: 'Pristine', power: 2.1, weight: 5, color: '#b57af3' },
  mythic: { id: 'mythic', name: 'Mythic', power: 2.8, weight: 1, color: '#f0a33c' },
};

/**
 * Wooden gear's grade. Present in `QUALITIES` so the UI has a name and a colour
 * for it, and deliberately absent from `QUALITY_ORDER` below — that list drives
 * carve rolls, the smith's grading and the squad's minimum-quality filter, and
 * wooden is not a carve. Anything ranking by `QUALITY_ORDER` reads it as -1,
 * which is the correct answer: below everything.
 */
QUALITIES.wooden = {
  id: 'wooden', name: 'Wooden', power: 0.5, weight: 0, color: '#8a7a63',
};

export const QUALITY_ORDER = ['ragged', 'sound', 'fine', 'pristine', 'mythic'];

/**
 * How many carves a corpse is worth, and how far up the quality table its
 * carves are pushed.
 *
 * A large monster is not simply a small one with more health: it is four to
 * six carves instead of one, and every one of them starts two grades higher.
 * That is the whole reason to take a solo hunt.
 */
export const CARVE_PROFILE = {
  small: { carves: [1, 2], qualityBias: 0, seconds: 1.5 },
  large: { carves: [4, 6], qualityBias: 2, seconds: 4 },
};

/** A part's worth, used for sorting a bag and for what the smith will pay attention to. */
export function partValue(part) {
  if (!part || part.kind !== 'part') return 0;
  const quality = QUALITIES[part.quality] ?? QUALITIES.ragged;
  return Math.round(quality.power * 40 * (1 + (part.tier ?? 0) * 0.6));
}

let partSeq = 0;

/**
 * Mint a carved part. Species and tier are copied onto the part rather than
 * looked up later, so a bag of parts stays readable on its own — a save that
 * outlives a species rename is still a bag of things, not a bag of broken ids.
 */
export function makePart({ speciesId, speciesName, partType, quality, tier = 0 }) {
  return {
    id: `pt_${(partSeq++).toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    kind: 'part',
    speciesId,
    speciesName,
    partType,
    quality,
    tier,
    name: `${speciesName} ${PART_TYPES[partType]?.name ?? partType}`,
  };
}
