// The camp: pick your three heroes, review the stash, set squad-wide tactics,
// and deploy.

import { el, clear, selectField, hideTooltip } from '../dom.js';
import { itemRow } from '../items.js';
import { CLASSES } from '../../data/classes.js';
import { XP_PER_LEVEL, MAX_LEVEL } from '../../data/classes.js';
import { FORMATIONS, SQUAD_PLANS, EXTRACT_PLANS } from '../../data/tactics.js';
import { computeStats } from '../../sim/stats.js';
import { availablePoints } from '../../sim/heroes.js';
import { heroById, squadHeroes, STASH_LIMIT } from '../../game/profile.js';
import { itemScore } from '../../data/gear.js';

export function hubScreen(app) {
  const root = el('div.screen');

  function render() {
    hideTooltip();
    clear(root);
    const profile = app.profile;

    root.appendChild(el('div.hub', null, [
      el('div.hub-main', null, [squadPanel(), rosterPanel()]),
      el('div.col', { style: { minHeight: '0' } }, [squadTacticsPanel(), stashPanel()]),
    ]));

    // ---------------------------------------------------------------- squad
    function squadPanel() {
      const heroes = squadHeroes(profile);
      const ready = heroes.length === 3;
      return el('div.panel', null, [
        el('div.panel-head', null, [
          el('div', null, [
            el('h2', null, 'Your squad'),
            el('div.small.muted', null, 'Three heroes deploy. Everything they wear is at risk.'),
          ]),
          el('button.primary', {
            disabled: !ready,
            onclick: () => app.go('deploy'),
          }, ready ? 'Deploy to the raid' : 'Pick three heroes'),
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
          el('b', { style: { color: geared < 5 ? 'var(--danger)' : 'inherit' } }, `${geared}/7 slots`),
        ]),
        el('div.statline', null, [
          el('span.muted', null, 'Consumables'),
          el('b', null, String(hero.consumables.length)),
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
      return el('div.panel.grow.scroll', { style: { minHeight: '0' } }, [
        el('div.panel-head', null, [
          el('h2', null, 'Roster'),
          el('span.small.muted', null, `${profile.roster.length} hero${profile.roster.length === 1 ? '' : 'es'}`),
        ]),
        el('div.panel-body', null, [
          bench.length
            ? el('div.squad-grid', null, bench.map((hero) => el('div', null, [
              heroCard(hero, false),
              el('button.sm', {
                style: { width: '100%', marginTop: '6px' },
                onclick: (e) => { e.stopPropagation(); swapIn(hero); },
              }, 'Add to squad'),
            ])))
            : el('div.small.muted', null, 'Every hero you own is already deployed.'),
        ]),
      ]);
    }

    function swapIn(hero) {
      // Replace whichever squad member shares this hero's class, else the last.
      const idx = profile.squad.findIndex((id) => heroById(profile, id)?.classId === hero.classId);
      profile.squad[idx >= 0 ? idx : profile.squad.length - 1] = hero.id;
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
          selectField('Squad leader',
            heroes.map((h, i) => ({ value: String(i), label: h.name })),
            String(Math.min(t.leaderIndex ?? 0, Math.max(0, heroes.length - 1))),
            (v) => { t.leaderIndex = Number(v); app.save(); render(); },
            'The rest of the squad forms up around the leader.'),
          el('div.field', null, [
            el('label', null, 'Rival squads'),
            el('button', {
              onclick: () => { t.avoidPlayers = !t.avoidPlayers; app.save(); render(); },
            }, t.avoidPlayers ? 'Avoid — break off from other squads' : 'Engage when contacted'),
          ]),
        ]),
      ]);
    }

    // ---------------------------------------------------------------- stash
    function stashPanel() {
      const sorted = profile.stash.slice().sort((a, b) => {
        if (a.kind === 'consumable' && b.kind !== 'consumable') return 1;
        if (b.kind === 'consumable' && a.kind !== 'consumable') return -1;
        return itemScore(b) - itemScore(a);
      });
      return el('div.panel.grow.scroll', { style: { minHeight: '0' } }, [
        el('div.panel-head', null, [
          el('h2', null, 'Stash'),
          el('span.small.muted', null, `${profile.stash.length} / ${STASH_LIMIT}`),
        ]),
        el('div.panel-body.col', { style: { gap: '6px' } },
          sorted.length
            ? sorted.map((item) => itemRow(item, {}))
            : [el('div.item.empty', null, 'Empty. Extract with loot to fill it.')]),
      ]);
    }
  }

  render();
  return root;
}
