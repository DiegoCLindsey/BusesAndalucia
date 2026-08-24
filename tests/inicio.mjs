/* La pantalla que se abre cien veces al mes: "¿cuándo pasa el próximo?".
 *
 * Fija lo que se decidió al simplificarla — orden por urgencia, una fila
 * por salida y ningún mapa robando la mitad de la pantalla — para que no
 * vuelva a colarse un autobús dentro de una hora por encima de otro que
 * sale en uno.
 *
 *   npm i -D playwright && npx playwright install chromium
 *   python3 -m http.server 8765 &
 *   node tests/inicio.mjs
 */
import fs from 'fs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765';

function servirLeafletLocal(page) {
  const dir = process.env.LEAFLET_DIR;
  if (!dir) return Promise.resolve();
  return Promise.all([
    page.route('**/leaflet@*/dist/leaflet.js', r =>
      r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(dir + '/leaflet.js', 'utf8') })),
    page.route('**/leaflet@*/dist/leaflet.css', r =>
      r.fulfill({ contentType: 'text/css', body: fs.readFileSync(dir + '/leaflet.css', 'utf8') }))
  ]);
}

// En Guillena, junto a AV ANDALUCIA (ARROYO): la ubicación decide qué
// parada se enseña de cada línea, así que las pruebas la fijan.
const AQUI = { latitude: 37.5443, longitude: -6.0567 };
const M177 = 'm-177-camas-guillena-pi-los-girasoles-sevilla-torre-de-la-reina';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
const errores = [];
page.on('pageerror', e => errores.push('PAGEERROR: ' + e.message));
page.on('console', m => {
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push('CONSOLE: ' + m.text());
});
await servirLeafletLocal(page);
await page.route('**/tile.openstreetmap.org/**', r => r.fulfill({ contentType: 'image/png', body: Buffer.from('') }));
await page.clock.install({ time: new Date('2026-08-18T14:52:00') });
await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof APP !== 'undefined' && APP.data, null, { timeout: 30000 });

// Dos paradas guardadas en municipios distintos: es el caso que rompía el
// orden cuando las salidas iban agrupadas por parada.
await page.evaluate(() => {
  const idPor = n => Object.entries(APP.data.paradas).find(([, p]) => p.nombre === n)[0];
  FAVORITOS.paradas = [
    { id: idPor('AV ANDALUCIA (ARROYO)'), nombre: 'AV ANDALUCIA (ARROYO)' },
    { id: idPor('CHAPINA (I)'), nombre: 'CHAPINA (I)' }
  ];
  guardarFavoritos();
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof APP !== 'undefined' && APP.data, null, { timeout: 30000 });
await page.waitForTimeout(800);

let fallos = 0;
const ok = (cond, txt, extra) => {
  console.log((cond ? '  ok   ' : 'FALLA  ') + txt + (extra !== undefined ? '   → ' + extra : ''));
  if (!cond) fallos++;
};

const filas = await page.locator('#homeFavSalidas .salida-fila').all();
const leidas = [];
for (const f of filas) {
  leidas.push({
    hacia: (await f.locator('.salida-hacia').innerText()).trim(),
    parada: (await f.locator('.salida-parada').innerText()).trim(),
    cuando: (await f.locator('.salida-cuando').innerText()).split('\n')[0].trim()
  });
}
console.log(JSON.stringify(leidas, null, 1));

const minutos = leidas.map(f => {
  const m = f.cuando.match(/^(\d+) min$/);
  if (m) return Number(m[1]);
  if (f.cuando === 'ahora') return 0;
  const h = f.cuando.match(/^(\d+) h(?: (\d+))?$/);
  if (h) return Number(h[1]) * 60 + Number(h[2] || 0);
  return Infinity;   // horas de reloj: mañana o más allá
});

ok(filas.length > 0 && filas.length <= 5, 'el resumen cabe en pantalla', filas.length + ' filas');
ok(minutos.every((m, i) => i === 0 || m >= minutos[i - 1]),
  'ordenadas por lo que falta, no por parada', JSON.stringify(minutos));
ok(new Set(leidas.map(f => f.parada)).size > 1,
  'las dos paradas guardadas asoman en el resumen', JSON.stringify([...new Set(leidas.map(f => f.parada))]));
ok(leidas.every(f => f.hacia.startsWith('hacia ')), 'cada fila dice hacia dónde va');
ok(leidas.every(f => f.hacia !== f.hacia.toUpperCase()),
  'los destinos van en capitales iniciales, no a gritos', JSON.stringify(leidas.map(f => f.hacia)));
ok(await page.locator('#homeMap').count() === 0, 'Inicio no lleva mapa');

// Desplegar tiene que enseñar más, no romperse.
const btn = page.locator('#btnVerTodasSalidas');
if (await btn.count()) {
  const antes = filas.length;
  await btn.click();
  await page.waitForTimeout(300);
  const despues = await page.locator('#homeFavSalidas .salida-fila').count();
  ok(despues > antes, 'al desplegar se ven todas', `${antes} → ${despues}`);
}

/* ------------------------------------------------------------------ */
/* Preferencia de parada: línea favorita > parada favorita > cercanía   */
/* ------------------------------------------------------------------ */
// Sin navegar de nuevo: se llama al motor con la ubicación puesta a mano,
// que es lo que decide, y así una sola carga sirve para los cuatro casos.
const preferencia = await page.evaluate(({ aqui, m177 }) => {
  UBICACION = { lat: aqui.latitude, lng: aqui.longitude };
  const resumen = () => salidasVigiladas().map(s => ({
    linea: s.codigo, hacia: s.hacia, parada: s.paradaNombre,
    metros: s.dist == null ? null : Math.round(s.dist)
  }));
  const idPor = n => Object.entries(APP.data.paradas).find(([, p]) => p.nombre === n)[0];
  const casos = {};

  FAVORITOS.lineas = []; FAVORITOS.paradas = [];
  casos.sinNada = resumen();

  FAVORITOS.lineas = [{ slug: m177 }]; FAVORITOS.paradas = [];
  casos.lineaFavorita = resumen();

  FAVORITOS.lineas = [];
  FAVORITOS.paradas = ['AV ANDALUCIA (ARROYO)', 'PARQUE', 'PLAZA DE ARMAS']
    .map(n => ({ id: idPor(n), nombre: n }));
  casos.paradasFavoritas = resumen();

  FAVORITOS.lineas = []; FAVORITOS.paradas = [];
  return casos;
}, { aqui: AQUI, m177: M177 });

console.log(JSON.stringify(preferencia, null, 1));

const unaParadaPorLineaYSentido = filas =>
  new Set(filas.map(f => f.linea + '|' + f.hacia)).size === filas.length;

ok(preferencia.sinNada.length > 0 && preferencia.sinNada.every(f => f.metros < 1000),
  'sin nada guardado, sale lo que se tiene al lado',
  JSON.stringify(preferencia.sinNada.map(f => f.metros)));

ok(preferencia.lineaFavorita.length > 0 && preferencia.lineaFavorita.every(f => f.linea === 'M-177'),
  'con una línea favorita, sólo esa línea');
ok(preferencia.lineaFavorita.every(f => f.metros < 1000),
  'y en la parada que se tiene más cerca, no en una cualquiera de su recorrido',
  JSON.stringify(preferencia.lineaFavorita.map(f => f.parada + ' ' + f.metros + ' m')));
ok(unaParadaPorLineaYSentido(preferencia.lineaFavorita),
  'sin repetir la misma línea y sentido en varias paradas');

const m177Favoritas = preferencia.paradasFavoritas.filter(f => f.linea === 'M-177');
ok(unaParadaPorLineaYSentido(preferencia.paradasFavoritas),
  'con tres paradas favoritas de la misma línea, una sola por sentido',
  JSON.stringify(m177Favoritas.map(f => f.hacia + ' → ' + f.parada)));
ok(m177Favoritas.every(f => f.parada !== 'PLAZA DE ARMAS'),
  'y no la que está a diecisiete kilómetros',
  JSON.stringify(m177Favoritas.map(f => f.parada + ' ' + f.metros + ' m')));

ok(errores.length === 0, 'sin errores en consola', JSON.stringify(errores));
console.log(fallos ? `\n${fallos} comprobaciones fallidas` : '\nTodo correcto');
await browser.close();
process.exit(fallos ? 1 : 0);
