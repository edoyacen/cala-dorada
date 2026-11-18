/**
 * roads.js — the street graph (a 13 by 13 lattice of intersections) and the
 * kinematic path follower that every AI driver rides: traffic, taxis, the
 * patrol cars and the vans that block a street. Following a lane offset keeps
 * the city's drivers on their own side of the road and off the pavements,
 * which a steering controller bolted onto arcade physics never manages.
 */
import { TILE, BLOCKS, ROAD, LANE } from './config.js';
import { clamp, dist } from './random.js';

export const NODES = BLOCKS + 1;

/** The intersection index at (i,j). */
export const nodeIndex = (i, j) => j * NODES + i;
export const indexI = (n) => n % NODES;
export const indexJ = (n) => Math.floor(n / NODES);
export const posX = (n) => indexI(n) * TILE;
export const posY = (n) => indexJ(n) * TILE;

export class RoadGraph {
  constructor() {
    this.count = NODES * NODES;
  }

  nearestNode(x, y) {
    const i = clamp(Math.round(x / TILE), 0, BLOCKS);
    const j = clamp(Math.round(y / TILE), 0, BLOCKS);
    return nodeIndex(i, j);
  }

  /** True when two nodes are joined by one street, with its compass heading. */
  heading(from, to) {
    const dx = posX(to) - posX(from);
    const dy = posY(to) - posY(from);
    return Math.atan2(dy, dx);
  }

  neighbours(n) {
    const i = indexI(n);
    const j = indexJ(n);
    const out = [];
    if (i > 0) out.push(n - 1);
    if (i < BLOCKS) out.push(n + 1);
    if (j > 0) out.push(n - NODES);
    if (j < BLOCKS) out.push(n + NODES);
    return out;
  }

  /**
   * A* over the lattice from one intersection to another, returns the node
   * list including both ends, or null when they are the same.
   */
  path(from, to) {
    if (from === to) return [from];
    const open = [from];
    const came = new Map([[from, -1]]);
    const g = new Map([[from, 0]]);
    const f = new Map([[from, this._heuristic(from, to)]]);
    while (open.length) {
      let bestAt = 0;
      for (let k = 1; k < open.length; k += 1) if (f.get(open[k]) < f.get(open[bestAt])) bestAt = k;
      const current = open.splice(bestAt, 1)[0];
      if (current === to) break;
      for (const next of this.neighbours(current)) {
        const tentative = g.get(current) + 1;
        if (tentative < (g.get(next) ?? Infinity)) {
          came.set(next, current);
          g.set(next, tentative);
          f.set(next, tentative + this._heuristic(next, to));
          if (!open.includes(next)) open.push(next);
        }
      }
    }
    if (!came.has(to)) return null;
    const out = [];
    for (let n = to; n !== -1; n = came.get(n)) out.push(n);
    return out.reverse();
  }

  _heuristic(a, b) {
    return Math.abs(indexI(a) - indexI(b)) + Math.abs(indexJ(a) - indexJ(b));
  }

  /** A random walk of `steps` intersections, for a driver with nowhere to be. */
  randomPath(from, steps, rng) {
    const out = [from];
    let current = from;
    let previous = -1;
    for (let k = 0; k < steps; k += 1) {
      const options = this.neighbours(current).filter((n) => n !== previous);
      if (!options.length) break;
      const next = options[Math.floor(rng.next() * options.length)];
      out.push(next);
      previous = current;
      current = next;
    }
    return out;
  }
}

/**
 * Turn a node path into the lane-offset polyline the car actually drives,
 * rounding the corners with a single bisector point each.
 */
export function lanePolyline(nodes, lane = LANE) {
  const pts = nodes.map((n) => ({ x: posX(n), y: posY(n) }));
  if (pts.length < 2) return pts;
  const out = [];
  for (let k = 0; k < pts.length; k += 1) {
    const p = pts[k];
    if (k === 0) {
      const d = dirOf(pts[0], pts[1]);
      out.push({ x: p.x + d.nx * lane, y: p.y + d.ny * lane });
      continue;
    }
    if (k === pts.length - 1) {
      const d = dirOf(pts[k - 1], pts[k]);
      out.push({ x: p.x + d.nx * lane, y: p.y + d.ny * lane });
      continue;
    }
    const a = dirOf(pts[k - 1], pts[k]);
    const b = dirOf(pts[k], pts[k + 1]);
    const nx = (a.nx + b.nx) / 2;
    const ny = (a.ny + b.ny) / 2;
    const len = Math.hypot(nx, ny) || 1;
    const scale = lane / Math.max(0.4, (a.nx * nx + a.ny * ny) / len);
    out.push({ x: p.x + (nx / len) * scale, y: p.y + (ny / len) * scale });
  }
  return out;
}

/** Unit direction plus the right-hand normal of a segment. */
export function dirOf(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  return { ux, uy, nx: -uy, ny: ux, len, heading: Math.atan2(uy, ux) };
}

/** Cumulative lengths of a polyline. */
export function measure(points) {
  const lengths = [0];
  for (let k = 1; k < points.length; k += 1) {
    lengths.push(lengths[k - 1] + dist(points[k - 1].x, points[k - 1].y, points[k].x, points[k].y));
  }
  return { lengths, total: lengths[lengths.length - 1] };
}

/**
 * A driver riding a lane polyline: it owns its position, heading and speed,
 * accelerates and brakes smoothly, and slows for the corner it is about to
 * take. The owner (traffic.js, police.js) decides when it needs a new path.
 */
export class RoadDriver {
  constructor(points, opts = {}) {
    this.setPath(points);
    this.maxSpeed = opts.maxSpeed ?? 16;
    this.accel = opts.accel ?? 7;
    this.brake = opts.brake ?? 14;
    this.speed = opts.speed ?? this.maxSpeed * 0.6;
    this.x = points[0].x;
    this.y = points[0].y;
    this.heading = points.length > 1 ? dirOf(points[0], points[1]).heading : 0;
    this.done = points.length < 2;
    this.waitTimer = 0;
    this.braking = 0;
    this.lane = opts.lane ?? LANE;
  }

  setPath(points) {
    this.points = points;
    const m = measure(points);
    this.lengths = m.lengths;
    this.total = m.total;
    this.distance = 0;
    this.segment = 0;
    this.done = points.length < 2;
  }

  /** Where the driver will be in `ahead` metres, for looking ahead at a light. */
  peek(ahead) {
    const d = Math.min(this.distance + ahead, this.total);
    const p = this.pointAt(d);
    return p;
  }

  pointAt(distance) {
    const { points, lengths } = this;
    let k = this.segment;
    while (k < points.length - 2 && lengths[k + 1] < distance) k += 1;
    const segLen = Math.max(1e-4, lengths[k + 1] - lengths[k]);
    const t = clamp((distance - lengths[k]) / segLen, 0, 1);
    return {
      x: points[k].x + (points[k + 1].x - points[k].x) * t,
      y: points[k].y + (points[k + 1].y - points[k].y) * t,
      heading: dirOf(points[k], points[k + 1]).heading,
      segment: k,
    };
  }

  /** How sharply the next corner turns, 0 for straight on. */
  cornerSharpness(look = 34) {
    const now = this.pointAt(this.distance);
    const later = this.pointAt(Math.min(this.total, this.distance + look));
    let d = Math.abs(later.heading - now.heading) % (Math.PI * 2);
    if (d > Math.PI) d = Math.PI * 2 - d;
    return d;
  }

  /**
   * Advance by `dt`. `blocked` (0..1) asks the driver to stop for a car, a
   * red light or the player standing in the road.
   */
  update(dt, blocked = 0) {
    if (this.done) {
      this.speed = Math.max(0, this.speed - this.brake * dt);
      this.braking = 1;
      return;
    }
    const corner = this.cornerSharpness();
    let wanted = this.maxSpeed * (1 - Math.min(0.72, corner * 0.85));
    if (blocked > 0) wanted *= Math.max(0, 1 - blocked);
    const before = this.speed;
    if (wanted > this.speed) this.speed = Math.min(wanted, this.speed + this.accel * dt);
    else this.speed = Math.max(wanted, this.speed - this.brake * dt);
    // What the renderer paints on the tail lamps: a real deceleration, or a
    // driver standing on the brake because something is in the lane.
    const decel = Math.max(0, before - this.speed) / Math.max(dt, 1e-4);
    this.braking = clamp(Math.max(decel / 11, blocked * 0.8), 0, 1);
    this.distance += this.speed * dt;
    if (this.distance >= this.total) {
      this.distance = this.total;
      this.done = true;
    }
    const p = this.pointAt(this.distance);
    this.x = p.x;
    this.y = p.y;
    // Ease the heading so a lane change reads as a turn, not a snap.
    const target = p.heading;
    let d = (target - this.heading) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    this.heading += d * Math.min(1, dt * 9);
  }
}

/**
 * The traffic-light phase at an intersection: 0 green north-south, 1 amber,
 * 2 green east-west, 3 all red. Deterministic from the index.
 */
export function lightPhase(i, j, time) {
  const cycle = 20;
  const offset = ((i * 7 + j * 11) % 17) * 0.9;
  const t = (time + offset) % cycle;
  if (t < 8) return 0;
  if (t < 9.4) return 1;
  if (t < 17.4) return 2;
  return 3;
}

/** True when a car heading along `heading` has a red light at node (i,j). */
export function lightBlocks(i, j, heading, time) {
  const phase = lightPhase(i, j, time);
  if (phase === 3) return true;
  const northSouth = Math.abs(Math.sin(heading)) > Math.abs(Math.cos(heading));
  return northSouth ? phase !== 0 : phase !== 2;
}

/**
 * The lamps of one junction, for the renderer: each approach gets its own
 * colour, so a street corner reads green one way and red the other.
 */
export function signalAt(i, j, time) {
  const phase = lightPhase(i, j, time);
  const ns = phase === 0 ? 'green' : phase === 1 ? 'amber' : 'red';
  const ew = phase === 2 ? 'green' : phase === 1 ? 'red' : 'red';
  return { phase, ns, ew };
}

/** Where a car heading `heading` through node (i,j) rides in its lane. */
export function lanePoint(i, j, heading, lane = LANE) {
  const nx = posX(nodeIndex(i, j));
  const ny = posY(nodeIndex(i, j));
  return {
    x: nx - Math.sin(heading) * lane,
    y: ny + Math.cos(heading) * lane,
  };
}

export { ROAD, LANE };
