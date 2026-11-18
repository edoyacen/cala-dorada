/**
 * hud.js — the glass the player reads the city through: the mission panel, the
 * money, the five stars, the clock and the district, the minimap with its
 * police blips and its route, the health and armour bars, the weapon and the
 * speedometer, the subtitles, the notices, the big map and the crosshair.
 */
import { C, ui, display, mono, WEAPONS, TILE, BLOCKS, CITY, BEACH, RADIO_STATIONS } from './config.js';
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
    // Radio dial.
    if (g.audio && g.radio) {
      const station = RADIO_STATIONS[g.audio.station];
      ctx.textAlign = 'left';
      ctx.font = mono(10 * k);
      ctx.fillStyle = station.colour;
      ctx.fillText(`◉ ${station.name}`, 26 * k, h - 26 * k - 196 * k - 12 * k);
    }
    ctx.textAlign = 'left';
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
    const bw = Math.min(720 * k, w - 120 * k);
    const x = (w - bw) / 2;
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
      const car = !p.veh ? g.nearestEnterableCar(p.x, p.y, 4.2) : null;
      if (car) {
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
    ctx.fillStyle = 'rgba(8,10,14,0.92)';
    ctx.fillRect(0, 0, w, h);
    const pad = 40 * k;
    const availW = w - pad * 2;
    const availH = h - pad * 2 - 40 * k;
    const worldW = CITY + BEACH;
    const scale = Math.min(availW / worldW, availH / CITY);
    const ox = (w - worldW * scale) / 2;
    const oy = pad + 20 * k;
    // Sea.
    ctx.fillStyle = '#23606d';
    ctx.fillRect(ox, oy, worldW * scale, CITY * scale);
    ctx.fillStyle = '#d9c193';
    ctx.fillRect(ox + CITY * scale, oy, BEACH * scale, CITY * scale);
    // Blocks.
    for (const block of g.city.blocks) {
      ctx.fillStyle = block.kind === 'park' ? '#4f7a4e' : block.kind === 'plaza' ? '#a99c84' : block.kind === 'lot' ? '#4a4a52' : '#8d949a';
      const bx = ox + (block.x0 - 4) * scale;
      const by = oy + (block.y0 - 4) * scale;
      const s = (block.w + 8) * scale;
      ctx.fillRect(bx, by, s, s);
    }
    // Streets.
    ctx.strokeStyle = 'rgba(240,240,235,0.28)';
    ctx.lineWidth = 1;
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
    // Names of the districts.
    ctx.font = display(11 * k);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    const labels = [
      ['AURORA CENTRO', 6, 6], ['PLAYA LUME', 10.5, 4], ['MUELLE NUEVE', 3, 10], ['JARDINES', 3, 5], ['CERRO SECO', 2, 1],
    ];
    for (const [text, i, j] of labels) {
      ctx.fillText(text, ox + i * TILE * scale - 24 * k, oy + j * TILE * scale);
    }
    // Markers.
    const m = g.missions.marker;
    if (m) {
      ctx.fillStyle = C.amber;
      starPath(ctx, ox + m.x * scale, oy + m.y * scale, 7 * k);
      ctx.fill();
    }
    for (const unit of g.police.units) {
      const ux = unit.kind === 'car' ? unit.car?.x : unit.x;
      const uy = unit.kind === 'car' ? unit.car?.y : unit.y;
      if (ux === undefined) continue;
      ctx.fillStyle = Math.sin(g.time * 8) > 0 ? '#ff4458' : '#4a7bff';
      ctx.beginPath();
      ctx.arc(ox + ux * scale, oy + uy * scale, 3.4 * k, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player.
    const p = g.player;
    ctx.save();
    ctx.translate(ox + p.x * scale, oy + p.y * scale);
    ctx.rotate(p.veh ? p.veh.heading : p.h);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(9 * k, 0);
    ctx.lineTo(-6 * k, 6 * k);
    ctx.lineTo(-6 * k, -6 * k);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // Title and legend.
    ctx.fillStyle = C.white;
    ctx.font = display(18 * k);
    ctx.fillText('CALA DORADA', pad, pad + 2 * k);
    ctx.font = ui(11.5 * k);
    ctx.fillStyle = 'rgba(244,240,230,0.6)';
    ctx.fillText('M or Esc to close', pad, oy + CITY * scale + 22 * k);
    ctx.fillStyle = C.amber;
    ctx.fillText('● mission', w - pad - 220 * k, oy + CITY * scale + 22 * k);
    ctx.fillStyle = '#ff4458';
    ctx.fillText('● Guardia', w - pad - 150 * k, oy + CITY * scale + 22 * k);
    ctx.fillStyle = 'rgba(244,240,230,0.6)';
    ctx.fillText('● you', w - pad - 70 * k, oy + CITY * scale + 22 * k);
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
