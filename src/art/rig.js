// A top-down humanoid, drawn as line art.
//
// Everything here works in a local space where the figure is one unit tall at
// the shoulders, faces +x, and is centred on its own middle. The renderer
// scales and rotates; nothing in this file knows about the world.
//
// Top-down is a specific problem. From directly above a person is mostly
// shoulders, a head, and whatever they are holding — there are no faces, no
// chests, and legs barely exist. So the readable information is the silhouette
// across the shoulders, the angle of the arms, and the weapon. That is what
// this rig animates and what the class kits vary; anything finer than that
// disappears at raid zoom and is only there for the camp screens.

/**
 * How many rig units fit across a baked frame. The baker and the renderer both
 * read this: bake at one scale and blit at another and every sprite is subtly
 * the wrong size, which is the kind of bug that looks like bad art.
 */
export const FRAME_UNITS = 3.1;

/** Neutral pose. Every animation is a departure from this. */
export function restPose() {
  return {
    // Whole-body offsets, in local units.
    bob: 0,          // toward the viewer — a fake vertical, drawn as scale
    lean: 0,         // along facing: forward is positive
    sway: 0,         // across facing
    turn: 0,         // extra rotation of the whole figure, radians

    // Arms. `reach` is how far the hand sits from the shoulder along facing,
    // `spread` how far out to the side, `lift` a small toward-viewer offset
    // used to sell an overhead swing.
    main: { reach: 0.55, spread: 0.30, lift: 0, roll: 0 },
    off: { reach: 0.45, spread: -0.34, lift: 0, roll: 0 },

    // Legs are two short strokes; they only read while walking.
    stride: 0,

    // 0 alive, 1 fully collapsed. Drives the death pose.
    fallen: 0,
  };
}

export const lerpPose = (a, b, t) => ({
  bob: lerp(a.bob, b.bob, t),
  lean: lerp(a.lean, b.lean, t),
  sway: lerp(a.sway, b.sway, t),
  turn: lerp(a.turn, b.turn, t),
  main: lerpArm(a.main, b.main, t),
  off: lerpArm(a.off, b.off, t),
  stride: lerp(a.stride, b.stride, t),
  fallen: lerp(a.fallen, b.fallen, t),
});

const lerp = (a, b, t) => a + (b - a) * t;
const lerpArm = (a, b, t) => ({
  reach: lerp(a.reach, b.reach, t),
  spread: lerp(a.spread, b.spread, t),
  lift: lerp(a.lift, b.lift, t),
  roll: lerp(a.roll, b.roll, t),
});

/**
 * Draw one figure.
 *
 * @param ctx     a 2D context already translated to the figure's centre,
 *                rotated to its facing, and scaled so one unit is one
 *                shoulder-width-ish
 * @param kit     the class kit: proportions, palette and what it is holding
 * @param pose    from `restPose()` and the animations
 */
export function drawFigure(ctx, kit, pose) {
  const ink = kit.ink ?? '#15120e';
  const lw = kit.lineWidth ?? 0.085;

  ctx.save();
  ctx.rotate(pose.turn);
  ctx.translate(pose.lean, pose.sway);

  // Collapsing flattens the figure toward the ground and drops the arms; it
  // reads as a body going down without needing a separate set of art.
  const life = 1 - pose.fallen;
  const scale = (1 + pose.bob * 0.06) * (1 - pose.fallen * 0.18);
  ctx.scale(scale, scale * (1 - pose.fallen * 0.22));

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = lw;
  ctx.strokeStyle = ink;

  const shoulder = kit.shoulder ?? 0.5;

  // --- Legs, first, because everything overlaps them ------------------------
  const step = pose.stride;
  for (const side of [1, -1]) {
    const hipY = side * shoulder * 0.42;
    const footX = step * side * 0.4;
    ctx.strokeStyle = ink;
    ctx.lineWidth = lw * 2.2;
    ctx.beginPath();
    ctx.moveTo(-0.1, hipY);
    ctx.lineTo(footX + 0.26, hipY * 1.12);
    ctx.stroke();
    ctx.strokeStyle = kit.limb ?? kit.head ?? kit.body;
    ctx.lineWidth = lw * 1.05;
    ctx.stroke();
  }

  // --- Carried on the back --------------------------------------------------
  // Behind everything else, so it reads as being under the figure rather than
  // strapped to the front.
  if (kit.back) {
    ctx.save();
    ctx.translate(-shoulder * 0.34, 0);
    kit.back(ctx, kit);
    ctx.restore();
  }

  // --- Off hand -------------------------------------------------------------
  // A two-handed grip is one of the few silhouette differences that survives
  // being twenty pixels wide: both arms converge instead of framing the body,
  // so the figure reads as narrow and committed rather than wide and guarded.
  const off = kit.twoHanded
    ? { ...pose.main, spread: pose.main.spread - 0.2, reach: pose.main.reach - 0.16 }
    : pose.off;
  drawArm(ctx, kit, off, shoulder, ink, lw);
  if (kit.offhand) kit.offhand(ctx, handOf(off), off, kit);

  // --- Torso ----------------------------------------------------------------
  // Shallow along the facing and wide across the shoulders, because that is
  // what a person is from directly above. The first version made this nearly
  // circular and the figure read as a blob with a smaller blob on top; the
  // shoulders have to be the widest thing in the silhouette or there is no
  // reading the facing at all.
  if (kit.cloak) {
    ctx.fillStyle = kit.cloak;
    ctx.strokeStyle = ink;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.ellipse(-0.16, 0, shoulder * 0.76, shoulder * 1.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.fillStyle = kit.body;
  ctx.strokeStyle = ink;
  ctx.lineWidth = lw * 1.2;
  // Depth is a ratio of the shoulder width rather than a constant. Fixed at
  // 0.34 the narrow classes came out nearly circular — a rogue was as deep as
  // it was wide and read as a blob, which is the opposite of what a narrow
  // silhouette is for.
  const depth = shoulder * 0.62;
  ctx.beginPath();
  ctx.ellipse(0, 0, depth, shoulder, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Interior linework. A chest line across the shoulders and a seam along the
  // facing: two strokes that together say which way this thing is pointing,
  // which the outline alone cannot.
  // One stroke, across the shoulders. The pair of crossing lines this replaced
  // turned the torso into a beetle's carapace — the vertical seam and the oval
  // together read as a shell rather than a back.
  ctx.strokeStyle = kit.trim ?? ink;
  ctx.lineWidth = lw * 0.7;
  ctx.beginPath();
  ctx.moveTo(-0.06, -shoulder * 0.62);
  ctx.lineTo(-0.06, shoulder * 0.62);
  ctx.stroke();

  if (kit.pauldrons) {
    for (const side of [1, -1]) {
      ctx.fillStyle = kit.pauldrons;
      ctx.strokeStyle = ink;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.ellipse(-0.01, side * shoulder * 0.97, 0.19, 0.15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  // --- Main hand ------------------------------------------------------------
  drawArm(ctx, kit, pose.main, shoulder, ink, lw);
  if (kit.weapon) kit.weapon(ctx, handOf(pose.main), pose.main, kit);

  // --- Head -----------------------------------------------------------------
  // Small, forward of centre, and a full value darker than the body so it
  // separates instead of merging into it. A head that reads as half the torso
  // is the single fastest way to make a top-down figure look like a beetle.
  ctx.fillStyle = kit.head ?? kit.body;
  ctx.strokeStyle = ink;
  ctx.lineWidth = lw * 1.1;
  ctx.beginPath();
  ctx.ellipse(0.07, 0, 0.2, 0.185, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  if (kit.helm) kit.helm(ctx, kit, life);

  ctx.restore();
}

/** Where a hand ends up, in local space. */
function handOf(arm) {
  return { x: arm.reach, y: arm.spread, lift: arm.lift, roll: arm.roll };
}

function drawArm(ctx, kit, arm, shoulder, ink, lw) {
  const sx = -0.02;
  const sy = Math.sign(arm.spread || 1) * shoulder * 0.9;
  const hand = handOf(arm);
  // One bend, placed between shoulder and hand and pushed outward, which is
  // all an elbow needs to be from above.
  const ex = (sx + hand.x) * 0.5 + 0.04;
  const ey = (sy + hand.y) * 0.5 + Math.sign(sy) * 0.12;

  // Drawn twice: an ink stroke, then a thinner limb colour inside it, so the
  // arm reads as a drawn line rather than a black smear where it crosses the
  // torso.
  ctx.strokeStyle = ink;
  ctx.lineWidth = lw * 2.6;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.quadraticCurveTo(ex, ey, hand.x, hand.y);
  ctx.stroke();
  ctx.strokeStyle = kit.limb ?? kit.head ?? kit.body;
  ctx.lineWidth = lw * 1.3;
  ctx.stroke();

  ctx.fillStyle = kit.hands ?? kit.body;
  ctx.strokeStyle = ink;
  ctx.lineWidth = lw * 0.9;
  ctx.beginPath();
  ctx.arc(hand.x, hand.y, 0.085, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}
