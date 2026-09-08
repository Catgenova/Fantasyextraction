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

// Filters are expressed in carve quality, not in an opaque score, so what the
// player picks is exactly what they see kept.
export const LOOT_POLICIES = {
  greedy: { id: 'greedy', name: 'Keep everything', minQuality: 'ragged', desc: 'Every carve, however poor.' },
  valuable: { id: 'valuable', name: 'Sound and better', minQuality: 'sound', desc: 'Leave the ragged cuts behind.' },
  upgrades: { id: 'upgrades', name: 'Fine and better', minQuality: 'fine', desc: 'Only what the smith can really use.' },
  ignore: { id: 'ignore', name: 'Carve nothing', minQuality: null, desc: 'Never stop to cut up a corpse.' },
};

/**
 * Squad-wide floor on what is worth stopping for, set in Squad orders and
 * adjustable mid-raid. It combines with each hero's own loot policy rather
 * than replacing it: an item has to clear both, so the squad order can tighten
 * a greedy hero but never loosens a picky one.
 */
export const LOOT_FLOORS = {
  any: { id: 'any', name: 'Anything', minQuality: 'ragged', desc: 'Whatever each hero wants, ragged cuts included.' },
  sound: { id: 'sound', name: 'Sound and better', minQuality: 'sound', desc: 'Nobody stops for a ruined cut.' },
  fine: { id: 'fine', name: 'Fine and better', minQuality: 'fine', desc: 'Bags stay light for the walk out.' },
  pristine: { id: 'pristine', name: 'Pristine and better', minQuality: 'pristine', desc: 'Only what a solo hunt yields.' },
  mythic: { id: 'mythic', name: 'Mythic only', minQuality: 'mythic', desc: 'Walk past everything else.' },
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

/**
 * The level at which a squad is ready for each boss tier. It gates two things
 * that have to agree: which arena a boss hunt walks to, and which unlockable
 * classes a rival squad may field (a class is earned from a boss of that
 * tier, so a rival deep enough to have killed it is deep enough to field it).
 *
 * Without the first of those, "boss hunt" sent a level-5 squad past the outer
 * boss it could actually kill and into the core, where eight runs out of eight
 * wiped with nothing to show. Indexed by boss tier.
 */
export const READY_FOR_BOSS_TIER = [4, 8, 12];

// Pack size is no longer a constant: it comes from the pouch a hero is
// wearing. See `packCapacity` in src/data/gear.js.

/**
 * Compass headings for in-raid navigation. The canvas y axis grows downward,
 * so north is negative y.
 *
 * A heading is a sustained order, not a destination: the squad keeps walking
 * that way until they reach the edge of the map or you tell them otherwise.
 */
const SQRT_HALF = Math.SQRT1_2;
export const HEADINGS = {
  nw: { id: 'nw', name: 'North-west', short: 'NW', dir: { x: -SQRT_HALF, y: -SQRT_HALF } },
  n:  { id: 'n',  name: 'North',      short: 'N',  dir: { x: 0, y: -1 } },
  ne: { id: 'ne', name: 'North-east', short: 'NE', dir: { x: SQRT_HALF, y: -SQRT_HALF } },
  w:  { id: 'w',  name: 'West',       short: 'W',  dir: { x: -1, y: 0 } },
  e:  { id: 'e',  name: 'East',       short: 'E',  dir: { x: 1, y: 0 } },
  sw: { id: 'sw', name: 'South-west', short: 'SW', dir: { x: -SQRT_HALF, y: SQRT_HALF } },
  s:  { id: 's',  name: 'South',      short: 'S',  dir: { x: 0, y: 1 } },
  se: { id: 'se', name: 'South-east', short: 'SE', dir: { x: SQRT_HALF, y: SQRT_HALF } },
};

/** How far ahead a heading order projects its destination each time it is read. */
export const HEADING_REACH = 1400;

// --- Squad cohesion --------------------------------------------------------
// The leader walks the navigation; everyone else stays with the leader. These
// govern how far apart that is allowed to get before the leader gives way.

// These are distances from the leader. Two followers on opposite sides make
// the squad twice as wide as any single number here, so they are set at about
// half of how far apart the squad should ever actually look.
export const COHESION = {
  /** Leader stops advancing once the furthest follower is beyond this. */
  waitAt: 200,
  /** Leader turns around and walks back once they are beyond this. */
  returnAt: 430,
  /** Leader resumes only once everyone is back inside this — hysteresis, so
   *  the squad does not stutter forward and back on the boundary. */
  resumeAt: 120,
  /** A follower past this drops everything and rejoins. */
  followMax: 250,
  /** How far from the leader a follower will chase a target. Must stay under
   *  `waitAt`: a follower allowed to roam further than the distance that
   *  stops the leader can hold the whole squad frozen indefinitely. */
  chaseLeash: 170,
  /** Leader's pace while the squad is strung out. Never zero: a leader that
   *  stops dead can be held there forever by a follower that also thinks it
   *  is where it should be. Crawling always resolves, because followers close
   *  at full speed. */
  slowPace: 0.25,
  /** Seconds of pacing before the leader gives up and walks back instead. */
  escalateAfter: 6,
};

/**
 * What each class does when nobody is telling it otherwise.
 *
 * Exported because the table is the thing that has to stay in step with
 * CLASSES, and `defaultHeroTactics` deliberately papers over a gap — a test
 * that only went through the function could not see a missing row.
 * `test-achievements.js` asserts this object covers every class id.
 */
export const CLASS_TACTICS = {
  knight: { stance: 'aggressive', priority: 'highest_threat', lootPolicy: 'greedy', retreatHpPct: 0.18, potionHpPct: 0.45 },
  archer: { stance: 'evasive', priority: 'lowest_hp', lootPolicy: 'valuable', retreatHpPct: 0.35, potionHpPct: 0.5 },
  priest: { stance: 'defensive', priority: 'closest', lootPolicy: 'valuable', retreatHpPct: 0.4, potionHpPct: 0.55 },
  rogue: { stance: 'aggressive', priority: 'lowest_hp', lootPolicy: 'greedy', retreatHpPct: 0.4, potionHpPct: 0.5 },
  berserker: { stance: 'aggressive', priority: 'closest', lootPolicy: 'greedy', retreatHpPct: 0.2, potionHpPct: 0.4 },
  slayer: { stance: 'aggressive', priority: 'highest_threat', lootPolicy: 'valuable', retreatHpPct: 0.25, potionHpPct: 0.45 },
  paladin: { stance: 'defensive', priority: 'highest_threat', lootPolicy: 'greedy', retreatHpPct: 0.2, potionHpPct: 0.5 },
  necromancer: { stance: 'balanced', priority: 'highest_threat', lootPolicy: 'valuable', retreatHpPct: 0.35, potionHpPct: 0.5 },
  ice_mage: { stance: 'defensive', priority: 'closest', lootPolicy: 'valuable', retreatHpPct: 0.38, potionHpPct: 0.55 },
  fire_mage: { stance: 'evasive', priority: 'lowest_hp', lootPolicy: 'valuable', retreatHpPct: 0.45, potionHpPct: 0.6 },
  lightning_mage: { stance: 'evasive', priority: 'lowest_hp', lootPolicy: 'valuable', retreatHpPct: 0.4, potionHpPct: 0.55 },
  warden: { stance: 'defensive', priority: 'highest_threat', lootPolicy: 'greedy', retreatHpPct: 0.2, potionHpPct: 0.5 },
  lancer: { stance: 'balanced', priority: 'elites_first', lootPolicy: 'valuable', retreatHpPct: 0.3, potionHpPct: 0.5 },
  // A Monk hits faster the longer it has been moving, so it takes the
  // nearest thing and keeps going rather than crossing the field for a
  // better target. Light armour, so it leaves early.
  monk: { stance: 'aggressive', priority: 'closest', lootPolicy: 'greedy', retreatHpPct: 0.35, potionHpPct: 0.5 },
  // An Alchemist wins fights that have already finished: everything it
  // throws keeps working after it lands, so it starts on whatever is
  // closest to dying and drinks early, because it cannot take a hit.
  alchemist: { stance: 'evasive', priority: 'lowest_hp', lootPolicy: 'valuable', retreatHpPct: 0.45, potionHpPct: 0.6 },
  // A Warlord is worth more to the other two than to itself. It stands
  // where the squad has to be anyway, holds the thing hitting hardest, and
  // is the last one to leave.
  warlord: { stance: 'defensive', priority: 'highest_threat', lootPolicy: 'greedy', retreatHpPct: 0.18, potionHpPct: 0.5 },
  // ---- The second ten ------------------------------------------------------
  // Written to the class rather than to a template. The two that matter most
  // are retreatHpPct and potionHpPct: a class that never leaves and a class
  // that leaves early are different classes even with the same spell list.
  //
  // A Druid holds ground it has prepared, so it leaves late for a caster.
  druid: { stance: 'defensive', priority: 'closest', lootPolicy: 'valuable', retreatHpPct: 0.36, potionHpPct: 0.55 },
  // Longest range in the game, thinnest armour to go with it.
  beastmaster: { stance: 'evasive', priority: 'lowest_hp', lootPolicy: 'valuable', retreatHpPct: 0.42, potionHpPct: 0.55 },
  // Worth more standing than fighting: it drinks early and goes late.
  shaman: { stance: 'defensive', priority: 'closest', lootPolicy: 'valuable', retreatHpPct: 0.4, potionHpPct: 0.6 },
  // Wants to be hit, briefly and on purpose, so it stays in longer than its
  // armour says it should.
  duelist: { stance: 'aggressive', priority: 'closest', lootPolicy: 'greedy', retreatHpPct: 0.3, potionHpPct: 0.5 },
  // Goes for whatever is holding the advantage, which is rarely the nearest.
  inquisitor: { stance: 'balanced', priority: 'highest_threat', lootPolicy: 'greedy', retreatHpPct: 0.25, potionHpPct: 0.5 },
  // Spends its opening on preparation, so it needs to survive the opening.
  runesmith: { stance: 'defensive', priority: 'closest', lootPolicy: 'valuable', retreatHpPct: 0.4, potionHpPct: 0.58 },
  // Everything it does pays late, so dying early wastes all of it.
  harbinger: { stance: 'evasive', priority: 'highest_threat', lootPolicy: 'valuable', retreatHpPct: 0.45, potionHpPct: 0.6 },
  // Built for the heaviest thing on the field and nothing else.
  sapper: { stance: 'aggressive', priority: 'elites_first', lootPolicy: 'greedy', retreatHpPct: 0.28, potionHpPct: 0.5 },
  // Treats a second exchange as a mistake, and leaves before it happens.
  marauder: { stance: 'aggressive', priority: 'lowest_hp', lootPolicy: 'greedy', retreatHpPct: 0.45, potionHpPct: 0.5 },
  // Does not leave. The lowest retreat threshold in the game, by design.
  sentinel: { stance: 'defensive', priority: 'highest_threat', lootPolicy: 'greedy', retreatHpPct: 0.15, potionHpPct: 0.5 },
};

/**
 * What a class gets when the table above has forgotten it. Deliberately
 * middling: a hero it applies to is playable but not tuned, which is the
 * honest result of an omission.
 */
const FALLBACK_TACTICS = {
  stance: 'balanced', priority: 'closest', lootPolicy: 'valuable',
  retreatHpPct: 0.3, potionHpPct: 0.5,
};

/** Tactics for a single hero. */
export function defaultHeroTactics(classId) {
  const byClass = CLASS_TACTICS[classId];
  // Every class needs an entry. Spreading `undefined` silently produced a
  // hero with no priority and no retreat threshold — the deploy briefing
  // called `.replace()` on the missing priority and blanked the whole page,
  // which is how three classes shipped without tactics and nothing said so.
  // `test-achievements.js` asserts CLASS_TACTICS covers CLASSES; this is the
  // belt to that pair of braces, so a gap is a dull hero rather than a dead
  // screen.
  return { ...FALLBACK_TACTICS, ...byClass, focusFire: true, spellPolicy: {} };
}

/** Tactics for the squad as a whole. */
export function defaultSquadTactics() {
  return {
    formation: 'line',
    plan: 'farm',
    extractPlan: 'half',
    // No default: the player names a leader before the raid, because who
    // walks point decides where the whole squad goes.
    leaderId: null,
    avoidPlayers: false,
    // Squad-wide loot filter, on top of each hero's own policy.
    lootFloor: 'any',
    // Consumables are governed by this alone, not by the rarity floor: a
    // common potion is worth picking up on any run that a legendary filter
    // would otherwise strip to nothing.
    takeConsumables: true,
    // A standing hunt order: { speciesId, kind }, or null for "whatever the
    // plan turns up". Set in camp against the profile's journal and changed
    // mid-raid against what the squad can actually see.
    quarry: null,
  };
}
