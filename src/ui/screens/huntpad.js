// What to hunt. The raid's own scouting report, and the order written against
// it.
//
// Every row here is a hunt the squad can actually walk to — the list is built
// from this map's fauna rather than from everything the player has ever met,
// so nothing on it is a wish. An order is standing: clearing the pack it sent
// the squad to is the order being obeyed once, not finished.

import { el, clear } from '../dom.js';
import { CREATURES } from '../../data/creatures.js';
import { BEHAVIOURS } from '../../data/behaviours.js';
import { HUNT_KINDS, quarryLabel } from '../../data/hunts.js';
import { dist } from '../../core/vec.js';
import { CENTER } from '../../sim/map.js';

const RINGS = [
  { tier: 0, name: 'Outer ring' },
  { tier: 1, name: 'Mid ring' },
  { tier: 2, name: 'Core' },
];

export function createHuntPad(match) {
  const root = el('div.hudsheet.huntpad', { hidden: true });

  const centroid = () => match.squadCentroid(match.playerSquad) ?? { ...CENTER };
  // The squad's tactics are the raid's own copy of what was set in camp, so
  // writing here changes this raid and nothing else — there is no second
  // "manual" order layered on top. There was, briefly, and calling off a hunt
  // then only peeled off the override and revealed the camp's order
  // underneath, so the squad answered "stop hunting" by hunting something
  // else.
  const current = () => match.playerSquad.tactics.quarry;

  /**
   * Is this hunt the one currently ordered? Asked at click time, never at
   * render time.
   *
   * The pad is rebuilt eight times a second while a raid runs, so a tap that
   * lands a frame after a re-render lands on a row whose closure was built
   * before it. Capturing the answer meant the "call it off" tap on a stale
   * row read as "not ordered" and re-armed the same hunt instead of clearing
   * it — a mistap for a player, and an intermittent failure in
   * test-huntpad.mjs that looked like a harness race.
   */
  const isActive = (quarry) => {
    const active = current();
    return active?.speciesId === quarry.speciesId && active?.kind === quarry.kind;
  };

  function order(quarry) {
    match.playerSquad.tactics.quarry = quarry;
    match.playerSquad.huntSpent = false;
    match.log(quarry ? `Hunting ${quarryLabel(quarry)}.` : 'Hunt called off.', 'info');
    render();
  }

  /** How far to the nearest site for a hunt, in map units, or null. */
  function reach(quarry) {
    const poi = match.findQuarry(centroid(), quarry);
    return poi ? dist(centroid(), poi) : null;
  }

  const km = (d) => `${(Math.round(d / 100) / 10).toFixed(1)}k`;

  function render() {
    clear(root);
    const active = current();

    root.appendChild(el('div.spread', { style: { marginBottom: '7px' } }, [
      el('strong', null, 'Hunt'),
      el('button.sm.ghost', { onclick: () => hide() }, '✕'),
    ]));

    root.appendChild(el('div.hunt-now', null, active
      ? [
        el('div.tiny.dim', null, 'STANDING ORDER'),
        el('div.nm', { style: { color: CREATURES[active.speciesId]?.color } }, quarryLabel(active)),
        el('button.sm.ghost', { onclick: () => order(null) }, 'Call it off'),
      ]
      : [el('div.tiny.dim', null, 'No hunt ordered — the squad follows the raid plan.')]));

    // Grouped by ring, because how deep a species lives is the single most
    // useful thing about it: it is the risk, and it is the walk.
    const byRing = new Map(RINGS.map((r) => [r.tier, []]));
    for (const entry of match.fauna()) {
      if (!byRing.has(entry.tier)) byRing.set(entry.tier, []);
      byRing.get(entry.tier).push(entry);
    }

    for (const ring of RINGS) {
      const here = (byRing.get(ring.tier) ?? [])
        .sort((a, b) => (a.hunt === b.hunt ? 0 : a.hunt === 'solo' ? 1 : -1)
          || (CREATURES[a.speciesId]?.name ?? '').localeCompare(CREATURES[b.speciesId]?.name ?? ''));
      if (!here.length) continue;

      root.appendChild(el('div.hunt-ring', null, ring.name));
      for (const entry of here) {
        const c = CREATURES[entry.speciesId];
        if (!c) continue;
        const kinds = entry.hunt === 'solo' ? ['solo'] : ['small', 'large'];
        root.appendChild(el('div.hunt-row', { style: { '--cls': c.color } }, [
          el('div.spread', null, [
            el('div.nm', null, c.name),
            el('span.tiny.dim', null, BEHAVIOURS[c.behaviour]?.name ?? c.behaviour),
          ]),
          el('div.row', { style: { gap: '4px', flexWrap: 'wrap' } }, kinds.map((kind) => {
            const quarry = { speciesId: entry.speciesId, kind };
            // Render-time, and only for the highlight. The handler asks again.
            const on = isActive(quarry);
            const d = reach(quarry);
            return el('button.sm' + (on ? '.primary' : ''), {
              // A hunt whose last site is gone is still listed, greyed, rather
              // than vanishing: the species is part of this raid's fauna and
              // a row that disappears reads as a bug.
              disabled: d === null,
              title: d === null
                ? `Nothing left: ${quarryLabel(quarry)}`
                : `${quarryLabel(quarry)} — ${km(d)} away`,
              onclick: () => order(isActive(quarry) ? null : quarry),
            }, `${HUNT_KINDS[kind].short}${d === null ? '' : ` · ${km(d)}`}`);
          })),
        ]));
      }
    }

    root.appendChild(el('p.tiny.muted', { style: { marginTop: '7px' } },
      'A hunt holds after the pack is cleared — the squad moves to the next one. '
      + 'They still fight whatever walks into them on the way. Nothing on the map '
      + 'comes back, so a species can be hunted out; when the last of it is gone '
      + 'the squad says so and returns to the plan. The three that walk are not '
      + 'on this list and cannot be: there is nowhere to send anybody. They arrive '
      + 'on the clock and find you.'));
  }

  function show() { root.hidden = false; render(); }
  function hide() { root.hidden = true; }
  function toggle() { if (root.hidden) show(); else hide(); }
  function refresh() { if (!root.hidden) render(); }

  return { node: root, show, hide, toggle, refresh, isOpen: () => !root.hidden };
}
