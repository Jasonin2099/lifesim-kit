// Every state change goes through applyEffect so clamping happens in one place.
//   { energy: -5, money: 300, flag: 'x', unflag: 'y' }
import { next } from './rng.js';

export function clamp(pack, key, v) {
  const d = pack.stats[key];
  return d ? Math.max(d.min ?? -Infinity, Math.min(d.max ?? Infinity, Math.round(v))) : v;
}

export function applyEffect(pack, state, effect = {}) {
  const changes = [];
  for (const [k, raw] of Object.entries(effect)) {
    if (!(k in state.stats)) continue;
    // [lo, hi] means "a random amount in this range"
    const v = Array.isArray(raw) ? raw[0] + Math.round(next(state) * (raw[1] - raw[0])) : raw;
    const before = state.stats[k];
    state.stats[k] = clamp(pack, k, before + v);
    if (state.stats[k] !== before) changes.push({ key: k, delta: state.stats[k] - before });
  }
  for (const f of [].concat(effect.flag ?? [])) state.flags[f] = true;
  for (const f of [].concat(effect.unflag ?? [])) delete state.flags[f];
  return changes;
}
