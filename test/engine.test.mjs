import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, loadGame, validatePack, packWarnings } from '../engine/game.js';
import { check } from '../engine/conditions.js';
import { playRun, strategies, botsFor } from '../engine/autoplay.js';

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
