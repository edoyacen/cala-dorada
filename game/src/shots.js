/**
 * shots.js — the four staged frames the entry ships as its screenshots. Each
 * scene arranges the real game — this city, these cars, this Guardia, this
 * mission runner, this HUD — and lets it run, so the picture is a render of the
 * game's own code and never a mock-up.
 *
 *   ?shot=chase      three stars on the coastal boulevard at dusk (the cover)
 *   ?shot=drive      the beach road in the afternoon, from behind the wheel
 *   ?shot=firefight  the marina ambush on foot, at night
 *   ?shot=title      the start screen over a living city
 */
import {
  TILE, CITY, BEACH, VEHICLE_COLOURS, ROAD, SIDEWALK,
} from './config.js';

const ROAD_HALF = ROAD / 2;
import { Vehicle, policeCar } from './vehicle.js';
import { Ped } from './peds.js';
import { MISSIONS, PLACES } from './missions.js';

/** A car standing on a street. */
function carAt(game, x, y, heading, type, colour, speed = 0) {
  const car = new Vehicle({ type, x, y, h: heading, colour, seed: Math.floor(x + y) });
  car.speed = speed;
  car.vx = Math.cos(heading) * speed;
  car.vy = Math.sin(heading) * speed;
  game.vehicles.push(car);
  return car;
}

/** A civilian on the pavement, watching. */
function pedAt(game, x, y, heading, shirt, role = 'civilian') {
  const ped = new Ped({
    x, y, h: heading,
    block: { i: 0, j: 0, x0: x - 60, y0: y - 60, w: 120 },
    shirt,
    pants: '#3a3f48',
    skin: '#c98d63',
    hair: '#2a1f1a',
    hat: role === 'tourist',
    bag: role === 'tourist',
    district: 'beach',
    role,
  });
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

/** Stage one of the four scenes; unknown names fall back to the chase. */
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
  game.hud.toasts.length = 0;
  game.hud.hintTimer = 0;
  const p = game.player;
  p.dead = false;
  p.health = 96;
  p.armour = p.armour || 40;
  p.weapons = { fist: true, pistol: true, smg: true, shotgun: true };
  p.ammo = { fist: Infinity, pistol: 64, smg: 120, shotgun: 18 };
  p.money = 8420;
  game.hud.moneyShown = p.money;
  const scene = SCENES[name] ?? SCENES.chase;
  scene(game);
  // Let the staged world settle for a fifth of a second — sirens, tracers,
  // a car rolling into frame — then hold it still so the frame is repeatable.
  for (let n = 0; n < 12; n += 1) game.update(1 / 60);
  game.effects.texts.length = 0;
  game.shotFrozen = true;
}

const SCENES = {
  // --------------------------------------------------------------- the cover
  chase(game) {
    const p = game.player;
    game.clock.hour = 16.15;
    game.weather.rain = 0;
    const roadX = 17 * TILE;
    const y0 = 8 * TILE;
    // Rafa's Bravura, northbound on the coastal boulevard.
    const car = new Vehicle({
      type: 'muscle', x: roadX + 4.4, y: y0 + 10, h: -Math.PI / 2, colour: '#c0362f', seed: 12,
    });
    car.driver = 'player';
    car.speed = 26;
    car.vx = 0;
    car.vy = -26;
    game.vehicles.push(car);
    p.veh = car;
    p.onFoot = false;
    p.x = car.x;
    p.y = car.y;
    p.aim = -Math.PI / 2;
    p.weapon = 'pistol';
    // Two patrol cars on his tail and one waiting at the corner ahead.
    patrolCar(game, roadX + 4.4, y0 + 30, -Math.PI / 2, 27);
    patrolCar(game, roadX - 4.4, y0 + 20, -Math.PI / 2, 29);
    patrolCar(game, roadX + 11, y0 - 18, Math.PI * 0.62, 6);
    patrolCar(game, roadX - 12, y0 - 30, Math.PI * 0.4, 0);
    game.police.heat = 3.2;
    game.police.alerted = true;
    // Traffic on both sides of the boulevard.
    const traffic = [
      [roadX - 4.4, y0 - 26, Math.PI / 2, 'sedan', '#f4f1e8', 11],
      [roadX - 4.4, y0 + 52, Math.PI / 2, 'taxi', '#f2c14b', 13],
      [roadX + 4.4, y0 - 44, -Math.PI / 2, 'van', '#2f6f8f', 10],
      [roadX - 4.4, y0 + 96, Math.PI / 2, 'sport', '#e2e6ea', 15],
      [roadX + 4.4, y0 + 62, -Math.PI / 2, 'sedan', '#8f2f43', 9],
      [roadX + 26, y0 + 12, -Math.PI / 2, 'muscle', '#1d6f6a', 0],
    ];
    for (const [x, y, h, type, colour, speed] of traffic) {
      carAt(game, x, y, h, type, colour, speed);
    }
    // People on the pavements, watching the chase go by.
    for (let n = 0; n < 16; n += 1) {
      const side = n % 2 === 0 ? 1 : -1;
      pedAt(
        game,
        roadX + side * (ROAD_HALF + SIDEWALK * 0.7) + (n % 3) * 1.2,
        y0 - 30 + n * 6.5,
        side > 0 ? Math.PI : 0,
        ['#ff7a8a', '#ffd166', '#6fd3c7', '#f4f1e8'][n % 4],
        n % 3 === 0 ? 'tourist' : 'civilian',
      );
    }
    // Tracers in the air and the marks of the last minute.
    game.combat.fire('cop', roadX + 4.4, y0 + 44, -Math.PI / 2 + 0.05, { damage: 11, rate: 4, range: 46, spread: 0.02, speed: 220, sound: 'pistol' });
    game.effects.sparks(roadX + 5, y0 + 26, 8);
    game.effects.decal('skid', roadX + 6.2, y0 + 34, { r: 0.3, w: 1.3, angle: -Math.PI / 2 });
    game.effects.decal('skid', roadX + 2.4, y0 + 20, { r: 0.3, w: 1.3, angle: -Math.PI / 2 });
    stageMission(game, 4, 1, 'Hold the bank lobby', { x: PLACES.bank.x, y: PLACES.bank.y, r: 8 }, 38);
    game.camera.setCinematic(car.x + 34, car.y + 4, game.camera.width / 190, 0);
    game.route = [
      { x: roadX, y: y0 - 10 }, { x: roadX, y: 7 * TILE }, { x: 8 * TILE, y: 7 * TILE },
      { x: 6 * TILE, y: 7 * TILE }, { x: PLACES.bank.x, y: PLACES.bank.y },
    ];
    game.shotMode.controls = { throttle: 1, steer: 0, handbrake: false, fire: false, enter: false };
  },

  // ------------------------------------------------------------ the beach run
  drive(game) {
    const p = game.player;
    game.clock.hour = 17.9;
    game.weather.rain = 0;
    const roadX = 17 * TILE;
    const y0 = 7 * TILE;
    const car = new Vehicle({
      type: 'sport', x: roadX - 4.4, y: y0 + 44, h: -Math.PI / 2, colour: '#b8362f', seed: 7,
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
    // Traffic along the beach road.
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
    // Sunbathers and walkers along the sand and the pavement.
    for (let n = 0; n < 20; n += 1) {
      pedAt(
        game,
        CITY + 24 + (n % 4) * 16,
        y0 - 80 + n * 15,
        -Math.PI / 2,
        ['#ff7a8a', '#ffd166', '#6fd3c7', '#f09d4a', '#c9a0dc'][n % 5],
        'tourist',
      );
    }
    for (let n = 0; n < 8; n += 1) {
      pedAt(game, roadX - 16, y0 - 60 + n * 24, n % 2 ? 0 : Math.PI, '#f4f1e8', 'civilian');
    }
    stageMission(game, 3, 0, 'Drive Nina to the marina', { x: PLACES.marina.x, y: PLACES.marina.y, r: 8 });
    game.route = [
      { x: roadX, y: y0 + 40 }, { x: roadX, y: 8 * TILE },
      { x: PLACES.marina.x, y: PLACES.marina.y },
    ];
    game.camera.setCinematic(roadX + 60, y0 + 22, game.camera.width / 232, 0);
    game.shotMode.controls = { throttle: 1, steer: 0, handbrake: false, fire: false, enter: false };
  },

  // --------------------------------------------------------------- the ambush
  firefight(game) {
    const p = game.player;
    game.clock.hour = 20.9;
    game.weather.rain = 0;
    // Rafa on foot at the marina, shotgun up, his car behind him.
    const car = new Vehicle({
      type: 'muscle', x: PLACES.marina.x - 14, y: PLACES.marina.y + 12, h: -0.5, colour: '#c0362f', seed: 3,
    });
    car.driver = null;
    game.vehicles.push(car);
    p.veh = null;
    p.onFoot = true;
    p.x = PLACES.marina.x - 2;
    p.y = PLACES.marina.y + 13;
    p.h = -0.4;
    p.aim = -0.2;
    p.weapon = 'shotgun';
    p.health = 62;
    p.armour = 20;
    p.money = 6410;
    game.hud.moneyShown = p.money;
    // The men who came for Nina.
    const men = game.enemies.spawn(PLACES.marina.x + 12, PLACES.marina.y - 3, 4, { spread: 6 });
    for (const man of men) {
      man.aim = Math.atan2(p.y - man.y, p.x - man.x) + 0.1;
      man.h = man.aim;
      man.fireTimer = 0.4 + Math.random() * 0.3;
    }
    game.missions.track(men);
    // Officers on the perimeter, and a patrol car with its lights on.
    const patrol = patrolCar(game, PLACES.marina.x - 20, PLACES.marina.y + 18, -0.4, 4);
    void patrol;
    game.police.heat = 2.2;
    game.police.alerted = true;
    for (let n = 0; n < 2; n += 1) {
      const cop = game.police.spawnFoot(PLACES.marina.x - 6 + n * 4, PLACES.marina.y + 22 + n * 3);
      if (cop) cop.aim = 0.6;
    }
    // A body on the boards, and the mess of the last minute.
    const body = pedAt(game, PLACES.marina.x + 10, PLACES.marina.y + 9, 1.2, '#2b2f36');
    body.state = 'dead';
    body.angle = 1.4;
    game.effects.decal('blood', body.x, body.y, { r: 1.3 });
    game.effects.decal('blood', PLACES.marina.x + 8, PLACES.marina.y + 2, { r: 0.9 });
    game.effects.decal('skid', PLACES.marina.x - 6, PLACES.marina.y + 16, { r: 0.3, w: 1.1, angle: 0.4 });
    for (let n = 0; n < 10; n += 1) {
      game.effects.shell(PLACES.marina.x + Math.random() * 5, PLACES.marina.y + Math.random() * 5, Math.random() * 6);
    }
    stageMission(game, 3, 1, 'Hold the marina', { x: PLACES.marina.x, y: PLACES.marina.y, r: 8 }, 33);
    game.missions.targets = men;
    game.route = [];
    game.camera.setCinematic(PLACES.marina.x + 6, PLACES.marina.y + 4, game.camera.width / 74, 0);
    game.dialogueLine = {
      speaker: 'Nina Solano',
      text: 'Four of them, coming around the containers. Do not let them near the car.',
      life: 40,
      max: 40,
    };
    game.shotMode.controls = { fire: false };
  },

  // --------------------------------------------------------------- the title
  title(game) {
    game.clock.hour = 19.35;
    game.weather.rain = 0;
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
    game.camera.setCinematic(11 * TILE + 26, 7.7 * TILE, game.camera.width / 300, 0);
    game.shotMode.controls = {};
  },
};

export { BEACH };
