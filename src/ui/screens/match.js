// The raid itself. Top-down canvas, a HUD, and the only three levers the
// player has once the gate opens: where the squad goes, when it leaves, and
// how fast time runs.

import { el, clear, fmtTime, hideTooltip } from '../dom.js';
import { createRenderer } from '../render.js';
import { createRunBags } from './runbags.js';
import { createNavPad } from './navpad.js';
import { createHuntPad } from './huntpad.js';
import { QUALITIES, QUALITY_ORDER } from '../../data/parts.js';
import { CLASSES } from '../../data/classes.js';
import { MATCH_SECONDS } from '../../data/enemies.js';
import { bestExtract } from '../../sim/map.js';
import { hpFrac, manaFrac } from '../../sim/entity.js';
import { dist } from '../../core/vec.js';

const SPEEDS = [1, 2, 4];

export function matchScreen(app, match) {
  const root = el('div.match');
  const canvas = el('canvas#stage');
  const minimap = el('canvas.minimap', { width: 250, height: 250 });
  root.appendChild(canvas);

  const renderer = createRenderer(canvas, minimap);

  const hud = el('div.hud');
  const bags = createRunBags(match, { isPaused: () => paused, togglePause });
  const navpad = createNavPad(match);
  const huntpad = createHuntPad(match);
  const legend = buildLegend();

  // Only one overlay at a time — on a phone they occupy the same space.
  function openOnly(which) {
    if (which !== 'bags') bags.hide();
    if (which !== 'nav') navpad.hide();
    if (which !== 'hunt') huntpad.hide();
    if (which !== 'legend') legend.hidden = true;
  }
  const clock = el('div.clock', null, '00:00');
  const objective = el('div.small.muted', null, '');
  const unitList = el('div.hud-squad');
  const feedBox = el('div.feed');
  const bannerHost = el('div');
  let banner = null;
  let paused = false;
  let speedIndex = 0;

  // --- HUD chrome ----------------------------------------------------------

  const navBtn = el('button.sm', {
    onclick: () => { const open = navpad.isOpen(); openOnly('nav'); if (open) navpad.hide(); else navpad.show(); },
  }, 'Navigate');
  const huntBtn = el('button.sm', {
    onclick: () => { const open = huntpad.isOpen(); openOnly('hunt'); if (open) huntpad.hide(); else huntpad.show(); },
  }, 'Hunt');
  const bagsBtn = el('button.sm', {
    onclick: () => { const open = bags.isOpen(); openOnly('bags'); if (open) bags.hide(); else bags.show(); },
  }, 'Bags');
  const legendBtn = el('button.sm', {
    onclick: () => { const wasOpen = !legend.hidden; openOnly('legend'); legend.hidden = wasOpen; },
  }, 'Legend');
  const followBtn = el('button.sm', { onclick: toggleFollow }, 'Following');
  const speedBtn = el('button.sm', { onclick: cycleSpeed }, '1×');
  const pauseBtn = el('button.sm', { onclick: togglePause }, 'Pause');

  hud.appendChild(el('div.hud-top', null, [
    clock,
    el('div', { style: { width: '1px', height: '22px', background: 'var(--line)' } }),
    el('div', null, [
      el('div.tiny.dim', null, 'SQUAD ORDER'),
      objective,
    ]),
  ]));

  hud.appendChild(unitList);

  hud.appendChild(el('div.hud-right', null, [
    minimap,
    el('div.tiny.dim.center', null, 'Click to send the squad'),
    el('div.panel', { style: { overflow: 'hidden' } }, [
      el('div.panel-head', { style: { padding: '6px 10px' } },
        el('div.tiny.dim', { style: { letterSpacing: '.12em' } }, 'RAID LOG')),
      feedBox,
    ]),
  ]));

  hud.appendChild(el('div.hud-bottom', null, [
    el('button.primary.sm', { onclick: orderExtract }, 'Extract now'),
    el('button.sm', { onclick: clearOrder }, 'Resume plan'),
    el('div', { style: { width: '1px', height: '20px', background: 'var(--line)' } }),
    huntBtn, navBtn, bagsBtn, legendBtn,
    el('div', { style: { width: '1px', height: '20px', background: 'var(--line)' } }),
    pauseBtn, speedBtn, followBtn,
    el('div', { style: { width: '1px', height: '20px', background: 'var(--line)' } }),
    el('button.sm.ghost', { onclick: () => app.confirmAbandon(match) }, 'Abandon'),
  ]));

  hud.appendChild(bannerHost);
  hud.appendChild(legend);
  hud.appendChild(navpad.node);
  hud.appendChild(huntpad.node);
  hud.appendChild(bags.node);
  root.appendChild(hud);

  function buildLegend() {
    const swatch = (colour, label) => el('div.legend-row', null, [
      el('span.legend-gem', { style: { background: colour } }),
      el('span', null, label),
    ]);
    return el('div.legend', { hidden: true }, [
      el('div.spread', { style: { marginBottom: '6px' } }, [
        el('strong', null, 'Map key'),
        el('button.sm.ghost', { onclick: () => { legend.hidden = true; } }, '✕'),
      ]),
      el('div.tiny.dim', { style: { margin: '4px 0 3px' } }, 'LOOT ON THE GROUND'),
      ...QUALITY_ORDER.map((id) => swatch(QUALITIES[id].color, QUALITIES[id].name)),
      el('div.legend-row.faded', null, [
        el('span.legend-gem', { style: { background: 'var(--common)' } }),
        el('span', null, 'Faded — your squad will skip it'),
      ]),
      el('div.legend-row', null, [
        el('span.legend-ring'),
        el('span', null, "A fallen hero's kit"),
      ]),
      el('div.tiny.dim', { style: { margin: '7px 0 3px' } }, 'ZONES'),
      swatch('#7cd89a', 'Extraction — open'),
      swatch('rgba(160,130,120,.7)', 'Extraction — shut'),
      swatch('#8fc4ea', 'World event'),
      swatch('#e6574a', 'The Collapse closing in'),
      el('p.tiny.muted', { style: { marginTop: '7px' } },
        'Change what a hero picks up on their Tactics tab, back at camp.'),
    ]);
  }

  // --- Input ---------------------------------------------------------------

  let dragging = null;
  let dragMoved = 0;

  canvas.addEventListener('pointerdown', (e) => {
    dragging = { x: e.clientX, y: e.clientY };
    dragMoved = 0;
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - dragging.x;
    const dy = e.clientY - dragging.y;
    dragMoved += Math.abs(dx) + Math.abs(dy);
    renderer.panBy(dx, dy);
    dragging = { x: e.clientX, y: e.clientY };
    followBtn.textContent = 'Free camera';
  });

  canvas.addEventListener('pointerup', (e) => {
    const wasDrag = dragMoved > 6;
    dragging = null;
    if (wasDrag) return;
    // A click, not a drag: that is a move order.
    const rect = canvas.getBoundingClientRect();
    const world = renderer.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    issueMoveOrder(world);
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    renderer.zoomBy(e.deltaY < 0 ? 1.14 : 1 / 1.14, { x: e.clientX - rect.left, y: e.clientY - rect.top });
    followBtn.textContent = 'Free camera';
  }, { passive: false });

  minimap.addEventListener('click', (e) => {
    const rect = minimap.getBoundingClientRect();
    const world = renderer.minimapToWorld(
      (e.clientX - rect.left) * (minimap.width / rect.width),
      (e.clientY - rect.top) * (minimap.height / rect.height));
    if (e.shiftKey) {
      renderer.state.camera.x = world.x;
      renderer.state.camera.y = world.y;
      renderer.setFollow(false);
      followBtn.textContent = 'Free camera';
    } else {
      issueMoveOrder(world);
    }
  });

  const onKey = (e) => {
    if (e.key === ' ') { e.preventDefault(); togglePause(); }
    else if (e.key === 'f' || e.key === 'F') toggleFollow();
    else if (e.key === 'e' || e.key === 'E') orderExtract();
    else if (e.key === 'b' || e.key === 'B') bagsBtn.click();
    else if (e.key === 'l' || e.key === 'L') legendBtn.click();
    else if (e.key === 'g' || e.key === 'G') navBtn.click();
    else if (e.key === '+' || e.key === '=') renderer.zoomBy(1.15);
    else if (e.key === '-' || e.key === '_') renderer.zoomBy(1 / 1.15);
    else if (e.key >= '1' && e.key <= '3') { speedIndex = Number(e.key) - 1; applySpeed(); }
  };
  window.addEventListener('keydown', onKey);

  function issueMoveOrder(world) {
    // Clicking an extraction point means "leave from there", not "walk near it".
    const ex = match.map.extracts.find((x) => dist(world, x) < x.radius + 90);
    if (ex) {
      match.playerSquad.manualOrder = { mode: 'extract', extract: ex };
      showBanner(`Heading for ${ex.name}`);
      return;
    }
    match.playerSquad.manualOrder = { mode: 'travel', pos: { x: world.x, y: world.y } };
  }

  function orderExtract() {
    const centre = match.squadCentroid(match.playerSquad);
    const ex = bestExtract(match.map, centre ?? match.map.center, match.time);
    match.playerSquad.manualOrder = { mode: 'extract', extract: ex };
    showBanner(`Extracting via ${ex.name}`);
  }

  function clearOrder() {
    match.playerSquad.manualOrder = null;
    showBanner('Following the raid plan');
  }

  function toggleFollow() {
    const next = !renderer.state.follow;
    renderer.setFollow(next);
    followBtn.textContent = next ? 'Following' : 'Free camera';
  }

  function cycleSpeed() {
    speedIndex = (speedIndex + 1) % SPEEDS.length;
    applySpeed();
  }

  function applySpeed() {
    match.speed = SPEEDS[speedIndex];
    speedBtn.textContent = `${SPEEDS[speedIndex]}×`;
  }

  function togglePause() {
    paused = !paused;
    pauseBtn.textContent = paused ? 'Resume' : 'Pause';
  }

  function showBanner(text) {
    if (banner) banner.remove();
    banner = el('div.banner', null, text);
    bannerHost.appendChild(banner);
    const mine = banner;
    setTimeout(() => { if (mine === banner) { mine.remove(); banner = null; } }, 2600);
  }

  // --- HUD refresh ---------------------------------------------------------

  let lastFeedLength = -1;

  function refreshHud() {
    const remaining = MATCH_SECONDS - match.time;
    clock.textContent = fmtTime(remaining);
    clock.className = 'clock' + (remaining < 300 ? ' warn' : '');
    objective.textContent = match.playerSquad.order?.label ?? '—';

    clear(unitList);
    for (const id of match.playerSquad.memberIds) {
      const e = match.byId(id);
      if (!e) continue;
      const cls = CLASSES[e.classId];
      const status = e.extracted ? 'out' : !e.alive ? 'dead' : '';
      unitList.appendChild(el(`div.unit${status ? '.' + status : ''}`, { style: { '--cls': cls.color } }, [
        el('div.spread', null, [
          el('div', null, [
            el('div', { style: { fontWeight: 600, fontSize: '13px' } }, e.name),
            el('div.tiny.dim', null, `${cls.name} · Lv ${e.level}`),
          ]),
          el('div.tiny', {
            style: { color: e.extracted ? 'var(--good)' : !e.alive ? 'var(--danger)' : 'var(--muted)' },
          }, e.extracted ? 'EXTRACTED' : !e.alive ? 'DEAD' : `${e.inventory.length} carried`),
        ]),
        e.alive && !e.extracted ? el('div.bar.hp', null, el('i', { style: { width: `${hpFrac(e) * 100}%` } })) : null,
        e.alive && !e.extracted && e.maxMana > 0 ? el('div.bar.mp', null, el('i', { style: { width: `${manaFrac(e) * 100}%` } })) : null,
      ]));
    }

    bags.refresh();
    navpad.refresh();
    huntpad.refresh();

    if (match.feed.length !== lastFeedLength) {
      lastFeedLength = match.feed.length;
      clear(feedBox);
      for (const line of match.feed.filter((f) => f.kind !== 'cast').slice(-14)) {
        feedBox.appendChild(el(`div.l.${line.kind}`, null, `${fmtTime(line.t)}  ${line.text}`));
      }
    }
  }

  // --- Loop ----------------------------------------------------------------

  let raf = 0;
  let last = performance.now();
  let hudTimer = 0;
  let announced = new Set();

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    if (!paused && match.phase !== 'ended') match.update(dt);

    renderer.draw(match);

    hudTimer -= dt;
    if (hudTimer <= 0) { hudTimer = 0.12; refreshHud(); }

    // Surface world events as they fire.
    for (const ev of match.activeEvents) {
      if (announced.has(ev.id)) continue;
      announced.add(ev.id);
      showBanner(`${ev.name} — ${ev.blurb}`);
    }
    if (match.collapseActive && !announced.has('collapse')) {
      announced.add('collapse');
      showBanner('The Collapse has begun. Get to an extract.');
    }

    if (match.phase === 'ended') {
      stop();
      app.go('results', { result: match.result });
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  const onResize = () => renderer.resize();
  window.addEventListener('resize', onResize);

  function start() {
    renderer.resize();
    applySpeed();
    // Centre on the squad immediately rather than easing in from the middle.
    const centre = match.squadCentroid(match.playerSquad);
    if (centre) { renderer.state.camera.x = centre.x; renderer.state.camera.y = centre.y; }
    showBanner(`Landed at ${match.playerSquad.spawn.name}`);
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('keydown', onKey);
    hideTooltip();
  }

  root.__start = start;
  root.__stop = stop;
  return root;
}
