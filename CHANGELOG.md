# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
