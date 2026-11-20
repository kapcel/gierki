// Generuje js/world.js: kontury lądów, siatkę 1°×1° (ląd/morze/terytoria) i miasta.
// Uruchom: npm i world-atlas@2 topojson-client@3 && node tools/make_world.mjs
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const topo = JSON.parse(fs.readFileSync(require.resolve('world-atlas/land-110m.json'), 'utf8'));
const { feature } = require('topojson-client');

const land = feature(topo, topo.objects.land);
const polys = [];
for (const f of land.features) {
  const g = f.geometry; const list = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  for (const poly of list) {
    const ring = poly[0];
    if (ring.every(([, lat]) => lat < -62)) continue; // Antarktyda poza mapą
    // rozwinięcie długości przez południk 180° (Eurazja/Czukotka)
    let off = 0, prev = ring[0][0]; const pts = [];
    for (const [lon, lat] of ring) { if (lon - prev > 180) off -= 360; else if (prev - lon > 180) off += 360; prev = lon; pts.push([+(lon + off + 180).toFixed(2), +(90 - lat).toFixed(2)]); }
    polys.push(pts);
  }
}
const bbox = polys.map((r) => { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (const [x, y] of r) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); } return [a, b, c, d]; });
const inPoly = (x, y, r) => { let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins; } return ins; };
const W = 360, H = 180;
const isLand = new Uint8Array(W * H);
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
  const x = i + 0.5, y = j + 0.5;
  outer: for (let k = 0; k < polys.length; k++) for (const xx of [x, x + 360, x - 360]) { const b = bbox[k]; if (xx < b[0] || xx > b[2] || y < b[1] || y > b[3]) continue; if (inPoly(xx, y, polys[k])) { isLand[j * W + i] = 1; break outer; } }
}
// ocean = woda połączona z centrum Pacyfiku (jeziora/Morze Kaspijskie traktujemy jak ląd)
const ocean = new Uint8Array(W * H); const q = [(90) * W + 10]; ocean[q[0]] = 1;
while (q.length) { const c = q.pop(); const i = c % W, j = (c / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ni = (i + dx + W) % W, nj = j + dy; if (nj < 0 || nj >= H) continue; const n = nj * W + ni; if (!isLand[n] && !ocean[n]) { ocean[n] = 1; q.push(n); } } }

// terytoria: 0 Ameryka Płn., 1 Ameryka Płd., 2 Europa, 3 Afryka i Bl. Wschód, 4 Rosja, 5 Azja
const RECTS = [ // [terr, lonMin, lonMax, latMin, latMax] — pierwsze pasujące wygrywa
  [5, 128, 147, 30, 46], [4, 28, 33, 58.5, 62], [2, -25, 32, 35, 72], [4, 32, 180, 42, 78], [4, -180, -169, 60, 72],
  [3, 35, 63, 25, 40], [5, 60, 150, -11, 42], [3, -20, 60, -36, 35], [0, -170, -52, 14, 72], [0, -92, -77, 7, 14], [1, -92, -30, -57, 14],
];
const terrOf = (lon, lat) => { for (const [t, a, b, c, d] of RECTS) if (lon >= a && lon <= b && lat >= c && lat <= d) return t; return -1; };
const terr = new Int8Array(W * H).fill(-1);
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const k = j * W + i; if (isLand[k] || !ocean[k]) terr[k] = terrOf(i + 0.5 - 180, 90 - j - 0.5); }
// wody terytorialne: ocean do 7 kratek od lądu danego terytorium
const dist = new Int16Array(W * H).fill(999); const qq = [];
for (let k = 0; k < W * H; k++) if (ocean[k] === 0 && terr[k] >= 0) { dist[k] = 0; qq.push(k); }
for (let h = 0; h < qq.length; h++) {
  const c = qq[h]; const i = c % W, j = (c / W) | 0; if (dist[c] >= 7) continue;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
    const ni = (i + dx + W) % W, nj = j + dy; if (nj < 0 || nj >= H) continue; const n = nj * W + ni;
    if (ocean[n] && dist[n] === 999) { dist[n] = dist[c] + 1; terr[n] = terr[c]; qq.push(n); }
  }
}
let grid = '';
for (let k = 0; k < W * H; k++) {
  if (!ocean[k]) grid += terr[k] >= 0 ? 'ABCDEF'[terr[k]] : '#';
  else grid += terr[k] >= 0 ? 'abcdef'[terr[k]] : '~';
}
// miasta: [nazwa, lat, lon, populacja w mln (aglomeracja, w przybliżeniu)]
const C = {
  0: [['Nowy Jork', 40.7, -74.0, 19], ['Los Angeles', 34.05, -118.24, 13], ['Chicago', 41.88, -87.63, 9.5], ['Meksyk', 19.43, -99.13, 21.8], ['Houston', 29.76, -95.37, 7], ['Dallas', 32.78, -96.8, 7.5], ['Toronto', 43.65, -79.38, 6.2], ['Waszyngton', 38.9, -77.04, 6.3], ['Miami', 25.76, -80.19, 6.1], ['San Francisco', 37.77, -122.42, 4.7], ['Atlanta', 33.75, -84.39, 6], ['Montreal', 45.5, -73.57, 4.2], ['Seattle', 47.6, -122.33, 4]],
  1: [['São Paulo', -23.55, -46.63, 22], ['Buenos Aires', -34.6, -58.38, 15], ['Rio de Janeiro', -22.9, -43.17, 13.5], ['Lima', -12.05, -77.04, 10.7], ['Bogota', 4.71, -74.07, 11], ['Santiago', -33.45, -70.67, 6.8], ['Belo Horizonte', -19.92, -43.94, 6], ['Brasília', -15.79, -47.88, 4.7], ['Caracas', 10.48, -66.9, 2.9], ['Medellín', 6.24, -75.58, 4], ['Salvador', -12.97, -38.5, 3.9], ['Recife', -8.05, -34.9, 4]],
  2: [['Londyn', 51.5, -0.13, 9.5], ['Paryż', 48.86, 2.35, 11], ['Stambuł', 41.01, 28.98, 15.5], ['Madryt', 40.42, -3.7, 6.7], ['Berlin', 52.52, 13.4, 4.5], ['Rzym', 41.9, 12.5, 4.3], ['Mediolan', 45.46, 9.19, 5], ['Barcelona', 41.39, 2.17, 5.6], ['Warszawa', 52.23, 21.01, 3.1], ['Kijów', 50.45, 30.52, 3.5], ['Ateny', 37.98, 23.73, 3.6], ['Amsterdam', 52.37, 4.9, 2.5], ['Bukareszt', 44.43, 26.1, 2.2]],
  3: [['Kair', 30.04, 31.24, 21], ['Lagos', 6.52, 3.38, 15], ['Kinszasa', -4.44, 15.27, 15], ['Johannesburg', -26.2, 28.05, 10], ['Teheran', 35.69, 51.39, 9.5], ['Luanda', -8.84, 13.23, 9], ['Rijad', 24.71, 46.68, 7.5], ['Bagdad', 33.31, 44.37, 7.5], ['Chartum', 15.5, 32.56, 6], ['Nairobi', -1.29, 36.82, 5], ['Addis Abeba', 9.03, 38.74, 5], ['Abidżan', 5.36, -4.01, 5.5], ['Dar es Salaam', -6.79, 39.21, 7]],
  4: [['Moskwa', 55.76, 37.62, 17], ['Sankt Petersburg', 59.93, 30.34, 5.4], ['Harbin', 45.75, 126.65, 10], ['Nowosybirsk', 55.0, 82.9, 1.6], ['Jekaterynburg', 56.84, 60.6, 1.5], ['Kazań', 55.8, 49.1, 1.3], ['Ałmaty', 43.24, 76.95, 2], ['Charków', 50.0, 36.23, 1.4], ['Samara', 53.2, 50.15, 1.2], ['Rostów nad Donem', 47.24, 39.7, 1.1], ['Władywostok', 43.1, 131.9, 0.6], ['Omsk', 54.99, 73.37, 1.2], ['Ułan Bator', 47.89, 106.91, 1.6]],
  5: [['Tokio', 35.68, 139.69, 37], ['Delhi', 28.61, 77.21, 32], ['Szanghaj', 31.23, 121.47, 28], ['Seul', 37.57, 126.98, 25], ['Dhaka', 23.81, 90.41, 22], ['Pekin', 39.9, 116.4, 21], ['Bombaj', 19.08, 72.88, 21], ['Karaczi', 24.86, 67.0, 17], ['Manila', 14.6, 120.98, 14], ['Dżakarta', -6.2, 106.85, 11], ['Bangkok', 13.76, 100.5, 11], ['Kalkuta', 22.57, 88.36, 15], ['Kanton', 23.13, 113.26, 14]],
};
// wyrównanie: każde terytorium ma łącznie 150 "mln" (żeby gra była fair)
const cities = [];
for (const t of Object.keys(C)) {
  const sum = C[t].reduce((a, c) => a + c[3], 0);
  for (const [n, lat, lon, p] of C[t]) cities.push([n, +(lon + 180).toFixed(2), +(90 - lat).toFixed(2), +(p * 150 / sum).toFixed(2), +t]);
}
const out = `// WYGENEROWANE przez tools/make_world.mjs — dane lądów: Natural Earth (domena publiczna) przez world-atlas
export const LAND = ${JSON.stringify(polys)};
export const GRID = ${JSON.stringify(grid)};
export const CITIES = ${JSON.stringify(cities)};
`;
fs.writeFileSync(new URL('../js/world.js', import.meta.url), out);
const cnt = {}; for (const ch of grid) cnt[ch] = (cnt[ch] || 0) + 1;
console.log('polys', polys.length, 'pts', polys.reduce((a, r) => a + r.length, 0), 'bytes', out.length, cnt);
