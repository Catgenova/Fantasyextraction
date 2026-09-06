// Deterministic, seedable RNG so a match can be replayed / debugged from a seed.

/** mulberry32 — small, fast, good enough for gameplay. */
export function makeRng(seed = Date.now() >>> 0) {
  let a = seed >>> 0;
  const rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.seed = seed >>> 0;
  return rng;
}

export const rand = (rng, min, max) => min + rng() * (max - min);
export const randInt = (rng, min, max) => Math.floor(min + rng() * (max - min + 1));
export const chance = (rng, p) => rng() < p;

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

/** Pick from `[{ weight, ...}]`; falls back to the last entry on rounding drift. */
export function weightedPick(rng, entries, weightOf = (e) => e.weight ?? 1) {
  let total = 0;
  for (const e of entries) total += weightOf(e);
  let roll = rng() * total;
  for (const e of entries) {
    roll -= weightOf(e);
    if (roll <= 0) return e;
  }
  return entries[entries.length - 1];
}

export function shuffle(rng, arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Random point on a circle of `radius` around origin. */
export function randomInCircle(rng, radius) {
  const a = rng() * Math.PI * 2;
  const r = Math.sqrt(rng()) * radius;
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
}
