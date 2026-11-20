// Rysowanie mapy (canvas), kamera, mgła wojny i sterowanie myszą/dotykiem.
import { LAND, GRID } from './world.js';
import { TERR, S, STRUCT, SHIPS, AIR, wrap, ddx, dist, dist2, visibleSet, canPlace } from './sim.js';

const TC = TERR.map((t) => t.color);
const GREY = '#59607a';
const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

export class GameView {
  constructor(canvas, opts) {
    this.cv = canvas; this.g = canvas.getContext('2d');
    this.o = opts; // {getSim, mySlot, alpha(), send(cmd), onSelect(), onHint(text)}
    this.cam = { x: 180, y: 75, z: 3 };
    this.sel = new Set(); this.mode = null; this.hover = null; this.mouse = null;
    this.fx = []; this.pending = [];
    this.landPath = new Path2D();
    for (const r of LAND) { this.landPath.moveTo(r[0][0], r[0][1]); for (let i = 1; i < r.length; i++) this.landPath.lineTo(r[i][0], r[i][1]); this.landPath.closePath(); }
    this.buildTints();
    this.resize(); this.fit();
    this.bindInput();
    window.addEventListener('resize', () => this.resize());
  }
  buildTints() {
    const sim = this.o.getSim(); const act = sim.players.map((p) => p.active);
    const mk = (sea) => {
      const c = document.createElement('canvas'); c.width = 360; c.height = 180; const g = c.getContext('2d');
      for (let k = 0; k < GRID.length; k++) {
        const ch = GRID[k]; const t = (sea ? 'abcdef' : 'ABCDEF').indexOf(ch);
        if (t < 0) { if (!sea && ch === '#') { g.fillStyle = GREY; g.fillRect(k % 360, (k / 360) | 0, 1, 1); } continue; }
        g.fillStyle = act[t] ? TC[t] : GREY; g.fillRect(k % 360, (k / 360) | 0, 1, 1);
      }
      return c;
    };
    this.landTint = mk(false); this.seaTint = mk(true);
  }
  resize() {
    const r = this.cv.getBoundingClientRect(); this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = r.width; this.H = r.height; this.cv.width = r.width * this.dpr; this.cv.height = r.height * this.dpr;
  }
  fit() { this.cam.z = Math.max(this.W / 360, this.H / 145); this.cam.y = 80; }
  focusTerr(t) {
    let sx = 0, sy = 0, n = 0;
    for (let k = 0; k < GRID.length; k++) if (GRID[k] === 'ABCDEF'[t]) { sx += k % 360; sy += (k / 360) | 0; n++; }
    if (n) { this.cam.x = sx / n; this.cam.y = sy / n; this.cam.z = Math.max(this.W / 360, this.H / 145) * 2.2; this.clampCam(); }
  }
  clampCam() {
    const minZ = Math.max(this.W / 360, this.H / 160); this.cam.z = Math.max(minZ, Math.min(40, this.cam.z));
    const half = this.H / 2 / this.cam.z; this.cam.y = Math.max(half, Math.min(165 - half, this.cam.y)); if (half * 2 > 165) this.cam.y = 82;
    this.cam.x = wrap(this.cam.x);
  }
  sx(x) { return this.W / 2 + ddx(this.cam.x, x) * this.cam.z; }
  sy(y) { return this.H / 2 + (y - this.cam.y) * this.cam.z; }
  wx(px) { return wrap(this.cam.x + (px - this.W / 2) / this.cam.z); }
  wy(py) { return this.cam.y + (py - this.H / 2) / this.cam.z; }

  /* ---------- wejście ---------- */
  bindInput() {
    const cv = this.cv; const ptrs = new Map(); let drag = null, pinch = null;
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('wheel', (e) => {
      e.preventDefault(); const f = Math.exp(-e.deltaY * 0.0015);
      const wx = this.wx(e.offsetX), wy = this.wy(e.offsetY);
      this.cam.z *= f; this.clampCam();
      this.cam.x = wrap(wx - (e.offsetX - this.W / 2) / this.cam.z); this.cam.y = wy - (e.offsetY - this.H / 2) / this.cam.z; this.clampCam();
    }, { passive: false });
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: this.cam.z }; drag = null; return; }
      if (e.button === 2) { this.cancel(); return; }
      drag = { x0: e.offsetX, y0: e.offsetY, cx: this.cam.x, cy: this.cam.y, moved: false, box: e.shiftKey };
    });
    cv.addEventListener('pointermove', (e) => {
      this.mouse = { x: e.offsetX, y: e.offsetY };
      if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      if (pinch && ptrs.size === 2) { const [a, b] = [...ptrs.values()]; this.cam.z = pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d; this.clampCam(); return; }
      if (!drag) return;
      const dx = e.offsetX - drag.x0, dy = e.offsetY - drag.y0;
      if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
      if (drag.moved && !drag.box) { this.cam.x = wrap(drag.cx - dx / this.cam.z); this.cam.y = drag.cy - dy / this.cam.z; this.clampCam(); }
      if (drag.box) drag.x1 = e.offsetX, drag.y1 = e.offsetY;
      this.dragBox = drag.box && drag.moved ? drag : null;
    });
    const up = (e) => {
      ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null;
      if (!drag) return; const d = drag; drag = null; this.dragBox = null;
      if (d.box && d.moved) { this.boxSelect(d); return; }
      if (!d.moved) this.click(e.offsetX, e.offsetY, e.shiftKey);
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', () => { this.mouse = null; });
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'Escape') this.cancel();
      if (e.key === 'f' || e.key === 'F') this.fit();
      if (e.key === 'h' || e.key === 'H') this.focusTerr(this.o.mySlot());
    });
  }
  cancel() { if (this.mode) this.mode = null; else this.sel.clear(); this.o.onSelect(); }
  setMode(m) { this.mode = m; this.o.onSelect(); }
  unitAt(px, py, ownOnly) {
    const sim = this.o.getSim(); const me = this.o.mySlot(); const vis = this.vis;
    let best = null, bd = 16 * 16;
    for (const u of sim.units) {
      if (ownOnly && u.o !== me) continue; if (vis && !vis.has(u.id)) continue;
      const dx = this.sx(u.x) - px, dy = this.sy(u.y) - py, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  }
  boxSelect(d) {
    const sim = this.o.getSim(); const me = this.o.mySlot();
    const [x0, x1] = [Math.min(d.x0, d.x1), Math.max(d.x0, d.x1)], [y0, y1] = [Math.min(d.y0, d.y1), Math.max(d.y0, d.y1)];
    this.sel.clear(); this.mode = null;
    for (const u of sim.units) if (u.o === me && !AIR.includes(u.k)) { const x = this.sx(u.x), y = this.sy(u.y); if (x >= x0 && x <= x1 && y >= y0 && y <= y1) this.sel.add(u.id); }
    this.o.onSelect();
  }
  click(px, py, shift) {
    const sim = this.o.getSim(); const me = this.o.mySlot(); const x = this.wx(px), y = this.wy(py);
    if (me < 0) return;
    const m = this.mode;
    if (m && m.startsWith('place:')) {
      const k = m.slice(6); const err = canPlace(sim, me, k, x, y);
      if (err) { this.o.onHint(err); return; }
      this.o.send({ t: 'place', k, x, y }); this.pending.push({ k, x, y, until: performance.now() + 2500 });
      const left = (sim.players[me].stock[k] || 0) - this.pending.filter((p) => p.k === k).length;
      if (left <= 0) this.mode = null; this.o.onSelect(); return;
    }
    if (m === 'launch') { const ids = this.selUnits().filter((u) => u.k === 'silo' || u.k === 'sub').map((u) => u.id); if (ids.length) { this.o.send({ t: 'launch', ids, x, y }); this.fx.push({ k: 'target', x, y, t0: performance.now() }); } return; }
    if (m === 'fighter' || m === 'bomber') { for (const b of this.selUnits().filter((u) => u.k === 'airbase')) this.o.send({ t: 'air', id: b.id, k: m, x, y }); this.fx.push({ k: 'target', x, y, t0: performance.now() }); this.mode = null; this.o.onSelect(); return; }
    const u = this.unitAt(px, py, true);
    if (u && !AIR.includes(u.k)) { if (!shift) this.sel.clear(); this.sel.has(u.id) && shift ? this.sel.delete(u.id) : this.sel.add(u.id); this.mode = null; this.o.onSelect(); return; }
    const ships = this.selUnits().filter((v) => v.k === 'battleship' || (v.k === 'sub' && v.mode === 'move'));
    if (ships.length) {
      const c = GRID[Math.min(179, Math.max(0, Math.floor(y))) * 360 + (Math.floor(x) % 360)];
      if (!(c === '~' || (c >= 'a' && c <= 'f'))) { this.o.onHint('Okręty pływają tylko po oceanie'); return; }
      this.o.send({ t: 'move', ids: ships.map((v) => v.id), x, y }); this.fx.push({ k: 'move', x, y, t0: performance.now() }); return;
    }
    const any = this.unitAt(px, py, false);
    if (!any) { this.sel.clear(); this.o.onSelect(); }
  }
  selUnits() { const sim = this.o.getSim(); return sim.units.filter((u) => this.sel.has(u.id)); }

  /* ---------- efekty ze zdarzeń symulacji ---------- */
  consume(evs, quiet) {
    const now = performance.now();
    for (const e of evs) {
      if (quiet) continue;
      if (e.k === 'boom') this.fx.push({ k: 'boom', x: e.x, y: e.y, o: e.o, t0: now });
      else if (e.k === 'shot') this.fx.push({ k: 'shot', x: e.x, y: e.y, tx: e.tx, ty: e.ty, hit: e.hit, o: e.o, t0: now });
      else if (e.k === 'dead') this.fx.push({ k: 'dead', x: e.x, y: e.y, t0: now });
    }
    if (this.fx.length > 400) this.fx.splice(0, this.fx.length - 400);
  }

  /* ---------- rysowanie ---------- */
  draw() {
    const g = this.g, sim = this.o.getSim(), me = this.o.mySlot(), a = this.o.alpha(), now = performance.now();
    const { W, H, dpr, cam } = this; const z = cam.z;
    this.vis = visibleSet(sim, me);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#05070f'; g.fillRect(0, 0, W, H);
    // świat ×3 kopie (zawijanie w poziomie)
    for (let k = -1; k <= 1; k++) {
      const ox = W / 2 + (k * 360 - cam.x) * z, oy = H / 2 - cam.y * z;
      if (ox > W || ox + 380 * z < 0) continue;
      g.setTransform(z * dpr, 0, 0, z * dpr, ox * dpr, oy * dpr);
      g.imageSmoothingEnabled = true;
      g.globalAlpha = 0.07; g.drawImage(this.seaTint, 0, 0);
      g.globalAlpha = 1; g.fillStyle = '#0c1020'; g.fill(this.landPath);
      g.save(); g.clip(this.landPath); g.globalAlpha = 0.28; g.drawImage(this.landTint, 0, 0); g.drawImage(this.landTint, 360, 0); g.drawImage(this.landTint, -360, 0); g.restore();
      g.globalAlpha = 1;
      g.lineWidth = 2.4 / z; g.strokeStyle = 'rgba(120,200,255,.10)'; g.stroke(this.landPath);
      g.lineWidth = 0.8 / z; g.strokeStyle = 'rgba(170,220,255,.55)'; g.stroke(this.landPath);
      // siatka
      g.lineWidth = 0.5 / z; g.strokeStyle = 'rgba(100,140,255,.07)'; g.beginPath();
      for (let x = 0; x <= 360; x += 15) { g.moveTo(x, 0); g.lineTo(x, 180); }
      for (let y = 0; y <= 180; y += 15) { g.moveTo(0, y); g.lineTo(360, y); }
      g.stroke();
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const lx = (u) => u.px + ddx(u.px, u.x) * a, ly = (u) => u.py + (u.y - u.py) * a;

    // zasięgi radarów (własne)
    for (const u of sim.units) if (u.o === me && u.k === 'radar') {
      g.beginPath(); g.arc(this.sx(u.x), this.sy(u.y), S.radar.range * z, 0, Math.PI * 2);
      g.fillStyle = 'rgba(120,200,255,.035)'; g.fill(); g.strokeStyle = 'rgba(120,200,255,.12)'; g.lineWidth = 1; g.stroke();
    }
    // miasta
    g.font = '11px "Share Tech Mono", monospace'; g.textAlign = 'center';
    for (const c of sim.cities) {
      const act = sim.players[c.t].active; const col = act ? TC[c.t] : GREY;
      const x = this.sx(c.x), y = this.sy(c.y); if (x < -40 || x > W + 40 || y < -20 || y > H + 20) continue;
      const r = (1.2 + Math.sqrt(c.pop0) * 0.9) * Math.min(2, Math.max(0.7, z / 4));
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
      g.fillStyle = c.pop > 0.05 ? hexA(col, 0.25 + 0.6 * (c.pop / c.pop0)) : 'rgba(80,80,80,.4)'; g.fill();
      if (z > 4.5 || (z > 2.6 && c.pop0 > 14)) { g.fillStyle = hexA(col, 0.75); g.fillText(`${c.name} ${c.pop.toFixed(1)}`, x, y - r - 3); }
    }
    // ścieżki zaznaczonych okrętów
    g.setLineDash([4, 4]); g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1;
    for (const u of sim.units) if (this.sel.has(u.id) && u.path && u.path.length) {
      g.beginPath(); g.moveTo(this.sx(u.x), this.sy(u.y)); for (const [px, py] of u.path) g.lineTo(this.sx(px), this.sy(py)); g.stroke();
    }
    g.setLineDash([]);
    // jednostki
    const vis = this.vis;
    for (const u of sim.units) {
      if (vis && !vis.has(u.id)) continue;
      const x = this.sx(lx(u)), y = this.sy(ly(u)); if (x < -30 || x > W + 30 || y < -30 || y > H + 30) continue;
      this.drawUnit(g, u, x, y, TC[u.o], this.sel.has(u.id));
    }
    // pociski
    for (const m of sim.missiles) {
      if (vis && !vis.has(m.id)) continue;
      const col = TC[m.o]; const D = dist(m.sx, m.sy, m.tx, m.ty) || 1;
      const curX = lx(m), curY = ly(m); const f = Math.min(1, dist(m.sx, m.sy, curX, curY) / D);
      const pt = (ff) => { const bx = m.sx + ddx(m.sx, m.tx) * ff, by = m.sy + (m.ty - m.sy) * ff; return [this.sx(bx), this.sy(by - D * 0.18 * 4 * ff * (1 - ff))]; };
      g.beginPath(); for (let i = 0; i <= 16; i++) { const [px, py] = pt(f * i / 16); i ? g.lineTo(px, py) : g.moveTo(px, py); }
      g.strokeStyle = hexA(col, 0.55); g.lineWidth = 1.4; g.stroke();
      const [hx, hy] = pt(f); g.beginPath(); g.arc(hx, hy, 2.6, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
      if (m.o === me) { const [tx, ty] = pt(1); g.strokeStyle = hexA(col, 0.4); g.beginPath(); g.arc(tx, ty, 4, 0, Math.PI * 2); g.stroke(); }
    }
    // efekty
    this.fx = this.fx.filter((e) => now - e.t0 < (e.k === 'boom' ? 4000 : 900));
    for (const e of this.fx) {
      const age = (now - e.t0) / 1000, x = this.sx(e.x), y = this.sy(e.y);
      if (e.k === 'boom') {
        const R = S.nuke.r * z * (0.4 + Math.min(1, age * 2)) + 6;
        const grd = g.createRadialGradient(x, y, 0, x, y, R);
        grd.addColorStop(0, `rgba(255,255,230,${Math.max(0, 1 - age / 1.2)})`); grd.addColorStop(0.4, `rgba(255,160,60,${Math.max(0, 0.8 - age / 4)})`); grd.addColorStop(1, 'rgba(255,60,30,0)');
        g.fillStyle = grd; g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.fill();
        g.strokeStyle = `rgba(255,220,180,${Math.max(0, 0.7 - age / 2)})`; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, R * (1 + age * 0.6), 0, Math.PI * 2); g.stroke();
      } else if (e.k === 'shot') {
        if (vis && dist2(e.x, e.y, e.tx, e.ty) > 0 && !this.nearVisible(e.x, e.y)) continue;
        g.strokeStyle = e.hit ? `rgba(255,255,255,${1 - age / 0.9})` : hexA(TC[e.o], 0.5 * (1 - age / 0.9)); g.lineWidth = 1;
        g.beginPath(); g.moveTo(x, y); g.lineTo(this.sx(e.tx), this.sy(e.ty)); g.stroke();
      } else if (e.k === 'dead') { if (vis && !this.nearVisible(e.x, e.y)) continue; g.strokeStyle = `rgba(255,120,80,${1 - age / 0.9})`; g.beginPath(); g.arc(x, y, 6 + age * 20, 0, Math.PI * 2); g.stroke(); }
      else if (e.k === 'target' || e.k === 'move') { g.strokeStyle = `rgba(255,255,255,${1 - age / 0.9})`; g.beginPath(); g.arc(x, y, 14 - age * 10, 0, Math.PI * 2); g.stroke(); }
    }
    // tryby: podgląd zasięgu / rozmieszczania
    this.pending = this.pending.filter((p) => now < p.until);
    for (const p of this.pending) { g.globalAlpha = 0.45; this.drawUnit(g, { k: p.k, mode: 'def' }, this.sx(p.x), this.sy(p.y), TC[me], false); g.globalAlpha = 1; }
    if (this.mouse && this.mode) {
      const wx = this.wx(this.mouse.x), wy = this.wy(this.mouse.y);
      if (this.mode.startsWith('place:')) {
        const k = this.mode.slice(6); const ok = !canPlace(sim, me, k, wx, wy);
        g.globalAlpha = ok ? 0.8 : 0.3; this.drawUnit(g, { k, mode: 'def' }, this.mouse.x, this.mouse.y, ok ? TC[me] : '#ff4040', false); g.globalAlpha = 1;
        if (k === 'radar') { g.strokeStyle = 'rgba(120,200,255,.3)'; g.beginPath(); g.arc(this.mouse.x, this.mouse.y, S.radar.range * z, 0, Math.PI * 2); g.stroke(); }
        if (k === 'silo') { g.strokeStyle = 'rgba(255,255,255,.2)'; g.beginPath(); g.arc(this.mouse.x, this.mouse.y, S.silo.def * z, 0, Math.PI * 2); g.stroke(); }
      } else {
        g.strokeStyle = 'rgba(255,80,80,.9)'; g.lineWidth = 1.5; const mx = this.mouse.x, my = this.mouse.y;
        g.beginPath(); g.arc(mx, my, 10, 0, Math.PI * 2); g.moveTo(mx - 16, my); g.lineTo(mx + 16, my); g.moveTo(mx, my - 16); g.lineTo(mx, my + 16); g.stroke();
        for (const u of this.selUnits()) {
          const R = u.k === 'sub' ? S.sub.nuke : u.k === 'airbase' ? S[this.mode === 'bomber' ? 'bomber' : 'fighter'].fuel / 2 : 0;
          if (R) { g.strokeStyle = 'rgba(255,80,80,.25)'; g.setLineDash([6, 6]); g.beginPath(); g.arc(this.sx(u.x), this.sy(u.y), R * z, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); }
        }
      }
    }
    if (this.dragBox) { const d = this.dragBox; g.strokeStyle = 'rgba(255,255,255,.6)'; g.setLineDash([4, 3]); g.strokeRect(d.x0, d.y0, d.x1 - d.x0, d.y1 - d.y0); g.setLineDash([]); }
    // podpowiedź pod kursorem
    this.hover = this.mouse && !this.mode ? this.unitAt(this.mouse.x, this.mouse.y, false) : null;
  }
  nearVisible(x, y) {
    const sim = this.o.getSim(), me = this.o.mySlot();
    for (const u of sim.units) if (u.o === me) { const r = u.k === 'radar' ? S.radar.range : 7; if (dist2(u.x, u.y, x, y) < r * r) return true; }
    return false;
  }
  drawUnit(g, u, x, y, col, sel) {
    const s = 7;
    g.save(); g.translate(x, y); g.lineWidth = 1.6; g.strokeStyle = col; g.fillStyle = hexA(col, 0.25);
    if (sel) { g.strokeStyle = '#fff'; g.beginPath(); g.arc(0, 0, s + 6, 0, Math.PI * 2); g.stroke(); g.strokeStyle = col; }
    switch (u.k) {
      case 'silo':
        g.beginPath(); g.arc(0, 0, s, 0, Math.PI * 2); g.fill(); g.stroke();
        g.beginPath(); g.moveTo(0, -4); g.lineTo(4, 3); g.lineTo(-4, 3); g.closePath(); g.fillStyle = col; g.fill();
        if (u.mode === 'atk') { g.strokeStyle = u.sw > 0 ? 'rgba(255,90,90,.5)' : '#ff4a4a'; if (u.sw > 0) g.setLineDash([2, 2]); g.beginPath(); g.arc(0, 0, s + 3, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); }
        break;
      case 'radar':
        g.beginPath(); g.arc(0, 2, 6, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); g.beginPath(); g.arc(0, 2, 3, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
        g.beginPath(); g.arc(0, 2, 1.5, 0, Math.PI * 2); g.fillStyle = col; g.fill(); break;
      case 'airbase':
        g.beginPath(); g.rect(-s, -s * 0.6, s * 2, s * 1.2); g.fill(); g.stroke(); g.beginPath(); g.moveTo(-s + 2, 0); g.lineTo(s - 2, 0); g.stroke(); break;
      case 'battleship':
        g.beginPath(); g.moveTo(0, -s); g.lineTo(s * 0.8, 0); g.lineTo(0, s); g.lineTo(-s * 0.8, 0); g.closePath(); g.fill(); g.stroke(); break;
      case 'sub':
        g.beginPath(); g.ellipse(0, 0, s, s * 0.45, 0, 0, Math.PI * 2); g.fillStyle = u.mode === 'nuke' ? col : hexA(col, 0.15); g.fill(); g.stroke();
        g.beginPath(); g.moveTo(0, -s * 0.45); g.lineTo(0, -s * 0.9); g.stroke(); break;
      case 'fighter': case 'bomber': {
        const ang = Math.atan2(u.y - (u.py ?? u.y), ddx(u.px ?? u.x, u.x)) || 0; const L = u.k === 'bomber' ? 8 : 6;
        g.rotate(ang); g.beginPath(); g.moveTo(L, 0); g.lineTo(-L, L * 0.75); g.lineTo(-L * 0.4, 0); g.lineTo(-L, -L * 0.75); g.closePath(); g.fillStyle = col; g.fill(); break;
      }
    }
    g.restore();
  }
}
