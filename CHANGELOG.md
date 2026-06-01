# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Wave 4C deeper tracking (schema v4):
  - Body measurements log (waist / chest / hips / arms / thighs / neck) with a
    collapsible Today-tab section and a "BODY TRANSFORMATION" delta on Stats.
  - Mood / energy / discipline 1-5 sliders on Today; 7-day rolling-average
    trend on Stats.
  - Per-workout type + location dropdowns (Lift/Run/.../Outdoor/Gym/...).
    `location === 'Outdoor'` now implies the existing `w?outdoor` flag.
    Top-3 type-@-location combos surface in a "WORKOUT BREAKDOWN" card.
  - End-of-day failure-log prompt: on boot, if yesterday was incomplete and
    not previously asked about, surface a banner asking for a one-line reason.
    All recorded reasons appear in a Stats "FAILURE LOG" sub-section.
- Schema migration v4 + new pure helpers (`getMeasurementsDiff`,
  `buildWellbeingTrend`, `pickFailureDay`, `getFailureLog`) with unit tests.

### Changed
- `CURRENT_SCHEMA_VERSION` bumped to 4. Existing v3 (and older) states are
  upgraded in place; new per-day fields default to "empty" representations.
- Service worker cache bumped to `v2` to pick up the new modules.

## [0.1.0] -- 2026-06-01

### Changed
- Refactored the monolithic single-file app into 19 vanilla ES modules under
  `js/` (state, tasks, water, photos, books, drinks, stats, grid, modal, toast,
  confetti, countdown, quotes, theme, metrics, notes, export, constants, main).
- State module is now pure: a single source of truth with explicit
  load / save / mutate seams, no DOM access from state code.
- Workout rename moved from `prompt()` to an inline editable label on the
  Today row.

### Added
- Accessibility pass: task rows are keyboard-focusable, with visible focus
  rings, `role` / `aria-*` attributes on interactive controls, and
  Enter / Space activation.

### References
- PR #2 -- modular ES modules, a11y, pure state, inline rename.
