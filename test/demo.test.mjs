import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The demo has no DOM tests; this guards the one thing that once broke it completely:
// touching localStorage outside try/catch (it throws when the browser blocks site data).
test('demo only touches localStorage inside try/catch', () => {
  const src = readFileSync(new URL('../demo/app.js', import.meta.url), 'utf8');
  const lines = src.split('\n').filter((l) => /localStorage\./.test(l));
  assert.ok(lines.length > 0);
  for (const l of lines) assert.match(l, /try \{.*localStorage\..*\} catch/, l.trim());
});
