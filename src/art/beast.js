// A top-down creature, drawn as line art.
//
// The class rig will not do for these. A person from above is a wide shallow
// oval with the head in the middle; a beast is the opposite — long along its
// facing, with a head at one end, a tail at the other, and legs out to the
// sides. Everything readable about it is that profile: where the mass sits
// along the length, how far the head reaches, how much tail there is.
//
// Local space works like the class rig's: the creature faces +x and one unit
// is roughly the width of its body.

/** Neutral pose. */
export function beastPose() {
  return {
    bob: 0,          // toward the viewer
    lean: 0,         // along facing
    sway: 0,         // across facing
    turn: 0,
    gait: 0,         // -1..1, drives the legs
    lunge: 0,        // head and shoulders thrown forward
    jaw: 0,          // 0 shut, 1 wide
    tail: 0,         // -1..1 sweep
    coil: 0,         // body arch: negative gathers, positive extends
    wing: 0,         // 0 folded, 1 spread
    fallen: 0,
  };
}

export const FRAME_UNITS = 3.4;

/**
 * Draw one creature.
 *
 * @param plan  the body plan: proportions, palette and which parts exist
 */
export function drawBeast(ctx, plan, pose) {
  const ink = plan.ink ?? '#15120e';
  const lw = plan.lineWidth ?? 0.075;
  const body = plan.bodyLen ?? 0.62;      // half-length, nose-to-tail axis
  const wide = plan.bodyWide ?? 0.34;     // half-width across

  ctx.save();
  ctx.rotate(pose.turn);
  ctx.translate(pose.lean, pose.sway);

  const scale = (1 + pose.bob * 0.05) * (1 - pose.fallen * 0.2);
  ctx.scale(scale, scale * (1 - pose.fallen * 0.3));
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const life = 1 - pose.fallen;
  const reach = body * (1 + pose.coil * 0.16 + pose.lunge * 0.2);

  // --- Tail -----------------------------------------------------------------
  if (plan.tailLen) {
    const t = plan.tailLen;
    const sweep = pose.tail * 0.5 * life;
    // Filled and tapering rather than a stroke. A constant-width stroke gives a
    // slab as thick at the tip as at the root, which reads as a plank the
    // animal is towing.
    const tipX = -body - t;
    const tipY = sweep * t * 1.9;
    const midX = -body - t * 0.45;
    const midY = sweep * t * 0.75;
    const root = wide * 0.72;
    // The tip keeps a little width. Tapered to a true point, the last third of
    // the tail is narrower than its own outline and fills in solid.
    const tip = root * 0.22;
    ctx.fillStyle = plan.tailColour ?? plan.body;
    ctx.strokeStyle = ink;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(-body * 0.35, -root);
    ctx.quadraticCurveTo(midX, midY - root * 0.4, tipX, tipY - tip);
    ctx.lineTo(tipX, tipY + tip);
    ctx.quadraticCurveTo(midX, midY + root * 0.4, -body * 0.35, root);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
  }

  // --- Wings ----------------------------------------------------------------
  // Drawn under the body and spread across the facing, which is the one thing
  // that makes a flier read as a flier from above: it is wider than it is long.
  if (plan.wingSpan) {
    const span = plan.wingSpan * (0.55 + pose.wing * 0.45);
    for (const side of [1, -1]) {
      ctx.fillStyle = plan.membrane ?? plan.body;
      ctx.strokeStyle = ink;
      ctx.lineWidth = lw;
      // Broad and rounded. Narrow points either side of the body read as
      // leaves; a wing has to be the widest thing about the animal.
      ctx.beginPath();
      ctx.moveTo(body * 0.34, side * wide * 0.5);
      ctx.quadraticCurveTo(body * 0.5, side * span * 0.9, -body * 0.15, side * span);
      ctx.quadraticCurveTo(-body * 0.95, side * span * 0.8, -body * 0.62, side * wide * 0.5);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      // One rib, so it reads as a wing and not a fin.
      ctx.lineWidth = lw * 0.7;
      ctx.beginPath();
      ctx.moveTo(0.02, side * wide * 0.55);
      ctx.lineTo(-body * 0.14, side * span * 0.9);
      ctx.stroke();
    }
  }

  // --- Legs -----------------------------------------------------------------
  const legs = plan.legs ?? 4;
  if (legs) {
    const pairs = Math.max(1, Math.round(legs / 2));
    for (let i = 0; i < pairs; i++) {
      // Front pair sits under the shoulders, back pair under the hips; more
      // than two pairs spreads evenly between.
      const along = pairs === 1 ? 0
        : body * 0.5 - (i / (pairs - 1)) * body * 1.0;
      for (const side of [1, -1]) {
        // Opposite sides and opposite ends move out of phase, which is what a
        // walk is.
        const phase = pose.gait * (side > 0 ? 1 : -1) * (i % 2 === 0 ? 1 : -1);
        // Swept back from the shoulder rather than straight out to the side.
        // Perpendicular legs of a constant thickness are fence posts: the rake
        // is what makes them read as limbs, and it is also what makes the gait
        // visible, because the sweep is what changes.
        const rake = -(plan.legRake ?? 0.34) + phase * (plan.stride ?? 0.3);
        const footX = along + rake;
        const footY = side * (wide + (plan.legReach ?? 0.3)) * (1 - pose.fallen * 0.35);
        const kneeX = along + rake * 0.35;
        const kneeY = side * (wide + (plan.legReach ?? 0.3)) * 0.55;
        ctx.strokeStyle = ink;
        ctx.lineWidth = lw * 1.7;
        ctx.beginPath();
        ctx.moveTo(along, side * wide * 0.72);
        ctx.quadraticCurveTo(kneeX, kneeY, footX, footY);
        ctx.stroke();
        ctx.strokeStyle = plan.limb ?? plan.body;
        ctx.lineWidth = lw * 0.85;
        ctx.stroke();
        // A foot, so the limb ends in something instead of stopping.
        ctx.fillStyle = plan.limb ?? plan.body;
        ctx.strokeStyle = ink;
        ctx.lineWidth = lw * 0.7;
        ctx.beginPath();
        ctx.ellipse(footX, footY, lw * 1.5, lw * 1.1, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      }
    }
  }

  // --- Body -----------------------------------------------------------------
  if (plan.shell) {
    ctx.fillStyle = plan.shell;
    ctx.strokeStyle = ink;
    ctx.lineWidth = lw * 1.3;
    ctx.beginPath();
    ctx.ellipse(-body * 0.08, 0, body * 0.98, wide * 1.28, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // Plate seams, across the shell rather than along it.
    ctx.lineWidth = lw * 0.8;
    ctx.strokeStyle = plan.trim ?? ink;
    for (const d of [-0.35, 0, 0.35]) {
      ctx.beginPath();
      ctx.moveTo(body * d, -wide * 1.1);
      ctx.lineTo(body * d, wide * 1.1);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = plan.body;
    ctx.strokeStyle = ink;
    ctx.lineWidth = lw * 1.3;
    ctx.beginPath();
    ctx.ellipse(0, 0, body, wide, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
  }

  // Dorsal ridge. Drawn as a raised line down the midline with a few notches
  // standing off it, because that is what a ridge looks like from directly
  // above. As a row of triangles it read as a pattern painted on the animal —
  // anatomically where a spine belongs, and visually a decal.
  if (plan.spines) {
    const from = body * 0.42;
    const to = -body * 0.72;
    ctx.strokeStyle = ink;
    ctx.lineWidth = lw * 2.4;
    ctx.beginPath();
    ctx.moveTo(from, 0);
    ctx.lineTo(to, 0);
    ctx.stroke();
    ctx.strokeStyle = plan.spineColour ?? plan.trim ?? ink;
    ctx.lineWidth = lw * 1.3;
    ctx.stroke();

    ctx.strokeStyle = ink;
    ctx.lineWidth = lw * 1.1;
    const n = Math.max(1, plan.spines - 1);
    for (let i = 0; i < plan.spines; i++) {
      const at = from + (to - from) * (i / n);
      const h = wide * 0.26 * (1 - Math.abs(i / n - 0.35) * 0.7);
      ctx.beginPath();
      ctx.moveTo(at, -h);
      ctx.lineTo(at, h);
      ctx.stroke();
    }
  }

  // --- Head -----------------------------------------------------------------
  const headAt = reach + (plan.neck ?? 0.06);
  // Scaled up from the authored numbers. Drawn at the size a head actually is
  // relative to a body, it vanishes: the head is where the eyes and the jaw
  // are, which is the only part of a creature that says which end is which.
  const hl = (plan.headLen ?? wide * 0.9) * 1.3;
  const hw = (plan.headWide ?? wide * 0.72) * 1.25;

  if (plan.neck > 0.02) {
    ctx.strokeStyle = ink;
    ctx.lineWidth = hw * 1.5;
    ctx.beginPath();
    ctx.moveTo(body * 0.6, 0);
    ctx.lineTo(headAt - hl * 0.4, 0);
    ctx.stroke();
    ctx.strokeStyle = plan.body;
    ctx.lineWidth = hw * 1.05;
    ctx.stroke();
  }

  // The jaw opens by splitting the head into two halves that hinge apart. It
  // is the loudest thing a creature can do at this size — a bite reads from
  // much further out than a leg cycle does.
  const gape = pose.jaw * 0.5 * life;
  for (const side of [1, -1]) {
    ctx.save();
    ctx.translate(headAt - hl * 0.5, 0);
    ctx.rotate(side * gape);
    ctx.fillStyle = plan.head ?? plan.body;
    ctx.strokeStyle = ink;
    ctx.lineWidth = lw * 1.2;
    ctx.beginPath();
    ctx.moveTo(-hl * 0.5, 0);
    ctx.quadraticCurveTo(hl * 0.2, side * hw, hl * 1.5, side * hw * 0.16);
    ctx.lineTo(hl * 1.5, 0);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Two fangs at the front of each jaw half, and only worth drawing when the
    // mouth is actually open. A row of even strokes along a shut jaw is a
    // barcode.
    if (plan.teeth && gape > 0.04) {
      ctx.fillStyle = '#efe9dc';
      ctx.strokeStyle = ink;
      ctx.lineWidth = lw * 0.4;
      for (const x of [hl * 0.55, hl * 1.05]) {
        ctx.beginPath();
        ctx.moveTo(x - hw * 0.14, side * hw * 0.5);
        ctx.lineTo(x, side * hw * 0.05);
        ctx.lineTo(x + hw * 0.14, side * hw * 0.5);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
      }
    }
    ctx.restore();
  }

  // Horns and frills sit at the back of the skull, where they widen the
  // silhouette instead of lengthening it.
  if (plan.horns) {
    ctx.strokeStyle = plan.hornColour ?? plan.trim ?? ink;
    ctx.lineWidth = lw * 1.5;
    for (const side of [1, -1]) {
      ctx.beginPath();
      ctx.moveTo(headAt - hl * 0.45, side * hw * 0.4);
      ctx.quadraticCurveTo(
        headAt - hl * 0.2, side * hw * (1 + plan.horns),
        headAt + hl * 0.35, side * hw * (0.7 + plan.horns),
      );
      ctx.stroke();
    }
  }

  if (plan.frill) {
    ctx.fillStyle = plan.frillColour ?? plan.trim ?? plan.body;
    ctx.strokeStyle = ink;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.ellipse(headAt - hl * 0.7, 0, hl * 0.5, hw * (1 + plan.frill), 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
  }

  // Eyes. Two dots is all it takes, and they are what stops a creature from
  // reading as a leaf.
  if (life > 0.35) {
    ctx.fillStyle = plan.eye ?? '#f2e6c8';
    for (const side of [1, -1]) {
      ctx.beginPath();
      ctx.arc(headAt - hl * 0.15, side * hw * 0.45, hw * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}
