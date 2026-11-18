/**
 * shots.js — the four staged frames the entry ships as its screenshots. Each
 * scene arranges the real game — this city, these cars, this Guardia, this
 * mission runner, this HUD — and lets it run for a fifth of a second, so the
 * picture is a render of the game's own code and never a mock-up.
 *
 *   ?shot=chase      four stars on Playa Lume at golden hour (the cover)
 *   ?shot=firefight  the marina ambush on the pier, after dark
 *   ?shot=meet       the crew at the Jardines safehouse, with the save prompt
 *   ?shot=map        the whole coast and the six jobs on one page
 *
 * ?shot=drive and ?shot=title still work, for links that point at the older
 * scenes; they are the same city, framed differently.
 */
import {
  TILE, CITY, SIDEWALK, VEHICLE_COLOURS, WEAPONS, SAFEHOUSE,
} from './config.js';

import { Vehicle, policeCar } from './vehicle.js';
import { Ped } from './peds.js';
import { MISSIONS, PLACES } from './missions.js';

/** A car standing on a street, with an optional stripe, wing or hazard lights. */
function carAt(game, x, y, heading, type, colour, speed = 0, opts = {}) {
  const car = new Vehicle({
    type,
    x,
    y,
    h: heading,
    colour,
    stripe: opts.stripe ?? null,
    spoiler: opts.spoiler,
    locked: opts.locked ?? false,
    seed: Math.floor(x + y),
  });
  car.speed = speed;
  car.vx = Math.cos(heading) * speed;
  car.vy = Math.sin(heading) * speed;
  if (opts.driver) car.driver = opts.driver;
  game.vehicles.push(car);
  return car;
}

/** A civilian on the pavement or the sand, watching. */
function pedAt(game, x, y, heading, shirt, role = 'civilian', opts = {}) {
  const ped = new Ped({
    x, y, h: heading,
    block: { i: 0, j: 0, x0: x - 60, y0: y - 60, w: 120 },
    shirt,
    pants: opts.pants ?? '#3a3f48',
    skin: opts.skin ?? '#c98d63',
    hair: '#2a1f1a',
    hat: role === 'tourist',
    bag: role === 'tourist',
    district: opts.district ?? 'beach',
    role,
  });
  ped.state = opts.state ?? 'idle';
  ped.filming = opts.filming ?? 0;
  ped.fear = opts.fear ?? 0;
  if (opts.threat) ped.threat = opts.threat;
  game.peds.list.push(ped);
  return ped;
}

/** A patrol car with an officer in it, already in a unit. */
function patrolCar(game, x, y, heading, speed = 0) {
  const car = policeCar(x, y, heading);
  car.speed = speed;
  car.vx = Math.cos(heading) * speed;
  car.vy = Math.sin(heading) * speed;
  game.vehicles.push(car);
  const unit = {
    kind: 'car', car, x, y, alive: true,
    fireTimer: 0.8, rerouteTimer: 0.4, ram: true, investigate: null,
  };
  car.unit = unit;
  game.police.units.push(unit);
  return car;
}

/** Set the mission panel to a step that will hold while the camera looks. */
function stageMission(game, index, stepIndex, text, marker, timer = 0) {
  const mission = MISSIONS[index];
  game.missions.index = index;
  game.missions.mission = mission;
  game.missions.state = 'active';
  game.missions.step = stepIndex;
  game.missions.text = text;
  game.missions.stepTime = 2;
  game.missions.timer = timer;
  game.missions.wavesLeft = 0;
  game.missions.waveTimer = 999;
  game.missions.marker = marker ?? null;
  game.missions.killTargets = 0;
  game.missions.targets = [];
}

/** The hour, the weather and the frame's caption, in one place per scene. */
function look(game, opts) {
  game.clock.hour = opts.hour;
  game.weather.rain = opts.rain ?? 0;
  game.weather.nextChange = 999;
  game.shotMode.caption = opts.caption;
  game.shotMode.brand = Boolean(opts.brand);
  if (opts.radio !== undefined && game.audio) game.audio.station = opts.radio;
}

/** Stage one of the scenes; unknown names fall back to the cover chase. */
export function stageShot(game, name) {
  game.screen = 'play';
  game.shotMode = { name, controls: {} };
  game.police.clear();
  game.peds.list.length = 0;
  game.enemies.clear();
  game.traffic.cars.length = 0;
  game.vehicles = game.vehicles.filter((car) => car === game.player.veh);
  game.dialogueQueueLines = [];
  game.dialogueLine = null;
  game.banner = null;
  game.hud.toasts.length = 0;
  game.hud.hintTimer = 0;
  game.radio = true;
  const p = game.player;
  p.dead = false;
  p.health = 96;
  p.armour = p.armour || 40;
  p.stamina = 1;
  p.weapons = { fist: true, pistol: true, smg: true, shotgun: true };
  p.ammo = { fist: Infinity, pistol: 64, smg: 120, shotgun: 18 };
  p.money = 8420;
  game.hud.moneyShown = p.money;
  const scene = SCENES[name] ?? SCENES.chase;
  scene(game);
  // Let the staged world settle for a fifth of a second — sirens, tracers,
  // a car rolling into frame — then hold it still so the frame is repeatable.
  for (let n = 0; n < 12; n += 1) game.update(1 / 60);
  // The scene frames itself from the positions the simulation actually
  // reached, which is how the cover keeps the player, the cruisers and the
  // helicopter together at any window size.
  if (typeof game.shotMode.frame === 'function') game.shotMode.frame(game);
  game.effects.texts.length = 0;
  game.shotFrozen = true;
}

const SCENES = {
  // --------------------------------------------------------------- the cover
  // Four stars on the sand at Playa Lume: Rafa's Bravura running north along
  // the water, two cruisers on his tail, one cutting across the beach ahead,
  // the Guardia helicopter overhead and a wrecked cruiser smoking behind.
  chase(game) {
    const p = game.player;
    look(game, {
      hour: 18.12,
      caption: 'PLAYA LUME  ·  18:03  ·  FOUR STARS',
      brand: true,
      radio: 0,
    });
    const px = 1766;
    const py = 1034;
    // Rafa's Bravura, north along the sand with the pier on his right.
    const car = new Vehicle({
      type: 'muscle', x: px, y: py, h: -Math.PI / 2, colour: '#c0362f', seed: 12, hero: true,
      stripe: '#f4e3c8',
    });
    car.driver = 'player';
    car.speed = 30;
    car.vx = 0;
    car.vy = -30;
    game.vehicles.push(car);
    p.veh = car;
    p.onFoot = false;
    p.x = car.x;
    p.y = car.y;
    p.h = car.heading;
    p.aim = -Math.PI / 2 + 0.2;
    p.weapon = 'pistol';
    p.health = 78;
    p.armour = 42;
    p.money = 18420;
    game.hud.moneyShown = p.money;
    // Two cruisers on his tail, one cutting across the sand ahead and one
    // coming down off the beach road to head him off.
    patrolCar(game, px - 5, py + 7, -Math.PI / 2, 31);
    patrolCar(game, px + 9, py + 6, -Math.PI / 2, 27);
    patrolCar(game, px - 6, py - 22, -Math.PI / 2 + 0.12, 19);
    patrolCar(game, px + 17, py - 13, 0.7, 11);
    game.police.heat = 4.15;
    game.police.alerted = true;
    // A cruiser that did not make the turn, still burning on the sand.
    const wreck = carAt(game, px - 21, py - 2, Math.PI * 0.2, 'police', '#f2f4f7', 0);
    wreck.wrecked = true;
    wreck.hp = 0;
    game.effects.smokeColumn(wreck.x, wreck.y, 5);
    game.effects.decal('scorch', wreck.x, wreck.y, { r: 4.2 });
    // The beach's own crowd: some running, some holding a phone up.
    const crowd = [
      [px - 18, py + 12, 'flee'], [px - 22, py + 2, 'film'], [px + 6, py + 14, 'flee'],
      [px + 14, py + 10, 'film'], [px - 14, py - 10, 'flee'], [px + 20, py - 2, 'film'],
      [px + 24, py + 8, 'flee'], [px - 20, py - 14, 'film'], [px + 12, py - 18, 'flee'],
      [px - 10, py + 16, 'film'], [px + 26, py - 12, 'flee'],
    ];
    for (let n = 0; n < crowd.length; n += 1) {
      const [x, y, mood] = crowd[n];
      const ped = pedAt(game, x, y, px > x ? 0 : Math.PI, ['#ff7a8a', '#ffd166', '#6fd3c7', '#f4f1e8'][n % 4], 'tourist', {
        filming: mood === 'film' ? 3 : 0,
        fear: mood === 'flee' ? 1.4 : 0,
        threat: { x: px, y: py },
        state: mood === 'flee' ? 'flee' : 'idle',
      });
      ped.hat = true;
    }
    // Beach furniture, boats, huts and the lifeguard's jeep.
    game.city.props.push({ kind: 'umbrella', x: px - 24, y: py - 26, size: 1.1 });
    game.city.props.push({ kind: 'umbrella', x: px - 18, y: py - 6, size: 1 });
    game.city.props.push({ kind: 'umbrella', x: px + 20, y: py + 4, size: 1.05 });
    game.city.props.push({ kind: 'towel', x: px - 21, y: py - 22, size: 1, angle: 0.3, colour: '#ff7a8a' });
    game.city.props.push({ kind: 'towel', x: px - 15, y: py - 3, size: 1, angle: -0.4, colour: '#6fd3c7' });
    game.city.props.push({ kind: 'towel', x: px + 22, y: py + 7, size: 1, angle: 0.5, colour: '#ffd166' });
    game.city.props.push({ kind: 'hut', x: px - 28, y: py + 8, size: 1 });
    game.city.props.push({ kind: 'hut', x: px - 22, y: py - 30, size: 0.9 });
    game.city.props.push({ kind: 'boat', x: px + 34, y: py - 34, size: 1, angle: -0.4 });
    game.city.props.push({ kind: 'boat', x: px + 40, y: py + 2, size: 1.1, angle: 0.2 });
    game.city.props.push({ kind: 'buoy', x: px + 30, y: py - 6 });
    game.city.props.push({ kind: 'lamp', x: px - 30, y: py - 18 });
    carAt(game, px - 34, py + 18, -0.2, 'van', '#ffd166', 0, { locked: true });
    // Marks of the last few seconds: sand thrown up, tyres, brass, tracers.
    for (let n = 0; n < 22; n += 1) {
      game.effects.spray(px - 4 + (n % 3) * 3, py + 4 + n * 2.6, -Math.PI / 2, 1.2);
    }
    game.effects.decal('skid', px - 1.2, py + 8, { r: 0.3, w: 1.5, angle: -Math.PI / 2 });
    game.effects.decal('skid', px + 1.4, py + 12, { r: 0.3, w: 1.5, angle: -Math.PI / 2 });
    for (let n = 0; n < 8; n += 1) {
      game.effects.shell(px + (Math.random() - 0.5) * 3, py + 2 + Math.random() * 4, -Math.PI / 2);
    }
    game.combat.fire('player', px + 1.2, py - 2.2, -Math.PI / 2 - 0.05, WEAPONS.pistol, true);
    game.combat.fire('cop', px + 6, py + 26, -Math.PI / 2 - 0.08, WEAPONS.pistol);
    game.combat.fire('cop', px - 3, py + 28, -Math.PI / 2 + 0.06, WEAPONS.pistol);
    stageMission(game, 5, 3, 'Reach the lighthouse on Playa Lume', { x: PLACES.lighthouse.x, y: PLACES.lighthouse.y, r: 10 });
    game.shotMode.controls = { throttle: 1, steer: 0, handbrake: false, fire: false, enter: false };
    game.shotMode.frame = (g) => {
      // The flash of the moment the frame holds: the same effect the combat
      // system makes, stamped after the last simulation step.
      g.effects.muzzle(px + 1.4, py - 2.4, -Math.PI / 2 - 0.05);
      g.effects.muzzle(px + 4, py + 22, -Math.PI / 2 - 0.08);
      g.effects.sparks(px + 0.5, py - 6, 5);
      g.camera.setCinematic(px + 2, py - 16, g.camera.width / 82);
    };
  },

  // ------------------------------------------------------------- the ambush
  // Night at Muelle Nueve: the pier over the water, the men who came for
  // Nina, the Guardia arriving behind them and a cruiser's bar lighting the
  // boards.
  firefight(game) {
    const p = game.player;
    look(game, {
      hour: 21.35,
      caption: 'MUELLE NUEVE  ·  21:24  ·  THE AMBUSH',
      radio: 1,
    });
    const px = 1776;
    const py = 692;
    // Rafa on foot at the head of the pier, shotgun up, his car behind him.
    const car = new Vehicle({
      type: 'muscle', x: px - 7, y: py - 8, h: 0.25, colour: '#c0362f', seed: 3,
      stripe: '#f4e3c8',
    });
    car.driver = null;
    game.vehicles.push(car);
    // Cargo on the quay, the lamps, a boat alongside.
    game.city.props.push({ kind: 'container', x: px - 6, y: py - 15, size: 1 });
    game.city.props.push({ kind: 'container', x: px - 8, y: py + 17, size: 1 });
    game.city.props.push({ kind: 'lamp', x: px + 3, y: py - 5 });
    game.city.props.push({ kind: 'lamp', x: 1802, y: 686 });
    game.city.props.push({ kind: 'lamp', x: 1762, y: py + 12 });
    game.city.props.push({ kind: 'boat', x: 1798, y: 712, size: 1, angle: 0.15 });
    game.city.props.push({ kind: 'boat', x: 1812, y: 676, size: 0.9, angle: -0.2 });
    p.veh = null;
    p.onFoot = true;
    p.x = px;
    p.y = py;
    p.h = -0.12;
    p.aim = -0.08;
    p.weapon = 'shotgun';
    p.health = 58;
    p.armour = 18;
    p.stamina = 0.72;
    p.money = 12410;
    game.hud.moneyShown = p.money;
    // The men who came for Nina, along the boards.
    const men = game.enemies.spawn(px + 19, py - 1, 5, { spread: 4, leaderWeapon: 'smg' });
    const marks = [
      [px + 8, py - 2], [px + 11, py + 1], [px + 15, py - 1], [px + 18, py + 2], [px + 13, py + 4],
    ];
    for (let n = 0; n < men.length; n += 1) {
      const man = men[n];
      const [mx, my] = marks[n % marks.length];
      man.x = mx;
      man.y = my;
      man.aim = Math.atan2(p.y - man.y, p.x - man.x);
      man.h = man.aim;
      man.fireTimer = 0.05 + n * 0.11;
    }
    game.missions.track(men);
    // The Guardia on the sand end, and a cruiser with its bar lit.
    patrolCar(game, px - 8, py + 9, -0.3, 5);
    game.police.heat = 3.1;
    game.police.alerted = true;
    for (let n = 0; n < 3; n += 1) {
      const cop = game.police.spawnFoot(px - 8 + n * 4, py + 10 + n * 2);
      if (cop) {
        cop.aim = 0.35;
        cop.fireTimer = 0.4 + n * 0.3;
      }
    }
    // A body on the boards, the brass, the blood, the bullet holes.
    const body = pedAt(game, px + 21, py + 4.4, 1.2, '#2b2f36', 'docker', { state: 'dead', district: 'docks' });
    body.angle = 1.4;
    game.effects.decal('blood', body.x, body.y, { r: 1.3 });
    game.effects.decal('blood', px + 15, py + 1, { r: 0.85 });
    game.effects.decal('skid', px - 7, py + 11, { r: 0.3, w: 1.1, angle: 0.4 });
    for (let n = 0; n < 14; n += 1) {
      game.effects.shell(px + 6 + Math.random() * 12, py + Math.random() * 8, Math.random() * 6);
    }
    game.combat.fire('player', px + 0.9, py - 0.2, -0.08, WEAPONS.shotgun);
    game.combat.fire('thug', px + 13, py - 2, Math.PI + 0.12, WEAPONS.pistol);
    game.combat.fire('thug', px + 25, py - 1, Math.PI - 0.06, WEAPONS.smg);
    game.combat.fire('cop', px - 6, py + 9, -0.2, WEAPONS.pistol);
    stageMission(game, 3, 1, 'Hold the marina', { x: PLACES.marina.x, y: PLACES.marina.y, r: 5 }, 33);
    game.missions.targets = men;
    game.dialogueLine = {
      speaker: 'Nina Solano',
      text: 'Five of them along the boards. Keep them off the car.',
      life: 40,
      max: 40,
    };
    game.shotMode.controls = { fire: false };
    game.shotMode.frame = (g) => {
      g.effects.muzzle(px + 1.0, py - 0.2, -0.08);
      g.effects.muzzle(px + 8, py - 2, Math.PI + 0.12);
      g.effects.muzzle(px + 15, py - 1, Math.PI - 0.06);
      g.effects.sparks(px + 2.6, py - 0.4, 7, '#ffe0a0');
      g.effects.blood(px + 8.6, py + 0.6, Math.PI, 4);
      g.camera.setCinematic(px + 9, py - 1, g.camera.width / 46);
    };
  },

  // ------------------------------------------------------------- the meet
  // Sunday light in Jardines: four cars on the kerb outside Rafa's flat, the
  // crew arguing about paint, and the save prompt on the step.
  meet(game) {
    const p = game.player;
    look(game, {
      hour: 19.55,
      caption: 'JARDINES  ·  19:33  ·  CASA DE RAFA',
      radio: 2,
    });
    // The row of cars: a showroom on a residential street, with the gap in
    // the kerb left for the flat's own door.
    const row = [
      ['sport', '#2f6f8f', SAFEHOUSE.y - 19, '#f4e3c8'],
      ['muscle', '#1d6f6a', SAFEHOUSE.y - 8, '#d8a02a'],
      ['sport', '#7d5ba6', SAFEHOUSE.y + 10, '#f4f1e8'],
      ['sedan', '#d8a02a', SAFEHOUSE.y + 20, null],
    ];
    for (const [type, colour, y, stripe] of row) {
      carAt(game, SAFEHOUSE.x - 4.2, y, -Math.PI / 2, type, colour, 0, { stripe, spoiler: true, locked: true });
    }
    // Rafa's own car, pulled across the street, and Rafa on the step.
    carAt(game, SAFEHOUSE.x - 12.2, SAFEHOUSE.y, 0.42, 'muscle', '#c0362f', 0, {
      stripe: '#f4e3c8', spoiler: true,
    });
    p.veh = null;
    p.onFoot = true;
    p.x = SAFEHOUSE.x + 0.6;
    p.y = SAFEHOUSE.y;
    p.h = -0.4;
    p.aim = -0.4;
    p.health = 100;
    p.armour = 0;
    p.weapon = 'pistol';
    p.money = 15280;
    game.hud.moneyShown = p.money;
    // The crew, standing around the cars and on the step.
    const crew = [
      [SAFEHOUSE.x - 4.8, SAFEHOUSE.y - 15.5, 1.3, '#ffd166'],
      [SAFEHOUSE.x - 7.6, SAFEHOUSE.y - 9.0, -1.2, '#6fd3c7'],
      [SAFEHOUSE.x - 4.2, SAFEHOUSE.y + 7.4, 1.5, '#ff7a8a'],
      [SAFEHOUSE.x - 8.6, SAFEHOUSE.y + 18.5, -1.1, '#f4f1e8'],
      [SAFEHOUSE.x - 0.2, SAFEHOUSE.y - 8.4, 2.2, '#c9a0dc'],
      [SAFEHOUSE.x + 1.0, SAFEHOUSE.y + 9.6, -2.4, '#8fb8e8'],
      [SAFEHOUSE.x + 0.8, SAFEHOUSE.y - 11.2, -2.2, '#ffd166'],
      [SAFEHOUSE.x + 1.1, SAFEHOUSE.y + 11.8, 2.4, '#e8574f'],
    ];
    for (let n = 0; n < crew.length; n += 1) {
      const [x, y, h, shirt] = crew[n];
      pedAt(game, x, y, h, shirt, 'civilian', {
        district: 'residential',
        filming: n === 1 ? 2.6 : 0,
        state: 'idle',
        pants: ['#2f3a4a', '#4a3f35', '#6b6f78'][n % 3],
      });
    }
    // The street keeps its own life: a taxi at the kerb, a sedan across the way.
    game.city.props.push({ kind: 'lamp', x: SAFEHOUSE.x + 3, y: SAFEHOUSE.y - 26 });
    game.city.props.push({ kind: 'lamp', x: SAFEHOUSE.x + 3, y: SAFEHOUSE.y + 24 });
    const taxi = carAt(game, SAFEHOUSE.x - 15.4, SAFEHOUSE.y - 31, Math.PI / 2, 'taxi', '#f2c14b', 0);
    taxi.hazard = 0.9;
    carAt(game, SAFEHOUSE.x - 15.4, SAFEHOUSE.y + 31, Math.PI / 2, 'sedan', '#3f7d92', 0);
    // Between jobs: the HUD shows the next job rather than an active step.
    game.missions.index = 1;
    game.missions.mission = null;
    game.missions.state = 'idle';
    game.missions.step = 0;
    game.missions.text = '';
    game.missions.marker = null;
    game.missions.timer = 0;
    game.police.heat = 0;
    game.police.alerted = false;
    game.shotMode.controls = {};
    game.shotMode.frame = (g) => g.camera.setCinematic(SAFEHOUSE.x - 9, SAFEHOUSE.y + 1, g.camera.width / 86);
  },

  // ------------------------------------------------------------- the map
  // The campaign on one page: five jobs done, the lighthouse job lit, the
  // route across the city and the whole coast under it.
  map(game) {
    const p = game.player;
    look(game, {
      hour: 12.2,
      caption: null,
      radio: 3,
    });
    p.veh = null;
    p.onFoot = true;
    p.x = PLACES.tower.x + 18;
    p.y = PLACES.tower.y - 24;
    p.h = -Math.PI / 2;
    p.aim = -Math.PI / 2;
    p.money = 28450;
    game.hud.moneyShown = p.money;
    game.missions.index = 5;
    game.missions.mission = MISSIONS[5];
    game.missions.state = 'active';
    game.missions.step = 3;
    game.missions.text = 'Reach the lighthouse on Playa Lume';
    game.missions.marker = { x: PLACES.lighthouse.x, y: PLACES.lighthouse.y, r: 10 };
    game.missions.timer = 0;
    game.missions.targets = [];
    game.missions.killTargets = 0;
    // A pair of cruisers working the tower, so the map has live blips.
    patrolCar(game, PLACES.tower.x - 30, PLACES.tower.y + 22, -0.2, 6);
    patrolCar(game, PLACES.tower.x + 44, PLACES.tower.y - 40, Math.PI * 0.8, 4);
    game.police.heat = 2.2;
    game.police.alerted = true;
    for (let n = 0; n < 6; n += 1) {
      pedAt(game, PLACES.tower.x - 10 + n * 5, PLACES.tower.y + 12, -0.4, ['#ff7a8a', '#ffd166', '#6fd3c7'][n % 3], 'civilian', { district: 'downtown' });
    }
    game.screen = 'map';
    game.shotMode.controls = {};
    game.shotMode.frame = (g) => g.camera.setCinematic(g.player.x, g.player.y, g.camera.width / 120);
  },

  // --------------------------------------------------------- the beach run
  // The older drive scene: the coastal boulevard in the late afternoon.
  drive(game) {
    const p = game.player;
    look(game, { hour: 17.2, caption: 'PLAYA LUME  ·  17:12  ·  THE COAST ROAD', radio: 0 });
    const roadX = 17 * TILE;
    const y0 = 7 * TILE;
    const car = new Vehicle({
      type: 'sport', x: roadX - 4.4, y: y0 + 44, h: -Math.PI / 2, colour: '#b8362f', seed: 7,
      stripe: '#f4e3c8',
    });
    car.driver = 'player';
    car.speed = 34;
    car.vx = 0;
    car.vy = -34;
    game.vehicles.push(car);
    p.veh = car;
    p.onFoot = false;
    p.x = car.x;
    p.y = car.y;
    p.money = 12480;
    game.hud.moneyShown = p.money;
    p.armour = 60;
    const lanes = [
      [roadX - 4.4, y0 + 4, Math.PI / 2, 'taxi', '#f2c14b', 16],
      [roadX - 4.4, y0 - 70, Math.PI / 2, 'van', '#3f7d92', 13],
      [roadX + 4.4, y0 + 92, -Math.PI / 2, 'sedan', '#5aa07a', 18],
      [roadX + 4.4, y0 - 40, -Math.PI / 2, 'sport', '#e8433f', 21],
      [roadX - 4.4, y0 + 160, Math.PI / 2, 'muscle', '#3c3f47', 17],
    ];
    for (const [x, y, h, type, colour, speed] of lanes) {
      carAt(game, x, y, h, type, colour, speed);
    }
    for (let n = 0; n < 20; n += 1) {
      pedAt(game, CITY + 24 + (n % 4) * 16, y0 - 80 + n * 15, -Math.PI / 2, ['#ff7a8a', '#ffd166', '#6fd3c7', '#f09d4a', '#c9a0dc'][n % 5], 'tourist');
    }
    for (let n = 0; n < 8; n += 1) {
      pedAt(game, roadX - 16, y0 - 60 + n * 24, n % 2 ? 0 : Math.PI, '#f4f1e8', 'civilian');
    }
    stageMission(game, 3, 0, 'Drive Nina to the marina', { x: PLACES.marina.x, y: PLACES.marina.y, r: 8 });
    game.shotMode.controls = { throttle: 1, steer: 0, handbrake: false, fire: false, enter: false };
    game.shotMode.frame = (g) => g.camera.setCinematic(roadX + 26, y0 + 20, g.camera.width / 150);
  },

  // --------------------------------------------------------------- the title
  // The start screen over a living city, kept for links that use it.
  title(game) {
    look(game, { hour: 19.35, caption: null, radio: 0 });
    game.screen = 'title';
    game.menuIndex = 0;
    const p = game.player;
    p.x = PLACES.home.x;
    p.y = PLACES.home.y;
    p.veh = null;
    p.onFoot = true;
    for (let n = 0; n < 22; n += 1) {
      const side = n % 2 === 0 ? 1 : -1;
      pedAt(game, 10 * TILE + side * 17 + (n % 4) * 2, 7 * TILE + n * 10, side > 0 ? Math.PI : 0, ['#ff7a8a', '#ffd166', '#6fd3c7', '#f4f1e8'][n % 4], 'tourist');
    }
    for (let n = 0; n < 8; n += 1) {
      const x = 11 * TILE + (n % 2 ? -4 : 4);
      carAt(game, x, 6 * TILE + n * 26, n % 2 ? Math.PI / 2 : -Math.PI / 2, ['taxi', 'sedan', 'sport'][n % 3], VEHICLE_COLOURS[n], 9);
    }
    patrolCar(game, 11 * TILE + 12, 8 * TILE, Math.PI, 0);
    game.police.heat = 1.2;
    game.shotMode.controls = {};
    game.shotMode.frame = (g) => g.camera.setCinematic(11 * TILE + 26, 7.7 * TILE, g.camera.width / 300);
  },
};

