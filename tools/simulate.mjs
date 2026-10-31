#!/usr/bin/env node
// Batch-play a pack with bots and print ending rates, final stats and event coverage.
//   node tools/simulate.mjs [packs/first-job/pack.json] [--n 1000] [--seed 1] [--json out.json] [--bot reckless] [--curve]
import { readFileSync, writeFileSync } from 'node:fs';
import { botsFor, simulate, median } from '../engine/autoplay.js';
import { packWarnings } from '../engine/game.js';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const file = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--')) ?? new URL('../packs/first-job/pack.json', import.meta.url);
const pack = JSON.parse(readFileSync(file, 'utf8'));
const N = Number(opt('n', 1000)), seed0 = Number(opt('seed', 1));
const name = (x) => (typeof x === 'object' ? x.en ?? Object.values(x)[0] : x);
for (const w of packWarnings(pack)) console.warn('warning: ' + w);

let bots;
try { bots = botsFor(pack, opt('bot')); } catch (e) { console.error(e.message); process.exit(1); }
const report = {};
for (const [bot, pick] of Object.entries(bots)) {
  const r = (report[bot] = simulate(pack, pick, N, seed0));
  const pct = (v) => ((100 * v) / N).toFixed(0).padStart(3) + '%';
  console.log(`\n[${bot}] ${N} runs`);
  for (const [id, c] of Object.entries(r.endings).sort((a, b) => b[1] - a[1])) console.log(`  ${pct(c)}  ${name(pack.endings.find((e) => e.id === id)?.title ?? id)}  · avg ${r.steps[id]} steps`);
  console.log('  median: ' + Object.entries(r.stats).map(([k, v]) => `${k} ${median(v)}`).join(' · '));
  for (const [id, o] of Object.entries(r.onEnter)) {
    const avg = Object.entries(o.delta).map(([k, v]) => `${k} ${v / o.shown >= 0 ? '+' : ''}${(v / o.shown).toFixed(1)}`).join(' · ') || 'no change';
    const nominal = Object.entries(pack.events.find((e) => e.id === id).onEnter).filter(([k]) => k in pack.stats).map(([k, v]) => `${k} ${Array.isArray(v) ? v.join('..') : (v >= 0 ? '+' : '') + v}`).join(' · ');
    console.log(`  onEnter ${id}: shown ${o.shown}× in ${pct(o.runs).trim()} of runs · avg ${avg} (pack: ${nominal})`);
  }
}
const never = pack.events.filter((e) => !Object.values(report).some((r) => r.seen[e.id]));
const unreached = pack.endings.filter((e) => !Object.values(report).some((r) => r.endings[e.id]));
console.log('\nnever seen events: ' + (never.map((e) => e.id).join(', ') || 'none'));
console.log('unreached endings: ' + (unreached.map((e) => e.id).join(', ') || 'none'));
if (args.includes('--curve')) for (const [bot, r] of Object.entries(report)) {
  console.log(`
[${bot}] median at the start of each turn`);
  for (const c of r.curve) console.log(`  ${String(c.turn).padStart(2)}  ` + Object.entries(c.median).map(([k, v]) => `${k} ${v}`).join(' · ') + (c.runs < N ? `  (${c.runs} runs)` : ''));
}
if (opt('json')) writeFileSync(opt('json'), JSON.stringify(report, null, 1));
