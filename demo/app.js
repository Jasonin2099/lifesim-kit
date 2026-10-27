import { createGame, loadGame } from '../engine/game.js';
import { fill } from '../engine/text.js';

const pack = await (await fetch('packs/first-job/pack.json')).json();
const KEY = 'lifesim-kit:' + pack.id;
let lang = localStorage.getItem('lifesim-kit:lang') || (navigator.language.startsWith('zh') ? 'zh' : 'en');
const T = (x) => (x && typeof x === 'object' ? x[lang] ?? x.en ?? Object.values(x)[0] : x ?? '');
// pack text with {stat:…}/{turn}/{flag:…?a|b} filled in from the current run
const F = (x) => (game ? fill(T(x), game.state, pack) : T(x));
const UI = { zh: { start: '开始', again: '再来一局', next: '继续', ending: '结局', cont: '继续上次', log: '这一局' }, en: { start: 'Start', again: 'Play again', next: 'Continue', ending: 'Ending', cont: 'Resume', log: 'This run' } };
const u = (k) => UI[lang][k];
const app = document.getElementById('app');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
let game = null, last = null;

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
    const d = l.changes.map((x) => `${T(pack.stats[x.key].label)} ${x.delta > 0 ? '+' : ''}${x.delta}`).join(' · ');
    return `<li><span class="muted">${esc(T(pack.turnLabel).replace('{n}', l.turn))}</span> <b>${esc(T(e?.title))}</b> → ${esc(T(c?.label))}${d ? `<div class="delta">${esc(d)}</div>` : ''}</li>`;
  });
  return rows.length ? `<details class="card log"><summary>${u('log')} (${rows.length})</summary><ol>${rows.join('')}</ol></details>` : '';
}
function title() {
  const saved = localStorage.getItem(KEY);
  app.innerHTML = `<h1>${esc(T(pack.title))}</h1><p>${esc(T(pack.intro))}</p>
    <button class="primary" id="go">${u('start')}</button> ${saved ? `<button class="choice" id="resume" style="display:inline-block;width:auto">${u('cont')}</button>` : ''}`;
  document.getElementById('go').onclick = () => { game = createGame(pack); last = null; render(); };
  const r = document.getElementById('resume');
  if (r) r.onclick = () => { try { game = loadGame(pack, saved); render(); } catch { localStorage.removeItem(KEY); title(); } };
}
function render() {
  localStorage.setItem(KEY, game.save());
  const s = game.state;
  const head = `<p class="muted">${esc(T(pack.turnLabel).replace('{n}', s.turn))} / ${pack.turns}</p>${stats()}`;
  const res = last ? `<div class="card result">${esc(F(last.result))}<div class="delta">${last.changes.map((c) => `${T(pack.stats[c.key].label)} ${c.delta > 0 ? '+' : ''}${c.delta}`).join(' · ')}</div></div>` : '';
  if (s.ended) {
    localStorage.removeItem(KEY);
    const e = game.ending();
    app.innerHTML = head + res + `<div class="card"><p class="muted">${u('ending')}</p><h2>${esc(F(e?.title))}</h2><p>${esc(F(e?.text))}</p></div>${timeline()}<button class="primary" id="again">${u('again')}</button>`;
    document.getElementById('again').onclick = () => { game = createGame(pack); last = null; render(); };
    return;
  }
  const e = game.current();
  app.innerHTML = head + res + `<div class="card"><h2>${esc(F(e.title))}</h2><p>${esc(F(e.text))}</p>${game.choices().map((c, n) => `<button class="choice" data-i="${c.index}"><kbd>${n + 1}</kbd> ${esc(F(c.label))}</button>`).join('')}</div>`;
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
const setLang = () => { document.documentElement.lang = lang; lb.textContent = lang === 'zh' ? 'EN' : '中文'; };
lb.onclick = () => { lang = lang === 'zh' ? 'en' : 'zh'; localStorage.setItem('lifesim-kit:lang', lang); setLang(); game ? render() : title(); };
setLang(); title();
