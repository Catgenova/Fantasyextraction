// Every hero class. Everything a hero is made of starts here: base attributes,
// growth per level, the shape of their auto-attack, and which skill tree /
// spell pool they draw from.
//
// Three classes are available from the first raid. The other twenty-three are
// locked behind a solo kill each — see `src/data/achievements.js` for that
// mapping.
// `shape` is the silhouette the renderer draws, so roles stay readable from
// the top down without a legend.

export const CLASSES = {
  knight: {
    id: 'knight',
    name: 'Knight',
    role: 'Frontline',
    color: '#d8b25a',
    blurb:
      'Holds the line. Soaks damage, peels for the backline, and punishes anyone who walks into melee.',
    // Primary attributes at level 1.
    base: { might: 14, agility: 6, spirit: 5, vitality: 16 },
    growth: { might: 1.5, agility: 0.5, spirit: 0.4, vitality: 2.0 },
    powerAttr: 'might',
    shape: 'shield',
    baseArmor: 90,
    baseResist: 40,
    moveSpeed: 96,
    // Auto-attack profile.
    attack: {
      kind: 'melee',
      range: 46,
      interval: 1.5, // seconds between swings before haste
      damage: 12,
      scaling: { attackPower: 0.9 },
      school: 'physical',
    },
    preferredWeapons: ['sword', 'mace'],
    startingSpells: ['shield_bash', 'taunt'],
  },

  archer: {
    id: 'archer',
    name: 'Archer',
    role: 'Ranged DPS',
    color: '#6fd08c',
    blurb:
      'Deletes priority targets from range. Fragile up close — wants distance and a frontline to hide behind.',
    base: { might: 8, agility: 16, spirit: 6, vitality: 9 },
    growth: { might: 0.8, agility: 1.9, spirit: 0.5, vitality: 1.0 },
    powerAttr: 'agility',
    shape: 'chevron',
    baseArmor: 40,
    baseResist: 30,
    moveSpeed: 112,
    attack: {
      kind: 'projectile',
      range: 280,
      interval: 1.15,
      damage: 10,
      scaling: { attackPower: 0.8 },
      school: 'physical',
      projectileSpeed: 520,
    },
    preferredWeapons: ['bow'],
    startingSpells: ['power_shot', 'volley'],
  },

  priest: {
    id: 'priest',
    name: 'Priest',
    role: 'Support',
    color: '#8db4ff',
    blurb:
      'Keeps the squad alive through attrition. Sustain, shields, and enough smite damage to not be dead weight.',
    base: { might: 6, agility: 7, spirit: 17, vitality: 10 },
    growth: { might: 0.4, agility: 0.6, spirit: 2.0, vitality: 1.1 },
    powerAttr: 'spirit',
    shape: 'disc',
    baseArmor: 35,
    baseResist: 60,
    moveSpeed: 104,
    attack: {
      kind: 'projectile',
      range: 220,
      interval: 1.6,
      damage: 8,
      scaling: { spellPower: 0.8 },
      school: 'magic',
      projectileSpeed: 380,
    },
    preferredWeapons: ['staff'],
    startingSpells: ['mend', 'smite'],
  },

  // ==========================================================================
  // Locked behind a boss kill. Each is a variation on an existing role rather
  // than a strictly better one — the Berserker hits harder than the Knight and
  // dies faster for it, the Slayer trades sustained damage for burst against
  // whatever is biggest on the field.
  // ==========================================================================

  rogue: {
    id: 'rogue',
    name: 'Rogue',
    role: 'Melee burst',
    color: '#9aa7b8',
    blurb:
      'Kills one thing very fast and leaves. Fast light hits that live on crits, and the mobility to pick which fight to be in.',
    base: { might: 8, agility: 17, spirit: 5, vitality: 9 },
    growth: { might: 0.7, agility: 2.0, spirit: 0.4, vitality: 1.0 },
    powerAttr: 'agility',
    shape: 'chevron',
    baseArmor: 45,
    baseResist: 25,
    moveSpeed: 118,
    attack: {
      kind: 'melee',
      range: 44,
      interval: 0.95,
      damage: 8,
      scaling: { attackPower: 0.72 },
      school: 'physical',
    },
    preferredWeapons: ['dagger'],
    startingSpells: ['eviscerate', 'shadowstep'],
  },

  berserker: {
    id: 'berserker',
    name: 'Berserker',
    role: 'Melee bruiser',
    color: '#c1553f',
    blurb:
      'Trades armour for damage and heals by taking heads. Gets more dangerous the closer to death it gets, which is the whole problem.',
    base: { might: 17, agility: 8, spirit: 4, vitality: 14 },
    growth: { might: 2.0, agility: 0.7, spirit: 0.3, vitality: 1.6 },
    powerAttr: 'might',
    shape: 'spike',
    baseArmor: 60,
    baseResist: 30,
    moveSpeed: 102,
    attack: {
      kind: 'melee',
      range: 48,
      interval: 1.35,
      damage: 14,
      scaling: { attackPower: 1.0 },
      school: 'physical',
    },
    preferredWeapons: ['greataxe'],
    startingSpells: ['reckless_swing', 'frenzy'],
  },

  slayer: {
    id: 'slayer',
    name: 'Slayer',
    role: 'Elite hunter',
    color: '#b8863f',
    blurb:
      'Built for the one thing on the field with a health bar worth reading. Slow swings, enormous ones, and armour that stops mattering.',
    base: { might: 16, agility: 10, spirit: 4, vitality: 13 },
    growth: { might: 1.8, agility: 0.9, spirit: 0.3, vitality: 1.5 },
    powerAttr: 'might',
    shape: 'spike',
    baseArmor: 70,
    baseResist: 45,
    moveSpeed: 100,
    attack: {
      kind: 'melee',
      range: 52,
      interval: 1.6,
      damage: 15,
      scaling: { attackPower: 1.05 },
      school: 'physical',
    },
    preferredWeapons: ['greatsword'],
    startingSpells: ['sunder', 'giantsbane'],
  },

  paladin: {
    id: 'paladin',
    name: 'Paladin',
    role: 'Frontline support',
    color: '#e6d38a',
    blurb:
      'A wall that heals. Less raw mitigation than a Knight, but it pays the squad back in health and never needs a Priest behind it.',
    base: { might: 13, agility: 5, spirit: 11, vitality: 15 },
    growth: { might: 1.3, agility: 0.4, spirit: 1.1, vitality: 1.8 },
    powerAttr: 'might',
    shape: 'shield',
    baseArmor: 85,
    baseResist: 60,
    moveSpeed: 94,
    attack: {
      kind: 'melee',
      range: 46,
      interval: 1.55,
      damage: 12,
      scaling: { attackPower: 0.7, spellPower: 0.25 },
      school: 'physical',
    },
    preferredWeapons: ['mace'],
    startingSpells: ['consecrate', 'lay_on_hands'],
  },

  necromancer: {
    id: 'necromancer',
    name: 'Necromancer',
    role: 'Attrition caster',
    color: '#7fae7a',
    blurb:
      'Wins fights that last. Rots targets from range and turns their dying into its own health — weak burst, endless staying power.',
    base: { might: 5, agility: 7, spirit: 17, vitality: 10 },
    growth: { might: 0.3, agility: 0.5, spirit: 2.0, vitality: 1.2 },
    powerAttr: 'spirit',
    shape: 'disc',
    baseArmor: 30,
    baseResist: 55,
    moveSpeed: 100,
    attack: {
      kind: 'projectile',
      range: 230,
      interval: 1.7,
      damage: 8,
      scaling: { spellPower: 0.85 },
      school: 'magic',
      projectileSpeed: 340,
    },
    preferredWeapons: ['runestaff'],
    startingSpells: ['bone_spear', 'corrupt'],
  },

  ice_mage: {
    id: 'ice_mage',
    name: 'Ice Mage',
    role: 'Control caster',
    color: '#7fd4e8',
    blurb:
      'Decides how fast a fight comes to you. Slows, freezes and area damage — the squad it protects does the killing.',
    base: { might: 5, agility: 8, spirit: 17, vitality: 9 },
    growth: { might: 0.3, agility: 0.6, spirit: 1.95, vitality: 1.1 },
    powerAttr: 'spirit',
    shape: 'disc',
    baseArmor: 32,
    baseResist: 58,
    moveSpeed: 100,
    attack: {
      kind: 'projectile',
      range: 250,
      interval: 1.6,
      damage: 9,
      scaling: { spellPower: 0.85 },
      school: 'magic',
      projectileSpeed: 400,
    },
    preferredWeapons: ['runestaff'],
    startingSpells: ['frostbolt', 'frost_nova'],
  },

  fire_mage: {
    id: 'fire_mage',
    name: 'Fire Mage',
    role: 'Burst caster',
    color: '#f08050',
    blurb:
      'The most damage in the game and the least health to protect it. Deletes packs at range and dies to anything that reaches it.',
    base: { might: 6, agility: 8, spirit: 18, vitality: 8 },
    growth: { might: 0.3, agility: 0.6, spirit: 2.1, vitality: 0.9 },
    powerAttr: 'spirit',
    shape: 'disc',
    baseArmor: 28,
    baseResist: 50,
    moveSpeed: 100,
    attack: {
      kind: 'projectile',
      range: 240,
      interval: 1.75,
      damage: 11,
      scaling: { spellPower: 0.95 },
      school: 'magic',
      projectileSpeed: 420,
    },
    preferredWeapons: ['runestaff'],
    startingSpells: ['fireball', 'ignite'],
  },

  lightning_mage: {
    id: 'lightning_mage',
    name: 'Lightning Mage',
    role: 'Sustained caster',
    color: '#c9a8ff',
    blurb:
      'Small hits, constantly, from further than anything else can answer. Wants haste and cooldown reduction more than raw power.',
    base: { might: 5, agility: 10, spirit: 17, vitality: 8 },
    growth: { might: 0.3, agility: 0.8, spirit: 1.9, vitality: 0.9 },
    powerAttr: 'spirit',
    shape: 'disc',
    baseArmor: 26,
    baseResist: 52,
    moveSpeed: 106,
    attack: {
      kind: 'projectile',
      range: 260,
      interval: 1.25,
      damage: 7,
      scaling: { spellPower: 0.62 },
      school: 'magic',
      projectileSpeed: 640,
    },
    preferredWeapons: ['runestaff'],
    startingSpells: ['arc_bolt', 'thunderclap'],
  },
  warden: {
    id: 'warden',
    name: 'Warden',
    role: 'Melee control',
    color: '#6f9a7e',
    blurb:
      'Decides where a fight happens. Snares, hooks and holds — it does less damage than anything else in melee and takes away the option of leaving.',
    base: { might: 12, agility: 8, spirit: 6, vitality: 15 },
    growth: { might: 1.3, agility: 0.7, spirit: 0.5, vitality: 1.8 },
    powerAttr: 'might',
    shape: 'shield',
    baseArmor: 78,
    baseResist: 45,
    moveSpeed: 98,
    attack: {
      kind: 'melee',
      range: 54,
      interval: 1.5,
      damage: 12,
      scaling: { attackPower: 0.85 },
      school: 'physical',
    },
    preferredWeapons: ['tail'],
    startingSpells: ['snare', 'grapnel'],
  },

  // ------------------------------------------------------------------------
  // The three taught by the walkers. Each one is the lesson of a creature that
  // came to you rather than waited: never stopping, what gets left behind, and
  // what a field is worth to whoever is still standing on it.

  monk: {
    id: 'monk',
    name: 'Monk',
    role: 'Melee DPS',
    color: '#7ec8b8',
    blurb:
      'Carries nothing and stops for nothing. Hits fast, hits faster the longer it has been moving, and is the only one on the field with both hands free.',
    base: { might: 11, agility: 15, spirit: 9, vitality: 12 },
    growth: { might: 1.1, agility: 1.7, spirit: 0.7, vitality: 1.3 },
    powerAttr: 'agility',
    shape: 'spike',
    baseArmor: 52,
    baseResist: 58,
    moveSpeed: 124,
    attack: {
      kind: 'melee',
      range: 40,
      interval: 0.9,
      damage: 9,
      scaling: { attackPower: 0.72 },
      school: 'physical',
    },
    preferredWeapons: ['claw', 'fang'],
    startingSpells: ['flurry', 'windstep'],
  },

  alchemist: {
    id: 'alchemist',
    name: 'Alchemist',
    role: 'Ranged control',
    color: '#b9c24e',
    blurb:
      'Wins fights that have already finished. Throws things that keep working, takes armour apart from the outside in, and keeps the squad upright between doses.',
    base: { might: 6, agility: 10, spirit: 15, vitality: 10 },
    growth: { might: 0.4, agility: 0.9, spirit: 1.9, vitality: 1.1 },
    powerAttr: 'spirit',
    shape: 'disc',
    baseArmor: 42,
    baseResist: 52,
    moveSpeed: 108,
    attack: {
      kind: 'projectile',
      range: 240,
      interval: 1.4,
      damage: 9,
      scaling: { spellPower: 0.75 },
      school: 'magic',
      projectileSpeed: 420,
    },
    preferredWeapons: ['gland', 'staff'],
    startingSpells: ['acid_flask', 'tonic'],
  },

  warlord: {
    id: 'warlord',
    name: 'Warlord',
    role: 'Command',
    color: '#e0789c',
    blurb:
      'Worth more to the other two than to itself. Everything it does is a squad-wide number, and it stands where the squad has to be anyway.',
    base: { might: 15, agility: 7, spirit: 10, vitality: 14 },
    growth: { might: 1.5, agility: 0.6, spirit: 0.9, vitality: 1.7 },
    powerAttr: 'might',
    shape: 'shield',
    baseArmor: 80,
    baseResist: 48,
    moveSpeed: 100,
    attack: {
      kind: 'melee',
      range: 50,
      interval: 1.4,
      damage: 12,
      scaling: { attackPower: 0.85 },
      school: 'physical',
    },
    preferredWeapons: ['sword', 'horn'],
    startingSpells: ['rally', 'cleave'],
  },

  lancer: {
    id: 'lancer',
    name: 'Lancer',
    role: 'Reach fighter',
    color: '#8fb3d9',
    blurb:
      'Fights from further out than a melee has any right to, closes the last of it in one movement, and is not there when the answer arrives.',
    base: { might: 14, agility: 11, spirit: 5, vitality: 12 },
    growth: { might: 1.6, agility: 1.0, spirit: 0.4, vitality: 1.4 },
    powerAttr: 'might',
    shape: 'spike',
    baseArmor: 72,
    baseResist: 40,
    moveSpeed: 106,
    attack: {
      kind: 'melee',
      range: 66,
      interval: 1.45,
      damage: 13,
      scaling: { attackPower: 0.95 },
      school: 'physical',
    },
    preferredWeapons: ['tail', 'horn'],
    startingSpells: ['lunge', 'vault'],
  },
  // ---- The second ten -------------------------------------------------------
  //
  // Ten more, one per new solo kill. Each was written against a mechanical hook
  // the first sixteen did not already own, because a class that plays like one
  // you have is an unlock that reads as a reward and behaves as a duplicate.
  // The hooks, in order: ground control, a companion, squad-wide standing
  // buffs, punishing the swing, stripping the advantage, work done in advance,
  // damage that pays late, armour removal, hit-and-run, and not moving at all.
  druid: {
    id: 'druid',
    name: 'Druid',
    role: 'Ground control',
    color: '#6f9c5e',
    blurb:
      'Decides where the fight happens and then makes everywhere else worse. Heals '
      + 'slowly and continuously rather than in a lump, so it wins long fights.',
    base: { might: 8, agility: 9, spirit: 15, vitality: 13 },
    growth: { might: 0.7, agility: 0.9, spirit: 1.8, vitality: 1.4 },
    powerAttr: 'spirit',
    shape: 'disc',
    baseArmor: 50,
    baseResist: 78,
    moveSpeed: 100,
    attack: { kind: 'projectile', range: 230, interval: 1.7, damage: 9, scaling: { attackPower: 0.7 }, school: 'magic', projectileSpeed: 420 },
    preferredWeapons: ['gland', 'horn'],
    startingSpells: ['bramble', 'regrowth'],
  },

  beastmaster: {
    id: 'beastmaster',
    name: 'Beastmaster',
    role: 'Ranged DPS',
    color: '#b08040',
    blurb:
      'Hunts the way the things on this map hunt: from further out than anything '
      + 'else can answer, and never at full health. Nothing it hits stops bleeding.',
    base: { might: 10, agility: 14, spirit: 10, vitality: 12 },
    growth: { might: 1.0, agility: 1.6, spirit: 1.0, vitality: 1.2 },
    powerAttr: 'agility',
    shape: 'chevron',
    baseArmor: 56,
    baseResist: 54,
    moveSpeed: 112,
    attack: { kind: 'projectile', range: 340, interval: 1.4, damage: 10, scaling: { attackPower: 0.78 }, school: 'physical', projectileSpeed: 620 },
    preferredWeapons: ['fang', 'claw'],
    startingSpells: ['loose', 'hamstring'],
  },

  shaman: {
    id: 'shaman',
    name: 'Shaman',
    role: 'Support',
    color: '#59a39b',
    blurb:
      'Puts things down and leaves them working. Worth the least of anyone in a '
      + 'duel and the most in a fight that has a shape.',
    base: { might: 9, agility: 8, spirit: 16, vitality: 12 },
    growth: { might: 0.8, agility: 0.8, spirit: 1.9, vitality: 1.3 },
    powerAttr: 'spirit',
    shape: 'disc',
    baseArmor: 48,
    baseResist: 82,
    moveSpeed: 98,
    attack: { kind: 'projectile', range: 250, interval: 1.8, damage: 8, scaling: { attackPower: 0.68 }, school: 'magic', projectileSpeed: 440 },
    preferredWeapons: ['horn', 'marrow'],
    startingSpells: ['totem', 'mend'],
  },

  duelist: {
    id: 'duelist',
    name: 'Duelist',
    role: 'Melee DPS',
    color: '#c9748a',
    blurb:
      'Wants to be hit, briefly and on purpose. Everything it does best happens '
      + 'in the half-second after somebody commits to a swing.',
    base: { might: 12, agility: 15, spirit: 8, vitality: 12 },
    growth: { might: 1.2, agility: 1.7, spirit: 0.6, vitality: 1.3 },
    powerAttr: 'agility',
    shape: 'spike',
    baseArmor: 62,
    baseResist: 56,
    moveSpeed: 118,
    attack: { kind: 'melee', range: 44, interval: 1.0, damage: 11, scaling: { attackPower: 0.8 }, school: 'physical' },
    preferredWeapons: ['fang', 'claw'],
    startingSpells: ['riposte', 'engage'],
  },

  inquisitor: {
    id: 'inquisitor',
    name: 'Inquisitor',
    role: 'Anti-magic',
    color: '#b9b3c8',
    blurb:
      'Takes the advantage away rather than out-damaging it. Against anything '
      + 'that relies on being buffed or being resistant, it is the whole answer.',
    base: { might: 12, agility: 9, spirit: 13, vitality: 13 },
    growth: { might: 1.2, agility: 0.9, spirit: 1.5, vitality: 1.4 },
    powerAttr: 'spirit',
    shape: 'shield',
    baseArmor: 72,
    baseResist: 88,
    moveSpeed: 102,
    attack: { kind: 'melee', range: 48, interval: 1.4, damage: 11, scaling: { attackPower: 0.82 }, school: 'magic' },
    preferredWeapons: ['mace', 'horn'],
    startingSpells: ['sunder_ward', 'judgement'],
  },

  runesmith: {
    id: 'runesmith',
    name: 'Runesmith',
    role: 'Control caster',
    color: '#d0a24f',
    blurb:
      'Does the work before the fight starts and spends it afterwards. Slow to '
      + 'open, and then everything lands at once because it was already written.',
    base: { might: 9, agility: 8, spirit: 15, vitality: 13 },
    growth: { might: 0.8, agility: 0.8, spirit: 1.8, vitality: 1.4 },
    powerAttr: 'spirit',
    shape: 'disc',
    baseArmor: 54,
    baseResist: 80,
    moveSpeed: 96,
    attack: { kind: 'projectile', range: 260, interval: 1.9, damage: 9, scaling: { attackPower: 0.72 }, school: 'magic', projectileSpeed: 460 },
    preferredWeapons: ['marrow', 'horn'],
    startingSpells: ['ward_rune', 'sear_rune'],
  },

  harbinger: {
    id: 'harbinger',
    name: 'Harbinger',
    role: 'Ranged DPS',
    color: '#96566f',
    blurb:
      'Nothing it does is the thing that kills you. Everything it does makes the '
      + 'next thing worse, and it is patient about the arithmetic.',
    base: { might: 9, agility: 11, spirit: 14, vitality: 11 },
    growth: { might: 0.9, agility: 1.2, spirit: 1.7, vitality: 1.1 },
    powerAttr: 'spirit',
    shape: 'disc',
    baseArmor: 46,
    baseResist: 74,
    moveSpeed: 104,
    attack: { kind: 'projectile', range: 280, interval: 1.6, damage: 9, scaling: { attackPower: 0.74 }, school: 'magic', projectileSpeed: 500 },
    preferredWeapons: ['gland', 'fang'],
    startingSpells: ['toll', 'arrears'],
  },

  sapper: {
    id: 'sapper',
    name: 'Sapper',
    role: 'Melee DPS',
    color: '#a8763f',
    blurb:
      'Goes through armour rather than around it. Against anything thin it is '
      + 'ordinary; against the heaviest thing on the map it is the shortest way in.',
    base: { might: 14, agility: 10, spirit: 9, vitality: 13 },
    growth: { might: 1.6, agility: 1.0, spirit: 0.7, vitality: 1.4 },
    powerAttr: 'might',
    shape: 'spike',
    baseArmor: 68,
    baseResist: 52,
    moveSpeed: 104,
    attack: { kind: 'melee', range: 46, interval: 1.3, damage: 13, scaling: { attackPower: 0.88 }, school: 'physical' },
    preferredWeapons: ['mace', 'claw'],
    startingSpells: ['breach', 'charge_set'],
  },

  marauder: {
    id: 'marauder',
    name: 'Marauder',
    role: 'Melee DPS',
    color: '#8b7fa8',
    blurb:
      'In, once, hard, and gone before the answer arrives. The only class that '
      + 'treats a second exchange as a mistake it has already made.',
    base: { might: 13, agility: 14, spirit: 7, vitality: 11 },
    growth: { might: 1.4, agility: 1.6, spirit: 0.5, vitality: 1.2 },
    powerAttr: 'might',
    shape: 'spike',
    baseArmor: 58,
    baseResist: 50,
    moveSpeed: 126,
    attack: { kind: 'melee', range: 42, interval: 1.1, damage: 12, scaling: { attackPower: 0.84 }, school: 'physical' },
    preferredWeapons: ['claw', 'fang'],
    startingSpells: ['raid', 'withdraw'],
  },

  sentinel: {
    id: 'sentinel',
    name: 'Sentinel',
    role: 'Frontline',
    color: '#6d8894',
    blurb:
      'The Monk read backwards. Gets stronger the longer it has not moved, and '
      + 'is the hardest thing in the game to shift once it has stopped.',
    base: { might: 13, agility: 5, spirit: 7, vitality: 18 },
    growth: { might: 1.4, agility: 0.4, spirit: 0.5, vitality: 2.2 },
    powerAttr: 'might',
    shape: 'shield',
    baseArmor: 104,
    baseResist: 60,
    moveSpeed: 88,
    attack: { kind: 'melee', range: 50, interval: 1.6, damage: 13, scaling: { attackPower: 0.92 }, school: 'physical' },
    preferredWeapons: ['mace', 'sword'],
    startingSpells: ['plant', 'bulwark_stance'],
  },

};

export const CLASS_IDS = Object.keys(CLASSES);

/** Playable from the very first raid. Everything else is earned. */
export const STARTER_CLASS_IDS = ['knight', 'archer', 'priest'];

export const XP_PER_LEVEL = (level) => Math.round(120 * Math.pow(1.35, level - 1));
export const MAX_LEVEL = 20;

/**
 * Skill points are the currency of the tree: one per level, including the
 * first — a brand new hero should have a decision to make, not a locked screen.
 */
export const skillPointsForLevel = (level) => Math.max(0, level);
