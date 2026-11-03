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
// `onEnterChance: 0..1` makes the onEnter roll the seeded RNG first and apply only below
// that chance (packs without it never roll, so their runs are unchanged).
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
    const fires = e?.onEnter && (e.onEnterChance === undefined || next(s) < e.onEnterChance);
    s.entered = fires ? { event: e.id, changes: applyEffect(pack, s, e.onEnter) } : null;
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
    effectErrors(e.onEnter, `${e.id}: onEnter`, errs);
    if (e.onEnterChance !== undefined && !(typeof e.onEnterChance === 'number' && e.onEnterChance >= 0 && e.onEnterChance <= 1))
      errs.push(`${e.id}: onEnterChance must be a number from 0 to 1`);
    for (const c of e.choices ?? []) for (const k of Object.keys({ ...c.effect, ...c.success?.effect, ...c.failure?.effect }))
      if (!['flag', 'unflag'].includes(k) && !(k in pack.stats)) errs.push(`${e.id}: unknown stat "${k}"`);
    for (const [i, c] of (e.choices ?? []).entries()) {
      for (const [where, eff] of [['effect', c.effect], ['success', c.success?.effect], ['failure', c.failure?.effect]])
        effectErrors(eff, `${e.id}: choice ${i + 1} ${where}`, errs);
      if (c.chance !== undefined && !(typeof c.chance === 'number' && c.chance >= 0 && c.chance <= 1))
        errs.push(`${e.id}: choice ${i + 1} chance must be a number from 0 to 1`);
    }
  }
  // conditions: checked after all events are known, so `seen` can point at any event id
  for (const e of pack.events ?? []) {
    conditionErrors(e.when, `${e.id}: when`, pack, ids, errs);
    for (const [i, c] of (e.choices ?? []).entries()) conditionErrors(c.when, `${e.id}: choice ${i + 1} when`, pack, ids, errs);
  }
  for (const [i, e] of (pack.endings ?? []).entries()) conditionErrors(e.when, `ending ${e.id ?? i + 1}: when`, pack, ids, errs);
  for (const k of Object.keys(pack.perTurnEffect ?? {}))
    if (!['flag', 'unflag'].includes(k) && !(k in (pack.stats ?? {}))) errs.push(`perTurnEffect: unknown stat "${k}"`);
  effectErrors(pack.perTurnEffect, 'perTurnEffect', errs);
  if (!pack.endings?.some((e) => !e.when)) errs.push('need one fallback ending without `when`');
  if (errs.length) throw new Error('invalid pack:\n  ' + errs.join('\n  '));
  return true;
}

// Effect values: a stat change is a number or a [lo, hi] pair of numbers; flag / unflag is a
// name or a list of names. Anything else silently turns a stat into NaN or a string at runtime.
function effectErrors(effect, where, errs) {
  if (effect === undefined) return;
  if (!effect || typeof effect !== 'object' || Array.isArray(effect)) return errs.push(`${where}: effect must be an object`);
  const num = (x) => typeof x === 'number' && Number.isFinite(x);
  for (const [k, v] of Object.entries(effect)) {
    if (k === 'flag' || k === 'unflag') {
      if (![].concat(v).every((f) => typeof f === 'string' && f)) errs.push(`${where}: ${k} must be a flag name or a list of names`);
    } else if (!(num(v) || (Array.isArray(v) && v.length === 2 && v.every(num)))) {
      errs.push(`${where}: "${k}" must be a number or [lo, hi], got ${JSON.stringify(v)}`);
    }
  }
}

// Conditions (see conditions.js). At runtime an unknown key throws only when that condition is
// first checked, possibly many turns in; a misspelled stat or `seen` id, or `turn: 3` instead of
// `turn: { min: 3 }`, never throws and just quietly never (or always) passes.
const CONDITION_KEYS = { all: [], any: [], not: [], stat: ['min', 'max'], flag: ['eq'], turn: [], seen: [] };
function conditionErrors(c, where, pack, eventIds, errs) {
  if (c === undefined || c === null) return;
  if (Array.isArray(c)) return c.forEach((x, i) => conditionErrors(x, `${where}[${i}]`, pack, eventIds, errs));
  if (typeof c !== 'object') return errs.push(`${where}: condition must be an object or a list, got ${JSON.stringify(c)}`);
  const kinds = Object.keys(c).filter((k) => k in CONDITION_KEYS);
  if (kinds.length !== 1) {
    return errs.push(kinds.length ? `${where}: one condition per object, got ${kinds.join(' + ')} (wrap them in "all": […])`
      : `${where}: unknown condition ${JSON.stringify(c)} (use stat, flag, turn, seen, all, any or not)`);
  }
  const [kind] = kinds;
  for (const k of Object.keys(c)) if (k !== kind && !CONDITION_KEYS[kind].includes(k)) errs.push(`${where}: "${k}" does nothing in a ${kind} condition`);
  const num = (x) => x === undefined || (typeof x === 'number' && Number.isFinite(x));
  const v = c[kind];
  if (kind === 'all' || kind === 'any') {
    if (!Array.isArray(v)) return errs.push(`${where}: ${kind} must be a list of conditions`);
    v.forEach((x, i) => conditionErrors(x, `${where}.${kind}[${i}]`, pack, eventIds, errs));
  } else if (kind === 'not') {
    if (!v || typeof v !== 'object') return errs.push(`${where}: not must be a condition`);
    conditionErrors(v, `${where}.not`, pack, eventIds, errs);
  } else if (kind === 'stat') {
    if (!(typeof v === 'string' && v in (pack.stats ?? {}))) errs.push(`${where}: unknown stat ${JSON.stringify(v)}`);
    if (!num(c.min) || !num(c.max)) errs.push(`${where}: min / max must be numbers`);
  } else if (kind === 'flag') {
    if (!(typeof v === 'string' && v)) errs.push(`${where}: flag must be a flag name`);
    if (c.eq !== undefined && typeof c.eq !== 'boolean') errs.push(`${where}: eq must be true or false`);
  } else if (kind === 'turn') {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return errs.push(`${where}: turn must be { "min": …, "max": … }, got ${JSON.stringify(v)}`);
    for (const k of Object.keys(v)) if (k !== 'min' && k !== 'max') errs.push(`${where}: "${k}" does nothing in a turn condition`);
    if (!num(v.min) || !num(v.max)) errs.push(`${where}: turn min / max must be numbers`);
  } else if (kind === 'seen') {
    if (!eventIds.has(v)) errs.push(`${where}: seen: unknown event ${JSON.stringify(v)}`);
  }
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
    for (const [i, c] of (e.choices ?? []).entries())
      if (c.chance === undefined && (c.success || c.failure)) warns.push(`${e.id}: choice ${i + 1} has success / failure but no chance, so they are never used`);
    if (e.onEnterChance !== undefined && !e.onEnter) warns.push(`${e.id}: onEnterChance has no effect without onEnter`);
    else if (e.onEnterChance === 0) warns.push(`${e.id}: onEnterChance is 0, the onEnter never applies`);
  }
  const ranges = (eff, where) => { for (const [k, v] of Object.entries(eff ?? {}))
    if (Array.isArray(v) && v.length === 2 && v[0] > v[1]) warns.push(`${where}: "${k}" range [${v[0]}, ${v[1]}] is reversed (still works, but write [${v[1]}, ${v[0]}])`); };
  ranges(pack.perTurnEffect, 'perTurnEffect');
  for (const e of pack.events ?? []) {
    ranges(e.onEnter, `${e.id}: onEnter`);
    for (const c of e.choices ?? []) for (const eff of [c.effect, c.success?.effect, c.failure?.effect]) ranges(eff, e.id);
  }
  impossibleConditions(pack, warns);
  unknownStatPlaceholders(pack, warns);
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

// Stat conditions that can never be true: min > max, or a range that lies entirely outside the
// stat's own min..max (stats are clamped, so `min: 200` on a 0..100 stat never passes).
function impossibleConditions(pack, warns) {
  const walk = (c, where) => {
    if (!c || typeof c !== 'object') return;
    if (Array.isArray(c)) return c.forEach((x, i) => walk(x, `${where}[${i}]`));
    if (Array.isArray(c.all)) c.all.forEach((x, i) => walk(x, `${where}.all[${i}]`));
    if (Array.isArray(c.any)) c.any.forEach((x, i) => walk(x, `${where}.any[${i}]`));
    if (c.not) walk(c.not, `${where}.not`);
    const d = typeof c.stat === 'string' ? pack.stats?.[c.stat] : undefined;
    if (!d) return;
    const { min, max } = c, lo = d.min ?? -Infinity, hi = d.max ?? Infinity;
    const never = `${where}: stat "${c.stat}" condition can never be true`;
    if (typeof min === 'number' && typeof max === 'number' && min > max) warns.push(`${never} (min ${min} > max ${max})`);
    else if (typeof min === 'number' && min > hi) warns.push(`${never} (min ${min} is above the stat's max ${hi})`);
    else if (typeof max === 'number' && max < lo) warns.push(`${never} (max ${max} is below the stat's min ${lo})`);
  };
  for (const e of pack.events ?? []) {
    walk(e.when, `${e.id}: when`);
    for (const [i, c] of (e.choices ?? []).entries()) walk(c.when, `${e.id}: choice ${i + 1} when`);
  }
  for (const [i, e] of (pack.endings ?? []).entries()) walk(e.when, `ending ${e.id ?? i + 1}: when`);
}

// `{stat:x}` with a stat the pack doesn't have is left as it is by fill(), so the raw
// placeholder ends up on screen. Looks at the text the demo fills in (event / ending title and
// text, choice label and results), plain or per language.
function unknownStatPlaceholders(pack, warns) {
  const scan = (text, where) => {
    const strings = typeof text === 'string' ? [text] : text && typeof text === 'object' ? Object.values(text) : [];
    const bad = new Set(); // zh and en usually share the same typo: report it once
    for (const s of strings) if (typeof s === 'string')
      for (const [, key] of s.matchAll(/\{stat:([\w-]+)(?:\?[^|}]*\|[^}]*)?\}/g))
        if (!(key in (pack.stats ?? {}))) bad.add(key);
    for (const key of bad) warns.push(`${where}: {stat:${key}} is not a stat, it will show up as is`);
  };
  for (const e of pack.events ?? []) {
    scan(e.title, `${e.id}: title`);
    scan(e.text, `${e.id}: text`);
    for (const [i, c] of (e.choices ?? []).entries()) {
      scan(c.label, `${e.id}: choice ${i + 1} label`);
      scan(c.result, `${e.id}: choice ${i + 1} result`);
      scan(c.success?.result, `${e.id}: choice ${i + 1} success result`);
      scan(c.failure?.result, `${e.id}: choice ${i + 1} failure result`);
    }
  }
  for (const [i, e] of (pack.endings ?? []).entries()) {
    scan(e.title, `ending ${e.id ?? i + 1}: title`);
    scan(e.text, `ending ${e.id ?? i + 1}: text`);
  }
}
