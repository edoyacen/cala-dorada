/**
 * police.js — the Guardia de Cala Dorada: a heat value that climbs with every
 * crime, patrol cars that route through the street graph to cut the player
 * off, officers on foot who will shoot and can bust you, roadblocks at four
 * stars and a city that forgets you only once you have been out of sight.
 */
import { WANTED, HEAT, WEAPONS, TILE, BLOCKS } from './config.js';
import { policeCar, Vehicle } from './vehicle.js';
import { lanePolyline, lightBlocks, posX, posY, indexI, indexJ, nodeIndex } from './roads.js';
import { clamp, dist, makeRng, turnToward } from './random.js';

/** The names the Guardia Municipal puts on its officers. */
const OFFICER_NAMES = [
  'Agente Ferrer', 'Agente Soler', 'Agente Vidal', 'Agente Ruíz', 'Agente Palma',
  'Agente Costa', 'Agente Marín', 'Agente Boada', 'Agente Serra', 'Agente Nou',
  'Sargento Amer', 'Sargento Pons', 'Agente Llull', 'Agente Bosch', 'Agente Riera',
];
const officerName = (n) => OFFICER_NAMES[Math.abs(n) % OFFICER_NAMES.length];

const COP_SHOOT_RANGE = 34;
const COP_SIGHT = 78;

export class Police {
  constructor(game) {
    this.game = game;
    this.heat = 0;
    this.units = [];
    this.roadblocks = [];
    this.spawnTimer = 0;
    this.lastSeen = 0;
    this.hiddenFor = 0;
    this.seenTimer = 0;
    this.bustTimer = 0;
    this.lastCrime = 0;
    this.rng = makeRng(game.seed ^ 0xc005);
    this.blockTimer = 0;
    this.alerted = false;
  }

  get stars() {
    return clamp(Math.floor(this.heat), 0, 5);
  }

  get active() {
    return this.heat > 0.05;
  }

  /** Add heat for a crime; every crime snaps the city to attention. */
  crime(amount, x = null, y = null) {
    this.heat = clamp(this.heat + amount, 0, 5.6);
    this.lastCrime = this.game.time;
    this.lastSeen = this.game.time;
    this.hiddenFor = 0;
    if (!this.alerted) {
      this.alerted = true;
      this.game.notify('The Guardia has been alerted', 'danger');
      if (this.game.audio) this.game.audio.siren(this.game.player.x, this.game.player.y, 1.4);
    }
    if (x !== null) {
      // Nearby patrols turn toward the sound.
      for (const unit of this.units) {
        if (unit.kind === 'car' && unit.car) {
          unit.rerouteTimer = 0;
        }
      }
    }
  }

  /** A gunshot is heard, if not always witnessed. */
  hearShot(x, y) {
    if (this.heat < 0.2) return;
    this.lastSeen = this.game.time;
    for (const unit of this.units) {
      if (dist(unit.x, unit.y, x, y) < 60) unit.investigate = { x, y, t: 4 };
    }
  }

  /** True when no wall stands between the two points. */
  lineOfSight(ax, ay, bx, by) {
    const d = dist(ax, ay, bx, by);
    const steps = Math.ceil(d / 3);
    for (let s = 1; s < steps; s += 1) {
      const t = s / steps;
      if (this.game.city.buildingNear(ax + (bx - ax) * t, ay + (by - ay) * t, 0.4)) return false;
    }
    return true;
  }

  update(dt) {
    const game = this.game;
    const player = game.player;
    if (this.heat > 0) {
      // Is anyone watching? Only then does the heat hold.
      let seen = false;
      for (const unit of this.units) {
        if (unit.kind === 'car' && unit.car) {
          if (dist(unit.car.x, unit.car.y, player.x, player.y) < COP_SIGHT
            && this.lineOfSight(unit.car.x, unit.car.y, player.x, player.y)) {
            seen = true;
            break;
          }
        } else if (unit.alive && dist(unit.x, unit.y, player.x, player.y) < COP_SIGHT
          && this.lineOfSight(unit.x, unit.y, player.x, player.y)) {
          seen = true;
          break;
        }
      }
      if (seen) {
        this.lastSeen = game.time;
        this.hiddenFor = 0;
      } else {
        this.hiddenFor += dt;
      }
      if (this.hiddenFor > WANTED.decayDelay) {
        this.heat = Math.max(0, this.heat - WANTED.decayRate * dt * (1 + (5 - this.heat) * 0.1));
        if (this.heat < 0.06) {
          this.heat = 0;
          this.alerted = false;
          this.clear();
          game.notify('The Guardia has lost your trail', 'good');
        }
      }
    }

    // Spawn patrols on the streets around the player.
    const stars = this.stars;
    if (stars > 0) {
      this.spawnTimer -= dt;
      const cap = WANTED.maxPolice[stars];
      const cars = this.units.filter((u) => u.kind === 'car').length;
      if (this.spawnTimer <= 0 && cars < cap) {
        this.spawnTimer = WANTED.spawnEvery[stars];
        this.spawnCar(player.x, player.y, stars);
      }
      if (stars >= 2) {
        const feet = this.units.filter((u) => u.kind === 'foot' && u.alive).length;
        const wantFeet = stars >= 4 ? 3 : stars >= 3 ? 2 : 1;
        if (feet < wantFeet && this.rng.chance(dt * 0.55)) {
          this.spawnFoot(player.x, player.y);
        }
      }
      if (stars >= WANTED.roadblocks[stars] && this.rng.chance(dt * 0.09)) {
        this.spawnRoadblock(player, stars);
      }
    }

    // Busted: a patrol officer on foot right beside a player who has stopped.
    let closeCop = null;
    for (const unit of this.units) {
      if (unit.kind !== 'foot' || !unit.alive) continue;
      const d = dist(unit.x, unit.y, player.x, player.y);
      if (d < 3.4) closeCop = unit;
    }
    const speed = player.veh ? player.veh.speed : Math.hypot(player.vx, player.vy);
    if (closeCop && !player.dead && speed < 2.4 && !player.veh) {
      this.bustTimer += dt;
      game.bustedProgress = clamp(this.bustTimer / 1.6, 0, 1);
      if (this.bustTimer > 1.6) {
        this.bustTimer = 0;
        game.busted(closeCop);
      }
    } else {
      this.bustTimer = Math.max(0, this.bustTimer - dt * 2);
      game.bustedProgress = clamp(this.bustTimer / 1.6, 0, 1);
    }

    this.updateUnits(dt);
    this.updateRoadblocks(dt);
  }

  // ------------------------------------------------------------------ units
  spawnCar(x, y, stars) {
    const graph = this.game.graph;
    // Pick an intersection off screen but near enough to arrive.
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const i = clamp(Math.round(x / TILE) + this.rng.int(-3, 3), 0, BLOCKS);
      const j = clamp(Math.round(y / TILE) + this.rng.int(-3, 3), 0, BLOCKS);
      const node = nodeIndex(i, j);
      const px = posX(node);
      const py = posY(node);
      const d = dist(px, py, x, y);
      if (d < 55 || d > 190) continue;
      if (this.game.isOpenLane(px, py, 9)) continue;
      const car = policeCar(px, py, this.rng.range(-Math.PI, Math.PI));
      car.wanted = stars;
      const unit = {
        kind: 'car', car, x: px, y: py, alive: true,
        fireTimer: this.rng.range(0.6, 1.6), rerouteTimer: 0,
        ram: stars >= 3, investigate: null, pathKey: null,
      };
      car.unit = unit;
      this.units.push(unit);
      if (this.game.audio) this.game.audio.siren(px, py, 0.6);
      return unit;
    }
    return null;
  }

  spawnFoot(x, y) {
    // Officers arrive from the nearest pavement corner.
    const node = this.game.graph.nearestNode(x, y);
    const i = clamp(indexI(node) + this.rng.int(-1, 1), 0, BLOCKS);
    const j = clamp(indexJ(node) + this.rng.int(-1, 1), 0, BLOCKS);
    const px = posX(node) + (i - indexI(node)) * TILE * 0.4 + this.rng.range(-8, 8);
    const py = posY(node) + (j - indexJ(node)) * TILE * 0.4 + this.rng.range(-8, 8);
    if (dist(px, py, x, y) < 12) return null;
    const unit = {
      kind: 'foot', alive: true,
      x: px, y: py, h: 0, speed: 0,
      health: 60, fireTimer: this.rng.range(0.5, 1.5),
      walkCycle: this.rng.range(0, 6), aim: 0, downTimer: 0,
      name: officerName(this.rng.int(0, 99)),
    };
    this.units.push(unit);
    return unit;
  }

  updateUnits(dt) {
    const game = this.game;
    const player = game.player;
    const stars = this.stars;
    const graph = game.graph;
    for (let n = this.units.length - 1; n >= 0; n -= 1) {
      const unit = this.units[n];
      if (unit.kind === 'car') {
        const car = unit.car;
        if (!car || car.wrecked) {
          // Bail out and continue on foot, then remove the wreck.
          if (car && car.unit === unit) {
            car.unit = null;
            const officer = this.spawnFoot(car.x, car.y);
            if (officer) officer.health = 45;
          }
          this.units.splice(n, 1);
          continue;
        }
        unit.x = car.x;
        unit.y = car.y;
        unit.rerouteTimer -= dt;
        const d = dist(car.x, car.y, player.x, player.y);
        // A short, straight final approach once the target is in the open.
        const close = d < 42 && this.lineOfSight(car.x, car.y, player.x, player.y);
        if (close) {
          const want = Math.atan2(player.y - car.y, player.x - car.x);
          const turn = turnToward(car.heading, want, dt * 2.4);
          const step = Math.min(d, car.spec.top * 0.55 * dt);
          const nx = car.x + Math.cos(turn) * step;
          const ny = car.y + Math.sin(turn) * step;
          if (!game.city.buildingNear(nx, ny, 1.2)) {
            car.heading = turn;
            car.x = nx;
            car.y = ny;
            car.speed = car.spec.top * 0.5;
            car.vx = Math.cos(turn) * car.speed;
            car.vy = Math.sin(turn) * car.speed;
          }
          car.lane = null;
        } else {
          if (!car.lane || unit.rerouteTimer <= 0 || car.lane.done) {
            const from = graph.nearestNode(car.x, car.y);
            const to = graph.nearestNode(player.x, player.y);
            const nodes = graph.path(from, to) ?? [from];
            const points = lanePolyline(nodes, 5.2);
            if (points.length > 1) {
              car.follow(new (game.driverClass)(points, {
                maxSpeed: car.spec.top * (stars >= 4 ? 0.95 : 0.78),
                speed: Math.max(10, car.speed),
                accel: 16,
                brake: 20,
              }));
            }
            unit.rerouteTimer = 1.1 + Math.random() * 0.7;
          }
          if (!car.lane) {
            // Nothing to follow this frame; let it roll to a stop.
            car.speed = Math.max(0, car.speed - 6 * dt);
            car.vx = Math.cos(car.heading) * car.speed;
            car.vy = Math.sin(car.heading) * car.speed;
            car.x += car.vx * dt;
            car.y += car.vy * dt;
            car.siren += dt * 9;
            continue;
          }
          const ahead = car.lane.peek(12);
          const nearNode = graph.nearestNode(ahead.x, ahead.y);
          let blocked = 0;
          if (dist(ahead.x, ahead.y, posX(nearNode), posY(nearNode)) < 12) {
            if (lightBlocks(indexI(nearNode), indexJ(nearNode), car.lane.heading, game.time)) {
              // The law does not wait at a red light with the blue lights on.
              blocked = 0;
            }
          }
          car.stepLane(dt, blocked);
        }
        car.siren += dt * 9;
        // Ramming and shooting from the window.
        if (stars >= WANTED.shootAt[stars] && d < COP_SHOOT_RANGE) {
          unit.fireTimer -= dt;
          if (unit.fireTimer <= 0 && this.lineOfSight(car.x, car.y, player.x, player.y)) {
            unit.fireTimer = 0.75 + Math.random() * 0.9;
            const aim = Math.atan2(player.y - car.y, player.x - car.x) + (Math.random() - 0.5) * 0.18;
            const muzzle = {
              x: car.x + Math.cos(aim) * (car.len * 0.4),
              y: car.y + Math.sin(aim) * (car.len * 0.4),
            };
            game.combat.fire('cop', muzzle.x, muzzle.y, aim, WEAPONS.pistol);
            game.onCopShoots(car);
          }
        }
        // Nobody is left in a car that has been abandoned by the chase.
        if (d > 300) this.units.splice(n, 1);
        continue;
      }

      // Officer on foot.
      if (!unit.alive) {
        unit.downTimer += dt;
        if (unit.downTimer > 2.2) this.units.splice(n, 1);
        continue;
      }
      const d = dist(unit.x, unit.y, player.x, player.y);
      const los = this.lineOfSight(unit.x, unit.y, player.x, player.y);
      if (d > 190) {
        this.units.splice(n, 1);
        continue;
      }
      if (d > 20 || !los) {
        // Close the distance, stepping around walls.
        const aim = Math.atan2(player.y - unit.y, player.x - unit.x);
        unit.h = turnToward(unit.h, aim, dt * 5);
        const speed = 4.4;
        const nx = unit.x + Math.cos(unit.h) * speed * dt;
        const ny = unit.y + Math.sin(unit.h) * speed * dt;
        const body = { x: nx, y: ny };
        if (!game.city.buildingNear(nx, ny, 0.5)) {
          unit.x = nx;
          unit.y = ny;
        } else {
          // Slide along the wall toward the player.
          const slide = unit.h + (Math.random() < 0.5 ? 1.2 : -1.2);
          unit.x += Math.cos(slide) * speed * dt;
          unit.y += Math.sin(slide) * speed * dt;
        }
        unit.walkCycle += speed * dt * 3.4;
      } else {
        unit.aim = Math.atan2(player.y - unit.y, player.x - unit.x);
        unit.h = turnToward(unit.h, unit.aim, dt * 8);
        unit.fireTimer -= dt;
        if (unit.fireTimer <= 0 && stars >= 1) {
          unit.fireTimer = 0.8 + Math.random() * 1.1;
          const aim = unit.aim + (Math.random() - 0.5) * 0.2;
          game.combat.fire('cop', unit.x + Math.cos(aim) * 0.6, unit.y + Math.sin(aim) * 0.6, aim, WEAPONS.pistol);
          game.onCopShoots(unit);
        }
        unit.walkCycle += dt * 1.5;
      }
      // Officers shove the player out of a car.
      if (d < 2.2 && player.veh && player.veh.speed < 1) {
        this.bustTimer += dt * 0.7;
      }
    }
    // Keep the wanted list short.
    if (this.units.length > 18) this.units.splice(0, this.units.length - 18);
  }

  hurtUnit(unit, damage, source) {
    const game = this.game;
    if (!unit.alive) return;
    game.effects.blood(unit.x, unit.y, Math.random() * 6.28, 4);
    if (unit.kind === 'car') {
      game.damageCar(unit.car, damage, source, unit.car.x, unit.car.y);
      return;
    }
    unit.health -= damage;
    if (source === 'player') this.crime(HEAT.shootCop * 0.35);
    if (unit.health <= 0) {
      unit.alive = false;
      unit.downTimer = 0;
      game.onCopKilled(unit);
    }
  }

  // -------------------------------------------------------------- roadblocks
  spawnRoadblock(player, stars) {
    const graph = this.game.graph;
    const speed = player.veh ? player.veh.speed : 0;
    const heading = player.veh ? player.veh.heading : player.h;
    const aheadX = player.x + Math.cos(heading) * Math.max(90, speed * 3.4);
    const aheadY = player.y + Math.sin(heading) * Math.max(90, speed * 3.4);
    const node = graph.nearestNode(aheadX, aheadY);
    const nx = posX(node);
    const ny = posY(node);
    if (this.roadblocks.some((b) => dist(b.x, b.y, nx, ny) < 60)) return;
    const across = Math.abs(Math.cos(heading)) > Math.abs(Math.sin(heading));
    const blocking = [];
    for (const offset of [-6, 6]) {
      const car = new Vehicle({
        type: 'police',
        x: nx + (across ? 0 : offset),
        y: ny + (across ? offset : 0),
        h: across ? Math.PI / 2 : 0,
        colour: '#f2f4f7',
        driver: null,
        seed: this.rng.int(1, 1e6),
      });
      car.wanted = stars;
      car.roadblock = true;
      this.game.vehicles.push(car);
      blocking.push(car);
      const officer = this.spawnFoot(nx + this.rng.range(-8, 8), ny + this.rng.range(-8, 8));
      if (officer) officer.health = 50;
    }
    this.roadblocks.push({ x: nx, y: ny, cars: blocking, life: 55 });
    if (this.game.audio) this.game.audio.siren(nx, ny, 1);
    this.game.notify('Roadblock ahead', 'danger');
  }

  updateRoadblocks(dt) {
    for (let n = this.roadblocks.length - 1; n >= 0; n -= 1) {
      const block = this.roadblocks[n];
      block.life -= dt;
      if (block.life <= 0) {
        for (const car of block.cars) {
          const at = this.game.vehicles.indexOf(car);
          if (at >= 0) this.game.vehicles.splice(at, 1);
        }
        this.roadblocks.splice(n, 1);
      }
    }
  }

  /** The player lost the city: every patrol goes home. */
  clear() {
    for (const unit of this.units) {
      if (unit.car) {
        const at = this.game.vehicles.indexOf(unit.car);
        if (at >= 0) this.game.vehicles.splice(at, 1);
      }
    }
    this.units.length = 0;
    for (const block of this.roadblocks) {
      for (const car of block.cars) {
        const at = this.game.vehicles.indexOf(car);
        if (at >= 0) this.game.vehicles.splice(at, 1);
      }
    }
    this.roadblocks.length = 0;
    this.heat = 0;
    this.alerted = false;
    this.bustTimer = 0;
    this.game.bustedProgress = 0;
  }

  /** A patrol unit standing on a corner, used by the staged scenes. */
  stageUnit(x, y, kind = 'car', stars = 3) {
    this.heat = Math.max(this.heat, stars);
    if (kind === 'car') {
      const unit = this.spawnCar(x, y, stars);
      if (unit) {
        unit.car.x = x;
        unit.car.y = y;
        unit.rerouteTimer = 0.2;
      }
      return unit;
    }
    return this.spawnFoot(x, y);
  }
}
