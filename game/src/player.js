/**
 * player.js — Rafa Cordero: on foot, behind a wheel, wet, wanted, hurt and
 * paid. Holds the body, the wallet, the weapons and the aim, and answers the
 * keyboard for both of the ways he gets around the city.
 */
import { PLAYER, WEAPONS, CAR_TYPES } from './config.js';
import { clamp, approach, makeRng } from './random.js';

export class Player {
  constructor(x = 900, y = 900) {
    this.x = x;
    this.y = y;
    this.h = -Math.PI / 2;
    this.vx = 0;
    this.vy = 0;
    this.speed = 0;
    this.radius = PLAYER.radius;
    this.onFoot = true;
    this.veh = null;
    this.health = PLAYER.maxHealth;
    this.armour = 0;
    this.money = 480;
    this.weapon = 'pistol';
    this.weapons = { fist: true, pistol: true, smg: false, shotgun: false };
    this.ammo = { fist: Infinity, pistol: 64, smg: 0, shotgun: 0 };
    this.aim = -Math.PI / 2;
    this.fireCooldown = 0;
    this.walkCycle = 0;
    this.stepPhase = 0;
    this.hurtTimer = 0;
    this.dead = false;
    this.deathTimer = 0;
    this.lastDamage = -99;
    this.lastAttacker = null;
    this.kills = 0;
    this.copKills = 0;
    this.driveBy = 0;
    this.enterTimer = 0;
    this.messageTimer = 0;
    this.stamina = 1;
    this.breath = 0;
    this.rng = makeRng(7);
    this.missionFlags = {};
    this.inWater = false;
  }

  get weaponSpec() {
    return WEAPONS[this.weapon] ?? WEAPONS.pistol;
  }

  get alive() {
    return !this.dead;
  }

  /** Distance from a point, in metres. */
  distanceTo(x, y) {
    return Math.hypot(this.x - x, this.y - y);
  }

  /** The muzzle of the weapon in the current aim direction. */
  muzzle() {
    const spread = this.weapon === 'fist' ? 0.55 : 0.6;
    return {
      x: this.x + Math.cos(this.aim) * spread,
      y: this.y + Math.sin(this.aim) * spread,
    };
  }

  /**
   * One step. `controls` is what the keyboard says (moveX, moveY, run,
   * fire, throttle, steer, handbrake, enter) and `aimAt` the world point under
   * the mouse. Returns events: {enteredCar, exitedCar, shot, empty}.
   */
  update(dt, controls, aimAt, game) {
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.enterTimer = Math.max(0, this.enterTimer - dt);
    if (this.dead) {
      this.deathTimer += dt;
      return {};
    }
    const events = {};
    if (this.veh) {
      this._drive(dt, controls, game);
      // A driver can still lean out of the window with a pistol or an SMG.
      this.aim = Math.atan2(aimAt.y - this.veh.y, aimAt.x - this.veh.x);
      if (controls.enter && this.enterTimer <= 0) {
        const stopped = this.veh.speed < 4.5;
        if (stopped) events.exitedCar = this.exitVehicle(game);
        else events.tooFast = true;
        this.enterTimer = 0.4;
      }
    } else {
      this._walk(dt, controls, game);
      this.aim = Math.atan2(aimAt.y - this.y, aimAt.x - this.x);
      if (controls.enter && this.enterTimer <= 0) {
        const car = game.nearestEnterableCar(this.x, this.y, 4.2);
        if (car) events.enteredCar = this.enterVehicle(car, game);
        this.enterTimer = 0.35;
      }
    }
    // On foot the player can shoot; in a car only the light weapons.
    if (controls.fire && this.fireCooldown <= 0) {
      const spec = this.weaponSpec;
      if (this.weapon !== 'fist' && this.ammo[this.weapon] <= 0) {
        events.empty = true;
        this.fireCooldown = 0.35;
      } else {
        this.fireCooldown = 1 / spec.rate;
        events.shot = this.weapon;
        if (this.weapon !== 'fist') this.ammo[this.weapon] -= 1;
      }
    }
    return events;
  }

  _walk(dt, controls, game) {
    // Rafa can sprint, but not forever: the bar under his health is stamina.
    const wantsRun = Boolean(controls.run) && Math.hypot(controls.moveX, controls.moveY) > 0.1;
    if (wantsRun) this.stamina = clamp(this.stamina - dt * 0.16, 0, 1);
    else this.stamina = clamp(this.stamina + dt * 0.11, 0, 1);
    this.breath = wantsRun ? Math.min(1, this.breath + dt * 0.8) : Math.max(0, this.breath - dt * 0.5);
    const tired = this.stamina < 0.18 ? 0.78 : 1;
    const wantRun = (wantsRun && this.stamina > 0.04 ? PLAYER.run : PLAYER.walk) * tired;
    const wet = game.city.surface(this.x, this.y) === 'water';
    this.inWater = wet;
    const speed = wet ? PLAYER.swim : wantRun;
    let dx = controls.moveX;
    let dy = controls.moveY;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    const targetVx = dx * speed;
    const targetVy = dy * speed;
    const accel = len > 0 ? 26 : 20;
    this.vx = approach(this.vx, targetVx, accel * dt);
    this.vy = approach(this.vy, targetVy, accel * dt);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.speed = Math.hypot(this.vx, this.vy);
    if (this.speed > 0.3) {
      const target = Math.atan2(this.vy, this.vx);
      let d = (target - this.h) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      this.h += d * Math.min(1, dt * 12);
      this.walkCycle += this.speed * dt * 1.9;
      this.stepPhase += this.speed * dt;
    } else {
      this.walkCycle += dt * 1.2;
    }
    // Keep the player out of walls and inside the map.
    game.city.resolveCircle(this, this.radius);
    this.x = clamp(this.x, 4, game.city.width ?? 2860 - 4);
    this.y = clamp(this.y, 4, game.city.height ?? 1950 - 4);
    if (wet && this.speed > 0.8 && this.stepPhase > 0.4) {
      this.stepPhase = 0;
      game.effects.spawn('smoke', this.x, this.y, {
        vx: (Math.random() - 0.5) * 1.5,
        vy: (Math.random() - 0.5) * 1.5,
        life: 0.5,
        size: 0.5,
        grow: 1.4,
        colour: 'rgba(220,240,240,0.5)',
      });
    }
  }

  _drive(dt, controls, game) {
    const car = this.veh;
    const impact = car.step(dt, {
      throttle: controls.throttle,
      steer: controls.steer,
      handbrake: controls.handbrake,
    }, game.city);
    this.x = car.x;
    this.y = car.y;
    this.speed = car.speed;
    this.h = car.heading;
    if (car.skid > 0.2 && Math.random() < 0.5) {
      game.effects.tyreSmoke(
        car.x - Math.cos(car.heading) * 1.4,
        car.y - Math.sin(car.heading) * 1.4,
        Math.min(1.6, car.skid * 0.5),
      );
      game.effects.decal('skid', car.x - Math.cos(car.heading) * 1.2, car.y - Math.sin(car.heading) * 1.2, {
        r: 0.28, w: car.wid * 0.42, angle: car.heading,
      });
    }
    if (impact) {
      game.onCrash(car, impact);
    }
  }

  /** Sit in a car; the caller decides whether the driver is thrown out. */
  enterVehicle(car, game) {
    if (car.wrecked) return false;
    if (this.veh) return false;
    const wasOccupied = Boolean(car.driver) && car.driver !== 'player';
    if (wasOccupied) game.ejectDriver(car);
    car.driver = 'player';
    car.lane = null;
    car.alarm = 0;
    this.veh = car;
    this.onFoot = false;
    this.x = car.x;
    this.y = car.y;
    game.onEnterCar(car, wasOccupied);
    return true;
  }

  exitVehicle(game) {
    const car = this.veh;
    if (!car) return false;
    car.driver = null;
    car.throttle = 0;
    car.steer = 0;
    this.veh = null;
    this.onFoot = true;
    const side = car.heading + Math.PI / 2;
    this.x = car.x + Math.cos(side) * (car.wid * 0.75 + 0.5);
    this.y = car.y + Math.sin(side) * (car.wid * 0.75 + 0.5);
    game.city.resolveCircle(this, this.radius);
    this.vx = car.speed * 0.2 * Math.cos(car.heading - Math.PI / 2);
    this.vy = car.speed * 0.2 * Math.sin(car.heading - Math.PI / 2);
    game.onExitCar(car);
    return true;
  }

  /** Damage from a bullet, a bumper, a fall or an explosion. */
  hurt(amount, from = null, game = null, kind = 'bullet') {
    if (this.dead) return 0;
    let left = amount;
    if (this.armour > 0) {
      const absorbed = Math.min(this.armour, left * 0.62);
      this.armour -= absorbed;
      left -= absorbed;
    }
    this.health = Math.max(0, this.health - left);
    this.hurtTimer = 0.45;
    this.lastDamage = game ? game.time : this.lastDamage + 1;
    if (from) this.lastAttacker = from;
    if (this.health <= 0) {
      this.dead = true;
      this.deathTimer = 0;
      if (this.veh) this.veh.driver = null;
    }
    return left;
  }

  heal(amount) {
    this.health = Math.min(PLAYER.maxHealth, this.health + amount);
  }

  addArmour(amount) {
    this.armour = Math.min(PLAYER.maxArmour, this.armour + amount);
  }

  giveWeapon(id, ammo = 0) {
    this.weapons[id] = true;
    this.ammo[id] = Math.min((this.ammo[id] ?? 0) + ammo, WEAPONS[id].ammo * 4);
    this.weapon = id;
  }

  addMoney(amount, game = null) {
    this.money += amount;
    if (game && amount !== 0) {
      game.effects.floatText(
        this.x, this.y - 1.6,
        `${amount >= 0 ? '+' : '-'}$${Math.abs(Math.round(amount))}`,
        amount >= 0 ? '#9df0b4' : '#ff8f9c',
        1.5,
      );
    }
  }

  /** What the car the player is sitting in can do, for the HUD. */
  carName() {
    if (!this.veh) return '';
    return this.veh.name;
  }

  carSpeedKmh() {
    if (!this.veh) return 0;
    return Math.round(this.veh.speed * 3.6);
  }
}

export { CAR_TYPES };
