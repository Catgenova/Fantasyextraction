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
