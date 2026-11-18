/**
 * game.js — Cala Dorada itself: the world, the clock, the screens and the loop
 * that ties them together. It owns the city, the traffic, the people, the
 * Guardia, the story and the save, answers the keyboard for menus and for Rafa,
 * and hands the whole thing to the renderer and the HUD each frame.
 */
import {
  STEP, PLAYER, WEAPONS, HEAT, TILE, CITY, BEACH, WORLD_H, CAR_TYPES, RADIO_STATIONS, display, SAFEHOUSE, C,
} from './config.js';
import { makeRng, clamp, dist, lerp, hashString } from './random.js';
import { City } from './city.js';
import { RoadGraph, RoadDriver, posX, posY } from './roads.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { Vehicle, parkedVehicle } from './vehicle.js';
import { Traffic } from './traffic.js';
import { Peds, Ped } from './peds.js';
import { Police } from './police.js';
import { Enemies } from './enemies.js';
import { Combat } from './combat.js';
import { Missions, PLACES } from './missions.js';
import { Effects } from './effects.js';
import { Camera } from './camera.js';
import { Hud } from './hud.js';
import { Renderer, rr } from './render.js';
import { Audio } from './audio.js';
import { writeSave, readSave, hasSave, clearSave } from './save.js';
import {
  drawTitle, drawPause, drawControls, drawBriefing, drawWasted, drawEnding,
} from './menu.js';
import { stageShot } from './shots.js';

const VERSION = '1.0.0';

export class Game {
  constructor(canvas, opts = {}) {
    this.version = VERSION;
    this.seed = opts.seed ?? 'cala-dorada';
    this.rng = makeRng(this.seed);
    this.canvas = canvas;
    this.input = new Input();
    this.input.bind(canvas);
    this.city = new City(this.seed);
    this.city.width = CITY + BEACH;
    this.city.height = WORLD_H;
    this.graph = new RoadGraph();
    this.driverClass = RoadDriver;
    this.effects = new Effects();
    this.camera = new Camera(window.innerWidth || 1280, window.innerHeight || 720);
    this.audio = new Audio();
    this.input.onFirstGesture = () => {
      this.audio.start();
      this.audio.setVolume(this.audioVolume);
    };
    this.player = new Player(PLACES.home.x, PLACES.home.y);
    this.vehicles = [];
    this.traffic = new Traffic(this);
    this.peds = new Peds(this);
    this.enemies = new Enemies(this);
    this.police = new Police(this);
    this.combat = new Combat(this);
    this.missions = new Missions(this);
    this.hud = new Hud(this);
    this.renderer = new Renderer(canvas, this);
    this.renderer.resize();
    this.time = 0;
    this.clock = { hour: 10.4 };
    this.weather = { rain: 0, wind: 0.2, nextChange: 90 };
    this.audioVolume = 0.5;
    this.radio = true;
    this.screen = opts.screen ?? 'title';
    this.menuIndex = 0;
    this.menuStack = [];
    this.banner = null;
    this.dialogueLine = null;
    this.dialogueQueueLines = [];
    this.pendingBriefing = false;
    this.bustedProgress = 0;
    this.wastedTimer = 0;
    this.lastFee = PLAYER.respawnFee;
    this.route = [];
    this.routeTimer = 0;
    this.pickups = [];
    this.storyComplete = false;
    this.stats = { distanceKm: 0, shots: 0, crashes: 0, missions: 0 };
    this._cars = [];
    this.noticeLog = [];
    this.shotMode = null;
    this.shotFrozen = false;
    this.paused = false;
    this.accumulator = 0;
    this.lastFrame = 0;
    this.spawnParkedCars();
    this.spawnPickups();
    this.traffic.populate();
    this.peds.populate();
    if (opts.shot) stageShot(this, opts.shot);
    else if (opts.load) this.loadFromSave();
    window.addEventListener('resize', () => this.renderer.resize());
  }

  // ------------------------------------------------------------------ setup
  spawnParkedCars() {
    for (const spot of this.city.parking) {
      const car = parkedVehicle(spot);
      this.vehicles.push(car);
    }
  }

  spawnPickups() {
    const spots = [
      { x: PLACES.bank.x + 30, y: PLACES.bank.y + 20, kind: 'health' },
      { x: PLACES.home.x + 26, y: PLACES.home.y - 20, kind: 'health' },
      { x: PLACES.lockup.x + 20, y: PLACES.lockup.y + 26, kind: 'armour' },
      { x: PLACES.marina.x - 24, y: PLACES.marina.y + 16, kind: 'ammo' },
      { x: PLACES.shops[1].x + 20, y: PLACES.shops[1].y + 18, kind: 'cash' },
      { x: PLACES.tower.x + 40, y: PLACES.tower.y + 30, kind: 'armour' },
    ];
    for (let n = 0; n < spots.length; n += 1) {
      this.pickups.push({
        ...spots[n],
        value: spots[n].kind === 'cash' ? 240 : 1,
        seed: n * 1.7,
        cooldown: 0,
      });
    }
  }

  // --------------------------------------------------------------- the loop
  start(shot = null) {
    this.shotMode = shot;
    this.lastFrame = performance.now();
    const frame = (now) => {
      const raw = Math.min(0.1, (now - this.lastFrame) / 1000);
      this.lastFrame = now;
      this.accumulator += raw;
      let steps = 0;
      while (this.accumulator >= STEP && steps < 4) {
        this.update(STEP);
        this.accumulator -= STEP;
        steps += 1;
        // One fixed step consumes one set of key edges. Clearing once per
        // rendered frame let a slow frame run two steps, so a toggle key
        // undid itself in the same frame: M closed the map and reopened it.
        this.input.endFrame();
      }
      if (steps === 4) this.accumulator = 0;
      this.render();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  update(dt) {
    if (this.shotFrozen) return;
    this.time += dt;
    // The clock runs a day in 24 minutes.
    this.clock.hour = (this.clock.hour + dt / 60) % 24;
    this.updateWeather(dt);
    if (this.shotMode) {
      this.updatePlay(dt);
    } else if (this.screen === 'title') {
      this.updateTitle(dt);
    } else if (this.screen === 'play') {
      this.handlePlayKeys();
      if (this.screen === 'play') this.updatePlay(dt);
    } else {
      this.handlePlayKeys();
      this.updateIdle(dt);
    }
    this.effects.update(dt);
    this.hud.update(dt);
    this.updateDialogue(dt);
    if (this.banner) {
      this.banner.life -= dt;
      if (this.banner.life <= 0) this.banner = null;
    }
    this.updateAudio(dt);
  }

  /** Menus over a city that keeps breathing, slowly. */
  updateIdle(dt) {
    this.traffic.update(dt * 0.2);
    this.peds.update(dt * 0.2);
    this.enemies.update(dt * 0.2);
    this.combat.update(dt * 0.2);
    this._cars = this.collectCars();
    if (this.player.veh) {
      const car = this.player.veh;
      this.camera.update(dt, { x: car.x, y: car.y, vx: 0, vy: 0, speed: 0, veh: car }, this.effects, {});
    } else {
      this.camera.update(dt, { x: this.player.x, y: this.player.y, vx: 0, vy: 0, speed: 0 }, this.effects, { zoom: 1.06 });
    }
  }

  updateTitle(dt) {
    // The city keeps moving behind the title card.
    this.traffic.update(dt);
    this.peds.update(dt);
    this.enemies.update(dt);
    this.police.update(dt);
    this.missions.update(dt);
    this.combat.update(dt);
    this.player.x = PLACES.home.x;
    this.player.y = PLACES.home.y;
    const t = this.time;
    const cx = CITY * 0.62 + Math.sin(t * 0.05) * 190;
    const cy = CITY * 0.5 + Math.cos(t * 0.037) * 150;
    this.camera.setCinematic(cx, cy, clamp(this.camera.width / 230, 4, 12));
    this.traffic.panic(cx, cy, 0);
    this.route = [];
    this.handleMenuKeys();
  }

  updatePlay(dt) {
    const input = this.input;
    const p = this.player;
    const cam = this.camera;
    const aimWorld = cam.screenToWorld(input.mouse.x, input.mouse.y);
    const shot = this.shotMode;
    const controls = shot
      ? { moveX: 0, moveY: 0, run: false, fire: false, enter: false, throttle: 0, steer: 0, handbrake: false, ...shot.controls }
      : {
        moveX: (input.down('KeyD', 'ArrowRight') ? 1 : 0) - (input.down('KeyA', 'ArrowLeft') ? 1 : 0),
        moveY: (input.down('KeyS', 'ArrowDown') ? 1 : 0) - (input.down('KeyW', 'ArrowUp') ? 1 : 0),
        run: input.down('ShiftLeft', 'ShiftRight'),
        fire: input.mouse.down,
        enter: input.hit('KeyE'),
        throttle: (input.down('KeyW', 'ArrowUp') ? 1 : 0) - (input.down('KeyS', 'ArrowDown') ? 1 : 0),
        steer: (input.down('KeyD', 'ArrowRight') ? 1 : 0) - (input.down('KeyA', 'ArrowLeft') ? 1 : 0),
        handbrake: input.down('Space'),
      };
    const before = { x: p.x, y: p.y };
    const events = p.update(dt, controls, aimWorld, this);
    if (events.shot) this.firePlayerWeapon(events.shot, aimWorld);
    if (events.empty && !shot) this.notify('No ammo. Find some.', 'danger');
    if (events.tooFast && !shot) this.notify('Slow down before you step out.', 'info');
    // Standing on the safehouse pad, E puts the game away for next time.
    if (!shot && controls.enter && !events.enteredCar && !events.exitedCar && p.onFoot && this.nearSafehouse()) {
      this.saveAtSafehouse();
    }
    this.stats.distanceKm += dist(before.x, before.y, p.x, p.y) / 1000;
    // Peds and AI.
    this.traffic.update(dt);
    this.peds.update(dt);
    this.enemies.update(dt);
    this.police.update(dt);
    this.missions.update(dt);
    this.combat.update(dt);
    this.checkCarCollisions(dt);
    this.checkPickups(dt);
    this.checkPlayerState(dt);
    // Camera: the player, or the car they are sitting in.
    const target = p.veh ? { x: p.veh.x, y: p.veh.y, vx: p.veh.vx, vy: p.veh.vy, speed: p.veh.speed, veh: p.veh } : p;
    if (!shot) cam.update(dt, target, this.effects, { chase: this.police.stars >= 3 });
    this._cars = this.collectCars();
    this.updateRoute(dt);
  }

  /** Parked cars, traffic, patrol cars and the player's, once per frame. */
  collectCars() {
    const list = this.vehicles.slice();
    for (const car of this.traffic.cars) if (!list.includes(car)) list.push(car);
    for (const unit of this.police.units) {
      if (unit.kind === 'car' && unit.car && !list.includes(unit.car)) list.push(unit.car);
    }
    if (this.missions.courier && !list.includes(this.missions.courier)) list.push(this.missions.courier);
    return list;
  }

  allCars() {
    return this._cars.length ? this._cars : this.collectCars();
  }

  // ------------------------------------------------------------------ input
  handleMenuKeys() {
    const input = this.input;
    if (this.screen === 'title') {
      const items = this.menuItems();
      if (input.hit('ArrowDown') || input.hit('KeyS')) {
        this.menuIndex = (this.menuIndex + 1) % items.length;
        this.audio.ui(true);
      }
      if (input.hit('ArrowUp') || input.hit('KeyW')) {
        this.menuIndex = (this.menuIndex + items.length - 1) % items.length;
        this.audio.ui(false);
      }
      if (input.hit('Enter') || input.hit('Space') || input.mouseTapped) {
        this.chooseTitle(items[this.menuIndex]);
      }
    }
  }

  menuItems() {
    if (this.screen === 'title') {
      const items = [];
      const save = readSave();
      if (save) {
        items.push({
          label: 'Continue',
          note: `${save.district ?? 'Cala Dorada'} · $${Math.round(save.money).toLocaleString('en-US')} · job ${Math.min(6, (save.mission ?? 0) + 1)}`,
          action: 'continue',
        });
      }
      items.push({ label: save ? 'New game' : 'Enter the city', action: 'new' });
      items.push({ label: 'Controls', action: 'controls' });
      items.push({ label: 'About', action: 'about' });
      return items;
    }
    if (this.screen === 'paused') {
      return [
        { label: 'Resume', action: 'resume' },
        { label: 'Save game', note: 'keeps this corner and this job', action: 'save' },
        { label: 'Controls', action: 'controls' },
        { label: 'Quit to title', note: 'unsaved progress is lost', action: 'quit' },
      ];
    }
    return [{ label: 'Back', action: 'resume' }];
  }

  chooseTitle(item) {
    if (!item) return;
    this.audio.start();
    if (item.action === 'continue') {
      this.loadFromSave();
      this.screen = 'play';
      this.notify('Welcome back to Cala Dorada', 'mission');
    } else if (item.action === 'new') {
      clearSave();
      this.newGame();
    } else if (item.action === 'controls') {
      this.previousScreen = 'title';
      this.screen = 'controls';
      this.menuIndex = 0;
    } else if (item.action === 'about') {
      this.screen = 'about';
    }
    this.menuIndex = 0;
    this.audio.ui(true);
  }

  handlePlayKeys() {
    const input = this.input;
    if (this.screen === 'play') {
      if (input.hit('Escape') || input.hit('KeyP')) {
        this.screen = 'paused';
        this.menuIndex = 0;
        this.audio.ui(false);
        return;
      }
      if (input.hit('KeyM')) {
        this.screen = 'map';
        this.audio.ui(true);
        return;
      }
      if (input.hit('KeyF')) {
        // Fullscreen, for the people who want the coast to fill the room.
        const root = document.documentElement;
        if (document.fullscreenElement) document.exitFullscreen?.();
        else root.requestFullscreen?.().catch(() => {});
        return;
      }
      if (input.hit('KeyJ')) {
        this.callNextJob();
        return;
      }
      if (input.hit('KeyQ')) {
        const station = this.audio.nextStation();
        this.notify(`Radio — ${station.name}`, 'info');
        return;
      }
      const map = { Digit1: 'fist', Digit2: 'pistol', Digit3: 'smg', Digit4: 'shotgun' };
      for (const code of Object.keys(map)) {
        if (input.hit(code)) {
          const id = map[code];
          if (this.player.weapons[id]) {
            this.player.weapon = id;
            this.audio.ui(true);
          } else {
            this.notify(`No ${WEAPONS[id].name} yet`, 'info');
          }
        }
      }
      // The mouse wheel walks the weapons Rafa actually owns.
      if (input.mouse.wheel) {
        const owned = ['pistol', 'smg', 'shotgun'].filter((id) => this.player.weapons[id]);
        if (owned.length) {
          const at = owned.indexOf(this.player.weapon);
          const next = owned[(at + (input.mouse.wheel > 0 ? 1 : owned.length - 1)) % owned.length];
          this.player.weapon = next;
          this.audio.ui(input.mouse.wheel > 0);
        }
      }
      return;
    }
    if (this.screen === 'paused') {
      const items = this.menuItems();
      if (input.hit('ArrowDown') || input.hit('KeyS')) {
        this.menuIndex = (this.menuIndex + 1) % items.length;
        this.audio.ui(true);
      }
      if (input.hit('ArrowUp') || input.hit('KeyW')) {
        this.menuIndex = (this.menuIndex + items.length - 1) % items.length;
        this.audio.ui(false);
      }
      if (input.hit('Enter') || input.mouseTapped) {
        const item = items[this.menuIndex];
        if (item.action === 'resume') {
          this.screen = 'play';
          this.audio.ui(true);
        } else if (item.action === 'save') {
          this.saveGame();
          this.notify('Game saved', 'good');
        } else if (item.action === 'controls') {
          this.previousScreen = 'paused';
          this.screen = 'controls';
        } else if (item.action === 'quit') {
          this.screen = 'title';
          this.menuIndex = 0;
        }
      }
      if (input.hit('Escape')) this.screen = 'play';
      return;
    }
    if (this.screen === 'controls') {
      if (input.hit('Escape') || input.hit('Enter') || input.mouseTapped) {
        this.screen = this.previousScreen ?? 'paused';
        this.menuIndex = 0;
      }
      return;
    }
    if (this.screen === 'map') {
      if (input.hit('KeyM') || input.hit('Escape') || input.mouseTapped) this.screen = 'play';
      return;
    }
    if (this.screen === 'briefing') {
      if (input.hit('Enter') || input.hit('KeyJ')) {
        this.screen = 'play';
        this.missions.begin();
        this.audio.mission();
        this.hud.hintTimer = 9;
      } else if (input.hit('Escape') || input.mouseTapped) {
        this.screen = 'play';
      }
      return;
    }
    if (this.screen === 'ending') {
      if (input.hit('Enter') || input.mouseTapped) this.screen = 'play';
    }
  }

  callNextJob() {
    if (this.missions.state === 'active') {
      this.notify('Finish the job you have', 'info');
      return;
    }
    if (!this.missions.current) {
      this.notify('Nothing left to do but drive', 'info');
      return;
    }
    this.screen = 'briefing';
    this.pendingBriefing = true;
  }

  // ------------------------------------------------------------------- play
  firePlayerWeapon(id, aimWorld) {
    const p = this.player;
    const spec = WEAPONS[id];
    const origin = p.veh
      ? { x: p.veh.x + Math.cos(p.aim) * (p.veh.len * 0.4), y: p.veh.y + Math.sin(p.aim) * (p.veh.len * 0.4) }
      : p.muzzle();
    if (id === 'fist') {
      this.combat.melee('player', p.x, p.y, p.aim);
      this.effects.kick(0.08);
      return;
    }
    this.combat.fire('player', origin.x, origin.y, p.aim, spec, Boolean(p.veh));
    this.stats.shots += 1;
    if (this.police.stars > 0 || this.police.heat > 0) this.police.crime(HEAT.hitCop * 0.08);
    void aimWorld;
  }

  checkCarCollisions(dt) {
    const p = this.player;
    if (!p.veh) return;
    const mine = p.veh;
    for (const car of this.allCars()) {
      if (car === mine) continue;
      const d = dist(car.x, car.y, mine.x, mine.y);
      if (d > (car.len + mine.len) * 0.55) continue;
      // Separate the pair and trade momentum.
      const nx = (mine.x - car.x) / (d || 1);
      const ny = (mine.y - car.y) / (d || 1);
      const overlap = (car.len + mine.len) * 0.5 - d;
      mine.x += nx * overlap * 0.5;
      mine.y += ny * overlap * 0.5;
      car.x -= nx * overlap * 0.5;
      car.y -= ny * overlap * 0.5;
      const rel = Math.hypot(mine.vx - car.vx, mine.vy - car.vy);
      if (rel > 4) {
        this.stats.crashes += 1;
        this.audio.crash(mine.x, mine.y, clamp(rel / 22, 0.2, 1));
        this.effects.sparks(mine.x + nx * 1.2, mine.y + ny * 1.2, Math.min(12, Math.round(rel * 0.6)));
        if (rel > 11) this.effects.debris(mine.x, mine.y, mine.heading, 5);
        mine.hurt(rel * 0.7);
        if (car.driver) this.damageCar(car, rel * 1.1, 'player', car.x, car.y);
        this.effects.kick(clamp(rel / 40, 0.06, 0.6));
        mine.vx *= 0.62;
        mine.vy *= 0.62;
        car.vx *= 0.62;
        car.vy *= 0.62;
        if (car.lane) car.lane.speed *= 0.6;
        if (car.driver && car.driverKind !== 'police' && Math.random() < 0.4) this.ejectDriver(car);
        if (this.police.stars > 0) this.police.crime(HEAT.hitCopCar * 0.2);
      }
    }
    void dt;
  }

  checkPickups(dt) {
    const p = this.player;
    for (const pick of this.pickups) {
      if (pick.cooldown > 0) {
        pick.cooldown -= dt;
        continue;
      }
      if (dist(p.x, p.y, pick.x, pick.y) > 1.6) continue;
      if (pick.kind === 'cash') {
        p.addMoney(pick.value, this);
        this.audio.pickup('cash');
      } else if (pick.kind === 'health') {
        p.heal(40);
        this.audio.pickup('health');
        this.notify('First aid', 'good');
      } else if (pick.kind === 'armour') {
        p.addArmour(50);
        this.audio.pickup('armour');
        this.notify('Armour', 'good');
      } else {
        p.giveWeapon('smg', 120);
        this.audio.pickup('ammo');
        this.notify('Sierra SMG and a box of rounds', 'good');
      }
      pick.cooldown = 45;
      this.effects.floatText(pick.x, pick.y - 1.2, pick.kind === 'cash' ? `+$${pick.value}` : '+', '#c9f0a8', 1.3);
    }
  }

  checkPlayerState(dt) {
    const p = this.player;
    if (p.dead && this.wastedTimer <= 0) {
      this.wastedTimer = 0.0001;
      this.lastFee = 0;
      this.audio.explosion(p.x, p.y);
      this.effects.kick(1);
      setTimeout(() => { this.wastedTimer = Math.max(this.wastedTimer, 0.02); }, 30);
    }
    if (this.wastedTimer > 0) {
      this.wastedTimer += dt;
      if (this.wastedTimer > 1.4 && (this.input.hit('Enter') || this.input.mouseTapped)) this.respawn();
    }
    // Falling in the sea is a swim, not a death; but a car in the sea is a ruin.
    if (p.veh && this.city.inWater(p.veh.x, p.veh.y)) {
      this.damageCar(p.veh, 90 * dt, 'water', p.veh.x, p.veh.y);
      p.hurt(8 * dt, { kind: 'water' }, this);
    }
  }

  respawn() {
    const p = this.player;
    const fee = Math.min(p.money, PLAYER.respawnFee);
    p.money -= fee;
    this.lastFee = fee;
    p.dead = false;
    p.health = PLAYER.maxHealth;
    p.armour = 0;
    p.x = PLACES.bank.x - 60;
    p.y = PLACES.bank.y - 40;
    p.vx = 0;
    p.vy = 0;
    p.veh = null;
    p.onFoot = true;
    p.deathTimer = 0;
    this.wastedTimer = 0;
    this.police.clear();
    this.missions.fail('You were wasted.');
    this.camera.x = p.x;
    this.camera.y = p.y;
    this.screen = 'play';
    this.notify(`The clinic took $${fee}`, 'danger');
  }

  busted(unit) {
    const p = this.player;
    const fee = Math.min(p.money, 180);
    p.money -= fee;
    p.veh = null;
    p.onFoot = true;
    p.x = PLACES.tower.x - 40;
    p.y = PLACES.tower.y + 60;
    p.vx = 0;
    p.vy = 0;
    if (p.weapons.smg) { p.weapons.smg = false; p.ammo.smg = 0; }
    if (p.weapons.shotgun) { p.weapons.shotgun = false; p.ammo.shotgun = 0; }
    p.weapon = 'pistol';
    this.police.clear();
    this.missions.fail('The Guardia put you in a cell.');
    this.bustedProgress = 0;
    this.banner = { title: 'BUSTED', sub: `Bail and a fine: $${fee}. Your heavy weapons are gone.`, colour: '#7fb6ef', life: 3.4 };
    this.audio.siren(p.x, p.y, 1);
    this.camera.x = p.x;
    this.camera.y = p.y;
    void unit;
  }

  // ------------------------------------------------------------- callbacks
  nearestEnterableCar(x, y, r) {
    let best = null;
    let bestD = r;
    for (const car of this.vehicles) {
      if (car.wrecked) continue;
      const d = dist(x, y, car.x, car.y) - car.len * 0.3;
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  isOpenLane(x, y, r) {
    for (const car of this.allCars()) {
      if (dist(car.x, car.y, x, y) < r) return true;
    }
    return false;
  }

  ejectDriver(car) {
    if (!car.driver || car.driver === 'player') return;
    const angle = car.heading + Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1);
    const ped = new Ped({
      x: car.x + Math.cos(angle) * 1.4,
      y: car.y + Math.sin(angle) * 1.4,
      h: angle,
      block: { i: 0, j: 0, x0: car.x - 0, y0: car.y - 0, w: 6 },
      shirt: '#e8e2d4', pants: '#3a3f48', skin: '#c98d63',
      district: 'downtown',
    });
    ped.fear = 1.4;
    ped.threat = { x: car.x, y: car.y };
    ped.state = 'flee';
    this.peds.list.push(ped);
    car.driver = null;
    car.lane = null;
  }

  onEnterCar(car, wasOccupied) {
    this.audio.start();
    if (car.alarm > 0) car.alarm = 0;
    if (wasOccupied || car.locked) {
      this.police.crime(HEAT.carjack, car.x, car.y);
      this.notify('Grand theft auto, as the paperwork calls it', 'danger');
      this.effects.kick(0.1);
    }
    this.hud.hintTimer = Math.min(this.hud.hintTimer, 4);
    this.audio.ui(true);
  }

  onExitCar(car) {
    void car;
    this.audio.ui(false);
  }

  onCrash(car, impact) {
    if (impact.speed < 6) return;
    this.stats.crashes += 1;
    this.audio.crash(car.x, car.y, clamp(impact.speed / 24, 0.2, 1));
    this.effects.sparks(car.x, car.y, Math.min(14, Math.round(impact.speed * 0.7)));
    this.effects.kick(clamp(impact.speed / 40, 0.05, 0.5));
    if (impact.speed > 14) {
      this.effects.glass(car.x, car.y, 6, car.heading);
      this.effects.debris(car.x, car.y, car.heading, 7);
      this.player.hurt(Math.max(0, impact.speed - 22) * 0.8, { kind: 'crash' }, this);
    }
    // Anyone standing in the way is thrown.
    for (const ped of this.peds.near(car.x, car.y, 3)) {
      this.peds.hit(ped, impact.speed * 1.8, car.heading);
      this.police.crime(HEAT.hitPed * 0.5);
    }
  }

  damageCar(car, amount, source, x, y, silent = false) {
    if (car.wrecked) return;
    const destroyed = car.hurt(amount);
    if (!silent && amount > 8) {
      this.effects.sparks(x ?? car.x, y ?? car.y, 4);
    }
    if (destroyed) {
      this.explodeCar(car);
      if (source === 'player') this.police.crime(HEAT.explosion);
    }
  }

  explodeCar(car) {
    if (car.exploded) return;
    car.exploded = true;
    car.wrecked = true;
    car.hp = 0;
    this.combat.blast(car.x, car.y, 8.5, 62);
    this.audio.explosion(car.x, car.y);
    this.police.crime(HEAT.explosion * 0.8);
    if (car.driver && car.driver !== 'player') this.ejectDriver(car);
    if (car === this.player.veh) {
      this.player.hurt(45, { kind: 'explosion' }, this);
      this.player.veh = null;
      this.player.onFoot = true;
    }
    // It burns for a while, then goes quiet.
    setTimeout(() => {
      car.exploded = false;
      car.hp = 0;
    }, 200);
  }

  onPedKilled(ped) {
    this.player.kills += 1;
    this.police.crime(HEAT.killPed, ped.x, ped.y);
    this.pickups.push({
      x: ped.x, y: ped.y, kind: 'cash', value: 20 + Math.floor(Math.random() * 7) * 10,
      seed: Math.random() * 6, cooldown: 0, dropped: true,
    });
    this.peds.scare(ped.x, ped.y, 34);
    this.effects.floatText(ped.x, ped.y - 1, 'DOWN', '#ffb3b3', 1.1);
  }

  onPedShot(ped, owner, damage) {
    void damage;
    if (owner === 'player') {
      this.police.crime(ped.state === 'dead' ? HEAT.killPed * 0.4 : HEAT.hitPed * 0.4);
      this.police.hearShot(ped.x, ped.y);
    }
  }

  onPlayerHurt(source) {
    void source;
    this.hud.hintTimer = 0;
  }

  onCopShoots(unit) {
    void unit;
    this.police.lastSeen = this.time;
  }

  onCopKilled(unit) {
    this.player.copKills += 1;
    this.police.crime(HEAT.killCop);
    this.pickups.push({
      x: unit.x, y: unit.y, kind: 'ammo', value: 1, seed: Math.random() * 6, cooldown: 0, dropped: true,
    });
    this.effects.floatText(unit.x, unit.y - 1, 'OFFICER DOWN', '#ffd166', 1.1);
  }

  onThugKilled(thug) {
    this.player.kills += 1;
    this.effects.floatText(thug.x, thug.y - 1.2, thug.boss ? 'DON DOWN' : 'DOWN', '#ffd166', thug.boss ? 1.6 : 1.1);
    if (thug.boss) {
      this.banner = { title: 'CIFUENTES IS DOWN', sub: 'Leave the tower. The coast is about to answer.', colour: '#ffc14d', life: 3.2 };
      this.audio.mission();
    }
    // He drops what he carried.
    if (Math.random() < 0.45) {
      this.pickups.push({
        x: thug.x + 1, y: thug.y + 0.6, kind: 'ammo', value: 1, seed: Math.random() * 6, cooldown: 0, dropped: true,
      });
    }
  }

  onMissionComplete(mission, reward) {
    this.stats.missions += 1;
    this.banner = {
      title: 'MISSION PASSED',
      sub: `${mission.title}  ·  $${reward.toLocaleString('en-US')}`,
      colour: '#ffc14d',
      life: 4.2,
    };
    this.audio.mission();
    this.player.health = PLAYER.maxHealth;
  }

  onMissionFailed(reason) {
    this.banner = { title: 'MISSION FAILED', sub: reason, colour: '#ff6b7a', life: 3.6 };
    this.audio.ui(false);
  }

  onMissionReady() {
    if (!this.missions.current) return;
    this.notify(`Nina has another job — press J`, 'mission');
  }

  onStoryComplete() {
    this.storyComplete = true;
    this.screen = 'ending';
    this.banner = null;
    this.audio.mission();
    this.saveGame();
  }

  // ----------------------------------------------------------- bookkeeping
  notify(text, kind = 'info') {
    this.hud.toast(text, kind);
    this.noticeLog.unshift({ text, kind, t: this.time });
    if (this.noticeLog.length > 30) this.noticeLog.pop();
  }

  /** True when Rafa is standing on the safehouse pad in Jardines. */
  nearSafehouse(radius = SAFEHOUSE.radius) {
    const p = this.player;
    if (!p || p.dead) return false;
    return Math.hypot(p.x - SAFEHOUSE.x, p.y - SAFEHOUSE.y) < radius;
  }

  /** Save at the flat. The prompt the safehouse frame shows calls this. */
  saveAtSafehouse() {
    const data = this.saveGame();
    if (!data) {
      this.notify('The flat could not write the save', 'danger');
      return null;
    }
    this.notify(`Saved at ${SAFEHOUSE.name}`, 'good');
    this.effects.floatText(SAFEHOUSE.x, SAFEHOUSE.y - 2.4, 'SAVED', '#9df0b4', 1.6);
    this.audio.saveChime();
    return data;
  }

  dialogue(speaker, text, seconds = 4) {
    this.dialogueQueueLines.push({ speaker, text, seconds });
  }

  dialogueQueue(lines) {
    for (const [speaker, text] of lines) this.dialogue(speaker, text, 4.4);
    if (this.dialogueQueueLines.length > 8) this.dialogueQueueLines.splice(0, this.dialogueQueueLines.length - 8);
  }

  updateDialogue(dt) {
    if (this.dialogueLine) {
      this.dialogueLine.life -= dt;
      if (this.dialogueLine.life <= 0) this.dialogueLine = null;
    }
    if (!this.dialogueLine && this.dialogueQueueLines.length && this.screen === 'play') {
      const next = this.dialogueQueueLines.shift();
      this.dialogueLine = { ...next, life: next.seconds, max: next.seconds };
    }
  }

  updateWeather(dt) {
    this.weather.nextChange -= dt;
    if (this.weather.nextChange <= 0) {
      this.weather.nextChange = 150 + Math.random() * 240;
      const want = this.rng.chance(0.22) ? 1 : 0;
      this.weather.rain = want;
      if (want) this.notify('A squall is coming off the sea', 'info');
    }
    if (this.weather.rain > 0 && this.weather.rain < 1) this.weather.rain = Math.min(1, this.weather.rain + dt * 0.4);
    if (this.weather.rain === 0) this.weather.rain = 0;
    this.weather.rain = this.weather.rain > 0 ? Math.min(1, this.weather.rain) : 0;
    if (this.shotMode && this.shotMode.rain) this.weather.rain = this.shotMode.rain;
  }

  updateRoute(dt) {
    this.routeTimer -= dt;
    if (this.routeTimer > 0) return;
    this.routeTimer = 0.6;
    const m = this.missions.marker;
    if (!m) {
      this.route = [];
      return;
    }
    const from = this.graph.nearestNode(this.player.x, this.player.y);
    const to = this.graph.nearestNode(m.x, m.y);
    const nodes = this.graph.path(from, to) ?? [from];
    this.route = nodes.map((n) => ({ x: posX(n), y: posY(n) }));
    this.route.push({ x: m.x, y: m.y });
  }

  updateAudio(dt) {
    const p = this.player;
    let siren = 0;
    for (const unit of this.police.units) {
      const ux = unit.kind === 'car' ? unit.car?.x : unit.x;
      const uy = unit.kind === 'car' ? unit.car?.y : unit.y;
      if (ux === undefined) continue;
      siren = Math.max(siren, clamp(1 - dist(ux, uy, p.x, p.y) / 70, 0, 1));
    }
    this.audio.listener = { x: p.x, y: p.y };
    const heli = this.police.heli;
    const heliNear = heli ? clamp(1 - dist(heli.x, heli.y, p.x, p.y) / 240, 0, 1) : 0;
    this.audio.update(dt, {
      x: p.x, y: p.y,
      speed: p.veh ? p.veh.speed : 0,
      inCar: Boolean(p.veh),
      siren,
      heli: heliNear,
      // The radio is in the car, and on the step at the safehouse.
      radio: this.radio && (Boolean(p.veh) || this.nearSafehouse(14)),
      menu: this.screen === 'title',
    });
  }

  saveGame() {
    return writeSave(this);
  }

  newGame() {
    this.player = new Player(PLACES.home.x, PLACES.home.y);
    this.player.money = 480;
    this.player.weapons = { fist: true, pistol: true, smg: false, shotgun: false };
    this.player.ammo = { fist: Infinity, pistol: 64, smg: 0, shotgun: 0 };
    this.missions.index = 0;
    this.missions.completed = 0;
    this.missions.state = 'idle';
    this.missions.mission = null;
    this.police.clear();
    this.enemies.clear();
    this.clock.hour = 10.4;
    this.screen = 'play';
    this.storyComplete = false;
    this.camera.x = this.player.x;
    this.camera.y = this.player.y;
    this.dialogueQueueLines = [];
    this.dialogueLine = null;
    this.hud.toast('Cala Dorada. Press J to call Nina.', 'mission');
    this.audio.mission();
    this.saveGame();
  }

  loadFromSave() {
    const save = readSave();
    if (!save) {
      this.newGame();
      return;
    }
    const p = this.player;
    p.x = save.x;
    p.y = save.y;
    p.money = save.money ?? p.money;
    p.health = save.health ?? p.health;
    p.armour = save.armour ?? 0;
    p.weapons = save.weapons ?? p.weapons;
    p.ammo = save.ammo ?? p.ammo;
    p.weapon = save.weapon ?? 'pistol';
    p.kills = save.kills ?? 0;
    this.missions.index = save.mission ?? 0;
    this.missions.completed = save.completed ?? 0;
    this.missions.state = 'idle';
    this.missions.mission = null;
    this.clock.hour = save.hour ?? 10.4;
    if (typeof save.radio === 'number' && this.audio) this.audio.station = clamp(save.radio, 0, RADIO_STATIONS.length - 1);
    if (typeof save.elapsed === 'number') this.time = save.elapsed;
    if (typeof save.rain === 'number') this.weather.rain = clamp(save.rain, 0, 1);
    this.storyComplete = Boolean(save.story);
    this.camera.x = p.x;
    this.camera.y = p.y;
    this.screen = 'play';
    this.notify('Loaded. The city has been waiting.', 'mission');
  }

  // ---------------------------------------------------------------- render
  render() {
    const ctx = this.renderer.ctx;
    const cam = this.camera;
    this.renderer.draw();
    if (this.screen === 'title') {
      drawTitle(ctx, this, cam);
    } else if (this.screen === 'play' || this.screen === 'map' || this.screen === 'briefing' || this.screen === 'ending' || this.screen === 'controls') {
      this.hud.draw(ctx, cam, this.input);
      if (this.screen === 'play' && this.wastedTimer > 0) drawWasted(ctx, this, cam);
      if (this.screen === 'map') this.hud.drawBigMap(ctx, this, Math.min(cam.width / 1280, cam.height / 720), cam.width, cam.height);
      if (this.screen === 'briefing') drawBriefing(ctx, this, cam);
      if (this.screen === 'ending') drawEnding(ctx, this, cam);
      if (this.screen === 'paused') drawPause(ctx, this, cam);
      if (this.screen === 'controls') drawControls(ctx, this, cam);
    } else if (this.screen === 'paused') {
      this.hud.draw(ctx, cam, this.input);
      drawPause(ctx, this, cam);
    } else if (this.screen === 'about') {
      this.hud.draw(ctx, cam, this.input);
      this.drawAbout(ctx, cam);
    }
    if (this.shotMode && this.shotMode.caption) this.drawCaption(ctx, cam, this.shotMode.caption);
    if (this.shotMode && this.shotMode.brand) this.drawBrand(ctx, cam);
    void rr;
    void display;
    void lerp;
  }

  drawAbout(ctx, cam) {
    const w = cam.width;
    const h = cam.height;
    const k = Math.min(w / 1280, h / 720);
    ctx.fillStyle = 'rgba(8,10,14,0.86)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffc14d';
    ctx.font = display(11 * k);
    ctx.textAlign = 'center';
    ctx.fillText('ABOUT', w / 2, h * 0.28);
    ctx.fillStyle = '#f7f2e7';
    ctx.font = display(34 * k);
    ctx.fillText('Cala Dorada', w / 2, h * 0.36);
    ctx.font = '400 14px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(244,240,230,0.8)';
    const lines = [
      'An open-world crime game of my own invention: a coral city on a warm coast,',
      'six jobs for the Solano crew, cars to steal, a Guardia that remembers your face,',
      'and a sun that goes down whether you are finished or not.',
      '',
      'Everything you see and hear is generated by the game’s own code: no downloads,',
      'no borrowed art, no borrowed music. Keyboard and mouse, desktop browser.',
      '',
      'Press Enter or Esc to go back.',
    ];
    for (let n = 0; n < lines.length; n += 1) {
      ctx.fillText(lines[n], w / 2, h * 0.44 + n * 22 * (k * 0.9));
    }
    ctx.textAlign = 'left';
    if (this.input.hit('Enter') || this.input.hit('Escape') || this.input.mouseTapped) {
      this.screen = 'title';
      this.menuIndex = 0;
    }
  }

  drawCaption(ctx, cam, caption) {
    const k = Math.min(cam.width / 1280, cam.height / 720);
    ctx.save();
    ctx.font = '600 ' + (11 * k) + 'px ui-sans-serif, system-ui, sans-serif';
    if (this.shotMode?.brand) {
      // Under the cover wordmark, where no panel or speedometer lives.
      const bw = ctx.measureText(caption).width + 30 * k;
      ctx.fillStyle = 'rgba(8,10,14,0.55)';
      rr(ctx, cam.width / 2 - bw / 2, 88 * k, bw, 24 * k, 12 * k);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,241,220,0.88)';
      ctx.textAlign = 'center';
      ctx.fillText(caption, cam.width / 2, 104 * k);
    } else {
      ctx.fillStyle = 'rgba(8,10,14,0.6)';
      rr(ctx, cam.width - 356 * k, cam.height - 54 * k, 330 * k, 30 * k, 6 * k);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,241,220,0.9)';
      ctx.textAlign = 'right';
      ctx.fillText(caption, cam.width - 24 * k, cam.height - 34 * k);
    }
    ctx.restore();
  }

  /** The wordmark the cover frame carries, between the two top panels. */
  drawBrand(ctx, cam) {
    const w = cam.width;
    const k = Math.min(w / 1280, cam.height / 720);
    const cx = w / 2;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(8,10,14,0.5)';
    rr(ctx, cx - 176 * k, 18 * k, 352 * k, 64 * k, 10 * k);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,214,150,0.22)';
    ctx.lineWidth = 1;
    ctx.stroke();
    const face = ctx.createLinearGradient(cx, 30 * k, cx, 62 * k);
    face.addColorStop(0, '#fff4dc');
    face.addColorStop(1, '#ffbe86');
    ctx.fillStyle = face;
    ctx.font = display(27 * k);
    ctx.fillText('CALA DORADA', cx, 50 * k);
    ctx.fillStyle = C.neon;
    ctx.font = display(8.5 * k);
    ctx.fillText('A  SUN-SOAKED  CRIME  STORY', cx, 68 * k);
    ctx.textAlign = 'left';
    ctx.restore();
  }
}

export { hasSave, RADIO_STATIONS, CAR_TYPES, TILE, display, hashString };
