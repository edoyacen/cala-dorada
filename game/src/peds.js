/**
 * peds.js — the people of Cala Dorada. Tourists in loud shirts on the sand,
 * office workers cutting corners in Aurora Centro, dockers by the containers.
 * They walk a block's pavement, cross for a coffee, run screaming from gunfire
 * and from a car on the kerb, and leave a body and a little cash behind.
 */
import { TILE, ROAD, SIDEWALK, PED, CITY, BLOCKS } from './config.js';
import { makeRng, dist, clamp, approach } from './random.js';
import { districtOf } from './city.js';

const SHIRTS = ['#ff7a8a', '#ffd166', '#6fd3c7', '#f4f1e8', '#8fb8e8', '#f09d4a', '#c9a0dc', '#8ad07a'];
const PANTS = ['#2f3a4a', '#4a3f35', '#6b6f78', '#d8cfc0', '#3b5a4a', '#8a6a4a'];
const SKIN = ['#c98d63', '#8a5a3b', '#e5b48c', '#f0c9a3', '#6b4227'];

let nextPedId = 1;

export class Ped {
  constructor(opts) {
    this.id = nextPedId++;
    this.x = opts.x;
    this.y = opts.y;
    this.h = opts.h ?? 0;
    this.block = opts.block;
    this.speed = 0;
    this.state = 'walk';         // walk | idle | flee | down | dead
    this.timer = opts.timer ?? 0;
    this.health = 34;
    this.shirt = opts.shirt;
    this.pants = opts.pants;
    this.skin = opts.skin;
    this.hair = opts.hair ?? '#2a1f1a';
    this.hat = opts.hat ?? false;
    this.bag = opts.bag ?? false;
    this.dir = opts.dir ?? 1;
    this.target = null;
    this.walkCycle = Math.random() * 6;
    this.fear = 0;
    this.threat = null;
    this.radius = PED.radius;
    this.corpse = 0;
    this.angle = 0;
    this.scream = false;
    this.role = opts.role ?? 'civilian';
    this.name = opts.name ?? null;
    this.district = opts.district ?? 'residential';
  }
}

export class Peds {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.rng = makeRng(game.seed ^ 0x1eed);
    this.spawnTimer = 0;
    this.ambient = 0;
  }

  /** Populate the pavements around the player. */
  populate(count = 78) {
    let guard = 0;
    while (this.list.length < count && guard < count * 6) {
      guard += 1;
      const ped = this.spawnNear(this.game.player.x, this.game.player.y, 12, 190);
      if (ped) this.list.push(ped);
    }
  }

  /** One pedestrian on a pavement near a point. */
  spawnNear(x, y, minD = 8, maxD = 160) {
    const rng = this.rng;
    const city = this.game.city;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const i = clamp(Math.round(x / TILE) + rng.int(-2, 2), 0, BLOCKS - 1);
      const j = clamp(Math.round(y / TILE) + rng.int(-2, 2), 0, BLOCKS - 1);
      const block = city.blocks[j * BLOCKS + i];
      if (!block) continue;
      const inset = ROAD / 2 + SIDEWALK * 0.55;
      const x0 = block.x0 - SIDEWALK * 0.5 + 2;
      const y0 = block.y0 - SIDEWALK * 0.5 + 2;
      const w = block.w + SIDEWALK - 4;
      const side = rng.int(0, 3);
      const t = rng.next();
      let px = x0;
      let py = y0;
      let h = 0;
      if (side === 0) { px = x0 + w * t; py = y0; h = 0; }
      else if (side === 1) { px = x0 + w; py = y0 + w * t; h = Math.PI / 2; }
      else if (side === 2) { px = x0 + w * t; py = y0 + w; h = Math.PI; }
      else { px = x0; py = y0 + w * t; h = -Math.PI / 2; }
      void inset;
      if (dist(px, py, x, y) > maxD || dist(px, py, x, y) < minD) continue;
      if (city.buildingNear(px, py, 0.7)) continue;
      const district = districtOf(i, j);
      return new Ped({
        x: px, y: py, h,
        block: { i, j, x0, y0, w },
        shirt: rng.pick(SHIRTS),
        pants: rng.pick(PANTS),
        skin: rng.pick(SKIN),
        hair: rng.pick(['#2a1f1a', '#5a3a22', '#d8c08a', '#1a1a1e', '#7a4a2a']),
        hat: district === 'beach' ? rng.chance(0.4) : rng.chance(0.1),
        bag: rng.chance(0.3),
        dir: rng.sign(),
        timer: rng.range(0, 3),
        role: district === 'docks' ? 'docker' : district === 'beach' ? 'tourist' : 'civilian',
        district,
      });
    }
    return null;
  }

  /** Walk a pedestrian around its block, or panic. */
  update(dt) {
    const game = this.game;
    const player = game.player;
    for (let n = this.list.length - 1; n >= 0; n -= 1) {
      const ped = this.list[n];
      if (ped.state === 'dead') {
        ped.corpse += dt;
        if (ped.corpse > 55) this.list.splice(n, 1);
        continue;
      }
      if (ped.state === 'down') {
        ped.timer -= dt;
        if (ped.timer <= 0) {
          ped.state = 'flee';
          ped.timer = 3;
          ped.health = Math.max(6, ped.health);
        }
        continue;
      }
      ped.fear = Math.max(0, ped.fear - dt * 0.35);
      if (ped.fear > 0.15) {
        this._flee(ped, dt);
      } else {
        this._walk(ped, dt);
      }
      // A car bumper ends the argument.
      if (ped.state !== 'down' && ped.fear < 0.6) {
        const car = this._carNear(ped.x, ped.y, 2.2);
        if (car && car.speed > 4.5) {
          this.hit(ped, car.speed * 2.4, car.heading);
        }
      }
      // The player on foot barges through the crowd.
      if (player.onFoot && player.speed > 2.5) {
        const d = dist(ped.x, ped.y, player.x, player.y);
        if (d < 0.9) {
          this.hit(ped, 3, player.h, true);
        }
      }
      // Recycle people who wander off the far side of the world.
      if (dist(ped.x, ped.y, player.x, player.y) > 260) {
        const fresh = this.spawnNear(player.x, player.y, 60, 240);
        if (fresh) this.list[n] = fresh;
      }
    }
    this.spawnTimer -= dt;
    if (this.list.length < 70 && this.spawnTimer <= 0) {
      this.spawnTimer = 0.5;
      const ped = this.spawnNear(player.x, player.y, 50, 220);
      if (ped) this.list.push(ped);
    }
  }

  _walk(ped, dt) {
    const b = ped.block;
    const rng = this.rng;
    ped.timer -= dt;
    const speed = PED.walk * (ped.state === 'walk' ? 1 : 0.4);
    if (ped.timer <= 0) {
      ped.timer = rng.range(2.4, 6.5);
      if (rng.chance(0.3)) {
        ped.state = ped.state === 'idle' ? 'walk' : 'idle';
      } else {
        ped.state = 'walk';
      }
    }
    const m = 1.1;
    // The four walls of the pavement loop, walked clockwise or not.
    let x = ped.x;
    let y = ped.y;
    const left = b.x0 + m;
    const top = b.y0 + m;
    const right = b.x0 + b.w - m;
    const bottom = b.y0 + b.w - m;
    const step = speed * dt;
    if (ped.state !== 'idle') {
      // Which wall is nearest decides the direction to walk along it.
      const dl = Math.abs(x - left);
      const dr = Math.abs(x - right);
      const dt2 = Math.abs(y - top);
      const db = Math.abs(y - bottom);
      const min = Math.min(dl, dr, dt2, db);
      if (min === dt2) x += ped.dir * step;
      else if (min === db) x -= ped.dir * step;
      else if (min === dl) y -= ped.dir * step;
      else y += ped.dir * step;
      // Turn the corner and keep to the pavement.
      if (x < left) { x = left; ped.dir *= -1; }
      if (x > right) { x = right; ped.dir *= -1; }
      if (y < top) { y = top; ped.dir *= -1; }
      if (y > bottom) { y = bottom; ped.dir *= -1; }
      ped.h = Math.atan2(y - ped.y, x - ped.x);
      ped.x = x;
      ped.y = y;
      ped.walkCycle += speed * dt * 3.2;
    } else {
      ped.walkCycle += dt * 0.7;
      // Idle people still turn to watch a speeding car go by.
      const car = this._carNear(ped.x, ped.y, 16);
      if (car && car.speed > 12) {
        ped.h = Math.atan2(car.y - ped.y, car.x - ped.x);
      }
    }
    // Step off the pavement into a building? The city pushes them back.
    this.game.city.resolveCircle(ped, ped.radius);
  }

  _flee(ped, dt) {
    const threat = ped.threat ?? { x: ped.x - Math.cos(ped.h), y: ped.y - Math.sin(ped.h) };
    const away = Math.atan2(ped.y - threat.y, ped.x - threat.x);
    ped.h = away;
    const speed = PED.flee * Math.min(1, 0.5 + ped.fear);
    ped.x += Math.cos(away) * speed * dt;
    ped.y += Math.sin(away) * speed * dt;
    ped.walkCycle += speed * dt * 3.4;
    ped.x = clamp(ped.x, 6, CITY - 6);
    ped.y = clamp(ped.y, 6, CITY - 6);
    this.game.city.resolveCircle(ped, ped.radius);
    if (Math.random() < dt * 3) {
      this.game.effects.dust(ped.x, ped.y, 'rgba(200,190,170,0.4)');
    }
  }

  /** Shoot, punch, hit with a car: apply damage and decide what the body does. */
  hit(ped, damage, heading = 0, gentle = false) {
    if (ped.state === 'dead') return false;
    ped.health -= damage;
    ped.fear = Math.min(1.6, ped.fear + 0.8);
    ped.threat = { x: this.game.player.x, y: this.game.player.y };
    this.game.effects.blood(ped.x, ped.y, heading, gentle ? 2 : 6);
    if (ped.health <= 0) {
      ped.state = 'dead';
      ped.angle = heading + (Math.random() - 0.5);
      ped.corpse = 0;
      this.game.effects.decal('blood', ped.x, ped.y, { r: 1.1 });
      this.game.onPedKilled(ped);
      return true;
    }
    if (!gentle && ped.state !== 'down') {
      ped.state = 'down';
      ped.timer = 1.1 + Math.random();
      this.game.audio && this.game.audio.hurt(ped.x, ped.y);
    }
    return false;
  }

  /** Everyone in a radius runs from a point of danger. */
  scare(x, y, radius = 45) {
    for (const ped of this.list) {
      if (ped.state === 'dead' || ped.state === 'down') continue;
      if (dist(ped.x, ped.y, x, y) < radius) {
        ped.fear = 1.5;
        ped.threat = { x, y };
        ped.state = 'flee';
        if (!ped.scream) {
          ped.scream = true;
          this.game.audio && this.game.audio.scream(ped.x, ped.y);
          setTimeout(() => { ped.scream = false; }, 3000);
        }
      }
    }
  }

  _carNear(x, y, r) {
    let best = null;
    let bestD = r;
    for (const car of this.game.allCars()) {
      const d = dist(car.x, car.y, x, y);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  near(x, y, r) {
    const out = [];
    for (const ped of this.list) {
      if (ped.state === 'dead') continue;
      if (Math.abs(ped.x - x) < r && Math.abs(ped.y - y) < r) out.push(ped);
    }
    return out;
  }
}
