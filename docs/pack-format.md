# Pack format

A pack is one JSON file, by convention `packs/<id>/pack.json` (the demo loads it with
`?pack=<id>` once the id is added to `PACKS` in `demo/app.js`; a test checks the two match). The engine only reads numbers, ids and conditions; text is
for the UI. Any text field can be a plain string or `{ "zh": "…", "en": "…" }`, and
can contain [placeholders](#text-placeholders).

`validatePack()` throws on the mistakes in **bold**; `packWarnings()` (printed by the
simulator) lists things that load fine but are probably wrong.

## Top level

| field | type | default | meaning |
|---|---|---|---|
| `id` | string | **required** | Used in save files; a save only loads into the pack with the same id. |
| `title`, `intro` | text | | Shown on the title screen. |
| `turns` | number | **required, > 0** | How many turns a run lasts. |
| `perTurn` | number | `2` | How many pool events are drawn each turn, after the fixed ones. |
| `turnLabel` | text | | Turn header in the demo; `{n}` is the turn number. |
| `perTurnEffect` | effect | | Applied at the start of every turn after the first (salary, rest…). |
| `stats` | object | **required, non-empty** | See below. |
| `events` | array | | See below. |
| `endings` | array | **needs one without `when`** | See below. |

## `stats`

```json
"stats": { "money": { "label": "Savings", "initial": 200, "min": 0, "max": 99999 } }
```

| field | default | meaning |
|---|---|---|
| `label` | | Display name. |
| `initial` | `0` | Value at the start of a run. |
| `min`, `max` | none | Every change is rounded and clamped to this range. The demo draws a bar when `max < 1000`. |

## `events`

| field | default | meaning |
|---|---|---|
| `id` | **required, unique** | |
| `title`, `text` | | |
| `fixed` | | Turn number. The event always comes first on that turn (if its `when` passes) and is never drawn from the pool. Warns if outside `1..turns`. |
| `turns` | any turn | `[from, to]` or `[turn]`: when the event may be drawn. Warns if it can never happen. |
| `when` | always | [Condition](#conditions) that must pass for the event to be drawn or shown. |
| `weight` | `1` | Relative chance when drawing from the pool. `0` never draws. |
| `once` | `true` | Set `false` to let the event come back after it has been seen. |
| `cooldown` | `0` | With `once: false`: after the event is shown it sits out this many turns (`2` → seen on turn 3, back from turn 6). Must be a whole number ≥ 0. Warns if set on a `once` or `fixed` event, where it does nothing. |
| `onEnter` | none | [Effect](#effects) applied once, the moment the event becomes the current one (before the player chooses), so choice `when` conditions and `{stat:…}` text already see it. Stat keys must exist. What it changed is in `state.entered` / `game.entered()` and in the run log as `entered`; the demo shows it under the event text, and `npm run simulate` prints, per bot, how often each onEnter fired and its average real change after clamping (`onEnter` in the `--json` report). Immediate endings are checked right after the onEnter too: if it already meets one, the run ends at once without showing choices (logged with `choice: null`). |
| `choices` | **at least one** | See below. |

Each turn: fixed events for that turn, then `perTurn` events drawn by weight from the
eligible pool, without repeats inside the turn. If nothing is eligible the turn is
skipped.

### Choices

| field | meaning |
|---|---|
| `label` | Button text. |
| `when` | Condition; the choice is hidden when it fails. |
| `effect` | [Effect](#effects) applied when chosen. Stat keys must exist in `stats` (**typos are errors**). |
| `result` | Text shown after choosing. |
| `chance` | `0..1`. Rolls the seeded RNG: below `chance` uses `success`, otherwise `failure`. |
| `success`, `failure` | `{ "effect": …, "result": … }` used instead of the choice's own when `chance` is set. A missing `failure` means nothing happens. |

## `endings`

Checked in order; the first whose `when` passes wins.

| field | meaning |
|---|---|
| `id`, `title`, `text` | |
| `when` | Condition. Leave it out on the last ending so every run has one (**required**). |
| `immediate` | `true` checks this ending after every choice and every `onEnter`, not only after the last turn — for game-overs like running out of energy. |

## Conditions

Used by `when` on events, choices and endings. An array means "all of these".

```json
{ "stat": "energy", "min": 10, "max": 80 }
{ "flag": "promoted" }              { "flag": "promoted", "eq": false }
{ "turn": { "min": 3, "max": 5 } }
{ "seen": "event_id" }
{ "all": [ … ] }   { "any": [ … ] }   { "not": { … } }
```

`min` and `max` are inclusive and both optional. An unknown condition throws.

## Effects

```json
{ "energy": -5, "money": [100, 300], "flag": "met_neighbor", "unflag": ["sick", "late"] }
```

- A number adds to the stat; `[lo, hi]` adds a random whole amount in that range.
- `flag` / `unflag` set or clear one flag or a list of flags.
- Keys that aren't stats or `flag`/`unflag` are ignored at runtime but rejected by the validator.

`packWarnings()` also lists flags that are checked but never set (usually a typo) and
flags that are set but never checked.

## Text placeholders

Filled in by `fill()` from `engine/text.js`, using the current run:

| placeholder | becomes |
|---|---|
| `{stat:money}` | current value of a stat |
| `{turn}`, `{turns}` | current turn, total turns |
| `{flag:promoted?yes|no}` | `yes` if the flag is set, otherwise `no` (either side may be empty) |

Anything else, including a misspelled stat, is left as it is so it shows up on screen.
