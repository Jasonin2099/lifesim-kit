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
- Simulator report of how often each `onEnter` fired and its real (clamped) change.
