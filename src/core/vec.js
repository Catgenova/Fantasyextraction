// Minimal 2D vector helpers. Everything in the sim uses plain {x, y} objects.

export const vec = (x = 0, y = 0) => ({ x, y });
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a, s) => ({ x: a.x * s, y: a.y * s });

export function len(a) {
  return Math.hypot(a.x, a.y);
}

export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Squared distance — use in hot loops to skip the sqrt. */
export function dist2(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function norm(a) {
  const l = Math.hypot(a.x, a.y);
  return l < 1e-6 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
}

/** Unit vector pointing from `a` towards `b`. */
export function dirTo(a, b) {
  return norm(sub(b, a));
}

export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);
export const lerp = (a, b, t) => a + (b - a) * t;

export function angleTo(a, b) {
  return Math.atan2(b.y - a.y, b.x - a.x);
}
