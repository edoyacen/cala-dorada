/**
 * camera.js — the camera that sits behind Rafa's shoulder: it leans toward
 * where he is going, pulls back as the car gathers speed, closes in on foot,
 * takes the shake of an explosion and never shows the void past the map.
 */
import { clamp, lerp } from './random.js';
import { WORLD_W, WORLD_H } from './config.js';

export class Camera {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.x = 900;
    this.y = 900;
    this.zoom = width / 118;
    this.targetZoom = this.zoom;
    this.shakeX = 0;
    this.shakeY = 0;
    this.lead = { x: 0, y: 0 };
    this.bounds = { x0: 0, y0: 0, x1: 0, y1: 0 };
    this.cinematic = null;
    this.angle = 0;
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
  }

  /** Follow a target (the player, or a point) for one frame. */
  update(dt, target, effects, opts = {}) {
    const speed = target.speed ?? 0;
    const inCar = Boolean(target.veh);
    // The lens: wide at speed in a car, tight on foot, a touch wider in a chase.
    let fov = inCar ? lerp(128, 176, clamp(speed / 44, 0, 1)) : 104;
    if (opts.chase) fov *= 1.06;
    this.targetZoom = (this.width / fov) * (opts.zoom ?? 1);
    this.zoom = lerp(this.zoom, this.targetZoom, 1 - Math.pow(0.0015, dt));
    // Lead the camera toward the direction of travel, less so on foot.
    const vx = target.vx ?? 0;
    const vy = target.vy ?? 0;
    const leadAmount = inCar ? 0.55 : 0.22;
    const lx = clamp(vx * leadAmount, -26, 26);
    const ly = clamp(vy * leadAmount, -26, 26);
    this.lead.x = lerp(this.lead.x, lx, 1 - Math.pow(0.02, dt));
    this.lead.y = lerp(this.lead.y, ly, 1 - Math.pow(0.02, dt));
    const tx = target.x + this.lead.x;
    const ty = target.y + this.lead.y;
    this.x = lerp(this.x, tx, 1 - Math.pow(0.0008, dt));
    this.y = lerp(this.y, ty, 1 - Math.pow(0.0008, dt));
    // Show a little of the world beyond the last street, never the void.
    const halfW = this.width / this.zoom / 2;
    const halfH = this.height / this.zoom / 2;
    const minX = Math.min(halfW, WORLD_W / 2);
    const maxX = Math.max(WORLD_W - halfW, WORLD_W / 2);
    const minY = Math.min(halfH, WORLD_H / 2);
    const maxY = Math.max(WORLD_H - halfH, WORLD_H / 2);
    this.x = clamp(this.x, minX, maxX);
    this.y = clamp(this.y, minY, maxY);
    if (effects) {
      this.shakeX = effects.shakeX;
      this.shakeY = effects.shakeY;
    }
    this.bounds.x0 = this.x - halfW;
    this.bounds.x1 = this.x + halfW;
    this.bounds.y0 = this.y - halfH;
    this.bounds.y1 = this.y + halfH;
  }

  /** A free-flying camera for menus and the staged screenshots. */
  setCinematic(x, y, zoom, angle = 0) {
    this.x = x;
    this.y = y;
    this.zoom = zoom;
    this.targetZoom = zoom;
    this.lead.x = 0;
    this.lead.y = 0;
    this.angle = angle;
    this.shakeX = 0;
    this.shakeY = 0;
    this.bounds.x0 = x - this.width / zoom / 2;
    this.bounds.x1 = x + this.width / zoom / 2;
    this.bounds.y0 = y - this.height / zoom / 2;
    this.bounds.y1 = y + this.height / zoom / 2;
  }

  /** Push the world transform onto a context. */
  apply(ctx) {
    ctx.translate(this.width / 2 + this.shakeX, this.height / 2 + this.shakeY);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.x, -this.y);
  }

  worldToScreen(x, y) {
    return {
      x: (x - this.x) * this.zoom + this.width / 2 + this.shakeX,
      y: (y - this.y) * this.zoom + this.height / 2 + this.shakeY,
    };
  }

  screenToWorld(x, y) {
    return {
      x: (x - this.width / 2 - this.shakeX) / this.zoom + this.x,
      y: (y - this.height / 2 - this.shakeY) / this.zoom + this.y,
    };
  }

  get view() {
    return this.bounds;
  }
}
