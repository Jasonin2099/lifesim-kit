// Placeholders inside event, choice, result and ending text.
//   "Savings: {stat:money}"   "Month {turn} of {turns}"   "{flag:promoted?Yes|No}"
// Unknown placeholders are left as they are, so a typo shows up on screen instead of vanishing.
export function fill(text, state, pack) {
  if (typeof text !== 'string') return text;
  return text.replace(/\{(stat|flag):([\w-]+)(?:\?([^|}]*)\|([^}]*))?\}|\{(turns?)\}/g, (m, kind, key, yes, no, t) => {
    if (t) return String(t === 'turn' ? state.turn : pack.turns);
    if (kind === 'stat') return key in state.stats ? String(state.stats[key]) : m;
    if (yes === undefined) return m;
    return state.flags[key] ? yes : no;
  });
}
