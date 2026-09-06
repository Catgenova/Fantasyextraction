// Autobattle tactics. This is the player's real input into a fight: they never
// steer a hero directly, they write the rules the hero fights by.
//
// Each entry below drives both the loadout UI and the in-match AI.

export const STANCES = {
  aggressive: { id: 'aggressive', name: 'Aggressive', desc: 'Push toward targets, hold ground, ignore chip damage.', engageBonus: 60, retreatBias: -0.12, damagePct: 0.08, damageTakenPct: 0.08 },
  balanced: { id: 'balanced', name: 'Balanced', desc: 'Fight at the edge of your range, disengage when losing.', engageBonus: 0, retreatBias: 0, damagePct: 0, damageTakenPct: 0 },
  defensive: { id: 'defensive', name: 'Defensive', desc: 'Stay near the squad, prioritise survival over damage.', engageBonus: -50, retreatBias: 0.1, damagePct: -0.06, damageTakenPct: -0.1 },
  evasive: { id: 'evasive', name: 'Evasive', desc: 'Kite constantly, never trade in melee.', engageBonus: -90, retreatBias: 0.2, damagePct: -0.1, damageTakenPct: -0.05, kite: true },
};

export const TARGET_PRIORITIES = {
  closest: { id: 'closest', name: 'Closest', desc: 'Hit whatever is nearest.' },
  lowest_hp: { id: 'lowest_hp', name: 'Lowest health', desc: 'Finish wounded targets first.' },
  highest_threat: { id: 'highest_threat', name: 'Biggest threat', desc: 'Focus whatever is hitting the squad hardest.' },
  ranged_first: { id: 'ranged_first', name: 'Ranged first', desc: 'Dive archers and casters.' },
  elites_first: { id: 'elites_first', name: 'Elites & bosses', desc: 'Commit to the big target.' },
  players_first: { id: 'players_first', name: 'Rival squads', desc: 'Always prefer enemy heroes over PvE.' },
};

// Loot filters are expressed in rarity, not in an opaque score, so what the
// player picks in the UI is exactly what they see happen on the ground.
export const LOOT_POLICIES = {
  greedy: { id: 'greedy', name: 'Take everything', minRarity: 'common', desc: 'Every drop within reach, commons included.' },
  valuable: { id: 'valuable', name: 'Uncommon and better', minRarity: 'uncommon', desc: 'Skip grey trash, keep everything else.' },
  upgrades: { id: 'upgrades', name: 'Rare and better', minRarity: 'rare', desc: 'Only the good stuff. Bags stay light.' },
  ignore: { id: 'ignore', name: 'Ignore loot', minRarity: null, desc: 'Never stop to loot.' },
};

export const SPELL_POLICIES = {
  auto: { id: 'auto', name: 'Auto', desc: 'Cast whenever the situation fits.' },
  emergency: { id: 'emergency', name: 'Emergency', desc: 'Hold until the squad is in real trouble.' },
  never: { id: 'never', name: 'Hold', desc: 'Never cast automatically.' },
};

export const FORMATIONS = {
  tight: { id: 'tight', name: 'Tight', spacing: 46, desc: 'Everyone hugs the leader. Good for healing, bad against area damage.' },
  spread: { id: 'spread', name: 'Spread', spacing: 108, desc: 'Wide spacing. Survives area damage, harder to heal.' },
  line: { id: 'line', name: 'Vanguard', spacing: 74, frontline: true, desc: 'Frontline forward, ranged behind.' },
};

export const SQUAD_PLANS = {
  farm: { id: 'farm', name: 'Farm the ring', desc: 'Clear trash in safer zones and bank a steady haul.', zoneBias: 0, aggression: 0.4 },
  boss: { id: 'boss', name: 'Boss hunt', desc: 'Push the core for boss loot. Highest risk, highest reward.', zoneBias: 2, aggression: 0.8 },
  events: { id: 'events', name: 'Event chaser', desc: 'Move to whichever world event is live.', zoneBias: 1, aggression: 0.6, chaseEvents: true },
  pvp: { id: 'pvp', name: 'Squad hunter', desc: 'Track rival squads and take their bags.', zoneBias: 1, aggression: 0.9, huntPlayers: true },
};

export const EXTRACT_PLANS = {
  asap: { id: 'asap', name: 'Extract early', desc: 'Head for the exit as soon as bags have anything worth keeping.', triggerAt: 900 },
  half: { id: 'half', name: 'Mid raid', desc: 'Run the raid then leave with time to spare.', triggerAt: 1200 },
  late: { id: 'late', name: 'Full timer', desc: 'Stay until the collapse forces the issue.', triggerAt: 1500 },
  loot_goal: { id: 'loot_goal', name: 'On full bags', desc: 'Leave once the squad inventory is full.', triggerAt: 1500, onFull: true },
};

export const BACKPACK_SLOTS = 8;

/** Tactics for a single hero. */
export function defaultHeroTactics(classId) {
  const byClass = {
    knight: { stance: 'aggressive', priority: 'highest_threat', lootPolicy: 'greedy', retreatHpPct: 0.18, potionHpPct: 0.45 },
    archer: { stance: 'evasive', priority: 'lowest_hp', lootPolicy: 'valuable', retreatHpPct: 0.35, potionHpPct: 0.5 },
    priest: { stance: 'defensive', priority: 'closest', lootPolicy: 'valuable', retreatHpPct: 0.4, potionHpPct: 0.55 },
  }[classId];
  return { ...byClass, focusFire: true, spellPolicy: {} };
}

/** Tactics for the squad as a whole. */
export function defaultSquadTactics() {
  return {
    formation: 'line',
    plan: 'farm',
    extractPlan: 'half',
    leaderIndex: 0,
    avoidPlayers: false,
  };
}
