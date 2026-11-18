/**
 * missions.js — the story of Cala Dorada: six jobs for Nina Solano that start
 * with a stolen Coral and end on the roof of the Aurora tower. Each mission is
 * data: a list of steps that the runner watches (go here, take that car, put
 * these men down, hold out, lose the Guardia), with the dialogue, the ambush
 * and the reward each step carries.
 */
import { TILE, CITY, BEACH, HEAT } from './config.js';
import { dist, clamp } from './random.js';
import { Vehicle } from './vehicle.js';
import { lanePolyline } from './roads.js';

const P = (i, j, dx = 0, dy = 0) => ({ x: i * TILE + dx, y: j * TILE + dy });

const NINA = 'Nina Solano';
const RAFA = 'Rafa';
const TAVO = 'Tavo';
const CUERVA = 'La Cuerva';
const CIFUENTES = 'Cifuentes';

/** Where the story happens. */
export const PLACES = {
  beachStage: { x: CITY + BEACH * 0.5, y: TILE * 8.4 },
  lockup: P(2, 10, 46, 40),
  shops: [P(6, 5, 30, 66), P(3, 9, 66, 30), P(9, 3, 30, 40)],
  courier: P(7, 7, 30, 70),
  marina: { x: CITY + 30, y: TILE * 7.2 },
  bank: P(6, 6, 40, 40),
  airstrip: P(1, 1, 40, 40),
  tower: P(7, 7, 10, 10),
  lighthouse: { x: CITY + BEACH * 0.55, y: TILE * 3.5 },
  home: P(9, 10, 30, 30),
};

/** The six missions, in the order the story tells them. */
export const MISSIONS = [
  {
    id: 'bienvenido',
    title: 'Bienvenido a Casa',
    giver: NINA,
    brief: 'Nina has work the day you get back. Meet her on the sand, then bring a car to the lockup.',
    reward: 250,
    intro: [
      [NINA, 'Rafa Cordero. Two years and you still walk like the tide owes you money.'],
      [RAFA, 'Nice to see you too, Nina.'],
      [NINA, 'Save it. There is a Coral parked by the Malecón. Bring it to the lockup in Muelle Nueve and we talk business.'],
    ],
    steps: [
      { type: 'goto', at: PLACES.beachStage, r: 7, text: 'Meet Nina at the beach stage' },
      { type: 'steal', text: 'Take a car — any car' },
      { type: 'deliver', at: PLACES.lockup, r: 9, text: 'Deliver the car to the Muelle Nueve lockup' },
    ],
    outro: [
      [NINA, 'Not a scratch. Tavo will like you.'],
      [TAVO, 'I like anybody who brings me a gearbox that is not on fire.'],
    ],
  },
  {
    id: 'cobros',
    title: 'Cobros',
    giver: NINA,
    brief: 'Three shops on the route owe the Solano crew. Collect, and do not let the last one talk you into a fight. He will try.',
    reward: 420,
    intro: [
      [NINA, 'Three shops owe us this week. Aurora Centro, Jardines, then the kiosk by the marina.'],
      [RAFA, 'And if they pay in complaints?'],
      [NINA, 'Then you come back with the money and a story.'],
    ],
    steps: [
      { type: 'goto', at: PLACES.shops[0], r: 6, text: 'Collect at the Aurora Centro shop', enter: (g) => g.notify('The shopkeeper counts out $180', 'money') },
      { type: 'goto', at: PLACES.shops[1], r: 6, text: 'Collect at the Jardines grocer', enter: (g) => g.notify('The grocer pays without a word', 'money') },
      {
        type: 'goto',
        at: PLACES.shops[2],
        r: 6,
        text: 'Collect at the marina kiosk',
        enter: (g) => {
          g.dialogue('Kiosk owner', 'I paid Cifuentes already. He says the Solanos are finished.', 4.2);
        },
      },
      {
        type: 'kill',
        text: 'Deal with the kiosk owner’s friends',
        enter: (g) => {
          g.missions.track(g.enemies.spawn(PLACES.shops[2].x, PLACES.shops[2].y, 3, { spread: 7 }));
          g.notify('Three men, one alley. Keep moving.', 'danger');
        },
        count: 3,
      },
      { type: 'escape', text: 'Lose the Guardia' },
    ],
    outro: [
      [NINA, 'Cifuentes is buying the marina, one kiosk at a time. That is what this is.'],
      [RAFA, 'Then we take something of his.'],
    ],
  },
  {
    id: 'salcromo',
    title: 'Sal y Cromo',
    giver: TAVO,
    brief: 'A courier in a Vulcano GT is carrying a case of Cifuentes’ paper. Stop the car, take the case, and be gone before the Guardia writes it down.',
    reward: 700,
    intro: [
      [TAVO, 'White Vulcano, chrome wheels, drives like his licence is a rumour. He has a case in the boot.'],
      [RAFA, 'What is in the case?'],
      [TAVO, 'Paper that says Cifuentes owns half the beach. Nina wants it wet with his tears.'],
    ],
    steps: [
      {
        type: 'goto',
        at: PLACES.courier,
        r: 10,
        text: 'Find the white Vulcano',
        enter: (g) => g.missions.startCourier(),
      },
      { type: 'chase', text: 'Stop the courier’s Vulcano' },
      {
        type: 'goto',
        at: (g) => ({ x: g.missions.courier?.x ?? 0, y: g.missions.courier?.y ?? 0 }),
        r: 4.5,
        text: 'Take the case from the car',
        onFoot: true,
        enter: (g) => {
          g.police.crime(2.0);
          g.notify('The case is yours. So is the Guardia.', 'danger');
        },
      },
      { type: 'escape', text: 'Lose the Guardia' },
    ],
    outro: [
      [NINA, 'Deeds, permits, a harbour that does not exist. This is a city for sale.'],
      [RAFA, 'Then we buy it back with his money.'],
    ],
  },
  {
    id: 'muellelargo',
    title: 'El Muelle Largo',
    giver: NINA,
    brief: 'Drive Nina to the marina to meet a man about a boat. Cifuentes sends his answer with four men and a shotgun.',
    reward: 900,
    intro: [
      [NINA, 'The marina, and drive like the sea is behind us.'],
      [RAFA, 'It usually is.'],
      [NINA, 'The man with the boat is called Ferrer. If he is not there, the men waiting are the message.'],
    ],
    steps: [
      { type: 'goto', at: PLACES.marina, r: 8, text: 'Drive Nina to the marina' },
      {
        type: 'survive',
        time: 42,
        text: 'Hold the marina',
        enter: (g) => {
          g.missions.wave(4, PLACES.marina, 9);
          g.police.crime(1.0);
          g.dialogue(NINA, 'Four of them, coming around the containers. Do not let them near the car.', 4.6);
        },
        waves: [18, 4],
      },
      { type: 'escape', text: 'Get clear of the Guardia' },
    ],
    outro: [
      [NINA, 'Ferrer is dead. That boat was our way out of this city.'],
      [RAFA, 'Then we do not run. We take the tower.'],
    ],
  },
  {
    id: 'mareaalta',
    title: 'Marea Alta',
    giver: CUERVA,
    brief: 'The Banco del Sur keeps Cifuentes’ ledgers in a room on the second floor. La Cuerva can open the door; you keep it open.',
    reward: 1800,
    intro: [
      [CUERVA, 'Two minutes in the lobby and I own the building’s cameras. Four minutes and I own its secrets.'],
      [RAFA, 'And the Guardia?'],
      [CUERVA, 'They will be there in three. Bring something that makes a noise.'],
    ],
    steps: [
      { type: 'goto', at: PLACES.bank, r: 8, text: 'Drive to the Banco del Sur' },
      {
        type: 'survive',
        time: 58,
        text: 'Hold the bank lobby',
        enter: (g) => {
          g.police.crime(3.0);
          g.dialogue(CUERVA, 'I am in. Keep the door shut for a minute and we are rich.', 4.4);
          g.missions.wave(3, PLACES.bank, 12);
        },
        waves: [30, 3],
      },
      { type: 'goto', at: PLACES.airstrip, r: 9, text: 'Reach the airstrip at Cerro Seco' },
      { type: 'escape', text: 'Lose the Guardia' },
    ],
    outro: [
      [CUERVA, 'Ledgers, names, payments to a man called Cifuentes. Every judge on the coast is on his list.'],
      [NINA, 'Then so is the tower. Tonight.'],
    ],
  },
  {
    id: 'radiosilencio',
    title: 'Radio Silencio',
    giver: NINA,
    brief: 'Cifuentes is in the Aurora tower with his last six men. Go up, take the ledgers back, and end this. Then get to the lighthouse before the whole city answers.',
    reward: 5000,
    intro: [
      [NINA, 'The tower. Cifuentes is on the roof with his last six.'],
      [RAFA, 'And after?'],
      [NINA, 'After, you drive to the lighthouse and you do not stop for anybody. I will be listening to the radio.'],
    ],
    steps: [
      { type: 'goto', at: PLACES.tower, r: 9, text: 'Drive to the Aurora tower' },
      {
        type: 'kill',
        text: 'Clear Cifuentes’ guards',
        enter: (g) => {
          const guards = g.enemies.spawn(PLACES.tower.x, PLACES.tower.y, 6, { spread: 12, weapon: 'pistol', health: 80 });
          for (const guard of guards) guard.bravery = 1.1;
          g.missions.track(guards);
          g.dialogue(CIFUENTES, 'Solano sends the boy from the docks. Shoot him and throw the body in the bay.', 4.8);
        },
        count: 6,
      },
      {
        type: 'kill',
        text: 'Take down Don Cifuentes',
        enter: (g) => {
          const boss = g.enemies.spawn(PLACES.tower.x, PLACES.tower.y, 1, {
            spread: 3, weapon: 'smg', health: 260, name: CIFUENTES, boss: true, shirt: '#e9e2d2',
          });
          g.missions.track(boss);
          g.missions.boss = boss[0];
          g.dialogue(CIFUENTES, 'You cannot shoot the man who pays the coast.', 4.2);
        },
        count: 1,
      },
      {
        type: 'goto',
        at: PLACES.lighthouse,
        r: 10,
        text: 'Reach the lighthouse on Playa Lume',
        enter: (g) => {
          g.police.crime(4.0);
          g.notify('Every unit on the coast is answering', 'danger');
        },
      },
      { type: 'escape', text: 'Lose the Guardia one last time' },
    ],
    outro: [
      [NINA, 'Radio Silencio is off the air. The coast is ours, Rafa.'],
      [RAFA, 'For tonight.'],
    ],
    finale: true,
  },
];

export class Missions {
  constructor(game) {
    this.game = game;
    this.index = 0;
    this.state = 'idle';       // idle | intro | active | complete | done
    this.step = 0;
    this.stepTime = 0;
    this.timer = 0;
    this.marker = null;
    this.text = '';
    this.killTargets = 0;
    this.kills = 0;
    this.boss = null;
    this.courier = null;
    this.waveTimer = 0;
    this.wavesLeft = 0;
    this.waveSize = 0;
    this.waveAt = null;
    this.targets = [];
    this.failed = false;
    this.completed = 0;
    this.difficulty = 1;
    this.mission = null;
  }

  get current() {
    return MISSIONS[this.index] ?? null;
  }

  get active() {
    return this.state === 'active' || this.state === 'intro';
  }

  /** Begin the next mission; called from the phone prompt or the start screen. */
  begin() {
    if (this.state === 'active') return;
    const mission = this.current;
    if (!mission) {
      this.state = 'done';
      return;
    }
    this.mission = mission;
    this.state = 'active';
    this.step = 0;
    this.stepTime = 0;
    this.kills = 0;
    this.killTargets = 0;
    this.failed = false;
    this.difficulty = clamp(1 + Math.floor(this.index / 2), 1, 3);
    this.game.dialogueQueue(mission.intro ?? []);
    this.game.notify(`MISSION — ${mission.title}`, 'mission');
    this._enterStep();
  }

  /** The step's own setup: spawn the ambush, place the marker. */
  _enterStep() {
    const mission = this.mission;
    const step = mission?.steps[this.step];
    if (!step) return;
    this.stepTime = 0;
    this.timer = step.type === 'survive' ? step.time : 0;
    this.text = step.text ?? '';
    this.kills = 0;
    if (step.count) this.killTargets = step.count;
    this.targets = [];
    const at = typeof step.at === 'function' ? step.at(this.game) : step.at;
    this.marker = at ? { x: at.x, y: at.y, r: step.r ?? 7 } : null;
    if (step.enter) step.enter(this.game, this);
    if (step.type === 'survive') {
      this.timer = step.time;
      this.wavesLeft = step.waves ? 1 : 0;
      this.waveTimer = step.waves?.[0] ?? step.time;
    }
    if (step.type === 'chase' && this.courier) {
      this.marker = { x: this.courier.x, y: this.courier.y, r: 6, moving: true };
    }
  }

  /** The white Vulcano the third mission chases. */
  startCourier() {
    if (this.courier) return this.courier;
    const at = PLACES.courier;
    const car = new Vehicle({
      type: 'sport', x: at.x, y: at.y, h: this.game.player.h, colour: '#f4f1e8', driver: 'ai', seed: 90210,
    });
    const nodes = this.game.graph.randomPath(this.game.graph.nearestNode(at.x, at.y), 6, this.game.rng);
    car.follow(new (this.game.driverClass)(lanePolyline(nodes, 5), { maxSpeed: 40, speed: 16 }));
    car.courier = true;
    this.courier = car;
    this.game.vehicles.push(car);
    this.game.dialogue(TAVO, 'There he goes. Do not lose the chrome.', 3.4);
    return car;
  }

  /** Spawn a group of Cifuentes' men around a point. */
  wave(count, at, spread = 8) {
    return this.game.enemies.spawn(at.x, at.y, count, { spread });
  }

  /** The men a `kill` step is waiting on. */
  track(men) {
    this.targets = (this.targets ?? []).concat(men);
    this.killTargets = this.targets.length;
    return men;
  }

  /** One fixed step of the mission logic. */
  update(dt) {
    const game = this.game;
    const player = game.player;
    if (this.state !== 'active') return;
    const mission = this.mission;
    const step = mission.steps[this.step];
    if (!step) {
      this.complete();
      return;
    }
    this.stepTime += dt;
    if (player.dead) {
      this.fail('You were wasted.');
      return;
    }
    // A moving marker follows its car.
    if (step.type === 'chase' && this.courier) {
      this.marker = { x: this.courier.x, y: this.courier.y, r: 6, moving: true };
    }
    const at = typeof step.at === 'function' ? step.at(game) : step.at;
    switch (step.type) {
      case 'goto':
      case 'deliver': {
        const p = at ?? this.marker;
        if (!p) break;
        const d = dist(player.x, player.y, p.x, p.y);
        const inCar = Boolean(player.veh);
        const okCar = step.type !== 'deliver' || inCar || d < 3;
        if (d < (step.r ?? 7) && okCar) {
          if (step.type === 'deliver' && player.veh) {
            game.notify('Delivery made', 'good');
            player.addMoney(60, game);
          }
          this.next();
        }
        break;
      }
      case 'steal': {
        if (player.veh && player.veh.speed > 1) {
          game.dialogue(NINA, 'That is the one. The lockup, Muelle Nueve.', 3.6);
          this.next();
        }
        break;
      }
      case 'kill': {
        if (this.aliveTargets() === 0 && this.stepTime > 0.8) {
          game.notify('Clear', 'good');
          this.next();
        }
        break;
      }
      case 'chase': {
        const car = this.courier;
        if (!car) {
          this.next();
          break;
        }
        car.courierTimer = (car.courierTimer ?? 0) + dt;
        // The courier keeps driving until the player stops him or wrecks him.
        if (car.lane && (car.lane.done || Math.random() < dt * 0.25)) {
          const node = game.graph.nearestNode(car.x, car.y);
          const nodes = game.graph.randomPath(node, 4, game.rng);
          if (nodes.length > 1) {
            car.lane.setPath(lanePolyline(nodes, 5));
            car.lane.maxSpeed = 36 + this.difficulty * 4;
          }
        }
        if (car.wrecked || (car.speed < 3 && dist(player.x, player.y, car.x, car.y) < 16)) {
          game.notify('The Vulcano is stopped. Get the case.', 'good');
          this.marker = { x: car.x, y: car.y, r: 4.2 };
          this.next();
        }
        break;
      }
      case 'survive': {
        this.timer -= dt;
        this.waveTimer -= dt;
        const p = at ?? this.marker;
        if (this.wavesLeft > 0 && this.waveTimer <= 0) {
          this.wavesLeft -= 1;
          this.waveTimer = step.time;
          this.wave(step.waves?.[1] ?? 3, p ?? player, 12);
          game.dialogue(NINA, 'More of them. Keep your head down.', 3.2);
        }
        if (this.timer <= 0) {
          game.notify('You held them off', 'good');
          this.next();
        }
        break;
      }
      case 'escape': {
        if (game.police.heat <= 0.05) {
          game.notify('The coast is quiet', 'good');
          this.next();
        }
        break;
      }
      default:
        this.next();
    }
  }

  /** How many of this step's men are still standing. */
  aliveTargets() {
    if (!this.targets || this.targets.length === 0) return 0;
    return this.targets.filter((man) => man.alive).length;
  }

  next() {
    this.step += 1;
    if (this.step >= this.mission.steps.length) {
      this.complete();
      return;
    }
    this._enterStep();
  }

  complete() {
    const game = this.game;
    const mission = this.mission;
    if (!mission || this.state !== 'active') return;
    this.state = 'complete';
    this.marker = null;
    const reward = mission.reward;
    game.player.addMoney(reward, game);
    game.onMissionComplete(mission, reward);
    for (const [speaker, line] of mission.outro ?? []) game.dialogue(speaker, line, 4.6);
    if (mission.finale) {
      this.state = 'done';
      game.onStoryComplete();
    } else {
      this.index += 1;
      this.completed += 1;
      this.state = 'idle';
      this.mission = null;
      this.text = '';
      game.onMissionReady();
    }
    game.saveGame();
  }

  fail(reason) {
    if (this.state !== 'active') return;
    this.state = 'idle';
    this.failed = true;
    this.marker = null;
    this.text = '';
    this.mission = null;
    this.game.onMissionFailed(reason);
  }

  /** The objective line for the HUD. */
  objective() {
    if (this.state !== 'active') return null;
    if (!this.mission) return null;
    const step = this.mission.steps[this.step];
    if (!step) return null;
    let extra = '';
    if (step.type === 'survive') extra = `${Math.ceil(Math.max(0, this.timer))}s`;
    if (step.type === 'kill') extra = `${this.aliveTargets()} left`;
    return {
      title: this.mission.title,
      text: step.text ?? '',
      extra,
      distance: this.marker ? Math.round(dist(this.game.player.x, this.game.player.y, this.marker.x, this.marker.y)) : null,
    };
  }
}

export { HEAT };
