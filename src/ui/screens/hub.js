// The camp: pick your three heroes, review the stash, set squad-wide tactics,
// and deploy.

import { el, clear, selectField, hideTooltip } from '../dom.js';
import { itemRow } from '../items.js';
import { CLASSES } from '../../data/classes.js';
import { XP_PER_LEVEL, MAX_LEVEL } from '../../data/classes.js';
import { FORMATIONS, SQUAD_PLANS, EXTRACT_PLANS, LOOT_FLOORS } from '../../data/tactics.js';
import { computeStats } from '../../sim/stats.js';
import { availablePoints } from '../../sim/heroes.js';
import {
  squadHeroes, STASH_LIMIT, salvageFromStash, achievementProgress,
  SALVAGE_FILTERS, salvagePreview, salvageAll,
} from '../../game/profile.js';
import { bossForAchievement } from '../../data/achievements.js';
import { salvageValue, canSalvage, salvageTable } from '../../data/economy.js';
import { itemScore, SLOTS, packCapacity } from '../../data/gear.js';

export function hubScreen(app) {
  const root = el('div.screen');
  // Salvaging cannot be undone, so it takes two taps: the first arms this.
  let armed = null;

  function render() {
    hideTooltip();
    clear(root);
    const profile = app.profile;

    function salvage(key, run) {
      if (armed === key) {
        const gained = run();
        armed = null;
        app.save();
        render();
        return gained;
      }
      armed = key;
      render();
      return 0;
    }

    root.appendChild(el('div.hub', null, [
      el('div.hub-main', null, [squadPanel(), rosterPanel()]),
      el('div.col', { style: { minHeight: '0' } }, [squadTacticsPanel(), trophyPanel(), stashPanel()]),
    ]));

    // ---------------------------------------------------------------- squad
    function squadPanel() {
      const heroes = squadHeroes(profile);
      const hasSquad = heroes.length === 3;
      const leaderChosen = heroes.some((h) => h.id === profile.squadTactics.leaderId);
      const ready = hasSquad && leaderChosen;
      return el('div.panel', null, [
        el('div.panel-head', null, [
          el('div', null, [
            el('h2', null, 'Your squad'),
            el('div.small.muted', null, 'Three heroes deploy. Everything they wear is at risk.'),
          ]),
          el('button.primary', {
            disabled: !ready,
            onclick: () => app.go('deploy'),
          }, !hasSquad ? 'Pick three heroes' : !leaderChosen ? 'Name a leader first' : 'Deploy to the raid'),
        ]),
        el('div.panel-body', null, [
          el('div.squad-grid', null, heroes.map((hero) => heroCard(hero, true))),
          unspentWarning(heroes),
        ]),
      ]);
    }

    function unspentWarning(heroes) {
      const pending = heroes.filter((h) => availablePoints(h) > 0);
      if (!pending.length) return null;
      return el('div.small', { style: { marginTop: '10px', color: 'var(--accent)' } },
        `Unspent skill points: ${pending.map((h) => `${h.name} (${availablePoints(h)})`).join(', ')}`);
    }

    function heroCard(hero, inSquad) {
      const cls = CLASSES[hero.classId];
      const stats = computeStats(hero);
      const geared = Object.values(hero.equipped).filter(Boolean).length;
      const xpNeeded = hero.level >= MAX_LEVEL ? 0 : XP_PER_LEVEL(hero.level);

      return el('div.hero-card' + (inSquad ? '.selected' : ''), {
        style: { '--cls': cls.color },
        onclick: () => app.go('hero', { heroId: hero.id }),
      }, [
        el('div.spread', null, [
          el('div', null, [
            el('div.cls', null, `${cls.name} · ${cls.role}`),
            el('div.nm', null, hero.name),
          ]),
          el('span.pill', null, `Lv ${hero.level}`),
        ]),
        el('div.statline', null, [el('span.muted', null, 'Health'), el('b', null, String(Math.round(stats.maxHp)))]),
        el('div.statline', null, [el('span.muted', null, 'Attack power'), el('b', null, String(Math.round(stats.attackPower)))]),
        el('div.statline', null, [el('span.muted', null, 'Armour / resist'), el('b', null, `${Math.round(stats.armor)} / ${Math.round(stats.resist)}`)]),
        el('div.statline', null, [
          el('span.muted', null, 'Gear'),
          el('b', { style: { color: geared < SLOTS.length - 2 ? 'var(--danger)' : 'inherit' } },
            `${geared}/${SLOTS.length} slots`),
        ]),
        el('div.statline', null, [
          el('span.muted', null, 'Consumables'),
          el('b', null, String(hero.consumables.length)),
        ]),
        el('div.statline', null, [
          el('span.muted', null, 'Carries'),
          el('b', null, hero.equipped.pouch
            ? `${packCapacity(hero.equipped)} items`
            : `${packCapacity(hero.equipped)} — no pouch`),
        ]),
        xpNeeded ? el('div.xpbar', null, el('i', { style: { width: `${Math.min(100, (hero.xp / xpNeeded) * 100)}%` } })) : null,
        el('div.tiny.dim', { style: { marginTop: '5px' } },
          xpNeeded ? `${hero.xp} / ${xpNeeded} xp` : 'Max level'),
        availablePoints(hero) > 0
          ? el('div.tiny', { style: { color: 'var(--accent)', marginTop: '3px' } }, `${availablePoints(hero)} skill points unspent`)
          : null,
      ]);
    }

    // --------------------------------------------------------------- roster
    function rosterPanel() {
      const bench = profile.roster.filter((h) => !profile.squad.includes(h.id));
      const squad = squadHeroes(profile);
      return el('div.panel.grow.scroll', { style: { minHeight: '0' } }, [
        el('div.panel-head', null, [
          el('h2', null, 'Roster'),
          el('span.small.muted', null, `${profile.roster.length} hero${profile.roster.length === 1 ? '' : 'es'}`),
        ]),
        el('div.panel-body', null, [
          bench.length
            ? el('div.squad-grid', null, bench.map((hero) => el('div', null, [
              heroCard(hero, false),
              squad.length < 3
                ? el('button.sm', {
                  style: { width: '100%', marginTop: '6px' },
                  onclick: (e) => { e.stopPropagation(); swapIn(hero); },
                }, 'Add to squad')
                // Naming who leaves is the player's call. A single button had
                // to guess, and its guess — same class, else the last slot —
                // meant every one of the eight unlockable classes silently
                // evicted whoever was standing in slot three.
                : el('div.swap-pick', null, [
                  el('div.tiny.dim', null, 'Deploy in place of'),
                  el('div.row', { style: { gap: '4px', flexWrap: 'wrap' } },
                    squad.map((m) => el('button.sm', {
                      style: { '--cls': CLASSES[m.classId].color, flex: '1 1 0' },
                      title: `${hero.name} replaces ${m.name} (${CLASSES[m.classId].name})`,
                      onclick: (e) => { e.stopPropagation(); swapIn(hero, m.id); },
                    }, m.name.split(' ').pop()))),
                ]),
            ])))
            : el('div.small.muted', null, 'Every hero you own is already deployed.'),
        ]),
      ]);
    }

    /**
     * Put a bench hero into the squad. With a free slot they simply join;
     * otherwise `replaceId` names who they are replacing.
     */
    function swapIn(hero, replaceId = null) {
      if (profile.squad.length < 3 && !replaceId) {
        profile.squad.push(hero.id);
      } else {
        const idx = profile.squad.indexOf(replaceId);
        profile.squad[idx >= 0 ? idx : profile.squad.length - 1] = hero.id;
      }
      // Replacing the leader leaves nobody walking point, and that is a
      // decision rather than something to guess at — Deploy stays disabled
      // until the player names one.
      if (!profile.squad.includes(profile.squadTactics.leaderId)) {
        profile.squadTactics.leaderId = null;
      }
      app.save();
      render();
    }

    // ------------------------------------------------------- squad tactics
    function squadTacticsPanel() {
      const t = profile.squadTactics;
      const set = (key) => (value) => { t[key] = value; app.save(); render(); };
      const heroes = squadHeroes(profile);

      return el('div.panel', null, [
        el('div.panel-head', null, el('h2', null, 'Squad orders')),
        el('div.panel-body', null, [
          selectField('Raid plan',
            Object.values(SQUAD_PLANS).map((p) => ({ value: p.id, label: p.name })),
            t.plan, set('plan'), SQUAD_PLANS[t.plan]?.desc),
          selectField('Formation',
            Object.values(FORMATIONS).map((p) => ({ value: p.id, label: p.name })),
            t.formation, set('formation'), FORMATIONS[t.formation]?.desc),
          selectField('Extraction plan',
            Object.values(EXTRACT_PLANS).map((p) => ({ value: p.id, label: p.name })),
            t.extractPlan, set('extractPlan'), EXTRACT_PLANS[t.extractPlan]?.desc),
          el('div.field', null, [
            el('label', null, 'Leader'),
            el('div.leader-pick', null, heroes.map((h) => el(
              'button.sm' + (t.leaderId === h.id ? '.primary' : ''),
              {
                style: { '--cls': CLASSES[h.classId].color },
                onclick: () => { t.leaderId = h.id; app.save(); render(); },
              },
              h.name,
            ))),
            el('div.hint', null, t.leaderId
              ? 'The leader walks the navigation. Everyone else stays with them, and the leader slows or turns back for stragglers.'
              : 'Name one hero to walk point. The raid will not start without one.'),
          ]),
          el('div.field', null, [
            el('label', null, 'Rival squads'),
            el('button', {
              onclick: () => { t.avoidPlayers = !t.avoidPlayers; app.save(); render(); },
            }, t.avoidPlayers ? 'Avoid — break off from other squads' : 'Engage when contacted'),
          ]),
          selectField('Minimum loot rarity',
            Object.values(LOOT_FLOORS).map((f) => ({ value: f.id, label: f.name })),
            t.lootFloor ?? 'any', set('lootFloor'),
            `${LOOT_FLOORS[t.lootFloor ?? 'any']?.desc} Applies on top of each hero's own loot policy — the stricter of the two wins.`),
          el('div.field', null, [
            el('label', null, 'Consumables'),
            el('button', {
              onclick: () => { t.takeConsumables = t.takeConsumables === false; app.save(); render(); },
            }, t.takeConsumables === false ? 'Leave them on the ground' : 'Pick up — belt first, then bags'),
            el('div.hint', null, t.takeConsumables === false
              ? 'Potions and bandages are ignored entirely.'
              : 'Found potions go straight onto the belt, which is the only place a hero will drink them from. They fall back to the pack when the belt is full.'),
          ]),
        ]),
      ]);
    }

    // -------------------------------------------------------------- trophies
    // The only place the game says out loud which bosses exist and what each
    // one is worth. A locked row names its boss and where to find it, because
    // a player who wants a Necromancer needs to know what to go and kill.
    function trophyPanel() {
      const rows = achievementProgress(profile);
      const earned = rows.filter((r) => r.earned).length;

      return el('div.panel', null, [
        el('div.panel-head', null, [
          el('h2', null, 'Trophies'),
          el('span.small.muted', null, `${earned} / ${rows.length} classes unlocked`),
        ]),
        el('div.panel-body.col', { style: { gap: '5px' } }, rows.map(({ ach, earned: got }) => {
          const cls = CLASSES[ach.unlocks];
          const boss = bossForAchievement(ach);
          return el('div.trophy' + (got ? '.got' : ''), { style: { '--cls': cls.color } }, [
            el('div.spread', null, [
              el('div.nm', null, got ? ach.name : boss?.name ?? ach.bossId),
              el('span.pill', { style: { color: got ? cls.color : 'var(--dim)' } },
                got ? cls.name : 'Locked'),
            ]),
            el('div.tiny.dim', null, got
              ? `${cls.name} unlocked · ${cls.role}`
              : `${ach.blurb} Unlocks the ${cls.name}.`),
          ]);
        })),
      ]);
    }

    // ---------------------------------------------------------------- stash
    function stashPanel() {
      const sorted = profile.stash.slice().sort((a, b) => {
        if (a.kind === 'consumable' && b.kind !== 'consumable') return 1;
        if (b.kind === 'consumable' && a.kind !== 'consumable') return -1;
        return itemScore(b) - itemScore(a);
      });
      // One row per way of asking "clear this out". Only the ones that would
      // actually destroy something are shown, so the row shrinks as the stash
      // gets cleaner rather than offering a wall of dead buttons.
      const bulk = Object.values(SALVAGE_FILTERS)
        .map((filter) => ({ filter, ...salvagePreview(profile, filter.id) }))
        .filter((entry) => entry.count > 0);

      return el('div.panel.grow.scroll', { style: { minHeight: '0' } }, [
        el('div.panel-head', null, [
          el('h2', null, 'Stash'),
          el('div.row', { style: { gap: '10px' } }, [
            el('span.scrap', {
              title: `Scrap, for repairing gear later. Salvage pays ${
                salvageTable().map((r) => `${r.rarity} ${r.scrap}`).join(', ')}, +5% per item level.`,
            }, [
              el('span.scrap-pip'),
              el('span', null, String(profile.scrap ?? 0)),
            ]),
            el('span.small.muted', null, `${profile.stash.length} / ${STASH_LIMIT}`),
          ]),
        ]),
        el('div.panel-body.col', { style: { gap: '6px' } }, [
          bulk.length
            ? el('div.salvage-all', null, [
              el('div.tiny.dim', null, 'Salvage all'),
              el('div.row', { style: { gap: '4px', flexWrap: 'wrap' } },
                bulk.map(({ filter, count, scrap: worth }) => {
                  const key = `bulk:${filter.id}`;
                  const isArmed = armed === key;
                  return el('button.sm' + (isArmed ? '.danger.armed' : ''), {
                    title: isArmed
                      ? 'Tap again — these are gone for good'
                      : `${filter.desc} ${count} item${count === 1 ? '' : 's'} for ${worth} scrap.`,
                    onclick: () => salvage(key, () => salvageAll(profile, filter.id)),
                  }, isArmed
                    ? `${count} for ${worth}?`
                    : `${filter.name} (${count})`);
                })),
            ])
            : null,
          ...(sorted.length
            ? sorted.map((item) => {
              const worth = salvageValue(item);
              const key = `item:${item.id}`;
              return itemRow(item, {
                right: canSalvage(item)
                  ? el('button.sm' + (armed === key ? '.danger.armed' : ''), {
                    title: armed === key
                      ? 'Tap again — the item is gone for good'
                      : `Break down for ${worth} scrap`,
                    onclick: () => salvage(key, () => salvageFromStash(profile, item.id)),
                  }, armed === key ? 'Sure?' : `Salvage ${worth}`)
                  : el('span.tiny.dim', null, 'used, not salvaged'),
              });
            })
            : [el('div.item.empty', null, 'Empty. Extract with loot to fill it.')]),
        ]),
      ]);
    }
  }

  render();
  return root;
}
