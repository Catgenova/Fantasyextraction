// After-action report: who got out, what they kept, and what the dead lost.

import { el, fmtTime } from '../dom.js';
import { itemRow } from '../items.js';
import { CLASSES } from '../../data/classes.js';

const VERDICTS = {
  clean: { title: 'Clean Extraction', blurb: 'The whole squad walked out with the haul.' },
  partial: { title: 'Partial Extraction', blurb: 'Some of you made it. The rest are still out there.' },
  wiped: { title: 'Squad Wiped', blurb: 'Nobody made it to an exit. Everything they carried is gone.' },
};

export function resultsScreen(app, result, summary) {
  const verdict = VERDICTS[result.outcome] ?? VERDICTS.wiped;

  return el('div.screen.scroll', null, el('div.results', null, [
    el('div.verdict.' + result.outcome, null, verdict.title),
    el('p.center.muted', null, verdict.blurb),

    el('div.row.center', { style: { justifyContent: 'center', marginTop: '14px' } }, [
      stat('Time survived', fmtTime(result.duration)),
      stat('Enemies killed', String(result.stats.kills)),
      stat('Bosses felled', String(result.stats.bossKills)),
      stat('Heroes slain', String(result.stats.heroKills)),
    ]),

    el('div.divider'),

    el('div.squad-grid', null, result.heroes.map((h) => {
      const cls = CLASSES[h.classId];
      return el('div.panel', { style: { '--cls': cls.color } }, [
        el('div.panel-head', null, [
          el('div', null, [
            el('div.tiny', { style: { color: cls.color, textTransform: 'uppercase', letterSpacing: '.12em' } }, cls.name),
            el('h3', null, h.name),
          ]),
          el('span.pill', {
            style: { color: h.extracted ? 'var(--good)' : 'var(--danger)' },
          }, h.extracted ? 'Extracted' : 'Lost'),
        ]),
        el('div.panel-body', null, [
          el('div.statline', null, [el('span.muted', null, 'Damage dealt'), el('b', null, String(h.damage))]),
          el('div.statline', null, [el('span.muted', null, 'Damage taken'), el('b', null, String(h.taken))]),
          h.healing ? el('div.statline', null, [el('span.muted', null, 'Healing done'), el('b', null, String(h.healing))]) : null,
          el('div.statline', null, [el('span.muted', null, 'Kills'), el('b', null, String(h.kills))]),
          el('div.statline', null, [el('span.muted', null, 'Experience'), el('b', { style: { color: 'var(--accent)' } }, `+${h.xp}`)]),
        ]),
      ]);
    })),

    summary?.levelUps?.length
      ? el('div.panel', { style: { marginTop: '14px' } }, [
        el('div.panel-head', null, el('h3', null, 'Promotions')),
        el('div.panel-body', null, summary.levelUps.map((l) =>
          el('div.statline', null, [
            el('span', null, `${l.name} reached level ${l.level}`),
            el('b', { style: { color: 'var(--accent)' } }, `+${l.levels} skill point${l.levels === 1 ? '' : 's'}`),
          ]))),
      ])
      : null,

    el('div.divider'),

    el('div.two-col', null, [
      el('div', null, [
        el('h3', { style: { marginBottom: '8px', color: 'var(--good)' } },
          `Brought home (${summary?.gained?.length ?? 0})`),
        (summary?.gained?.length
          ? el('div.loot-grid', null, summary.gained.map((item) => itemRow(item, {})))
          : el('div.item.empty', null, 'Nothing new made it back.')),
      ]),
      el('div', null, [
        el('h3', { style: { marginBottom: '8px', color: 'var(--danger)' } },
          `Lost on the field (${summary?.lost?.length ?? 0})`),
        (summary?.lost?.length
          ? el('div.loot-grid', null, summary.lost.map((item) => itemRow(item, {})))
          : el('div.item.empty', null, 'Nothing lost. Everyone kept their kit.')),
      ]),
    ]),

    el('div.row.center', { style: { justifyContent: 'center', marginTop: '22px' } }, [
      el('button.primary', { onclick: () => app.go('hub') }, 'Back to camp'),
    ]),
  ]));
}

function stat(label, value) {
  return el('div.panel', { style: { padding: '10px 18px', minWidth: '130px', textAlign: 'center' } }, [
    el('div.tiny.dim', { style: { letterSpacing: '.1em', textTransform: 'uppercase' } }, label),
    el('div', { style: { fontSize: '21px', fontFamily: 'var(--serif)' } }, value),
  ]);
}
