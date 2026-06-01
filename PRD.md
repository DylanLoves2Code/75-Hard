# 75 HARD — Challenge Tracker

## Product Requirements Document

---

## 1. Overview

**75 Hard Tracker** is a single-page web application that helps users execute and track the 75-day "75 Hard" mental toughness challenge. The entire app ships as one self-contained `index.html` file (HTML + CSS + vanilla JavaScript) with no build step, no backend, and no external runtime dependencies beyond Google Fonts. All state is persisted to the browser's `localStorage`.

The visual identity is a dark, military/tactical aesthetic ("MENTAL TOUGHNESS PROTOCOL") with stoic and warrior-philosophy quotations rotating throughout the experience.

### 1.1 Target user

A single individual undertaking the 75 Hard challenge who wants a private, local, no-signup way to log daily compliance, daily metrics, progress photos, reading, and weekly drink intake — and to review their performance over the full 75 days.

### 1.2 Goals

- Make daily compliance frictionless: every required task is one tap away on the Today screen.
- Give the user constant visibility into streak length, completion percentage, and countdown to Day 75.
- Provide reflection tools: photo gallery + side-by-side compare, charts of weight and sleep trends, weekly completion rates, and per-day field notes.
- Keep all data local, exportable, and user-owned.

### 1.3 Non-goals

- No multi-user accounts, sync, or cloud storage.
- No social sharing, leaderboards, or community features.
- No coaching, prescribed workouts, or meal plans.
- No mobile app — browser-only.

---

## 2. The 75 Hard Rules (as encoded)

The app tracks six daily objectives. All six must be checked off for a day to count as "complete":

| Key | Objective | Notes |
|---|---|---|
| `calorie` | Calorie Deficit | Single checkbox; the app does not track calories — only compliance |
| `w1` | Workout 1 | Rename-able label (right-click / long-press on Today) |
| `w2` | Workout 2 | Rename-able label |
| `read` | Read 10 Pages | Compliance checkbox; page count tracked separately in Books tab |
| `water` | 1 Gallon Water | Auto-completes when the hydration meter hits 16 cups (128 oz) |
| `photo` | Progress Photo | Auto-completes when a photo is uploaded for that day |

The challenge runs exactly 75 days from a user-selected start date. The current day is derived from `floor((today - startDate) / 1 day) + 1`, clamped to `[1, 75]`.

---

## 3. Information Architecture

### 3.1 Setup screen (first run)

Shown only when `localStorage` has no saved state. Collects:

- **Start date** (required, date picker, defaults to today)
- **Name** (optional, free text; uppercased; defaults to `SOLDIER`)

A single "ENGAGE CHALLENGE" button persists state and reveals the main app.

### 3.2 Persistent chrome (always visible above the tabs)

1. **Header** — brand, optional user name, current streak, total days complete, theme toggle (sun/moon).
2. **Quote banner** — randomly selected quote that rotates every 20 seconds. Pool of ~38 stoic/warrior quotations (Sun Tzu, Marcus Aurelius, Julius Caesar, Alexander the Great, Plato, Hannibal, Spartan maxims, etc.).
3. **Countdown bar** — live DD:HH:MM:SS countdown to the end of Day 75. Updates every second. Reads `Until Day 75` on the right.
4. **Progress bar** — completed days as a percentage of 75, with gradient fill.

### 3.3 Tabs

The main content is organized into seven tabs:

| Tab | Purpose |
|---|---|
| `TODAY` | Log compliance for today |
| `GRID` | 75-day overview, tap any past/current day to edit |
| `STATS` | KPIs and trend charts |
| `PHOTOS` | Gallery + side-by-side compare |
| `BOOKS` | Reading log with running page total |
| `DRINKS` | Weekly drink count with warning threshold |
| `EXPORT` | JSON export + full reset |

---

## 4. Detailed Feature Requirements

### 4.1 Today tab

#### 4.1.1 Current day banner
Displays the current day number (e.g. `12 / 75`) and the formatted date ("TODAY — TUE, MAR 5, 2026").

#### 4.1.2 Day-complete banner
A green animated banner reading "DAY COMPLETE — All objectives achieved — maintain discipline" appears once all six objectives are checked for the current day. Triggers a one-time confetti burst per day on transition to complete.

#### 4.1.3 Objectives list
Six tappable rows (see §2). Tapping toggles compliance. The Workout 1 / Workout 2 rows accept a custom label via right-click / long-press → `prompt()` rename. The Progress Photo row includes an `[UPLOAD]` / `[REPLACE]` button that triggers a file picker; the chosen image is stored base64 in `localStorage` and shown as a 70px thumbnail.

#### 4.1.4 Hydration gauge
16 vertical bars representing 8 oz each (128 oz / 1 gallon total). Click bar `i` to fill up to and including `i`; clicking an already-filled bar at that index empties back to `i`. The `water` objective auto-marks complete when all 16 are filled. Shows current total in ounces.

#### 4.1.5 Daily metrics
Two numeric inputs:
- **Weight (lbs)** — range 50–500, step 0.1
- **Sleep (hrs)** — range 0–24, step 0.5

A single "SAVE METRICS" button persists both values keyed by day number. Metrics are *not* part of the completion criteria — they feed the Stats charts.

#### 4.1.6 Field notes
Free-text `<textarea>` per day. "SAVE NOTE" button persists. A toast confirms.

### 4.2 Grid tab

A 75-tile grid (auto-fill, min 50px tiles; 42px on narrow screens). Each tile shows the day number and a status emoji:

- ✅ green — all six objectives complete
- 🟡 yellow — at least one objective complete, not all
- ⬜ default — no objectives complete
- Today tile is highlighted with an accent border and glow
- Future tiles are dimmed (30% opacity) and non-interactive

Tapping any past or current tile opens the **Day Modal**: read-only header (day number + date), the same six tasks (editable for today only; toggleable for past days), and the saved field note if any. Closing the modal re-renders the whole app.

### 4.3 Stats tab

Computed from current state on tab activation.

#### 4.3.1 KPI cards
- Current Streak (consecutive complete days ending today)
- Days Complete (out of 75)
- Progress %
- Days In (current day number)
- Avg Weight (lbs) across logged metrics
- Avg Sleep (hrs) across logged metrics
- Most Missed Task (task name + miss count)

#### 4.3.2 Charts
Three bar charts (CSS-only, no chart library):
- **Weekly Completion Rate** — one bar per elapsed week, height proportional to % of days complete that week
- **Weight Trend** — one bar per day with a logged weight
- **Sleep Trend** — one bar per day with a logged sleep value

Each bar has a hover tooltip via CSS `::after`.

### 4.4 Photos tab

#### 4.4.1 Gallery
Square grid (min 90px) of every uploaded progress photo, newest day last, each labeled `DAY N`. Empty state: "No photos uploaded yet — upload progress photos daily". Tapping a photo opens a full-screen lightbox; click anywhere or the close button to dismiss.

#### 4.4.2 Side-by-side compare
Two `<select>` dropdowns ("Day A" / "Day B") populated only with days that have uploaded photos. Selecting any combination renders the two photos in a 2-column compare layout. Empty slots show "Select a day" / "No photo".

### 4.5 Books tab

- Single "Current Book" card with a title input (auto-prefilled with most recent entry's title) and a "Pages today" input.
- "LOG" button writes `{title, pages}` keyed by current day. A given day can be overwritten by re-logging.
- Running **Total Pages Read** displayed prominently.
- A scrolling log of all entries (title, day, page count).

### 4.6 Drinks tab

A separate weekly cadence (1 entry per week, weeks 1–11 derived from `ceil(currentDay / 7)`).

- Numeric input (0–50) seeded with the current week's existing value if any.
- "LOG WEEK" persists `drinks[currentWeek] = N`.
- Log lists weeks in order with a red ⚠ warning style when count > 15 (heavy-drinking threshold).

### 4.7 Export tab

#### 4.7.1 Export
"⬇ EXPORT DATA" button serializes the full state object (excluding photos, per the in-tab info note) as `75hard-backup.json` and triggers a browser download.

#### 4.7.2 Reset (danger zone)
"⚠ RESET CHALLENGE" opens a confirmation modal styled in red ("ABORT MISSION?"). Confirming wipes:
- The `75hard_v2` state key
- All `photo_day_N` keys for N in 1..75
- Resets `lastAnimatedDay` and timers, then returns to the setup screen.

### 4.8 Theme toggle

A header button swaps between dark mode (default) and a warm "paper" light mode. Preference persists in `localStorage` under `75hard_theme`.

---

## 5. Data Model (localStorage)

### 5.1 Keys

| Key | Type | Purpose |
|---|---|---|
| `75hard_v2` | JSON | Main state object (below) |
| `75hard_theme` | `"light"` or absent | Theme preference |
| `photo_day_<N>` | base64 data URL | Progress photo for day N (1–75) |

### 5.2 State shape

```jsonc
{
  "startDate": "2026-06-01",       // ISO date string
  "name": "SOLDIER",
  "days": {
    "1": {
      "calorie": false,
      "w1": false,
      "w2": false,
      "read": false,
      "water": false,
      "photo": false,
      "w1label": "Workout 1",       // user-renameable
      "w2label": "Workout 2",
      "waterCups": 0                // 0–16
    }
  },
  "drinks":  { "1": 3, "2": 0 },    // keyed by week (1-based)
  "books":   { "5": { "title": "Meditations", "pages": 10 } },
  "metrics": { "5": { "weight": 184.6, "sleep": 7.5 } },
  "notes":   { "5": "Felt strong. Ran 4mi." }
}
```

---

## 6. Technical Requirements

### 6.1 Stack
- Single `index.html` file. No bundler, no framework, no package manager.
- Vanilla JavaScript (ES6+). No transpilation.
- CSS with custom properties for theming.
- Web fonts loaded from Google Fonts CDN: `Bebas Neue`, `Share Tech Mono`, `Oswald`.

### 6.2 Browser support
Modern evergreen browsers (Chrome, Firefox, Safari, Edge). Requires `localStorage`, `FileReader`, `URL.createObjectURL`, CSS custom properties, CSS Grid, and `clip-path`.

### 6.3 Storage budget
Photos are stored as base64 data URLs in `localStorage`, which has a typical 5–10 MB limit per origin. Up to 75 progress photos may approach this limit on devices that produce large camera captures. The app does no client-side downscaling.

### 6.4 Performance
- Countdown updates every 1 second.
- Quote rotates every 20 seconds.
- All renders are full re-renders of the affected tab; the app is small enough that this is imperceptible.

### 6.5 Accessibility (current state)
- High color contrast for both themes.
- Semantic-ish HTML but interactive `<div>` rows are not keyboard-focusable.
- No ARIA labels on icon-only controls.
- *(See §8 for gaps.)*

---

## 7. UX / Visual Design

- **Aesthetic:** tactical / cyberpunk-military. Hard-edged clip-path buttons, monospace labels, all-caps display type, accent color `#ff3c00` (signal orange).
- **Typography:** Bebas Neue (display numerics), Share Tech Mono (labels, code-style), Oswald (body).
- **Color tokens:** orange accent (primary), green (complete), gold (highlight/weight), red (danger/over-threshold), blue (water/info), purple (sleep/books), yellow (partial).
- **Texture:** subtle SVG noise overlay at 4% opacity fixed across the viewport.
- **Microcopy:** military/CTF voice — "ENGAGE CHALLENGE", "ABORT MISSION?", "STAND DOWN", "// MENTAL TOUGHNESS PROTOCOL".
- **Feedback:** toasts for save actions, confetti burst on day completion, pulse animation on the completion icon, slide-in animations on modals.

---

## 8. Known Gaps and Opportunities (not in current build)

These are observations about the as-built app, not commitments:

1. **No image compression** — large camera photos may exceed `localStorage` quota. Downscaling on upload would extend headroom.
2. **No photo backup in export** — the JSON export deliberately excludes images. A separate "Download all photos as zip" would close the loop.
3. **No import / restore** — exported JSON cannot be re-loaded back into the app.
4. **Timezone fragility** — current-day math uses local time and a string `startDate`. Travel across timezones near midnight could shift the displayed day.
5. **No keyboard accessibility** — task rows are `<div>`s with click handlers; no tab/space/enter support, no focus rings, no ARIA.
6. **No multi-challenge history** — resetting wipes prior attempts; the app holds at most one challenge run at a time.
7. **`prompt()` for workout rename** — works but feels dated next to the rest of the UI; an inline editor would fit better.
8. **No notification / reminder system** — no nudges to log water, take a photo, or hit metrics by end of day.
9. **No data validation on import of state** — irrelevant today (no import) but worth keeping in mind if import is added.
10. **Quote attribution** — several quotes are tagged "attr." or composite (e.g., "Hannibal Barca (attr.)"); fine for vibes, not for citation.

---

## 9. Success Criteria

- A user can complete a full 75-day cycle without ever needing to read instructions.
- Tapping through "today's" objectives requires no scrolling on a typical mobile viewport above the metrics section.
- All state survives browser refresh, tab close, and device sleep, and can be exported as a single JSON file at any time.
- After 75 days, the user can review their full journey — every day's completion status, photos, notes, weight curve, sleep curve, drinks, and reading list — without leaving the page.
