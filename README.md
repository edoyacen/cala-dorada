[![make.fun gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/c/gta6-01)
[![rank](https://make.fun/badge/gta6-01/edoyacen/cala-dorada/rank.svg)](https://make.fun/c/gta6-01)
[![reward](https://make.fun/badge/gta6-01/edoyacen/cala-dorada/reward.svg)](https://make.fun/c/gta6-01)

# Cala Dorada — a sun-soaked crime story

An open-world crime game for the browser: a fictional Caribbean city of eighteen
by eighteen blocks, played from above with keyboard and mouse. You are Rafa
Quintero, a driver out of the Jardines, and the coast belongs to the Cifuentes
family until you take it off them — six jobs, five wanted stars, four radio
stations, one long golden hour.

Everything is drawn and synthesised by the game's own code — no textures, no
audio files, no libraries, no network request. `game/` is static files: serve the
folder and open `game/index.html` (the modules are fetched, so it needs a server
rather than `file://`).

## Play

```bash
node serve.ts            # serves game/ at http://localhost:8080
```

or open `game/index.html` through any static file server. A desktop Chrome or
Chromium is what it is built for.

## What is in it

- **A city.** A deterministic street grid with downtown towers, beach hotels,
  the docks, the Jardines and an industrial edge: parks, plazas, parking lots,
  piers, a lighthouse, lifeguard towers, a beach bar, rooftop pools, awnings,
  neon, signal heads on every corner. Buildings are extruded, so the camera sees
  their walls, and every roof has its own seeded clutter.
- **Driving.** Six vehicles with arcade handling, tyre smoke, skids, damage,
  wrecks and debris. Traffic drives lanes with lights, brakes for the car ahead,
  pulls over for a lit cruiser and puts its hazards on; you can steal any car on
  the street, including a patrol car.
- **People.** Pedestrians walk the pavements, dodge traffic, flee gunfire,
  scream about it, and stop to film a chase on a phone. The beach is full of
  tourists under umbrellas.
- **The law.** Five wanted stars, patrol cars that cut through the street graph
  to head you off, officers on foot, roadblocks, a busted timer, and from four
  stars a **Guardia helicopter** — a real aircraft that orbits the chase, on
  foot or in a car, with a rotor, navigation lights and a searchlight that
  follows you.
- **Guns.** Fists, a pistol, an SMG and a shotgun, with tracers, muzzle flash,
  blood, decals and blast damage that catches cars and bystanders.
- **Six missions and a story**, each with a briefing, dialogue, objectives that
  change (go, steal, deliver, hold, chase, escape), a payout and a job marker on
  the map.
- **A HUD** with a live circular minimap, route, blips, wanted stars and their
  meaning, money, clock, district, health, armour, stamina, weapon, a speedometer
  and a radio card with a live equaliser.
- **Night and weather**, a day that runs in twenty-four minutes, rain squalls,
  golden-hour light with long shadows and a warm bloom off the water, street
  lamps and neon after dark, and a searchlight over the sand.
- **Four radio stations**, synthesised in WebAudio, plus engines, sirens, rotor
  thump, shots, horns and explosions.
- **Saving** to localStorage from the pause menu and from the **safehouse in
  Jardines** — stand on the pad outside Rafa's flat and the prompt says so.

## Controls

| | |
| --- | --- |
| `W A S D` / arrows | walk, and drive |
| `Shift` | run (drains stamina), handbrake in a car |
| mouse | aim, `left click` fire |
| `E` | take or leave a car, or save at the safehouse |
| `Space` | handbrake |
| `1` `2` `3` `4` | fists, pistol, SMG, shotgun |
| mouse wheel | next weapon you carry |
| `Q` | next radio station |
| `M` | the big map |
| `F` | fullscreen |
| `J` | call the next job |
| `Esc` | pause, save, quit |

## Layout

```
game/index.html      the page: one canvas and the boot overlay
game/src/            the game, one job per module
  config.js          every tuned number and colour, the safehouse, the helicopter
  city.js            the city generator, its landmarks and walkable point helper
  roads.js           street graph, A*, lane follower, signals
  vehicle.js         vehicle physics, trim, parking
  player.js          the player on foot and behind the wheel, with stamina
  traffic.js         civilian drivers that yield to the law
  peds.js            pedestrians, and the ones filming the chase
  enemies.js         Cifuentes' men
  police.js          heat, patrols, the busted timer and the helicopter
  combat.js          bullets, melee and blasts
  missions.js        the six missions, their sites and their runner
  render.js          the painter: coast, extruded city, cars, aircraft, light
  hud.js             minimap, stars, vitals, radio, the map and its job list
  menu.js            title, pause, briefings, endings
  audio.js           synthesised sound, the rotor and the radio
  save.js            localStorage saves, v1 and v2
  shots.js           the four staged frames the screenshots come from
  main.js            boot
main.ts              checks and copies game/ and screenshots/, writes dossier.json
serve.ts             a small static server for playing it locally
screenshots/         four frames of the game running (the first is the cover)
vendor/              make.fun's dossier library, vendored
```

## Screenshots

Taken from the game's own shot mode, which arranges the real systems — this
city, these cars, this Guardia, this mission runner, this HUD — lets the
simulation run for a fifth of a second, then freezes the frame:

| file | what it shows |
| --- | --- |
| `01-playa-lume-pursuit.jpg` | the cover: four stars, four cruisers, the helicopter and its searchlight on the sand at golden hour, the lighthouse job live, SOL 98.4 on the radio |
| `02-marina-firefight.jpg` | the marina ambush after dark: shotgun, five of Cifuentes' men on the pier, a lit cruiser and the Guardia closing in |
| `03-safehouse-meet.jpg` | the crew at the Jardines safehouse, four cars on the kerb and the real `E — save` prompt on the step |
| `04-city-map.jpg` | the whole coast on one page: five jobs done, the sixth lit, the route, the districts and the job list |

Run them yourself with `?shot=chase`, `?shot=firefight`, `?shot=meet` and
`?shot=map` (`?shot=drive` and `?shot=title` are kept for older links). The
scene names are read in `game/src/shots.js`.

## License

MIT. See `LICENSE`. Cala Dorada is an original work: the city, the people, the
cars, the story, the art and the music are made for it.
