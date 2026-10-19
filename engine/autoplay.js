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
