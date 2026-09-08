// The blacksmith. Parts in, equipment out.
//
// Laid out around the question a player actually has, which is never "what can
// I make" in the abstract — it is "I came back with four Boulderhide plates,
// what are they worth". So recipes are grouped by the pile they consume, and
// every row states its cost, its grade and what the piece would do, before
// anything is spent.

import { el, clear, hideTooltip } from '../dom.js';
import { modSummary } from '../items.js';
import { CLASSES } from '../../data/classes.js';
import { QUALITIES } from '../../data/parts.js';
import { CREATURES } from '../../data/creatures.js';
import { SLOT_NAMES } from '../../data/gear.js';
import { squadHeroes, stashParts } from '../../game/profile.js';
import { availableRecipes, recipeCost, recipeLabel, forge, forgeBlocker } from '../../game/smith.js';
import { activeSets, setCounts, SET_PARTIAL, SET_FULL } from '../../data/sets.js';

export function smithScreen(app) {
  const root = el('div.screen.scroll');
  // Forging destroys the parts, so it takes two taps like everything else that
  // cannot be undone.
  let armed = null;
  let forClass = null;

  function render() {
    hideTooltip();
    clear(root);
    const profile = app.profile;
    const roster = profile.roster;
    if (forClass === null) forClass = squadHeroes(profile)[0]?.classId ?? roster[0]?.classId ?? null;

    const parts = stashParts(profile);
    const recipes = availableRecipes(parts, forClass);
    const canMake = recipes.filter((r) => r.affordable);
    const short = recipes.filter((r) => !r.affordable);

    root.appendChild(el('div.smith', null, [
      el('div.panel', null, [
        el('div.panel-head', null, [
          el('div', null, [
            el('h2', null, 'Blacksmith'),
            el('div.small.muted', null,
              'A piece comes out at the grade of the worst part that went into it.'),
          ]),
          el('button.ghost', { onclick: () => app.go('hub') }, 'Back to camp'),
        ]),
        el('div.panel-body', null, [
          el('div.field', null, [
            el('label', null, 'Forging weapons for'),
            el('div.row', { style: { gap: '4px', flexWrap: 'wrap' } },
              roster.map((h) => el('button.sm' + (forClass === h.classId ? '.primary' : ''), {
                style: { '--cls': CLASSES[h.classId].color },
                onclick: () => { forClass = h.classId; render(); },
              }, `${h.name.split(' ').pop()}`))),
            el('div.hint', null,
              'Only weapons are bound to a class. Armour fits anyone — a Plateback cuirass does not care who is in it.'),
          ]),
        ]),
      ]),

      // ---------------------------------------------------------------- sets
      el('div.panel', null, [
        el('div.panel-head', null, [
          el('h2', null, 'Sets'),
          el('span.small.muted', null, `${SET_PARTIAL} pieces for half, ${SET_FULL} for the whole thing`),
        ]),
        el('div.panel-body.col', { style: { gap: '6px' } }, squadHeroes(profile).map((hero) => {
          const sets = activeSets(hero.equipped);
          const counts = [...setCounts(hero.equipped).entries()]
            .sort((a, b) => b[1] - a[1]);
          return el('div.species-lot', { style: { '--cls': CLASSES[hero.classId].color } }, [
            el('div.spread', null, [
              el('div.nm', null, hero.name),
              el('span.pill', null, sets.length ? sets.map((s) => `${s.name} ${s.tier}`).join(', ') : 'No set'),
            ]),
            counts.length
              ? el('div.tiny.dim', null, counts
                .map(([id, n]) => `${CREATURES[id]?.name ?? id} ${n}/${SET_FULL}`).join(' · '))
              : el('div.tiny.dim', null, 'Wearing nothing forged.'),
            ...sets.map((s) => el('div.tiny', { style: { color: 'var(--accent)' } },
              `${s.name}: ${s.desc}`)),
          ]);
        })),
      ]),

      // ------------------------------------------------------------ recipes
      el('div.panel', null, [
        el('div.panel-head', null, [
          el('h2', null, 'Forge'),
          el('span.small.muted', null, `${parts.length} part${parts.length === 1 ? '' : 's'} in the stash`),
        ]),
        el('div.panel-body.col', { style: { gap: '6px' } }, [
          ...(canMake.length
            ? canMake.map((r) => recipeRow(r, profile))
            : [el('div.item.empty', null, 'Nothing can be forged yet. Bring back more of one species.')]),
          short.length
            ? el('div.col', { style: { gap: '5px', marginTop: '8px' } }, [
              el('h3', null, 'Short of material'),
              ...short.slice(0, 12).map((r) => el('div.recipe.short', null, [
                el('div.spread', null, [
                  el('div', null, recipeLabel(r)),
                  el('span.tiny.dim', null, `${r.have} / ${r.cost}`),
                ]),
              ])),
            ])
            : null,
        ]),
      ]),
    ]));

    function recipeRow(recipe, profileRef) {
      const key = recipe.id;
      const isArmed = armed === key;
      const grade = QUALITIES[recipe.quality];
      const blocked = forgeBlocker(recipe, profileRef);
      return el('div.recipe', { style: { '--rar': grade?.color, '--cls': CREATURES[recipe.speciesId]?.color } }, [
        el('div.spread', null, [
          el('div.nm', { style: { color: grade?.color } }, recipeLabel(recipe)),
          el('span.pill', { style: { color: grade?.color } }, grade?.name ?? ''),
        ]),
        el('div.tiny.dim', null, `${recipeCost(recipe)} · ${SLOT_NAMES[recipe.slot]}`),
        recipe.preview
          ? el('div.tiny.muted', null, modSummary(recipe.preview, 4))
          : null,
        el('button.sm' + (isArmed ? '.danger.armed' : ''), {
          disabled: !!blocked,
          style: { marginTop: '6px' },
          title: isArmed ? 'Tap again — the parts are consumed' : blocked ?? 'Forge this',
          onclick: () => {
            if (isArmed) {
              forge(profileRef, recipe, forClass);
              armed = null;
              app.save();
            } else {
              armed = key;
            }
            render();
          },
        }, blocked ?? (isArmed ? 'Spend the parts?' : 'Forge')),
      ]);
    }
  }

  render();
  return root;
}
