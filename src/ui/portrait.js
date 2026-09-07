// Animated figures on the DOM screens.
//
// These draw the rig live rather than blitting a baked sheet, which is the
// opposite of what the raid does and deliberate. A portrait is 60 to 200px —
// well above the 128px the sheets are baked at — so blitting would upscale and
// go soft exactly where the art is most visible. It also means the camp does
// not have to load two hundred sprite sheets to show five hero cards.
//
// Same `drawFigure`, same animation curves. Only the delivery differs, and the
// reason each way round is the reason: the raid has two hundred and forty
// entities and needs one drawImage each; the camp has five and needs them
// sharp.

import { el } from './dom.js';
import { drawFigure } from '../art/rig.js';
import { poseAt, ANIMATIONS } from '../art/anim.js';
import { drawBeast } from '../art/beast.js';
import { beastPoseAt, BEAST_ANIMATIONS } from '../art/beastanim.js';
import { kitFor } from '../art/kits.js';
import { planFor } from '../art/plans.js';

// Portraits crop tighter than the baked sheets do. A sheet's frame has to hold
// the widest moment of a swing with room to spare; a portrait is looked at, so
// it wants the figure filling it. The tips of the longest weapons do leave the
// frame at the extreme of an attack, which is the right trade — the alternative
// is a figure a third the size of the space it sits in.
const PORTRAIT_UNITS = 2.6;
const BEAST_PORTRAIT_UNITS = 2.9;

// One ticker for every portrait on the page. A dozen hero cards each owning a
// requestAnimationFrame loop is a dozen loops that keep running after the
// screen they were on has been torn down.
const live = new Set();
let ticking = false;

function tick(now) {
  const seconds = now / 1000;
  for (const p of live) {
    // A portrait whose node has left the document is finished. Screens are
    // rebuilt by clearing and re-appending, so this is the only signal there
    // is that one is gone.
    if (!p.canvas.isConnected) { live.delete(p); continue; }
    p.paint(seconds);
  }
  ticking = live.size > 0;
  if (ticking) requestAnimationFrame(tick);
}

function start(p) {
  live.add(p);
  if (!ticking) { ticking = true; requestAnimationFrame(tick); }
}

/**
 * An animated hero figure.
 *
 * @param classId  which class to draw
 * @param opts.size      css pixels, square
 * @param opts.anim      animation id, or a function returning one
 * @param opts.facing    radians. The default faces right, which is how the rig
 *                       is authored and drawn everywhere else. Facing up puts
 *                       a long weapon straight through the top of the frame
 * @param opts.hoverAnim play this while the pointer is over it
 */
export function heroPortrait(classId, opts = {}) {
  const size = opts.size ?? 84;
  const kit = kitFor(classId);
  const canvas = el('canvas.portrait');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  canvas.style.width = canvas.style.height = `${size}px`;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  let anim = opts.anim ?? 'idle';
  let startedAt = null;

  const paint = (seconds) => {
    if (startedAt === null) startedAt = seconds;
    const current = typeof anim === 'function' ? anim() : anim;
    // Published so it can be asserted. Without it the only observable state is
    // which button looks selected, and a figure that quietly ignores the
    // selection passes that check every time.
    if (canvas.dataset.anim !== current) canvas.dataset.anim = current;
    const def = ANIMATIONS[current] ?? ANIMATIONS.idle;
    let t = seconds - startedAt;
    // A one-shot holds on its last frame rather than snapping back, so an
    // attack ends on the follow-through and a death stays down.
    if (!def.loop) t = Math.min(t, def.seconds);
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(opts.facing ?? 0);
    ctx.scale(size / PORTRAIT_UNITS, size / PORTRAIT_UNITS);
    drawFigure(ctx, kit, poseAt(current, kit, t));
    ctx.restore();
  };

  const p = { canvas, paint };
  start(p);
  paint(performance.now() / 1000);

  if (opts.hoverAnim) {
    const resting = anim;
    canvas.addEventListener('pointerenter', () => { anim = opts.hoverAnim; startedAt = null; });
    canvas.addEventListener('pointerleave', () => { anim = resting; startedAt = null; });
  }

  return {
    node: canvas,
    /** Restart on a different animation. */
    play(id) { anim = id; startedAt = null; },
  };
}

/** The same, for a creature. */
export function beastPortrait(speciesId, opts = {}) {
  const size = opts.size ?? 84;
  const plan = planFor(speciesId);
  if (!plan) return { node: el('div'), play() {} };

  const canvas = el('canvas.portrait');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  canvas.style.width = canvas.style.height = `${size}px`;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  let anim = opts.anim ?? 'idle';
  let startedAt = null;

  const paint = (seconds) => {
    if (startedAt === null) startedAt = seconds;
    const current = typeof anim === 'function' ? anim() : anim;
    if (canvas.dataset.anim !== current) canvas.dataset.anim = current;
    const def = BEAST_ANIMATIONS[current] ?? BEAST_ANIMATIONS.idle;
    let t = seconds - startedAt;
    if (!def.loop) t = Math.min(t, def.seconds);
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(opts.facing ?? 0);
    ctx.scale(size / BEAST_PORTRAIT_UNITS, size / BEAST_PORTRAIT_UNITS);
    drawBeast(ctx, plan, beastPoseAt(current, plan, t));
    ctx.restore();
  };

  const p = { canvas, paint };
  start(p);
  paint(performance.now() / 1000);

  if (opts.hoverAnim) {
    const resting = anim;
    canvas.addEventListener('pointerenter', () => { anim = opts.hoverAnim; startedAt = null; });
    canvas.addEventListener('pointerleave', () => { anim = resting; startedAt = null; });
  }

  return { node: canvas, play(id) { anim = id; startedAt = null; } };
}

/** How many portraits are currently being driven. Used by the tests. */
export const livePortraitCount = () => live.size;
