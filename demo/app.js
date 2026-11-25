import { createGame, loadGame } from '../engine/game.js';
import { fill } from '../engine/text.js';

// packs the demo can load; ?pack=<id> picks one (unknown ids fall back to the first)
const PACKS = ['first-job', 'night-market'];
const want = new URLSearchParams(location.search).get('pack');
const packId = PACKS.includes(want) ? want : PACKS[0];
const app = document.getElementById('app');
// localStorage throws (SecurityError) when the browser blocks site data; fall back to
// memory so the demo still plays, just without resume / remembered language
const mem = new Map();
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return mem.get(k) ?? null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { mem.set(k, v); } },
  del: (k) => { try { localStorage.removeItem(k); } catch { mem.delete(k); } },
};
let all;
try {
  all = await Promise.all(PACKS.map(async (id) => {
    const r = await fetch(`packs/${id}/pack.json`);
    if (!r.ok) throw new Error(`packs/${id}/pack.json: HTTP ${r.status}`);
    return r.json();
  }));
} catch (err) {
  app.innerHTML = '<p class="muted"></p>';
  app.firstChild.textContent = `Could not load the packs (${err.message}). Serve the folder over HTTP, e.g. npm run serve.`;
  throw err;
}
const pack = all[PACKS.indexOf(packId)];
const KEY = 'lifesim-kit:' + pack.id;
const LANGS = ['zh', 'en', 'ja'];
const nav = navigator.language || '';
let lang = store.get('lifesim-kit:lang') || (nav.startsWith('zh') ? 'zh' : nav.startsWith('ja') ? 'ja' : 'en');
if (!LANGS.includes(lang)) lang = 'en';
const T = (x) => (x && typeof x === 'object' ? x[lang] ?? x.en ?? Object.values(x)[0] : x ?? '');
// pack text with {stat:…}/{turn}/{flag:…?a|b} filled in from the current run
const F = (x) => (game ? fill(T(x), game.state, pack) : T(x));
const UI = { zh: { start: '开始', again: '再来一局', next: '继续', ending: '结局', cont: '继续上次', log: '这一局', other: '换个剧本' }, en: { start: 'Start', again: 'Play again', next: 'Continue', ending: 'Ending', cont: 'Resume', log: 'This run', other: 'Other packs' }, ja: { start: 'はじめる', again: 'もう一度', next: 'つぎへ', ending: 'エンディング', cont: '続きから', log: '今回の記録', other: 'ほかのシナリオ' } };
const u = (k) => UI[lang][k];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
let game = null, last = null;
const deltas = (cs) => cs.map((c) => `${T(pack.stats[c.key].label)} ${c.delta > 0 ? '+' : ''}${c.delta}`).join(' · ');

function stats() {
  return `<div class="card stats">${Object.entries(pack.stats).map(([k, d]) => {
    const v = game.state.stats[k], w = d.max < 1000 ? (100 * v) / d.max : null;
    return `<div class="stat">${esc(T(d.label))}<b>${v}</b>${w !== null ? `<div class="bar"><i style="width:${w}%"></i></div>` : ''}</div>`;
  }).join('')}</div>`;
}
// the run as a list: month, event, what you picked and what changed
function timeline() {
  const byId = new Map(pack.events.map((e) => [e.id, e]));
  const rows = game.state.log.map((l) => {
    const e = byId.get(l.event), c = e?.choices[l.choice];
    const d = deltas([...(l.entered ?? []), ...l.changes]);
    return `<li><span class="muted">${esc(T(pack.turnLabel).replace('{n}', l.turn))}</span> <b>${esc(T(e?.title))}</b>${c ? ` → ${esc(T(c.label))}` : ''}${d ? `<div class="delta">${esc(d)}</div>` : ''}</li>`;
  });
  return rows.length ? `<details class="card log"><summary>${u('log')} (${rows.length})</summary><ol>${rows.join('')}</ol></details>` : '';
}
function title() {
  const saved = store.get(KEY);
  app.innerHTML = `<h1>${esc(T(pack.title))}</h1><p>${esc(T(pack.intro))}</p>
    <button class="primary" id="go">${u('start')}</button> ${saved ? `<button class="choice" id="resume" style="display:inline-block;width:auto">${u('cont')}</button>` : ''}
    <p class="muted">${u('other')}: ${all.filter((p) => p.id !== pack.id).map((p) => `<a href="?pack=${encodeURIComponent(p.id)}">${esc(T(p.title))}</a>`).join(' · ')}</p>`;
  document.getElementById('go').onclick = () => { game = createGame(pack); last = null; render(); };
  const r = document.getElementById('resume');
  if (r) r.onclick = () => { try { game = loadGame(pack, saved); render(); } catch { store.del(KEY); title(); } };
}
function render() {
  store.set(KEY, game.save());
  const s = game.state;
  const head = `<p class="muted">${esc(T(pack.turnLabel).replace('{n}', s.turn))} / ${pack.turns}</p>${stats()}`;
  const res = last ? `<div class="card result">${esc(F(last.result))}<div class="delta">${esc(deltas(last.changes))}</div></div>` : '';
  if (s.ended) {
    store.del(KEY);
    const e = game.ending();
    app.innerHTML = head + res + `<div class="card"><p class="muted">${u('ending')}</p><h2>${esc(F(e?.title))}</h2><p>${esc(F(e?.text))}</p></div>${timeline()}<button class="primary" id="again">${u('again')}</button>`;
    document.getElementById('again').onclick = () => { game = createGame(pack); last = null; render(); };
    return;
  }
  const e = game.current(), ent = game.entered();
  app.innerHTML = head + res + `<div class="card"><h2>${esc(F(e.title))}</h2><p>${esc(F(e.text))}</p>${ent.length ? `<div class="delta">${esc(deltas(ent))}</div>` : ''}${game.choices().map((c, n) => `<button class="choice" data-i="${c.index}"><kbd>${n + 1}</kbd> ${esc(F(c.label))}</button>`).join('')}</div>`;
  app.querySelectorAll('button.choice').forEach((b) => (b.onclick = () => { last = game.choose(+b.dataset.i); render(); }));
}
// 1–9 picks the n-th visible choice; Enter presses the main button (start / play again)
document.addEventListener('keydown', (ev) => {
  if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.target.closest?.('input, textarea')) return;
  const n = Number(ev.key);
  const btn = n >= 1 && n <= 9 ? app.querySelectorAll('button.choice[data-i]')[n - 1] : ev.key === 'Enter' && ev.target === document.body ? app.querySelector('button.primary') : null;
  if (btn) { ev.preventDefault(); btn.click(); }
});
const lb = document.getElementById('lang');
// the button names the language you switch to: 中文 → EN → 日本語 → 中文
const NAME = { zh: '中文', en: 'EN', ja: '日本語' };
const nextLang = () => LANGS[(LANGS.indexOf(lang) + 1) % LANGS.length];
const setLang = () => { document.documentElement.lang = lang; lb.textContent = NAME[nextLang()]; };
lb.onclick = () => { lang = nextLang(); store.set('lifesim-kit:lang', lang); setLang(); game ? render() : title(); };
setLang(); title();
