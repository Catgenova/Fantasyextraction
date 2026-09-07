// Animations, as functions of a normalised time 0..1.
//
// Each one returns a pose. Keeping them as functions rather than baked frames
// means the same definitions drive the live renderer and the sprite baker, so
// a sheet can never drift from what the game does — and a class that wants a
// slower swing changes a number rather than a hundred images.
//
// Frame counts live here too, because they belong to the motion: a walk cycle
// needs enough frames to not strobe, a hurt needs four.

import { restPose } from './rig.js';

const TAU = Math.PI * 2;
const ease = (t) => t * t * (3 - 2 * t);

/** A brief spike that rises fast and falls slow — the shape of a swing. */
const strike = (t, at = 0.35) => (t < at ? ease(t / at) : 1 - ease((t - at) / (1 - at)));

export const ANIMATIONS = {
  idle: {
    frames: 8,
    seconds: 2.2,
    loop: true,
    pose(t, kit) {
      const p = restPose();
      const b = Math.sin(t * TAU);
      p.bob = b * 0.5;
      p.main.reach += b * 0.02;
      p.off.reach += Math.sin(t * TAU + 0.7) * 0.02;
      p.main.spread += b * 0.012;
      // A restless class shifts its weight; a heavy one barely moves.
      p.sway = Math.sin(t * TAU * 0.5) * 0.02 * (kit.restless ?? 1);
      return p;
    },
  },

  walk: {
    frames: 8,
    seconds: 0.72,
    loop: true,
    pose(t, kit) {
      const p = restPose();
      const s = Math.sin(t * TAU);
      p.stride = s * (kit.strideLength ?? 1);
      // Two bobs per stride, because both feet land.
      p.bob = Math.abs(Math.sin(t * TAU)) * 0.9 - 0.45;
      p.lean = 0.03;
      // Arms counter-swing against the legs, which is most of what makes a
      // walk read from above.
      p.main.reach += -s * 0.10;
      p.off.reach += s * 0.10;
      p.turn = s * 0.05;
      return p;
    },
  },

  attack: {
    frames: 8,
    seconds: 0.55,
    loop: false,
    pose(t, kit) {
      const p = restPose();
      // Wind up across the body, then throw the hand through the target and
      // recover. The lift sells the arc that a top-down view cannot show.
      const wind = t < 0.3 ? ease(t / 0.3) : 0;
      const swing = t < 0.3 ? 0 : ease((t - 0.3) / 0.7);
      const arc = strike(t, 0.42);

      p.main.spread += wind * 0.34 - swing * 0.52;
      p.main.reach += -wind * 0.22 + swing * 0.55;
      p.main.lift = arc * 0.35;
      p.main.roll = -wind * 0.9 + swing * 2.4;
      p.off.spread -= swing * 0.10;
      p.lean = swing * 0.13 - wind * 0.06;
      p.turn = wind * 0.16 - swing * 0.22;
      p.bob = arc * 0.5;
      return p;
    },
  },

  cast: {
    frames: 8,
    seconds: 0.8,
    loop: false,
    pose(t, kit) {
      const p = restPose();
      // Both hands come up and forward together, hold, and drop. A caster's
      // read is the symmetry — nothing else in the set is symmetrical.
      const rise = strike(t, 0.45);
      p.main.reach += rise * 0.30;
      p.off.reach += rise * 0.30;
      p.main.spread -= rise * 0.10;
      p.off.spread += rise * 0.10;
      p.main.lift = rise * 0.5;
      p.off.lift = rise * 0.5;
      p.main.roll = rise * 0.6;
      p.bob = rise * 1.1;
      p.lean = rise * 0.05;
      return p;
    },
  },

  hurt: {
    frames: 4,
    seconds: 0.28,
    loop: false,
    pose(t, kit) {
      const p = restPose();
      const k = strike(t, 0.25);
      p.lean = -k * 0.16;
      p.turn = k * 0.2;
      p.main.reach -= k * 0.2;
      p.off.reach -= k * 0.16;
      p.off.spread -= k * 0.12;
      p.bob = -k * 0.6;
      return p;
    },
  },

  die: {
    frames: 8,
    seconds: 1.0,
    loop: false,
    hold: true,       // the last frame is what stays on the ground
    pose(t, kit) {
      const p = restPose();
      const k = ease(Math.min(1, t * 1.15));
      p.fallen = k;
      p.turn = k * 0.9;
      p.lean = -k * 0.1;
      // Arms go slack outward rather than staying posed.
      p.main.reach = 0.55 - k * 0.5;
      p.off.reach = 0.45 - k * 0.42;
      p.main.spread = 0.30 + k * 0.34;
      p.off.spread = -0.34 - k * 0.30;
      p.bob = -k * 1.6;
      return p;
    },
  },
};

export const ANIMATION_IDS = Object.keys(ANIMATIONS);

/** The pose for an animation at a wall-clock time in seconds. */
export function poseAt(animId, kit, seconds) {
  const anim = ANIMATIONS[animId] ?? ANIMATIONS.idle;
  let t = seconds / anim.seconds;
  t = anim.loop ? t % 1 : Math.min(1, t);
  return anim.pose(t, kit);
}

/** The pose for one baked frame. */
export function poseForFrame(animId, kit, frame) {
  const anim = ANIMATIONS[animId] ?? ANIMATIONS.idle;
  // A looping animation's last frame must not repeat its first, or the cycle
  // stutters; a one-shot has to actually reach its end.
  const t = anim.loop ? frame / anim.frames : frame / Math.max(1, anim.frames - 1);
  return anim.pose(t, kit);
}
