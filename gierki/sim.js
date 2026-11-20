// STREFA ZERO — deterministyczny silnik gry.
// Każdy klient liczy dokładnie tę samą symulację z tych samych rozkazów (lockstep),
// dlatego: tylko + - * / sqrt, własny RNG, stała kolejność tablic, zero Math.sin/cos/random.
import { GRID, CITIES } from './world.js';

export const TICK_MS = 100;            // 10 kroków symulacji na sekundę
export const TURN_TICKS = 3;           // 1 tura sieciowa = 3 kroki (300 ms)
export const PHASE_T = [0, 150, 300, 450, 600]; // start DEFCON 5,4,3,2,1 (sekundy gry)
export const END_T = 1200;             // twardy koniec gry
export const TERR = [
  { name: 'Ameryka Płn.', color: '#3fa7ff' }, { name: 'Ameryka Płd.', color: '#3ddc84' },
  { name: 'Europa', color: '#c77dff' }, { name: 'Afryka i Bl. Wschód', color: '#ffb02e' },
  { name: 'Rosja', color: '#ff4d5e' }, { name: 'Azja', color: '#ffe14d' },
];
export const STOCK = { silo: 6, radar: 4, airbase: 3, battleship: 5, sub: 3 };
export const S = {
  silo: { hp: 3, ammo: 10, def: 7, defCd: 1.4, defHit: 0.32, sw: 15, cd: 2.5 },
  radar: { hp: 1, range: 20 },
  airbase: { hp: 2, f: 5, b: 4 },
  battleship: { hp: 3, speed: 0.5, range: 5, cd: 2 },
  sub: { hp: 1, speed: 0.38, range: 3, ammo: 5, nuke: 45, sw: 8, cd: 3 },
  fighter: { speed: 2.2, fuel: 70, range: 2.5, cd: 1.5 },
  bomber: { speed: 1.4, fuel: 130 },
  icbm: { speed: 2.4 }, slbm: { speed: 2.0 },
  nuke: { r: 1.2 },
};
export const STRUCT = ['silo', 'radar', 'airbase'];
export const SHIPS = ['battleship', 'sub'];
export const AIR = ['fighter', 'bomber'];

/* ---------- geometria (mapa: x = lon+180 ∈ [0,360), y = 90-lat ∈ [0,180]) ---------- */
export const wrap = (x) => ((x % 360) + 360) % 360;
export const ddx = (a, b) => ((((b - a) % 360) + 540) % 360) - 180;
export const dist2 = (ax, ay, bx, by) => { const dx = ddx(ax, bx), dy = by - ay; return dx * dx + dy * dy; };
export const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));
export const cellAt = (x, y) => { const i = Math.floor(wrap(x)) % 360; const j = Math.min(179, Math.max(0, Math.floor(y))); return j * 360 + i; };
export const gridAt = (x, y) => GRID[cellAt(x, y)];
export const isOcean = (x, y) => { const c = gridAt(x, y); return c === '~' || (c >= 'a' && c <= 'f'); };
export const ownLand = (t, x, y) => gridAt(x, y) === 'ABCDEF'[t];
export const ownSea = (t, x, y) => gridAt(x, y) === 'abcdef'[t];

// statyczne listy kratek każdego terytorium (do botów i auto-rozmieszczenia)
const LANDC = [[], [], [], [], [], []], SEAC = [[], [], [], [], [], []];
for (let k = 0; k < GRID.length; k++) {
  const c = GRID[k]; const L = 'ABCDEF'.indexOf(c), W = 'abcdef'.indexOf(c);
  if (L >= 0) LANDC[L].push(k); if (W >= 0) SEAC[W].push(k);
}
const cx = (k) => (k % 360) + 0.5, cy = (k) => Math.floor(k / 360) + 0.5;
const CENTER = LANDC.map((l) => { // przybliżony środek terytorium (średnia z kratek, bez zawijania — terytoria nie przecinają 180°)
  let sx = 0, sy = 0; for (const k of l) { sx += cx(k); sy += cy(k); } return { x: sx / l.length, y: sy / l.length };
});

/* ---------- RNG ---------- */
function rnd(sim) {
  let a = (sim.r = (sim.r + 0x6D2B79F5) | 0);
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rint = (sim, n) => Math.floor(rnd(sim) * n);

/* ---------- tworzenie gry ---------- */
// slots: [{active, bot, name}] × 6 (indeks = terytorium)
export function createSim(seed, slots, speed = 1) {
  const sim = {
    tick: 0, t: 0, r: seed | 0, speed, defcon: 5, nextId: 1, ended: false, endAt: 0, nukeTotal: 0,
    players: slots.map((s, i) => ({ slot: i, active: !!s.active, bot: !!s.bot, name: s.name || TERR[i].name, stock: s.active ? { ...STOCK } : {}, killed: 0, lost: 0, ai: {} })),
    cities: CITIES.map(([name, x, y, pop, t]) => ({ name, x, y, pop, pop0: pop, t })),
    units: [], missiles: [], ev: [],
  };
  return sim;
}
export const score = (p) => Math.round((p.killed * 2 - p.lost) * 10) / 10;

/* ---------- rozmieszczanie ---------- */
export function canPlace(sim, slot, kind, x, y) {
  if (sim.defcon < 4) return 'Rozmieszczanie możliwe tylko przy DEFCON 5 i 4';
  const p = sim.players[slot]; if (!p || !p.active) return 'Brak gracza';
  if (!(p.stock[kind] > 0)) return 'Brak jednostek tego typu';
  if (STRUCT.includes(kind)) {
    if (!ownLand(slot, x, y)) return 'Budowle tylko na własnym lądzie';
    for (const u of sim.units) if (u.o === slot && STRUCT.includes(u.k) && dist2(u.x, u.y, x, y) < 2.25) return 'Za blisko innej budowli';
  } else if (SHIPS.includes(kind)) {
    if (!ownSea(slot, x, y)) return 'Okręty tylko na własnych wodach';
    for (const u of sim.units) if (u.o === slot && SHIPS.includes(u.k) && dist2(u.x, u.y, x, y) < 0.64) return 'Za blisko innego okrętu';
  } else return 'Nieznany typ';
  return null;
}
function addUnit(sim, slot, k, x, y, extra) {
  const u = { id: sim.nextId++, k, o: slot, x, y, px: x, py: y, hp: (S[k] && S[k].hp) || 1, cd: 0, rev: false, ...extra };
  if (k === 'silo') Object.assign(u, { mode: 'def', sw: 0, ammo: S.silo.ammo });
  if (k === 'airbase') Object.assign(u, { f: S.airbase.f, b: S.airbase.b });
  if (k === 'battleship') u.path = [];
  if (k === 'sub') Object.assign(u, { mode: 'move', sw: 0, ammo: S.sub.ammo, path: [] });
  sim.units.push(u); return u;
}
function place(sim, slot, kind, x, y) {
  if (canPlace(sim, slot, kind, x, y)) return false;
  addUnit(sim, slot, kind, x, y); sim.players[slot].stock[kind]--; return true;
}

/* ---------- A* po oceanie ---------- */
const NB = [[1, 0, 10], [-1, 0, 10], [0, 1, 10], [0, -1, 10], [1, 1, 14], [-1, -1, 14], [1, -1, 14], [-1, 1, 14]];
const OCEAN = new Uint8Array(GRID.length); for (let k = 0; k < GRID.length; k++) { const c = GRID[k]; OCEAN[k] = c === '~' || (c >= 'a' && c <= 'f') ? 1 : 0; }
export function findPath(x0, y0, x1, y1) {
  const s = cellAt(x0, y0), g = cellAt(x1, y1);
  if (!OCEAN[g]) return null;
  if (s === g) return [[wrap(x1), y1]];
  const gx = g % 360, gy = Math.floor(g / 360);
  const H = (k) => { let dx = Math.abs((k % 360) - gx); if (dx > 180) dx = 360 - dx; const dy = Math.abs(Math.floor(k / 360) - gy); return 10 * Math.max(dx, dy) + 4 * Math.min(dx, dy); };
  const gs = new Map([[s, 0]]), from = new Map(); const heap = [[H(s), 0, s]]; let seq = 0, n = 0;
  const less = (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
  const pushH = (e) => { heap.push(e); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (!less(heap[i], heap[p])) break; [heap[i], heap[p]] = [heap[p], heap[i]]; i = p; } };
  const popH = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && less(heap[l], heap[m])) m = l; if (r < heap.length && less(heap[r], heap[m])) m = r; if (m === i) break; [heap[i], heap[m]] = [heap[m], heap[i]]; i = m; } } return top; };
  while (heap.length && n++ < 40000) {
    const [, , c] = popH(); if (c === g) break;
    const ci = c % 360, cj = Math.floor(c / 360), gc = gs.get(c);
    for (const [dx, dy, w] of NB) {
      const nj = cj + dy; if (nj < 0 || nj > 179) continue;
      const nk = nj * 360 + ((ci + dx + 360) % 360); if (!OCEAN[nk]) continue;
      if (dx && dy && (!OCEAN[cj * 360 + ((ci + dx + 360) % 360)] || !OCEAN[nj * 360 + ci])) continue; // bez ścinania rogów lądu
      const ng = gc + w; if (gs.has(nk) && gs.get(nk) <= ng) continue;
      gs.set(nk, ng); from.set(nk, c); pushH([ng + H(nk), ++seq, nk]);
    }
  }
  if (!from.has(g)) return null;
  const cells = []; for (let c = g; c !== s; c = from.get(c)) cells.push(c); cells.reverse();
  // uproszczenie: zostaw co 3. punkt
  const pts = []; for (let i = 0; i < cells.length; i++) if (i % 3 === 2 || i === cells.length - 1) pts.push([cx(cells[i]), cy(cells[i])]);
  pts[pts.length - 1] = [wrap(x1), y1];
  return pts;
}

/* ---------- rozkazy ---------- */
const own = (sim, slot, id) => sim.units.find((u) => u.id === id && u.o === slot);
function cmdMove(sim, slot, ids, x, y) {
  for (const id of ids) {
    const u = own(sim, slot, id); if (!u || !(u.k === 'battleship' || (u.k === 'sub' && u.mode === 'move' && u.sw <= 0))) continue;
    const p = findPath(u.x, u.y, x, y); if (p) u.path = p;
  }
}
function cmdMode(sim, slot, ids, m) {
  for (const id of ids) {
    const u = own(sim, slot, id); if (!u) continue;
    if (u.k === 'silo' && (m === 'def' || m === 'atk') && u.mode !== m) { u.mode = m; u.sw = S.silo.sw; }
    if (u.k === 'sub' && (m === 'move' || m === 'nuke') && u.mode !== m) { u.mode = m; u.sw = S.sub.sw; u.path = []; }
  }
}
function launch(sim, slot, u, x, y) {
  if (sim.defcon !== 1 || u.o !== slot) return false;
  if (u.k === 'silo' && u.mode === 'atk' && u.sw <= 0 && u.ammo > 0 && u.cd <= 0) {
    u.ammo--; u.cd = S.silo.cd; u.rev = true; addMissile(sim, u, x, y, 'icbm'); return true;
  }
  if (u.k === 'sub' && u.mode === 'nuke' && u.sw <= 0 && u.ammo > 0 && u.cd <= 0 && dist2(u.x, u.y, x, y) <= S.sub.nuke * S.sub.nuke) {
    u.ammo--; u.cd = 2; u.rev = true; addMissile(sim, u, x, y, 'slbm'); return true;
  }
  return false;
}
function addMissile(sim, u, x, y, k) {
  sim.missiles.push({ id: sim.nextId++, k, o: u.o, x: u.x, y: u.y, px: u.x, py: u.y, sx: u.x, sy: u.y, tx: wrap(x), ty: y, dead: false });
  sim.ev.push({ k: 'launch', o: u.o, x: u.x, y: u.y, mk: k });
}
function launchAir(sim, slot, base, k, x, y) {
  if (!base || base.o !== slot || base.k !== 'airbase' || base.cd > 0) return false;
  if (sim.defcon > 3 || (k === 'bomber' && sim.defcon !== 1)) return false;
  const d = dist(base.x, base.y, x, y);
  if (k === 'fighter' && base.f > 0 && d <= S.fighter.fuel / 2) base.f--;
  else if (k === 'bomber' && base.b > 0 && d <= S.bomber.fuel / 2) base.b--;
  else return false;
  base.cd = 1;
  addUnit(sim, slot, k, base.x, base.y, { home: base.id, tx: wrap(x), ty: y, st: 'out', fuel: S[k].fuel, lt: 0, nuke: k === 'bomber' ? 1 : 0 });
  return true;
}
export function applyCmd(sim, c) {
  const p = sim.players[c.p];
  if (!p || !p.active) return;
  if (c.t === 'bot') { p.bot = true; return; }
  if (c.t === 'human') { p.bot = false; return; } // powrót gracza po odświeżeniu strony
  if (p.bot) return;
  const ids = Array.isArray(c.ids) ? c.ids.slice(0, 50).map(Number) : [];
  const x = wrap(+c.x || 0), y = Math.max(0, Math.min(180, +c.y || 0));
  if (c.t === 'place') place(sim, c.p, c.k, x, y);
  else if (c.t === 'move') cmdMove(sim, c.p, ids, x, y);
  else if (c.t === 'mode') cmdMode(sim, c.p, ids, c.m);
  else if (c.t === 'launch') for (const id of ids) { const u = own(sim, c.p, id); if (u) launch(sim, c.p, u, x, y); }
  else if (c.t === 'air') launchAir(sim, c.p, own(sim, c.p, +c.id), c.k, x, y);
}

/* ---------- krok symulacji ---------- */
const enemy = (a, b) => a.o !== b.o;
function nearest(sim, from, maxD, pred) {
  let best = null, bd = maxD * maxD;
  for (const v of sim.units) { if (v.hp <= 0 || !pred(v)) continue; const d = dist2(from.x, from.y, v.x, v.y); if (d <= bd) { bd = d; best = v; } }
  return best;
}
function moveTo(u, tx, ty, step) {
  const dx = ddx(u.x, tx), dy = ty - u.y; const d = Math.sqrt(dx * dx + dy * dy);
  if (d <= step) { u.x = wrap(tx); u.y = ty; return true; }
  u.x = wrap(u.x + (dx / d) * step); u.y += (dy / d) * step; return false;
}
function detonate(sim, o, x, y) {
  sim.ev.push({ k: 'boom', o, x, y });
  const R2 = S.nuke.r * S.nuke.r;
  for (const c of sim.cities) {
    if (c.pop <= 0.01 || dist2(c.x, c.y, x, y) > R2) continue;
    const kill = c.pop * 0.5; c.pop -= kill;
    const vict = sim.players[c.t];
    if (vict.active) { vict.lost += kill; if (c.t !== o) sim.players[o].killed += kill; }
    sim.ev.push({ k: 'city', name: c.name, kill, o, t: c.t });
    if (c.t !== o) vict.ai.hitBy = o;
  }
  for (const u of sim.units) {
    if (u.hp <= 0 || dist2(u.x, u.y, x, y) > R2) continue;
    if (STRUCT.includes(u.k)) u.hp -= 2; else u.hp = 0;
    if (u.hp <= 0) sim.ev.push({ k: 'dead', x: u.x, y: u.y, uk: u.k, o: u.o });
  }
}
export function nukesLeft(sim) {
  let n = 0;
  for (const u of sim.units) { if (u.hp <= 0) continue; if (u.k === 'silo' || u.k === 'sub') n += u.ammo; else if (u.k === 'airbase') n += u.b; else if (u.k === 'bomber') n += u.nuke; }
  return n + sim.missiles.length;
}

export function step(sim) {
  const dt = 0.1 * sim.speed;
  sim.tick++; sim.t += dt;
  let d = 5; for (let i = 1; i < 5; i++) if (sim.t >= PHASE_T[i]) d = 5 - i;
  if (d !== sim.defcon) {
    sim.defcon = d; sim.ev.push({ k: 'defcon', d });
    if (d === 3) for (const p of sim.players) if (p.active) autoPlace(sim, p.slot); // nierozmieszczone jednostki
    if (d === 1) sim.nukeTotal = nukesLeft(sim);
  }
  // boty
  for (const p of sim.players) if (p.active && p.bot && (sim.tick + p.slot * 3) % 20 === 0) botThink(sim, p);
  const war = sim.defcon <= 3;

  for (const u of sim.units) {
    if (u.hp <= 0) continue;
    u.px = u.x; u.py = u.y;
    if (u.cd > 0) u.cd -= dt;
    if (u.sw > 0) u.sw -= dt;
    if (u.k === 'silo') {
      if (war && u.mode === 'def' && u.sw <= 0 && u.cd <= 0) {
        const R2 = S.silo.def * S.silo.def; let tgt = null, bd = R2;
        for (const m of sim.missiles) if (!m.dead && m.o !== u.o) { const dd = dist2(u.x, u.y, m.x, m.y); if (dd < bd) { bd = dd; tgt = m; } }
        const air = nearest(sim, u, S.silo.def, (v) => enemy(u, v) && AIR.includes(v.k));
        if (air && dist2(u.x, u.y, air.x, air.y) < bd) tgt = air;
        if (tgt) {
          u.cd = S.silo.defCd; const hit = rnd(sim) < S.silo.defHit;
          if (hit) { if (tgt.k === 'icbm' || tgt.k === 'slbm') tgt.dead = true; else tgt.hp = 0; }
          sim.ev.push({ k: 'shot', x: u.x, y: u.y, tx: tgt.x, ty: tgt.y, hit, o: u.o });
        }
      }
    } else if (u.k === 'airbase') {
      // nic — samoloty startują z rozkazu
    } else if (u.k === 'battleship' || (u.k === 'sub' && u.mode === 'move')) {
      if (u.path.length && (u.k !== 'sub' || u.sw <= 0)) { if (moveTo(u, u.path[0][0], u.path[0][1], S[u.k].speed * dt)) u.path.shift(); }
      if (war && u.cd <= 0) {
        const R = S[u.k].range;
        const tgt = nearest(sim, u, R, (v) => enemy(u, v) && (v.k === 'battleship' || (v.k === 'sub' && dist2(u.x, u.y, v.x, v.y) <= 9) || (u.k === 'battleship' && AIR.includes(v.k))));
        if (tgt) {
          u.cd = S[u.k].cd; const air = AIR.includes(tgt.k); const hit = rnd(sim) < (air ? 0.35 : 0.55);
          if (hit) { tgt.hp -= air ? 99 : 1; if (tgt.hp <= 0) sim.ev.push({ k: 'dead', x: tgt.x, y: tgt.y, uk: tgt.k, o: tgt.o }); }
          sim.ev.push({ k: 'shot', x: u.x, y: u.y, tx: tgt.x, ty: tgt.y, hit, o: u.o });
          if (u.k === 'sub') u.rev = true;
        }
      }
    } else if (u.k === 'fighter' || u.k === 'bomber') {
      const st = S[u.k]; const home = sim.units.find((b) => b.id === u.home && b.hp > 0);
      const step2 = st.speed * dt; u.fuel -= step2;
      if (u.fuel <= 0) { u.hp = 0; continue; }
      if (u.st === 'out') {
        if (moveTo(u, u.tx, u.ty, step2)) {
          if (u.k === 'bomber') { if (u.nuke && sim.defcon === 1) { u.nuke = 0; detonate(sim, u.o, u.tx, u.ty); } u.st = 'back'; }
          else { u.st = 'loiter'; u.lt = 15; }
        }
      } else if (u.st === 'loiter') { u.lt -= dt; if (u.lt <= 0) u.st = 'back'; }
      else if (u.st === 'back') {
        if (!home) { /* leci dalej aż skończy się paliwo */ } else if (moveTo(u, home.x, home.y, step2)) { if (u.k === 'fighter') home.f++; else home.b++; u.hp = 0; u.landed = true; continue; }
      }
      if (u.st !== 'back' && home && u.fuel < dist(u.x, u.y, home.x, home.y) + 2) u.st = 'back';
      if (u.k === 'fighter' && war && u.cd <= 0) {
        const tgt = nearest(sim, u, st.range, (v) => enemy(u, v) && AIR.includes(v.k));
        if (tgt) { u.cd = st.cd; const hit = rnd(sim) < 0.5; if (hit) { tgt.hp = 0; sim.ev.push({ k: 'dead', x: tgt.x, y: tgt.y, uk: tgt.k, o: tgt.o }); } sim.ev.push({ k: 'shot', x: u.x, y: u.y, tx: tgt.x, ty: tgt.y, hit, o: u.o }); }
      }
    }
  }
  for (const m of sim.missiles) {
    if (m.dead) continue;
    m.px = m.x; m.py = m.y;
    if (moveTo(m, m.tx, m.ty, S[m.k].speed * dt)) { m.dead = true; detonate(sim, m.o, m.tx, m.ty); }
  }
  sim.units = sim.units.filter((u) => u.hp > 0);
  sim.missiles = sim.missiles.filter((m) => !m.dead);
  // koniec gry
  if (!sim.endAt) {
    if (sim.defcon === 1 && sim.nukeTotal > 0 && nukesLeft(sim) <= sim.nukeTotal * 0.2) { sim.endAt = sim.t + 90; sim.ev.push({ k: 'endsoon' }); }
    else if (sim.t >= END_T - 90) { sim.endAt = END_T; sim.ev.push({ k: 'endsoon' }); }
  }
  if (sim.endAt && sim.t >= sim.endAt && !sim.ended) { sim.ended = true; sim.ev.push({ k: 'end' }); }
}

/* ---------- boty ---------- */
function autoPlace(sim, slot) {
  const p = sim.players[slot];
  const order = ['radar', 'silo', 'airbase', 'battleship', 'sub'];
  for (const k of order) {
    let guard = 0;
    while (p.stock[k] > 0 && guard++ < 40) {
      const pool = STRUCT.includes(k) ? LANDC[slot] : SEAC[slot]; if (!pool.length) break;
      let best = null, bs = -1e9;
      for (let i = 0; i < 50; i++) {
        const c = pool[rint(sim, pool.length)]; const x = cx(c), y = cy(c);
        if (canPlace({ ...sim, defcon: 5 }, slot, k, x, y)) continue;
        const mine = sim.units.filter((u) => u.o === slot);
        const md = (f, cap) => { let m = cap * cap; for (const u of mine) if (f(u)) m = Math.min(m, dist2(u.x, u.y, x, y)); return Math.sqrt(m); };
        let sc = 0;
        if (k === 'radar') sc = md((u) => u.k === 'radar', 22) + md((u) => STRUCT.includes(u.k), 4);
        else if (k === 'silo') sc = md((u) => STRUCT.includes(u.k), 7) - dist(x, y, CENTER[slot].x, CENTER[slot].y) * 0.15;
        else if (k === 'airbase') sc = md((u) => STRUCT.includes(u.k), 6) - dist(x, y, CENTER[slot].x, CENTER[slot].y) * 0.25;
        else if (k === 'battleship') sc = -md((u) => u.k === 'battleship', 30) * 0.3 + md((u) => SHIPS.includes(u.k), 3);
        else sc = md((u) => SHIPS.includes(u.k), 8);
        sc += rnd(sim) * 0.5;
        if (sc > bs) { bs = sc; best = [x, y]; }
      }
      if (!best) break;
      addUnit(sim, slot, k, best[0], best[1]); p.stock[k]--;
    }
    p.stock[k] = 0;
  }
}

function pickEnemy(sim, p) {
  const others = sim.players.filter((q) => q.active && q.slot !== p.slot);
  if (!others.length) return null;
  if (p.ai.hitBy != null && sim.players[p.ai.hitBy].active && rnd(sim) < 0.7) return sim.players[p.ai.hitBy];
  others.sort((a, b) => dist2(CENTER[p.slot].x, CENTER[p.slot].y, CENTER[a.slot].x, CENTER[a.slot].y) - dist2(CENTER[p.slot].x, CENTER[p.slot].y, CENTER[b.slot].x, CENTER[b.slot].y));
  return others[Math.min(others.length - 1, rint(sim, 3))];
}
function pickCity(sim, p, fromX, fromY, maxD) {
  const list = sim.cities.filter((c) => c.t !== p.slot && sim.players[c.t].active && c.pop > 0.4 && (maxD == null || dist2(c.x, c.y, fromX, fromY) <= maxD * maxD));
  if (!list.length) return null;
  const pref = p.ai.enemy != null ? list.filter((c) => c.t === p.ai.enemy) : [];
  const L = pref.length && rnd(sim) < 0.65 ? pref : list;
  let sum = 0; for (const c of L) sum += c.pop; let r = rnd(sim) * sum;
  for (const c of L) { r -= c.pop; if (r <= 0) return c; }
  return L[L.length - 1];
}

function botThink(sim, p) {
  const ai = p.ai; const s = p.slot;
  if (sim.defcon >= 4) { if (Object.values(p.stock).some((n) => n > 0)) autoPlace(sim, s); return; }
  const mine = sim.units.filter((u) => u.o === s);
  if (ai.enemy == null || (ai.hitBy != null && ai.enemy !== ai.hitBy && rnd(sim) < 0.05)) { const e = pickEnemy(sim, p); ai.enemy = e ? e.slot : null; }
  if (ai.enemy == null) return;
  // flota
  if (!ai.fleetT || sim.t > ai.fleetT) {
    ai.fleetT = sim.t + 50 + rnd(sim) * 30;
    const es = SEAC[ai.enemy];
    for (const u of mine) {
      if (u.k === 'battleship' && !u.path.length && es.length) { const c = es[rint(sim, es.length)]; const pth = findPath(u.x, u.y, cx(c), cy(c)); if (pth) u.path = pth; }
      if (u.k === 'sub' && u.mode === 'move' && !u.path.length && es.length) {
        const city = pickCity(sim, p, u.x, u.y, null);
        if (city) {
          let best = null, bd = 1e9; for (let i = 0; i < 30; i++) { const c = es[rint(sim, es.length)]; const dd = dist2(cx(c), cy(c), city.x, city.y); if (dd < bd) { bd = dd; best = c; } }
          if (best != null) { const pth = findPath(u.x, u.y, cx(best), cy(best)); if (pth) u.path = pth; }
        }
      }
    }
  }
  // myśliwce na zwiad/przechwyt
  if (!ai.airT || sim.t > ai.airT) {
    ai.airT = sim.t + 25 + rnd(sim) * 20;
    for (const b of mine) if (b.k === 'airbase' && b.f > 1) {
      const tgt = nearest(sim, b, 32, (v) => v.o !== s && (SHIPS.includes(v.k) || v.k === 'bomber'));
      if (tgt) { launchAir(sim, s, b, 'fighter', tgt.x, tgt.y); break; }
    }
  }
  if (sim.defcon !== 1) return;
  // atak nuklearny
  if (ai.atkT == null) ai.atkT = PHASE_T[4] + 15 + rnd(sim) * 100;
  if (ai.hitBy != null && ai.atkT > sim.t + 5) ai.atkT = sim.t + 5; // odwet
  if (sim.t < ai.atkT) return;
  const silos = mine.filter((u) => u.k === 'silo');
  const keepDef = sim.t < ai.atkT + 120 ? 2 : 0;
  let def = silos.filter((u) => u.mode === 'def').length;
  for (const u of silos) if (u.mode === 'def' && def > keepDef && u.ammo > 0) { cmdMode(sim, s, [u.id], 'atk'); def--; }
  for (const u of silos) {
    if (u.mode === 'atk' && u.ammo === 0 && u.sw <= 0) { cmdMode(sim, s, [u.id], 'def'); continue; }
    if (u.mode !== 'atk' || u.sw > 0 || u.cd > 0 || u.ammo <= 0) continue;
    let tx, ty;
    const rs = rnd(sim) < 0.2 ? sim.units.filter((v) => v.o !== s && v.k === 'silo' && v.rev) : [];
    if (rs.length) { const v = rs[rint(sim, rs.length)]; tx = v.x; ty = v.y; }
    else { const c = pickCity(sim, p, 0, 0, null); if (!c) break; tx = c.x; ty = c.y; }
    launch(sim, s, u, tx + (rnd(sim) - 0.5) * 0.6, ty + (rnd(sim) - 0.5) * 0.6);
  }
  for (const u of mine) if (u.k === 'sub' && u.ammo > 0) {
    const c = pickCity(sim, p, u.x, u.y, S.sub.nuke - 1);
    if (u.mode === 'move' && c) cmdMode(sim, s, [u.id], 'nuke');
    else if (u.mode === 'nuke' && c) launch(sim, s, u, c.x, c.y);
  }
  for (const b of mine) if (b.k === 'airbase' && b.b > 0 && rnd(sim) < 0.3) {
    const c = pickCity(sim, p, b.x, b.y, S.bomber.fuel / 2 - 2); if (c) launchAir(sim, s, b, 'bomber', c.x, c.y);
  }
}

/* ---------- pomocnicze dla klienta ---------- */
export function hashSim(sim) {
  let h = 2166136261 >>> 0;
  const add = (v) => { const s = typeof v === 'number' ? v.toFixed(6) : String(v); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } };
  add(sim.tick); add(sim.r);
  for (const u of sim.units) { add(u.id); add(u.x); add(u.y); add(u.hp); }
  for (const m of sim.missiles) { add(m.id); add(m.x); add(m.y); }
  for (const c of sim.cities) add(c.pop);
  return h.toString(36);
}
// Czy obiekt jest widoczny dla gracza (mgła wojny). slot < 0 = obserwator (widzi wszystko).
export function visibleSet(sim, slot) {
  if (slot < 0) return null;
  const src = [];
  for (const u of sim.units) if (u.o === slot) src.push([u.x, u.y, u.k === 'radar' ? S.radar.range : AIR.includes(u.k) ? 5 : SHIPS.includes(u.k) ? 6 : 4, u.k]);
  const vis = new Set();
  const seen = (x, y, sub) => {
    for (const [sx, sy, r, k] of src) { if (sub && !SHIPS.includes(k)) continue; const rr = sub ? 3 : r; if (dist2(sx, sy, x, y) <= rr * rr) return true; }
    return false;
  };
  for (const u of sim.units) if (u.o === slot || u.rev || seen(u.x, u.y, u.k === 'sub')) vis.add(u.id);
  for (const m of sim.missiles) if (m.o === slot || seen(m.x, m.y, false)) vis.add(m.id);
  return vis;
}
