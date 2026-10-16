// Seeded RNG (mulberry32). The whole state is one uint32, so it can live inside
// the save file and a loaded game continues the exact same random sequence.
export function next(state) {
  let t = (state.rng = (state.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const randomSeed = () => (Math.random() * 4294967296) >>> 0;
export function pickWeighted(state, list, weightOf = (x) => x.weight ?? 1) {
  const total = list.reduce((s, x) => s + Math.max(0, weightOf(x)), 0);
  if (total <= 0) return null;
  let r = next(state) * total;
  for (const x of list) if ((r -= Math.max(0, weightOf(x))) < 0) return x;
  return list[list.length - 1];
}
