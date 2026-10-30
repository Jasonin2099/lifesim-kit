// Bots that play a whole run. Used by the simulator and tests.
import { createGame } from './game.js';
import { next } from './rng.js';

export const strategies = {
  random: (g) => g.choices()[Math.floor(next(g.state) * g.choices().length)].index,
  first: (g) => g.choices()[0].index,
  // maximise one stat greedily, looking only at the immediate effect
  greedy: (stat) => (g) => {
    const cs = g.choices();
    const score = (c) => (c.effect?.[stat] ?? 0) + (c.success?.effect?.[stat] ?? 0) * (c.chance ?? 0);
    return cs.reduce((a, b) => (score(b) > score(a) ? b : a)).index;
  },
  // reckless: the choice whose expected effects move stats the most in total (sum of |delta|),
  // ignoring direction. Good at finding extreme endings a careful player never reaches.
  reckless: (g) => {
    const cs = g.choices();
    const sum = (eff, w = 1) => Object.values(eff ?? {}).reduce((t, v) => t + Math.abs(v) * w, 0);
    const score = (c) => sum(c.effect) + sum(c.success?.effect, c.chance ?? 0) + sum(c.failure?.effect, c.chance === undefined ? 0 : 1 - c.chance);
    return cs.reduce((a, b) => (score(b) > score(a) ? b : a)).index;
  },
};

export function playRun(pack, pick, seed) {
  const g = createGame(pack, { seed });
  let guard = 10000;
  while (!g.state.ended && guard--) g.choose(pick(g));
  return g;
}

// All built-in bots for a pack, optionally narrowed to one name (e.g. 'reckless', 'max-money').
export function botsFor(pack, only) {
  const all = { random: strategies.random, first: strategies.first, reckless: strategies.reckless, ...Object.fromEntries(Object.keys(pack.stats).map((k) => ['max-' + k, strategies.greedy(k)])) };
  if (only == null) return all;
  if (!all[only]) throw new Error(`unknown bot "${only}", try one of: ${Object.keys(all).join(', ')}`);
  return { [only]: all[only] };
}

export const median = (v) => [...v].sort((a, b) => a - b)[v.length >> 1];

// Play n runs with one bot and collect: ending counts, final stats, how many runs saw each event,
// onEnter totals per event ({ shown, runs, delta: { stat: summed real change } }) and the
// per-turn median curve. Used by tools/simulate.mjs.
export function simulate(pack, pick, n, seed0 = 1) {
  const r = { runs: n, endings: {}, stats: {}, seen: {}, onEnter: {}, curve: [] };
  const byId = new Map(pack.events.map((e) => [e.id, e]));
  const perTurn = []; // perTurn[t][stat] = values at the start of turn t+1, one per run that got there
  for (let i = 0; i < n; i++) {
    let last = 0;
    const watch = (g) => {
      const t = g.state.turn;
      if (t !== last) for (const [k, v] of Object.entries(g.state.stats)) ((perTurn[t - 1] ??= {})[k] ??= []).push(v);
      last = t;
      return pick(g);
    };
    const s = playRun(pack, watch, seed0 + i * 7919).state;
    r.endings[s.ending] = (r.endings[s.ending] ?? 0) + 1;
    for (const [k, v] of Object.entries(s.stats)) (r.stats[k] ??= []).push(v);
    for (const id of new Set(s.seen)) r.seen[id] = (r.seen[id] ?? 0) + 1;
    // onEnter: how often each event's onEnter fired and what it really changed (after clamping)
    const hit = new Set();
    for (const l of s.log) {
      if (!byId.get(l.event)?.onEnter) continue;
      const o = (r.onEnter[l.event] ??= { shown: 0, runs: 0, delta: {} });
      o.shown++; hit.add(l.event);
      for (const c of l.entered ?? []) o.delta[c.key] = (o.delta[c.key] ?? 0) + c.delta;
    }
    for (const id of hit) r.onEnter[id].runs++;
  }
  r.curve = perTurn.map((byStat, t) => ({ turn: t + 1, runs: Object.values(byStat)[0].length, median: Object.fromEntries(Object.entries(byStat).map(([k, v]) => [k, median(v)])) }));
  return r;
}
