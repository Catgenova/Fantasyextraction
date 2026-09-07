// PvE population: trash, elites, bosses, and the world events that seed them.
// `tier` gates which zone ring an archetype spawns in (0 = outer, 2 = core).

export const ENEMIES = {
  // ---- Tier 0: the outer ring, safe-ish farming -----------------------------
  rat_swarm: {
    id: 'rat_swarm', name: 'Rat Swarm', tier: 0, rank: 'trash', color: '#8a7a63',
    hp: 70, armor: 10, resist: 0, damage: 14, attackInterval: 1.0, range: 34, moveSpeed: 108, radius: 11,
    xp: 8, lootTable: 'trash_low', aggroRange: 260,
  },
  bandit: {
    id: 'bandit', name: 'Bandit', tier: 0, rank: 'trash', color: '#a4544a',
    hp: 120, armor: 30, resist: 10, damage: 24, attackInterval: 1.4, range: 40, moveSpeed: 96, radius: 12,
    xp: 12, lootTable: 'trash_low', aggroRange: 300,
  },
  bandit_archer: {
    id: 'bandit_archer', name: 'Bandit Archer', tier: 0, rank: 'trash', color: '#b8705f',
    hp: 90, armor: 16, resist: 10, damage: 26, attackInterval: 1.7, range: 240, moveSpeed: 92, radius: 11,
    projectile: true, projectileSpeed: 420, xp: 14, lootTable: 'trash_low', aggroRange: 330,
  },

  // ---- Tier 1: mid ring ----------------------------------------------------
  ghoul: {
    id: 'ghoul', name: 'Ghoul', tier: 1, rank: 'trash', color: '#7f9c72',
    hp: 190, armor: 40, resist: 20, damage: 40, attackInterval: 1.3, range: 42, moveSpeed: 104, radius: 13,
    xp: 22, lootTable: 'trash_mid', aggroRange: 320,
  },
  cultist: {
    id: 'cultist', name: 'Cultist', tier: 1, rank: 'trash', color: '#8f6bb5',
    hp: 150, armor: 20, resist: 55, damage: 44, attackInterval: 1.9, range: 230, moveSpeed: 90, radius: 12,
    projectile: true, projectileSpeed: 360, school: 'magic', xp: 24, lootTable: 'trash_mid', aggroRange: 340,
  },
  ogre: {
    id: 'ogre', name: 'Ogre', tier: 1, rank: 'elite', color: '#6f8f4a',
    hp: 900, armor: 70, resist: 30, damage: 82, attackInterval: 2.1, range: 56, moveSpeed: 82, radius: 20,
    xp: 90, lootTable: 'elite', aggroRange: 360, cleave: 70,
  },

  // ---- Tier 2: the core ----------------------------------------------------
  wraith: {
    id: 'wraith', name: 'Wraith', tier: 2, rank: 'trash', color: '#6ec8d8',
    hp: 250, armor: 20, resist: 90, damage: 58, attackInterval: 1.5, range: 210, moveSpeed: 118, radius: 13,
    projectile: true, projectileSpeed: 400, school: 'magic', xp: 40, lootTable: 'trash_high', aggroRange: 380,
  },
  revenant: {
    id: 'revenant', name: 'Revenant Knight', tier: 2, rank: 'elite', color: '#c0c8d4',
    hp: 1350, armor: 130, resist: 70, damage: 105, attackInterval: 1.8, range: 52, moveSpeed: 94, radius: 20,
    xp: 140, lootTable: 'elite', aggroRange: 400, cleave: 80,
  },
};

export const BOSSES = {
  gravemaw: {
    id: 'gravemaw', name: 'Gravemaw, the Bonefather', rank: 'boss', color: '#e0d2a8', tier: 1,
    hp: 7000, armor: 150, resist: 90, damage: 120, attackInterval: 1.9, range: 70, moveSpeed: 78, radius: 32,
    xp: 700, lootTable: 'boss', aggroRange: 520, cleave: 110,
    abilities: [
      { id: 'slam', cooldown: 9, radius: 170, damage: 150, telegraph: 1.4, kind: 'ground' },
      { id: 'summon', cooldown: 22, spawn: 'ghoul', count: 3, maxAlive: 6, lifespan: 60, telegraph: 0.8, kind: 'summon' },
    ],
  },
  ashenveil: {
    id: 'ashenveil', name: 'Ashenveil, the Hollow Choir', rank: 'boss', color: '#c39bf0', tier: 2,
    hp: 9500, armor: 90, resist: 190, damage: 140, attackInterval: 2.2, range: 260, moveSpeed: 84, radius: 30,
    projectile: true, projectileSpeed: 340, school: 'magic',
    xp: 1100, lootTable: 'boss', aggroRange: 560,
    abilities: [
      { id: 'nova', cooldown: 12, radius: 240, damage: 190, telegraph: 1.8, kind: 'ground', school: 'magic' },
      { id: 'summon', cooldown: 26, spawn: 'wraith', count: 3, maxAlive: 6, lifespan: 60, telegraph: 0.8, kind: 'summon' },
    ],
  },
  the_warden: {
    id: 'the_warden', name: 'The Warden of the Seal', rank: 'boss', color: '#f0a33c', tier: 2,
    hp: 14000, armor: 210, resist: 150, damage: 175, attackInterval: 2.0, range: 80, moveSpeed: 86, radius: 36,
    xp: 1800, lootTable: 'boss_apex', aggroRange: 600, cleave: 140,
    abilities: [
      { id: 'slam', cooldown: 8, radius: 200, damage: 260, telegraph: 1.3, kind: 'ground' },
      { id: 'summon', cooldown: 24, spawn: 'revenant', count: 2, maxAlive: 4, lifespan: 60, telegraph: 1.0, kind: 'summon' },
      { id: 'enrage', cooldown: 45, kind: 'buff', duration: 12, mods: { damagePct: 0.4, attackSpeedPct: 0.3 } },
    ],
  },

  // Tier 0. The one boss a fresh squad can realistically take, and the first
  // class unlock most players will see.
  quiet_knife: {
    id: 'quiet_knife', name: 'The Quiet Knife', rank: 'boss', color: '#9aa7b8', tier: 0,
    hp: 3800, armor: 90, resist: 40, damage: 85, attackInterval: 1.1, range: 46, moveSpeed: 112, radius: 26,
    xp: 400, lootTable: 'boss', aggroRange: 480,
    abilities: [
      { id: 'caltrops', cooldown: 10, radius: 150, damage: 90, telegraph: 1.0, kind: 'ground' },
      { id: 'flurry', cooldown: 22, kind: 'buff', duration: 8, mods: { attackSpeedPct: 0.6, dodge: 0.2 } },
      { id: 'summon', cooldown: 26, spawn: 'bandit', count: 3, maxAlive: 5, lifespan: 60, telegraph: 0.8, kind: 'summon' },
    ],
  },

  hoarfrost: {
    id: 'hoarfrost', name: 'Hoarfrost, the Still Winter', rank: 'boss', color: '#7fd4e8', tier: 1,
    hp: 7500, armor: 120, resist: 160, damage: 110, attackInterval: 2.0, range: 240, moveSpeed: 70, radius: 30,
    projectile: true, projectileSpeed: 330, school: 'magic',
    xp: 750, lootTable: 'boss', aggroRange: 540,
    abilities: [
      { id: 'nova', cooldown: 11, radius: 230, damage: 150, telegraph: 1.6, kind: 'ground', school: 'magic' },
      { id: 'summon', cooldown: 28, spawn: 'wraith', count: 2, maxAlive: 4, lifespan: 60, telegraph: 0.8, kind: 'summon' },
    ],
  },

  grendrak: {
    id: 'grendrak', name: 'Grendrak the Unbroken', rank: 'boss', color: '#c1553f', tier: 1,
    hp: 8200, armor: 170, resist: 60, damage: 140, attackInterval: 2.0, range: 66, moveSpeed: 88, radius: 34,
    xp: 800, lootTable: 'boss', aggroRange: 520, cleave: 130,
    abilities: [
      { id: 'slam', cooldown: 8, radius: 190, damage: 170, telegraph: 1.3, kind: 'ground' },
      { id: 'enrage', cooldown: 35, kind: 'buff', duration: 10, mods: { damagePct: 0.35, attackSpeedPct: 0.25 } },
    ],
  },

  emberjaw: {
    id: 'emberjaw', name: 'Emberjaw, the Kiln Wyrm', rank: 'boss', color: '#f08050', tier: 2,
    hp: 10500, armor: 110, resist: 140, damage: 150, attackInterval: 2.1, range: 260, moveSpeed: 80, radius: 32,
    projectile: true, projectileSpeed: 360, school: 'magic',
    xp: 1200, lootTable: 'boss', aggroRange: 580,
    abilities: [
      { id: 'nova', cooldown: 10, radius: 250, damage: 200, telegraph: 1.5, kind: 'ground', school: 'magic' },
      { id: 'summon', cooldown: 26, spawn: 'cultist', count: 3, maxAlive: 6, lifespan: 60, telegraph: 0.8, kind: 'summon' },
    ],
  },

  malgareth: {
    id: 'malgareth', name: 'Malgareth, the Rent Veil', rank: 'boss', color: '#b8863f', tier: 2,
    hp: 11500, armor: 160, resist: 160, damage: 160, attackInterval: 1.9, range: 74, moveSpeed: 92, radius: 33,
    xp: 1400, lootTable: 'boss', aggroRange: 580, cleave: 100,
    abilities: [
      { id: 'slam', cooldown: 9, radius: 210, damage: 210, telegraph: 1.4, kind: 'ground' },
      { id: 'summon', cooldown: 28, spawn: 'revenant', count: 2, maxAlive: 4, lifespan: 60, telegraph: 1.0, kind: 'summon' },
      { id: 'enrage', cooldown: 40, kind: 'buff', duration: 10, mods: { damagePct: 0.3, armor: 80 } },
    ],
  },
};

/** Timed world events. `at` is seconds into the 30-minute raid. */
export const WORLD_EVENTS = [
  {
    id: 'supply_drop', name: 'Supply Drop', at: 240, window: 240, kind: 'cache',
    blurb: 'A cache of gear falls in the open. Everyone can see it.',
    lootTable: 'event_cache', guardTable: [{ enemy: 'bandit', count: 3 }, { enemy: 'bandit_archer', count: 2 }],
  },
  {
    id: 'blood_moon', name: 'Blood Moon', at: 600, window: 300, kind: 'surge',
    blurb: 'Spawn rates surge across the map and enemies hit harder.',
    modifiers: { spawnRateMult: 2.0, enemyDamageMult: 1.2 },
  },
  {
    id: 'ritual', name: 'Cultist Ritual', at: 780, window: 300, kind: 'capture',
    blurb: 'Hold the circle for 45s to claim the reliquary.',
    captureSeconds: 45, lootTable: 'event_ritual',
    guardTable: [{ enemy: 'cultist', count: 4 }, { enemy: 'ghoul', count: 3 }],
  },
  {
    id: 'warden_wakes', name: 'The Warden Wakes', at: 1080, window: 999, kind: 'boss',
    blurb: 'The apex boss rises at the centre of the map.',
    boss: 'the_warden',
  },
  {
    id: 'collapse', name: 'The Collapse', at: 1500, window: 999, kind: 'collapse',
    blurb: 'The map begins to close. Extract or die.',
  },
];

export const MATCH_SECONDS = 30 * 60;
