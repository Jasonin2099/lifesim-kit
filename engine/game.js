// A turn-based, data-driven life-sim loop.
//
//   const g = createGame(pack, { seed: 42 });
//   while (!g.state.ended) { const e = g.current(); g.choose(0); }
//
// Each turn: fixed events for that turn first, then `perTurn` events drawn from
// the pool (weighted, filtered by `turns`, `when`, `once`, `cooldown`). After the last turn,
// or as soon as an `immediate` ending matches, the first matching ending wins.
// An event's `onEnter` effect is applied once, when it becomes the current event
// (before the player chooses); `state.entered` keeps what it changed. Immediate endings
// are checked after every onEnter as well as after every choice: if an onEnter already
// meets one, the run ends right there (the event is logged with `choice: null`).
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

// A repeatable event (`once: false`) with `cooldown: n` sits out the n turns after it was last shown.
function coolingDown(e, state) {
  if (!(e.cooldown > 0)) return false;
  for (let i = state.log.length - 1; i >= 0; i--)
    if (state.log[i].event === e.id) return state.turn - state.log[i].turn <= e.cooldown;
  return false;
}

export function eligible(pack, state) {
  return pack.events.filter((e) => !e.fixed && inTurns(e, state.turn) && check(state, e.when)
    && !(e.once !== false && state.seen.includes(e.id)) && !coolingDown(e, state));
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

  const end = (ending) => { s.ended = true; s.ending = ending?.id ?? null; };
  // apply the new current event's onEnter once; saved in state, so loading never re-applies it
  // end the run if an immediate ending matches now; true if it did
  const checkEnding = () => {
    const imm = findEnding(pack, s, true);
    if (imm) end(imm);
    return !!imm;
  };
  const enter = () => {
    const e = byId.get(s.queue[0]);
    s.entered = e?.onEnter ? { event: e.id, changes: applyEffect(pack, s, e.onEnter) } : null;
    if (s.entered && checkEnding()) {
      s.seen.push(e.id);
      s.queue.shift();
      s.log.push({ turn: s.turn, event: e.id, choice: null, result: '', changes: [], entered: s.entered.changes });
    }
  };
  const advance = () => {
    if (checkEnding()) return;
    if (s.queue.length) return enter();
    if (s.turn >= pack.turns) return end(findEnding(pack, s, false));
    s.turn++;
    if (pack.perTurnEffect) applyEffect(pack, s, pack.perTurnEffect);
    fillQueue(pack, s);
    if (!s.queue.length) return advance();
    enter();
  };
  if (!state) { fillQueue(pack, s); enter(); }

  return {
    pack,
    get state() { return s; },
    current() { return s.ended ? null : byId.get(s.queue[0]) ?? null; },
    /** what the current event's onEnter just changed ([] if it has none) */
    entered() { const e = this.current(); return e && s.entered?.event === e.id ? s.entered.changes : []; },
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
      const entered = s.entered?.event === e.id ? s.entered.changes : null;
      s.seen.push(e.id);
      s.queue.shift();
      s.log.push({ turn: s.turn, event: e.id, choice: index, result: outcome.result ?? '', changes, ...(entered?.length ? { entered } : {}) });
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
    if (e.cooldown !== undefined && !(Number.isInteger(e.cooldown) && e.cooldown >= 0)) errs.push(`${e.id}: cooldown must be a whole number >= 0`);
    for (const k of Object.keys(e.onEnter ?? {}))
      if (!['flag', 'unflag'].includes(k) && !(k in pack.stats)) errs.push(`${e.id}: onEnter: unknown stat "${k}"`);
    for (const c of e.choices ?? []) for (const k of Object.keys({ ...c.effect, ...c.success?.effect, ...c.failure?.effect }))
      if (!['flag', 'unflag'].includes(k) && !(k in pack.stats)) errs.push(`${e.id}: unknown stat "${k}"`);
  }
  if (!pack.endings?.some((e) => !e.when)) errs.push('need one fallback ending without `when`');
  if (errs.length) throw new Error('invalid pack:\n  ' + errs.join('\n  '));
  return true;
}

/** Non-fatal problems: things that load fine but probably aren't what the author meant. */
export function packWarnings(pack) {
  const warns = [];
  const T = pack.turns;
  for (const e of pack.events ?? []) {
    if (e.turns) {
      const [lo, hi = lo] = e.turns;
      if (lo > hi) warns.push(`${e.id}: turns [${lo}, ${hi}] is reversed, the event can never appear`);
      else if (hi < 1 || lo > T) warns.push(`${e.id}: turns [${lo}, ${hi}] is outside 1..${T}, the event can never appear`);
      else if (lo < 1 || hi > T) warns.push(`${e.id}: turns [${lo}, ${hi}] goes past 1..${T}`);
    }
    if (e.fixed !== undefined && e.fixed !== false && !(e.fixed >= 1 && e.fixed <= T))
      warns.push(`${e.id}: fixed turn ${e.fixed} is outside 1..${T}, the event can never appear`);
    if (e.cooldown > 0 && e.once !== false) warns.push(`${e.id}: cooldown has no effect unless once is false`);
    if (e.cooldown > 0 && e.fixed) warns.push(`${e.id}: cooldown has no effect on a fixed event`);
  }
  const { checked, set } = flagUse(pack);
  for (const f of checked) if (!set.has(f)) warns.push(`flag "${f}" is checked but never set`);
  for (const f of set) if (!checked.has(f)) warns.push(`flag "${f}" is set but never checked`);
  return warns;
}

// Which flags conditions look at, and which effects set (unflag alone never makes a flag true).
function flagUse(pack) {
  const checked = new Set(), set = new Set();
  const walk = (c) => {
    if (!c || typeof c !== 'object') return;
    if (Array.isArray(c)) return c.forEach(walk);
    if (c.flag) checked.add(c.flag);
    [c.all, c.any, c.not].forEach(walk);
  };
  const eff = (e) => { for (const f of [].concat(e?.flag ?? [])) set.add(f); };
  eff(pack.perTurnEffect);
  for (const e of pack.events ?? []) {
    walk(e.when);
    eff(e.onEnter);
    for (const c of e.choices ?? []) { walk(c.when); eff(c.effect); eff(c.success?.effect); eff(c.failure?.effect); }
  }
  for (const e of pack.endings ?? []) walk(e.when);
  return { checked, set };
}
