// Uruchamia jedną minigrę i daje jej "ctx" z pomocnikami.
// Wszystkie timery / nasłuchy / pętle są sprzątane automatycznie po końcu gry.
import { h, mulberry32 } from './util.js';

export function runGame(o) {
  let alive = true, finished = false;
  const timers = new Set(), offs = [];

  const stop = () => {
    if (!alive) return;
    alive = false;
    timers.forEach((t) => { clearTimeout(t); clearInterval(t); });
    offs.forEach((f) => { try { f(); } catch (e) { /* ignore */ } });
  };

  const c = {
    el: o.el,
    rng: mulberry32(o.seed >>> 0),
    me: o.me,
    players: o.players,
    teams: o.teams || {},
    duration: o.game.time * 1000,
    get alive() { return alive; },
    timeLeft: () => Math.max(0, o.endAt - o.now()),
    score(s, label) { if (alive && Number.isFinite(s)) o.onScore(s, String(label)); },
    done() { if (finished) return; finished = true; stop(); o.onDone && o.onDone(); },
    after(fn, ms) {
      const id = setTimeout(() => { timers.delete(id); if (alive) fn(); }, ms);
      timers.add(id); return id;
    },
    every(fn, ms) { const id = setInterval(() => { if (alive) fn(); }, ms); timers.add(id); return id; },
    on(t, ev, fn, opt) { t.addEventListener(ev, fn, opt); offs.push(() => t.removeEventListener(ev, fn, opt)); },
    loop(fn) {
      let last = performance.now();
      const step = (t) => {
        if (!alive) return;
        const dt = Math.min(0.05, Math.max(0, (t - last) / 1000)); last = t;
        try { fn(dt, t); } catch (e) { console.error(e); }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    },
    // Canvas o logicznym rozmiarze W×H, skalowany do ekranu
    canvas(W, H) {
      const cv = h('canvas', { class: 'game-canvas' });
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = W * dpr; cv.height = H * dpr;
      cv.style.width = `min(100%, calc(60vh * ${W / H}))`;
      cv.logical = { w: W, h: H };
      const g = cv.getContext('2d'); g.scale(dpr, dpr);
      return [cv, g];
    },
    pos(e, cv) {
      const r = cv.getBoundingClientRect();
      return { x: (e.clientX - r.left) * cv.logical.w / r.width, y: (e.clientY - r.top) * cv.logical.h / r.height };
    },
    // klawiatura: up/down/left/right/space/enter
    keys(fn) {
      const M = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right', ' ': 'space', Enter: 'enter' };
      c.on(window, 'keydown', (e) => {
        const m = M[e.key];
        if (!m || (e.target && e.target.tagName === 'INPUT')) return;
        e.preventDefault();
        if (e.repeat && (m === 'space' || m === 'enter')) return;
        fn(m, e);
      });
    },
    dpad(fn) {
      const b = (d, t) => h('button', { class: 'dp dp-' + d, onpointerdown: (e) => { e.preventDefault(); if (alive) fn(d); } }, t);
      return h('div', { class: 'dpad' }, b('up', '▲'), b('left', '◀'), b('right', '▶'), b('down', '▼'));
    },
    swipe(el, fn) {
      let sx = 0, sy = 0, on = false;
      c.on(el, 'pointerdown', (e) => { on = true; sx = e.clientX; sy = e.clientY; });
      c.on(el, 'pointerup', (e) => {
        if (!on) return; on = false;
        const dx = e.clientX - sx, dy = e.clientY - sy;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
        fn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
      });
    },
    // wspólny stan (Firebase albo lokalny w trybie treningu)
    live: {
      set: (p, v) => (alive ? o.live.set(p, v) : Promise.resolve()),
      tx: (p, fn) => o.live.tx(p, fn),
      watch: (p, cb) => { const off = o.live.watch(p, (v) => { if (alive) cb(v); }); offs.push(off); return off; },
    },
  };

  try { o.game.play(c); } catch (e) { console.error('Błąd minigry', o.game.id, e); }
  return { stop, ctx: c };
}

// Lokalny odpowiednik Firebase dla trybu treningu
export function localLive() {
  const data = {}; const ws = [];
  const getP = (p) => p.split('/').reduce((o, k) => (o == null ? undefined : o[k]), data) ?? null;
  const copy = (v) => (v == null ? null : JSON.parse(JSON.stringify(v)));
  const setP = (p, v) => {
    const ks = p.split('/'); let o = data;
    for (const k of ks.slice(0, -1)) o = o[k] ??= {};
    if (v == null) delete o[ks.at(-1)]; else o[ks.at(-1)] = v;
    ws.slice().forEach((w) => w.cb(copy(getP(w.p))));
  };
  return {
    set: (p, v) => { setP(p, v); return Promise.resolve(); },
    tx: (p, fn) => {
      const r = fn(copy(getP(p)));
      if (r === undefined) return Promise.resolve({ committed: false, value: getP(p) });
      setP(p, r); return Promise.resolve({ committed: true, value: r });
    },
    watch: (p, cb) => { const w = { p, cb }; ws.push(w); cb(copy(getP(p))); return () => { const i = ws.indexOf(w); if (i >= 0) ws.splice(i, 1); }; },
    get: (p) => copy(getP(p)),
  };
}
