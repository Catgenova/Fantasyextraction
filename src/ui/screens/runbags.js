// In-raid pack management: equip what you find, throw away what you don't.
//
// Deliberately real-time — the raid clock keeps running while this is open,
// the same as any other decision during a run. Pause is one tap away in the
// control bar if a fight is going badly.

import { el, clear, hideTooltip } from '../dom.js';
import { itemRow } from '../items.js';
import { SLOTS, SLOT_NAMES } from '../../data/gear.js';
import { BACKPACK_SLOTS } from '../../data/tactics.js';
import { CONSUMABLE_SLOTS } from '../../data/consumables.js';
import { CLASSES } from '../../data/classes.js';
import { hpFrac } from '../../sim/entity.js';
import {
  canEquipItem, equipFromBackpack, unequipToBackpack,
  dropFromBackpack, dropConsumable, canPackConsumable, packConsumable,
} from '../../sim/inventory.js';

/**
 * @param controls {{isPaused, togglePause}} — on a phone this panel covers the
 *        control bar, so it has to offer a way to stop the clock itself.
 */
export function createRunBags(match, controls = null) {
  const root = el('div.bags', { hidden: true });
  let heroIndex = 0;
  let lastSignature = '';

  /**
   * Cheap fingerprint of everything the panel draws. Re-rendering blindly on
   * a timer would rebuild buttons under the player's finger mid-tap.
   */
  function signature() {
    return match.playerSquad.memberIds.map((id) => {
      const e = match.byId(id);
      if (!e) return 'x';
      return [
        e.id, e.alive ? 1 : 0, e.extracted ? 1 : 0,
        SLOTS.map((s) => e.equipped[s]?.id ?? '-').join(','),
        e.inventory.map((i) => i.id).join(','),
        e.consumables.map((c) => `${c.defId}:${c.count}`).join(','),
      ].join('|');
    }).join(';') + `#${heroIndex}#${controls?.isPaused() ? 'p' : 'r'}`;
  }

  function members() {
    return match.playerSquad.memberIds.map((id) => match.byId(id)).filter(Boolean);
  }

  function act(fn) {
    fn();
    lastSignature = '';       // force a redraw on the next refresh
    render();
  }

  function render() {
    hideTooltip();
    clear(root);
    const squad = members();
    if (!squad.length) return;

    heroIndex = Math.min(heroIndex, squad.length - 1);
    const hero = squad[heroIndex];
    const cls = CLASSES[hero.classId];
    const gone = !hero.alive || hero.extracted;

    root.appendChild(el('div.bags-head', null, [
      el('div.bags-tabs', null, squad.map((m, i) => el(
        'button.sm' + (i === heroIndex ? '.primary' : ''),
        { onclick: () => act(() => { heroIndex = i; }) },
        [
          el('span', null, m.name.split(' ').pop()),
          el('span.tiny.dim', { style: { marginLeft: '5px' } },
            !m.alive ? '✕' : m.extracted ? '↑' : `${m.inventory.length}/${BACKPACK_SLOTS}`),
        ],
      ))),
      el('div.row', { style: { gap: '4px' } }, [
        controls
          ? el('button.sm', { onclick: () => act(() => controls.togglePause()) },
            controls.isPaused() ? 'Resume' : 'Pause')
          : null,
        el('button.sm.ghost', { onclick: () => hide() }, 'Close'),
      ]),
    ]));

    const body = el('div.bags-body.scroll');
    root.appendChild(body);

    if (gone) {
      body.appendChild(el('div.item.empty', null,
        !hero.alive ? `${hero.name} is dead — everything they carried is on the ground.`
          : `${hero.name} has extracted. Their haul is safe.`));
      return;
    }

    body.appendChild(el('div.spread', { style: { marginBottom: '8px' } }, [
      el('div', null, [
        el('div.tiny', { style: { color: cls.color, letterSpacing: '.1em', textTransform: 'uppercase' } }, cls.name),
        el('div', { style: { fontFamily: 'var(--serif)', fontSize: '16px' } }, hero.name),
      ]),
      el('div.tiny.muted', { style: { textAlign: 'right' } }, [
        `${Math.round(hero.hp)} / ${hero.maxHp} hp`,
        el('br'),
        `${Math.round(hpFrac(hero) * 100)}%`,
      ]),
    ]));

    // --- Backpack ---------------------------------------------------------
    body.appendChild(el('h3', { style: { margin: '10px 0 6px' } },
      `Pack — ${hero.inventory.length} / ${BACKPACK_SLOTS}`));

    if (!hero.inventory.length) {
      body.appendChild(el('div.item.empty', null, 'Nothing picked up yet.'));
    } else {
      body.appendChild(el('div.col', { style: { gap: '6px' } }, hero.inventory.map((item, i) => {
        const equippable = canEquipItem(hero, item);
        const packable = canPackConsumable(hero, item);
        return itemRow(item, {
          compareTo: item.kind === 'gear' ? hero.equipped[item.slot] : null,
          right: el('div.row', { style: { gap: '4px' } }, [
            equippable
              ? el('button.sm', { onclick: () => act(() => equipFromBackpack(match, hero, i)) }, 'Equip')
              : null,
            packable
              ? el('button.sm', { onclick: () => act(() => packConsumable(match, hero, i)) }, 'Use')
              : null,
            el('button.sm.danger', { onclick: () => act(() => dropFromBackpack(match, hero, i)) }, 'Drop'),
          ]),
        });
      })));
    }

    // --- Worn -------------------------------------------------------------
    body.appendChild(el('h3', { style: { margin: '14px 0 6px' } }, 'Worn'));
    body.appendChild(el('div.col', { style: { gap: '6px' } }, SLOTS.map((slot) => {
      const item = hero.equipped[slot];
      return itemRow(item, {
        slotLabel: SLOT_NAMES[slot],
        emptyText: `No ${SLOT_NAMES[slot].toLowerCase()}`,
        right: item
          ? el('button.sm', { onclick: () => act(() => unequipToBackpack(match, hero, slot)) }, 'Remove')
          : null,
      });
    })));

    // --- Consumables ------------------------------------------------------
    body.appendChild(el('h3', { style: { margin: '14px 0 6px' } },
      `Belt — ${hero.consumables.length} / ${CONSUMABLE_SLOTS}`));
    if (!hero.consumables.length) {
      body.appendChild(el('div.item.empty', null,
        'Nothing on the belt — heroes only drink what is here.'));
    } else {
      body.appendChild(el('div.col', { style: { gap: '6px' } }, hero.consumables.map((stack, i) =>
        itemRow(stack, {
          right: el('button.sm.danger', { onclick: () => act(() => dropConsumable(match, hero, i)) }, 'Drop'),
        }))));
    }

    body.appendChild(el('p.tiny.muted', { style: { marginTop: '12px' } },
      'The clock is still running. Anything dropped stays where you leave it, and '
      + 'anything worn is lost with the hero if they do not extract.'));
  }

  function refresh() {
    if (root.hidden) return;
    const sig = signature();
    if (sig === lastSignature) return;   // nothing changed; leave the DOM alone
    lastSignature = sig;
    render();
  }

  function show() { root.hidden = false; lastSignature = ''; refresh(); }
  function hide() { root.hidden = true; hideTooltip(); }
  function toggle() { if (root.hidden) show(); else hide(); }

  return { node: root, refresh, show, hide, toggle, isOpen: () => !root.hidden };
}
