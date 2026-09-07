// Top-down raid renderer. Everything is drawn in world units and transformed
// by one camera; the static terrain is baked once into an offscreen canvas
// because a 14000x14000 map is far too big to redraw per frame.

import { WORLD_SIZE, RING_CORE, RING_MID, CENTER, BIOMES, extractIsOpen } from '../sim/map.js';
import { QUALITIES } from '../data/parts.js';
import { CLASSES } from '../data/classes.js';
import { CREATURES } from '../data/creatures.js';
import { loadSprites, drawHeroSprite, spritesReady } from './sprites.js';
import { hpFrac, manaFrac } from '../sim/entity.js';
import { canTake } from '../sim/ai.js';
import { dist } from '../core/vec.js';

const BG_SCALE = 10;                  // world units per baked background pixel
const MIN_ZOOM = 0.28;
const MAX_ZOOM = 2.2;

export function createRenderer(canvas, minimapCanvas) {
  // Started here rather than at boot so the sheets are fetched when a raid is
  // actually about to be drawn. Nothing waits on it: the first frames use the
  // shape fallback and swap over when the images arrive.
  loadSprites();

  const ctx = canvas.getContext('2d');
  const mmCtx = minimapCanvas?.getContext('2d') ?? null;

  const state = {
    camera: { x: CENTER.x, y: CENTER.y, zoom: 1.2 },
    follow: true,
    bg: null,
    bgSeed: null,
    width: 1, height: 1, dpr: 1, uiScale: 1, userZoomed: false,
  };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    state.width = Math.max(1, Math.round(rect.width));
    state.height = Math.max(1, Math.round(rect.height));
    state.dpr = dpr;
    canvas.width = state.width * dpr;
    canvas.height = state.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // A phone showing the desktop zoom sees barely 250 world units of map.
    // Until the player zooms for themselves, fit the zoom to the screen.
    if (!state.userZoomed) state.camera.zoom = defaultZoom();
    // Names and place labels are drawn in world units; shrink them on a
    // small canvas so three stacked heroes do not bury the map.
    state.uiScale = state.width < 480 ? 0.78 : state.width < 900 ? 0.88 : 1;
  }

  function defaultZoom() {
    if (state.width < 480) return 0.62;
    if (state.width < 900) return 0.85;
    return 1.2;
  }

  const worldToScreen = (x, y) => ({
    x: (x - state.camera.x) * state.camera.zoom + state.width / 2,
    y: (y - state.camera.y) * state.camera.zoom + state.height / 2,
  });

  const screenToWorld = (sx, sy) => ({
    x: (sx - state.width / 2) / state.camera.zoom + state.camera.x,
    y: (sy - state.height / 2) / state.camera.zoom + state.camera.y,
  });

  // --- Static terrain bake -------------------------------------------------

  function bakeBackground(map) {
    if (state.bgSeed === map.seed) return state.bg;
    const size = Math.ceil(WORLD_SIZE / BG_SCALE);
    const bg = document.createElement('canvas');
    bg.width = size;
    bg.height = size;
    const b = bg.getContext('2d');

    // Ground is painted in two passes. First a coarse nearest-region map at
    // one pixel per 30 world units, then upscaled with smoothing — that turns
    // hard Voronoi edges into soft transitions instead of visible tiles.
    const cell = 3;
    const coarseSize = Math.ceil(size / cell);
    const coarse = document.createElement('canvas');
    coarse.width = coarseSize;
    coarse.height = coarseSize;
    const c = coarse.getContext('2d');
    for (let gy = 0; gy < coarseSize; gy++) {
      for (let gx = 0; gx < coarseSize; gx++) {
        const wx = (gx + 0.5) * cell * BG_SCALE;
        const wy = (gy + 0.5) * cell * BG_SCALE;
        let best = map.regions[0];
        let bestD = Infinity;
        for (const r of map.regions) {
          const d = (r.x - wx) ** 2 + (r.y - wy) ** 2;
          if (d < bestD) { bestD = d; best = r; }
        }
        const biome = BIOMES[best.biome] ?? BIOMES.fields;
        c.fillStyle = shade(biome.ground, (hash2(gx, gy) - 0.5) * 0.05);
        c.fillRect(gx, gy, 1, 1);
      }
    }
    b.imageSmoothingEnabled = true;
    b.imageSmoothingQuality = 'high';
    // Blur the region map before upscaling: nearest-region edges are hard
    // Voronoi seams, and biomes should bleed into each other instead.
    b.filter = 'blur(5px)';
    b.drawImage(coarse, 0, 0, size, size);
    b.filter = 'none';

    // Fine grain on top: flecks of biome accent so open ground is not flat.
    for (let i = 0; i < 70000; i++) {
      const gx = (hash2(i, 7) * size) | 0;
      const gy = (hash2(i, 13) * size) | 0;
      const cx = Math.min(coarseSize - 1, (gx / cell) | 0);
      const cy = Math.min(coarseSize - 1, (gy / cell) | 0);
      const wx = (cx + 0.5) * cell * BG_SCALE;
      const wy = (cy + 0.5) * cell * BG_SCALE;
      let best = map.regions[0];
      let bestD = Infinity;
      for (const r of map.regions) {
        const d = (r.x - wx) ** 2 + (r.y - wy) ** 2;
        if (d < bestD) { bestD = d; best = r; }
      }
      const biome = BIOMES[best.biome] ?? BIOMES.fields;
      b.fillStyle = shade(biome.accent, (hash2(i, 29) - 0.5) * 0.55);
      b.globalAlpha = 0.3 + hash2(i, 41) * 0.4;
      b.fillRect(gx, gy, 1, 1);
    }
    b.globalAlpha = 1;

    // A dark, cold bloom over the core so the danger rings read at a glance.
    const grad = b.createRadialGradient(size / 2, size / 2, RING_CORE / BG_SCALE * 0.25,
      size / 2, size / 2, RING_MID / BG_SCALE);
    grad.addColorStop(0, 'rgba(40,18,52,.62)');
    grad.addColorStop(0.55, 'rgba(28,16,36,.3)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    b.fillStyle = grad;
    b.fillRect(0, 0, size, size);

    // Vignette the map edge so the world does not just stop.
    const edge = b.createLinearGradient(0, 0, 0, size);
    edge.addColorStop(0, 'rgba(8,7,6,.75)');
    edge.addColorStop(0.08, 'rgba(8,7,6,0)');
    edge.addColorStop(0.92, 'rgba(8,7,6,0)');
    edge.addColorStop(1, 'rgba(8,7,6,.75)');
    b.fillStyle = edge;
    b.fillRect(0, 0, size, size);
    const edge2 = b.createLinearGradient(0, 0, size, 0);
    edge2.addColorStop(0, 'rgba(8,7,6,.75)');
    edge2.addColorStop(0.08, 'rgba(8,7,6,0)');
    edge2.addColorStop(0.92, 'rgba(8,7,6,0)');
    edge2.addColorStop(1, 'rgba(8,7,6,.75)');
    b.fillStyle = edge2;
    b.fillRect(0, 0, size, size);

    // Obstacles baked as blobs; they are redrawn crisply when in view.
    for (const o of map.obstacles) {
      b.fillStyle = o.kind === 'rock' ? 'rgba(26,24,21,.9)' : 'rgba(48,44,52,.9)';
      b.beginPath();
      b.arc(o.x / BG_SCALE, o.y / BG_SCALE, Math.max(1, o.r / BG_SCALE), 0, Math.PI * 2);
      b.fill();
    }

    state.bg = bg;
    state.bgSeed = map.seed;
    return bg;
  }

  /** Deterministic 0..1 noise from two integers. */
  function hash2(x, y) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  /** Lighten (positive) or darken (negative) a #rrggbb by a fraction. */
  function shade(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
    const r = clamp(((n >> 16) & 255) * (1 + amount));
    const g = clamp(((n >> 8) & 255) * (1 + amount));
    const bl = clamp((n & 255) * (1 + amount));
    return `rgb(${r},${g},${bl})`;
  }

  // --- Main draw -----------------------------------------------------------

  function draw(match, ui = {}) {
    const { camera } = state;
    const map = match.map;
    bakeBackground(map);

    if (state.follow) {
      const centre = match.squadCentroid(match.playerSquad)
        ?? match.playerSquad.order?.pos ?? CENTER;
      camera.x += (centre.x - camera.x) * 0.12;
      camera.y += (centre.y - camera.y) * 0.12;
    }
    clampCamera();

    ctx.fillStyle = '#0b0a09';
    ctx.fillRect(0, 0, state.width, state.height);

    ctx.save();
    ctx.translate(state.width / 2, state.height / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    const view = viewBounds();

    drawTerrain(map, view);
    drawRings();
    drawZones(match, view);
    drawPois(match, view);
    drawEvents(match);
    drawCollapse(match);
    drawLoot(match, view);
    drawTelegraphs(match);
    drawEntities(match, view, ui);
    drawProjectiles(match, view);
    drawEffects(match);
    drawOrderMarker(match);

    ctx.restore();

    drawFloats(match);
    if (mmCtx) drawMinimap(match);
  }

  function viewBounds() {
    const halfW = state.width / 2 / state.camera.zoom;
    const halfH = state.height / 2 / state.camera.zoom;
    return {
      minX: state.camera.x - halfW - 120, maxX: state.camera.x + halfW + 120,
      minY: state.camera.y - halfH - 120, maxY: state.camera.y + halfH + 120,
    };
  }

  const inView = (v, x, y, pad = 0) =>
    x >= v.minX - pad && x <= v.maxX + pad && y >= v.minY - pad && y <= v.maxY + pad;

  function clampCamera() {
    const halfW = state.width / 2 / state.camera.zoom;
    const halfH = state.height / 2 / state.camera.zoom;
    state.camera.x = Math.max(Math.min(halfW, WORLD_SIZE / 2), Math.min(WORLD_SIZE - Math.min(halfW, WORLD_SIZE / 2), state.camera.x));
    state.camera.y = Math.max(Math.min(halfH, WORLD_SIZE / 2), Math.min(WORLD_SIZE - Math.min(halfH, WORLD_SIZE / 2), state.camera.y));
  }

  // --- Layers --------------------------------------------------------------

  function drawTerrain(map, view) {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(state.bg, 0, 0, WORLD_SIZE, WORLD_SIZE);

    // The baked terrain is one pixel per 10 world units, so it turns to mush
    // when magnified. Above ~0.9x, scatter procedural speckle in world space.
    if (state.camera.zoom > 0.9) {
      const step = 26;
      const x0 = Math.floor(view.minX / step) * step;
      const y0 = Math.floor(view.minY / step) * step;
      ctx.fillStyle = 'rgba(255,250,235,.05)';
      for (let y = y0; y < view.maxY; y += step) {
        for (let x = x0; x < view.maxX; x += step) {
          const h = hash2(x / step, y / step);
          if (h > 0.62) continue;
          const jx = x + hash2(x, y + 1) * step;
          const jy = y + hash2(x + 1, y) * step;
          ctx.fillRect(jx, jy, 1.6 + h * 3, 1.6 + h * 2);
        }
      }
      ctx.fillStyle = 'rgba(0,0,0,.10)';
      for (let y = y0; y < view.maxY; y += step) {
        for (let x = x0; x < view.maxX; x += step) {
          const h = hash2(x / step + 91, y / step + 17);
          if (h > 0.45) continue;
          ctx.fillRect(x + h * step, y + hash2(y, x) * step, 2 + h * 4, 2 + h * 3);
        }
      }
    }

    // Crisp obstacles for anything actually on screen, with a lit edge so
    // they read as solid cover rather than holes in the ground.
    if (state.camera.zoom > 0.42) {
      for (const o of map.obstacles) {
        if (!inView(view, o.x, o.y, o.r)) continue;
        ctx.fillStyle = 'rgba(0,0,0,.4)';
        ctx.beginPath();
        ctx.ellipse(o.x, o.y + o.r * 0.3, o.r * 1.02, o.r * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = o.kind === 'rock' ? '#3b382f' : '#454050';
        ctx.strokeStyle = o.kind === 'rock' ? '#615b4d' : '#655d72';
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (o.kind === 'rock') ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
        else polygon(o.x, o.y, o.r, 5, o.x * 0.01);
        ctx.fill();
        ctx.stroke();

        // A single top-left highlight is enough to sell height from above.
        ctx.fillStyle = 'rgba(220,214,196,.10)';
        ctx.beginPath();
        ctx.arc(o.x - o.r * 0.26, o.y - o.r * 0.3, o.r * 0.46, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawRings() {
    ctx.setLineDash([26, 22]);
    ctx.lineWidth = 3;
    for (const [r, colour] of [[RING_MID, 'rgba(200,150,80,.16)'], [RING_CORE, 'rgba(190,110,220,.20)']]) {
      ctx.strokeStyle = colour;
      ctx.beginPath();
      ctx.arc(CENTER.x, CENTER.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  function drawZones(match, view) {
    // Landing zones.
    for (const s of match.map.spawns) {
      if (!inView(view, s.x, s.y, s.radius)) continue;
      ctx.fillStyle = 'rgba(110,140,110,.06)';
      ctx.strokeStyle = 'rgba(130,160,130,.28)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      label(s.name, s.x, s.y - s.radius - 10, 'rgba(150,175,150,.6)');
    }

    // Extraction points, coloured by whether they are open right now.
    for (const ex of match.map.extracts) {
      if (!inView(view, ex.x, ex.y, ex.radius + 60)) continue;
      const open = extractIsOpen(ex, match.time);
      const pulse = 0.5 + 0.5 * Math.sin(match.time * 2.4);
      ctx.fillStyle = open ? `rgba(110,190,130,${0.08 + pulse * 0.06})` : 'rgba(150,120,110,.05)';
      ctx.strokeStyle = open ? `rgba(120,220,150,${0.55 + pulse * 0.3})` : 'rgba(160,130,120,.3)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(ex.x, ex.y, ex.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.setLineDash([10, 12]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ex.x, ex.y, ex.radius + 26, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      const status = open
        ? `OPEN · closes ${fmt(ex.closesAt - match.time)}`
        : match.time < ex.opensAt ? `opens ${fmt(ex.opensAt - match.time)}` : 'CLOSED';
      label(ex.name.toUpperCase(), ex.x, ex.y - ex.radius - 30, open ? '#8fe0a8' : 'rgba(180,150,140,.7)', 15);
      label(status, ex.x, ex.y - ex.radius - 12, open ? 'rgba(150,220,170,.85)' : 'rgba(170,140,130,.6)', 12);
    }
  }

  function drawPois(match, view) {
    // The site the squad is currently hunting is drawn whether or not it has
    // streamed in, because an order the player cannot see on the map is one
    // they have to take on trust.
    const squad = match.playerSquad;
    const quarry = squad?.tactics?.quarry;
    const target = quarry
      ? match.findQuarry(match.squadCentroid(squad) ?? CENTER, quarry)
      : null;

    for (const poi of match.map.pois) {
      if (!inView(view, poi.x, poi.y, poi.radius)) continue;
      const hunted = target && poi.id === target.id;
      if (poi.kind === 'camp') {
        if (!poi.active && !hunted) continue;
        ctx.strokeStyle = hunted ? 'rgba(240,190,120,.5)' : 'rgba(190,120,90,.16)';
        ctx.lineWidth = hunted ? 3 : 2;
        if (hunted) ctx.setLineDash([10, 9]);
        ctx.beginPath();
        ctx.arc(poi.x, poi.y, poi.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        if (hunted) {
          label(`HUNT: ${(CREATURES[poi.speciesId]?.name ?? '').toUpperCase()}`,
            poi.x, poi.y - poi.radius - 12, 'rgba(240,200,140,.8)', 13);
        }
      } else {
        const alive = poi.bossEntityId ? match.byId(poi.bossEntityId)?.alive : !poi.spawned;
        ctx.strokeStyle = alive ? 'rgba(240,163,60,.34)' : 'rgba(120,110,100,.16)';
        ctx.lineWidth = 3;
        ctx.setLineDash([16, 14]);
        ctx.beginPath();
        ctx.arc(poi.x, poi.y, poi.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        label(poi.kind === 'boss_event' ? 'THE SEAL' : 'BOSS ARENA', poi.x, poi.y - poi.radius - 12,
          alive ? 'rgba(240,190,120,.7)' : 'rgba(130,120,110,.5)', 13);
      }
    }
  }

  function drawEvents(match) {
    for (const ev of match.activeEvents) {
      if (!ev.pos) continue;
      const pulse = 0.5 + 0.5 * Math.sin(match.time * 3);
      ctx.strokeStyle = `rgba(110,168,216,${0.4 + pulse * 0.35})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(ev.pos.x, ev.pos.y, 240, 0, Math.PI * 2);
      ctx.stroke();
      label(ev.name.toUpperCase(), ev.pos.x, ev.pos.y - 254, '#8fc4ea', 15);
      if (ev.kind === 'capture' && !ev.claimed) {
        const pct = Math.min(1, (ev.progress ?? 0) / ev.captureSeconds);
        ctx.strokeStyle = '#8fe0a8';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(ev.pos.x, ev.pos.y, 250, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  function drawCollapse(match) {
    if (!match.collapseActive) return;
    // Shade everything outside the safe circle rather than inside it.
    ctx.save();
    ctx.beginPath();
    ctx.rect(-WORLD_SIZE, -WORLD_SIZE, WORLD_SIZE * 3, WORLD_SIZE * 3);
    ctx.arc(CENTER.x, CENTER.y, match.collapseRadius, 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(150,30,20,.20)';
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = 'rgba(230,90,70,.75)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(CENTER.x, CENTER.y, match.collapseRadius, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawLoot(match, view) {
    for (const pile of match.lootPiles) {
      if (pile.dead || !pile.items.length) continue;
      if (!inView(view, pile.pos.x, pile.pos.y, 30)) continue;
      const colour = QUALITIES[pile.best?.quality]?.color ?? '#b9bfc9';
      const bob = Math.sin(match.time * 3 + pile.pos.x * 0.01) * 2;

      // Loot the squad will refuse — filtered out by policy, or simply no room
      // — fades back, so what still glows is what they are going to collect.
      const wanted = squadWantsPile(match, pile);
      ctx.fillStyle = colour;
      ctx.globalAlpha = wanted ? 0.9 : 0.22;
      ctx.beginPath();
      ctx.moveTo(pile.pos.x, pile.pos.y - 9 + bob);
      ctx.lineTo(pile.pos.x + 7, pile.pos.y + bob);
      ctx.lineTo(pile.pos.x, pile.pos.y + 9 + bob);
      ctx.lineTo(pile.pos.x - 7, pile.pos.y + bob);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = wanted ? 0.25 : 0.07;
      ctx.beginPath();
      ctx.arc(pile.pos.x, pile.pos.y, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (pile.fromHero) {
        ctx.strokeStyle = wanted ? 'rgba(230,120,100,.8)' : 'rgba(230,120,100,.25)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pile.pos.x, pile.pos.y, 19, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  /**
   * Would any living member of the player's squad take something from here?
   * Cached briefly — it is asked of every visible pile every frame, and the
   * answer only changes when a pack fills or a policy is edited.
   */
  function squadWantsPile(match, pile) {
    if (pile._wantCheckedAt !== undefined && match.time - pile._wantCheckedAt < 0.5) {
      return pile._wanted;
    }
    let wanted = false;
    for (const id of match.playerSquad.memberIds) {
      const m = match.byId(id);
      if (!m?.alive || m.extracted) continue;
      if (pile.items.some((it) => canTake(m, it))) { wanted = true; break; }
    }
    pile._wanted = wanted;
    pile._wantCheckedAt = match.time;
    return wanted;
  }

  function drawTelegraphs(match) {
    for (const t of match.telegraphs) {
      const progress = 1 - t.remaining / t.total;
      ctx.fillStyle = `rgba(220,70,50,${0.10 + progress * 0.22})`;
      ctx.beginPath();
      ctx.arc(t.pos.x, t.pos.y, t.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(255,110,80,${0.5 + progress * 0.5})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(t.pos.x, t.pos.y, t.radius * progress, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawEntities(match, view, ui) {
    labelBoxes.length = 0;
    // Corpses first so the living always sit on top.
    const living = [];
    for (const e of match.entities) {
      if (e.extracted || !inView(view, e.pos.x, e.pos.y, 40)) continue;
      if (!e.alive) drawCorpse(e);
      else living.push(e);
    }
    living.sort((a, b) => a.pos.y - b.pos.y);
    for (const e of living) drawEntity(match, e, ui);
  }

  function drawCorpse(e) {
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#3a332c';
    ctx.beginPath();
    ctx.ellipse(e.pos.x, e.pos.y, e.radius * 1.1, e.radius * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawEntity(match, e, ui) {
    const isPlayerSquad = e.squadId === match.playerSquad.id;
    const r = e.radius;

    // Ground shadow.
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath();
    ctx.ellipse(e.pos.x, e.pos.y + r * 0.55, r * 0.95, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Selection ring for your own squad.
    if (isPlayerSquad) {
      ctx.strokeStyle = 'rgba(217,164,75,.9)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(e.pos.x, e.pos.y, r + 6, 0, Math.PI * 2);
      ctx.stroke();
    } else if (e.kind === 'hero') {
      ctx.strokeStyle = 'rgba(210,96,76,.75)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(e.pos.x, e.pos.y, r + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Body. Heroes are sprites when the sheets have loaded and shapes when
    // they have not — the fallback is not a courtesy, it is what keeps a
    // missing asset from taking the raid view with it.
    if (e.kind === 'hero' && spritesReady()
        && drawHeroSprite(ctx, e, match.time, r)) {
      drawHeroDecorations(match, e, ui, r, isPlayerSquad);
      return;
    }

    ctx.fillStyle = e.color;
    ctx.strokeStyle = 'rgba(0,0,0,.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (e.rank === 'boss') {
      polygon(e.pos.x, e.pos.y, r, 6, match.time * 0.25);
    } else if (e.rank === 'elite') {
      polygon(e.pos.x, e.pos.y, r, 4, Math.PI / 4);
    } else if (e.kind === 'hero') {
      // Silhouette by role, not by class: with eleven classes a unique shape
      // each would be unreadable at this zoom, so they share four. Colour and
      // the name label separate classes within a role.
      const shape = CLASSES[e.classId]?.shape ?? 'disc';
      if (shape === 'shield') roundedShield(e.pos.x, e.pos.y, r);
      else if (shape === 'chevron') polygon(e.pos.x, e.pos.y, r * 1.15, 3, -Math.PI / 2);
      else if (shape === 'spike') star(e.pos.x, e.pos.y, r * 1.2, r * 0.55, 5, -Math.PI / 2);
      else ctx.arc(e.pos.x, e.pos.y, r, 0, Math.PI * 2);
    } else {
      ctx.arc(e.pos.x, e.pos.y, r, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();

    // Inner highlight gives the body some volume at close zoom.
    if (state.camera.zoom > 0.6) {
      ctx.fillStyle = 'rgba(255,255,255,.16)';
      ctx.beginPath();
      ctx.arc(e.pos.x - r * 0.22, e.pos.y - r * 0.26, r * 0.42, 0, Math.PI * 2);
      ctx.fill();
    }

    // Facing notch.
    ctx.strokeStyle = 'rgba(0,0,0,.7)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(e.pos.x, e.pos.y);
    ctx.lineTo(e.pos.x + Math.cos(e.facing) * (r + 5), e.pos.y + Math.sin(e.facing) * (r + 5));
    ctx.stroke();

    drawHeroDecorations(match, e, ui, r, isPlayerSquad);
  }

  /**
   * Everything drawn around a body rather than as one: the absorb ring, bars,
   * the extraction arc, the name and status pips.
   *
   * Shared by the sprite path and the shape fallback. Duplicating it was the
   * obvious way to add sprites and the wrong one — the two copies drift, and
   * the first thing to go missing is a health bar on exactly the heroes the
   * player is watching.
   */
  function drawHeroDecorations(match, e, ui, r, isPlayerSquad) {
    // Absorb shield.
    if (e.shield > 0) {
      ctx.strokeStyle = 'rgba(143,214,255,.85)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(e.pos.x, e.pos.y, r + 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Health bar — always for heroes and big things, on damage for trash.
    const hurt = hpFrac(e) < 0.999;
    if (e.kind === 'hero' || e.rank === 'boss' || e.rank === 'elite' || hurt) {
      const w = e.rank === 'boss' ? 62 : e.kind === 'hero' ? 34 : 26;
      barAt(e.pos.x - w / 2, e.pos.y - r - 11, w, 4, hpFrac(e),
        isPlayerSquad ? '#7cc98a' : e.kind === 'hero' ? '#d2604c' : '#c07a5a');
      if (e.kind === 'hero' && e.maxMana > 0) {
        barAt(e.pos.x - w / 2, e.pos.y - r - 6, w, 2.5, manaFrac(e), '#5a8fd0');
      }
    }

    // Extraction channel.
    if (e.extractingAt && e.extractProgress > 0) {
      const ex = match.map.extracts.find((x) => x.id === e.extractingAt);
      const pct = Math.min(1, e.extractProgress / (ex?.channelSeconds ?? 8));
      ctx.strokeStyle = '#8fe0a8';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(e.pos.x, e.pos.y, r + 12, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2);
      ctx.stroke();
    }

    // Names: your squad always, bosses always, rivals when zoomed in.
    if (e.rank === 'boss') unitLabel(e.name, e.pos.x, e.pos.y - r - 20, '#f0c880', 15);
    else if (isPlayerSquad) unitLabel(e.name, e.pos.x, e.pos.y - r - 18, '#f0e8da', 12);
    else if (e.kind === 'hero' && state.camera.zoom > 0.7) unitLabel(e.name, e.pos.x, e.pos.y - r - 18, '#e8a89c', 11);

    // Status pips.
    if (e.statuses.length && state.camera.zoom > 0.55) {
      let sx = e.pos.x - Math.min(e.statuses.length, 6) * 4;
      for (const st of e.statuses.slice(0, 6)) {
        ctx.fillStyle = st.type === 'debuff' ? '#d2604c' : '#7cc98a';
        ctx.fillRect(sx, e.pos.y + r + 4, 5, 3);
        sx += 7;
      }
    }
  }

  function drawProjectiles(match, view) {
    for (const p of match.projectiles) {
      if (!inView(view, p.pos.x, p.pos.y, 20)) continue;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.pos.x, p.pos.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.arc(p.pos.x, p.pos.y, p.radius * 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawEffects(match) {
    for (const s of match.swings) {
      ctx.strokeStyle = s.color;
      ctx.globalAlpha = Math.max(0, s.life / 0.12) * 0.8;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(s.from.x, s.from.y);
      ctx.lineTo(s.to.x, s.to.y);
      ctx.stroke();
    }
    for (const b of match.blasts) {
      const t = 1 - b.life / 0.35;
      ctx.strokeStyle = b.color;
      ctx.globalAlpha = Math.max(0, 1 - t) * 0.85;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius * (0.55 + t * 0.5), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawOrderMarker(match) {
    const order = match.playerSquad.order;
    if (!order?.pos) return;
    const pulse = 0.5 + 0.5 * Math.sin(match.time * 4);
    ctx.strokeStyle = order.mode === 'extract' ? 'rgba(140,230,170,.9)' : 'rgba(217,164,75,.75)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(order.pos.x, order.pos.y, 22 + pulse * 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(order.pos.x - 11, order.pos.y);
    ctx.lineTo(order.pos.x + 11, order.pos.y);
    ctx.moveTo(order.pos.x, order.pos.y - 11);
    ctx.lineTo(order.pos.x, order.pos.y + 11);
    ctx.stroke();
  }

  /** Floating combat text is drawn in screen space so it stays legible. */
  function drawFloats(match) {
    ctx.save();
    ctx.textAlign = 'center';
    for (const f of match.floats) {
      const p = worldToScreen(f.x, f.y);
      if (p.x < -80 || p.y < -40 || p.x > state.width + 80 || p.y > state.height + 40) continue;
      ctx.globalAlpha = Math.min(1, f.life * 1.6);
      ctx.font = `${f.big ? 700 : 600} ${f.big ? 17 : 13}px ${'ui-sans-serif, system-ui, sans-serif'}`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,.75)';
      ctx.strokeText(f.text, p.x, p.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, p.x, p.y);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // --- Minimap -------------------------------------------------------------

  function drawMinimap(match) {
    const size = minimapCanvas.width;
    const k = size / WORLD_SIZE;
    mmCtx.clearRect(0, 0, size, size);
    mmCtx.drawImage(state.bg, 0, 0, size, size);
    mmCtx.globalAlpha = 0.55;
    mmCtx.fillStyle = '#0b0a09';
    mmCtx.fillRect(0, 0, size, size);
    mmCtx.globalAlpha = 1;

    // Rings.
    mmCtx.strokeStyle = 'rgba(190,110,220,.3)';
    mmCtx.lineWidth = 1;
    for (const r of [RING_CORE, RING_MID]) {
      mmCtx.beginPath();
      mmCtx.arc(CENTER.x * k, CENTER.y * k, r * k, 0, Math.PI * 2);
      mmCtx.stroke();
    }

    if (match.collapseActive) {
      mmCtx.strokeStyle = 'rgba(230,90,70,.9)';
      mmCtx.lineWidth = 1.5;
      mmCtx.beginPath();
      mmCtx.arc(CENTER.x * k, CENTER.y * k, match.collapseRadius * k, 0, Math.PI * 2);
      mmCtx.stroke();
    }

    for (const ex of match.map.extracts) {
      const open = extractIsOpen(ex, match.time);
      mmCtx.fillStyle = open ? '#7cd89a' : 'rgba(160,130,120,.55)';
      mmCtx.beginPath();
      mmCtx.arc(ex.x * k, ex.y * k, open ? 5 : 3.5, 0, Math.PI * 2);
      mmCtx.fill();
    }

    for (const ev of match.activeEvents) {
      if (!ev.pos) continue;
      mmCtx.strokeStyle = '#6fa8d8';
      mmCtx.lineWidth = 1.5;
      mmCtx.beginPath();
      mmCtx.arc(ev.pos.x * k, ev.pos.y * k, 6, 0, Math.PI * 2);
      mmCtx.stroke();
    }

    // Entities: only what the player could plausibly know about — their own
    // squad everywhere, and anything else within sight of it.
    const centre = match.squadCentroid(match.playerSquad);
    for (const e of match.entities) {
      if (!e.alive || e.extracted) continue;
      const mine = e.squadId === match.playerSquad.id;
      if (!mine && (!centre || dist(centre, e.pos) > 1500)) continue;
      mmCtx.fillStyle = mine ? '#e8c46a' : e.kind === 'hero' ? '#d2604c' : e.rank === 'boss' ? '#f0a33c' : 'rgba(180,120,90,.75)';
      const r = mine ? 3 : e.rank === 'boss' ? 4 : 2;
      mmCtx.beginPath();
      mmCtx.arc(e.pos.x * k, e.pos.y * k, r, 0, Math.PI * 2);
      mmCtx.fill();
    }

    // Viewport rectangle.
    const vw = state.width / state.camera.zoom * k;
    const vh = state.height / state.camera.zoom * k;
    mmCtx.strokeStyle = 'rgba(235,227,214,.35)';
    mmCtx.lineWidth = 1;
    mmCtx.strokeRect(
      Math.round(state.camera.x * k - vw / 2) + 0.5,
      Math.round(state.camera.y * k - vh / 2) + 0.5,
      Math.max(3, vw), Math.max(3, vh));
  }

  // --- Primitives ----------------------------------------------------------

  function roundedShield(x, y, r) {
    ctx.moveTo(x - r, y - r * 0.75);
    ctx.lineTo(x + r, y - r * 0.75);
    ctx.lineTo(x + r, y + r * 0.15);
    ctx.quadraticCurveTo(x + r * 0.9, y + r, x, y + r * 1.15);
    ctx.quadraticCurveTo(x - r * 0.9, y + r, x - r, y + r * 0.15);
    ctx.closePath();
  }

  function star(x, y, outer, inner, points, rotation) {
    for (let i = 0; i <= points * 2; i++) {
      const a = rotation + (i / (points * 2)) * Math.PI * 2;
      const rad = i % 2 === 0 ? outer : inner;
      const px = x + Math.cos(a) * rad;
      const py = y + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function polygon(x, y, r, sides, rotation) {
    for (let i = 0; i <= sides; i++) {
      const a = rotation + (i / sides) * Math.PI * 2;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
  }

  function barAt(x, y, w, h, frac, colour) {
    ctx.fillStyle = 'rgba(0,0,0,.6)';
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = colour;
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
  }

  function label(text, x, y, colour, size = 14) {
    ctx.save();
    ctx.textAlign = 'center';
    const px = (size * state.uiScale) / state.camera.zoom;
    ctx.font = `600 ${px}px ui-sans-serif, system-ui, sans-serif`;
    ctx.lineWidth = 3 / state.camera.zoom;
    ctx.strokeStyle = 'rgba(0,0,0,.65)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = colour;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  // Squads stand on top of each other, so unit names have to dodge rather
  // than overlap into an unreadable smear.
  const labelBoxes = [];

  function unitLabel(text, x, y, colour, size) {
    const h = ((size + 3) * state.uiScale) / state.camera.zoom;
    const w = (text.length * size * 0.58 * state.uiScale) / state.camera.zoom;
    let ty = y;
    for (let attempt = 0; attempt < 8; attempt++) {
      const clash = labelBoxes.some((b) =>
        Math.abs(b.x - x) < (b.w + w) / 2 && Math.abs(b.y - ty) < h);
      if (!clash) break;
      ty -= h * 1.05;
    }
    labelBoxes.push({ x, y: ty, w, h });
    label(text, x, ty, colour, size);
  }

  const fmt = (s) => {
    const v = Math.max(0, Math.floor(s));
    return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
  };

  // --- Public surface ------------------------------------------------------

  return {
    state,
    resize,
    draw,
    worldToScreen,
    screenToWorld,
    setFollow(v) { state.follow = v; },
    zoomBy(factor, anchor) {
      // While following the squad, zoom about the centre — anchoring on the
      // cursor would drift the camera off the squad without the player asking.
      state.userZoomed = true;
      const useAnchor = anchor && !state.follow;
      const before = useAnchor ? screenToWorld(anchor.x, anchor.y) : null;
      state.camera.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, state.camera.zoom * factor));
      if (before) {
        const after = screenToWorld(anchor.x, anchor.y);
        state.camera.x += before.x - after.x;
        state.camera.y += before.y - after.y;
      }
      clampCamera();
    },
    panBy(dx, dy) {
      state.camera.x -= dx / state.camera.zoom;
      state.camera.y -= dy / state.camera.zoom;
      state.follow = false;
      clampCamera();
    },
    minimapToWorld(px, py) {
      const k = WORLD_SIZE / minimapCanvas.width;
      return { x: px * k, y: py * k };
    },
  };
}
