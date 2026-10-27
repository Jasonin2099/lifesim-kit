# Roadmap

Small steps, roughly one per day.

- [x] Add GitHub Actions CI (Node 18–24, Windows)
- [x] Sample pack: make `cold` and `burnout` reachable (the simulator says nobody sees them)
- [x] Sample pack: make the `burned_out` ending reachable by a reckless bot
- [x] Simulator: add a `reckless` bot (always the choice with the biggest total delta)
- [x] Simulator: `--bot` flag to run only one bot
- [x] Simulator: per-turn stat curve (median per turn) in the JSON report, `--curve` to print it
- [ ] Engine: `once: false` events with a cooldown (`cooldown: 2` turns)
- [x] Engine: text templates — `{stat:money}`, `{turn}`, `{flag:x?yes|no}` inside event text
- [ ] Engine: `onEnter` effect for events (applies when shown, before choosing)
- [x] Validator: warn on events whose `turns` range is outside `1..turns`
- [x] Validator: warn on flags that are checked but never set (and vice versa)
- [x] Demo: keyboard shortcuts (1–9 to choose, Enter to start)
- [x] Demo: run log / timeline on the ending screen
- [ ] Demo: Japanese text for the sample pack
- [x] Docs: `docs/pack-format.md` with every field
- [ ] Second tiny sample pack to prove packs are swappable (`?pack=` URL param)
