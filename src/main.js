// App shell: owns the profile, routes between screens, and owns the one live
// Match instance while a raid is running.

import { el, clear, hideTooltip } from './ui/dom.js';
import { hubScreen } from './ui/screens/hub.js';
import { heroScreen } from './ui/screens/hero.js';
import { matchScreen } from './ui/screens/match.js';
import { resultsScreen } from './ui/screens/results.js';
import { smithScreen } from './ui/screens/smith.js';
import { newProfile, sanitizeProfile, squadHeroes, heroById, applyMatchResult } from './game/profile.js';
import { loadSave, writeSave, clearSave } from './persist.js';
import { Match } from './sim/match.js';
import { generateBotSquads } from './sim/bots.js';
import { SQUAD_PLANS, EXTRACT_PLANS, FORMATIONS } from './data/tactics.js';
import { MATCH_SECONDS } from './data/enemies.js';
import { CLASSES } from './data/classes.js';

const RIVAL_SQUADS = 5;

const app = {
  profile: null,
  liveMatch: null,
  current: null,
  currentNode: null,
};

const mount = document.getElementById('app');

app.save = function save() {
  writeSave(app.profile);
};

app.go = function go(screen, params = {}) {
  // Screens can hold RAF loops and listeners; give them a chance to clean up.
  if (app.currentNode?.__stop) app.currentNode.__stop();
  app.current = screen;
  hideTooltip();
  render(screen, params);
};

app.confirmAbandon = function confirmAbandon(match) {
  if (!window.confirm('Abandon the raid? Everyone still on the field counts as lost, gear included.')) return;
  // Abandoning is a wipe for anyone who has not already extracted.
  for (const id of match.playerSquad.memberIds) {
    const m = match.byId(id);
    if (m?.alive && !m.extracted) match.killEntity(m, null);
  }
  match.phase = 'ended';
  match.result = match.buildResult();
  app.go('results', { result: match.result });
};

function render(screen, params) {
  clear(mount);
  // The stylesheet needs to know which screen is up: the raid is a fixed
  // full-viewport canvas, every other screen is a document that scrolls.
  document.body.dataset.screen = screen;
  mount.appendChild(topbar(screen));

  let node;
  switch (screen) {
    case 'hero': {
      const hero = heroById(app.profile, params.heroId);
      node = hero ? heroScreen(app, hero, params.tab) : hubScreen(app);
      break;
    }
    case 'deploy':
      node = deployScreen();
      break;
    case 'match':
      node = matchScreen(app, app.liveMatch);
      break;
    case 'results': {
      // Fold the raid into the profile exactly once, then show the report.
      const summary = params.summary ?? applyMatchResult(app.profile, params.result);
      app.save();
      app.liveMatch = null;
      node = resultsScreen(app, params.result, summary);
      break;
    }
    case 'smith':
      node = smithScreen(app);
      break;
    case 'hub':
    default:
      node = hubScreen(app);
  }

  mount.appendChild(node);
  app.currentNode = node;
  if (node.__start) node.__start();
}

function topbar(screen) {
  const inRaid = screen === 'match';
  return el('div.topbar', null, [
    el('div.brand', null, ['ASHENVEIL', el('span', null, 'PVPVE EXTRACTION AUTOBATTLER')]),
    el('div.grow'),
    inRaid ? null : el('button.sm.ghost', {
      onclick: () => app.go('hub'),
      disabled: screen === 'hub',
    }, 'Camp'),
    inRaid ? null : el('button.sm.ghost', {
      onclick: () => {
        if (!window.confirm('Wipe this save and start a new account? Your roster and stash are gone.')) return;
        clearSave();
        app.profile = sanitizeProfile(newProfile());
        app.save();
        app.go('hub');
      },
    }, 'New account'),
  ]);
}

// ---------------------------------------------------------------- deploy ----

function deployScreen() {
  const profile = app.profile;
  const heroes = squadHeroes(profile);
  const plan = SQUAD_PLANS[profile.squadTactics.plan];
  const extract = EXTRACT_PLANS[profile.squadTactics.extractPlan];
  const formation = FORMATIONS[profile.squadTactics.formation];

  return el('div.screen.scroll', null, el('div.results', null, [
    el('h1.center', null, 'Deployment Briefing'),
    el('p.center.muted', null,
      `One raid, ${MATCH_SECONDS / 60} minutes. Twelve landing zones, three exits on staggered ` +
      'timers, and five rival squads working the same map.'),

    el('div.divider'),

    el('div.squad-grid', null, heroes.map((h) => {
      const cls = CLASSES[h.classId];
      const carried = Object.values(h.equipped).filter(Boolean);
      return el('div.panel', { style: { '--cls': cls.color } }, [
        el('div.panel-head', null, [
          el('div', null, [
            el('div.tiny', { style: { color: cls.color, textTransform: 'uppercase', letterSpacing: '.12em' } }, cls.name),
            el('h3', null, h.name),
          ]),
          el('span.pill', null, `Lv ${h.level}`),
        ]),
        el('div.panel-body', null, [
          el('div.statline', null, [el('span.muted', null, 'Gear at risk'), el('b', null, `${carried.length} items`)]),
          el('div.statline', null, [el('span.muted', null, 'Consumables'), el('b', null, String(h.consumables.length))]),
          el('div.statline', null, [el('span.muted', null, 'Stance'), el('b', null, h.tactics.stance)]),
          el('div.statline', null, [el('span.muted', null, 'Targets'), el('b', null, h.tactics.priority.replace(/_/g, ' '))]),
        ]),
      ]);
    })),

    el('div.panel', { style: { marginTop: '14px' } }, [
      el('div.panel-head', null, el('h3', null, 'Standing orders')),
      el('div.panel-body', null, [
        el('div.statline', null, [el('span.muted', null, 'Raid plan'), el('b', null, plan.name)]),
        el('div.small.muted', { style: { marginBottom: '6px' } }, plan.desc),
        el('div.statline', null, [el('span.muted', null, 'Formation'), el('b', null, formation.name)]),
        el('div.statline', null, [el('span.muted', null, 'Extraction'), el('b', null, extract.name)]),
        el('div.small.muted', null, extract.desc),
      ]),
    ]),

    el('p.center.small', { style: { color: 'var(--danger)', marginTop: '14px' } },
      'Anyone who does not reach an extraction point loses everything they are wearing and carrying.'),

    el('div.row.center', { style: { justifyContent: 'center', marginTop: '18px' } }, [
      el('button.ghost', { onclick: () => app.go('hub') }, 'Back to camp'),
      el('button.primary', { onclick: startRaid }, 'Enter the raid'),
    ]),
  ]));
}

function startRaid() {
  const profile = app.profile;
  const heroes = squadHeroes(profile);
  if (heroes.length !== 3) return;

  const seed = (Math.random() * 0xffffffff) >>> 0;
  const avgLevel = Math.round(heroes.reduce((s, h) => s + h.level, 0) / heroes.length);

  app.liveMatch = new Match({
    seed,
    playerSquad: {
      id: 'player',
      name: 'Your Squad',
      isPlayer: true,
      heroes,
      tactics: profile.squadTactics,
    },
    botSquads: generateBotSquads(seed, RIVAL_SQUADS, avgLevel),
  });

  app.go('match');
}

// ------------------------------------------------------------------ boot ----

function boot() {
  const saved = loadSave();
  app.profile = sanitizeProfile(saved ?? newProfile());
  app.save();
  app.go('hub');
}

boot();
