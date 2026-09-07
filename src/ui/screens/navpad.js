// Where to send the squad. The leader walks these; everyone else stays with
// the leader.
//
// A compass heading is open-ended — the squad marches that way until the map
// runs out or you say otherwise — while the landmarks are ordinary
// destinations they arrive at and then resume the raid plan.

import { el, clear } from '../dom.js';
import { HEADINGS } from '../../data/tactics.js';
import { CENTER, bestExtract } from '../../sim/map.js';
import { dist } from '../../core/vec.js';

// Laid out as a compass rose, with the core in the middle where it belongs.
const ROSE = [
  ['nw', 'n', 'ne'],
  ['w', null, 'e'],
  ['sw', 's', 'se'],
];

export function createNavPad(match) {
  const root = el('div.hudsheet.navpad', { hidden: true });

  function centroid() {
    return match.squadCentroid(match.playerSquad) ?? { ...CENTER };
  }

  function order(mo, label) {
    match.playerSquad.manualOrder = mo;
    match.log(label, 'info');
    render();
  }

  /** Nearest boss arena that still has something in it. */
  function nearestArena() {
    const here = centroid();
    let best = null;
    let bestD = Infinity;
    for (const poi of match.map.pois) {
      if (poi.kind !== 'boss' && poi.kind !== 'boss_event') continue;
      // Skip an arena whose boss has already been killed.
      if (poi.bossEntityId && !match.byId(poi.bossEntityId)?.alive) continue;
      if (poi.kind === 'boss_event' && !poi.bossEntityId) continue;   // not woken yet
      const d = dist(here, poi);
      if (d < bestD) { bestD = d; best = poi; }
    }
    return best;
  }

  function render() {
    clear(root);
    const current = match.playerSquad.manualOrder;
    const activeHeading = current?.mode === 'heading' ? current.heading : null;

    root.appendChild(el('div.spread', { style: { marginBottom: '7px' } }, [
      el('strong', null, 'Navigate'),
      el('button.sm.ghost', { onclick: () => hide() }, '✕'),
    ]));

    root.appendChild(el('div.navrose', null, ROSE.flatMap((row) => row.map((id) => {
      if (!id) {
        return el('button.sm', {
          title: 'Head for the centre of the map',
          onclick: () => order({ mode: 'travel', pos: { ...CENTER }, label: 'To the core' }, 'Making for the core.'),
        }, 'Core');
      }
      const h = HEADINGS[id];
      return el('button.sm' + (activeHeading === id ? '.primary' : ''), {
        title: h.name,
        onclick: () => order({ mode: 'heading', heading: id }, `Heading ${h.short}.`),
      }, h.short);
    }))));

    const arena = nearestArena();
    root.appendChild(el('div.col', { style: { gap: '5px', marginTop: '8px' } }, [
      el('button.sm', {
        disabled: !arena,
        onclick: () => arena && order(
          { mode: 'travel', pos: { x: arena.x, y: arena.y }, label: 'To the arena' },
          'Making for the boss arena.',
        ),
      }, arena ? `Boss arena — ${Math.round(dist(centroid(), arena) / 100) / 10}k away` : 'No boss arena known'),
      el('button.sm', {
        onclick: () => {
          const ex = bestExtract(match.map, centroid(), match.time);
          order({ mode: 'extract', extract: ex }, `Extracting via ${ex.name}.`);
        },
      }, 'Nearest extraction'),
      el('button.sm.ghost', {
        onclick: () => { match.playerSquad.manualOrder = null; match.log('Back to the raid plan.', 'info'); render(); },
      }, 'Resume raid plan'),
    ]));

    root.appendChild(el('p.tiny.muted', { style: { marginTop: '7px' } },
      'A heading keeps going until the map runs out. Landmarks are a one-off trip.'));
  }

  function show() { root.hidden = false; render(); }
  function hide() { root.hidden = true; }
  function toggle() { if (root.hidden) show(); else hide(); }
  function refresh() { if (!root.hidden) render(); }

  return { node: root, show, hide, toggle, refresh, isOpen: () => !root.hidden };
}
