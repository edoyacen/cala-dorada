/**
 * enemies.js — the men who work for Don Cifuentes: street muscle with pistols
 * and the odd shotgun, a courier who would rather drive than talk, and the
 * names the story needs. They chase, take what cover the kerb offers, shoot
 * when they can see you and drop their weapon when they cannot get up.
 */
import { WEAPONS } from './config.js';
import { dist, makeRng, turnToward, clamp } from './random.js';

export class Thug {
  constructor(opts) {
    this.x = opts.x;
    this.y = opts.y;
    this.h = opts.h ?? 0;
    this.health = opts.health ?? 55;
    this.maxHealth = this.health;
    this.weapon = opts.weapon ?? 'pistol';
    this.alive = true;
    this.aim = 0;
    this.fireTimer = 0.6 + Math.random();
    this.walkCycle = Math.random() * 6;
    this.speed = 0;
    this.name = opts.name ?? null;
    this.boss = opts.boss ?? false;
    // Cifuentes' men wear the same cheap windbreakers in three colours.
    const shirts = ['#4b5568', '#6b3f47', '#3d5146', '#5a5340'];
    this.shirt = opts.shirt ?? (this.boss ? '#e8e2d4' : shirts[Math.floor(Math.random() * shirts.length)]);
    this.pants = opts.pants ?? '#20242a';
    this.skin = opts.skin ?? '#b07a52';
    this.corpse = 0;
    this.radius = 0.4;
    this.bravery = opts.bravery ?? 1;
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.fleeAt = opts.fleeAt ?? 0;
  }
}

export class Enemies {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.rng = makeRng(game.seed ^ 0x7a11);
  }

  /** Put `count` of them around a point, out of the player's line of fire. */
  spawn(x, y, count = 2, opts = {}) {
    const out = [];
    for (let n = 0; n < count; n += 1) {
      const a = this.rng.range(0, Math.PI * 2);
      const r = this.rng.range(opts.spread ?? 6, (opts.spread ?? 6) + 9);
      let px = x + Math.cos(a) * r;
      let py = y + Math.sin(a) * r;
      if (this.game.city.buildingNear(px, py, 0.6)) {
        px = x + Math.cos(a + 1.8) * r;
        py = y + Math.sin(a + 1.8) * r;
      }
      const thug = new Thug({
        x: clamp(px, 8, 1792),
        y: clamp(py, 8, 1792),
        health: opts.health ?? (this.game.missions.difficulty > 1 ? 70 : 55),
        weapon: opts.weapon ?? (n === 0 && opts.leaderWeapon ? opts.leaderWeapon : 'pistol'),
        name: opts.name ?? null,
        boss: opts.boss ?? false,
        shirt: opts.shirt,
        speed: opts.speed,
      });
      this.list.push(thug);
      out.push(thug);
    }
    return out;
  }

  update(dt) {
    const game = this.game;
    const player = game.player;
    for (let n = this.list.length - 1; n >= 0; n -= 1) {
      const thug = this.list[n];
      if (!thug.alive) {
        thug.corpse += dt;
        if (thug.corpse > 40) this.list.splice(n, 1);
        continue;
      }
      const d = dist(thug.x, thug.y, player.x, player.y);
      if (d > 240) continue;
      const los = game.police.lineOfSight(thug.x, thug.y, player.x, player.y);
      thug.fireTimer -= dt;
      const spec = WEAPONS[thug.weapon] ?? WEAPONS.pistol;
      const wantsRange = thug.weapon === 'shotgun' ? 8 : 15;
      if (!los || d > 30) {
        // Close in, stepping around anything solid.
        const aim = Math.atan2(player.y - thug.y, player.x - thug.x);
        thug.h = turnToward(thug.h, aim, dt * 6);
        const speed = (thug.boss ? 4.2 : 5.0) * thug.bravery;
        const nx = thug.x + Math.cos(thug.h) * speed * dt;
        const ny = thug.y + Math.sin(thug.h) * speed * dt;
        if (!game.city.buildingNear(nx, ny, 0.5)) {
          thug.x = nx;
          thug.y = ny;
        } else {
          thug.h += 1.4 * thug.strafe;
        }
        thug.walkCycle += speed * dt * 3.2;
      } else {
        thug.aim = Math.atan2(player.y - thug.y, player.x - thug.x);
        thug.h = turnToward(thug.h, thug.aim, dt * 9);
        if (d > wantsRange) {
          thug.x += Math.cos(thug.aim) * 2.2 * dt;
          thug.y += Math.sin(thug.aim) * 2.2 * dt;
          thug.walkCycle += dt * 6;
        } else {
          // Circle a little so they are not a row of statues.
          const side = thug.aim + Math.PI / 2 * thug.strafe;
          thug.x += Math.cos(side) * 1.6 * dt;
          thug.y += Math.sin(side) * 1.6 * dt;
          if (Math.random() < dt * 0.4) thug.strafe *= -1;
        }
        if (thug.fireTimer <= 0) {
          thug.fireTimer = 1 / spec.rate * (2.2 + Math.random() * 2.4);
          const aim = thug.aim + (Math.random() - 0.5) * 0.16;
          game.combat.fire('thug', thug.x + Math.cos(aim) * 0.6, thug.y + Math.sin(aim) * 0.6, aim, spec);
        }
      }
      game.city.resolveCircle(thug, thug.radius);
    }
  }

  hurt(thug, damage, heading = 0) {
    if (!thug.alive) return false;
    thug.health -= damage;
    this.game.effects.blood(thug.x, thug.y, heading, 3);
    if (thug.health <= 0) {
      thug.alive = false;
      thug.corpse = 0;
      this.game.onThugKilled(thug);
      return true;
    }
    return false;
  }

  /** Living men near a point. */
  near(x, y, r) {
    return this.list.filter((t) => t.alive && dist(t.x, t.y, x, y) < r);
  }

  get aliveCount() {
    return this.list.filter((t) => t.alive).length;
  }

  clear() {
    this.list.length = 0;
  }
}
