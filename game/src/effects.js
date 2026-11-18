/**
 * effects.js — the small theatre of the street: tyre smoke, sparks, glass,
 * blood, muzzle flashes, burning wrecks, skid marks, shell casings, cash notes
 * rising off a body and the shake of a bad crash. Every effect is drawn from
 * primitives, so the game needs no image files.
 */
import { clamp } from './random.js';

const MAX_DECALS = 520;
const MAX_PARTICLES = 900;

export class Effects {
  constructor() {
    this.particles = [];
    this.decals = [];
    this.texts = [];
    this.shake = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.flash = 0;
    this.flashColour = '#fff';
    this.slowmo = 1;
  }

  /** A single particle; `kind` picks its drawing and its physics. */
  spawn(kind, x, y, opts = {}) {
    if (this.particles.length > MAX_PARTICLES) this.particles.shift();
    const p = {
      kind,
      x, y,
      vx: opts.vx ?? 0,
      vy: opts.vy ?? 0,
      life: opts.life ?? 0.6,
      maxLife: opts.life ?? 0.6,
      size: opts.size ?? 0.6,
      grow: opts.grow ?? 0,
      colour: opts.colour ?? '#fff',
      drag: opts.drag ?? 1.8,
      gravity: opts.gravity ?? 0,
      spin: opts.spin ?? 0,
      angle: opts.angle ?? 0,
      alpha: opts.alpha ?? 1,
    };
    this.particles.push(p);
    return p;
  }

  /** A puff of tyre smoke behind a sliding car. */
  tyreSmoke(x, y, strength = 1) {
    for (let n = 0; n < 2; n += 1) {
      this.spawn('smoke', x, y, {
        vx: (Math.random() - 0.5) * 3.2,
        vy: (Math.random() - 0.5) * 3.2,
        life: 0.55 + Math.random() * 0.5,
        size: 1.1 + Math.random() * 1.2,
        grow: 3.4 * strength,
        colour: 'rgba(226,220,208,0.5)',
      });
    }
  }

  /** Gravel and dust from a wheel on the sand or the pavement. */
  dust(x, y, colour = '#d8c9a8') {
    this.spawn('smoke', x, y, {
      vx: (Math.random() - 0.5) * 2,
      vy: (Math.random() - 0.5) * 2,
      life: 0.7,
      size: 0.9,
      grow: 2.6,
      colour,
      alpha: 0.5,
    });
  }

  sparks(x, y, count = 8, colour = '#ffd27a') {
    for (let n = 0; n < count; n += 1) {
      const a = Math.random() * Math.PI * 2;
      const s = 5 + Math.random() * 14;
      this.spawn('spark', x, y, {
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.25 + Math.random() * 0.35,
        size: 0.16 + Math.random() * 0.16,
        colour,
        drag: 3.2,
      });
    }
  }

  /** Sand or dry earth thrown up by a wheel that has left the asphalt. */
  spray(x, y, heading, strength = 1, colour = 'rgba(226,204,164,0.65)') {
    for (let n = 0; n < 3; n += 1) {
      const a = heading + Math.PI + (Math.random() - 0.5) * 1.1;
      const s = 3 + Math.random() * 7 * strength;
      this.spawn('smoke', x, y, {
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.55 + Math.random() * 0.5,
        size: 0.8 + Math.random() * 1.1,
        grow: 2.8 * strength,
        colour,
        alpha: 0.75,
      });
    }
    if (this.decals.length < MAX_DECALS && Math.random() < 0.5) {
      this.decals.push({ kind: 'sand', x, y, r: 0.7 + Math.random() * 0.8, seed: Math.random(), angle: heading, w: 1.4 });
    }
  }

  /** Bits of bumper, glass and trim left on the road by a hard hit. */
  debris(x, y, heading = 0, count = 5) {
    for (let n = 0; n < count; n += 1) {
      const a = heading + (Math.random() - 0.5) * 2.4;
      const s = 2 + Math.random() * 7;
      this.spawn('debris', x, y, {
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 1.1 + Math.random() * 0.9,
        size: 0.22 + Math.random() * 0.26,
        colour: Math.random() < 0.5 ? '#2a2a30' : '#d8cfae',
        drag: 0.9,
        spin: (Math.random() - 0.5) * 16,
        angle: Math.random() * 6.28,
      });
    }
  }

  /** A fat column of dark smoke, for a wreck the chase left behind. */
  smokeColumn(x, y, seconds = 4) {
    const puffs = Math.round(seconds * 3);
    for (let n = 0; n < puffs; n += 1) {
      this.spawn('smoke', x + (Math.random() - 0.5) * 1.4, y + (Math.random() - 0.5) * 1.4, {
        vx: (Math.random() - 0.5) * 1.2,
        vy: -2.2 - Math.random() * 1.6,
        life: 2.2 + Math.random() * 1.8,
        size: 1.6 + Math.random() * 1.4,
        grow: 2.2,
        colour: 'rgba(38,34,36,0.55)',
        alpha: 0.85,
      });
    }
    this.spawn('fire', x, y, { life: 1.8, size: 1.8, grow: 1.4, colour: '#ff9a3c' });
  }

  glass(x, y, count = 10, heading = 0) {
    for (let n = 0; n < count; n += 1) {
      const a = heading + (Math.random() - 0.5) * 1.7;
      const s = 3 + Math.random() * 10;
      this.spawn('shard', x, y, {
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.5 + Math.random() * 0.5,
        size: 0.2 + Math.random() * 0.3,
        colour: '#dff2f4',
        drag: 0.6,
        spin: (Math.random() - 0.5) * 14,
        angle: Math.random() * 6.28,
      });
    }
  }

  blood(x, y, heading = 0, count = 7) {
    for (let n = 0; n < count; n += 1) {
      const a = heading + (Math.random() - 0.5) * 1.5;
      const s = 2 + Math.random() * 6;
      this.spawn('blood', x, y, {
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.45 + Math.random() * 0.4,
        size: 0.22 + Math.random() * 0.28,
        colour: '#8d1526',
        drag: 2.4,
      });
    }
    if (this.decals.length < MAX_DECALS) {
      this.decals.push({ kind: 'blood', x, y, r: 0.7 + Math.random() * 0.9, seed: Math.random() });
    }
  }

  muzzle(x, y, heading) {
    this.spawn('flash', x, y, {
      vx: Math.cos(heading) * 2,
      vy: Math.sin(heading) * 2,
      life: 0.07,
      size: 1.15,
      colour: '#fff2c0',
    });
    for (let n = 0; n < 3; n += 1) {
      this.spawn('smoke', x + Math.cos(heading) * 0.7, y + Math.sin(heading) * 0.7, {
        vx: Math.cos(heading) * (2 + Math.random() * 3) + (Math.random() - 0.5),
        vy: Math.sin(heading) * (2 + Math.random() * 3) + (Math.random() - 0.5),
        life: 0.5,
        size: 0.4,
        grow: 1.8,
        colour: 'rgba(210,205,196,0.32)',
      });
    }
  }

  shell(x, y, heading) {
    this.spawn('shell', x, y, {
      vx: Math.cos(heading + 1.7) * 3,
      vy: Math.sin(heading + 1.7) * 3,
      life: 1.4,
      size: 0.13,
      colour: '#d8b56a',
      drag: 2.2,
      spin: 12,
    });
  }

  explosion(x, y, scale = 1) {
    this.spawn('fire', x, y, { life: 0.5, size: 3.4 * scale, grow: 6 * scale, colour: '#ffb347' });
    this.spawn('fire', x, y, { life: 0.3, size: 2.2 * scale, grow: 3 * scale, colour: '#fff3b0' });
    for (let n = 0; n < 16; n += 1) {
      const a = Math.random() * Math.PI * 2;
      const s = 6 + Math.random() * 22;
      this.spawn('spark', x, y, {
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.4 + Math.random() * 0.6,
        size: 0.22 + Math.random() * 0.2,
        colour: '#ffd27a',
        drag: 1.2,
      });
    }
    for (let n = 0; n < 10; n += 1) {
      this.spawn('smoke', x + (Math.random() - 0.5) * 3, y + (Math.random() - 0.5) * 3, {
        vx: (Math.random() - 0.5) * 6,
        vy: (Math.random() - 0.5) * 6 - 1,
        life: 1.6 + Math.random(),
        size: 2 + Math.random() * 2,
        grow: 5,
        colour: 'rgba(48,44,44,0.55)',
      });
    }
    this.shake = Math.max(this.shake, 0.9 * scale);
    this.flash = Math.max(this.flash, 0.35);
    this.flashColour = '#ffd9a0';
    if (this.decals.length < MAX_DECALS) this.decals.push({ kind: 'scorch', x, y, r: 2.6 * scale, seed: Math.random() });
  }

  /** A wreck left burning: called every few frames while it glows. */
  fire(x, y, dt) {
    if (Math.random() < dt * 18) {
      this.spawn('fire', x + (Math.random() - 0.5) * 1.2, y + (Math.random() - 0.5) * 1.2, {
        life: 0.4 + Math.random() * 0.3,
        size: 1.0 + Math.random(),
        grow: 2.6,
        vy: -1.4,
        colour: Math.random() < 0.5 ? '#ffb347' : '#ff7a3c',
      });
    }
  }

  /** A number or a word rising off the world, in world space. */
  floatText(x, y, text, colour = '#ffd166', size = 1.3) {
    this.texts.push({ x, y, text, life: 1.6, maxLife: 1.6, colour, size });
  }

  decal(kind, x, y, opts = {}) {
    if (this.decals.length > MAX_DECALS) this.decals.shift();
    this.decals.push({ kind, x, y, r: opts.r ?? 0.4, seed: Math.random(), angle: opts.angle ?? 0, w: opts.w ?? 1 });
  }

  kick(amount) {
    this.shake = Math.min(1.6, this.shake + amount);
  }

  update(dt) {
    // Screen shake decays and is resampled every frame.
    this.shake = Math.max(0, this.shake - dt * 2.4);
    const amp = this.shake * this.shake * 14;
    this.shakeX = (Math.random() - 0.5) * amp;
    this.shakeY = (Math.random() - 0.5) * amp;
    this.flash = Math.max(0, this.flash - dt * 3.4);

    const parts = this.particles;
    for (let n = parts.length - 1; n >= 0; n -= 1) {
      const p = parts[n];
      p.life -= dt;
      if (p.life <= 0) {
        parts.splice(n, 1);
        continue;
      }
      const damp = Math.max(0, 1 - p.drag * dt);
      p.vx *= damp;
      p.vy *= damp;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size += p.grow * dt;
      p.angle += p.spin * dt;
    }
    for (let n = this.texts.length - 1; n >= 0; n -= 1) {
      const t = this.texts[n];
      t.life -= dt;
      t.y -= dt * 2.6;
      if (t.life <= 0) this.texts.splice(n, 1);
    }
  }

  /** Decals sit on the ground, under everything that moves. */
  drawGround(ctx, view) {
    for (const d of this.decals) {
      if (d.x < view.x0 - 8 || d.x > view.x1 + 8 || d.y < view.y0 - 8 || d.y > view.y1 + 8) continue;
      ctx.save();
      ctx.translate(d.x, d.y);
      if (d.kind === 'skid') {
        ctx.rotate(d.angle);
        ctx.fillStyle = 'rgba(24,22,24,0.30)';
        ctx.fillRect(-d.w / 2, -d.r, d.w, d.r * 2);
      } else if (d.kind === 'blood') {
        ctx.fillStyle = 'rgba(92,16,28,0.42)';
        ctx.beginPath();
        ctx.ellipse(0, 0, d.r * 1.6, d.r, d.seed * 3, 0, Math.PI * 2);
        ctx.fill();
      } else if (d.kind === 'scorch') {
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, d.r);
        g.addColorStop(0, 'rgba(16,14,14,0.55)');
        g.addColorStop(0.7, 'rgba(24,20,18,0.32)');
        g.addColorStop(1, 'rgba(24,20,18,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, d.r, 0, Math.PI * 2);
        ctx.fill();
      } else if (d.kind === 'shell') {
        ctx.fillStyle = 'rgba(216,181,106,0.85)';
        ctx.fillRect(-0.08, -0.16, 0.16, 0.32);
      } else if (d.kind === 'sand') {
        ctx.rotate(d.angle);
        ctx.fillStyle = 'rgba(190,158,110,0.28)';
        ctx.fillRect(-d.w / 2, -d.r, d.w, d.r * 2);
      }
      ctx.restore();
    }
  }

  /** Particles, flashes and world-space text, drawn above the cars. */
  drawAir(ctx, view) {
    for (const p of this.particles) {
      if (p.x < view.x0 - 8 || p.x > view.x1 + 8 || p.y < view.y0 - 8 || p.y > view.y1 + 8) continue;
      const a = clamp(p.life / p.maxLife, 0, 1) * p.alpha;
      ctx.save();
      ctx.globalAlpha = a;
      if (p.kind === 'smoke') {
        ctx.fillStyle = p.colour;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'spark') {
        ctx.strokeStyle = p.colour;
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
        ctx.stroke();
      } else if (p.kind === 'blood') {
        ctx.fillStyle = p.colour;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'shard') {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.colour;
        ctx.fillRect(-p.size * 0.5, -p.size * 0.2, p.size, p.size * 0.4);
      } else if (p.kind === 'debris') {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.colour;
        ctx.fillRect(-p.size * 0.5, -p.size * 0.35, p.size, p.size * 0.7);
      } else if (p.kind === 'shell') {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.colour;
        ctx.fillRect(-0.05, -0.14, 0.1, 0.28);
      } else if (p.kind === 'flash') {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2.4);
        g.addColorStop(0, 'rgba(255,248,214,0.95)');
        g.addColorStop(0.35, 'rgba(255,196,90,0.65)');
        g.addColorStop(1, 'rgba(255,160,60,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 2.4, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'fire') {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, Math.max(0.2, p.size));
        g.addColorStop(0, p.colour);
        g.addColorStop(1, 'rgba(255,80,20,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.2, p.size), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'leaf' || p.kind === 'note') {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.colour;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      }
      ctx.restore();
    }
    for (const t of this.texts) {
      const a = clamp(t.life / t.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = `800 ${t.size}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = Math.max(0.12, t.size * 0.12);
      ctx.strokeStyle = 'rgba(8,8,12,0.75)';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.colour;
      ctx.fillText(t.text, t.x, t.y);
      ctx.restore();
    }
  }
}

export { MAX_DECALS };
