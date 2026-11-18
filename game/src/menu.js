/**
 * menu.js — the title card over a living city, the pause screen, the controls
 * sheet, the phone call that starts a job, the hospital bill and the end of the
 * story. Everything is drawn on the same canvas as the game, over a frame of
 * the city that keeps running behind it.
 */
import { C, ui, display, mono } from './config.js';
import { clamp, lerp } from './random.js';
import { rr } from './render.js';
import { saveAge } from './save.js';

/** A soft dark scrim behind a menu, darker at the edges. */
function scrim(ctx, w, h, strength = 0.55) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, `rgba(8,8,14,${strength})`);
  g.addColorStop(0.5, `rgba(8,8,14,${strength * 0.7})`);
  g.addColorStop(1, `rgba(8,8,14,${strength + 0.12})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** The title card: wordmark, tagline, menu, controls hint, a neon rule. */
export function drawTitle(ctx, game, cam) {
  const w = cam.width;
  const h = cam.height;
  const k = Math.min(w / 1280, h / 720);
  scrim(ctx, w, h, 0.3);
  // A warm sun disc behind the wordmark, over the city.
  const cx = w / 2;
  const cy = h * 0.32;
  const sun = ctx.createRadialGradient(cx, cy + 20 * k, 10 * k, cx, cy + 20 * k, 300 * k);
  sun.addColorStop(0, 'rgba(255,168,120,0.5)');
  sun.addColorStop(0.45, 'rgba(255,120,140,0.16)');
  sun.addColorStop(1, 'rgba(255,120,140,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(cx - 320 * k, cy - 260 * k, 640 * k, 520 * k);

  ctx.textAlign = 'center';
  // Wordmark, twice: a dark offset and the cream face.
  ctx.font = display(96 * k);
  ctx.fillStyle = 'rgba(20,10,20,0.55)';
  ctx.fillText('CALA DORADA', cx + 5 * k, cy + 5 * k);
  const face = ctx.createLinearGradient(cx, cy - 70 * k, cx, cy + 20 * k);
  face.addColorStop(0, '#fff4dc');
  face.addColorStop(0.55, '#ffd9a8');
  face.addColorStop(1, '#ffb37a');
  ctx.fillStyle = face;
  ctx.fillText('CALA DORADA', cx, cy);
  ctx.font = display(17 * k);
  ctx.fillStyle = C.neon;
  ctx.fillText('A  S U N - S O A K E N  C R I M E  S T O R Y', cx, cy + 34 * k);
  // The neon rule.
  const rule = ctx.createLinearGradient(cx - 240 * k, 0, cx + 240 * k, 0);
  rule.addColorStop(0, 'rgba(255,63,129,0)');
  rule.addColorStop(0.5, 'rgba(255,63,129,0.9)');
  rule.addColorStop(1, 'rgba(255,63,129,0)');
  ctx.fillStyle = rule;
  ctx.fillRect(cx - 240 * k, cy + 48 * k, 480 * k, 2 * k);

  // The menu.
  const items = game.menuItems();
  const startY = h * 0.56;
  ctx.font = ui(19 * k);
  for (let n = 0; n < items.length; n += 1) {
    const item = items[n];
    const y = startY + n * 42 * k;
    const selected = n === game.menuIndex;
    if (selected) {
      const bw = 300 * k;
      ctx.fillStyle = 'rgba(255,63,129,0.14)';
      rr(ctx, cx - bw / 2, y - 25 * k, bw, 36 * k, 8 * k);
      ctx.fill();
      ctx.fillStyle = C.neon;
      ctx.fillRect(cx - bw / 2, y - 25 * k, 3 * k, 36 * k);
    }
    ctx.fillStyle = selected ? C.white : 'rgba(244,240,230,0.6)';
    ctx.font = selected ? display(20 * k) : ui(19 * k);
    ctx.fillText(item.label, cx, y);
    if (item.note) {
      ctx.font = mono(10 * k);
      ctx.fillStyle = 'rgba(244,240,230,0.4)';
      ctx.fillText(item.note, cx, y + 13 * k);
    }
  }
  // The content line: what the city actually holds, in one glance.
  const features = '18 × 18 BLOCKS   ·   6 JOBS   ·   5 WANTED STARS   ·   4 RADIO STATIONS   ·   SAVES';
  ctx.font = mono(9.5 * k);
  const fw = ctx.measureText(features).width;
  ctx.fillStyle = 'rgba(8,10,14,0.5)';
  rr(ctx, cx - fw / 2 - 16 * k, h - 108 * k, fw + 32 * k, 24 * k, 12 * k);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,214,150,0.62)';
  ctx.fillText(features, cx, h - 92 * k);
  // One footer line, so the keys never sit on top of each other.
  ctx.font = ui(11 * k);
  ctx.fillStyle = 'rgba(244,240,230,0.45)';
  ctx.fillText('↑ ↓ choose   ·   Enter select   ·   W A S D drive   ·   E car   ·   Q radio   ·   M map', cx, h - 48 * k);
  ctx.textAlign = 'left';
  // A version tag, bottom right.
  ctx.fillStyle = 'rgba(244,240,230,0.3)';
  ctx.font = mono(9 * k);
  ctx.textAlign = 'right';
  ctx.fillText(`cala-dorada · build ${game.version}`, w - 24 * k, h - 20 * k);
  ctx.textAlign = 'left';
}

/** The pause sheet: resume, save, controls, quit, with the save's age. */
export function drawPause(ctx, game, cam) {
  const w = cam.width;
  const h = cam.height;
  const k = Math.min(w / 1280, h / 720);
  scrim(ctx, w, h, 0.62);
  const bw = 380 * k;
  const bh = 330 * k;
  const x = (w - bw) / 2;
  const y = (h - bh) / 2;
  ctx.fillStyle = 'rgba(12,14,20,0.86)';
  rr(ctx, x, y, bw, bh, 14 * k);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = C.amber;
  ctx.font = display(11 * k);
  ctx.fillText('PAUSED', w / 2, y + 32 * k);
  ctx.fillStyle = C.white;
  ctx.font = display(28 * k);
  ctx.fillText('Cala Dorada', w / 2, y + 62 * k);
  ctx.font = ui(11 * k);
  ctx.fillStyle = 'rgba(244,240,230,0.55)';
  const mission = game.missions.current;
  ctx.fillText(mission ? `Next job: ${mission.title}` : 'The story is finished. The city is yours.', w / 2, y + 84 * k);
  const items = game.menuItems();
  ctx.font = ui(17 * k);
  for (let n = 0; n < items.length; n += 1) {
    const item = items[n];
    const iy = y + 130 * k + n * 40 * k;
    const selected = n === game.menuIndex;
    if (selected) {
      ctx.fillStyle = 'rgba(255,193,77,0.16)';
      rr(ctx, w / 2 - 130 * k, iy - 24 * k, 260 * k, 34 * k, 7 * k);
      ctx.fill();
      ctx.fillStyle = C.amber;
      ctx.fillRect(w / 2 - 130 * k, iy - 24 * k, 3 * k, 34 * k);
    }
    ctx.fillStyle = selected ? C.white : 'rgba(244,240,230,0.6)';
    ctx.font = selected ? display(18 * k) : ui(17 * k);
    ctx.fillText(item.label, w / 2, iy);
    if (item.note) {
      ctx.font = mono(9.5 * k);
      ctx.fillStyle = 'rgba(244,240,230,0.4)';
      ctx.fillText(item.note, w / 2, iy + 12 * k);
    }
  }
  ctx.font = mono(9.5 * k);
  ctx.fillStyle = 'rgba(244,240,230,0.42)';
  ctx.fillText(saveAge(), w / 2, y + bh - 16 * k);
  ctx.textAlign = 'left';
}

/** The controls sheet. */
export function drawControls(ctx, game, cam) {
  const w = cam.width;
  const h = cam.height;
  const k = Math.min(w / 1280, h / 720);
  scrim(ctx, w, h, 0.72);
  const bw = Math.min(680 * k, w - 60 * k);
  const bh = 430 * k;
  const x = (w - bw) / 2;
  const y = (h - bh) / 2;
  ctx.fillStyle = 'rgba(12,14,20,0.9)';
  rr(ctx, x, y, bw, bh, 14 * k);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.stroke();
  ctx.fillStyle = C.cyan;
  ctx.font = display(11 * k);
  ctx.textAlign = 'left';
  ctx.fillText('HOW TO PLAY', x + 30 * k, y + 34 * k);
  ctx.fillStyle = C.white;
  ctx.font = display(26 * k);
  ctx.fillText('The city answers to hands and wheels', x + 30 * k, y + 66 * k);
  const rows = [
    ['W A S D', 'walk, swim, drive'],
    ['Mouse', 'aim, and hold the left button to fire'],
    ['Shift', 'run on foot, handbrake in a car'],
    ['E', 'take or leave a car'],
    ['1 2 3 4', 'fists, pistol, SMG, shotgun'],
    ['Wheel', 'next weapon you carry'],
    ['Q', 'next radio station'],
    ['M', 'the big map'],
    ['F', 'fullscreen'],
    ['Esc', 'pause and save'],
    ['J', 'call Nina for the next job'],
  ];
  ctx.font = ui(14 * k);
  for (let n = 0; n < rows.length; n += 1) {
    const ry = y + 108 * k + n * 28 * k;
    ctx.fillStyle = C.amber;
    ctx.font = mono(12 * k);
    ctx.fillText(rows[n][0], x + 30 * k, ry);
    ctx.fillStyle = 'rgba(244,240,230,0.8)';
    ctx.font = ui(14 * k);
    ctx.fillText(rows[n][1], x + 170 * k, ry);
  }
  ctx.fillStyle = 'rgba(244,240,230,0.45)';
  ctx.font = ui(11 * k);
  ctx.fillText('Esc or Enter returns', x + 30 * k, y + bh - 24 * k);
  ctx.textAlign = 'left';
}

/** The phone call card that introduces a job. */
export function drawBriefing(ctx, game, cam) {
  const w = cam.width;
  const h = cam.height;
  const k = Math.min(w / 1280, h / 720);
  const mission = game.missions.current;
  if (!mission) return;
  scrim(ctx, w, h, 0.66);
  const bw = Math.min(660 * k, w - 60 * k);
  const bh = 330 * k;
  const x = (w - bw) / 2;
  const y = (h - bh) / 2;
  // The phone, not a plain box.
  ctx.fillStyle = 'rgba(14,16,22,0.94)';
  rr(ctx, x, y, bw, bh, 18 * k);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = C.neon;
  rr(ctx, x + 24 * k, y + 24 * k, 42 * k, 42 * k, 21 * k);
  ctx.fill();
  ctx.fillStyle = '#1a0a12';
  ctx.font = display(18 * k);
  ctx.textAlign = 'center';
  ctx.fillText('☎', x + 45 * k, y + 51 * k);
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(244,240,230,0.55)';
  ctx.font = ui(11 * k);
  ctx.fillText('INCOMING CALL', x + 80 * k, y + 38 * k);
  ctx.fillStyle = C.white;
  ctx.font = display(20 * k);
  ctx.fillText(mission.giver, x + 80 * k, y + 60 * k);
  ctx.fillStyle = C.amber;
  ctx.font = display(12 * k);
  ctx.fillText(`JOB — ${mission.title.toUpperCase()}`, x + 26 * k, y + 100 * k);
  ctx.fillStyle = 'rgba(244,240,230,0.9)';
  ctx.font = ui(14 * k);
  wrapText(ctx, mission.brief, x + 26 * k, y + 126 * k, bw - 52 * k, 20 * k);
  ctx.fillStyle = 'rgba(244,240,230,0.55)';
  ctx.font = mono(11 * k);
  ctx.fillText(`FEE  $${mission.reward}`, x + 26 * k, y + bh - 52 * k);
  ctx.fillStyle = C.cyan;
  ctx.font = ui(12 * k);
  ctx.textAlign = 'right';
  ctx.fillText('Enter — take the job      Esc — not now', x + bw - 26 * k, y + bh - 28 * k);
  ctx.textAlign = 'left';
}

/** Wasted: the hospital bill. */
export function drawWasted(ctx, game, cam) {
  const w = cam.width;
  const h = cam.height;
  const k = Math.min(w / 1280, h / 720);
  const t = clamp(game.wastedTimer / 1.2, 0, 1);
  ctx.fillStyle = `rgba(60,6,12,${0.55 * t})`;
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.font = display(64 * k);
  ctx.fillStyle = `rgba(255,90,105,${t})`;
  ctx.fillText('WASTED', w / 2, h * 0.44);
  ctx.font = ui(15 * k);
  ctx.fillStyle = `rgba(244,240,230,${0.8 * t})`;
  ctx.fillText(`The clinic in Jardines patched you up. It cost $${game.lastFee ?? 250}.`, w / 2, h * 0.52);
  ctx.font = mono(11 * k);
  ctx.fillStyle = `rgba(244,240,230,${0.45 * t})`;
  ctx.fillText('Enter — get up', w / 2, h * 0.58);
  ctx.textAlign = 'left';
}

/** The end of the story. */
export function drawEnding(ctx, game, cam) {
  const w = cam.width;
  const h = cam.height;
  const k = Math.min(w / 1280, h / 720);
  scrim(ctx, w, h, 0.74);
  ctx.textAlign = 'center';
  ctx.fillStyle = C.amber;
  ctx.font = display(12 * k);
  ctx.fillText('THE STORY IS FINISHED', w / 2, h * 0.3);
  ctx.fillStyle = C.white;
  ctx.font = display(56 * k);
  ctx.fillText('Radio Silencio', w / 2, h * 0.4);
  ctx.font = ui(15 * k);
  ctx.fillStyle = 'rgba(244,240,230,0.8)';
  ctx.fillText('Cifuentes is gone, the ledgers are on their way to the coast guard, and the sun still comes up.', w / 2, h * 0.47);
  ctx.fillText(`Money in the bag: $${Math.round(game.player.money).toLocaleString('en-US')}   ·   ${game.player.kills} bodies   ·   ${game.stats.distanceKm.toFixed(1)} km driven`, w / 2, h * 0.52);
  ctx.font = ui(12 * k);
  ctx.fillStyle = 'rgba(244,240,230,0.55)';
  ctx.fillText('The city is still open: steal, drive, and see how long you last at five stars.', w / 2, h * 0.58);
  ctx.fillStyle = C.cyan;
  ctx.font = ui(13 * k);
  ctx.fillText('Enter — keep playing', w / 2, h * 0.66);
  ctx.textAlign = 'left';
}

/** Wrap text into as many lines as it takes. */
export function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 6) {
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
  void lerp;
}
