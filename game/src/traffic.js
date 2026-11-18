/**
 * traffic.js — the city's civilians behind the wheel. Each car rides a lane
 * polyline of the street graph, picks a new random route at every junction,
 * waits at a red light, brakes for the car ahead and for anyone standing in
 * the road, and is recycled onto a street near the player when it wanders off.
 */
import { CAR_TYPES, TILE, LANE, BLOCKS } from './config.js';
import { Vehicle } from './vehicle.js';
import { lanePolyline, lightBlocks, posX, posY, indexI, indexJ, nodeIndex } from './roads.js';
import { makeRng, dist, clamp } from './random.js';

const TRAFFIC_TARGET = 62;
const RECYCLE_DIST = 340;

export class Traffic {
  constructor(game) {
    this.game = game;
    this.cars = [];
    this.rng = makeRng(game.seed ^ 0x5f3a);
    this.spawnTimer = 0;
    this.alarmTimer = 0;
  }

  /** Fill the streets around the player. */
  populate(count = TRAFFIC_TARGET) {
    let guard = 0;
    while (this.cars.length < count && guard < count * 8) {
      guard += 1;
      const car = this.spawnNear(this.game.player.x, this.game.player.y, 40, 320);
      if (car) this.cars.push(car);
    }
  }

  /** One civilian car on a random lane near a point, or null when the spot is bad. */
  spawnNear(x, y, minD = 30, maxD = 260) {
    const graph = this.game.graph;
    const rng = this.rng;
    for (let attempt = 0; attempt < 14; attempt += 1) {
      const i = clamp(Math.round(x / TILE) + rng.int(-2, 2), 0, BLOCKS);
      const j = clamp(Math.round(y / TILE) + rng.int(-2, 2), 0, BLOCKS);
      const start = nodeIndex(i, j);
      const nodes = graph.randomPath(start, rng.int(2, 5), rng);
      if (nodes.length < 2) continue;
      const points = lanePolyline(nodes, LANE);
      const px = posX(nodes[0]);
      const py = posY(nodes[0]);
      const d = dist(px, py, x, y);
      if (d < minD || d > maxD) continue;
      if (this.game.city.buildingNear(px, py, 8)) continue;
      if (this.game.isOpenLane(px, py, 9)) continue;
      const type = rng.weighted([
        ['sedan', 9], ['taxi', 3], ['van', 1.6], ['muscle', 1.4], ['sport', 1.2],
      ]);
      const car = new Vehicle({
        type,
        x: points[0].x,
        y: points[0].y,
        h: Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x),
        colour: type === 'taxi' ? '#f2c14b' : undefined,
        driver: 'ai',
        seed: rng.int(1, 1e6),
      });
      car.follow(new (this.game.driverClass)(points, {
        maxSpeed: CAR_TYPES[type].top * rng.range(0.55, 0.85),
        speed: CAR_TYPES[type].top * 0.4,
      }));
      return car;
    }
    return null;
  }

  /** Give every driver a new route from where it stands. */
  reroute(car) {
    const graph = this.game.graph;
    const node = graph.nearestNode(car.x, car.y);
    const nodes = graph.randomPath(node, this.rng.int(3, 6), this.rng);
    if (nodes.length < 2) return;
    const points = lanePolyline(nodes, LANE);
    const driver = car.lane;
    if (driver) {
      driver.setPath(points);
      driver.speed = car.speed * 0.6;
    } else {
      car.follow(new (this.game.driverClass)(points, { maxSpeed: car.spec.top * 0.7, speed: car.speed }));
    }
  }

  update(dt) {
    const game = this.game;
    const player = game.player;
    for (let n = this.cars.length - 1; n >= 0; n -= 1) {
      const car = this.cars[n];
      if (car.wrecked) {
        // A wreck sits where it stopped and burns out.
        car.lane = null;
        car.speed = Math.max(0, car.speed - 8 * dt);
        car.vx *= 0.9;
        car.vy *= 0.9;
        car.x += car.vx * dt;
        car.y += car.vy * dt;
        game.effects.fire(car.x, car.y, dt);
        continue;
      }
      if (!car.lane) {
        this.reroute(car);
        continue;
      }
      if (car.lane.done) {
        this.reroute(car);
        continue;
      }
      // Lamps: check the next junction on the lane.
      const ahead = car.lane.peek(Math.max(10, car.speed * 1.1));
      const nearNode = game.graph.nearestNode(ahead.x, ahead.y);
      const i = indexI(nearNode);
      const j = indexJ(nearNode);
      const toNode = dist(ahead.x, ahead.y, posX(nearNode), posY(nearNode));
      let blocked = 0;
      if (toNode < 14 && lightBlocks(i, j, car.lane.heading, game.time)) blocked = 1;
      // Cars ahead on the same stretch of lane.
      const fx = Math.cos(car.heading);
      const fy = Math.sin(car.heading);
      for (const other of this.cars) {
        if (other === car || other.wrecked) continue;
        const dx = other.x - car.x;
        const dy = other.y - car.y;
        const forward = dx * fx + dy * fy;
        if (forward <= 0 || forward > 12) continue;
        const lateral = Math.abs(-dx * fy + dy * fx);
        if (lateral > 2.6) continue;
        blocked = Math.max(blocked, 1 - forward / 12);
      }
      // The player, on foot or in a car, in the road ahead.
      const pdx = player.x - car.x;
      const pdy = player.y - car.y;
      const pForward = pdx * fx + pdy * fy;
      const pLateral = Math.abs(-pdx * fy + pdy * fx);
      if (pForward > 0 && pForward < 14 && pLateral < 3.4) {
        blocked = Math.max(blocked, 1 - pForward / 16);
        if (!car.horned && pForward < 8) {
          car.horned = true;
          if (game.audio) game.audio.horn(car.x, car.y, 0.7);
          if (pForward < 5 && pLateral < 2.2 && car.speed < 3) {
            game.effects.floatText(player.x, player.y - 1.4, 'MOVE IT!', '#ffd166', 1.0);
          }
        }
      } else {
        car.horned = false;
      }
      car.stepLane(dt, blocked);
      // A patrol car's lightbar, or a civilian's headlights at night.
      if (car.police) car.siren += dt * 9;
      // Recycle far away cars so the streets around the player stay busy.
      if (dist(car.x, car.y, player.x, player.y) > RECYCLE_DIST) {
        const fresh = this.spawnNear(player.x, player.y, 120, RECYCLE_DIST * 0.9);
        if (fresh) {
          this.cars[n] = fresh;
        }
      }
    }
    // Keep the pool topped up.
    this.spawnTimer -= dt;
    if (this.cars.length < TRAFFIC_TARGET && this.spawnTimer <= 0) {
      this.spawnTimer = 0.35;
      const car = this.spawnNear(player.x, player.y, 110, 320);
      if (car) this.cars.push(car);
    }
  }

  /** Cars near a point, for collision and for the wanted system's witnesses. */
  near(x, y, r) {
    const out = [];
    for (const car of this.cars) {
      if (car.wrecked) continue;
      if (Math.abs(car.x - x) < r && Math.abs(car.y - y) < r) out.push(car);
    }
    return out;
  }

  /** Everyone within earshot panics when a shot rings out. */
  panic(x, y, radius = 60) {
    for (const car of this.cars) {
      if (car.wrecked) continue;
      const d = dist(car.x, car.y, x, y);
      if (d < radius && car.lane) {
        car.lane.maxSpeed = car.spec.top * 1.15;
        car.panic = 2.4;
      }
    }
  }
}
