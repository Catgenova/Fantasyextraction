// In-raid pack management: equip what you find, throw away what you don't.
//
// Deliberately real-time — the raid clock keeps running while this is open,
// the same as any other decision during a run. Pause is one tap away in the
// control bar if a fight is going badly.

import { el, clear, hideTooltip } from '../dom.js';
import { itemRow } from '../items.js';
import { SLOTS, SLOT_NAMES, packCapacity, isWooden } from '../../data/gear.js';
import { QUALITIES } from '../../data/parts.js';
import { LOOT_FLOORS } from '../../data/tactics.js';
import { CONSUMABLE_SLOTS } from '../../data/consumables.js';
import { CLASSES } from '../../data/classes.js';
import { hpFrac } from '../../sim/entity.js';
import {
  canEquipItem, equipFromBackpack, unequipToBackpack,
  destroyFromBackpack, destroyConsumable, canPackConsumable, packConsumable,
  transferItem, transferBlocker,
} from '../../sim/inventory.js';

/**
 * @param controls {{isPaused, togglePause}} — on a phone this panel covers the
 *        control bar, so it has to offer a way to stop the clock itself.
 */
export function createRunBags(match, controls = null) {
  const root = el('div.bags', { hidden: true });
  let heroIndex = 0;
  let lastSignature = '';
  // Destroying is permanent, so it takes two taps: the first arms this.
  let armed = null;

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
      // Rounded position: whether a mate is close enough to hand something to
      // changes as the squad moves, and the buttons have to follow that.
    }).join(';') + `#${heroIndex}#${controls?.isPaused() ? 'p' : 'r'}#`
      + match.playerSquad.memberIds.map((id) => {
        const m = match.byId(id);
        return m ? `${Math.round(m.pos.x / 60)},${Math.round(m.pos.y / 60)}` : '-';
      }).join('/');
  }

  function members() {
    return match.playerSquad.memberIds.map((id) => match.byId(id)).filter(Boolean);
  }

  function act(fn) {
    armed = null;
    fn();
    lastSignature = '';       // force a redraw on the next refresh
    render();
  }

  /** Two-tap destroy: arm on the first press, act on the second. */
  function destroyButton(key, run) {
    const isArmed = armed === key;
    return el('button.sm.danger' + (isArmed ? '.armed' : ''), {
      title: isArmed ? 'Tap again — this cannot be undone' : 'Destroy this permanently',
      onclick: () => {
        if (isArmed) act(run);
        else { armed = key; lastSignature = ''; render(); }
      },
    }, isArmed ? 'Sure?' : 'Destroy');
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
            !m.alive ? '✕' : m.extracted ? '↑' : `${m.inventory.length}/${packCapacity(m.equipped)}`),
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

    // --- Standing loot orders ---------------------------------------------
    // These are a live reference to the squad's tactics, so a change here is
    // obeyed on the very next pickup. Worth having in the raid rather than
    // only in camp: what you want off the floor changes once bags are filling
    // and the walk to an exit is what is left.
    const orders = hero.squadTactics;
    if (orders) {
      body.appendChild(el('div.loot-orders', null, [
        el('div.tiny.dim', null, 'Squad picks up'),
        el('div.row', { style: { gap: '4px', flexWrap: 'wrap' } }, [
          ...Object.values(LOOT_FLOORS).map((f) => el(
            'button.sm' + (((orders.lootFloor ?? 'any') === f.id) ? '.primary' : ''),
            {
              title: f.desc,
              onclick: () => act(() => { orders.lootFloor = f.id; }),
            },
            f.id === 'any' ? 'Any' : QUALITIES[f.minQuality].name,
          )),
          el('button.sm' + (orders.takeConsumables === false ? '' : '.primary'), {
            title: orders.takeConsumables === false
              ? 'Consumables are being left on the ground'
              : 'Found consumables go to the belt first, then the pack',
            onclick: () => act(() => { orders.takeConsumables = orders.takeConsumables === false; }),
          }, 'Potions'),
        ]),
      ]));
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
    // Each section is wrapped so that "the Equip button" or "the Destroy
    // button" means something: pack, worn and belt rows are otherwise flat
    // siblings and only a heading tells them apart.
    const pack = el('div.bags-pack');
    body.appendChild(pack);
    pack.appendChild(el('h3', { style: { margin: '10px 0 6px' } },
      `Pack — ${hero.inventory.length} / ${packCapacity(hero.equipped)}`));

    if (!hero.inventory.length) {
      pack.appendChild(el('div.item.empty', null, 'Nothing picked up yet.'));
    } else {
      pack.appendChild(el('div.col', { style: { gap: '6px' } }, hero.inventory.map((item, i) => {
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
            // Hand-offs to whoever is standing close enough to take it.
            ...squad.filter((m) => m.id !== hero.id).map((mate) => {
              const blocked = transferBlocker(hero, mate, item);
              return el('button.sm', {
                disabled: !!blocked,
                title: blocked ?? `Give to ${mate.name}`,
                onclick: () => act(() => transferItem(match, hero, mate, i)),
              }, `→ ${mate.name.split(' ').pop()}`);
            }),
            destroyButton(`pack:${item.id}`, () => destroyFromBackpack(match, hero, i)),
          ]),
        });
      })));
    }

    // --- Worn -------------------------------------------------------------
    const worn = el('div.bags-worn');
    body.appendChild(worn);
    worn.appendChild(el('h3', { style: { margin: '14px 0 6px' } }, 'Worn'));
    worn.appendChild(el('div.col', { style: { gap: '6px' } }, SLOTS.map((slot) => {
      const item = hero.equipped[slot];
      return itemRow(item, {
        slotLabel: SLOT_NAMES[slot],
        emptyText: `No ${SLOT_NAMES[slot].toLowerCase()}`,
        right: item
          ? el('button.sm', {
            // Camp kit stays on. It is worth nothing in the pack and the slot
            // is worse empty, so the only way it comes off is being replaced.
            disabled: isWooden(item) || hero.inventory.length >= packCapacity(hero.equipped),
            title: isWooden(item)
              ? 'Camp kit — it comes off when you equip something better'
              : (hero.inventory.length >= packCapacity(hero.equipped)
                ? 'Pack is full — make room first' : `Move ${item.name} to the pack`),
            onclick: () => act(() => unequipToBackpack(match, hero, slot)),
          }, 'Remove')
          : null,
      });
    })));

    // --- Consumables ------------------------------------------------------
    const belt = el('div.bags-belt');
    body.appendChild(belt);
    belt.appendChild(el('h3', { style: { margin: '14px 0 6px' } },
      `Belt — ${hero.consumables.length} / ${CONSUMABLE_SLOTS}`));
    if (!hero.consumables.length) {
      belt.appendChild(el('div.item.empty', null,
        'Nothing on the belt — heroes only drink what is here.'));
    } else {
      belt.appendChild(el('div.col', { style: { gap: '6px' } }, hero.consumables.map((stack, i) =>
        itemRow(stack, {
          right: destroyButton(`belt:${stack.id}`, () => destroyConsumable(match, hero, i)),
        }))));
    }

    body.appendChild(el('p.tiny.muted', { style: { marginTop: '12px' } },
      'The clock is still running. Destroying is permanent — nothing is left on the '
      + 'ground, because a hero standing over it would only pick it back up. '
      + 'Items can only be handed to a squadmate standing '
      + 'nearby. Anything dropped stays where you leave it, and anything worn is '
      + 'lost with the hero if they do not extract.'));
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
