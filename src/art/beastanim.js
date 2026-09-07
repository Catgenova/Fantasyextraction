// Creature animations.
//
// Four, not six: a beast has no cast and its flinch reads well enough as a
// short recoil folded into the hurt pose. Fifty species times six animations
// is a great deal of PNG for two rows nobody would look at.
//
// The shapes differ from the class set on purpose. A person winds up and
// swings; a beast gathers and lunges, and the loudest thing it can do at this
// size is open its mouth.

import { beastPose } from './beast.js';

const TAU = Math.PI * 2;
const ease = (t) => t * t * (3 - 2 * t);
const spike = (t, at = 0.35) => (t < at ? ease(t / at) : 1 - ease((t - at) / (1 - at)));

export const BEAST_ANIMATIONS = {
  idle: {
    frames: 6,
    seconds: 2.4,
    loop: true,
    pose(t, plan) {
      const p = beastPose();
      const b = Math.sin(t * TAU);
      p.bob = b * 0.6;
      p.coil = b * 0.03;
      p.tail = Math.sin(t * TAU * 0.5) * 0.35 * (plan.restless ?? 1);
      p.wing = 0.15 + b * 0.08;
      return p;
    },
  },

  walk: {
    frames: 6,
    seconds: 0.8,
    loop: true,
    pose(t, plan) {
      const p = beastPose();
      const s = Math.sin(t * TAU);
      p.gait = s;
      // The body wags against the legs. On a long-tailed creature this is most
      // of what sells the walk from above.
      p.turn = s * 0.07;
      p.tail = -s * 0.8;
      p.bob = Math.abs(Math.sin(t * TAU)) * 0.7 - 0.35;
      p.lean = 0.02;
      p.wing = 0.25;
      return p;
    },
  },

  attack: {
    frames: 6,
    seconds: 0.5,
    loop: false,
    pose(t, plan) {
      const p = beastPose();
      // Gather, then throw everything forward. The coil going negative first
      // is what makes the lunge land — without it the creature just slides.
      const gather = t < 0.32 ? ease(t / 0.32) : 1 - ease((t - 0.32) / 0.68);
      const throw_ = t < 0.32 ? 0 : ease((t - 0.32) / 0.68);
      p.coil = -gather * 0.5 + throw_ * 0.7;
      p.lunge = throw_ * 0.55;
      p.lean = throw_ * 0.2 - gather * 0.08;
      p.jaw = spike(t, 0.45);
      p.tail = gather * 0.6 - throw_ * 0.5;
      p.gait = -gather * 0.5 + throw_ * 0.4;
      p.bob = spike(t, 0.4) * 0.7;
      p.wing = 0.2 + throw_ * 0.7;
      return p;
    },
  },

  hurt: {
    frames: 4,
    seconds: 0.26,
    loop: false,
    pose(t, plan) {
      const p = beastPose();
      const k = spike(t, 0.25);
      p.lean = -k * 0.14;
      p.turn = k * 0.22;
      p.coil = -k * 0.3;
      p.jaw = k * 0.5;
      p.tail = k * 0.7;
      p.bob = -k * 0.5;
      return p;
    },
  },

  die: {
    frames: 6,
    seconds: 1.0,
    loop: false,
    hold: true,
    pose(t, plan) {
      const p = beastPose();
      const k = ease(Math.min(1, t * 1.2));
      p.fallen = k;
      p.turn = k * 0.75;
      p.coil = -k * 0.35;
      p.tail = k * 1.1;
      p.jaw = Math.max(0, 0.6 - k * 0.6);
      p.wing = 0.2 - k * 0.2;
      p.bob = -k * 1.4;
      return p;
    },
  },
};

export const BEAST_ANIMATION_IDS = Object.keys(BEAST_ANIMATIONS);

export function beastPoseForFrame(animId, plan, frame) {
  const anim = BEAST_ANIMATIONS[animId] ?? BEAST_ANIMATIONS.idle;
  const t = anim.loop ? frame / anim.frames : frame / Math.max(1, anim.frames - 1);
  return anim.pose(t, plan);
}

export function beastPoseAt(animId, plan, seconds) {
  const anim = BEAST_ANIMATIONS[animId] ?? BEAST_ANIMATIONS.idle;
  let t = seconds / anim.seconds;
  t = anim.loop ? ((t % 1) + 1) % 1 : Math.min(1, Math.max(0, t));
  return anim.pose(t, plan);
}
