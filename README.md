[![make.fun gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/c/gta6-01)
[![rank](https://make.fun/badge/gta6-01/edoyacen/cala-dorada/rank.svg)](https://make.fun/c/gta6-01)
[![reward](https://make.fun/badge/gta6-01/edoyacen/cala-dorada/reward.svg)](https://make.fun/c/gta6-01)

# Cala Dorada — a sun-soaked crime story

An open-world crime game for the browser: a fictional Caribbean city of eighteen
by eighteen blocks, played from above with keyboard and mouse. You are Rafa
Quintero, a driver out of the Jardines, and the city belongs to the Cifuentes
family until you take it off them.

Everything is drawn and synthesised by the game's own code — no textures, no
audio files, no libraries, no network request. `game/` is static files and
`game/index.html` runs them straight from disk.

## Play

```bash
node serve.ts            # serves game/ at http://localhost:8080
```

or open `game/index.html` through any static file server. A desktop Chrome or
Chromium is what it is built for.

## What is in it

- **A city.** Deterministic street grid with downtown towers, beach hotels, the
  docks, the Jardines and an industrial edge: parks, plazas, parking lots, piers,
  a lighthouse, rooftop pools, awnings, neon. Buildings are extruded, so the
  camera sees their walls, and every roof has its own seeded clutter.
- **Driving.** Six vehicles with arcade handling, tyre smoke, skids, damage and
  wrecks. Traffic drives lanes with lights, braking and horns; you can steal any
  car on the street, including a patrol car.
- **People.** Pedestrians walk the pavements, dodge traffic, flee gunfire and
  scream about it, and the beach is full of tourists under umbrellas.
- **The law.** Five wanted stars, patrol cars that ram and shoot, officers on
  foot, roadblocks, a searchlight from a helicopter at four stars, and a busted
  timer when they corner you on foot.
- **Guns.** Fists, a pistol, an SMG and a shotgun, with tracers, muzzle flash,
  blood, decals and blast damage that catches cars and bystanders.
- **Six missions and a story**, each with a briefing, dialogue, objectives that
  change (go, steal, deliver, hold, chase, escape) and a payout.
- **A HUD** with a live circular minimap, route, blips, wanted stars, money,
  clock, district, health, armour, weapon and a speedometer with a radio dial.
- **Night and weather**, a day that runs in twenty-four minutes, rain squalls,
  street lamps and neon after dark, and a lamp under your barrel on the beach.
- **Four radio stations**, synthesised in WebAudio, plus engines, sirens, shots
  and explosions.
- **Saving** to localStorage from the pause menu, and a start screen with
  continue, controls and about.

## Controls

| | |
| --- | --- |
| `W A S D` / arrows | walk, and drive |
| `Shift` | run |
| mouse | aim, `left click` fire |
| `E` | get in or out of a car (or carjack) |
| `Space` | handbrake |
| `1` `2` `3` `4` | fists, pistol, SMG, shotgun |
| `Q` | next radio station |
| `M` | map |
| `J` | call the next job |
| `Esc` | pause, save, quit |

## Layout

```
game/index.html      the page: one canvas and the boot overlay
game/src/            the game, one job per module
  config.js          every tuned number and colour
  city.js            the city generator
  roads.js           street graph, A* and the lane follower
  vehicle.js         vehicle physics and parking
  player.js          the player on foot and behind the wheel
  traffic.js         civilian drivers
  peds.js            pedestrians
  enemies.js         Cifuentes' men
  police.js          heat, patrols and the busted timer
  combat.js          bullets, melee and blasts
  missions.js        the six missions and their runner
  render.js          the painter: ground, extruded city, depth-sorted props
  hud.js             minimap, stars, vitals, speedometer, dialogue
  menu.js            title, pause, briefings, endings
  audio.js           synthesised sound and radio
  save.js            localStorage saves
  shots.js           the four staged frames the screenshots come from
  main.js            boot
main.ts              copies game/ and screenshots/ to /output, writes dossier.json
serve.ts             a small static server for playing it locally
screenshots/         four frames of the game running (the first is the cover)
vendor/              make.fun's dossier library, vendored
```

## Screenshots

Taken from the game's own shot mode (`?shot=chase`, `?shot=drive`,
`?shot=firefight`, `?shot=title`), which arranges the real systems — this city,
these cars, this Guardia, this mission runner, this HUD — and renders them.

## License

MIT. See `LICENSE`. Cala Dorada is an original work: the city, the people, the
cars, the story, the art and the music are made for it.
