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
const M177 = 'M-177';   // se resuelve a slug dentro de la página

// CHROMIUM_PATH apunta a un Chromium ya instalado cuando el del paquete no está.
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
const errores = [];
page.on('pageerror', e => errores.push('PAGEERROR: ' + e.message));
page.on('console', m => {
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push('CONSOLE: ' + m.text());
});
await servirLeafletLocal(page);
await page.route('**/tile.openstreetmap.org/**', r => r.fulfill({ contentType: 'image/png', body: Buffer.from('') }));
// Los datos van por área metropolitana: se fija Sevilla para no toparse
// con el selector del primer arranque.
await page.addInitScript(() => {
  // El área de referencia se fija a Sevilla para que sus horarios se bajen
  // solos al arrancar; las paradas y las líneas de las nueve están siempre.
  try { localStorage.setItem('ctanConsorcioV1', JSON.stringify({ id: 1 })); } catch (e) { }
});
await page.clock.install({ time: new Date('2026-08-18T14:52:00') });
await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof CTAN !== 'undefined' && CTAN.cargado && CTAN.horarios.has(1), null, { timeout: 30000 });

// Dos paradas guardadas en municipios distintos: es el caso que rompía el
// orden cuando las salidas iban agrupadas por parada.
await page.evaluate(() => {
  const idPor = n => Object.entries(APP.data.paradas).find(([, p]) => p.nombre.toUpperCase() === n.toUpperCase())[0];
  FAVORITOS.paradas = [
    { id: idPor('AV ANDALUCIA (ARROYO)'), nombre: 'AV ANDALUCIA (ARROYO)' },
    { id: idPor('CHAPINA (I)'), nombre: 'CHAPINA (I)' }
  ];
  guardarFavoritos();
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof CTAN !== 'undefined' && CTAN.cargado && CTAN.horarios.has(1), null, { timeout: 30000 });
await page.waitForTimeout(800);

let fallos = 0;
const ok = (cond, txt, extra) => {
  console.log((cond ? '  ok   ' : 'FALLA  ') + txt + (extra !== undefined ? '   → ' + extra : ''));
  if (!cond) fallos++;
};

// Las filas de "el siguiente" cuelgan de la de arriba: se leen aparte
// porque no compiten por su sitio en el orden.
const todas = await page.locator('#homeFavSalidas .salida-fila').all();
const leidas = [];
for (const f of todas) {
  const clase = await f.getAttribute('class');
  leidas.push({
    seguimiento: /seguimiento/.test(clase),
    hacia: (await f.locator('.salida-hacia').innerText()).trim(),
    parada: await f.locator('.salida-parada').count()
      ? (await f.locator('.salida-parada').innerText()).trim() : null,
    cuando: await f.locator('.salida-cuando').count()
      ? (await f.locator('.salida-cuando').innerText()).split('\n')[0].trim() : null
  });
}
console.log(JSON.stringify(leidas, null, 1));

const filas = leidas.filter(f => !f.seguimiento);
// A las 14:52 del reloj congelado: cuánto falta para cada fila.
const AHORA_MIN = 14 * 60 + 52;
const cuantoFalta = texto => {
  if (texto === 'ahora') return 0;
  const min = texto.match(/^(\d+) min$/);
  if (min) return Number(min[1]);
  const reloj = texto.match(/^(\d\d):(\d\d)$/);
  if (reloj) return Number(reloj[1]) * 60 + Number(reloj[2]) - AHORA_MIN;
  return Infinity;   // mañana o más allá
};
const minutos = filas.map(f => cuantoFalta(f.cuando));

ok(filas.length > 0 && filas.length <= 5, 'el resumen cabe en pantalla', filas.length + ' salidas');
ok(minutos.every((m, i) => i === 0 || m >= minutos[i - 1]),
  'ordenadas por lo que falta, no por parada', JSON.stringify(minutos));
ok(new Set(filas.map(f => f.parada)).size > 1,
  'las dos paradas guardadas asoman en el resumen', JSON.stringify([...new Set(filas.map(f => f.parada))]));
ok(filas.every(f => f.hacia.startsWith('hacia ')), 'cada fila dice hacia dónde va');
ok(filas.every(f => f.hacia !== f.hacia.toUpperCase()),
  'los destinos van en capitales iniciales, no a gritos', JSON.stringify(filas.map(f => f.hacia)));
ok(await page.locator('#homeMap').count() === 0, 'Inicio no lleva mapa');

// Cuando faltan diez minutos o menos, la pregunta es "¿corro o espero al
// siguiente?": debajo tiene que aparecer ese siguiente como otra fila.
const seguimientoDe = fila => {
  const i = leidas.indexOf(fila);
  const sig = leidas[i + 1];
  return sig && sig.seguimiento ? sig : null;
};
const urgentes = filas.filter((f, i) => minutos[i] <= 10);
const holgadas = filas.filter((f, i) => minutos[i] > 10);

ok(urgentes.length > 0 && urgentes.every(f => {
  const sig = seguimientoDe(f);
  return sig && (sig.hacia === 'el siguiente' || sig.hacia === 'no hay otro hoy');
}), 'con diez minutos o menos, el siguiente aparece como otra fila',
  JSON.stringify(urgentes.map(f => f.cuando + ' → ' + (seguimientoDe(f) || {}).cuando)));

ok(urgentes.every(f => {
  const sig = seguimientoDe(f);
  if (!sig || sig.hacia === 'no hay otro hoy') return true;
  return cuantoFalta(sig.cuando) > cuantoFalta(f.cuando);
}), 'y es posterior a la suya, no otra cualquiera');

ok(holgadas.every(f => seguimientoDe(f) === null),
  'sin fila extra cuando hay tiempo de sobra',
  JSON.stringify(holgadas.map(f => f.cuando)));

// Desplegar tiene que enseñar más, no romperse.
const btn = page.locator('#btnVerTodasSalidas');
if (await btn.count()) {
  const antes = filas.length;
  await btn.click();
  await page.waitForTimeout(300);
  const despues = await page.locator('#homeFavSalidas .salida-fila:not(.seguimiento)').count();
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
  const idPor = n => Object.entries(APP.data.paradas).find(([, p]) => p.nombre.toUpperCase() === n.toUpperCase())[0];
  const casos = {};

  FAVORITOS.lineas = []; FAVORITOS.paradas = [];
  casos.sinNada = resumen();

  FAVORITOS.lineas = [{ slug: CTAN.lineas.find(l => l.codigo === m177).slug }]; FAVORITOS.paradas = [];
  casos.lineaFavorita = resumen();

  FAVORITOS.lineas = [];
  FAVORITOS.paradas = ['AV ANDALUCIA (ARROYO)', 'PARQUE', 'PLAZA DE ARMAS']
    .map(n => ({ id: idPor(n), nombre: n }));
  casos.paradasFavoritas = resumen();

  // Lo que tiene el usuario de verdad: la línea 177 y su parada del
  // Arroyo. Estando en Guillena manda su parada; en Sevilla, la que
  // tenga delante — pero siempre la 177 y nada más.
  FAVORITOS.lineas = [{ slug: CTAN.lineas.find(l => l.codigo === m177).slug }];
  FAVORITOS.paradas = [{ id: idPor('AV ANDALUCIA (ARROYO)'), nombre: 'AV ANDALUCIA (ARROYO)' }];
  casos.lineaYParadaEnGuillena = resumen();
  UBICACION = { lat: 37.3921, lng: -6.0330 };   // junto a Chapina
  casos.lineaYParadaEnChapina = resumen();

  // Una parada favorita por la que no pasa ninguna línea que sigo: ahí sí
  // valen sus próximas salidas, sea de quien sea la línea.
  UBICACION = { lat: 37.3921, lng: -6.0042 };
  FAVORITOS.lineas = [];
  FAVORITOS.paradas = [{ id: idPor('PLAZA DE ARMAS'), nombre: 'PLAZA DE ARMAS' }];
  casos.paradaSinLineaFavorita = resumen();

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
ok(m177Favoritas.every(f => !/^PLAZA DE ARMAS$/i.test(f.parada)),
  'y no la que está a diecisiete kilómetros',
  JSON.stringify(m177Favoritas.map(f => f.parada + ' ' + f.metros + ' m')));

// La combinación real: línea favorita + una parada favorita suya.
const guillena = preferencia.lineaYParadaEnGuillena;
const chapina = preferencia.lineaYParadaEnChapina;
ok(guillena.length > 0 && guillena.every(f => /^AV ANDALUCIA \(ARROYO\)$/i.test(f.parada) && f.linea === 'M-177'),
  'en Guillena, sólo mi parada del Arroyo y sólo la 177',
  JSON.stringify(guillena.map(f => f.linea + ' · ' + f.parada)));
ok(chapina.length > 0 && chapina.every(f => f.linea === 'M-177') && chapina.every(f => f.metros < 500),
  'junto a Chapina, la 177 en la parada que tengo delante',
  JSON.stringify(chapina.map(f => f.linea + ' · ' + f.parada + ' ' + f.metros + ' m')));
ok(chapina.every(f => !/^AV ANDALUCIA \(ARROYO\)$/i.test(f.parada)),
  'y no mi parada de Guillena, que está a diecisiete kilómetros');

const sinFav = preferencia.paradaSinLineaFavorita;
ok(sinFav.length === 3 && sinFav.every(f => /^PLAZA DE ARMAS$/i.test(f.parada)),
  'una parada favorita sin líneas que siga trae sus 3 próximas salidas',
  JSON.stringify(sinFav.map(f => f.linea)));
ok(new Set(sinFav.map(f => f.linea)).size > 1,
  'de las líneas que sean, no sólo de una');

ok(errores.length === 0, 'sin errores en consola', JSON.stringify(errores));
console.log(fallos ? `\n${fallos} comprobaciones fallidas` : '\nTodo correcto');
await browser.close();
process.exit(fallos ? 1 : 0);
