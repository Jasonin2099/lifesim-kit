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
| `onEnterChance` | none | `0..1`. Rolls the seeded RNG when the event is shown: the `onEnter` applies only below this chance, otherwise nothing happens (and `state.entered` is `null`). Leave it out for an `onEnter` that always applies — such packs never roll, so their runs stay the same. The simulator's average change is per showing, so it already includes the misses; the validator warns on `0` or on `onEnterChance` without `onEnter`. |
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
| `chance` | `0..1` (**anything else is an error**). Rolls the seeded RNG: below `chance` uses `success`, otherwise `failure`. |
| `success`, `failure` | `{ "effect": …, "result": … }` used instead of the choice's own when `chance` is set. A missing `failure` means nothing happens. Without `chance` they are never used (`packWarnings()` says so). |

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

`min` and `max` are inclusive and both optional. Each object holds exactly one kind of
condition; to combine two, put them in `all` (or in an array).

`validatePack()` checks every condition up front (**errors**): unknown keys (`{ "stats": … }`),
two kinds in one object (`{ "stat": "m", "flag": "f" }` would silently ignore the flag),
stats that don't exist, `seen` ids that aren't events in the pack, `turn` written as a number
(`{ "turn": 3 }` would always pass — use `{ "turn": { "min": 3, "max": 3 } }`), non-number
`min` / `max`, an `eq` that isn't `true` / `false`, and `all` / `any` that aren't lists. At
runtime an unknown condition still throws, but only when it is first reached.

`packWarnings()` also flags `stat` conditions that can never be true, because stats are
clamped to their own `min` / `max`: `min` greater than `max`, `{ "stat": "energy", "min": 200 }`
on a `0..100` stat, or a `max` below the stat's `min`. Inside `not` such a condition makes the
`not` always true, which is just as likely a mistake.

## Effects

```json
{ "energy": -5, "money": [100, 300], "flag": "met_neighbor", "unflag": ["sick", "late"] }
```

- A number adds to the stat; `[lo, hi]` adds a random whole amount in that range.
- `flag` / `unflag` set or clear one flag or a list of flags.
- Keys that aren't stats or `flag`/`unflag` are ignored at runtime but rejected by the validator
  (this includes `perTurnEffect`).
- The validator also rejects values that aren't a number or a `[lo, hi]` pair of numbers
  (`"3"`, `[5]`, `null`…), and `flag` / `unflag` values that aren't flag names. At runtime
  those would turn the stat into `NaN` or a string. A reversed range like `[5, 1]` still
  works the same as `[1, 5]`, but `packWarnings()` points it out.

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
`packWarnings()` lists `{stat:…}` placeholders whose stat doesn't exist, in event and ending
titles and text, choice labels and results (`success` / `failure` too).
