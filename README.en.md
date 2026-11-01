# lifesim-kit

[中文](README.md) · [日本語](README.ja.md)

A tiny engine for text-based life-sim games. The story lives in JSON; the engine draws events, updates stats and picks an ending. Zero dependencies, runs in the browser and in Node.

**[Play the demo →](https://jasonin2099.github.io/lifesim-kit/)** (sample pack *Six Months In*: six months at a first job, about three minutes a run)

> Pulled out of a life-sim game I made; the sample pack is written from scratch. Still rough — it'll grow.

## What's inside

- `engine/` — a few hundred lines
  - turn loop: fixed events for the turn first, then `perTurn` weighted draws from the pool
  - one condition language everywhere: `{stat, min, max}` `{flag}` `{turn}` `{seen}` `{all|any|not}`
  - choices with odds (`chance` + `success` / `failure`) and ranged effects (`[lo, hi]`)
  - repeatable events (`once: false`) with an optional `cooldown: n` so they sit out n turns after showing up
  - `onEnter` effects on events: applied the moment the event is shown, before the player picks (the rain soaks two rice balls first); add `onEnterChance` to make one apply only some of the time; loading a save never applies them twice
  - seeded RNG stored in the save, so a loaded game continues the same random sequence
  - `validatePack()` catches misspelled stats, duplicate ids, a missing fallback ending, malformed effect values (e.g. `"3"` or `[5]`, which would otherwise turn a stat into NaN or a string); `packWarnings()` flags events whose `turns` / `fixed` fall outside the pack's turn count (the simulator prints these first)
- `tools/simulate.mjs` — bots play a thousand runs each; prints ending rates, median stats, events/endings nobody ever reached, and how often each `onEnter` fired with its average real (post-clamp) change
- `packs/first-job/` (*Six Months In*) and `packs/night-market/` (*Five Nights at the Market*) — two sample packs (Chinese + English), to show packs are swappable
- `index.html` + `demo/` — playable page, ready for GitHub Pages; pick a pack with `?pack=night-market` ([play it](https://jasonin2099.github.io/lifesim-kit/?pack=night-market)) or the link on the title screen

## Run

```bash
npm test
npm run simulate              # ending rates and average steps per ending
npm run simulate -- --curve   # also print the median of each stat at the start of every turn
npm run serve     # http://localhost:8000
```

The last two lines of the simulator output (`never seen events`, `unreached endings`) are the most useful part when balancing: content you wrote that players will almost never see.

## Writing a pack

Every field is listed in [docs/pack-format.md](docs/pack-format.md); the [Chinese README](README.md#写自己的剧本) has a full example. Text fields can be a string or `{ "zh": "…", "en": "…" }`; the engine never reads text, only the UI does.

```js
import { createGame } from './engine/game.js';
const g = createGame(pack, { seed: 42 });
while (!g.state.ended) g.choose(0);
console.log(g.ending());
```

Roadmap: [ROADMAP.md](ROADMAP.md) · MIT License
