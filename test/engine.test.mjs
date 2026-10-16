import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, loadGame, validatePack } from '../engine/game.js';
import { check } from '../engine/conditions.js';
import { playRun, strategies } from '../engine/autoplay.js';

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

test('unavailable choice is rejected', () => {
  const p = structuredClone(pack);
  p.events[0].choices[1].when = { flag: 'nope' };
  const g = createGame(p, { seed: 1 });
  assert.equal(g.choices().length, 1);
  assert.throws(() => g.choose(1));
});
