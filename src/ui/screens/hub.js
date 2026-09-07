// The camp: pick your three heroes, review the stash, set squad-wide tactics,
// and deploy.

import { el, clear, selectField, hideTooltip } from '../dom.js';
import { heroPortrait, beastPortrait } from '../portrait.js';
import { itemRow } from '../items.js';
import { CLASSES } from '../../data/classes.js';
import { XP_PER_LEVEL, MAX_LEVEL } from '../../data/classes.js';
import { FORMATIONS, SQUAD_PLANS, EXTRACT_PLANS, LOOT_FLOORS } from '../../data/tactics.js';
import { computeStats } from '../../sim/stats.js';
import { availablePoints } from '../../sim/heroes.js';
import { squadHeroes, STASH_LIMIT, achievementProgress, stashParts, stashGear, knownSpecies } from '../../game/profile.js';
import { QUALITIES, QUALITY_ORDER, partValue } from '../../data/parts.js';
import { CREATURES } from '../../data/creatures.js';
import { bossForAchievement } from '../../data/achievements.js';
import { itemScore, SLOTS, packCapacity } from '../../data/gear.js';
import { HUNT_KINDS, quarryLabel, sanitizeQuarry, kindsForSpecies } from '../../data/hunts.js';
import { setCounts, SET_FULL } from '../../data/sets.js';

const RING_NAMES = { 0: 'outer ring', 1: 'mid ring', 2: 'core' };

export function hubScreen(app) {
  const root = el('div.screen');
  function render() {
    hideTooltip();
    clear(root);
    const profile = app.profile;

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
        // Facing right, as the rig is authored. Pointing it up the card put
        // every long weapon straight through the top of the frame.
        el('div.card-figure', null,
          heroPortrait(hero.classId, { size: 84, hoverAnim: 'attack' }).node),
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
          quarryField(t),
          selectField('Minimum carve quality',
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

    /**
     * The standing hunt order, written against the journal.
     *
     * It is a preference rather than a promise: a raid draws about fifteen of
     * the fifty species, so an order can name something this map does not
     * hold, and the raid drops it at the landing and says so. That is why the
     * mid-raid Hunt panel exists alongside this one — that list is built from
     * what is actually out there.
     */
    function quarryField(t) {
      const known = [...knownSpecies(profile)]
        .map((id) => CREATURES[id])
        .filter(Boolean)
        .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
      const quarry = sanitizeQuarry(t.quarry);
      const kinds = quarry ? kindsForSpecies(quarry.speciesId) : [];

      // Which set the squad is closest to finishing is the thing that makes
      // one species worth asking for over another, so the hint says it.
      const wants = new Map();
      for (const hero of squadHeroes(profile)) {
        for (const [speciesId, n] of setCounts(hero.equipped)) {
          if (n >= SET_FULL) continue;
          if ((wants.get(speciesId) ?? 0) < n) wants.set(speciesId, n);
        }
      }
      const closest = [...wants.entries()].sort((a, b) => b[1] - a[1])[0];

      return el('div.field', null, [
        el('label', null, 'Hunt'),
        el('select', {
          value: quarry?.speciesId ?? '',
          onchange: (e) => {
            const id = e.target.value;
            t.quarry = id ? sanitizeQuarry({ speciesId: id, kind: quarry?.kind }) : null;
            app.save();
            render();
          },
        }, [
          el('option', { value: '' }, 'Whatever the raid plan turns up'),
          ...known.map((c) => el('option', { value: c.id },
            `${c.name} — ${RING_NAMES[c.tier] ?? 'unknown'}`)),
        ]),
        kinds.length > 1
          ? el('div.row', { style: { gap: '4px', marginTop: '5px' } }, kinds.map((kind) => el(
            'button.sm' + (quarry.kind === kind ? '.primary' : ''),
            { onclick: () => { t.quarry = { ...quarry, kind }; app.save(); render(); } },
            HUNT_KINDS[kind].name,
          )))
          : null,
        el('div.hint', null, quarry
          ? `${quarryLabel(quarry)}. If this raid holds none, the order is dropped when you land and you pick another from the Hunt panel.`
          : closest
            ? `Nobody is hunting anything in particular. ${CREATURES[closest[0]]?.name ?? 'One set'} is your closest set, at ${closest[1]}/${SET_FULL}.`
            : 'Nobody is hunting anything in particular. The squad takes what the raid plan walks them into.'),
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
          // The creature itself, because a locked row's whole job is to tell a
          // player what they have to go and kill. A name and a ring are a
          // reading task; the animal is not.
          return el('div.trophy' + (got ? '.got' : ''), { style: { '--cls': cls.color } }, [
            el('div.trophy-beast', null,
              beastPortrait(ach.bossId, { size: 54, hoverAnim: 'attack' }).node),
            el('div.grow', null, [
              el('div.spread', null, [
                el('div.nm', null, got ? ach.name : boss?.name ?? ach.bossId),
                el('span.pill', { style: { color: got ? cls.color : 'var(--dim)' } },
                  got ? cls.name : 'Locked'),
              ]),
              el('div.tiny.dim', null, got
                ? `${cls.name} unlocked · ${cls.role}`
                : `${ach.blurb} Unlocks the ${cls.name}.`),
            ]),
          ]);
        })),
      ]);
    }

    // ---------------------------------------------------------------- stash
    // Two things live here now: parts waiting for the smith, and finished
    // equipment nobody is wearing. Parts are grouped by species, because that
    // is the unit the blacksmith works in and the unit a player thinks in —
    // "how close am I to a full Boulderhide set" is the only question that
    // matters when looking at a pile of carves.
    function stashPanel() {
      const parts = stashParts(profile);
      const gear = stashGear(profile);
      const other = profile.stash.filter((i) => i.kind !== 'part' && i.kind !== 'gear');

      const bySpecies = new Map();
      for (const part of parts) {
        if (!bySpecies.has(part.speciesId)) bySpecies.set(part.speciesId, []);
        bySpecies.get(part.speciesId).push(part);
      }
      const species = [...bySpecies.entries()]
        .map(([id, list]) => ({
          id,
          name: CREATURES[id]?.name ?? list[0].speciesName,
          colour: CREATURES[id]?.color ?? 'var(--line)',
          list: list.slice().sort((a, b) =>
            QUALITY_ORDER.indexOf(b.quality) - QUALITY_ORDER.indexOf(a.quality)),
        }))
        .sort((a, b) => b.list.length - a.list.length);

      return el('div.panel.grow.scroll', { style: { minHeight: '0' } }, [
        el('div.panel-head', null, [
          el('h2', null, 'Stash'),
          el('div.row', { style: { gap: '8px' } }, [
            el('button.sm', { onclick: () => app.go('smith') }, 'Blacksmith'),
            el('span.small.muted', null, `${profile.stash.length} / ${STASH_LIMIT}`),
          ]),
        ]),
        el('div.panel-body.col', { style: { gap: '8px' } }, [
          parts.length
            ? el('div.col', { style: { gap: '6px' } }, species.map((sp) => {
              const counts = {};
              for (const part of sp.list) {
                counts[part.partType] = (counts[part.partType] ?? 0) + 1;
              }
              const best = sp.list[0];
              return el('div.species-lot', { style: { '--cls': sp.colour } }, [
                el('div.spread', null, [
                  el('div.nm', null, sp.name),
                  el('span.pill', { style: { color: QUALITIES[best.quality]?.color } },
                    `${sp.list.length} carve${sp.list.length === 1 ? '' : 's'}`),
                ]),
                el('div.tiny.dim', null, Object.entries(counts)
                  .map(([type, n]) => `${n}× ${type}`).join(' · ')),
                el('div.tiny.dim', null, `best ${QUALITIES[best.quality]?.name ?? best.quality}`),
              ]);
            }))
            : el('div.item.empty', null, 'No parts. Carve something and bring it home.'),

          gear.length
            ? el('div.col', { style: { gap: '6px' } }, [
              el('h3', { style: { margin: '6px 0 0' } }, `Forged (${gear.length})`),
              ...gear.map((item) => itemRow(item, {})),
            ])
            : null,

          other.length
            ? el('div.col', { style: { gap: '6px' } }, [
              el('h3', { style: { margin: '6px 0 0' } }, 'Supplies'),
              ...other.map((item) => itemRow(item, {})),
            ])
            : null,
        ]),
      ]);
    }
  }

  render();
  return root;
}
