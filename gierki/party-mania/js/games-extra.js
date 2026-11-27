// Dodatkowe minigry. Ta sama konwencja co w games.js:
// ctx.score(liczba, etykieta) — WIĘKSZA liczba = lepiej; c.rng() ma ten sam seed u wszystkich graczy.
import { h, ri, pick, shuffle, clamp } from './util.js';

const flash = (el, text, cls) => { el.textContent = text; el.className = 'fb ' + cls; };
const shake = (el) => { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); };
const win = (el, c, fn, ms = 650) => { el.classList.add('win'); c.after(() => { el.classList.remove('win'); fn(); }, ms); };

export function register(def) {
  /* ---------- Saper na czas ---------- */
  def({
    id: 'saper', name: 'Saper na czas', icon: '💣', time: 60,
    desc: 'Odkryj wszystkie pola bez min (9×9, 10 min). Klik = odkryj, przytrzymaj / prawy przycisk = flaga, klik w cyfrę = odkryj sąsiadów. Czysta plansza +100 pkt, mina = plansza od nowa.',
    play(c) {
      const N = 9, M = 10, SAFE = N * N - M;
      let mines, open, flag, started, opened = 0, boards = 0, lock = false, flagMode = false;
      const grid = h('div', { class: 'mine-grid', style: { gridTemplateColumns: `repeat(${N},1fr)` } });
      const info = h('div', { class: 'muted' });
      const cells = Array.from({ length: N * N }, () => h('button', { class: 'mcell' })); grid.append(...cells);
      const nb = (i) => { const x = i % N, y = (i / N) | 0, r = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < N && ny < N) r.push(ny * N + nx); } return r; };
      const cnt = (i) => nb(i).filter((j) => mines[j]).length;
      const report = () => { c.score(boards * 100 + opened, `${boards} plansz · ${opened}/${SAFE}`); info.textContent = `Czyste plansze: ${boards} · 🚩 ${flag.filter(Boolean).length}/${M}`; };
      const reset = () => {
        mines = Array(N * N).fill(false); open = Array(N * N).fill(false); flag = Array(N * N).fill(false);
        started = false; opened = 0; lock = false; cells.forEach((b) => { b.className = 'mcell'; b.textContent = ''; }); report();
      };
      const layMines = (safe) => { // pierwszy klik zawsze bezpieczny
        const forb = new Set([safe, ...nb(safe)]); let k = 0;
        while (k < M) { const i = Math.floor(c.rng() * N * N); if (!mines[i] && !forb.has(i)) { mines[i] = true; k++; } }
        started = true;
      };
      const reveal = (i) => {
        const st = [i];
        while (st.length) {
          const j = st.pop(); if (open[j] || flag[j]) continue;
          open[j] = true; opened++; const n = cnt(j);
          cells[j].className = 'mcell open n' + n; cells[j].textContent = n || '';
          if (n === 0) nb(j).forEach((k) => { if (!open[k]) st.push(k); });
        }
      };
      const boom = (i) => {
        lock = true; mines.forEach((m, j) => { if (m) { cells[j].textContent = '💣'; cells[j].classList.add('open'); } });
        cells[i].classList.add('hit'); shake(grid); opened = 0; report(); c.after(reset, 1000);
      };
      const doReveal = (i) => {
        if (lock || !c.alive || flag[i]) return;
        if (!started) layMines(i);
        if (open[i]) { // "akord": cyfra z kompletem flag odkrywa resztę sąsiadów
          const ns = nb(i); if (ns.filter((j) => flag[j]).length !== cnt(i)) return;
          for (const j of ns) if (!open[j] && !flag[j]) { if (mines[j]) { boom(j); return; } reveal(j); }
        } else { if (mines[i]) { boom(i); return; } reveal(i); }
        if (opened === SAFE) { boards++; lock = true; report(); win(grid, c, reset, 700); return; }
        report();
      };
      const toggleFlag = (i) => {
        if (lock || !c.alive || open[i]) return;
        flag[i] = !flag[i]; cells[i].classList.toggle('flag', flag[i]); cells[i].textContent = flag[i] ? '🚩' : ''; report();
      };
      cells.forEach((b, i) => {
        let tm = null, long = false;
        c.on(b, 'contextmenu', (e) => e.preventDefault());
        c.on(b, 'pointerdown', (e) => {
          e.preventDefault(); if (e.button === 2) { toggleFlag(i); return; }
          long = false; clearTimeout(tm);
          tm = setTimeout(() => { long = true; toggleFlag(i); if (navigator.vibrate) navigator.vibrate(25); }, 380);
        });
        c.on(b, 'pointerup', (e) => { if (e.button === 2) return; clearTimeout(tm); if (!long) (flagMode ? toggleFlag(i) : doReveal(i)); long = true; });
        c.on(b, 'pointerleave', () => clearTimeout(tm));
      });
      const fBtn = h('button', { class: 'btn' }, '🚩 Tryb flagi: wył.');
      fBtn.onclick = () => { flagMode = !flagMode; fBtn.textContent = `🚩 Tryb flagi: ${flagMode ? 'wł.' : 'wył.'}`; fBtn.classList.toggle('primary', flagMode); };
      c.el.append(h('div', { class: 'col center' }, info, grid, fBtn));
      reset();
    },
  });

  /* ---------- 2048 ---------- */
  def({
    id: 'g2048', name: '2048', icon: '🔢', time: 60,
    desc: 'Przesuwaj kafelki (strzałki, WASD, przesunięcie palcem). Dwa takie same łączą się w jeden. Punkty = suma połączeń.',
    play(c) {
      const b = Array(16).fill(0); let pts = 0, mx = 2;
      const grid = h('div', { class: 'g2048' }); const cells = Array.from({ length: 16 }, () => h('div', { class: 'tile2048' })); grid.append(...cells);
      const spawn = () => { const e = b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0); if (!e.length) return -1; const i = e[Math.floor(c.rng() * e.length)]; b[i] = c.rng() < 0.9 ? 2 : 4; return i; };
      const render = (fresh, merged) => cells.forEach((el, i) => { const v = b[i]; el.textContent = v || ''; el.className = 'tile2048 v' + Math.min(v, 4096) + (i === fresh ? ' new' : '') + (merged.has(i) ? ' merged' : ''); });
      const LINES = { left: [], right: [], up: [], down: [] };
      for (let r = 0; r < 4; r++) {
        const row = [0, 1, 2, 3].map((k) => r * 4 + k), col = [0, 1, 2, 3].map((k) => k * 4 + r);
        LINES.left.push(row); LINES.right.push([...row].reverse()); LINES.up.push(col); LINES.down.push([...col].reverse());
      }
      const canMove = () => b.some((v, i) => !v || (i % 4 < 3 && v === b[i + 1]) || (i < 12 && v === b[i + 4]));
      const move = (d) => {
        if (!c.alive || !LINES[d]) return; let moved = false; const merged = new Set();
        for (const line of LINES[d]) {
          const vals = line.map((i) => b[i]).filter(Boolean); const out = [], mpos = [];
          for (let k = 0; k < vals.length; k++) {
            if (vals[k] === vals[k + 1]) { out.push(vals[k] * 2); pts += vals[k] * 2; mx = Math.max(mx, vals[k] * 2); mpos.push(out.length - 1); k++; } else out.push(vals[k]);
          }
          while (out.length < 4) out.push(0);
          line.forEach((i, k) => { if (b[i] !== out[k]) moved = true; b[i] = out[k]; });
          mpos.forEach((k) => merged.add(line[k]));
        }
        if (!moved) return;
        render(spawn(), merged); c.score(pts, `${pts} pkt · max ${mx}`);
        if (!canMove()) c.after(() => c.done(), 700);
      };
      c.keys(move); c.swipe(grid, move);
      spawn(); spawn(); render(-1, new Set());
      c.el.append(h('div', { class: 'col center' }, grid, h('div', { class: 'muted small' }, 'Strzałki / WASD / przesuń palcem po planszy')));
      c.score(0, '0 pkt');
    },
  });

  /* ---------- Rozbijacz cegieł ---------- */
  def({
    id: 'cegly', name: 'Rozbijacz cegieł', icon: '🧱', time: 45,
    desc: 'Odbijaj piłkę paletką i rozbijaj cegły. Masz 3 piłki. Paletka: mysz/palec albo strzałki ◀ ▶. Kąt odbicia zależy od miejsca uderzenia w paletkę.',
    play(c) {
      const W = 360, H = 540, PW = 76, PY = H - 36, R = 7; const [cv, g] = c.canvas(W, H); c.el.append(cv);
      let px = W / 2, tx = null, bx = 0, by = 0, vx = 0, vy = 0, lives = 3, pts = 0, stuck = 1, wall = 0, bricks = [], over = false; const kd = {};
      const COLS = ['#ff6b6b', '#ff922b', '#ffd43b', '#51cf66', '#4dabf7', '#cc5de8'];
      const build = () => { bricks = []; const bw = (W - 16) / 8; for (let r = 0; r < 6; r++) for (let k = 0; k < 8; k++) bricks.push({ x: 8 + k * bw + 2, y: 70 + r * 22, w: bw - 4, h: 17, r }); };
      const sp = () => Math.min(560, 330 + wall * 50 + pts * 2);
      const report = () => c.score(pts * 10 + lives, `${pts} cegieł · ${'●'.repeat(lives) || '—'}`);
      c.on(window, 'keydown', (e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { kd[e.key] = true; e.preventDefault(); } });
      c.on(window, 'keyup', (e) => { kd[e.key] = false; });
      c.on(cv, 'pointerdown', (e) => { e.preventDefault(); tx = c.pos(e, cv).x; });
      c.on(cv, 'pointermove', (e) => { if (e.pointerType === 'mouse' || e.buttons) tx = c.pos(e, cv).x; });
      build();
      c.loop((dt) => {
        if (kd.ArrowLeft) { px -= 420 * dt; tx = null; } if (kd.ArrowRight) { px += 420 * dt; tx = null; }
        if (tx != null) px += Math.sign(tx - px) * Math.min(Math.abs(tx - px), 900 * dt);
        px = clamp(px, PW / 2, W - PW / 2);
        if (!over) {
          if (stuck > 0) {
            stuck -= dt; bx = px; by = PY - R - 1;
            if (stuck <= 0) { const a = (c.rng() - 0.5) * 0.8; vx = sp() * Math.sin(a); vy = -sp() * Math.cos(a); }
          } else for (let s = 0; s < 3; s++) {
            const sdt = dt / 3, ox = bx, oy = by; bx += vx * sdt; by += vy * sdt;
            if (bx < R) { bx = R; vx = Math.abs(vx); } if (bx > W - R) { bx = W - R; vx = -Math.abs(vx); } if (by < R) { by = R; vy = Math.abs(vy); }
            if (vy > 0 && by + R >= PY && oy + R <= PY + 6 && Math.abs(bx - px) <= PW / 2 + R) {
              const off = clamp((bx - px) / (PW / 2), -1, 1) * 1.05; const v = sp(); vx = v * Math.sin(off); vy = -v * Math.cos(off); by = PY - R;
            }
            for (let i = 0; i < bricks.length; i++) {
              const k = bricks[i]; const cx = clamp(bx, k.x, k.x + k.w), cy = clamp(by, k.y, k.y + k.h);
              if ((bx - cx) ** 2 + (by - cy) ** 2 > R * R) continue;
              bricks.splice(i, 1); pts++; report();
              if (ox + R <= k.x || ox - R >= k.x + k.w) vx = -vx; else vy = -vy;
              break;
            }
            if (!bricks.length) { wall++; build(); stuck = 0.8; break; }
            if (by > H + R) { lives--; report(); if (lives <= 0) { over = true; c.after(() => c.done(), 700); } else stuck = 0.9; break; }
          }
        }
        g.fillStyle = '#140f2e'; g.fillRect(0, 0, W, H);
        bricks.forEach((k) => { g.fillStyle = COLS[k.r]; g.fillRect(k.x, k.y, k.w, k.h); g.fillStyle = 'rgba(255,255,255,.28)'; g.fillRect(k.x, k.y, k.w, 3); });
        g.fillStyle = c.me.color || '#4dabf7'; g.fillRect(px - PW / 2, PY, PW, 10);
        if (!over) { g.fillStyle = '#fff'; g.beginPath(); g.arc(bx, by, R, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = '#fff'; g.font = 'bold 20px sans-serif'; g.textAlign = 'left'; g.fillText(`${pts}`, 10, 34);
        g.textAlign = 'right'; g.fillText('●'.repeat(lives), W - 10, 34);
        if (over) { g.textAlign = 'center'; g.font = 'bold 30px sans-serif'; g.fillText('Koniec piłek!', W / 2, H / 2); }
      });
      report();
    },
  });

  /* ---------- Przesuwanka ---------- */
  def({
    id: 'przesuwanka', name: 'Przesuwanka', icon: '🧩', time: 60,
    desc: 'Ułóż kafelki od 1 do 8, przesuwając je na puste pole (klik lub strzałki). Każda ułożona plansza +100 pkt.',
    play(c) {
      let b, solved = 0, lock = false;
      const grid = h('div', { class: 'slide-grid' }); const info = h('div', { class: 'muted' });
      const nbs = (i) => { const r = [], x = i % 3, y = (i / 3) | 0; if (x > 0) r.push(i - 1); if (x < 2) r.push(i + 1); if (y > 0) r.push(i - 3); if (y < 2) r.push(i + 3); return r; };
      const inPlace = () => b.filter((v, i) => v && v === i + 1).length;
      const report = () => { c.score(solved * 100 + inPlace(), `${solved} ułożonych · ${inPlace()}/8`); info.textContent = `Ułożone plansze: ${solved}`; };
      const render = () => grid.replaceChildren(...b.map((v, i) => (v
        ? h('button', { class: 'slide-tile' + (v === i + 1 ? ' ok' : ''), onpointerdown: (e) => { e.preventDefault(); tap(i); } }, v)
        : h('div', { class: 'slide-empty' }))));
      const gen = () => {
        b = [1, 2, 3, 4, 5, 6, 7, 8, 0]; let e = 8, last = -1;
        for (let k = 0; (k < 80 || inPlace() > 3) && k < 400; k++) { const o = nbs(e).filter((j) => j !== last); const j = o[Math.floor(c.rng() * o.length)]; b[e] = b[j]; b[j] = 0; last = e; e = j; }
        lock = false; render(); report();
      };
      const tap = (i) => {
        if (lock || !c.alive) return;
        const e = b.indexOf(0); const ex = e % 3, ey = (e / 3) | 0, x = i % 3, y = (i / 3) | 0;
        if (i === e || (x !== ex && y !== ey)) return;
        const st = x === ex ? (y < ey ? -3 : 3) : (x < ex ? -1 : 1);
        for (let p = e; p !== i; p += st) { b[p] = b[p + st]; b[p + st] = 0; }
        render(); report();
        if (inPlace() === 8) { solved++; lock = true; report(); win(grid, c, gen); }
      };
      c.keys((d) => {
        const e = b.indexOf(0); const t = { up: e + 3, down: e - 3, left: e + 1, right: e - 1 }[d];
        if (t == null || t < 0 || t > 8) return;
        if ((d === 'left' || d === 'right') && Math.floor(t / 3) !== Math.floor(e / 3)) return;
        tap(t);
      });
      c.el.append(h('div', { class: 'col center' }, info, grid)); gen();
    },
  });

  /* ---------- Czarne klawisze ---------- */
  def({
    id: 'klawisze', name: 'Czarne klawisze', icon: '🎹', time: 30,
    desc: 'Stukaj czarny klawisz w NAJNIŻSZYM rzędzie — plansza przesuwa się w dół. Pomyłka = 1 s blokady. Klawiatura: D F J K.',
    play(c) {
      const rows = Array.from({ length: 5 }, () => ri(c.rng, 0, 3)); let pts = 0, lock = false;
      const board = h('div', { class: 'piano' });
      const render = () => board.replaceChildren(...rows.slice(0, 5).reverse().map((col, idx) => {
        const active = idx === 4;
        return h('div', { class: 'prow' + (active ? ' active' : '') }, ...[0, 1, 2, 3].map((k) => h('button', {
          class: 'pkey' + (k === col ? ' black' : ''), onpointerdown: (e) => { e.preventDefault(); if (active) hit(k); },
        })));
      }));
      const hit = (k) => {
        if (lock || !c.alive) return;
        if (k === rows[0]) { pts++; rows.shift(); rows.push(ri(c.rng, 0, 3)); c.score(pts, `${pts} klawiszy`); render(); }
        else { lock = true; shake(board); board.classList.add('wrong'); c.after(() => { lock = false; board.classList.remove('wrong'); }, 1000); }
      };
      c.on(window, 'keydown', (e) => { const m = { d: 0, f: 1, j: 2, k: 3, 1: 0, 2: 1, 3: 2, 4: 3 }[e.key.toLowerCase()]; if (m != null) { e.preventDefault(); hit(m); } });
      c.el.append(h('div', { class: 'col center' }, board, h('div', { class: 'muted small' }, 'D · F · J · K')));
      render(); c.score(0, '0 klawiszy');
    },
  });

  /* ---------- Zgaś światła ---------- */
  def({
    id: 'swiatla', name: 'Zgaś światła', icon: '💡', time: 60,
    desc: 'Kliknięcie przełącza lampkę i jej sąsiadów (góra, dół, lewo, prawo). Zgaś wszystkie! Kolejne plansze są większe.',
    play(c) {
      let lvl = 0, n = 3, b = [], start = [], moves = 0, lock = false;
      const grid = h('div', { class: 'lights' }); const info = h('div', { class: 'muted' });
      const press = (arr, i) => { const x = i % n, y = (i / n) | 0; arr[i] ^= 1; if (x > 0) arr[i - 1] ^= 1; if (x < n - 1) arr[i + 1] ^= 1; if (y > 0) arr[i - n] ^= 1; if (y < n - 1) arr[i + n] ^= 1; };
      const render = () => {
        grid.style.gridTemplateColumns = `repeat(${n},1fr)`;
        grid.replaceChildren(...b.map((v, i) => h('button', { class: 'lamp' + (v ? ' on' : ''), onpointerdown: (e) => { e.preventDefault(); tap(i); } })));
        info.textContent = `Poziom ${lvl + 1} · ruchy: ${moves}`;
      };
      const gen = () => {
        n = lvl < 2 ? 3 : lvl < 4 ? 4 : 5; b = Array(n * n).fill(0);
        const k = Math.min(2 + lvl, n * n - 1);
        do { b.fill(0); const used = new Set(); while (used.size < k) used.add(ri(c.rng, 0, n * n - 1)); used.forEach((i) => press(b, i)); } while (!b.some(Boolean));
        start = [...b]; moves = 0; lock = false; render();
      };
      const tap = (i) => {
        if (lock || !c.alive) return; press(b, i); moves++; render();
        if (!b.some(Boolean)) { lvl++; c.score(lvl, `${lvl} poziomów`); lock = true; win(grid, c, gen); }
      };
      const again = h('button', { class: 'btn ghost', onclick: () => { if (lock || !c.alive) return; b = [...start]; moves = 0; render(); } }, '↺ Od nowa');
      c.el.append(h('div', { class: 'col center' }, info, grid, again)); gen(); c.score(0, '0 poziomów');
    },
  });

  /* ---------- Łamacz kodów ---------- */
  def({
    id: 'kody', name: 'Łamacz kodów', icon: '🔐', time: 60,
    desc: 'Odgadnij ukryty kod z 4 kolorów (mogą się powtarzać). ⚫ = dobry kolor na dobrym miejscu, ⚪ = dobry kolor na złym miejscu. 7 prób na kod.',
    play(c) {
      const COL = ['#ff4d6d', '#4dabf7', '#51cf66', '#ffd43b', '#cc5de8']; const L = 4, MAXT = 7;
      let code, guess = [], tries = 0, solved = 0, bonus = 0, best = 0, lock = false;
      const hist = h('div', { class: 'mm-hist' }); const cur = h('div', { class: 'mm-row cur' }); const info = h('div', { class: 'muted' });
      const peg = (ci, cls = '') => h('span', { class: 'mm-peg ' + cls, style: { background: ci == null ? 'transparent' : COL[ci] } });
      const report = () => { c.score(solved * 100 + bonus + best * 10, `${solved} kodów · ${best}⚫`); info.textContent = `Kod ${solved + 1} · próba ${Math.min(tries + 1, MAXT)}/${MAXT}`; };
      const drawCur = () => cur.replaceChildren(...Array.from({ length: L }, (_, i) => peg(guess[i], guess[i] == null ? 'empty' : '')));
      const newCode = () => { code = Array.from({ length: L }, () => ri(c.rng, 0, COL.length - 1)); guess = []; tries = 0; best = 0; lock = false; hist.replaceChildren(); drawCur(); report(); };
      const evalG = (gs) => {
        let bl = 0, wh = 0; const cc = Array(COL.length).fill(0), gc = Array(COL.length).fill(0);
        for (let i = 0; i < L; i++) { if (gs[i] === code[i]) bl++; else { cc[code[i]]++; gc[gs[i]]++; } }
        for (let k = 0; k < COL.length; k++) wh += Math.min(cc[k], gc[k]);
        return [bl, wh];
      };
      const add = (k) => { if (lock || !c.alive || guess.length >= L) return; guess.push(k); drawCur(); };
      const back = () => { if (lock) return; guess.pop(); drawCur(); };
      const submit = () => {
        if (lock || !c.alive || guess.length < L) return;
        const [bl, wh] = evalG(guess); tries++; best = Math.max(best, bl);
        hist.prepend(h('div', { class: 'mm-row' }, ...guess.map((x) => peg(x)), h('span', { class: 'mm-fb' }, '⚫'.repeat(bl) + '⚪'.repeat(wh) || '—')));
        guess = []; drawCur();
        if (bl === L) { solved++; bonus += (MAXT - tries) * 10; best = 0; lock = true; report(); win(cur, c, newCode, 900); }
        else if (tries >= MAXT) { lock = true; best = 0; hist.prepend(h('div', { class: 'mm-row reveal' }, 'Kod: ', ...code.map((x) => peg(x)))); report(); c.after(newCode, 1600); }
        else report();
      };
      c.on(window, 'keydown', (e) => {
        if (e.key >= '1' && e.key <= String(COL.length)) add(+e.key - 1);
        else if (e.key === 'Backspace') { e.preventDefault(); back(); } else if (e.key === 'Enter') submit();
      });
      const pal = h('div', { class: 'row center mm-pal' }, ...COL.map((col, k) => h('button', { style: { background: col }, onpointerdown: (e) => { e.preventDefault(); add(k); } })));
      c.el.append(h('div', { class: 'col center' }, info, cur, pal, h('div', { class: 'row center' },
        h('button', { class: 'btn', onclick: back }, '⌫ Cofnij'), h('button', { class: 'btn primary', onclick: submit }, '✔ Sprawdź')), hist));
      newCode();
    },
  });

  /* ---------- Pamięć liczb ---------- */
  def({
    id: 'pamiec', name: 'Pamięć liczb', icon: '🧮', time: 60,
    desc: 'Zapamiętaj wyświetloną liczbę i wpisz ją, gdy zniknie. Każdy sukces = o jedną cyfrę dłużej. Masz 3 życia.',
    play(c) {
      let len = 3, best = 0, lives = 3, num = '';
      const disp = h('div', { class: 'big-num mono mem-num' }); const info = h('div', { class: 'muted' }); const ctrl = h('div', { class: 'row center' });
      const fill = h('div'); const bar = h('div', { class: 'mem-bar' }, fill);
      const report = () => { c.score(best * 10 + lives, `${best} cyfr · ${'❤'.repeat(lives) || '💀'}`); info.textContent = `Długość: ${len} · ${'❤'.repeat(lives)}`; };
      const show = () => {
        if (lives <= 0) { c.done(); return; }
        num = Array.from({ length: len }, (_, i) => ri(c.rng, i ? 0 : 1, 9)).join('');
        disp.textContent = num; ctrl.replaceChildren(); report();
        const ms = 900 + len * 450;
        fill.style.transition = 'none'; fill.style.width = '100%'; void fill.offsetWidth;
        fill.style.transition = `width ${ms}ms linear`; fill.style.width = '0%';
        c.after(ask, ms);
      };
      const ask = () => {
        disp.textContent = '•'.repeat(len);
        const inp = h('input', { class: 'inp wide', inputmode: 'numeric', autocomplete: 'off', placeholder: 'wpisz liczbę' });
        const ok = h('button', { class: 'btn primary' }, 'OK');
        const submit = () => {
          if (!c.alive) return; const v = inp.value.replace(/\D/g, ''); if (!v) return;
          if (v === num) { best = Math.max(best, len); len++; disp.textContent = `✔ ${num}`; } else { lives--; disp.textContent = `✘ ${num}`; }
          ctrl.replaceChildren(); report(); c.after(show, 1100);
        };
        ok.onclick = submit; inp.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
        ctrl.replaceChildren(inp, ok); inp.focus();
      };
      c.el.append(h('div', { class: 'col center' }, info, disp, bar, ctrl)); show();
    },
  });

  /* ---------- Skoczek ---------- */
  def({
    id: 'skoczek', name: 'Skoczek', icon: '🦘', time: 30,
    desc: 'Biegnij i przeskakuj przeszkody (klik, stuknięcie, spacja lub ↑). Coraz szybciej! 3 życia — przebiegnij jak najwięcej metrów.',
    play(c) {
      const W = 480, H = 270, GY = 222, PX = 70; const [cv, g] = c.canvas(W, H); c.el.append(cv);
      const plan = []; { let tt = 1.4; while (tt < 60) { plan.push({ t: tt, w: ri(c.rng, 16, 30), h: ri(c.rng, 24, 52), w2: c.rng() < 0.25 ? ri(c.rng, 14, 22) : 0 }); tt += 0.8 + c.rng() * 1.1; } }
      const obs = []; let t = 0, pi = 0, dist = 0, y = 0, vy = 0, lives = 3, inv = 0, over = false, acc = 0;
      const jump = () => { if (!over && y === 0 && c.alive) vy = 650; };
      c.on(cv, 'pointerdown', (e) => { e.preventDefault(); jump(); }); c.keys((k) => { if (k === 'space' || k === 'up') jump(); });
      const report = () => c.score(Math.floor(dist / 10) * 10 + lives, `${Math.floor(dist / 10)} m · ${'❤'.repeat(lives) || '💀'}`);
      c.loop((dt) => {
        if (!over) {
          t += dt; const v = 280 + t * 9; dist += v * dt; inv = Math.max(0, inv - dt);
          vy -= 1900 * dt; y += vy * dt; if (y <= 0) { y = 0; vy = 0; }
          while (pi < plan.length && plan[pi].t <= t) { const p = plan[pi++]; obs.push({ x: W + 10, w: p.w, h: p.h }); if (p.w2) obs.push({ x: W + 14 + p.w, w: p.w2, h: Math.max(20, p.h - 14) }); }
          for (const o of obs) o.x -= v * dt;
          while (obs.length && obs[0].x + obs[0].w < -20) obs.shift();
          if (!inv) for (const o of obs) if (PX + 11 > o.x && PX - 11 < o.x + o.w && y < o.h - 2) {
            lives--; inv = 1.2; report(); if (lives <= 0) { over = true; c.after(() => c.done(), 800); } break;
          }
          acc += dt; if (acc > 0.25) { acc = 0; report(); }
        }
        const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#2b1d66'); sky.addColorStop(1, '#ff8fab'); g.fillStyle = sky; g.fillRect(0, 0, W, H);
        g.fillStyle = 'rgba(255,255,255,.12)'; for (let i = 0; i < 6; i++) { const hx = ((i * 97 - dist * 0.2) % (W + 100) + W + 100) % (W + 100) - 50; g.beginPath(); g.arc(hx, 150, 60, Math.PI, 0); g.fill(); }
        g.fillStyle = '#1b1438'; g.fillRect(0, GY, W, H - GY);
        g.fillStyle = '#51cf66'; for (const o of obs) { g.fillRect(o.x, GY - o.h, o.w, o.h); g.fillStyle = '#2f9e44'; g.fillRect(o.x, GY - o.h, o.w, 4); g.fillStyle = '#51cf66'; }
        if (!inv || Math.floor(t * 12) % 2) {
          const top = GY - y - 28; g.fillStyle = c.me.color || '#ffd43b'; g.fillRect(PX - 11, top, 22, 28);
          g.fillStyle = '#fff'; g.fillRect(PX + 2, top + 6, 6, 6); g.fillStyle = '#111'; g.fillRect(PX + 5, top + 8, 3, 3);
        }
        g.fillStyle = '#fff'; g.font = 'bold 20px sans-serif'; g.textAlign = 'left'; g.fillText(`${Math.floor(dist / 10)} m`, 12, 28);
        g.textAlign = 'right'; g.fillText('❤'.repeat(lives), W - 12, 28);
        if (over) { g.textAlign = 'center'; g.font = 'bold 28px sans-serif'; g.fillText('Auć! Koniec biegu', W / 2, H / 2 - 20); }
      });
      report();
    },
  });

  /* ---------- Deszcz meteorów ---------- */
  def({
    id: 'meteory', name: 'Deszcz meteorów', icon: '☄️', time: 30,
    desc: 'Klikaj spadające meteory, zanim uderzą w miasto. Każdy zestrzelony +1. Miasto wytrzyma 5 uderzeń.',
    play(c) {
      const W = 360, H = 540, GY = H - 46; const [cv, g] = c.canvas(W, H); c.el.append(cv);
      const plan = []; { let tt = 0.4; while (tt < 60) { plan.push({ t: tt, x: ri(c.rng, 24, W - 24), dx: (c.rng() - 0.5) * 70, r: ri(c.rng, 13, 22) }); tt += Math.max(0.28, 0.9 - tt * 0.022) * (0.6 + c.rng() * 0.8); } }
      const bld = Array.from({ length: 9 }, () => ri(c.rng, 14, 40));
      let t = 0, pi = 0, pts = 0, hp = 5, over = false; const ms = [], fx = [];
      const report = () => c.score(pts * 10 + hp, `${pts} ☄️ · miasto ${hp}/5`);
      c.on(cv, 'pointerdown', (e) => {
        e.preventDefault(); if (over || !c.alive) return; const p = c.pos(e, cv); let best = -1, bd = 1e9;
        ms.forEach((m, i) => { const d = (m.x - p.x) ** 2 + (m.y - p.y) ** 2; if (d < (m.r + 16) ** 2 && d < bd) { bd = d; best = i; } });
        if (best >= 0) { const m = ms.splice(best, 1)[0]; pts++; fx.push({ x: m.x, y: m.y, a: 1, k: 'pop' }); report(); }
      });
      c.loop((dt) => {
        if (!over) {
          t += dt;
          while (pi < plan.length && plan[pi].t <= t) { const p = plan[pi++]; ms.push({ x: p.x, y: -24, dx: p.dx, r: p.r, v: 90 + p.t * 5 }); }
          for (let i = ms.length - 1; i >= 0; i--) {
            const m = ms[i]; m.y += m.v * dt; m.x = clamp(m.x + m.dx * dt, 12, W - 12);
            if (m.y + m.r * 0.5 >= GY) { ms.splice(i, 1); hp--; fx.push({ x: m.x, y: GY, a: 1, k: 'boom' }); report(); if (hp <= 0) { over = true; c.after(() => c.done(), 800); } }
          }
        }
        const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#07051a'); sky.addColorStop(1, '#2b1d66'); g.fillStyle = sky; g.fillRect(0, 0, W, H);
        for (const m of ms) {
          const tr = g.createLinearGradient(m.x, m.y, m.x - m.dx * 0.6, m.y - m.v * 0.6); tr.addColorStop(0, 'rgba(255,170,80,.7)'); tr.addColorStop(1, 'rgba(255,170,80,0)');
          g.strokeStyle = tr; g.lineWidth = m.r; g.lineCap = 'round'; g.beginPath(); g.moveTo(m.x, m.y); g.lineTo(m.x - m.dx * 0.6, m.y - m.v * 0.6); g.stroke();
          g.fillStyle = '#8d6e63'; g.beginPath(); g.arc(m.x, m.y, m.r, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#5d4037'; g.beginPath(); g.arc(m.x - m.r * 0.3, m.y - m.r * 0.2, m.r * 0.3, 0, Math.PI * 2); g.fill();
        }
        const bw = W / bld.length; bld.forEach((bh, i) => { g.fillStyle = hp > 0 ? `hsl(${250 + i * 8},40%,${28 + hp * 4}%)` : '#333'; g.fillRect(i * bw + 2, GY - bh, bw - 4, bh + 46); });
        g.fillStyle = '#1b1438'; g.fillRect(0, GY, W, H - GY);
        for (const f of fx) {
          f.a -= dt * 2; if (f.a <= 0) continue;
          g.fillStyle = f.k === 'boom' ? `rgba(255,90,60,${f.a})` : `rgba(255,255,255,${f.a})`;
          g.beginPath(); g.arc(f.x, f.y, (1 - f.a) * (f.k === 'boom' ? 60 : 30) + 6, 0, Math.PI * 2); g.fill();
        }
        while (fx.length && fx[0].a <= 0) fx.shift();
        g.fillStyle = '#fff'; g.font = 'bold 20px sans-serif'; g.textAlign = 'left'; g.fillText(`☄️ ${pts}`, 10, 30);
        g.textAlign = 'right'; g.fillText('■'.repeat(hp), W - 10, 30);
        if (over) { g.textAlign = 'center'; g.font = 'bold 28px sans-serif'; g.fillText('Miasto zniszczone!', W / 2, H / 2); }
      });
      report();
    },
  });

  /* ---------- Mini sudoku ---------- */
  def({
    id: 'sudoku', name: 'Mini sudoku', icon: '🔲', time: 60,
    desc: 'Uzupełnij planszę 4×4 cyframi 1–4: w każdym wierszu, kolumnie i kwadracie 2×2 bez powtórzeń. Stuknij pole, by zmieniać cyfrę (albo wpisz 1–4).',
    play(c) {
      let sol, given, b, solved = 0, lock = false, sel = -1;
      const grid = h('div', { class: 'sudoku' }); const info = h('div', { class: 'muted' });
      const conflict = (i) => {
        const v = b[i]; if (!v) return false; const r = i >> 2, k = i % 4;
        for (let j = 0; j < 16; j++) { if (j === i || b[j] !== v) continue; const rj = j >> 2, kj = j % 4; if (rj === r || kj === k || ((rj >> 1) === (r >> 1) && (kj >> 1) === (k >> 1))) return true; }
        return false;
      };
      const filledOk = () => b.filter((v, i) => !given[i] && v === sol[i]).length;
      const report = () => { c.score(solved * 100 + filledOk(), `${solved} rozwiązanych`); info.textContent = `Rozwiązane: ${solved}`; };
      const render = () => grid.replaceChildren(...b.map((v, i) => h('button', {
        class: 'scell' + (given[i] ? ' given' : '') + (conflict(i) ? ' bad' : '') + (i === sel ? ' sel' : '') + (i % 4 === 1 ? ' br' : '') + ((i >> 2) === 1 ? ' bb' : ''),
        onpointerdown: (e) => { e.preventDefault(); if (!given[i]) setV(i, (b[i] % 4) + 1); },
      }, v || '')));
      const gen = () => {
        const base = [[1, 2, 3, 4], [3, 4, 1, 2], [2, 1, 4, 3], [4, 3, 2, 1]];
        const dig = shuffle(c.rng, [1, 2, 3, 4]);
        const rows = shuffle(c.rng, [0, 1]).flatMap((bd) => shuffle(c.rng, [0, 1]).map((r) => bd * 2 + r));
        const cols = shuffle(c.rng, [0, 1]).flatMap((st) => shuffle(c.rng, [0, 1]).map((k) => st * 2 + k));
        const tr = c.rng() < 0.5; sol = [];
        for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) sol.push(dig[(tr ? base[cols[k]][rows[r]] : base[rows[r]][cols[k]]) - 1]);
        const holes = new Set(shuffle(c.rng, [...Array(16).keys()]).slice(0, 9 + Math.min(solved, 2)));
        given = sol.map((_, i) => !holes.has(i)); b = sol.map((v, i) => (given[i] ? v : 0));
        sel = b.indexOf(0); lock = false; render(); report();
      };
      const setV = (i, v) => {
        if (lock || !c.alive || given[i]) return; b[i] = v; sel = i; render(); report();
        if (b.every(Boolean) && b.every((_, j) => !conflict(j))) { solved++; lock = true; report(); win(grid, c, gen, 700); }
      };
      c.on(window, 'keydown', (e) => {
        if (sel < 0) return;
        if (['1', '2', '3', '4'].includes(e.key)) setV(sel, +e.key);
        else if (e.key === 'Backspace' || e.key === '0') setV(sel, 0);
        else { const d = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -4, ArrowDown: 4 }[e.key]; if (d) { e.preventDefault(); sel = (sel + d + 16) % 16; render(); } }
      });
      c.el.append(h('div', { class: 'col center' }, info, grid)); gen();
    },
  });

  /* ---------- Do dziesięciu ---------- */
  def({
    id: 'dziesiec', name: 'Do dziesięciu', icon: '➕', time: 40,
    desc: 'Klikaj PARY liczb, które razem dają 10. Zniknięte pola uzupełniają się nowymi. Zła para = −1.',
    play(c) {
      const b = Array.from({ length: 25 }, () => ri(c.rng, 1, 9)); let sel = -1, pts = 0;
      const grid = h('div', { class: 'ten-grid' }); const fb = h('div', { class: 'fb' });
      const ensure = () => {
        if (b.some((v, i) => b.some((w, j) => j !== i && v + w === 10))) return;
        const i = ri(c.rng, 0, 24); let j = ri(c.rng, 0, 23); if (j >= i) j++; b[j] = 10 - b[i];
      };
      const render = (fresh = []) => grid.replaceChildren(...b.map((v, i) => h('button', {
        class: 'ten-cell' + (i === sel ? ' sel' : '') + (fresh.includes(i) ? ' new' : ''), onpointerdown: (e) => { e.preventDefault(); tap(i); },
      }, v)));
      const tap = (i) => {
        if (!c.alive) return;
        if (sel < 0 || sel === i) { sel = sel === i ? -1 : i; render(); return; }
        if (b[sel] + b[i] === 10) { pts++; flash(fb, `✔ ${b[sel]} + ${b[i]}`, 'ok'); const f = [sel, i]; f.forEach((k) => { b[k] = ri(c.rng, 1, 9); }); sel = -1; ensure(); render(f); }
        else { pts--; flash(fb, `✘ ${b[sel]} + ${b[i]} = ${b[sel] + b[i]}`, 'bad'); sel = -1; shake(grid); render(); }
        c.score(pts, `${pts} par`);
      };
      ensure(); render(); c.el.append(h('div', { class: 'col center' }, grid, fb)); c.score(0, '0 par');
    },
  });

  /* ---------- Zgadnij liczbę ---------- */
  def({
    id: 'zgadnij', name: 'Zgadnij liczbę', icon: '🤔', time: 45,
    desc: 'Zgadnij ukrytą liczbę od 1 do 100 — podpowiemy „więcej” albo „mniej”. Mniej prób = więcej punktów (max 10 za liczbę).',
    play(c) {
      let target, tries, lo, hi, pts = 0, found = 0;
      const info = h('div', { class: 'muted' }); const range = h('div', { class: 'big-num small mono' }); const fb = h('div', { class: 'fb' });
      const inp = h('input', { class: 'inp', type: 'number', inputmode: 'numeric', min: 1, max: 100, placeholder: '?' });
      const upd = () => { range.textContent = `${lo} … ${hi}`; info.textContent = `Liczba nr ${found + 1} · próby: ${tries}`; };
      const newT = () => { target = ri(c.rng, 1, 100); tries = 0; lo = 1; hi = 100; upd(); };
      const submit = () => {
        if (!c.alive) return; const v = parseInt(inp.value, 10); inp.value = ''; inp.focus(); if (!(v >= 1 && v <= 100)) return;
        tries++;
        if (v === target) { const p = Math.max(1, 11 - tries); pts += p; found++; flash(fb, `🎯 ${v}! +${p} pkt`, 'ok'); c.score(pts, `${found} liczb · ${pts} pkt`); newT(); return; }
        if (v < target) { lo = Math.max(lo, v + 1); flash(fb, `${v} — więcej ⬆`, 'bad'); } else { hi = Math.min(hi, v - 1); flash(fb, `${v} — mniej ⬇`, 'bad'); }
        upd();
      };
      inp.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
      c.el.append(h('div', { class: 'col center' }, info, range, h('div', { class: 'row center' }, inp, h('button', { class: 'btn primary', onclick: submit }, 'Sprawdź')), fb));
      newT(); c.score(0, '0 liczb'); setTimeout(() => inp.focus(), 50);
    },
  });

  /* ---------- Idealne koło ---------- */
  def({
    id: 'kolo', name: 'Idealne koło', icon: '⭕', time: 30,
    desc: 'Narysuj palcem lub myszą jak najdoskonalsze koło wokół kropki. 3 próby, liczy się najlepsza.',
    play(c) {
      const S = 360, CX = S / 2, CY = S / 2; const [cv, g] = c.canvas(S, S);
      let pts = [], drawing = false, tries = 0, best = 0, lastAcc = null;
      const info = h('div', { class: 'muted' }, 'Próba 1/3 — rysuj!'); const res = h('div', { class: 'big-num small' }, '—');
      const evalC = () => {
        if (pts.length < 20) return [0, 'Za krótko!'];
        const rs = pts.map(([x, y]) => Math.hypot(x - CX, y - CY)); const mean = rs.reduce((a, b) => a + b, 0) / rs.length;
        if (mean < 40) return [0, 'Za małe koło!'];
        let ang = 0;
        for (let i = 1; i < pts.length; i++) { let d = Math.atan2(pts[i][1] - CY, pts[i][0] - CX) - Math.atan2(pts[i - 1][1] - CY, pts[i - 1][0] - CX); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; ang += d; }
        if (Math.abs(ang) < Math.PI * 1.8) return [0, 'Zamknij koło!'];
        const sd = Math.sqrt(rs.reduce((a, r) => a + (r - mean) ** 2, 0) / rs.length);
        const gap = Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) / mean;
        return [clamp(100 - (sd / mean) * 220 - Math.max(0, gap - 0.15) * 30, 0, 100), null];
      };
      const draw = () => {
        g.fillStyle = '#140f2e'; g.fillRect(0, 0, S, S);
        g.fillStyle = '#ffd43b'; g.beginPath(); g.arc(CX, CY, 5, 0, Math.PI * 2); g.fill();
        if (pts.length > 1) {
          g.strokeStyle = lastAcc == null ? (c.me.color || '#4dabf7') : `hsl(${lastAcc * 1.2},80%,60%)`; g.lineWidth = 5; g.lineCap = 'round'; g.lineJoin = 'round';
          g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
        }
      };
      c.on(cv, 'pointerdown', (e) => { e.preventDefault(); if (tries >= 3 || !c.alive) return; drawing = true; lastAcc = null; const p = c.pos(e, cv); pts = [[p.x, p.y]]; draw(); });
      c.on(cv, 'pointermove', (e) => { if (!drawing) return; const p = c.pos(e, cv); const l = pts[pts.length - 1]; if (Math.hypot(p.x - l[0], p.y - l[1]) > 2) { pts.push([p.x, p.y]); draw(); } });
      c.on(window, 'pointerup', () => {
        if (!drawing) return; drawing = false; tries++;
        const [acc, msg] = evalC(); lastAcc = acc; best = Math.max(best, acc); draw();
        res.textContent = msg || `${acc.toFixed(1)}%`;
        c.score(Math.round(best * 10), `najlepsze ${best.toFixed(1)}%`);
        info.textContent = tries < 3 ? `Próba ${tries + 1}/3 — rysuj!` : `Koniec! Najlepsze: ${best.toFixed(1)}%`;
        if (tries >= 3) c.after(() => c.done(), 1500);
      });
      c.el.append(h('div', { class: 'col center' }, info, cv, res)); draw(); c.score(0, 'brak koła');
    },
  });

  /* ---------- Strzałka w środku ---------- */
  def({
    id: 'flanker', name: 'Strzałka w środku', icon: '🏹', time: 30,
    desc: 'Patrz TYLKO na środkową strzałkę i wskaż jej kierunek (◀ ▶ lub klawisze strzałek). Boczne strzałki chcą cię zmylić! Pomyłka −1.',
    play(c) {
      let pts = 0, mid = 'left'; const row = h('div', { class: 'flank' }); const fb = h('div', { class: 'fb' });
      const ch = (d) => (d === 'left' ? '◀' : '▶');
      const gen = () => {
        mid = c.rng() < 0.5 ? 'left' : 'right'; const side = c.rng() < 0.5 ? mid : (mid === 'left' ? 'right' : 'left');
        const n = pick(c.rng, [2, 3]); row.textContent = [...Array(n).fill(side), mid, ...Array(n).fill(side)].map(ch).join('');
        row.style.transform = `translateY(${ri(c.rng, -30, 30)}px)`;
      };
      const answer = (d) => { if (!c.alive) return; if (d === mid) { pts++; flash(fb, '✔', 'ok'); } else { pts--; flash(fb, '✘', 'bad'); } c.score(pts, `${pts} pkt`); gen(); };
      c.keys((k) => { if (k === 'left' || k === 'right') answer(k); });
      c.el.append(h('div', { class: 'col center' }, h('div', { class: 'flank-box' }, row), fb, h('div', { class: 'row center' },
        h('button', { class: 'btn big', onpointerdown: (e) => { e.preventDefault(); answer('left'); } }, '◀ W lewo'),
        h('button', { class: 'btn big', onpointerdown: (e) => { e.preventDefault(); answer('right'); } }, 'W prawo ▶'))));
      gen(); c.score(0, '0 pkt');
    },
  });

  /* ---------- Prawda czy fałsz ---------- */
  def({
    id: 'pf', name: 'Prawda czy fałsz?', icon: '✅', time: 30,
    desc: 'Czy działanie jest poprawne? Odpowiadaj błyskawicznie. Dobrze +1, źle −1. Klawisze: ← prawda, → fałsz.',
    play(c) {
      let pts = 0, truth = true; const q = h('div', { class: 'big-q' }); const fb = h('div', { class: 'fb' });
      const gen = () => {
        const op = pick(c.rng, ['+', '−', '×', '÷']); let a, b, r;
        if (op === '+') { a = ri(c.rng, 3, 60); b = ri(c.rng, 3, 60); r = a + b; }
        else if (op === '−') { a = ri(c.rng, 10, 90); b = ri(c.rng, 1, a); r = a - b; }
        else if (op === '×') { a = ri(c.rng, 2, 12); b = ri(c.rng, 2, 12); r = a * b; }
        else { b = ri(c.rng, 2, 10); r = ri(c.rng, 2, 12); a = b * r; }
        truth = c.rng() < 0.5; let shown = r;
        if (!truth) { let k = 0; do { shown = r + pick(c.rng, [-10, -2, -1, 1, 2, 10, op === '×' ? b : 3, op === '×' ? -b : -3]); } while ((shown === r || shown < 0) && ++k < 20); if (shown === r) shown = r + 1; }
        q.textContent = `${a} ${op} ${b} = ${shown}`;
      };
      const answer = (v) => { if (!c.alive) return; if (v === truth) { pts++; flash(fb, '✔', 'ok'); } else { pts--; flash(fb, '✘', 'bad'); } c.score(pts, `${pts} pkt`); gen(); };
      c.keys((k) => { if (k === 'left') answer(true); if (k === 'right') answer(false); });
      c.el.append(h('div', { class: 'col center' }, q, fb, h('div', { class: 'row center' },
        h('button', { class: 'btn big tf-yes', onpointerdown: (e) => { e.preventDefault(); answer(true); } }, '✔ Prawda'),
        h('button', { class: 'btn big tf-no', onpointerdown: (e) => { e.preventDefault(); answer(false); } }, '✘ Fałsz'))));
      gen(); c.score(0, '0 pkt');
    },
  });

  /* ---------- Zalewanie ---------- */
  def({
    id: 'zalewanie', name: 'Zalewanie', icon: '🌊', time: 60,
    desc: 'Twój obszar zaczyna się w lewym górnym rogu. Wybieraj kolor, by wchłaniać sąsiednie pola. Zalej całą planszę w max 16 ruchach (+100 pkt)!',
    play(c) {
      const N = 8, LIM = 16, COLS = ['#ff4d6d', '#4dabf7', '#51cf66', '#ffd43b', '#cc5de8']; let b, moves = 0, boards = 0, lock = false;
      const grid = h('div', { class: 'flood', style: { gridTemplateColumns: `repeat(${N},1fr)` } });
      const cells = Array.from({ length: N * N }, (_, i) => h('div', { class: 'fcell', onpointerdown: (e) => { e.preventDefault(); choose(b[i]); } })); grid.append(...cells);
      const info = h('div', { class: 'muted' });
      const region = () => {
        const col = b[0], seen = new Set([0]), st = [0];
        while (st.length) { const i = st.pop(), x = i % N, y = (i / N) | 0; for (const j of [x > 0 ? i - 1 : -1, x < N - 1 ? i + 1 : -1, y > 0 ? i - N : -1, y < N - 1 ? i + N : -1]) if (j >= 0 && !seen.has(j) && b[j] === col) { seen.add(j); st.push(j); } }
        return seen;
      };
      const report = () => { const pct = Math.floor((region().size / (N * N)) * 100); c.score(boards * 100 + Math.min(99, pct), `${boards} plansz · ${pct}%`); info.textContent = `Ruchy: ${moves}/${LIM} · zalane plansze: ${boards}`; };
      const render = () => { const reg = region(); cells.forEach((el, i) => { el.style.background = COLS[b[i]]; el.classList.toggle('mine', reg.has(i)); }); };
      const gen = () => { b = Array.from({ length: N * N }, () => ri(c.rng, 0, COLS.length - 1)); moves = 0; lock = false; render(); report(); };
      const choose = (k) => {
        if (lock || !c.alive || k === b[0]) return;
        region().forEach((i) => { b[i] = k; }); moves++; render();
        if (region().size === N * N) { boards++; lock = true; report(); win(grid, c, gen, 700); return; }
        if (moves >= LIM) { lock = true; report(); shake(grid); info.textContent = 'Koniec ruchów — nowa plansza'; c.after(gen, 1100); return; }
        report();
      };
      c.on(window, 'keydown', (e) => { const k = ['1', '2', '3', '4', '5'].indexOf(e.key); if (k >= 0) choose(k); });
      const pal = h('div', { class: 'row center' }, ...COLS.map((col, k) => h('button', { class: 'fpick', style: { background: col }, onpointerdown: (e) => { e.preventDefault(); choose(k); } })));
      c.el.append(h('div', { class: 'col center' }, info, grid, pal)); gen();
    },
  });
}
