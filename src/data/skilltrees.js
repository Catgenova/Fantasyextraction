// Skill trees. Three branches per class, four tiers deep. A node either grants
// passive stat modifiers (`mods`, applied per rank) or unlocks a spell.
//
// Tier N nodes require `tierPoints` points already spent in that branch.

const TIER_REQ = [0, 2, 5, 9];

function node(o) {
  return { maxRank: 1, cost: 1, mods: {}, ...o, tierReq: TIER_REQ[o.tier] };
}

export const TREES = {
  knight: {
    branches: [
      { id: 'bulwark', name: 'Bulwark', blurb: 'Survivability and threat control.' },
      { id: 'arms', name: 'Arms', blurb: 'Weapon damage and burst.' },
      { id: 'banner', name: 'Banner', blurb: 'Squad-wide auras and utility.' },
    ],
    nodes: [
      node({ id: 'k_toughness', branch: 'bulwark', tier: 0, name: 'Toughness', maxRank: 3, mods: { armor: 30, vitality: 2 }, desc: '+30 armour, +2 vitality per rank.' }),
      node({ id: 'k_shieldwork', branch: 'bulwark', tier: 1, name: 'Shieldwork', maxRank: 2, mods: { blockChance: 0.06 }, desc: '+6% block chance per rank.' }),
      node({ id: 'k_bulwark', branch: 'bulwark', tier: 1, name: 'Bulwark', unlocks: 'bulwark', desc: 'Unlocks Bulwark.' }),
      node({ id: 'k_challenge', branch: 'bulwark', tier: 2, name: 'Challenging Roar', unlocks: 'challenge', desc: 'Unlocks Challenging Roar.' }),
      node({ id: 'k_ironhide', branch: 'bulwark', tier: 2, name: 'Iron Hide', maxRank: 2, mods: { damageTakenPct: -0.06 }, desc: '-6% damage taken per rank.' }),
      node({ id: 'k_laststand', branch: 'bulwark', tier: 3, name: 'Last Stand', unlocks: 'last_stand', desc: 'Unlocks Last Stand.' }),

      node({ id: 'k_strength', branch: 'arms', tier: 0, name: 'Strength', maxRank: 3, mods: { might: 3 }, desc: '+3 might per rank.' }),
      node({ id: 'k_whirlwind', branch: 'arms', tier: 1, name: 'Whirlwind', unlocks: 'whirlwind', desc: 'Unlocks Whirlwind.' }),
      node({ id: 'k_cleave', branch: 'arms', tier: 1, name: 'Cleaving Blows', maxRank: 2, mods: { critChance: 0.04, critDamage: 0.1 }, desc: '+4% crit, +10% crit damage per rank.' }),
      node({ id: 'k_execute', branch: 'arms', tier: 2, name: 'Execute', unlocks: 'execute', desc: 'Unlocks Execute.' }),
      node({ id: 'k_momentum', branch: 'arms', tier: 2, name: 'Momentum', maxRank: 2, mods: { attackSpeedPct: 0.08 }, desc: '+8% attack speed per rank.' }),
      node({ id: 'k_ruin', branch: 'arms', tier: 3, name: 'Ruin', maxRank: 1, mods: { damagePct: 0.15 }, desc: '+15% damage dealt.' }),

      node({ id: 'k_vigor', branch: 'banner', tier: 0, name: 'Vigour', maxRank: 3, mods: { maxHpFlat: 30 }, desc: '+30 max health per rank.' }),
      node({ id: 'k_rally', branch: 'banner', tier: 1, name: 'Rally', maxRank: 2, aura: { moveSpeedPct: 0.05 }, desc: 'Squad aura: +5% move speed per rank.' }),
      node({ id: 'k_inspire', branch: 'banner', tier: 1, name: 'Inspire', maxRank: 2, aura: { damagePct: 0.05 }, desc: 'Squad aura: +5% damage per rank.' }),
      node({ id: 'k_standard', branch: 'banner', tier: 2, name: 'Standard Bearer', maxRank: 2, aura: { armor: 25, resist: 25 }, desc: 'Squad aura: +25 armour and resist per rank.' }),
      node({ id: 'k_recovery', branch: 'banner', tier: 2, name: 'Field Recovery', maxRank: 2, mods: { lifesteal: 0.03 }, desc: '+3% lifesteal per rank.' }),
      node({ id: 'k_warlord', branch: 'banner', tier: 3, name: 'Warlord', maxRank: 1, aura: { critChance: 0.05, cooldownPct: 0.08 }, desc: 'Squad aura: +5% crit and 8% cooldown reduction.' }),
    ],
  },

  archer: {
    branches: [
      { id: 'marksman', name: 'Marksman', blurb: 'Raw single-target damage.' },
      { id: 'skirmish', name: 'Skirmish', blurb: 'Mobility and staying untouched.' },
      { id: 'trapper', name: 'Trapper', blurb: 'Control, bleeds and multi-target.' },
    ],
    nodes: [
      node({ id: 'a_precision', branch: 'marksman', tier: 0, name: 'Precision', maxRank: 3, mods: { agility: 3 }, desc: '+3 agility per rank.' }),
      node({ id: 'a_deadly', branch: 'marksman', tier: 1, name: 'Deadly Aim', maxRank: 2, mods: { critChance: 0.05 }, desc: '+5% crit chance per rank.' }),
      node({ id: 'a_piercing', branch: 'marksman', tier: 1, name: 'Piercing Shots', maxRank: 2, mods: { armorPen: 60 }, desc: 'Ignore 60 enemy armour per rank.' }),
      node({ id: 'a_rapid', branch: 'marksman', tier: 2, name: 'Rapid Fire', unlocks: 'rapid_fire', desc: 'Unlocks Rapid Fire.' }),
      node({ id: 'a_lethal', branch: 'marksman', tier: 2, name: 'Lethality', maxRank: 2, mods: { critDamage: 0.18 }, desc: '+18% crit damage per rank.' }),
      node({ id: 'a_mark', branch: 'marksman', tier: 3, name: "Hunter's Mark", unlocks: 'hunters_mark', desc: "Unlocks Hunter's Mark." }),

      node({ id: 'a_fleet', branch: 'skirmish', tier: 0, name: 'Fleet Footed', maxRank: 3, mods: { moveSpeedPct: 0.04 }, desc: '+4% move speed per rank.' }),
      node({ id: 'a_roll', branch: 'skirmish', tier: 1, name: 'Combat Roll', unlocks: 'roll', desc: 'Unlocks Combat Roll.' }),
      node({ id: 'a_evasion', branch: 'skirmish', tier: 1, name: 'Evasion', maxRank: 2, mods: { dodge: 0.05 }, desc: '+5% dodge per rank.' }),
      node({ id: 'a_kite', branch: 'skirmish', tier: 2, name: 'Kiting', maxRank: 2, mods: { rangeBonus: 30 }, desc: '+30 attack range per rank.' }),
      node({ id: 'a_disengage', branch: 'skirmish', tier: 2, name: 'Disengage', maxRank: 2, mods: { cooldownPct: 0.07 }, desc: '+7% cooldown reduction per rank.' }),
      node({ id: 'a_phantom', branch: 'skirmish', tier: 3, name: 'Phantom Step', maxRank: 1, mods: { dodge: 0.1, moveSpeedPct: 0.1 }, desc: '+10% dodge and move speed.' }),

      node({ id: 'a_toxins', branch: 'trapper', tier: 0, name: 'Toxins', maxRank: 3, mods: { dotPct: 0.12 }, desc: '+12% damage-over-time per rank.' }),
      node({ id: 'a_serrated', branch: 'trapper', tier: 1, name: 'Serrated Arrow', unlocks: 'serrated', desc: 'Unlocks Serrated Arrow.' }),
      node({ id: 'a_crippling', branch: 'trapper', tier: 1, name: 'Crippling Shot', unlocks: 'crippling_shot', desc: 'Unlocks Crippling Shot.' }),
      node({ id: 'a_wide', branch: 'trapper', tier: 2, name: 'Wide Spread', maxRank: 2, mods: { aoeRadiusPct: 0.15 }, desc: '+15% area-effect radius per rank.' }),
      node({ id: 'a_hemorrhage', branch: 'trapper', tier: 2, name: 'Haemorrhage', maxRank: 2, mods: { dotPct: 0.15 }, desc: '+15% damage-over-time per rank.' }),
      node({ id: 'a_ambush', branch: 'trapper', tier: 3, name: 'Ambusher', maxRank: 1, mods: { damagePct: 0.12, critChance: 0.05 }, desc: '+12% damage and +5% crit.' }),
    ],
  },

  priest: {
    branches: [
      { id: 'light', name: 'Light', blurb: 'Direct and burst healing.' },
      { id: 'ward', name: 'Ward', blurb: 'Shields and mitigation.' },
      { id: 'wrath', name: 'Wrath', blurb: 'Offensive holy magic.' },
    ],
    nodes: [
      node({ id: 'p_faith', branch: 'light', tier: 0, name: 'Faith', maxRank: 3, mods: { spirit: 3 }, desc: '+3 spirit per rank.' }),
      node({ id: 'p_renew', branch: 'light', tier: 1, name: 'Renew', unlocks: 'renew', desc: 'Unlocks Renew.' }),
      node({ id: 'p_grace', branch: 'light', tier: 1, name: 'Grace', maxRank: 2, mods: { healPower: 0.08 }, desc: '+8% healing per rank.' }),
      node({ id: 'p_circle', branch: 'light', tier: 2, name: 'Circle of Light', unlocks: 'circle_of_light', desc: 'Unlocks Circle of Light.' }),
      node({ id: 'p_serenity', branch: 'light', tier: 2, name: 'Serenity', maxRank: 2, mods: { manaRegen: 1.2 }, desc: '+1.2 mana regen per rank.' }),
      node({ id: 'p_ward_divine', branch: 'light', tier: 3, name: 'Divine Ward', unlocks: 'divine_ward', desc: 'Unlocks Divine Ward.' }),

      node({ id: 'p_resolve', branch: 'ward', tier: 0, name: 'Resolve', maxRank: 3, mods: { resist: 22, vitality: 1 }, desc: '+22 resist, +1 vitality per rank.' }),
      node({ id: 'p_aegis', branch: 'ward', tier: 1, name: 'Aegis', unlocks: 'aegis', desc: 'Unlocks Aegis.' }),
      node({ id: 'p_barrier', branch: 'ward', tier: 1, name: 'Barrier', maxRank: 2, mods: { shieldPct: 0.12 }, desc: '+12% shield strength per rank.' }),
      node({ id: 'p_purge', branch: 'ward', tier: 2, name: 'Purge', unlocks: 'purge', desc: 'Unlocks Purge.' }),
      node({ id: 'p_sanctuary', branch: 'ward', tier: 2, name: 'Sanctuary', maxRank: 2, aura: { damageTakenPct: -0.05 }, desc: 'Squad aura: -5% damage taken per rank.' }),
      node({ id: 'p_guardian', branch: 'ward', tier: 3, name: 'Guardian Spirit', maxRank: 1, aura: { maxHpFlat: 60, resist: 40 }, desc: 'Squad aura: +60 max health, +40 resist.' }),

      node({ id: 'p_zeal', branch: 'wrath', tier: 0, name: 'Zeal', maxRank: 3, mods: { damagePct: 0.06 }, desc: '+6% damage per rank.' }),
      node({ id: 'p_castigate', branch: 'wrath', tier: 1, name: 'Castigate', maxRank: 2, mods: { critChance: 0.04 }, desc: '+4% crit per rank.' }),
      node({ id: 'p_conduit', branch: 'wrath', tier: 1, name: 'Conduit', maxRank: 2, mods: { cooldownPct: 0.06 }, desc: '+6% cooldown reduction per rank.' }),
      node({ id: 'p_atonement', branch: 'wrath', tier: 2, name: 'Atonement', maxRank: 2, mods: { atonement: 0.2 }, desc: 'Holy damage heals the lowest ally for 20% of it per rank.' }),
      node({ id: 'p_fervour', branch: 'wrath', tier: 2, name: 'Fervour', maxRank: 2, mods: { attackSpeedPct: 0.09 }, desc: '+9% attack speed per rank.' }),
      node({ id: 'p_judgement', branch: 'wrath', tier: 3, name: 'Judgement', maxRank: 1, mods: { damagePct: 0.15, critDamage: 0.25 }, desc: '+15% damage, +25% crit damage.' }),
    ],
  },

  rogue: {
    branches: [
      { id: 'assassination', name: 'Assassination', blurb: 'Killing one thing, quickly.' },
      { id: 'subtlety', name: 'Subtlety', blurb: 'Not being where the swing lands.' },
      { id: 'venom', name: 'Venom', blurb: 'Poison, bleeds and crowds.' },
    ],
    nodes: [
      node({ id: 'r_finesse', branch: 'assassination', tier: 0, name: 'Finesse', maxRank: 3, mods: { agility: 3 }, desc: '+3 agility per rank.' }),
      node({ id: 'r_opportunist', branch: 'assassination', tier: 1, name: 'Opportunist', maxRank: 2, mods: { critChance: 0.06 }, desc: '+6% crit chance per rank.' }),
      node({ id: 'r_exposed', branch: 'assassination', tier: 1, name: 'Exposed Weakness', maxRank: 2, mods: { armorPen: 70 }, desc: 'Ignore 70 enemy armour per rank.' }),
      node({ id: 'r_ambush', branch: 'assassination', tier: 2, name: 'Ambush', unlocks: 'ambush', desc: 'Unlocks Ambush.' }),
      node({ id: 'r_lethality', branch: 'assassination', tier: 2, name: 'Lethality', maxRank: 2, mods: { critDamage: 0.2 }, desc: '+20% crit damage per rank.' }),
      node({ id: 'r_deathmark', branch: 'assassination', tier: 3, name: 'Death Mark', unlocks: 'death_mark', desc: 'Unlocks Death Mark.' }),

      node({ id: 'r_lightfoot', branch: 'subtlety', tier: 0, name: 'Light Feet', maxRank: 3, mods: { moveSpeedPct: 0.05 }, desc: '+5% move speed per rank.' }),
      node({ id: 'r_slippery', branch: 'subtlety', tier: 1, name: 'Slippery', maxRank: 2, mods: { dodge: 0.06 }, desc: '+6% dodge per rank.' }),
      node({ id: 'r_shadows', branch: 'subtlety', tier: 1, name: 'Shadows', maxRank: 2, mods: { cooldownPct: 0.07 }, desc: '+7% cooldown reduction per rank.' }),
      node({ id: 'r_vanish', branch: 'subtlety', tier: 2, name: 'Vanish', unlocks: 'vanish', desc: 'Unlocks Vanish.' }),
      node({ id: 'r_evade', branch: 'subtlety', tier: 2, name: 'Evasive Training', maxRank: 2, mods: { dodge: 0.04, damageTakenPct: -0.05 }, desc: '+4% dodge and -5% damage taken per rank.' }),
      node({ id: 'r_ghost', branch: 'subtlety', tier: 3, name: 'Ghost', maxRank: 1, mods: { dodge: 0.12, moveSpeedPct: 0.1 }, desc: '+12% dodge and +10% move speed.' }),

      node({ id: 'r_toxin', branch: 'venom', tier: 0, name: 'Coated Steel', maxRank: 3, mods: { dotPct: 0.13 }, desc: '+13% damage-over-time per rank.' }),
      node({ id: 'r_poison', branch: 'venom', tier: 1, name: 'Poisoned Blade', unlocks: 'poisoned_blade', desc: 'Unlocks Poisoned Blade.' }),
      node({ id: 'r_fan', branch: 'venom', tier: 1, name: 'Fan of Knives', unlocks: 'fan_of_knives', desc: 'Unlocks Fan of Knives.' }),
      node({ id: 'r_wide', branch: 'venom', tier: 2, name: 'Wide Throw', maxRank: 2, mods: { aoeRadiusPct: 0.14 }, desc: '+14% area-effect radius per rank.' }),
      node({ id: 'r_bleed', branch: 'venom', tier: 2, name: 'Deep Cuts', maxRank: 2, mods: { dotPct: 0.16 }, desc: '+16% damage-over-time per rank.' }),
      node({ id: 'r_cutthroat', branch: 'venom', tier: 3, name: 'Cutthroat', maxRank: 1, mods: { damagePct: 0.14, lifesteal: 0.05 }, desc: '+14% damage and 5% lifesteal.' }),
    ],
  },

  berserker: {
    branches: [
      { id: 'fury', name: 'Fury', blurb: 'Speed and raw damage.' },
      { id: 'bloodrage', name: 'Bloodrage', blurb: 'Healing by hurting things.' },
      { id: 'warpath', name: 'Warpath', blurb: 'Reaching the fight and surviving it.' },
    ],
    nodes: [
      node({ id: 'b_brawn', branch: 'fury', tier: 0, name: 'Brawn', maxRank: 3, mods: { might: 4 }, desc: '+4 might per rank.' }),
      node({ id: 'b_savage', branch: 'fury', tier: 1, name: 'Savagery', maxRank: 2, mods: { attackSpeedPct: 0.09 }, desc: '+9% attack speed per rank.' }),
      node({ id: 'b_rampage', branch: 'fury', tier: 1, name: 'Rampage', unlocks: 'rampage', desc: 'Unlocks Rampage.' }),
      node({ id: 'b_brutality', branch: 'fury', tier: 2, name: 'Brutality', maxRank: 2, mods: { critDamage: 0.2, critChance: 0.03 }, desc: '+20% crit damage and +3% crit per rank.' }),
      node({ id: 'b_relentless', branch: 'fury', tier: 2, name: 'Relentless', maxRank: 2, mods: { damagePct: 0.08 }, desc: '+8% damage per rank.' }),
      node({ id: 'b_undying', branch: 'fury', tier: 3, name: 'Undying Rage', unlocks: 'undying_rage', desc: 'Unlocks Undying Rage.' }),

      node({ id: 'b_thirst', branch: 'bloodrage', tier: 0, name: 'Bloodthirsty', maxRank: 3, mods: { lifesteal: 0.04 }, desc: '+4% lifesteal per rank.' }),
      node({ id: 'b_bloodthirst', branch: 'bloodrage', tier: 1, name: 'Bloodthirst', unlocks: 'bloodthirst', desc: 'Unlocks Bloodthirst.' }),
      node({ id: 'b_hardy', branch: 'bloodrage', tier: 1, name: 'Hardy', maxRank: 2, mods: { maxHpFlat: 45 }, desc: '+45 max health per rank.' }),
      node({ id: 'b_thickhide', branch: 'bloodrage', tier: 2, name: 'Thick Hide', unlocks: 'thick_hide', desc: 'Unlocks Thick Hide.' }),
      node({ id: 'b_scartissue', branch: 'bloodrage', tier: 2, name: 'Scar Tissue', maxRank: 2, mods: { damageTakenPct: -0.06 }, desc: '-6% damage taken per rank.' }),
      node({ id: 'b_wildheart', branch: 'bloodrage', tier: 3, name: 'Wild Heart', maxRank: 1, mods: { lifesteal: 0.1, maxHpFlat: 80 }, desc: '+10% lifesteal and +80 max health.' }),

      node({ id: 'b_stride', branch: 'warpath', tier: 0, name: 'Long Stride', maxRank: 3, mods: { moveSpeedPct: 0.04, vitality: 1 }, desc: '+4% move speed and +1 vitality per rank.' }),
      node({ id: 'b_charge', branch: 'warpath', tier: 1, name: 'Charge', unlocks: 'charge', desc: 'Unlocks Charge.' }),
      node({ id: 'b_sweeping', branch: 'warpath', tier: 1, name: 'Sweeping Blows', maxRank: 2, mods: { aoeRadiusPct: 0.15 }, desc: '+15% area-effect radius per rank.' }),
      node({ id: 'b_warcry', branch: 'warpath', tier: 2, name: 'War Cry', maxRank: 2, aura: { damagePct: 0.05 }, desc: 'Squad aura: +5% damage per rank.' }),
      node({ id: 'b_bulk', branch: 'warpath', tier: 2, name: 'Bulk', maxRank: 2, mods: { armor: 40 }, desc: '+40 armour per rank.' }),
      node({ id: 'b_juggernaut', branch: 'warpath', tier: 3, name: 'Juggernaut', maxRank: 1, mods: { damageTakenPct: -0.1, moveSpeedPct: 0.08 }, desc: '-10% damage taken and +8% move speed.' }),
    ],
  },

  slayer: {
    branches: [
      { id: 'bane', name: 'Bane', blurb: 'Everything that makes a big target smaller.' },
      { id: 'ironclad', name: 'Ironclad', blurb: 'Standing in front of it and living.' },
      { id: 'execution', name: 'Execution', blurb: 'Finishing what is already hurt.' },
    ],
    nodes: [
      node({ id: 's_hunter', branch: 'bane', tier: 0, name: 'Hunter of Giants', maxRank: 3, mods: { armorPen: 55 }, desc: 'Ignore 55 enemy armour per rank.' }),
      node({ id: 's_overhead', branch: 'bane', tier: 1, name: 'Overhead Cleave', unlocks: 'overhead', desc: 'Unlocks Overhead Cleave.' }),
      node({ id: 's_weakpoint', branch: 'bane', tier: 1, name: 'Weak Point', maxRank: 2, mods: { critChance: 0.05 }, desc: '+5% crit chance per rank.' }),
      node({ id: 's_monster', branch: 'bane', tier: 2, name: 'Monster Hunter', unlocks: 'monster_hunter', desc: 'Unlocks Monster Hunter.' }),
      node({ id: 's_reach', branch: 'bane', tier: 2, name: 'Long Reach', maxRank: 2, mods: { rangeBonus: 14, might: 2 }, desc: '+14 attack range and +2 might per rank.' }),
      node({ id: 's_headsman', branch: 'bane', tier: 3, name: "Headsman's Toll", unlocks: 'headsman', desc: "Unlocks Headsman's Toll." }),

      node({ id: 's_hardened', branch: 'ironclad', tier: 0, name: 'Hardened', maxRank: 3, mods: { armor: 28, resist: 18 }, desc: '+28 armour and +18 resist per rank.' }),
      node({ id: 's_bracing', branch: 'ironclad', tier: 1, name: 'Bracing Stance', unlocks: 'bracing_stance', desc: 'Unlocks Bracing Stance.' }),
      node({ id: 's_stubborn', branch: 'ironclad', tier: 1, name: 'Stubborn', maxRank: 2, mods: { maxHpFlat: 40 }, desc: '+40 max health per rank.' }),
      node({ id: 's_unflinching', branch: 'ironclad', tier: 2, name: 'Unflinching', maxRank: 2, mods: { damageTakenPct: -0.07 }, desc: '-7% damage taken per rank.' }),
      node({ id: 's_secondwind', branch: 'ironclad', tier: 2, name: 'Second Wind', maxRank: 2, mods: { lifesteal: 0.04 }, desc: '+4% lifesteal per rank.' }),
      node({ id: 's_bulwark', branch: 'ironclad', tier: 3, name: 'Immovable', maxRank: 1, mods: { armor: 100, resist: 70 }, desc: '+100 armour and +70 resist.' }),

      node({ id: 's_edge', branch: 'execution', tier: 0, name: "Butcher's Edge", maxRank: 3, mods: { might: 3 }, desc: '+3 might per rank.' }),
      node({ id: 's_culling', branch: 'execution', tier: 1, name: 'Culling Blow', unlocks: 'culling', desc: 'Unlocks Culling Blow.' }),
      node({ id: 's_momentum', branch: 'execution', tier: 1, name: 'Momentum', maxRank: 2, mods: { attackSpeedPct: 0.08 }, desc: '+8% attack speed per rank.' }),
      node({ id: 's_ruthless', branch: 'execution', tier: 2, name: 'Ruthless', maxRank: 2, mods: { critDamage: 0.22 }, desc: '+22% crit damage per rank.' }),
      node({ id: 's_grim', branch: 'execution', tier: 2, name: 'Grim Resolve', maxRank: 2, aura: { critChance: 0.03 }, desc: 'Squad aura: +3% crit per rank.' }),
      node({ id: 's_slaughter', branch: 'execution', tier: 3, name: 'Slaughter', maxRank: 1, mods: { damagePct: 0.18 }, desc: '+18% damage dealt.' }),
    ],
  },

  paladin: {
    branches: [
      { id: 'oath', name: 'Oath', blurb: 'Mitigation and holding attention.' },
      { id: 'light', name: 'Light', blurb: 'Keeping the squad standing.' },
      { id: 'zealotry', name: 'Zealotry', blurb: 'Holy damage and squad auras.' },
    ],
    nodes: [
      node({ id: 'pa_vows', branch: 'oath', tier: 0, name: 'Vows', maxRank: 3, mods: { armor: 26, vitality: 2 }, desc: '+26 armour and +2 vitality per rank.' }),
      node({ id: 'pa_oath', branch: 'oath', tier: 1, name: "Guardian's Oath", unlocks: 'guardians_oath', desc: "Unlocks Guardian's Oath." }),
      node({ id: 'pa_shieldwall', branch: 'oath', tier: 1, name: 'Shield Wall', maxRank: 2, mods: { blockChance: 0.06 }, desc: '+6% block chance per rank.' }),
      node({ id: 'pa_steadfast', branch: 'oath', tier: 2, name: 'Steadfast', maxRank: 2, mods: { damageTakenPct: -0.06 }, desc: '-6% damage taken per rank.' }),
      node({ id: 'pa_aegis', branch: 'oath', tier: 2, name: 'Warded Plate', maxRank: 2, mods: { resist: 30 }, desc: '+30 resist per rank.' }),
      node({ id: 'pa_intervention', branch: 'oath', tier: 3, name: 'Divine Intervention', unlocks: 'divine_intervention', desc: 'Unlocks Divine Intervention.' }),

      node({ id: 'pa_devotion', branch: 'light', tier: 0, name: 'Devotion', maxRank: 3, mods: { spirit: 3 }, desc: '+3 spirit per rank.' }),
      node({ id: 'pa_sanctified', branch: 'light', tier: 1, name: 'Sanctified Ground', unlocks: 'sanctified_ground', desc: 'Unlocks Sanctified Ground.' }),
      node({ id: 'pa_mercy', branch: 'light', tier: 1, name: 'Mercy', maxRank: 2, mods: { healPower: 0.09 }, desc: '+9% healing per rank.' }),
      node({ id: 'pa_atonement', branch: 'light', tier: 2, name: 'Atonement', maxRank: 2, mods: { atonement: 0.18 }, desc: 'Holy damage heals the lowest ally for 18% of it per rank.' }),
      node({ id: 'pa_sanctuary', branch: 'light', tier: 2, name: 'Sanctuary', maxRank: 2, aura: { damageTakenPct: -0.05 }, desc: 'Squad aura: -5% damage taken per rank.' }),
      node({ id: 'pa_beacon', branch: 'light', tier: 3, name: 'Beacon', maxRank: 1, aura: { maxHpFlat: 55, healPower: 0.1 }, desc: 'Squad aura: +55 max health and +10% healing.' }),

      node({ id: 'pa_zeal', branch: 'zealotry', tier: 0, name: 'Zeal', maxRank: 3, mods: { might: 3 }, desc: '+3 might per rank.' }),
      node({ id: 'pa_hammer', branch: 'zealotry', tier: 1, name: 'Hammer of Faith', unlocks: 'hammer_of_faith', desc: 'Unlocks Hammer of Faith.' }),
      node({ id: 'pa_fervour', branch: 'zealotry', tier: 1, name: 'Fervour', maxRank: 2, mods: { attackSpeedPct: 0.07 }, desc: '+7% attack speed per rank.' }),
      node({ id: 'pa_blessing', branch: 'zealotry', tier: 2, name: 'Blessing of Arms', unlocks: 'blessing', desc: 'Unlocks Blessing of Arms.' }),
      node({ id: 'pa_wrath', branch: 'zealotry', tier: 2, name: 'Wrath', maxRank: 2, mods: { damagePct: 0.07 }, desc: '+7% damage per rank.' }),
      node({ id: 'pa_crusader', branch: 'zealotry', tier: 3, name: 'Crusader', maxRank: 1, aura: { damagePct: 0.08, cooldownPct: 0.06 }, desc: 'Squad aura: +8% damage and 6% cooldown reduction.' }),
    ],
  },

  necromancer: {
    branches: [
      { id: 'blight', name: 'Blight', blurb: 'Rot that does the work over time.' },
      { id: 'unlife', name: 'Unlife', blurb: 'Taking health back off the field.' },
      { id: 'command', name: 'Command', blurb: 'Curses and crowds.' },
    ],
    nodes: [
      node({ id: 'n_decay', branch: 'blight', tier: 0, name: 'Decay', maxRank: 3, mods: { dotPct: 0.14 }, desc: '+14% damage-over-time per rank.' }),
      node({ id: 'n_plague', branch: 'blight', tier: 1, name: 'Plague', unlocks: 'plague', desc: 'Unlocks Plague.' }),
      node({ id: 'n_virulence', branch: 'blight', tier: 1, name: 'Virulence', maxRank: 2, mods: { spirit: 3 }, desc: '+3 spirit per rank.' }),
      node({ id: 'n_wasting', branch: 'blight', tier: 2, name: 'Wasting', maxRank: 2, mods: { dotPct: 0.17 }, desc: '+17% damage-over-time per rank.' }),
      node({ id: 'n_spread', branch: 'blight', tier: 2, name: 'Contagion', maxRank: 2, mods: { aoeRadiusPct: 0.15 }, desc: '+15% area-effect radius per rank.' }),
      node({ id: 'n_harvest', branch: 'blight', tier: 3, name: 'Soul Harvest', unlocks: 'soul_harvest', desc: 'Unlocks Soul Harvest.' }),

      node({ id: 'n_leech', branch: 'unlife', tier: 0, name: 'Leech', maxRank: 3, mods: { lifesteal: 0.035 }, desc: '+3.5% lifesteal per rank.' }),
      node({ id: 'n_drain', branch: 'unlife', tier: 1, name: 'Drain Life', unlocks: 'drain_life', desc: 'Unlocks Drain Life.' }),
      node({ id: 'n_bonearmor', branch: 'unlife', tier: 1, name: 'Bone Armour', unlocks: 'bone_armor', desc: 'Unlocks Bone Armour.' }),
      node({ id: 'n_ossify', branch: 'unlife', tier: 2, name: 'Ossify', maxRank: 2, mods: { shieldPct: 0.14 }, desc: '+14% shield strength per rank.' }),
      node({ id: 'n_grave', branch: 'unlife', tier: 2, name: 'Grave Vigour', maxRank: 2, mods: { maxHpFlat: 40, resist: 20 }, desc: '+40 max health and +20 resist per rank.' }),
      node({ id: 'n_undeath', branch: 'unlife', tier: 3, name: 'Undeath', maxRank: 1, mods: { lifesteal: 0.1, damageTakenPct: -0.08 }, desc: '+10% lifesteal and -8% damage taken.' }),

      node({ id: 'n_dread', branch: 'command', tier: 0, name: 'Dread', maxRank: 3, mods: { damagePct: 0.06 }, desc: '+6% damage per rank.' }),
      node({ id: 'n_curse', branch: 'command', tier: 1, name: 'Curse of Weakness', unlocks: 'curse_of_weakness', desc: 'Unlocks Curse of Weakness.' }),
      node({ id: 'n_conduit', branch: 'command', tier: 1, name: 'Dark Conduit', maxRank: 2, mods: { cooldownPct: 0.06, manaRegen: 0.9 }, desc: '+6% cooldown reduction and +0.9 mana regen per rank.' }),
      node({ id: 'n_dominion', branch: 'command', tier: 2, name: 'Dominion', maxRank: 2, aura: { damagePct: 0.05 }, desc: 'Squad aura: +5% damage per rank.' }),
      node({ id: 'n_shroud', branch: 'command', tier: 2, name: 'Shroud', maxRank: 2, aura: { resist: 25 }, desc: 'Squad aura: +25 resist per rank.' }),
      node({ id: 'n_lichborn', branch: 'command', tier: 3, name: 'Lichborn', maxRank: 1, mods: { damagePct: 0.14, critDamage: 0.2 }, desc: '+14% damage and +20% crit damage.' }),
    ],
  },

  ice_mage: {
    branches: [
      { id: 'frost', name: 'Frost', blurb: 'Direct cold damage.' },
      { id: 'winter', name: 'Winter', blurb: 'Slows, freezes and area denial.' },
      { id: 'rime', name: 'Rime', blurb: 'Wards and staying alive at range.' },
    ],
    nodes: [
      node({ id: 'i_focus', branch: 'frost', tier: 0, name: 'Cold Focus', maxRank: 3, mods: { spirit: 3 }, desc: '+3 spirit per rank.' }),
      node({ id: 'i_lance', branch: 'frost', tier: 1, name: 'Ice Lance', unlocks: 'ice_lance', desc: 'Unlocks Ice Lance.' }),
      node({ id: 'i_shatter', branch: 'frost', tier: 1, name: 'Shatter', maxRank: 2, mods: { critChance: 0.05 }, desc: '+5% crit chance per rank.' }),
      node({ id: 'i_cone', branch: 'frost', tier: 2, name: 'Cone of Cold', unlocks: 'cone_of_cold', desc: 'Unlocks Cone of Cold.' }),
      node({ id: 'i_piercing', branch: 'frost', tier: 2, name: 'Piercing Cold', maxRank: 2, mods: { damagePct: 0.07 }, desc: '+7% damage per rank.' }),
      node({ id: 'i_absolute', branch: 'frost', tier: 3, name: 'Absolute Zero', maxRank: 1, mods: { damagePct: 0.13, critDamage: 0.22 }, desc: '+13% damage and +22% crit damage.' }),

      node({ id: 'i_chill', branch: 'winter', tier: 0, name: 'Deepening Chill', maxRank: 3, mods: { aoeRadiusPct: 0.1 }, desc: '+10% area-effect radius per rank.' }),
      node({ id: 'i_blizzard', branch: 'winter', tier: 1, name: 'Blizzard', unlocks: 'blizzard', desc: 'Unlocks Blizzard.' }),
      node({ id: 'i_permafrost', branch: 'winter', tier: 1, name: 'Permafrost', maxRank: 2, mods: { dotPct: 0.15 }, desc: '+15% damage-over-time per rank.' }),
      node({ id: 'i_deepfreeze', branch: 'winter', tier: 2, name: 'Deep Freeze', unlocks: 'deep_freeze', desc: 'Unlocks Deep Freeze.' }),
      node({ id: 'i_glacial', branch: 'winter', tier: 2, name: 'Glacial Pace', maxRank: 2, mods: { cooldownPct: 0.07 }, desc: '+7% cooldown reduction per rank.' }),
      node({ id: 'i_winterborn', branch: 'winter', tier: 3, name: 'Winterborn', maxRank: 1, aura: { damagePct: 0.07, critChance: 0.04 }, desc: 'Squad aura: +7% damage and +4% crit.' }),

      node({ id: 'i_ward', branch: 'rime', tier: 0, name: 'Rimeguard', maxRank: 3, mods: { resist: 24, vitality: 1 }, desc: '+24 resist and +1 vitality per rank.' }),
      node({ id: 'i_frostward', branch: 'rime', tier: 1, name: 'Frost Ward', unlocks: 'frost_ward', desc: 'Unlocks Frost Ward.' }),
      node({ id: 'i_barrier', branch: 'rime', tier: 1, name: 'Ice Barrier', maxRank: 2, mods: { shieldPct: 0.13 }, desc: '+13% shield strength per rank.' }),
      node({ id: 'i_drift', branch: 'rime', tier: 2, name: 'Snowdrift', maxRank: 2, mods: { moveSpeedPct: 0.05, dodge: 0.03 }, desc: '+5% move speed and +3% dodge per rank.' }),
      node({ id: 'i_clarity', branch: 'rime', tier: 2, name: 'Clarity', maxRank: 2, mods: { manaRegen: 1.3 }, desc: '+1.3 mana regen per rank.' }),
      node({ id: 'i_hoarfrost', branch: 'rime', tier: 3, name: 'Hoarfrost', maxRank: 1, aura: { resist: 40, damageTakenPct: -0.06 }, desc: 'Squad aura: +40 resist and -6% damage taken.' }),
    ],
  },

  fire_mage: {
    branches: [
      { id: 'pyromancy', name: 'Pyromancy', blurb: 'The biggest numbers available.' },
      { id: 'cinders', name: 'Cinders', blurb: 'Burns that keep working.' },
      { id: 'flashfire', name: 'Flashfire', blurb: 'Not dying to whatever reaches you.' },
    ],
    nodes: [
      node({ id: 'f_kindle', branch: 'pyromancy', tier: 0, name: 'Kindle', maxRank: 3, mods: { spirit: 3 }, desc: '+3 spirit per rank.' }),
      node({ id: 'f_flamestrike', branch: 'pyromancy', tier: 1, name: 'Flamestrike', unlocks: 'flamestrike', desc: 'Unlocks Flamestrike.' }),
      node({ id: 'f_incinerate', branch: 'pyromancy', tier: 1, name: 'Incinerate', maxRank: 2, mods: { damagePct: 0.08 }, desc: '+8% damage per rank.' }),
      node({ id: 'f_combustion', branch: 'pyromancy', tier: 2, name: 'Combustion', unlocks: 'combustion', desc: 'Unlocks Combustion.' }),
      node({ id: 'f_critical', branch: 'pyromancy', tier: 2, name: 'Critical Mass', maxRank: 2, mods: { critChance: 0.06 }, desc: '+6% crit chance per rank.' }),
      node({ id: 'f_meteor', branch: 'pyromancy', tier: 3, name: 'Meteor', unlocks: 'meteor', desc: 'Unlocks Meteor.' }),

      node({ id: 'f_smoulder', branch: 'cinders', tier: 0, name: 'Smoulder', maxRank: 3, mods: { dotPct: 0.15 }, desc: '+15% damage-over-time per rank.' }),
      node({ id: 'f_scorch', branch: 'cinders', tier: 1, name: 'Scorch', unlocks: 'scorch', desc: 'Unlocks Scorch.' }),
      node({ id: 'f_conflagrate', branch: 'cinders', tier: 1, name: 'Conflagrate', maxRank: 2, mods: { aoeRadiusPct: 0.14 }, desc: '+14% area-effect radius per rank.' }),
      node({ id: 'f_emberstorm', branch: 'cinders', tier: 2, name: 'Emberstorm', maxRank: 2, mods: { dotPct: 0.18 }, desc: '+18% damage-over-time per rank.' }),
      node({ id: 'f_backdraft', branch: 'cinders', tier: 2, name: 'Backdraft', maxRank: 2, mods: { cooldownPct: 0.07 }, desc: '+7% cooldown reduction per rank.' }),
      node({ id: 'f_immolation', branch: 'cinders', tier: 3, name: 'Immolation', maxRank: 1, aura: { damagePct: 0.08 }, desc: 'Squad aura: +8% damage.' }),

      node({ id: 'f_quick', branch: 'flashfire', tier: 0, name: 'Quickstep', maxRank: 3, mods: { moveSpeedPct: 0.05 }, desc: '+5% move speed per rank.' }),
      node({ id: 'f_blazing', branch: 'flashfire', tier: 1, name: 'Blazing Speed', unlocks: 'blazing_speed', desc: 'Unlocks Blazing Speed.' }),
      node({ id: 'f_wardflame', branch: 'flashfire', tier: 1, name: 'Ward of Flame', maxRank: 2, mods: { resist: 26 }, desc: '+26 resist per rank.' }),
      node({ id: 'f_evasive', branch: 'flashfire', tier: 2, name: 'Heat Haze', maxRank: 2, mods: { dodge: 0.05 }, desc: '+5% dodge per rank.' }),
      node({ id: 'f_furnace', branch: 'flashfire', tier: 2, name: 'Inner Furnace', maxRank: 2, mods: { maxHpFlat: 35, manaRegen: 1.0 }, desc: '+35 max health and +1 mana regen per rank.' }),
      node({ id: 'f_phoenix', branch: 'flashfire', tier: 3, name: 'Phoenix', maxRank: 1, mods: { dodge: 0.1, damageTakenPct: -0.1 }, desc: '+10% dodge and -10% damage taken.' }),
    ],
  },

  lightning_mage: {
    branches: [
      { id: 'storm', name: 'Storm', blurb: 'Hitting everything at once.' },
      { id: 'current', name: 'Current', blurb: 'Casting more often than anyone else.' },
      { id: 'conduit', name: 'Conduit', blurb: 'Shields and squad auras.' },
    ],
    nodes: [
      node({ id: 'l_charge', branch: 'storm', tier: 0, name: 'Charged', maxRank: 3, mods: { spirit: 3 }, desc: '+3 spirit per rank.' }),
      node({ id: 'l_chain', branch: 'storm', tier: 1, name: 'Chain Lightning', unlocks: 'chain_lightning', desc: 'Unlocks Chain Lightning.' }),
      node({ id: 'l_forked', branch: 'storm', tier: 1, name: 'Forked', maxRank: 2, mods: { aoeRadiusPct: 0.15 }, desc: '+15% area-effect radius per rank.' }),
      node({ id: 'l_overcharge', branch: 'storm', tier: 2, name: 'Overcharge', unlocks: 'overcharge', desc: 'Unlocks Overcharge.' }),
      node({ id: 'l_voltage', branch: 'storm', tier: 2, name: 'High Voltage', maxRank: 2, mods: { damagePct: 0.07 }, desc: '+7% damage per rank.' }),
      node({ id: 'l_tempest', branch: 'storm', tier: 3, name: 'Lightning Storm', unlocks: 'lightning_storm', desc: 'Unlocks Lightning Storm.' }),

      node({ id: 'l_flow', branch: 'current', tier: 0, name: 'Flow', maxRank: 3, mods: { cooldownPct: 0.05 }, desc: '+5% cooldown reduction per rank.' }),
      node({ id: 'l_static', branch: 'current', tier: 1, name: 'Static Field', unlocks: 'static_field', desc: 'Unlocks Static Field.' }),
      node({ id: 'l_quickcast', branch: 'current', tier: 1, name: 'Quickcast', maxRank: 2, mods: { attackSpeedPct: 0.1 }, desc: '+10% attack speed per rank.' }),
      node({ id: 'l_capacitor', branch: 'current', tier: 2, name: 'Capacitor', maxRank: 2, mods: { manaRegen: 1.4 }, desc: '+1.4 mana regen per rank.' }),
      node({ id: 'l_arcing', branch: 'current', tier: 2, name: 'Arcing', maxRank: 2, mods: { critChance: 0.05 }, desc: '+5% crit chance per rank.' }),
      node({ id: 'l_livewire', branch: 'current', tier: 3, name: 'Live Wire', maxRank: 1, mods: { attackSpeedPct: 0.2, moveSpeedPct: 0.08 }, desc: '+20% attack speed and +8% move speed.' }),

      node({ id: 'l_insulate', branch: 'conduit', tier: 0, name: 'Insulation', maxRank: 3, mods: { resist: 22, vitality: 1 }, desc: '+22 resist and +1 vitality per rank.' }),
      node({ id: 'l_shield', branch: 'conduit', tier: 1, name: 'Storm Shield', unlocks: 'storm_shield', desc: 'Unlocks Storm Shield.' }),
      node({ id: 'l_grounding', branch: 'conduit', tier: 1, name: 'Grounding', maxRank: 2, mods: { shieldPct: 0.13 }, desc: '+13% shield strength per rank.' }),
      node({ id: 'l_earthing', branch: 'conduit', tier: 2, name: 'Earthing', maxRank: 2, aura: { resist: 24 }, desc: 'Squad aura: +24 resist per rank.' }),
      node({ id: 'l_surge', branch: 'conduit', tier: 2, name: 'Surge', maxRank: 2, aura: { moveSpeedPct: 0.05 }, desc: 'Squad aura: +5% move speed per rank.' }),
      node({ id: 'l_stormcaller', branch: 'conduit', tier: 3, name: 'Stormcaller', maxRank: 1, aura: { cooldownPct: 0.08, damagePct: 0.06 }, desc: 'Squad aura: +8% cooldown reduction and +6% damage.' }),
    ],
  },
};

export const nodesForClass = (classId) => TREES[classId].nodes;
export const nodeById = (classId, id) => TREES[classId].nodes.find((n) => n.id === id);

/** Points spent in a branch, from a `{nodeId: rank}` allocation map. */
export function pointsInBranch(classId, alloc, branchId) {
  let sum = 0;
  for (const n of TREES[classId].nodes) {
    if (n.branch === branchId) sum += (alloc[n.id] ?? 0) * n.cost;
  }
  return sum;
}

export function totalPointsSpent(classId, alloc) {
  let sum = 0;
  for (const n of TREES[classId].nodes) sum += (alloc[n.id] ?? 0) * n.cost;
  return sum;
}

/** Why a node cannot be ranked up right now, or null if it can. */
export function nodeBlocker(classId, alloc, node, availablePoints) {
  const rank = alloc[node.id] ?? 0;
  if (rank >= node.maxRank) return 'Maxed';
  if (availablePoints < node.cost) return 'No points';
  const inBranch = pointsInBranch(classId, alloc, node.branch);
  if (inBranch < node.tierReq) return `Needs ${node.tierReq} in ${node.branch}`;
  return null;
}

/** Spells unlocked by the current allocation, on top of the class starters. */
export function unlockedSpells(classId, alloc, startingSpells) {
  const set = new Set(startingSpells);
  for (const n of TREES[classId].nodes) {
    if (n.unlocks && (alloc[n.id] ?? 0) > 0) set.add(n.unlocks);
  }
  return [...set];
}
