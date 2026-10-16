import { createGame, loadGame } from '../engine/game.js';

const pack = await (await fetch('packs/first-job/pack.json')).json();
const KEY = 'lifesim-kit:' + pack.id;
let lang = localStorage.getItem('lifesim-kit:lang') || (navigator.language.startsWith('zh') ? 'zh' : 'en');
const T = (x) => (x && typeof x === 'object' ? x[lang] ?? x.en ?? Object.values(x)[0] : x ?? '');
const UI = { zh: { start: '开始', again: '再来一局', next: '继续', ending: '结局', cont: '继续上次' }, en: { start: 'Start', again: 'Play again', next: 'Continue', ending: 'Ending', cont: 'Resume' } };
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
  const res = last ? `<div class="card result">${esc(T(last.result))}<div class="delta">${last.changes.map((c) => `${T(pack.stats[c.key].label)} ${c.delta > 0 ? '+' : ''}${c.delta}`).join(' · ')}</div></div>` : '';
  if (s.ended) {
    localStorage.removeItem(KEY);
    const e = game.ending();
    app.innerHTML = head + res + `<div class="card"><p class="muted">${u('ending')}</p><h2>${esc(T(e?.title))}</h2><p>${esc(T(e?.text))}</p></div><button class="primary" id="again">${u('again')}</button>`;
    document.getElementById('again').onclick = () => { game = createGame(pack); last = null; render(); };
    return;
  }
  const e = game.current();
  app.innerHTML = head + res + `<div class="card"><h2>${esc(T(e.title))}</h2><p>${esc(T(e.text))}</p>${game.choices().map((c) => `<button class="choice" data-i="${c.index}">${esc(T(c.label))}</button>`).join('')}</div>`;
  app.querySelectorAll('button.choice').forEach((b) => (b.onclick = () => { last = game.choose(+b.dataset.i); render(); }));
}
const lb = document.getElementById('lang');
const setLang = () => { document.documentElement.lang = lang; lb.textContent = lang === 'zh' ? 'EN' : '中文'; };
lb.onclick = () => { lang = lang === 'zh' ? 'en' : 'zh'; localStorage.setItem('lifesim-kit:lang', lang); setLang(); game ? render() : title(); };
setLang(); title();
