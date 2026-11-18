/**
 * combat.js — bullets, fists and the damage they do. Shots are fast tracers
 * stepped a few times a frame so they cannot pass through a person, a car or a
 * wall, and every hit lands on one of four things: a pedestrian, a patrol
 * officer on foot, a car, or the player.
 */
import { WEAPONS, HEAT } from './config.js';
import { dist } from './random.js';

export class Combat {
  constructor(game) {
    this.game = game;
    this.bullets = [];
    this.impacts = 0;
  }

  /** Fire `spec` from (x,y) along `angle` on behalf of `owner`. */
  fire(owner, x, y, angle, spec, fromVehicle = false) {
    const pellets = spec.pellets ?? 1;
    for (let n = 0; n < pellets; n += 1) {
      const spread = (Math.random() - 0.5) * spec.spread * 2;
      const a = angle + spread;
      const speed = spec.speed ?? 190;
      this.bullets.push({
        x, y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: spec.range / speed,
        damage: spec.damage,
        owner,
        fromVehicle,
        tracer: spec.speed,
        travelled: 0,
        maxRange: spec.range,
      });
    }
    this.game.effects.muzzle(x, y, angle);
    this.game.effects.shell(x - Math.cos(angle) * 0.3, y - Math.sin(angle) * 0.3, angle);
    if (this.game.audio) this.game.audio.shoot(spec.sound, x, y, owner === 'player');
    if (owner === 'player') {
      this.game.peds.scare(x, y, spec.sound === 'shotgun' ? 70 : 52);
      this.game.traffic.panic(x, y, 55);
      this.game.effects.kick(spec.sound === 'shotgun' ? 0.5 : 0.16);
      this.game.police.hearShot(x, y);
    }
  }

  /** A fist or a clubbed weapon. Returns what was hit. */
  melee(owner, x, y, angle) {
    const reach = 1.9;
    const tx = x + Math.cos(angle) * reach;
    const ty = y + Math.sin(angle) * reach;
    let hit = null;
    for (const ped of this.game.peds.list) {
      if (ped.state === 'dead') continue;
      if (dist(ped.x, ped.y, tx, ty) < 1.1) {
        this.game.peds.hit(ped, 11, angle);
        hit = ped;
        break;
      }
    }
    if (!hit) {
      for (const unit of this.game.police.units) {
        if (!unit.alive) continue;
        if (dist(unit.x, unit.y, tx, ty) < 1.1) {
          this.game.police.hurtUnit(unit, 12, 'player');
          hit = unit;
          break;
        }
      }
    }
    this.game.audio && this.game.audio.punch(x, y);
    this.game.effects.sparks(tx, ty, 3, '#ffe0a0');
    return hit;
  }

  update(dt) {
    const game = this.game;
    for (let n = this.bullets.length - 1; n >= 0; n -= 1) {
      const b = this.bullets[n];
      const steps = Math.max(1, Math.ceil((Math.hypot(b.vx, b.vy) * dt) / 1.1));
      const sdt = dt / steps;
      let dead = false;
      for (let s = 0; s < steps && !dead; s += 1) {
        const px = b.x;
        const py = b.y;
        b.x += b.vx * sdt;
        b.y += b.vy * sdt;
        b.life -= sdt;
        b.travelled += Math.hypot(b.vx, b.vy) * sdt;
        if (b.life <= 0 || b.travelled > b.maxRange) {
          dead = true;
          break;
        }
        // Walls stop bullets and throw a little dust.
        if (game.city.buildingNear(b.x, b.y, 0.06)) {
          game.effects.sparks(b.x, b.y, 3, '#e8dcc0');
          game.effects.dust(b.x, b.y, 'rgba(210,200,180,0.5)');
          dead = true;
          break;
        }
        if (b.owner === 'player' || b.owner === 'cop' || b.owner === 'thug') {
          for (const ped of game.peds.list) {
            if (ped.state === 'dead') continue;
            if (dist(ped.x, ped.y, b.x, b.y) < 0.55) {
              game.peds.hit(ped, b.damage, Math.atan2(b.vy, b.vx));
              game.onPedShot(ped, b.owner, b.damage);
              dead = true;
              break;
            }
          }
        }
        if (dead) break;
        // The men who work for Cifuentes.
        if (b.owner === 'player' || b.owner === 'cop') {
          for (const thug of game.enemies.list) {
            if (!thug.alive) continue;
            if (dist(thug.x, thug.y, b.x, b.y) < 0.62) {
              game.enemies.hurt(thug, b.damage, Math.atan2(b.vy, b.vx));
              dead = true;
              break;
            }
          }
        }
        if (dead) break;
        // Patrol officers on foot.
        for (const unit of game.police.units) {
          if (!unit.alive) continue;
          if (dist(unit.x, unit.y, b.x, b.y) < 0.6) {
            game.police.hurtUnit(unit, b.damage, b.owner);
            dead = true;
            break;
          }
        }
        if (dead) break;
        // Cars.
        for (const car of game.allCars()) {
          if (car === game.player.veh) continue;
          const dx = b.x - car.x;
          const dy = b.y - car.y;
          if (Math.abs(dx) > car.len || Math.abs(dy) > car.len) continue;
          const c = Math.cos(-car.heading);
          const s = Math.sin(-car.heading);
          const lx = dx * c - dy * s;
          const ly = dx * s + dy * c;
          if (Math.abs(lx) < car.len / 2 && Math.abs(ly) < car.wid / 2) {
            game.damageCar(car, b.damage * 0.5, b.owner, b.x, b.y);
            if (Math.random() < 0.4) game.effects.glass(b.x, b.y, 3, car.heading);
            game.effects.sparks(b.x, b.y, 3, '#ffd27a');
            dead = true;
            break;
          }
        }
        if (dead) break;
        // The player, in a car or on foot.
        if (b.owner !== 'player') {
          const p = game.player;
          if (p.dead) continue;
          if (p.veh) {
            const car = p.veh;
            const dx = b.x - car.x;
            const dy = b.y - car.y;
            const c = Math.cos(-car.heading);
            const s = Math.sin(-car.heading);
            const lx = dx * c - dy * s;
            const ly = dx * s + dy * c;
            if (Math.abs(lx) < car.len / 2 && Math.abs(ly) < car.wid / 2) {
              game.damageCar(car, b.damage * 0.6, b.owner, b.x, b.y);
              if (b.damage > 14) game.player.hurt(2, { kind: b.owner }, game);
              dead = true;
            }
          } else if (dist(p.x, p.y, b.x, b.y) < 0.5) {
            p.hurt(b.damage, { kind: b.owner, x: px, y: py }, game);
            game.effects.blood(p.x, p.y, Math.atan2(b.vy, b.vx), 5);
            game.onPlayerHurt(b.owner);
            dead = true;
          }
        }
        void px;
        void py;
      }
      if (dead) {
        this.impacts += 1;
        this.bullets.splice(n, 1);
      }
    }
  }

  /** Damage and a kill from an explosion at a point. */
  blast(x, y, radius = 9, damage = 70) {
    const game = this.game;
    game.effects.explosion(x, y, radius / 9);
    for (const ped of game.peds.list) {
      if (ped.state === 'dead') continue;
      const d = dist(ped.x, ped.y, x, y);
      if (d < radius) {
        game.peds.hit(ped, damage * (1 - d / radius) * 1.4, Math.atan2(ped.y - y, ped.x - x));
        game.onPedShot(ped, 'explosion', 1);
      }
    }
    for (const unit of game.police.units) {
      if (!unit.alive) continue;
      const d = dist(unit.x, unit.y, x, y);
      if (d < radius) game.police.hurtUnit(unit, damage * (1 - d / radius) * 1.6, 'explosion');
    }
    for (const car of game.allCars()) {
      const d = dist(car.x, car.y, x, y);
      if (d < radius && car !== game.player.veh) {
        game.damageCar(car, damage * (1 - d / radius) * 2.2, 'explosion', car.x, car.y, true);
      }
    }
    const p = game.player;
    const pd = dist(p.x, p.y, x, y);
    if (pd < radius) p.hurt(damage * (1 - pd / radius), { kind: 'explosion' }, game);
  }

  /** The spec of a weapon name, safe against typos in the data. */
  spec(name) {
    return WEAPONS[name] ?? WEAPONS.pistol;
  }

  /** Heat the wanted system takes from a shot pedestrian. */
  heatFor(kind) {
    return HEAT[kind] ?? 0;
  }

  draw(ctx, view) {
    ctx.save();
    ctx.lineCap = 'round';
    for (const b of this.bullets) {
      if (b.x < view.x0 - 40 || b.x > view.x1 + 40 || b.y < view.y0 - 40 || b.y > view.y1 + 40) continue;
      const tail = 0.055;
      ctx.strokeStyle = b.owner === 'player' ? 'rgba(255,230,150,0.9)' : 'rgba(255,170,150,0.9)';
      ctx.lineWidth = 0.16;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx * tail, b.y - b.vy * tail);
      ctx.stroke();
    }
    ctx.restore();
  }
}
