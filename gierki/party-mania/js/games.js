// 30 minigier. Każda: {id, name, icon, desc, time (s), min, max, team?, shared?, play(ctx), resolve?}
// Wynik: ctx.score(liczba, etykieta) — WIĘKSZA liczba = lepiej.
// Wszyscy gracze dostają ten sam seed => te same plansze/pytania.
import { h, ri, pick, shuffle, clamp, norm } from './util.js';
import { register } from './games-extra.js';

export const GAMES = [];
const def = (g) => GAMES.push({ min: 1, max: 8, time: 30, ...g });

const flash = (el, text, cls) => { el.textContent = text; el.className = 'fb ' + cls; };
const shake = (el) => { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); };

const WORDS = ['kot', 'pies', 'dom', 'zamek', 'rakieta', 'kwiat', 'słońce', 'księżyc', 'gwiazda', 'rower', 'pociąg', 'samolot', 'komputer', 'telefon', 'jabłko', 'banan', 'truskawka', 'czekolada', 'herbata', 'kawa', 'mleko', 'chleb', 'masło', 'pizza', 'ogórek', 'marchewka', 'zebra', 'żyrafa', 'słoń', 'tygrys', 'wilk', 'sowa', 'żółw', 'motyl', 'pszczoła', 'mrówka', 'góra', 'morze', 'rzeka', 'jezioro', 'plaża', 'wyspa', 'zima', 'lato', 'wiosna', 'jesień', 'burza', 'tęcza', 'chmura', 'śnieg', 'deszcz', 'kino', 'muzyka', 'gitara', 'piłka', 'bramka', 'medal', 'korona', 'skarb', 'smok', 'rycerz', 'piernik', 'pierogi', 'bigos', 'kotlet', 'zupa', 'okno', 'krzesło', 'lampa', 'ołówek', 'szkoła', 'balon', 'kapelusz', 'parasol', 'latarnia', 'kometa', 'planeta', 'wulkan', 'pustynia', 'kaktus', 'dżungla', 'pingwin', 'delfin', 'rekin', 'papuga'];
const MEMO = ['🍕', '🚀', '🐸', '🎸', '⚽', '🌈', '🍩', '🦄', '🐙', '🎈', '🍉', '👑', '🐝', '🎲', '🌵', '🍄'];
const ODD = [['😀', '😃'], ['🐶', '🐱'], ['🍎', '🍅'], ['🌲', '🌳'], ['😺', '😸'], ['🍊', '🍑'], ['🐭', '🐹'], ['🌙', '🌛'], ['🍩', '🍪'], ['🙂', '🙃'], ['🐻', '🐼'], ['🌷', '🌹'], ['⚽', '🏀'], ['🚗', '🚕']];
const QUIZ = [
  ['Stolica Australii to…', 'Canberra', 'Sydney', 'Melbourne', 'Perth'],
  ['Ile nóg ma pająk?', '8', '6', '10', '12'],
  ['Najdłuższa rzeka w Polsce?', 'Wisła', 'Odra', 'Warta', 'Bug'],
  ['Symbol chemiczny złota?', 'Au', 'Ag', 'Zn', 'Fe'],
  ['Ile minut ma doba?', '1440', '1240', '1640', '1340'],
  ['Kto napisał „Pana Tadeusza”?', 'Adam Mickiewicz', 'Juliusz Słowacki', 'Henryk Sienkiewicz', 'Bolesław Prus'],
  ['Największa planeta Układu Słonecznego?', 'Jowisz', 'Saturn', 'Neptun', 'Ziemia'],
  ['W którym roku Polska wstąpiła do UE?', '2004', '1999', '2007', '2001'],
  ['Pierwiastek z 144 to…', '12', '14', '11', '16'],
  ['Najwyższy szczyt w Polsce?', 'Rysy', 'Śnieżka', 'Giewont', 'Babia Góra'],
  ['Największy ocean na Ziemi?', 'Spokojny', 'Atlantycki', 'Indyjski', 'Arktyczny'],
  ['Stolica Kanady?', 'Ottawa', 'Toronto', 'Vancouver', 'Montreal'],
  ['Ilu zawodników drużyny piłkarskiej gra na boisku?', '11', '10', '9', '12'],
  ['Najmniejsza liczba pierwsza?', '2', '1', '3', '0'],
  ['Jaki gaz pochłaniają rośliny w fotosyntezie?', 'Dwutlenek węgla', 'Tlen', 'Azot', 'Hel'],
  ['Kto namalował „Mona Lisę”?', 'Leonardo da Vinci', 'Michał Anioł', 'Rafael', 'Rembrandt'],
  ['Ile jest kontynentów?', '7', '5', '6', '8'],
  ['Waluta Japonii to…', 'jen', 'juan', 'won', 'rupia'],
  ['Ile boków ma sześciokąt?', '6', '5', '7', '8'],
  ['Stolica Hiszpanii?', 'Madryt', 'Barcelona', 'Sewilla', 'Lizbona'],
  ['Najszybsze zwierzę lądowe?', 'Gepard', 'Lew', 'Antylopa', 'Struś'],
  ['Ile to 15% z 200?', '30', '20', '25', '35'],
  ['W jakim mieście urodził się Mikołaj Kopernik?', 'Toruń', 'Kraków', 'Gdańsk', 'Poznań'],
  ['Ile dni ma rok przestępny?', '366', '365', '364', '367'],
  ['Największy pod względem powierzchni kraj świata?', 'Rosja', 'Kanada', 'Chiny', 'USA'],
  ['Planeta najbliżej Słońca?', 'Merkury', 'Wenus', 'Mars', 'Ziemia'],
  ['H₂O to wzór…', 'wody', 'soli', 'cukru', 'amoniaku'],
  ['Ile serc ma ośmiornica?', '3', '1', '2', '4'],
  ['W którym mieście jest Wawel?', 'Kraków', 'Warszawa', 'Wrocław', 'Gniezno'],
  ['Ile zer ma milion?', '6', '5', '7', '9'],
  ['Niebieski + żółty daje…', 'zielony', 'fioletowy', 'pomarańczowy', 'brązowy'],
  ['Ile strun ma standardowa gitara?', '6', '4', '5', '7'],
  ['7 × 8 = ?', '56', '54', '48', '64'],
  ['Stolica Włoch?', 'Rzym', 'Mediolan', 'Neapol', 'Wenecja'],
  ['Pierwiastek o symbolu O to…', 'tlen', 'złoto', 'osm', 'ołów'],
  ['Ile godzin ma tydzień?', '168', '144', '172', '160'],
  ['Które zwierzę jest ssakiem?', 'delfin', 'rekin', 'pstrąg', 'płaszczka'],
  ['Najdłuższy kość w ciele człowieka to kość…', 'udowa', 'ramienna', 'piszczelowa', 'łokciowa'],
  ['Ile kolorów ma tęcza (tradycyjnie)?', '7', '5', '6', '8'],
  ['Stolica Niemiec?', 'Berlin', 'Monachium', 'Hamburg', 'Bonn'],
];

/* 1 */ def({
  id: 'klik', name: 'Klikomania', icon: '👆', time: 10,
  desc: 'Klikaj w wielki przycisk tak szybko, jak tylko potrafisz!',
  play(c) {
    let n = 0;
    const num = h('div', { class: 'big-num' }, '0');
    const btn = h('button', { class: 'mega-btn' }, 'KLIK!');
    c.on(btn, 'pointerdown', (e) => {
      e.preventDefault(); n++; num.textContent = n; c.score(n, `${n} kliknięć`);
      btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop');
    });
    c.el.append(h('div', { class: 'col center' }, num, btn));
    c.score(0, '0 kliknięć');
  },
});

/* 2 */ def({
  id: 'refleks', name: 'Refleks', icon: '⚡', time: 30,
  desc: 'Gdy pole zrobi się ZIELONE — klikaj! 5 prób, liczy się średni czas. Falstart = +1000 ms.',
  play(c) {
    const T = 5, times = []; let st = 'idle', goAt = 0, tm = null;
    const info = h('div', { class: 'muted' }, '');
    const pad = h('div', { class: 'reflex-pad' }, 'Przygotuj się…');
    c.el.append(h('div', { class: 'col center' }, info, pad));
    const report = () => {
      const done = times.reduce((a, b) => a + b, 0);
      const avg = Math.round((done + (T - times.length) * 1000) / T);
      c.score(-avg, times.length === T ? `${avg} ms` : `${Math.round(done / times.length)} ms (${times.length}/${T})`);
    };
    const next = () => {
      if (times.length >= T) { report(); c.done(); return; }
      info.textContent = `Próba ${times.length + 1}/${T}`;
      st = 'wait'; pad.className = 'reflex-pad wait'; pad.textContent = 'Czekaj na zielone…';
      tm = c.after(() => { st = 'go'; goAt = performance.now(); pad.className = 'reflex-pad go'; pad.textContent = 'KLIK!'; }, 900 + c.rng() * 2600);
    };
    c.on(pad, 'pointerdown', (e) => {
      e.preventDefault();
      if (st === 'wait') {
        clearTimeout(tm); st = 'idle'; times.push(1000);
        pad.className = 'reflex-pad bad'; pad.textContent = 'Falstart! +1000 ms'; report(); c.after(next, 1100);
      } else if (st === 'go') {
        const rt = Math.round(performance.now() - goAt); st = 'idle'; times.push(rt);
        pad.className = 'reflex-pad'; pad.textContent = `${rt} ms`; report(); c.after(next, 1000);
      }
    });
    c.after(next, 700);
  },
});

/* 3 */ def({
  id: 'matma', name: 'Matematyk', icon: '🧮', time: 30,
  desc: 'Rozwiązuj działania. Dobra odpowiedź +1, zła −1.',
  play(c) {
    let pts = 0;
    const q = h('div', { class: 'big-q' }); const opts = h('div', { class: 'grid2' }); const fb = h('div', { class: 'fb' });
    c.el.append(h('div', { class: 'col center' }, q, opts, fb));
    const gen = () => {
      const r = c.rng; const op = pick(r, ['+', '−', '×']); let a, b, ans;
      if (op === '+') { a = ri(r, 5, 60); b = ri(r, 5, 60); ans = a + b; }
      else if (op === '−') { a = ri(r, 20, 99); b = ri(r, 1, a); ans = a - b; }
      else { a = ri(r, 2, 12); b = ri(r, 2, 12); ans = a * b; }
      const set = new Set([ans]);
      while (set.size < 4) { const d = ans + ri(r, -10, 10); if (d >= 0) set.add(d); }
      q.textContent = `${a} ${op} ${b} = ?`;
      opts.replaceChildren(...shuffle(r, [...set]).map((v) => h('button', {
        class: 'opt', onpointerdown: () => {
          if (!c.alive) return;
          if (v === ans) { pts++; flash(fb, '✔ dobrze', 'ok'); } else { pts--; flash(fb, `✘ było ${ans}`, 'bad'); }
          c.score(pts, `${pts} pkt`); gen();
        },
      }, v)));
    };
    gen(); c.score(0, '0 pkt');
  },
});

/* 4 */ const COLS = [['CZERWONY', '#ff4d6d'], ['NIEBIESKI', '#4dabf7'], ['ZIELONY', '#51cf66'], ['ŻÓŁTY', '#ffd43b'], ['FIOLETOWY', '#cc5de8']];
def({
  id: 'stroop', name: 'Kolorowy mętlik', icon: '🎨', time: 30,
  desc: 'Kliknij KOLOR, którym napisano słowo — nie to, co jest napisane! Zła odpowiedź −1.',
  play(c) {
    let pts = 0, ink = 0;
    const word = h('div', { class: 'stroop-word' }); const fb = h('div', { class: 'fb' });
    const answer = (i) => {
      if (!c.alive) return;
      if (i === ink) { pts++; flash(fb, '✔', 'ok'); } else { pts--; flash(fb, '✘', 'bad'); }
      c.score(pts, `${pts} pkt`); gen();
    };
    const opts = h('div', { class: 'opts' }, ...COLS.map((col, i) => h('button', { class: 'opt', onpointerdown: () => answer(i) }, col[0])));
    const gen = () => {
      const w = ri(c.rng, 0, COLS.length - 1); ink = ri(c.rng, 0, COLS.length - 2); if (ink >= w) ink++;
      word.textContent = COLS[w][0]; word.style.color = COLS[ink][1];
    };
    c.el.append(h('div', { class: 'col center' }, word, opts, fb));
    gen(); c.score(0, '0 pkt');
  },
});

/* 5 */ def({
  id: 'simon', name: 'Powtórz za mną', icon: '🔴', time: 45,
  desc: 'Zapamiętaj sekwencję świecących pól i powtórz ją. Każdy poziom jest dłuższy. Jeden błąd kończy grę.',
  play(c) {
    const cols = ['#ff4d6d', '#4dabf7', '#51cf66', '#ffd43b']; const seq = []; let idx = 0, lock = true, lvl = 0;
    const info = h('div', { class: 'muted' }, 'Patrz uważnie…');
    const press = (i) => {
      if (lock || !c.alive) return;
      lit(i, 200);
      if (seq[idx] !== i) { lock = true; info.textContent = `Błąd! Wynik: poziom ${lvl}`; c.after(() => c.done(), 900); return; }
      idx++;
      if (idx === seq.length) { lvl++; c.score(lvl, `Poziom ${lvl}`); lock = true; c.after(show, 600); }
    };
    const pads = cols.map((col, i) => h('button', { class: 'simon-pad', style: { background: col }, onpointerdown: (e) => { e.preventDefault(); press(i); } }));
    const lit = (i, ms) => { pads[i].classList.add('lit'); c.after(() => pads[i].classList.remove('lit'), ms); };
    const show = () => {
      lock = true; info.textContent = `Poziom ${lvl + 1} — patrz…`; seq.push(ri(c.rng, 0, 3));
      seq.forEach((v, k) => c.after(() => lit(v, 380), 600 + k * 560));
      c.after(() => { lock = false; idx = 0; info.textContent = 'Twoja kolej!'; }, 600 + seq.length * 560);
    };
    c.el.append(h('div', { class: 'col center' }, info, h('div', { class: 'simon' }, ...pads)));
    c.score(0, 'Poziom 0'); show();
  },
});

/* 6 */ def({
  id: 'celownik', name: 'Snajper', icon: '🎯', time: 25,
  desc: 'Trafiaj w pojawiające się tarcze. Każde trafienie = punkt.',
  play(c) {
    let hits = 0;
    const area = h('div', { class: 'arena' }); const t = h('div', { class: 'target' }, '🎯'); area.append(t);
    const move = () => {
      t.style.left = ri(c.rng, 7, 93) + '%'; t.style.top = ri(c.rng, 9, 91) + '%';
      t.classList.remove('pop'); void t.offsetWidth; t.classList.add('pop');
    };
    c.on(t, 'pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); hits++; c.score(hits, `${hits} trafień`); move(); });
    c.el.append(area); move(); c.score(0, '0 trafień');
  },
});

/* 7 */ def({
  id: 'liczenie', name: 'Rachmistrz', icon: '🍎', time: 40,
  desc: 'Przez chwilę zobaczysz owoce. Policz same JABŁKA 🍎 (nie pomidory!). 5 rund, max 10 pkt za rundę.',
  play(c) {
    const R = 5; let r = 0, total = 0;
    const area = h('div', { class: 'arena' }); const info = h('div', { class: 'muted' }); const ctrl = h('div', { class: 'row center' });
    c.el.append(h('div', { class: 'col center' }, info, area, ctrl));
    const round = () => {
      if (r >= R) { c.done(); return; }
      r++;
      const n = ri(c.rng, 5, 15), m = ri(c.rng, 3, 9);
      info.textContent = `Runda ${r}/${R}: policz jabłka 🍎`; ctrl.replaceChildren(); area.replaceChildren();
      const items = shuffle(c.rng, [...Array(n).fill('🍎'), ...Array(m).fill('🍅')]);
      const cells = shuffle(c.rng, Array.from({ length: 30 }, (_, i) => i));
      items.forEach((e, k) => {
        const cell = cells[k]; const x = ((cell % 6) + 0.5) / 6 * 100 + ri(c.rng, -4, 4); const y = (Math.floor(cell / 6) + 0.5) / 5 * 100 + ri(c.rng, -5, 5);
        area.append(h('span', { class: 'item', style: { left: x + '%', top: y + '%' } }, e));
      });
      c.after(() => {
        area.replaceChildren(h('div', { class: 'arena-msg' }, 'Ile było jabłek?'));
        const inp = h('input', { type: 'number', inputmode: 'numeric', class: 'inp', min: 0, max: 40 });
        const ok = h('button', { class: 'btn primary' }, 'OK');
        const submit = () => {
          const v = parseInt(inp.value, 10); if (isNaN(v) || !c.alive) return;
          const d = Math.abs(v - n); const p = Math.max(0, 10 - d * 3); total += p; c.score(total, `${total} pkt`);
          area.replaceChildren(h('div', { class: 'arena-msg' }, `Było ${n} 🍎 — ${d === 0 ? 'idealnie! +10' : `+${p}`}`));
          ctrl.replaceChildren(); c.after(round, 1300);
        };
        ok.onclick = submit; inp.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
        ctrl.append(inp, ok); inp.focus();
      }, 1800);
    };
    c.score(0, '0 pkt'); round();
  },
});

/* 8 */ def({
  id: 'pisanie', name: 'Szybkie palce', icon: '⌨️', time: 30,
  desc: 'Przepisuj pojawiające się słowa. Polskie znaki nie są wymagane.',
  play(c) {
    let pts = 0, i = 0; const list = shuffle(c.rng, WORDS);
    const w = h('div', { class: 'big-q' });
    const inp = h('input', { class: 'inp wide', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'pisz tutaj…' });
    const show = () => { w.textContent = list[i % list.length]; };
    c.on(inp, 'input', () => {
      if (norm(inp.value) === norm(list[i % list.length])) { pts++; i++; inp.value = ''; c.score(pts, `${pts} słów`); show(); }
    });
    c.el.append(h('div', { class: 'col center' }, w, inp));
    show(); c.score(0, '0 słów'); setTimeout(() => inp.focus(), 50);
  },
});

/* 9 */ def({
  id: 'memo', name: 'Memory', icon: '🃏', time: 45,
  desc: 'Odkrywaj karty i znajdź wszystkie 8 par. Szybkie ukończenie daje bonus.',
  play(c) {
    const em = shuffle(c.rng, MEMO).slice(0, 8); const deck = shuffle(c.rng, [...em, ...em]);
    let open = [], pairs = 0, lock = false;
    const flip = (i) => {
      if (lock || !c.alive) return;
      const cd = cards[i]; if (cd.classList.contains('up')) return;
      cd.classList.add('up'); open.push(i);
      if (open.length < 2) return;
      const [a, b] = open; open = [];
      if (deck[a] === deck[b]) {
        cards[a].classList.add('done'); cards[b].classList.add('done'); pairs++;
        if (pairs === 8) { const bonus = Math.ceil(c.timeLeft() / 1000); c.score(80 + bonus, `8/8 par +${bonus} bonus`); c.done(); }
        else c.score(pairs * 10, `${pairs}/8 par`);
      } else {
        lock = true;
        c.after(() => { cards[a].classList.remove('up'); cards[b].classList.remove('up'); lock = false; }, 650);
      }
    };
    const cards = deck.map((e, i) => h('button', { class: 'mcard', onpointerdown: (ev) => { ev.preventDefault(); flip(i); } }, h('span', {}, e)));
    c.el.append(h('div', { class: 'memo' }, ...cards)); c.score(0, '0/8 par');
  },
});

/* 10 */ def({
  id: 'odmieniec', name: 'Znajdź intruza', icon: '🔍', time: 30,
  desc: 'Wśród identycznych symboli jeden jest inny. Znajdź go! Pomyłka = 1 s kary.',
  play(c) {
    let lvl = 0, lock = false;
    const fb = h('div', { class: 'muted' }, 'Znajdź inny symbol!');
    const grid = h('div', { class: 'odd-grid' });
    const choose = (ok) => {
      if (lock || !c.alive) return;
      if (ok) { lvl++; c.score(lvl, `${lvl} znalezionych`); gen(); }
      else {
        lock = true; shake(grid); fb.textContent = 'Pudło! (1 s kary)';
        c.after(() => { lock = false; fb.textContent = 'Znajdź inny symbol!'; }, 1000);
      }
    };
    const gen = () => {
      const n = Math.min(3 + Math.floor(lvl / 2), 7); let [a, b] = pick(c.rng, ODD); if (c.rng() < 0.5) [a, b] = [b, a];
      const odd = ri(c.rng, 0, n * n - 1);
      grid.style.gridTemplateColumns = `repeat(${n},1fr)`; grid.style.fontSize = `calc(min(86vw, 52vh) / ${n} * 0.55)`;
      grid.replaceChildren(...Array.from({ length: n * n }, (_, i) => h('button', { class: 'odd-cell', onpointerdown: (e) => { e.preventDefault(); choose(i === odd); } }, i === odd ? b : a)));
    };
    c.el.append(h('div', { class: 'col center' }, fb, grid));
    gen(); c.score(0, '0 znalezionych');
  },
});

/* 11 */ def({
  id: 'stoper', name: 'Wyczucie czasu', icon: '⏱️', time: 40,
  desc: 'Zatrzymaj stoper dokładnie na 5.000 s. Po 1,5 s licznik znika! 3 próby, liczy się średnia odchyłka.',
  play(c) {
    const diffs = []; let st = 'idle', t0 = 0;
    const disp = h('div', { class: 'big-num mono' }, '0.000');
    const info = h('div', { class: 'muted' }, 'Próba 1/3 — cel: 5.000 s');
    const report = () => {
      const sum = diffs.reduce((a, b) => a + b, 0);
      c.score(-Math.round((sum + (3 - diffs.length) * 5000) / 3), `śr. odchyłka ${Math.round(sum / diffs.length)} ms`);
    };
    const act = () => {
      if (!c.alive) return;
      if (st === 'idle') { st = 'run'; t0 = performance.now(); btn.textContent = 'STOP'; }
      else if (st === 'run') {
        const el = performance.now() - t0; const d = Math.round(Math.abs(el - 5000)); diffs.push(d); st = 'pause';
        disp.textContent = (el / 1000).toFixed(3); info.textContent = `Odchyłka: ${d} ms`; report(); btn.textContent = '…';
        c.after(() => {
          if (diffs.length >= 3) { c.done(); return; }
          st = 'idle'; btn.textContent = 'START'; disp.textContent = '0.000'; info.textContent = `Próba ${diffs.length + 1}/3 — cel: 5.000 s`;
        }, 1500);
      }
    };
    const btn = h('button', { class: 'mega-btn small', onpointerdown: (e) => { e.preventDefault(); act(); } }, 'START');
    c.loop(() => { if (st === 'run') { const el = performance.now() - t0; disp.textContent = el < 1500 ? (el / 1000).toFixed(3) : '?.???'; } });
    c.keys((k) => { if (k === 'space') act(); });
    c.el.append(h('div', { class: 'col center' }, info, disp, btn, h('div', { class: 'muted small' }, 'Spacja też działa')));
  },
});

/* 12 */ const AR = { up: '⬆️', down: '⬇️', left: '⬅️', right: '➡️' }; const DIRS = ['up', 'down', 'left', 'right'];
def({
  id: 'strzalki', name: 'Strzałkowy szał', icon: '⬆️', time: 25,
  desc: 'Wciskaj strzałki w pokazanej kolejności. Błąd = sekwencja od nowa.',
  play(c) {
    let pts = 0, seq = [], pos = 0; const row = h('div', { class: 'arrows' });
    const render = () => row.replaceChildren(...seq.map((d, i) => h('span', { class: 'arrow' + (i < pos ? ' ok' : '') }, AR[d])));
    const gen = () => { const len = Math.min(4 + Math.floor(pts / 3), 8); seq = Array.from({ length: len }, () => pick(c.rng, DIRS)); pos = 0; render(); };
    const press = (d) => {
      if (!c.alive) return;
      if (seq[pos] === d) { pos++; if (pos === seq.length) { pts++; c.score(pts, `${pts} sekwencji`); gen(); } else render(); }
      else { pos = 0; render(); shake(row); }
    };
    c.keys((k) => { if (DIRS.includes(k)) press(k); });
    c.el.append(h('div', { class: 'col center' }, row, c.dpad(press), h('div', { class: 'muted small' }, 'Strzałki/WASD na klawiaturze lub przyciski')));
    gen(); c.score(0, '0 sekwencji');
  },
});

/* 13 */ def({
  id: 'wyzejnizej', name: 'Wyżej czy niżej?', icon: '↕️', time: 30,
  desc: 'Zgadnij, czy następna liczba (1–100) będzie wyższa czy niższa. Trafienie +1, pudło −1.',
  play(c) {
    let cur = ri(c.rng, 1, 100), pts = 0, streak = 0;
    const num = h('div', { class: 'big-num' }, cur); const fb = h('div', { class: 'muted' }, 'Wyżej czy niżej?');
    const guess = (up) => {
      if (!c.alive) return;
      const nx = ri(c.rng, 1, 100); const ok = nx === cur || (up ? nx > cur : nx < cur);
      if (ok) { pts++; streak++; } else { pts--; streak = 0; }
      fb.textContent = `${cur} → ${nx} ${ok ? '✔' : '✘'}${streak > 2 ? `  🔥×${streak}` : ''}`;
      cur = nx; num.textContent = cur; c.score(pts, `${pts} pkt`);
    };
    c.keys((k) => { if (k === 'up') guess(true); if (k === 'down') guess(false); });
    c.el.append(h('div', { class: 'col center' }, num, fb, h('div', { class: 'row center' },
      h('button', { class: 'btn big', onpointerdown: () => guess(true) }, '⬆ Wyżej'),
      h('button', { class: 'btn big', onpointerdown: () => guess(false) }, '⬇ Niżej'))));
    c.score(0, '0 pkt');
  },
});

/* 14 */ def({
  id: 'kolejnosc', name: 'Po kolei', icon: '🔢', time: 40,
  desc: 'Klikaj liczby od 1 do 16 po kolei, jak najszybciej.',
  play(c) {
    const nums = shuffle(c.rng, Array.from({ length: 16 }, (_, i) => i + 1)); let next = 1; const t0 = performance.now();
    const grid = h('div', { class: 'num-grid' }, ...nums.map((n) => {
      const b = h('button', { class: 'num-cell' }, n);
      c.on(b, 'pointerdown', (e) => {
        e.preventDefault();
        if (n === next) {
          b.classList.add('done'); next++;
          if (next > 16) { const t = (performance.now() - t0) / 1000; c.score(1000 - Math.round(t * 10), `${t.toFixed(1)} s`); c.done(); }
          else c.score((next - 1) * 10, `${next - 1}/16`);
        } else if (n > next) { b.classList.add('bad'); c.after(() => b.classList.remove('bad'), 300); }
      });
      return b;
    }));
    c.el.append(grid); c.score(0, '0/16');
  },
});

/* 15 */ def({
  id: 'balon', name: 'Balonowe ryzyko', icon: '🎈', time: 40,
  desc: 'Pompuj balon — każde pompnięcie to +1 pkt do zebrania. Zbierz zanim pęknie! 5 balonów.',
  play(c) {
    const N = 5; const th = Array.from({ length: N }, () => ri(c.rng, 3, 22)); let b = 0, pumps = 0, total = 0, lock = false;
    const bal = h('div', { class: 'balloon' }, '🎈'); const info = h('div', { class: 'muted' }); const pot = h('div', { class: 'big-num small' });
    const upd = () => { info.textContent = `Balon ${b + 1}/${N} · bank: ${total} pkt`; pot.textContent = `+${pumps}`; bal.style.transform = `scale(${Math.min(2.6, 1 + pumps * 0.08)})`; };
    const nextB = () => { b++; pumps = 0; lock = false; if (b >= N) { c.done(); return; } bal.textContent = '🎈'; upd(); };
    const pump = () => {
      if (lock || !c.alive) return; pumps++;
      if (pumps >= th[b]) { lock = true; bal.textContent = '💥'; pot.textContent = 'BUM! +0'; c.after(nextB, 900); } else upd();
    };
    const cash = () => {
      if (lock || !c.alive || pumps === 0) return; lock = true; total += pumps; c.score(total, `${total} pkt`);
      pot.textContent = `Zebrano +${pumps}`; c.after(nextB, 700);
    };
    c.keys((k) => { if (k === 'space' || k === 'up') pump(); if (k === 'enter' || k === 'down') cash(); });
    c.el.append(h('div', { class: 'col center' }, info, h('div', { class: 'balloon-box' }, bal), pot, h('div', { class: 'row center' },
      h('button', { class: 'btn big', onpointerdown: (e) => { e.preventDefault(); pump(); } }, '💨 Pompuj'),
      h('button', { class: 'btn big primary', onpointerdown: (e) => { e.preventDefault(); cash(); } }, '💰 Zbierz'))));
    upd(); c.score(0, '0 pkt');
  },
});

/* 16 */ def({
  id: 'flappy', name: 'Fruwający ptak', icon: '🐤', time: 30,
  desc: 'Klikaj/stukaj (lub spacja), by podfrunąć i przelatywać przez szczeliny. Punkt za każdą rurę.',
  play(c) {
    const W = 360, H = 540, GAP = 150, BX = 80; const [cv, g] = c.canvas(W, H); c.el.append(cv);
    let y = H / 2, vy = -250, passed = 0, inv = 0, t = 0, nextSpawn = 1.2; const pipes = [];
    const flap = () => { vy = -380; };
    c.on(cv, 'pointerdown', (e) => { e.preventDefault(); flap(); }); c.keys((k) => { if (k === 'space' || k === 'up') flap(); });
    c.loop((dt) => {
      t += dt; vy += 1300 * dt; y += vy * dt; inv = Math.max(0, inv - dt);
      if (t >= nextSpawn) { nextSpawn += 1.45; pipes.push({ x: W + 30, gy: ri(c.rng, 110, H - 110), done: false, dead: false }); }
      for (const p of pipes) {
        p.x -= 150 * dt;
        if (!p.done && !p.dead && p.x + 30 < BX - 12) { p.done = true; passed++; c.score(passed, `${passed} rur`); }
      }
      while (pipes.length && pipes[0].x < -60) pipes.shift();
      if (inv) y = clamp(y, 14, H - 14);
      let hit = y < 12 || y > H - 12;
      for (const p of pipes) if (!p.dead && BX + 12 > p.x - 30 && BX - 12 < p.x + 30 && (y - 12 < p.gy - GAP / 2 || y + 12 > p.gy + GAP / 2)) hit = true;
      if (hit && !inv) { inv = 1.5; y = H / 2; vy = -200; pipes.forEach((p) => { if (p.x < 260 && !p.done) p.dead = true; }); }
      // rysowanie
      const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#5ec8ff'); sky.addColorStop(1, '#c8f0ff');
      g.fillStyle = sky; g.fillRect(0, 0, W, H);
      for (const p of pipes) {
        g.fillStyle = p.dead ? 'rgba(60,160,60,.25)' : '#3cb043';
        g.fillRect(p.x - 30, 0, 60, p.gy - GAP / 2); g.fillRect(p.x - 30, p.gy + GAP / 2, 60, H);
      }
      if (!inv || Math.floor(t * 10) % 2) {
        g.fillStyle = '#ffd43b'; g.beginPath(); g.arc(BX, y, 13, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#222'; g.beginPath(); g.arc(BX + 5, y - 4, 2.5, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#ff922b'; g.fillRect(BX + 10, y - 1, 8, 4);
      }
      g.fillStyle = '#123'; g.font = 'bold 32px sans-serif'; g.textAlign = 'center'; g.fillText(passed, W / 2, 50);
    });
    c.score(0, '0 rur');
  },
});

/* 17 */ def({
  id: 'unik', name: 'Deszcz bloków', icon: '🧱', time: 30,
  desc: 'Unikaj spadających bloków (strzałki lub przesuwaj palcem/myszą). Masz 3 życia — przetrwaj jak najdłużej.',
  play(c) {
    const W = 360, H = 540, PY = H - 50; const [cv, g] = c.canvas(W, H); c.el.append(cv);
    let px = W / 2, tx = null, lives = 3, inv = 0, t = 0, spawn = 0.5, acc = 0, over = false; const blocks = []; const kd = {};
    c.on(window, 'keydown', (e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'a' || e.key === 'd') { kd[e.key] = true; e.preventDefault(); } });
    c.on(window, 'keyup', (e) => { kd[e.key] = false; });
    c.on(cv, 'pointerdown', (e) => { tx = c.pos(e, cv).x; });
    c.on(cv, 'pointermove', (e) => { if (e.pointerType === 'mouse' || e.buttons) tx = c.pos(e, cv).x; });
    const sc = () => c.score(Math.round(t * 10) * 10 + lives, `${t.toFixed(1)} s · ${'❤'.repeat(lives) || '💀'}`);
    c.loop((dt) => {
      if (over) return;
      t += dt; inv = Math.max(0, inv - dt);
      const L = kd.ArrowLeft || kd.a, R = kd.ArrowRight || kd.d;
      if (L) { px -= 330 * dt; tx = null; } if (R) { px += 330 * dt; tx = null; }
      if (tx != null) px += Math.sign(tx - px) * Math.min(Math.abs(tx - px), 420 * dt);
      px = clamp(px, 18, W - 18);
      if (t >= spawn) {
        const lv = Math.min(t / 30, 1); spawn += 0.55 - 0.3 * lv;
        const w = ri(c.rng, 28, 80); blocks.push({ x: ri(c.rng, 0, W - w), y: -30, w, v: 170 + 200 * lv + ri(c.rng, 0, 60) });
      }
      for (let i = blocks.length - 1; i >= 0; i--) {
        const b = blocks[i]; b.y += b.v * dt;
        if (b.y > H) { blocks.splice(i, 1); continue; }
        if (!inv && b.y + 22 > PY - 15 && b.y < PY + 15 && b.x < px + 15 && b.x + b.w > px - 15) {
          lives--; inv = 1.2; blocks.splice(i, 1);
          if (lives <= 0) { over = true; sc(); c.after(() => c.done(), 600); }
        }
      }
      acc += dt; if (acc > 0.25) { acc = 0; sc(); }
      g.fillStyle = '#1b1438'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#ff6b6b'; blocks.forEach((b) => g.fillRect(b.x, b.y, b.w, 22));
      if (!inv || Math.floor(t * 12) % 2) { g.fillStyle = c.me.color || '#4dabf7'; g.fillRect(px - 15, PY - 15, 30, 30); }
      g.fillStyle = '#fff'; g.font = 'bold 20px sans-serif'; g.textAlign = 'left'; g.fillText('❤'.repeat(lives), 10, 28);
      g.textAlign = 'right'; g.fillText(t.toFixed(1) + ' s', W - 10, 28);
    });
    sc();
  },
});

/* 18 */ def({
  id: 'lapacz', name: 'Łapacz owoców', icon: '🧺', time: 30,
  desc: 'Łap owoce koszykiem (+1), gwiazdki (+3), unikaj bomb (−3). Strzałki lub mysz/palec.',
  play(c) {
    const W = 360, H = 540, BY = H - 40; const [cv, g] = c.canvas(W, H); c.el.append(cv);
    let px = W / 2, tx = null, t = 0, spawn = 0.3, pts = 0; const items = []; const kd = {}; const pops = [];
    c.on(window, 'keydown', (e) => { if (e.key.startsWith('Arrow')) { kd[e.key] = true; e.preventDefault(); } });
    c.on(window, 'keyup', (e) => { kd[e.key] = false; });
    c.on(cv, 'pointerdown', (e) => { tx = c.pos(e, cv).x; });
    c.on(cv, 'pointermove', (e) => { if (e.pointerType === 'mouse' || e.buttons) tx = c.pos(e, cv).x; });
    c.loop((dt) => {
      t += dt;
      if (kd.ArrowLeft) { px -= 380 * dt; tx = null; } if (kd.ArrowRight) { px += 380 * dt; tx = null; }
      if (tx != null) px += Math.sign(tx - px) * Math.min(Math.abs(tx - px), 480 * dt);
      px = clamp(px, 35, W - 35);
      if (t >= spawn) {
        spawn += 0.42; const r = c.rng();
        const it = r < 0.2 ? { e: '💣', p: -3 } : r < 0.28 ? { e: '⭐', p: 3 } : { e: pick(c.rng, ['🍎', '🍌', '🍇', '🍐']), p: 1 };
        items.push({ ...it, x: ri(c.rng, 20, W - 20), y: -20, v: 180 + t * 6 + ri(c.rng, 0, 80) });
      }
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i]; it.y += it.v * dt;
        if (it.y > BY - 22 && it.y < BY + 8 && Math.abs(it.x - px) < 42) {
          pts += it.p; c.score(pts, `${pts} pkt`); pops.push({ x: it.x, y: BY - 30, txt: (it.p > 0 ? '+' : '') + it.p, a: 1 }); items.splice(i, 1);
        } else if (it.y > H + 20) items.splice(i, 1);
      }
      g.fillStyle = '#20163f'; g.fillRect(0, 0, W, H);
      g.font = '28px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      items.forEach((it) => g.fillText(it.e, it.x, it.y));
      g.font = '44px sans-serif'; g.fillText('🧺', px, BY);
      g.font = 'bold 18px sans-serif';
      pops.forEach((p) => { p.y -= 40 * dt; p.a -= dt; g.fillStyle = `rgba(255,255,255,${Math.max(0, p.a)})`; g.fillText(p.txt, p.x, p.y); });
      while (pops.length && pops[0].a <= 0) pops.shift();
      g.fillStyle = '#fff'; g.font = 'bold 24px sans-serif'; g.fillText(pts, W / 2, 26);
    });
    c.score(0, '0 pkt');
  },
});

/* 19 */ def({
  id: 'waz', name: 'Wąż', icon: '🐍', time: 45,
  desc: 'Zbieraj jabłka 🍎 (+1) i złote gwiazdki ⭐ (+3, szybko znikają!). Ściana albo własny ogon = −3 pkt i start od nowa. Im dłuższy wąż, tym szybszy. Strzałki/WASD, przesuwanie palcem lub przyciski.',
  play(c) {
    const N = 17, CS = 24, W = N * CS; const [cv, g] = c.canvas(W, W);
    const V = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    let snake, prev, dir, queue, food = null, gold = null, pts = 0, eaten = 0, acc = 0, state = 'ready', stT = 1.2, t = 0;
    const pops = [];
    const col = c.me.color || '#51cf66';
    const occupied = (p) => snake.some((s) => s.x === p.x && s.y === p.y) || (food && food.x === p.x && food.y === p.y) || (gold && gold.x === p.x && gold.y === p.y);
    const free = () => { let p, k = 0; do { p = { x: ri(c.rng, 0, N - 1), y: ri(c.rng, 0, N - 1) }; } while (occupied(p) && ++k < 500); return p; };
    const reset = () => { const m = N >> 1; snake = [{ x: m, y: m }, { x: m - 1, y: m }, { x: m - 2, y: m }]; prev = snake.map((s) => ({ ...s })); dir = 'right'; queue = []; acc = 0; };
    const interval = () => Math.max(0.065, 0.135 - (snake.length - 3) * 0.0035);
    const report = () => c.score(pts, `${pts} pkt · dł. ${snake.length}`);
    const pop = (p, txt, color) => pops.push({ x: (p.x + 0.5) * CS, y: (p.y + 0.5) * CS, txt, color, a: 1 });
    // kolejka skrętów: szybkie dwa naciśnięcia (np. góra+lewo) nie gubią się
    const turn = (d) => {
      if (!V[d] || !c.alive) return;
      if (state === 'ready') { const [ax, ay] = V[dir], [bx, by] = V[d]; if (ax !== -bx || ay !== -by) dir = d; state = 'run'; return; }
      if (state !== 'run') return;
      const last = queue.length ? queue[queue.length - 1] : dir;
      const [ax, ay] = V[last], [bx, by] = V[d];
      if (d === last || (ax === -bx && ay === -by) || queue.length >= 3) return;
      queue.push(d);
    };
    const crash = () => { state = 'dead'; stT = 0.9; pts = Math.max(0, pts - 3); pop(snake[0], '−3', '#ff6b6b'); report(); };
    const tick = () => {
      if (queue.length) dir = queue.shift();
      const [dx, dy] = V[dir]; const hd = { x: snake[0].x + dx, y: snake[0].y + dy };
      const onFood = hd.x === food.x && hd.y === food.y, onGold = gold && hd.x === gold.x && hd.y === gold.y;
      const body = onFood || onGold ? snake : snake.slice(0, -1); // ogon zdąży się odsunąć
      if (hd.x < 0 || hd.y < 0 || hd.x >= N || hd.y >= N || body.some((s) => s.x === hd.x && s.y === hd.y)) { crash(); return; }
      prev = snake.map((s) => ({ ...s }));
      snake.unshift(hd);
      if (onFood) { pts++; eaten++; pop(hd, '+1', '#fff'); food = free(); if (!gold && eaten % 4 === 0) gold = { ...free(), t: 5 }; }
      else if (onGold) { pts += 3; pop(hd, '+3', '#ffd43b'); gold = null; }
      else snake.pop();
      report();
    };
    reset(); food = free();
    c.keys(turn);
    // przesuwanie palcem: działa też w trakcie jednego ruchu palca (kilka skrętów pod rząd)
    let sw = null;
    c.on(cv, 'pointerdown', (e) => { e.preventDefault(); sw = { x: e.clientX, y: e.clientY }; });
    c.on(cv, 'pointermove', (e) => {
      if (!sw) return; const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
      turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
      sw = { x: e.clientX, y: e.clientY };
    });
    c.on(window, 'pointerup', () => { sw = null; });
    c.loop((dt) => {
      t += dt;
      if (state === 'dead') { stT -= dt; if (stT <= 0) { reset(); state = 'ready'; stT = 1.2; } }
      else if (state === 'ready') { stT -= dt; if (stT <= 0) state = 'run'; }
      else { acc += dt; let k = 0; while (acc >= interval() && k++ < 3) { acc -= interval(); tick(); if (state !== 'run') break; } }
      if (gold) { gold.t -= dt; if (gold.t <= 0) gold = null; }
      const f = state === 'run' ? Math.min(1, acc / interval()) : 1;
      // tło
      g.fillStyle = '#120d2a'; g.fillRect(0, 0, W, W);
      g.fillStyle = 'rgba(255,255,255,.035)';
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if ((i + j) % 2) g.fillRect(i * CS, j * CS, CS, CS);
      g.strokeStyle = state === 'dead' ? '#ff6b6b' : 'rgba(177,151,252,.5)'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, W - 3, W - 3);
      // jedzenie
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const bob = 1 + Math.sin(t * 6) * 0.06;
      const fx = (food.x + 0.5) * CS, fy = (food.y + 0.5) * CS, fr = CS * 0.36 * bob;
      g.fillStyle = '#ff4d4d'; g.beginPath(); g.arc(fx, fy + 1, fr, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.arc(fx - fr * 0.35, fy - fr * 0.25, fr * 0.28, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#7a4a1f'; g.lineWidth = 2; g.beginPath(); g.moveTo(fx, fy - fr + 1); g.lineTo(fx + 1, fy - fr - 4); g.stroke();
      g.fillStyle = '#51cf66'; g.beginPath(); g.ellipse(fx + 4, fy - fr - 2, 4, 2.2, -0.5, 0, Math.PI * 2); g.fill();
      if (gold) {
        const gx = (gold.x + 0.5) * CS, gy = (gold.y + 0.5) * CS;
        g.strokeStyle = '#ffd43b'; g.lineWidth = 2.5; g.beginPath(); g.arc(gx, gy, CS * 0.62, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (gold.t / 5)); g.stroke();
        if (gold.t > 1.2 || Math.floor(t * 8) % 2) {
          g.fillStyle = '#ffd43b'; g.beginPath();
          for (let k = 0; k < 10; k++) { const r = k % 2 ? CS * 0.2 : CS * 0.46, a = -Math.PI / 2 + (k * Math.PI) / 5 + t * 1.5; g.lineTo(gx + Math.cos(a) * r, gy + Math.sin(a) * r); }
          g.closePath(); g.fill();
        }
      }
      // wąż (płynnie interpolowany między kratkami)
      const P = snake.map((s, i) => { const p = prev[i] || s; return [(p.x + (s.x - p.x) * f + 0.5) * CS, (p.y + (s.y - p.y) * f + 0.5) * CS]; });
      const dead = state === 'dead';
      const blink = state === 'ready' && Math.floor(t * 6) % 2;
      if (!blink) {
        g.lineCap = 'round'; g.lineJoin = 'round';
        const path = () => { g.beginPath(); P.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); };
        path(); g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = CS * 0.86; g.stroke();
        path(); g.strokeStyle = dead ? '#8a8a8a' : col; g.lineWidth = CS * 0.7; g.stroke();
        path(); g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = CS * 0.22; g.stroke();
        const [hx, hy] = P[0]; const [vx, vy] = V[queue[0] && state === 'run' ? dir : dir];
        g.fillStyle = dead ? '#8a8a8a' : col; g.beginPath(); g.arc(hx, hy, CS * 0.46, 0, Math.PI * 2); g.fill();
        for (const s of [-1, 1]) {
          const ex = hx + vx * CS * 0.14 + -vy * s * CS * 0.2, ey = hy + vy * CS * 0.14 + vx * s * CS * 0.2;
          g.fillStyle = '#fff'; g.beginPath(); g.arc(ex, ey, CS * 0.13, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#111'; g.beginPath(); g.arc(ex + vx * 2, ey + vy * 2, dead ? 1 : CS * 0.07, 0, Math.PI * 2); g.fill();
        }
      }
      // napisy
      g.font = 'bold 18px sans-serif';
      for (const p of pops) { p.y -= 30 * dt; p.a -= dt * 1.2; g.globalAlpha = Math.max(0, p.a); g.fillStyle = p.color; g.fillText(p.txt, p.x, p.y - 14); }
      g.globalAlpha = 1; while (pops.length && pops[0].a <= 0) pops.shift();
      if (state === 'ready') { g.fillStyle = 'rgba(255,255,255,.85)'; g.font = 'bold 20px sans-serif'; g.fillText('Ruszaj! (dowolny kierunek)', W / 2, W * 0.25); }
    });
    c.el.append(h('div', { class: 'col center' }, cv, c.dpad(turn)));
    report();
  },
});

/* 20 */ def({
  id: 'kret', name: 'Łap chomika', icon: '🐹', time: 25,
  desc: 'Klikaj wyskakujące chomiki (+1). Korona +3, bomba −2!',
  play(c) {
    const EM = { mole: '🐹', gold: '👑', bomb: '💣' }, PT = { mole: 1, gold: 3, bomb: -2 }; let pts = 0;
    const ev = []; let t = 700;
    while (t < c.duration - 400) { const r = c.rng(); ev.push({ t, hole: ri(c.rng, 0, 8), type: r < 0.1 ? 'gold' : r < 0.22 ? 'bomb' : 'mole', dur: ri(c.rng, 700, 1100), hit: false }); t += ri(c.rng, 350, 650); }
    const holes = Array.from({ length: 9 }, () => h('button', { class: 'hole' }, h('span', { class: 'mole' })));
    const t0 = performance.now();
    holes.forEach((ho) => c.on(ho, 'pointerdown', (e) => {
      e.preventDefault(); const x = ho._e; if (!x || x.hit) return;
      x.hit = true; pts += PT[x.type]; c.score(pts, `${pts} pkt`);
      ho.classList.add(x.type === 'bomb' ? 'boom' : 'whack'); c.after(() => ho.classList.remove('boom', 'whack'), 250);
    }));
    c.loop(() => {
      const el = performance.now() - t0; const act = Array(9).fill(null);
      for (const x of ev) { if (x.t > el) break; if (!x.hit && el < x.t + x.dur) act[x.hole] = x; }
      holes.forEach((ho, i) => { const x = act[i]; const s = x ? EM[x.type] : ''; if (ho._s !== s) { ho._s = s; ho.firstChild.textContent = s; ho.classList.toggle('up', !!x); } ho._e = x; });
    });
    c.el.append(h('div', { class: 'holes' }, ...holes)); c.score(0, '0 pkt');
  },
});

/* 21 */ def({
  id: 'oko', name: 'Sokole oko', icon: '👁️', time: 30,
  desc: 'Jeden kwadrat ma odrobinę inny odcień. Znajdź go! Z każdym poziomem trudniej. Pomyłka = 1 s kary.',
  play(c) {
    let lvl = 0, lock = false; const grid = h('div', { class: 'hue-grid' }); const fb = h('div', { class: 'muted' }, 'Który kolor jest inny?');
    const choose = (ok) => {
      if (lock || !c.alive) return;
      if (ok) { lvl++; c.score(lvl, `Poziom ${lvl}`); gen(); }
      else { lock = true; shake(grid); fb.textContent = 'Pudło! (1 s kary)'; c.after(() => { lock = false; fb.textContent = 'Który kolor jest inny?'; }, 1000); }
    };
    const gen = () => {
      const n = Math.min(3 + Math.floor(lvl / 3), 7); const hue = ri(c.rng, 0, 359), sat = ri(c.rng, 50, 75), lig = ri(c.rng, 42, 58);
      const delta = Math.max(3, 22 - lvl * 1.3) * (c.rng() < 0.5 ? 1 : -1); const odd = ri(c.rng, 0, n * n - 1);
      grid.style.gridTemplateColumns = `repeat(${n},1fr)`;
      grid.replaceChildren(...Array.from({ length: n * n }, (_, i) => h('button', {
        class: 'hue-cell', style: { background: `hsl(${hue},${sat}%,${i === odd ? lig + delta : lig}%)` },
        onpointerdown: (e) => { e.preventDefault(); choose(i === odd); },
      })));
    };
    c.el.append(h('div', { class: 'col center' }, fb, grid)); gen(); c.score(0, 'Poziom 0');
  },
});

/* 22 */ def({
  id: 'srodek', name: 'W sam środek', icon: '🎚️', time: 25,
  desc: 'Znacznik jeździ po pasku. Zatrzymaj go jak najbliżej środka! 5 prób, każda szybsza.',
  play(c) {
    const T = 5; let i = 0, total = 0, st = 'run', p = 0, t0 = performance.now() - c.rng() * 2000;
    const mk = h('div', { class: 'aim-mark' }); const bar = h('div', { class: 'aim-bar' }, h('div', { class: 'aim-center' }), mk);
    const info = h('div', { class: 'muted' }, `Próba 1/${T}`); const res = h('div', { class: 'big-num small' }, '');
    c.loop(() => {
      if (st !== 'run') return;
      const tt = (performance.now() - t0) / 1000; const ph = (tt * (0.7 + i * 0.35)) % 2; p = ph < 1 ? ph : 2 - ph; mk.style.left = (p * 100) + '%';
    });
    const stop = () => {
      if (st !== 'run' || !c.alive) return; st = 'pause';
      const acc = Math.max(0, Math.round(100 - Math.abs(p - 0.5) * 200)); total += acc; i++;
      c.score(total, `${total} pkt`); res.textContent = `${acc}%`;
      c.after(() => { if (i >= T) { c.done(); return; } st = 'run'; t0 = performance.now() - c.rng() * 2000; info.textContent = `Próba ${i + 1}/${T}`; res.textContent = ''; }, 900);
    };
    c.keys((k) => { if (k === 'space' || k === 'enter') stop(); });
    c.el.append(h('div', { class: 'col center' }, info, bar, res, h('button', { class: 'mega-btn small', onpointerdown: (e) => { e.preventDefault(); stop(); } }, 'STOP')));
    c.score(0, '0 pkt');
  },
});

/* 24 */ def({
  id: 'quiz', name: 'Quiz wiedzy', icon: '🧠', time: 45,
  desc: '8 pytań. Za dobrą odpowiedź 100 pkt + bonus za szybkość (do 50).',
  play(c) {
    const qs = shuffle(c.rng, QUIZ).slice(0, 8).map((q) => ({ q: q[0], ok: q[1], opts: shuffle(c.rng, q.slice(1)) }));
    let i = 0, pts = 0, good = 0, qt = 0, lock = false;
    const info = h('div', { class: 'muted' }); const qEl = h('div', { class: 'big-q quiz-q' }); const opts = h('div', { class: 'grid2' });
    const show = () => {
      if (i >= qs.length) { c.done(); return; }
      lock = false; qt = performance.now(); const q = qs[i];
      info.textContent = `Pytanie ${i + 1}/${qs.length}`; qEl.textContent = q.q;
      opts.replaceChildren(...q.opts.map((o) => h('button', { class: 'opt', onpointerdown: (e) => answer(o, e.currentTarget) }, o)));
    };
    const answer = (o, btn) => {
      if (lock || !c.alive) return; lock = true; const q = qs[i]; const ok = o === q.ok;
      if (ok) { good++; pts += 100 + Math.max(0, Math.round(50 - (performance.now() - qt) / 100)); }
      btn.classList.add(ok ? 'right' : 'wrong');
      if (!ok) [...opts.children].find((b) => b.textContent === q.ok)?.classList.add('right');
      c.score(pts, `${good}/${qs.length} (${pts} pkt)`); i++; c.after(show, 750);
    };
    c.el.append(h('div', { class: 'col center' }, info, qEl, opts)); show(); c.score(0, `0/${qs.length}`);
  },
});

/* 25 */ def({
  id: 'labirynt', name: 'Labirynt', icon: '🌀', time: 45,
  desc: 'Doprowadź kulkę do mety 🏁. Strzałki, przesunięcie palcem lub przyciski.',
  play(c) {
    const N = 10, CS = 36, W = N * CS; const [cv, g] = c.canvas(W, W);
    const DX = [[0, -1, 1, 4], [1, 0, 2, 8], [0, 1, 4, 1], [-1, 0, 8, 2]]; // dx,dy,ściana tu,ściana tam (1=N 2=E 4=S 8=W)
    const walls = new Array(N * N).fill(15), vis = new Array(N * N).fill(false); const st = [0]; vis[0] = true;
    while (st.length) {
      const cur = st[st.length - 1], x = cur % N, y = Math.floor(cur / N);
      const opts = DX.filter(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < N && ny < N && !vis[ny * N + nx]; });
      if (!opts.length) { st.pop(); continue; }
      const [dx, dy, a, b] = pick(c.rng, opts); const nb = (y + dy) * N + x + dx;
      walls[cur] &= ~a; walls[nb] &= ~b; vis[nb] = true; st.push(nb);
    }
    const dist = new Array(N * N).fill(-1); const q = [N * N - 1]; dist[N * N - 1] = 0;
    while (q.length) { const cur = q.shift(), x = cur % N, y = Math.floor(cur / N); for (const [dx, dy, a] of DX) { if (walls[cur] & a) continue; const nb = (y + dy) * N + x + dx; if (dist[nb] < 0) { dist[nb] = dist[cur] + 1; q.push(nb); } } }
    let px = 0, py = 0; const t0 = performance.now();
    const draw = () => {
      g.fillStyle = '#15102e'; g.fillRect(0, 0, W, W);
      g.font = '24px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🏁', W - CS / 2, W - CS / 2);
      g.strokeStyle = '#b197fc'; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath();
      for (let i = 0; i < N * N; i++) {
        const x = (i % N) * CS, y = Math.floor(i / N) * CS, w = walls[i];
        if (w & 1) { g.moveTo(x, y); g.lineTo(x + CS, y); } if (w & 2) { g.moveTo(x + CS, y); g.lineTo(x + CS, y + CS); }
        if (w & 4) { g.moveTo(x, y + CS); g.lineTo(x + CS, y + CS); } if (w & 8) { g.moveTo(x, y); g.lineTo(x, y + CS); }
      }
      g.stroke();
      g.fillStyle = c.me.color || '#ffd43b'; g.beginPath(); g.arc(px * CS + CS / 2, py * CS + CS / 2, CS * 0.32, 0, Math.PI * 2); g.fill();
    };
    const move = (d) => {
      if (!c.alive) return; const m = { up: 0, right: 1, down: 2, left: 3 }[d]; if (m == null) return;
      const [dx, dy, a] = DX[m]; if (walls[py * N + px] & a) return; px += dx; py += dy; draw();
      const k = py * N + px;
      if (k === N * N - 1) { const t = (performance.now() - t0) / 1000; c.score(1000 - Math.round(t * 10), `Meta w ${t.toFixed(1)} s`); c.done(); }
      else c.score(-dist[k], `${dist[k]} kroków do mety`);
    };
    c.keys(move); c.swipe(cv, move);
    c.el.append(h('div', { class: 'col center' }, cv, c.dpad(move))); draw(); c.score(-dist[0], `${dist[0]} kroków do mety`);
  },
});

/* 26 */ def({
  id: 'unikalna', name: 'Najwyższa unikalna', icon: '🎲', time: 15, min: 3, shared: true,
  desc: 'Wybierz liczbę 1–10. Wygrywa NAJWYŻSZA liczba, której nikt inny nie wybrał. Blefuj!',
  play(c) {
    const cnt = h('div', { class: 'muted small' });
    const choose = (n) => {
      if (!c.alive) return; btns.forEach((b, i) => b.classList.toggle('sel', i + 1 === n));
      c.live.set(`picks/${c.me.uid}`, n); c.score(0, `Wybrano ${n}`);
    };
    const btns = Array.from({ length: 10 }, (_, i) => h('button', { class: 'opt num', onpointerdown: () => choose(i + 1) }, i + 1));
    c.live.watch('picks', (v) => { cnt.textContent = `Wybrało już: ${Object.values(v || {}).filter((x) => x != null).length}/${c.players.length} graczy (możesz zmienić zdanie do końca czasu)`; });
    c.el.append(h('div', { class: 'col center' }, h('div', { class: 'big-q' }, 'Twoja liczba?'), h('div', { class: 'num-pick' }, ...btns), cnt));
    c.score(0, 'brak wyboru');
  },
  resolve(live, scores, players) {
    const picks = live.picks || {}; const cnt = {};
    players.forEach((p) => { const n = picks[p.uid]; if (n != null) cnt[n] = (cnt[n] || 0) + 1; });
    const out = {};
    players.forEach((p) => {
      const n = picks[p.uid];
      out[p.uid] = n == null ? { s: -1, l: 'brak wyboru' } : cnt[n] === 1 ? { s: 100 + n, l: `${n} — unikalna ✓` } : { s: 0, l: `${n} — powtórzona ✗` };
    });
    return out;
  },
});

/* 27 */ def({
  id: 'wieza', name: 'Wieża', icon: '🏗️', time: 40,
  desc: 'Klikaj, by upuścić klocek na wieżę. Wystające części odpadają. Zbuduj jak najwyżej!',
  play(c) {
    const W = 360, H = 540, BH = 26; const [cv, g] = c.canvas(W, H); c.el.append(cv);
    const tower = [{ x: 80, w: 200 }]; let cur = { x: 0, w: 200, dir: 1 }, height = 0, over = false, cam = 0, fall = null;
    const drop = () => {
      if (over || !c.alive) return;
      const top = tower[tower.length - 1];
      if (Math.abs(cur.x - top.x) < 5) cur.x = top.x; // idealne trafienie
      const l = Math.max(cur.x, top.x), r = Math.min(cur.x + cur.w, top.x + top.w), ov = r - l;
      if (ov <= 0) { over = true; fall = { ...cur, y: H - (tower.length + 1) * BH + cam }; c.after(() => c.done(), 1000); return; }
      tower.push({ x: l, w: ov }); height++; c.score(height, `${height} pięter`);
      cur = height % 2 ? { x: W - ov, w: ov, dir: -1 } : { x: 0, w: ov, dir: 1 };
    };
    c.on(cv, 'pointerdown', (e) => { e.preventDefault(); drop(); }); c.keys((k) => { if (k === 'space' || k === 'enter') drop(); });
    c.loop((dt) => {
      if (!over) {
        cur.x += cur.dir * (150 + height * 14) * dt;
        if (cur.x < 0) { cur.x = 0; cur.dir = 1; } if (cur.x + cur.w > W) { cur.x = W - cur.w; cur.dir = -1; }
      }
      const target = Math.max(0, (tower.length + 2) * BH - H * 0.6); cam += (target - cam) * Math.min(1, dt * 5);
      g.fillStyle = '#1b1438'; g.fillRect(0, 0, W, H);
      tower.forEach((b, i) => { g.fillStyle = `hsl(${(i * 23) % 360},70%,60%)`; g.fillRect(b.x, H - (i + 1) * BH + cam, b.w, BH - 2); });
      if (!over) { g.fillStyle = `hsl(${(tower.length * 23) % 360},70%,60%)`; g.fillRect(cur.x, H - (tower.length + 1) * BH + cam, cur.w, BH - 2); }
      if (fall) { fall.y += 400 * dt; g.fillStyle = '#ff6b6b'; g.fillRect(fall.x, fall.y, fall.w, BH - 2); }
      g.fillStyle = '#fff'; g.font = 'bold 26px sans-serif'; g.textAlign = 'center'; g.fillText(over ? `Koniec! ${height}` : height, W / 2, 40);
    });
    c.score(0, '0 pięter');
  },
});

/* 28 */ def({
  id: 'gwiazdy', name: 'Łowcy gwiazd', icon: '⭐', time: 25, min: 2, shared: true,
  desc: 'Wspólne niebo! Gwiazdki pojawiają się u wszystkich naraz — kto pierwszy kliknie, ten ma. Najwięcej gwiazdek wygrywa.',
  play(c) {
    const area = h('div', { class: 'arena sky' }); const LIFE = 2200; let owners = {}, mine = 0;
    const ev = []; let t = 600;
    while (t < c.duration - 800) { ev.push({ i: ev.length, t, x: ri(c.rng, 6, 94), y: ri(c.rng, 8, 90), el: null, gone: false }); t += ri(c.rng, 300, 650); }
    const col = (uid) => c.players.find((p) => p.uid === uid)?.color || '#fff';
    c.live.watch('stars', (v) => { owners = v || {}; });
    const grab = (e) => {
      if (owners[e.i] || !c.alive) return;
      c.live.tx(`stars/${e.i}`, (cur) => (cur == null ? c.me.uid : undefined)).then((r) => {
        if (r.committed && r.value === c.me.uid) { mine++; c.score(mine, `${mine} ⭐`); }
      }).catch(() => {});
    };
    const t0 = performance.now();
    c.loop(() => {
      const el = performance.now() - t0;
      for (const e of ev) {
        if (e.t > el) break; if (e.gone) continue;
        if (!e.el) {
          e.el = h('div', { class: 'star', style: { left: e.x + '%', top: e.y + '%' } }, '⭐');
          c.on(e.el, 'pointerdown', (pe) => { pe.preventDefault(); grab(e); }); area.append(e.el);
        }
        if (owners[e.i]) {
          e.gone = true; e.el.classList.add('taken'); e.el.textContent = '★'; e.el.style.color = col(owners[e.i]);
          const x = e.el; c.after(() => x.remove(), 600);
        } else if (el >= e.t + LIFE) { e.gone = true; e.el.remove(); }
      }
    });
    c.el.append(area); c.score(0, '0 ⭐');
  },
  resolve(live, scores, players) {
    const cnt = {}; Object.values(live.stars || {}).forEach((u) => { if (u) cnt[u] = (cnt[u] || 0) + 1; });
    return Object.fromEntries(players.map((p) => [p.uid, { s: cnt[p.uid] || 0, l: `${cnt[p.uid] || 0} ⭐` }]));
  },
});

/* 29 */ def({
  id: 'terytorium', name: 'Malowanie terytorium', icon: '🖌️', time: 30, min: 2, shared: true,
  desc: 'Wspólna plansza! Klikaj lub przeciągaj po polach, by malować je swoim kolorem. Możesz przemalowywać cudze. Najwięcej pól wygrywa.',
  play(c) {
    const N = c.players.length > 4 ? 10 : 8; const cells = []; let state = {}, last = 0, down = false;
    const grid = h('div', { class: 'terr', style: { gridTemplateColumns: `repeat(${N},1fr)` } });
    for (let i = 0; i < N * N; i++) { const d = h('div', { class: 'tcell' }); d.dataset.i = i; cells.push(d); grid.append(d); }
    const colOf = (uid) => c.players.find((p) => p.uid === uid)?.color || '#888';
    const render = () => {
      let mine = 0;
      cells.forEach((d, i) => { const o = state[i]; const bg = o ? colOf(o) : ''; if (d._bg !== bg) { d._bg = bg; d.style.background = bg; } if (o === c.me.uid) mine++; });
      c.score(mine, `${mine} pól`);
    };
    const paint = (i) => {
      if (!c.alive || i == null || state[i] === c.me.uid) return;
      const now = performance.now(); if (now - last < 110) return; last = now;
      state[i] = c.me.uid; render(); c.live.set(`cells/${i}`, c.me.uid);
    };
    const cellAt = (e) => { const el = document.elementFromPoint(e.clientX, e.clientY); return el && el.parentNode === grid ? +el.dataset.i : null; };
    c.on(grid, 'pointerdown', (e) => { e.preventDefault(); down = true; paint(cellAt(e)); });
    c.on(grid, 'pointermove', (e) => { if (down) paint(cellAt(e)); });
    c.on(window, 'pointerup', () => { down = false; });
    c.live.watch('cells', (v) => { state = { ...(v || {}) }; render(); });
    c.el.append(h('div', { class: 'col center' }, h('div', { class: 'team-badge', style: { background: c.me.color } }, 'Twój kolor'), grid));
  },
  resolve(live, scores, players) {
    const cnt = {}; Object.values(live.cells || {}).forEach((u) => { if (u) cnt[u] = (cnt[u] || 0) + 1; });
    return Object.fromEntries(players.map((p) => [p.uid, { s: cnt[p.uid] || 0, l: `${cnt[p.uid] || 0} pól` }]));
  },
});

/* 30 */ const TN = ['Czerwoni', 'Niebiescy'], TC = ['#ff4d6d', '#4dabf7'];
const teamAvg = (pull, teams) => [0, 1].map((t) => {
  const m = Object.keys(teams).filter((u) => teams[u] === t);
  return m.reduce((a, u) => a + ((pull || {})[u] || 0), 0) / Math.max(1, m.length);
});
def({
  id: 'lina', name: 'Przeciąganie liny', icon: '🪢', time: 20, min: 4, team: true, shared: true,
  desc: 'Gra drużynowa! Klikaj jak szalony, by przeciągnąć linę na stronę swojej drużyny. Liczy się średnia drużyny.',
  play(c) {
    const my = c.teams[c.me.uid] ?? 0; let n = 0, pending = false;
    const knot = h('div', { class: 'knot' }, '🎀'); const lead = h('div', { class: 'muted' }, 'Remis');
    const rope = h('div', { class: 'rope' }, h('div', { class: 'rope-end l', style: { background: TC[0] } }, TN[0]), h('div', { class: 'rope-line' }), knot, h('div', { class: 'rope-end r', style: { background: TC[1] } }, TN[1]));
    const btn = h('button', { class: 'mega-btn', style: { background: TC[my] } }, 'CIĄGNIJ!');
    c.on(btn, 'pointerdown', (e) => {
      e.preventDefault(); n++; c.score(n, `${n} szarpnięć`);
      if (!pending) { pending = true; c.after(() => { pending = false; c.live.set(`pull/${c.me.uid}`, n); }, 150); }
    });
    c.keys((k) => { if (k === 'space') btn.dispatchEvent(new PointerEvent('pointerdown')); });
    c.live.watch('pull', (v) => {
      const [a, b] = teamAvg(v, c.teams); const d = a - b;
      knot.style.left = `${50 - clamp(d * 1.2, -42, 42)}%`;
      lead.textContent = Math.abs(d) < 0.5 ? 'Remis' : `Prowadzą: ${TN[d > 0 ? 0 : 1]} (+${Math.abs(d).toFixed(1)})`;
    });
    c.el.append(h('div', { class: 'col center' }, h('div', { class: 'team-badge', style: { background: TC[my] } }, `Twoja drużyna: ${TN[my]}`), rope, lead, btn));
    c.score(0, '0 szarpnięć');
  },
  resolve(live, scores, players, teams) {
    const [a, b] = teamAvg(live.pull, teams); const d = a - b;
    return Object.fromEntries(players.map((p) => {
      const t = teams[p.uid] ?? 0; const win = Math.abs(d) < 0.01 ? null : (d > 0) === (t === 0);
      return [p.uid, { s: win === null ? 0.5 : win ? 1 : 0, l: `${TN[t]} — ${win === null ? 'remis' : win ? 'wygrana! 🏆' : 'przegrana'}` }];
    }));
  },
});

register(def); // nowe minigry z games-extra.js

export const GAME_BY_ID = Object.fromEntries(GAMES.map((g) => [g.id, g]));
