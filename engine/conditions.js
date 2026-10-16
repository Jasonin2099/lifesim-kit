// One small condition language shared by events, choices and endings.
//   { stat: 'energy', min: 10, max: 80 }   { flag: 'promoted' }   { flag: 'x', eq: false }
//   { turn: { min: 3 } }   { seen: 'event_id' }   { all: [...] }  { any: [...] }  { not: {...} }
const inRange = (v, lo, hi) => typeof v === 'number' && (lo === undefined || v >= lo) && (hi === undefined || v <= hi);

export function check(state, c) {
  if (!c) return true;
  if (Array.isArray(c)) return c.every((x) => check(state, x));
  if (c.all) return c.all.every((x) => check(state, x));
  if (c.any) return c.any.some((x) => check(state, x));
  if (c.not) return !check(state, c.not);
  if (c.stat) return inRange(state.stats[c.stat], c.min, c.max);
  if (c.flag) return c.eq === false ? !state.flags[c.flag] : Boolean(state.flags[c.flag]);
  if (c.turn) return inRange(state.turn, c.turn.min, c.turn.max);
  if (c.seen) return state.seen.includes(c.seen);
  throw new Error('unknown condition: ' + JSON.stringify(c));
}
