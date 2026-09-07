// Trophies. Eight solo hunts, and each one is the only way to unlock a class.
//
// There are ten solo species and eight unlockable classes, so two of the great
// hunts — Mirethane and Skyrender — grant no class at all. They are worth
// taking for their parts, and a roster where every hunt hands out a class
// would make the choice of which to attempt meaningless.
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

import { LARGE_CREATURES } from './creatures.js';
import { CLASSES } from './classes.js';

export const ACHIEVEMENTS = [
  {
    id: 'bastionback',
    bossId: 'bastionback',
    name: 'Something That Would Not Fall',
    unlocks: 'paladin',
    blurb: 'Take a Bastionback alone. The first solo hunt anyone survives.',
    flavour: 'It never once tried to kill you quickly. You had to learn to stop hitting the plate, and that is most of what a Paladin is.',
  },
  {
    id: 'tyrannoclast',
    bossId: 'tyrannoclast',
    name: 'The Line It Chose',
    unlocks: 'berserker',
    blurb: 'Take a Tyrannoclast alone in the mid ring.',
    flavour: 'It picked a straight line through three of you and never deviated. There is a way of fighting in that, if you are willing to be hit.',
  },
  {
    id: 'deepdelver',
    bossId: 'deepdelver',
    name: 'What Was Underneath',
    unlocks: 'necromancer',
    blurb: 'Take a Deepdelver alone in the mid ring.',
    flavour: 'It spent half the fight below the fight, and everything it called up came from the same place. The calling is the teachable part.',
  },
  {
    id: 'glaciermaw',
    bossId: 'glaciermaw',
    name: 'The Cold It Kept',
    unlocks: 'ice_mage',
    blurb: 'Take a Glaciermaw alone in the mid ring.',
    flavour: 'It was never fast. It simply made everything in front of it slow, which turns out to be the same thing.',
  },
  {
    id: 'pyroclast',
    bossId: 'pyroclast',
    name: 'The Ground It Ruined',
    unlocks: 'fire_mage',
    blurb: 'Take a Pyroclast alone in the core.',
    flavour: 'Most of the arena was unusable before you landed a blow. Denying ground is a weapon, and now it is yours.',
  },
  {
    id: 'stormcrest',
    bossId: 'stormcrest',
    name: 'It Never Once Landed',
    unlocks: 'lightning_mage',
    blurb: 'Take a Stormcrest alone in the core.',
    flavour: 'Killing it was a question of crossing open ground faster than it could leave. Nothing you own now needs to.',
  },
  {
    id: 'venomcoil',
    bossId: 'venomcoil',
    name: 'Patience, Applied',
    unlocks: 'rogue',
    blurb: 'Take a Venomcoil alone in the core.',
    flavour: 'It did almost nothing quickly. Everything it had already put in you was doing the work, and it could afford to wait.',
  },
  {
    id: 'nightfell',
    bossId: 'nightfell',
    name: 'The One That Was Choosing',
    unlocks: 'slayer',
    blurb: 'Take Nightfell alone at the centre of the map.',
    flavour: 'It did everything the others do, in an order that seemed to be about you. Whatever was doing the choosing, you have it now.',
  },
];

export const ACHIEVEMENT_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
export const ACHIEVEMENT_BY_BOSS = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.bossId, a]));

/** The achievement a boss kill earns, or null if that boss grants nothing. */
export const achievementForBoss = (bossId) => ACHIEVEMENT_BY_BOSS[bossId] ?? null;

/** Boss definition an achievement is about — for names, colour and tier in the UI. */
export const bossForAchievement = (ach) => LARGE_CREATURES[ach.bossId] ?? null;

/** Class an achievement unlocks. */
export const classForAchievement = (ach) => CLASSES[ach.unlocks] ?? null;
