// Spells are pure data. `effects` describe what happens; `hint` tells the
// tactics AI when the spell is worth pressing. Combat resolves both.
//
// Targeting modes:
//   enemy        nearest/priority enemy in range
//   lowestAlly   living ally (incl. self) with the lowest HP fraction
//   self         the caster
//   allAllies    every living squadmate in radius
//   areaEnemy    ground-targeted burst centred on the best enemy cluster
//
// Effect types: damage, heal, shield, dot, hot, buff, debuff, taunt, dash, cleanse.

export const SPELLS = {
  // ------------------------------------------------------------------ KNIGHT
  shield_bash: {
    id: 'shield_bash', name: 'Shield Bash', classId: 'knight', tier: 0,
    manaCost: 12, cooldown: 7, range: 55, target: 'enemy',
    effects: [
      { type: 'damage', school: 'physical', base: 14, scaling: { attackPower: 0.7 } },
      { type: 'debuff', status: 'stun', duration: 1.2 },
    ],
    hint: { priority: 3 },
    desc: 'Slam the nearest enemy for physical damage and stun them for 1.2s.',
  },
  taunt: {
    id: 'taunt', name: 'Taunt', classId: 'knight', tier: 0,
    manaCost: 8, cooldown: 10, radius: 190, target: 'areaEnemy',
    effects: [{ type: 'taunt', duration: 4 }],
    hint: { priority: 4, alliesThreatened: 1 },
    desc: 'Force nearby enemies to attack you for 4s.',
  },
  whirlwind: {
    id: 'whirlwind', name: 'Whirlwind', classId: 'knight', tier: 1,
    manaCost: 18, cooldown: 9, radius: 90, target: 'areaEnemy', range: 60,
    effects: [{ type: 'damage', school: 'physical', base: 16, scaling: { attackPower: 0.75 } }],
    hint: { priority: 3, enemiesWithin: 2 },
    desc: 'Sweep every enemy within 90u for physical damage.',
  },
  bulwark: {
    id: 'bulwark', name: 'Bulwark', classId: 'knight', tier: 1,
    manaCost: 20, cooldown: 22, target: 'self',
    effects: [
      { type: 'buff', status: 'bulwark', duration: 6, mods: { armor: 120, resist: 80 } },
      { type: 'shield', base: 40, scaling: { maxHp: 0.12 } },
    ],
    hint: { priority: 5, selfHpBelow: 0.6 },
    desc: 'Armour and resist surge plus an absorb shield for 6s.',
  },
  challenge: {
    id: 'challenge', name: 'Challenging Roar', classId: 'knight', tier: 2,
    manaCost: 16, cooldown: 18, radius: 220, target: 'areaEnemy',
    effects: [
      { type: 'debuff', status: 'weaken', duration: 6, mods: { damagePct: -0.25 } },
      { type: 'taunt', duration: 3 },
    ],
    hint: { priority: 4, enemiesWithin: 3 },
    desc: 'Enemies in a wide radius deal 25% less damage for 6s and target you.',
  },
  execute: {
    id: 'execute', name: 'Execute', classId: 'knight', tier: 2,
    manaCost: 22, cooldown: 12, range: 55, target: 'enemy',
    effects: [{ type: 'damage', school: 'physical', base: 30, scaling: { attackPower: 1.8 }, executeBelow: 0.35, executeMult: 2.2 }],
    hint: { priority: 6, targetHpBelow: 0.4 },
    desc: 'Heavy strike. Deals 2.2x damage to targets below 35% health.',
  },
  last_stand: {
    id: 'last_stand', name: 'Last Stand', classId: 'knight', tier: 3,
    manaCost: 30, cooldown: 90, target: 'self',
    effects: [
      { type: 'buff', status: 'last_stand', duration: 8, mods: { damagePct: 0.4, lifesteal: 0.25 } },
      { type: 'heal', base: 40, scaling: { maxHp: 0.2 } },
    ],
    hint: { priority: 8, selfHpBelow: 0.35 },
    desc: 'Heal, then gain 40% damage and 25% lifesteal for 8s.',
  },

  // ------------------------------------------------------------------ ARCHER
  power_shot: {
    id: 'power_shot', name: 'Power Shot', classId: 'archer', tier: 0,
    manaCost: 14, cooldown: 6, range: 300, target: 'enemy', projectileSpeed: 700,
    effects: [{ type: 'damage', school: 'physical', base: 22, scaling: { attackPower: 1.35 } }],
    hint: { priority: 3 },
    desc: 'A heavy aimed shot at long range.',
  },
  volley: {
    id: 'volley', name: 'Volley', classId: 'archer', tier: 0,
    manaCost: 20, cooldown: 11, range: 300, radius: 110, target: 'areaEnemy',
    effects: [{ type: 'damage', school: 'physical', base: 14, scaling: { attackPower: 0.6 } }],
    hint: { priority: 3, enemiesWithin: 2 },
    desc: 'Rain arrows on a cluster of enemies.',
  },
  crippling_shot: {
    id: 'crippling_shot', name: 'Crippling Shot', classId: 'archer', tier: 1,
    manaCost: 12, cooldown: 9, range: 280, target: 'enemy',
    effects: [
      { type: 'damage', school: 'physical', base: 10, scaling: { attackPower: 0.5 } },
      { type: 'debuff', status: 'slow', duration: 4, mods: { moveSpeedPct: -0.45 } },
    ],
    hint: { priority: 4, targetClosingIn: true },
    desc: 'Slow a target by 45% for 4s.',
  },
  roll: {
    id: 'roll', name: 'Combat Roll', classId: 'archer', tier: 1,
    manaCost: 10, cooldown: 8, target: 'self',
    effects: [
      { type: 'dash', distance: 170, away: true },
      { type: 'buff', status: 'evasion', duration: 2, mods: { dodge: 0.35 } },
    ],
    hint: { priority: 6, enemyWithin: 90 },
    desc: 'Roll away from danger and gain 35% dodge for 2s.',
  },
  serrated: {
    id: 'serrated', name: 'Serrated Arrow', classId: 'archer', tier: 2,
    manaCost: 16, cooldown: 10, range: 290, target: 'enemy',
    effects: [
      { type: 'damage', school: 'physical', base: 8, scaling: { attackPower: 0.35 } },
      { type: 'dot', school: 'physical', base: 6, scaling: { attackPower: 0.28 }, duration: 8, tick: 1 },
    ],
    hint: { priority: 4, targetHpAbove: 0.5 },
    desc: 'Applies a bleed for 8s.',
  },
  rapid_fire: {
    id: 'rapid_fire', name: 'Rapid Fire', classId: 'archer', tier: 2,
    manaCost: 24, cooldown: 20, target: 'self',
    effects: [{ type: 'buff', status: 'rapid_fire', duration: 6, mods: { attackSpeedPct: 0.9, critChance: 0.1 } }],
    hint: { priority: 5 },
    desc: '+90% attack speed and +10% crit for 6s.',
  },
  hunters_mark: {
    id: 'hunters_mark', name: "Hunter's Mark", classId: 'archer', tier: 3,
    manaCost: 18, cooldown: 24, range: 320, target: 'enemy',
    effects: [{ type: 'debuff', status: 'marked', duration: 10, mods: { vulnerability: 0.25 } }],
    hint: { priority: 7, targetIsElite: true },
    desc: 'Marked targets take 25% more damage from everyone for 10s.',
  },

  // ------------------------------------------------------------------ PRIEST
  mend: {
    id: 'mend', name: 'Mend', classId: 'priest', tier: 0,
    manaCost: 14, cooldown: 3, range: 260, target: 'lowestAlly',
    effects: [{ type: 'heal', base: 26, scaling: { spellPower: 1.1 } }],
    hint: { priority: 5, allyHpBelow: 0.8 },
    desc: 'A fast single-target heal.',
  },
  smite: {
    id: 'smite', name: 'Smite', classId: 'priest', tier: 0,
    manaCost: 12, cooldown: 5, range: 240, target: 'enemy', projectileSpeed: 460,
    effects: [{ type: 'damage', school: 'magic', base: 20, scaling: { spellPower: 1.0 } }],
    hint: { priority: 2 },
    desc: 'Holy damage at range.',
  },
  renew: {
    id: 'renew', name: 'Renew', classId: 'priest', tier: 1,
    manaCost: 16, cooldown: 8, range: 260, target: 'lowestAlly',
    effects: [{ type: 'hot', base: 9, scaling: { spellPower: 0.35 }, duration: 10, tick: 1 }],
    hint: { priority: 4, allyHpBelow: 0.9 },
    desc: 'Heal an ally over 10s.',
  },
  aegis: {
    id: 'aegis', name: 'Aegis', classId: 'priest', tier: 1,
    manaCost: 20, cooldown: 12, range: 260, target: 'lowestAlly',
    effects: [{ type: 'shield', base: 45, scaling: { spellPower: 1.2 }, duration: 8 }],
    hint: { priority: 6, allyHpBelow: 0.7 },
    desc: 'Absorb shield on the most hurt ally.',
  },
  purge: {
    id: 'purge', name: 'Purge', classId: 'priest', tier: 2,
    manaCost: 14, cooldown: 14, range: 260, target: 'lowestAlly',
    effects: [{ type: 'cleanse', count: 2 }, { type: 'heal', base: 14, scaling: { spellPower: 0.5 } }],
    hint: { priority: 5, allyDebuffed: true },
    desc: 'Strip two harmful effects and heal a little.',
  },
  circle_of_light: {
    id: 'circle_of_light', name: 'Circle of Light', classId: 'priest', tier: 2,
    manaCost: 30, cooldown: 24, radius: 240, target: 'allAllies',
    effects: [{ type: 'heal', base: 30, scaling: { spellPower: 0.9 } }, { type: 'hot', base: 5, scaling: { spellPower: 0.2 }, duration: 6, tick: 1 }],
    hint: { priority: 7, alliesHurt: 2 },
    desc: 'Heal the whole squad and leave a lingering regen.',
  },
  divine_ward: {
    id: 'divine_ward', name: 'Divine Ward', classId: 'priest', tier: 3,
    manaCost: 35, cooldown: 100, radius: 240, target: 'allAllies',
    effects: [{ type: 'buff', status: 'divine_ward', duration: 6, mods: { damageTakenPct: -0.35, resist: 60 } }],
    hint: { priority: 9, alliesHpBelow: 0.4 },
    desc: 'The squad takes 35% less damage for 6s.',
  },
};

export const SPELL_LIST = Object.values(SPELLS);
export const spellsForClass = (classId) => SPELL_LIST.filter((s) => s.classId === classId);
export const SPELL_SLOTS = 4;
