/**
 * random.js — a small seeded generator, so the city, the traffic and the
 * staged screenshot scenes are the same every time the same seed is used.
 */

/** A 32-bit hash of a string, used to turn a seed word into a number. */
export function hashString(text) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * A mulberry32 generator: `next()` gives a float in [0,1), and the helpers
 * cover the shapes the city builder asks for.
 */
export function makeRng(seed = 1) {
  let a = (typeof seed === 'string' ? hashString(seed) : seed) >>> 0;
  if (a === 0) a = 0x9e3779b9;
  const rng = {
    seed: a,
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    range(lo, hi) {
      return lo + rng.next() * (hi - lo);
    },
    int(lo, hi) {
      return Math.floor(rng.range(lo, hi + 1));
    },
    pick(list) {
      return list[Math.floor(rng.next() * list.length) % list.length];
    },
    chance(p) {
      return rng.next() < p;
    },
    sign() {
      return rng.next() < 0.5 ? -1 : 1;
    },
    /** A weighted pick: [[value, weight], ...]. */
    weighted(pairs) {
      let total = 0;
      for (const [, w] of pairs) total += w;
      let r = rng.next() * total;
      for (const [value, w] of pairs) {
        r -= w;
        if (r <= 0) return value;
      }
      return pairs[pairs.length - 1][0];
    },
  };
  return rng;
}

/** Clamp `v` into [lo, hi]. */
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
/** Linear interpolation. */
export const lerp = (a, b, t) => a + (b - a) * t;
/** Move `v` toward `target` by at most `step`. */
export function approach(v, target, step) {
  if (v < target) return Math.min(v + step, target);
  return Math.max(v - step, target);
}
/** The shortest signed angle from `a` to `b`, in radians. */
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
/** Smoothly rotate `heading` toward `target` by at most `rate` radians. */
export function turnToward(heading, target, rate) {
  const d = angleDelta(heading, target);
  return heading + clamp(d, -rate, rate);
}
/** Distance between two points. */
export function dist(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}
/** Distance squared, for the hot loops. */
export function dist2(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}
