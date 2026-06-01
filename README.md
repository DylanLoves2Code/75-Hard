# 75 Hard Tracker

Track the 75 Hard mental toughness challenge. Offline, private, no signup.

> Note: a CI badge can be added here once `.github/workflows/ci.yml` exists. The badge URL must reference the eventual workflow filename.

## Today screen (sketch)

```
+----------------------------------------------------+
| 75 HARD                SOLDIER   STREAK 12   [O]   |
| "We suffer more in imagination than in reality."   |
| Until Day 75 ........ 62D : 13H : 04M : 22S        |
| [#########............................] 16%       |
+----------------------------------------------------+
| TODAY  GRID  STATS  PHOTOS  BOOKS  DRINKS  EXPORT  |
+----------------------------------------------------+
| DAY 12 / 75 -- TUE, MAR 5, 2026                    |
|                                                    |
| [ ] CALORIE DEFICIT                                |
| [x] WORKOUT 1                                      |
| [ ] WORKOUT 2  (outdoor)                           |
| [x] READ 10 PAGES                                  |
| [ ] 1 GALLON WATER     | | | | | | | | | | | | |   |
| [ ] PROGRESS PHOTO     [UPLOAD]                    |
|                                                    |
| WEIGHT  [184.6]  SLEEP [7.5]    [SAVE METRICS]     |
| NOTE    [..............................]          |
+----------------------------------------------------+
```

## What is 75 Hard

A 75-day mental toughness program. Each day you must complete two 45-minute
workouts (one of them outdoors regardless of weather), drink a gallon of water,
read 10 pages of nonfiction, take a daily progress photo, follow a diet of your
choosing, and consume no alcohol. Miss any item on any day and you start over
at Day 1. This app tracks compliance, not prescription -- you bring the diet
and the workouts; it logs whether you did them.

## Features

- Single-page app, no build step, no backend
- Today screen with one-tap compliance for all six daily objectives
- 75-day grid overview with per-day editing
- Hydration gauge (16 cups, auto-completes the water objective)
- Daily weight and sleep logging
- Free-text field notes per day
- Photo upload per day, gallery, and side-by-side day-A / day-B compare
- Reading log with running page total
- Weekly drink count with over-threshold warning
- Stats: streak, completion %, weekly completion bars, weight and sleep trends, most-missed task
- Rotating stoic / warrior quotes
- Live countdown to Day 75
- Dark mode (default) and warm "paper" light mode
- JSON export of full state for backup
- All state in `localStorage` -- nothing leaves the device

## Quickstart

### Just use it

Open `index.html` in any modern browser. That is it. Your data lives in the
browser's `localStorage` for that origin.

### Local dev

The app uses native ES modules. Some browsers refuse to load modules from
`file://`, so serve over HTTP for development:

```sh
python3 -m http.server
```

Then open <http://localhost:8000>.

### Deploy

Copy the repo to any static host. For GitHub Pages: enable Pages on the `main`
branch at root, and it just works. No build, no config.

## File layout

```
index.html        -- shell HTML, mounts the app
styles.css        -- all styles (dark + light themes)
js/               -- 19 ES modules (state, tasks, water, photos, stats, ...)
PRD.md            -- full product spec
TODO.md           -- roadmap
LICENSE           -- MIT
```

## Browser support

Modern evergreen: latest Chrome, Safari, Firefox, Edge. The app requires
`localStorage`, `FileReader`, and native ES module support. No IE, no legacy
Edge, no transpilation. Loading `index.html` directly via `file://` works in
most browsers but some block ES modules under that scheme -- use the local
dev server if you hit that.

## Privacy

Everything stays on your device. No accounts, no servers, no analytics, no
telemetry, no third-party requests beyond Google Fonts (CSS-only, for the
display typefaces). The Export tab produces a JSON file you can save as a
backup. Resetting the challenge wipes local state.

## Roadmap

See [TODO.md](./TODO.md).

## License

MIT. See [LICENSE](./LICENSE).
