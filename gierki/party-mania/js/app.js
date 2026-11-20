// Party Mania — lobby, przebieg rund, punktacja.
// Model: host (właściciel lobby) steruje fazami, każdy gracz gra minigrę u siebie
// z tym samym seedem i wysyła wynik; host liczy miejsca i rozdaje punkty.
import { h } from './util.js';
import { GAMES, GAME_BY_ID } from './games.js';
import { runGame, localLive } from './runner.js';

const COLORS = ['#ff4d6d', '#4dabf7', '#51cf66', '#ffd43b', '#cc5de8', '#ff922b', '#22b8cf', '#f783ac'];
const INTRO_MS = 8000;      // ekran z zasadami przed minigrą
const RESULTS_MS = 9000;    // ekran wyników po minigrze
const GRACE_MS = 1500;      // zapas na spóźnione wyniki
const PLACE_PTS = [10, 7, 5, 4, 3, 2, 1, 1];
const ROUND_OPTIONS = [3, 5, 8, 10, 15, 20, 30];

const $app = document.getElementById('app');
let net = null, netError = null;

const S = {
  name: localStorage.getItem('pm_name') || `Gracz${Math.floor(Math.random() * 900 + 100)}`,
  lobbyId: null, lobby: null, subs: [], listUnsub: null, screen: null, ui: {},
  run: null, startedRound: 0, doneRound: 0, myScore: null, pendingWrite: null,
  scores: {}, scoresRound: 0, scoresUnsub: null, hostTimer: null, ending: 0, advancing: 0, playingSet: 0,
  startTO: null, endTO: null, uiTimer: null,
};

/* ---------- pomocnicze ---------- */
const R = (p) => net.ref(p);
function toast(msg) {
  const t = h('div', { class: 'toast' }, msg); document.body.append(t);
  setTimeout(() => t.classList.add('show'), 10); setTimeout(() => t.remove(), 2800);
}
function playersOf(l) {
  return Object.entries((l && l.players) || {})
    .filter(([, p]) => p && p.name)
    .map(([uid, p]) => ({ uid, name: p.name, color: COLORS[(p.color || 0) % COLORS.length], pts: p.pts || 0, joinedAt: p.joinedAt || 0 }))
    .sort((a, b) => a.joinedAt - b.joinedAt);
}
const isHost = () => S.lobby && net && S.lobby.hostId === net.uid;
const fitting = (n) => GAMES.filter((g) => n >= g.min && n <= g.max);
const dot = (color) => h('span', { class: 'dot', style: { background: color } });
const asArr = (v) => (Array.isArray(v) ? v : Object.values(v || {})); // Firebase bywa, że zwraca tablice jako obiekty
const medal = (p) => ['🥇', '🥈', '🥉'][p - 1] || `${p}.`;

function stopRun() {
  if (S.run) { S.run.stop(); S.run = null; }
  clearTimeout(S.startTO); clearTimeout(S.endTO); clearInterval(S.uiTimer);
  S.startTO = S.endTO = S.uiTimer = null;
}

/* ---------- ekran główny ---------- */
function showHome() {
  cleanupLobby(); S.screen = 'home';
  const nameIn = h('input', { class: 'inp', value: S.name, maxlength: 16, placeholder: 'Twój nick' });
  nameIn.oninput = () => { S.name = nameIn.value.trim().slice(0, 16) || 'Gracz'; localStorage.setItem('pm_name', S.name); };

  const parts = [
    h('header', { class: 'hero' }, h('div', { class: 'logo' }, '🎉 Party Mania'), h('p', { class: 'muted' }, '30 minigier · do 8 graczy · online')),
    h('div', { class: 'card' }, h('label', { class: 'lbl-top' }, 'Twój nick'), nameIn),
  ];

  if (net) {
    const lname = h('input', { class: 'inp', value: `Lobby ${S.name}`, maxlength: 30 });
    const maxSel = h('select', { class: 'inp' }, ...[2, 3, 4, 5, 6, 7, 8].map((n) => h('option', { value: n, selected: n === 8 }, `${n} graczy`)));
    const rSel = h('select', { class: 'inp' }, ...ROUND_OPTIONS.map((n) => h('option', { value: n, selected: n === 10 }, `${n} rund`)));
    const create = h('button', { class: 'btn primary big' }, '➕ Utwórz publiczne lobby');
    create.onclick = async () => {
      create.disabled = true;
      try { await createLobby(lname.value.trim() || `Lobby ${S.name}`, +maxSel.value, +rSel.value); }
      catch (e) { console.error(e); toast('Nie udało się utworzyć lobby: ' + e.message); create.disabled = false; }
    };
    const list = h('div', { class: 'lobby-list' }, h('p', { class: 'muted' }, 'Ładowanie…'));
    parts.push(
      h('div', { class: 'card' }, h('h3', {}, 'Nowe lobby'),
        h('div', { class: 'form-grid' }, h('label', {}, 'Nazwa', lname), h('label', {}, 'Maks. graczy', maxSel), h('label', {}, 'Liczba rund', rSel)),
        h('p', { class: 'muted small' }, 'Jedna runda = jedna minigra (ok. 1 min, nigdy więcej niż 5 min). Minigry dobierane są automatycznie do liczby graczy.'),
        create),
      h('div', { class: 'card' }, h('h3', {}, 'Publiczne lobby'), list),
    );
    subscribeList(list);
  } else {
    parts.push(h('div', { class: 'card warn' },
      h('h3', {}, netError ? '⚠️ Brak połączenia z Firebase' : '⏳ Łączenie z Firebase…'),
      h('p', { class: 'small' }, netError || 'Chwileczkę…'),
      netError ? h('p', { class: 'small muted' }, 'Uzupełnij js/firebase-config.js (instrukcja w README.md). Tryb treningu działa bez internetu.') : null));
  }
  parts.push(h('button', { class: 'btn big ghost', onclick: showPractice }, '🏋️ Trening — wypróbuj wszystkie 30 minigier'));
  $app.replaceChildren(h('div', { class: 'home' }, ...parts));
}

function subscribeList(list) {
  S.listUnsub = net.onValue(net.query(R('lobbies'), net.orderByChild('status'), net.equalTo('waiting')), (snap) => {
    const v = snap.val() || {};
    const items = Object.entries(v).map(([id, l]) => ({ id, ...l, count: playersOf(l).length }));
    // sprzątanie porzuconych lobby
    items.filter((l) => l.count === 0 && net.now() - (l.createdAt || 0) > 60000).forEach((l) => removeLobbyData(l.id));
    const open = items.filter((l) => l.count > 0).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    list.replaceChildren(...(open.length ? open.map((l) => {
      const host = playersOf(l).find((p) => p.uid === l.hostId);
      const full = l.count >= l.maxPlayers;
      return h('div', { class: 'lobby-row' },
        h('div', {}, h('div', { class: 'lname' }, l.name), h('div', { class: 'muted small' }, `host: ${host ? host.name : '?'} · ${l.rounds} rund`)),
        h('div', { class: 'lcount' }, `${l.count}/${l.maxPlayers}`),
        h('button', { class: 'btn primary', disabled: full, onclick: () => joinLobby(l.id) }, full ? 'Pełne' : 'Dołącz'));
    }) : [h('p', { class: 'muted' }, 'Brak otwartych lobby — utwórz pierwsze!')]));
  }, (err) => { list.replaceChildren(h('p', { class: 'muted' }, 'Błąd odczytu: ' + err.message)); });
}

function removeLobbyData(id) {
  net.remove(R(`lobbies/${id}`)).catch(() => {});
  net.remove(R(`scores/${id}`)).catch(() => {});
  net.remove(R(`live/${id}`)).catch(() => {});
}

/* ---------- lobby ---------- */
async function createLobby(name, maxPlayers, rounds) {
  const r = net.push(R('lobbies'));
  await net.set(r, { name, hostId: net.uid, maxPlayers, rounds, status: 'waiting', phase: 'waiting', createdAt: net.serverTimestamp() });
  await joinLobby(r.key);
}

async function joinLobby(id) {
  const l = (await net.get(R(`lobbies/${id}`))).val();
  if (!l) return toast('To lobby już nie istnieje');
  const ps = playersOf(l);
  if (!ps.some((p) => p.uid === net.uid)) {
    if (l.status !== 'waiting') return toast('Gra w tym lobby już trwa');
    if (ps.length >= l.maxPlayers) return toast('Lobby jest pełne');
  }
  const used = Object.values(l.players || {}).map((p) => p.color);
  const color = Math.max(0, [0, 1, 2, 3, 4, 5, 6, 7].findIndex((i) => !used.includes(i)));
  const pref = R(`lobbies/${id}/players/${net.uid}`);
  await net.set(pref, { name: S.name, color, pts: 0, joinedAt: net.serverTimestamp() });
  net.onDisconnect(pref).remove();
  if (S.listUnsub) { S.listUnsub(); S.listUnsub = null; }
  S.lobbyId = id;
  S.subs.push(net.onValue(R(`lobbies/${id}`), (s) => onLobby(s.val())));
  S.hostTimer = setInterval(hostTick, 300);
}

function cleanupLobby() {
  stopRun();
  S.subs.forEach((f) => f()); S.subs = [];
  if (S.listUnsub) { S.listUnsub(); S.listUnsub = null; }
  if (S.scoresUnsub) { S.scoresUnsub(); S.scoresUnsub = null; }
  clearInterval(S.hostTimer); clearTimeout(S.pendingWrite);
  Object.assign(S, { lobbyId: null, lobby: null, hostTimer: null, pendingWrite: null, startedRound: 0, doneRound: 0, scoresRound: 0, scores: {}, ending: 0, advancing: 0, playingSet: 0 });
}

async function leaveLobby() {
  const id = S.lobbyId; cleanupLobby(); showHome();
  if (!id || !net) return;
  const pref = R(`lobbies/${id}/players/${net.uid}`);
  try {
    await net.onDisconnect(pref).cancel(); await net.remove(pref);
    const rest = playersOf({ players: (await net.get(R(`lobbies/${id}/players`))).val() });
    if (!rest.length) removeLobbyData(id);
  } catch (e) { console.warn(e); }
}

function onLobby(l) {
  if (!S.lobbyId) return;
  if (!l || !l.players || !l.players[net.uid]) { toast('Opuszczono lobby'); cleanupLobby(); showHome(); return; }
  S.lobby = l;
  const ps = playersOf(l);
  // przejęcie roli hosta, gdy host wyszedł
  if (ps.length && !ps.some((p) => p.uid === l.hostId) && ps[0].uid === net.uid) net.set(R(`lobbies/${S.lobbyId}/hostId`), net.uid);

  const ph = l.phase || 'waiting'; const rd = l.round;
  if (ph === 'waiting') { if (S.screen !== 'lobby') showLobby(); else updateLobby(); }
  else if ((ph === 'intro' || ph === 'playing') && rd) { if (S.startedRound !== rd.n) beginRound(rd); else updateSidebar(); }
  else if (ph === 'results' && rd) { if (S.screen !== 'results' + rd.n) showResults(); }
  else if (ph === 'finished') { if (S.screen !== 'finished') showFinished(); }
}

function showLobby() {
  stopRun(); S.screen = 'lobby'; S.startedRound = 0; S.doneRound = 0;
  const l = S.lobby;
  S.ui = {
    players: h('div', { class: 'plist' }), settings: h('div', { class: 'settings' }), hint: h('p', { class: 'muted small' }),
    start: h('button', { class: 'btn primary big', onclick: startGame }, '▶ Start gry'), settingsKey: null,
  };
  $app.replaceChildren(h('div', { class: 'panel lobby' },
    h('div', { class: 'row between' }, h('h2', {}, l.name), h('button', { class: 'btn ghost', onclick: leaveLobby }, '✕ Wyjdź')),
    S.ui.settings, h('h3', {}, 'Gracze'), S.ui.players, S.ui.hint, S.ui.start));
  updateLobby();
}

function updateLobby() {
  const l = S.lobby; const ps = playersOf(l); const host = isHost();
  S.ui.players.replaceChildren(...ps.map((p) => h('div', { class: 'pchip' + (p.uid === net.uid ? ' me' : '') },
    dot(p.color), h('span', {}, p.name), p.uid === l.hostId ? h('span', { title: 'host' }, ' 👑') : null)),
  ...Array.from({ length: Math.max(0, l.maxPlayers - ps.length) }, () => h('div', { class: 'pchip empty' }, 'wolne miejsce')));

  const key = `${host}|${l.rounds}|${l.maxPlayers}|${ps.length}`;
  if (S.ui.settingsKey !== key) {
    S.ui.settingsKey = key;
    if (host) {
      const rSel = h('select', { class: 'inp' }, ...ROUND_OPTIONS.map((n) => h('option', { value: n, selected: n === l.rounds }, `${n} rund`)));
      const mSel = h('select', { class: 'inp' }, ...[2, 3, 4, 5, 6, 7, 8].filter((n) => n >= ps.length).map((n) => h('option', { value: n, selected: n === l.maxPlayers }, `${n} graczy`)));
      rSel.onchange = () => net.update(R(`lobbies/${S.lobbyId}`), { rounds: +rSel.value });
      mSel.onchange = () => net.update(R(`lobbies/${S.lobbyId}`), { maxPlayers: +mSel.value });
      S.ui.settings.replaceChildren(h('div', { class: 'form-grid' }, h('label', {}, 'Liczba rund', rSel), h('label', {}, 'Maks. graczy', mSel)));
    } else {
      S.ui.settings.replaceChildren(h('p', { class: 'muted' }, `Rundy: ${l.rounds} · maks. graczy: ${l.maxPlayers}`));
    }
  }
  const n = fitting(ps.length).length;
  S.ui.hint.textContent = `${ps.length}/${l.maxPlayers} graczy · pasujących minigier: ${n}/30 · czas gry ≈ ${Math.round(l.rounds * 1.1)} min` +
    (host ? (ps.length < 2 ? ' · potrzeba min. 2 graczy' : '') : ' · czekamy, aż host 👑 wystartuje');
  S.ui.start.style.display = host ? '' : 'none';
  S.ui.start.disabled = ps.length < 2;
}

/* ---------- logika hosta ---------- */
async function startGame() {
  if (!isHost()) return;
  const ps = playersOf(S.lobby); if (ps.length < 2) return;
  S.ui.start.disabled = true;
  const upd = { status: 'playing', used: null, results: null };
  ps.forEach((p) => { upd[`players/${p.uid}/pts`] = 0; });
  await net.update(R(`lobbies/${S.lobbyId}`), upd);
  await Promise.all([net.remove(R(`scores/${S.lobbyId}`)), net.remove(R(`live/${S.lobbyId}`))]);
  S.ending = S.advancing = S.playingSet = 0;
  await startRound(1, []);
}

async function startRound(n, usedIn) {
  const ids = playersOf(S.lobby).map((p) => p.uid);
  let used = asArr(usedIn ?? S.lobby.used);
  let pool = fitting(ids.length).filter((g) => !used.includes(g.id));
  if (!pool.length) { used = []; pool = fitting(ids.length); }
  const g = pool[Math.floor(Math.random() * pool.length)];
  let teams = null;
  if (g.team) {
    teams = {};
    [...ids].sort(() => Math.random() - 0.5).forEach((id, i) => { teams[id] = i % 2; });
  }
  const t = net.now();
  await net.update(R(`lobbies/${S.lobbyId}`), {
    phase: 'intro', results: null, used: [...used, g.id],
    round: { n, gameId: g.id, seed: Math.floor(Math.random() * 2 ** 31), introAt: t, playAt: t + INTRO_MS, endAt: t + INTRO_MS + g.time * 1000, teams },
  });
}

function hostTick() {
  const l = S.lobby;
  if (!l || !isHost() || l.status !== 'playing' || !l.round) return;
  const now = net.now(); const rd = l.round;
  // usuń "duchy" (niepełne wpisy graczy)
  Object.entries(l.players || {}).forEach(([uid, p]) => { if (!p || !p.name) net.remove(R(`lobbies/${S.lobbyId}/players/${uid}`)); });

  if (l.phase === 'intro' && now >= rd.playAt && S.playingSet !== rd.n) {
    S.playingSet = rd.n; net.update(R(`lobbies/${S.lobbyId}`), { phase: 'playing' });
  } else if (l.phase === 'playing' || l.phase === 'intro') {
    const ids = playersOf(l).map((p) => p.uid);
    const allDone = S.scoresRound === rd.n && ids.length > 0 && ids.every((id) => S.scores[id] && S.scores[id].d);
    if (now >= rd.playAt && (allDone || now >= rd.endAt + GRACE_MS) && S.ending !== rd.n) {
      S.ending = rd.n; endRound(l).catch((e) => { console.error(e); S.ending = 0; });
    }
  } else if (l.phase === 'results' && now >= (l.resultsUntil || 0) && S.advancing !== rd.n) {
    S.advancing = rd.n;
    if (rd.n < l.rounds) startRound(rd.n + 1).catch((e) => { console.error(e); S.advancing = 0; });
    else net.update(R(`lobbies/${S.lobbyId}`), { phase: 'finished', status: 'finished' }).then(() => {
      net.remove(R(`scores/${S.lobbyId}`)); net.remove(R(`live/${S.lobbyId}`));
    });
  }
}

async function endRound(l) {
  const rd = l.round; const g = GAME_BY_ID[rd.gameId]; const ps = playersOf(l);
  const sc = (await net.get(R(`scores/${S.lobbyId}/${rd.n}`))).val() || {};
  let final = sc;
  if (g && g.resolve) {
    const live = (await net.get(R(`live/${S.lobbyId}/${rd.n}`))).val() || {};
    final = g.resolve(live, sc, ps, rd.teams || {});
  }
  const rows = ps.map((p) => {
    const f = final[p.uid]; const s = f && Number.isFinite(f.s) ? f.s : null;
    return { uid: p.uid, s, l: (f && f.l) || 'brak wyniku' };
  }).sort((a, b) => (b.s ?? -1e15) - (a.s ?? -1e15));
  let place = 0;
  rows.forEach((r, i) => {
    if (i === 0 || r.s !== rows[i - 1].s) place = i;
    r.place = place + 1; r.gain = r.s == null ? 0 : (PLACE_PTS[place] ?? 1);
    if (r.s == null) delete r.s;
  });
  const upd = { phase: 'results', resultsUntil: net.now() + RESULTS_MS, results: rows };
  rows.forEach((r) => { upd[`players/${r.uid}/pts`] = ((l.players[r.uid] && l.players[r.uid].pts) || 0) + r.gain; });
  await net.update(R(`lobbies/${S.lobbyId}`), upd);
}

async function playAgain() {
  if (!isHost()) return;
  const upd = { phase: 'waiting', status: 'waiting', round: null, results: null, used: null };
  playersOf(S.lobby).forEach((p) => { upd[`players/${p.uid}/pts`] = 0; });
  await net.update(R(`lobbies/${S.lobbyId}`), upd);
}

/* ---------- runda (u każdego gracza) ---------- */
function watchScores(n) {
  if (S.scoresRound === n) return;
  if (S.scoresUnsub) S.scoresUnsub();
  S.scoresRound = n; S.scores = {};
  S.scoresUnsub = net.onValue(R(`scores/${S.lobbyId}/${n}`), (s) => { S.scores = s.val() || {}; updateSidebar(); });
}

function introCard(g, teams, ps) {
  const parts = [h('div', { class: 'intro-icon' }, g.icon), h('h2', {}, g.name), h('p', { class: 'intro-desc' }, g.desc),
    h('p', { class: 'muted small' }, `⏱ ${g.time} s${g.shared ? ' · wspólna plansza' : ''}${g.team ? ' · drużynowa' : ''}`)];
  if (g.team && teams) {
    parts.push(h('div', { class: 'teams' }, ...[0, 1].map((t) => h('div', { class: 'team t' + t },
      h('b', {}, t ? '🔵 Niebiescy' : '🔴 Czerwoni'), ...ps.filter((p) => teams[p.uid] === t).map((p) => h('div', {}, dot(p.color), ' ', p.name))))));
  }
  return h('div', { class: 'intro' }, ...parts);
}
const waitCard = (msg, label) => h('div', { class: 'intro' }, h('div', { class: 'intro-icon' }, '⏳'), h('h2', {}, msg), label ? h('p', { class: 'big-num small' }, label) : null);

function beginRound(rd) {
  stopRun(); clearTimeout(S.pendingWrite); S.pendingWrite = null;
  S.startedRound = rd.n; S.doneRound = 0; S.myScore = null; S.screen = 'round';
  const l = S.lobby; const g = GAME_BY_ID[rd.gameId];
  if (!g) { $app.replaceChildren(waitCard('Nieznana minigra — zaktualizuj stronę')); return; }
  watchScores(rd.n);
  const timer = h('span', { class: 'timer' }), myScore = h('span', { class: 'myscore' }, '—');
  const stage = h('div', { class: 'stage' }), side = h('div', { class: 'side' });
  $app.replaceChildren(h('div', { class: 'game-screen' },
    h('div', { class: 'topbar' }, h('span', { class: 'pill' }, `Runda ${rd.n}/${l.rounds}`), h('span', { class: 'gname' }, `${g.icon} ${g.name}`), timer, myScore),
    h('div', { class: 'game-main' }, stage, side)));
  S.ui = { timer, myScore, stage, side };
  const cd = h('div', { class: 'countdown' });
  const intro = introCard(g, rd.teams, playersOf(l)); intro.append(cd); stage.append(intro);
  const tick = () => {
    const now = net.now();
    if (now < rd.playAt) { const s = Math.ceil((rd.playAt - now) / 1000); cd.textContent = s <= 3 ? s : `Start za ${s} s`; timer.textContent = `⏱ ${g.time} s`; }
    else timer.textContent = `⏱ ${Math.max(0, Math.ceil((rd.endAt - now) / 1000))} s`;
  };
  tick(); S.uiTimer = setInterval(tick, 100);
  updateSidebar();
  const now = net.now();
  if (now >= rd.endAt - 1500) { stage.replaceChildren(waitCard('Ta minigra zaraz się kończy — poczekaj na następną')); return; }
  S.startTO = setTimeout(() => startPlay(rd, g), Math.max(0, rd.playAt - now));
}

function startPlay(rd, g) {
  const area = h('div', { class: 'game-area' }); S.ui.stage.replaceChildren(area);
  const ps = playersOf(S.lobby);
  const me = ps.find((p) => p.uid === net.uid) || { uid: net.uid, name: S.name, color: COLORS[0] };
  const base = `live/${S.lobbyId}/${rd.n}`;
  const live = {
    set: (p, v) => net.set(R(`${base}/${p}`), v).catch(() => {}),
    tx: (p, fn) => net.runTransaction(R(`${base}/${p}`), fn).then((r) => ({ committed: r.committed, value: r.snapshot.val() })),
    watch: (p, cb) => net.onValue(R(`${base}/${p}`), (s) => cb(s.val())),
  };
  S.run = runGame({
    game: g, el: area, seed: rd.seed, endAt: rd.endAt, now: net.now, me, players: ps, teams: rd.teams || {}, live,
    onScore: (s, l) => pushScore(rd.n, s, l),
    onDone: () => finishMine(rd.n, 'Gotowe! Czekamy na pozostałych…'),
  });
  S.endTO = setTimeout(() => finishMine(rd.n, 'Koniec czasu!'), Math.max(0, rd.endAt - net.now()));
}

function pushScore(n, s, l) {
  S.myScore = { s, l };
  if (S.ui.myScore) S.ui.myScore.textContent = l;
  if (S.doneRound === n || S.pendingWrite) return;
  S.pendingWrite = setTimeout(() => {
    S.pendingWrite = null;
    if (S.doneRound === n || !S.lobbyId || !S.myScore) return;
    net.set(R(`scores/${S.lobbyId}/${n}/${net.uid}`), { s: S.myScore.s, l: S.myScore.l, d: false }).catch(() => {});
  }, 300);
}

function finishMine(n, msg) {
  if (S.doneRound === n || !S.lobbyId) return;
  S.doneRound = n;
  if (S.run) { S.run.stop(); S.run = null; }
  clearTimeout(S.pendingWrite); S.pendingWrite = null;
  const v = { d: true, l: S.myScore ? S.myScore.l : 'brak wyniku' };
  if (S.myScore) v.s = S.myScore.s;
  net.set(R(`scores/${S.lobbyId}/${n}/${net.uid}`), v).catch(() => {});
  if (S.ui.stage) S.ui.stage.replaceChildren(waitCard(msg, S.myScore && S.myScore.l));
}

function updateSidebar() {
  const side = S.ui && S.ui.side; if (!side || !S.lobby) return;
  const ps = playersOf(S.lobby); const sc = S.scores || {};
  const live = ps.map((p) => ({ p, s: sc[p.uid] })).sort((a, b) => ((b.s && b.s.s) ?? -1e15) - ((a.s && a.s.s) ?? -1e15));
  side.replaceChildren(
    h('div', { class: 'side-title' }, 'Ta minigra'),
    ...live.map(({ p, s }) => h('div', { class: 'side-row' + (p.uid === net.uid ? ' me' : '') }, dot(p.color), h('span', { class: 'nm' }, p.name), h('span', { class: 'lbl' }, (s && s.l) || '…'), s && s.d ? h('span', { class: 'ok' }, '✓') : null)),
    h('div', { class: 'side-title' }, 'Klasyfikacja'),
    ...[...ps].sort((a, b) => b.pts - a.pts).map((p) => h('div', { class: 'side-row' + (p.uid === net.uid ? ' me' : '') }, dot(p.color), h('span', { class: 'nm' }, p.name), h('b', {}, p.pts))));
}

function standings(ps) {
  let place = 0;
  return h('div', { class: 'res' }, ...[...ps].sort((a, b) => b.pts - a.pts).map((p, i, arr) => {
    if (i === 0 || p.pts !== arr[i - 1].pts) place = i;
    return h('div', { class: 'res-row' + (p.uid === net.uid ? ' me' : '') }, h('span', { class: 'place' }, medal(place + 1)), dot(p.color), h('span', { class: 'nm' }, p.name), h('b', { class: 'gain' }, `${p.pts} pkt`));
  }));
}

function showResults() {
  stopRun();
  const l = S.lobby; const rd = l.round; S.screen = 'results' + rd.n;
  const g = GAME_BY_ID[rd.gameId] || { icon: '❓', name: rd.gameId };
  const ps = playersOf(l); const pm = Object.fromEntries(ps.map((p) => [p.uid, p]));
  const rows = asArr(l.results).filter(Boolean);
  const cd = h('div', { class: 'muted center-text' });
  $app.replaceChildren(h('div', { class: 'panel' },
    h('h2', {}, `${g.icon} ${g.name} — wyniki`),
    h('div', { class: 'res' }, ...rows.map((r) => {
      const p = pm[r.uid] || { name: '(wyszedł)', color: '#666' };
      return h('div', { class: 'res-row pop-in' + (r.uid === net.uid ? ' me' : '') }, h('span', { class: 'place' }, medal(r.place)), dot(p.color), h('span', { class: 'nm' }, p.name), h('span', { class: 'lbl' }, r.l), h('b', { class: 'gain' }, `+${r.gain}`));
    })),
    h('h3', {}, 'Klasyfikacja ogólna'), standings(ps), cd));
  const tick = () => {
    const s = Math.max(0, Math.ceil(((l.resultsUntil || 0) - net.now()) / 1000));
    cd.textContent = rd.n < l.rounds ? `Następna minigra za ${s} s (runda ${rd.n + 1}/${l.rounds})` : `Wielki finał za ${s} s…`;
  };
  tick(); S.uiTimer = setInterval(tick, 250);
}

function showFinished() {
  stopRun(); S.screen = 'finished';
  const ps = [...playersOf(S.lobby)].sort((a, b) => b.pts - a.pts);
  const top = ps.slice(0, 3); const order = [top[1], top[0], top[2]];
  $app.replaceChildren(h('div', { class: 'panel' },
    h('h2', { class: 'center-text' }, '🏆 Koniec gry!'),
    h('div', { class: 'podium' }, ...order.map((p, i) => p ? h('div', { class: 'pod p' + [2, 1, 3][i] },
      h('div', { class: 'pod-name' }, dot(p.color), ' ', p.name), h('div', { class: 'pod-pts' }, `${p.pts} pkt`), h('div', { class: 'pod-block' }, ['🥈', '🥇', '🥉'][i])) : h('div', {}))),
    standings(ps),
    h('div', { class: 'row center' },
      isHost() ? h('button', { class: 'btn primary big', onclick: playAgain }, '🔁 Zagraj ponownie') : h('p', { class: 'muted' }, 'Host może rozpocząć kolejną grę.'),
      h('button', { class: 'btn ghost big', onclick: leaveLobby }, 'Wyjdź do menu'))));
}

/* ---------- trening ---------- */
function showPractice() {
  stopRun(); S.screen = 'practice';
  $app.replaceChildren(h('div', { class: 'panel' },
    h('div', { class: 'row between' }, h('h2', {}, '🏋️ Trening'), h('button', { class: 'btn ghost', onclick: showHome }, '← Menu')),
    h('p', { class: 'muted small' }, 'Zagraj w dowolną minigrę solo. Gry „wspólna plansza” w trybie online toczą się na jednej planszy dla wszystkich.'),
    h('div', { class: 'games-grid' }, ...GAMES.map((g) => h('button', { class: 'game-card', onclick: () => practice(g) },
      h('div', { class: 'gicon' }, g.icon), h('div', { class: 'gtitle' }, g.name),
      h('div', { class: 'muted small' }, `${g.time} s · ${g.min > 1 ? `od ${g.min} graczy` : '1–8 graczy'}${g.team ? ' · drużyny' : ''}${g.shared ? ' · wspólna' : ''}`))))));
}

function practice(g) {
  stopRun(); S.screen = 'practice-run';
  const timer = h('span', { class: 'timer' }, `⏱ ${g.time} s`), myScore = h('span', { class: 'myscore' }, '—');
  const stage = h('div', { class: 'stage solo' });
  $app.replaceChildren(h('div', { class: 'game-screen' },
    h('div', { class: 'topbar' }, h('button', { class: 'btn ghost small', onclick: () => { stopRun(); showPractice(); } }, '←'), h('span', { class: 'gname' }, `${g.icon} ${g.name}`), timer, myScore),
    h('div', { class: 'game-main solo' }, stage)));
  const me = { uid: 'me', name: S.name, color: COLORS[1] };
  const intro = introCard(g, { me: 0 }, [me]);
  intro.append(h('button', { class: 'btn primary big', onclick: go }, '▶ Start'));
  stage.append(intro);
  function go() {
    let last = '—', ended = false;
    const area = h('div', { class: 'game-area' }); stage.replaceChildren(area);
    const endAt = Date.now() + g.time * 1000;
    const end = () => {
      if (ended) return; ended = true; stopRun();
      stage.replaceChildren(h('div', { class: 'intro' }, h('div', { class: 'intro-icon' }, g.icon), h('h2', {}, 'Twój wynik'), h('div', { class: 'big-num small' }, last),
        h('div', { class: 'row center' }, h('button', { class: 'btn primary big', onclick: () => practice(g) }, '🔁 Jeszcze raz'), h('button', { class: 'btn ghost big', onclick: showPractice }, 'Lista gier'))));
    };
    S.run = runGame({
      game: g, el: area, seed: (Math.random() * 2 ** 31) | 0, endAt, now: Date.now, me, players: [me], teams: { me: 0 }, live: localLive(),
      onScore: (s, l) => { last = l; myScore.textContent = l; }, onDone: () => setTimeout(end, 400),
    });
    S.endTO = setTimeout(end, g.time * 1000);
    S.uiTimer = setInterval(() => { timer.textContent = `⏱ ${Math.max(0, Math.ceil((endAt - Date.now()) / 1000))} s`; }, 100);
  }
}

/* ---------- start ---------- */
showHome();
import('./net.js')
  .then((m) => { net = m; })
  .catch((e) => { console.warn(e); netError = e.message || String(e); })
  .finally(() => { if (S.screen === 'home') showHome(); });
window.PartyMania = { GAMES, S }; // do debugowania w konsoli
