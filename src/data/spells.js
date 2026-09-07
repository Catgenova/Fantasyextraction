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
  // ------------------------------------------------------------------- ROGUE
  eviscerate: {
    id: 'eviscerate', name: 'Eviscerate', classId: 'rogue', tier: 0,
    manaCost: 12, cooldown: 5, range: 50, target: 'enemy',
    effects: [{ type: 'damage', school: 'physical', base: 16, scaling: { attackPower: 1.1 } }],
    hint: { priority: 3 },
    desc: 'A fast opening cut on the nearest enemy.',
  },
  shadowstep: {
    id: 'shadowstep', name: 'Shadowstep', classId: 'rogue', tier: 0,
    manaCost: 10, cooldown: 9, target: 'self',
    effects: [
      { type: 'dash', distance: 150, away: true },
      { type: 'buff', status: 'shadowstep', duration: 3, mods: { dodge: 0.3, moveSpeedPct: 0.25 } },
    ],
    hint: { priority: 6, enemyWithin: 80 },
    desc: 'Slip out of melee with 30% dodge and 25% move speed for 3s.',
  },
  poisoned_blade: {
    id: 'poisoned_blade', name: 'Poisoned Blade', classId: 'rogue', tier: 1,
    manaCost: 14, cooldown: 10, range: 50, target: 'enemy',
    effects: [
      { type: 'damage', school: 'physical', base: 6, scaling: { attackPower: 0.3 } },
      { type: 'dot', status: 'poison', school: 'physical', base: 7, scaling: { attackPower: 0.3 }, duration: 9, tick: 1 },
    ],
    hint: { priority: 4, targetHpAbove: 0.45 },
    desc: 'Poison the target for 9s.',
  },
  fan_of_knives: {
    id: 'fan_of_knives', name: 'Fan of Knives', classId: 'rogue', tier: 1,
    manaCost: 18, cooldown: 10, radius: 130, target: 'areaEnemy', range: 70,
    effects: [{ type: 'damage', school: 'physical', base: 12, scaling: { attackPower: 0.55 } }],
    hint: { priority: 3, enemiesWithin: 3 },
    desc: 'Throw blades at everything within 130u.',
  },
  ambush: {
    id: 'ambush', name: 'Ambush', classId: 'rogue', tier: 2,
    manaCost: 20, cooldown: 14, range: 50, target: 'enemy',
    effects: [{ type: 'damage', school: 'physical', base: 26, scaling: { attackPower: 1.6 }, executeBelow: 0.5, executeMult: 1.7 }],
    hint: { priority: 6, targetHpBelow: 0.55 },
    desc: 'A finisher that hits 70% harder on targets below half health.',
  },
  vanish: {
    id: 'vanish', name: 'Vanish', classId: 'rogue', tier: 2,
    manaCost: 22, cooldown: 26, target: 'self',
    effects: [
      { type: 'dash', distance: 210, away: true },
      { type: 'buff', status: 'vanish', duration: 4, mods: { dodge: 0.5, damagePct: 0.3 } },
    ],
    hint: { priority: 7, selfHpBelow: 0.45 },
    desc: 'Break away with 50% dodge and 30% damage for 4s.',
  },
  death_mark: {
    id: 'death_mark', name: 'Death Mark', classId: 'rogue', tier: 3,
    manaCost: 26, cooldown: 40, range: 60, target: 'enemy',
    effects: [
      { type: 'debuff', status: 'death_mark', duration: 8, mods: { vulnerability: 0.3 } },
      { type: 'damage', school: 'physical', base: 20, scaling: { attackPower: 1.2 } },
    ],
    hint: { priority: 8, targetIsElite: true },
    desc: 'The target takes 30% more damage from everyone for 8s.',
  },

  // --------------------------------------------------------------- BERSERKER
  reckless_swing: {
    id: 'reckless_swing', name: 'Reckless Swing', classId: 'berserker', tier: 0,
    manaCost: 10, cooldown: 6, range: 60, radius: 90, target: 'areaEnemy',
    effects: [{ type: 'damage', school: 'physical', base: 20, scaling: { attackPower: 1.0 } }],
    hint: { priority: 3 },
    desc: 'A wide swing that catches everything in front of you.',
  },
  frenzy: {
    id: 'frenzy', name: 'Frenzy', classId: 'berserker', tier: 0,
    manaCost: 16, cooldown: 20, target: 'self',
    effects: [{ type: 'buff', status: 'frenzy', duration: 8, mods: { attackSpeedPct: 0.5, lifesteal: 0.12, damageTakenPct: 0.1 } }],
    hint: { priority: 5 },
    desc: '+50% attack speed and 12% lifesteal for 8s — and 10% more damage taken.',
  },
  bloodthirst: {
    id: 'bloodthirst', name: 'Bloodthirst', classId: 'berserker', tier: 1,
    manaCost: 14, cooldown: 8, range: 55, target: 'enemy',
    effects: [
      { type: 'damage', school: 'physical', base: 22, scaling: { attackPower: 1.15 } },
      { type: 'heal', base: 10, scaling: { maxHp: 0.05 } },
    ],
    hint: { priority: 5, selfHpBelow: 0.75 },
    desc: 'Hit hard and heal for 5% of your maximum health.',
  },
  charge: {
    id: 'charge', name: 'Charge', classId: 'berserker', tier: 1,
    manaCost: 12, cooldown: 12, target: 'self',
    effects: [
      { type: 'dash', distance: 220, away: false },
      { type: 'buff', status: 'charge', duration: 3, mods: { damagePct: 0.2 } },
    ],
    hint: { priority: 5, targetClosingIn: false },
    desc: 'Close the gap and hit 20% harder for 3s.',
  },
  rampage: {
    id: 'rampage', name: 'Rampage', classId: 'berserker', tier: 2,
    manaCost: 24, cooldown: 16, radius: 110, target: 'areaEnemy', range: 60,
    effects: [
      { type: 'damage', school: 'physical', base: 24, scaling: { attackPower: 1.0 } },
      { type: 'debuff', status: 'rend', school: 'physical', duration: 6, mods: { damageTakenPct: 0.12 } },
    ],
    hint: { priority: 4, enemiesWithin: 2 },
    desc: 'Everything nearby takes damage and 12% more of it for 6s.',
  },
  thick_hide: {
    id: 'thick_hide', name: 'Thick Hide', classId: 'berserker', tier: 2,
    manaCost: 18, cooldown: 24, target: 'self',
    effects: [{ type: 'buff', status: 'thick_hide', duration: 8, mods: { armor: 90, damageTakenPct: -0.2 } }],
    hint: { priority: 6, selfHpBelow: 0.5 },
    desc: '+90 armour and 20% less damage taken for 8s.',
  },
  undying_rage: {
    id: 'undying_rage', name: 'Undying Rage', classId: 'berserker', tier: 3,
    manaCost: 30, cooldown: 90, target: 'self',
    effects: [
      { type: 'heal', base: 30, scaling: { maxHp: 0.18 } },
      { type: 'buff', status: 'undying_rage', duration: 10, mods: { damagePct: 0.5, lifesteal: 0.3, moveSpeedPct: 0.15 } },
    ],
    hint: { priority: 9, selfHpBelow: 0.3 },
    desc: 'Heal, then 50% damage and 30% lifesteal for 10s.',
  },

  // ------------------------------------------------------------------ SLAYER
  sunder: {
    id: 'sunder', name: 'Sunder', classId: 'slayer', tier: 0,
    manaCost: 12, cooldown: 8, range: 60, target: 'enemy',
    effects: [
      { type: 'damage', school: 'physical', base: 20, scaling: { attackPower: 1.1 } },
      { type: 'debuff', status: 'sundered', duration: 10, mods: { armor: -120 } },
    ],
    hint: { priority: 4 },
    desc: 'Strips 120 armour from the target for 10s.',
  },
  giantsbane: {
    id: 'giantsbane', name: "Giant's Bane", classId: 'slayer', tier: 0,
    manaCost: 16, cooldown: 12, range: 60, target: 'enemy',
    effects: [{ type: 'damage', school: 'physical', base: 18, scaling: { attackPower: 0.9, maxHp: 0.02 } }],
    hint: { priority: 5, targetIsElite: true },
    desc: 'A blow scaled to how big the thing in front of you is.',
  },
  overhead: {
    id: 'overhead', name: 'Overhead Cleave', classId: 'slayer', tier: 1,
    manaCost: 18, cooldown: 11, radius: 120, target: 'areaEnemy', range: 70,
    effects: [{ type: 'damage', school: 'physical', base: 22, scaling: { attackPower: 0.85 } }],
    hint: { priority: 3, enemiesWithin: 2 },
    desc: 'A heavy two-handed sweep.',
  },
  bracing_stance: {
    id: 'bracing_stance', name: 'Bracing Stance', classId: 'slayer', tier: 1,
    manaCost: 16, cooldown: 20, target: 'self',
    effects: [{ type: 'buff', status: 'bracing', duration: 7, mods: { armor: 70, resist: 70, damageTakenPct: -0.12 } }],
    hint: { priority: 6, selfHpBelow: 0.55 },
    desc: 'Plant your feet: +70 armour and resist, 12% less damage taken.',
  },
  culling: {
    id: 'culling', name: 'Culling Blow', classId: 'slayer', tier: 2,
    manaCost: 22, cooldown: 10, range: 60, target: 'enemy',
    effects: [{ type: 'damage', school: 'physical', base: 28, scaling: { attackPower: 1.5 }, executeBelow: 0.3, executeMult: 2.4 }],
    hint: { priority: 6, targetHpBelow: 0.35 },
    desc: '2.4x damage against anything below 30% health.',
  },
  monster_hunter: {
    id: 'monster_hunter', name: 'Monster Hunter', classId: 'slayer', tier: 2,
    manaCost: 20, cooldown: 26, target: 'self',
    effects: [{ type: 'buff', status: 'monster_hunter', duration: 12, mods: { armorPen: 180, critDamage: 0.3 } }],
    hint: { priority: 7, targetIsElite: true },
    desc: 'Ignore 180 armour and hit 30% harder on crits for 12s.',
  },
  headsman: {
    id: 'headsman', name: "Headsman's Toll", classId: 'slayer', tier: 3,
    manaCost: 32, cooldown: 60, range: 65, target: 'enemy',
    effects: [
      { type: 'damage', school: 'physical', base: 40, scaling: { attackPower: 2.0, maxHp: 0.03 } },
      { type: 'debuff', status: 'tolled', duration: 10, mods: { vulnerability: 0.2 } },
    ],
    hint: { priority: 8, targetIsElite: true },
    desc: 'An enormous strike that leaves the target 20% more vulnerable for 10s.',
  },

  // ----------------------------------------------------------------- PALADIN
  consecrate: {
    id: 'consecrate', name: 'Consecrate', classId: 'paladin', tier: 0,
    manaCost: 14, cooldown: 9, radius: 160, target: 'areaEnemy', range: 60,
    effects: [{ type: 'damage', school: 'magic', base: 16, scaling: { attackPower: 0.4, spellPower: 0.6 } }],
    hint: { priority: 3, enemiesWithin: 2 },
    desc: 'Burn the ground under nearby enemies with holy damage.',
  },
  lay_on_hands: {
    id: 'lay_on_hands', name: 'Lay on Hands', classId: 'paladin', tier: 0,
    manaCost: 18, cooldown: 10, range: 200, target: 'lowestAlly',
    effects: [{ type: 'heal', base: 24, scaling: { spellPower: 1.0 } }],
    hint: { priority: 5, allyHpBelow: 0.7 },
    desc: 'Heal the most hurt ally within 200u.',
  },
  hammer_of_faith: {
    id: 'hammer_of_faith', name: 'Hammer of Faith', classId: 'paladin', tier: 1,
    manaCost: 14, cooldown: 8, range: 60, target: 'enemy',
    effects: [
      { type: 'damage', school: 'magic', base: 18, scaling: { attackPower: 0.7, spellPower: 0.5 } },
      { type: 'debuff', status: 'stun', duration: 1.0 },
    ],
    hint: { priority: 4 },
    desc: 'Holy strike with a 1s stun.',
  },
  guardians_oath: {
    id: 'guardians_oath', name: "Guardian's Oath", classId: 'paladin', tier: 1,
    manaCost: 20, cooldown: 18, radius: 200, target: 'areaEnemy',
    effects: [
      { type: 'taunt', duration: 4 },
      { type: 'buff', status: 'oath', duration: 6, mods: { armor: 80, resist: 60 } },
    ],
    hint: { priority: 5, alliesThreatened: 1 },
    desc: 'Pull nearby enemies onto you and brace for it.',
  },
  blessing: {
    id: 'blessing', name: 'Blessing of Arms', classId: 'paladin', tier: 2,
    manaCost: 26, cooldown: 24, radius: 240, target: 'allAllies',
    effects: [{ type: 'buff', status: 'blessing', duration: 10, mods: { damagePct: 0.15, critChance: 0.05 } }],
    hint: { priority: 5 },
    desc: 'The squad deals 15% more damage and crits 5% more for 10s.',
  },
  sanctified_ground: {
    id: 'sanctified_ground', name: 'Sanctified Ground', classId: 'paladin', tier: 2,
    manaCost: 28, cooldown: 22, radius: 240, target: 'allAllies',
    effects: [{ type: 'hot', base: 8, scaling: { spellPower: 0.3 }, duration: 8, tick: 1 }],
    hint: { priority: 6, alliesHurt: 2 },
    desc: 'Heal the whole squad over 8s.',
  },
  divine_intervention: {
    id: 'divine_intervention', name: 'Divine Intervention', classId: 'paladin', tier: 3,
    manaCost: 34, cooldown: 100, radius: 240, target: 'allAllies',
    effects: [
      { type: 'heal', base: 30, scaling: { spellPower: 0.8 } },
      { type: 'shield', base: 50, scaling: { spellPower: 1.0, maxHp: 0.1 }, duration: 8 },
    ],
    hint: { priority: 9, alliesHpBelow: 0.4 },
    desc: 'Heal and shield the entire squad.',
  },

  // ------------------------------------------------------------- NECROMANCER
  bone_spear: {
    id: 'bone_spear', name: 'Bone Spear', classId: 'necromancer', tier: 0,
    manaCost: 12, cooldown: 5, range: 260, target: 'enemy', projectileSpeed: 420,
    effects: [{ type: 'damage', school: 'magic', base: 20, scaling: { spellPower: 1.0 } }],
    hint: { priority: 3 },
    desc: 'Hurl a shard of bone at range.',
  },
  corrupt: {
    id: 'corrupt', name: 'Corrupt', classId: 'necromancer', tier: 0,
    manaCost: 14, cooldown: 7, range: 250, target: 'enemy',
    effects: [{ type: 'dot', status: 'corruption', school: 'magic', base: 9, scaling: { spellPower: 0.42 }, duration: 12, tick: 1 }],
    hint: { priority: 4, targetHpAbove: 0.4 },
    desc: 'Rot a target for 12s.',
  },
  drain_life: {
    id: 'drain_life', name: 'Drain Life', classId: 'necromancer', tier: 1,
    manaCost: 16, cooldown: 8, range: 240, target: 'enemy',
    effects: [
      { type: 'damage', school: 'magic', base: 16, scaling: { spellPower: 0.8 } },
      { type: 'heal', base: 14, scaling: { spellPower: 0.5 } },
    ],
    hint: { priority: 5, selfHpBelow: 0.8 },
    desc: 'Damage a target and heal yourself for most of it.',
  },
  bone_armor: {
    id: 'bone_armor', name: 'Bone Armour', classId: 'necromancer', tier: 1,
    manaCost: 18, cooldown: 18, target: 'self',
    effects: [{ type: 'shield', base: 40, scaling: { spellPower: 1.1, maxHp: 0.08 }, duration: 12 }],
    hint: { priority: 6, selfHpBelow: 0.65 },
    desc: 'Wrap yourself in bone: an absorb shield for 12s.',
  },
  plague: {
    id: 'plague', name: 'Plague', classId: 'necromancer', tier: 2,
    manaCost: 26, cooldown: 14, range: 260, radius: 180, target: 'areaEnemy',
    effects: [
      { type: 'damage', school: 'magic', base: 12, scaling: { spellPower: 0.45 } },
      { type: 'dot', status: 'plague', school: 'magic', base: 7, scaling: { spellPower: 0.3 }, duration: 10, tick: 1 },
    ],
    hint: { priority: 5, enemiesWithin: 2 },
    desc: 'Infect a cluster of enemies for 10s.',
  },
  curse_of_weakness: {
    id: 'curse_of_weakness', name: 'Curse of Weakness', classId: 'necromancer', tier: 2,
    manaCost: 18, cooldown: 16, range: 260, radius: 200, target: 'areaEnemy',
    effects: [{ type: 'debuff', status: 'weakness', duration: 8, mods: { damagePct: -0.28, moveSpeedPct: -0.15 } }],
    hint: { priority: 6, enemiesWithin: 2 },
    desc: 'Cursed enemies deal 28% less damage and move slower for 8s.',
  },
  soul_harvest: {
    id: 'soul_harvest', name: 'Soul Harvest', classId: 'necromancer', tier: 3,
    manaCost: 32, cooldown: 60, range: 260, radius: 220, target: 'areaEnemy',
    effects: [
      { type: 'damage', school: 'magic', base: 34, scaling: { spellPower: 1.5 } },
      { type: 'buff', status: 'harvest', duration: 10, mods: { lifesteal: 0.25, damagePct: 0.2 } },
    ],
    hint: { priority: 8, enemiesWithin: 3 },
    desc: 'Tear the life out of a crowd, then feed on it for 10s.',
  },

  // ---------------------------------------------------------------- ICE MAGE
  frostbolt: {
    id: 'frostbolt', name: 'Frostbolt', classId: 'ice_mage', tier: 0,
    manaCost: 12, cooldown: 4, range: 280, target: 'enemy', projectileSpeed: 460,
    effects: [
      { type: 'damage', school: 'magic', base: 18, scaling: { spellPower: 0.95 } },
      { type: 'debuff', status: 'chill', duration: 3, mods: { moveSpeedPct: -0.2 } },
    ],
    hint: { priority: 3 },
    desc: 'Damage and a 20% slow for 3s.',
  },
  frost_nova: {
    id: 'frost_nova', name: 'Frost Nova', classId: 'ice_mage', tier: 0,
    manaCost: 18, cooldown: 12, radius: 190, target: 'areaEnemy', range: 60,
    effects: [
      { type: 'damage', school: 'magic', base: 12, scaling: { spellPower: 0.5 } },
      { type: 'debuff', status: 'frozen', duration: 2, mods: { moveSpeedPct: -0.8 } },
    ],
    hint: { priority: 6, enemyWithin: 140 },
    desc: 'Freeze everything around you nearly still for 2s.',
  },
  ice_lance: {
    id: 'ice_lance', name: 'Ice Lance', classId: 'ice_mage', tier: 1,
    manaCost: 14, cooldown: 7, range: 290, target: 'enemy', projectileSpeed: 700,
    effects: [{ type: 'damage', school: 'magic', base: 24, scaling: { spellPower: 1.25 } }],
    hint: { priority: 4 },
    desc: 'A hard, fast shard at long range.',
  },
  frost_ward: {
    id: 'frost_ward', name: 'Frost Ward', classId: 'ice_mage', tier: 1,
    manaCost: 20, cooldown: 20, target: 'self',
    effects: [
      { type: 'shield', base: 40, scaling: { spellPower: 1.0 }, duration: 10 },
      { type: 'buff', status: 'frost_ward', duration: 10, mods: { resist: 70 } },
    ],
    hint: { priority: 6, selfHpBelow: 0.6 },
    desc: 'A shield of ice and +70 resist for 10s.',
  },
  blizzard: {
    id: 'blizzard', name: 'Blizzard', classId: 'ice_mage', tier: 2,
    manaCost: 30, cooldown: 18, range: 280, radius: 230, target: 'areaEnemy',
    effects: [
      { type: 'damage', school: 'magic', base: 14, scaling: { spellPower: 0.55 } },
      { type: 'dot', status: 'blizzard', school: 'magic', base: 6, scaling: { spellPower: 0.26 }, duration: 8, tick: 1 },
      { type: 'debuff', status: 'chill', duration: 8, mods: { moveSpeedPct: -0.3 } },
    ],
    hint: { priority: 6, enemiesWithin: 3 },
    desc: 'A wide, slow, grinding storm.',
  },
  cone_of_cold: {
    id: 'cone_of_cold', name: 'Cone of Cold', classId: 'ice_mage', tier: 2,
    manaCost: 22, cooldown: 13, range: 150, radius: 150, target: 'areaEnemy',
    effects: [
      { type: 'damage', school: 'magic', base: 26, scaling: { spellPower: 1.0 } },
      { type: 'debuff', status: 'frozen', duration: 2.5, mods: { moveSpeedPct: -0.6, attackSpeedPct: -0.3 } },
    ],
    hint: { priority: 5, enemiesWithin: 2 },
    desc: 'Damage and heavily slow a group in front of you.',
  },
  deep_freeze: {
    id: 'deep_freeze', name: 'Deep Freeze', classId: 'ice_mage', tier: 3,
    manaCost: 34, cooldown: 55, range: 280, radius: 220, target: 'areaEnemy',
    effects: [
      { type: 'damage', school: 'magic', base: 30, scaling: { spellPower: 1.3 } },
      { type: 'debuff', status: 'deep_freeze', duration: 4, mods: { moveSpeedPct: -0.9, attackSpeedPct: -0.5, damageTakenPct: 0.2 } },
    ],
    hint: { priority: 8, enemiesWithin: 3 },
    desc: 'Lock a crowd in place for 4s and make them easier to kill.',
  },

  // --------------------------------------------------------------- FIRE MAGE
  fireball: {
    id: 'fireball', name: 'Fireball', classId: 'fire_mage', tier: 0,
    manaCost: 16, cooldown: 6, range: 280, radius: 130, target: 'areaEnemy', projectileSpeed: 400,
    effects: [{ type: 'damage', school: 'magic', base: 24, scaling: { spellPower: 1.15 } }],
    hint: { priority: 3 },
    desc: 'A bursting shot that catches everything close to the impact.',
  },
  ignite: {
    id: 'ignite', name: 'Ignite', classId: 'fire_mage', tier: 0,
    manaCost: 12, cooldown: 6, range: 260, target: 'enemy',
    effects: [{ type: 'dot', status: 'burn', school: 'magic', base: 10, scaling: { spellPower: 0.46 }, duration: 8, tick: 1 }],
    hint: { priority: 4, targetHpAbove: 0.4 },
    desc: 'Set a target burning for 8s.',
  },
  scorch: {
    id: 'scorch', name: 'Scorch', classId: 'fire_mage', tier: 1,
    manaCost: 14, cooldown: 5, range: 250, target: 'enemy',
    effects: [
      { type: 'damage', school: 'magic', base: 16, scaling: { spellPower: 0.8 } },
      { type: 'debuff', status: 'scorched', duration: 8, mods: { vulnerability: 0.12 } },
    ],
    hint: { priority: 4 },
    desc: 'Leaves the target taking 12% more damage for 8s.',
  },
  blazing_speed: {
    id: 'blazing_speed', name: 'Blazing Speed', classId: 'fire_mage', tier: 1,
    manaCost: 14, cooldown: 16, target: 'self',
    effects: [{ type: 'buff', status: 'blazing_speed', duration: 5, mods: { moveSpeedPct: 0.4, dodge: 0.15 } }],
    hint: { priority: 6, enemyWithin: 110 },
    desc: '+40% move speed and 15% dodge for 5s.',
  },
  flamestrike: {
    id: 'flamestrike', name: 'Flamestrike', classId: 'fire_mage', tier: 2,
    manaCost: 30, cooldown: 15, range: 280, radius: 200, target: 'areaEnemy',
    effects: [
      { type: 'damage', school: 'magic', base: 30, scaling: { spellPower: 1.2 } },
      { type: 'dot', status: 'burn', school: 'magic', base: 8, scaling: { spellPower: 0.32 }, duration: 6, tick: 1 },
    ],
    hint: { priority: 6, enemiesWithin: 3 },
    desc: 'A pillar of fire that leaves the ground burning.',
  },
  combustion: {
    id: 'combustion', name: 'Combustion', classId: 'fire_mage', tier: 2,
    manaCost: 24, cooldown: 28, target: 'self',
    effects: [{ type: 'buff', status: 'combustion', duration: 8, mods: { critChance: 0.25, dotPct: 0.4 } }],
    hint: { priority: 6 },
    desc: '+25% crit and +40% burn damage for 8s.',
  },
  meteor: {
    id: 'meteor', name: 'Meteor', classId: 'fire_mage', tier: 3,
    manaCost: 38, cooldown: 55, range: 300, radius: 240, target: 'areaEnemy',
    effects: [
      { type: 'damage', school: 'magic', base: 55, scaling: { spellPower: 2.0 } },
      { type: 'dot', status: 'burn', school: 'magic', base: 10, scaling: { spellPower: 0.4 }, duration: 6, tick: 1 },
    ],
    hint: { priority: 8, enemiesWithin: 3 },
    desc: 'The single biggest hit in the game, on a long cooldown.',
  },

  // ---------------------------------------------------------- LIGHTNING MAGE
  arc_bolt: {
    id: 'arc_bolt', name: 'Arc Bolt', classId: 'lightning_mage', tier: 0,
    manaCost: 9, cooldown: 3, range: 300, target: 'enemy', projectileSpeed: 900,
    effects: [{ type: 'damage', school: 'magic', base: 13, scaling: { spellPower: 0.7 } }],
    hint: { priority: 3 },
    desc: 'A cheap, near-instant bolt on a very short cooldown.',
  },
  thunderclap: {
    id: 'thunderclap', name: 'Thunderclap', classId: 'lightning_mage', tier: 0,
    manaCost: 18, cooldown: 11, radius: 200, target: 'areaEnemy', range: 70,
    effects: [
      { type: 'damage', school: 'magic', base: 16, scaling: { spellPower: 0.62 } },
      { type: 'debuff', status: 'dazed', duration: 3, mods: { attackSpeedPct: -0.25 } },
    ],
    hint: { priority: 4, enemiesWithin: 2 },
    desc: 'Stagger everything nearby: they attack 25% slower for 3s.',
  },
  chain_lightning: {
    id: 'chain_lightning', name: 'Chain Lightning', classId: 'lightning_mage', tier: 1,
    manaCost: 20, cooldown: 9, range: 290, radius: 170, target: 'areaEnemy',
    effects: [{ type: 'damage', school: 'magic', base: 18, scaling: { spellPower: 0.8 } }],
    hint: { priority: 4, enemiesWithin: 2 },
    desc: 'Arcs through a cluster of enemies.',
  },
  static_field: {
    id: 'static_field', name: 'Static Field', classId: 'lightning_mage', tier: 1,
    manaCost: 16, cooldown: 18, target: 'self',
    effects: [{ type: 'buff', status: 'static_field', duration: 10, mods: { cooldownPct: 0.2, manaRegen: 3 } }],
    hint: { priority: 5 },
    desc: '20% cooldown reduction and heavy mana regen for 10s.',
  },
  overcharge: {
    id: 'overcharge', name: 'Overcharge', classId: 'lightning_mage', tier: 2,
    manaCost: 22, cooldown: 24, target: 'self',
    effects: [{ type: 'buff', status: 'overcharge', duration: 8, mods: { attackSpeedPct: 0.7, damagePct: 0.2 } }],
    hint: { priority: 6 },
    desc: '+70% attack speed and 20% damage for 8s.',
  },
  storm_shield: {
    id: 'storm_shield', name: 'Storm Shield', classId: 'lightning_mage', tier: 2,
    manaCost: 22, cooldown: 20, range: 240, target: 'lowestAlly',
    effects: [
      { type: 'shield', base: 42, scaling: { spellPower: 1.0 }, duration: 8 },
      { type: 'buff', status: 'storm_shield', duration: 8, mods: { moveSpeedPct: 0.15 } },
    ],
    hint: { priority: 6, allyHpBelow: 0.6 },
    desc: 'Shield the most hurt ally and speed them up for 8s.',
  },
  lightning_storm: {
    id: 'lightning_storm', name: 'Lightning Storm', classId: 'lightning_mage', tier: 3,
    manaCost: 34, cooldown: 50, range: 300, radius: 250, target: 'areaEnemy',
    effects: [
      { type: 'damage', school: 'magic', base: 26, scaling: { spellPower: 1.1 } },
      { type: 'dot', status: 'storm', school: 'magic', base: 12, scaling: { spellPower: 0.5 }, duration: 8, tick: 1 },
    ],
    hint: { priority: 8, enemiesWithin: 3 },
    desc: 'A standing storm that keeps hitting everything under it for 8s.',
  },
};

export const SPELL_LIST = Object.values(SPELLS);
export const spellsForClass = (classId) => SPELL_LIST.filter((s) => s.classId === classId);
export const SPELL_SLOTS = 4;
