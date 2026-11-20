// STREFA ZERO — lobby, sieć (lockstep przez Firebase), HUD.
// Sieć: gracze wysyłają rozkazy do "inbox"; host co 300 ms zapisuje turę (listę rozkazów);
// każdy klient odtwarza tury w tej samej kolejności w deterministycznej symulacji.
import { h } from './util.js';
import { createSim, step, applyCmd, hashSim, score, nukesLeft, TERR, STOCK, PHASE_T, TICK_MS, TURN_TICKS, S as ST } from './sim.js';
import { GameView } from './render.js';

const TURN_MS = TICK_MS * TURN_TICKS;
const SPEEDS = [[1, 'Normalne (~15–20 min)'], [2, 'Szybkie (~8–10 min)'], [3, 'Błyskawiczne (~5–7 min)']];
const KIND = { silo: 'Silos rakietowy', radar: 'Radar', airbase: 'Lotnisko', battleship: 'Pancernik', sub: 'Okręt podwodny', fighter: 'Myśliwiec', bomber: 'Bombowiec' };
const KICON = { silo: '◉', radar: '◠', airbase: '▭', battleship: '◆', sub: '⬬' };
const DEFCON_TXT = { 5: 'Rozmieszczaj jednostki na swoim terytorium', 4: 'Ostatnia chwila na rozmieszczenie', 3: 'Dozwolone walki morskie i powietrzne', 2: 'Najwyższa gotowość — przygotuj silosy', 1: 'Broń jądrowa dozwolona' };
const $app = document.getElementById('app');
const key = (n) => 't' + String(n).padStart(6, '0');
const asArr = (v) => (Array.isArray(v) ? v : Object.values(v || {}));
const fmt = (s) => { s = Math.max(0, Math.ceil(s)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

let net = null, netError = null;
const G = {
  name: localStorage.getItem('sz_name') || `Dowódca${Math.floor(Math.random() * 900 + 100)}`,
  lobbyId: null, lobby: null, subs: [], listUnsub: null, screen: null, ui: {}, hostTimer: null, watchTimer: null,
  // gra
  sim: null, view: null, mySlot: -1, turns: [], applied: -1, maxTurn: -1, turnUnsub: null, inboxUnsub: null,
  hostNext: null, queue: [], raf: 0, lastStepAt: 0, lastTurnAt: 0, botified: {}, endShown: false, reclaimed: false,
  hudKey: '', selKey: '', lastHud: 0, launchSeen: {}, muted: localStorage.getItem('sz_mute') === '1',
};
const R = (p) => net.ref(p);
const isHost = () => G.lobby && net && G.lobby.hostId === net.uid;
function toast(msg) { const t = h('div', { class: 'toast' }, msg); document.body.append(t); setTimeout(() => t.classList.add('show'), 10); setTimeout(() => t.remove(), 2600); }
const presentPlayers = (l) => Object.entries((l && l.players) || {}).filter(([, p]) => p && p.name).map(([uid, p]) => ({ uid, ...p })).sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
const slotsOf = (l) => [0, 1, 2, 3, 4, 5].map((i) => (l.slots && l.slots[i]) || { s: 'closed' });

/* ================= MENU ================= */
function showHome() {
  teardown(); G.screen = 'home';
  const nameIn = h('input', { class: 'inp', value: G.name, maxlength: 18 });
  nameIn.oninput = () => { G.name = nameIn.value.trim().slice(0, 18) || 'Dowódca'; localStorage.setItem('sz_name', G.name); };
  const parts = [
    h('header', { class: 'hero' }, h('div', { class: 'logo' }, 'STREFA ZERO'), h('div', { class: 'sub' }, 'globalna wojna nuklearna · do 6 dowódców · boty')),
    h('div', { class: 'card' }, h('label', { class: 'lbl' }, 'Kryptonim dowódcy'), nameIn),
  ];
  if (net) {
    const lname = h('input', { class: 'inp', value: `Sztab ${G.name}`, maxlength: 30 });
    const spd = h('select', { class: 'inp' }, ...SPEEDS.map(([v, t]) => h('option', { value: v, selected: v === 2 }, t)));
    const create = h('button', { class: 'btn primary' }, '➕ Utwórz publiczne lobby');
    create.onclick = async () => { create.disabled = true; try { await createLobby(lname.value.trim() || `Sztab ${G.name}`, +spd.value); } catch (e) { console.error(e); toast('Błąd: ' + e.message); create.disabled = false; } };
    const list = h('div', { class: 'llist' }, h('p', { class: 'muted' }, 'Ładowanie…'));
    parts.push(
      h('div', { class: 'card' }, h('h3', {}, 'Nowe lobby'), h('div', { class: 'fgrid' }, h('label', {}, 'Nazwa', lname), h('label', {}, 'Tempo gry', spd)), create),
      h('div', { class: 'card' }, h('h3', {}, 'Publiczne lobby'), list),
    );
    subscribeList(list);
  } else {
    parts.push(h('div', { class: 'card warn' }, h('h3', {}, netError ? '⚠ Brak połączenia z Firebase' : '⏳ Łączenie…'), h('p', { class: 'muted' }, netError || ''),
      h('p', { class: 'muted small' }, 'Uzupełnij js/firebase-config.js (instrukcja w README.md). Bez Firebase możesz zagrać lokalnie z botami.')));
  }
  parts.push(h('button', { class: 'btn ghost', onclick: startOffline }, '🤖 Gra lokalna z botami (bez internetu)'));
  parts.push(h('div', { class: 'card help' }, h('h3', {}, 'Jak grać'), h('ul', {},
    h('li', {}, 'DEFCON 5–4: rozmieść silosy, radary, lotniska i flotę na swoim terytorium.'),
    h('li', {}, 'DEFCON 3: zaczynają się walki flot i lotnictwa. Silosy w trybie obrony zestrzeliwują rakiety i samoloty.'),
    h('li', {}, 'DEFCON 1: przełącz silosy w tryb ataku i odpalaj rakiety. Odpalenie zdradza pozycję silosu.'),
    h('li', {}, 'Punkty: +2 za każdy mln zabitych wrogów, −1 za każdy mln własnych strat. Gra kończy się, gdy zużyto 80% arsenału.'))));
  $app.replaceChildren(h('div', { class: 'home' }, ...parts));
}

function subscribeList(list) {
  G.listUnsub = net.onValue(R('lobbies'), (snap) => {
    const v = snap.val() || {};
    const items = Object.entries(v).map(([id, l]) => ({ id, ...l, n: presentPlayers(l).length }));
    items.filter((l) => l.n === 0 && net.now() - (l.createdAt || 0) > 60000).forEach((l) => removeLobbyData(l.id));
    const open = items.filter((l) => l.n > 0 && l.status !== 'finished').sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    list.replaceChildren(...(open.length ? open.map((l) => {
      const sl = slotsOf(l); const humans = sl.filter((s) => s.s === 'human').length, bots = sl.filter((s) => s.s === 'bot').length, free = sl.filter((s) => s.s === 'open').length;
      const playing = l.status === 'playing';
      return h('div', { class: 'lrow' },
        h('div', {}, h('div', { class: 'lname' }, l.name), h('div', { class: 'muted small' }, `${humans} graczy · ${bots} botów · ${free} wolnych · tempo ×${l.speed || 1}`)),
        h('span', { class: 'tag ' + (playing ? 'red' : 'green') }, playing ? 'W TRAKCIE' : 'OCZEKUJE'),
        h('button', { class: 'btn ' + (playing ? 'ghost' : 'primary'), onclick: () => joinLobby(l.id) }, playing ? '👁 Oglądaj' : 'Dołącz'));
    }) : [h('p', { class: 'muted' }, 'Brak otwartych lobby — utwórz pierwsze!')]));
  });
}
function removeLobbyData(id) { for (const p of ['lobbies', 'turns', 'inbox', 'sync']) net.remove(R(`${p}/${id}`)).catch(() => {}); }

/* ================= LOBBY ================= */
async function createLobby(name, speed) {
  const r = net.push(R('lobbies'));
  const slots = {}; for (let i = 0; i < 6; i++) slots[i] = { s: 'open' };
  await net.set(r, { name, hostId: net.uid, speed, status: 'waiting', createdAt: net.serverTimestamp(), slots });
  await joinLobby(r.key);
}
async function joinLobby(id) {
  const l = (await net.get(R(`lobbies/${id}`))).val();
  if (!l) return toast('To lobby już nie istnieje');
  const pref = R(`lobbies/${id}/players/${net.uid}`);
  await net.set(pref, { name: G.name, joinedAt: net.serverTimestamp() });
  net.onDisconnect(pref).remove();
  if (G.listUnsub) { G.listUnsub(); G.listUnsub = null; }
  G.lobbyId = id;
  if (l.status === 'waiting' && !slotsOf(l).some((s) => s.uid === net.uid)) {
    const free = slotsOf(l).findIndex((s) => s.s === 'open'); if (free >= 0) await takeSlot(free);
  }
  G.subs.push(net.onValue(R(`lobbies/${id}`), (s) => onLobby(s.val())));
  G.hostTimer = setInterval(hostTick, 100);
  G.watchTimer = setInterval(watchdog, 1000);
}
async function leaveLobby() {
  const id = G.lobbyId; teardown(); showHome();
  if (!id || !net) return;
  try {
    const l = (await net.get(R(`lobbies/${id}`))).val();
    if (l && l.status === 'waiting') slotsOf(l).forEach((s, i) => { if (s.uid === net.uid) net.set(R(`lobbies/${id}/slots/${i}`), { s: 'open' }); });
    const pref = R(`lobbies/${id}/players/${net.uid}`); await net.onDisconnect(pref).cancel(); await net.remove(pref);
    const rest = presentPlayers({ players: (await net.get(R(`lobbies/${id}/players`))).val() });
    if (!rest.length) removeLobbyData(id);
  } catch (e) { console.warn(e); }
}
function teardown() {
  stopGame();
  G.subs.forEach((f) => f()); G.subs = [];
  if (G.listUnsub) { G.listUnsub(); G.listUnsub = null; }
  clearInterval(G.hostTimer); clearInterval(G.watchTimer);
  Object.assign(G, { lobbyId: null, lobby: null, hostTimer: null, watchTimer: null });
}
async function takeSlot(i) {
  const res = await net.runTransaction(R(`lobbies/${G.lobbyId}/slots/${i}`), (cur) => (cur && cur.s === 'open' ? { s: 'human', uid: net.uid, name: G.name } : undefined));
  if (!res.committed) return toast('To miejsce jest już zajęte');
  const l = (await net.get(R(`lobbies/${G.lobbyId}`))).val();
  slotsOf(l).forEach((s, j) => { if (j !== i && s.uid === net.uid) net.set(R(`lobbies/${G.lobbyId}/slots/${j}`), { s: 'open' }); });
}
function setSlot(i, v) { return net.set(R(`lobbies/${G.lobbyId}/slots/${i}`), v); }

function onLobby(l) {
  if (!G.lobbyId) return;
  if (!l || !l.players || !l.players[net.uid]) { toast('Opuszczono lobby'); teardown(); showHome(); return; }
  G.lobby = l;
  const ps = presentPlayers(l);
  if (ps.length && !ps.some((p) => p.uid === l.hostId) && ps[0].uid === net.uid) net.set(R(`lobbies/${G.lobbyId}/hostId`), net.uid);
  if (l.status === 'waiting') { if (G.sim) stopGame(); if (G.screen !== 'lobby') showLobby(); else renderLobby(); }
  else if ((l.status === 'playing' || l.status === 'finished') && l.cfg) { if (!G.sim) startGame(l); }
}

function showLobby() {
  G.screen = 'lobby';
  G.ui = { box: h('div', { class: 'lobby' }) };
  $app.replaceChildren(G.ui.box); renderLobby();
}
function renderLobby() {
  const l = G.lobby; const host = isHost(); const sl = slotsOf(l); const ps = presentPlayers(l);
  const inSlot = new Set(sl.filter((s) => s.s === 'human').map((s) => s.uid));
  const cards = sl.map((s, i) => {
    const t = TERR[i]; const mine = s.uid === net.uid; let body, acts = [];
    if (s.s === 'open') { body = h('span', { class: 'muted' }, 'wolne'); acts.push(h('button', { class: 'btn small primary', onclick: () => takeSlot(i) }, 'Zajmij')); if (host) acts.push(h('button', { class: 'btn small', onclick: () => setSlot(i, { s: 'bot' }) }, '🤖 Bot'), h('button', { class: 'btn small ghost', onclick: () => setSlot(i, { s: 'closed' }) }, '✕')); }
    else if (s.s === 'human') { body = h('b', {}, s.name + (mine ? ' (ty)' : '') + (s.uid === l.hostId ? ' 👑' : '')); if (mine) acts.push(h('button', { class: 'btn small ghost', onclick: () => setSlot(i, { s: 'open' }) }, 'Zwolnij')); else if (host) acts.push(h('button', { class: 'btn small ghost', onclick: () => setSlot(i, { s: 'open' }) }, 'Wyrzuć')); }
    else if (s.s === 'bot') { body = h('span', {}, '🤖 Bot'); if (host) acts.push(h('button', { class: 'btn small ghost', onclick: () => setSlot(i, { s: 'open' }) }, 'Otwórz'), h('button', { class: 'btn small ghost', onclick: () => setSlot(i, { s: 'closed' }) }, '✕')); }
    else { body = h('span', { class: 'muted' }, 'zamknięte (puste terytorium)'); if (host) acts.push(h('button', { class: 'btn small ghost', onclick: () => setSlot(i, { s: 'open' }) }, 'Otwórz')); }
    return h('div', { class: 'slot' + (s.s === 'closed' ? ' closed' : '') + (mine ? ' mine' : ''), style: { '--c': t.color } },
      h('div', { class: 'slot-t' }, h('span', { class: 'sw' }), t.name), h('div', { class: 'slot-b' }, body), h('div', { class: 'slot-a' }, ...acts));
  });
  const active = sl.filter((s) => s.s === 'human' || s.s === 'bot').length;
  const spect = ps.filter((p) => !inSlot.has(p.uid));
  const ctrl = [];
  if (host) {
    const spd = h('select', { class: 'inp small' }, ...SPEEDS.map(([v, t]) => h('option', { value: v, selected: v === (l.speed || 1) }, t)));
    spd.onchange = () => net.update(R(`lobbies/${G.lobbyId}`), { speed: +spd.value });
    ctrl.push(h('label', { class: 'inline' }, 'Tempo: ', spd),
      h('button', { class: 'btn', onclick: () => sl.forEach((s, i) => { if (s.s === 'open') setSlot(i, { s: 'bot' }); }) }, '🤖 Uzupełnij botami'),
      h('button', { class: 'btn primary', disabled: active < 2, onclick: startMatch }, '☢ START'));
  } else ctrl.push(h('span', { class: 'muted' }, `Tempo ×${l.speed || 1} · czekamy, aż host 👑 rozpocznie grę`));
  G.ui.box.replaceChildren(h('div', { class: 'card' },
    h('div', { class: 'row between' }, h('h2', {}, l.name), h('button', { class: 'btn ghost', onclick: leaveLobby }, 'Wyjdź')),
    h('div', { class: 'slots' }, ...cards),
    h('p', { class: 'muted small' }, `Aktywne terytoria: ${active}/6 (min. 2)` + (spect.length ? ` · widzowie: ${spect.map((p) => p.name).join(', ')}` : '')),
    h('div', { class: 'row' }, ...ctrl)));
}
async function startMatch() {
  const l = G.lobby; if (!isHost()) return;
  const present = new Set(presentPlayers(l).map((p) => p.uid));
  const cfg = slotsOf(l).map((s, i) => {
    if (s.s === 'human' && present.has(s.uid)) return { a: 1, b: 0, uid: s.uid, name: s.name };
    if (s.s === 'bot' || s.s === 'human') return { a: 1, b: 1, name: `BOT · ${TERR[i].name}` };
    return { a: 0, b: 0, name: TERR[i].name };
  });
  if (cfg.filter((c) => c.a).length < 2) return toast('Potrzeba min. 2 aktywnych terytoriów');
  await Promise.all(['turns', 'inbox', 'sync'].map((p) => net.remove(R(`${p}/${G.lobbyId}`))));
  await net.update(R(`lobbies/${G.lobbyId}`), { status: 'playing', cfg, seed: Math.floor(Math.random() * 2 ** 31), startAt: net.now() + 3500, final: null });
}

/* ================= GRA ================= */
function startGame(l, offline) {
  stopGame();
  G.screen = 'game'; G.offline = !!offline;
  const cfg = asArr(l.cfg);
  G.sim = createSim(l.seed, cfg.map((c) => ({ active: !!c.a, bot: !!c.b, name: c.name })), l.speed || 1);
  G.mySlot = offline ? cfg.findIndex((c) => c.a && !c.b) : cfg.findIndex((c) => c.uid && net && c.uid === net.uid);
  Object.assign(G, { startAt: l.startAt, turns: [], applied: -1, maxTurn: -1, hostNext: null, queue: [], botified: {}, endShown: false, reclaimed: false, hudKey: '', selKey: '', launchSeen: {}, lastTurnAt: performance.now(), log: [] });
  buildGameUI();
  if (!offline) {
    G.turnUnsub = net.onChildAdded(R(`turns/${G.lobbyId}`), (s) => {
      const n = parseInt(s.key.slice(1), 10); G.turns[n] = s.val() || 0; if (n > G.maxTurn) G.maxTurn = n; G.lastTurnAt = performance.now();
    });
  }
  G.view.focusTerr(G.mySlot >= 0 ? G.mySlot : 0); if (G.mySlot < 0) G.view.fit();
  G.raf = requestAnimationFrame(frame);
}
function stopGame() {
  cancelAnimationFrame(G.raf);
  if (G.turnUnsub) G.turnUnsub(); if (G.inboxUnsub) G.inboxUnsub();
  clearInterval(G.offlineTimer);
  Object.assign(G, { sim: null, view: null, turnUnsub: null, inboxUnsub: null, offlineTimer: null });
}
function send(c) {
  if (G.mySlot < 0 || !G.sim) return;
  const cmd = { ...c }; if ('x' in cmd) { cmd.x = Math.round(cmd.x * 100) / 100; cmd.y = Math.round(cmd.y * 100) / 100; }
  if (G.offline) { G.queue.push({ ...cmd, p: G.mySlot }); return; }
  net.push(R(`inbox/${G.lobbyId}`), { u: net.uid, c: cmd }).catch(() => toast('Nie wysłano rozkazu'));
}
const nowMs = () => (G.offline ? Date.now() : net.now());

function pump() {
  const sim = G.sim; if (!sim) return false;
  const target = Math.floor((nowMs() - G.startAt) / TICK_MS) - 3;
  const behind = target - sim.tick; const catching = behind > 30;
  let budget = catching ? 5000 : 30;
  while (sim.tick < target && budget-- > 0 && !sim.ended) {
    if (sim.tick % TURN_TICKS === 0) {
      const n = sim.tick / TURN_TICKS;
      if (G.applied < n) {
        if (G.turns[n] === undefined) break;
        for (const c of asArr(G.turns[n])) { try { applyCmd(sim, c); } catch (e) { console.error(e); } }
        G.applied = n;
      }
    }
    step(sim); G.lastStepAt = performance.now();
    if (!G.offline && sim.tick % (TURN_TICKS * 200) === 0) syncHash(sim.tick);
    if (catching) { handleEvents(sim.ev, true); sim.ev.length = 0; }
  }
  handleEvents(sim.ev, false); sim.ev.length = 0;
  G.lastPump = performance.now();
  return catching;
}
// zapas: gdy przeglądarka wstrzyma requestAnimationFrame (karta w tle), symulacja i tak idzie dalej
setInterval(() => { if (G.sim && performance.now() - (G.lastPump || 0) > 400) pump(); }, 250);
function frame() {
  const sim = G.sim; if (!sim) return;
  const catching = pump();
  G.ui.sync.style.display = catching ? '' : 'none';
  if (!catching && G.mySlot >= 0 && !G.reclaimed && sim.players[G.mySlot].bot && !G.offline) { G.reclaimed = true; send({ t: 'human' }); }
  G.view.draw();
  const t = performance.now(); if (t - G.lastHud > 200) { G.lastHud = t; updateHud(); }
  if (sim.ended && !G.endShown) showEnd();
  G.raf = requestAnimationFrame(frame);
}

/* ---------- host: zapis tur ---------- */
function hostTick() {
  const l = G.lobby; if (!l || !isHost() || l.status !== 'playing' || !G.sim) { if (G.inboxUnsub && !isHost()) { G.inboxUnsub(); G.inboxUnsub = null; } return; }
  if (!G.inboxUnsub) {
    G.inboxUnsub = net.onChildAdded(R(`inbox/${G.lobbyId}`), (s) => {
      const v = s.val(); net.remove(s.ref).catch(() => {});
      if (!v || !v.c) return;
      const slot = asArr(G.lobby.cfg).findIndex((c) => c.uid && c.uid === v.u);
      if (slot >= 0) G.queue.push({ ...v.c, p: slot });
    });
  }
  if (G.hostNext == null) G.hostNext = G.maxTurn + 1;
  const n = Math.floor((net.now() - G.startAt) / TURN_MS) + 1;
  if (n < 0) return;
  let guard = 0;
  while (G.hostNext <= n && guard++ < 200) {
    const k = G.hostNext++; const cmds = guard === 1 ? G.queue.splice(0) : []; const val = cmds.length ? cmds : 0;
    net.runTransaction(R(`turns/${G.lobbyId}/${key(k)}`), (cur) => (cur === null ? val : undefined))
      .then((r) => { if (!r.committed && cmds.length) G.queue.unshift(...cmds); }).catch((e) => { console.warn(e); if (cmds.length) G.queue.unshift(...cmds); });
  }
}
function watchdog() {
  const l = G.lobby; if (!l || l.status !== 'playing' || !G.sim || G.sim.ended) return;
  const ps = presentPlayers(l); const present = new Set(ps.map((p) => p.uid));
  // host zamarł (np. karta w tle) -> przejmij rolę
  if (performance.now() - G.lastTurnAt > 4000 && nowMs() > G.startAt + 3000) {
    const cand = ps.filter((p) => p.uid !== l.hostId);
    if (cand.length && cand[0].uid === net.uid) { net.set(R(`lobbies/${G.lobbyId}/hostId`), net.uid); G.hostNext = null; G.lastTurnAt = performance.now(); toast('Przejmujesz rolę hosta'); }
  }
  if (!isHost()) return;
  asArr(l.cfg).forEach((c, i) => {
    if (!c.uid) return;
    if (!present.has(c.uid) && !G.botified[i] && !G.sim.players[i].bot) { G.botified[i] = true; G.queue.push({ t: 'bot', p: i }); }
    if (present.has(c.uid)) G.botified[i] = false;
  });
}
function syncHash(tick) {
  const hsh = hashSim(G.sim); const id = G.lobbyId; const path = `sync/${id}/${tick}`;
  net.set(R(`${path}/${net.uid}`), hsh).catch(() => {});
  setTimeout(async () => {
    if (!G.sim || G.lobbyId !== id) return;
    const all = (await net.get(R(path))).val() || {};
    if (Object.values(all).some((v) => v !== hsh)) { G.ui.desync.style.display = ''; console.warn('DESYNC', tick, all); }
  }, 5000);
}

/* ---------- tryb offline (boty) ---------- */
function startOffline() {
  const cfg = TERR.map((t, i) => (i === 0 ? { a: 1, b: 0, name: G.name } : { a: 1, b: 1, name: `BOT · ${t.name}` }));
  const pick = h('div', { class: 'slots' }, ...TERR.map((t, i) => h('button', { class: 'slot pickable', style: { '--c': t.color }, onclick: () => go(i) }, h('div', { class: 'slot-t' }, h('span', { class: 'sw' }), t.name))));
  const spd = h('select', { class: 'inp small' }, ...SPEEDS.map(([v, t]) => h('option', { value: v, selected: v === 2 }, t)));
  $app.replaceChildren(h('div', { class: 'lobby' }, h('div', { class: 'card' }, h('div', { class: 'row between' }, h('h2', {}, 'Gra lokalna z botami'), h('button', { class: 'btn ghost', onclick: showHome }, '← Menu')),
    h('p', { class: 'muted' }, 'Wybierz terytorium — pozostałe 5 przejmą boty.'), h('label', { class: 'inline' }, 'Tempo: ', spd), pick)));
  function go(mine) {
    const c = cfg.map((_, i) => (i === mine ? { a: 1, b: 0, name: G.name } : { a: 1, b: 1, name: `BOT · ${TERR[i].name}` }));
    G.lobbyId = null; G.lobby = null;
    startGame({ cfg: c, seed: Math.floor(Math.random() * 2 ** 31), startAt: Date.now() + 1500, speed: +spd.value }, true);
    let k = 0;
    G.offlineTimer = setInterval(() => { const n = Math.floor((Date.now() - G.startAt) / TURN_MS) + 1; while (k <= n) { G.turns[k] = k === n || !G.queue.length ? G.queue.splice(0) : []; k++; } }, 50);
  }
}

/* ================= HUD ================= */
function buildGameUI() {
  const cv = h('canvas', { class: 'map' });
  const ui = G.ui = {
    defcon: h('div', { class: 'defcon' }), timer: h('div', { class: 'dtimer' }), me: h('div', { class: 'mebox' }),
    board: h('div', { class: 'board' }), log: h('div', { class: 'log' }), bottom: h('div', { class: 'bottom' }), hint: h('div', { class: 'hint' }),
    sync: h('div', { class: 'overlay small' }, '⏳ Synchronizacja z serwerem…'), desync: h('div', { class: 'desync', style: { display: 'none' } }, '⚠ Wykryto rozbieżność symulacji — odśwież stronę'),
    tip: h('div', { class: 'tip', style: { display: 'none' } }), end: h('div', { class: 'overlay', style: { display: 'none' } }), start: h('div', { class: 'overlay big' }),
  };
  const mute = h('button', { class: 'btn small ghost', title: 'Dźwięk' }, G.muted ? '🔇' : '🔊');
  mute.onclick = () => { G.muted = !G.muted; localStorage.setItem('sz_mute', G.muted ? '1' : '0'); mute.textContent = G.muted ? '🔇' : '🔊'; };
  const quit = h('button', { class: 'btn small ghost' }, 'Wyjdź');
  quit.onclick = () => { if (confirm('Opuścić grę? Twoje terytorium przejmie bot.')) { if (G.offline) { stopGame(); showHome(); } else leaveLobby(); } };
  $app.replaceChildren(h('div', { class: 'game' }, cv,
    h('div', { class: 'top' }, h('div', { class: 'brand' }, 'STREFA ZERO'), h('div', { class: 'dbox' }, ui.defcon, ui.timer), h('div', { class: 'tright' }, ui.me, h('button', { class: 'btn small ghost', title: 'Cała mapa (F)', onclick: () => G.view.fit() }, '🌍'), mute, quit)),
    h('div', { class: 'side' }, ui.board, ui.log), ui.bottom, ui.hint, ui.sync, ui.desync, ui.tip, ui.end, ui.start));
  G.view = new GameView(cv, {
    getSim: () => G.sim, mySlot: () => G.mySlot, alpha: () => Math.min(1, (performance.now() - G.lastStepAt) / TICK_MS), send,
    onSelect: () => { G.selKey = ''; updateHud(); }, onHint: (t) => hint(t),
  });
  cv.addEventListener('pointermove', (e) => {
    const u = G.view.hover; if (!u) { ui.tip.style.display = 'none'; return; }
    ui.tip.style.display = ''; ui.tip.style.left = e.clientX + 14 + 'px'; ui.tip.style.top = e.clientY + 14 + 'px';
    ui.tip.textContent = `${KIND[u.k]} · ${G.sim.players[u.o].name}` + (u.k === 'silo' ? ` · ${u.mode === 'atk' ? 'ATAK' : 'obrona'} · ${u.ammo} rakiet` : u.k === 'sub' ? ` · ${u.ammo} rakiet` : u.k === 'airbase' ? ` · ✈${u.f} 💣${u.b}` : '') + (u.hp > 1 ? ` · ${u.hp} HP` : '');
  });
}
function hint(t) { G.ui.hint.textContent = t; G.ui.hint.classList.add('show'); clearTimeout(G.hintTO); G.hintTO = setTimeout(() => G.ui.hint.classList.remove('show'), 2200); }
function addLog(txt, cls = '') { G.log.unshift({ txt, cls, t: G.sim ? G.sim.t : 0 }); G.log.length = Math.min(G.log.length, 40); G.logDirty = true; }

function handleEvents(evs, quiet) {
  const sim = G.sim; const me = G.mySlot;
  for (const e of evs) {
    if (e.k === 'defcon') { addLog(`DEFCON ${e.d} — ${DEFCON_TXT[e.d]}`, 'd' + e.d); if (!quiet) { sfx('defcon'); hint(`DEFCON ${e.d}: ${DEFCON_TXT[e.d]}`); } }
    else if (e.k === 'launch' && e.o !== me) { const last = G.launchSeen[e.o] || -99; if (sim.t - last > 8) { G.launchSeen[e.o] = sim.t; addLog(`⚠ Wykryto start rakiet: ${sim.players[e.o].name}`, 'warn'); if (!quiet) sfx('alarm'); } }
    else if (e.k === 'launch' && !quiet) sfx('launch');
    else if (e.k === 'city' && (e.t === me || e.o === me || me < 0) && e.kill > 0.3) addLog(`☢ ${e.name}: −${e.kill.toFixed(1)} mln${e.o === me ? ' (twój atak)' : ''}`, e.t === me ? 'bad' : 'good');
    else if (e.k === 'boom' && !quiet) sfx('boom');
    else if (e.k === 'endsoon') addLog('Większość arsenału zużyta — wojna kończy się za chwilę', 'warn');
  }
  if (G.view) G.view.consume(evs, quiet);
}

function updateHud() {
  const sim = G.sim, ui = G.ui, me = G.mySlot; if (!sim) return;
  const pre = nowMs() < G.startAt;
  ui.start.style.display = pre ? '' : 'none'; if (pre) ui.start.textContent = `Start za ${Math.ceil((G.startAt - nowMs()) / 1000)}…`;
  ui.defcon.textContent = `DEFCON ${sim.defcon}`; ui.defcon.className = 'defcon d' + sim.defcon;
  const next = PHASE_T[6 - sim.defcon];
  ui.timer.textContent = sim.endAt ? `Koniec za ${fmt((sim.endAt - sim.t) / sim.speed)}` : next != null ? `DEFCON ${sim.defcon - 1} za ${fmt((next - sim.t) / sim.speed)}` : `czas ${fmt(sim.t / sim.speed)}`;
  if (me >= 0) { const p = sim.players[me]; ui.me.replaceChildren(h('span', { class: 'sw', style: { background: TERR[me].color } }), ` ${TERR[me].name} · `, h('b', {}, `${score(p)} pkt`)); }
  else ui.me.textContent = '👁 Obserwator';
  // tabela
  const rows = sim.players.filter((p) => p.active).sort((a, b) => score(b) - score(a));
  ui.board.replaceChildren(h('div', { class: 'bt' }, 'WYNIKI'), ...rows.map((p) => h('div', { class: 'br' + (p.slot === me ? ' me' : '') },
    h('span', { class: 'sw', style: { background: TERR[p.slot].color } }), h('span', { class: 'bn' }, (p.bot ? '🤖 ' : '') + p.name), h('b', {}, score(p)),
    h('span', { class: 'bk' }, `☠${p.killed.toFixed(0)} / ✝${p.lost.toFixed(0)}`))));
  if (G.logDirty) { G.logDirty = false; ui.log.replaceChildren(...G.log.slice(0, 12).map((l) => h('div', { class: 'll ' + l.cls }, `[${fmt(l.t / sim.speed)}] ${l.txt}`))); }
  renderBottom();
}

function renderBottom() {
  const sim = G.sim, me = G.mySlot, v = G.view, ui = G.ui;
  if (me < 0) { if (G.selKey !== 'spec') { G.selKey = 'spec'; ui.bottom.replaceChildren(h('div', { class: 'help' }, 'Tryb obserwatora — widzisz wszystkie jednostki. Kółko myszy = zoom, przeciąganie = przesuwanie.')); } return; }
  const p = sim.players[me];
  if (p.bot && !G.offline) { const k = 'bot'; if (G.selKey !== k) { G.selKey = k; ui.bottom.replaceChildren(h('div', { class: 'help' }, '🤖 Twoim terytorium tymczasowo steruje bot (odzyskiwanie kontroli…)')); } return; }
  const sel = v.selUnits();
  const stockLeft = sim.defcon >= 4 ? Object.entries(p.stock).filter(([, n]) => n > 0) : [];
  const k = JSON.stringify([sim.defcon, v.mode, stockLeft, sel.map((u) => [u.id, u.mode, u.ammo, u.f, u.b, u.sw > 0, u.cd > 0])]);
  if (k === G.selKey) return; G.selKey = k;
  const parts = [];
  if (stockLeft.length) {
    parts.push(h('div', { class: 'bar' }, h('span', { class: 'bl' }, 'ROZMIEŚĆ:'), ...['silo', 'radar', 'airbase', 'battleship', 'sub'].filter((kk) => p.stock[kk] > 0).map((kk) =>
      h('button', { class: 'btn unitbtn' + (v.mode === 'place:' + kk ? ' on' : ''), onclick: () => v.setMode(v.mode === 'place:' + kk ? null : 'place:' + kk) }, `${KICON[kk]} ${KIND[kk]} ×${p.stock[kk]}`))));
  }
  if (sel.length) {
    const by = {}; for (const u of sel) (by[u.k] ||= []).push(u);
    const ids = (arr) => arr.map((u) => u.id);
    const grp = [];
    if (by.silo) {
      const s = by.silo; const ammo = s.reduce((a, u) => a + u.ammo, 0); const atk = s.filter((u) => u.mode === 'atk').length;
      grp.push(h('div', { class: 'grp' }, h('span', { class: 'gl' }, `◉ Silosy ×${s.length} · ${ammo} rakiet · atak: ${atk}/${s.length}`),
        h('button', { class: 'btn small', onclick: () => send({ t: 'mode', ids: ids(s), m: 'def' }) }, '🛡 Obrona'),
        h('button', { class: 'btn small danger', onclick: () => send({ t: 'mode', ids: ids(s), m: 'atk' }) }, '☢ Tryb ataku'),
        h('button', { class: 'btn small danger' + (v.mode === 'launch' ? ' on' : ''), disabled: sim.defcon !== 1 || !s.some((u) => u.mode === 'atk' && u.sw <= 0 && u.ammo > 0), onclick: () => v.setMode('launch') }, '🎯 Wystrzel')));
    }
    if (by.sub) {
      const s = by.sub; const ammo = s.reduce((a, u) => a + u.ammo, 0);
      grp.push(h('div', { class: 'grp' }, h('span', { class: 'gl' }, `⬬ Okręty podw. ×${s.length} · ${ammo} rakiet (zasięg ${ST.sub.nuke}°)`),
        h('button', { class: 'btn small', onclick: () => send({ t: 'mode', ids: ids(s), m: 'move' }) }, '🌊 Zanurz / ruch'),
        h('button', { class: 'btn small danger', onclick: () => send({ t: 'mode', ids: ids(s), m: 'nuke' }) }, '☢ Wynurz do ataku'),
        h('button', { class: 'btn small danger' + (v.mode === 'launch' ? ' on' : ''), disabled: sim.defcon !== 1 || !s.some((u) => u.mode === 'nuke' && u.sw <= 0 && u.ammo > 0), onclick: () => v.setMode('launch') }, '🎯 Wystrzel')));
    }
    if (by.battleship) grp.push(h('div', { class: 'grp' }, h('span', { class: 'gl' }, `◆ Pancerniki ×${by.battleship.length} — kliknij ocean, by płynąć`)));
    if (by.airbase) {
      const s = by.airbase; const f = s.reduce((a, u) => a + u.f, 0), b = s.reduce((a, u) => a + u.b, 0);
      grp.push(h('div', { class: 'grp' }, h('span', { class: 'gl' }, `▭ Lotniska ×${s.length}`),
        h('button', { class: 'btn small' + (v.mode === 'fighter' ? ' on' : ''), disabled: sim.defcon > 3 || !f, onclick: () => v.setMode('fighter') }, `✈ Myśliwiec (${f})`),
        h('button', { class: 'btn small danger' + (v.mode === 'bomber' ? ' on' : ''), disabled: sim.defcon !== 1 || !b, onclick: () => v.setMode('bomber') }, `💣 Bombowiec (${b})`)));
    }
    if (by.radar) grp.push(h('div', { class: 'grp' }, h('span', { class: 'gl' }, `◠ Radary ×${by.radar.length} — zasięg ${ST.radar.range}°`)));
    parts.push(...grp);
  }
  if (v.mode === 'launch' || v.mode === 'fighter' || v.mode === 'bomber') parts.push(h('div', { class: 'help' }, 'Kliknij cel na mapie · Esc / prawy przycisk = anuluj'));
  if (!parts.length) parts.push(h('div', { class: 'help' }, 'Kliknij swoją jednostkę, by nią sterować · Shift+przeciągnij = zaznacz wiele · kółko = zoom · H = twoje terytorium · F = cała mapa'));
  ui.bottom.replaceChildren(...parts);
}

function showEnd() {
  G.endShown = true; const sim = G.sim;
  const rows = sim.players.filter((p) => p.active).sort((a, b) => score(b) - score(a));
  const win = rows[0];
  const btns = [];
  if (G.offline) btns.push(h('button', { class: 'btn primary', onclick: () => { stopGame(); showHome(); } }, 'Menu'));
  else {
    if (isHost()) {
      net.update(R(`lobbies/${G.lobbyId}`), { status: 'finished', final: rows.map((p) => ({ name: p.name, t: p.slot, s: score(p) })) }).catch(() => {});
      btns.push(h('button', { class: 'btn primary', onclick: backToLobby }, '↺ Powrót do lobby'));
    } else btns.push(h('span', { class: 'muted' }, 'Host może wrócić do lobby i zacząć nową grę.'));
    btns.push(h('button', { class: 'btn ghost', onclick: leaveLobby }, 'Wyjdź'));
  }
  G.ui.end.replaceChildren(h('div', { class: 'card endcard' },
    h('h2', {}, 'KONIEC WOJNY'), h('p', { class: 'muted' }, `Zwycięża: ${win.name} — ale czy ktokolwiek naprawdę wygrał?`),
    h('div', { class: 'endrows' }, ...rows.map((p, i) => h('div', { class: 'br' + (p.slot === G.mySlot ? ' me' : '') }, h('b', {}, `${i + 1}.`), h('span', { class: 'sw', style: { background: TERR[p.slot].color } }), h('span', { class: 'bn' }, p.name), h('b', {}, `${score(p)} pkt`), h('span', { class: 'bk' }, `zabici ${p.killed.toFixed(1)} mln · straty ${p.lost.toFixed(1)} mln`)))),
    h('div', { class: 'row' }, ...btns)));
  G.ui.end.style.display = '';
}
async function backToLobby() {
  await Promise.all(['turns', 'inbox', 'sync'].map((p) => net.remove(R(`${p}/${G.lobbyId}`))));
  await net.update(R(`lobbies/${G.lobbyId}`), { status: 'waiting', cfg: null, final: null, startAt: null });
}

/* ================= DŹWIĘK ================= */
let AC = null;
function sfx(kind) {
  if (G.muted) return;
  try {
    AC ||= new (window.AudioContext || window.webkitAudioContext)(); const t = AC.currentTime; const out = AC.createGain(); out.connect(AC.destination);
    if (kind === 'boom' || kind === 'launch') {
      const len = kind === 'boom' ? 1.6 : 0.6; const buf = AC.createBuffer(1, AC.sampleRate * len, AC.sampleRate); const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, kind === 'boom' ? 2 : 1);
      const src = AC.createBufferSource(); src.buffer = buf; const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = kind === 'boom' ? 220 : 900;
      src.connect(f); f.connect(out); out.gain.value = kind === 'boom' ? 0.35 : 0.08; src.start(t);
    } else {
      const o = AC.createOscillator(); o.type = kind === 'alarm' ? 'square' : 'sine'; o.connect(out);
      const fr = kind === 'alarm' ? [880, 660, 880] : [440, 330];
      fr.forEach((v, i) => o.frequency.setValueAtTime(v, t + i * 0.18));
      out.gain.setValueAtTime(0.06, t); out.gain.exponentialRampToValueAtTime(0.001, t + fr.length * 0.18 + 0.1);
      o.start(t); o.stop(t + fr.length * 0.18 + 0.12);
    }
  } catch (e) { /* brak audio */ }
}

/* ================= START ================= */
showHome();
import('./net.js').then((m) => { net = m; }).catch((e) => { console.warn(e); netError = e.message || String(e); }).finally(() => { if (G.screen === 'home') showHome(); });
window.SZ = G;
