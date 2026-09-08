// Hero configuration: the four things a player actually tunes between raids —
// gear, skill tree, equipped spells, and autobattle tactics.

import { el, clear, selectField, sliderField, tooltip, hideTooltip } from '../dom.js';
import { heroPortrait } from '../portrait.js';
import { ANIMATION_IDS } from '../../art/anim.js';
import { itemRow } from '../items.js';
import { CLASSES } from '../../data/classes.js';
import { SLOTS, SLOT_NAMES, canEquip, itemScore, isWooden } from '../../data/gear.js';
import { SPELLS, SPELL_SLOTS, spellsForClass } from '../../data/spells.js';
import { CONSUMABLE_SLOTS } from '../../data/consumables.js';
import { TREES, nodeBlocker, pointsInBranch } from '../../data/skilltrees.js';
import { STANCES, TARGET_PRIORITIES, LOOT_POLICIES, SPELL_POLICIES } from '../../data/tactics.js';
import { computeStats, statSummary } from '../../sim/stats.js';
import { availablePoints, availableSpells, allocatePoint, respec, sanitizeHero } from '../../sim/heroes.js';
import { addToStash, removeFromStash } from '../../game/profile.js';

export function heroScreen(app, hero, initialTab = 'gear') {
  let tab = initialTab;
  // Kept across re-renders so switching a tab does not reset the figure to
  // idle behind the player's back.
  let animShown = 'idle';
  const root = el('div.screen');

  function render() {
    hideTooltip();
    clear(root);
    sanitizeHero(hero);
    const cls = CLASSES[hero.classId];

    root.appendChild(el('div.hero-layout', null, [summaryPanel(), workPanel()]));

    // ---- left column ----
    function summaryPanel() {
      const stats = computeStats(hero);
      return el('div.panel.scroll', { style: { '--cls': cls.color, minHeight: '0' } }, [
        el('div.panel-head', null, [
          el('div', null, [
            el('div.tiny', { style: { color: cls.color, letterSpacing: '.12em', textTransform: 'uppercase' } }, `${cls.name} · ${cls.role}`),
            el('h2', null, hero.name),
          ]),
          el('span.pill', null, `Lv ${hero.level}`),
        ]),
        el('div.panel-body', null, [
          figureBlock(),
          el('p.small.muted', null, cls.blurb),
          el('div.divider'),
          el('h3', { style: { marginBottom: '6px' } }, 'Statistics'),
          ...statSummary(stats).map(([k, v]) =>
            el('div.statline', null, [el('span.muted', null, k), el('b', null, String(v))])),
          el('div.divider'),
          el('div.statline', null, [
            el('span.muted', null, 'Unspent skill points'),
            el('b', { style: { color: availablePoints(hero) > 0 ? 'var(--accent)' : 'inherit' } }, String(availablePoints(hero))),
          ]),
        ]),
      ]);
    }

    /**
     * The hero, moving. This is the one place in the game where the art is big
     * enough to look at, so it plays every animation on demand rather than
     * only idling — half of what a class is is how it swings.
     */
    function figureBlock() {
      const portrait = heroPortrait(hero.classId, {
        size: 176,
        anim: animShown,
      });
      return el('div.hero-figure', null, [
        portrait.node,
        el('div.anim-pick', null, ANIMATION_IDS.map((id) => el(
          'button.sm' + (animShown === id ? '.primary' : ''),
          {
            onclick: () => {
              animShown = id;
              portrait.play(id);
              // Re-render only the buttons' state; rebuilding the panel would
              // restart the animation the player just asked to see.
              for (const b of root.querySelectorAll('.anim-pick button')) {
                b.classList.toggle('primary', b.textContent === id);
              }
            },
          },
          id,
        ))),
      ]);
    }

    // ---- right column ----
    function workPanel() {
      const panel = el('div.panel', { style: { display: 'flex', flexDirection: 'column', minHeight: '0' } });
      panel.appendChild(el('div.tabs', null, [
        ['gear', 'Gear'], ['skills', 'Skill tree'], ['spells', 'Spells'], ['tactics', 'Tactics'],
      ].map(([id, label]) => el('button.tab' + (tab === id ? '.active' : ''), {
        onclick: () => { tab = id; render(); },
      }, label))));

      const body = el('div.scroll', { style: { padding: '14px', flex: '1', minHeight: '0' } });
      if (tab === 'gear') gearTab(body);
      else if (tab === 'skills') skillsTab(body);
      else if (tab === 'spells') spellsTab(body);
      else tacticsTab(body);
      panel.appendChild(body);
      return panel;
    }

    // ================================================================ GEAR ==
    function gearTab(body) {
      body.appendChild(el('div.two-col', null, [
        el('div', null, [
          el('h3', { style: { marginBottom: '8px' } }, 'Equipped'),
          el('div.col', { style: { gap: '6px' } }, SLOTS.map((slot) => {
            const item = hero.equipped[slot];
            // Camp kit has no unequip. The stash will not take it, so the
            // button could only ever destroy a free piece and leave the slot
            // emptier than it found it — a click with no upside. It comes off
            // when something better goes on, which is the only reason to
            // touch it.
            const takeOff = item && !isWooden(item) ? () => {
              addToStash(app.profile, item);
              hero.equipped[slot] = null;
              app.save();
              render();
            } : null;
            return itemRow(item, {
              slotLabel: SLOT_NAMES[slot],
              emptyText: `No ${SLOT_NAMES[slot].toLowerCase()}`,
              onclick: takeOff,
              right: item
                ? el('span.tiny.dim', null, takeOff ? 'unequip' : 'camp kit')
                : null,
            });
          })),

          el('h3', { style: { margin: '16px 0 8px' } }, `Consumables (${hero.consumables.length}/${CONSUMABLE_SLOTS})`),
          el('div.col', { style: { gap: '6px' } }, [
            ...hero.consumables.map((c, i) => itemRow(c, {
              onclick: () => {
                addToStash(app.profile, hero.consumables[i]);
                hero.consumables.splice(i, 1);
                app.save();
                render();
              },
              right: el('span.tiny.dim', null, 'remove'),
            })),
            hero.consumables.length === 0 ? el('div.item.empty', null, 'No consumables packed') : null,
          ]),
          el('p.tiny.muted', { style: { marginTop: '8px' } },
            'Heroes drink these on their own, following the thresholds on the Tactics tab.'),
        ]),

        el('div', null, [
          el('h3', { style: { marginBottom: '8px' } }, 'Stash'),
          stashList(),
        ]),
      ]));
    }

    function stashList() {
      const usable = app.profile.stash.filter((it) =>
        it.kind === 'consumable' ? true : canEquip(it, hero.classId));

      if (!usable.length) {
        return el('div.item.empty', null, 'Nothing in the stash this hero can use.');
      }

      // Best upgrades first — the point of the screen is finding them.
      const sorted = usable.slice().sort((a, b) => {
        if (a.kind === 'consumable' && b.kind !== 'consumable') return 1;
        if (b.kind === 'consumable' && a.kind !== 'consumable') return -1;
        return itemScore(b) - itemScore(a);
      });

      return el('div.col', { style: { gap: '6px' } }, sorted.map((item) => {
        const equipped = item.kind === 'gear' ? hero.equipped[item.slot] : null;
        const delta = item.kind === 'gear' ? itemScore(item) - itemScore(equipped) : 0;
        return itemRow(item, {
          compareTo: equipped,
          onclick: () => equipFromStash(item),
          right: item.kind === 'gear' && equipped
            ? el('span.tiny', { style: { color: delta >= 0 ? 'var(--good)' : 'var(--danger)' } },
              `${delta >= 0 ? '▲' : '▼'}${Math.abs(delta)}`)
            : el('span.tiny.dim', null, item.kind === 'consumable' ? 'pack' : 'equip'),
        });
      }));
    }

    function equipFromStash(item) {
      if (item.kind === 'consumable') {
        if (hero.consumables.length >= CONSUMABLE_SLOTS) return;
        // Packing takes the whole stack out of the stash.
        removeFromStash(app.profile, item.id);
        hero.consumables.push(item);
      } else {
        const current = hero.equipped[item.slot];
        removeFromStash(app.profile, item.id);
        // Whatever comes off goes back on the shelf, unless it is camp kit —
        // `addToStash` throws that away rather than storing something free.
        if (current) addToStash(app.profile, current);
        hero.equipped[item.slot] = item;
      }
      app.save();
      render();
    }

    // ============================================================== SKILLS ==
    function skillsTab(body) {
      const points = availablePoints(hero);
      body.appendChild(el('div.spread', { style: { marginBottom: '12px' } }, [
        el('div', null, [
          el('h3', null, 'Skill tree'),
          el('div.small.muted', null, `${points} point${points === 1 ? '' : 's'} to spend · one per level.`),
        ]),
        el('button.sm.danger', {
          onclick: () => { respec(hero); app.save(); render(); },
        }, 'Respec'),
      ]));

      body.appendChild(el('div.tree', null, TREES[hero.classId].branches.map((branch) => {
        const spent = pointsInBranch(hero.classId, hero.alloc, branch.id);
        const nodes = TREES[hero.classId].nodes.filter((n) => n.branch === branch.id);
        return el('div.branch', null, [
          el('div.spread', null, [
            el('h4', null, branch.name),
            el('span.pill', null, `${spent} pts`),
          ]),
          el('div.tiny.muted', { style: { marginBottom: '6px' } }, branch.blurb),
          ...nodes.map((node) => nodeRow(node, points)),
        ]);
      })));
    }

    function nodeRow(node, points) {
      const rank = hero.alloc[node.id] ?? 0;
      const blocker = nodeBlocker(hero.classId, hero.alloc, node, points);
      const row = el('div.node' + (rank > 0 ? '.taken' : '') + (blocker ? '.locked' : ''), {
        onclick: blocker ? null : () => {
          if (allocatePoint(hero, node.id)) { app.save(); render(); }
        },
      }, [
        el('div.rank', null, `${rank}/${node.maxRank}`),
        el('div.grow', null, [
          el('div.nm', null, node.name),
          el('div.desc', null, node.desc),
        ]),
      ]);

      return tooltip(row, () => [
        el('div.t-name', null, node.name),
        el('div.t-sub', null, node.unlocks ? 'Unlocks a spell' : node.aura ? 'Squad aura' : 'Passive'),
        el('div.t-mod', null, node.desc),
        node.tierReq > 0 ? el('div.small.muted', null, `Requires ${node.tierReq} points in ${node.branch}.`) : null,
        blocker ? el('div.t-desc', { style: { color: 'var(--danger)', fontStyle: 'normal' } }, blocker) : null,
      ]);
    }

    // ============================================================== SPELLS ==
    function spellsTab(body) {
      const unlocked = availableSpells(hero);
      body.appendChild(el('div', { style: { marginBottom: '12px' } }, [
        el('h3', null, `Equipped spells (${hero.spells.length}/${SPELL_SLOTS})`),
        el('div.small.muted', null, 'Heroes cast these themselves. Set a spell to Emergency to hold it until the squad is in real trouble.'),
      ]));

      body.appendChild(el('div.col', { style: { gap: '6px', marginBottom: '16px' } },
        Array.from({ length: SPELL_SLOTS }, (_, i) => {
          const spell = SPELLS[hero.spells[i]];
          if (!spell) return el('div.item.empty', null, `Spell slot ${i + 1} — empty`);
          const policy = hero.tactics.spellPolicy?.[spell.id] ?? 'auto';
          return el('div.item', { style: { '--rar': 'var(--rare)' } }, [
            el('div.grow', null, [
              el('div.nm', null, spell.name),
              el('div.mods', null, spell.desc),
              el('div.tiny.dim', { style: { marginTop: '3px' } },
                `${spell.manaCost} mana · ${spell.cooldown}s cooldown${spell.range ? ` · ${spell.range} range` : ''}`),
            ]),
            el('div.col', { style: { gap: '4px', alignItems: 'flex-end' } }, [
              el('select', {
                style: { width: '120px', fontSize: '12px', padding: '3px 6px' },
                onchange: (e) => {
                  hero.tactics.spellPolicy = hero.tactics.spellPolicy ?? {};
                  hero.tactics.spellPolicy[spell.id] = e.target.value;
                  app.save();
                },
              }, Object.values(SPELL_POLICIES).map((p) =>
                el('option', { value: p.id, selected: p.id === policy }, p.name))),
              el('button.sm.ghost', {
                onclick: () => { hero.spells.splice(i, 1); app.save(); render(); },
              }, 'Unslot'),
            ]),
          ]);
        })));

      body.appendChild(el('h3', { style: { marginBottom: '8px' } }, 'Known spells'));
      body.appendChild(el('div.slot-grid', null, spellsForClass(hero.classId).map((spell) => {
        const known = unlocked.includes(spell.id);
        const slotted = hero.spells.includes(spell.id);
        const full = hero.spells.length >= SPELL_SLOTS;
        const node = el('div.item', {
          style: { '--rar': known ? 'var(--uncommon)' : 'var(--line)', opacity: known ? 1 : 0.5 },
          onclick: !known || slotted || full ? null : () => {
            hero.spells.push(spell.id);
            app.save();
            render();
          },
        }, [
          el('div.grow', null, [
            el('div.nm', null, spell.name),
            el('div.mods', null, spell.desc),
          ]),
          el('span.tiny.dim', null, slotted ? 'slotted' : known ? (full ? 'slots full' : 'equip') : 'locked'),
        ]);
        return tooltip(node, () => [
          el('div.t-name', null, spell.name),
          el('div.t-sub', null, `${spell.manaCost} mana · ${spell.cooldown}s cooldown`),
          el('div.t-mod', null, spell.desc),
          !known ? el('div.t-desc', { style: { color: 'var(--danger)', fontStyle: 'normal' } },
            'Locked — unlock it in the skill tree.') : null,
        ]);
      })));
    }

    // ============================================================= TACTICS ==
    function tacticsTab(body) {
      const t = hero.tactics;
      const set = (key) => (value) => { t[key] = value; app.save(); render(); };
      const setQuiet = (key) => (value) => { t[key] = value; app.save(); };

      body.appendChild(el('div.two-col.wide-gap', null, [
        el('div', null, [
          el('h3', { style: { marginBottom: '10px' } }, 'Behaviour'),
          selectField('Stance',
            Object.values(STANCES).map((s) => ({ value: s.id, label: s.name })),
            t.stance, set('stance'), STANCES[t.stance]?.desc),
          selectField('Target priority',
            Object.values(TARGET_PRIORITIES).map((s) => ({ value: s.id, label: s.name })),
            t.priority, set('priority'), TARGET_PRIORITIES[t.priority]?.desc),
          selectField('Loot filter',
            Object.values(LOOT_POLICIES).map((s) => ({ value: s.id, label: s.name })),
            t.lootPolicy, set('lootPolicy'), LOOT_POLICIES[t.lootPolicy]?.desc),
          el('div.field', null, [
            el('label', null, 'Focus fire'),
            el('button', {
              onclick: () => { t.focusFire = !t.focusFire; app.save(); render(); },
            }, t.focusFire ? 'On — pile onto the squad target' : 'Off — pick targets independently'),
          ]),
        ]),

        el('div', null, [
          el('h3', { style: { marginBottom: '10px' } }, 'Thresholds'),
          sliderField('Break off below', t.retreatHpPct, setQuiet('retreatHpPct'), {
            min: 0, max: 0.7, step: 5,
            hint: 'Health at which this hero disengages and falls back toward the squad.',
          }),
          sliderField('Drink a potion below', t.potionHpPct, setQuiet('potionHpPct'), {
            min: 0.1, max: 0.9, step: 5,
            hint: 'Health at which packed healing consumables get used.',
          }),
          el('div.divider'),
          el('p.small.muted', null,
            'You never command this hero directly. These rules, the stance, and the spell ' +
            'policies are the whole of your control once the raid starts — so read them as ' +
            'the orders you are leaving behind.'),
        ]),
      ]));
    }
  }

  render();
  return root;
}
