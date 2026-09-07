// What the hands are holding.
//
// Each of these draws in the rig's local space, already positioned at the hand
// it belongs to. They take the hand's `roll` so a weapon turns with the swing
// rather than sliding around rigidly attached.
//
// From above, a weapon is the loudest thing about a figure — it is the only
// part that extends past the silhouette — so this is where classes get most
// of their difference. Keep each one to a shape you could recognise as a
// twenty-pixel smudge.

const ink = (kit) => kit.ink ?? '#15120e';

function held(ctx, hand, kit, draw) {
  ctx.save();
  ctx.translate(hand.x, hand.y);
  ctx.rotate(hand.roll ?? 0);
  // A lifted hand is nearer the viewer, so its weapon is a little larger.
  const s = 1 + (hand.lift ?? 0) * 0.35;
  ctx.scale(s, s);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = ink(kit);
  draw(ctx, kit);
  ctx.restore();
}

const blade = (len, wide, tip = 0.9) => (ctx, kit) => {
  ctx.lineWidth = 0.06;
  // Grip.
  ctx.strokeStyle = ink(kit);
  ctx.lineWidth = 0.1;
  ctx.beginPath(); ctx.moveTo(-0.12, 0); ctx.lineTo(0.02, 0); ctx.stroke();
  // Crossguard.
  ctx.lineWidth = 0.07;
  ctx.beginPath(); ctx.moveTo(0.04, -0.14); ctx.lineTo(0.04, 0.14); ctx.stroke();
  // Blade.
  ctx.fillStyle = kit.steel ?? '#aeb6c2';
  ctx.lineWidth = 0.055;
  ctx.beginPath();
  ctx.moveTo(0.06, -wide);
  ctx.lineTo(len * tip, -wide * 0.55);
  ctx.lineTo(len, 0);
  ctx.lineTo(len * tip, wide * 0.55);
  ctx.lineTo(0.06, wide);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
};

export const SWORD = blade(1.05, 0.1);
export const GREATSWORD = blade(1.35, 0.135);
export const DAGGER = blade(0.5, 0.075);

/**
 * An axe is a haft with a blade on ONE side of it. Drawing the head as a
 * symmetrical lump around the haft — which is what this was — produces a white
 * balloon on a stick that reads as neither an axe nor a weapon.
 *
 * @param len   how far the haft runs past the hand
 * @param bite  how far the blade stands off the haft
 */
const axeOf = (len, bite) => (ctx, kit) => {
  const head = len * 0.7;
  ctx.strokeStyle = ink(kit);
  ctx.lineWidth = 0.1;
  ctx.beginPath(); ctx.moveTo(-len * 0.42, 0); ctx.lineTo(len, 0); ctx.stroke();

  ctx.fillStyle = kit.steel ?? '#aeb6c2';
  ctx.lineWidth = 0.055;
  ctx.beginPath();
  ctx.moveTo(head - bite * 0.45, -0.03);
  ctx.lineTo(head + bite * 0.35, -bite);
  ctx.quadraticCurveTo(len + bite * 0.2, -bite * 0.45, len, 0.02);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  // A short beard on the far side of the haft, which is what keeps it reading
  // as an axe rather than a flag.
  ctx.beginPath();
  ctx.moveTo(head - bite * 0.25, 0.02);
  ctx.lineTo(head + bite * 0.05, bite * 0.42);
  ctx.lineTo(head + bite * 0.4, 0.03);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
};

export const GREATAXE = axeOf(0.95, 0.5);
export const AXE = axeOf(0.66, 0.34);

export const MACE = (ctx, kit) => {
  ctx.strokeStyle = ink(kit); ctx.lineWidth = 0.1;
  ctx.beginPath(); ctx.moveTo(-0.14, 0); ctx.lineTo(0.46, 0); ctx.stroke();
  ctx.fillStyle = kit.steel ?? '#aeb6c2'; ctx.lineWidth = 0.055;
  ctx.beginPath(); ctx.arc(0.56, 0, 0.14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(0.56 + Math.cos(a) * 0.12, Math.sin(a) * 0.12);
    ctx.lineTo(0.56 + Math.cos(a) * 0.2, Math.sin(a) * 0.2);
    ctx.stroke();
  }
};

export const SPEAR = (ctx, kit) => {
  ctx.strokeStyle = ink(kit); ctx.lineWidth = 0.075;
  ctx.beginPath(); ctx.moveTo(-0.44, 0); ctx.lineTo(0.86, 0); ctx.stroke();
  ctx.fillStyle = kit.steel ?? '#aeb6c2'; ctx.lineWidth = 0.05;
  ctx.beginPath();
  ctx.moveTo(0.8, -0.075); ctx.lineTo(1.12, 0); ctx.lineTo(0.8, 0.075);
  ctx.closePath(); ctx.fill(); ctx.stroke();
};

/**
 * A staff, with the focus at the head drawn by whoever is holding it.
 *
 * Four of the six casters carry one of these, so if the focus were always the
 * same stone they would differ by hue alone — and hue is the one thing that
 * survives worst against a dark map at speed. Giving each a shape means a
 * player can tell an Ice Mage from a Fire Mage in a frozen frame.
 */
const staffOf = (focusDraw, len = 0.62) => (ctx, kit) => {
  ctx.strokeStyle = kit.haft ?? '#6b4f34'; ctx.lineWidth = 0.085;
  ctx.beginPath(); ctx.moveTo(-len * 0.68, 0); ctx.lineTo(len, 0); ctx.stroke();
  ctx.strokeStyle = ink(kit); ctx.lineWidth = 0.05;
  ctx.beginPath(); ctx.moveTo(-len * 0.68, 0); ctx.lineTo(len, 0); ctx.stroke();
  ctx.save();
  ctx.translate(len + 0.1, 0);
  ctx.fillStyle = kit.focus ?? kit.body;
  ctx.strokeStyle = ink(kit);
  ctx.lineWidth = 0.055;
  focusDraw(ctx, kit);
  ctx.restore();
};

/** A plain stone. Reads as "a caster" and nothing more specific. */
const ORB = (ctx) => {
  ctx.beginPath(); ctx.arc(0, 0, 0.15, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
};

/** Angular and cold. */
const SHARD = (ctx) => {
  ctx.beginPath();
  ctx.moveTo(0.22, 0); ctx.lineTo(0, -0.17); ctx.lineTo(-0.13, 0); ctx.lineTo(0, 0.17);
  ctx.closePath(); ctx.fill(); ctx.stroke();
};

/** A teardrop leaning forward, which is as much as a flame can be at this size. */
const FLAME = (ctx) => {
  ctx.beginPath();
  ctx.moveTo(0.26, 0);
  ctx.quadraticCurveTo(0.02, -0.19, -0.1, 0);
  ctx.quadraticCurveTo(0.02, 0.19, 0.26, 0);
  ctx.closePath(); ctx.fill(); ctx.stroke();
};

/**
 * A bolt: hard angles, no curves anywhere. Drawn with real width — the first
 * version was a thin zigzag that filled to almost nothing and read as a stick
 * on the end of a stick.
 */
const BOLT = (ctx) => {
  ctx.beginPath();
  ctx.moveTo(0.2, -0.2);
  ctx.lineTo(-0.02, -0.03);
  ctx.lineTo(0.09, 0.01);
  ctx.lineTo(-0.12, 0.2);
  ctx.lineTo(0.13, 0.04);
  ctx.lineTo(0.01, -0.01);
  ctx.closePath(); ctx.fill(); ctx.stroke();
};

/** A skull, or enough of one: a pale round with two dark sockets. */
const SKULL = (ctx, kit) => {
  ctx.beginPath(); ctx.arc(0, 0, 0.15, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = kit.ink ?? '#15120e';
  for (const side of [-1, 1]) {
    ctx.beginPath(); ctx.arc(0.05, side * 0.06, 0.045, 0, Math.PI * 2); ctx.fill();
  }
};

export const STAFF = staffOf(ORB);
export const STAFF_SHARD = staffOf(SHARD, 0.66);
export const STAFF_FLAME = staffOf(FLAME, 0.6);
export const STAFF_BOLT = staffOf(BOLT, 0.68);
export const STAFF_SKULL = staffOf(SKULL, 0.58);

export const BOW = (ctx, kit) => {
  ctx.strokeStyle = kit.haft ?? '#6b4f34'; ctx.lineWidth = 0.075;
  ctx.beginPath();
  ctx.arc(0.1, 0, 0.46, -Math.PI * 0.62, Math.PI * 0.62);
  ctx.stroke();
  ctx.strokeStyle = ink(kit); ctx.lineWidth = 0.03;
  const y = Math.sin(Math.PI * 0.62) * 0.46;
  ctx.beginPath();
  ctx.moveTo(0.1 + Math.cos(Math.PI * 0.62) * 0.46, -y);
  ctx.lineTo(0.1 + Math.cos(Math.PI * 0.62) * 0.46, y);
  ctx.stroke();
};

export const SHIELD = (ctx, kit) => {
  ctx.fillStyle = kit.shieldFace ?? kit.body;
  ctx.strokeStyle = ink(kit); ctx.lineWidth = 0.06;
  ctx.beginPath();
  ctx.moveTo(0.1, -0.34);
  ctx.quadraticCurveTo(0.34, -0.3, 0.34, 0);
  ctx.quadraticCurveTo(0.34, 0.3, 0.1, 0.34);
  ctx.quadraticCurveTo(-0.02, 0.16, -0.02, 0);
  ctx.quadraticCurveTo(-0.02, -0.16, 0.1, -0.34);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.lineWidth = 0.045;
  ctx.beginPath(); ctx.moveTo(0.16, -0.2); ctx.lineTo(0.16, 0.2); ctx.stroke();
};

export const BUCKLER = (ctx, kit) => {
  ctx.fillStyle = kit.shieldFace ?? kit.body;
  ctx.strokeStyle = ink(kit); ctx.lineWidth = 0.055;
  ctx.beginPath(); ctx.arc(0.14, 0, 0.22, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.lineWidth = 0.04;
  ctx.beginPath(); ctx.arc(0.14, 0, 0.09, 0, Math.PI * 2); ctx.stroke();
};

export const TOME = (ctx, kit) => {
  ctx.fillStyle = kit.shieldFace ?? '#3a3128';
  ctx.strokeStyle = ink(kit); ctx.lineWidth = 0.05;
  ctx.beginPath(); ctx.rect(-0.02, -0.19, 0.34, 0.38); ctx.fill(); ctx.stroke();
  ctx.lineWidth = 0.035;
  ctx.beginPath(); ctx.moveTo(0.15, -0.19); ctx.lineTo(0.15, 0.19); ctx.stroke();
};

/**
 * Wrap a drawing so it can be handed to a kit's `weapon` / `offhand` slot.
 *
 * The wrapper keeps a reference to what it wraps. Without it every weapon in
 * the game is the same anonymous closure, and anything asking "do these two
 * classes carry the same thing?" — the silhouette check in the tests, for one —
 * gets told yes for all of them.
 */
export const inHand = (draw) => {
  const held_ = (ctx, hand, arm, kit) => held(ctx, hand, kit, draw);
  held_.draws = draw;
  return held_;
};

// --- Helms ------------------------------------------------------------------
// Drawn over the head at the origin, in the figure's own space rather than a
// hand's. A helm is a small shape but it sits at the centre of the silhouette,
// so it is worth one distinguishing stroke per class family.

export const helmCrest = (colour) => (ctx, kit) => {
  // A wedge over the brow. This is the only mark in the whole figure whose job
  // is purely "which way is forward", and at twenty pixels it is doing most of
  // the work the outline cannot.
  ctx.fillStyle = colour ?? kit.trim ?? '#15120e';
  ctx.strokeStyle = kit.ink ?? '#15120e';
  ctx.lineWidth = 0.04;
  ctx.beginPath();
  ctx.moveTo(0.3, 0);
  ctx.lineTo(0.02, -0.11);
  ctx.lineTo(0.02, 0.11);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
};

export const helmHorns = (colour) => (ctx, kit) => {
  ctx.strokeStyle = colour ?? kit.trim ?? '#15120e';
  ctx.lineWidth = 0.055;
  for (const side of [1, -1]) {
    ctx.beginPath();
    ctx.moveTo(0.02, side * 0.16);
    ctx.quadraticCurveTo(0.1, side * 0.34, 0.26, side * 0.34);
    ctx.stroke();
  }
};

export const helmHood = (colour) => (ctx, kit) => {
  // Sized against the head, not the body. At the first size this was drawn it
  // covered a narrow class's whole torso and the figure read as a pair of
  // headphones.
  ctx.fillStyle = colour ?? kit.cloak ?? kit.body;
  ctx.strokeStyle = kit.ink ?? '#15120e';
  ctx.lineWidth = 0.045;
  ctx.beginPath();
  ctx.moveTo(0.22, 0);
  ctx.quadraticCurveTo(0.04, -0.23, -0.11, -0.08);
  ctx.quadraticCurveTo(-0.14, 0, -0.11, 0.08);
  ctx.quadraticCurveTo(0.04, 0.23, 0.22, 0);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
};

/** A quiver, seen end-on over the shoulder. */
export const QUIVER = (ctx, kit) => {
  ctx.fillStyle = kit.haft ?? '#6b4f34';
  ctx.strokeStyle = kit.ink ?? '#15120e';
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  ctx.ellipse(0, -0.2, 0.15, 0.11, -0.5, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  ctx.lineWidth = 0.035;
  for (const d of [-0.05, 0, 0.05]) {
    ctx.beginPath();
    ctx.moveTo(-0.02 + d, -0.24);
    ctx.lineTo(-0.14 + d, -0.36);
    ctx.stroke();
  }
};
