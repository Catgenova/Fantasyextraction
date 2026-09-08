// Per-class kits: proportions, palette, and what they carry.
//
// A kit is deliberately small. The rig and the animations do the work; a class
// is a silhouette width, two or three colours, a weapon and a helm. Anything
// more elaborate is invisible at the size these are actually seen.
//
// Colours come from the class table so the sprite and the name label and the
// UI accents all agree — a Fire Mage is the same orange everywhere.

import { CLASSES } from '../data/classes.js';
import {
  SWORD, GREATSWORD, DAGGER, AXE, GREATAXE, MACE, SPEAR, BOW,
  STAFF, STAFF_SHARD, STAFF_FLAME, STAFF_BOLT, STAFF_SKULL,
  SHIELD, BUCKLER, TOME, QUIVER, FLASK, BANNER,
  inHand, helmCrest, helmHorns, helmHood,
} from './gear.js';

const INK = '#15120e';

/** Darken a hex colour toward the ink, for armour plates and cloth folds. */
function tint(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const mix = (c) => Math.round(c + (255 - c) * amount);
  return `#${((mix(r) << 16) | (mix(g) << 8) | mix(b)).toString(16).padStart(6, '0')}`;
}

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const mix = (c) => Math.round(c * (1 - amount) + 21 * amount);
  return `#${((mix(r) << 16) | (mix(g) << 8) | mix(b)).toString(16).padStart(6, '0')}`;
}

const base = (classId, over = {}) => {
  const cls = CLASSES[classId];
  const colour = cls?.color ?? '#b9bfc9';
  return {
    id: classId,
    name: cls?.name ?? classId,
    ink: INK,
    body: colour,
    // The head sits inside the shoulder silhouette from above, so value is the
    // only thing that can separate it. Lighter than the body rather than
    // darker: a dark head disappears into the outline, and the eye reads the
    // brightest thing as the top of the form, which is exactly what a head is.
    head: tint(colour, 0.34),
    hands: shade(colour, 0.38),
    trim: shade(colour, 0.7),
    steel: '#aeb6c2',
    haft: '#6b4f34',
    focus: colour,
    limb: shade(colour, 0.42),
    // A shield the same colour as the body disappears into it. Steel, with the
    // class colour only as the trim, keeps it a separate object.
    shieldFace: '#8a8578',
    shoulder: 0.5,      // half the shoulder width, in local units
    lineWidth: 0.085,
    restless: 1,        // how much they fidget at rest
    strideLength: 1,
    ...over,
  };
};

// Twenty-six classes have to be told apart at about twenty-six pixels across,
// which is smaller than this sentence's line height. Colour does some of that
// work and the name label does some, but the silhouette has to carry its share
// or the roster is a row of identical dots.
//
// Only three levers actually survive that size, so each class is built from
// them deliberately rather than decorated:
//
//   width      how far the shoulders and pauldrons spread
//   reach      how far past the body the weapon projects, and in what shape
//   grip       one hand with something in the other, or both on one haft
//
// Everything else — helms, cloaks, trim — exists for the camp screens, where
// the same figure is drawn five times larger.
export const KITS = {
  // ---------------------------------------------------------------- melee --

  // A wall. Wide shoulders, a shield that reads as a slab, and almost no idle
  // movement: everything about the shape says this one is not going anywhere.
  knight: base('knight', {
    shoulder: 0.58,
    lineWidth: 0.095,
    restless: 0.35,
    strideLength: 0.85,
    pauldrons: shade(CLASSES.knight.color, 0.35),
    weapon: inHand(SWORD),
    offhand: inHand(SHIELD),
    helm: helmCrest('#8a6a2f'),
  }),

  // The knight's shape taken further — widest in the game, and the only
  // frontliner with a cloak. Where the knight cuts, this one hits with a
  // weight on a stick, so the weapon is short and blunt-ended rather than a
  // long bright blade.
  paladin: base('paladin', {
    shoulder: 0.62,
    lineWidth: 0.095,
    restless: 0.3,
    strideLength: 0.8,
    pauldrons: shade(CLASSES.paladin.color, 0.4),
    cloak: shade(CLASSES.paladin.color, 0.62),
    weapon: inHand(MACE),
    offhand: inHand(SHIELD),
    helm: helmCrest('#b39a52'),
  }),

  // Holds ground rather than takes it. Narrower than the other two shields and
  // carrying a buckler instead of a slab, so at size it reads as a frontliner
  // who can actually move.
  warden: base('warden', {
    shoulder: 0.55,
    restless: 0.6,
    strideLength: 0.95,
    pauldrons: shade(CLASSES.warden.color, 0.35),
    weapon: inHand(AXE),
    offhand: inHand(BUCKLER),
    helm: helmHorns('#3f5a48'),
  }),

  // Both hands on the haft and nothing guarding the other side. The greataxe
  // is the longest melee silhouette in the game and the grip pulls the arms
  // in, so it reads as narrow and forward — the opposite of the knight.
  berserker: base('berserker', {
    shoulder: 0.54,
    restless: 1.5,
    strideLength: 1.15,
    twoHanded: true,
    weapon: inHand(GREATAXE),
    helm: helmHorns('#7a2e20'),
  }),

  // The other two-hander, and told apart from the berserker by what is on the
  // end of it: a straight bright blade against a heavy curved head. Hooded
  // rather than horned, and it moves less.
  slayer: base('slayer', {
    shoulder: 0.5,
    restless: 0.8,
    strideLength: 1,
    twoHanded: true,
    cloak: shade(CLASSES.slayer.color, 0.66),
    weapon: inHand(GREATSWORD),
    helm: helmHood(shade(CLASSES.slayer.color, 0.5)),
  }),

  // Reach is the whole class, so the spear is the longest thing any hero
  // carries and it sticks out on both sides of the grip — which is what
  // separates a spear from a sword at a glance.
  lancer: base('lancer', {
    shoulder: 0.48,
    restless: 0.9,
    strideLength: 1.05,
    weapon: inHand(SPEAR),
    offhand: inHand(BUCKLER),
    helm: helmCrest('#4f6f92'),
  }),

  // The narrowest figure in the game and the only one with a blade in each
  // hand. Nothing projects far, everything moves: at size it is a small fast
  // smudge, which is the correct impression.
  rogue: base('rogue', {
    shoulder: 0.42,
    lineWidth: 0.08,
    restless: 1.8,
    strideLength: 1.2,
    weapon: inHand(DAGGER),
    offhand: inHand(DAGGER),
    helm: helmHood(shade(CLASSES.rogue.color, 0.55)),
  }),

  // Nothing in either hand — the only figure in the game with both free, and
  // the fastest fidget of any melee. Where every other silhouette is a body
  // plus a projection, this one is just the body, which at size is the most
  // distinctive read available and cost nothing to draw.
  monk: base('monk', {
    shoulder: 0.44,
    lineWidth: 0.082,
    restless: 1.7,
    strideLength: 1.25,
    helm: helmHood(shade(CLASSES.monk.color, 0.45)),
  }),

  // Widest shoulders after the paladin, and the only figure carrying a banner:
  // the outline goes out and then *broadens*, where every other weapon tapers.
  warlord: base('warlord', {
    shoulder: 0.6,
    lineWidth: 0.092,
    restless: 0.5,
    strideLength: 0.9,
    pauldrons: shade(CLASSES.warlord.color, 0.35),
    cloak: shade(CLASSES.warlord.color, 0.6),
    weapon: inHand(SWORD),
    offhand: inHand(BANNER),
    helm: helmCrest(shade(CLASSES.warlord.color, 0.3)),
  }),

  // --------------------------------------------------------------- ranged --

  // The only curve in the game. A bow is held across the body rather than
  // pointed along it, so the archer is the one figure whose weapon widens the
  // silhouette instead of extending it — which is exactly the read wanted for
  // something that kills at distance.
  archer: base('archer', {
    shoulder: 0.44,
    lineWidth: 0.08,
    restless: 1.2,
    strideLength: 1.15,
    weapon: inHand(BOW),
    back: QUIVER,
    helm: helmHood(shade(CLASSES.archer.color, 0.5)),
  }),

  // ---------------------------------------------------------------- casters --
  // Four of these carry a staff, so the focus at its head is what separates
  // them: a plain stone, a shard, a flame, a bolt, a skull. Colour alone would
  // not survive a dark map at speed.

  // Robed and wide with it, a book in the off hand. The only caster carrying
  // something in both hands, which is what tells it from the mages before the
  // colour registers.
  priest: base('priest', {
    shoulder: 0.47,
    restless: 0.7,
    strideLength: 0.95,
    cloak: shade(CLASSES.priest.color, 0.6),
    weapon: inHand(STAFF),
    offhand: inHand(TOME),
    helm: helmHood(shade(CLASSES.priest.color, 0.42)),
  }),

  // The darkest figure on the field: a deep cloak, a hood, and a skull on the
  // staff. Nothing bright anywhere, which is its own kind of legibility.
  necromancer: base('necromancer', {
    shoulder: 0.45,
    restless: 0.6,
    strideLength: 0.9,
    cloak: shade(CLASSES.necromancer.color, 0.72),
    focus: '#d8d2c0',
    weapon: inHand(STAFF_SKULL),
    helm: helmHood(shade(CLASSES.necromancer.color, 0.6)),
  }),

  // Angular everything. The shard is the only hard-edged focus, and the kit
  // barely moves at rest — cold reads as still.
  ice_mage: base('ice_mage', {
    shoulder: 0.44,
    restless: 0.45,
    strideLength: 0.9,
    cloak: shade(CLASSES.ice_mage.color, 0.68),
    weapon: inHand(STAFF_SHARD),
    helm: helmHood(shade(CLASSES.ice_mage.color, 0.5)),
  }),

  // The brightest thing in the game and the most restless. A teardrop focus
  // leaning forward, and no cloak — nothing to damp the colour down.
  fire_mage: base('fire_mage', {
    shoulder: 0.43,
    restless: 1.6,
    strideLength: 1.05,
    weapon: inHand(STAFF_FLAME),
    helm: helmHood(shade(CLASSES.fire_mage.color, 0.45)),
  }),

  // The caster who is not holding a staff. A flask barely projects at all, so
  // the silhouette is short and busy where the four staff-carriers are long —
  // which is the separation that matters, since a fifth staff with a fifth
  // focus shape would be splitting a hair nobody can see at speed.
  alchemist: base('alchemist', {
    shoulder: 0.46,
    lineWidth: 0.082,
    restless: 1.45,
    strideLength: 1.0,
    weapon: inHand(FLASK),
    offhand: inHand(TOME),
    helm: helmHood(shade(CLASSES.alchemist.color, 0.5)),
  }),

  // Jagged focus, no curves in it anywhere, and a quick fidget. Sits between
  // the other two mages on every axis on purpose: it is the sustained one.
  lightning_mage: base('lightning_mage', {
    shoulder: 0.44,
    restless: 1.35,
    strideLength: 1.1,
    cloak: shade(CLASSES.lightning_mage.color, 0.66),
    weapon: inHand(STAFF_BOLT),
    helm: helmHood(shade(CLASSES.lightning_mage.color, 0.48)),
  }),

  // ---- The second ten -----------------------------------------------------
  //
  // Twenty-six figures now have to be told apart at twenty-six pixels, which
  // no amount of trim will do. So these were built by re-spending the same
  // three levers — width, reach, grip — against the sixteen that already
  // exist, and reusing a weapon only where the class it shares with is a
  // different width or a different colour family.

  // Widest caster in the game and the only one with a cloak: it holds ground
  // rather than standing behind someone who does.
  druid: base('druid', {
    shoulder: 0.47,
    restless: 0.7,
    strideLength: 0.9,
    cloak: shade(CLASSES.druid.color, 0.6),
    weapon: inHand(STAFF),
    helm: helmHood(shade(CLASSES.druid.color, 0.42)),
  }),

  // The second bow, and deliberately not the archer's shape: broader
  // shoulders, a quiver, and none of the archer's crouch.
  beastmaster: base('beastmaster', {
    shoulder: 0.5,
    restless: 1.1,
    strideLength: 1.05,
    weapon: inHand(BOW),
    offhand: inHand(QUIVER),
    helm: helmHood(shade(CLASSES.beastmaster.color, 0.45)),
  }),

  // A staff in one hand and something set down in the other. Horned rather
  // than hooded, so it does not read as a fifth robed caster.
  shaman: base('shaman', {
    shoulder: 0.46,
    restless: 0.85,
    strideLength: 0.95,
    weapon: inHand(STAFF_SHARD),
    offhand: inHand(TOME),
    helm: helmHorns(shade(CLASSES.shaman.color, 0.5)),
  }),

  // Narrowest melee shape on the roster, one long blade and nothing in the
  // other hand — the opposite of the rogue's two short ones.
  duelist: base('duelist', {
    shoulder: 0.4,
    lineWidth: 0.08,
    restless: 1.5,
    strideLength: 1.15,
    weapon: inHand(SWORD),
    helm: helmCrest(shade(CLASSES.duelist.color, 0.4)),
  }),

  // Armoured like a frontliner and carrying a book: the only figure in the
  // game with a tome and a shield at the same time.
  inquisitor: base('inquisitor', {
    shoulder: 0.56,
    lineWidth: 0.09,
    restless: 0.5,
    strideLength: 0.85,
    pauldrons: shade(CLASSES.inquisitor.color, 0.4),
    weapon: inHand(MACE),
    offhand: inHand(TOME),
    helm: helmCrest('#7d7a86'),
  }),

  // Both hands on one haft, which no other caster does. It is carrying its
  // work rather than pointing with it.
  runesmith: base('runesmith', {
    shoulder: 0.45,
    restless: 0.6,
    strideLength: 0.88,
    weapon: inHand(STAFF_BOLT),
    helm: helmCrest(shade(CLASSES.runesmith.color, 0.42)),
  }),

  // Hooded, thin, and carrying the skull staff — the necromancer's silhouette
  // read at a distance, separated by being a much lighter frame and a much
  // colder colour.
  harbinger: base('harbinger', {
    shoulder: 0.41,
    restless: 1.2,
    strideLength: 1.0,
    cloak: shade(CLASSES.harbinger.color, 0.66),
    weapon: inHand(STAFF_SKULL),
    helm: helmHood(shade(CLASSES.harbinger.color, 0.48)),
  }),

  // Short, heavy and blunt. Broad shoulders on a low frame, with the weapon
  // barely projecting: everything about it is for close work on something big.
  sapper: base('sapper', {
    shoulder: 0.54,
    lineWidth: 0.1,
    restless: 0.8,
    strideLength: 0.9,
    pauldrons: shade(CLASSES.sapper.color, 0.42),
    weapon: inHand(MACE),
    offhand: inHand(FLASK),
    helm: helmCrest('#7a5a30'),
  }),

  // An axe in one hand and a dagger in the other — the only mismatched grip
  // on the roster, which is exactly what it is for.
  marauder: base('marauder', {
    shoulder: 0.48,
    restless: 1.55,
    strideLength: 1.2,
    cloak: shade(CLASSES.marauder.color, 0.6),
    weapon: inHand(AXE),
    offhand: inHand(DAGGER),
    helm: helmHood(shade(CLASSES.marauder.color, 0.5)),
  }),

  // The widest figure in the game, now that the paladin has been beaten. A
  // spear held short and a slab of a shield: it is a doorway.
  sentinel: base('sentinel', {
    shoulder: 0.66,
    lineWidth: 0.1,
    restless: 0.15,
    strideLength: 0.7,
    pauldrons: shade(CLASSES.sentinel.color, 0.38),
    weapon: inHand(SPEAR),
    offhand: inHand(SHIELD),
    helm: helmHorns(shade(CLASSES.sentinel.color, 0.45)),
  }),
};

export const kitFor = (classId) => KITS[classId] ?? base(classId, {
  weapon: inHand(SWORD),
});

export const KIT_IDS = Object.keys(KITS);
