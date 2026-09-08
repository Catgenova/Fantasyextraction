// Trophies. Twenty-three solo kills, and each one is the only way to unlock a
// class.
//
// These are the game's progression spine: the three launch classes get you
// through the outer ring, the outer-ring boss pays for a fourth, and each
// deeper kill opens something built for the ring after it. Nothing here is
// bought, rolled for, or dropped — a class is unlocked by the deed or not at
// all, so a roster is a readable record of what its owner has actually killed.
//
// Twenty of them are hunts you go and take. Three are not: the walkers
// arrive on the clock and come to you, so their trophies are the only ones a
// player can earn without ever having decided to.
//
// The kill is the achievement, not the extraction. Bosses are hard enough that
// dying on the way out with the trophy already earned is a fair trade — you
// still lose everything you were carrying, which is punishment enough.

import { CREATURES } from './creatures.js';
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
  {
    id: 'mirethane',
    bossId: 'mirethane',
    name: 'It Would Not Let Go',
    unlocks: 'warden',
    blurb: 'Take a Mirethane alone in the mid ring.',
    flavour: 'It took one of you out of the fight and dared the rest to hurry. Deciding where a fight happens turns out to be worth more than winning it quickly.',
  },
  {
    id: 'skyrender',
    bossId: 'skyrender',
    name: 'It Came Back Down',
    unlocks: 'lancer',
    blurb: 'Take a Skyrender alone in the core.',
    flavour: 'It spent half the fight out of reach and the other half arriving. Reach, and knowing when to close it, is the whole lesson.',
  },
  {
    id: 'cairnwalker',
    bossId: 'cairnwalker',
    name: 'It Did Not Stop',
    unlocks: 'monk',
    blurb: 'Put down a Cairnwalker. It sets off with twenty minutes left and does not stop.',
    flavour: 'You outran it four times and it was still coming each time you looked. Standing still was the only mistake available, so you stopped making it.',
  },
  {
    id: 'sablemarch',
    bossId: 'sablemarch',
    name: 'What It Left Behind',
    unlocks: 'alchemist',
    blurb: 'Put down a Sablemarch. It crosses the exit ring with fifteen minutes left.',
    flavour: 'Your plate came apart before you did, and the ground it crossed was still working an hour later. Whatever was doing that can be bottled.',
  },
  {
    id: 'duskherald',
    bossId: 'duskherald',
    name: 'Everyone Heard It',
    unlocks: 'warlord',
    blurb: 'Put down a Duskherald. It comes up out of the core with ten minutes left, and it is not alone.',
    flavour: 'It called once and half the ring answered. Nothing it did afterwards mattered as much as that — a field is won by who is standing on it.',
  },
  // ---- The second ten -------------------------------------------------------
  // Ten more grounds, ten more classes, and the same rule: the fight teaches
  // the thing the trophy hands you. A trophy that unlocked a class with no
  // relationship to the animal would be a lottery ticket with a monster
  // attached.
  {
    id: 'thornmother',
    bossId: 'thornmother',
    name: 'Where It Decided',
    unlocks: 'druid',
    blurb: 'Take a Thornmother alone in the outer ring.',
    flavour: 'It never once moved toward you. It simply kept making the ground you were on worse than the ground beside it, until there was no ground beside it.',
  },
  {
    id: 'broodsire',
    bossId: 'broodsire',
    name: 'It Was Never Alone',
    unlocks: 'beastmaster',
    blurb: 'Take a Broodsire alone in the outer ring.',
    flavour: 'You killed nine things before you got to the one that mattered, and every one of them came when it called. Hunting like that is a skill, and it is yours now.',
  },
  {
    id: 'snatchwing',
    bossId: 'snatchwing',
    name: 'It Only Wanted The One Thing',
    unlocks: 'marauder',
    blurb: 'Take a Snatchwing alone in the mid ring.',
    flavour: 'It was in and out four times and only the last one was a fight. A second exchange is a mistake you have already made — it never made one.',
  },
  {
    id: 'standhorn',
    bossId: 'standhorn',
    name: 'What It Left Standing',
    unlocks: 'shaman',
    blurb: 'Take a Standhorn alone in the mid ring.',
    flavour: 'It went down and the ground it had prepared kept going for another half a minute. Whatever you put down and walk away from is the part that counts.',
  },
  {
    id: 'mirrorscale',
    bossId: 'mirrorscale',
    name: 'Everything You Gave It',
    unlocks: 'duelist',
    blurb: 'Take a Mirrorscale alone in the mid ring.',
    flavour: 'The squads it kills are the ones that hit it hardest. Learning to wait for the answer before you commit is the whole lesson, and it costs a lot to learn.',
  },
  {
    id: 'sinkjaw',
    bossId: 'sinkjaw',
    name: 'It Took The Floor',
    unlocks: 'sapper',
    blurb: 'Take a Sinkjaw alone in the mid ring.',
    flavour: 'It never came at the squad. It came at what the squad was standing on, and the plate you were so proud of turned out to be a surface like any other.',
  },
  {
    id: 'hexmaw',
    bossId: 'hexmaw',
    name: 'What You Brought With You',
    unlocks: 'inquisitor',
    blurb: 'Take a Hexmaw alone in the core.',
    flavour: 'It spent the whole fight on your preparation rather than on you. Taking the advantage away turns out to be cheaper than out-damaging it.',
  },
  {
    id: 'sigilborn',
    bossId: 'sigilborn',
    name: 'It Was Already Written',
    unlocks: 'runesmith',
    blurb: 'Take a Sigilborn alone in the core.',
    flavour: 'Everything it did was decided before it did anything. Work done in advance is the cheapest damage in the game, and it was doing it while you were still walking in.',
  },
  {
    id: 'doomcrier',
    bossId: 'doomcrier',
    name: 'The Count, Not The Blow',
    unlocks: 'harbinger',
    blurb: 'Take a Doomcrier alone in the core.',
    flavour: 'Nothing it did was the thing that killed anyone. It named you early and was in no hurry, and the arithmetic did the rest.',
  },
  {
    id: 'everstand',
    bossId: 'everstand',
    name: 'It Did Not Move',
    unlocks: 'sentinel',
    blurb: 'Take an Everstand alone in the core.',
    flavour: 'You fought it where it was standing because there was no other option on offer. Choosing the ground by simply refusing to leave it is a strategy, and now it is one of yours.',
  },
];

export const ACHIEVEMENT_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
export const ACHIEVEMENT_BY_BOSS = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.bossId, a]));

/** The achievement a boss kill earns, or null if that boss grants nothing. */
export const achievementForBoss = (bossId) => ACHIEVEMENT_BY_BOSS[bossId] ?? null;

/** Boss definition an achievement is about — for names, colour and tier in the UI. */
export const bossForAchievement = (ach) => CREATURES[ach.bossId] ?? null;

/** Class an achievement unlocks. */
export const classForAchievement = (ach) => CLASSES[ach.unlocks] ?? null;
