import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, loadGame, validatePack, packWarnings } from '../engine/game.js';
import { check } from '../engine/conditions.js';
import { playRun, strategies, botsFor, simulate } from '../engine/autoplay.js';

const pack = JSON.parse(readFileSync(new URL('../packs/first-job/pack.json', import.meta.url)));

test('sample pack is valid', () => assert.ok(validatePack(pack)));

test('same seed, same run', () => {
  const a = playRun(pack, strategies.random, 123).state, b = playRun(pack, strategies.random, 123).state;
  assert.deepEqual(a.log, b.log);
});

test('every run ends with an ending', () => {
  for (let i = 0; i < 300; i++) assert.ok(playRun(pack, strategies.random, i).state.ending);
});

test('fixed event comes first on its turn', () => {
  const g = createGame(pack, { seed: 1 });
  assert.equal(g.current().id, 'day_one');
});

test('save / load continues identically', () => {
  const g = createGame(pack, { seed: 9 });
  g.choose(0); g.choose(0);
  const g2 = loadGame(pack, g.save());
  while (!g.state.ended) { g.choose(0); g2.choose(0); }
  assert.deepEqual(g.state, g2.state);
});

test('stats are clamped', () => {
  const g = playRun(pack, strategies.greedy('energy'), 5);
  assert.ok(g.state.stats.energy <= 100);
});

test('conditions', () => {
  const s = { stats: { a: 5 }, flags: { f: true }, turn: 2, seen: ['x'] };
  assert.ok(check(s, { stat: 'a', min: 5 }));
  assert.ok(!check(s, { stat: 'a', max: 4 }));
  assert.ok(check(s, { all: [{ flag: 'f' }, { seen: 'x' }, { turn: { min: 2 } }] }));
  assert.ok(check(s, { any: [{ flag: 'g' }, { not: { flag: 'g' } }] }));
  assert.ok(check(s, { flag: 'g', eq: false }));
  assert.throws(() => check(s, { bogus: 1 }));
});

test('validator catches mistakes', () => {
  const bad = structuredClone(pack);
  bad.events[0].choices[0].effect.hapiness = 1;
  bad.endings = bad.endings.filter((e) => e.when);
  assert.throws(() => validatePack(bad), /unknown stat "hapiness"[\s\S]*fallback ending/);
});

test('warnings for turn ranges outside the pack', () => {
  assert.deepEqual(packWarnings(pack), []);
  const p = structuredClone(pack);
  const T = p.turns;
  p.events[0].turns = [T + 1, T + 3];
  p.events[1].turns = [0, 2];
  p.events[2].turns = [3, 2];
  p.events[3].fixed = T + 1;
  const w = packWarnings(p);
  assert.equal(w.length, 4);
  assert.match(w[0], /outside 1\.\.\d+, the event can never appear/);
  assert.match(w[1], /goes past/);
  assert.match(w[2], /reversed/);
  assert.match(w[3], /fixed turn/);
  assert.ok(validatePack(p)); // warnings only, still loads
});

test('unavailable choice is rejected', () => {
  const p = structuredClone(pack);
  p.events[0].choices[1].when = { flag: 'nope' };
  const g = createGame(p, { seed: 1 });
  assert.equal(g.choices().length, 1);
  assert.throws(() => g.choose(1));
});

test('every sample-pack event is seen by some bot', () => {
  const bots = [strategies.random, strategies.first, ...Object.keys(pack.stats).map((k) => strategies.greedy(k))];
  const seen = new Set();
  for (const bot of bots) for (let i = 0; i < 300; i++) for (const id of playRun(pack, bot, i).state.seen) seen.add(id);
  const never = pack.events.map((e) => e.id).filter((id) => !seen.has(id));
  assert.deepEqual(never, []);
});

test('reckless bot picks the choice with the biggest total delta', () => {
  const p = structuredClone(pack);
  p.events[0].choices = [
    { text: 'calm', effect: { energy: 1 } },
    { text: 'wild', effect: { energy: -20, money: 15 } },
    { text: 'gamble', chance: 0.5, success: { effect: { money: 30 } }, failure: { effect: { energy: -2 } } },
  ];
  const g = createGame(p, { seed: 1 });
  assert.equal(strategies.reckless(g), 1);
  assert.ok(playRun(pack, strategies.reckless, 3).state.ending);
});

test('reckless bot can burn out, a random player almost never does', () => {
  const rate = (pick) => {
    let n = 0;
    for (let i = 0; i < 1000; i++) if (playRun(pack, pick, 1 + i * 7919).state.ending === 'burned_out') n++;
    return n;
  };
  assert.ok(rate(strategies.reckless) > 0, 'burned_out should be reachable by the reckless bot');
  assert.ok(rate(strategies.random) < 50, 'burned_out should stay rare for a random player');
});

test('botsFor lists every bot, or just the one asked for', () => {
  const all = botsFor(pack);
  assert.ok(all.random && all.first && all.reckless);
  for (const k of Object.keys(pack.stats)) assert.ok(all['max-' + k]);
  assert.deepEqual(Object.keys(botsFor(pack, 'reckless')), ['reckless']);
  assert.throws(() => botsFor(pack, 'nope'), /unknown bot/);
});

test('text placeholders', async () => {
  const { fill } = await import('../engine/text.js');
  const s = { turn: 2, stats: { money: 340 }, flags: { promoted: true } };
  assert.equal(fill('Savings {stat:money}, month {turn}/{turns}', s, pack), `Savings 340, month 2/${pack.turns}`);
  assert.equal(fill('{flag:promoted?yes|no} {flag:fired?yes|no}', s, pack), 'yes no');
  assert.equal(fill('{stat:bogus} {flag:x} {other}', s, pack), '{stat:bogus} {flag:x} {other}');
  assert.equal(fill(undefined, s, pack), undefined);
});

test('warnings for flags checked but never set, and set but never checked', () => {
  const p = structuredClone(pack);
  p.endings.unshift({ id: 'ghost', when: { not: { flag: 'typo_flag' } }, title: 'x', text: 'x' });
  p.events[0].choices[1].effect.flag = 'lonely';
  const w = packWarnings(p);
  assert.ok(w.includes('flag "typo_flag" is checked but never set'), w.join('\n'));
  assert.ok(w.includes('flag "lonely" is set but never checked'), w.join('\n'));
});

test('cooldown keeps a repeatable event away for n turns', () => {
  const p = {
    id: 'cd', turns: 8, perTurn: 1, stats: { x: { initial: 0 } },
    events: [
      { id: 'tick', once: false, cooldown: 2, weight: 1000, choices: [{ label: 'ok', effect: { x: 1 } }] },
      { id: 'filler', once: false, choices: [{ label: 'ok' }] },
    ],
    endings: [{ id: 'end' }],
  };
  assert.deepEqual(packWarnings(p), []);
  for (let seed = 1; seed <= 20; seed++) {
    const turns = playRun(p, strategies.first, seed).state.log.filter((l) => l.event === 'tick').map((l) => l.turn);
    assert.deepEqual(turns, [1, 4, 7], `seed ${seed}`);
  }
  // without a cooldown the heavy event shows up every turn
  const q = structuredClone(p); delete q.events[0].cooldown;
  assert.equal(playRun(q, strategies.first, 1).state.log.filter((l) => l.event === 'tick').length, 8);
  // cooldown survives save / load (it reads the run log)
  const g = createGame(p, { seed: 3 }); g.choose(0); g.choose(0);
  const g2 = loadGame(p, g.save());
  while (!g.state.ended) { g.choose(0); g2.choose(0); }
  assert.deepEqual(g.state, g2.state);
});

test('cooldown is validated and warned about', () => {
  const p = structuredClone(pack);
  p.events[1].cooldown = -1;
  assert.throws(() => validatePack(p), /cooldown must be a whole number/);
  p.events[1].cooldown = 2; // once defaults to true
  p.events[0].cooldown = 1; p.events[0].once = false; // day_one is fixed
  const w = packWarnings(p);
  assert.ok(w.some((x) => /lunch: cooldown has no effect unless once is false/.test(x)), w.join('\n'));
  assert.ok(w.some((x) => /day_one: cooldown has no effect on a fixed event/.test(x)), w.join('\n'));
});

test('onEnter applies once when the event is shown, before choosing, and survives save / load', () => {
  const p = {
    id: 'oe', turns: 3, perTurn: 1, stats: { x: { initial: 10, min: 0, max: 20 } },
    events: [
      { id: 'storm', fixed: 2, onEnter: { x: -4, flag: 'wet' }, choices: [
        { label: 'dry off', when: { flag: 'wet' }, effect: { unflag: 'wet' } },
        { label: 'never shown', when: { flag: 'wet', eq: false } },
      ] },
      { id: 'calm', once: false, choices: [{ label: 'ok', effect: { x: 1 } }] },
    ],
    endings: [{ id: 'end' }],
  };
  assert.deepEqual(packWarnings(p), []);
  const g = createGame(p, { seed: 1 });
  assert.equal(g.current().id, 'calm');
  assert.deepEqual(g.entered(), []);
  g.choose(0); // turn 1 -> 2: storm is shown and its onEnter runs now
  assert.equal(g.current().id, 'storm');
  assert.equal(g.state.stats.x, 7);
  assert.deepEqual(g.entered(), [{ key: 'x', delta: -4 }]);
  assert.deepEqual(g.choices().map((c) => c.index), [0]); // choice conditions see the onEnter flag
  // loading a save made while storm is showing must not apply it again
  const g2 = loadGame(p, g.save());
  assert.equal(g2.state.stats.x, 7);
  g.choose(0); g2.choose(0);
  assert.deepEqual(g.state, g2.state);
  assert.equal(g.state.stats.x, 7);
  assert.deepEqual(g.state.log[1].entered, [{ key: 'x', delta: -4 }]);
  assert.equal(g.state.log[0].entered, undefined);
  // onEnter on the very first event of a run
  const q = structuredClone(p); q.events[0].fixed = 1;
  assert.equal(createGame(q, { seed: 1 }).state.stats.x, 6);
});

test('an onEnter that meets an immediate ending ends the run at once, without showing choices', () => {
  const p = {
    id: 'oe-end', turns: 5, perTurn: 1, stats: { hp: { initial: 3, min: 0, max: 9 } },
    events: [
      { id: 'trap', fixed: 2, onEnter: { hp: -5 }, choices: [{ label: 'never picked', effect: { hp: 9 } }] },
      { id: 'walk', once: false, choices: [{ label: 'ok' }] },
    ],
    endings: [{ id: 'dead', immediate: true, when: { stat: 'hp', max: 0 } }, { id: 'end' }],
  };
  const g = createGame(p, { seed: 1 });
  assert.equal(g.current().id, 'walk');
  g.choose(0); // turn 2: trap's onEnter drops hp to 0
  assert.equal(g.state.ended, true);
  assert.equal(g.state.ending, 'dead');
  assert.equal(g.current(), null);
  assert.deepEqual(g.choices(), []);
  assert.equal(g.state.stats.hp, 0);
  const last = g.state.log.at(-1);
  assert.equal(last.event, 'trap');
  assert.equal(last.choice, null);
  assert.deepEqual(last.entered, [{ key: 'hp', delta: -3 }]);
  // the same on the very first event, and the simulator counts it once
  const q = structuredClone(p); q.events[0].fixed = 1;
  assert.equal(createGame(q, { seed: 1 }).state.ending, 'dead');
  const r = simulate(q, strategies.first, 3);
  assert.deepEqual(r.endings, { dead: 3 });
  assert.deepEqual(r.steps, { dead: 1 }); // the onEnter ending is one step, not two
  assert.deepEqual(r.onEnter, { trap: { shown: 3, runs: 3, delta: { hp: -9 } } });
});

test('onEnter stats are validated, onEnter flags count as set', () => {
  const p = structuredClone(pack);
  p.events[1].onEnter = { enregy: -5 };
  assert.throws(() => validatePack(p), /onEnter: unknown stat "enregy"/);
  p.events[1].onEnter = { flag: 'only_from_on_enter' };
  p.endings.unshift({ id: 'x', when: { flag: 'only_from_on_enter' }, title: 'x', text: 'x' });
  assert.ok(!packWarnings(p).some((w) => w.includes('only_from_on_enter')));
});

test('simulate reports how often onEnter fired and what it really changed (after clamping)', () => {
  // x starts at 3, min 0: the first drain takes 3 (clamped), the second only what turn 2 added back
  const p = {
    id: 'sim-oe', turns: 2, perTurn: 1, stats: { x: { initial: 3, min: 0, max: 9 }, y: {} },
    perTurnEffect: { x: 1 },
    events: [
      { id: 'drain', once: false, onEnter: { x: -5, flag: 'f' }, choices: [{ label: 'ok', effect: { y: 1 } }] },
      { id: 'plain', fixed: 99, choices: [{ label: 'ok' }] },
    ],
    endings: [{ id: 'end' }],
  };
  const r = simulate(p, strategies.first, 4);
  assert.deepEqual(r.onEnter, { drain: { shown: 8, runs: 4, delta: { x: -16 } } }); // per run: -3, then -1
  assert.equal(r.endings.end, 4);
  assert.deepEqual(r.steps, { end: 2 });
  assert.deepEqual(r.stats.x, [0, 0, 0, 0]);
  assert.equal(r.curve.length, 2);
  // packs without onEnter report nothing; the rest of the report is unchanged
  const plain = simulate(pack, strategies.random, 20);
  assert.deepEqual(plain.onEnter, {});
  assert.equal(Object.values(plain.endings).reduce((a, b) => a + b), 20);
});

// every pack under packs/ must load, end every run, and be listed in the demo's ?pack= list
import { readdirSync } from 'node:fs';
const packDirs = readdirSync(new URL('../packs/', import.meta.url), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
const loadPack = (id) => JSON.parse(readFileSync(new URL(`../packs/${id}/pack.json`, import.meta.url)));

test('there is more than one sample pack', () => assert.ok(packDirs.length >= 2));

for (const id of packDirs) {
  test(`pack ${id}: valid, id matches folder, no warnings, every run ends`, () => {
    const p = loadPack(id);
    assert.ok(validatePack(p));
    assert.equal(p.id, id);
    assert.deepEqual(packWarnings(p), []);
    for (let i = 0; i < 200; i++) assert.ok(playRun(p, strategies.random, i).state.ending);
  });
}

test('demo ?pack= list matches the packs folder', () => {
  const src = readFileSync(new URL('../demo/app.js', import.meta.url), 'utf8');
  const list = JSON.parse(src.match(/const PACKS = (\[[^\]]*\])/)[1].replace(/'/g, '"'));
  assert.deepEqual([...list].sort(), [...packDirs].sort());
});

test('a save from one pack does not load into another', () => {
  const g = createGame(loadPack('night-market'), { seed: 3 });
  g.choose(0);
  assert.throws(() => loadGame(pack, g.save()));
});

test('onEnterChance applies the onEnter only on a seeded roll, and is validated', () => {
  const p = {
    id: 'oe-chance', turns: 1, perTurn: 1, stats: { x: { initial: 5, min: 0, max: 99 } },
    events: [{ id: 'gust', once: false, onEnter: { x: -1 }, onEnterChance: 0.3, choices: [{ label: 'ok' }] }],
    endings: [{ id: 'end' }],
  };
  // over many seeds roughly 30% fire, each seed is reproducible, and a skipped roll leaves entered null
  let fired = 0;
  for (let seed = 1; seed <= 2000; seed++) {
    const g = createGame(p, { seed });
    if (g.state.stats.x === 4) { fired++; assert.deepEqual(g.entered(), [{ key: 'x', delta: -1 }]); }
    else { assert.equal(g.state.stats.x, 5); assert.equal(g.state.entered, null); assert.deepEqual(g.entered(), []); }
    assert.equal(createGame(p, { seed }).state.stats.x, g.state.stats.x);
  }
  assert.ok(fired > 450 && fired < 750, `fired ${fired} / 2000`);
  // 1 always fires, 0 never does
  assert.equal(createGame({ ...p, events: [{ ...p.events[0], onEnterChance: 1 }] }, { seed: 3 }).state.stats.x, 4);
  assert.equal(createGame({ ...p, events: [{ ...p.events[0], onEnterChance: 0 }] }, { seed: 3 }).state.stats.x, 5);
  // validator and warnings
  for (const bad of [1.5, -0.1, '0.5'])
    assert.throws(() => validatePack({ ...p, events: [{ ...p.events[0], onEnterChance: bad }] }), /onEnterChance must be a number from 0 to 1/);
  assert.deepEqual(packWarnings(p), []);
  assert.match(packWarnings({ ...p, events: [{ ...p.events[0], onEnterChance: 0 }] }).join('\n'), /onEnterChance is 0/);
  const { onEnter, ...noOnEnter } = p.events[0];
  assert.match(packWarnings({ ...p, events: [noOnEnter] }).join('\n'), /onEnterChance has no effect without onEnter/);
});
