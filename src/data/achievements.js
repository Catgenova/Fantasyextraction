// Trophies. One per boss, and each one is the only way to unlock a class.
//
// These are the game's progression spine: the three launch classes get you
// through the outer ring, the outer-ring boss pays for a fourth, and each
// deeper kill opens something built for the ring after it. Nothing here is
// bought, rolled for, or dropped — a class is unlocked by the deed or not at
// all, so a roster is a readable record of what its owner has actually killed.
//
// The kill is the achievement, not the extraction. Bosses are hard enough that
// dying on the way out with the trophy already earned is a fair trade — you
// still lose everything you were carrying, which is punishment enough.

import { BOSSES } from './enemies.js';
import { CLASSES } from './classes.js';

export const ACHIEVEMENTS = [
  {
    id: 'quiet_knife',
    bossId: 'quiet_knife',
    name: 'The Knife Goes Quiet',
    unlocks: 'rogue',
    blurb: 'Kill The Quiet Knife in the outer ring.',
    flavour: 'Whoever held the outer roads held them by never being seen doing it. The trick outlived them.',
  },
  {
    id: 'grendrak',
    bossId: 'grendrak',
    name: 'Something Broke Him',
    unlocks: 'berserker',
    blurb: 'Kill Grendrak the Unbroken in the mid ring.',
    flavour: 'He fought harder the closer he came to dying, right up until it stopped working. Worth learning.',
  },
  {
    id: 'gravemaw',
    bossId: 'gravemaw',
    name: 'The Bonefather Buried',
    unlocks: 'necromancer',
    blurb: 'Kill Gravemaw, the Bonefather, in the mid ring.',
    flavour: 'It raised its ghouls out of the same dirt you left it in. The words were not hard once you had the corpse.',
  },
  {
    id: 'hoarfrost',
    bossId: 'hoarfrost',
    name: 'The Still Winter Ends',
    unlocks: 'ice_mage',
    blurb: 'Kill Hoarfrost, the Still Winter, in the mid ring.',
    flavour: 'It never chased anyone. It simply made the ground between you and it take longer to cross.',
  },
  {
    id: 'emberjaw',
    bossId: 'emberjaw',
    name: 'The Kiln Goes Cold',
    unlocks: 'fire_mage',
    blurb: 'Kill Emberjaw, the Kiln Wyrm, in the core.',
    flavour: 'Everything it touched burned for a long time afterwards. That part, at least, is teachable.',
  },
  {
    id: 'ashenveil',
    bossId: 'ashenveil',
    name: 'The Choir Silenced',
    unlocks: 'lightning_mage',
    blurb: 'Kill Ashenveil, the Hollow Choir, in the core.',
    flavour: 'Its voice was a storm you could stand inside. Now it is something you can throw.',
  },
  {
    id: 'malgareth',
    bossId: 'malgareth',
    name: 'The Veil Mended',
    unlocks: 'slayer',
    blurb: 'Kill Malgareth, the Rent Veil, in the core.',
    flavour: 'It came through a hole in the world. Closing the hole was easy; the thing already through it was not.',
  },
  {
    id: 'the_warden',
    bossId: 'the_warden',
    name: 'The Seal Answers to You',
    unlocks: 'paladin',
    blurb: 'Kill The Warden of the Seal when it wakes at the centre of the map.',
    flavour: 'It guarded the Seal for so long that the oath outlived the reason. Someone has to hold it now.',
  },
];

export const ACHIEVEMENT_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
export const ACHIEVEMENT_BY_BOSS = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.bossId, a]));

/** The achievement a boss kill earns, or null if that boss grants nothing. */
export const achievementForBoss = (bossId) => ACHIEVEMENT_BY_BOSS[bossId] ?? null;

/** Boss definition an achievement is about — for names, colour and tier in the UI. */
export const bossForAchievement = (ach) => BOSSES[ach.bossId] ?? null;

/** Class an achievement unlocks. */
export const classForAchievement = (ach) => CLASSES[ach.unlocks] ?? null;
