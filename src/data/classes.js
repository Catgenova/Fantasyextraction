// The three launch classes. Everything a hero is made of starts here:
// base attributes, growth per level, the shape of their auto-attack, and
// which skill tree / spell pool they draw from.

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
};

export const CLASS_IDS = Object.keys(CLASSES);

export const XP_PER_LEVEL = (level) => Math.round(120 * Math.pow(1.35, level - 1));
export const MAX_LEVEL = 20;

/**
 * Skill points are the currency of the tree: one per level, including the
 * first — a brand new hero should have a decision to make, not a locked screen.
 */
export const skillPointsForLevel = (level) => Math.max(0, level);
