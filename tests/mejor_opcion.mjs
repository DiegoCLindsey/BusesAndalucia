/* Cuál alternativa se enseña por defecto: la más rápida de verdad, no
 * la de menos trasbordos a secas — pero tampoco la que dé un rodeo
 * enorme para ganar unos minutos.
 *
 * Salió de un caso real: Guillena a Carmona daba por defecto una
 * combinación de "sólo" tres trasbordos que llevaba casi dos horas y
 * media de esperas sumadas, cuando había una con un trasbordo más que
 * llegaba una hora antes. La de menos trasbordos seguía disponible a un
 * toque en las pestañas de arriba — el problema era sólo cuál se
 * enseñaba SIN tocar nada.
 *
 * `mejorOpcion()` no siempre elige la más rápida a machamartillo: si la
 * ganancia es de un par de minutos, no compensa la complicación de un
 * trasbordo más, y gana la simple. Tampoco elige una que técnicamente
 * llega antes pero recorre varias veces la línea recta —RAPTOR persigue
 * la hora de llegada sin mirar el mapa, así que con bastantes trasbordos
 * de margen a veces sale la más rápida dando un rodeo por pueblos que no
 * pintan nada en el camino—: ahí se prefiere una combinación con menos
 * rodeo aunque tarde algo más. Este fichero comprueba las tres cosas.
 *
 *   npm i -D playwright && npx playwright install chromium
 *   python3 -m http.server 8765 &
 *   node tests/mejor_opcion.mjs
 */
import fs from 'fs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

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

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765';
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
const errores = [];
page.on('pageerror', e => errores.push('PAGEERROR: ' + e.message));
page.on('console', m => {
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push('CONSOLE: ' + m.text());
});
await servirLeafletLocal(page);
await page.route('**/tile.openstreetmap.org/**', r => r.fulfill({ contentType: 'image/png', body: Buffer.from('') }));
await page.addInitScript(() => {
  try { localStorage.setItem('ctanConsorcioV1', JSON.stringify({ id: 1 })); } catch (e) { }
});
await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof CTAN !== 'undefined' && CTAN.cargado && CTAN.horarios.has(1), null, { timeout: 30000 });

let fallos = 0;
const ok = (cond, txt, extra) => {
  console.log((cond ? '  ok   ' : 'FALLA  ') + txt + (extra !== undefined ? '   → ' + extra : ''));
  if (!cond) fallos++;
};

/* ------------------------------------------------------------------ */
/* 1. Un caso real con varias alternativas: Castilleja de la Cuesta a   */
/*    San Juan de Aznalfarache (dos pueblos del Aljarafe)               */
/* ------------------------------------------------------------------ */
const r = await page.evaluate(() => {
  const salida = new Date('2026-08-26T08:00:00');
  const origen = { type: 'stop', id: '1_2376' };   // C Real Irlandesas Frente, Castilleja de la Cuesta
  const destino = { type: 'stop', id: '1_2895' };  // Rtda Hdad Sacram S Juan Bautista, San Juan de Aznalfarache
  const resumen = res => !res ? null : {
    trasbordos: res.numTrasbordos,
    llegada: fmtHoraAbs(res.diasSalida * 1440 + res.llegadaMin)
  };

  const opciones = calcularOpcionesRuta(APP.data, ROUTING, origen, destino, salida);
  const elegida = mejorOpcion(opciones);

  return { opciones: opciones.map(resumen), elegida: resumen(elegida) };
});
console.log(JSON.stringify(r, null, 1));
console.log('');

ok(r.opciones.length >= 2, 'hay más de una combinación entre las que elegir', r.opciones.length);
ok(r.elegida.trasbordos > r.opciones[0].trasbordos,
  'la elegida no es la de menos trasbordos...', `${r.opciones[0].trasbordos} → ${r.elegida.trasbordos}`);
ok(r.elegida.llegada === '08:53' && r.opciones[0].llegada === '09:23',
  '...sino la que llega antes de verdad (08:53, no 09:23)', JSON.stringify(r));

/* ------------------------------------------------------------------ */
/* 2. Sin diferencia real, gana la simple                               */
/* ------------------------------------------------------------------ */
const umbral = await page.evaluate(() => {
  const base = { numTrasbordos: 0, diasSalida: 0, llegadaMin: 600, legs: [], lineas: [] };
  const conUnMinutoMas = { ...base, numTrasbordos: 1, llegadaMin: 599 };   // un minuto antes, un trasbordo más
  const conCuartoDeHoraMas = { ...base, numTrasbordos: 1, llegadaMin: 580 }; // veinte minutos antes

  return {
    marginal: mejorOpcion([base, conUnMinutoMas]) === base,
    meritoria: mejorOpcion([base, conCuartoDeHoraMas]) === conCuartoDeHoraMas
  };
});
ok(umbral.marginal, 'un minuto de diferencia no compensa un trasbordo más: gana la simple');
ok(umbral.meritoria, 'veinte minutos sí compensan: gana la más rápida');

/* ------------------------------------------------------------------ */
/* 3. Sin línea recta que comparar, ningún cambio de comportamiento     */
/* ------------------------------------------------------------------ */
const sinGeografia = await page.evaluate(() => {
  const base = { numTrasbordos: 0, diasSalida: 0, llegadaMin: 600, legs: [], lineas: [], distanciaKm: 1 };
  const masRapidaConRodeo = { ...base, numTrasbordos: 1, llegadaMin: 580, distanciaKm: 900 };  // rodeo altísimo
  // Sin pasarle distanciaLineaRectaKm, mejorOpcion() no tiene con qué
  // medir el rodeo: se comporta exactamente como antes de este cambio.
  return mejorOpcion([base, masRapidaConRodeo]) === masRapidaConRodeo;
});
ok(sinGeografia, 'sin pasarle la línea recta, un rodeo enorme no penaliza (se sigue mirando sólo el tiempo)');

/* ------------------------------------------------------------------ */
/* 4. Con línea recta, un rodeo desproporcionado pierde frente a uno    */
/*    razonable, aunque tarde algo más                                  */
/* ------------------------------------------------------------------ */
const conGeografia = await page.evaluate(() => {
  // 10 km en línea recta. Una opción da un rodeo de x3,5 (35 km) y llega
  // 20 min antes que otra que da un rodeo de x1,5 (15 km) — de sobra
  // para que, sólo por tiempo, ganase la primera.
  const rodeoGrande = { numTrasbordos: 1, diasSalida: 0, llegadaMin: 580, legs: [], lineas: [], distanciaKm: 35 };
  const rodeoRazonable = { numTrasbordos: 0, diasSalida: 0, llegadaMin: 600, legs: [], lineas: [], distanciaKm: 15 };
  return {
    soloTiempo: mejorOpcion([rodeoRazonable, rodeoGrande]) === rodeoGrande,
    conRodeo: mejorOpcion([rodeoRazonable, rodeoGrande], 10) === rodeoRazonable
  };
});
ok(conGeografia.soloTiempo, 'sin mirar el rodeo, ganaría la más rápida (para contrastar con lo de abajo)');
ok(conGeografia.conRodeo, 'mirando el rodeo, gana la de x1,5 aunque tarde 20 min más que la de x3,5');

/* ------------------------------------------------------------------ */
/* 5. Un caso real: Av De Palomares Centro a Tráfico, en Sevilla        */
/* ------------------------------------------------------------------ */
const r5 = await page.evaluate(() => {
  const salida = new Date('2026-08-26T08:00:00');
  const origen = { type: 'stop', id: '1_2921' };  // Av De Palomares Centro
  const destino = { type: 'stop', id: '1_2520' }; // Trafico (V)
  const distRecta = distanciaLineaRectaKm(APP.data, origen, destino);
  const opciones = calcularOpcionesRuta(APP.data, ROUTING, origen, destino, salida);
  const resumen = op => ({
    trasbordos: op.numTrasbordos, llegada: fmtHoraAbs(op.diasSalida * 1440 + op.llegadaMin),
    km: Math.round(op.distanciaKm * 10) / 10
  });
  return {
    distRecta: Math.round(distRecta * 10) / 10,
    sinRodeo: resumen(mejorOpcion(opciones)),
    conRodeo: resumen(mejorOpcion(opciones, distRecta))
  };
});
console.log(JSON.stringify(r5, null, 1));
ok(r5.sinRodeo.trasbordos === 3 && r5.sinRodeo.llegada === '10:09',
  'sin mirar el rodeo: la de 3 trasbordos, 27,8 km para 9,2 km en línea recta', JSON.stringify(r5));
ok(r5.conRodeo.trasbordos === 1 && r5.conRodeo.llegada === '10:54',
  'mirando el rodeo: la de 1 trasbordo y la mitad de km, aunque llegue 45 min más tarde', JSON.stringify(r5));

/* ------------------------------------------------------------------ */
/* 6. Las rutas favoritas usan el mismo criterio                        */
/* ------------------------------------------------------------------ */
const favorito = await page.evaluate(() => {
  const idPor = n => Object.entries(APP.data.paradas).find(([, p]) => p.nombre.toUpperCase() === n.toUpperCase())[0];
  const res = computeRoute(APP.data, ROUTING,
    { type: 'stop', id: idPor('AV ANDALUCIA (ARROYO)') },
    { type: 'stop', id: idPor('PLAZA DE ARMAS') },
    new Date('2026-08-26T14:29:00'));
  return res ? { trasbordos: res.numTrasbordos, llegada: fmtHoraAbs(res.diasSalida * 1440 + res.llegadaMin) } : null;
});
ok(!!favorito, 'computeRoute (el que usan las rutas favoritas) sigue devolviendo algo razonable', JSON.stringify(favorito));

ok(errores.length === 0, 'sin errores en consola', JSON.stringify(errores));
console.log(fallos ? `\n${fallos} comprobaciones fallidas` : '\nTodo correcto');
await browser.close();
process.exit(fallos ? 1 : 0);
