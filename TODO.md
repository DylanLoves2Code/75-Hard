# TODO — Improvements

25 prioritized improvements for the 75 Hard tracker. Grouped by theme. Each item lists the concrete change and which file(s) it touches. Order within a group is rough priority (highest first).

---

## Data safety & robustness

- [ ] **1. Downscale photos on upload.** `handlePhotoUpload` in `js/tasks.js` stores the raw camera-resolution base64 data URL. A single iPhone photo can be 3–5 MB. Render to an offscreen `<canvas>` at max ~1024px, export as JPEG `0.85`, then `localStorage.setItem`. Drops typical photo from ~4 MB to ~150 KB.

- [ ] **2. Detect localStorage quota and warn.** Wrap `saveState` and `localStorage.setItem(photoKey(d), …)` in try/catch on `QuotaExceededError`. Show a toast: "Storage almost full — export your data and clear older photos." Track usage with `JSON.stringify(state).length + sum(photo lengths)` and surface a soft warning at 80% of the conservative 5 MB cap.

- [ ] **3. State schema versioning + migrations.** Add a `version: 1` field to the saved state. On boot, `getState()` runs a migration chain (`v0 → v1 → v2 …`) if the loaded version is older. Future-proofs the data model without surprise breakage. Centralize in `js/state.js`.

- [ ] **4. JSON import to round-trip with export.** Add an "IMPORT DATA" button on the Export tab paired with a file picker. Validate against the schema (after migrations), confirm with a modal showing diff stats ("Replaces current data: 12 days, 4 photos, 3 books"), then commit. Closes a known gap from `PRD.md` §8.

- [ ] **5. ZIP export of photos.** Photos are deliberately excluded from JSON export (PRD §8.2). Bundle them as a separate `75hard-photos.zip` via a small zero-dep ZIP encoder (e.g., inline the ~3KB STORE-only zip recipe). Lets users actually back up their progress imagery.

- [ ] **6. Timezone-stable current-day calculation.** `calcCurrentDay()` in `js/state.js` uses local-time `Date` math against a string `startDate`. Traveling across timezones near midnight, or DST transitions, can shift the displayed day by ±1. Store `startDate` as a UTC date-only string and compute days using UTC components.

---

## Accessibility (beyond Phase 2a)

- [ ] **7. Replace clickable `<div>`s with semantic `<button>`s.** Phase 2a added `role="button"` + `tabindex` to `.task-item`, `.water-cup`, and `.day-tile`. The more durable fix is using actual `<button>` elements — gets keyboard, focus, and screen-reader behavior for free. Touches `js/tasks.js`, `js/water.js`, `js/grid.js`, and a small CSS reset for button defaults.

- [ ] **8. `aria-live` region for day-complete + toast.** When all six objectives complete, the green banner appears silently to screen readers. Add `aria-live="polite"` to `#complete-banner` and to the toast container so completion and save events are announced.

- [ ] **9. Respect `prefers-reduced-motion`.** Disable the confetti burst, the slide-in animations, and the pulse on `.complete-icon` when the user has set reduced motion. One CSS media query in `styles.css` and a check in `js/confetti.js`.

- [ ] **10. Improve low-contrast text.** `--text3: #555` on `--bg: #0a0a0a` is roughly 4.1:1 — below WCAG AA for body text. Lift to `#7a7a7a` (≈6.5:1) for the dark theme. Verify all token combos with a contrast check.

---

## Code quality & developer experience

- [ ] **11. Replace `renderAll` cycle with an event bus.** `js/tasks.js`, `js/water.js`, and `js/modal.js` currently `import { renderAll } from './main.js'` — a cycle that works via ES-module live bindings but is fragile. Replace with a tiny pub/sub (`emit('state-changed')` → `main.js` subscribes and re-renders). Removes all upward imports.

- [ ] **12. Add unit tests for `js/state.js`.** All the day/week/streak math (`calcCurrentDay`, `calcStreak`, `countCompleteDays`, `isDayComplete`, `getDayData` defaults merge) is pure and easy to test. Use `node --test` — zero dependencies. Covers the highest-bug-risk module without dragging in a framework.

- [ ] **13. JSDoc types for state shape and exported functions.** Add a `@typedef` for `State` and `DayData` in `js/state.js`, then `@param`/`@returns` on the public functions in each module. Editors get type completion; `tsc --allowJs --checkJs --noEmit` can be wired into CI later.

- [ ] **14. CI workflow on GitHub Actions.** `.github/workflows/ci.yml` runs `node --check js/*.js`, `node --test`, and (optionally) the JSDoc type-check on every push. Catches syntax errors and regressions before they reach `main`.

- [ ] **15. Add ESLint + Prettier with zero-config.** Use the `eslint --init` recommended preset plus Prettier defaults. Single-quote, no-semicolon-style, or whatever matches the current file — but make it enforceable. Wire into the CI workflow above.

- [ ] **16. Granular re-renders.** Every toggle calls `renderAll(s)`, which rebuilds all 7 tabs. At this scale it's invisible, but the cascade makes the data flow harder to reason about. Switch to per-tab `renderToday`, `renderGrid`, etc., dispatched from the event bus introduced in #11.

- [ ] **17. Extract Google-Fonts to a local stylesheet snapshot.** `index.html` currently blocks the first paint on `fonts.googleapis.com`. Either self-host the woff2 files in `fonts/` or use `font-display: swap` to avoid the FOIT.

---

## UX polish

- [ ] **18. Empty-state hints.** First-visit Today shows an empty hydration meter, blank weight/sleep, no notes. Add a one-line tactical-voice hint per section ("// Tap a cup to log water — 16 cups = 1 gallon"). Hint disappears once the user has logged anything for that day. Touches `js/tasks.js`, `js/water.js`, `js/notes.js`.

- [ ] **19. Quick-add water buttons.** Add `+8oz` / `+16oz` / `+24oz` preset buttons next to the hydration meter. Cup-by-cup clicking is fine but slow when logging after a full gallon. Touches `js/water.js`.

- [ ] **20. Edit/delete past book entries.** The Books tab log shows past entries but they're frozen. Add `[ EDIT ]` / `[ ✕ ]` icons per row matching the inline rename pattern from Phase 2c. Touches `js/books.js` + a few CSS rules.

- [ ] **21. Settings panel.** Add a `[ ⚙ ]` icon in the header that opens a small modal for: confetti on/off, quote rotation interval (or off), weight unit (lbs/kg), reduced motion override. Stored in `localStorage` under `75hard_settings`. New `js/settings.js`.

- [ ] **22. User-supplied quote pool.** The QUOTES array in `js/quotes.js` is fixed. Add a textarea in the settings panel where users can paste custom quotes (one per line, format: `"quote" — author`). Append to the rotation. Personalization without code edits.

- [ ] **23. Print-friendly Day 75 report.** Add a "PRINT REPORT" button on Export that opens `?report=1` (or similar) — a single-page printable view with all 75 days' completion grid, weight curve, sleep curve, total pages read, and field notes. CSS `@media print` rules in `styles.css`.

---

## Platform & deployment

- [ ] **24. PWA manifest + service worker.** Add `manifest.webmanifest` (name, icons, theme color `#ff3c00`, display `standalone`) and a minimal `sw.js` that caches the static shell for offline use. Makes the app installable on mobile and works on the subway. The app is already 100% client-side — this is mostly metadata + 30 lines of service worker.

- [ ] **25. README.md with deploy instructions.** No top-level `README.md` exists. Add one: 3-paragraph overview, the "open `index.html` in a browser, no build needed" quickstart, a one-liner for `python3 -m http.server` for local dev with ES module imports (file:// can have CORS issues with modules in some browsers), and a deploy note for GitHub Pages.

---

## Daily habit support

- [ ] **26. Browser notifications.** Use the Notifications API to remind users at customizable times: morning workout, mid-day water check-in ("you're at 64 oz, halfway to gallon"), evening photo + reading, end-of-day "tasks remaining" alert. Most failures on 75 Hard are forgetting a task, not lacking willpower. Touches: new `js/notifications.js`, plus settings UI from #21.

- [ ] **27. Workout timer.** A start/stop timer for the 45-minute workouts the rules require, with a small inline display per workout slot. Saves duration into `dayData.w1duration` / `.w2duration`. Helps users actually hit the 45 minutes instead of guessing. Touches `js/tasks.js`.

- [ ] **28. Streak-at-risk warning.** When it's past a configurable hour (default 9pm) and any of today's six tasks is incomplete, show a red urgent banner: "X tasks remain. Y minutes to midnight." Replaces the day-complete banner in that state. Touches `js/main.js`, `js/tasks.js`.

- [ ] **29. .ics calendar export for daily workouts.** Generate a downloadable `75hard-workouts.ics` with two events per day for the 75 days. User imports into Apple Calendar / Google Calendar so workout windows are blocked in advance. Touches Export tab + new `js/ics.js`.

---

## 75 Hard rule fidelity

- [ ] **30. Outdoor workout flag.** The rules explicitly require **one of the two workouts to be outdoors**, regardless of weather. Add an "Outdoor" toggle to each workout row. Surface a soft warning at end of day if neither was marked outdoor. Touches `js/constants.js` (`TASKS` schema), `js/tasks.js`, `js/state.js`.

- [ ] **31. Diet selection + adherence toggle.** The rules require **picking one diet at the start and sticking to it for 75 days** — no cheat meals, no alcohol. The current "Calorie Deficit" task is too vague. On setup, prompt for diet (Paleo / Keto / IIFYM / Whole30 / Custom). Replace the single Calorie task with a "Diet Adherence" yes/no, optionally with a "what I ate" note. Touches setup flow, `js/constants.js`, `js/state.js`.

- [ ] **32. Nonfiction tagging for reading.** The rules specify **10 pages of nonfiction self-improvement**. Add a "nonfiction?" checkbox per book entry in `js/books.js`. Tracks adherence and gives the user a single button to filter their library. Audiobook minutes can be tracked separately but explicitly flagged as not counting toward the rule.

---

## Deeper tracking

- [ ] **33. Body measurements log.** Weight alone misses recomp. Add optional fields for waist, chest, hips, arms (with a "Measurements" sub-section in Daily Metrics). Show a before/after diff on the Stats tab. The most motivating data after the side-by-side photos. New `js/measurements.js` + state field.

- [ ] **34. Mood / energy / discipline ratings.** Three 1-5 sliders on the Today tab: mood, energy, discipline-felt. 30 seconds to log, surfaces patterns over 75 days ("you sleep better on outdoor-workout days"). Touches `js/notes.js` or new `js/wellbeing.js`.

- [ ] **35. Workout type + location.** Per workout: dropdown for type (lift, run, swim, yoga, HIIT, other) and a location tag (gym, home, outdoor, park, road). Lets the user see distribution at the end ("47 lifts, 28 runs, 12 outdoor runs"). Touches `js/tasks.js`.

- [ ] **36. End-of-day failure log.** If midnight arrives with incomplete tasks, prompt for a one-line reason ("traveled", "got sick", "skipped — no excuse"). Stored per day; surfaced on Stats. Turns failures into data instead of shame. Touches `js/main.js`, `js/state.js`.

---

## Reading depth

- [ ] **37. 10-page reading pomodoro.** A small timer on the Books tab — tap "START READING", get a 15-minute focus block (estimate for 10 pages), confetti at end. Helps users actually sit down with the book. Touches `js/books.js`.

- [ ] **38. Highlights & quotes vault.** Add a "save a quote" textarea on each book entry. Aggregated under a new "QUOTES" sub-tab on Books. At the end of 75 days, the user has a curated personal commonplace book — often the most valuable output of the challenge. Touches `js/books.js`.

- [ ] **39. Audiobook minutes tracker.** Separate from the page count (since audiobooks are contested under official rules), but useful to people. Track minutes/day; visualize on Stats. Optional integration with the Audible recommendations MCP for finding the next book.

---

## Insights & motivation

- [ ] **40. GitHub-style habit heatmap.** Replace or supplement the 75-tile Grid with a calendar-shaped heatmap: each square colored by completion rate. More compact, more familiar pattern. Add to Stats tab. Touches `js/stats.js`.

- [ ] **41. Day-of-week miss patterns.** "You miss workouts most often on Sundays (3 of 6)." Compute on the Stats tab. The kind of insight that drives a single behavior change. Touches `js/stats.js`.

- [ ] **42. Achievement badges.** Unlocked at Day 7 ("FIRST WEEK"), 14, 21, 30 ("HALFWAY"), 50, 75 ("FORGED"). Also: "PERFECT WEEK" for a 7/7, "FIRST GALLON" for first complete water day. Visible on a new strip at the top of the Today tab. Touches new `js/badges.js`.

- [ ] **43. Shareable progress card image.** "GENERATE CARD" button on the Stats tab renders a 1080×1080 PNG (via canvas) with day number, streak, mini grid, and motto. Saves locally — user can post to socials if they want. No server-side sharing. Touches `js/stats.js`.

---

## Social / accountability

- [ ] **44. Read-only shareable link.** Bundle the state into a compact URL (or URL fragment, to keep it client-side), no server required. The recipient sees a frozen snapshot of progress at the moment the link was generated. Cheap, privacy-respecting accountability. Touches `js/export.js`.

- [ ] **45. Accountability partner mode.** Two users each save their friend's read-only link locally; the Today tab gets a small "partner" panel showing their day number, streak, and whether they completed today. Pure client-side coordination, no auth. Touches `js/main.js` + new `js/partner.js`.

---

## Pre & post challenge

- [ ] **46. Pre-challenge prep checklist.** Before Day 1: pick a diet, schedule both workouts on the calendar, choose the first book, set up a place for the daily photo, identify a backup outdoor workout for bad weather. Cuts dropout-in-the-first-week massively. Shown on first launch before "ENGAGE CHALLENGE." Touches setup screen in `index.html` + `js/main.js`.

- [ ] **47. Multi-challenge history.** Today, "RESET" wipes everything. Instead, archive the completed (or failed) challenge into `localStorage` keyed by start date, and start fresh. Add a "PAST ATTEMPTS" view on the Export tab. Touches `js/state.js`, `js/export.js`.

- [ ] **48. "Live Hard" 365-day continuation.** After Day 75, prompt: "You finished 75 Hard. Continue with Phase 1 of Live Hard (next 30 days: same tasks + critical task list + handshakes)?" Encodes the full Live Hard program for users who want the next step. Touches `js/state.js`, big content addition.

---

## Health integrations

- [ ] **49. Apple Health / Google Fit weight + steps.** Read-only pull (where supported by the browser — Apple's HealthKit doesn't expose to web, but Google Fit REST API does). Pre-fill the weight field if available. Step count can be a soft proxy for "did you move outside today?" Touches new `js/health.js`.

- [ ] **50. Wearable sleep import.** Same idea for sleep: if Oura / Whoop / Fitbit has an OAuth web SDK reachable from a static page, pull last night's sleep into the metrics field. Otherwise document an export-and-import workflow.

---

## Notes

- Items 1, 2, 6 are bug-risk reductions and should land first.
- Items 7–10 fold cleanly into a future "a11y polish" PR.
- Items 11–17 are a "dev infrastructure" cluster that pays for itself once more contributors or tests show up.
- Items 18–23 are user-facing polish — pick based on what the daily user actually misses.
- Items 24–25 unlock the "private mobile-installed habit tracker" story this project naturally wants to be.
- Items 26–29 address the #1 cause of failure: forgetting a task or running out of time.
- Items 30–32 close the gap between "this app's tasks" and "the actual 75 Hard rules" — without this, the app helps you complete *something*, not specifically 75 Hard.
- Items 33–36 deepen the tracking so the user gets richer insights at the end.
- Items 37–39 turn the reading habit from a checkbox into a lasting personal library.
- Items 40–43 keep motivation high during the long middle weeks.
- Items 44–45 cover the social-accountability lever without compromising the project's "no signup, local-only" character.
- Items 46–48 expand the app's scope from "during the challenge" to "before and after."
- Items 49–50 reduce manual entry friction, the biggest reason daily trackers get abandoned.
