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
    // It used to claim doubled spawn rates as well, and carried a
    // `spawnRateMult` for it that nothing in the sim ever read. Nothing on the
    // map respawns now, so there is no rate for it to double either way.
    blurb: 'Everything on the map hits harder for five minutes.',
    modifiers: { enemyDamageMult: 1.2 },
  },
  {
    id: 'ritual', name: 'Cultist Ritual', at: 780, window: 300, kind: 'capture',
    blurb: 'Hold the circle for 45s to claim the reliquary.',
    captureSeconds: 45,
    guardTable: [{ enemy: 'mirefang', count: 4 }, { enemy: 'nettlefang', count: 3 }],
  },
  // The three that walk. Their times, rings and difficulty all come off the
  // species (see WALKING_CREATURES in creatures.js) so the schedule cannot
  // drift from the creature: the event only says that one arrives.
  {
    id: 'cairnwalker_walks', name: 'Something Is Walking', at: 600, window: 999, kind: 'walker',
    blurb: 'A Cairnwalker has set off, and it will not stop. Twenty minutes left.',
    walker: 'cairnwalker',
  },
  {
    id: 'sablemarch_walks', name: 'The Ground Is Going Bad', at: 900, window: 999, kind: 'walker',
    blurb: 'A Sablemarch is crossing the exit ring. Fifteen minutes left.',
    walker: 'sablemarch',
  },
  {
    id: 'nightfell_wakes', name: 'Nightfell Stirs', at: 1080, window: 999, kind: 'boss',
    blurb: 'The apex wakes at the centre of the map.',
    boss: 'nightfell',
  },
  {
    id: 'duskherald_walks', name: 'Something Called', at: 1200, window: 999, kind: 'walker',
    blurb: 'A Duskherald is coming up out of the core, and it did not come alone. Ten minutes left.',
    walker: 'duskherald',
  },
  {
    id: 'collapse', name: 'The Collapse', at: 1500, window: 999, kind: 'collapse',
    blurb: 'The map begins to close. Extract or die.',
  },
];

export const MATCH_SECONDS = 30 * 60;
