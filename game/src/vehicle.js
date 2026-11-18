/**
 * vehicle.js — the cars. A car is one entity whichever hand is on the wheel:
 * the player's, a civilian's, a patrol car's or one left at the kerb. The
 * player's car is driven by arcade bicycle physics (engine, grip, drift,
 * handbrake, impacts); everything else is moved along its lane by roads.js and
 * reads this file for its size, damage and lights.
 */
import { CAR_TYPES, VEHICLE_COLOURS, POLICE_COLOUR } from './config.js';
import { clamp, approach, makeRng } from './random.js';

let nextVehicleId = 1;

export class Vehicle {
  constructor(opts) {
    const spec = CAR_TYPES[opts.type] ?? CAR_TYPES.sedan;
    this.id = nextVehicleId++;
    this.type = opts.type ?? 'sedan';
    this.spec = spec;
    this.name = spec.name;
    this.len = spec.len;
    this.wid = spec.wid;
    this.x = opts.x ?? 0;
    this.y = opts.y ?? 0;
    this.heading = opts.h ?? 0;
    this.vx = 0;
    this.vy = 0;
    this.speed = 0;
    this.steer = 0;
    this.throttle = 0;
    this.braking = 0;
    this.wheel = 0;
    this.colour = opts.colour ?? VEHICLE_COLOURS[0];
    this.police = this.type === 'police';
    this.driver = opts.driver ?? null;       // 'player' | 'ai' | 'police' | null
    this.passengers = opts.passengers ?? 0;
    this.maxHp = spec.hp;
    this.hp = opts.hp ?? spec.hp;
    this.wrecked = false;
    this.locked = Boolean(opts.locked);
    this.siren = 0;
    this.lights = false;
    this.alarm = 0;
    this.wanted = 0;                          // a patrol car's own star level
    this.lane = null;                         // its RoadDriver while an AI drives it
    this.skid = 0;
    this.rumble = 0;
    this.lastImpact = 0;
    this.driverKind = opts.driverKind ?? (this.police ? 'police' : 'civilian');
    this.seed = opts.seed ?? Math.floor(Math.random() * 1e6);
    this.rng = makeRng(this.seed);
    this.driverName = opts.driverName ?? null;
    // Trim and a rear wing are what make a showroom car read as a show car:
    // the renderer paints a stripe and a wing from these two flags.
    this.spoiler = Boolean(opts.spoiler ?? (this.type === 'sport' || this.type === 'muscle'));
    this.stripe = opts.stripe ?? null;
    this.hazard = 0;         // seconds left on the hazard flashers
    this.hero = Boolean(opts.hero);
  }

  get damage() {
    return 1 - this.hp / this.maxHp;
  }

  get forward() {
    return { x: Math.cos(this.heading), y: Math.sin(this.heading) };
  }

  /** A point `ahead` metres in front of the car's centre. */
  nose(ahead = this.len / 2) {
    return { x: this.x + Math.cos(this.heading) * ahead, y: this.y + Math.sin(this.heading) * ahead };
  }

  /**
   * Drive one step with the given controls at `dt`. Buildings and kerbs are
   * resolved through the city's rectangle buckets, and every impact that costs
   * the car real speed is returned for the caller to make a noise about.
   */
  step(dt, controls, city) {
    const spec = this.spec;
    this.hazard = Math.max(0, this.hazard - dt);
    this.throttle = controls.throttle ?? 0;
    this.steer = approach(this.steer, controls.steer ?? 0, dt * 5.2);
    const handbrake = Boolean(controls.handbrake);
    const grounded = city.surface(this.x, this.y) !== 'water';
    const grip = spec.grip * (handbrake ? 0.28 : 1) * (grounded ? 1 : 0.15);

    let fx = Math.cos(this.heading);
    let fy = Math.sin(this.heading);
    let vf = this.vx * fx + this.vy * fy;
    let vl = -this.vx * fy + this.vy * fx;

    const top = spec.top * (1 - this.damage * 0.35) * (grounded ? 1 : 0.2);
    if (this.throttle > 0) vf += spec.power * this.throttle * dt * (vf < 0 ? 1.6 : 1);
    else if (this.throttle < 0) vf += spec.power * 1.4 * this.throttle * dt * (vf > 0 ? 1.2 : 0.7);
    // Rolling resistance and drag.
    vf -= vf * 0.55 * dt + Math.sign(vf) * Math.min(Math.abs(vf), 1.6 * dt);
    if (handbrake) vf = approach(vf, 0, spec.power * 1.5 * dt);
    vf = clamp(vf, -spec.top * 0.32, top);
    vl *= Math.max(0, 1 - grip * dt);

    // Steering turns the heading in proportion to how fast the car rolls.
    const roll = clamp(Math.abs(vf) / 10, 0, 1.25);
    const turn = this.steer * roll * (1.9 - Math.min(1, Math.abs(vf) / spec.top) * 0.55);
    this.heading += turn * dt * Math.sign(vf || 1);
    this.braking = approach(this.braking, this.throttle < 0 ? 1 : 0, dt * 6);

    fx = Math.cos(this.heading);
    fy = Math.sin(this.heading);
    this.vx = fx * vf - fy * vl;
    this.vy = fy * vf + fx * vl;
    this.speed = Math.hypot(this.vx, this.vy);
    this.wheel += vf * dt * 2.4;

    // Skid marks when the tyres are loaded sideways.
    this.skid = Math.max(0, Math.abs(vl) - 2.2) + (handbrake && this.speed > 8 ? 1.6 : 0);

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Two collision circles, one at each axle, so a long car cannot clip a corner.
    const impact = this._resolve(city, dt);
    return impact;
  }

  _resolve(city, dt) {
    const half = this.len * 0.31;
    let worst = 0;
    let nx = 0;
    let ny = 0;
    for (const sign of [1, -1]) {
      const px = this.x + Math.cos(this.heading) * half * sign;
      const py = this.y + Math.sin(this.heading) * half * sign;
      const body = { x: px, y: py };
      const hit = city.resolveCircle(body, this.wid * 0.52);
      if (hit) {
        const dx = body.x - px;
        const dy = body.y - py;
        this.x += dx;
        this.y += dy;
        const into = -(this.vx * hit.nx + this.vy * hit.ny);
        if (into > worst) {
          worst = into;
          nx = hit.nx;
          ny = hit.ny;
        }
      }
    }
    if (worst > 0.5) {
      // Kill the velocity into the wall, keep what slides along it.
      const along = this.vx * nx + this.vy * ny;
      this.vx -= nx * along * 1.15;
      this.vy -= ny * along * 1.15;
      this.vx *= 0.82;
      this.vy *= 0.82;
      const damage = Math.max(0, worst - 4) * 1.9;
      if (damage > 0) this.hp = Math.max(0, this.hp - damage);
      this.rumble = Math.min(1, worst / 22);
      this.lastImpact = performance.now();
      return { speed: worst, nx, ny };
    }
    return null;
  }

  /** Take a hit from a bullet, a fist or another bumper. */
  hurt(amount) {
    if (this.wrecked) return false;
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0) this.wrecked = true;
    return this.wrecked;
  }

  /** Place the car on a lane and hand it to an AI driver. */
  follow(driver) {
    this.lane = driver;
    this.driver = this.police ? 'police' : 'ai';
  }

  /** Move along the lane polyline for one step; used by every non-player car. */
  stepLane(dt, blocked = 0) {
    if (!this.lane) return;
    this.hazard = Math.max(0, this.hazard - dt);
    this.lane.maxSpeed = this.spec.top * (1 - this.damage * 0.4);
    this.lane.update(dt, blocked);
    const prev = this.heading;
    this.x = this.lane.x;
    this.y = this.lane.y;
    this.heading = this.lane.heading;
    this.speed = this.lane.speed;
    this.braking = this.lane.braking ?? 0;
    this.vx = Math.cos(this.heading) * this.speed;
    this.vy = Math.sin(this.heading) * this.speed;
    this.wheel += this.speed * dt * 2.4;
    let d = (this.heading - prev) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    this.skid = Math.max(0, Math.abs(d) / Math.max(dt, 1e-3) - 4) * 0.25;
    this.lights = true;
  }

  /** The rectangle the renderer and the collision code use, in car space. */
  corners() {
    const c = Math.cos(this.heading);
    const s = Math.sin(this.heading);
    const l = this.len / 2;
    const w = this.wid / 2;
    return [
      { x: this.x + c * l - s * w, y: this.y + s * l + c * w },
      { x: this.x + c * l + s * w, y: this.y + s * l - c * w },
      { x: this.x - c * l + s * w, y: this.y - s * l - c * w },
      { x: this.x - c * l - s * w, y: this.y - s * l + c * w },
    ];
  }
}

/** A parked car at a kerb or in a lot, ready to be stolen. */
export function parkedVehicle(spot) {
  return new Vehicle({
    type: spot.type,
    x: spot.x,
    y: spot.y,
    h: spot.h,
    colour: spot.colour,
    locked: spot.locked ?? false,
    stripe: spot.stripe ?? null,
    seed: Math.floor(spot.x * 13 + spot.y * 7),
  });
}

/** A patrol car, painted white with the coat of arms of the city on the door. */
export function policeCar(x, y, h) {
  return new Vehicle({ type: 'police', x, y, h, colour: POLICE_COLOUR, driver: 'police', driverKind: 'police' });
}
