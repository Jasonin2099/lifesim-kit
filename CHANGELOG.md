# Changelog

## Unreleased

## 0.2.0 — 2026-11-06

### Changed (behaviour)
- Immediate endings are now also checked right after an event's `onEnter`. If the
  `onEnter` already meets an `immediate` ending, the run ends at once: no choices are shown,
  and the event is logged with `choice: null` (its `entered` changes are kept). Before, the
  player still had to pick a choice in a run that was already over, and the simulator
  counted one extra step. Both bundled packs give identical simulator results
  (`npm run simulate -- --n 2000`), since their `onEnter` effects never reach a game-over.

### Added
- `packWarnings()`: a `{flag:x?yes|no}` text placeholder now counts as checking the flag, so
  a flag that is only shown in text no longer gets a false "set but never checked" warning
  (and a placeholder whose flag is never set gets "checked but never set"). `{flag:…}`
  placeholders without `?yes|no`, which `fill()` leaves on screen as is, are flagged too.
  Both bundled packs: no warnings, simulator output byte-identical.
- `packWarnings()` flags `stat` conditions that can never be true: `min` greater than `max`,
  or a range entirely outside the stat's own `min` / `max` (stats are clamped, so
  `{ "stat": "m", "min": 200 }` on a 0..100 stat never passes). It also flags `{stat:…}`
  placeholders in event / ending / choice text whose stat doesn't exist, which `fill()` leaves
  on screen as is. Both bundled packs: no warnings, simulator output byte-identical.
- Validator: `when` conditions on events, choices and endings are checked when the pack
  loads — unknown condition keys, two kinds in one object, unknown stats, `seen` ids that
  aren't events, `{ "turn": 3 }` (always true before) and non-number `min` / `max`. Before,
  an unknown key threw only when the condition was first reached, and a typo in a stat or
  `seen` id never threw at all. Choice `chance` must be a number from 0 to 1, and
  `packWarnings()` flags `success` / `failure` on a choice without `chance`. Both bundled
  packs pass with no new warnings and identical simulator output.
- Validator: effect values must be a number or a `[lo, hi]` pair of numbers, and `flag` /
  `unflag` must be flag names (in choice effects, `success` / `failure`, `onEnter` and
  `perTurnEffect`). Before, `"3"` or `[5]` loaded fine and then turned the stat into a
  string or `NaN`. `perTurnEffect` stats are now checked for typos too. `packWarnings()`
  flags reversed ranges like `[5, 1]`. Both bundled packs pass with no new warnings.
- Unit tests for `applyEffect` ranges / clamping / flags and the seeded RNG + `pickWeighted`.
- `onEnterChance` (0..1) on events: the `onEnter` applies only on a seeded roll below that
  chance. Validated (must be 0..1) with warnings for `0` and for a chance without `onEnter`;
  the simulator prints the chance next to the pack's nominal change.
- Simulator report of how often each `onEnter` fired and its real (clamped) change.
- Simulator prints the average number of steps (choices) per ending (`steps` in `--json`).
