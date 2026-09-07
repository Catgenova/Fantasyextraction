// Blitting the baked class sheets into the raid view.
//
// The art itself lives in src/art/ and is drawn by code; this module loads what
// `tools/bake-sprites.mjs` rendered from it and picks which frame to show. The
// raid can hold two hundred and forty entities, so one `drawImage` per hero is
// the difference between this being free and being the frame budget — that is
// why the sheets are baked at all rather than drawing the vectors live.
//
// Everything degrades: if the atlas or an image fails to load, `spriteFor`
// returns null and the renderer falls back to the shapes it always drew. A
// missing asset must not be able to take the game down.

import { ANIMATIONS } from '../art/anim.js';
import { FRAME_UNITS } from '../art/rig.js';
import { BEAST_ANIMATIONS } from '../art/beastanim.js';
import { FRAME_UNITS as BEAST_UNITS } from '../art/beast.js';

const SHEETS = new Map();     // classId -> { img, meta }
const BEASTS = new Map();     // speciesId -> { img, meta }
let atlas = null;
let loading = null;

/** Kick off loading. Safe to call repeatedly; the first call does the work. */
export function loadSprites(base = 'assets/sprites') {
  if (loading) return loading;
  loading = fetch(`${base}/atlas.json`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`atlas ${r.status}`))))
    .then((json) => {
      atlas = json;
      const load = (into) => ([id, meta]) => new Promise((resolve) => {
        const img = new Image();
        img.onload = () => { into.set(id, { img, meta }); resolve(true); };
        // A sheet that will not load is not an error worth stopping for — that
        // class or species simply keeps the old shape.
        img.onerror = () => resolve(false);
        img.src = `${base}/${meta.file}`;
      });
      return Promise.all([
        ...Object.entries(json.classes ?? {}).map(load(SHEETS)),
        ...Object.entries(json.creatures ?? {}).map(load(BEASTS)),
      ]);
    })
    .then(() => SHEETS.size + BEASTS.size)
    .catch(() => 0);
  return loading;
}

export const spritesReady = () => SHEETS.size > 0;
export const beastsReady = () => BEASTS.size > 0;

/**
 * Which animation a hero is in, and how far through it.
 *
 * The order is a priority: death outranks everything, a flinch outranks what
 * they were doing, and moving outranks standing. Without the priority a hero
 * killed mid-swing keeps swinging on the ground.
 */
export function animFor(e, time) {
  if (!e.alive) {
    const since = time - (e.deathTime ?? time);
    return { id: 'die', t: since, hold: true };
  }
  const hurt = time - (e.lastDamageAt ?? -999);
  if (hurt >= 0 && hurt < ANIMATIONS.hurt.seconds) return { id: 'hurt', t: hurt };

  const cast = time - (e.lastCastAt ?? -999);
  if (cast >= 0 && cast < ANIMATIONS.cast.seconds) return { id: 'cast', t: cast };

  const swing = time - (e.lastSwingAt ?? -999);
  if (swing >= 0 && swing < ANIMATIONS.attack.seconds) return { id: 'attack', t: swing };

  const speed = Math.hypot(e.vel?.x ?? 0, e.vel?.y ?? 0);
  if (speed > 6) {
    // Phase the walk by ground covered rather than by wall-clock, so feet do
    // not slide when a hero is slowed or hasted — and seed it per entity so a
    // squad does not march in lockstep.
    e._walkPhase = (e._walkPhase ?? seedOf(e)) + speed;
    return { id: 'walk', t: (e._walkPhase / 620) * ANIMATIONS.walk.seconds };
  }
  return { id: 'idle', t: time + seedOf(e) * 0.01 };
}

/** A stable per-entity offset, so identical heroes are not in identical phase. */
const seedOf = (e) => {
  if (e._animSeed == null) {
    let h = 0;
    const s = String(e.id ?? '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    e._animSeed = Math.abs(h % 360);
  }
  return e._animSeed;
};

/**
 * Which animation a creature is in. The same priority as a hero's, minus the
 * cast a beast does not have — its abilities read as lunges either way.
 */
export function beastAnimFor(e, time) {
  if (!e.alive) return { id: 'die', t: time - (e.deathTime ?? time), hold: true };
  const hurt = time - (e.lastDamageAt ?? -999);
  if (hurt >= 0 && hurt < BEAST_ANIMATIONS.hurt.seconds) return { id: 'hurt', t: hurt };
  const swing = time - (e.lastSwingAt ?? -999);
  if (swing >= 0 && swing < BEAST_ANIMATIONS.attack.seconds) return { id: 'attack', t: swing };
  const speed = Math.hypot(e.vel?.x ?? 0, e.vel?.y ?? 0);
  if (speed > 5) {
    e._walkPhase = (e._walkPhase ?? seedOf(e)) + speed;
    return { id: 'walk', t: (e._walkPhase / 560) * BEAST_ANIMATIONS.walk.seconds };
  }
  return { id: 'idle', t: time + seedOf(e) * 0.013 };
}

/** The source rectangle for one frame, or null if there is no sheet for it. */
export function frameOf(classId, animId, seconds) {
  const sheet = SHEETS.get(classId);
  if (!sheet) return null;
  const meta = sheet.meta.animations[animId] ?? sheet.meta.animations.idle;
  if (!meta) return null;

  const anim = ANIMATIONS[animId] ?? ANIMATIONS.idle;
  let t = seconds / anim.seconds;
  t = anim.loop ? ((t % 1) + 1) % 1 : Math.min(0.9999, Math.max(0, t));
  const frame = anim.loop
    ? Math.floor(t * meta.frames) % meta.frames
    : Math.min(meta.frames - 1, Math.floor(t * meta.frames));

  const cell = sheet.meta.cell;
  return { img: sheet.img, sx: frame * cell, sy: meta.row * cell, cell };
}

/**
 * Draw a hero. Returns false if there is nothing to draw with, so the caller
 * can fall back.
 *
 * `radius` is the entity's own, and the sprite is scaled so the figure's body
 * lands at about that size — the frame is much wider than the body because it
 * has to contain a swung weapon.
 */
export function drawHeroSprite(ctx, e, time, radius) {
  const anim = animFor(e, time);
  const f = frameOf(e.classId, anim.id, anim.t);
  if (!f) return false;

  // A body is roughly one rig unit across; the frame is FRAME_UNITS across.
  const size = radius * 2 * FRAME_UNITS;
  ctx.save();
  ctx.translate(e.pos.x, e.pos.y);
  ctx.rotate(e.facing ?? 0);
  ctx.drawImage(f.img, f.sx, f.sy, f.cell, f.cell, -size / 2, -size / 2, size, size);
  ctx.restore();
  return true;
}

/** The same lookup for a creature sheet. */
export function beastFrameOf(speciesId, animId, seconds) {
  const sheet = BEASTS.get(speciesId);
  if (!sheet) return null;
  const meta = sheet.meta.animations[animId] ?? sheet.meta.animations.idle;
  if (!meta) return null;

  const anim = BEAST_ANIMATIONS[animId] ?? BEAST_ANIMATIONS.idle;
  let t = seconds / anim.seconds;
  t = anim.loop ? ((t % 1) + 1) % 1 : Math.min(0.9999, Math.max(0, t));
  const frame = anim.loop
    ? Math.floor(t * meta.frames) % meta.frames
    : Math.min(meta.frames - 1, Math.floor(t * meta.frames));

  const cell = sheet.meta.cell;
  return { img: sheet.img, sx: frame * cell, sy: meta.row * cell, cell };
}

/**
 * Draw a creature. Returns false when there is no sheet, so the caller falls
 * back to the circle it always drew.
 *
 * Creatures are scaled off their own radius like heroes are, but against the
 * beast rig's frame rather than the class rig's — the two have different
 * proportions, and using one number for both makes every monster subtly the
 * wrong size.
 */
export function drawBeastSprite(ctx, e, time, radius) {
  const anim = beastAnimFor(e, time);
  const f = beastFrameOf(e.defId, anim.id, anim.t);
  if (!f) return false;

  const size = radius * 2 * BEAST_UNITS * 0.86;
  ctx.save();
  ctx.translate(e.pos.x, e.pos.y);
  ctx.rotate(e.facing ?? 0);
  ctx.drawImage(f.img, f.sx, f.sy, f.cell, f.cell, -size / 2, -size / 2, size, size);
  ctx.restore();
  return true;
}
