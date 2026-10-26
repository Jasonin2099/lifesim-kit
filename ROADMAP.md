# Roadmap

Small steps, roughly one per day.

- [x] Add GitHub Actions CI (Node 18–24, Windows)
- [x] Sample pack: make `cold` and `burnout` reachable (the simulator says nobody sees them)
- [x] Sample pack: make the `burned_out` ending reachable by a reckless bot
- [x] Simulator: add a `reckless` bot (always the choice with the biggest total delta)
- [x] Simulator: `--bot` flag to run only one bot
- [ ] Simulator: per-turn stat curve (median per turn) in the JSON report
- [ ] Engine: `once: false` events with a cooldown (`cooldown: 2` turns)
- [ ] Engine: text templates — `{stat:money}` inside event text
- [ ] Engine: `onEnter` effect for events (applies when shown, before choosing)
- [x] Validator: warn on events whose `turns` range is outside `1..turns`
- [ ] Validator: warn on flags that are checked but never set (and vice versa)
- [ ] Demo: keyboard shortcuts (1/2/3 to choose)
- [ ] Demo: run log / timeline on the ending screen
- [ ] Demo: Japanese text for the sample pack
- [ ] Docs: `docs/pack-format.md` with every field
- [ ] Second tiny sample pack to prove packs are swappable (`?pack=` URL param)
