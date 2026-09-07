// The bestiary. Fifty species, and everything you can own comes off one of them.
//
// Two kinds of hunt. Pack species are fought in numbers — a small pack is a
// skirmish, a large pack is an event — and each one dies in one or two carves.
// Solo species are single apex monsters worth four to six carves apiece, every
// one of them two grades better, which is the entire reason to take one on.
//
// Every species names a `behaviour` from src/data/behaviours.js, and that is
// what makes forty of them distinguishable: the sim reads the behaviour, and
// the species' own reach, speed and pack size colour it. It is also what its
// armour set does — wear a full Sicklejaw set and you fight a little like a
// Sicklejaw. That link is the point, so it is stated on every entry rather
// than left for the blacksmith to infer.
//
// `parts` are weights, not guarantees: a carve rolls against them.

export const SMALL_CREATURES = {
  // ---- Raptorials: fast, light, and never alone ----------------------------
  sicklejaw: {
    id: 'sicklejaw', name: 'Sicklejaw', family: 'raptorial', tier: 0, hunt: 'small',
    behaviour: 'harry', color: '#a87f4e',
    blurb: 'Opens a vein and is twelve feet away before the swing lands.',
    hp: 90, armor: 14, resist: 6, damage: 18, attackInterval: 0.9, range: 34,
    moveSpeed: 128, radius: 11, aggroRange: 300, xp: 10, packSize: [4, 7],
    parts: { hide: 4, claw: 3, fang: 2, sinew: 1 },
    set: {
      name: 'Sicklejaw', echoes: 'harry',
      desc: 'Hit and leave. Everything about the set is built to be somewhere else.',
      mods: { moveSpeedPct: 0.12, attackSpeedPct: 0.14, agility: 6 },
    },
  },
  duskrunner: {
    id: 'duskrunner', name: 'Duskrunner', family: 'raptorial', tier: 0, hunt: 'small',
    behaviour: 'flank', color: '#7c6a8a',
    blurb: 'Will not meet a shield. Goes round it, every time, and waits for you to turn.',
    hp: 110, armor: 18, resist: 10, damage: 20, attackInterval: 1.1, range: 36,
    moveSpeed: 120, radius: 12, aggroRange: 320, xp: 12, packSize: [4, 6],
    parts: { hide: 4, claw: 2, fang: 2, sinew: 1 },
    set: {
      name: 'Duskrunner', echoes: 'flank',
      desc: 'Rewards hitting what is not looking at you.',
      mods: { critChance: 0.09, agility: 5, moveSpeedPct: 0.06 },
    },
  },
  threshclaw: {
    id: 'threshclaw', name: 'Threshclaw', family: 'raptorial', tier: 0, hunt: 'small',
    behaviour: 'swarm', color: '#8d6f4a',
    blurb: 'Individually contemptible. There are never fewer than nine.',
    hp: 70, armor: 8, resist: 4, damage: 14, attackInterval: 0.85, range: 32,
    moveSpeed: 112, radius: 10, aggroRange: 280, xp: 8, packSize: [7, 11],
    parts: { hide: 5, claw: 3, fang: 1, sinew: 1 },
    set: {
      name: 'Threshclaw', echoes: 'swarm',
      desc: 'Made for being outnumbered and not minding.',
      mods: { damagePct: 0.1, attackSpeedPct: 0.08, maxHpFlat: 40 },
    },
  },
  nettlefang: {
    id: 'nettlefang', name: 'Nettlefang', family: 'raptorial', tier: 1, hunt: 'small',
    behaviour: 'venomous', color: '#7f9c52',
    blurb: 'The bite is nothing. The next two minutes are the problem.',
    hp: 200, armor: 34, resist: 30, damage: 30, attackInterval: 1.3, range: 38,
    moveSpeed: 106, radius: 13, aggroRange: 330, xp: 26, packSize: [4, 6],
    parts: { hide: 3, fang: 3, gland: 2, sinew: 1 },
    set: {
      name: 'Nettlefang', echoes: 'venomous',
      desc: 'Everything you apply lasts longer and hurts more on the way out.',
      mods: { dotPct: 0.3, agility: 4 },
    },
  },
  palestalker: {
    id: 'palestalker', name: 'Palestalker', family: 'raptorial', tier: 1, hunt: 'small',
    behaviour: 'stalker', color: '#c3c0b4',
    blurb: 'Keeps pace at the edge of sight and takes whoever stops to loot.',
    hp: 220, armor: 40, resist: 24, damage: 44, attackInterval: 1.5, range: 40,
    moveSpeed: 116, radius: 13, aggroRange: 420, xp: 30, packSize: [3, 5],
    parts: { hide: 4, claw: 3, fang: 2, sinew: 1 },
    set: {
      name: 'Palestalker', echoes: 'stalker',
      desc: 'Punishes the target nobody else is dealing with.',
      mods: { damagePct: 0.12, critDamage: 0.25, agility: 4 },
    },
  },
  rimeclaw: {
    id: 'rimeclaw', name: 'Rimeclaw', family: 'raptorial', tier: 1, hunt: 'small',
    behaviour: 'harry', color: '#8fc9d8',
    blurb: 'Bites, and the limb it bit stops answering for a while.',
    hp: 210, armor: 36, resist: 46, damage: 34, attackInterval: 1.05, range: 36,
    moveSpeed: 122, radius: 12, aggroRange: 330, xp: 28, packSize: [4, 7],
    parts: { hide: 3, scale: 3, claw: 2, gland: 1, sinew: 1 },
    set: {
      name: 'Rimeclaw', echoes: 'harry',
      desc: 'Speed, and the cold that stops anything chasing you.',
      mods: { moveSpeedPct: 0.14, resist: 60, attackSpeedPct: 0.08 },
    },
  },
  emberjack: {
    id: 'emberjack', name: 'Emberjack', family: 'raptorial', tier: 1, hunt: 'small',
    behaviour: 'pounce', color: '#d1743f',
    blurb: 'Coils, and then the twenty feet between you were never there.',
    hp: 190, armor: 30, resist: 40, damage: 40, attackInterval: 1.4, range: 38,
    moveSpeed: 118, radius: 12, aggroRange: 360, xp: 29, packSize: [3, 6],
    parts: { hide: 3, claw: 3, gland: 2, sinew: 1 },
    set: {
      name: 'Emberjack', echoes: 'pounce',
      desc: 'Built around closing distance and doing it again sooner.',
      mods: { cooldownPct: 0.14, moveSpeedPct: 0.08, might: 4 },
    },
  },
  bloodcrest: {
    id: 'bloodcrest', name: 'Bloodcrest', family: 'raptorial', tier: 2, hunt: 'small',
    behaviour: 'frenzy', color: '#b03c3c',
    blurb: 'Wounding one is a mistake you get to watch arrive.',
    hp: 480, armor: 70, resist: 50, damage: 62, attackInterval: 1.15, range: 40,
    moveSpeed: 124, radius: 14, aggroRange: 400, xp: 62, packSize: [3, 5],
    parts: { hide: 3, claw: 3, fang: 2, marrow: 1, sinew: 1 },
    set: {
      name: 'Bloodcrest', echoes: 'frenzy',
      desc: 'Feeds on the fight. Worth more the worse it is going.',
      mods: { lifesteal: 0.1, damagePct: 0.14, might: 6 },
    },
  },

  // ---- Wyverlings: small flyers, thin and quick ---------------------------
  skiterling: {
    id: 'skiterling', name: 'Skiterling', family: 'wyverling', tier: 0, hunt: 'small',
    behaviour: 'swarm', color: '#9aa8bb',
    blurb: 'A flock that decided you were carrion slightly too early.',
    hp: 60, armor: 6, resist: 12, damage: 12, attackInterval: 0.8, range: 30,
    moveSpeed: 134, radius: 9, aggroRange: 300, xp: 7, packSize: [8, 12],
    parts: { membrane: 5, hide: 2, fang: 1, sinew: 1 },
    set: {
      name: 'Skiterling', echoes: 'swarm',
      desc: 'Almost weightless. Hard to land a clean hit on.',
      mods: { dodge: 0.09, moveSpeedPct: 0.1, agility: 4 },
    },
  },
  screelwing: {
    id: 'screelwing', name: 'Screelwing', family: 'wyverling', tier: 0, hunt: 'small',
    behaviour: 'screamer', color: '#b6a35f',
    blurb: 'Fights poorly. Its real weapon is the rest of the nest arriving.',
    hp: 85, armor: 10, resist: 18, damage: 15, attackInterval: 1.4, range: 34,
    moveSpeed: 118, radius: 10, aggroRange: 460, xp: 11, packSize: [3, 5],
    parts: { membrane: 4, horn: 2, hide: 2, sinew: 1 },
    set: {
      name: 'Screelwing', echoes: 'screamer',
      desc: 'Worth more to the squad than to the wearer.',
      mods: {}, aura: { damagePct: 0.08, moveSpeedPct: 0.06 },
    },
  },
  divepike: {
    id: 'divepike', name: 'Divepike', family: 'wyverling', tier: 1, hunt: 'small',
    behaviour: 'bomber', color: '#6f8fb8',
    blurb: 'Circles until somebody is standing alone, then stops circling.',
    hp: 175, armor: 24, resist: 26, damage: 48, attackInterval: 1.9, range: 36,
    moveSpeed: 126, radius: 12, aggroRange: 420, xp: 27, packSize: [3, 5],
    parts: { membrane: 4, fang: 3, hide: 2, sinew: 1 },
    set: {
      name: 'Divepike', echoes: 'bomber',
      desc: 'One committed hit worth several careful ones.',
      mods: { critDamage: 0.35, agility: 5 },
    },
  },
  glasswing: {
    id: 'glasswing', name: 'Glasswing', family: 'wyverling', tier: 1, hunt: 'small',
    behaviour: 'harry', color: '#cfe0e8',
    blurb: 'You can see the sky through it. Catching it is the whole fight.',
    hp: 150, armor: 16, resist: 34, damage: 28, attackInterval: 0.8, range: 32,
    moveSpeed: 138, radius: 11, aggroRange: 340, xp: 25, packSize: [4, 7],
    parts: { membrane: 6, hide: 1, gland: 1, sinew: 1 },
    set: {
      name: 'Glasswing', echoes: 'harry',
      desc: 'Nothing stops it and nothing hits it.',
      mods: { dodge: 0.11, moveSpeedPct: 0.15, agility: 5 },
    },
  },
  cinderbat: {
    id: 'cinderbat', name: 'Cinderbat', family: 'wyverling', tier: 1, hunt: 'small',
    behaviour: 'bomber', color: '#c96a45',
    blurb: 'Drops burning. Whether it survives the drop is not its concern.',
    hp: 165, armor: 20, resist: 44, damage: 42, attackInterval: 2.0, range: 34,
    moveSpeed: 122, radius: 11, aggroRange: 400, xp: 26, packSize: [4, 6],
    parts: { membrane: 4, gland: 3, hide: 1, sinew: 1 },
    set: {
      name: 'Cinderbat', echoes: 'bomber',
      desc: 'Everything you throw lands wider.',
      mods: { aoeRadiusPct: 0.24, dotPct: 0.12 },
    },
  },
  stormvane: {
    id: 'stormvane', name: 'Stormvane', family: 'wyverling', tier: 2, hunt: 'small',
    behaviour: 'spitter', color: '#a98fe0',
    blurb: 'Never lands, never closes, and never misses by very much.',
    hp: 400, armor: 34, resist: 96, damage: 58, attackInterval: 1.8, range: 250,
    projectile: true, projectileSpeed: 460, school: 'magic',
    moveSpeed: 112, radius: 13, aggroRange: 440, xp: 58, packSize: [3, 5],
    parts: { membrane: 4, gland: 3, horn: 2, marrow: 1, sinew: 1 },
    set: {
      name: 'Stormvane', echoes: 'spitter',
      desc: 'Fights from further out than anything should be able to.',
      mods: { rangeBonus: 55, cooldownPct: 0.1, spirit: 6 },
    },
  },

  // ---- Carapace: slow, plated, and in the way -----------------------------
  plateback: {
    id: 'plateback', name: 'Plateback', family: 'carapace', tier: 0, hunt: 'small',
    behaviour: 'bulwark', color: '#7a7360',
    blurb: 'Does not chase and does not need to. It is where you wanted to walk.',
    hp: 200, armor: 60, resist: 14, damage: 22, attackInterval: 1.8, range: 42,
    moveSpeed: 74, radius: 15, aggroRange: 260, xp: 16, packSize: [3, 5],
    parts: { plate: 4, scale: 3, horn: 1, sinew: 1 },
    set: {
      name: 'Plateback', echoes: 'bulwark',
      desc: 'The cheapest wall in the game.',
      mods: { armor: 110, vitality: 6 },
    },
  },
  boulderhide: {
    id: 'boulderhide', name: 'Boulderhide', family: 'carapace', tier: 1, hunt: 'small',
    behaviour: 'bulwark', color: '#6b6455',
    blurb: 'Four of them abreast is a closed road.',
    hp: 520, armor: 120, resist: 30, damage: 40, attackInterval: 2.0, range: 46,
    moveSpeed: 66, radius: 18, aggroRange: 280, xp: 44, packSize: [3, 4],
    parts: { plate: 5, scale: 2, horn: 2, marrow: 1, sinew: 1 },
    set: {
      name: 'Boulderhide', echoes: 'bulwark',
      desc: 'Slow, and very hard to remove.',
      mods: { armor: 160, damageTakenPct: -0.1, vitality: 8, moveSpeedPct: -0.04 },
    },
  },
  spinedrake: {
    id: 'spinedrake', name: 'Spinedrake', family: 'carapace', tier: 1, hunt: 'small',
    behaviour: 'tailwhip', color: '#8a7f52',
    blurb: 'Punishes a squad for standing together, which they usually are.',
    hp: 340, armor: 70, resist: 34, damage: 46, attackInterval: 1.7, range: 60,
    cleave: 90, moveSpeed: 88, radius: 16, aggroRange: 320, xp: 40, packSize: [3, 5],
    parts: { scale: 4, tail: 3, plate: 2, sinew: 1 },
    set: {
      name: 'Spinedrake', echoes: 'tailwhip',
      desc: 'Reach, and everything that comes with hitting several things at once.',
      mods: { aoeRadiusPct: 0.2, rangeBonus: 20, might: 5 },
    },
  },
  cragshell: {
    id: 'cragshell', name: 'Cragshell', family: 'carapace', tier: 1, hunt: 'small',
    behaviour: 'ambusher', color: '#6d6a63',
    blurb: 'You have already walked past two of them.',
    hp: 300, armor: 100, resist: 40, damage: 55, attackInterval: 1.9, range: 44,
    moveSpeed: 70, radius: 15, aggroRange: 190, xp: 38, packSize: [2, 4],
    parts: { plate: 4, scale: 3, claw: 2, sinew: 1 },
    set: {
      name: 'Cragshell', echoes: 'ambusher',
      desc: 'The first blow of a fight is worth several of the rest.',
      mods: { critDamage: 0.3, armorPen: 90, armor: 50 },
    },
  },
  ironbrow: {
    id: 'ironbrow', name: 'Ironbrow', family: 'carapace', tier: 2, hunt: 'small',
    behaviour: 'charger', color: '#8e8778',
    blurb: 'Picks one of you, lines up, and does not deviate.',
    hp: 620, armor: 130, resist: 50, damage: 78, attackInterval: 1.9, range: 50,
    moveSpeed: 96, radius: 18, aggroRange: 420, xp: 74, packSize: [2, 4],
    parts: { plate: 4, horn: 4, scale: 2, marrow: 1, sinew: 1 },
    set: {
      name: 'Ironbrow', echoes: 'charger',
      desc: 'Rewards committing to a straight line and a single target.',
      mods: { might: 8, damagePct: 0.12, armorPen: 70 },
    },
  },
  thornback: {
    id: 'thornback', name: 'Thornback', family: 'carapace', tier: 2, hunt: 'small',
    behaviour: 'retaliate', color: '#5f6b5a',
    blurb: 'Barely fights. Killing one badly costs more than leaving it alone.',
    hp: 700, armor: 150, resist: 70, damage: 30, attackInterval: 2.2, range: 44,
    moveSpeed: 68, radius: 17, aggroRange: 240, xp: 70, packSize: [2, 4],
    parts: { plate: 5, scale: 3, horn: 2, marrow: 1, sinew: 1 },
    set: {
      name: 'Thornback', echoes: 'retaliate',
      desc: 'Turns being attacked into an advantage.',
      mods: { blockChance: 0.14, armor: 130, damageTakenPct: -0.08 },
    },
  },
  // ---- Venomites: what they leave in you matters more than the bite -------
  bilespitter: {
    id: 'bilespitter', name: 'Bilespitter', family: 'venomite', tier: 0, hunt: 'small',
    behaviour: 'spitter', color: '#8fa64a',
    blurb: 'Backs away the whole fight and is still the reason you are losing it.',
    hp: 110, armor: 12, resist: 30, damage: 19, attackInterval: 1.7, range: 200,
    projectile: true, projectileSpeed: 340,
    moveSpeed: 92, radius: 11, aggroRange: 330, xp: 13, packSize: [4, 6],
    parts: { gland: 4, hide: 3, scale: 1, sinew: 1 },
    set: {
      name: 'Bilespitter', echoes: 'spitter',
      desc: 'Corrosion that keeps working after the shot lands.',
      mods: { dotPct: 0.24, rangeBonus: 25 },
    },
  },
  mirefang: {
    id: 'mirefang', name: 'Mirefang', family: 'venomite', tier: 1, hunt: 'small',
    behaviour: 'venomous', color: '#6b8a5c',
    blurb: 'Bites once and then simply waits, which is usually enough.',
    hp: 230, armor: 30, resist: 50, damage: 32, attackInterval: 1.4, range: 38,
    moveSpeed: 100, radius: 13, aggroRange: 320, xp: 28, packSize: [4, 6],
    parts: { gland: 4, fang: 3, hide: 2, sinew: 1 },
    set: {
      name: 'Mirefang', echoes: 'venomous',
      desc: 'Patient damage, and enough of it comes back to you.',
      mods: { dotPct: 0.26, lifesteal: 0.06 },
    },
  },
  blightcrawler: {
    id: 'blightcrawler', name: 'Blightcrawler', family: 'venomite', tier: 1, hunt: 'small',
    behaviour: 'leech', color: '#7d6b8c',
    blurb: 'Attaches. From then on the fight is about getting it off.',
    hp: 260, armor: 40, resist: 44, damage: 26, attackInterval: 1.0, range: 34,
    moveSpeed: 104, radius: 12, aggroRange: 300, xp: 30, packSize: [4, 7],
    parts: { gland: 3, hide: 3, fang: 2, sinew: 1 },
    set: {
      name: 'Blightcrawler', echoes: 'leech',
      desc: 'Every hit gives a little of it back.',
      mods: { lifesteal: 0.13, vitality: 5 },
    },
  },
  fumewyrm: {
    id: 'fumewyrm', name: 'Fumewyrm', family: 'venomite', tier: 2, hunt: 'small',
    behaviour: 'spitter', color: '#9db85e',
    blurb: 'Leaves the ground unusable behind it, which is most of the problem.',
    hp: 420, armor: 44, resist: 90, damage: 54, attackInterval: 1.9, range: 230,
    projectile: true, projectileSpeed: 320, school: 'magic',
    moveSpeed: 90, radius: 14, aggroRange: 380, xp: 60, packSize: [3, 5],
    parts: { gland: 5, scale: 3, marrow: 1, sinew: 1 },
    set: {
      name: 'Fumewyrm', echoes: 'spitter',
      desc: 'Wider clouds that last longer.',
      mods: { aoeRadiusPct: 0.26, dotPct: 0.22, spirit: 5 },
    },
  },
  pincerjaw: {
    id: 'pincerjaw', name: 'Pincerjaw', family: 'venomite', tier: 2, hunt: 'small',
    behaviour: 'grapple', color: '#6f5f4a',
    blurb: 'Takes one of you out of the fight by refusing to let them leave it.',
    hp: 520, armor: 90, resist: 60, damage: 66, attackInterval: 1.6, range: 44,
    moveSpeed: 92, radius: 16, aggroRange: 340, xp: 66, packSize: [2, 4],
    parts: { claw: 5, plate: 3, marrow: 1, sinew: 1 },
    set: {
      name: 'Pincerjaw', echoes: 'grapple',
      desc: 'Holds ground and whatever is standing on it.',
      mods: { might: 7, blockChance: 0.1, armor: 70 },
    },
  },
  sporeback: {
    id: 'sporeback', name: 'Sporeback', family: 'venomite', tier: 2, hunt: 'small',
    behaviour: 'deathcloud', color: '#a3b06a',
    blurb: 'Kill it at range or do not kill it near anybody you like.',
    hp: 380, armor: 50, resist: 80, damage: 40, attackInterval: 1.8, range: 40,
    moveSpeed: 84, radius: 15, aggroRange: 300, xp: 58, packSize: [3, 5],
    parts: { gland: 5, scale: 2, membrane: 2, sinew: 1 },
    set: {
      name: 'Sporeback', echoes: 'deathcloud',
      desc: 'Everything that kills leaves something behind.',
      mods: { aoeRadiusPct: 0.22, dotPct: 0.2, resist: 60 },
    },
  },

  // ---- Delvers: under the ground until they are not ----------------------
  sandlurker: {
    id: 'sandlurker', name: 'Sandlurker', family: 'delver', tier: 0, hunt: 'small',
    behaviour: 'ambusher', color: '#b39b6d',
    blurb: 'The ground you have been standing on for six seconds.',
    hp: 130, armor: 22, resist: 12, damage: 34, attackInterval: 1.6, range: 36,
    moveSpeed: 96, radius: 12, aggroRange: 170, xp: 15, packSize: [3, 6],
    parts: { hide: 4, claw: 3, fang: 1, sinew: 1 },
    set: {
      name: 'Sandlurker', echoes: 'ambusher',
      desc: 'The first strike out of nowhere is the one that counts.',
      mods: { critChance: 0.11, agility: 4 },
    },
  },
  grubtooth: {
    id: 'grubtooth', name: 'Grubtooth', family: 'delver', tier: 0, hunt: 'small',
    behaviour: 'burrower', color: '#9c8a72',
    blurb: 'Goes under the moment it is losing and comes back up behind you.',
    hp: 105, armor: 16, resist: 10, damage: 17, attackInterval: 1.2, range: 32,
    moveSpeed: 108, radius: 11, aggroRange: 290, xp: 11, packSize: [5, 8],
    parts: { hide: 4, fang: 2, marrow: 1, sinew: 1 },
    set: {
      name: 'Grubtooth', echoes: 'burrower',
      desc: 'Hard to pin down and harder to finish.',
      mods: { dodge: 0.09, vitality: 4 },
    },
  },
  dustmaw: {
    id: 'dustmaw', name: 'Dustmaw', family: 'delver', tier: 1, hunt: 'small',
    behaviour: 'burrower', color: '#a08b63',
    blurb: 'Takes a hero down with it and gives most of them back.',
    hp: 280, armor: 46, resist: 26, damage: 42, attackInterval: 1.5, range: 40,
    moveSpeed: 102, radius: 14, aggroRange: 330, xp: 34, packSize: [3, 5],
    parts: { hide: 4, claw: 3, marrow: 2, sinew: 1 },
    set: {
      name: 'Dustmaw', echoes: 'burrower',
      desc: 'Slips whatever was aimed at where you were.',
      mods: { dodge: 0.1, moveSpeedPct: 0.09, agility: 4 },
    },
  },
  hollowjaw: {
    id: 'hollowjaw', name: 'Hollowjaw', family: 'delver', tier: 1, hunt: 'small',
    behaviour: 'ambusher', color: '#79705f',
    blurb: 'Holds absolutely still until it is worth not doing.',
    hp: 250, armor: 54, resist: 30, damage: 60, attackInterval: 2.0, range: 42,
    moveSpeed: 88, radius: 14, aggroRange: 180, xp: 33, packSize: [3, 5],
    parts: { fang: 4, hide: 3, marrow: 1, sinew: 1 },
    set: {
      name: 'Hollowjaw', echoes: 'ambusher',
      desc: 'One enormous opening, paid for by everything after it.',
      mods: { critDamage: 0.38, might: 4 },
    },
  },
  siltcreeper: {
    id: 'siltcreeper', name: 'Siltcreeper', family: 'delver', tier: 2, hunt: 'small',
    behaviour: 'stalker', color: '#6e7a6b',
    blurb: 'Follows a squad for a full minute before deciding which one.',
    hp: 440, armor: 72, resist: 60, damage: 68, attackInterval: 1.6, range: 42,
    moveSpeed: 110, radius: 15, aggroRange: 460, xp: 63, packSize: [2, 4],
    parts: { hide: 4, claw: 3, gland: 2, marrow: 1, sinew: 1 },
    set: {
      name: 'Siltcreeper', echoes: 'stalker',
      desc: 'Made for the target nobody is protecting.',
      mods: { damagePct: 0.13, critChance: 0.08, agility: 5 },
    },
  },
  gravewurm: {
    id: 'gravewurm', name: 'Gravewurm', family: 'delver', tier: 2, hunt: 'small',
    behaviour: 'swarm', color: '#7b6a75',
    blurb: 'Comes up all at once, from everywhere, in a ring.',
    hp: 360, armor: 60, resist: 55, damage: 50, attackInterval: 1.1, range: 36,
    moveSpeed: 106, radius: 13, aggroRange: 360, xp: 56, packSize: [6, 10],
    parts: { hide: 4, marrow: 3, fang: 2, sinew: 1 },
    set: {
      name: 'Gravewurm', echoes: 'swarm',
      desc: 'Comfortable surrounded, which is where it puts you.',
      mods: { damagePct: 0.12, maxHpFlat: 70, armor: 40 },
    },
  },

  // ---- Mireborn: heavy, wet, and unpleasant to fight in ------------------
  slickfin: {
    id: 'slickfin', name: 'Slickfin', family: 'mireborn', tier: 0, hunt: 'small',
    behaviour: 'harry', color: '#5e8a86',
    blurb: 'Impossible to hold on to and entirely aware of it.',
    hp: 95, armor: 14, resist: 22, damage: 17, attackInterval: 0.95, range: 34,
    moveSpeed: 130, radius: 11, aggroRange: 310, xp: 11, packSize: [5, 8],
    parts: { hide: 4, scale: 3, tail: 1, sinew: 1 },
    set: {
      name: 'Slickfin', echoes: 'harry',
      desc: 'Nothing sticks, including you.',
      mods: { moveSpeedPct: 0.16, dodge: 0.06 },
    },
  },
  bogtusk: {
    id: 'bogtusk', name: 'Bogtusk', family: 'mireborn', tier: 1, hunt: 'small',
    behaviour: 'charger', color: '#6a6448',
    blurb: 'Builds up over open ground and arrives all at once.',
    hp: 380, armor: 80, resist: 30, damage: 58, attackInterval: 1.8, range: 46,
    moveSpeed: 100, radius: 16, aggroRange: 400, xp: 42, packSize: [3, 5],
    parts: { hide: 3, horn: 4, plate: 2, sinew: 1 },
    set: {
      name: 'Bogtusk', echoes: 'charger',
      desc: 'Weight behind everything, once it is moving.',
      mods: { might: 7, damagePct: 0.1, maxHpFlat: 60 },
    },
  },
  reedstalker: {
    id: 'reedstalker', name: 'Reedstalker', family: 'mireborn', tier: 1, hunt: 'small',
    behaviour: 'ambusher', color: '#6f8455',
    blurb: 'Stands in plain view for as long as it takes.',
    hp: 240, armor: 40, resist: 40, damage: 56, attackInterval: 1.9, range: 46,
    moveSpeed: 96, radius: 14, aggroRange: 200, xp: 32, packSize: [3, 5],
    parts: { hide: 4, tail: 2, claw: 2, gland: 1, sinew: 1 },
    set: {
      name: 'Reedstalker', echoes: 'ambusher',
      desc: 'Opens hard and gets through whatever is in the way.',
      mods: { critChance: 0.09, armorPen: 100, agility: 4 },
    },
  },
  tidemaw: {
    id: 'tidemaw', name: 'Tidemaw', family: 'mireborn', tier: 2, hunt: 'small',
    behaviour: 'leech', color: '#4f7d84',
    blurb: 'Grows visibly during a fight, on what it is taking from you.',
    hp: 500, armor: 76, resist: 74, damage: 58, attackInterval: 1.3, range: 40,
    moveSpeed: 96, radius: 16, aggroRange: 340, xp: 65, packSize: [2, 4],
    parts: { scale: 4, tail: 3, gland: 2, marrow: 1, sinew: 1 },
    set: {
      name: 'Tidemaw', echoes: 'leech',
      desc: 'A long fight is a winning one.',
      mods: { lifesteal: 0.15, maxHpFlat: 110, vitality: 6 },
    },
  },

  // ---- Carrionkin: they were already here, waiting for this --------------
  carrionwing: {
    id: 'carrionwing', name: 'Carrionwing', family: 'carrionkin', tier: 0, hunt: 'small',
    behaviour: 'flank', color: '#8b7f6e',
    blurb: 'Patient, and entirely willing to wait for somebody else to start.',
    hp: 100, armor: 12, resist: 16, damage: 19, attackInterval: 1.2, range: 34,
    moveSpeed: 124, radius: 11, aggroRange: 340, xp: 11, packSize: [4, 7],
    parts: { membrane: 4, hide: 3, claw: 1, sinew: 1 },
    set: {
      name: 'Carrionwing', echoes: 'flank',
      desc: 'Better positioned than whatever it is fighting.',
      mods: { critChance: 0.08, moveSpeedPct: 0.09 },
    },
  },
  bonepicker: {
    id: 'bonepicker', name: 'Bonepicker', family: 'carrionkin', tier: 0, hunt: 'small',
    behaviour: 'swarm', color: '#a49a86',
    blurb: 'Arrives at a kill in numbers and does not distinguish whose it was.',
    hp: 75, armor: 10, resist: 8, damage: 15, attackInterval: 0.9, range: 32,
    moveSpeed: 116, radius: 10, aggroRange: 300, xp: 9, packSize: [7, 11],
    parts: { hide: 4, fang: 2, marrow: 1, sinew: 1 },
    set: {
      name: 'Bonepicker', echoes: 'swarm',
      desc: 'Cheap, plentiful, and fine with a crowd.',
      mods: { damagePct: 0.09, attackSpeedPct: 0.09 },
    },
  },
  rotjaw: {
    id: 'rotjaw', name: 'Rotjaw', family: 'carrionkin', tier: 1, hunt: 'small',
    behaviour: 'venomous', color: '#7a7a4e',
    blurb: 'Has not cleaned its mouth in its entire life and knows what that does.',
    hp: 265, armor: 36, resist: 46, damage: 34, attackInterval: 1.35, range: 38,
    moveSpeed: 102, radius: 13, aggroRange: 320, xp: 31, packSize: [4, 6],
    parts: { fang: 4, hide: 3, gland: 2, sinew: 1 },
    set: {
      name: 'Rotjaw', echoes: 'venomous',
      desc: 'Infection as a strategy.',
      mods: { dotPct: 0.28, might: 4 },
    },
  },
  ghoulwing: {
    id: 'ghoulwing', name: 'Ghoulwing', family: 'carrionkin', tier: 2, hunt: 'small',
    behaviour: 'screamer', color: '#8e7c95',
    blurb: 'Calls every carrion eater within half a mile and then watches.',
    hp: 410, armor: 54, resist: 78, damage: 44, attackInterval: 1.7, range: 40,
    moveSpeed: 114, radius: 14, aggroRange: 520, xp: 57, packSize: [2, 4],
    parts: { membrane: 4, gland: 3, horn: 2, marrow: 1, sinew: 1 },
    set: {
      name: 'Ghoulwing', echoes: 'screamer',
      desc: 'Everything the wearer does, the squad does slightly better.',
      mods: { spirit: 5 }, aura: { damagePct: 0.09, critChance: 0.04 },
    },
  },
};

/**
 * Solo hunts. One monster, four to six carves, and every carve two grades
 * better than anything a pack drops — which is the entire argument for taking
 * one on with three heroes and no room for error.
 *
 * `abilities` reuse the shape the old bosses used: `ground` and `summon` and
 * `buff` are already understood by the sim. `cone`, `charge`, `dive` and `grab`
 * are named here because they are what the species *is*, and the monster brain
 * catches up with them in the AI batch. A species is not defined by what the
 * engine happens to implement this week.
 *
 * `prey` is the diet, most-preferred family first, and it is what decides
 * where the map puts the animal: a solo is placed near a pack species it
 * eats, not at a random angle on its ring. A ring draws its fauna weighted
 * toward the diets of the apexes that live in it, so the country a Skyrender
 * hunts over usually holds something for it to hunt. When nothing on its
 * list made the draw the animal settles for the nearest pack of anything —
 * an apex does not go hungry over a preference.
 */
export const LARGE_CREATURES = {
  bastionback: {
    id: 'bastionback', name: 'Bastionback', family: 'carapace', tier: 0, hunt: 'solo',
    prey: ['delver', 'venomite', 'carapace'],
    behaviour: 'retaliate', color: '#7f7a68',
    blurb: 'The hunt everyone takes first. It will not chase you and it will not '
      + 'kill you quickly. It will simply refuse to die until you have learned '
      + 'to stop hitting the plate.',
    hp: 6000, armor: 260, resist: 90, damage: 96, attackInterval: 2.4, range: 74,
    cleave: 90, moveSpeed: 62, radius: 30, aggroRange: 420, xp: 420,
    abilities: [
      { id: 'stomp', kind: 'ground', cooldown: 10, radius: 200, damage: 130, telegraph: 1.6 },
      { id: 'hunker', kind: 'buff', cooldown: 30, duration: 8, mods: { armor: 200, damageTakenPct: -0.25 } },
    ],
    parts: { plate: 5, scale: 3, horn: 2, marrow: 2, sinew: 3 },
    set: {
      name: 'Bastionback', echoes: 'retaliate',
      desc: 'The first real armour anyone owns, and still worth wearing much later.',
      mods: { armor: 220, damageTakenPct: -0.12, vitality: 12, blockChance: 0.1 },
    },
  },
  tyrannoclast: {
    id: 'tyrannoclast', name: 'Tyrannoclast', family: 'tyrant', tier: 1, hunt: 'solo',
    prey: ['raptorial', 'carapace', 'mireborn'],
    behaviour: 'charger', color: '#9d5540',
    blurb: 'Roars first, which is the only warning you get and the only one you need. '
      + 'Then it picks a straight line through the squad and takes it.',
    hp: 8500, armor: 200, resist: 110, damage: 150, attackInterval: 2.0, range: 82,
    cleave: 130, moveSpeed: 92, radius: 34, aggroRange: 560, xp: 760,
    abilities: [
      { id: 'charge', kind: 'charge', cooldown: 13, distance: 620, width: 120, damage: 220, telegraph: 1.3 },
      { id: 'roar', kind: 'roar', cooldown: 26, radius: 420, stagger: 1.4, telegraph: 0.6,
        mods: { damagePct: 0.3, attackSpeedPct: 0.2 }, duration: 10 },
      { id: 'stomp', kind: 'ground', cooldown: 9, radius: 190, damage: 170, telegraph: 1.2 },
    ],
    parts: { plate: 4, horn: 4, fang: 3, marrow: 2, hide: 2, sinew: 3 },
    set: {
      name: 'Tyrannoclast', echoes: 'charger',
      desc: 'Committed, straight-line violence. Nothing about it is defensive.',
      mods: { might: 14, damagePct: 0.18, armorPen: 140, moveSpeedPct: 0.08 },
    },
  },
  glaciermaw: {
    id: 'glaciermaw', name: 'Glaciermaw', family: 'wyrm', tier: 1, hunt: 'solo',
    prey: ['mireborn', 'carapace', 'delver'],
    behaviour: 'breath', color: '#7fc6dd',
    blurb: 'Does not need to be fast. Everything in front of it stops being fast instead.',
    hp: 8000, armor: 150, resist: 220, damage: 130, attackInterval: 2.2, range: 78,
    moveSpeed: 74, radius: 32, aggroRange: 540, xp: 740, school: 'magic',
    abilities: [
      { id: 'frostbreath', kind: 'cone', cooldown: 12, length: 430, arc: 58, damage: 190,
        school: 'magic', telegraph: 1.7, applies: { status: 'chill', duration: 5, mods: { moveSpeedPct: -0.45 } } },
      { id: 'shatter', kind: 'ground', cooldown: 10, radius: 220, damage: 160, school: 'magic', telegraph: 1.5 },
    ],
    parts: { scale: 5, horn: 3, gland: 3, marrow: 2, sinew: 3 },
    set: {
      name: 'Glaciermaw', echoes: 'breath',
      desc: 'Wide, slow, unavoidable damage, and the resist to stand in your own.',
      mods: { aoeRadiusPct: 0.28, resist: 150, spirit: 10 },
    },
  },
  deepdelver: {
    id: 'deepdelver', name: 'Deepdelver', family: 'delver', tier: 1, hunt: 'solo',
    prey: ['delver', 'venomite', 'carrionkin'],
    behaviour: 'burrower', color: '#8a7355',
    blurb: 'Spends half the fight underneath the fight. The half it is present for '
      + 'is spent directly beneath whoever was least ready.',
    hp: 8800, armor: 190, resist: 120, damage: 140, attackInterval: 2.1, range: 76,
    moveSpeed: 86, radius: 33, aggroRange: 500, xp: 780,
    abilities: [
      { id: 'submerge', kind: 'buff', cooldown: 20, duration: 4, mods: { dodge: 0.8, moveSpeedPct: 0.6 } },
      { id: 'erupt', kind: 'ground', cooldown: 11, radius: 210, damage: 200, telegraph: 1.1 },
      { id: 'brood', kind: 'summon', cooldown: 28, spawn: 'gravewurm', count: 3, maxAlive: 5,
        lifespan: 60, telegraph: 0.9 },
    ],
    parts: { hide: 4, claw: 4, marrow: 3, plate: 2, sinew: 3 },
    set: {
      name: 'Deepdelver', echoes: 'burrower',
      desc: 'Never quite where the answer lands.',
      mods: { dodge: 0.16, moveSpeedPct: 0.12, agility: 10, vitality: 8 },
    },
  },
  mirethane: {
    id: 'mirethane', name: 'Mirethane', family: 'mireborn', tier: 1, hunt: 'solo',
    prey: ['mireborn', 'venomite', 'wyverling'],
    behaviour: 'grapple', color: '#5b7a5f',
    blurb: 'Takes one hero out of the fight and dares the other two to be quick about it.',
    hp: 9200, armor: 210, resist: 140, damage: 135, attackInterval: 2.0, range: 80,
    moveSpeed: 78, radius: 34, aggroRange: 520, xp: 800,
    abilities: [
      { id: 'seize', kind: 'grab', cooldown: 16, range: 220, holdSeconds: 3,
        crushPerSecond: 0.05, telegraph: 1.0 },
      { id: 'bilespray', kind: 'cone', cooldown: 13, length: 340, arc: 70, damage: 150,
        telegraph: 1.4, applies: { status: 'blight', duration: 8 } },
      { id: 'stomp', kind: 'ground', cooldown: 10, radius: 200, damage: 165, telegraph: 1.3 },
    ],
    parts: { scale: 4, tail: 4, gland: 3, plate: 2, marrow: 2, sinew: 3 },
    set: {
      name: 'Mirethane', echoes: 'grapple',
      desc: 'Holds what it has hold of, and is very hard to move off it.',
      mods: { might: 12, blockChance: 0.12, armor: 140, damageTakenPct: -0.08 },
    },
  },
  skyrender: {
    id: 'skyrender', name: 'Skyrender', family: 'wyvern', tier: 2, hunt: 'solo',
    prey: ['wyverling', 'raptorial', 'carapace'],
    behaviour: 'divebomb', color: '#6e86c4',
    blurb: 'Leaves the ground for whole stretches of the fight, which is worse. '
      + 'It comes back down on somebody specific.',
    hp: 11000, armor: 170, resist: 180, damage: 165, attackInterval: 1.9, range: 84,
    moveSpeed: 104, radius: 33, aggroRange: 620, xp: 1150,
    abilities: [
      { id: 'ascend', kind: 'buff', cooldown: 22, duration: 4, mods: { dodge: 0.9, moveSpeedPct: 0.9 } },
      { id: 'dive', kind: 'dive', cooldown: 18, radius: 240, damage: 340, telegraph: 1.6 },
      { id: 'gale', kind: 'cone', cooldown: 12, length: 400, arc: 65, damage: 180, telegraph: 1.2 },
    ],
    parts: { membrane: 5, claw: 4, horn: 3, marrow: 2, hide: 2, sinew: 3 },
    set: {
      name: 'Skyrender', echoes: 'divebomb',
      desc: 'One enormous committed blow, over and over.',
      mods: { critDamage: 0.5, agility: 12, moveSpeedPct: 0.1, cooldownPct: 0.1 },
    },
  },
  pyroclast: {
    id: 'pyroclast', name: 'Pyroclast', family: 'wyrm', tier: 2, hunt: 'solo',
    prey: ['carapace', 'delver', 'raptorial'],
    behaviour: 'breath', color: '#e0713c',
    blurb: 'Makes most of the arena unusable and then waits in what is left.',
    hp: 12000, armor: 190, resist: 200, damage: 175, attackInterval: 2.1, range: 86,
    moveSpeed: 80, radius: 35, aggroRange: 600, xp: 1250, school: 'magic',
    abilities: [
      { id: 'firebreath', kind: 'cone', cooldown: 11, length: 460, arc: 60, damage: 240,
        school: 'magic', telegraph: 1.5, applies: { status: 'burn', duration: 6 } },
      { id: 'magma', kind: 'ground', cooldown: 9, radius: 240, damage: 200, school: 'magic',
        telegraph: 1.4, lingerSeconds: 8 },
      { id: 'enrage', kind: 'buff', cooldown: 45, duration: 12, mods: { damagePct: 0.4, attackSpeedPct: 0.25 } },
    ],
    parts: { scale: 5, gland: 4, horn: 3, marrow: 2, plate: 2, sinew: 3 },
    set: {
      name: 'Pyroclast', echoes: 'breath',
      desc: 'Area damage as a primary weapon rather than a bonus.',
      mods: { aoeRadiusPct: 0.34, dotPct: 0.3, spirit: 12, resist: 90 },
    },
  },
  venomcoil: {
    id: 'venomcoil', name: 'Venomcoil', family: 'wyrm', tier: 2, hunt: 'solo',
    prey: ['venomite', 'mireborn', 'delver'],
    behaviour: 'constrict', color: '#8bab4a',
    blurb: 'Wraps around whoever is closest and does not hurry. Everything it '
      + 'has already put in you is doing the work.',
    hp: 11500, armor: 160, resist: 210, damage: 155, attackInterval: 1.8, range: 80,
    moveSpeed: 90, radius: 32, aggroRange: 580, xp: 1200,
    abilities: [
      { id: 'coil', kind: 'grab', cooldown: 20, range: 260, holdSeconds: 4,
        crushPerSecond: 0.06, telegraph: 1.2 },
      { id: 'venomspray', kind: 'cone', cooldown: 12, length: 420, arc: 75, damage: 170,
        telegraph: 1.3, applies: { status: 'venom', duration: 12 } },
      { id: 'brood', kind: 'summon', cooldown: 26, spawn: 'mirefang', count: 3, maxAlive: 6,
        lifespan: 60, telegraph: 0.8 },
    ],
    parts: { scale: 5, fang: 4, gland: 4, tail: 3, marrow: 2, sinew: 3 },
    set: {
      name: 'Venomcoil', echoes: 'constrict',
      desc: 'Damage that arrives later and cannot be blocked when it does.',
      mods: { dotPct: 0.42, lifesteal: 0.1, agility: 10 },
    },
  },
  stormcrest: {
    id: 'stormcrest', name: 'Stormcrest', family: 'wyvern', tier: 2, hunt: 'solo',
    prey: ['wyverling', 'carrionkin', 'delver'],
    behaviour: 'spitter', color: '#b79ae8',
    blurb: 'Never closes and never stops. Killing it is a question of whether you '
      + 'can cross open ground faster than it can leave.',
    hp: 12500, armor: 150, resist: 240, damage: 160, attackInterval: 1.5, range: 300,
    projectile: true, projectileSpeed: 620, school: 'magic',
    moveSpeed: 112, radius: 32, aggroRange: 660, xp: 1300,
    abilities: [
      { id: 'arcstorm', kind: 'ground', cooldown: 10, radius: 250, damage: 210,
        school: 'magic', telegraph: 1.2, lingerSeconds: 6 },
      { id: 'reposition', kind: 'buff', cooldown: 16, duration: 3, mods: { moveSpeedPct: 1.1, dodge: 0.4 } },
      { id: 'chainbolt', kind: 'cone', cooldown: 9, length: 480, arc: 30, damage: 190,
        school: 'magic', telegraph: 0.9 },
    ],
    parts: { membrane: 5, gland: 4, horn: 3, scale: 3, marrow: 2, sinew: 3 },
    set: {
      name: 'Stormcrest', echoes: 'spitter',
      desc: 'Reach, and the cooldowns to keep using it.',
      mods: { rangeBonus: 90, cooldownPct: 0.18, spirit: 12, attackSpeedPct: 0.12 },
    },
  },
  nightfell: {
    id: 'nightfell', name: 'Nightfell', family: 'elder', tier: 2, hunt: 'solo',
    prey: ['raptorial', 'wyverling', 'carapace', 'venomite', 'delver', 'mireborn', 'carrionkin'],
    apex: true, color: '#c6a2f0',
    behaviour: 'roar',
    blurb: 'The only one of them that appears to be choosing. It does everything '
      + 'the others do, in an order that seems to be about you.',
    hp: 16000, armor: 240, resist: 240, damage: 190, attackInterval: 1.9, range: 88,
    cleave: 140, moveSpeed: 96, radius: 38, aggroRange: 700, xp: 2000,
    abilities: [
      { id: 'roar', kind: 'roar', cooldown: 24, radius: 460, stagger: 1.6, telegraph: 0.7,
        mods: { damagePct: 0.35, attackSpeedPct: 0.25 }, duration: 12 },
      { id: 'voidbreath', kind: 'cone', cooldown: 12, length: 480, arc: 62, damage: 260,
        school: 'magic', telegraph: 1.5 },
      { id: 'collapse', kind: 'ground', cooldown: 9, radius: 260, damage: 250, telegraph: 1.3 },
      { id: 'brood', kind: 'summon', cooldown: 26, spawn: 'ghoulwing', count: 2, maxAlive: 4,
        lifespan: 60, telegraph: 1.0 },
    ],
    parts: { plate: 4, membrane: 4, horn: 4, gland: 3, marrow: 4, sinew: 3 },
    set: {
      name: 'Nightfell', echoes: 'roar',
      desc: 'The set the whole roster is built around, and the only one worth three hunts.',
      mods: { might: 10, spirit: 10, damagePct: 0.16, critChance: 0.08, resist: 100 },
      aura: { damagePct: 0.1, damageTakenPct: -0.06 },
    },
  },
};

/**
 * The three that walk.
 *
 * Everything else on the map is somewhere. A camp is a place, a solo ground is
 * a place, and the whole of `src/sim/map.js` is about deciding which places.
 * These three are not placed at all: they arrive on the clock — at twenty,
 * fifteen and ten minutes left — and then patrol a circuit, deeper each time,
 * so the danger closes in as the raid runs down rather than waiting where it
 * was put.
 *
 * They are solo hunts by every other measure — one creature, four to six
 * carves, a trophy and a class — but they are the one kind you cannot order a
 * hunt for (see `kindsForSpecies`). There is nowhere to send a squad: the
 * answer to "where is the Duskherald" changes every ten seconds, and an order
 * that resolves to a moving point is a chase, not a hunt. You meet these
 * because they came looking.
 */
export const WALKING_CREATURES = {
  cairnwalker: {
    id: 'cairnwalker', name: 'Cairnwalker', family: 'harrow', tier: 1, hunt: 'solo',
    walks: true, arrivesAt: 600, ringFrom: 0.27, ringTo: 0.48,
    behaviour: 'relentless', color: '#8ea89c',
    blurb: 'Sets off when the raid is half gone and does not stop again. You do '
      + 'not lose it; you only ever get further ahead of it for a while.',
    hp: 7000, armor: 230, resist: 100, damage: 120, attackInterval: 2.2, range: 72,
    moveSpeed: 92, radius: 30, aggroRange: 560, xp: 720,
    abilities: [
      { id: 'footfall', kind: 'ground', cooldown: 10, radius: 210, damage: 150, telegraph: 1.3 },
      { id: 'gather', kind: 'buff', cooldown: 30, duration: 10, mods: { moveSpeedPct: 0.3, damagePct: 0.2 } },
    ],
    parts: { plate: 5, horn: 3, marrow: 2, hide: 3, sinew: 3 },
    set: {
      name: 'Cairnwalker', echoes: 'relentless',
      desc: 'Rewards never having stopped. Everything is worth more while you are moving.',
      mods: { moveSpeedPct: 0.16, damagePct: 0.12, maxHpFlat: 70, armor: 40 },
    },
  },
  sablemarch: {
    id: 'sablemarch', name: 'Sablemarch', family: 'harrow', tier: 2, hunt: 'solo',
    walks: true, arrivesAt: 900, ringFrom: 0.19, ringTo: 0.45,
    behaviour: 'sunder', color: '#7d8248',
    blurb: 'Nothing it walks past is quite as whole afterwards. Plate least of all.',
    hp: 10500, armor: 160, resist: 190, damage: 155, attackInterval: 2.0, range: 80,
    moveSpeed: 86, radius: 33, aggroRange: 600, xp: 1050, school: 'magic',
    abilities: [
      { id: 'corrode', kind: 'ground', cooldown: 9, radius: 250, damage: 190, school: 'magic',
        telegraph: 1.4, lingerSeconds: 7 },
      { id: 'blacken', kind: 'buff', cooldown: 34, duration: 12, mods: { armorPen: 240, damagePct: 0.25 } },
    ],
    parts: { gland: 5, scale: 4, claw: 3, marrow: 2, hide: 2, sinew: 3 },
    set: {
      name: 'Sablemarch', echoes: 'sunder',
      desc: 'Goes through armour rather than around it, and keeps going afterwards.',
      mods: { armorPen: 150, damagePct: 0.14, dotPct: 0.2, resist: 45 },
    },
  },
  duskherald: {
    id: 'duskherald', name: 'Duskherald', family: 'harrow', tier: 2, hunt: 'solo',
    walks: true, arrivesAt: 1200, ringFrom: 0.12, ringTo: 0.42,
    behaviour: 'roar', color: '#b8577f',
    blurb: 'Announces itself once, from a long way off, and then takes its time. '
      + 'Whatever comes with it heard the same call you did.',
    hp: 14000, armor: 220, resist: 220, damage: 180, attackInterval: 1.9, range: 86,
    moveSpeed: 96, radius: 36, aggroRange: 680, xp: 1500,
    abilities: [
      { id: 'muster', kind: 'summon', cooldown: 26, spawn: 'bloodcrest', count: 3, maxAlive: 6, lifespan: 90 },
      { id: 'proclaim', kind: 'ground', cooldown: 11, radius: 280, damage: 220, telegraph: 1.5 },
      { id: 'ascendancy', kind: 'buff', cooldown: 40, duration: 14, mods: { damagePct: 0.3, attackSpeedPct: 0.2, armor: 90 } },
    ],
    parts: { plate: 5, horn: 4, marrow: 3, fang: 3, membrane: 2, sinew: 3 },
    set: {
      name: 'Duskherald', echoes: 'roar',
      desc: 'What the rest of the squad gets out of you being on the field.',
      mods: { might: 8, armor: 60, damagePct: 0.1, cooldownPct: 0.08 },
      aura: { damagePct: 0.07, armor: 35, moveSpeedPct: 0.05 },
    },
  },
};

export const CREATURES = { ...SMALL_CREATURES, ...LARGE_CREATURES, ...WALKING_CREATURES };
export const SMALL_IDS = Object.keys(SMALL_CREATURES);
export const LARGE_IDS = Object.keys(LARGE_CREATURES);

/** The ones that arrive on the clock and walk, rather than being placed. */
export const WALKING_IDS = Object.keys(WALKING_CREATURES);

/**
 * Every solo hunt, whichever table it lives in.
 *
 * Anything asking "is this one of the big ones?" wants this and not
 * LARGE_IDS — the split between the two tables is about how a creature gets
 * onto the map, not about how big it is. The sprite baker asked LARGE_IDS and
 * so baked the three largest creatures in the game into the small 88-pixel
 * cell meant for a Skiterling.
 */
export const SOLO_IDS = Object.values(CREATURES)
  .filter((c) => c.hunt === 'solo').map((c) => c.id);
export const isWalker = (speciesId) => !!CREATURES[speciesId]?.walks;

/** Every species, whichever table it lives in. */
export const creatureById = (id) => CREATURES[id] ?? null;

/** Species of a given hunt kind, optionally capped to a danger tier. */
export const speciesFor = (hunt, maxTier = 2) =>
  Object.values(CREATURES).filter((c) => c.hunt === hunt && c.tier <= maxTier);
