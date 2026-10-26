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
  - seeded RNG stored in the save, so a loaded game continues the same random sequence
  - `validatePack()` catches misspelled stats, duplicate ids, a missing fallback ending; `packWarnings()` flags events whose `turns` / `fixed` fall outside the pack's turn count (the simulator prints these first)
- `tools/simulate.mjs` — bots play a thousand runs each; prints ending rates, median stats, and events/endings nobody ever reached
- `packs/first-job/` — sample pack (Chinese + English)
- `index.html` + `demo/` — playable page, ready for GitHub Pages

## Run

```bash
npm test
npm run simulate
npm run simulate -- --curve   # also print the median of each stat at the start of every turn
npm run serve     # http://localhost:8000
```

The last two lines of the simulator output (`never seen events`, `unreached endings`) are the most useful part when balancing: content you wrote that players will almost never see.

## Writing a pack

See the JSON example in the [Chinese README](README.md#写自己的剧本) — keys are the same in any language. Text fields can be a string or `{ "zh": "…", "en": "…" }`; the engine never reads text, only the UI does.

```js
import { createGame } from './engine/game.js';
const g = createGame(pack, { seed: 42 });
while (!g.state.ended) g.choose(0);
console.log(g.ending());
```

Roadmap: [ROADMAP.md](ROADMAP.md) · MIT License
