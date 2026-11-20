import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// every text object in the sample packs carries zh, en and ja, with the same placeholders
const PACKS = ['first-job', 'night-market'];
const ph = (s) => (s.match(/\{[^}]+\}/g) || []).sort().join();

for (const id of PACKS) {
  test(`sample pack ${id}: zh / en / ja text with matching placeholders`, () => {
    const pack = JSON.parse(readFileSync(new URL(`../packs/${id}/pack.json`, import.meta.url), 'utf8'));
    const problems = [];
    let n = 0;
    const walk = (o, path) => {
      if (!o || typeof o !== 'object') return;
      if (!Array.isArray(o) && typeof o.en === 'string') {
        n++;
        for (const l of ['zh', 'ja']) {
          if (typeof o[l] !== 'string' || !o[l].trim()) problems.push(`${path}: missing ${l}`);
          else if (ph(o[l]) !== ph(o.en)) problems.push(`${path}: ${l} placeholders differ`);
        }
        return;
      }
      for (const k of Object.keys(o)) walk(o[k], `${path}.${k}`);
    };
    walk(pack, id);
    assert.ok(n > 0);
    assert.deepEqual(problems, []);
  });
}
