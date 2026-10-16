// A turn-based, data-driven life-sim loop.
//
//   const g = createGame(pack, { seed: 42 });
//   while (!g.state.ended) { const e = g.current(); g.choose(0); }
//
// Each turn: fixed events for that turn first, then `perTurn` events drawn from
// the pool (weighted, filtered by `turns`, `when`, `once`). After the last turn,
// or as soon as an `immediate` ending matches, the first matching ending wins.
import { check } from './conditions.js';
import { applyEffect } from './effects.js';
import { next, pickWeighted, randomSeed } from './rng.js';

export const SAVE_VERSION = 1;

export function newState(pack, seed = randomSeed()) {
  const stats = {};
  for (const [k, d] of Object.entries(pack.stats)) stats[k] = d.initial ?? 0;
  return { v: SAVE_VERSION, pack: pack.id, seed, rng: seed >>> 0, turn: 1, stats, flags: {}, seen: [], queue: [], log: [], ended: false, ending: null };
}

const inTurns = (e, t) => !e.turns || (t >= e.turns[0] && t <= (e.turns[1] ?? e.turns[0]));

export function eligible(pack, state) {
  return pack.events.filter((e) => !e.fixed && inTurns(e, state.turn) && check(state, e.when) && !(e.once !== false && state.seen.includes(e.id)));
}

function fillQueue(pack, state) {
  const fixed = pack.events.filter((e) => e.fixed === state.turn && check(state, e.when)).map((e) => e.id);
  const drawn = [];
  const n = pack.perTurn ?? 2;
  let pool = eligible(pack, state);
  while (drawn.length < n && pool.length) {
    const e = pickWeighted(state, pool);
    drawn.push(e.id);
    pool = pool.filter((x) => x !== e);
  }
  state.queue = [...fixed, ...drawn];
}

function findEnding(pack, state, immediateOnly) {
  return pack.endings.find((e) => (!immediateOnly || e.immediate) && check(state, e.when)) ?? null;
}

export function createGame(pack, { seed, state } = {}) {
  validatePack(pack);
  const byId = new Map(pack.events.map((e) => [e.id, e]));
  const s = state ?? newState(pack, seed);
  if (!state) fillQueue(pack, s);

  const end = (ending) => { s.ended = true; s.ending = ending?.id ?? null; };
  const advance = () => {
    const imm = findEnding(pack, s, true);
    if (imm) return end(imm);
    if (s.queue.length) return;
    if (s.turn >= pack.turns) return end(findEnding(pack, s, false));
    s.turn++;
    if (pack.perTurnEffect) applyEffect(pack, s, pack.perTurnEffect);
    fillQueue(pack, s);
    if (!s.queue.length) advance();
  };

  return {
    pack,
    get state() { return s; },
    current() { return s.ended ? null : byId.get(s.queue[0]) ?? null; },
    /** choices available right now (those whose `when` passes), with their original index */
    choices() {
      const e = this.current();
      return e ? e.choices.map((c, i) => ({ ...c, index: i })).filter((c) => check(s, c.when)) : [];
    },
    choose(index) {
      const e = this.current();
      if (!e) throw new Error('no current event');
      const c = e.choices[index];
      if (!c || !check(s, c.when)) throw new Error(`choice ${index} not available in ${e.id}`);
      let outcome = c;
      if (c.chance !== undefined) outcome = next(s) < c.chance ? c.success ?? c : c.failure ?? {};
      const changes = applyEffect(pack, s, outcome.effect);
      s.seen.push(e.id);
      s.queue.shift();
      s.log.push({ turn: s.turn, event: e.id, choice: index, result: outcome.result ?? '', changes });
      advance();
      return { result: outcome.result ?? '', changes };
    },
    ending() { return s.ending ? pack.endings.find((e) => e.id === s.ending) : null; },
    save() { return JSON.stringify(s); },
  };
}

export function loadGame(pack, json) {
  const st = JSON.parse(json);
  if (st.v !== SAVE_VERSION || st.pack !== pack.id) throw new Error('incompatible save');
  return createGame(pack, { state: st });
}

export function validatePack(pack) {
  const errs = [];
  if (!pack.id) errs.push('pack.id missing');
  if (!pack.stats || !Object.keys(pack.stats).length) errs.push('pack.stats missing');
  if (!(pack.turns > 0)) errs.push('pack.turns must be > 0');
  const ids = new Set();
  for (const e of pack.events ?? []) {
    if (ids.has(e.id)) errs.push('duplicate event id ' + e.id);
    ids.add(e.id);
    if (!e.choices?.length) errs.push(`${e.id}: no choices`);
    for (const c of e.choices ?? []) for (const k of Object.keys({ ...c.effect, ...c.success?.effect, ...c.failure?.effect }))
      if (!['flag', 'unflag'].includes(k) && !(k in pack.stats)) errs.push(`${e.id}: unknown stat "${k}"`);
  }
  if (!pack.endings?.some((e) => !e.when)) errs.push('need one fallback ending without `when`');
  if (errs.length) throw new Error('invalid pack:\n  ' + errs.join('\n  '));
  return true;
}
