/**
 * render.js — the painter of Cala Dorada: sea and sand, the street grid with
 * its crosswalks and lane paint, buildings lifted into a warm two-and-a-half
 * dimension, palms and neon, then the cars, the people, the shooting and the
 * light of whatever hour it is.
 */
import {
  TILE, ROAD, SIDEWALK, BLOCKS, CITY, BEACH, WORLD_W, WORLD_H, C, ui, display, mono,
} from './config.js';
import { clamp, lerp } from './random.js';
import { onRoad } from './city.js';

const ROOF_LIFT = -0.30;   // metres of fake height the roof slides up per metre
const ROOF_SLIDE = -0.14;

const SIGN_WORDS = ['LUME', 'SOL', 'MAREA', 'CALA', 'AURORA', 'PALMA', 'TAPAS', 'HOTEL'];

function rr(ctx, x, y, w, h, r) {
  const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** The warm tint and darkness of an hour, 0..24. */
export function lightOfDay(hour) {
  // Tints are painted with a multiply blend, so they stay bright: the alpha is
  // what grades the frame, never a dark colour that would crush the palette.
  const mix = (a, b, t, alpha) => `rgba(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))},${alpha})`;
  const NIGHT = [150, 170, 226];
  const GOLD = [255, 214, 170];
  const DAY = [255, 250, 242];
  if (hour < 5.2) return { tint: 'rgba(34,44,86,0.66)', sun: 0.06, warm: 0.1, name: 'night' };
  if (hour < 7.6) {
    const t = (hour - 5.2) / 2.4;
    return { tint: mix(NIGHT, GOLD, t, lerp(0.46, 0.16, t)), sun: lerp(0.2, 0.95, t), warm: lerp(0.4, 0.12, t), name: 'sunrise' };
  }
  if (hour < 16.6) return { tint: mix(DAY, DAY, 0, 0.1), sun: 1, warm: 0.05, name: 'day' };
  if (hour < 20) {
    const t = (hour - 16.6) / 3.4;
    return { tint: mix(GOLD, [214, 176, 210], t, lerp(0.16, 0.4, t)), sun: lerp(1, 0.3, t), warm: lerp(0.12, 0.5, t), name: 'dusk' };
  }
  const t = clamp((hour - 20) / 3, 0, 1);
  return { tint: `rgba(${Math.round(lerp(46, 30, t))},${Math.round(lerp(56, 42, t))},${Math.round(lerp(104, 88, t))},${lerp(0.56, 0.68, t)})`, sun: 0.08, warm: 0.15, name: 'night' };
}

export class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.game = game;
    this.rain = [];
    for (let n = 0; n < 220; n += 1) {
      this.rain.push({ x: Math.random(), y: Math.random(), len: 10 + Math.random() * 22, v: 0.55 + Math.random() * 0.7 });
    }
  }

  /** Fit the backing store to the window, at most twice the CSS size. */
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(640, Math.round(window.innerWidth * dpr));
    const h = Math.max(360, Math.round(window.innerHeight * dpr));
    this.canvas.width = w;
    this.canvas.height = h;
    this.game.camera.resize(w, h);
  }

  draw() {
    const g = this.game;
    const ctx = this.ctx;
    const cam = g.camera;
    const view = cam.view;
    const light = lightOfDay(g.clock.hour);
    ctx.save();
    ctx.fillStyle = '#0b1018';
    ctx.fillRect(0, 0, cam.width, cam.height);
    cam.apply(ctx);
    this.drawWater(ctx, cam, g.time, light);
    this.drawSand(ctx, view, g.time, light);
    this.drawGround(ctx, view, light);
    g.effects.drawGround(ctx, view);
    this.drawLandmarks(ctx, view, light, g.time);
    this.drawWorldMarkers(ctx, view, g);
    this.drawBuildingShadows(ctx, view);
    this.drawSorted(ctx, view, light, g.time);
    g.effects.drawAir(ctx, view);
    g.combat.draw(ctx, view);
    this.drawAtmosphere(ctx, cam, view, light, g.time);
    ctx.restore();
    this.drawPost(ctx, cam, light, g);
  }

  // ------------------------------------------------------------- the ground
  drawWater(ctx, cam, time, light) {
    const view = cam.view;
    if (view.x1 < CITY) return;
    const edge = CITY + BEACH;
    const x0 = Math.max(edge, view.x0 - 20);
    const x1 = view.x1 + 40;
    // Shallow turquoise at the sand bar, deep blue out past the reef.
    const grad = ctx.createLinearGradient(edge - 8, 0, edge + 120, 0);
    grad.addColorStop(0, '#8fe0cf');
    grad.addColorStop(0.08, '#4cc4bc');
    grad.addColorStop(0.22, '#2ba6ac');
    grad.addColorStop(0.45, C.water);
    grad.addColorStop(0.7, C.waterDeep);
    grad.addColorStop(1, '#124c66');
    ctx.fillStyle = grad;
    ctx.fillRect(x0, view.y0 - 40, Math.max(0, x1 - x0), (view.y1 - view.y0) + 80);
    // Swell lines rolling in toward the sand.
    for (let band = 0; band < 3; band += 1) {
      ctx.strokeStyle = `rgba(228,250,246,${0.16 - band * 0.04})`;
      ctx.lineWidth = 0.9 + band * 0.5;
      const spacing = 30 + band * 16;
      const speed = 0.35 + band * 0.12;
      for (let y = Math.floor((view.y0 - 30) / spacing) * spacing; y < view.y1 + 30; y += spacing) {
        const phase = Math.sin(y * 0.05 + time * speed + band) * 7;
        ctx.beginPath();
        ctx.moveTo(x0 + 12 + phase + band * 22, y);
        ctx.bezierCurveTo(x0 + 90 + phase, y - 6, x0 + 200, y + 5, x1, y - 2);
        ctx.stroke();
      }
    }
    // Whitecaps far out, and the sun's glitter on the near water.
    for (let n = 0; n < 90; n += 1) {
      const px = edge + 40 + ((n * 137) % 900);
      const py = ((n * 89) % Math.max(1, Math.floor(WORLD_H + 120))) - 60;
      if (px < view.x0 - 10 || px > view.x1 + 10 || py < view.y0 - 10 || py > view.y1 + 10) continue;
      const shimmer = 0.25 + Math.sin(time * 2 + n) * 0.2;
      ctx.fillStyle = `rgba(255,255,246,${clamp(shimmer, 0, 0.5)})`;
      ctx.fillRect(px, py, 2.4, 0.7);
    }
    // Foam where the sea meets the sand, two wobbling layers.
    for (let layer = 0; layer < 2; layer += 1) {
      ctx.strokeStyle = layer === 0 ? 'rgba(238,255,250,0.75)' : 'rgba(238,255,250,0.3)';
      ctx.lineWidth = layer === 0 ? 1.6 : 3.4;
      ctx.beginPath();
      for (let y = view.y0 - 10; y < view.y1 + 10; y += 7) {
        const wob = Math.sin(y * 0.085 + time * 1.5 + layer * 0.9) * (2.4 + layer * 1.6);
        const px = edge + wob - layer * 2.5;
        if (y === view.y0 - 10) ctx.moveTo(px, y);
        else ctx.lineTo(px, y);
      }
      ctx.stroke();
    }
    void light;
  }

  drawSand(ctx, view, time, light) {
    const x0 = CITY - 4;
    const x1 = CITY + BEACH + 4;
    if (view.x1 < x0 || view.x0 > x1 + 40) {
      // still draw the southern beach strip
    }
    ctx.fillStyle = C.sand;
    ctx.fillRect(Math.max(x0, view.x0 - 40), Math.min(view.y0 - 40, 0), Math.max(0, Math.min(x1, view.x1 + 40) - Math.max(x0, view.x0 - 40)), WORLD_H + 80);
    // The beach along the south edge of the city, too.
    ctx.fillRect(view.x0 - 40, CITY + BEACH * 0.35, (view.x1 - view.x0) + 80, WORLD_H - CITY);
    // Dry ripples in the sand.
    ctx.strokeStyle = 'rgba(198,170,120,0.35)';
    ctx.lineWidth = 0.4;
    for (let y = Math.max(0, view.y0); y < Math.min(WORLD_H, view.y1); y += 11) {
      if (y < CITY + BEACH * 0.35) continue;
      ctx.beginPath();
      ctx.moveTo(view.x0, y);
      ctx.quadraticCurveTo((view.x0 + view.x1) / 2, y + 3, view.x1, y);
      ctx.stroke();
    }
    // Wet sand at the waterline.
    const edge = CITY + BEACH;
    const grad = ctx.createLinearGradient(edge - 26, 0, edge, 0);
    grad.addColorStop(0, 'rgba(196,166,116,0)');
    grad.addColorStop(1, 'rgba(178,150,104,0.55)');
    ctx.fillStyle = grad;
    ctx.fillRect(edge - 26, Math.max(0, view.y0), 26, view.y1 - view.y0);
    // Footprints and beach towels are props; the sun glitter is here.
    const glitter = 0.06 + Math.sin(time * 0.7) * 0.02;
    ctx.fillStyle = `rgba(255,244,214,${glitter})`;
    ctx.fillRect(edge - 120, Math.max(0, view.y0), 110, view.y1 - view.y0);
    void light;
  }

  drawGround(ctx, view, light) {
    const city = this.game.city;
    // Pavement base for the whole grid.
    const x0 = Math.max(0, view.x0);
    const y0 = Math.max(0, view.y0);
    const x1 = Math.min(CITY, view.x1);
    const y1 = Math.min(WORLD_H, view.y1);
    if (x1 > x0 && y1 > y0) {
      ctx.fillStyle = C.sidewalk;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
    // Blocks: their own surface, then a kerb.
    const i0 = clamp(Math.floor(view.x0 / TILE), 0, BLOCKS - 1);
    const i1 = clamp(Math.floor(view.x1 / TILE), 0, BLOCKS - 1);
    const j0 = clamp(Math.floor(view.y0 / TILE), 0, BLOCKS - 1);
    const j1 = clamp(Math.floor(view.y1 / TILE), 0, BLOCKS - 1);
    for (let j = j0; j <= j1; j += 1) {
      for (let i = i0; i <= i1; i += 1) {
        const block = city.blocks[j * BLOCKS + i];
        if (!block) continue;
        const bx = block.x0 - SIDEWALK * 0.5;
        const by = block.y0 - SIDEWALK * 0.5;
        const bw = block.w + SIDEWALK;
        const bh = block.h + SIDEWALK;
        if (block.kind === 'park') {
          ctx.fillStyle = C.grass;
          ctx.fillRect(bx, by, bw, bh);
          ctx.fillStyle = 'rgba(255,255,255,0.05)';
          for (let k = 0; k < 4; k += 1) {
            ctx.fillRect(bx + 6, by + 10 + k * (bh / 4), bw - 12, 2.2);
          }
        } else if (block.kind === 'lot') {
          ctx.fillStyle = '#434148';
          ctx.fillRect(bx, by, bw, bh);
          ctx.strokeStyle = 'rgba(230,225,200,0.35)';
          ctx.lineWidth = 0.35;
          for (let k = 1; k < 4; k += 1) {
            const px = bx + (bw / 4) * k;
            ctx.beginPath();
            ctx.moveTo(px, by + 6);
            ctx.lineTo(px, by + bh - 6);
            ctx.stroke();
          }
        } else if (block.kind === 'plaza') {
          ctx.fillStyle = '#c6bba6';
          ctx.fillRect(bx, by, bw, bh);
          ctx.strokeStyle = 'rgba(160,148,128,0.5)';
          ctx.lineWidth = 0.3;
          for (let k = 0; k < 5; k += 1) {
            ctx.beginPath();
            ctx.moveTo(bx + k * (bw / 5), by);
            ctx.lineTo(bx + k * (bw / 5), by + bh);
            ctx.stroke();
          }
        } else {
          ctx.fillStyle = '#9d988f';
          ctx.fillRect(bx, by, bw, bh);
        }
        // The kerb: a light lip around the block.
        ctx.strokeStyle = 'rgba(240,234,220,0.5)';
        ctx.lineWidth = 0.6;
        ctx.strokeRect(bx + 0.4, by + 0.4, bw - 0.8, bh - 0.8);
      }
    }
    // Asphalt on every street.
    ctx.fillStyle = C.asphalt;
    const gx0 = Math.max(0, Math.floor(view.x0 / TILE) * TILE);
    for (let i = 0; i <= BLOCKS; i += 1) {
      const x = i * TILE;
      if (x + ROAD / 2 < view.x0 - 10 || x - ROAD / 2 > view.x1 + 10) continue;
      ctx.fillRect(x - ROAD / 2, Math.max(0, view.y0 - 20), ROAD, Math.min(WORLD_H, view.y1 + 20) - Math.max(0, view.y0 - 20));
    }
    for (let j = 0; j <= BLOCKS; j += 1) {
      const y = j * TILE;
      if (y + ROAD / 2 < view.y0 - 10 || y - ROAD / 2 > view.y1 + 10) continue;
      ctx.fillRect(Math.max(0, view.x0 - 20), y - ROAD / 2, Math.min(CITY, view.x1 + 20) - Math.max(0, view.x0 - 20), ROAD);
    }
    void gx0;
    // Lane paint and crosswalks.
    ctx.strokeStyle = 'rgba(236,226,190,0.55)';
    ctx.lineWidth = 0.35;
    ctx.setLineDash([4, 5]);
    for (let i = 0; i <= BLOCKS; i += 1) {
      const x = i * TILE;
      if (x < view.x0 - 20 || x > view.x1 + 20) continue;
      for (let j = 0; j < BLOCKS; j += 1) {
        const y0 = j * TILE + ROAD / 2 + 8;
        const y1 = (j + 1) * TILE - ROAD / 2 - 8;
        if (y1 < view.y0 || y0 > view.y1) continue;
        ctx.beginPath();
        ctx.moveTo(x, y0);
        ctx.lineTo(x, y1);
        ctx.stroke();
      }
    }
    for (let j = 0; j <= BLOCKS; j += 1) {
      const y = j * TILE;
      if (y < view.y0 - 20 || y > view.y1 + 20) continue;
      for (let i = 0; i < BLOCKS; i += 1) {
        const x0 = i * TILE + ROAD / 2 + 8;
        const x1 = (i + 1) * TILE - ROAD / 2 - 8;
        if (x1 < view.x0 || x0 > view.x1) continue;
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    // Crosswalk bars at every junction near the view.
    ctx.fillStyle = 'rgba(226,218,196,0.62)';
    const ci0 = clamp(Math.floor(view.x0 / TILE), 0, BLOCKS);
    const ci1 = clamp(Math.ceil(view.x1 / TILE), 0, BLOCKS);
    const cj0 = clamp(Math.floor(view.y0 / TILE), 0, BLOCKS);
    const cj1 = clamp(Math.ceil(view.y1 / TILE), 0, BLOCKS);
    for (let j = cj0; j <= cj1; j += 1) {
      for (let i = ci0; i <= ci1; i += 1) {
        const cx = i * TILE;
        const cy = j * TILE;
        for (let k = 0; k < 5; k += 1) {
          const off = -ROAD / 2 + 1.6 + k * 4.2;
          ctx.fillRect(cx + off, cy + ROAD / 2 + 1.2, 2.4, 3.2);
          ctx.fillRect(cx + off, cy - ROAD / 2 - 4.4, 2.4, 3.2);
          ctx.fillRect(cx + ROAD / 2 + 1.2, cy + off, 3.2, 2.4);
          ctx.fillRect(cx - ROAD / 2 - 4.4, cy + off, 3.2, 2.4);
        }
      }
    }
    // Grime and patches, so the asphalt is not a flat slab.
    ctx.fillStyle = 'rgba(0,0,0,0.045)';
    for (let n = 0; n < 40; n += 1) {
      const seed = (n * 97) % 13;
      const px = ((n * 613) % CITY);
      const py = ((n * 431 + seed * 51) % CITY);
      if (px < view.x0 - 30 || px > view.x1 + 30 || py < view.y0 - 30 || py > view.y1 + 30) continue;
      if (!onRoad(px, py)) continue;
      ctx.fillRect(px, py, 6 + (n % 5) * 3, 2 + (n % 3));
    }
    void light;
  }

  // -------------------------------------------------------------- buildings
  drawBuildingShadows(ctx, view) {
    const list = this.game.city.buildings;
    // Long shadows first, thrown east and a little south by the low sun.
    for (const b of list) {
      if (b.x + b.w < view.x0 - 90 || b.x > view.x1 + 90) continue;
      if (b.y + b.h < view.y0 - 90 || b.y > view.y1 + 140) continue;
      const dx = 2.6 + b.height * 0.2;
      const dy = 3.8 + b.height * 0.24;
      ctx.fillStyle = 'rgba(24,20,34,0.27)';
      ctx.beginPath();
      ctx.moveTo(b.x + dx, b.y + dy);
      ctx.lineTo(b.x + b.w + dx, b.y + dy);
      ctx.lineTo(b.x + b.w + dx, b.y + b.h + dy);
      ctx.lineTo(b.x + dx, b.y + b.h + dy);
      ctx.closePath();
      ctx.fill();
    }
  }

  /**
   * One depth-sorted pass over everything that stands up: buildings, palms,
   * cars and people, painted from the far edge of the frame to the near one, so
   * a lifted roof covers what stands behind it and never the street in front.
   */
  drawSorted(ctx, view, light, time) {
    const g = this.game;
    const items = [];
    for (const b of g.city.buildings) {
      if (b.x + b.w < view.x0 - 60 || b.x > view.x1 + 60 || b.y + b.h < view.y0 - 60 || b.y > view.y1 + 160) continue;
      items.push({ key: b.y + b.h, kind: 'building', b });
    }
    for (const p of g.city.props) {
      if (p.x < view.x0 - 12 || p.x > view.x1 + 12 || p.y < view.y0 - 20 || p.y > view.y1 + 12) continue;
      items.push({ key: p.y + 0.3, kind: 'prop', p });
    }
    for (const car of g.allCars()) {
      if (car.x < view.x0 - 24 || car.x > view.x1 + 24 || car.y < view.y0 - 34 || car.y > view.y1 + 24) continue;
      items.push({ key: car.y + car.len * 0.34, kind: 'car', car });
    }
    for (const ped of g.peds.list) {
      if (ped.x < view.x0 - 8 || ped.x > view.x1 + 8 || ped.y < view.y0 - 8 || ped.y > view.y1 + 8) continue;
      items.push({ key: ped.y, kind: 'ped', ped });
    }
    for (const thug of g.enemies.list) {
      if (thug.x < view.x0 - 8 || thug.x > view.x1 + 8 || thug.y < view.y0 - 8 || thug.y > view.y1 + 8) continue;
      items.push({ key: thug.y, kind: 'thug', thug });
    }
    for (const unit of g.police.units) {
      if (unit.kind !== 'foot') continue;
      if (unit.x < view.x0 - 8 || unit.x > view.x1 + 8 || unit.y < view.y0 - 8 || unit.y > view.y1 + 8) continue;
      items.push({ key: unit.y, kind: 'cop', unit });
    }
    const p = g.player;
    if (!p.veh) items.push({ key: p.y, kind: 'player' });
    items.sort((a, b) => a.key - b.key);
    for (const item of items) {
      if (item.kind === 'building') this.drawBuilding(ctx, item.b, light, time);
      else if (item.kind === 'prop') this.drawProp(ctx, item.p, light, time);
      else if (item.kind === 'car') this.drawVehicle(ctx, item.car, item.car === p.veh, light);
      else if (item.kind === 'ped') this.drawPed(ctx, item.ped);
      else if (item.kind === 'thug') this.drawThug(ctx, item.thug);
      else if (item.kind === 'cop') this.drawCop(ctx, item.unit);
      else this.drawPlayer(ctx, p, light);
    }
  }

  drawBuilding(ctx, b, light, time) {
    const liftX = b.height * ROOF_SLIDE;
    const liftY = b.height * ROOF_LIFT;
    const x2 = b.x + b.w;
    const y2 = b.y + b.h;
    const night = light.sun < 0.36;
    const band = Math.abs(liftY);
    // --- the two walls the camera sees.
    const wallS = shade(b.wall, -0.2 + (b.shade - 1) * 0.5);
    const wallE = shade(b.wall, -0.4 + (b.shade - 1) * 0.5);
    ctx.fillStyle = wallE;
    ctx.beginPath();
    ctx.moveTo(x2, b.y);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x2 + liftX, y2 + liftY);
    ctx.lineTo(x2 + liftX, b.y + liftY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = wallS;
    ctx.beginPath();
    ctx.moveTo(b.x, y2);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x2 + liftX, y2 + liftY);
    ctx.lineTo(b.x + liftX, y2 + liftY);
    ctx.closePath();
    ctx.fill();
    // A dark base line where the wall meets the street.
    ctx.fillStyle = 'rgba(24,20,26,0.28)';
    ctx.fillRect(b.x, y2 - 0.6, b.w, 0.6);
    // Cornice: a light band under the roof edge.
    ctx.fillStyle = shade(b.wall, 0.16);
    ctx.beginPath();
    ctx.moveTo(b.x, y2 + liftY);
    ctx.lineTo(x2, y2 + liftY);
    ctx.lineTo(x2 + liftX, y2 + liftY - 0.9);
    ctx.lineTo(b.x + liftX, y2 + liftY - 0.9);
    ctx.closePath();
    ctx.fill();
    // --- windows: a ladder of them up the south wall.
    if (band > 2.4) {
      const rows = Math.max(1, Math.round(band / 3.4));
      const cols = Math.max(2, Math.floor(b.w / 3.2));
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          const f = (r + 0.42) / rows;
          const fx = (c + 0.5) / cols;
          const px = b.x + fx * b.w - 0.62 + fx * liftX * 0.55;
          const py = y2 - band * (0.16 + f * 0.68) + fx * liftY * 0.5;
          const lit = night && ((r * 5 + c * 7 + b.seed) % 7 < 3);
          ctx.fillStyle = lit ? 'rgba(255,203,124,0.92)' : night ? 'rgba(26,40,56,0.92)' : 'rgba(46,66,82,0.62)';
          ctx.fillRect(px, py, 1.24, 1.5);
          if (!lit) {
            ctx.fillStyle = 'rgba(190,220,230,0.18)';
            ctx.fillRect(px, py, 1.24, 0.4);
          }
        }
      }
      // Windows on the east wall, in perspective.
      const ecols = Math.max(1, Math.floor(b.h / 3.4));
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < ecols; c += 1) {
          const f = (r + 0.42) / rows;
          const fy = (c + 0.5) / ecols;
          const px = x2 - 0.15 + liftX * (0.55 + fy * 0.1);
          const py = b.y + fy * b.h - band * (0.16 + f * 0.68) + liftY * (0.4 + fy * 0.1);
          const lit = night && ((r * 3 + c * 5 + b.seed) % 8 < 3);
          ctx.fillStyle = lit ? 'rgba(255,196,118,0.75)' : 'rgba(24,36,50,0.55)';
          ctx.fillRect(px, py, 0.8, 1.35);
        }
      }
    }
    // --- awnings and shop fronts at street level.
    if (b.floors <= 6) {
      const awn = ['#e4574f', '#3fa9a0', '#e8bf5a', '#d47fae', '#5f8fc9'][(b.seed + 3) % 5];
      const aw = b.w * 0.26;
      for (let k = 0; k < 3; k += 1) {
        const px = b.x + b.w * (0.12 + k * 0.3);
        ctx.fillStyle = k % 2 === 0 ? awn : shade(awn, -0.12);
        ctx.fillRect(px, y2 - 2.4, aw, 1.1);
        if (night) {
          ctx.fillStyle = 'rgba(255,214,150,0.5)';
          ctx.fillRect(px + 0.3, y2 - 1.2, aw - 0.6, 0.9);
        }
      }
    }
    // --- the roof itself.
    const rx = b.x + liftX;
    const ry = b.y + liftY;
    const roofTint = shade(b.roof, (b.shade - 1) * 0.55);
    ctx.fillStyle = roofTint;
    ctx.fillRect(rx, ry, b.w, b.h);
    // A hard edge around the roofline keeps neighbouring buildings apart.
    ctx.strokeStyle = 'rgba(22,18,26,0.34)';
    ctx.lineWidth = 0.45;
    ctx.strokeRect(rx + 0.22, ry + 0.22, b.w - 0.44, b.h - 0.44);
    // Parapet edge.
    ctx.strokeStyle = 'rgba(28,24,30,0.32)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(rx + 0.25, ry + 0.25, b.w - 0.5, b.h - 0.5);
    ctx.strokeStyle = 'rgba(255,255,255,0.30)';
    ctx.lineWidth = 0.35;
    ctx.strokeRect(rx + 1.3, ry + 1.3, b.w - 2.6, b.h - 2.6);
    // Tar seams across the roof.
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 0.3;
    for (let k = 1; k < 4; k += 1) {
      ctx.beginPath();
      ctx.moveTo(rx + 1.4, ry + (b.h / 4) * k);
      ctx.lineTo(rx + b.w - 1.4, ry + (b.h / 4) * k);
      ctx.stroke();
    }
    // Roof furniture: plant, tanks, vents, a garden, a helipad or a pool.
    this.roofDetails(ctx, b, rx, ry, night, roofTint);
    if (b.district === 'beach' && b.height > 14 && b.w > 26) {
      ctx.fillStyle = 'rgba(70,178,190,0.85)';
      rr(ctx, rx + b.w * 0.3, ry + b.h * 0.34, b.w * 0.36, b.h * 0.24, 0.8);
      ctx.fill();
      ctx.strokeStyle = 'rgba(240,255,255,0.4)';
      ctx.lineWidth = 0.25;
      ctx.stroke();
    }
    if (b.style === 'tower' && b.height > 58) {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.arc(rx + b.w / 2, ry + b.h / 2, Math.min(7, b.w * 0.26), 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.font = display(Math.min(7, b.w * 0.26));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('H', rx + b.w / 2, ry + b.h / 2 + 0.2);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
    // Balconies on the beach hotels.
    if (b.balcony) {
      ctx.fillStyle = 'rgba(255,255,255,0.34)';
      for (let k = 1; k < Math.min(4, b.floors); k += 1) {
        ctx.fillRect(b.x + 0.6, y2 - (band / Math.min(5, b.floors)) * k - 0.4, b.w - 1.2, 0.6);
      }
    }
    // Rooftop neon: one word, lit at night and readable by day.
    if (b.sign) {
      const word = SIGN_WORDS[(b.seed * 7 + Math.round(b.x / 23) + Math.round(b.y / 19) * 3) % SIGN_WORDS.length];
      const glow = night ? 1 : 0.5;
      ctx.save();
      ctx.globalAlpha = glow;
      ctx.font = display(Math.min(6.2, b.w * 0.26));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = night ? C.neon : 'rgba(48,40,48,0.5)';
      if (night) {
        ctx.shadowColor = C.neon;
        ctx.shadowBlur = 14;
      }
      ctx.fillText(word, rx + b.w / 2, ry + b.h * 0.44);
      ctx.restore();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
    void time;
  }
  /** Everything the tenants left on the roof, seeded from the building. */
  roofDetails(ctx, b, rx, ry, night, roofTint) {
    let state = (b.seed * 1103515245 + 12345) & 0x7fffffff;
    const rnd = () => {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      return state / 0x7fffffff;
    };
    const w = b.w;
    const h = b.h;
    // A painted advertisement on a handful of roofs, the way the city sells itself.
    if (w > 18 && h > 16 && rnd() < 0.22) {
      const word = SIGN_WORDS[(b.seed + Math.floor(b.y)) % SIGN_WORDS.length];
      const bw = Math.min(w * 0.7, 26);
      const bh = Math.min(h * 0.4, 12);
      const bx = rx + (w - bw) / 2;
      const by = ry + (h - bh) / 2;
      ctx.fillStyle = 'rgba(28,24,30,0.14)';
      ctx.fillRect(bx + 0.6, by + 0.8, bw, bh);
      ctx.fillStyle = ['#2f6f6a', '#a33f43', '#2c3b56', '#7a5a2e'][(b.seed + 1) % 4];
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = 'rgba(255,255,255,0.86)';
      ctx.font = display(Math.min(bh * 0.62, 7));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(word, bx + bw / 2, by + bh / 2);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
    // A terrace on the hotels: umbrellas and a couple of loungers.
    if ((b.district === 'beach' || b.district === 'downtown') && b.height > 12 && w > 20 && rnd() < 0.4) {
      const tx = rx + w * (0.58 + rnd() * 0.12);
      const ty = ry + h * (0.14 + rnd() * 0.16);
      for (let n = 0; n < 3; n += 1) {
        const cx = tx + (n % 2) * 5.2;
        const cy = ty + Math.floor(n / 2) * 5.4;
        ctx.fillStyle = 'rgba(20,18,22,0.16)';
        ctx.beginPath();
        ctx.arc(cx + 0.5, cy + 0.6, 2.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = ['#e8574f', '#3fb3c4', '#f0cf62'][(b.seed + n) % 3];
        ctx.beginPath();
        ctx.arc(cx, cy, 2.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.arc(cx, cy, 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Repairs: a patch of fresh tar or gravel.
    const patches = 1 + Math.floor(rnd() * 3);
    for (let n = 0; n < patches; n += 1) {
      const pw = w * (0.14 + rnd() * 0.26);
      const ph = h * (0.1 + rnd() * 0.22);
      ctx.fillStyle = n % 2 === 0 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.09)';
      ctx.fillRect(rx + rnd() * (w - pw), ry + rnd() * (h - ph), pw, ph);
    }
    // A stair box, the way up from the street.
    const sw = Math.min(12, w * 0.26);
    const sh = Math.min(9, h * 0.2);
    ctx.fillStyle = shade(roofTint, -0.26);
    ctx.fillRect(rx + w * 0.08, ry + h * 0.62, sw, sh);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(rx + w * 0.08, ry + h * 0.62, sw, 0.6);
    ctx.fillStyle = shade(roofTint, -0.42);
    ctx.fillRect(rx + w * 0.08 + sw * 0.3, ry + h * 0.62 + sh * 0.4, sw * 0.4, sh * 0.4);
    // Air conditioners and vents, in twos or threes.
    const units = 2 + Math.floor(rnd() * 4);
    for (let n = 0; n < units; n += 1) {
      const uw = Math.min(7, w * 0.16) * (0.6 + rnd() * 0.7);
      const uh = uw * (0.55 + rnd() * 0.3);
      const ux = rx + w * (0.3 + rnd() * 0.58) - uw;
      const uy = ry + h * (0.08 + rnd() * 0.7);
      ctx.fillStyle = 'rgba(20,18,22,0.18)';
      ctx.fillRect(ux + 0.5, uy + 0.6, uw, uh);
      ctx.fillStyle = shade(roofTint, -0.24);
      ctx.fillRect(ux, uy, uw, uh);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(ux, uy, uw, 0.5);
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      ctx.fillRect(ux + uw * 0.18, uy + uh * 0.3, uw * 0.64, Math.max(0.3, uh * 0.14));
    }
    // A vent stack or two.
    for (let n = 0; n < 2; n += 1) {
      if (rnd() < 0.45) continue;
      const vx = rx + w * (0.2 + rnd() * 0.7);
      const vy = ry + h * (0.2 + rnd() * 0.7);
      ctx.fillStyle = shade(roofTint, -0.34);
      ctx.beginPath();
      ctx.arc(vx, vy, 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    // Solar panels on some roofs, water tanks on others.
    if (rnd() < 0.3) {
      const cols = 2 + Math.floor(rnd() * 3);
      const rows = 1 + Math.floor(rnd() * 3);
      const cell = Math.min(2.6, w * 0.075);
      const bx = rx + w * 0.36;
      const by = ry + h * 0.34;
      for (let c = 0; c < cols; c += 1) {
        for (let r = 0; r < rows; r += 1) {
          ctx.fillStyle = '#3d5a70';
          ctx.fillRect(bx + c * (cell + 0.6), by + r * (cell * 0.7 + 0.6), cell, cell * 0.7);
          ctx.fillStyle = 'rgba(180,220,240,0.25)';
          ctx.fillRect(bx + c * (cell + 0.6), by + r * (cell * 0.7 + 0.6), cell, 0.35);
        }
      }
    }
    if (b.tank || rnd() < 0.35) {
      const tx = rx + w * (0.62 + rnd() * 0.2);
      const ty = ry + h * (0.16 + rnd() * 0.24);
      const tr = Math.min(3.6, w * 0.1);
      ctx.fillStyle = 'rgba(20,18,22,0.18)';
      ctx.beginPath();
      ctx.arc(tx + 0.7, ty + 0.8, tr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shade(roofTint, -0.34);
      ctx.beginPath();
      ctx.arc(tx, ty, tr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath();
      ctx.arc(tx - tr * 0.3, ty - tr * 0.3, tr * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
    // A rooftop garden on the low residential blocks.
    if (b.district === 'residential' && b.height < 16 && rnd() < 0.4) {
      const gw = w * 0.42;
      const gh = h * 0.3;
      const gx = rx + w * 0.5;
      const gy = ry + h * 0.55;
      ctx.fillStyle = 'rgba(104,140,84,0.9)';
      ctx.fillRect(gx, gy, gw, gh);
      ctx.fillStyle = 'rgba(74,110,64,0.8)';
      for (let n = 0; n < 6; n += 1) {
        ctx.beginPath();
        ctx.arc(gx + rnd() * gw, gy + rnd() * gh, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // An antenna on the tallest towers.
    if (b.height > 55) {
      ctx.strokeStyle = 'rgba(40,36,44,0.7)';
      ctx.lineWidth = 0.35;
      ctx.beginPath();
      ctx.moveTo(rx + w * 0.3, ry + h * 0.3);
      ctx.lineTo(rx + w * 0.3, ry + h * 0.3 - 6);
      ctx.moveTo(rx + w * 0.3 - 3, ry + h * 0.3 - 4);
      ctx.lineTo(rx + w * 0.3, ry + h * 0.3);
      ctx.lineTo(rx + w * 0.3 + 3, ry + h * 0.3 - 4);
      ctx.stroke();
      if (night) {
        ctx.fillStyle = '#ff5a5a';
        ctx.beginPath();
        ctx.arc(rx + w * 0.3, ry + h * 0.3 - 6, 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // The parapet's inner shadow, so the roof sits inside its walls.
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.fillRect(rx + 1.3, ry + 1.3, b.w - 2.6, 0.8);
  }

  // ------------------------------------------------------------------ props
  /** One street prop, drawn in the depth-sorted pass. */
  drawProp(ctx, p, light, time) {
    const night = light.sun < 0.34;
    {
      switch (p.kind) {
        case 'palm': {
          const s = p.size ?? 1;
          const sway = Math.sin(time * 1.1 + (p.sway ?? 0)) * 0.18;
          ctx.strokeStyle = '#8a6a45';
          ctx.lineWidth = 0.55 * s;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.quadraticCurveTo(p.x + sway * 2, p.y - 3.4 * s, p.x + sway * 5, p.y - 6.4 * s);
          ctx.stroke();
          ctx.strokeStyle = night ? '#2f5f45' : '#4f8a52';
          ctx.lineWidth = 0.42 * s;
          for (let k = 0; k < 7; k += 1) {
            const a = -Math.PI / 2 + (k - 3) * 0.42 + sway;
            ctx.beginPath();
            ctx.moveTo(p.x + sway * 5, p.y - 6.2 * s);
            ctx.quadraticCurveTo(
              p.x + sway * 5 + Math.cos(a) * 3.4 * s,
              p.y - 6.2 * s + Math.sin(a) * 3.4 * s - 0.7,
              p.x + sway * 5 + Math.cos(a) * 5.6 * s,
              p.y - 6.2 * s + Math.sin(a) * 5.6 * s + 1.4 * s,
            );
            ctx.stroke();
          }
          ctx.fillStyle = 'rgba(30,40,30,0.16)';
          ctx.beginPath();
          ctx.ellipse(p.x + 2.2, p.y + 1.2, 3.4 * s, 1.5 * s, 0.3, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'lamp': {
          ctx.fillStyle = night ? 'rgba(255,226,160,0.95)' : 'rgba(240,236,224,0.9)';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 0.55, 0, Math.PI * 2);
          ctx.fill();
          if (night) {
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 12);
            g.addColorStop(0, 'rgba(255,208,130,0.30)');
            g.addColorStop(1, 'rgba(255,208,130,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
            ctx.fill();
          }
          break;
        }
        case 'bench':
          ctx.fillStyle = '#9a6b45';
          ctx.fillRect(p.x - 1.7, p.y - 0.5, 3.4, 1);
          ctx.fillStyle = '#7b5236';
          ctx.fillRect(p.x - 1.5, p.y + 0.5, 0.5, 0.45);
          ctx.fillRect(p.x + 1.0, p.y + 0.5, 0.5, 0.45);
          break;
        case 'hydrant':
          ctx.fillStyle = '#d24b3f';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 0.35, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'fountain': {
          const s = p.size ?? 4;
          ctx.fillStyle = '#cfc6b4';
          ctx.beginPath();
          ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(90,168,178,0.85)';
          ctx.beginPath();
          ctx.arc(p.x, p.y, s * 0.76, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(240,255,255,0.5)';
          ctx.lineWidth = 0.35;
          for (let k = 0; k < 3; k += 1) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, s * (0.3 + k * 0.18), time * (0.4 + k * 0.2), time * (0.4 + k * 0.2) + 2.2);
            ctx.stroke();
          }
          break;
        }
        case 'umbrella': {
          const s = p.size ?? 1;
          const r = 1.15 * s;
          ctx.fillStyle = 'rgba(30,30,30,0.2)';
          ctx.beginPath();
          ctx.ellipse(p.x + 0.9, p.y + 0.8, r, r * 0.62, 0.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = ['#e8574f', '#3fb3c4', '#f0cf62', '#e78ab0'][Math.floor(p.x + p.y) % 4];
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.5)';
          ctx.lineWidth = 0.14;
          for (let k = 0; k < 6; k += 1) {
            const a = (k / 6) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
            ctx.stroke();
          }
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 0.16, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'hut': {
          ctx.fillStyle = '#b98a55';
          ctx.fillRect(p.x - 3, p.y - 2.4, 6, 4.8);
          ctx.fillStyle = '#8e6a42';
          ctx.fillRect(p.x - 3.4, p.y - 3.2, 6.8, 1.2);
          break;
        }
        case 'container': {
          ctx.fillStyle = ['#c05a45', '#3f7d92', '#7d8f5a'][Math.floor(p.x) % 3];
          ctx.fillRect(p.x - 6, p.y - 3, 12, 6);
          ctx.strokeStyle = 'rgba(0,0,0,0.2)';
          ctx.lineWidth = 0.3;
          for (let k = -4; k <= 4; k += 2) {
            ctx.beginPath();
            ctx.moveTo(p.x + k, p.y - 3);
            ctx.lineTo(p.x + k, p.y + 3);
            ctx.stroke();
          }
          break;
        }
        case 'towel': {
          const s = p.size ?? 1;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.angle ?? 0);
          ctx.fillStyle = 'rgba(40,30,20,0.14)';
          ctx.fillRect(-1.6 * s + 0.3, -0.95 * s + 0.3, 3.2 * s, 1.9 * s);
          ctx.fillStyle = p.colour;
          ctx.fillRect(-1.6 * s, -0.95 * s, 3.2 * s, 1.9 * s);
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.fillRect(-1.6 * s, -0.15 * s, 3.2 * s, 0.3 * s);
          ctx.restore();
          break;
        }
        case 'boat': {
          const s = p.size ?? 1;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.angle ?? 0);
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.fillRect(-3.2 * s, -1.4 * s, 6.4 * s, 2.8 * s);
          ctx.fillStyle = '#f4efe2';
          ctx.beginPath();
          ctx.moveTo(-3.2 * s, -1.1 * s);
          ctx.lineTo(2.4 * s, -1.1 * s);
          ctx.lineTo(3.4 * s, 0);
          ctx.lineTo(2.4 * s, 1.1 * s);
          ctx.lineTo(-3.2 * s, 1.1 * s);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#3fa9a0';
          ctx.fillRect(-1.4 * s, -0.75 * s, 2.6 * s, 1.5 * s);
          ctx.strokeStyle = 'rgba(255,255,255,0.6)';
          ctx.lineWidth = 0.18;
          ctx.beginPath();
          ctx.moveTo(0.2 * s, -0.7 * s);
          ctx.lineTo(0.2 * s, -4.2 * s);
          ctx.lineTo(2.6 * s, -1.1 * s);
          ctx.closePath();
          ctx.stroke();
          ctx.restore();
          break;
        }
        case 'buoy': {
          ctx.fillStyle = '#e8574f';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 0.7 * (p.size ?? 1), 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'tree': {
          const s = p.size ?? 1;
          ctx.fillStyle = 'rgba(30,40,25,0.2)';
          ctx.beginPath();
          ctx.ellipse(p.x + 2, p.y + 1.6, 3.6 * s, 1.7 * s, 0.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = night ? '#2c4a33' : '#4a7a45';
          ctx.beginPath();
          ctx.arc(p.x, p.y - 1.2 * s, 3.1 * s, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = night ? '#355a3c' : '#5b8f52';
          ctx.beginPath();
          ctx.arc(p.x - 1.2 * s, p.y - 2.4 * s, 2.1 * s, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        default:
          break;
      }
    }
  }

  /** Piers, the lighthouse and the beach stage: flat things under everything. */
  drawLandmarks(ctx, view, light, time) {
    const night = light.sun < 0.34;
    void view;
    for (const mark of this.game.city.landmarks) {
      if (mark.kind === 'pier') {
        ctx.fillStyle = '#9a7550';
        ctx.fillRect(mark.x, mark.y - 4, mark.len, 8);
        ctx.strokeStyle = 'rgba(60,44,30,0.5)';
        ctx.lineWidth = 0.3;
        for (let k = 0; k < mark.len; k += 4) {
          ctx.beginPath();
          ctx.moveTo(mark.x + k, mark.y - 4);
          ctx.lineTo(mark.x + k, mark.y + 4);
          ctx.stroke();
        }
        ctx.fillStyle = '#c9d2cf';
        for (let k = 14; k < mark.len; k += 26) {
          ctx.beginPath();
          ctx.arc(mark.x + k, mark.y - 5.4, 0.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(mark.x + k, mark.y + 5.4, 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (mark.kind === 'lighthouse') {
        ctx.fillStyle = 'rgba(30,26,30,0.2)';
        ctx.beginPath();
        ctx.ellipse(mark.x + 2.4, mark.y + 2, 5, 2.2, 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f4efe2';
        ctx.beginPath();
        ctx.arc(mark.x, mark.y, 4.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#d3543f';
        ctx.beginPath();
        ctx.arc(mark.x, mark.y, 4.2, -0.6, 0.9);
        ctx.lineTo(mark.x, mark.y);
        ctx.fill();
        ctx.fillStyle = '#ffe9a8';
        ctx.beginPath();
        ctx.arc(mark.x, mark.y, 1.5, 0, Math.PI * 2);
        ctx.fill();
        if (night) {
          const sweep = (time * 0.7) % (Math.PI * 2);
          const g = ctx.createRadialGradient(mark.x, mark.y, 0, mark.x, mark.y, 60);
          g.addColorStop(0, 'rgba(255,236,170,0.28)');
          g.addColorStop(1, 'rgba(255,236,170,0)');
          ctx.save();
          ctx.translate(mark.x, mark.y);
          ctx.rotate(sweep);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, 60, -0.2, 0.2);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      } else if (mark.kind === 'stage') {
        ctx.fillStyle = '#6e5a86';
        ctx.fillRect(mark.x - 16, mark.y - 9, 32, 18);
        ctx.fillStyle = '#8d74a8';
        ctx.fillRect(mark.x - 13, mark.y - 6, 26, 12);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 0.4;
        for (let k = -2; k <= 2; k += 1) {
          ctx.beginPath();
          ctx.moveTo(mark.x + k * 5, mark.y - 6);
          ctx.lineTo(mark.x + k * 5, mark.y + 6);
          ctx.stroke();
        }
        ctx.fillStyle = C.neon;
        ctx.beginPath();
        ctx.arc(mark.x, mark.y - 8.4, 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ------------------------------------------------------------- the actors
  drawWorldMarkers(ctx, view, g) {
    const mission = g.missions;
    if (mission.marker && mission.state === 'active') {
      const m = mission.marker;
      const pulse = 0.6 + Math.sin(g.time * 3.4) * 0.22;
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = C.amber;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r ?? 6, 0, Math.PI * 2);
      ctx.stroke();
      const grad = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r * 2.2);
      grad.addColorStop(0, 'rgba(255,193,77,0.22)');
      grad.addColorStop(1, 'rgba(255,193,77,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r * 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      void view;
    }
    // Cash and pickups on the ground.
    for (const pick of g.pickups) {
      const bob = Math.sin(g.time * 3 + pick.seed) * 0.25;
      ctx.save();
      ctx.translate(pick.x, pick.y + bob);
      if (pick.kind === 'cash') {
        ctx.fillStyle = '#7fc98b';
        ctx.fillRect(-0.55, -0.32, 1.1, 0.64);
        ctx.fillStyle = '#2f6b43';
        ctx.font = mono(0.75);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('$', 0, 0.02);
      } else if (pick.kind === 'health') {
        ctx.fillStyle = '#f4f1e8';
        rr(ctx, -0.5, -0.5, 1, 1, 0.2);
        ctx.fill();
        ctx.fillStyle = '#d8484f';
        ctx.fillRect(-0.1, -0.32, 0.2, 0.64);
        ctx.fillRect(-0.32, -0.1, 0.64, 0.2);
      } else if (pick.kind === 'armour') {
        ctx.fillStyle = '#4f86c6';
        ctx.beginPath();
        ctx.moveTo(0, -0.6);
        ctx.lineTo(0.5, -0.3);
        ctx.lineTo(0.4, 0.4);
        ctx.lineTo(0, 0.65);
        ctx.lineTo(-0.4, 0.4);
        ctx.lineTo(-0.5, -0.3);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillStyle = '#d8b56a';
        ctx.fillRect(-0.5, -0.25, 1, 0.5);
      }
      ctx.restore();
    }
  }

  drawVehicle(ctx, car, isPlayer, light) {
    const c = Math.cos(car.heading);
    const s = Math.sin(car.heading);
    const L = car.len;
    const W = car.wid;
    ctx.save();
    ctx.translate(car.x, car.y);
    // Shadow, thrown a little to the south-east.
    ctx.fillStyle = 'rgba(20,18,24,0.26)';
    ctx.save();
    ctx.rotate(car.heading);
    rr(ctx, -L / 2 + 0.7, -W / 2 + 1.1, L, W, 0.7);
    ctx.fill();
    ctx.restore();
    ctx.rotate(car.heading);
    // Body.
    const body = car.wrecked ? '#3a3733' : car.colour;
    ctx.fillStyle = body;
    rr(ctx, -L / 2, -W / 2, L, W, 0.62);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 0.14;
    ctx.stroke();
    // A darker bonnet and boot line.
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(L * 0.22, -W / 2 + 0.28, L * 0.26, W - 0.56);
    ctx.fillRect(-L * 0.46, -W / 2 + 0.32, L * 0.2, W - 0.64);
    // Cabin glass.
    const glass = car.wrecked ? 'rgba(40,40,44,0.9)' : 'rgba(34,52,64,0.85)';
    ctx.fillStyle = glass;
    rr(ctx, -L * 0.2, -W / 2 + 0.34, L * 0.44, W - 0.68, 0.34);
    ctx.fill();
    // Windscreen and rear window highlights.
    ctx.fillStyle = 'rgba(190,220,230,0.35)';
    ctx.fillRect(L * 0.18, -W / 2 + 0.4, 0.38, W - 0.8);
    ctx.fillRect(-L * 0.24, -W / 2 + 0.4, 0.3, W - 0.8);
    // Roof.
    ctx.fillStyle = shade(body, -0.08);
    rr(ctx, -L * 0.1, -W / 2 + 0.5, L * 0.28, W - 1, 0.3);
    ctx.fill();
    // Patrol livery.
    if (car.police && !car.wrecked) {
      ctx.fillStyle = '#20242c';
      ctx.fillRect(-L * 0.16, -W / 2, L * 0.34, W * 0.2);
      ctx.fillRect(-L * 0.16, W / 2 - W * 0.2, L * 0.34, W * 0.2);
      // The city's shield.
      ctx.fillStyle = '#2f6f8f';
      ctx.beginPath();
      ctx.arc(L * 0.06, 0, W * 0.16, 0, Math.PI * 2);
      ctx.fill();
      const t = car.siren;
      const red = Math.sin(t) > 0;
      ctx.fillStyle = red ? '#ff3b52' : '#3b6bff';
      ctx.fillRect(-0.5, -W * 0.34, 1.0, W * 0.32);
      ctx.fillRect(-0.5, W * 0.02, 1.0, W * 0.32);
      if (red) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(-0.2, 0, 0, -0.2, 0, 9);
        g.addColorStop(0, 'rgba(255,60,80,0.32)');
        g.addColorStop(1, 'rgba(255,60,80,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(-0.2, 0, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    // Taxi sign and livery.
    if (car.type === 'taxi' && !car.wrecked) {
      ctx.fillStyle = '#111';
      ctx.fillRect(-0.3, -0.45, 0.6, 0.9);
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(-0.22, -0.32, 0.44, 0.64);
    }
    // Wheels.
    ctx.fillStyle = '#17171a';
    const wheel = (x, y) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.fillRect(-0.42, -0.2, 0.84, 0.4);
      ctx.restore();
    };
    wheel(L * 0.3, -W / 2 + 0.1);
    wheel(L * 0.3, W / 2 - 0.1);
    wheel(-L * 0.3, -W / 2 + 0.1);
    wheel(-L * 0.3, W / 2 - 0.1);
    // Lights.
    const night = light.sun < 0.4;
    ctx.fillStyle = '#ffdf9a';
    ctx.fillRect(L / 2 - 0.32, -W / 2 + 0.24, 0.26, 0.5);
    ctx.fillRect(L / 2 - 0.32, W / 2 - 0.74, 0.26, 0.5);
    ctx.fillStyle = car.braking > 0.3 ? '#ff5a5a' : '#8f2b33';
    ctx.fillRect(-L / 2 + 0.06, -W / 2 + 0.28, 0.22, 0.46);
    ctx.fillRect(-L / 2 + 0.06, W / 2 - 0.74, 0.22, 0.46);
    if (night && (isPlayer || car.speed > 2)) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(L / 2, 0, L / 2 + 22, 0);
      g.addColorStop(0, 'rgba(255,232,170,0.22)');
      g.addColorStop(1, 'rgba(255,232,170,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(L / 2, -W * 0.42);
      ctx.lineTo(L / 2 + 22, -W * 1.1);
      ctx.lineTo(L / 2 + 22, W * 1.1);
      ctx.lineTo(L / 2, W * 0.42);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    // Damage: dents and a cracked windscreen.
    if (car.damage > 0.4) {
      ctx.fillStyle = 'rgba(20,18,16,0.5)';
      ctx.beginPath();
      ctx.arc(-L * 0.3, W * 0.2, 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(230,240,240,0.5)';
      ctx.lineWidth = 0.1;
      ctx.beginPath();
      ctx.moveTo(0, -W * 0.2);
      ctx.lineTo(0.7, W * 0.1);
      ctx.lineTo(-0.3, W * 0.24);
      ctx.stroke();
    }
    // A driver's head, seen through the glass.
    if (car.driver && !car.wrecked) {
      ctx.fillStyle = '#2b231e';
      ctx.beginPath();
      ctx.arc(-0.1, -W * 0.22, 0.34, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = car.police ? '#20242c' : '#3a2c22';
      ctx.beginPath();
      ctx.arc(-0.1, -W * 0.22, 0.36, Math.PI, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    void c;
    void s;
  }

  drawPed(ctx, ped) {
    const dead = ped.state === 'dead';
    const down = ped.state === 'down';
    ctx.save();
    ctx.translate(ped.x, ped.y);
    ctx.fillStyle = 'rgba(20,18,20,0.22)';
    ctx.beginPath();
    ctx.ellipse(0.35, 0.35, 0.55, 0.3, 0.4, 0, Math.PI * 2);
    ctx.fill();
    if (dead) {
      ctx.rotate(ped.angle || 0);
      this.drawPersonShape(ctx, ped, 0, 0, 0, true);
      ctx.restore();
      return;
    }
    if (down) {
      ctx.rotate(Math.PI / 2);
      this.drawPersonShape(ctx, ped, 0, 0, 0, false);
      ctx.restore();
      return;
    }
    ctx.rotate(ped.h);
    const swing = Math.sin(ped.walkCycle * 3.4) * (ped.state === 'flee' ? 0.5 : 0.3);
    this.drawPersonShape(ctx, ped, 0, 0, swing, false);
    ctx.restore();
  }

  /** One body: legs, torso, arms, head, hair or hat. Drawn facing +x. */
  drawPersonShape(ctx, ped, x, y, swing, prone) {
    const s = 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1.32, 1.32);
    // Legs.
    ctx.strokeStyle = ped.pants;
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    ctx.moveTo(-0.1, -0.16);
    ctx.lineTo(-0.1 + swing * 0.5, -0.2 + (prone ? 0 : 0.05));
    ctx.moveTo(-0.1, 0.16);
    ctx.lineTo(-0.1 - swing * 0.5, 0.2);
    ctx.stroke();
    // Torso.
    ctx.fillStyle = ped.shirt;
    rr(ctx, -0.42 * s, -0.36, 0.72 * s, 0.72, 0.22);
    ctx.fill();
    // Arms.
    ctx.strokeStyle = shade(ped.shirt, -0.12);
    ctx.lineWidth = 0.22;
    ctx.beginPath();
    ctx.moveTo(0.06, -0.3);
    ctx.lineTo(0.3 - swing * 0.4, -0.42);
    ctx.moveTo(0.06, 0.3);
    ctx.lineTo(0.3 + swing * 0.4, 0.42);
    ctx.stroke();
    // Head.
    ctx.fillStyle = ped.skin;
    ctx.beginPath();
    ctx.arc(0.2 * s, 0, 0.27, 0, Math.PI * 2);
    ctx.fill();
    if (ped.hat) {
      ctx.fillStyle = '#f2e7c8';
      ctx.beginPath();
      ctx.arc(0.18 * s, 0, 0.33, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e0cf9e';
      ctx.beginPath();
      ctx.arc(0.18 * s, 0, 0.18, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = ped.hair;
      ctx.beginPath();
      ctx.arc(0.14 * s, 0, 0.27, Math.PI * 0.55, Math.PI * 1.45);
      ctx.fill();
    }
    if (ped.bag) {
      ctx.fillStyle = '#5a4632';
      ctx.fillRect(-0.3, -0.34, 0.22, 0.3);
    }
    ctx.restore();
  }

  drawThug(ctx, thug) {
    ctx.save();
    ctx.translate(thug.x, thug.y);
    ctx.fillStyle = 'rgba(20,18,20,0.24)';
    ctx.beginPath();
    ctx.ellipse(0.35, 0.35, 0.6, 0.32, 0.4, 0, Math.PI * 2);
    ctx.fill();
    if (!thug.alive) {
      ctx.rotate(thug.h + Math.PI / 2);
      this.drawPersonShape(ctx, { shirt: thug.shirt, pants: thug.pants, skin: thug.skin, hair: '#1a1a1e', hat: false, bag: false }, 0, 0, 0, true);
      ctx.restore();
      return;
    }
    ctx.rotate(thug.h);
    this.drawPersonShape(ctx, { shirt: thug.shirt, pants: thug.pants, skin: thug.skin, hair: '#1a1a1e', hat: false, bag: false }, 0, 0, 0, false);
    // The pistol, held out ahead.
    ctx.fillStyle = '#23262c';
    ctx.fillRect(0.42, -0.24, 0.42, 0.16);
    ctx.fillStyle = '#3a3e46';
    ctx.fillRect(0.3, -0.26, 0.16, 0.22);
    if (thug.boss) {
      ctx.fillStyle = '#f4efe2';
      ctx.beginPath();
      ctx.arc(0.2, 0, 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawCop(ctx, unit) {
    ctx.save();
    ctx.translate(unit.x, unit.y);
    ctx.fillStyle = 'rgba(20,18,20,0.24)';
    ctx.beginPath();
    ctx.ellipse(0.35, 0.35, 0.6, 0.32, 0.4, 0, Math.PI * 2);
    ctx.fill();
    if (!unit.alive) {
      ctx.rotate(Math.PI / 2);
      this.drawPersonShape(ctx, { shirt: '#26303c', pants: '#1c2430', skin: '#b07a52', hair: '#1a1a1e', hat: true, bag: false }, 0, 0, 0, true);
      ctx.restore();
      return;
    }
    ctx.rotate(unit.h);
    this.drawPersonShape(ctx, { shirt: '#26303c', pants: '#1c2430', skin: '#b07a52', hair: '#1a1a1e', hat: true, bag: false }, 0, 0, 0, false);
    ctx.fillStyle = '#23262c';
    ctx.fillRect(0.4, -0.22, 0.44, 0.14);
    // The shoulder patch.
    ctx.fillStyle = '#d8c46a';
    ctx.fillRect(-0.2, -0.36, 0.12, 0.1);
    ctx.restore();
  }

  drawPlayer(ctx, p, light) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(20,18,20,0.26)';
    ctx.beginPath();
    ctx.ellipse(0.4, 0.4, 0.7, 0.36, 0.4, 0, Math.PI * 2);
    ctx.fill();
    if (p.dead) {
      ctx.rotate(p.h + Math.PI / 2);
      this.drawPersonShape(ctx, { shirt: '#f0e6d2', pants: '#2a3340', skin: '#b07a52', hair: '#241a16', hat: false, bag: false }, 0, 0, 0, true);
      ctx.restore();
      return;
    }
    // Feet follow the heading; the shoulders follow the aim, so strafing reads.
    ctx.rotate(p.h);
    const swing = Math.sin(p.walkCycle * 3.6) * Math.min(0.45, p.speed * 0.08);
    this.drawPersonShape(ctx, { shirt: '#f4ecda', pants: '#2d3746', skin: '#b07a52', hair: '#241a16', hat: false, bag: false }, 0, 0, swing, false);
    ctx.restore();
    // The weapon, drawn over the shoulder toward the aim.
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.aim);
    const spec = p.weaponSpec;
    if (p.weapon === 'fist') {
      ctx.fillStyle = '#c98d63';
      ctx.beginPath();
      ctx.arc(0.55, -0.2, 0.16, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.weapon === 'smg') {
      ctx.fillStyle = '#23262c';
      ctx.fillRect(0.3, -0.16, 0.82, 0.2);
      ctx.fillRect(0.42, 0.04, 0.16, 0.3);
    } else if (p.weapon === 'shotgun') {
      ctx.fillStyle = '#3a2c22';
      ctx.fillRect(0.2, -0.12, 1.1, 0.16);
      ctx.fillStyle = '#23262c';
      ctx.fillRect(0.9, -0.1, 0.4, 0.12);
    } else {
      ctx.fillStyle = '#23262c';
      ctx.fillRect(0.45, -0.14, 0.5, 0.15);
      ctx.fillStyle = '#3a3e46';
      ctx.fillRect(0.32, -0.17, 0.16, 0.22);
    }
    ctx.restore();
    void spec;
    void light;
  }

  // ------------------------------------------------------------- atmosphere
  drawAtmosphere(ctx, cam, view, light, time) {
    const g = this.game;
    // Helicopter searchlight at four stars and above.
    if (g.police.stars >= 4 && !g.player.veh) {
      const heliX = g.player.x + Math.cos(time * 0.6) * 26;
      const heliY = g.player.y - 34 + Math.sin(time * 0.8) * 8;
      ctx.save();
      ctx.fillStyle = 'rgba(20,22,30,0.85)';
      ctx.beginPath();
      ctx.ellipse(heliX, heliY + 2, 2.4, 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(220,225,235,0.6)';
      ctx.lineWidth = 0.25;
      ctx.beginPath();
      ctx.moveTo(heliX - 3.4, heliY + 1.6);
      ctx.lineTo(heliX + 3.4, heliY + 1.6);
      ctx.stroke();
      const g2 = ctx.createLinearGradient(heliX, heliY, g.player.x, g.player.y);
      g2.addColorStop(0, 'rgba(255,246,200,0.20)');
      g2.addColorStop(1, 'rgba(255,246,200,0.05)');
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.moveTo(heliX - 1, heliY);
      ctx.lineTo(g.player.x - 7, g.player.y + 4);
      ctx.lineTo(g.player.x + 7, g.player.y + 4);
      ctx.lineTo(heliX + 1, heliY);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    // A lamp under the barrel after dark: a soft pool at the player's feet and
    // a cone down the aim, which is the only light on the beach at night.
    const p = g.player;
    if (light.sun < 0.3 && !p.dead && !p.veh) {
      const pool = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 9);
      pool.addColorStop(0, 'rgba(255,238,196,0.24)');
      pool.addColorStop(1, 'rgba(255,238,196,0)');
      ctx.fillStyle = pool;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
      ctx.fill();
      const reach = 30;
      const spread = 0.22;
      const cone = ctx.createRadialGradient(p.x, p.y, 1.5, p.x, p.y, reach);
      cone.addColorStop(0, 'rgba(255,244,210,0.30)');
      cone.addColorStop(0.55, 'rgba(255,238,190,0.14)');
      cone.addColorStop(1, 'rgba(255,238,190,0)');
      ctx.fillStyle = cone;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.arc(p.x, p.y, reach, (p.aim ?? p.h) - spread, (p.aim ?? p.h) + spread);
      ctx.closePath();
      ctx.fill();
    }
    void cam;
    void view;
  }

  /** Screen-space finish: the hour's tint, rain, a vignette and a light grade. */
  drawPost(ctx, cam, light, g) {
    const w = cam.width;
    const h = cam.height;
    if (light.tint) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = light.tint;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    // Warm sun wash from the top of the frame.
    const sun = ctx.createLinearGradient(0, 0, 0, h);
    sun.addColorStop(0, `rgba(255,214,150,${0.10 * light.sun})`);
    sun.addColorStop(0.5, 'rgba(255,214,150,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, w, h);
    // Rain.
    if (g.weather.rain > 0) {
      ctx.save();
      ctx.strokeStyle = `rgba(210,232,240,${0.18 * g.weather.rain})`;
      ctx.lineWidth = 1;
      for (const drop of this.rain) {
        const x = ((drop.x + g.time * 0.02 * drop.v) % 1) * w;
        const y = ((drop.y + g.time * drop.v) % 1) * h;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 3, y + drop.len);
        ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = `rgba(40,60,80,${0.12 * g.weather.rain})`;
      ctx.fillRect(0, 0, w, h);
    }
    // Vignette, heavier at night.
    const vig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.72);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, `rgba(8,6,12,${0.13 + (1 - light.sun) * 0.24})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
    // Damage and the flash of a blast.
    if (g.effects.flash > 0.01) {
      ctx.fillStyle = g.effects.flashColour;
      ctx.globalAlpha = g.effects.flash;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
    if (g.player.health < 34 && !g.player.dead) {
      const hurt = 0.22 + Math.sin(g.time * 6) * 0.08;
      const blood = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
      blood.addColorStop(0, 'rgba(150,20,30,0)');
      blood.addColorStop(1, `rgba(150,20,30,${hurt})`);
      ctx.fillStyle = blood;
      ctx.fillRect(0, 0, w, h);
    }
  }
}

/** Lighten or darken a hex colour by `amount` (-1..1). */
export function shade(hex, amount) {
  let r;
  let g;
  let b;
  if (hex.startsWith('rgb')) {
    const parts = hex.match(/[\d.]+/g) ?? ['0', '0', '0'];
    r = Number(parts[0]);
    g = Number(parts[1]);
    b = Number(parts[2]);
  } else {
    const clean = hex.replace('#', '');
    const full = clean.length === 3 ? clean.split('').map((x) => x + x).join('') : clean;
    const num = parseInt(full, 16);
    r = (num >> 16) & 255;
    g = (num >> 8) & 255;
    b = num & 255;
  }
  if (amount >= 0) {
    r = Math.round(r + (255 - r) * amount);
    g = Math.round(g + (255 - g) * amount);
    b = Math.round(b + (255 - b) * amount);
  } else {
    r = Math.round(r * (1 + amount));
    g = Math.round(g * (1 + amount));
    b = Math.round(b * (1 + amount));
  }
  return `rgb(${clamp(r, 0, 255)},${clamp(g, 0, 255)},${clamp(b, 0, 255)})`;
}

export { rr, ui, display };
