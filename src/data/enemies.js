// Hunt encounters: the world events that punctuate a raid, and the clock.
//
// The population itself moved to src/data/creatures.js. Nothing on this map is
// generic trash any more — every living thing is a species you can carve, so
// there is no separate table of "enemies" to keep in step with the bestiary.
// These re-exports exist so the sim can keep asking for a definition by id
// without caring which of the two hunt tables it came from.

import { CREATURES, SMALL_CREATURES, LARGE_CREATURES } from './creatures.js';

export { CREATURES, SMALL_CREATURES, LARGE_CREATURES };

/** Any species by id, pack or solo. */
export const creatureDef = (id) => CREATURES[id] ?? null;

/** Timed world events. `at` is seconds into the 30-minute raid. */
export const WORLD_EVENTS = [
  {
    id: 'supply_drop', name: 'Supply Drop', at: 240, window: 240, kind: 'cache',
    blurb: 'A supply drop lands in the open. Everyone can see it.',
     guardTable: [{ enemy: 'threshclaw', count: 4 }, { enemy: 'bilespitter', count: 2 }],
  },
  {
    id: 'blood_moon', name: 'Blood Moon', at: 600, window: 300, kind: 'surge',
    blurb: 'Spawn rates surge across the map and enemies hit harder.',
    modifiers: { spawnRateMult: 2.0, enemyDamageMult: 1.2 },
  },
  {
    id: 'ritual', name: 'Cultist Ritual', at: 780, window: 300, kind: 'capture',
    blurb: 'Hold the circle for 45s to claim the reliquary.',
    captureSeconds: 45,
    guardTable: [{ enemy: 'mirefang', count: 4 }, { enemy: 'nettlefang', count: 3 }],
  },
  {
    id: 'nightfell_wakes', name: 'Nightfell Stirs', at: 1080, window: 999, kind: 'boss',
    blurb: 'The apex wakes at the centre of the map.',
    boss: 'nightfell',
  },
  {
    id: 'collapse', name: 'The Collapse', at: 1500, window: 999, kind: 'collapse',
    blurb: 'The map begins to close. Extract or die.',
  },
];

export const MATCH_SECONDS = 30 * 60;
