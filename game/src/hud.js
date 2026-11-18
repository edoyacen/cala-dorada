/**
 * hud.js — the glass the player reads the city through: the mission panel, the
 * money, the five stars, the clock and the district, the minimap with its
 * police blips and its route, the health and armour bars, the weapon and the
 * speedometer, the subtitles, the notices, the big map and the crosshair.
 */
import { C, ui, display, mono, WEAPONS, TILE, BLOCKS, CITY, BEACH, WORLD_H, RADIO_STATIONS, SAFEHOUSE, WANTED } from './config.js';
import { clamp, lerp } from './random.js';
import { rr } from './render.js';

/** A five-pointed star path at (x,y). */
function starPath(ctx, x, y, r) {
  ctx.beginPath();
  for (let k = 0; k < 10; k += 1) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rad = k % 2 === 0 ? r : r * 0.44;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (k === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export class Hud {
  constructor(game) {
    this.game = game;
    this.scale = 1;
    this.toasts = [];
    this.moneyShown = game.player.money;
    this.moneyTick = 0;
    this.hintTimer = 8;
  }

  /** Add a notice to the stack in the top middle of the screen. */
  toast(text, kind = 'info') {
    this.toasts.push({ text, kind, life: 3.6, max: 3.6 });
    if (this.toasts.length > 4) this.toasts.shift();
  }

  update(dt) {
    for (let n = this.toasts.length - 1; n >= 0; n -= 1) {
      this.toasts[n].life -= dt;
      if (this.toasts[n].life <= 0) this.toasts.splice(n, 1);
    }
    const p = this.game.player;
    if (Math.abs(this.moneyShown - p.money) > 0.5) {
      this.moneyShown = lerp(this.moneyShown, p.money, 1 - Math.pow(0.001, dt));
      this.moneyTick += dt;
    } else {
      this.moneyShown = p.money;
    }
    this.hintTimer = Math.max(0, this.hintTimer - dt);
  }

  draw(ctx, cam, input) {
    const g = this.game;
    const w = cam.width;
    const h = cam.height;
    const k = Math.min(w / 1280, h / 720);
    this.scale = k;
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    this.drawMission(ctx, g, k, w, h);
    this.drawStatus(ctx, g, k, w, h);
    this.drawMinimap(ctx, g, k, h);
    this.drawVitals(ctx, g, k, h);
    this.drawVehicle(ctx, g, k, w, h);
    this.drawRadio(ctx, g, k, w, h);
    this.drawToasts(ctx, k, w);
    this.drawDialogue(ctx, g, k, w, h);
    this.drawPrompts(ctx, g, k, w, h);
    this.drawCrosshair(ctx, g, input, k, w, h);
    this.drawBusted(ctx, g, k, w, h);
    this.drawBanner(ctx, g, k, w, h);
    ctx.restore();
  }

  // ------------------------------------------------------------- top panels
  drawMission(ctx, g, k, w, h) {
    const mission = g.missions;
    const obj = mission.objective();
    if (!obj) {
      // Between missions: a small card that says what to do next.
      if (mission.state === 'idle' && g.missions.current) {
        const next = g.missions.current;
        const x = 26 * k;
        const y = 24 * k;
        const bw = 316 * k;
        const bh = 74 * k;
        this.panel(ctx, x, y, bw, bh, k);
        ctx.fillStyle = C.cyan;
        ctx.font = display(11 * k);
        ctx.fillText('NEXT JOB', x + 14 * k, y + 22 * k);
        ctx.fillStyle = C.white;
        ctx.font = display(19 * k);
        ctx.fillText(next.title, x + 14 * k, y + 44 * k);
        ctx.fillStyle = 'rgba(244,240,230,0.72)';
        ctx.font = ui(11.5 * k);
        ctx.fillText('Press E at the phone marker, or J to call Nina', x + 14 * k, y + 62 * k);
      }
      return;
    }
    const x = 26 * k;
    const y = 24 * k;
    const bw = Math.min(420 * k, w * 0.42);
    const bh = 96 * k;
    this.panel(ctx, x, y, bw, bh, k);
    // Accent strip.
    ctx.fillStyle = C.amber;
    ctx.fillRect(x, y + 10 * k, 3 * k, bh - 20 * k);
    ctx.fillStyle = C.amber;
    ctx.font = display(10.5 * k);
    ctx.fillText('MISSION', x + 16 * k, y + 22 * k);
    ctx.fillStyle = C.white;
    ctx.font = display(20 * k);
    ctx.fillText(obj.title, x + 16 * k, y + 45 * k);
    ctx.fillStyle = 'rgba(244,240,230,0.9)';
    ctx.font = ui(13 * k);
    this.wrap(ctx, obj.text, x + 16 * k, y + 64 * k, bw - 34 * k, 15 * k, 2);
    if (obj.extra) {
      ctx.fillStyle = C.cyan;
      ctx.font = mono(12 * k);
      ctx.textAlign = 'right';
      ctx.fillText(obj.extra, x + bw - 14 * k, y + 22 * k);
      ctx.textAlign = 'left';
    }
    if (obj.distance !== null && obj.distance !== undefined) {
      ctx.fillStyle = 'rgba(244,240,230,0.62)';
      ctx.font = mono(11 * k);
      ctx.textAlign = 'right';
      ctx.fillText(`${obj.distance} m`, x + bw - 14 * k, y + bh - 12 * k);
      ctx.textAlign = 'left';
    }
    // Progress for a hold-out step.
    const step = mission.mission?.steps[mission.step];
    if (step && step.type === 'survive') {
      const total = step.time || 1;
      const frac = clamp(1 - mission.timer / total, 0, 1);
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(x + 16 * k, y + bh - 8 * k, bw - 32 * k, 3 * k);
      ctx.fillStyle = C.danger;
      ctx.fillRect(x + 16 * k, y + bh - 8 * k, (bw - 32 * k) * frac, 3 * k);
    }
    void h;
  }

  drawStatus(ctx, g, k, w, h) {
    const p = g.player;
    // Money.
    ctx.textAlign = 'right';
    ctx.font = display(30 * k);
    ctx.fillStyle = '#d9f5d0';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 6 * k;
    ctx.fillText(`$${Math.round(this.moneyShown).toLocaleString('en-US')}`, w - 26 * k, 48 * k);
    ctx.shadowBlur = 0;
    // Wanted stars.
    const stars = g.police.stars;
    for (let n = 0; n < 5; n += 1) {
      const x = w - 26 * k - (4 - n) * 24 * k - 10 * k;
      const y = 70 * k;
      const lit = n < stars;
      const flashing = lit && stars >= 4 && Math.sin(g.time * 6) > 0;
      ctx.fillStyle = lit ? (flashing ? '#fff2c0' : C.amber) : 'rgba(255,255,255,0.14)';
      starPath(ctx, x, y, 9 * k);
      ctx.fill();
      if (lit) {
        ctx.strokeStyle = 'rgba(60,30,0,0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    // Clock and district.
    const hour = Math.floor(g.clock.hour) % 24;
    const minute = Math.floor((g.clock.hour % 1) * 60);
    ctx.font = mono(13 * k);
    ctx.fillStyle = 'rgba(244,240,230,0.8)';
    ctx.fillText(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`, w - 26 * k, 98 * k);
    ctx.font = ui(11.5 * k);
    ctx.fillStyle = 'rgba(244,240,230,0.55)';
    ctx.fillText(g.city.districtAt(p.x, p.y), w - 26 * k, 114 * k);
    // What the stars mean, and who is above you when it gets loud.
    if (stars > 0) {
      ctx.font = mono(9.5 * k);
      ctx.fillStyle = stars >= 4 ? 'rgba(255,120,130,0.9)' : 'rgba(255,214,150,0.7)';
      ctx.fillText(WANTED.names[Math.min(5, stars)].toUpperCase(), w - 26 * k, 130 * k);
    }
    if (g.police.heli) {
      const blink = Math.sin(g.time * 5) > 0;
      ctx.font = display(9.5 * k);
      ctx.fillStyle = blink ? 'rgba(255,90,105,0.95)' : 'rgba(255,255,255,0.5)';
      ctx.fillText('◆ HELICOPTER', w - 26 * k, 146 * k);
    }
    // Mission clock of the day and a thin line, for the look of it.
    ctx.textAlign = 'left';
    void h;
  }

  // --------------------------------------------------------------- minimap
  drawMinimap(ctx, g, k, h) {
    const size = 196 * k;
    const x = 26 * k;
    const y = h - size - 26 * k;
    const cx = x + size / 2;
    const cy = y + size / 2;
    const radius = size / 2;
    const p = g.player;
    const span = 165;             // metres from edge to edge
    const scale = size / span;
    ctx.save();
    // The disc.
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(14,18,24,0.9)';
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 2 * k, 0, Math.PI * 2);
    ctx.clip();
    // Water and sand first.
    ctx.fillStyle = '#2f8f9c';
    const seaX = cx + (CITY + BEACH - p.x) * scale;
    ctx.fillRect(seaX, y, x + size - seaX, size);
    ctx.fillStyle = '#d9c193';
    ctx.fillRect(seaX - BEACH * scale, y, BEACH * scale, size);
    // The blocks, as a city plan.
    const i0 = clamp(Math.floor((p.x - span / 2) / TILE), 0, BLOCKS - 1);
    const i1 = clamp(Math.ceil((p.x + span / 2) / TILE), 0, BLOCKS - 1);
    const j0 = clamp(Math.floor((p.y - span / 2) / TILE), 0, BLOCKS - 1);
    const j1 = clamp(Math.ceil((p.y + span / 2) / TILE), 0, BLOCKS - 1);
    ctx.fillStyle = 'rgba(88,98,104,0.55)';
    for (let j = j0; j <= j1; j += 1) {
      for (let i = i0; i <= i1; i += 1) {
        const block = g.city.blocks[j * BLOCKS + i];
        if (!block) continue;
        const bx = cx + (i * TILE + TILE / 2 - p.x) * scale;
        const by = cy + (j * TILE + TILE / 2 - p.y) * scale;
        const s = (TILE - 22) * scale;
        ctx.fillStyle = block.kind === 'park' ? 'rgba(90,128,86,0.75)' : block.kind === 'plaza' ? 'rgba(150,140,120,0.7)' : 'rgba(96,104,110,0.7)';
        ctx.fillRect(bx - s / 2, by - s / 2, s, s);
      }
    }
    // The route to the marker.
    if (g.route.length > 1 && g.missions.marker) {
      ctx.strokeStyle = 'rgba(62,224,208,0.85)';
      ctx.lineWidth = 3 * k;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      g.route.forEach((node, n) => {
        const nx = cx + (node.x - p.x) * scale;
        const ny = cy + (node.y - p.y) * scale;
        if (n === 0) ctx.moveTo(nx, ny);
        else ctx.lineTo(nx, ny);
      });
      ctx.stroke();
    }
    // Pickups and enemies.
    for (const pick of g.pickups) {
      const px = cx + (pick.x - p.x) * scale;
      const py = cy + (pick.y - p.y) * scale;
      ctx.fillStyle = pick.kind === 'cash' ? '#8ce09a' : pick.kind === 'health' ? '#f4f1e8' : '#7fb6ef';
      ctx.beginPath();
      ctx.arc(px, py, 2.4 * k, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const thug of g.enemies.list) {
      if (!thug.alive) continue;
      const px = cx + (thug.x - p.x) * scale;
      const py = cy + (thug.y - p.y) * scale;
      ctx.fillStyle = '#ff5b68';
      ctx.beginPath();
      ctx.arc(px, py, 2.6 * k, 0, Math.PI * 2);
      ctx.fill();
    }
    // Police, blinking between red and blue.
    const blink = Math.sin(g.time * 8) > 0;
    for (const unit of g.police.units) {
      const ux = unit.kind === 'car' ? unit.car?.x : unit.x;
      const uy = unit.kind === 'car' ? unit.car?.y : unit.y;
      if (ux === undefined) continue;
      const px = cx + (ux - p.x) * scale;
      const py = cy + (uy - p.y) * scale;
      ctx.fillStyle = blink ? '#ff4458' : '#4a7bff';
      ctx.beginPath();
      ctx.arc(px, py, 3.4 * k, 0, Math.PI * 2);
      ctx.fill();
    }
    // The helicopter, orbiting above the chase with its lamp on the player.
    if (g.police.heli) {
      const hx = cx + (g.police.heli.x - p.x) * scale;
      const hy = cy + (g.police.heli.y - p.y) * scale;
      ctx.save();
      ctx.globalAlpha = 0.32;
      ctx.fillStyle = '#fff2c0';
      ctx.beginPath();
      ctx.arc(cx, cy, 22 * k, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.translate(hx, hy);
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 1.2 * k;
      ctx.beginPath();
      ctx.arc(0, 0, 4 * k, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-5 * k, 0);
      ctx.lineTo(5 * k, 0);
      ctx.moveTo(0, -5 * k);
      ctx.lineTo(0, 5 * k);
      ctx.stroke();
      ctx.restore();
    }
    // The safehouse, if this corner of the city is on the disc.
    {
      const sx = cx + (SAFEHOUSE.x - p.x) * scale;
      const sy = cy + (SAFEHOUSE.y - p.y) * scale;
      if (sx > x && sx < x + size && sy > y && sy < y + size) {
        ctx.fillStyle = '#8ce09a';
        ctx.fillRect(sx - 3 * k, sy - 3 * k, 6 * k, 6 * k);
        ctx.fillStyle = 'rgba(12,18,14,0.85)';
        ctx.fillRect(sx - 1.6 * k, sy - 1.6 * k, 3.2 * k, 3.2 * k);
      }
    }
    // The objective.
    const m = g.missions.marker;
    if (m) {
      const mx = cx + (m.x - p.x) * scale;
      const my = cy + (m.y - p.y) * scale;
      const inView = mx > x + 6 && mx < x + size - 6 && my > y + 6 && my < y + size - 6;
      ctx.fillStyle = C.amber;
      if (inView) {
        starPath(ctx, mx, my, 6.4 * k);
        ctx.fill();
      } else {
        // Point along the rim toward it.
        const a = Math.atan2(my - cy, mx - cx);
        const px = cx + Math.cos(a) * (radius - 8 * k);
        const py = cy + Math.sin(a) * (radius - 8 * k);
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(6 * k, 0);
        ctx.lineTo(-4 * k, 4 * k);
        ctx.lineTo(-4 * k, -4 * k);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    // The player: a wedge pointing the way the body faces.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(p.veh ? p.veh.heading : p.h);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(7.5 * k, 0);
    ctx.lineTo(-5 * k, 5 * k);
    ctx.lineTo(-2.5 * k, 0);
    ctx.lineTo(-5 * k, -5 * k);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,20,30,0.7)';
    ctx.lineWidth = 1 * k;
    ctx.stroke();
    ctx.restore();
    // A soft sweep like a radar.
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 2 * k;
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 1.5 * k, 0, Math.PI * 2);
    ctx.stroke();
    // North marker and the district name.
    ctx.fillStyle = C.white;
    ctx.font = display(9 * k);
    ctx.textAlign = 'center';
    ctx.fillText('N', cx, y + 15 * k);
    ctx.textAlign = 'left';
    ctx.save();
    ctx.restore();
  }

  // ---------------------------------------------------------------- vitals
  drawVitals(ctx, g, k, h) {
    const p = g.player;
    const x = 26 * k + 196 * k + 16 * k;
    const y = h - 26 * k - 56 * k;
    const bw = 132 * k;
    // Health.
    ctx.fillStyle = 'rgba(10,12,16,0.72)';
    rr(ctx, x, y, bw, 9 * k, 4 * k);
    ctx.fill();
    const hp = clamp(p.health / 100, 0, 1);
    ctx.fillStyle = hp > 0.5 ? '#6fe08a' : hp > 0.22 ? '#f0c14b' : '#ff4d5e';
    rr(ctx, x + 1.5 * k, y + 1.5 * k, Math.max(0, (bw - 3 * k) * hp), 6 * k, 3 * k);
    ctx.fill();
    // Armour.
    ctx.fillStyle = 'rgba(10,12,16,0.72)';
    rr(ctx, x, y + 13 * k, bw, 7 * k, 3.5 * k);
    ctx.fill();
    const ar = clamp(p.armour / 100, 0, 1);
    if (ar > 0) {
      ctx.fillStyle = '#5ea9e8';
      rr(ctx, x + 1.5 * k, y + 14.5 * k, Math.max(0, (bw - 3 * k) * ar), 4 * k, 2 * k);
      ctx.fill();
    }
    // Stamina, only while Rafa is actually winded.
    if (p.stamina < 0.995) {
      ctx.fillStyle = 'rgba(10,12,16,0.6)';
      rr(ctx, x, y + 23 * k, bw, 4 * k, 2 * k);
      ctx.fill();
      ctx.fillStyle = p.stamina > 0.25 ? '#d8e08a' : '#ff9a6a';
      rr(ctx, x + 1 * k, y + 24 * k, Math.max(0, (bw - 2 * k) * p.stamina), 2 * k, 1 * k);
      ctx.fill();
    }
    // Weapon and ammo.
    const spec = p.weaponSpec;
    ctx.fillStyle = 'rgba(10,12,16,0.72)';
    rr(ctx, x, y - 40 * k, bw, 34 * k, 8 * k);
    ctx.fill();
    ctx.fillStyle = C.white;
    ctx.font = display(13 * k);
    ctx.fillText(spec.name, x + 10 * k, y - 19 * k);
    ctx.fillStyle = C.amber;
    ctx.font = mono(12 * k);
    ctx.textAlign = 'right';
    const ammoText = spec.ammo === Infinity ? '—' : String(p.ammo[p.weapon] ?? 0);
    ctx.fillText(ammoText, x + bw - 10 * k, y - 19 * k);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(244,240,230,0.45)';
    ctx.font = ui(9.5 * k);
    ctx.fillText('1—4 weapons  ·  Q radio  ·  M map', x + 10 * k, y - 8 * k);
  }

  drawVehicle(ctx, g, k, w, h) {
    const p = g.player;
    if (!p.veh) return;
    const x = w - 26 * k;
    const y = h - 30 * k;
    const speed = Math.round(p.veh.speed * 3.6);
    const top = Math.round(p.veh.spec.top * 3.6);
    ctx.textAlign = 'right';
    ctx.fillStyle = C.white;
    ctx.font = display(40 * k);
    ctx.fillText(String(speed), x - 30 * k, y);
    ctx.font = ui(11 * k);
    ctx.fillStyle = 'rgba(244,240,230,0.6)';
    ctx.fillText('km/h', x - 30 * k, y + 2 * k);
    ctx.font = ui(11 * k);
    ctx.fillStyle = 'rgba(244,240,230,0.85)';
    ctx.fillText(p.veh.name, x - 100 * k, y - 44 * k);
    // A rev arc.
    const frac = clamp(p.veh.speed / p.veh.spec.top, 0, 1);
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 5 * k;
    ctx.beginPath();
    ctx.arc(x - 92 * k, y - 12 * k, 24 * k, Math.PI * 0.86, Math.PI * 1.7);
    ctx.stroke();
    ctx.strokeStyle = frac > 0.8 ? C.danger : C.cyan;
    ctx.beginPath();
    ctx.arc(x - 92 * k, y - 12 * k, 24 * k, Math.PI * 0.86, Math.PI * (0.86 + 0.84 * frac));
    ctx.stroke();
    ctx.textAlign = 'left';
  }

  /**
   * The radio, as a card: station, show, a live equaliser and the next-station
   * key. It sits above the minimap in a car and on the step at the safehouse,
   * where the boombox plays the same station.
   */
  drawRadio(ctx, g, k, w, h) {
    if (!g.audio || !g.radio) return;
    const onFoot = !g.player.veh;
    const nearHome = Math.hypot(g.player.x - SAFEHOUSE.x, g.player.y - SAFEHOUSE.y) < 14;
    if (onFoot && !nearHome) return;
    const station = RADIO_STATIONS[g.audio.station] ?? RADIO_STATIONS[0];
    const x = 26 * k;
    const bw = 196 * k;
    const y = h - 26 * k - 196 * k - 74 * k;
    ctx.save();
    ctx.fillStyle = 'rgba(10,12,16,0.7)';
    rr(ctx, x, y, bw, 52 * k, 9 * k);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = station.colour;
    ctx.beginPath();
    ctx.arc(x + 20 * k, y + 21 * k, 11 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(10,12,16,0.8)';
    ctx.beginPath();
    ctx.arc(x + 20 * k, y + 21 * k, 4.4 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.white;
    ctx.font = display(13 * k);
    ctx.fillText(station.name, x + 38 * k, y + 19 * k);
    ctx.fillStyle = station.colour;
    ctx.font = ui(10.5 * k);
    ctx.fillText(station.show, x + 38 * k, y + 33 * k);
    // Equaliser: five bars keyed off the station's own tempo.
    const bars = 5;
    for (let n = 0; n < bars; n += 1) {
      const level = 0.25 + 0.75 * Math.abs(Math.sin(g.time * (2.2 + n * 0.7) + n));
      ctx.fillStyle = station.colour;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x + bw - 54 * k + n * 6 * k, y + 32 * k - level * 16 * k, 3.4 * k, level * 16 * k);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(244,240,230,0.45)';
    ctx.font = mono(8.5 * k);
    ctx.fillText(`${station.tag}   ·   Q`, x + 38 * k, y + 45 * k);
    ctx.restore();
  }

  drawToasts(ctx, k, w) {
    const y0 = 132 * k;
    for (let n = 0; n < this.toasts.length; n += 1) {
      const t = this.toasts[n];
      const a = clamp(t.life / 0.6, 0, 1);
      const bw = Math.min(360 * k, ctx.measureText(t.text).width + 34 * k);
      const x = w - 26 * k - bw;
      const y = y0 + n * 34 * k;
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(10,12,16,0.78)';
      rr(ctx, x, y, bw, 26 * k, 7 * k);
      ctx.fill();
      ctx.fillStyle = t.kind === 'danger' ? C.danger : t.kind === 'good' ? '#7fe39a' : t.kind === 'money' ? '#c9f0a8' : t.kind === 'mission' ? C.amber : C.cyan;
      ctx.fillRect(x, y + 5 * k, 2.5 * k, 16 * k);
      ctx.fillStyle = C.white;
      ctx.font = ui(11.5 * k);
      ctx.fillText(t.text, x + 12 * k, y + 18 * k);
      ctx.globalAlpha = 1;
    }
  }

  drawDialogue(ctx, g, k, w, h) {
    const line = g.dialogueLine;
    if (!line) return;
    const a = clamp(line.life / 0.4, 0, 1) * clamp((line.max - line.life) / 0.2, 0, 1);
    const staged = Boolean(g.shotMode && g.shotMode.name);
    const bw = staged ? Math.min(720 * k, w - 460 * k) : Math.min(720 * k, w - 120 * k);
    const x = staged ? w - bw - 40 * k : (w - bw) / 2;
    const y = h - 128 * k;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(8,10,14,0.82)';
    rr(ctx, x, y, bw, 62 * k, 10 * k);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = C.neon;
    ctx.font = display(11 * k);
    ctx.fillText(line.speaker.toUpperCase(), x + 20 * k, y + 22 * k);
    ctx.fillStyle = C.white;
    ctx.font = ui(14 * k);
    this.wrap(ctx, line.text, x + 20 * k, y + 42 * k, bw - 40 * k, 17 * k, 2);
    ctx.restore();
  }

  drawPrompts(ctx, g, k, w, h) {
    const p = g.player;
    if (!p.dead) {
      const atHome = !p.veh && Math.hypot(p.x - SAFEHOUSE.x, p.y - SAFEHOUSE.y) < SAFEHOUSE.radius;
      const car = !p.veh ? g.nearestEnterableCar(p.x, p.y, 4.2) : null;
      if (atHome && !car) {
        this.pill(ctx, `E — save at ${SAFEHOUSE.name}`, w / 2, h - 176 * k, k);
      } else if (car) {
        const text = car.locked ? 'E — pry the door' : `E — ${car.name}`;
        this.pill(ctx, text, w / 2, h - 176 * k, k);
      } else if (p.veh && p.veh.speed < 1.2) {
        this.pill(ctx, 'E — get out', w / 2, h - 176 * k, k);
      }
    }
    if (this.hintTimer > 0 && g.missions.state === 'active' && g.missions.step === 0) {
      const a = clamp(this.hintTimer / 1.4, 0, 1) * 0.8;
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(244,240,230,0.75)';
      ctx.font = ui(11.5 * k);
      ctx.textAlign = 'center';
      ctx.fillText('WASD move  ·  Shift run  ·  Mouse aim and shoot  ·  E car  ·  M map  ·  Esc pause', w / 2, h - 208 * k);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    }
  }

  pill(ctx, text, cx, cy, k) {
    ctx.font = ui(12 * k);
    const bw = ctx.measureText(text).width + 26 * k;
    ctx.fillStyle = 'rgba(8,10,14,0.8)';
    rr(ctx, cx - bw / 2, cy - 14 * k, bw, 28 * k, 14 * k);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = C.white;
    ctx.textAlign = 'center';
    ctx.fillText(text, cx, cy + 4 * k);
    ctx.textAlign = 'left';
  }

  drawCrosshair(ctx, g, input, k, w, h) {
    const p = g.player;
    if (p.dead || g.screen !== 'play') return;
    const x = input.mouse.x;
    const y = input.mouse.y;
    const spec = p.weaponSpec;
    const spread = 6 * k + (spec.spread ?? 0) * 120 * k;
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1.4 * k;
    ctx.beginPath();
    ctx.arc(x, y, spread, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - spread - 4 * k, y);
    ctx.lineTo(x - spread + 2 * k, y);
    ctx.moveTo(x + spread - 2 * k, y);
    ctx.lineTo(x + spread + 4 * k, y);
    ctx.moveTo(x, y - spread - 4 * k);
    ctx.lineTo(x, y - spread + 2 * k);
    ctx.moveTo(x, y + spread - 2 * k);
    ctx.lineTo(x, y + spread + 4 * k);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(x, y, 1.2 * k, 0, Math.PI * 2);
    ctx.fill();
  }

  drawBusted(ctx, g, k, w, h) {
    if (!g.bustedProgress || g.bustedProgress <= 0.02) return;
    const r = 44 * k;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 5 * k;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2 + 92 * k, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = C.danger;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2 + 92 * k, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * g.bustedProgress);
    ctx.stroke();
    ctx.fillStyle = C.white;
    ctx.font = display(12 * k);
    ctx.textAlign = 'center';
    ctx.fillText('SURRENDER', w / 2, h / 2 + 96 * k);
    ctx.textAlign = 'left';
  }

  drawBanner(ctx, g, k, w, h) {
    const banner = g.banner;
    if (!banner) return;
    const a = clamp(banner.life / 0.4, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(6,8,12,0.66)';
    ctx.fillRect(0, h * 0.36, w, 118 * k);
    ctx.fillStyle = banner.colour;
    ctx.fillRect(0, h * 0.36, w, 3 * k);
    ctx.fillRect(0, h * 0.36 + 115 * k, w, 3 * k);
    ctx.textAlign = 'center';
    ctx.fillStyle = banner.colour;
    ctx.font = display(38 * k);
    ctx.fillText(banner.title, w / 2, h * 0.36 + 52 * k);
    if (banner.sub) {
      ctx.fillStyle = C.white;
      ctx.font = ui(15 * k);
      ctx.fillText(banner.sub, w / 2, h * 0.36 + 84 * k);
    }
    ctx.textAlign = 'left';
    ctx.restore();
  }

  // ---------------------------------------------------------------- the map
  drawBigMap(ctx, g, k, w, h) {
    ctx.save();
    ctx.fillStyle = '#090b10';
    ctx.fillRect(0, 0, w, h);
    const pad = 34 * k;
    const headerH = 86 * k;
    const rightW = Math.min(310 * k, w * 0.28);
    const top = pad + headerH;
    const mapW = w - pad * 2 - rightW - 24 * k;
    const mapH = h - top - 58 * k;
    const worldW = CITY + BEACH;
    const worldH = WORLD_H;
    const scale = Math.min(mapW / worldW, mapH / worldH);
    const ox = pad + (mapW - worldW * scale) / 2;
    const oy = top + (mapH - worldH * scale) / 2;
    // Header.
    ctx.fillStyle = C.amber;
    ctx.font = display(10.5 * k);
    ctx.fillText('LOS ENCARGOS  ·  CALA DORADA', pad, pad + 14 * k);
    ctx.fillStyle = C.white;
    ctx.font = display(30 * k);
    ctx.fillText('The whole coast, one page', pad, pad + 48 * k);
    ctx.fillStyle = 'rgba(244,240,230,0.55)';
    ctx.font = ui(11.5 * k);
    ctx.fillText('18 × 18 blocks  ·  6 jobs for the Solano crew  ·  4 radio stations  ·  from Playa Lume to Cerro Seco', pad, pad + 68 * k);

    // Sea, sand, then the blocks of the plan.
    const sea = ctx.createLinearGradient(ox + CITY * scale, oy, ox + worldW * scale, oy);
    sea.addColorStop(0, '#2f8f9c');
    sea.addColorStop(1, '#144a60');
    ctx.fillStyle = sea;
    ctx.fillRect(ox + CITY * scale, oy, (worldW - CITY) * scale, worldH * scale);
    ctx.fillStyle = '#d9c193';
    ctx.fillRect(ox + CITY * scale, oy, BEACH * scale, worldH * scale);
    ctx.fillRect(ox, oy + CITY * scale, CITY * scale, (worldH - CITY) * scale);
    for (const block of g.city.blocks) {
      ctx.fillStyle = block.kind === 'park' ? '#4f7a4e' : block.kind === 'plaza' ? '#a99c84' : block.kind === 'lot' ? '#4a4a52' : '#8d949a';
      const bx = ox + (block.x0 - 4) * scale;
      const by = oy + (block.y0 - 4) * scale;
      const s = (block.w + 8) * scale;
      ctx.fillRect(bx, by, s, s);
    }
    // The buildings themselves, so the plan has grain and courtyards.
    for (const b of g.city.buildings) {
      ctx.fillStyle = 'rgba(232,238,238,0.2)';
      ctx.fillRect(ox + b.x * scale, oy + b.y * scale, b.w * scale, b.h * scale);
    }
    // Streets.
    ctx.strokeStyle = 'rgba(240,240,235,0.22)';
    ctx.lineWidth = 0.8;
    for (let n = 0; n <= BLOCKS; n += 1) {
      ctx.beginPath();
      ctx.moveTo(ox + n * TILE * scale, oy);
      ctx.lineTo(ox + n * TILE * scale, oy + CITY * scale);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ox, oy + n * TILE * scale);
      ctx.lineTo(ox + CITY * scale, oy + n * TILE * scale);
      ctx.stroke();
    }
    // District names, set on their own blocks.
    ctx.font = display(9.5 * k);
    ctx.fillStyle = 'rgba(255,255,255,0.42)';
    const labels = [
      ['AURORA CENTRO', 6.5, 6.5], ['PLAYA LUME', 16.6, 3.2], ['MUELLE NUEVE', 3.4, 15.4],
      ['JARDINES', 4.2, 10.6], ['CERRO SECO', 1.6, 1.4],
    ];
    for (const [text, i, j] of labels) {
      ctx.fillText(text, ox + i * TILE * scale - 22 * k, oy + j * TILE * scale);
    }
    // The route the GPS would take, from the player to the marker.
    if (g.route.length > 1) {
      ctx.strokeStyle = 'rgba(62,224,208,0.8)';
      ctx.lineWidth = 2.4 * k;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      g.route.forEach((node, n) => {
        const nx = ox + node.x * scale;
        const ny = oy + node.y * scale;
        if (n === 0) ctx.moveTo(nx, ny);
        else ctx.lineTo(nx, ny);
      });
      ctx.stroke();
    }
    // Every job on the story, numbered, with the next one lit.
    const jobs = g.missions.jobMarkers();
    for (const job of jobs) {
      const jx = ox + job.x * scale;
      const jy = oy + job.y * scale;
      const isNext = job.state === 'next';
      const done = job.state === 'done';
      if (isNext) {
        ctx.fillStyle = 'rgba(255,193,77,0.22)';
        ctx.beginPath();
        ctx.arc(jx, jy, (10 + Math.sin(g.time * 3) * 2) * k, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = done ? 'rgba(120,140,130,0.85)' : isNext ? C.amber : 'rgba(62,224,208,0.9)';
      ctx.beginPath();
      ctx.arc(jx, jy, 8.4 * k, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#10131a';
      ctx.font = display(9 * k);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(done ? '✓' : String(job.index + 1), jx, jy + 0.5 * k);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      if (isNext) {
        ctx.fillStyle = C.amber;
        ctx.font = display(10 * k);
        ctx.fillText(job.title, jx + 13 * k, jy + 3 * k);
      }
    }
    // Safehouse.
    ctx.fillStyle = '#8ce09a';
    ctx.fillRect(ox + SAFEHOUSE.x * scale - 4 * k, oy + SAFEHOUSE.y * scale - 4 * k, 8 * k, 8 * k);
    ctx.fillStyle = 'rgba(140,224,154,0.8)';
    ctx.font = mono(8.5 * k);
    ctx.fillText('CASA', ox + SAFEHOUSE.x * scale + 7 * k, oy + SAFEHOUSE.y * scale + 3 * k);
    // Guardia cars and the aircraft.
    for (const unit of g.police.units) {
      const ux = unit.kind === 'car' ? unit.car?.x : unit.x;
      const uy = unit.kind === 'car' ? unit.car?.y : unit.y;
      if (ux === undefined) continue;
      ctx.fillStyle = Math.sin(g.time * 8) > 0 ? '#ff4458' : '#4a7bff';
      ctx.beginPath();
      ctx.arc(ox + ux * scale, oy + uy * scale, 3.2 * k, 0, Math.PI * 2);
      ctx.fill();
    }
    if (g.police.heli) {
      const hx = ox + g.police.heli.x * scale;
      const hy = oy + g.police.heli.y * scale;
      ctx.strokeStyle = C.white;
      ctx.lineWidth = 1.4 * k;
      ctx.beginPath();
      ctx.arc(hx, hy, 6 * k, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(hx - 8 * k, hy);
      ctx.lineTo(hx + 8 * k, hy);
      ctx.moveTo(hx, hy - 8 * k);
      ctx.lineTo(hx, hy + 8 * k);
      ctx.stroke();
    }
    // The player.
    const p = g.player;
    ctx.save();
    ctx.translate(ox + p.x * scale, oy + p.y * scale);
    ctx.rotate(p.veh ? p.veh.heading : p.h);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(10 * k, 0);
    ctx.lineTo(-6.5 * k, 6.5 * k);
    ctx.lineTo(-3 * k, 0);
    ctx.lineTo(-6.5 * k, -6.5 * k);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // Scale bar and the close hint under the map.
    const barX = ox + mapW - 150 * k;
    const barY = oy + worldH * scale + 18 * k;
    ctx.strokeStyle = 'rgba(244,240,230,0.6)';
    ctx.lineWidth = 1.2 * k;
    ctx.beginPath();
    ctx.moveTo(barX, barY);
    ctx.lineTo(barX + 100 * k, barY);
    ctx.moveTo(barX, barY - 4 * k);
    ctx.lineTo(barX, barY + 4 * k);
    ctx.moveTo(barX + 100 * k, barY - 4 * k);
    ctx.lineTo(barX + 100 * k, barY + 4 * k);
    ctx.stroke();
    ctx.fillStyle = 'rgba(244,240,230,0.55)';
    ctx.font = mono(9 * k);
    ctx.fillText('500 m', barX + 108 * k, barY + 3 * k);
    ctx.fillStyle = 'rgba(244,240,230,0.5)';
    ctx.font = ui(10.5 * k);
    ctx.fillText('M or Esc closes the map', pad, barY + 3 * k);

    // The job list on the right: real titles, givers, fees and state.
    const rx = w - pad - rightW;
    const ry = top;
    ctx.fillStyle = 'rgba(14,17,22,0.85)';
    rr(ctx, rx, ry - 10 * k, rightW, h - ry - 48 * k, 12 * k);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = C.amber;
    ctx.font = display(10 * k);
    ctx.fillText('THE SOLANO CREW', rx + 18 * k, ry + 14 * k);
    ctx.fillStyle = C.white;
    ctx.font = display(19 * k);
    ctx.fillText("Nina's list", rx + 18 * k, ry + 38 * k);
    const rowH = 54 * k;
    for (let n = 0; n < jobs.length; n += 1) {
      const job = jobs[n];
      const jy = ry + 62 * k + n * rowH;
      const isNext = job.state === 'next';
      const done = job.state === 'done';
      if (isNext) {
        ctx.fillStyle = 'rgba(255,193,77,0.14)';
        rr(ctx, rx + 10 * k, jy - 16 * k, rightW - 20 * k, rowH - 8 * k, 7 * k);
        ctx.fill();
      }
      ctx.fillStyle = done ? 'rgba(140,160,150,0.8)' : isNext ? C.amber : 'rgba(62,224,208,0.85)';
      ctx.font = mono(10 * k);
      ctx.fillText('0' + (n + 1), rx + 20 * k, jy);
      ctx.fillStyle = done ? 'rgba(244,240,230,0.5)' : C.white;
      ctx.font = ui(13 * k);
      ctx.fillText(job.title, rx + 50 * k, jy);
      ctx.fillStyle = 'rgba(244,240,230,0.45)';
      ctx.font = ui(10 * k);
      ctx.fillText(job.giver + '  ·  $' + job.reward.toLocaleString('en-US'), rx + 50 * k, jy + 15 * k);
      ctx.fillStyle = done ? 'rgba(140,160,150,0.8)' : isNext ? C.amber : 'rgba(244,240,230,0.35)';
      ctx.font = mono(8.5 * k);
      ctx.textAlign = 'right';
      ctx.fillText(done ? 'DONE' : isNext ? 'NEXT' : 'LATER', rx + rightW - 20 * k, jy);
      ctx.textAlign = 'left';
    }
    // Below the list, the crew and the numbers the city is actually made of.
    const infoY = ry + 62 * k + jobs.length * rowH + 14 * k;
    if (infoY < h - 150 * k) {
      ctx.strokeStyle = 'rgba(255,255,255,0.09)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(rx + 18 * k, infoY);
      ctx.lineTo(rx + rightW - 18 * k, infoY);
      ctx.stroke();
      ctx.fillStyle = C.neon;
      ctx.font = display(9 * k);
      ctx.fillText('THE CREW', rx + 18 * k, infoY + 18 * k);
      const crew = [
        ['Nina Solano', 'the work'],
        ['Tavo', 'the cars'],
        ['La Cuerva', 'the wires'],
        ['Cifuentes', 'the coast, for now'],
      ];
      for (let n = 0; n < crew.length; n += 1) {
        const cy = infoY + 38 * k + n * 20 * k;
        ctx.fillStyle = n === 3 ? 'rgba(255,77,94,0.8)' : 'rgba(244,240,230,0.75)';
        ctx.font = ui(11 * k);
        ctx.fillText(crew[n][0], rx + 18 * k, cy);
        ctx.fillStyle = 'rgba(244,240,230,0.35)';
        ctx.font = mono(8.5 * k);
        ctx.textAlign = 'right';
        ctx.fillText(crew[n][1], rx + rightW - 18 * k, cy);
        ctx.textAlign = 'left';
      }
    }
    const done = jobs.filter((job) => job.state === 'done').length;
    const stats = [
      `${done} of ${jobs.length} jobs done  ·  ${g.city.buildings.length} buildings`,
      `${g.city.parking.length} parked cars  ·  ${RADIO_STATIONS.length} radio stations`,
      `Bodies ${g.player.kills}  ·  Cops ${g.player.copKills}  ·  ${g.stats.distanceKm.toFixed(1)} km`,
    ];
    const statY = infoY + 38 * k + 4 * 20 * k + 18 * k;
    if (statY < h - pad - 60 * k) {
      ctx.fillStyle = 'rgba(244,240,230,0.38)';
      ctx.font = mono(8.5 * k);
      for (let n = 0; n < stats.length; n += 1) {
        ctx.fillText(stats[n], rx + 18 * k, statY + n * 12 * k);
      }
      ctx.fillStyle = 'rgba(255,193,77,0.65)';
      ctx.font = mono(9 * k);
      ctx.fillText(`$${Math.round(g.player.money).toLocaleString('en-US')} in the bag`, rx + 18 * k, statY + stats.length * 12 * k + 14 * k);
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- helpers
  panel(ctx, x, y, w, h, k) {
    ctx.fillStyle = 'rgba(10,12,16,0.66)';
    rr(ctx, x, y, w, h, 10 * k);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  wrap(ctx, text, x, y, maxWidth, lineHeight, maxLines = 3) {
    const words = String(text).split(' ');
    let line = '';
    let lines = 0;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, y + lines * lineHeight);
        line = word;
        lines += 1;
        if (lines >= maxLines) return;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, y + lines * lineHeight);
  }
}

export { WEAPONS };
