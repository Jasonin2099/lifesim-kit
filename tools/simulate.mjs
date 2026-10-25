#!/usr/bin/env node
// Batch-play a pack with bots and print ending rates, final stats and event coverage.
//   node tools/simulate.mjs [packs/first-job/pack.json] [--n 1000] [--seed 1] [--json out.json] [--bot reckless]
import { readFileSync, writeFileSync } from 'node:fs';
import { playRun, botsFor } from '../engine/autoplay.js';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const file = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--')) ?? new URL('../packs/first-job/pack.json', import.meta.url);
const pack = JSON.parse(readFileSync(file, 'utf8'));
const N = Number(opt('n', 1000)), seed0 = Number(opt('seed', 1));
const name = (x) => (typeof x === 'object' ? x.en ?? Object.values(x)[0] : x);

export function simulate(pack, pick, n, seed0 = 1) {
  const r = { runs: n, endings: {}, stats: {}, seen: {} };
  for (let i = 0; i < n; i++) {
    const s = playRun(pack, pick, seed0 + i * 7919).state;
    r.endings[s.ending] = (r.endings[s.ending] ?? 0) + 1;
    for (const [k, v] of Object.entries(s.stats)) (r.stats[k] ??= []).push(v);
    for (const id of new Set(s.seen)) r.seen[id] = (r.seen[id] ?? 0) + 1;
  }
  return r;
}

let bots;
try { bots = botsFor(pack, opt('bot')); } catch (e) { console.error(e.message); process.exit(1); }
const report = {};
for (const [bot, pick] of Object.entries(bots)) {
  const r = (report[bot] = simulate(pack, pick, N, seed0));
  const pct = (v) => ((100 * v) / N).toFixed(0).padStart(3) + '%';
  console.log(`\n[${bot}] ${N} runs`);
  for (const [id, c] of Object.entries(r.endings).sort((a, b) => b[1] - a[1])) console.log(`  ${pct(c)}  ${name(pack.endings.find((e) => e.id === id)?.title ?? id)}`);
  console.log('  median: ' + Object.entries(r.stats).map(([k, v]) => `${k} ${v.sort((a, b) => a - b)[v.length >> 1]}`).join(' · '));
}
const never = pack.events.filter((e) => !Object.values(report).some((r) => r.seen[e.id]));
const unreached = pack.endings.filter((e) => !Object.values(report).some((r) => r.endings[e.id]));
console.log('\nnever seen events: ' + (never.map((e) => e.id).join(', ') || 'none'));
console.log('unreached endings: ' + (unreached.map((e) => e.id).join(', ') || 'none'));
if (opt('json')) writeFileSync(opt('json'), JSON.stringify(report, null, 1));
