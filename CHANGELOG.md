# Changelog

## Unreleased

### Changed (behaviour)
- Immediate endings are now also checked right after an event's `onEnter`. If the
  `onEnter` already meets an `immediate` ending, the run ends at once: no choices are shown,
  and the event is logged with `choice: null` (its `entered` changes are kept). Before, the
  player still had to pick a choice in a run that was already over, and the simulator
  counted one extra step. Both bundled packs give identical simulator results
  (`npm run simulate -- --n 2000`), since their `onEnter` effects never reach a game-over.

### Added
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
